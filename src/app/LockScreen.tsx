// Trava do app (segurança do beta):
// gravura escura à esquerda; senha e depois o código de 6 dígitos, o Windows Hello ou um código de recuperação.
// O portão (SecurityGate) mostra esta tela no lugar do app e só monta o app depois de destravar.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, Loader2, ScanFace } from 'lucide-react'
import { listen } from '@tauri-apps/api/event'
import { boot, inBrowser, message, reload } from '../data/api'
import { act, lockNow, refresh, useSecurity, type SecStatus } from '../data/security'
import { useTheme } from './theme'
import artLight from '../assets/art/1.png'
import artDark from '../assets/art-dark/1.png'
import logoOnLight from '../assets/logo/tesseract-light.png'

const field = 'h-12 w-full rounded-xl border border-line-strong bg-card px-4 text-[15px] text-fg outline-none focus:border-accent'
const primary = 'h-12 w-full rounded-xl bg-accent text-[15px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50'


/** Decide entre a tela de trava e o app. O app (e as chamadas dele ao banco) só começa depois de destravar. */
export function SecurityGate({ children }: { children: ReactNode }) {
  const st = useSecurity()
  const booted = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => { refresh().catch((e) => setFailed(message(e))) }, [])
  // começa o app uma vez, no primeiro destravar; depois de travar e destravar, só recarrega
  useEffect(() => {
    if (!st || st.locked) return
    if (!booted.current) { booted.current = true; void boot() } else void reload()
  }, [st?.locked]) // eslint-disable-line react-hooks/exhaustive-deps
  // Win+L (o Rust avisa) e "Travar agora" (barra lateral, Ctrl+L)
  useEffect(() => {
    if (inBrowser) return
    let off: (() => void) | undefined
    void listen('seguranca-travou', () => { void refresh() }).then((u) => { off = u })
    return () => off?.()
  }, [])
  // travar depois de parado: qualquer tecla, clique ou movimento dentro do app zera o relógio
  const last = useRef(Date.now())
  useEffect(() => {
    if (!st?.enabled || st.locked || !st.idleMin) return
    const touch = () => { last.current = Date.now() }
    const evs = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    touch()
    const ms = st.idleMin * 60_000
    const t = setInterval(() => { if (Date.now() - last.current >= ms) void lockNow('parado') }, 15_000)
    return () => { evs.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t) }
  }, [st?.enabled, st?.locked, st?.idleMin])

  if (failed) return <div className="grid h-full place-items-center p-8 text-[14px] text-muted">Não deu para abrir a trava do app: {failed}</div>
  if (!st) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-faint" /></div>
  if (st.enabled && st.locked) return <LockScreen st={st} />
  return <>{children}</>
}

function LockScreen({ st }: { st: SecStatus }) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<'codigo' | 'recuperacao'>('codigo')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  useEffect(() => { setError(null); if (st.stage === 'senha') setMode('codigo') }, [st.stage])
  useEffect(() => { if (st.waitSecs > 0) setError(`Muitas tentativas erradas: espere ${st.waitSecs} s.`) }, [st.waitSecs])

  const run = async (cmd: string, args: Record<string, unknown> = {}) => {
    setBusy(true); setError(null)
    try { await act(cmd, args) } catch (e) { setError(cap(message(e))) } finally { setBusy(false) }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-bg text-fg md:grid-cols-2">
      <div aria-hidden="true" className="relative hidden overflow-hidden bg-[#142057] md:block">
        <img key={theme} src={theme === 'dark' ? artDark : artLight} alt="" className="anim-fade absolute inset-0 size-full object-cover [image-rendering:pixelated]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,22,64,0.82)_0%,rgba(14,22,64,0.35)_18%,rgba(14,22,64,0)_34%,rgba(14,22,64,0)_50%,rgba(14,22,64,0.9)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-[#F7F4EC] shadow-[0_4px_18px_rgba(14,22,64,0.35)]"><img src={logoOnLight} alt="" className="size-8 object-contain" draggable={false} /></span>
            <span className="font-serif text-[22px] text-white">Tesseract</span>
            <span className="ml-1 rounded-full bg-white/15 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.16em] text-white backdrop-blur-sm">TRAVADO</span>
          </div>
          <p className="max-w-[460px] font-serif text-[26px] leading-[1.45] text-white [text-shadow:0_1px_12px_rgba(14,22,64,0.6)]">Seus clientes, contratos e notas ficam neste computador. <em className="text-[#C9D1FF]">Ninguém abre sem você.</em></p>
        </div>
      </div>
      <div className="flex min-h-0 items-center justify-center overflow-y-auto p-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          {st.stage === 'senha' ? (
            <Password busy={busy} onSubmit={(pw) => void run('sec_unlock_password', { password: pw })} second={st.totp || st.hello} />
          ) : mode === 'recuperacao' ? (
            <Recovery busy={busy} left={st.codesLeft} onSubmit={(code) => void run('sec_unlock_recovery', { code })} />
          ) : st.totp ? (
            <Totp busy={busy} onSubmit={(code) => void run('sec_unlock_code', { code })} />
          ) : (
            <Heading step="Passo 2 de 2" title="Confirme com o Windows Hello" body="Senha conferida. Agora rosto, digital ou o PIN do Windows." />
          )}

          {error && <p role="alert" className="text-[13.5px] text-[#B3261E] dark:text-[#FF8A80]">{error}</p>}

          {st.stage === 'segundo' && mode === 'codigo' && st.hello && (
            <>
              {st.totp && <div className="flex items-center gap-3 text-[12.5px] text-muted"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>}
              <button type="button" disabled={busy} onClick={() => void run('sec_unlock_hello')}
                className={st.totp ? 'flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-card text-[15px] font-medium hover:bg-raised disabled:opacity-50' : primary + ' flex items-center justify-center gap-2.5'}>
                <ScanFace size={19} strokeWidth={1.6} />Usar o Windows Hello (rosto, digital ou PIN)
              </button>
            </>
          )}

          {st.stage === 'segundo' && (
            <div className="flex justify-between text-[13.5px]">
              {mode === 'codigo'
                ? (st.codesLeft > 0 ? <button type="button" onClick={() => { setError(null); setMode('recuperacao') }} className="text-link hover:underline">Usar um código de recuperação</button> : <span />)
                : <button type="button" onClick={() => { setError(null); setMode('codigo') }} className="text-link hover:underline">{st.totp ? 'Usar o código do app' : 'Usar o Windows Hello'}</button>}
              <button type="button" onClick={() => void run('sec_back')} className="inline-flex items-center gap-1 text-link hover:underline"><ArrowLeft size={14} />Voltar para a senha</button>
            </div>
          )}

          {st.stage === 'senha' && (
            <button type="button" onClick={() => setForgot((f) => !f)} className="self-start text-[13.5px] text-link hover:underline">Esqueci a senha</button>
          )}
          {forgot && st.stage === 'senha' && (
            <p className="rounded-xl bg-raised px-4 py-3 text-[13px] leading-relaxed text-muted">
              A senha não fica guardada em lugar nenhum, então ninguém consegue recuperá-la, nem o Tesseract. Os códigos de recuperação substituem o celular, não a senha.
              Sem a senha, o caminho é restaurar o backup da nuvem num Tesseract novo, com a senha ou a chave de recuperação do backup.
            </p>
          )}
          <p className="rounded-xl bg-raised px-4 py-3 text-[12.5px] leading-relaxed text-muted">O backup na nuvem continua rodando enquanto o Tesseract está travado.</p>
        </div>
      </div>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.')

function Heading({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{step}</span>
      <h1 className="font-serif text-[32px] leading-tight">{title}</h1>
      <p className="text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  )
}

function Password({ busy, second, onSubmit }: { busy: boolean; second: boolean; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (pw) { onSubmit(pw); setPw('') } }
  return (
    <form onSubmit={submit} aria-label="Destravar" className="flex flex-col gap-5">
      <Heading step={second ? 'Passo 1 de 2' : 'Tesseract travado'} title="Digite a sua senha" body="A senha do Tesseract, não a do Windows." />
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Senha
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className={field} />
      </label>
      <button type="submit" disabled={busy || !pw} className={primary}>{busy ? 'Conferindo…' : second ? 'Continuar' : 'Destravar'}</button>
    </form>
  )
}

function Totp({ busy, onSubmit }: { busy: boolean; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  useEffect(() => { const t = setInterval(() => setLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 500); return () => clearInterval(t) }, [])
  const digits = code.replace(/\D/g, '').slice(0, 6)
  const send = (d: string) => { if (d.length === 6) { onSubmit(d); setCode('') } }
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(digits) }} aria-label="Código do autenticador" className="flex flex-col gap-5">
      <Heading step="Passo 2 de 2" title="Código do autenticador" body="Senha conferida. Abra o Google Authenticator, o Authy ou o app de senhas e digite os 6 números de “Tesseract”." />
      <label className="relative block">
        <span className="sr-only">Código de 6 dígitos</span>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={digits} maxLength={7}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(d); send(d) }}
          className="absolute inset-0 h-full w-full cursor-text opacity-0" />
        <span aria-hidden="true" className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`grid h-[60px] place-items-center rounded-xl border-[1.5px] bg-card font-mono text-[26px] ${i < digits.length || i === digits.length ? 'border-accent' : 'border-line-strong'}`}>{digits[i] ?? ''}</span>
          ))}
        </span>
      </label>
      <div className="flex items-center gap-2.5 text-[13px] text-muted">
        <span className="h-1 flex-1 overflow-hidden rounded bg-line"><span className="block h-1 bg-accent transition-[width] duration-500" style={{ width: `${(left / 30) * 100}%` }} /></span>
        <span className="font-mono">troca em {left} s</span>
      </div>
      <button type="submit" disabled={busy || digits.length !== 6} className={primary}>{busy ? 'Conferindo…' : 'Destravar'}</button>
    </form>
  )
}

function Recovery({ busy, left, onSubmit }: { busy: boolean; left: number; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onSubmit(code) }} aria-label="Código de recuperação" className="flex flex-col gap-5">
      <Heading step="Passo 2 de 2" title="Código de recuperação" body={`Para quando o celular não está com você. Cada código abre o Tesseract uma vez; restam ${left}. Depois, gere novos em Configurações › Segurança.`} />
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Código (ex.: K7QM-2XVR)
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${field} font-mono tracking-[0.12em]`} />
      </label>
      <button type="submit" disabled={busy || !code.trim()} className={primary}>{busy ? 'Conferindo…' : 'Destravar'}</button>
    </form>
  )
}
