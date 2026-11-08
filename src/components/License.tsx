import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, KeyRound, Laptop, Mail, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from './ui'
import {
  closeActivation, openCheckout, pasteKey, seenAgo, sendCode, useActivation, verifyCode, day,
  type LicenseDevice, type LicenseView,
} from '../data/license'

// Janela de ativação do Pro: e-mail -> código de 6 dígitos -> pronto.
// Abre por openActivation() de qualquer tela; segue o tema do app (claro e escuro).

const label = 'font-mono text-[11px] tracking-[0.16em] uppercase text-muted'
const field = 'h-11 w-full rounded-lg border border-line-strong bg-raised px-3 text-[15px] outline-none focus:border-accent'
const errMsg = (e: unknown) => { const s = String(e instanceof Error ? e.message : e); return s.charAt(0).toUpperCase() + s.slice(1) }

type Step = 'email' | 'code' | 'vagas' | 'chave' | 'pronto'

export function ActivationHost() {
  const a = useActivation()
  return a ? createPortal(<Activation reason={a.reason} onClose={closeActivation} />, document.body) : null
}

function Activation({ reason, onClose }: { reason?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [key, setKey] = useState('')
  const [devices, setDevices] = useState<LicenseDevice[]>([])
  const [release, setRelease] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const [done, setDone] = useState<LicenseView | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [busy, onClose])
  useEffect(() => { box.current?.querySelector<HTMLInputElement>('input,textarea')?.focus() }, [step])

  const go = async (f: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await f() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }
  const ask = () => go(async () => { await sendCode(email); setCode(''); setStep('code') })
  const resend = () => go(async () => { await sendCode(email); setResent(true) })
  const check = (rel?: string) => go(async () => {
    const r = await verifyCode(email, code, rel)
    if (r.kind === 'vagas') { setDevices(r.devices); setRelease(null); setStep('vagas'); return }
    setDone(r.view); setStep('pronto')
  })
  const paste = () => go(async () => { setDone(await pasteKey(key)); setStep('pronto') })

  const st = done?.status
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ativar-titulo" className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" style={{ animationDuration: '.2s' }}
      onMouseDown={() => { if (!busy) onClose() }}>
      <div ref={box} className="anim-rise relative flex w-full max-w-[460px] flex-col gap-4 rounded-2xl border border-line bg-card px-7 py-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"><X size={16} /></button>
        <span className={label}>Tesseract Pro</span>

        {step === 'email' && <>
          <h2 id="ativar-titulo" className="font-serif text-[24px] leading-tight">{reason ? 'Isso é do Pro' : 'Ativar o Pro'}</h2>
          {reason && <p className="-mt-1 self-start rounded-md bg-accent-soft px-2.5 py-1 text-[13.5px] font-medium text-link">{reason}</p>}
          <p className="text-[14px] leading-relaxed text-muted">{reason ? 'Nada do que você já criou some: o limite só vale para criar mais. ' : ''}Digite o e-mail que você usou na assinatura. Mandamos um código de 6 números para ele. Sem senha.</p>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void ask() }}>
            <label className="flex flex-col gap-1.5 text-[13px] text-muted">E-mail da assinatura
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className={field} />
            </label>
            {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
            <Button type="submit" variant="primary" icon={Mail} disabled={busy || !email.includes('@')}>{busy ? 'Mandando...' : 'Mandar o código'}</Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
            <button type="button" className="text-link hover:underline" onClick={() => void go(async () => { await openCheckout() })}>Ainda não assino: ver planos</button>
            <button type="button" className="text-muted hover:text-fg" onClick={() => { setError(''); setStep('chave') }}>Tenho uma chave</button>
          </div>
        </>}

        {step === 'code' && <>
          <h2 id="ativar-titulo" className="font-serif text-[24px] leading-tight">Confira seu e-mail</h2>
          <p className="text-[14px] leading-relaxed text-muted">Se <b className="text-fg">{email.trim()}</b> tem uma assinatura ativa, o código já está chegando. Ele vale por 10 minutos.</p>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void check() }}>
            <label className="flex flex-col gap-1.5 text-[13px] text-muted">Código
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="000000"
                className={`${field} text-center font-mono text-[22px] tracking-[0.4em]`} />
            </label>
            {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Conferindo...' : 'Ativar'}</Button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
            <button type="button" className="text-muted hover:text-fg" onClick={() => { setError(''); setResent(false); setStep('email') }}>Trocar o e-mail</button>
            <button type="button" className="text-link hover:underline disabled:opacity-50" disabled={busy || resent} onClick={() => void resend()}>{resent ? 'Código novo mandado' : 'Mandar outro código'}</button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-faint">Não chegou? Olhe o spam. Se o e-mail estiver certo e nada chegar, a assinatura pode estar em outro e-mail.</p>
        </>}

        {step === 'vagas' && <>
          <h2 id="ativar-titulo" className="font-serif text-[24px] leading-tight">As 2 vagas estão ocupadas</h2>
          <p className="text-[14px] leading-relaxed text-muted">Cada assinatura vale em 2 computadores. Escolha um para liberar: o Pro sai dele na próxima vez que ele conferir a licença. Nada é apagado lá.</p>
          <div role="radiogroup" aria-label="Computador para liberar" className="flex flex-col gap-2">
            {devices.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={release === d.id} onClick={() => setRelease(d.id)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${release === d.id ? 'border-accent bg-accent-soft' : 'border-line-strong bg-raised hover:bg-hover'}`}>
                <Laptop size={18} className="shrink-0 text-muted" />
                <span className="flex min-w-0 flex-col"><span className="truncate text-[14px] font-medium">{d.nome}</span><span className="text-[12.5px] text-muted">Usado {seenAgo(d.visto)}</span></span>
                {release === d.id && <Check size={16} className="ml-auto text-link" />}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy || !release} onClick={() => void check(release!)}>{busy ? 'Ativando...' : 'Liberar e ativar aqui'}</Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>Agora não</Button>
          </div>
        </>}

        {step === 'chave' && <>
          <h2 id="ativar-titulo" className="font-serif text-[24px] leading-tight">Colar uma chave</h2>
          <p className="text-[14px] leading-relaxed text-muted">Se o suporte mandou uma chave que começa com <span className="font-mono text-fg">TESS1.</span>, cole aqui. Ela vale até a data dela e não renova sozinha.</p>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void paste() }}>
            <textarea aria-label="Chave do Tesseract" value={key} onChange={(e) => setKey(e.target.value)} rows={4} spellCheck={false} placeholder="TESS1...."
              className="w-full resize-none rounded-lg border border-line-strong bg-raised px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent" />
            {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" icon={KeyRound} disabled={busy || !key.trim().startsWith('TESS1.')}>Ativar com a chave</Button>
              <Button variant="ghost" onClick={() => { setError(''); setStep('email') }}>Voltar</Button>
            </div>
          </form>
        </>}

        {step === 'pronto' && <>
          <div className="grid h-11 w-11 place-items-center rounded-full bg-ok-bg text-ok"><Check size={22} /></div>
          <h2 id="ativar-titulo" className="font-serif text-[24px] leading-tight">O Pro está ativo neste computador</h2>
          <p className="text-[14px] leading-relaxed text-muted">
            {st?.plano === 'pro' ? <>Vale até {day(st.ate)}{done?.online ? ' e renova sozinho quando houver internet' : ''}. Sem internet, tudo continua funcionando até lá.</> : 'Pronto.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onClose}>Continuar</Button>
            <Button variant="ghost" onClick={() => { onClose(); navigate('/plano') }}>Ver meu plano</Button>
          </div>
        </>}
      </div>
    </div>
  )
}
