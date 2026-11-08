import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { HowItWorks } from '../components/Guide'
import { call, message, registerMock, type Board, type Project, type Task } from '../data/api'
import { method } from '../data/methods'

// Cronograma (fase 8.5: tabela + barras). À esquerda, tarefa, início, prazo e
// "depende de"; à direita, as barras no tempo. Conflito (tarefa que começa antes de a anterior terminar)
// aparece no topo com "Empurrar", que só muda as datas quando a pessoa clica.

type Plan = { starts: [number, string][]; deps: [number, number][] }
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const cell = 'h-11 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[12.5px] text-muted outline-none hover:border-line-strong focus:border-accent'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const at = (s: string) => new Date(`${s}T12:00:00`)
const addDays = (s: string, n: number) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d) }
const diff = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 864e5)
const short = (s: string) => at(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// substituto do navegador
const mem: { starts: Map<number, string>; deps: [number, number][] } = { starts: new Map(), deps: [] }
registerMock({
  gantt_plan: () => ({ starts: [...mem.starts], deps: [...mem.deps] }),
  gantt_start: (a) => { if (a.day) mem.starts.set(a.task as number, a.day as string); else mem.starts.delete(a.task as number) },
  gantt_dep_add: (a) => {
    const t = a.task as number, on = a.on as number
    if (t === on) throw new Error('uma tarefa não depende dela mesma')
    const up = (id: number, seen = new Set<number>()): boolean => mem.deps.filter(([x]) => x === id).some(([, y]) => y === t || (!seen.has(y) && (seen.add(y), up(y, seen))))
    if (up(on)) throw new Error('isso faria um círculo: uma tarefa ficaria esperando a si mesma')
    if (!mem.deps.some(([x, y]) => x === t && y === on)) mem.deps.push([t, on])
  },
  gantt_dep_remove: (a) => { mem.deps = mem.deps.filter(([x, y]) => !(x === a.task && y === a.on)) },
})

function GanttBars({ project, board, onSave, onOpen }: { project: Project; board: Board; onSave: (t: Task) => Promise<void>; onOpen: (t: Task) => void }) {
  const [plan, setPlan] = useState<Plan>({ starts: [], deps: [] })
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const load = () => call<Plan>('gantt_plan', { projectId: project.id }).then(setPlan).catch((e) => setError(message(e)))
  useEffect(() => { void load() }, [project.id, board]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<unknown>) => { setError(null); try { await f(); await load() } catch (e) { setError(message(e)) } }

  const doneCol = new Set(board.columns.filter((c) => c.done).map((c) => c.id))
  const startOf = useMemo(() => new Map(plan.starts), [plan])
  const rows = board.tasks.map((t) => {
    const start = startOf.get(t.id!) ?? t.schedStart?.slice(0, 10) ?? t.due ?? null
    const end = t.due ?? start
    return { t, start, end: end && start && end < start ? start : end, done: doneCol.has(t.columnId), deps: plan.deps.filter(([x]) => x === t.id).map(([, y]) => y) }
  })
  const byId = new Map(rows.map((r) => [r.t.id!, r]))
  const dated = rows.filter((r) => r.start).sort((a, b) => a.start!.localeCompare(b.start!) || (a.t.id ?? 0) - (b.t.id ?? 0))
  const undated = rows.filter((r) => !r.start && !r.done)
  // conflito: a tarefa começa no dia em que (ou antes de) a anterior termina
  const conflicts = dated.flatMap((r) => r.deps.map((d) => byId.get(d)).filter((d) => d?.end && !d.done && d.end >= r.start!).map((d) => ({ r, d: d! })))
  const bad = new Set(conflicts.map((c) => c.r.t.id))
  const today = iso(new Date())
  const from = addDays([today, ...dated.map((r) => r.start!)].sort()[0], -1)
  const to = addDays([addDays(from, 20), ...dated.map((r) => r.end!)].sort().pop()!, 2)
  const span = Math.max(14, diff(from, to) + 1)
  const pct = (d: string) => (diff(from, d) / span) * 100
  const days = Array.from({ length: span }, (_, i) => addDays(from, i))
  const step = span > 60 ? 7 : span > 30 ? 2 : 1

  const setStart = (r: (typeof rows)[number], day: string) => run(() => call('gantt_start', { task: r.t.id, day: day || null }))
  const setDue = (r: (typeof rows)[number], day: string) => run(() => onSave({ ...r.t, due: day || null }))
  // empurrar: começa no dia seguinte ao fim da anterior e mantém a duração
  const push = (c: (typeof conflicts)[number]) => run(async () => {
    const ns = addDays(c.d.end!, 1), shift = diff(c.r.start!, ns)
    await call('gantt_start', { task: c.r.t.id, day: ns })
    if (c.r.t.due) await onSave({ ...c.r.t, due: addDays(c.r.t.due, shift) })
  })

  const bar = (r: (typeof rows)[number]) => {
    const milestone = r.t.milestone
    const left = pct(r.start!), width = ((diff(r.start!, r.end!) + 1) / span) * 100
    const tone = r.done ? 'bg-ok text-white' : bad.has(r.t.id) ? 'bg-[#B3261E] text-white outline-2 outline-dashed outline-offset-2 outline-[#B3261E] dark:bg-[#FF8A80] dark:text-[#0B132D]' : 'bg-accent text-on-accent'
    return milestone
      ? <span title={r.t.title} className={`absolute top-[13px] size-4 rotate-45 border-[1.5px] ${bad.has(r.t.id) ? 'border-[#B3261E] bg-[#B3261E] outline-2 outline-dashed outline-offset-2 outline-[#B3261E]' : 'border-[#8A5A00] bg-[#E0A800]'}`} style={{ left: `calc(${left + 100 / span / 2}% - 8px)` }} />
      : <>
          <button type="button" onClick={() => onOpen(r.t)} title={`${r.t.title}: ${short(r.start!)} a ${short(r.end!)}`} aria-label={r.t.title}
            className={`absolute top-3 flex h-5 items-center overflow-hidden whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold ${tone}`} style={{ left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)` }}>{width > 12 ? r.t.title : ''}</button>
          {/* barra curta: o nome vai ao lado, fora da barra */}
          {width <= 12 && <span className="pointer-events-none absolute top-3 flex h-5 items-center whitespace-nowrap pl-1.5 text-[11.5px] text-muted" style={{ left: `calc(${left + width}% + 2px)` }}>{r.t.title}</span>}
        </>
  }

  return (
    <div className="flex flex-col gap-3">
      <HowItWorks id="cronograma" title="Cronograma" guide={method('cronograma')!.guide} />
      {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
      {conflicts.map((c) => (
        <div key={`${c.r.t.id}-${c.d.t.id}`} role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[#B3261E]/40 bg-[#B3261E]/8 px-4 py-2.5 text-[13px]">
          <b className={LATE}>Conflito:</b><span>"{c.r.t.title}" começa {short(c.r.start!)}, mas depende de "{c.d.t.title}", que termina {short(c.d.end!)}.</span>
          <span className="flex-1" /><button type="button" onClick={() => void push(c)} className="h-8 rounded-lg border border-[#B3261E]/60 px-3 text-[12.5px] font-medium hover:bg-[#B3261E]/10">Empurrar para {short(addDays(c.d.end!, 1))}</button>
        </div>
      ))}

      <section aria-label="Cronograma" className="overflow-x-auto rounded-xl border border-line bg-card">
        <div className="grid min-w-[980px] grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)_92px_92px_150px] border-r border-line-strong">
            {['TAREFA', 'INÍCIO', 'PRAZO', 'DEPENDE DE'].map((h) => <span key={h} className="flex h-11 items-center border-b border-line bg-raised px-2.5 font-mono text-[10.5px] tracking-[0.1em] text-faint">{h}</span>)}
            {dated.map((r) => (
              <Row key={r.t.id} r={r} rows={rows} bad={bad.has(r.t.id)} adding={adding === r.t.id} onAdding={(v) => setAdding(v ? r.t.id : null)}
                onOpen={onOpen} onStart={(d) => void setStart(r, d)} onDue={(d) => void setDue(r, d)}
                onAdd={(on) => void run(() => call('gantt_dep_add', { task: r.t.id, on })).then(() => setAdding(null))}
                onRemove={(on) => void run(() => call('gantt_dep_remove', { task: r.t.id, on }))} />
            ))}
          </div>
          <div className="relative">
            <div className="relative h-11 border-b border-line bg-raised">
              {days.map((d, i) => i % step === 0 && <span key={d} className={`absolute top-0 flex h-full items-center text-[11px] ${d === today ? 'font-bold text-[#8A5A00] dark:text-[#F2C94C]' : 'text-faint'}`} style={{ left: `calc(${pct(d)}% + 3px)` }}>{at(d).getDate() === 1 ? `1/${at(d).getMonth() + 1}` : at(d).getDate()}</span>)}
            </div>
            {dated.map((r) => <div key={r.t.id} className="relative h-11 border-b border-line">{bar(r)}</div>)}
            <span aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#E0A800]" style={{ left: `calc(${pct(today) + 100 / span / 2}% - 1px)` }} />
          </div>
        </div>
        {dated.length === 0 && <p className="p-6 text-[13.5px] text-muted">Nenhuma tarefa com data ainda. Dê um início ou um prazo nas tarefas abaixo e elas aparecem aqui.</p>}
      </section>

      {undated.length > 0 && (
        <section aria-label="Sem datas" className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line-strong p-3.5">
          <span className="text-[12px] font-semibold text-muted">Sem datas · {undated.length} (dê um início ou um prazo para entrar no cronograma)</span>
          {undated.map((r) => (
            <div key={r.t.id} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-2 text-[13px]">
              <button type="button" onClick={() => onOpen(r.t)} className="truncate text-left hover:underline">{r.t.title}</button>
              <label className="flex items-center gap-1 text-[11.5px] text-faint">início<input type="date" onChange={(e) => e.target.value && void setStart(r, e.target.value)} className={cell} /></label>
              <label className="flex items-center gap-1 text-[11.5px] text-faint">prazo<input type="date" onChange={(e) => e.target.value && void setDue(r, e.target.value)} className={cell} /></label>
            </div>
          ))}
        </section>
      )}
      <p className="text-[12.5px] text-faint">Barra azul: a fazer · verde: feita · vermelha: em conflito · losango: marco · linha amarela: hoje. Mudar uma data avisa as tarefas que dependem dela; o app nunca empurra datas sozinho.</p>
    </div>
  )
}

type R = { t: Task; start: string | null; end: string | null; done: boolean; deps: number[] }
function Row({ r, rows, bad, adding, onAdding, onOpen, onStart, onDue, onAdd, onRemove }: {
  r: R; rows: R[]; bad: boolean; adding: boolean; onAdding: (v: boolean) => void; onOpen: (t: Task) => void
  onStart: (d: string) => void; onDue: (d: string) => void; onAdd: (on: number) => void; onRemove: (on: number) => void
}) {
  const name = (id: number) => rows.find((x) => x.t.id === id)?.t.title ?? '?'
  const options = rows.filter((x) => x.t.id !== r.t.id && !r.deps.includes(x.t.id!))
  return (
    <>
      <button type="button" onClick={() => onOpen(r.t)} className={`flex h-11 items-center truncate border-b border-line px-2.5 text-left text-[13px] hover:underline ${bad ? `${LATE} font-semibold` : r.done ? 'text-muted line-through' : ''}`}>{r.t.milestone ? '◆ ' : ''}{r.t.title}</button>
      <span className="border-b border-line"><input type="date" value={r.start ?? ''} onChange={(e) => onStart(e.target.value)} aria-label={`Início de ${r.t.title}`} className={cell} /></span>
      <span className="border-b border-line"><input type="date" value={r.t.due ?? ''} onChange={(e) => onDue(e.target.value)} aria-label={`Prazo de ${r.t.title}`} className={cell} /></span>
      <span className="flex h-11 items-center gap-1 overflow-hidden border-b border-line px-1.5">
        {r.deps.map((d) => (
          <span key={d} className="group inline-flex h-[22px] max-w-[96px] shrink-0 items-center gap-0.5 rounded-full bg-accent-soft pl-2 pr-1 text-[11px] font-semibold text-link" title={name(d)}>
            <span className="truncate">{name(d)}</span><button type="button" aria-label={`Tirar dependência de ${name(d)}`} onClick={() => onRemove(d)} className="opacity-60 hover:opacity-100"><X size={11} /></button>
          </span>
        ))}
        {adding
          ? <select autoFocus defaultValue="" onBlur={() => onAdding(false)} onChange={(e) => e.target.value && onAdd(+e.target.value)} className="h-7 min-w-0 flex-1 rounded border border-line-strong bg-raised text-[11.5px]">
              <option value="">depende de…</option>{options.map((x) => <option key={x.t.id} value={x.t.id!}>{x.t.title}</option>)}
            </select>
          : <button type="button" aria-label="Adicionar dependência" title="Esta tarefa só começa depois de outra terminar" onClick={() => onAdding(true)} className="grid size-[22px] shrink-0 place-items-center rounded-md border border-dashed border-line-strong text-faint hover:border-accent hover:text-link"><Plus size={12} /></button>}
      </span>
    </>
  )
}

// ---------- Visão: bloqueios e o que pode começar ----------
// A aba Cronograma abre aqui; "Barras no tempo" mostra a tabela com as barras (direção B).

type Mode = 'bloqueios' | 'barras'
export function GanttView(props: { project: Project; board: Board; onSave: (t: Task) => Promise<void>; onOpen: (t: Task) => void }) {
  const [mode, setModeS] = useState<Mode>(() => { try { return (localStorage.getItem('tesseract.cronograma.modo') as Mode) || 'bloqueios' } catch { return 'bloqueios' } })
  const setMode = (m: Mode) => { setModeS(m); try { localStorage.setItem('tesseract.cronograma.modo', m) } catch { /* sem armazenamento */ } }
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Como ver o cronograma" className="inline-flex gap-1 self-start rounded-lg border border-line-strong p-1">
        {([['bloqueios', 'O que destrava o quê'], ['barras', 'Barras no tempo']] as [Mode, string][]).map(([m, l]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`h-8 rounded-md px-3 text-[13px] ${mode === m ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{l}</button>
        ))}
      </div>
      {mode === 'bloqueios' ? <BlocksView {...props} /> : <GanttBars {...props} />}
    </div>
  )
}

type Info = { t: Task; start: string | null; end: string | null; done: boolean; on: number[]; frees: number[] }

function BlocksView({ project, board, onSave, onOpen }: { project: Project; board: Board; onSave: (t: Task) => Promise<void>; onOpen: (t: Task) => void }) {
  const [plan, setPlan] = useState<Plan>({ starts: [], deps: [] })
  const [sel, setSel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => call<Plan>('gantt_plan', { projectId: project.id }).then(setPlan).catch((e) => setError(message(e)))
  useEffect(() => { void load() }, [project.id, board]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<unknown>) => { setError(null); try { await f(); await load() } catch (e) { setError(message(e)) } }

  const doneCol = new Set(board.columns.filter((c) => c.done).map((c) => c.id))
  const startOf = new Map(plan.starts)
  const info = new Map<number, Info>(board.tasks.map((t) => {
    const start = startOf.get(t.id!) ?? t.schedStart?.slice(0, 10) ?? null
    return [t.id!, { t, start, end: t.due ?? start, done: doneCol.has(t.columnId), on: plan.deps.filter(([x]) => x === t.id).map(([, y]) => y), frees: plan.deps.filter(([, y]) => y === t.id).map(([x]) => x) }]
  }))
  const all = [...info.values()]
  const name = (id: number) => info.get(id)?.t.title ?? '?'
  const openDeps = (x: Info) => x.on.filter((d) => !info.get(d)?.done)
  const ready = all.filter((x) => !x.done && openDeps(x).length === 0)
  const waiting = all.filter((x) => !x.done && openDeps(x).length > 0)
  const done = all.filter((x) => x.done)
  // quando pode começar: no dia seguinte ao fim da última tarefa que ela espera
  const canStart = (x: Info) => { const ends = openDeps(x).map((d) => info.get(d)?.end).filter(Boolean) as string[]; return ends.length ? addDays(ends.sort().pop()!, 1) : null }

  // corrente até o marco: o caminho mais longo de dependências que chega no marco aberto mais próximo
  const marco = all.filter((x) => x.t.milestone && !x.done).sort((a, b) => (a.end ?? '9').localeCompare(b.end ?? '9'))[0]
  const longest = (x: Info, seen: Set<number>): Info[] => {
    const next = new Set(seen).add(x.t.id!)
    const paths = x.on.map((d) => info.get(d)).filter((d): d is Info => !!d && !next.has(d.t.id!)).map((d) => longest(d, next))
    return [...(paths.sort((a, b) => b.length - a.length)[0] ?? []), x]
  }
  const chain = marco ? longest(marco, new Set()) : []
  const before = chain.slice(0, -1).map((x) => x.end).filter(Boolean) as string[]
  const slack = marco?.end && before.length ? diff(before.sort().pop()!, marco.end) - 1 : null

  const s = sel != null ? info.get(sel) ?? null : null
  const card = 'flex flex-col gap-1 rounded-xl border border-line bg-card px-3.5 py-3 text-left text-[13px] hover:border-line-strong'
  const field = 'h-9 rounded-lg border border-line-strong bg-raised px-2 text-[13px] text-fg'
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
        <HowItWorks id="cronograma" title="Cronograma" guide={method('cronograma')!.guide} />
        {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
        {marco && (
          <section aria-label="Corrente até o marco" className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
            <span className="text-[12px] font-semibold text-muted">Corrente até "{marco.t.title}"{marco.end ? ` · ${short(marco.end)}` : ''}{slack != null ? (slack >= 0 ? ` · ${slack} dia(s) de folga` : ` · ${-slack} dia(s) de atraso previsto`) : ''}</span>
            <div className="flex items-center overflow-x-auto pb-1">
              {chain.map((x, i) => {
                const tone = x.done ? 'bg-ok-bg text-ok' : x.t.milestone ? 'bg-[#FFF4D6] text-[#6B4600] dark:bg-[#3A2E0A] dark:text-[#F2C94C]' : openDeps(x).length ? 'bg-raised text-muted' : 'bg-accent-soft text-link'
                const what = x.done ? 'feito' : x.t.milestone ? (x.end ? short(x.end) : 'marco') : openDeps(x).length ? `espera ${name(openDeps(x)[0])}` : x.end ? `até ${short(x.end)}` : 'pode começar'
                return (
                  <span key={x.t.id} className="flex items-center">
                    {i > 0 && <span className="h-0.5 w-5 shrink-0 bg-line-strong" />}
                    <button type="button" onClick={() => setSel(x.t.id!)} className={`flex shrink-0 flex-col whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12.5px] ${tone}`}><b className="font-semibold">{x.t.milestone ? '◆ ' : ''}{x.t.title}</b><span>{what}</span></button>
                  </span>
                )
              })}
            </div>
            {slack != null && slack < 0 && <p className={`text-[12.5px] ${LATE}`}>As datas da corrente passam do marco. Ajuste os prazos ou a data do marco.</p>}
          </section>
        )}
        <div className="grid gap-3.5 md:grid-cols-3">
          <section aria-label="Pode começar agora" className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-ok">Pode começar agora · {ready.length}</h3>
            {ready.map((x) => <button key={x.t.id} type="button" onClick={() => setSel(x.t.id!)} className={`${card} ${sel === x.t.id ? '!border-accent' : ''}`}><b className="font-semibold">{x.t.milestone ? '◆ ' : ''}{x.t.title}</b><span className="text-[12px] text-ok">{x.on.length ? `liberada: ${x.on.map(name).join(', ')} feita` : 'não depende de nada'}</span></button>)}
            {ready.length === 0 && <span className="text-[12.5px] text-faint">Nada livre agora.</span>}
          </section>
          <section aria-label="Esperando" className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-[#8A5A00] dark:text-[#F2C94C]">Esperando outra tarefa · {waiting.length}</h3>
            {waiting.map((x) => {
              const when = canStart(x)
              const late = !!when && !!x.start && x.start < when
              return (
                <button key={x.t.id} type="button" onClick={() => setSel(x.t.id!)} className={`${card} ${sel === x.t.id ? '!border-accent' : ''}`}>
                  <b className="font-semibold">{x.t.milestone ? '◆ ' : ''}{x.t.title}</b>
                  <span className="text-[12px] text-[#8A5A00] dark:text-[#F2C94C]">esperando: {openDeps(x).map(name).join(' e ')}</span>
                  {when && <span className={`text-[11.5px] ${late ? `${LATE} font-semibold` : 'text-faint'}`}>{late ? `marcada para ${short(x.start!)}, mas só pode começar ${short(when)}` : `pode começar ${short(when)}, se a anterior fechar no prazo`}</span>}
                </button>
              )
            })}
            {waiting.length === 0 && <span className="text-[12.5px] text-faint">Nenhuma tarefa travada.</span>}
          </section>
          <section aria-label="Feitas" className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-muted">Feitas · {done.length}</h3>
            {done.map((x) => <button key={x.t.id} type="button" onClick={() => setSel(x.t.id!)} className={`${card} opacity-75`}><b className="font-semibold">{x.t.title}</b><span className="text-[12px] text-muted">{x.frees.length ? `liberou: ${x.frees.map(name).join(', ')}` : 'não trava nada'}</span></button>)}
          </section>
        </div>
        <p className="text-[12.5px] text-faint">Clique numa tarefa para ver de quem ela depende e o que ela libera. O app avisa atrasos na corrente, mas não muda datas sozinho.</p>
      </div>

      {s && (
        <aside aria-label="Tarefa" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-xl border border-line bg-card p-4 text-[13.5px]">
          <div className="flex items-start justify-between gap-2"><span className="font-mono text-[11px] tracking-[0.16em] text-muted">TAREFA</span><button type="button" aria-label="Fechar" onClick={() => setSel(null)} className="text-faint hover:text-fg"><X size={15} /></button></div>
          <button type="button" onClick={() => onOpen(s.t)} className="text-left font-serif text-[19px] leading-snug hover:underline">{s.t.title}</button>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[12px] text-muted">Início<input type="date" value={s.start ?? ''} onChange={(e) => void run(() => call('gantt_start', { task: s.t.id, day: e.target.value || null }))} className={field} /></label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">Prazo<input type="date" value={s.t.due ?? ''} onChange={(e) => void run(() => onSave({ ...s.t, due: e.target.value || null }))} className={field} /></label>
          </div>
          <div className="flex flex-col gap-1.5"><span className="text-[12px] font-semibold text-muted">Depende de</span>
            {s.on.map((d) => {
              const x = info.get(d)
              if (!x) return null
              return (
                <span key={d} className="flex items-center gap-2 rounded-lg bg-raised px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{x.t.title}</span>
                  <span className={`shrink-0 text-[12px] ${x.done ? 'text-ok' : 'text-[#8A5A00] dark:text-[#F2C94C]'}`}>{x.done ? 'feita' : x.end ? `até ${short(x.end)}` : 'sem prazo'}</span>
                  <button type="button" aria-label={`Tirar dependência de ${x.t.title}`} onClick={() => void run(() => call('gantt_dep_remove', { task: s.t.id, on: d }))} className="text-faint hover:text-fg"><X size={13} /></button>
                </span>
              )
            })}
            <select value="" onChange={(e) => { if (e.target.value) void run(() => call('gantt_dep_add', { task: s.t.id, on: +e.target.value })) }} className={field}>
              <option value="">+ tarefa que precisa terminar antes</option>
              {all.filter((x) => x.t.id !== s.t.id && !s.on.includes(x.t.id!)).map((x) => <option key={x.t.id} value={x.t.id!}>{x.t.title}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><span className="text-[12px] font-semibold text-muted">Libera</span>
            {s.frees.length ? s.frees.map((f) => <span key={f} className="rounded-lg bg-raised px-2.5 py-1.5">{name(f)}</span>) : <span className="text-[12.5px] text-faint">Nenhuma tarefa espera por esta.</span>}
          </div>
          <Risk s={s} when={canStart(s)} onChain={chain.some((x) => x.t.id === s.t.id)} slack={slack} marco={marco?.t ?? null} />
        </aside>
      )}
    </div>
  )
}

function Risk({ s, when, onChain, slack, marco }: { s: Info; when: string | null; onChain: boolean; slack: number | null; marco: Task | null }) {
  if (s.done) return null
  if (when && s.start && s.start < when)
    return <p className="rounded-lg bg-[#B3261E]/10 px-3 py-2 text-[12.5px] text-[#8C1D18] dark:text-[#FF8A80]">Marcada para {short(s.start)}, mas só pode começar {short(when)}. Mude o início ou o prazo da anterior.</p>
  if (onChain && slack != null && slack <= 2 && marco && s.t.id !== marco.id)
    return <p className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4600] dark:bg-[#3A2E0A] dark:text-[#F2C94C]">Está na corrente até "{marco.title}", com {Math.max(0, slack)} dia(s) de folga: se atrasar, o marco atrasa. O app avisa, mas não muda datas sozinho.</p>
  return null
}
