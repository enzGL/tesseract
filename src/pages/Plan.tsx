import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CreditCard, Laptop, LogOut, Monitor, RefreshCw, Sparkles, WifiOff } from 'lucide-react'
import { Badge, Button, PageHeader } from '../components/ui'
import { inBrowser } from '../data/api'
import {
  day, licenseDevices, logoutLicense, openActivation, openCheckout, releaseDevice, renewLicense, seenAgo, useLicense,
  type LicenseDevice, type LicenseView,
} from '../data/license'

// Página "Seu plano": situação, validade, computadores e avisos.

const label = 'font-mono text-[11px] tracking-[0.16em] uppercase text-muted'
const errMsg = (e: unknown) => { const s = String(e instanceof Error ? e.message : e); return s.charAt(0).toUpperCase() + s.slice(1) }

const GRATIS = ['Escopo Pessoal', 'Até 3 projetos ativos', 'Kanban, Lista e Foco do dia', 'Calendário da semana', 'Finanças pessoais à mão', 'Busca por texto no Conhecimento', 'Backup e exportação, sempre']
const PRO = ['Organizações, além do Pessoal', 'Projetos ativos sem limite', 'Todos os métodos (Scrum, OKR, Shape Up...)', 'Calendário com a linha do tempo', 'Importar extrato', 'Busca por significado e perguntas às notas', '2 computadores por assinatura']

export function Plan() {
  const v = useLicense()
  const [devices, setDevices] = useState<LicenseDevice[] | null>(null)
  const [devErr, setDevErr] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)

  const loadDevices = useCallback(async () => {
    setDevErr('')
    try { setDevices((await licenseDevices()).devices) } catch (e) { setDevices(null); setDevErr(errMsg(e)) }
  }, [])
  useEffect(() => { if (v?.online && v.status.plano !== 'gratis') void loadDevices() }, [v?.online, v?.status.plano, loadDevices])

  const act = async (what: string, f: () => Promise<unknown>) => {
    setBusy(what); setError('')
    try { await f() } catch (e) { setError(errMsg(e)) } finally { setBusy('') }
  }

  if (!v) return <div className="p-8 text-muted">Carregando...</div>
  const s = v.status
  const badge = s.plano === 'pro' ? <Badge tone="ok">Pro</Badge> : s.plano === 'leitura' ? <Badge tone="muted">Pro só leitura</Badge> : <Badge tone="muted">Grátis</Badge>

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-16 py-12">
      <PageHeader title="Seu plano" subtitle="Assinatura, validade e os computadores onde o Pro está ativo." badge={badge} />

      {inBrowser && <p className="rounded-lg border border-line bg-raised px-4 py-3 text-[13.5px] text-muted">No navegador a licença não funciona: abra o app.</p>}
      {!v.ready && !inBrowser && <p className="rounded-lg border border-line bg-raised px-4 py-3 text-[13.5px] text-muted">Esta versão de teste não tem a chave da licença, então nenhuma ativação confere aqui.</p>}

      <Notice v={v} />

      <section className="anim-rise flex flex-col gap-5 rounded-xl border border-line bg-card p-6">
        {s.plano === 'pro' && <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className={label}>Pro {s.ciclo === 'anual' ? 'anual' : 'mensal'}</span>
              <h2 className="font-serif text-[26px] leading-tight">Ativo até {day(s.ate)}</h2>
              <p className="text-[14px] text-muted">{s.email} · {s.dias === 0 ? 'vence hoje' : `faltam ${s.dias} dia${s.dias === 1 ? '' : 's'}`}</p>
            </div>
            {v.online && <Button icon={RefreshCw} disabled={!!busy} onClick={() => void act('renew', renewLicense)}>{busy === 'renew' ? 'Conferindo...' : 'Conferir agora'}</Button>}
          </div>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {v.online
              ? <>A licença renova sozinha quando há internet{v.lastOk ? ` (última conferência: ${seenAgo(v.lastOk)})` : ''}. Sem internet, o Pro continua até a data acima. A data já inclui alguns dias de folga depois do vencimento.</>
              : 'Ativado com uma chave: ela vale até a data acima e não renova sozinha. Para renovar sozinho, entre com o e-mail da assinatura.'}
          </p>
        </>}

        {s.plano === 'leitura' && <>
          <div className="flex flex-col gap-1">
            <span className={label}>Assinatura acabou</span>
            <h2 className="font-serif text-[26px] leading-tight">O Pro venceu em {day(s.ate)}</h2>
            <p className="text-[14px] leading-relaxed text-muted">Nada foi apagado. O que é do Pro fica só para leitura até renovar. Backup e exportação continuam livres.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {v.online && <Button variant="primary" icon={RefreshCw} disabled={!!busy} onClick={() => void act('renew', renewLicense)}>{busy === 'renew' ? 'Conferindo...' : 'Já paguei: conferir'}</Button>}
            <Button variant={v.online ? 'secondary' : 'primary'} icon={CreditCard} onClick={() => void act('checkout', openCheckout)}>Renovar a assinatura</Button>
            <Button variant="ghost" onClick={() => openActivation()}>Entrar com outro e-mail</Button>
          </div>
        </>}

        {s.plano === 'gratis' && <>
          <div className="flex flex-col gap-1">
            <span className={label}>Grátis</span>
            <h2 className="font-serif text-[26px] leading-tight">Você está no Grátis</h2>
            <p className="text-[14px] leading-relaxed text-muted">O Pro custa R$ 29 por mês ou R$ 290 por ano e vale em 2 computadores. Já assina? Entre com o e-mail da assinatura.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Sparkles} onClick={() => openActivation()}>Ativar o Pro</Button>
            <Button icon={CreditCard} onClick={() => void act('checkout', openCheckout)}>Ver planos</Button>
          </div>
        </>}
        {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
      </section>

      {s.plano !== 'gratis' && (
        <section className="anim-rise flex flex-col gap-4 rounded-xl border border-line bg-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Computadores</h2>
            <span className="text-[13px] text-muted">{devices ? `${devices.length} de 2 vagas` : '2 vagas por assinatura'}</span>
          </div>
          {!v.online && <p className="text-[13.5px] text-muted">A lista aparece quando o Pro é ativado pelo e-mail.</p>}
          {v.online && devErr && <p className="text-[13.5px] text-muted">{devErr} <button type="button" className="text-link hover:underline" onClick={() => void loadDevices()}>Tentar de novo</button></p>}
          {v.online && devices && (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  {d.isMe ? <Monitor size={18} className="shrink-0 text-muted" /> : <Laptop size={18} className="shrink-0 text-muted" />}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-medium">{d.nome}{d.isMe && <span className="ml-2 text-[12.5px] font-normal text-link">este computador</span>}</span>
                    <span className="text-[12.5px] text-muted">Usado {seenAgo(d.visto)}</span>
                  </span>
                  {!d.isMe && <span className="ml-auto"><Button variant="ghost" disabled={!!busy} onClick={() => void act(`rel-${d.id}`, async () => setDevices(await releaseDevice(d.id)))}>{busy === `rel-${d.id}` ? 'Liberando...' : 'Liberar vaga'}</Button></span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {!confirmOut
              ? <Button variant="ghost" icon={LogOut} onClick={() => setConfirmOut(true)}>Tirar o Pro deste computador</Button>
              : <>
                <span className="text-[13.5px] text-muted">Libera a vaga deste computador. Seus dados ficam; o Pro fica só para leitura aqui.</span>
                <Button variant="secondary" disabled={!!busy} onClick={() => void act('out', async () => { await logoutLicense(); setConfirmOut(false); setDevices(null) })}>{busy === 'out' ? 'Saindo...' : 'Tirar daqui'}</Button>
                <Button variant="ghost" onClick={() => setConfirmOut(false)}>Cancelar</Button>
              </>}
          </div>
        </section>
      )}

      <section className="anim-rise grid gap-4 md:grid-cols-2">
        <Compare title="Grátis" items={GRATIS} />
        <Compare title="Pro" items={PRO} accent />
      </section>
    </div>
  )
}

function Notice({ v }: { v: LicenseView }) {
  const s = v.status
  let icon = AlertTriangle, title = '', body = ''
  if (v.problem === 'rede' && s.plano === 'pro') {
    icon = WifiOff; title = 'Sem conexão com o site'
    body = `A licença não foi conferida${v.lastOk ? ` desde ${day(v.lastOk)}` : ''}. Tudo continua funcionando até ${day(s.ate)}; ela renova sozinha quando a internet voltar.`
  } else if (v.problem === 'assinatura' && s.plano === 'pro') {
    title = 'O pagamento não passou'
    body = `A assinatura não está em dia. O Pro continua até ${day(s.ate)}; depois fica só para leitura. Confira o cartão ou o Pix no e-mail da cobrança.`
  } else if (v.problem === 'cancelada' && s.plano === 'pro') {
    title = 'A assinatura foi cancelada'
    body = `Nada muda até ${day(s.ate)}: o Pro continua até lá. Depois, o que é do Pro fica só para leitura, e nada é apagado. Para continuar, assine de novo.`
  } else if (v.problem === 'liberada') {
    title = 'A vaga deste computador foi liberada'
    body = 'Alguém liberou esta vaga em outro computador. Para usar o Pro aqui de novo, entre com o e-mail da assinatura.'
  } else return null
  const Icon = icon
  return (
    <div role="status" className="anim-rise flex gap-3 rounded-xl border border-warn/40 bg-warn/10 px-5 py-4">
      <Icon size={18} className="mt-0.5 shrink-0 text-warn" />
      <div className="flex flex-col gap-1">
        <span className="text-[14.5px] font-semibold">{title}</span>
        <span className="text-[13.5px] leading-relaxed text-muted">{body}</span>
        {v.problem === 'liberada' && <span className="mt-1"><Button variant="secondary" onClick={() => openActivation()}>Entrar com o e-mail</Button></span>}
        {v.problem === 'cancelada' && <span className="mt-1"><Button variant="secondary" icon={CreditCard} onClick={() => void openCheckout().catch(() => {})}>Assinar de novo</Button></span>}
      </div>
    </div>
  )
}

function Compare({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-6 ${accent ? 'border-accent/50 bg-accent-soft/40' : 'border-line bg-card'}`}>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map((t) => <li key={t} className="flex gap-2 text-[13.5px] text-muted"><Check size={15} className={`mt-0.5 shrink-0 ${accent ? 'text-link' : 'text-ok'}`} />{t}</li>)}
      </ul>
    </div>
  )
}
