// Segurança do beta em Configurações:
// o cartão Segurança da C e, na primeira vez, o assistente da B no tema do app (senha, 2º fator, códigos).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ClipboardCopy, KeyRound, Lock, ScanFace, ShieldCheck, Smartphone, X } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { Badge, Button } from './ui'
import { call, message, useStore } from '../data/api'
import { act, ago, IDLE_OPTIONS, lockNow, MIN_PASSWORD, refresh, useSecurity, type SecStatus, type TotpNew } from '../data/security'

const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const ERR = 'text-[13px] text-[#B3261E] dark:text-[#FF8A80]'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Qr({ text, label }: { text: string; label: string }) {
  const { cells, size } = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make()
    const n = q.getModuleCount(), m = 4, out: string[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) out.push(`M${c + m} ${r + m}h1v1h-1z`)
    return { cells: out.join(''), size: n + m * 2 }
  }, [text])
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-40 shrink-0 rounded-lg">
      <rect width={size} height={size} fill="#fff" /><path d={cells} fill="#000" />
    </svg>
  )
}

function Codes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = `Tesseract · códigos de recuperação (cada um vale uma vez)\n\n${codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`).join('\n')}\n`
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-dashed border-line-strong bg-card p-4 text-center font-mono text-[16px] sm:grid-cols-5">
        {codes.map((c, i) => <span key={c} className="rounded-lg bg-raised py-2.5" title={`${i + 1}º código`}>{c}</span>)}
      </div>
      <div><Button icon={copied ? Check : ClipboardCopy} onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })}>{copied ? 'Copiados' : 'Copiar os 10 códigos'}</Button></div>
    </div>
  )
}

// ---------- assistente da primeira vez ----------

const STEPS = ['Senha', 'App autenticador ou Windows Hello', 'Códigos de recuperação']

function Setup({ st, onClose }: { st: SecStatus; onClose: () => void }) {
  const { settings } = useStore()
  const name = String(settings['profile.name'] ?? '').trim()
  const [step, setStep] = useState(0)
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [totp, setTotp] = useState<TotpNew | null>(null)
  const [code, setCode] = useState(''); const [totpOk, setTotpOk] = useState(false); const [helloOk, setHelloOk] = useState(false)
  const [codes, setCodes] = useState<string[]>([]); const [confirm, setConfirm] = useState('')
  const [idle, setIdle] = useState<number | null>(15)
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(null); try { await f() } catch (e) { setErr(cap(message(e))) } finally { setBusy(false) } }
  const cancel = () => { void call('sec_setup_cancel').catch(() => undefined); onClose() }

  const step1 = () => go(async () => {
    if (pw !== pw2) throw new Error('as duas senhas estão diferentes')
    await call('sec_setup_password', { password: pw })
    setTotp(await call<TotpNew>('sec_totp_new', { name: name ? `${name}` : 'Tesseract' })); setStep(1)
  })
  const check = (c: string) => go(async () => { const ok = await call<boolean>('sec_totp_check', { code: c }); setTotpOk(ok); if (!ok) throw new Error('código errado: confira se o relógio do celular está certo e digite o código que está na tela agora') })
  const hello = () => go(async () => { const ok = await call<boolean>('sec_hello_check'); setHelloOk(ok); if (!ok) throw new Error('o Windows Hello não confirmou') })
  const step2 = (skip: boolean) => go(async () => {
    if (skip) { await call('sec_setup_finish', { confirm: '', idleMin: idle }); await refresh(); onClose(); return }
    setCodes(await call<string[]>('sec_codes_new')); setStep(2)
  })
  const finish = () => go(async () => { await act('sec_setup_finish', { confirm, idleMin: idle }); onClose() })

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line-strong bg-raised/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted">LIGAR A SEGURANÇA · PASSO {step + 1} DE 3</span>
          <ol aria-label="Passos" className="grid grid-cols-3 gap-2 text-[12.5px]">
            {STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={`border-t-[3px] pt-2 ${i <= step ? 'border-accent' : 'border-line-strong'} ${i === step ? 'font-semibold text-fg' : 'text-muted'}`}>{i + 1} · {s}</li>)}
          </ol>
        </div>
        <Button variant="ghost" icon={X} ariaLabel="Cancelar" onClick={cancel} />
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-serif text-[24px]">Escolha a senha do Tesseract</h3>
          <p className="max-w-[680px] text-[14px] leading-relaxed text-muted">Ela é pedida ao abrir o app e depois de um tempo parado. Fica só neste computador, embaralhada: ninguém consegue recuperar, nem o Tesseract. Use uma frase que você lembre, com pelo menos {MIN_PASSWORD} caracteres.</p>
          <div className="grid max-w-[680px] grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">Senha<input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={field} /></label>
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">Repita a senha<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" className={field} /></label>
          </div>
          <div className="flex flex-col gap-1.5"><span className="text-[12.5px] text-muted">Travar depois de parado</span><IdleChips value={idle} onChange={setIdle} /></div>
          {err && <p role="alert" className={ERR}>{err}</p>}
          <div className="flex gap-2"><Button variant="primary" disabled={busy || pw.length < MIN_PASSWORD || !pw2} onClick={() => void step1()}>Continuar</Button><Button variant="ghost" onClick={cancel}>Cancelar</Button></div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-serif text-[24px]">Um segundo jeito de provar que é você</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className={`flex flex-col gap-3 rounded-xl border p-4 ${totpOk ? 'border-ok' : 'border-accent'} bg-card`}>
              <div className="flex items-center justify-between"><b className="flex items-center gap-2 text-[15px]"><Smartphone size={16} />App autenticador</b><Badge>recomendado</Badge></div>
              <p className="text-[13px] leading-relaxed text-muted">Aponte a câmera do Google Authenticator, do Authy ou do seu app de senhas para o código.</p>
              {totp && (
                <div className="flex flex-wrap items-center gap-4">
                  <Qr text={totp.uri} label="QR code para o app autenticador" />
                  <div className="flex min-w-0 flex-col gap-1.5 text-[12.5px] text-muted">Sem câmera? Digite a chave:<code className="break-all font-mono text-[14px] tracking-[0.06em] text-fg">{totp.secret.match(/.{1,4}/g)?.join(' ')}</code></div>
                </div>
              )}
              <label className="flex flex-col gap-1 text-[12.5px] text-muted">Digite o código que apareceu no app
                <input inputMode="numeric" value={code} disabled={totpOk} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(d); if (d.length === 6) void check(d) }} className={`${field} font-mono text-[18px] tracking-[0.2em]`} />
              </label>
              {totpOk && <p className="flex items-center gap-1.5 text-[13px] text-ok"><Check size={14} />Código certo. O app está ligado ao Tesseract.</p>}
            </section>
            <section className={`flex flex-col gap-3 rounded-xl border p-4 ${helloOk ? 'border-ok' : 'border-line-strong'} bg-card`}>
              <b className="flex items-center gap-2 text-[15px]"><ScanFace size={16} />Windows Hello</b>
              <p className="text-[13px] leading-relaxed text-muted">Rosto, digital ou o PIN do Windows. Mais rápido no dia a dia; vale só neste computador.</p>
              {st.helloAvailable
                ? (helloOk ? <p className="flex items-center gap-1.5 text-[13px] text-ok"><Check size={14} />Windows Hello confirmado.</p> : <div><Button icon={ScanFace} disabled={busy} onClick={() => void hello()}>Usar o Windows Hello</Button></div>)
                : <p className="text-[13px] text-faint">Não está configurado neste computador (Configurações do Windows › Contas › Opções de entrada).</p>}
              <p className="text-[12.5px] text-muted">Dá para ter os dois: o Hello no dia a dia e o app autenticador como reserva.</p>
            </section>
          </div>
          <p className="max-w-[760px] rounded-lg border border-dashed border-line-strong px-4 py-3 text-[13px] leading-relaxed text-muted"><b className="text-fg">No passo 3</b> saem 10 códigos de uso único, para o dia em que o celular sumir ou o Hello falhar.</p>
          {err && <p role="alert" className={ERR}>{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy || !(totpOk || helloOk)} onClick={() => void step2(false)}>Continuar</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void step2(true)}>Só senha, sem 2º fator</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-serif text-[24px]">Guarde os códigos de recuperação</h3>
          <p className="max-w-[760px] text-[14px] leading-relaxed text-muted">Se o celular sumir ou o Windows Hello falhar, cada código abre o Tesseract uma vez, depois da senha. Guarde fora deste computador: no gerenciador de senhas ou escritos no papel. Esquecer a senha e perder os códigos significa perder o acesso.</p>
          <Codes codes={codes} />
          <label className="flex max-w-[360px] flex-col gap-1 text-[12.5px] text-muted">Para conferir, digite o 4º código
            <input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} className={`${field} font-mono tracking-[0.1em]`} />
          </label>
          {err && <p role="alert" className={ERR}>{err}</p>}
          <div className="flex gap-2"><Button variant="primary" icon={ShieldCheck} disabled={busy || confirm.replace(/[^A-Z0-9]/g, '').length < 8} onClick={() => void finish()}>Guardei · ligar a segurança</Button><Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button></div>
        </div>
      )}
    </div>
  )
}

function IdleChips({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Tempo para travar" className="flex flex-wrap gap-1.5">
      {IDLE_OPTIONS.map((o) => (
        <button key={o.label} type="button" role="radio" aria-checked={value === o.min} onClick={() => onChange(o.min)}
          className={`h-8 rounded-full px-3 text-[13px] ${value === o.min ? 'bg-fg font-medium text-bg' : 'border border-line-strong text-muted hover:text-fg'}`}>{o.label}</button>
      ))}
    </div>
  )
}

// ---------- ações que pedem a senha (cartão ligado) ----------

type Ask = null | 'senha' | 'celular' | 'hello' | 'codigos' | 'desligar'

function Confirm({ title, children, cta, busy, err, onCancel, onSubmit, ready = true }: { title: string; children?: ReactNode; cta: string; busy: boolean; err: string | null; onCancel: () => void; onSubmit: (pw: string) => void; ready?: boolean }) {
  const [pw, setPw] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (pw && ready) onSubmit(pw) }} className="flex flex-col gap-3 rounded-xl bg-raised px-4 py-4">
      <b className="text-[14px]">{title}</b>
      {children}
      <label className="flex max-w-[320px] flex-col gap-1 text-[12.5px] text-muted">Senha atual<input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className={field} /></label>
      {err && <p role="alert" className={ERR}>{err}</p>}
      <div className="flex gap-2"><Button type="submit" variant="primary" disabled={busy || !pw || !ready}>{cta}</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div>
    </form>
  )
}

function Row({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3.5 last:border-0">
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5"><b className="text-[14.5px] font-medium">{title}</b><span className="text-[13px] text-muted">{body}</span></div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function SecurityCard() {
  const st = useSecurity()
  const { settings } = useStore()
  const [setup, setSetup] = useState(false)
  const [ask, setAsk] = useState<Ask>(null)
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [pwNew, setPwNew] = useState(''); const [pwNew2, setPwNew2] = useState('')
  const [totp, setTotp] = useState<TotpNew | null>(null); const [code, setCode] = useState('')
  useEffect(() => { void refresh().catch(() => undefined) }, [])
  useEffect(() => { setErr(null); setPwNew(''); setPwNew2(''); setCode(''); if (ask !== 'celular') setTotp(null) }, [ask])
  if (!st) return null
  const go = async (f: () => Promise<void>) => { setBusy(true); setErr(null); try { await f(); } catch (e) { setErr(cap(message(e))) } finally { setBusy(false) } }
  const done = () => setAsk(null)
  const how = [st.totp && 'app autenticador', st.hello && 'Windows Hello'].filter(Boolean).join(' · ')

  return (
    <section aria-label="Segurança" className="anim-rise flex flex-col gap-5 rounded-xl border border-line bg-card p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <div className="flex items-center gap-2.5"><h2 className="text-[17px] font-semibold">Segurança</h2>{st.enabled ? <Badge tone="ok">ligada</Badge> : <Badge tone="muted">desligada</Badge>}</div>
          <p className="text-[13.5px] leading-relaxed text-muted">{st.enabled
            ? `Senha${how ? ` + ${how}` : ''} ao abrir${st.idleMin ? ` e depois de ${IDLE_OPTIONS.find((o) => o.min === st.idleMin)?.label ?? `${st.idleMin} min`} parado` : ''}. Enquanto travado, nada do app responde, só a tela de trava.`
            : 'Trave o Tesseract com senha e, se quiser, com o código do celular ou o Windows Hello. Vale para quem divide o computador ou leva o notebook para fora.'}</p>
        </div>
        {st.enabled ? <Button icon={Lock} onClick={() => void lockNow('botao')}>Travar agora · Ctrl+L</Button> : !setup && <Button variant="primary" icon={ShieldCheck} onClick={() => setSetup(true)}>Ligar a segurança</Button>}
      </header>

      {!st.enabled && setup && <Setup st={st} onClose={() => setSetup(false)} />}

      {st.enabled && (
        <div className="flex flex-col">
          <Row title="Como entrar" body={`Senha${how ? ` · ${how}` : ' (sem 2º fator)'}`}>
            <Button onClick={() => setAsk('senha')}>Trocar a senha</Button>
            <Button icon={Smartphone} onClick={() => setAsk('celular')}>{st.totp ? 'Trocar o celular' : 'Ligar o app autenticador'}</Button>
            {(st.helloAvailable || st.hello) && <Button icon={ScanFace} onClick={() => setAsk('hello')}>{st.hello ? 'Desligar o Hello' : 'Ligar o Windows Hello'}</Button>}
          </Row>
          {ask === 'senha' && (
            <Confirm title="Trocar a senha" cta="Trocar a senha" busy={busy} err={err} onCancel={done} ready={pwNew.length >= MIN_PASSWORD && pwNew === pwNew2}
              onSubmit={(old) => void go(async () => { await call('sec_change_password', { old, new: pwNew }); await refresh(); done() })}>
              <div className="grid max-w-[660px] grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-[12.5px] text-muted">Senha nova<input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className={field} /></label>
                <label className="flex flex-col gap-1 text-[12.5px] text-muted">Repita a senha nova<input type="password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} className={field} /></label>
              </div>
            </Confirm>
          )}
          {ask === 'celular' && (
            <Confirm title={st.totp ? 'Trocar o celular' : 'Ligar o app autenticador'} cta="Salvar" busy={busy} err={err} onCancel={done} ready={code.length === 6 && !!totp}
              onSubmit={(password) => void go(async () => { await act('sec_totp_save', { password, code }); done() })}>
              {!totp ? <div><Button onClick={() => void go(async () => setTotp(await call<TotpNew>('sec_totp_new', { name: String(settings['profile.name'] ?? 'Tesseract') })))}>Mostrar o QR code</Button></div> : (
                <div className="flex flex-wrap items-center gap-4">
                  <Qr text={totp.uri} label="QR code para o app autenticador" />
                  <div className="flex flex-col gap-2 text-[12.5px] text-muted">
                    <span>Sem câmera? <code className="font-mono text-fg">{totp.secret.match(/.{1,4}/g)?.join(' ')}</code></span>
                    <label className="flex flex-col gap-1">Código do app novo<input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${field} max-w-[200px] font-mono tracking-[0.2em]`} /></label>
                    <span>O celular antigo deixa de valer quando você salvar.</span>
                  </div>
                </div>
              )}
            </Confirm>
          )}
          {ask === 'hello' && (
            <Confirm title={st.hello ? 'Desligar o Windows Hello' : 'Ligar o Windows Hello'} cta={st.hello ? 'Desligar' : 'Ligar e confirmar no Windows'} busy={busy} err={err} onCancel={done}
              onSubmit={(password) => void go(async () => { await act('sec_hello_set', { password, on: !st.hello }); done() })} />
          )}

          <Row title="Travar depois de parado" body="Sem mexer no teclado ou no mouse dentro do Tesseract.">
            <IdleChips value={st.idleMin} onChange={(v) => void act('sec_prefs', { idleMin: v, lockWithWindows: st.lockWithWindows }).catch((e) => setErr(cap(message(e))))} />
          </Row>
          <div className="border-b border-line py-3.5">
            <label className="flex items-start gap-2.5 text-[14.5px]">
              <input type="checkbox" checked={st.lockWithWindows} onChange={(e) => void act('sec_prefs', { idleMin: st.idleMin, lockWithWindows: e.target.checked })} className="mt-1 size-4 accent-[var(--color-accent)]" />
              <span>Travar ao bloquear o Windows (Win+L)<span className="block text-[13px] text-muted">Ao voltar, o Tesseract pede a senha de novo.</span></span>
            </label>
          </div>
          {(st.totp || st.hello) && (
            <Row title="Códigos de recuperação" body={`${st.codesLeft} de 10 ainda não usados. Gerar novos invalida os antigos.`}>
              <Button icon={KeyRound} onClick={() => { setNewCodes(null); setAsk('codigos') }}>Gerar novos códigos</Button>
            </Row>
          )}
          {ask === 'codigos' && (newCodes
            ? <div className="flex flex-col gap-3 rounded-xl bg-raised px-4 py-4"><b className="text-[14px]">Códigos novos: guarde agora, eles não aparecem de novo</b><Codes codes={newCodes} /><div><Button variant="primary" onClick={() => { setNewCodes(null); done() }}>Guardei</Button></div></div>
            : <Confirm title="Gerar novos códigos de recuperação" cta="Gerar" busy={busy} err={err} onCancel={done} onSubmit={(password) => void go(async () => { setNewCodes(await call<string[]>('sec_codes_regen', { password })); await refresh() })} />)}
          <Row title="Banco criptografado" body="Ainda não: o arquivo do banco fica legível para quem copiar a pasta do Tesseract. A criptografia do banco entra na próxima etapa da segurança.">
            <Badge tone="muted">em breve</Badge>
          </Row>
          <Row title="Desligar a segurança" body="Tira a senha, o 2º fator e os códigos. O app abre direto.">
            <Button variant="ghost" onClick={() => setAsk('desligar')}>Desligar</Button>
          </Row>
          {ask === 'desligar' && <Confirm title="Desligar a segurança" cta="Desligar" busy={busy} err={err} onCancel={done} onSubmit={(password) => void go(async () => { await act('sec_disable', { password }); done() })} />}
          {err && !ask && <p role="alert" className={ERR}>{err}</p>}
        </div>
      )}

      {st.log.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-raised px-4 py-3.5">
          <b className="text-[13.5px]">Acessos recentes</b>
          <div className="grid grid-cols-[110px_minmax(0,200px)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            {st.log.slice(0, 8).map((l, i) => (
              <div key={i} className="contents">
                <span className="font-mono text-[12px] text-muted">{ago(l.at)}</span>
                <span className={l.what === 'Tentativa errada' ? 'text-[#9A3412] dark:text-[#FFB38A]' : ''}>{l.what}</span>
                <span className="truncate text-muted">{l.how}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
