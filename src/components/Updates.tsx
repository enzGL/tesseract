import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { Download, RefreshCw, X } from 'lucide-react'
import { call, inBrowser, message, setSetting, useStore } from '../data/api'
import { Button } from './ui'

// Atualização automática (fase 13; Rust em src-tauri/src/update.rs). Ao abrir, se ligado em
// Configurações, o app pergunta ao site se há versão nova. Achou: uma faixa no topo oferece
// "Atualizar agora". O download tem a assinatura conferida; o instalador fecha e reabre o app.
type Available = { version: string; current: string; notes: string | null }
type Progress = { done: number; total: number }

let found: Available | null = null
const subs = new Set<(a: Available | null) => void>()
const publish = (a: Available | null) => { found = a; subs.forEach((f) => f(a)) }

export async function checkUpdate(): Promise<Available | null> {
  const a = await call<Available | null>('update_check')
  publish(a)
  return a
}

function useFound() {
  const [a, setA] = useState(found)
  useEffect(() => { subs.add(setA); return () => { subs.delete(setA) } }, [])
  return a
}

function useInstall() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (inBrowser) return
    const off = listen<Progress>('update-progress', (e) => setProgress(e.payload))
    return () => { void off.then((f) => f()) }
  }, [])
  const install = async () => {
    setError(''); setProgress({ done: 0, total: 0 })
    try { await call('update_install') } // o app fecha sozinho quando o instalador abre
    catch (e) { setError(message(e)); setProgress(null) }
  }
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
  return { install, installing: !!progress, pct, error }
}

/** Faixa no topo do app quando há versão nova. A checagem roda uma vez por abertura. */
export function UpdateBanner({ testMode }: { testMode: boolean }) {
  const { ready, settings } = useStore()
  const a = useFound()
  const [closed, setClosed] = useState(false)
  const { install, installing, pct, error } = useInstall()
  const auto = settings['update.auto'] !== false
  useEffect(() => {
    if (!ready || !auto || inBrowser || testMode) return
    const t = setTimeout(() => { void checkUpdate().catch(() => {}) }, 8000) // sem pressa: depois da abertura
    return () => clearTimeout(t)
  }, [ready, auto, testMode])
  if (!a || closed) return null
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-accent/30 bg-accent-soft px-5 py-2 text-[13px]">
      <Download size={15} className="text-link" />
      <span><b className="font-semibold">Tesseract {a.version}</b> disponível <span className="text-muted">(você tem a {a.current})</span>{a.notes ? <span className="text-muted"> · {a.notes}</span> : null}</span>
      <span className="flex-1" />
      {error && <span className="text-danger">{error}</span>}
      {installing
        ? <span className="font-medium text-link">Baixando a atualização{pct !== null ? ` ${pct}%` : '…'}</span>
        : <>
          <button type="button" onClick={() => void install()} className="rounded-md bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent-strong">Atualizar agora</button>
          <button type="button" aria-label="Depois" title="Depois" onClick={() => setClosed(true)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover"><X size={14} /></button>
        </>}
    </div>
  )
}

/** Configurações > Atualizações: versão atual, checagem automática e "Procurar agora". */
export function UpdatesCard({ Card }: { Card: (p: { title: string; desc: string; children: React.ReactNode }) => React.ReactNode }) {
  const { settings } = useStore()
  const a = useFound()
  const [version, setVersion] = useState('')
  const [state, setState] = useState<'idle' | 'checking' | 'none' | 'error'>('idle')
  const [error, setError] = useState('')
  const { install, installing, pct, error: installError } = useInstall()
  useEffect(() => { if (!inBrowser) getVersion().then(setVersion).catch(() => {}) }, [])
  const check = async () => {
    setState('checking'); setError('')
    try { setState((await checkUpdate()) ? 'idle' : 'none') } catch (e) { setError(message(e)); setState('error') }
  }
  return (
    <Card title="Atualizações" desc="O Tesseract procura versão nova ao abrir. A checagem só pede ao site o número da última versão: nenhum dado seu sai daqui. A atualização vem assinada e é conferida antes de instalar.">
      <p className="text-[14px]">Versão instalada: <b className="font-mono">{version || '—'}</b></p>
      <label className="flex items-center gap-2.5 text-[14px]">
        <input type="checkbox" className="size-4 accent-[var(--t-accent)]" checked={settings['update.auto'] !== false} onChange={(e) => void setSetting('update.auto', e.target.checked)} />
        Procurar atualização ao abrir o app
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" icon={RefreshCw} disabled={state === 'checking' || installing} onClick={() => void check()}>{state === 'checking' ? 'Procurando…' : 'Procurar agora'}</Button>
        {a && <Button icon={Download} disabled={installing} onClick={() => void install()}>{installing ? `Baixando${pct !== null ? ` ${pct}%` : '…'}` : `Atualizar para a ${a.version}`}</Button>}
        {state === 'none' && !a && <span className="text-[13.5px] text-ok">Você está na versão mais recente.</span>}
      </div>
      {(error || installError) && <p className="text-[13px] text-danger">{error || installError}</p>}
    </Card>
  )
}
