import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui'
import { HowItWorks } from '../components/Guide'
import { call, type Board, type Cycle, type Project, type Scope } from '../data/api'
import { method } from '../data/methods'
import { Progress } from './Scrum'

// Shape Up (fase 4B-2c). Desenho: direção A, o morro. Um ciclo tem uma aposta e um apetite
// (quanto tempo vale gastar); a aposta vira frentes, e cada frente anda no morro: subindo enquanto se
// descobre como fazer, descendo quando só falta executar.

const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const COLORS = ['#C2410C', '#E0A800', '#2238C4', '#7C3AED', '#0E7490', '#BE185D', '#4D7C0F', '#B45309']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())
const parse = (s: string) => new Date(`${s}T12:00:00`)
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5)
const fmtDay = (s: string) => parse(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')

// morro: x de 0 a 100 vira um sino (0 nas pontas, topo no 50)
const W = 1000, H = 210, PAD = 30, BASE = 185, TOP = 30
const px = (h: number) => PAD + (h / 100) * (W - 2 * PAD)
const py = (h: number) => BASE - (BASE - TOP) * ((1 - Math.cos((2 * Math.PI * h) / 100)) / 2)
const CURVE = [...Array(101).keys()].map((h) => `${h ? 'L' : 'M'} ${px(h).toFixed(1)} ${py(h).toFixed(1)}`).join(' ')

// frentes do ciclo aberto (para o painel da tarefa)
export function useCycleScopes(projectId: number | null) {
  const [list, setList] = useState<Scope[]>([])
  useEffect(() => {
    if (!projectId) { setList([]); return }
    call<Cycle[]>('cycles_list', { projectId }).then((cs) => {
      const open = cs.find((c) => !c.closedAt)
      return open ? call<Scope[]>('scopes_list', { cycleId: open.id }).then(setList) : setList([])
    }).catch(() => setList([]))
  }, [projectId])
  return list
}

function Hill({ scopes, onMove }: { scopes: Scope[]; onMove: (s: Scope, hill: number) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: number; hill: number } | null>(null)
  const toHill = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * W
    return Math.round(Math.max(0, Math.min(100, ((x - PAD) / (W - 2 * PAD)) * 100)))
  }
  return (
    <svg ref={svg} role="group" aria-label="Morro do ciclo" viewBox={`0 0 ${W} ${H}`} className="h-[210px] w-full touch-none select-none"
      onPointerMove={(e) => { if (drag) setDrag({ ...drag, hill: toHill(e.clientX) }) }}
      onPointerUp={() => { if (drag) { const s = scopes.find((x) => x.id === drag.id); if (s && s.hill !== drag.hill) onMove(s, drag.hill); setDrag(null) } }}
      onPointerLeave={() => setDrag(null)}>
      <path d={CURVE} fill="none" className="stroke-line-strong" strokeWidth="2" />
      <line x1={px(50)} y1={TOP - 14} x2={px(50)} y2={BASE + 10} className="stroke-line" strokeDasharray="4 4" />
      {scopes.map((s, i) => {
        const h = drag?.id === s.id ? drag.hill : s.hill
        const color = COLORS[i % COLORS.length]
        const above = h > 15 && h < 85
        return (
          <g key={s.id}>
            <circle cx={px(h)} cy={py(h)} r={12} fill={h >= 100 ? 'var(--t-ok)' : color} className="cursor-grab stroke-card active:cursor-grabbing" strokeWidth="3"
              role="slider" tabIndex={0} aria-label={`${s.title}: posição no morro`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={h}
              aria-valuetext={h < 50 ? 'subindo' : h >= 100 ? 'pronto' : 'descendo'}
              onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: s.id!, hill: s.hill }) }}
              onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0; if (d) { e.preventDefault(); onMove(s, Math.max(0, Math.min(100, s.hill + d))) } }} />
            <text x={px(h)} y={above ? py(h) + 32 : py(h) - 20} textAnchor="middle" className="fill-fg text-[14px]" style={{ font: '500 14px Geist Variable, system-ui' }}>{s.title}</text>
          </g>
        )
      })}
    </svg>
  )
}

function NewCycle({ project, count, onDone, onError }: { project: Project; count: number; onDone: () => void; onError: (e: unknown) => void }) {
  const [name, setName] = useState(`Ciclo ${count + 1}`)
  const [bet, setBet] = useState('')
  const [weeks, setWeeks] = useState(6)
  const [start, setStart] = useState(today())
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-col gap-1"><span className="font-mono text-[11px] tracking-[0.14em] text-link">NENHUM CICLO EM ANDAMENTO</span><h3 className="font-serif text-[20px]">Fazer uma aposta</h3>
        <p className="text-[13px] text-muted">Uma aposta é o que este ciclo vai entregar. O apetite é quanto tempo vale gastar nela: se não couber, corta-se escopo, não se estica o prazo.</p></div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <label className="flex flex-col gap-1 text-[13px] text-muted">Nome<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">A aposta<input value={bet} onChange={(e) => setBet(e.target.value)} placeholder="Ex.: agenda do profissional" className={field} /></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Apetite
          <select value={weeks} onChange={(e) => setWeeks(+e.target.value)} className={field}><option value={6}>6 semanas (aposta grande)</option><option value={2}>2 semanas (aposta pequena)</option><option value={4}>4 semanas</option></select></label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">Começa<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
      </div>
      <div><Button variant="primary" icon={ArrowRight}
        onClick={() => void call('cycle_save', { cycle: { id: null, projectId: project.id, name, bet, appetiteWeeks: weeks, startDay: start, closedAt: null } }).then(onDone).catch(onError)}>Começar {name}</Button></div>
    </div>
  )
}

export function ShapeUpView({ project, board, onError }: { project: Project; board: Board; onError: (e: unknown) => void }) {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [scopes, setScopes] = useState<Scope[]>([])
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<number | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const active = cycles.find((c) => !c.closedAt) ?? null
  const load = async () => {
    try {
      const cs = await call<Cycle[]>('cycles_list', { projectId: project.id })
      setCycles(cs)
      const open = cs.find((c) => !c.closedAt)
      setScopes(open ? await call<Scope[]>('scopes_list', { cycleId: open.id }) : [])
    } catch (e) { onError(e) }
  }
  useEffect(() => { void load() }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const move = (s: Scope, hill: number) => {
    setScopes((xs) => xs.map((x) => (x.id === s.id ? { ...x, hill, hillAt: today() } : x)))
    call('scope_move', { id: s.id, hill, day: today() }).catch((e) => { onError(e); void load() })
  }
  const doneOf = (colId: number | null) => !!board.columns.find((c) => c.id === colId)?.done

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks id="shapeup" title="Shape Up" guide={method('shapeup')!.guide} />
      {!active ? <NewCycle project={project} count={cycles.length} onDone={() => void load()} onError={onError} /> : (() => {
        const len = active.appetiteWeeks * 7
        const end = addDays(active.startDay, len - 1)
        const elapsed = Math.max(0, Math.min(len, daysBetween(active.startDay, today()) + 1))
        const week = Math.max(1, Math.min(active.appetiteWeeks, Math.ceil(elapsed / 7)))
        return (
          <>
            <header className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] tracking-[0.16em] text-link uppercase">{active.name} · semana {week} de {active.appetiteWeeks} · depois, 2 semanas de respiro</span>
                <h2 className="font-serif text-[26px] leading-tight">Aposta: <em className="text-link">{active.bet || 'sem nome'}</em></h2>
                <span className="text-[13px] text-muted">Apetite: {active.appetiteWeeks} semanas, até {fmtDay(end)}. Se não couber, corta o escopo, não estica o prazo.</span>
              </div>
              <span className="flex-1" />
              <div className="w-[240px]"><Progress pct={(elapsed / len) * 100} tone={elapsed >= len ? 'bad' : 'ok'} label={`${elapsed} de ${len} dias do ciclo · ${Math.round((elapsed / len) * 100)}%`} /></div>
            </header>
            <section aria-label="Morro" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card px-5 py-4">
              <div className="flex text-[12px] text-muted"><span className="flex-1">SUBINDO: descobrindo como fazer</span><span className="flex-1 text-right">DESCENDO: só executar</span></div>
              {scopes.length ? <Hill scopes={scopes} onMove={move} /> : <p className="py-10 text-center text-[13.5px] text-muted">Quebre a aposta em frentes (partes que dá para terminar sozinhas) e elas aparecem no morro.</p>}
            </section>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {scopes.map((s, i) => {
                const tasks = board.tasks.filter((t) => t.scopeId === s.id)
                const done = tasks.filter((t) => doneOf(t.columnId)).length
                const stale = s.hill < 100 && s.hillAt ? daysBetween(s.hillAt, today()) : 0
                return (
                  <div key={s.id} className={`flex flex-col gap-1.5 rounded-xl border px-4 py-3 ${s.hill >= 100 ? 'kcard-done' : 'kcard'}`}>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.hill >= 100 ? 'var(--t-ok)' : COLORS[i % COLORS.length] }} />
                      {renaming === s.id
                        ? <input autoFocus defaultValue={s.title} aria-label="Nome da frente" className="h-8 flex-1 rounded-md border border-line-strong bg-raised px-2 text-[13.5px]"
                            onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== s.title) void call('scope_save', { scope: { ...s, title: v } }).then(load).catch(onError) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                        : <button type="button" onClick={() => setRenaming(s.id)} className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold hover:underline">{s.title}</button>}
                      <Button variant="ghost" icon={Trash2} ariaLabel={`Apagar ${s.title}`} onClick={() => void call('scope_delete', { id: s.id }).then(load).catch(onError)} />
                    </div>
                    <span className="text-[12px] text-muted">{s.hill >= 100 ? 'Pronto' : s.hill >= 50 ? 'Descendo · só executar' : s.hill > 0 ? 'Subindo · ainda com dúvida' : 'Começando'}{tasks.length ? ` · ${done} de ${tasks.length} tarefas` : ''}</span>
                    {stale >= 5 && <span className={`text-[12px] ${LATE}`}>Parado há {stale} dias: vale olhar</span>}
                    {s.hill < 100 && <button type="button" onClick={() => move(s, 100)} className="inline-flex items-center gap-1 self-start text-[12px] text-muted hover:text-ok"><Check size={12} />Marcar como pronta</button>}
                  </div>
                )
              })}
              <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) void call('scope_save', { scope: { id: null, cycleId: active.id, title: v, hill: 0, hillAt: null } }).then(() => { setDraft(''); return load() }).catch(onError) }}
                className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2">
                <button type="submit" aria-label="Adicionar frente" className="grid size-8 place-items-center rounded-md text-link hover:bg-accent-soft"><Plus size={16} /></button>
                <label className="flex-1"><span className="sr-only">Nova frente</span><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nova frente" className="h-8 w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint" /></label>
              </form>
            </section>
            <p className="text-[12.5px] text-muted">Arraste cada ponto pelo morro uma vez por semana (ou use as setas do teclado). O que fica parado na subida é onde mora o risco. Ligue tarefas a uma frente no painel da tarefa.</p>
            <div className="flex flex-wrap items-center gap-3">
              {confirmClose
                ? <><span className="text-[13px]">Encerrar {active.name}? O que não ficou pronto não passa sozinho para o próximo ciclo: se ainda importar, vira uma aposta nova.</span>
                    <Button variant="primary" onClick={() => void call('cycle_close', { id: active.id, day: today() }).then(() => { setConfirmClose(false); return load() }).catch(onError)}>Encerrar</Button>
                    <Button variant="ghost" onClick={() => setConfirmClose(false)}>Cancelar</Button></>
                : <Button onClick={() => setConfirmClose(true)}>Encerrar o ciclo</Button>}
            </div>
          </>
        )
      })()}
      {cycles.some((c) => c.closedAt) && <p className="text-[12.5px] text-muted">Ciclos encerrados: {cycles.filter((c) => c.closedAt).map((c) => `${c.name}${c.bet ? ` (${c.bet})` : ''}`).join(', ')}.</p>}
    </div>
  )
}
