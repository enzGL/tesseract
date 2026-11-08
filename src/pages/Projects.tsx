import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Calendar, Check, CheckSquare, ChevronDown, Clock, FileText, Flag, FolderKanban,
  HelpCircle, Pause, Play, Plus, RotateCcw, Save, Search, Settings2, Square, Trash2, X,
} from 'lucide-react'
import { Button, EmptyState } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { GuideBlock, HowItWorks } from '../components/Guide'
import { GtdView } from './Gtd'
import { OkrView, ScrumView, useKrs } from './Scrum'
import { SummaryView } from './Summary'
import { ShapeUpView, useCycleScopes } from './ShapeUp'
import { PriorityView } from './Priority'
import { GanttView } from './Gantt'
import { ParaView } from './Para'
import { call, message, newTask, PRIORITIES, useScopes, type Board, type Column, type FocusRule, type GtdList, type Hit, type MethodId, type MethodSetup, type ParaKind, type Project, type Task, type UserTemplate } from '../data/api'
import { FOCUS_RULES, METHODS, TEMPLATES, WEEKDAYS, method, methodName, nextReview, type Guide, type Template } from '../data/methods'

const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
// Prioridade: no escuro o cobalto e o vermelho escuros somem; ganham versões claras.
const PRI_COLOR = ['', 'bg-[#8A93B4]', 'bg-[#2238C4] dark:bg-[#7D90FF]', 'bg-[#C2410C] dark:bg-[#FB923C]', 'bg-[#B3261E] dark:bg-[#FF6B60]']
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const SWATCHES = [null, '#8A93B4', '#E0A800', '#1D6B45', '#2238C4', '#C2410C', '#B3261E', '#7C3AED', '#0E7490']
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDue = (d: string) => { const x = new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

// Cor de uma coluna: a escolhida, senão cinza (concluída: verde). Pílula e ponto pegam a cor por --c (styles.css).
const colColor = (c: Column) => c.color ?? (c.done ? '#1D6B45' : '#8A93B4')
const cssColor = (color: string) => ({ '--c': color }) as CSSProperties
const isDone = (board: Board, t: Task) => !!board.columns.find((c) => c.id === t.columnId)?.done
const byUrgency = (a: Task, b: Task) => b.priority - a.priority || (a.due ?? '9999').localeCompare(b.due ?? '9999')

// ---------- Cartão da tarefa ----------
function Card({ t, done, selected, onOpen, overlay, badge }: { t: Task; done: boolean; selected?: boolean; onOpen?: () => void; overlay?: boolean; badge?: React.ReactNode }) {
  const late = !done && t.due && t.due < today()
  const checks = t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : null
  return (
    <div onClick={onOpen} role="button" tabIndex={-1} aria-current={selected || undefined}
      className={`group rounded-lg border px-3 py-2.5 text-left text-[13.5px] transition-shadow ${done ? 'kcard-done' : 'kcard'} ${selected ? '!border-accent shadow-[0_0_0_1px_var(--t-accent),0_6px_18px_-8px_var(--t-accent)]' : ''} ${overlay ? 'rotate-1 shadow-xl' : selected ? '' : 'hover:!border-line-strong dark:hover:!border-[#3A4A8A]'}`}>
      <div className="flex items-start gap-2">
        {done
          ? <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          : t.priority > 0 && <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PRI_COLOR[t.priority]}`} title={`Prioridade ${PRIORITIES[t.priority].toLowerCase()}`} />}
        <span className={`min-w-0 flex-1 leading-snug ${done ? 'text-muted' : selected ? 'font-medium' : ''}`}>{t.title}</span>
      </div>
      {!done && (t.due || checks || t.labels.length > 0 || t.notePath) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          {t.due && <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${late ? `bg-[#B3261E]/10 ${LATE}` : 'kchip'}`}><Calendar size={11} />{fmtDue(t.due)}</span>}
          {checks && <span className="kchip inline-flex items-center gap-1 rounded px-1.5 py-0.5"><CheckSquare size={11} />{checks}</span>}
          {t.notePath && <span className="kchip inline-flex items-center gap-1 rounded px-1.5 py-0.5" title={t.notePath}><FileText size={11} />nota</span>}
          {t.labels.map((l) => <span key={l} className="rounded bg-accent-soft px-1.5 py-0.5 text-link">{l}</span>)}
        </div>
      )}
      {badge && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">{badge}</div>}
    </div>
  )
}

function SortableCard({ t, done, selected, onOpen, badge }: { t: Task; done: boolean; selected: boolean; onOpen: () => void; badge?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id! })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} aria-label={t.title}><Card t={t} done={done} selected={selected} onOpen={onOpen} badge={badge} /></div>
}

function Pill({ color, children, over }: { color: string; children: React.ReactNode; over?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${over ? `bg-[#B3261E]/15 ${LATE}` : 'col-pill'}`} style={over ? undefined : cssColor(color)}>
      {children}
    </span>
  )
}

// ---------- Coluna: pílula colorida no topo, cards soltos embaixo ----------
function ColumnView({ col, tasks, selectedId, onOpen, onAdd, badgeOf }: { col: Column; tasks: Task[]; selectedId: number | null; onOpen: (t: Task) => void; onAdd: (title: string) => void; badgeOf?: (t: Task) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.id}` })
  const [draft, setDraft] = useState('')
  const over = col.wip != null && !col.done && tasks.length > col.wip
  return (
    <section className="flex w-[248px] shrink-0 flex-col gap-2" aria-label={col.name}>
      <header className="flex items-center gap-2 pb-1" title={col.wip ? `Limite de ${col.wip} em andamento` : undefined}>
        <Pill color={colColor(col)} over={over}>
          {col.done && <Check size={12} aria-hidden="true" />}
          <span className="truncate">{col.name}</span>
          <span className="font-normal opacity-80">· {tasks.length}{col.wip ? `/${col.wip}` : ''}</span>
        </Pill>
        {col.done && <span className="sr-only">(tarefas aqui contam como concluídas)</span>}
      </header>
      {over && <p className={`rounded-md bg-[#B3261E]/10 px-2 py-1 text-[12px] ${LATE}`}>Acima do limite. Termine algo antes de puxar mais.</p>}
      <SortableContext items={tasks.map((t) => t.id!)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`-mx-1 flex min-h-20 flex-col gap-2 rounded-lg p-1 transition-colors ${isOver ? 'bg-accent-soft/60' : ''}`}>
          {tasks.map((t) => <SortableCard key={t.id} t={t} done={col.done} selected={t.id === selectedId} onOpen={() => onOpen(t)} badge={badgeOf?.(t)} />)}
        </div>
      </SortableContext>
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAdd(draft.trim()); setDraft('') } }}>
        <div className="flex items-center gap-1 rounded-lg px-1 text-muted focus-within:bg-card">
          {/* o + envia; vazio, ele só põe o cursor no campo */}
          <button type="submit" aria-label={`Criar tarefa em ${col.name}`} title="Criar tarefa"
            onClick={(e) => { if (!draft.trim()) { e.preventDefault(); (e.currentTarget.nextElementSibling?.querySelector('input') as HTMLInputElement | null)?.focus() } }}
            className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-raised hover:text-link"><Plus size={14} /></button>
          <label className="flex-1"><span className="sr-only">Nova tarefa em {col.name}</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nova tarefa" className="h-9 w-full bg-transparent text-[13.5px] text-fg outline-none placeholder:text-faint" /></label>
        </div>
      </form>
    </section>
  )
}

// ---------- Quadro com arrastar e soltar ----------
function BoardView({ board, selectedId, onOpen, onAdd, onMove, badgeOf }: { board: Board; selectedId: number | null; onOpen: (t: Task) => void; onAdd: (col: Column, title: string) => void; onMove: (id: number, colId: number, ord: number) => void; badgeOf?: (t: Task) => React.ReactNode }) {
  const byId = useMemo(() => new Map(board.tasks.map((t) => [t.id!, t])), [board.tasks])
  const build = () => Object.fromEntries(board.columns.map((c) => [`col-${c.id}`, board.tasks.filter((t) => t.columnId === c.id).map((t) => t.id!)]))
  const [items, setItems] = useState<Record<string, number[]>>(build)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => { setItems(build()) }, [board]) // eslint-disable-line react-hooks/exhaustive-deps
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const containerOf = (id: string | number) => (typeof id === 'string' && id.startsWith('col-') ? id : Object.keys(items).find((k) => items[k].includes(id as number)))

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over) return
    const from = containerOf(a.id), to = containerOf(over.id)
    if (!from || !to || from === to) return
    setItems((cur) => {
      const target = cur[to]
      const idx = typeof over.id === 'number' ? target.indexOf(over.id) : target.length
      return { ...cur, [from]: cur[from].filter((x) => x !== a.id), [to]: [...target.slice(0, idx < 0 ? target.length : idx), a.id as number, ...target.slice(idx < 0 ? target.length : idx)] }
    })
  }
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null)
    const id = a.id as number
    const to = over ? containerOf(over.id) : undefined
    if (!to) { setItems(build()); return }
    let list = items[to]
    if (typeof over!.id === 'number' && over!.id !== id) {
      const from = list.indexOf(id), dest = list.indexOf(over!.id)
      if (from >= 0 && dest >= 0) list = arrayMove(list, from, dest)
    }
    setItems((cur) => ({ ...cur, [to]: list }))
    const i = list.indexOf(id)
    const prev = i > 0 ? byId.get(list[i - 1])?.ord : undefined
    const next = i < list.length - 1 ? byId.get(list[i + 1])?.ord : undefined
    const ord = prev != null && next != null ? (prev + next) / 2 : prev != null ? prev + 1 : next != null ? next - 1 : 1
    const colId = Number(to.slice(4))
    const t = byId.get(id)!
    if (t.columnId !== colId || t.ord !== ord) onMove(id, colId, ord)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: a }: DragStartEvent) => setActive(a.id as number)} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); setItems(build()) }}>
      <div className="flex min-h-[420px] shrink-0 items-start gap-4 overflow-x-auto pb-4">
        {board.columns.map((c) => (
          <ColumnView key={c.id} col={c} tasks={(items[`col-${c.id}`] ?? []).map((id) => byId.get(id)!).filter(Boolean)} selectedId={selectedId} onOpen={onOpen} onAdd={(title) => onAdd(c, title)} badgeOf={badgeOf} />
        ))}
      </div>
      <DragOverlay>{active != null && byId.get(active) ? <div className="w-[240px]"><Card t={byId.get(active)!} done={false} overlay /></div> : null}</DragOverlay>
    </DndContext>
  )
}

// ---------- Lista ----------
type SortKey = 'title' | 'column' | 'priority' | 'due'
function ListView({ board, onOpen }: { board: Board; onOpen: (t: Task) => void }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const colName = (id: number | null) => board.columns.find((c) => c.id === id)?.name ?? ''
  const colOrd = (id: number | null) => board.columns.findIndex((c) => c.id === id)
  const rows = board.tasks
    .filter((t) => `${t.title} ${t.labels.join(' ')} ${t.notes}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const v = { title: a.title.localeCompare(b.title), column: colOrd(a.columnId) - colOrd(b.columnId), priority: b.priority - a.priority, due: (a.due ?? '9999').localeCompare(b.due ?? '9999') }[sort.key]
      return v * sort.dir
    })
  const head = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))} className="inline-flex items-center gap-1 hover:text-fg">
      {label}{sort.key === key && (sort.dir === 1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </button>
  )
  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-10 max-w-sm items-center gap-2 rounded-lg border border-line-strong bg-raised px-3 focus-within:border-accent">
        <Search size={15} className="text-muted" /><span className="sr-only">Filtrar</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por título, etiqueta ou texto" className="h-full flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
      </label>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="text-left text-[12.5px] text-muted"><tr className="border-b border-line">
            <th className="px-4 py-2.5 font-medium">{head('title', 'Tarefa')}</th><th className="px-3 font-medium">{head('column', 'Coluna')}</th>
            <th className="px-3 font-medium">{head('priority', 'Prioridade')}</th><th className="px-3 font-medium">{head('due', 'Prazo')}</th><th className="px-3 font-medium">Etiquetas</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma tarefa.</td></tr>}
            {rows.map((t) => {
              const done = isDone(board, t)
              const col = board.columns.find((c) => c.id === t.columnId)
              return (
                <tr key={t.id} onClick={() => onOpen(t)} className="cursor-pointer border-t border-line hover:bg-raised">
                  <td className={`px-4 py-2.5 ${done ? 'text-muted line-through' : ''}`}>{t.title}</td>
                  <td className="px-3 text-muted"><span className="inline-flex items-center gap-1.5">{col && <span className="col-dot size-2 rounded-full" style={cssColor(colColor(col))} />}{colName(t.columnId)}</span></td>
                  <td className="px-3">{t.priority > 0 ? <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${PRI_COLOR[t.priority]}`} />{PRIORITIES[t.priority]}</span> : <span className="text-faint">·</span>}</td>
                  <td className={`px-3 ${!done && t.due && t.due < today() ? LATE : ''}`}>{t.due ? fmtDue(t.due) : <span className="text-faint">·</span>}</td>
                  <td className="px-3"><span className="flex flex-wrap gap-1">{t.labels.map((l) => <span key={l} className="rounded bg-accent-soft px-1.5 py-0.5 text-[11.5px] text-link">{l}</span>)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Foco do dia (direção C) ----------
const FOCUS_SECONDS = 25 * 60
type Timer = { id: number; left: number; running: boolean }

function FocusView({ project, board, onOpen, onSave, onMove, onRule, onLog }: {
  project: Project; board: Board; onOpen: (t: Task) => void; onSave: (t: Task) => Promise<void>
  onMove: (id: number, colId: number, ord: number) => Promise<void>; onRule: (r: FocusRule) => void; onLog: (id: number, min: number) => Promise<void>
}) {
  const day = today()
  const rule = FOCUS_RULES.find((r) => r.id === project.focusRule) ?? FOCUS_RULES[0]
  const total = rule.slots.reduce((a, b) => a + b, 0)
  const bySlot = new Map(board.tasks.filter((t) => t.focusDay === day && t.focusSlot != null && t.focusSlot < total).map((t) => [t.focusSlot!, t]))
  const placed = new Set([...bySlot.values()].map((t) => t.id))
  const candidates = board.tasks.filter((t) => !isDone(board, t) && !placed.has(t.id)).sort(byUrgency)
  const doneCol = board.columns.find((c) => c.done)
  const openCol = board.columns.find((c) => !c.done)
  // a primeira tarefa aberta do foco é "a vez" (o sapo do dia; no Ivy Lee, a única liberada)
  const current = [...Array(total).keys()].map((i) => bySlot.get(i)).find((t) => t && !isDone(board, t))

  const [timer, setTimer] = useState<Timer | null>(null)
  const timerRef = useRef(timer)
  timerRef.current = timer
  const finish = async (t: Timer) => { setTimer(null); const min = Math.floor((FOCUS_SECONDS - t.left) / 60); if (min >= 1) await onLog(t.id, min) }
  useEffect(() => {
    if (!timer?.running) return
    const h = setInterval(() => setTimer((x) => (x ? { ...x, left: x.left - 1 } : x)), 1000)
    return () => clearInterval(h)
  }, [timer?.running])
  useEffect(() => { if (timer && timer.left <= 0) void finish(timer) }, [timer?.left]) // eslint-disable-line react-hooks/exhaustive-deps
  // saiu da tela com o cronômetro andando: registra o que já foi feito
  useEffect(() => () => { const t = timerRef.current; if (t) { const min = Math.floor((FOCUS_SECONDS - t.left) / 60); if (min >= 1) void onLog(t.id, min) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const place = (t: Task) => {
    const free = [...Array(total).keys()].find((i) => !bySlot.has(i))
    if (free != null) void onSave({ ...t, focusDay: day, focusSlot: free })
  }
  const complete = (t: Task) => {
    if (!doneCol) return
    const ord = Math.max(0, ...board.tasks.filter((x) => x.columnId === doneCol.id).map((x) => x.ord)) + 1
    if (timer?.id === t.id) void finish(timer)
    void onMove(t.id!, doneCol.id!, ord)
  }
  const reopen = (t: Task) => { if (openCol) void onMove(t.id!, openCol.id!, Math.max(0, ...board.tasks.filter((x) => x.columnId === openCol.id).map((x) => x.ord)) + 1) }
  const groupLabel = rule.id === '135' ? ['Uma grande', 'Três médias', 'Cinco pequenas'] : [null]
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const doneCount = [...bySlot.values()].filter((t) => isDone(board, t)).length

  let slot = 0
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.16em] text-link uppercase">Foco do dia · {dateLabel}</span>
          <h2 className="font-serif text-[28px] leading-tight">{rule.id === 'mit3' ? <>As <em className="text-link">três</em> que importam hoje</> : rule.id === '135' ? <>Uma grande, três médias, <em className="text-link">cinco</em> pequenas</> : <>Seis tarefas, <em className="text-link">uma</em> de cada vez</>}</h2>
          <p className="text-[13px] text-muted">{rule.hint} {doneCount}/{total} feitas.</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Regra do foco" className="grid gap-2.5 md:grid-cols-3">
        {FOCUS_RULES.map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={r.id === rule.id} onClick={() => onRule(r.id)}
            className={`flex flex-col gap-1 rounded-xl p-3.5 text-left transition-colors ${r.id === rule.id ? 'border-2 border-accent bg-card' : 'border border-line hover:border-line-strong'}`}>
            <span className="flex items-center gap-2"><b className="text-[14px] font-semibold">{r.title}</b>{r.id === rule.id && <Check size={14} className="text-link" aria-hidden="true" />}</span>
            <span className="text-[12.5px] text-muted">{r.label}</span>
          </button>
        ))}
      </div>
      <HowItWorks id={`foco-${rule.id}`} title={rule.title} guide={rule.guide} />

      {rule.slots.map((n, g) => (
        <div key={g} className="flex flex-col gap-2">
          {groupLabel[g] && <span className="text-[12px] font-semibold text-muted">{groupLabel[g]}</span>}
          <div className={`grid gap-3 ${n === 1 ? 'grid-cols-1 md:grid-cols-2' : n >= 5 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5' : 'grid-cols-1 md:grid-cols-3'}`}>
            {[...Array(n).keys()].map(() => {
              const i = slot++
              const t = bySlot.get(i)
              if (!t) return (
                <div key={i} className="flex min-h-[112px] flex-col justify-between rounded-[14px] border border-dashed border-line-strong p-4 text-[13px] text-faint">
                  <span className="font-serif text-[26px] leading-none">{i + 1}</span>
                  <span>Lugar livre. Escolha uma candidata abaixo.</span>
                </div>
              )
              const done = isDone(board, t)
              const isCurrent = current?.id === t.id
              const locked = rule.id === 'ivy' && !done && !isCurrent
              const running = timer?.id === t.id
              return (
                <div key={i} className={`flex min-h-[112px] flex-col gap-2 rounded-[14px] p-4 ${done ? 'kcard-done border' : isCurrent ? 'border-2 border-accent bg-card' : 'kcard border'} ${locked ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className={`font-serif text-[26px] leading-none ${done ? 'text-ok' : isCurrent ? 'text-link' : 'text-faint'}`}>{i + 1}</span>
                    <span className="flex-1" />
                    <button type="button" onClick={() => void onSave({ ...t, focusDay: null, focusSlot: null })} aria-label={`Tirar ${t.title} do foco`} title="Tirar do foco" className="text-faint hover:text-fg"><X size={14} /></button>
                  </div>
                  <button type="button" onClick={() => onOpen(t)} className={`text-left text-[14.5px] font-semibold leading-snug hover:underline ${done ? 'text-ok line-through' : ''}`}>{t.title}</button>
                  <span className="text-[12px] text-muted">
                    {[isCurrent && rule.id !== 'ivy' && i === 0 ? 'O sapo do dia' : null, t.due ? `prazo ${fmtDue(t.due)}` : null, t.estimateMin ? fmtMin(t.estimateMin) : null, t.spentMin ? `${fmtMin(t.spentMin)} de foco` : null].filter(Boolean).join(' · ') || (locked ? 'Depois da anterior' : ' ')}
                  </span>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {done
                      ? <button type="button" onClick={() => reopen(t)} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg"><RotateCcw size={12} />Reabrir</button>
                      : <>
                        {running
                          ? <>
                            <span className="font-mono text-[15px] tabular-nums" aria-live="polite">{mmss(timer!.left)}</span>
                            <Button variant="ghost" icon={timer!.running ? Pause : Play} ariaLabel={timer!.running ? 'Pausar foco' : 'Continuar foco'} onClick={() => setTimer({ ...timer!, running: !timer!.running })} />
                            <Button variant="ghost" icon={Square} ariaLabel="Parar e registrar" title="Parar e registrar o tempo" onClick={() => void finish(timer!)} />
                          </>
                          : !locked && !timer && <button type="button" onClick={() => setTimer({ id: t.id!, left: FOCUS_SECONDS, running: true })}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold ${isCurrent ? 'bg-accent text-on-accent hover:bg-accent-strong' : 'border border-line-strong hover:border-accent'}`}><Clock size={13} />Focar 25 min</button>}
                        {!locked && <button type="button" onClick={() => complete(t)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted hover:text-ok"><Check size={13} />Concluir</button>}
                      </>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2"><span className="text-[12px] font-semibold text-muted">Candidatas, do quadro</span><span className="text-[12px] text-faint">por prioridade e prazo</span></div>
        {candidates.length === 0 && <p className="text-[13px] text-faint">Nenhuma tarefa aberta fora do foco.</p>}
        <ul className="flex flex-col gap-1.5">
          {candidates.slice(0, 12).map((t) => {
            const col = board.columns.find((c) => c.id === t.columnId)
            return (
              <li key={t.id} className="kcard flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[13.5px]">
                {t.priority > 0 && <span className={`size-2 shrink-0 rounded-full ${PRI_COLOR[t.priority]}`} />}
                <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 truncate text-left hover:underline">{t.title}</button>
                {col && <Pill color={colColor(col)}>{col.name}</Pill>}
                <span className={`w-16 text-right text-[12px] ${t.due && t.due < day ? LATE : 'text-muted'}`}>{t.due ? fmtDue(t.due) : 'sem prazo'}</span>
                <Button icon={Plus} onClick={() => place(t)} disabled={bySlot.size >= total}>Pôr no foco</Button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ---------- Eisenhower ----------
const QUADRANTS = [
  { q: 1, name: 'Fazer agora', tone: 'bg-accent text-on-accent' },
  { q: 2, name: 'Agendar', tone: 'bg-accent-soft text-link' },
  { q: 3, name: 'Delegar', tone: 'bg-[#F6EBC4] text-[#6B5300] dark:bg-[#3A3110] dark:text-[#F5D46B]' },
  { q: 4, name: 'Eliminar', tone: 'kchip text-muted' },
]

function MatrixChip({ t, board, onOpen }: { t: Task; board: Board; onOpen: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id! })
  const col = board.columns.find((c) => c.id === t.columnId)
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} aria-label={t.title} style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="kcard flex cursor-grab items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13.5px] active:cursor-grabbing">
      {t.priority > 0 && <span className={`size-2 shrink-0 rounded-full ${PRI_COLOR[t.priority]}`} />}
      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(t)}>{t.title}</button>
      {col && <Pill color={colColor(col)}>{col.name}</Pill>}
      {t.due && <span className={`text-[12px] ${t.due < today() ? LATE : 'text-muted'}`}>{fmtDue(t.due)}</span>}
    </div>
  )
}

function Quadrant({ id, title, tone, tasks, board, onOpen, dashed, hint }: { id: string; title: string; tone: string; tasks: Task[]; board: Board; onOpen: (t: Task) => void; dashed?: boolean; hint?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} aria-label={title}
      className={`flex min-h-[180px] flex-col gap-2 rounded-[14px] p-3.5 transition-colors ${dashed ? 'border border-dashed border-line-strong' : 'border border-line bg-card'} ${isOver ? '!border-accent bg-accent-soft/40' : ''}`}>
      <div><span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>{title} · {tasks.length}</span></div>
      {tasks.map((t) => <MatrixChip key={t.id} t={t} board={board} onOpen={onOpen} />)}
      {hint && <span className="mt-auto text-[12px] text-faint">{hint}</span>}
    </section>
  )
}

function MatrixView({ board, onOpen, onSave }: { board: Board; onOpen: (t: Task) => void; onSave: (t: Task) => Promise<void> }) {
  const open = board.tasks.filter((t) => !isDone(board, t)).sort(byUrgency)
  const [active, setActive] = useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null)
    const t = board.tasks.find((x) => x.id === a.id)
    const q = over ? Number(String(over.id).slice(2)) || null : null
    if (t && t.quadrant !== q) void onSave({ ...t, quadrant: q })
  }
  const unsorted = open.filter((t) => t.quadrant == null)
  const of = (q: number) => open.filter((t) => t.quadrant === q)
  const label = 'font-mono text-[11px] tracking-[0.14em] text-faint'
  return (
    <DndContext sensors={sensors} onDragStart={({ active: a }) => setActive(a.id as number)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="flex flex-col gap-4">
        <HowItWorks id="eisenhower" title="Matriz de Eisenhower" guide={method('eisenhower')!.guide} />
        {(unsorted.length > 0 || active != null) && <Quadrant id="q-0" title="Sem quadrante" tone="kchip text-muted" tasks={unsorted} board={board} onOpen={onOpen} dashed
          hint={unsorted.length ? 'Arraste cada tarefa para um quadrante. Ou escolha no painel da tarefa.' : 'Solte aqui, ou fora da matriz, para tirar a tarefa do quadrante.'} />}
        <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <span /><span className={`${label} text-center`}>URGENTE</span><span className={`${label} text-center`}>NÃO URGENTE</span>
          <span className={`${label} text-center [writing-mode:vertical-rl] rotate-180`}>IMPORTANTE</span>
          {QUADRANTS.slice(0, 2).map((x) => <Quadrant key={x.q} id={`q-${x.q}`} title={x.name} tone={x.tone} tasks={of(x.q)} board={board} onOpen={onOpen} />)}
          <span className={`${label} text-center [writing-mode:vertical-rl] rotate-180`}>NÃO IMPORTANTE</span>
          {QUADRANTS.slice(2).map((x) => <Quadrant key={x.q} id={`q-${x.q}`} title={x.name} tone={x.tone} tasks={of(x.q)} board={board} onOpen={onOpen} dashed={x.q === 4}
            hint={x.q === 4 ? 'O que pode sair. Nada é apagado: arquive ou exclua pelo painel.' : undefined} />)}
        </div>
        {board.tasks.length - open.length > 0 && <p className="text-[12px] text-faint">{board.tasks.length - open.length} concluída(s) fora da matriz.</p>}
      </div>
      <DragOverlay>{active != null ? (() => { const t = board.tasks.find((x) => x.id === active); return t ? <div className="kcard w-[280px] rotate-1 rounded-[10px] border px-3 py-2 text-[13.5px] shadow-xl">{t.title}</div> : null })() : null}</DragOverlay>
    </DndContext>
  )
}

// ---------- Editor de colunas ----------
function ColumnsEditor({ board, onSave, onClose }: { board: Board; onSave: (cols: Column[]) => Promise<void>; onClose: () => void }) {
  const [cols, setCols] = useState<Column[]>(board.columns.map((c) => ({ ...c })))
  const [error, setError] = useState<string | null>(null)
  const set = (i: number, patch: Partial<Column>) => setCols((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: number) => setCols((cs) => { const j = i + d; if (j < 0 || j >= cs.length) return cs; const n = [...cs]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const count = (id: number | null) => board.tasks.filter((t) => t.columnId === id).length
  const save = async () => { setError(null); try { await onSave(cols); onClose() } catch (e) { setError(message(e)) } }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/40 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-label="Colunas do quadro" className="anim-rise flex max-h-[85vh] w-[620px] max-w-full flex-col rounded-xl border border-line-strong bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-[17px] font-semibold">Colunas do quadro</h2><Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} /></header>
        <ul className="flex flex-col gap-2 overflow-y-auto p-5">
          {cols.map((c, i) => (
            <li key={c.id ?? `n${i}`} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <input value={c.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Nome da coluna" className={`${field} h-9 flex-1`} />
                <Button variant="ghost" icon={ArrowUp} ariaLabel="Subir" onClick={() => move(i, -1)} />
                <Button variant="ghost" icon={ArrowDown} ariaLabel="Descer" onClick={() => move(i, 1)} />
                <Button variant="ghost" icon={Trash2} ariaLabel={`Apagar ${c.name}`} title={count(c.id) ? `${count(c.id)} tarefa(s) vão para a primeira coluna` : 'Apagar'} onClick={() => setCols((cs) => cs.filter((_, k) => k !== i))} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
                <span className="flex items-center gap-1.5">{SWATCHES.map((s) => (
                  <button key={s ?? 'none'} type="button" aria-label={s ? `Cor ${s}` : 'Sem cor'} onClick={() => set(i, { color: s })}
                    className={`size-5 rounded-full border ${c.color === s ? 'ring-2 ring-accent ring-offset-1 ring-offset-card' : ''} ${s ? '' : 'border-line-strong bg-card'}`} style={s ? { background: s, borderColor: s } : undefined} />
                ))}</span>
                <label className="flex items-center gap-1.5">Limite
                  <input type="number" min={0} max={99} value={c.wip ?? ''} placeholder="sem" onChange={(e) => set(i, { wip: e.target.value ? Math.max(0, +e.target.value) : null })} className={`${field} h-8 w-16 px-2`} /></label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={c.done} onChange={(e) => set(i, { done: e.target.checked })} className="accent-[var(--t-accent)]" />Tarefas aqui contam como concluídas</label>
              </div>
            </li>
          ))}
          <li><Button icon={Plus} onClick={() => setCols((cs) => [...cs, { id: null, name: 'Nova coluna', color: null, wip: null, done: false }])}>Adicionar coluna</Button></li>
        </ul>
        {error && <p className={`px-5 text-[13px] ${LATE}`} role="alert">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-line px-5 py-3"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar colunas</Button></footer>
      </div>
    </div>
  )
}

// ---------- Painel da tarefa ----------
export function NotePicker({ value, onChange }: { value: string | null; onChange: (p: string | null) => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    const t = setTimeout(() => call<Hit[]>('brain_search', { query: q, limit: 6 }).then(setHits).catch(() => setHits([])), 150)
    return () => clearTimeout(t)
  }, [q])
  if (value) return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-[13px]">
      <FileText size={14} className="text-muted" /><span className="min-w-0 flex-1 truncate font-mono text-[12px]">{value}</span>
      <button type="button" onClick={() => navigate(`/cerebro?nota=${encodeURIComponent(value)}`)} className="text-link hover:underline">Abrir</button>
      <button type="button" onClick={() => onChange(null)} aria-label="Desligar nota" className="text-muted hover:text-fg"><X size={14} /></button>
    </div>
  )
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ligar a uma nota do Conhecimento (buscar)" className={field} />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-11 z-10 rounded-lg border border-line-strong bg-card p-1 shadow-xl">
          {hits.map((h) => <li key={h.path}><button type="button" onClick={() => { onChange(h.path); setQ('') }} className="w-full truncate rounded px-2 py-1.5 text-left text-[13px] hover:bg-raised">{h.title} <span className="font-mono text-[11px] text-faint">{h.path}</span></button></li>)}
        </ul>
      )}
    </div>
  )
}

// Painel fixo à direita (direção C da 4A): o quadro continua visível e clicável ao lado.
function TaskPanel({ task, board, project, onSave, onDelete, onClose }: { task: Task; board: Board; project: Project; onSave: (t: Task) => Promise<void>; onDelete: (t: Task) => Promise<void>; onClose: () => void }) {
  const [t, setT] = useState<Task>({ ...task, checklist: task.checklist.map((c) => ({ ...c })) })
  const [preview, setPreview] = useState(!!task.notes)
  const [item, setItem] = useState('')
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Task>) => setT((x) => ({ ...x, ...patch }))
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const save = async () => {
    if (!t.title.trim()) { setError('Dê um título à tarefa.'); titleRef.current?.focus(); return }
    setError(null); try { await onSave(t); onClose() } catch (e) { setError(message(e)) }
  }
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const col = board.columns.find((c) => c.id === t.columnId)
  const krOptions = useKrs(project.methods.includes('okr') ? project.id : null)
  const scopeOptions = useCycleScopes(project.methods.includes('shapeup') ? project.id : null)
  return (
      <aside aria-label="Tarefa selecionada" className="anim-slide-in flex h-full w-[400px] max-w-[45%] shrink-0 flex-col border-l border-line bg-card">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted">TAREFA</span>
          <Button variant="ghost" icon={X} ariaLabel="Fechar painel" onClick={onClose} />
        </div>
        <header className="flex items-start gap-2 border-b border-line px-5 pb-4">
          {col && <span className="col-dot mt-3 size-2.5 shrink-0 rounded-full" style={cssColor(colColor(col))} aria-hidden="true" />}
          <textarea ref={titleRef} value={t.title} onChange={(e) => { set({ title: e.target.value }); setError(null) }} rows={2} aria-label="Título" aria-invalid={!!error && !t.title.trim()} placeholder="Título da tarefa"
            className={`min-h-9 flex-1 resize-none rounded bg-transparent font-serif text-[22px] leading-snug outline-none placeholder:text-faint ${error && !t.title.trim() ? 'ring-1 ring-[#B3261E] dark:ring-[#FF8A80]' : ''}`} />
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-[13.5px]">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-muted">Coluna
              <select value={t.columnId ?? ''} onChange={(e) => set({ columnId: +e.target.value })} className={field}>{board.columns.map((c) => <option key={c.id} value={c.id!}>{c.name}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-muted">Prioridade
              <select value={t.priority} onChange={(e) => set({ priority: +e.target.value })} className={field}>{PRIORITIES.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-muted">Prazo
              <input type="date" min="1900-01-01" max="9999-12-31" value={t.due ?? ''} onChange={(e) => set({ due: e.target.value || null })} className={field} /></label>
            <label className="flex flex-col gap-1 text-muted">Estimativa (min)
              <input type="number" min={0} value={t.estimateMin ?? ''} onChange={(e) => set({ estimateMin: e.target.value ? +e.target.value : null })} className={field} /></label>
            {project.methods.includes('eisenhower') && (
              <label className="col-span-2 flex flex-col gap-1 text-muted">Quadrante (Eisenhower)
                <select value={t.quadrant ?? ''} onChange={(e) => set({ quadrant: e.target.value ? +e.target.value : null })} className={field}>
                  <option value="">Sem quadrante</option>{QUADRANTS.map((q) => <option key={q.q} value={q.q}>{q.name}</option>)}
                </select></label>
            )}
            {project.methods.includes('scrum') && (
              <label className="flex flex-col gap-1 text-muted">Pontos (tamanho)
                <select value={t.points ?? ''} onChange={(e) => set({ points: e.target.value ? +e.target.value : null })} className={field}>
                  <option value="">Sem pontos</option>{[1, 2, 3, 5, 8, 13, 21].map((n) => <option key={n} value={n}>{n}</option>)}
                </select></label>
            )}
            {project.methods.includes('shapeup') && scopeOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-muted">Frente do ciclo
                <select value={t.scopeId ?? ''} onChange={(e) => set({ scopeId: e.target.value ? +e.target.value : null })} className={field}>
                  <option value="">Nenhuma</option>{scopeOptions.map((x) => <option key={x.id} value={x.id!}>{x.title}</option>)}
                </select></label>
            )}
            {project.methods.includes('okr') && krOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-muted">Move o resultado-chave
                <select value={t.krId ?? ''} onChange={(e) => set({ krId: e.target.value ? +e.target.value : null })} className={field}>
                  <option value="">Nenhum</option>{krOptions.map((k) => <option key={k.id} value={k.id!}>{k.code} · {k.title}</option>)}
                </select></label>
            )}
            {project.methods.includes('gtd') && (
              <>
                <label className="flex flex-col gap-1 text-muted">Lista do GTD
                  <select value={t.gtdList ?? 'next'} onChange={(e) => set({ gtdList: e.target.value as GtdList })} className={field}>
                    <option value="inbox">Caixa de entrada</option><option value="next">Próximas ações</option><option value="waiting">Aguardando</option><option value="someday">Algum dia / talvez</option>
                  </select></label>
                <label className="flex flex-col gap-1 text-muted">Contexto (onde fazer)
                  <input value={t.context ?? ''} onChange={(e) => set({ context: e.target.value || null })} placeholder="computador, telefone…" className={field} /></label>
                <label className="flex flex-col gap-1 text-muted">Energia que exige
                  <select value={t.energy ?? ''} onChange={(e) => set({ energy: e.target.value ? +e.target.value : null })} className={field}>
                    <option value="">Não sei</option><option value={1}>Baixa</option><option value={2}>Média</option><option value={3}>Alta</option>
                  </select></label>
                {t.gtdList === 'waiting' && (
                  <label className="flex flex-col gap-1 text-muted">De quem espera
                    <input value={t.waitingFor ?? ''} onChange={(e) => set({ waitingFor: e.target.value || null })} className={field} /></label>
                )}
              </>
            )}
          </div>
          <label className="flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={t.milestone} onChange={(e) => set({ milestone: e.target.checked })} className="mt-0.5 size-4 accent-[var(--t-accent)]" />
            <span className="flex flex-col"><span>É um marco</span><span className="text-[12.5px] text-muted">Uma entrega importante. Aparece em destaque na linha do tempo do Calendário.</span></span>
          </label>
          {t.spentMin > 0 && <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted"><Clock size={13} />{fmtMin(t.spentMin)} de foco registrados</p>}
          <label className="flex flex-col gap-1 text-muted">Etiquetas (separe por vírgula)
            <input value={t.labels.join(', ')} onChange={(e) => set({ labels: e.target.value.split(',').map((x) => x.trimStart()) })} onBlur={() => set({ labels: t.labels.map((l) => l.trim()).filter(Boolean) })} placeholder="cliente, design" className={field} /></label>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-muted"><span>Descrição</span>
              <button type="button" onClick={() => setPreview((p) => !p)} className="text-[12.5px] text-link">{preview ? 'Editar' : 'Ver formatado'}</button></div>
            {preview
              ? <div className="min-h-20 cursor-text rounded-lg border border-line p-3" onClick={() => setPreview(false)}>{t.notes.trim() ? <Markdown source={t.notes} /> : <span className="text-faint">Sem descrição. Clique para escrever.</span>}</div>
              : <textarea value={t.notes} onChange={(e) => set({ notes: e.target.value })} rows={6} placeholder="Markdown: **negrito**, listas, [[links]] para notas…" className="rounded-lg border border-line-strong bg-raised p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent" />}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-muted">Checklist {t.checklist.length > 0 && `(${t.checklist.filter((c) => c.done).length}/${t.checklist.length})`}</span>
            <ul className="flex flex-col gap-1">
              {t.checklist.map((c, i) => (
                <li key={i} className="group flex items-center gap-2">
                  <input type="checkbox" checked={c.done} onChange={(e) => set({ checklist: t.checklist.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)) })} className="size-4 accent-[var(--t-accent)]" aria-label={c.text} />
                  <input value={c.text} onChange={(e) => set({ checklist: t.checklist.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} className={`h-8 flex-1 rounded bg-transparent px-1 outline-none focus:bg-raised ${c.done ? 'text-muted line-through' : ''}`} />
                  <button type="button" aria-label="Remover item" onClick={() => set({ checklist: t.checklist.filter((_, k) => k !== i) })} className="text-faint opacity-0 group-hover:opacity-100 hover:text-fg"><X size={14} /></button>
                </li>
              ))}
            </ul>
            <form onSubmit={(e) => { e.preventDefault(); if (item.trim()) { set({ checklist: [...t.checklist, { text: item.trim(), done: false }] }); setItem('') } }}>
              <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="+ Item da checklist" className="h-9 w-full rounded-lg bg-raised px-3 outline-none placeholder:text-faint" />
            </form>
          </div>

          <div className="flex flex-col gap-1.5"><span className="text-muted">Nota do Conhecimento</span><NotePicker value={t.notePath} onChange={(p) => set({ notePath: p })} /></div>
        </div>
        {error && <p className={`border-t border-line px-5 pt-3 text-right text-[13px] ${LATE}`} role="alert">{error}</p>}
        <footer className={`flex items-center gap-2 px-5 py-3 ${error ? '' : 'border-t border-line'}`}>
          {t.id && <Button variant="ghost" icon={Trash2} onClick={() => onDelete(t).then(onClose)}>Excluir</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>Salvar</Button>
        </footer>
      </aside>
  )
}

// ---------- Galeria de modelos ao criar projeto (direção A) ----------
function TemplatePreview({ kind }: { kind: Template['preview'] }) {
  const box = 'rounded-md'
  if (kind === 'columns') return <span className="flex h-[54px] gap-1.5"><span className={`${box} col-pill flex-1`} style={cssColor('#8A93B4')} /><span className={`${box} col-pill flex-1`} style={cssColor('#E0A800')} /><span className={`${box} col-pill flex-1`} style={cssColor('#1D6B45')} /></span>
  if (kind === 'bars') return <span className="flex h-[54px] items-end gap-1.5">{[100, 70, 40, 20].map((h) => <span key={h} className={`${box} flex-1 bg-accent-soft`} style={{ height: `${h}%` }} />)}</span>
  if (kind === 'grid') return <span className="grid h-[54px] grid-cols-2 gap-1.5">{[0, 1, 2, 3].map((i) => <span key={i} className={`${box} bg-raised`} />)}</span>
  if (kind === 'matrix') return <span className="grid h-[54px] grid-cols-2 gap-1.5"><span className={`${box} bg-accent`} /><span className={`${box} bg-accent-soft`} /><span className={`${box} bg-[#F6EBC4] dark:bg-[#3A3110]`} /><span className={`${box} bg-raised`} /></span>
  if (kind === 'line') return <span className={`${box} flex h-[54px] items-center bg-raised px-2`}><span className="h-0.5 flex-1 rounded bg-accent" /></span>
  return <span className="grid h-[54px] place-items-center text-faint"><Plus size={22} strokeWidth={1.6} /></span>
}

// Modelo salvo pela pessoa -> formato da galeria (com as tarefas de partida)
function fromUser(u: UserTemplate): (Template & { tasks: string[]; userId: number }) | null {
  try {
    const d = JSON.parse(u.data) as { columns: Column[]; methods: MethodId[]; focusRule?: FocusRule; reviewDay?: number | null; tasks?: string[] }
    const names = d.methods.filter((m) => m !== 'lista').map(methodName)
    return {
      id: `u${u.id}`, userId: u.id!, name: u.name, combo: names.join(' + ') || 'Kanban', about: u.about || 'Modelo salvo por você.', preview: 'columns', ready: true,
      columns: d.columns.map((c) => ({ ...c, id: null })), methods: d.methods, views: d.methods.map(methodName).join(' · '), fields: '—',
      rituals: d.reviewDay != null ? `Revisão toda ${WEEKDAYS[d.reviewDay]}` : 'Nenhum', focusRule: d.focusRule ?? 'mit3', reviewDay: d.reviewDay ?? null,
      guide: { how: [], why: '', when: '' }, tasks: d.tasks ?? [],
    }
  } catch { return null }
}

// Configurar > Salvar como modelo
function SaveTemplate({ project, board, draft, onClose }: { project: Project; board: Board | null; draft: { methods: MethodId[]; focusRule: FocusRule; reviewDay: number | null }; onClose: () => void }) {
  const [name, setName] = useState(project.name)
  const [about, setAbout] = useState('')
  const open = board ? board.tasks.filter((t) => !board.columns.find((c) => c.id === t.columnId)?.done) : []
  const [inc, setInc] = useState({ columns: true, methods: true, ritual: draft.reviewDay != null, tasks: false })
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    const data = {
      columns: inc.columns && board ? board.columns.map((c) => ({ id: null, name: c.name, color: c.color, wip: c.wip, done: c.done })) : [],
      methods: inc.methods ? draft.methods : ['kanban', 'lista'], focusRule: draft.focusRule,
      reviewDay: inc.ritual ? draft.reviewDay : null, tasks: inc.tasks ? open.map((t) => t.title) : [],
    }
    call('template_save', { template: { id: null, name, about, data: JSON.stringify(data), createdAt: null } }).then(() => setDone(true)).catch((e) => setError(message(e)))
  }
  const box = (k: keyof typeof inc, label: string, disabled = false) => (
    <label className={`flex items-center gap-2.5 text-[13.5px] ${disabled ? 'opacity-50' : ''}`}><input type="checkbox" disabled={disabled} checked={inc[k]} onChange={(e) => setInc((x) => ({ ...x, [k]: e.target.checked }))} className="size-4 accent-[var(--t-accent)]" />{label}</label>
  )
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#080E22]/40 p-4">
      <div role="dialog" aria-label="Salvar como modelo" className="anim-rise flex w-[460px] max-w-full flex-col gap-3.5 rounded-2xl border border-line-strong bg-card p-5 shadow-2xl">
        {done ? (
          <>
            <span className="grid size-10 place-items-center rounded-xl bg-ok-bg text-ok"><Check size={18} /></span>
            <h3 className="font-serif text-[20px]">Modelo salvo.</h3>
            <p className="text-[13.5px] text-muted">Ele aparece na aba "Meus modelos" quando você criar um projeto novo.</p>
            <div><Button variant="primary" onClick={onClose}>Fechar</Button></div>
          </>
        ) : (
          <>
            <span className="font-mono text-[11px] tracking-[0.16em] text-link">SALVAR COMO MODELO</span>
            <h3 className="font-serif text-[20px]">Use este jeito de trabalhar de novo</h3>
            <label className="flex flex-col gap-1 text-[13px] text-muted">Nome do modelo<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
            <label className="flex flex-col gap-1 text-[13px] text-muted">Para que serve (aparece na galeria)<textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className="rounded-lg border border-line-strong bg-raised p-3 text-[13.5px] outline-none focus:border-accent" /></label>
            <div className="flex flex-col gap-1.5"><span className="text-[13px] text-muted">O que entra no modelo</span>
              {box('columns', `Colunas do quadro, com cores e limites (${board?.columns.length ?? 0})`)}
              {box('methods', `Métodos ligados: ${draft.methods.map(methodName).join(', ')}`)}
              {box('ritual', draft.reviewDay != null ? `Ritual: revisão de ${WEEKDAYS[draft.reviewDay]}` : 'Ritual (este projeto não tem)', draft.reviewDay == null)}
              {box('tasks', `Tarefas abertas como passos de partida (${open.length})`, open.length === 0)}
            </div>
            {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
            <div className="flex gap-2"><Button variant="primary" icon={Check} onClick={save} disabled={!name.trim()}>Salvar modelo</Button><Button variant="ghost" onClick={onClose}>Cancelar</Button></div>
          </>
        )}
      </div>
    </div>
  )
}

function NewProject({ onCreate, onClose }: { onCreate: (name: string, scope: string, setup: MethodSetup, tasks: string[]) => Promise<void>; onClose: () => void }) {
  const scopes = useScopes()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('personal')
  const [pick, setPick] = useState<Template & { tasks?: string[]; userId?: number }>(TEMPLATES[0])
  const [tab, setTab] = useState<'prontos' | 'meus'>('prontos')
  const [mine, setMine] = useState<(Template & { tasks: string[]; userId: number })[]>([])
  const loadMine = () => call<UserTemplate[]>('templates_list').then((ts) => setMine(ts.map(fromUser).filter((x): x is Template & { tasks: string[]; userId: number } => !!x))).catch(() => setMine([]))
  useEffect(() => { void loadMine() }, [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const nameRef = useRef<HTMLInputElement>(null)
  const create = async () => {
    if (!name.trim()) { setError('Dê um nome ao projeto.'); nameRef.current?.focus(); return }
    setBusy(true); setError(null)
    try { await onCreate(name.trim(), scope, { methods: pick.methods, preset: pick.userId ? null : pick.id, focusRule: pick.focusRule, reviewDay: pick.reviewDay, columns: pick.columns }, pick.tasks ?? []) }
    catch (e) { setError(message(e)); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/45 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-label="Novo projeto" className="anim-rise flex h-[min(720px,90vh)] w-[1080px] max-w-full overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-9 py-8">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <span className="font-mono text-[11px] tracking-[0.16em] text-link">NOVO PROJETO</span>
              <h2 className="font-serif text-[28px] leading-tight">Como você quer <em className="text-link">organizar</em> este projeto?</h2>
              <p className="text-[14px] text-muted">Um modelo escolhe colunas, visões e rituais. Dá para ligar e desligar métodos depois, no trilho do projeto.</p>
            </div>
            <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="min-w-[240px] flex-1"><span className="sr-only">Nome do projeto</span>
              <input ref={nameRef} autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(null) }} onKeyDown={(e) => { if (e.key === 'Enter') void create() }} placeholder="Nome do projeto"
                aria-invalid={!!error && !name.trim()} className={`${field} ${error && !name.trim() ? '!border-[#B3261E] dark:!border-[#FF8A80]' : ''}`} /></label>
            <label><span className="sr-only">Escopo</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className={`${field} w-48`}>{scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>
          <div role="tablist" aria-label="Modelos" className="inline-flex gap-1 self-start rounded-lg border border-line-strong p-1">
            {([['prontos', 'Modelos prontos'], ['meus', `Meus modelos · ${mine.length}`]] as const).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                className={`h-8 rounded-md px-3 text-[13.5px] ${tab === v ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
          {tab === 'meus' && mine.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">Nenhum modelo seu ainda. Em qualquer projeto, abra Configurar e use "Salvar como modelo".</p>}
          {tab === 'meus' && mine.length > 0 && (
            <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
              {mine.map((tp) => (
                <div key={tp.id} className={`flex flex-col gap-3 rounded-[14px] bg-card p-4 ${pick.id === tp.id ? 'border-2 border-accent' : 'border border-line'}`}>
                  <button type="button" onClick={() => setPick(tp)} aria-pressed={pick.id === tp.id} className="flex flex-col gap-3 text-left">
                    <TemplatePreview kind="columns" />
                    <b className="text-[15px] font-semibold">{tp.name}</b>
                    <span className="-mt-1.5 text-[12.5px] text-muted">{tp.combo}</span>
                  </button>
                  <span className="flex items-center gap-2"><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-link">MEU MODELO</span><span className="flex-1" />
                    <button type="button" onClick={() => void call('template_delete', { id: tp.userId }).then(() => { if (pick.id === tp.id) setPick(TEMPLATES[0]); return loadMine() })} className="text-[12px] text-muted hover:text-[#B3261E]">Apagar</button></span>
                </div>
              ))}
            </div>
          )}
          {tab === 'prontos' && <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
            {TEMPLATES.map((tp) => (
              <button key={tp.id} type="button" disabled={!tp.ready} onClick={() => setPick(tp)} aria-pressed={pick.id === tp.id}
                className={`flex flex-col gap-3 rounded-[14px] p-4 text-left transition-all ${tp.id === 'branco' ? 'border border-dashed border-line-strong' : 'bg-card'} ${pick.id === tp.id ? 'border-2 border-accent' : tp.id === 'branco' ? '' : 'border border-line'} ${tp.ready ? 'hover:-translate-y-0.5' : 'cursor-not-allowed opacity-55'}`}>
                <TemplatePreview kind={tp.preview} />
                <span className="flex items-center gap-2"><b className="text-[15px] font-semibold">{tp.name}</b>{!tp.ready && <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-muted">em breve</span>}</span>
                <span className="-mt-1.5 text-[12.5px] text-muted">{tp.combo}</span>
              </button>
            ))}
          </div>}
        </div>
        <aside aria-label="Detalhes do modelo" className="flex w-[380px] shrink-0 flex-col border-l border-line bg-card">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-8 pb-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.14em] text-link">MODELO</span>
            <h3 className="font-serif text-[22px]">{pick.name}</h3>
            <p className="text-[13.5px] leading-relaxed text-muted">{pick.about}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-muted">Colunas</span>
            <div className="flex flex-wrap gap-1.5">{pick.columns.map((c) => <Pill key={c.name} color={colColor(c)}>{c.done && <Check size={11} aria-hidden="true" />}{c.name}{c.wip ? ` · WIP ${c.wip}` : ''}</Pill>)}</div>
          </div>
          {([['Visões', pick.views], ['Campos em destaque', pick.fields], ['Rituais', pick.rituals]] as const).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1"><span className="text-[12px] font-semibold text-muted">{k}</span><span className="text-[13.5px]">{v}</span></div>
          ))}
          {pick.guide.how.length > 0 && <div className="border-t border-line pt-4"><GuideBlock guide={pick.guide} compact /></div>}
          {pick.tasks && pick.tasks.length > 0 && <div className="flex flex-col gap-1 border-t border-line pt-4"><span className="text-[12px] font-semibold text-muted">Tarefas de partida ({pick.tasks.length})</span>{pick.tasks.slice(0, 8).map((x, i) => <span key={i} className="text-[13px]">· {x}</span>)}{pick.tasks.length > 8 && <span className="text-[12px] text-faint">e mais {pick.tasks.length - 8}</span>}</div>}
          {pick.methods.filter((m) => m !== 'lista').length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="text-[12px] font-semibold text-muted">Métodos deste modelo</span>
              {pick.methods.filter((m) => m !== 'lista').map((m) => (
                <details key={m} className="group rounded-lg border border-line px-3 py-2">
                  <summary className="cursor-pointer text-[13.5px] font-medium">{methodName(m)} <span className="font-normal text-muted">· {method(m)!.what}</span></summary>
                  <div className="pt-3"><GuideBlock guide={method(m)!.guide} compact /></div>
                </details>
              ))}
            </div>
          )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-line px-6 py-4">
            <Button variant="primary" onClick={() => void create()} disabled={busy}>{pick.id === 'branco' ? 'Criar projeto em branco' : 'Criar projeto com este modelo'}</Button>
            {error
              ? <p className={`text-center text-[13px] ${LATE}`} role="alert">{error}</p>
              : <p className="text-center text-[12px] text-faint">Colunas e métodos podem mudar depois.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---------- Configurações do projeto (métodos, regra do foco, ritual, quadro) ----------
function Switch({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`${label}: ${on ? 'ligado' : 'desligado'}`} disabled={disabled} onClick={onClick}
      title={disabled ? 'O Kanban é a visão principal e fica sempre ligado' : undefined}
      className={`flex h-[20px] w-[34px] shrink-0 rounded-full p-[2px] transition-colors ${on ? 'justify-end bg-accent' : 'justify-start bg-line-strong'} ${disabled ? 'opacity-60' : ''}`}>
      <span className="size-[16px] rounded-full bg-white" />
    </button>
  )
}

const REVIEW_GUIDE: Guide = {
  how: [
    'No dia marcado, separe 10 a 15 minutos.',
    'Olhe o que foi para "Feito" na semana: o que fechou?',
    'Olhe o que está parado há dias ou acima do limite: o que travou e por quê?',
    'Escolha o que entra na semana seguinte e jogue fora o que perdeu o sentido.',
    'Clique em "Fiz a revisão" para marcar.',
  ],
  why: 'Sem revisão, o quadro vira um depósito: coisas velhas se acumulam e ninguém confia mais nele. Uma conversa curta e fixa com o próprio trabalho mantém o método vivo.',
  when: 'Em qualquer projeto que dure mais de duas semanas. Escolha um dia calmo, como sexta à tarde ou segunda cedo.',
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line px-6 py-5 last:border-b-0">
      <div className="flex flex-col gap-0.5"><h3 className="text-[15px] font-semibold">{title}</h3>{sub && <p className="text-[13px] text-muted">{sub}</p>}</div>
      {children}
    </section>
  )
}

// As mudanças ficam num rascunho até "Salvar". Fechar com mudanças pede confirmação para descartar.
function ProjectSettings({ project, board, onSave, onColumns, onArchive, onClose }: {
  project: Project; board: Board | null; onSave: (s: MethodSetup, para: { kind: ParaKind; brainPath: string | null }) => Promise<void>; onColumns: () => void; onArchive: () => void; onClose: () => void
}) {
  const [help, setHelp] = useState<string | null>(null)
  const [methods, setMethods] = useState<MethodId[]>(project.methods)
  const [focusRule, setFocusRule] = useState<FocusRule>(project.focusRule)
  const [reviewDay, setReviewDay] = useState<number | null>(project.reviewDay)
  const [paraKind, setParaKind] = useState<ParaKind>(project.paraKind)
  const [brainPath, setBrainPath] = useState(project.brainPath ?? '')
  const [savingTpl, setSavingTpl] = useState(false)
  const [confirm, setConfirm] = useState<null | (() => void)>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = focusRule !== project.focusRule || reviewDay !== project.reviewDay || paraKind !== project.paraKind || brainPath.trim() !== (project.brainPath ?? '')
    || methods.length !== project.methods.length || methods.some((m) => !project.methods.includes(m))
  // qualquer saída (X, Esc, fundo, Editar colunas) passa por aqui
  const leave = (then: () => void) => { if (dirty) setConfirm(() => then); else then() }
  const save = async () => {
    setBusy(true); setError(null)
    try { await onSave({ methods, focusRule, reviewDay }, { kind: paraKind, brainPath: brainPath.trim() || null }); onClose() } catch (e) { setError(message(e)); setBusy(false) }
  }
  const onToggle = (m: MethodId) => { if (m !== 'kanban') setMethods((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m])) }
  const onRule = setFocusRule
  const onDay = setReviewDay
  const view = { ...project, methods, focusRule, reviewDay }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (confirm) setConfirm(null); else leave(onClose) } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const ready = METHODS.filter((m) => m.ready)
  const soon = METHODS.filter((m) => !m.ready && !m.elsewhere)
  const elsewhere = METHODS.filter((m) => m.elsewhere)
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#080E22]/40" onMouseDown={() => leave(onClose)}>
      <div role="dialog" aria-label="Configurações do projeto" className="anim-slide-in relative flex h-full w-[520px] max-w-full flex-col border-l border-line-strong bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-line px-6 py-5">
          <div className="flex flex-1 flex-col gap-1"><span className="font-mono text-[11px] tracking-[0.16em] text-link">CONFIGURAR PROJETO</span><h2 className="font-serif text-[22px] leading-tight">{project.name}</h2></div>
          <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={() => leave(onClose)} />
        </header>
        {confirm && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[#080E22]/30 p-6">
            <div role="alertdialog" aria-label="Descartar mudanças?" className="anim-rise flex w-[380px] max-w-full flex-col gap-3 rounded-xl border border-line-strong bg-card p-5 shadow-2xl">
              <h3 className="text-[16px] font-semibold">Salvar as mudanças?</h3>
              <p className="text-[13.5px] text-muted">Você mudou as configurações deste projeto e ainda não salvou.</p>
              {/* empilhados: a ação principal no topo, a destrutiva no meio, voltar por último */}
              <div className="mt-1 grid gap-2 [&>button]:w-full">
                <Button variant="primary" onClick={() => { setConfirm(null); void save() }}>Salvar e fechar</Button>
                <Button onClick={() => { const then = confirm; setConfirm(null); then() }}>Descartar mudanças</Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>Continuar editando</Button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <Section title="Métodos de organização" sub="Cada método é uma forma diferente de ver as mesmas tarefas. Ligue os que ajudam e eles aparecem como abas no topo do projeto.">
            <ul className="flex flex-col gap-2">
              {ready.map((m) => {
                const on = view.methods.includes(m.id as MethodId)
                const open = help === m.id
                return (
                  <li key={m.id} className={`rounded-xl border ${on ? 'border-line-strong' : 'border-line'}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-semibold">{m.name}</span>
                        <span className="text-[12.5px] text-muted">{m.what}</span>
                        <button type="button" onClick={() => setHelp(open ? null : m.id)} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 self-start text-[12.5px] text-link hover:underline">
                          <HelpCircle size={13} />{open ? 'Fechar explicação' : 'Como funciona?'}
                        </button>
                      </div>
                      <Switch on={on} disabled={m.id === 'kanban'} label={m.name} onClick={() => onToggle(m.id as MethodId)} />
                    </div>
                    {open && <div className="border-t border-line px-4 py-4"><GuideBlock guide={m.guide} compact /></div>}
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
              <span className="text-[12.5px] font-semibold text-muted">Em outras telas do app, para todos os projetos</span>
              {elsewhere.map((m) => (
                <details key={m.id}><summary className="cursor-pointer text-[13.5px]"><b className="font-semibold">{m.name}</b> <span className="text-muted">· {m.elsewhere}</span></summary>
                  <div className="pt-3 pl-1"><GuideBlock guide={m.guide} compact /></div></details>
              ))}
            </div>
            <details className="rounded-xl border border-dashed border-line-strong px-4 py-3">
              <summary className="cursor-pointer text-[13.5px] font-medium">Em breve: {soon.map((m) => m.name).join(', ')}</summary>
              <ul className="flex flex-col gap-3 pt-3">
                {soon.map((m) => (
                  <li key={m.id}><details><summary className="cursor-pointer text-[13.5px]"><b className="font-semibold">{m.name}</b> <span className="text-muted">· {m.what}</span></summary>
                    <div className="pt-3 pl-1"><GuideBlock guide={m.guide} compact /></div></details></li>
                ))}
              </ul>
            </details>
          </Section>

          {view.methods.includes('foco') && (
            <Section title="Regra do Foco do dia" sub="Quantas tarefas cabem no seu dia e em que formato.">
              <div role="radiogroup" aria-label="Regra do foco" className="flex flex-col gap-2">
                {FOCUS_RULES.map((r) => {
                  const on = r.id === view.focusRule
                  const open = help === `rule-${r.id}`
                  return (
                    <div key={r.id} className={`rounded-xl ${on ? 'border-2 border-accent' : 'border border-line'}`}>
                      <button type="button" role="radio" aria-checked={on} onClick={() => onRule(r.id)} className="flex w-full items-start gap-3 px-4 pt-3 text-left">
                        <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border ${on ? 'border-accent' : 'border-line-strong'}`}>{on && <span className="size-2 rounded-full bg-accent" />}</span>
                        <span className="flex flex-col gap-0.5"><b className="text-[14px] font-semibold">{r.title}</b><span className="text-[12.5px] text-muted">{r.hint}</span></span>
                      </button>
                      <button type="button" onClick={() => setHelp(open ? null : `rule-${r.id}`)} aria-expanded={open} className="ml-11 inline-flex items-center gap-1 pb-3 pt-1 text-[12.5px] text-link hover:underline">
                        <HelpCircle size={13} />{open ? 'Fechar explicação' : 'Como funciona?'}
                      </button>
                      {open && <div className="border-t border-line px-4 py-4"><GuideBlock guide={r.guide} compact /></div>}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          <Section title="Ritual: revisão semanal" sub="Um lembrete fixo para olhar o projeto inteiro e decidir a semana seguinte.">
            <label className="flex flex-col gap-1 text-[13px] text-muted">Dia da revisão
              <select value={view.reviewDay ?? ''} onChange={(e) => onDay(e.target.value === '' ? null : +e.target.value)} className={field}>
                <option value="">Sem revisão</option>{WEEKDAYS.map((w, i) => <option key={w} value={i}>Toda {w}</option>)}
              </select></label>
            <button type="button" onClick={() => setHelp(help === 'review' ? null : 'review')} aria-expanded={help === 'review'} className="inline-flex items-center gap-1 self-start text-[12.5px] text-link hover:underline">
              <HelpCircle size={13} />{help === 'review' ? 'Fechar explicação' : 'Como fazer a revisão?'}
            </button>
            {help === 'review' && <div className="rounded-xl border border-line p-4"><GuideBlock guide={REVIEW_GUIDE} compact /></div>}
          </Section>

          <Section title="PARA e conhecimento" sub="Em que gaveta este projeto fica na visão PARA, e qual pasta da sua base de conhecimento guarda as notas dele.">
            <div role="radiogroup" aria-label="Gaveta" className="flex flex-wrap gap-1.5">
              {([['project', 'Projeto', 'tem fim e prazo'], ['area', 'Área', 'não acaba'], ['resource', 'Recurso', 'assunto de consulta']] as const).map(([k, l, h]) => (
                <button key={k} type="button" role="radio" aria-checked={paraKind === k} onClick={() => setParaKind(k)}
                  className={`flex flex-col rounded-xl px-3.5 py-2 text-left ${paraKind === k ? 'border-2 border-accent' : 'border border-line hover:border-line-strong'}`}>
                  <b className="text-[13.5px] font-semibold">{l}</b><span className="text-[12px] text-muted">{h}</span></button>
              ))}
            </div>
            <label className="flex flex-col gap-1 text-[13px] text-muted">Pasta na base de conhecimento (opcional)
              <input value={brainPath} onChange={(e) => setBrainPath(e.target.value)} placeholder="projetos/site-padaria-sol" className={`${field} font-mono text-[13px]`} /></label>
            <span className="text-[12px] text-faint">Caminho dentro da base. Nada é movido.</span>
          </Section>

          <Section title="Quadro e projeto">
            <div className="flex flex-wrap gap-2">
              <Button icon={Settings2} onClick={() => leave(onColumns)}>Editar colunas</Button>
              <Button icon={Save} onClick={() => setSavingTpl(true)}>Salvar como modelo</Button>
              <Button variant="ghost" icon={project.archived ? ArchiveRestore : Archive} onClick={onArchive}>{project.archived ? 'Restaurar projeto' : 'Arquivar projeto'}</Button>
            </div>
          </Section>
        </div>
        {savingTpl && <SaveTemplate project={project} board={board} draft={{ methods, focusRule, reviewDay }} onClose={() => setSavingTpl(false)} />}
        <footer className="flex items-center gap-2 border-t border-line px-6 py-3.5">
          <span className="flex-1 text-[12.5px] text-muted" role="status">{error ? <span className={LATE}>{error}</span> : dirty ? 'Mudanças não salvas' : 'Nada mudou'}</span>
          <Button variant="ghost" onClick={() => leave(onClose)}>Cancelar</Button>
          <Button variant="primary" icon={Check} onClick={() => void save()} disabled={!dirty || busy}>Salvar</Button>
        </footer>
      </div>
    </div>
  )
}

// ---------- Seletor de projeto no cabeçalho (Projetos / Nome ▾) ----------
function ProjectPicker({ projects, pid, scopeName, onPick, onNew }: { projects: Project[]; pid: number | null; scopeName: (s: string) => string; onPick: (id: number) => void; onNew: () => void }) {
  const [open, setOpen] = useState(false)
  const current = projects.find((p) => p.id === pid)
  const groups = [...new Set(projects.filter((p) => !p.archived).map((p) => p.scope))]
  const archived = projects.filter((p) => p.archived)
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [open])
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" className="flex min-w-0 max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-raised">
        <span className="truncate font-serif text-[26px] leading-tight">{current?.name ?? 'Escolha um projeto'}</span>
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onMouseDown={() => setOpen(false)} />
          <div className="anim-rise absolute top-12 left-0 z-40 flex max-h-[70vh] w-72 flex-col overflow-y-auto rounded-xl border border-line-strong bg-card p-1.5 shadow-2xl" style={{ animationDuration: '.2s' }}>
            {groups.map((g) => (
              <div key={g} className="flex flex-col">
                <p className="px-2.5 pt-2 pb-1 text-[12px] text-faint">{scopeName(g)}</p>
                {projects.filter((p) => p.scope === g && !p.archived).map((p) => (
                  <button key={p.id} type="button" onClick={() => { onPick(p.id); setOpen(false) }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] hover:bg-raised ${p.id === pid ? 'text-fg' : 'text-muted'}`}>
                    <FolderKanban size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.open > 0 && <span className="text-[11.5px] text-faint">{p.open}</span>}
                  </button>
                ))}
              </div>
            ))}
            {archived.length > 0 && (
              <details className="px-2.5 pt-2 text-[12.5px] text-faint"><summary className="cursor-pointer py-1">Arquivados ({archived.length})</summary>
                {archived.map((p) => <button key={p.id} type="button" onClick={() => { onPick(p.id); setOpen(false) }} className="block w-full truncate rounded px-1 py-1 text-left hover:text-fg">{p.name}</button>)}</details>
            )}
            <div className="mt-1.5 border-t border-line p-1.5 pt-2.5"><Button variant="primary" icon={Plus} onClick={() => { setOpen(false); onNew() }}>Novo projeto</Button></div>
          </div>
        </>
      )}
    </div>
  )
}

// Aviso do ritual: só aparece no dia da revisão, até ela ser marcada como feita.
function ReviewBanner({ project, onDone, onHow }: { project: Project; onDone: () => void; onHow: () => void }) {
  if (project.reviewDay == null || project.reviewAt === today()) return null
  if (nextReview(project.reviewDay, project.reviewAt).inDays !== 0) return null
  return (
    <div className="anim-rise flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/50 px-4 py-3 text-[13.5px]">
      <span className="font-mono text-[10.5px] tracking-[0.14em] text-link">RITUAL</span>
      <span className="flex-1">Hoje é dia da revisão semanal. 10 minutos: o que fechou, o que travou, o que entra.</span>
      <button type="button" onClick={onHow} className="text-[13px] text-link hover:underline">Como fazer?</button>
      <Button variant="primary" icon={Check} onClick={onDone}>Fiz a revisão</Button>
    </div>
  )
}

const VIEWS: MethodId[] = ['kanban', 'lista', 'cronograma', 'scrum', 'okr', 'shapeup', 'priorizacao', 'gtd', 'foco', 'eisenhower']
type View = MethodId | 'resumo'
const VIEW_TITLE: Record<View, string> = { resumo: 'Resumo', kanban: 'Quadro', lista: 'Lista', gtd: 'GTD', scrum: 'Sprint', okr: 'OKR', shapeup: 'Morro', priorizacao: 'Priorização', cronograma: 'Cronograma', foco: 'Foco do dia', eisenhower: 'Eisenhower' }

// ---------- Página ----------
export function Projects() {
  const scopes = useScopes()
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [open, setOpen] = useState<Task | null>(null)
  const [editCols, setEditCols] = useState(false)
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pid = Number(params.get('p')) || null
  const project = projects.find((p) => p.id === pid) ?? null
  const wanted = (params.get('v') as View | null) ?? 'kanban'
  // Resumo é fixo em todo projeto; as outras abas dependem dos métodos ligados
  const view: View = wanted === 'resumo' || (project && project.methods.includes(wanted as MethodId)) ? wanted : 'kanban'
  const go = (p: number, v?: View) => setParams(v && v !== 'kanban' ? { p: String(p), v } : { p: String(p) })

  const loadProjects = () => call<Project[]>('projects_list').then(setProjects).catch((e) => setError(message(e)))
  const loadBoard = (id = pid) => (id ? call<Board>('board_get', { projectId: id }).then(setBoard).catch((e) => setError(message(e))) : Promise.resolve(setBoard(null)))
  useEffect(() => { loadProjects() }, [])
  useEffect(() => { loadBoard() }, [pid]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pid && projects.length) { const first = projects.find((p) => !p.archived); if (first) setParams({ p: String(first.id) }, { replace: true }) } }, [projects, pid, setParams])

  const refresh = async () => { await Promise.all([loadBoard(), loadProjects()]) }
  const create = async (name: string, scope: string, setup: MethodSetup, starters: string[] = []) => {
    const id = await call<number>('project_save', { id: null, scope, name, description: '', setup })
    for (const title of starters) await call('task_save', { task: newTask(id, null, title) })
    await loadProjects(); setOpen(null); setCreating(false)
    go(id, setup.preset === 'dia-a-dia' ? 'foco' : undefined)
  }
  const setMethods = async (patch: Partial<MethodSetup>) => {
    if (!project) return
    const setup: MethodSetup = { methods: project.methods, focusRule: project.focusRule, reviewDay: project.reviewDay, ...patch }
    try { await call('project_methods', { id: project.id, setup }); await loadProjects() } catch (e) { setError(message(e)) }
  }
  const saveTask = async (t: Task) => { await call('task_save', { task: t }); await refresh() }
  const quickSave = async (t: Task) => { try { await saveTask(t) } catch (e) { setError(message(e)) } }
  const addTask = async (col: Column, title: string) => { if (pid) { await call('task_save', { task: newTask(pid, col.id, title) }); await refresh() } }
  const moveTask = async (id: number, colId: number, ord: number) => { await call('task_move', { id, columnId: colId, ord }).catch((e) => setError(message(e))); await refresh() }
  const deleteTask = async (t: Task) => { await call('task_delete', { id: t.id }); await refresh() }
  const logTime = async (id: number, minutes: number) => { await call('task_log_time', { id, minutes }).catch((e) => setError(message(e))); await loadBoard() }
  const scopeName = (s: string) => scopes.find((x) => x.id === s)?.name ?? s.replace(/^org:/, '')
  const pick = (id: number) => { setOpen(null); go(id) }
  // Depois de salvar/mover, o painel mostra a versão nova da tarefa aberta.
  const openTask = open && board ? board.tasks.find((x) => x.id === open.id) ?? open : open
  const tabs: View[] = ['resumo', ...VIEWS.filter((v) => project?.methods.includes(v))]
  const para = params.get('para') === '1'
  const moveDrawer = async (p: Project, to: ParaKind | 'archive') => {
    try {
      if (to === 'archive') await call('project_archive', { id: p.id, archived: true })
      else { if (p.archived) await call('project_archive', { id: p.id, archived: false }); await call('project_para', { id: p.id, kind: to, brainPath: p.brainPath }) }
      await loadProjects()
    } catch (e) { setError(message(e)) }
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {error && <p className={`text-[13px] ${LATE}`} role="alert">{error} <button type="button" onClick={() => setError(null)} className="underline">ok</button></p>}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-[min(100%,380px)] flex-1 items-center gap-2 overflow-hidden">
            <h1 className="shrink-0 font-mono text-[11px] tracking-[0.18em] text-muted">PROJETOS /</h1>
            <ProjectPicker projects={projects} pid={pid} scopeName={scopeName} onPick={pick} onNew={() => setCreating(true)} />
            {project && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11.5px] text-muted">{scopeName(project.scope)}</span>}
          </div>
          <Button variant={para ? 'primary' : 'secondary'} onClick={() => setParams(para ? (pid ? { p: String(pid) } : {}) : { ...(pid ? { p: String(pid) } : {}), para: '1' })}
            title="Todos os projetos de todos os escopos em projetos, áreas, recursos e arquivo">{para ? 'Voltar ao projeto' : 'Visão PARA'}</Button>
          {project && !para && (
            <>
              {tabs.length > 1 && (
                <div role="tablist" aria-label="Visões do projeto" className="inline-flex gap-1 rounded-lg border border-line-strong p-1">
                  {tabs.map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => go(project.id, v)}
                      className={`inline-flex h-8 items-center rounded-md px-3 text-[13.5px] ${view === v ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{VIEW_TITLE[v]}</button>
                  ))}
                </div>
              )}
              <Button icon={Settings2} onClick={() => setSettings(true)} title="Métodos, regra do foco, ritual e colunas">Configurar</Button>
            </>
          )}
        </header>
        {para ? (
          <ParaView projects={projects} scopeName={scopeName} onOpen={(id) => { setOpen(null); setParams({ p: String(id) }) }} onMove={(p, to) => void moveDrawer(p, to)} />
        ) : !project ? (
          <EmptyState icon={FolderKanban} title="Nenhum projeto ainda" body="Crie um projeto e escolha como organizá-lo. Cada modelo vem com uma explicação de como usar e quando vale a pena.">
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo projeto</Button>
          </EmptyState>
        ) : (
          <>
            <ReviewBanner project={project} onHow={() => setSettings(true)} onDone={() => call('project_review_done', { id: project.id, day: today() }).then(loadProjects).catch((e) => setError(message(e)))} />
            {view !== 'foco' && view !== 'resumo' && <p className="flex items-center gap-4 text-[12.5px] text-muted"><span><Flag size={12} className="mr-1 inline" />{project.open} aberta{project.open === 1 ? '' : 's'}</span><span>{project.done} concluída{project.done === 1 ? '' : 's'}</span></p>}
            {(view === 'kanban' || view === 'lista') && <HowItWorks id={view} title={methodName(view)} guide={method(view)!.guide} />}
            {board && (
              view === 'resumo' ? <SummaryView project={project} board={board} onError={(e) => setError(message(e))} />
              : view === 'lista' ? <ListView board={board} onOpen={setOpen} />
              : view === 'foco' ? <FocusView project={project} board={board} onOpen={setOpen} onSave={quickSave} onMove={moveTask} onRule={(r) => void setMethods({ focusRule: r })} onLog={logTime} />
              : view === 'eisenhower' ? <MatrixView board={board} onOpen={setOpen} onSave={quickSave} />
              : view === 'scrum' ? <ScrumView project={project} board={board} okrOn={project.methods.includes('okr')} onOpen={setOpen} onSave={quickSave} onError={(e) => setError(message(e))} onRefresh={refresh}
                  renderBoard={(tasks, sprintId, badgeOf) => (
                    <BoardView board={{ ...board, tasks }} selectedId={openTask?.id ?? null} onOpen={setOpen} onMove={moveTask} badgeOf={badgeOf}
                      onAdd={async (col, title) => { await call('task_save', { task: { ...newTask(project.id, col.id, title), sprintId } }); await refresh() }} />
                  )} />
              : view === 'shapeup' ? <ShapeUpView project={project} board={board} onError={(e) => setError(message(e))} />
              : view === 'priorizacao' ? <PriorityView board={board} onSave={quickSave} onOpen={setOpen} />
              : view === 'cronograma' ? <GanttView project={project} board={board} onSave={quickSave} onOpen={setOpen} />
              : view === 'okr' ? <OkrView project={project} board={board} onOpen={setOpen} onError={(e) => setError(message(e))} />
              : view === 'gtd' ? <GtdView project={project} board={board} onOpen={setOpen} onSave={quickSave} onMove={moveTask}
                  onDelete={async (t) => { try { await deleteTask(t) } catch (e) { setError(message(e)) } }}
                  onAdd={async (title) => { try { await saveTask({ ...newTask(project.id, null, title), gtdList: 'inbox' }) } catch (e) { setError(message(e)) } }} />
              : <BoardView board={board} selectedId={openTask?.id ?? null} onOpen={setOpen} onAdd={addTask} onMove={moveTask} />
            )}
          </>
        )}
      </section>

      {openTask && board && project && <TaskPanel key={`${openTask.id}`} task={openTask} board={board} project={project} onSave={saveTask} onDelete={deleteTask} onClose={() => setOpen(null)} />}
      {editCols && board && pid && <ColumnsEditor board={board} onClose={() => setEditCols(false)} onSave={async (cols) => { setBoard(await call<Board>('columns_save', { projectId: pid, columns: cols })); await loadProjects() }} />}
      {creating && <NewProject onCreate={create} onClose={() => setCreating(false)} />}
      {settings && project && (
        <ProjectSettings project={project} board={board} onSave={async (s, para) => { await call('project_methods', { id: project.id, setup: s }); await call('project_para', { id: project.id, kind: para.kind, brainPath: para.brainPath }); await loadProjects() }}
          onColumns={() => { setSettings(false); setEditCols(true) }}
          onArchive={() => call('project_archive', { id: project.id, archived: !project.archived }).then(loadProjects)} onClose={() => setSettings(false)} />
      )}
    </div>
  )
}
