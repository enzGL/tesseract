import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Check, FolderDown, ShieldCheck } from 'lucide-react'
import { Button } from './ui'
import { call, message } from '../data/api'
import { DEFAULT_PREFS, folderDialog, todayIso, type ExportReport, type Prefs, type PrefsState } from '../data/extras'
import { notify } from '../app/reminders'
import { pro } from '@pro'

// Cartões da fase 8.5 em Configurações: notificações do Windows, IA externa (limite e endereços) e exportar tudo.
// Mesmo visual dos cartões de Configurações (título e explicação à esquerda, controles à direita).

function Card({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="anim-rise grid gap-6 rounded-xl border border-line bg-card p-6 md:grid-cols-[260px_minmax(0,1fr)]">
      <div><h2 className="text-[17px] font-semibold">{title}</h2><p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{desc}</p></div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const Check2 = ({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) => (
  <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-[var(--t-accent)]" />
    <span className="flex flex-col">{label}{sub && <span className="text-[12.5px] text-muted">{sub}</span>}</span></label>
)

export function ExtrasSettings() {
  const [st, setSt] = useState<PrefsState | null>(null)
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS)
  const [hosts, setHosts] = useState('')
  const [limit, setLimit] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [msgAi, setMsgAi] = useState<{ ok: boolean; text: string } | null>(null)
  const load = () => call<PrefsState>('extras_prefs').then((s) => { setSt(s); setP(s.prefs); setHosts(s.prefs.aiAllowHosts.join('\n')); setLimit(s.prefs.aiMonthlyLimit == null ? '' : String(s.prefs.aiMonthlyLimit)) }).catch((e) => setMsg({ ok: false, text: message(e) }))
  useEffect(() => { void load() }, [])
  const save = async (next: Prefs) => {
    setMsg(null)
    try { const saved = await call<Prefs>('extras_prefs_set', { prefs: next }); setP(saved); setHosts(saved.aiAllowHosts.join('\n')); return true } catch (e) { setMsg({ ok: false, text: message(e) }); return false }
  }
  const toggle = (k: keyof Prefs, v: boolean) => { const next = { ...p, [k]: v }; setP(next); void save(next) }
  const saveAi = async () => {
    const n = limit.trim() === '' ? null : Number(limit)
    setMsgAi(null)
    if (n != null && !(Number.isInteger(n) && n >= 0)) return setMsgAi({ ok: false, text: 'O limite precisa ser um número inteiro (ou vazio para sem limite).' })
    try {
      const saved = await call<Prefs>('extras_prefs_set', { prefs: { ...p, aiMonthlyLimit: n, aiAllowHosts: hosts.split(/[\n,]/).map((h) => h.trim()).filter(Boolean) } })
      setP(saved); setHosts(saved.aiAllowHosts.join('\n')); setMsgAi({ ok: true, text: 'IA externa salva.' })
    } catch (e) { setMsgAi({ ok: false, text: message(e) }) }
  }
  return (
    <>
      <Card title="Notificações" desc="Avisos do Windows enquanto o Tesseract está aberto, mesmo minimizado. Cada aviso sai uma vez só.">
        <Check2 checked={p.notify} onChange={(v) => toggle('notify', v)} label="Mostrar notificações" />
        <div className={`flex flex-col gap-3 pl-6 ${p.notify ? '' : 'pointer-events-none opacity-50'}`}>
          <Check2 checked={p.notifyFollowups} onChange={(v) => toggle('notifyFollowups', v)} label="Follow-ups do CRM" sub="Na hora marcada; de manhã, os do dia e os atrasados." />
          <Check2 checked={p.notifyBlocks} onChange={(v) => toggle('notifyBlocks', v)} label="Blocos de horário" sub="10 minutos antes de começar." />
          <Check2 checked={p.notifyTasks} onChange={(v) => toggle('notifyTasks', v)} label="Tarefas que vencem hoje" sub="Um resumo de manhã." />
          <Check2 checked={p.notifyMoney} onChange={(v) => toggle('notifyMoney', v)} label="Contas do dia" sub="O que vence hoje para pagar e receber." />
        </div>
        <div className="flex flex-wrap items-center gap-3"><Button icon={Bell} onClick={() => void notify('Tesseract', 'As notificações estão funcionando.').then((ok) => setMsg(ok ? { ok: true, text: 'Notificação enviada. Se não apareceu, confira as notificações do Windows para o Tesseract.' } : { ok: false, text: 'O Windows não deixou mostrar a notificação. Libere em Configurações do Windows > Notificações.' }))}>Testar notificação</Button>
          {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-[13px] ${msg.ok ? 'text-ok' : LATE}`}>{msg.text}</span>}</div>
      </Card>

      {pro.built && <Card title="IA externa" desc="Trava para chamadas a provedores fora do seu computador (chat e bots). A IA local (Ollama) não conta.">
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">Limite de chamadas por mês (vazio = sem limite)
          <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" placeholder="ex.: 300" className={`${field} max-w-[200px]`} /></label>
        {st && <span className="text-[13px] text-muted">Usadas em {st.aiMonth}: <b className="text-fg">{st.aiUsed}</b>{p.aiMonthlyLimit != null ? ` de ${p.aiMonthlyLimit}` : ''}.</span>}
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">Endereços permitidos, um por linha (vazio = qualquer endereço HTTPS). Use *.exemplo.com para incluir subdomínios.
          <textarea value={hosts} onChange={(e) => setHosts(e.target.value)} rows={3} placeholder={'api.groq.com\nopenrouter.ai'} className="rounded-lg border border-line-strong bg-raised p-3 font-mono text-[13px] outline-none focus:border-accent" /></label>
        <div className="flex flex-wrap items-center gap-3"><Button variant="primary" icon={ShieldCheck} onClick={() => void saveAi()}>Salvar IA externa</Button>
          {msgAi && <span role={msgAi.ok ? 'status' : 'alert'} className={`text-[13px] ${msgAi.ok ? 'text-ok' : LATE}`}>{msgAi.text}</span>}</div>
      </Card>}

      <CaptureCard prefs={p} onSave={save} />
      <ExportAll />
    </>
  )
}

function CaptureCard({ prefs, onSave }: { prefs: Prefs; onSave: (p: Prefs) => Promise<boolean> }) {
  const [projects, setProjects] = useState<{ id: number; name: string; archived: boolean; methods: string[] }[]>([])
  useEffect(() => { call<typeof projects>('projects_list').then(setProjects).catch(() => {}) }, [])
  const open = projects.filter((p) => !p.archived)
  const auto = open.find((p) => p.methods.includes('gtd')) ?? open[0]
  return (
    <Card title="Captura rápida" desc="Aperte Ctrl+Shift+Espaço em qualquer programa do Windows: abre uma janelinha para anotar sem sair do que está fazendo.">
      <p className="text-[13.5px] text-muted">Escreva a frase do jeito que vier. O app entende a data ("amanhã", "sexta", "15/11"), a hora ("15h"), #etiquetas e o nome de um cliente do CRM. Com cliente, vira follow-up; com data, tarefa; sem nada, vai para a caixa de entrada.</p>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Caixa de entrada vai para o projeto
        <select value={prefs.captureProject ?? ''} onChange={(e) => void onSave({ ...prefs, captureProject: e.target.value ? +e.target.value : null })} className={`${field} max-w-[340px]`}>
          <option value="">Automático{auto ? ` (${auto.name})` : ''}</option>{open.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      <div><Button onClick={() => void call('extras_capture_open')}>Abrir a captura agora</Button></div>
    </Card>
  )
}

function ExportAll() {
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<ExportReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const run = async () => {
    setErr(null); setR(null)
    const dir = await folderDialog('Escolha onde salvar a exportação')
    if (!dir) return
    setBusy(true)
    try { setR(await call<ExportReport>('extras_export_all', { dir, day: todayIso() })) } catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }
  return (
    <Card title="Exportar tudo" desc="Seus dados são seus: uma cópia completa em formatos abertos, para guardar, abrir no Excel ou levar para outra ferramenta.">
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-muted">
        <li><b className="text-fg">tesseract.json</b>: todos os dados, tabela por tabela.</li>
        <li><b className="text-fg">csv/</b>: uma planilha por tabela (projetos, tarefas, finanças, CRM, documentos…).</li>
        <li><b className="text-fg">markdown/</b>: um arquivo por projeto, com as tarefas por coluna.</li>
      </ul>
      <p className="text-[12.5px] text-faint">Não vão: o índice de busca (é refeito das suas notas) e as chaves de IA (ficam no Cofre do Windows). As notas do Conhecimento já são Markdown na pasta delas.</p>
      <div><Button variant="primary" icon={FolderDown} onClick={() => void run()} disabled={busy}>{busy ? 'Exportando…' : 'Exportar para uma pasta'}</Button></div>
      {r && <p role="status" className="flex items-start gap-2 text-[13.5px] text-ok"><Check size={15} className="mt-0.5 shrink-0" /><span>Pronto: {r.rows} registro(s) de {r.tables} tabela(s) e {r.projects} projeto(s) em <span className="break-all font-mono text-[12.5px]">{r.folder}</span></span></p>}
      {err && <p role="alert" className={`text-[13.5px] ${LATE}`}>{err}</p>}
    </Card>
  )
}

/** Botão do Calendário: salva um arquivo .ics com blocos, prazos, follow-ups e contas, para importar em outra agenda. */
export function IcsButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async () => {
    setMsg(null)
    const { saveDialog } = await import('../data/extras')
    const path = await saveDialog('Salvar agenda', `tesseract-agenda-${todayIso()}.ics`, 'ics', 'Agenda (.ics)')
    if (!path) return
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
    try { const n = await call<number>('extras_ics_save', { path, stamp }); setMsg({ ok: true, text: `${n} evento(s) salvos. Importe o arquivo no Google Agenda, Outlook ou celular.` }) } catch (e) { setMsg({ ok: false, text: message(e) }) }
  }
  return (
    <span className="relative inline-flex">
      <Button variant="ghost" onClick={() => void run()} title="Arquivo .ics com blocos, prazos, follow-ups e contas, para abrir em outra agenda">Exportar .ics</Button>
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={`absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-line-strong bg-card px-3 py-2 text-[12.5px] shadow-xl ${msg.ok ? 'text-ok' : LATE}`} onClick={() => setMsg(null)}>{msg.text}</span>}
    </span>
  )
}
