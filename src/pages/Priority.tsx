import { useEffect, useState } from 'react'
import { HowItWorks } from '../components/Guide'
import type { Board, Task } from '../data/api'
import { method } from '../data/methods'

// Priorização (fase 4B-2c). Desenho: direção A, tabela com pontuação calculada e ordenada.
// A nota fica guardada na tarefa (campo prio, JSON), então trocar de RICE para ICE não apaga nada.

type Rice = { r?: number; i?: number; c?: number; e?: number }
type Ice = { i?: number; c?: number; e?: number }
type Moscow = 'must' | 'should' | 'could' | 'wont'
type Prio = { rice?: Rice; ice?: Ice; moscow?: Moscow }
type Mode = 'rice' | 'ice' | 'moscow'

const read = (t: Task): Prio => { try { return t.prio ? JSON.parse(t.prio) : {} } catch { return {} } }
const riceScore = (x?: Rice) => (x && x.r && x.i && x.c && x.e ? Math.round((x.r * x.i * (x.c / 100)) / x.e) : null)
const iceScore = (x?: Ice) => (x && x.i && x.c && x.e ? Math.round(((x.i + x.c + x.e) / 3) * 10) / 10 : null)
const MOSCOW: [Moscow, string, string][] = [
  ['must', 'Tem que ter', 'bg-ok-bg text-ok'],
  ['should', 'Deveria ter', 'bg-accent-soft text-link'],
  ['could', 'Poderia ter', 'bg-[#F6EBC4] text-[#6B5300] dark:bg-[#3A3110] dark:text-[#F5D46B]'],
  ['wont', 'Não agora', 'bg-raised text-muted'],
]
const IMPACT = [[0.25, 'mínimo'], [0.5, 'baixo'], [1, 'médio'], [2, 'alto'], [3, 'enorme']] as const
const CONF = [[50, 'baixa (50%)'], [80, 'média (80%)'], [100, 'alta (100%)']] as const
const HINT: Record<Mode, string> = {
  rice: 'Pontuação = Alcance × Impacto × Confiança ÷ Esforço. Alcance é quantas pessoas a tarefa atinge por mês; esforço, em semanas de trabalho. Quanto maior, antes.',
  ice: 'Dê de 1 a 10 para Impacto, Confiança (o quanto você acredita no impacto) e Facilidade. A nota é a média. Mais rápido que o RICE, bom para decidir em minutos.',
  moscow: 'Separe o que entra numa entrega: Tem que ter (sem isso não faz sentido), Deveria ter, Poderia ter (se sobrar tempo) e Não agora (combinado que fica de fora).',
}
const num = 'h-8 w-full rounded-md border border-line-strong bg-raised px-2 font-mono text-[12.5px] outline-none focus:border-accent'
const sel = 'h-8 w-full rounded-md border border-line-strong bg-raised px-1.5 text-[12.5px]'

function NumberCell({ value, onCommit, label, step = 1, min = 0, max }: { value?: number; onCommit: (v?: number) => void; label: string; step?: number; min?: number; max?: number }) {
  const [v, setV] = useState(value != null ? String(value) : '')
  useEffect(() => { setV(value != null ? String(value) : '') }, [value])
  const commit = () => {
    const n = v.trim() === '' ? undefined : Number(v.replace(',', '.'))
    if (n !== undefined && (!Number.isFinite(n) || n < min || (max != null && n > max))) { setV(value != null ? String(value) : ''); return }
    if (n !== value) onCommit(n)
  }
  return <input aria-label={label} inputMode="decimal" value={v} step={step} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className={num} />
}

export function PriorityView({ board, onSave, onOpen }: { board: Board; onSave: (t: Task) => Promise<void>; onOpen: (t: Task) => void }) {
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem('tesseract.prio.mode') as Mode) || 'rice' } catch { return 'rice' } })
  const pick = (m: Mode) => { setMode(m); try { localStorage.setItem('tesseract.prio.mode', m) } catch { /* sem armazenamento */ } }
  const isDone = (t: Task) => !!board.columns.find((c) => c.id === t.columnId)?.done
  const save = (t: Task, patch: Prio) => void onSave({ ...t, prio: JSON.stringify({ ...read(t), ...patch }) })

  const rows = board.tasks.filter((t) => !isDone(t)).map((t) => {
    const p = read(t)
    const score = mode === 'rice' ? riceScore(p.rice) : mode === 'ice' ? iceScore(p.ice) : null
    return { t, p, score }
  })
  const group = (m?: Moscow) => (m ? MOSCOW.findIndex((x) => x[0] === m) : 4)
  rows.sort((a, b) => mode === 'moscow'
    ? group(a.p.moscow) - group(b.p.moscow) || (iceScore(b.p.ice) ?? riceScore(b.p.rice) ?? -1) - (iceScore(a.p.ice) ?? riceScore(a.p.rice) ?? -1)
    : (b.score ?? -1) - (a.score ?? -1))
  const max = Math.max(1, ...rows.map((r) => r.score ?? 0))
  const cols = mode === 'rice' ? 'grid-cols-[32px_minmax(0,1fr)_96px_110px_112px_88px_120px]' : mode === 'ice' ? 'grid-cols-[32px_minmax(0,1fr)_88px_88px_88px_120px]' : 'grid-cols-[32px_minmax(0,1fr)_170px]'

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks id="priorizacao" title="Priorização (RICE, ICE e MoSCoW)" guide={method('priorizacao')!.guide} />
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Método de priorização" className="inline-flex gap-1 rounded-lg border border-line-strong p-1">
          {([['rice', 'RICE'], ['ice', 'ICE'], ['moscow', 'MoSCoW']] as const).map(([m, l]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => pick(m)}
              className={`h-8 rounded-md px-3 text-[13.5px] ${mode === m ? 'bg-fg font-medium text-bg' : 'text-muted hover:text-fg'}`}>{l}</button>
          ))}
        </div>
        <p className="min-w-[280px] flex-1 text-[13px] text-muted">{HINT[mode]}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <div className="min-w-[760px]">
          <div className={`grid ${cols} items-end gap-2.5 border-b border-line px-4 py-2.5 text-[12px] text-muted`}>
            <span>#</span><span>Tarefa</span>
            {mode === 'rice' && <><span>Alcance<br /><span className="text-faint">pessoas/mês</span></span><span>Impacto</span><span>Confiança</span><span>Esforço<br /><span className="text-faint">semanas</span></span><span>Pontuação</span></>}
            {mode === 'ice' && <><span>Impacto<br /><span className="text-faint">1 a 10</span></span><span>Confiança<br /><span className="text-faint">1 a 10</span></span><span>Facilidade<br /><span className="text-faint">1 a 10</span></span><span>Nota</span></>}
            {mode === 'moscow' && <span>Entra na entrega?</span>}
          </div>
          {rows.length === 0 && <p className="px-4 py-8 text-center text-[13.5px] text-muted">Nenhuma tarefa aberta para priorizar.</p>}
          {rows.map(({ t, p, score }, i) => (
            <div key={t.id} className={`grid ${cols} items-center gap-2.5 border-b border-line/70 px-4 py-2 text-[13.5px] last:border-b-0`}>
              <span className="font-mono text-[12px] text-muted">{score != null || (mode === 'moscow' && p.moscow) ? i + 1 : '·'}</span>
              <button type="button" onClick={() => onOpen(t)} className="min-w-0 truncate text-left hover:underline">{t.title}</button>
              {mode === 'rice' && (
                <>
                  <NumberCell label={`Alcance de ${t.title}`} value={p.rice?.r} onCommit={(r) => save(t, { rice: { ...p.rice, r } })} />
                  <select aria-label={`Impacto de ${t.title}`} value={p.rice?.i ?? ''} onChange={(e) => save(t, { rice: { ...p.rice, i: e.target.value ? +e.target.value : undefined } })} className={sel}>
                    <option value="">—</option>{IMPACT.map(([v, l]) => <option key={v} value={v}>{String(v).replace('.', ',')} · {l}</option>)}
                  </select>
                  <select aria-label={`Confiança de ${t.title}`} value={p.rice?.c ?? ''} onChange={(e) => save(t, { rice: { ...p.rice, c: e.target.value ? +e.target.value : undefined } })} className={sel}>
                    <option value="">—</option>{CONF.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <NumberCell label={`Esforço de ${t.title}`} value={p.rice?.e} min={0.1} onCommit={(e) => save(t, { rice: { ...p.rice, e } })} />
                </>
              )}
              {mode === 'ice' && (['i', 'c', 'e'] as const).map((k) => (
                <select key={k} aria-label={`${{ i: 'Impacto', c: 'Confiança', e: 'Facilidade' }[k]} de ${t.title}`} value={p.ice?.[k] ?? ''} onChange={(e) => save(t, { ice: { ...p.ice, [k]: e.target.value ? +e.target.value : undefined } })} className={sel}>
                  <option value="">—</option>{[...Array(10).keys()].map((n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
                </select>
              ))}
              {mode === 'moscow' ? (
                <select aria-label={`MoSCoW de ${t.title}`} value={p.moscow ?? ''} onChange={(e) => save(t, { moscow: (e.target.value || undefined) as Moscow | undefined })}
                  className={`${sel} font-medium ${MOSCOW.find((x) => x[0] === p.moscow)?.[2] ?? ''}`}>
                  <option value="">Sem decisão</option>{MOSCOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <span className="flex flex-col gap-1">
                  {score != null ? <><b className="text-[14px]">{String(score).replace('.', ',')}</b><span className="flex h-[5px] rounded-full bg-line"><span className="rounded-full bg-accent" style={{ width: `${(score / max) * 100}%` }} /></span></>
                    : <span className="text-[12px] text-faint">preencha tudo</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
