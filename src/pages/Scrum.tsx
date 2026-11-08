import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../components/ui'
import { HowItWorks } from '../components/Guide'
import { call, message, newTask, type Board, type Kr, type Objective, type Project, type Sprint, type Task } from '../data/api'
import { method } from '../data/methods'

// Scrum e OKR (fase 4B-2b). Desenho: a direção A (sprint em cima do quadro) com as barras de
// progresso no estilo da C (barra fina, número embaixo, cor pelo andamento). OKR é um método próprio.

const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())
const parse = (s: string) => new Date(`${s}T12:00:00`)
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
const fmtDay = (s: string) => parse(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5)
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const POINTS = [1, 2, 3, 5, 8, 13, 21]
const CONF = ['', 'baixa', 'média', 'alta']

// ---------- Barra de progresso no estilo da direção C ----------
type Tone = 'ok' | 'warn' | 'bad'
const TONE_BAR: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-[#E0A800]', bad: 'bg-[#B3261E] dark:bg-[#FF6B60]' }
const TONE_PILL: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-[#F6EBC4] text-[#6B5300] dark:bg-[#3A3110] dark:text-[#F5D46B]',
  bad: 'bg-[#B3261E]/12 text-[#B3261E] dark:text-[#FF8A80]',
}
export function Progress({ pct, label, tone, pill }: { pct: number; label: string; tone: Tone; pill?: string }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex h-[7px] overflow-hidden rounded-full bg-line"><span className={`rounded-full ${TONE_BAR[tone]}`} style={{ width: `${p}%` }} /></span>
      <span className="flex items-center gap-2 text-[11.5px] text-muted"><span className="truncate">{label}</span>
        {pill && <span className={`shrink-0 rounded-full px-2 py-px text-[11px] font-semibold ${TONE_PILL[tone]}`}>{pill}</span>}</span>
    </div>
  )
}
// andamento comparado ao tempo que já passou
const paceTone = (pct: number, expected: number): Tone => (pct >= expected - 10 ? 'ok' : pct >= expected - 30 ? 'warn' : 'bad')
const krPct = (k: Kr) => ((k.current - k.startValue) / (k.target - k.startValue)) * 100
const confTone = (c: number): Tone => (c >= 3 ? 'ok' : c === 2 ? 'warn' : 'bad')

// resultados-chave do projeto com código KR1, KR2… (para o painel da tarefa e os selos)
export function useKrs(projectId: number | null) {
  const [list, setList] = useState<(Kr & { code: string })[]>([])
  useEffect(() => {
    if (!projectId) { setList([]); return }
    call<Objective[]>('okr_list', { projectId }).then((os) => setList(os.flatMap((o) => o.krs).map((k, i) => ({ ...k, code: `KR${i + 1}` })))).catch(() => setList([]))
  }, [projectId])
  return list
}

function KrRow({ k, code, linked, onEdit }: { k: Kr; code: string; linked: number; onEdit?: () => void }) {
  const pct = krPct(k)
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_minmax(160px,220px)_auto] items-center gap-3 text-[13px]">
      <span className="font-mono text-[11.5px] text-muted">{code}</span>
      <span className="min-w-0">{k.title}<span className="block text-[11.5px] text-link">{linked} tarefa{linked === 1 ? '' : 's'} ligada{linked === 1 ? '' : 's'}</span></span>
      <Progress pct={pct} tone={confTone(k.confidence)} pill={`confiança ${CONF[k.confidence]}`}
        label={`${num(k.current)} de ${num(k.target)}${k.unit ? ` ${k.unit}` : ''} · ${Math.round(Math.max(0, pct))}%`} />
      {onEdit ? <Button variant="ghost" icon={Pencil} ariaLabel={`Atualizar ${code}`} title="Atualizar número e confiança" onClick={onEdit} /> : <span />}
    </div>
  )
}

// ---------- Sprint (direção A) ----------
function Burndown({ sprint, tasks, doneOf }: { sprint: Sprint; tasks: Task[]; doneOf: (t: Task) => boolean }) {
  const len = Math.max(1, Math.min(30, daysBetween(sprint.startDay, sprint.endDay) + 1))
  const total = tasks.reduce((s, t) => s + (t.points ?? 0), 0)
  const t0 = today()
  const days = [...Array(len).keys()].map((i) => addDays(sprint.startDay, i))
  if (!total) return <span className="text-[12px] text-faint">Dê pontos às tarefas para ver o gráfico.</span>
  return (
    <div aria-label="Quanto falta, dia a dia" className="flex flex-col gap-1">
      <span className="text-[12px] text-muted">Quanto falta, dia a dia</span>
      <div className="flex h-11 items-end gap-[3px]">
        {days.map((d, i) => {
          const past = d <= t0
          const left = total - tasks.filter((t) => doneOf(t) && t.doneAt && t.doneAt.slice(0, 10) <= d).reduce((s, t) => s + (t.points ?? 0), 0)
          const ideal = total * (1 - (i + 1) / len)
          const h = `${Math.max(4, ((past ? left : ideal) / total) * 100)}%`
          return <span key={d} title={`${fmtDay(d)}: ${past ? `${left} pontos faltando` : `ideal ${Math.round(ideal)}`}`}
            className={`w-2.5 rounded-[3px] ${past ? 'bg-accent' : 'border border-dashed border-faint'}`} style={{ height: h }} />
        })}
      </div>
    </div>
  )
}

function CloseSprint({ sprint, open, onClose, onDone }: { sprint: Sprint; open: number; onClose: () => void; onDone: () => void }) {
  const [good, setGood] = useState('')
  const [better, setBetter] = useState('')
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState<'hit' | 'partial' | 'miss'>('hit')
  const [error, setError] = useState<string | null>(null)
  const run = async () => {
    try { await call('sprint_close', { id: sprint.id, day: today(), retro: JSON.stringify({ bom: good, melhorar: better, acao: action }), outcome }); onDone() } catch (e) { setError(message(e)) }
  }
  const area = 'min-h-16 rounded-lg border border-line-strong bg-raised p-3 text-[13.5px] outline-none focus:border-accent'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/45 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-label="Encerrar sprint" className="anim-rise flex w-[560px] max-w-full flex-col gap-4 rounded-2xl border border-line-strong bg-card p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1"><span className="font-mono text-[11px] tracking-[0.16em] text-link">ENCERRAR {sprint.name.toUpperCase()}</span><h2 className="font-serif text-[22px]">Retrospectiva</h2>
            <p className="text-[13px] text-muted">Dez minutos olhando para trás deixam a próxima sprint melhor. O resumo desta sprint fica guardado na aba Resumo. {open ? `${open} tarefa${open === 1 ? '' : 's'} não pronta${open === 1 ? '' : 's'} volta${open === 1 ? '' : 'm'} ao backlog.` : 'Tudo ficou pronto.'}</p></div>
          <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} />
        </header>
        <div role="radiogroup" aria-label="A meta foi atingida?" className="flex flex-col gap-1.5 text-[13px] text-muted">A meta {sprint.goal ? `"${sprint.goal}" ` : ''}foi atingida?
          <div className="flex gap-1.5">
            {([['hit', 'Sim'], ['partial', 'Em parte'], ['miss', 'Não']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={outcome === v} onClick={() => setOutcome(v)}
                className={`h-9 rounded-full px-4 text-[13px] ${outcome === v ? 'bg-fg font-medium text-bg' : 'border border-line-strong text-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[13px] text-muted">O que foi bem<textarea value={good} onChange={(e) => setGood(e.target.value)} className={area} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">O que pode melhorar<textarea value={better} onChange={(e) => setBetter(e.target.value)} className={area} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Uma ação para a próxima sprint<input value={action} onChange={(e) => setAction(e.target.value)} className={field} /></label>
        {error && <p className="text-[13px] text-[#B3261E]" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" icon={Check} onClick={() => void run()}>Encerrar sprint</Button></div>
      </div>
    </div>
  )
}

function NewSprint({ project, count, onDone, onError }: { project: Project; count: number; onDone: () => void; onError: (e: unknown) => void }) {
  const [name, setName] = useState(`Sprint ${count + 1}`)
  const [goal, setGoal] = useState('')
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(addDays(today(), 13))
  const create = () => call('sprint_save', { sprint: { id: null, projectId: project.id, name, goal, startDay: start, endDay: end, closedAt: null, retro: '' } }).then(onDone).catch(onError)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-col gap-1"><span className="font-mono text-[11px] tracking-[0.14em] text-link">NENHUMA SPRINT EM ANDAMENTO</span><h3 className="font-serif text-[20px]">Começar uma sprint</h3>
        <p className="text-[13px] text-muted">Uma sprint é um ciclo curto (em geral duas semanas) com uma meta só. Depois de criar, traga do backlog o que cabe.</p></div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <label className="flex flex-col gap-1 text-[13px] text-muted">Nome<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Meta da sprint (uma frase)<input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex.: cliente consegue marcar horário sozinho" className={field} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Começa<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Termina<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} /></label>
      </div>
      <div><Button variant="primary" icon={ArrowRight} onClick={() => void create()}>Começar {name}</Button></div>
    </div>
  )
}

export function ScrumView({ project, board, okrOn, onOpen, onSave, onError, onRefresh, renderBoard }: {
  project: Project; board: Board; okrOn: boolean; onOpen: (t: Task) => void; onSave: (t: Task) => Promise<void>; onError: (e: unknown) => void; onRefresh: () => Promise<void>
  renderBoard: (tasks: Task[], sprintId: number, badgeOf: (t: Task) => ReactNode) => ReactNode
}) {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [tab, setTab] = useState<'sprint' | 'backlog'>('sprint')
  const [closing, setClosing] = useState(false)
  const [draft, setDraft] = useState('')
  const load = () => Promise.all([
    call<Sprint[]>('sprints_list', { projectId: project.id }).then(setSprints),
    okrOn ? call<Objective[]>('okr_list', { projectId: project.id }).then(setObjectives) : Promise.resolve(setObjectives([])),
  ]).catch(onError)
  useEffect(() => { void load() }, [project.id, okrOn]) // eslint-disable-line react-hooks/exhaustive-deps

  const doneOf = (t: Task) => !!board.columns.find((c) => c.id === t.columnId)?.done
  const active = sprints.find((s) => !s.closedAt) ?? null
  const krs = useMemo(() => objectives.flatMap((o) => o.krs).map((k, i) => ({ ...k, code: `KR${i + 1}` })), [objectives])
  const codeOf = (id: number | null) => krs.find((k) => k.id === id)?.code
  const badgeOf = (t: Task) => (t.points != null || t.krId ? (
    <>
      {t.points != null && <span className="rounded bg-fg px-1.5 py-px font-mono text-[11px] text-bg">{t.points} pts</span>}
      {codeOf(t.krId) && <span className="text-link">move o {codeOf(t.krId)}</span>}
    </>
  ) : null)

  const sprintTasks = active ? board.tasks.filter((t) => t.sprintId === active.id) : []
  const total = sprintTasks.reduce((s, t) => s + (t.points ?? 0), 0)
  const donePts = sprintTasks.filter(doneOf).reduce((s, t) => s + (t.points ?? 0), 0)
  const openCount = sprintTasks.filter((t) => !doneOf(t)).length
  const backlog = board.tasks.filter((t) => t.sprintId == null && !doneOf(t)).sort((a, b) => b.priority - a.priority || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  // velocidade: pontos fechados nas últimas 3 sprints encerradas
  const closed = sprints.filter((s) => s.closedAt).slice(-3)
  const velocity = closed.length ? Math.round(closed.reduce((s, sp) => s + board.tasks.filter((t) => t.sprintId === sp.id && doneOf(t)).reduce((a, t) => a + (t.points ?? 0), 0), 0) / closed.length) : null
  const linked = (id: number | null) => board.tasks.filter((t) => t.krId === id).length

  let strip: ReactNode = null
  if (active) {
    const len = Math.max(1, daysBetween(active.startDay, active.endDay) + 1)
    const elapsed = Math.max(0, Math.min(len, daysBetween(active.startDay, today()) + 1))
    const left = Math.max(0, daysBetween(today(), active.endDay))
    const pct = total ? (donePts / total) * 100 : 0
    const expected = (elapsed / len) * 100
    const tone = paceTone(pct, expected)
    strip = (
      <section aria-label="Sprint atual" className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-2xl border border-line bg-card px-5 py-4">
        <div className="flex min-w-[220px] flex-col gap-0.5">
          <span className="font-mono text-[11px] tracking-[0.14em] text-link uppercase">{active.name} · {fmtDay(active.startDay)} a {fmtDay(active.endDay)}</span>
          <b className="text-[15px]">{active.goal ? `Meta: ${active.goal}` : 'Sem meta escrita'}</b>
          <span className="text-[12.5px] text-muted">{left ? `Faltam ${left} dia${left === 1 ? '' : 's'}` : 'Último dia'}</span>
        </div>
        <div className="w-[260px] max-w-full">
          <Progress pct={pct} tone={tone} pill={tone === 'ok' ? 'no ritmo' : tone === 'warn' ? 'um pouco atrás' : 'atrasada'}
            label={total ? `${donePts} de ${total} pontos · ${Math.round(pct)}%` : 'Sem pontos ainda'} />
        </div>
        <Burndown sprint={active} tasks={sprintTasks} doneOf={doneOf} />
        <span className="flex-1" />
        <Button onClick={() => setClosing(true)}>Encerrar sprint e fazer a retrospectiva</Button>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks id="scrum" title="Scrum" guide={method('scrum')!.guide} />
      <div role="tablist" aria-label="Scrum" className="inline-flex gap-1 self-start rounded-lg border border-line-strong p-1">
        {([['sprint', active ? active.name : 'Sprint'], ['backlog', `Backlog · ${backlog.length}`]] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`h-8 rounded-md px-3 text-[13.5px] ${tab === v ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{l}</button>
        ))}
      </div>

      {tab === 'sprint' && (!active ? <NewSprint project={project} count={sprints.length} onDone={() => void load()} onError={onError} /> : (
        <>
          {strip}
          {okrOn && krs.length > 0 && (
            <section aria-label="Resultados-chave" className="flex flex-col gap-3 rounded-2xl border border-line bg-card px-5 py-4">
              <span className="text-[12px] font-semibold text-muted">Resultados-chave que esta sprint move</span>
              {krs.filter((k) => sprintTasks.some((t) => t.krId === k.id)).map((k) => <KrRow key={k.id} k={k} code={k.code} linked={linked(k.id)} />)}
              {!krs.some((k) => sprintTasks.some((t) => t.krId === k.id)) && <p className="text-[12.5px] text-faint">Nenhuma tarefa desta sprint está ligada a um resultado-chave. Ligue no painel da tarefa.</p>}
              {sprintTasks.some((t) => !t.krId) && <p className="text-[12.5px] text-muted">{sprintTasks.filter((t) => !t.krId).length} tarefa(s) desta sprint não movem nenhum resultado-chave: vale perguntar por que estão aqui.</p>}
            </section>
          )}
          {sprintTasks.length === 0 && (
            <p className="flex items-center gap-2 text-[13.5px] text-muted">A sprint está vazia. <button type="button" onClick={() => setTab('backlog')} className="text-link hover:underline">Trazer itens do backlog</button></p>
          )}
          {renderBoard(sprintTasks, active.id!, badgeOf)}
        </>
      ))}

      {tab === 'backlog' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span>Em ordem de prioridade. Dê pontos pelo tamanho relativo: 1 é trivial, 13 é grande demais (quebre em partes).</span>
            {active && <span className="ml-auto">{active.name}: <b className="text-fg">{total}</b> pontos{velocity != null ? ` · média das últimas sprints: ${velocity}` : ''}</span>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) void onSave({ ...newTask(project.id, null, v) }).then(() => setDraft('')) }}
            className="flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-3 focus-within:border-accent">
            <button type="submit" aria-label="Adicionar ao backlog" className="grid size-8 place-items-center rounded-md text-link hover:bg-accent-soft"><Plus size={16} /></button>
            <label className="flex-1"><span className="sr-only">Novo item do backlog</span><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Novo item do backlog" className="h-full w-full bg-transparent text-[14px] outline-none placeholder:text-faint" /></label>
          </form>
          <ul className="flex flex-col gap-1.5">
            {backlog.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">Backlog vazio.</li>}
            {backlog.map((t) => (
              <li key={t.id} className="kcard flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[13.5px]">
                <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 truncate text-left hover:underline">{t.title}</button>
                {codeOf(t.krId) && <span className="text-[12px] text-link">{codeOf(t.krId)}</span>}
                <label><span className="sr-only">Pontos de {t.title}</span>
                  <select value={t.points ?? ''} onChange={(e) => void onSave({ ...t, points: e.target.value ? +e.target.value : null })} className="h-8 rounded-md border border-line-strong bg-raised px-2 text-[12.5px]">
                    <option value="">— pts</option>{POINTS.map((n) => <option key={n} value={n}>{n} pts</option>)}
                  </select></label>
                {active && <Button onClick={() => void onSave({ ...t, sprintId: active.id })}>Para a sprint</Button>}
              </li>
            ))}
          </ul>
          {!active && <p className="text-[12.5px] text-muted">Nenhuma sprint em andamento. Crie uma na aba ao lado para mover itens para ela.</p>}
        </div>
      )}

      {closing && active && <CloseSprint sprint={active} open={openCount} onClose={() => setClosing(false)} onDone={() => { setClosing(false); void load(); void onRefresh() }} />}
    </div>
  )
}

// ---------- OKR (barras da direção C) ----------
function KrForm({ kr, objectiveId, onDone, onCancel, onDelete }: { kr: Kr | null; objectiveId: number; onDone: () => void; onCancel: () => void; onDelete?: () => void }) {
  const [k, setK] = useState<Kr>(kr ?? { id: null, objectiveId, title: '', startValue: 0, target: 100, current: 0, unit: '', confidence: 2 })
  const [error, setError] = useState<string | null>(null)
  const set = (p: Partial<Kr>) => setK((x) => ({ ...x, ...p }))
  const save = () => call('kr_save', { kr: k }).then(onDone).catch((e) => setError(message(e)))
  const n = (v: string) => Number(v.replace(',', '.')) || 0
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-4 text-[13px]">
      <label className="flex flex-col gap-1 text-muted">Resultado-chave (com número)<input autoFocus value={k.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: 200 horários marcados pelo cliente por semana" className={field} /></label>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="flex flex-col gap-1 text-muted">Ponto de partida<input inputMode="decimal" defaultValue={k.startValue} onChange={(e) => set({ startValue: n(e.target.value) })} className={field} /></label>
        <label className="flex flex-col gap-1 text-muted">Meta<input inputMode="decimal" defaultValue={k.target} onChange={(e) => set({ target: n(e.target.value) })} className={field} /></label>
        <label className="flex flex-col gap-1 text-muted">Hoje<input inputMode="decimal" defaultValue={k.current} onChange={(e) => set({ current: n(e.target.value) })} className={field} /></label>
        <label className="flex flex-col gap-1 text-muted">Unidade<input value={k.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="clientes, %, R$" className={field} /></label>
        <label className="flex flex-col gap-1 text-muted">Confiança<select value={k.confidence} onChange={(e) => set({ confidence: +e.target.value })} className={field}><option value={3}>Alta</option><option value={2}>Média</option><option value={1}>Baixa</option></select></label>
      </div>
      <p className="text-[12px] text-muted">Para algo que deve cair (ex.: faltas de 18% para 8%), ponha a partida maior que a meta. O progresso é calculado do mesmo jeito.</p>
      {error && <p className="text-[13px] text-[#B3261E]" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()}>Salvar</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        {onDelete && <><span className="flex-1" /><Button variant="ghost" icon={Trash2} onClick={onDelete}>Apagar</Button></>}
      </div>
    </div>
  )
}

export function OkrView({ project, board, onError }: { project: Project; board: Board; onOpen: (t: Task) => void; onError: (e: unknown) => void }) {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [editing, setEditing] = useState<string | null>(null) // 'obj:<id>' | 'kr:<id>' | 'newkr:<objId>'
  const [draft, setDraft] = useState('')
  const load = () => call<Objective[]>('okr_list', { projectId: project.id }).then(setObjectives).catch(onError)
  useEffect(() => { void load() }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const addObjective = () => { const v = draft.trim(); if (v) void call('objective_save', { projectId: project.id, id: null, title: v }).then(() => { setDraft(''); return load() }).catch(onError) }
  let i = 0
  return (
    <div className="flex flex-col gap-4">
      <HowItWorks id="okr" title="OKR (objetivos e resultados-chave)" guide={method('okr')!.guide} />
      <p className="rounded-xl bg-raised px-4 py-3 text-[13px] text-muted"><b className="text-fg">Check-in toda segunda:</b> atualize o número de cada resultado-chave e a confiança. Leva cinco minutos.</p>
      {objectives.map((o, oi) => {
        const all = o.krs.length ? o.krs.reduce((s, k) => s + Math.max(0, Math.min(100, krPct(k))), 0) / o.krs.length : 0
        return (
          <article key={o.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card px-5 py-4">
            {editing === `obj:${o.id}` ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('t') ?? '').trim(); if (v) void call('objective_save', { projectId: project.id, id: o.id, title: v }).then(() => { setEditing(null); return load() }).catch(onError) }}>
                <input name="t" autoFocus defaultValue={o.title} className={field} aria-label="Objetivo" /><Button type="submit" variant="primary">Salvar</Button>
                <Button variant="ghost" icon={Trash2} ariaLabel="Apagar objetivo" onClick={() => void call('objective_delete', { id: o.id }).then(load).catch(onError)} />
              </form>
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-link">O{oi + 1}</span>
                <button type="button" onClick={() => setEditing(`obj:${o.id}`)} className="text-left font-serif text-[18px] hover:underline">{o.title}</button>
                <span className="flex-1" />
                <b className={`text-[15px] ${all >= 60 ? 'text-ok' : all >= 30 ? 'text-[#B45309] dark:text-[#F5D46B]' : 'text-[#B3261E] dark:text-[#FF8A80]'}`}>{Math.round(all)}%</b>
              </div>
            )}
            {o.krs.map((k) => {
              i += 1
              const code = `KR${i}`
              return editing === `kr:${k.id}`
                ? <KrForm key={k.id} kr={k} objectiveId={o.id} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void load() }}
                    onDelete={() => void call('kr_delete', { id: k.id }).then(() => { setEditing(null); return load() }).catch(onError)} />
                : <KrRow key={k.id} k={k} code={code} linked={board.tasks.filter((t) => t.krId === k.id).length} onEdit={() => setEditing(`kr:${k.id}`)} />
            })}
            {editing === `newkr:${o.id}`
              ? <KrForm kr={null} objectiveId={o.id} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void load() }} />
              : <button type="button" onClick={() => setEditing(`newkr:${o.id}`)} className="self-start text-[13px] text-link hover:underline">+ Resultado-chave</button>}
          </article>
        )
      })}
      <form onSubmit={(e) => { e.preventDefault(); addObjective() }} className="flex gap-2">
        <label className="flex-1"><span className="sr-only">Novo objetivo</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={objectives.length ? 'Novo objetivo' : 'Primeiro objetivo do trimestre (uma frase que inspira, sem número)'} className={field} /></label>
        <Button type="submit" variant="primary" icon={Plus}>Objetivo</Button>
      </form>
      {objectives.length > 0 && <p className="text-[12.5px] text-muted">Ligue tarefas aos resultados-chave no painel da tarefa ("Move o resultado-chave"). Com o Scrum ligado, a sprint mostra quais resultados-chave ela está movendo.</p>}
    </div>
  )
}
