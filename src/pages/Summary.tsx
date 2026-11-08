import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, FileText, Trash2, X } from 'lucide-react'
import { Button } from '../components/ui'
import { call, message, type Board, type Objective, type Project, type Report, type Sprint, type Task } from '../data/api'
import { Progress } from './Scrum'

// Aba Resumo (fixa em todo projeto). Desenho: direção A, relatório em página.
// Mostra o estado de agora, os resumos da operação que a pessoa gera quando quiser (foto de um período,
// guardada para reler ou copiar) e os resumos das sprints encerradas.

const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())
const parse = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`)
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
const fmtDay = (s: string) => parse(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const day = (s: string | null) => (s ? s.slice(0, 10) : null) // done_at e created_at vêm com hora

// ---------- A foto de um período (o que vai para o JSON) ----------
type Snapshot = {
  v: 1
  totals: { total: number; done: number; open: number; overdue: number }
  delivered: { title: string; at: string }[]
  created: number
  overdue: { title: string; due: string }[]
  upcoming: { title: string; due: string }[]
  milestones: string[]
  focusMin: number
  sprintsClosed: { name: string; planned: number; done: number; outcome: Sprint['outcome'] }[]
  activeSprint: { name: string; goal: string; planned: number; done: number } | null
  krs: { title: string; current: number; target: number; unit: string; pct: number; confidence: number }[]
  gtd: { inbox: number; waiting: number } | null
  columns: { name: string; count: number }[]
}

function snapshot(project: Project, board: Board, sprints: Sprint[], objectives: Objective[], from: string, to: string): Snapshot {
  const isDone = (t: Task) => !!board.columns.find((c) => c.id === t.columnId)?.done
  const inRange = (d: string | null) => !!d && d >= from && d <= to
  const open = board.tasks.filter((t) => !isDone(t))
  const t0 = today()
  const active = sprints.find((s) => !s.closedAt)
  const activeTasks = active ? board.tasks.filter((t) => t.sprintId === active.id) : []
  const rep = (s: Sprint) => { try { return JSON.parse(s.report || '{}') as { planned?: number; done?: number } } catch { return {} } }
  return {
    v: 1,
    totals: { total: board.tasks.length, done: board.tasks.length - open.length, open: open.length, overdue: open.filter((t) => t.due && t.due < t0).length },
    delivered: board.tasks.filter((t) => isDone(t) && inRange(day(t.doneAt))).map((t) => ({ title: t.title, at: day(t.doneAt)! })).sort((a, b) => a.at.localeCompare(b.at)),
    created: board.tasks.filter((t) => inRange(day(t.createdAt))).length,
    overdue: open.filter((t) => t.due && t.due < t0).map((t) => ({ title: t.title, due: t.due! })).sort((a, b) => a.due.localeCompare(b.due)),
    upcoming: open.filter((t) => t.due && t.due >= t0 && t.due <= addDays(t0, 14)).map((t) => ({ title: t.title, due: t.due! })).sort((a, b) => a.due.localeCompare(b.due)),
    milestones: board.tasks.filter((t) => t.milestone && isDone(t) && inRange(day(t.doneAt))).map((t) => t.title),
    focusMin: board.tasks.reduce((s, t) => s + t.spentMin, 0),
    sprintsClosed: sprints.filter((s) => inRange(s.closedAt)).map((s) => ({ name: s.name, planned: rep(s).planned ?? 0, done: rep(s).done ?? 0, outcome: s.outcome })),
    activeSprint: active ? { name: active.name, goal: active.goal, planned: activeTasks.reduce((s, t) => s + (t.points ?? 0), 0), done: activeTasks.filter(isDone).reduce((s, t) => s + (t.points ?? 0), 0) } : null,
    krs: objectives.flatMap((o) => o.krs).map((k) => ({ title: k.title, current: k.current, target: k.target, unit: k.unit, pct: Math.round(((k.current - k.startValue) / (k.target - k.startValue)) * 100), confidence: k.confidence })),
    gtd: project.methods.includes('gtd') ? { inbox: open.filter((t) => t.gtdList === 'inbox').length, waiting: open.filter((t) => t.gtdList === 'waiting').length } : null,
    columns: board.columns.map((c) => ({ name: c.name, count: board.tasks.filter((t) => t.columnId === c.id).length })),
  }
}

const OUTCOME: Record<string, [string, string]> = {
  hit: ['meta atingida', 'bg-ok-bg text-ok'],
  partial: ['em parte', 'bg-[#F6EBC4] text-[#6B5300] dark:bg-[#3A3110] dark:text-[#F5D46B]'],
  miss: ['meta não atingida', 'bg-[#B3261E]/12 text-[#B3261E] dark:text-[#FF8A80]'],
}

// Texto simples para copiar e mandar (WhatsApp, e-mail)
function asText(project: Project, r: Report, s: Snapshot) {
  const L: string[] = [`${project.name} · ${r.title}`, `Período: ${fmtDay(r.periodFrom)} a ${fmtDay(r.periodTo)}`, '']
  L.push(`Andamento: ${s.totals.done} de ${s.totals.total} tarefas feitas (${s.totals.total ? Math.round((s.totals.done / s.totals.total) * 100) : 0}%).`)
  if (s.delivered.length) { L.push('', `Entregue no período (${s.delivered.length}):`); s.delivered.forEach((d) => L.push(`- ${d.title}`)) }
  if (s.milestones.length) L.push('', `Marcos: ${s.milestones.join(', ')}`)
  if (s.activeSprint) L.push('', `${s.activeSprint.name}: ${s.activeSprint.done} de ${s.activeSprint.planned} pontos${s.activeSprint.goal ? ` · meta: ${s.activeSprint.goal}` : ''}`)
  s.sprintsClosed.forEach((x) => L.push(`${x.name} encerrada: ${x.done} de ${x.planned} pontos${x.outcome ? ` (${OUTCOME[x.outcome][0]})` : ''}`))
  if (s.krs.length) { L.push('', 'Resultados-chave:'); s.krs.forEach((k) => L.push(`- ${k.title}: ${k.current} de ${k.target}${k.unit ? ` ${k.unit}` : ''} (${k.pct}%)`)) }
  if (s.overdue.length) { L.push('', 'Atrasadas:'); s.overdue.forEach((o) => L.push(`- ${o.title} (venceu ${fmtDay(o.due)})`)) }
  if (s.upcoming.length) { L.push('', 'Próximos prazos:'); s.upcoming.forEach((o) => L.push(`- ${o.title} (${fmtDay(o.due)})`)) }
  if (r.note.trim()) L.push('', r.note.trim())
  return L.join('\n')
}

function SnapshotBody({ s }: { s: Snapshot }) {
  const pct = s.totals.total ? (s.totals.done / s.totals.total) * 100 : 0
  const list = (title: string, items: string[], tone = '') => items.length > 0 && (
    <div className="flex flex-col gap-1"><b className="text-[12px] text-muted">{title}</b>
      <ul className={`flex flex-col gap-0.5 text-[13px] ${tone}`}>{items.map((x, i) => <li key={i}>· {x}</li>)}</ul></div>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
        <div className="flex flex-col gap-1"><b className="text-[12px] text-muted">Andamento</b><Progress pct={pct} tone="ok" label={`${s.totals.done} de ${s.totals.total} tarefas · ${Math.round(pct)}%`} /></div>
        <div className="flex flex-col gap-0.5 text-[13px]"><b className="text-[12px] text-muted">No período</b><span>{plural(s.delivered.length, 'entrega', 'entregas')} · {plural(s.created, 'tarefa nova', 'tarefas novas')}</span></div>
        <div className="flex flex-col gap-0.5 text-[13px]"><b className="text-[12px] text-muted">Agora</b><span>{plural(s.totals.open, 'aberta', 'abertas')}{s.totals.overdue ? <> · <span className={LATE}>{plural(s.totals.overdue, 'atrasada', 'atrasadas')}</span></> : ''}{s.focusMin ? ` · ${fmtMin(s.focusMin)} de foco` : ''}</span></div>
      </div>
      {(s.activeSprint || s.sprintsClosed.length > 0) && (
        <div className="flex flex-col gap-2">
          <b className="text-[12px] text-muted">Sprints</b>
          {s.activeSprint && <div className="max-w-md"><Progress pct={s.activeSprint.planned ? (s.activeSprint.done / s.activeSprint.planned) * 100 : 0} tone="ok" label={`${s.activeSprint.name} (em andamento) · ${s.activeSprint.done} de ${s.activeSprint.planned} pontos`} /></div>}
          {s.sprintsClosed.map((x) => <span key={x.name} className="text-[13px]">{x.name} encerrada · {x.done} de {x.planned} pontos{x.outcome ? ` · ${OUTCOME[x.outcome][0]}` : ''}</span>)}
        </div>
      )}
      {s.krs.length > 0 && (
        <div className="flex flex-col gap-2"><b className="text-[12px] text-muted">Resultados-chave</b>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">{s.krs.map((k, i) => (
            <div key={i} className="flex flex-col gap-1"><span className="text-[12.5px]">{k.title}</span>
              <Progress pct={k.pct} tone={k.confidence >= 3 ? 'ok' : k.confidence === 2 ? 'warn' : 'bad'} label={`${k.current} de ${k.target}${k.unit ? ` ${k.unit}` : ''} · ${k.pct}%`} /></div>
          ))}</div>
        </div>
      )}
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {list('Entregue no período', s.delivered.map((d) => `${d.title} (${fmtDay(d.at)})`))}
        {list('Marcos alcançados', s.milestones)}
        {list('Atrasadas', s.overdue.map((o) => `${o.title} (venceu ${fmtDay(o.due)})`), LATE)}
        {list('Próximos prazos (14 dias)', s.upcoming.map((o) => `${o.title} (${fmtDay(o.due)})`))}
      </div>
      {s.gtd && <span className="text-[13px] text-muted">GTD: {plural(s.gtd.inbox, 'item', 'itens')} na caixa de entrada · {plural(s.gtd.waiting, 'aguardando', 'aguardando')} outra pessoa</span>}
    </div>
  )
}

// ---------- Gerar um resumo ----------
type PeriodKey = '7' | '30' | 'last' | 'all' | 'custom'
function NewReport({ project, board, sprints, objectives, reports, onDone, onClose }: {
  project: Project; board: Board; sprints: Sprint[]; objectives: Objective[]; reports: Report[]; onDone: () => void; onClose: () => void
}) {
  const t0 = today()
  const first = board.tasks.map((t) => day(t.createdAt)).filter((x): x is string => !!x).sort()[0] ?? t0
  const last = reports[0]?.periodTo
  const [key, setKey] = useState<PeriodKey>(last ? 'last' : '7')
  const [from, setFrom] = useState(addDays(t0, -6))
  const [to, setTo] = useState(t0)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const range: Record<Exclude<PeriodKey, 'custom'>, [string, string, string]> = {
    7: [addDays(t0, -6), t0, 'Últimos 7 dias'],
    30: [addDays(t0, -29), t0, 'Últimos 30 dias'],
    last: [last ? addDays(last, 1) > t0 ? t0 : addDays(last, 1) : first, t0, 'Desde o último resumo'],
    all: [first > t0 ? t0 : first, t0, 'Desde o começo do projeto'],
  }
  const [pf, pt, label] = key === 'custom' ? [from, to, `${fmtDay(from)} a ${fmtDay(to)}`] : range[key]
  const preview = useMemo(() => snapshot(project, board, sprints, objectives, pf, pt), [project, board, sprints, objectives, pf, pt])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const save = () => call('report_save', { report: { id: null, projectId: project.id, createdAt: null, periodFrom: pf, periodTo: pt, title: `Resumo · ${label}`, data: JSON.stringify(preview), note } }).then(onDone).catch((e) => setError(message(e)))
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/45 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-label="Gerar resumo da operação" className="anim-rise flex max-h-[90vh] w-[860px] max-w-full flex-col rounded-2xl border border-line-strong bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-line px-6 py-5">
          <div className="flex flex-1 flex-col gap-1"><span className="font-mono text-[11px] tracking-[0.16em] text-link">RESUMO DA OPERAÇÃO</span><h2 className="font-serif text-[22px]">O que aconteceu em {project.name}</h2>
            <p className="text-[13px] text-muted">Escolha o período. O resumo fica guardado como uma foto deste momento: dá para reler depois ou copiar e mandar.</p></div>
          <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} />
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-end gap-2">
            {([['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ...(last ? [['last', 'Desde o último resumo']] as const : []), ['all', 'Desde o começo'], ['custom', 'Escolher datas']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k as PeriodKey)}
                className={`h-9 rounded-full px-3.5 text-[13px] ${key === k ? 'bg-fg font-medium text-bg' : 'border border-line-strong text-muted hover:text-fg'}`}>{l}</button>
            ))}
            {key === 'custom' && (
              <span className="flex gap-2">
                <label className="text-[12px] text-muted">De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} h-9`} /></label>
                <label className="text-[12px] text-muted">Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} h-9`} /></label>
              </span>
            )}
          </div>
          <div className="rounded-xl border border-line bg-panel p-4"><span className="mb-3 block text-[12px] text-faint">Prévia · {fmtDay(pf)} a {fmtDay(pt)}</span><SnapshotBody s={preview} /></div>
          <label className="flex flex-col gap-1 text-[13px] text-muted">Comentário (opcional)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ex.: semana travada esperando aprovação do cliente" className="rounded-lg border border-line-strong bg-raised p-3 text-[13.5px] outline-none focus:border-accent" /></label>
          {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-3.5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Check} onClick={() => void save()}>Guardar resumo</Button>
        </footer>
      </div>
    </div>
  )
}

function ReportCard({ project, r, open, onToggle, onDelete }: { project: Project; r: Report; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  let s: Snapshot | null = null
  try { s = JSON.parse(r.data) } catch { s = null }
  const copy = () => { if (s) void navigator.clipboard.writeText(asText(project, r, s)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }) }
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-2 text-left"><FileText size={15} className="text-link" /><b className="text-[15px]">{r.title}</b></button>
        <span className="text-[12.5px] text-muted">{fmtDay(r.periodFrom)} a {fmtDay(r.periodTo)} · gerado em {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
        <span className="flex-1" />
        <Button variant="ghost" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copiado' : 'Copiar como texto'}</Button>
        <Button variant="ghost" icon={Trash2} ariaLabel="Apagar resumo" onClick={onDelete} />
        <Button variant="ghost" icon={ChevronDown} ariaLabel={open ? 'Recolher' : 'Ver completo'} onClick={onToggle} />
      </div>
      {open && (s ? <SnapshotBody s={s} /> : <p className="text-[13px] text-muted">Não deu para ler este resumo.</p>)}
      {open && r.note.trim() && <p className="rounded-lg bg-raised px-3 py-2 text-[13px]">{r.note}</p>}
    </article>
  )
}

function SprintReport({ s, open, onToggle }: { s: Sprint; open: boolean; onToggle: () => void }) {
  let rep: { planned?: number; done?: number; delivered?: string[]; returned?: string[]; krs?: string[] } = {}
  let retro: { bom?: string; melhorar?: string; acao?: string } = {}
  try { rep = JSON.parse(s.report || '{}') } catch { /* sprint antiga, sem relatório */ }
  try { retro = JSON.parse(s.retro || '{}') } catch { /* idem */ }
  const planned = rep.planned ?? 0, done = rep.done ?? 0
  const out = s.outcome ? OUTCOME[s.outcome] : null
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b className="text-[15px]">{s.name} · {fmtDay(s.startDay)} a {fmtDay(s.endDay)}</b>
        {out && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${out[1]}`}>{out[0]}</span>}
        {!open && <span className="text-[12.5px] text-muted">{done} de {planned} pontos</span>}
        <span className="flex-1" />
        <button type="button" onClick={onToggle} aria-expanded={open} className="text-[12.5px] text-link hover:underline">{open ? 'Recolher' : 'Ver completo'}</button>
      </div>
      {open && (
        <>
          {s.goal && <span className="text-[13.5px] text-muted">Meta: {s.goal}</span>}
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-[220px_1fr_1fr]">
            <div className="flex flex-col gap-2">
              <Progress pct={planned ? (done / planned) * 100 : 0} tone={s.outcome === 'miss' ? 'bad' : s.outcome === 'partial' ? 'warn' : 'ok'} label={`${done} de ${planned} pontos · ${planned ? Math.round((done / planned) * 100) : 0}%`} />
              <span className="text-[12.5px]">{plural(rep.delivered?.length ?? 0, 'entrega', 'entregas')} · {rep.returned?.length ?? 0} voltou ao backlog</span>
              {rep.krs && rep.krs.length > 0 && <span className="text-[12.5px] text-link">Moveu: {rep.krs.join(', ')}</span>}
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              {retro.bom && <><b className="text-[12px] text-muted">Foi bem</b><span>{retro.bom}</span></>}
              {retro.melhorar && <><b className="mt-1 text-[12px] text-muted">Melhorar</b><span>{retro.melhorar}</span></>}
              {retro.acao && <><b className="mt-1 text-[12px] text-muted">Ação para a próxima</b><span>{retro.acao}</span></>}
              {!retro.bom && !retro.melhorar && !retro.acao && <span className="text-faint">Sem retrospectiva escrita.</span>}
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              {rep.delivered && rep.delivered.length > 0 && <><b className="text-[12px] text-muted">Entregas</b>{rep.delivered.map((d, i) => <span key={i}>· {d}</span>)}</>}
              {rep.returned && rep.returned.length > 0 && <><b className="mt-1 text-[12px] text-muted">Voltou ao backlog</b>{rep.returned.map((d, i) => <span key={i} className="text-muted">· {d}</span>)}</>}
            </div>
          </div>
        </>
      )}
    </article>
  )
}

// ---------- Página ----------
export function SummaryView({ project, board, onError }: { project: Project; board: Board; onError: (e: unknown) => void }) {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const load = () => Promise.all([
    call<Sprint[]>('sprints_list', { projectId: project.id }).then(setSprints),
    call<Objective[]>('okr_list', { projectId: project.id }).then(setObjectives),
    call<Report[]>('reports_list', { projectId: project.id }).then(setReports),
  ]).catch(onError)
  useEffect(() => { void load() }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = useMemo(() => snapshot(project, board, sprints, objectives, today(), today()), [project, board, sprints, objectives])
  const t = now.totals
  const pct = t.total ? (t.done / t.total) * 100 : 0
  const soon = now.upcoming.filter((u) => u.due <= addDays(today(), 7)).length
  const closed = sprints.filter((s) => s.closedAt).reverse()
  const a = now.activeSprint
  const parts = [`${t.done} de ${t.total} tarefas feitas.`]
  if (a) parts.push(`A ${a.name} está com ${a.done} de ${a.planned} pontos.`)
  if (t.overdue) parts.push(`${plural(t.overdue, 'tarefa está atrasada', 'tarefas estão atrasadas')}.`)
  else if (soon) parts.push(`${plural(soon, 'prazo vence', 'prazos vencem')} nos próximos 7 dias.`)
  else if (t.total) parts.push('Nada atrasado.')

  if (!t.total && !sprints.length) return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card px-6 py-14 text-center">
      <h2 className="font-serif text-[22px]">Ainda não há o que resumir.</h2>
      <p className="max-w-md text-[14px] text-muted">Quando o projeto tiver tarefas, esta aba mostra o andamento, os prazos e os resumos que você gerar.</p>
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <section className="flex flex-col gap-3">
        <span className="font-mono text-[11px] tracking-[0.16em] text-link">RESUMO · AGORA</span>
        <h2 className="font-serif text-[28px] leading-snug">{parts.join(' ')}</h2>
        <div className="max-w-md"><Progress pct={pct} tone={t.overdue ? 'warn' : 'ok'} label={`${t.done} de ${t.total} tarefas · ${Math.round(pct)}%${now.focusMin ? ` · ${fmtMin(now.focusMin)} de foco registradas` : ''}`} /></div>
        <div><Button variant="primary" icon={FileText} onClick={() => setCreating(true)}>Gerar resumo da operação</Button></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
          <b className="text-[13.5px]">Prazos</b>
          {now.overdue.map((o) => <span key={o.title + o.due} className={`flex text-[13px] ${LATE}`}><span className="flex-1 truncate">{o.title}</span>venceu {fmtDay(o.due)}</span>)}
          {now.upcoming.slice(0, 6).map((o) => <span key={o.title + o.due} className="flex text-[13px]"><span className="flex-1 truncate">{o.title}</span><span className="text-muted">{fmtDay(o.due)}</span></span>)}
          {!now.overdue.length && !now.upcoming.length && <span className="text-[13px] text-faint">Nenhum prazo nos próximos 14 dias.</span>}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
          {now.krs.length ? (
            <><b className="text-[13.5px]">Resultados-chave</b>
              {now.krs.slice(0, 4).map((k, i) => <div key={i} className="flex flex-col gap-1"><span className="text-[12.5px]">{k.title}</span><Progress pct={k.pct} tone={k.confidence >= 3 ? 'ok' : k.confidence === 2 ? 'warn' : 'bad'} label={`${k.current} de ${k.target}${k.unit ? ` ${k.unit}` : ''} · ${k.pct}%`} /></div>)}</>
          ) : (
            <><b className="text-[13.5px]">Onde estão as tarefas</b>
              {now.columns.map((c) => <span key={c.name} className="flex text-[13px]"><span className="flex-1">{c.name}</span><span className="text-muted">{c.count}</span></span>)}</>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2"><h3 className="font-serif text-[20px]">Resumos da operação</h3><span className="text-[12.5px] text-muted">gerados por você, guardados para reler ou mandar</span></div>
        {reports.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">Nenhum resumo ainda. Use "Gerar resumo da operação" no fim de uma semana, de um mês ou antes de falar com o cliente.</p>}
        {reports.map((r, i) => (
          <ReportCard key={r.id} project={project} r={r} open={open === `r${r.id}` || (open == null && i === 0)} onToggle={() => setOpen(open === `r${r.id}` || (open == null && i === 0) ? '' : `r${r.id}`)}
            onDelete={() => void call('report_delete', { id: r.id }).then(load).catch(onError)} />
        ))}
      </section>

      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2"><h3 className="font-serif text-[20px]">Sprints encerradas</h3><span className="text-[12.5px] text-muted">resumo gerado ao encerrar, guardado</span></div>
          {closed.map((s, i) => <SprintReport key={s.id} s={s} open={open === `s${s.id}` || (open == null && i === 0 && reports.length === 0)} onToggle={() => setOpen(open === `s${s.id}` ? '' : `s${s.id}`)} />)}
        </section>
      )}

      {creating && <NewReport project={project} board={board} sprints={sprints} objectives={objectives} reports={reports} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setOpen(null); void load() }} />}
    </div>
  )
}
