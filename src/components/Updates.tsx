import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { ChevronDown, ChevronUp, Download, ExternalLink, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react'
import { call, inBrowser, message, setSetting, useStore } from '../data/api'
import { NOVIDADES, compareVersions, unseen, type Novidade } from '../data/novidades'
import { Button } from './ui'

// Atualização automática (fase 13; Rust em src-tauri/src/update.rs). Um app só para Grátis e Pro: toda
// versão vai para todo mundo e o que é do Pro fica travado sem a licença.
//  - Ao abrir (se ligado em Configurações), o app pergunta ao site se há versão nova. Achou: uma faixa
//    no topo com o que mudou (para todos e no Pro), "Atualizar agora" e "Ao fechar o app".
//  - Correção de segurança: a faixa não tem "depois".
//  - Depois de atualizar, o cartão "O que há de novo" mostra o que mudou desde a versão anterior.
//  - Build do código aberto (compilado do GitHub): não se atualiza sozinho; Configurações leva ao GitHub.
type Available = { version: string; current: string; notes: string | null; todos: string[]; pro: string[]; seguranca: boolean }
type Check = { channel: 'oficial' | 'codigo-aberto'; available: Available | null }
type Progress = { done: number; total: number }

let found: Check | null = null
const subs = new Set<(c: Check | null) => void>()
const publish = (c: Check | null) => { found = c; subs.forEach((f) => f(c)) }

export async function checkUpdate(): Promise<Check> {
  const c = await call<Check>('update_check')
  publish(c)
  return c
}

function useFound() {
  const [c, setC] = useState(found)
  useEffect(() => { subs.add(setC); return () => { subs.delete(setC) } }, [])
  return c
}

// "Ao fechar o app": o instalador já está baixado; ao fechar a janela, ele roda (e reabre o app novo).
let pendingClose = false
async function armCloseHook() {
  if (pendingClose || inBrowser) return
  pendingClose = true
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  await w.onCloseRequested(async (e) => {
    e.preventDefault()
    try { await call('update_install', { when: 'fechando' }) } catch { /* sem instalador: só fecha */ }
    await w.destroy()
  })
}

function useInstall() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [later, setLater] = useState(pendingClose)
  const [error, setError] = useState('')
  useEffect(() => {
    if (inBrowser) return
    const off = listen<Progress>('update-progress', (e) => setProgress(e.payload))
    return () => { void off.then((f) => f()) }
  }, [])
  const install = async (when: 'agora' | 'ao-fechar' = 'agora') => {
    setError(''); setProgress({ done: 0, total: 0 })
    try {
      await call('update_install', { when }) // "agora": o app fecha sozinho quando o instalador abre
      if (when === 'ao-fechar') { await armCloseHook(); setLater(true); setProgress(null) }
    } catch (e) { setError(message(e)); setProgress(null) }
  }
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
  return { install, installing: !!progress, later, pct, error }
}

function Lista({ todos, pro }: { todos: string[]; pro: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[13.5px]">
      {todos.map((t) => <li key={t} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />{t}</li>)}
      {pro.map((t) => <li key={t} className="flex gap-2"><span className="mt-[1px] shrink-0 rounded bg-accent-soft px-1.5 font-mono text-[10.5px] font-semibold tracking-wider text-link">PRO</span>{t}</li>)}
    </ul>
  )
}

/** Faixa no topo do app quando há versão nova. A checagem roda uma vez por abertura. */
export function UpdateBanner({ testMode }: { testMode: boolean }) {
  const { ready, settings } = useStore()
  const c = useFound()
  const a = c?.available ?? null
  const [closed, setClosed] = useState(false)
  const [open, setOpen] = useState(false)
  const { install, installing, later, pct, error } = useInstall()
  const auto = settings['update.auto'] !== false
  useEffect(() => {
    if (!ready || !auto || inBrowser || testMode) return
    const t = setTimeout(() => { void checkUpdate().catch(() => {}) }, 8000) // sem pressa: depois da abertura
    return () => clearTimeout(t)
  }, [ready, auto, testMode])
  return (
    <>
      <WhatsNew testMode={testMode} />
      {a && !(closed && !a.seguranca) && (
        <div className={`sticky top-0 z-20 border-b px-5 py-2 text-[13px] ${a.seguranca ? 'border-[#B3261E]/30 bg-[#FBE9E7] dark:bg-[#3A1512]' : 'border-accent/30 bg-accent-soft'}`}>
          <div className="flex flex-wrap items-center gap-3">
            {a.seguranca ? <ShieldAlert size={15} className="text-[#B3261E] dark:text-[#FF8A80]" /> : <Download size={15} className="text-link" />}
            <span>
              <b className="font-semibold">{a.seguranca ? `Atualização de segurança ${a.version}` : `Tesseract ${a.version} disponível`}</b>{' '}
              <span className="text-muted">(você tem a {a.current})</span>
              {a.todos.length + a.pro.length > 0
                ? <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-2 inline-flex items-center gap-1 text-link underline-offset-2 hover:underline">O que há de novo{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
                : a.notes ? <span className="text-muted"> · {a.notes}</span> : null}
            </span>
            <span className="flex-1" />
            {error && <span className="text-danger">{error}</span>}
            {installing
              ? <span className="font-medium text-link">Baixando a atualização{pct !== null ? ` ${pct}%` : '…'}</span>
              : later
                ? <span className="font-medium text-link">Pronta: instala quando você fechar o app</span>
                : <>
                  <button type="button" onClick={() => void install('agora')} className="rounded-md bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent-strong">Atualizar agora</button>
                  <button type="button" onClick={() => void install('ao-fechar')} title="Baixa agora e instala quando você fechar o Tesseract" className="rounded-md border border-line-strong px-3 py-1 font-medium hover:bg-hover">Ao fechar o app</button>
                  {!a.seguranca && <button type="button" aria-label="Depois" title="Depois" onClick={() => setClosed(true)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover"><X size={14} /></button>}
                </>}
          </div>
          {open && <div className="mt-2.5 mb-1 max-w-[760px] pl-7"><Lista todos={a.todos} pro={a.pro} /></div>}
          {a.seguranca && <p className="mt-1 pl-7 text-[12.5px] text-muted">Corrige um problema de segurança. Leva menos de um minuto e seus dados ficam como estão.</p>}
        </div>
      )}
    </>
  )
}

// ---------- "O que há de novo" depois de atualizar ----------
const SEEN = 'tesseract.novidades.vista'
// Configurações pode reabrir o cartão ("Ver o que mudou nesta versão")
const SHOW = 'tesseract:novidades'
export const showWhatsNew = () => window.dispatchEvent(new Event(SHOW))
/** Instalação nova (o instalador acabou de rodar): a versão atual já conta como vista, sem "Atualizado para". */
let installedNow = false
export const markInstalledSeen = () => { installedNow = true; if (!inBrowser) void getVersion().then(writeSeen).catch(() => {}) }
const readSeen = () => { try { return localStorage.getItem(SEEN) } catch { return null } }
const writeSeen = (v: string) => { try { localStorage.setItem(SEEN, v) } catch { /* sem armazenamento */ } }

function WhatsNew({ testMode }: { testMode: boolean }) {
  const { ready, settings } = useStore()
  const [items, setItems] = useState<Novidade[]>([])
  const [current, setCurrent] = useState('')
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (!ready || inBrowser || testMode) return
    void getVersion().then((v) => {
      setCurrent(v)
      if (installedNow) { writeSeen(v); return }
      let seen = readSeen()
      if (!seen) {
        // primeira vez com este recurso: quem já usava o app vê o que veio nesta versão; instalação nova, não
        const usava = !!settings['ui.segment'] || !!settings['vault.path']
        const prev = NOVIDADES.map((n) => n.version).filter((x) => compareVersions(x, v) < 0).sort(compareVersions).pop()
        seen = usava && prev ? prev : v
        writeSeen(seen)
      }
      if (compareVersions(v, seen) > 0) setItems(unseen(NOVIDADES, seen, v))
      if (compareVersions(v, seen) !== 0) writeSeen(v)
    }).catch(() => {})
  }, [ready, testMode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => { if (inBrowser) return; void getVersion().then((v) => { setCurrent(v); setManual(true); setItems(unseen(NOVIDADES, '0.0.0', v).slice(0, 1)) }).catch(() => {}) }
    window.addEventListener(SHOW, f)
    return () => window.removeEventListener(SHOW, f)
  }, [])
  if (!items.length) return null
  const close = () => setItems([])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/45 p-6" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="O que há de novo" onMouseDown={(e) => e.stopPropagation()}
        className="anim-rise flex max-h-[80vh] w-[560px] max-w-full flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-card p-7 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-link"><Sparkles size={20} /></span>
          <div className="flex-1">
            <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-link">{manual ? `VERSÃO ${current}` : `ATUALIZADO PARA A ${current}`}</p>
            <h2 className="font-serif text-[24px] leading-tight">O que há de novo</h2>
          </div>
          <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={close} />
        </div>
        {items.map((n) => (
          <section key={n.version} className="flex flex-col gap-2">
            {items.length > 1 && <h3 className="font-mono text-[12px] text-muted">Versão {n.version}{n.date ? ` · ${new Date(`${n.date}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}</h3>}
            <Lista todos={n.todos} pro={n.pro} />
          </section>
        ))}
        <div className="flex justify-end"><Button variant="primary" onClick={close}>Entendi</Button></div>
      </div>
    </div>
  )
}

/** Configurações > Atualizações: versão atual, checagem automática e "Procurar agora". */
export function UpdatesCard({ Card }: { Card: (p: { title: string; desc: string; children: React.ReactNode }) => React.ReactNode }) {
  const { settings } = useStore()
  const c = useFound()
  const a = c?.available ?? null
  const [version, setVersion] = useState('')
  const [channel, setChannel] = useState<Check['channel'] | null>(c?.channel ?? null)
  const [state, setState] = useState<'idle' | 'checking' | 'none' | 'error'>('idle')
  const [error, setError] = useState('')
  const { install, installing, later, pct, error: installError } = useInstall()
  useEffect(() => {
    if (inBrowser) return
    getVersion().then(setVersion).catch(() => {})
    // só o canal, que vem do próprio build: abrir Configurações não faz pedido de rede
    if (!channel) call<Check>('update_check', { probe: true }).then((x) => setChannel(x.channel)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const check = async () => {
    setState('checking'); setError('')
    try { const x = await checkUpdate(); setChannel(x.channel); setState(x.available ? 'idle' : 'none') } catch (e) { setError(message(e)); setState('error') }
  }
  if (channel === 'codigo-aberto') {
    return (
      <Card title="Atualizações" desc="Este Tesseract foi compilado do código aberto. Ele não se atualiza sozinho: assim o instalador oficial nunca troca o build que você fez.">
        <p className="text-[14px]">Versão instalada: <b className="font-mono">{version || '—'}</b></p>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={ExternalLink} onClick={() => void call('update_install', { when: 'github' }).catch((e) => setError(message(e)))}>Ver as versões no GitHub</Button>
          <span className="text-[13px] text-muted">Para atualizar: baixe o código novo (git pull) e compile de novo.</span>
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </Card>
    )
  }
  return (
    <Card title="Atualizações" desc="O Tesseract procura versão nova ao abrir. A checagem só pede ao site o número da última versão: nenhum dado seu sai daqui. A atualização vem assinada e é conferida antes de instalar. Grátis e Pro usam o mesmo app: toda versão vale para os dois.">
      <p className="text-[14px]">Versão instalada: <b className="font-mono">{version || '—'}</b></p>
      <label className="flex items-center gap-2.5 text-[14px]">
        <input type="checkbox" className="size-4 accent-[var(--t-accent)]" checked={settings['update.auto'] !== false} onChange={(e) => void setSetting('update.auto', e.target.checked)} />
        Procurar atualização ao abrir o app
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" icon={RefreshCw} disabled={state === 'checking' || installing} onClick={() => void check()}>{state === 'checking' ? 'Procurando…' : 'Procurar agora'}</Button>
        {a && !later && <Button icon={Download} disabled={installing} onClick={() => void install('agora')}>{installing ? `Baixando${pct !== null ? ` ${pct}%` : '…'}` : `Atualizar para a ${a.version}`}</Button>}
        {later && <span className="text-[13.5px] text-link">Pronta: instala quando você fechar o app.</span>}
        {state === 'none' && !a && <span className="text-[13.5px] text-ok">Você está na versão mais recente.</span>}
        <button type="button" onClick={showWhatsNew} className="text-[13.5px] text-link underline-offset-2 hover:underline">Ver o que mudou nesta versão</button>
      </div>
      {a && (a.todos.length + a.pro.length > 0) && <div className="rounded-lg border border-line bg-raised/50 p-3.5"><p className="mb-2 text-[13px] text-muted">O que vem na {a.version}</p><Lista todos={a.todos} pro={a.pro} /></div>}
      {(error || installError) && <p className="text-[13px] text-danger">{error || installError}</p>}
    </Card>
  )
}
