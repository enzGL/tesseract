import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Check, ChevronLeft, ChevronRight, Clock, Lock, Plus, X } from 'lucide-react'
import { Button } from '../components/ui'
import { HowItWorks } from '../components/Guide'
import { call, message, newTask, type CalTask, type Project } from '../data/api'
import { method } from '../data/methods'
import { IcsButton } from '../components/ExportCard'
import { openActivation, useLicense } from '../data/license'

// Calendário (fase 4C). Desenho: a semana com horários (B) como visão principal,
// o resumo do dia (A) num painel ao clicar no dia e a linha do tempo dos projetos (C) como segunda aba.

const START = 7, END = 21, ROW = 44 // agenda das 7h às 21h, 44 px por hora
const SNAP = 30 // minutos
const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const PALETTE = ['#2238C4', '#C2410C', '#1D6B45', '#7C3AED', '#0E7490', '#B45309', '#BE185D', '#4D7C0F']
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const startOfWeek = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), -d.getDay())
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const hLabel = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`)
const startMin = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16))
const cssColor = (c: string) => ({ '--c': c }) as CSSProperties
const longDate = (s: string) => parse(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
const weekday = (s: string) => parse(s).toLocaleDateString('pt-BR', { weekday: 'long' })
const blockLen = (t: CalTask['task']) => t.schedMin ?? Math.min(480, Math.max(30, t.estimateMin ?? 60))

// ---------- Peças arrastáveis ----------
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
const durOptions = (len: number) => [...new Set([...DURATIONS, len])].sort((a, b) => a - b)
const field = 'h-8 rounded-md border border-line-strong bg-raised px-2 text-[12.5px] outline-none focus:border-accent'

// Formulário de horário digitado: dia, hora de início e duração. Alternativa ao arrastar.
function TimeForm({ day, len, onSubmit, onCancel, withDay = true }: { day: string; len: number; onSubmit: (start: string, minutes: number) => void; onCancel?: () => void; withDay?: boolean }) {
  const [d, setD] = useState(day)
  const [t, setT] = useState('09:00')
  const [m, setM] = useState(len)
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(t)
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(`${d}T${t}`, m) }}>
      <div className="flex flex-wrap gap-1.5">
        {withDay && <label className="flex-1"><span className="sr-only">Dia</span><input type="date" value={d} onChange={(e) => setD(e.target.value)} className={`${field} w-full`} /></label>}
        <label><span className="sr-only">Hora de início</span><input type="time" step={900} value={t} onChange={(e) => setT(e.target.value)} className={`${field} w-[92px]`} /></label>
        <label><span className="sr-only">Duração</span>
          <select value={m} onChange={(e) => setM(+e.target.value)} className={field}>{durOptions(len).map((x) => <option key={x} value={x}>{fmtDur(x)}</option>)}</select></label>
      </div>
      <div className="flex gap-1.5">
        <button type="submit" disabled={!ok} className="h-8 rounded-md bg-accent px-3 text-[12.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50">Pôr na agenda</button>
        {onCancel && <button type="button" onClick={onCancel} className="h-8 rounded-md px-2 text-[12.5px] text-muted hover:text-fg">Cancelar</button>}
      </div>
    </form>
  )
}

function TrayItem({ x, color, day, onSchedule }: { x: CalTask; color: string; day: string; onSchedule: (start: string, minutes: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `u-${x.task.id}` })
  const [typing, setTyping] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="cal-block flex items-start gap-1 rounded-[9px] border text-[12.5px]" style={{ ...cssColor(color), opacity: isDragging ? 0.4 : 1 }}>
        <div ref={setNodeRef} {...attributes} {...listeners} aria-label={`Arrastar ${x.task.title} para a agenda`} className="min-w-0 flex-1 cursor-grab py-2 pl-2.5 active:cursor-grabbing">
          <span className="block truncate font-medium">{x.task.title}</span>
          <span className="block truncate text-[11.5px] text-muted">{fmtDur(blockLen(x.task))} · {x.project}{x.task.due ? ` · prazo ${parse(x.task.due).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}</span>
        </div>
        <button type="button" onClick={() => setTyping((v) => !v)} aria-expanded={typing} aria-label={`Digitar horário para ${x.task.title}`} title="Digitar o horário"
          className={`mt-1.5 mr-1.5 grid size-7 shrink-0 place-items-center rounded-md hover:bg-raised ${typing ? 'text-link' : 'text-muted'}`}><Clock size={14} /></button>
      </div>
      {typing && <div className="rounded-[9px] border border-line bg-card p-2"><TimeForm day={day} len={blockLen(x.task)} onCancel={() => setTyping(false)} onSubmit={(s, m) => { setTyping(false); onSchedule(s, m) }} /></div>}
    </div>
  )
}

function Block({ x, color, onPick }: { x: CalTask; color: string; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `b-${x.task.id}` })
  const s = startMin(x.task.schedStart!), len = x.task.schedMin ?? 60
  const top = ((s - START * 60) / 60) * ROW, height = Math.max(18, (len / 60) * ROW - 3)
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onPick} aria-label={`${x.task.title}, ${hm(s)} a ${hm(s + len)}`}
      style={{ ...cssColor(color), top, height, opacity: isDragging ? 0.35 : 1 }}
      className={`cal-block absolute inset-x-1 flex cursor-grab flex-col overflow-hidden rounded-[7px] border px-2 py-1 text-[11.5px] leading-tight active:cursor-grabbing ${x.done ? 'opacity-60 line-through' : ''}`}>
      <b className="truncate font-semibold">{x.task.title}</b>
      {height > 30 && <span className="truncate text-muted">{hm(s)}–{hm(s + len)}</span>}
    </div>
  )
}

function DayColumn({ day, items, colorOf, today, onPick }: { day: string; items: CalTask[]; colorOf: (pid: number) => string; today: boolean; onPick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` })
  const now = new Date()
  const nowTop = ((now.getHours() * 60 + now.getMinutes() - START * 60) / 60) * ROW
  return (
    <div ref={setNodeRef} className={`cal-hours relative border-l border-line ${today ? 'bg-accent-soft/25' : ''} ${isOver ? 'bg-accent-soft/50' : ''}`} style={{ height: (END - START) * ROW }}>
      {items.map((x) => <Block key={x.task.id} x={x} color={colorOf(x.task.projectId)} onPick={onPick} />)}
      {today && nowTop >= 0 && nowTop <= (END - START) * ROW && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-[#E5484D]" style={{ top: nowTop }} />}
    </div>
  )
}

function Tray({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' })
  return <div ref={setNodeRef} className={`flex flex-col gap-1.5 rounded-lg p-1 -m-1 transition-colors ${isOver ? 'bg-accent-soft/50' : ''}`}>{children}</div>
}

// ---------- Mês pequeno ----------
function MiniMonth({ anchor, week, onPick }: { anchor: Date; week: string[]; onPick: (d: Date) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
  const start = addDays(first, -first.getDay())
  const cells = [...Array(42).keys()].map((i) => addDays(start, i))
  const todayIso = iso(new Date())
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold capitalize">{anchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="text-faint">{d}</span>)}
        {cells.map((d) => {
          const s = iso(d), out = d.getMonth() !== anchor.getMonth()
          return (
            <button key={s} type="button" onClick={() => onPick(d)} aria-label={longDate(s)}
              className={`rounded-md py-1 ${s === todayIso ? 'bg-accent font-semibold text-on-accent' : week.includes(s) ? 'bg-accent-soft text-fg' : out ? 'text-faint hover:bg-raised' : 'hover:bg-raised'}`}>{d.getDate()}</button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Resumo do dia (direção A) ----------
function DayPanel({ day, items, tray, projects, colorOf, onClose, onChanged, onError }: {
  day: string; items: CalTask[]; tray: CalTask[]; projects: Project[]; colorOf: (pid: number) => string
  onClose: () => void; onChanged: () => void; onError: (e: unknown) => void
}) {
  const [pickId, setPickId] = useState<number | null>(tray[0]?.task.id ?? null)
  const picked = tray.find((x) => x.task.id === pickId) ?? tray[0]
  const blocks = items.filter((x) => x.task.schedStart?.startsWith(day)).sort((a, b) => a.task.schedStart!.localeCompare(b.task.schedStart!))
  const dues = items.filter((x) => x.task.due === day)
  const booked = blocks.reduce((s, x) => s + (x.task.schedMin ?? 0), 0)
  const estimated = dues.filter((x) => !x.done).reduce((s, x) => s + (x.task.estimateMin ?? 0), 0)
  const active = projects.filter((p) => !p.archived)
  const [title, setTitle] = useState('')
  const [pid, setPid] = useState<number | null>(active[0]?.id ?? null)
  const add = async () => {
    if (!title.trim() || !pid) return
    try { await call('task_save', { task: { ...newTask(pid, null, title.trim()), due: day } }); setTitle(''); onChanged() } catch (e) { onError(e) }
  }
  const sched = (id: number, start: string | null, minutes?: number) => call('task_schedule', { id, start, minutes: minutes ?? null }).then(onChanged).catch(onError)
  return (
    <aside aria-label={`Resumo de ${longDate(day)}`} className="anim-slide-in flex w-[320px] shrink-0 flex-col border-l border-line bg-card">
      <header className="flex items-start gap-2 px-5 pt-5 pb-3">
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-mono text-[11px] tracking-[0.14em] text-link uppercase">{weekday(day)}</span>
          <h2 className="font-serif text-[22px] leading-tight">{longDate(day)}</h2>
          <span className="text-[12.5px] text-muted">{dues.length} prazo{dues.length === 1 ? '' : 's'} · {fmtDur(booked)} na agenda{estimated ? ` · ${fmtDur(estimated)} estimadas` : ''}</span>
        </div>
        <Button variant="ghost" icon={X} ariaLabel="Fechar resumo do dia" onClick={onClose} />
      </header>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
        <section className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-muted">Na agenda</span>
          {blocks.length === 0 && <p className="text-[12.5px] text-faint">Nada com horário. Arraste uma tarefa da esquerda para a coluna do dia, ou digite o horário abaixo.</p>}
          {picked && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line-strong p-3">
              <span className="text-[12px] font-semibold text-muted">Pôr uma tarefa na agenda deste dia</span>
              <label><span className="sr-only">Tarefa</span>
                <select value={picked.task.id!} onChange={(e) => setPickId(+e.target.value)} className={`${field} w-full`}>
                  {tray.map((x) => <option key={x.task.id} value={x.task.id!}>{x.task.title} · {x.project}</option>)}
                </select></label>
              <TimeForm key={picked.task.id} day={day} withDay={false} len={blockLen(picked.task)} onSubmit={(start, minutes) => void sched(picked.task.id!, start, minutes)} />
            </div>
          )}
          {blocks.map((x) => {
            const s = startMin(x.task.schedStart!), len = x.task.schedMin ?? 60
            return (
              <div key={x.task.id} className="cal-block flex flex-col gap-1.5 rounded-[10px] border px-3 py-2.5" style={cssColor(colorOf(x.task.projectId))}>
                <span className="font-mono text-[11.5px] text-muted">{hm(s)}–{hm(s + len)}</span>
                <b className={`text-[13.5px] font-semibold ${x.done ? 'line-through opacity-70' : ''}`}>{x.task.title}</b>
                <span className="text-[12px] text-muted">{x.project} · {x.column}</span>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <label className="text-[12px] text-muted"><span className="sr-only">Hora de início</span>
                    <input type="time" step={900} defaultValue={hm(s)} key={x.task.schedStart}
                      onBlur={(e) => { const v = e.target.value; if (/^\d{2}:\d{2}$/.test(v) && v !== hm(s)) void sched(x.task.id!, `${day}T${v}`, len) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="h-7 w-[86px] rounded-md border border-line-strong bg-raised px-1.5 text-[12px]" /></label>
                  <label className="text-[12px] text-muted"><span className="sr-only">Duração</span>
                    <select value={len} onChange={(e) => sched(x.task.id!, x.task.schedStart, +e.target.value)} className="h-7 rounded-md border border-line-strong bg-raised px-1.5 text-[12px]">
                      {durOptions(len).map((m) => <option key={m} value={m}>{fmtDur(m)}</option>)}
                    </select></label>
                  <button type="button" onClick={() => sched(x.task.id!, null)} className="text-[12px] text-muted hover:text-fg">Tirar do horário</button>
                  <span className="flex-1" />
                  <Link to={`/projetos?p=${x.task.projectId}`} className="text-[12px] text-link hover:underline">Projeto</Link>
                </div>
              </div>
            )
          })}
        </section>
        <section className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-muted">Prazos do dia</span>
          {dues.length === 0 && <p className="text-[12.5px] text-faint">Nenhuma tarefa vence neste dia.</p>}
          {dues.map((x) => (
            <div key={x.task.id} className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 ${x.done ? 'kcard-done' : 'kcard'}`}>
              {x.task.milestone
                ? <span className="mt-1.5 size-2.5 shrink-0 rotate-45" style={{ background: colorOf(x.task.projectId) }} title="Marco" />
                : <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: colorOf(x.task.projectId) }} />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className={`text-[13.5px] font-semibold ${x.done ? 'text-ok line-through' : ''}`}>{x.task.title}</b>
                <span className="text-[12px] text-muted">{x.project} · {x.done ? <span className="inline-flex items-center gap-0.5 text-ok"><Check size={11} />{x.column}</span> : x.column}{x.task.estimateMin ? ` · ${fmtDur(x.task.estimateMin)}` : ''}</span>
              </span>
              <Link to={`/projetos?p=${x.task.projectId}`} className="text-[12px] text-link hover:underline">Abrir</Link>
            </div>
          ))}
        </section>
        <form className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line-strong p-3" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <span className="text-[12px] font-semibold text-muted">Tarefa com prazo neste dia</span>
          {active.length === 0
            ? <p className="text-[12.5px] text-faint">Crie um projeto primeiro, em <Link to="/projetos" className="text-link">Projetos</Link>.</p>
            : <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ficar pronto?" aria-label="Título da tarefa" className="h-9 rounded-lg border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-accent" />
              <div className="flex gap-2">
                <select value={pid ?? ''} onChange={(e) => setPid(+e.target.value)} aria-label="Projeto" className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-raised px-2 text-[13px]">
                  {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button type="submit" variant="primary" icon={Plus} disabled={!title.trim()}>Criar</Button>
              </div>
            </>}
        </form>
      </div>
    </aside>
  )
}

// ---------- Linha do tempo (direção C) ----------
function Timeline({ start, items, projects, colorOf }: { start: Date; items: CalTask[]; projects: Project[]; colorOf: (pid: number) => string }) {
  const DAYS = 42
  const pos = (s: string) => (Math.round((parse(s).getTime() - start.getTime()) / 864e5) + 0.5) / DAYS * 100
  const todayPos = pos(iso(new Date()))
  const weeks = [...Array(6).keys()].map((i) => addDays(start, i * 7))
  const label = (d: Date) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
  const rows = projects.filter((p) => !p.archived).map((p) => {
    const dated = items.filter((x) => x.task.projectId === p.id && x.task.due).sort((a, b) => a.task.due!.localeCompare(b.task.due!))
    return { p, dated, first: dated[0]?.task.due, last: dated[dated.length - 1]?.task.due }
  }).sort((a, b) => (a.first ?? '9999').localeCompare(b.first ?? '9999'))
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card">
      <div className="grid grid-cols-[180px_repeat(6,minmax(0,1fr))] border-b border-line font-mono text-[10.5px] tracking-[0.1em] text-faint uppercase">
        <span className="px-3 py-2.5">Projeto</span>
        {weeks.map((w) => <span key={iso(w)} className="border-l border-line px-2 py-2.5">{label(w)}–{label(addDays(w, 6))}</span>)}
      </div>
      <div className="relative flex-1 overflow-y-auto">
        {rows.length === 0 && <p className="px-4 py-10 text-center text-[13.5px] text-muted">Nenhum projeto ativo. Crie um em <Link to="/projetos" className="text-link">Projetos</Link>.</p>}
        {rows.map(({ p, dated, first, last }) => {
          const color = colorOf(p.id)
          return (
            <div key={p.id} className="grid min-h-[92px] grid-cols-[180px_minmax(0,1fr)] border-b border-line/70">
              <div className="flex flex-col gap-1 border-r border-line px-3 py-3.5">
                <Link to={`/projetos?p=${p.id}`} className="flex items-center gap-2 text-[13.5px] font-semibold hover:underline"><span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} /><span className="truncate">{p.name}</span></Link>
                <span className="text-[11.5px] text-muted">{p.open} aberta{p.open === 1 ? '' : 's'}{last ? ` · até ${parse(last).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}` : ' · sem prazos aqui'}</span>
              </div>
              <div className="cal-weeks relative">
                {first && last && (
                  <span className="cal-bar absolute top-[18px] h-[22px] rounded-md border" style={{ ...cssColor(color), left: `${pos(first) - 0.6}%`, width: `${Math.max(1.2, pos(last) - pos(first) + 1.2)}%` }} />
                )}
                {dated.map((x) => (
                  x.task.milestone ? (
                    <span key={x.task.id} className="absolute top-[22px]" style={{ left: `${pos(x.task.due!)}%` }}>
                      <span className="absolute -left-[7px] block size-[14px] rotate-45 border-2 border-card" style={{ background: color }} title={`Marco: ${x.task.title}`} />
                      <span className="absolute top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold" style={{ color }}>{x.task.title}</span>
                    </span>
                  ) : (
                    <span key={x.task.id} title={`${x.task.title} · ${longDate(x.task.due!)}${x.done ? ' · feita' : ''}`}
                      className="absolute top-[25px] -ml-1 size-2 rounded-full border border-card" style={{ left: `${pos(x.task.due!)}%`, background: x.done ? 'var(--t-ok)' : color }} />
                  )
                ))}
              </div>
            </div>
          )
        })}
        {todayPos > 0 && todayPos < 100 && (
          <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: `calc(180px + (100% - 180px) * ${todayPos / 100})` }}>
            <span className="absolute top-1 left-1.5 text-[11px] font-semibold text-link">hoje</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ---------- Página ----------
export function Calendar() {
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()))
  const [tab, setTab] = useState<'semana' | 'linha'>('semana')
  const limited = !!useLicense()?.limited // Grátis: só a semana; a linha do tempo é do Pro
  const [day, setDay] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [projects, setProjects] = useState<Project[]>([])
  const [items, setItems] = useState<CalTask[]>([])
  const [tray, setTray] = useState<CalTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<CalTask | null>(null)
  const span = tab === 'semana' ? 7 : 42
  const from = iso(anchor), to = iso(addDays(anchor, span - 1))
  const week = [...Array(7).keys()].map((i) => iso(addDays(anchor, i)))
  const todayIso = iso(new Date())

  const load = () => Promise.all([
    call<Project[]>('projects_list').then(setProjects),
    call<CalTask[]>('calendar_range', { from, to }).then(setItems),
    call<CalTask[]>('calendar_unscheduled', { limit: 60 }).then(setTray),
  ]).catch((e) => setError(message(e)))
  useEffect(() => { void load() }, [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  // cor fixa por projeto (ordem de criação), a mesma no filtro, nos blocos e na linha do tempo
  const colorOf = useMemo(() => {
    const ids = [...projects].sort((a, b) => a.id - b.id).map((p) => p.id)
    return (pid: number) => PALETTE[Math.max(0, ids.indexOf(pid)) % PALETTE.length]
  }, [projects])
  const visible = (x: CalTask) => !hidden.has(x.task.projectId)
  const shown = items.filter(visible)
  const trayShown = tray.filter(visible)

  const booked = shown.filter((x) => x.task.schedStart && week.includes(x.task.schedStart.slice(0, 10))).reduce((s, x) => s + (x.task.schedMin ?? 0), 0)
  const perDay = week.map((d) => shown.filter((x) => x.task.schedStart?.startsWith(d)).reduce((s, x) => s + (x.task.schedMin ?? 0), 0))
  const busiest = perDay.indexOf(Math.max(...perDay))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (!over) return
    const id = Number(String(active.id).slice(2))
    const x = [...items, ...tray].find((t) => t.task.id === id)
    if (!x) return
    if (over.id === 'tray') { if (x.task.schedStart) void call('task_schedule', { id, start: null }).then(load).catch((e) => setError(message(e))); return }
    const d = String(over.id).slice(4)
    const top = (active.rect.current.translated?.top ?? over.rect.top) - over.rect.top
    const len = blockLen(x.task)
    let m = START * 60 + Math.round(((top / ROW) * 60) / SNAP) * SNAP
    m = Math.max(START * 60, Math.min(END * 60 - Math.min(len, 60), m))
    void call('task_schedule', { id, start: `${d}T${hm(m)}`, minutes: len }).then(load).catch((e) => setError(message(e)))
  }

  // horário digitado: agenda e leva a semana até o dia escolhido, se for outra
  const schedule = (id: number, start: string, minutes: number) => {
    void call('task_schedule', { id, start, minutes }).then(() => {
      const d = start.slice(0, 10)
      if (!week.includes(d)) setAnchor(startOfWeek(parse(d)))
      setDay(d)
      return load()
    }).catch((e) => setError(message(e)))
  }
  const move = (n: number) => { setAnchor((a) => addDays(a, n)); setDay(null) }
  const title = tab === 'semana'
    ? `${parse(week[0]).getDate()}${parse(week[0]).getMonth() !== parse(week[6]).getMonth() ? ` de ${parse(week[0]).toLocaleDateString('pt-BR', { month: 'long' })}` : ''} a ${longDate(week[6])}`
    : `${longDate(from)} a ${longDate(to)}`

  return (
    <DndContext sensors={sensors} onDragStart={({ active }) => { const id = Number(String(active.id).slice(2)); setDragging([...items, ...tray].find((t) => t.task.id === id) ?? null) }} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex h-full min-h-0">
        {tab === 'semana' && (
          <aside aria-label="Mês e tarefas sem horário" className="flex w-[236px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line px-4 py-5">
            <MiniMonth anchor={parse(week[3])} week={week} onPick={(d) => { setAnchor(startOfWeek(d)); setDay(iso(d)) }} />
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5"><b className="text-[12.5px] text-muted">Sem horário · {trayShown.length}</b><span className="text-[11.5px] text-faint">arraste para a agenda</span></div>
              <Tray>
                {trayShown.length === 0 && <p className="px-1 text-[12.5px] text-faint">Tudo que está aberto já tem horário.</p>}
                {trayShown.map((x) => <TrayItem key={x.task.id} x={x} color={colorOf(x.task.projectId)} day={day ?? (week.includes(todayIso) ? todayIso : week[1])}
                  onSchedule={(start, minutes) => schedule(x.task.id!, start, minutes)} />)}
              </Tray>
            </div>
            <div className="mt-auto rounded-[10px] border border-line bg-card p-3 text-[12px] leading-relaxed text-muted">
              <b className="text-fg">Esta semana</b><br />
              {fmtDur(booked)} na agenda, de 40 h úteis (seg a sex, 8 h por dia).
              {booked > 0 && <> Dia mais cheio: {weekday(week[busiest])} ({fmtDur(perDay[busiest])}).</>}
              {booked > 40 * 60 && <span className={`block pt-1 ${LATE}`}>Passou do tempo útil: algo precisa sair.</span>}
            </div>
          </aside>
        )}

        <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-5">
          {error && <p className={`text-[13px] ${LATE}`} role="alert">{error} <button type="button" onClick={() => setError(null)} className="underline">ok</button></p>}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[11px] tracking-[0.16em] text-muted">CALENDÁRIO · {tab === 'semana' ? 'SEMANA' : 'LINHA DO TEMPO'}</span>
              <h1 className="font-serif text-[24px] leading-tight">{title}</h1>
            </div>
            <div className="ml-2 flex gap-1">
              <Button variant="ghost" icon={ChevronLeft} ariaLabel={tab === 'semana' ? 'Semana anterior' : 'Voltar uma semana'} onClick={() => move(-7)} />
              <Button onClick={() => { setAnchor(startOfWeek(new Date())); setDay(null) }}>Hoje</Button>
              <Button variant="ghost" icon={ChevronRight} ariaLabel={tab === 'semana' ? 'Próxima semana' : 'Avançar uma semana'} onClick={() => move(7)} />
            </div>
            <span className="flex-1" />
            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar projetos">
              {projects.filter((p) => !p.archived).map((p) => {
                const off = hidden.has(p.id)
                return (
                  <button key={p.id} type="button" aria-pressed={!off} onClick={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(p.id); else n.add(p.id); return n })}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${off ? 'border-dashed border-line-strong text-faint' : 'border-line bg-card'}`}>
                    <span className="size-2 rounded-full" style={{ background: off ? 'transparent' : colorOf(p.id), boxShadow: off ? `inset 0 0 0 1px ${colorOf(p.id)}` : undefined }} />{p.name}
                  </button>
                )
              })}
            </div>
            <div role="tablist" aria-label="Visão" className="inline-flex gap-1 rounded-lg border border-line-strong p-1">
              {([['semana', 'Semana'], ['linha', 'Linha do tempo']] as const).map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => { if (v === 'linha' && limited) { openActivation('A linha do tempo'); return } setTab(v); setDay(null) }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] ${tab === v ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{label}{v === 'linha' && limited && <Lock size={12} aria-label="do Pro" />}</button>
              ))}
            </div>
            <IcsButton />
          </header>

          {tab === 'semana' ? (
            <>
              <HowItWorks id="calendario-semana" title="Agenda da semana (time blocking)" guide={method('timeblocking')!.guide} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
                <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line-strong">
                  <span />
                  {week.map((d, i) => {
                    const dues = shown.filter((x) => x.task.due === d)
                    const sel = day === d, today = d === todayIso
                    return (
                      <button key={d} type="button" onClick={() => setDay(sel ? null : d)} aria-pressed={sel} aria-label={`Resumo de ${weekday(d)}, ${longDate(d)}`}
                        className={`flex min-w-0 flex-col gap-1 border-l border-line px-2 pt-2 pb-2.5 text-left transition-colors hover:bg-raised ${sel ? 'bg-accent-soft/60 shadow-[inset_0_-2px_0_var(--t-accent)]' : ''}`}>
                        <span className="font-mono text-[10.5px] tracking-[0.12em] text-muted">{DOW[i]}</span>
                        <span className={`font-serif text-[18px] leading-none ${today ? 'text-link' : ''}`}>{parse(d).getDate()}</span>
                        {dues.slice(0, 2).map((x) => (
                          <span key={x.task.id} className={`cal-chip truncate rounded px-1.5 py-0.5 text-[11px] ${x.done ? 'line-through opacity-60' : ''}`} style={cssColor(colorOf(x.task.projectId))}>
                            {x.task.milestone ? '◆ ' : ''}{x.task.title}
                          </span>
                        ))}
                        {dues.length > 2 && <span className="text-[11px] text-muted">+{dues.length - 2} prazos</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
                    <div className="flex flex-col">
                      {[...Array(END - START).keys()].map((i) => <span key={i} className="shrink-0 pt-0.5 pr-2 text-right text-[10.5px] text-faint" style={{ height: ROW }}>{hLabel((START + i) * 60)}</span>)}
                    </div>
                    {week.map((d) => (
                      <DayColumn key={d} day={d} today={d === todayIso} colorOf={colorOf} onPick={() => setDay(d)}
                        items={shown.filter((x) => x.task.schedStart?.startsWith(d))} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <HowItWorks id="calendario-linha" title="Linha do tempo" guide={method('calendario')!.guide} />
              <Timeline start={anchor} items={shown} projects={projects.filter((p) => !hidden.has(p.id))} colorOf={colorOf} />
            </>
          )}
        </section>

        {tab === 'semana' && day && (
          <DayPanel key={day} day={day} items={shown} tray={trayShown} projects={projects} colorOf={colorOf} onClose={() => setDay(null)} onChanged={() => void load()} onError={(e) => setError(message(e))} />
        )}
      </div>
      <DragOverlay>
        {dragging ? (
          <div className="cal-block w-[150px] rotate-1 rounded-[7px] border px-2 py-1.5 text-[11.5px] shadow-xl" style={cssColor(colorOf(dragging.task.projectId))}>
            <b className="block truncate">{dragging.task.title}</b><span className="inline-flex items-center gap-1 text-muted"><Clock size={10} />{fmtDur(blockLen(dragging.task))}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
