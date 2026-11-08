import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Undo2 } from 'lucide-react'
import { message } from '../data/api'
import { KIND_NAME, brlCents, describe, doneToday, logDone, markUndone, perform, undo, type Action, type Ctx, type Done } from '../data/commands'

// Chat que faz (fase 12). Desenho: a sugestão. O cartão mostra o que foi entendido para conferir e
// ajustar antes de gravar; pedidos com várias ações viram uma lista para marcar. Nada grava sem o clique.

const field = 'h-9 w-full rounded-lg border border-line-strong bg-raised px-2.5 text-[13.5px] outline-none focus:border-accent'
const lab = 'flex min-w-0 flex-col gap-1 text-[12px] text-muted'
const today = () => new Date().toLocaleDateString('sv')

function Editor({ a, ctx, set }: { a: Action; ctx: Ctx; set: (a: Action) => void }) {
  const projects = ctx.projects
  const projSel = (value: number | null, on: (id: number) => void) => (
    <label className={lab}>Projeto<select value={value ?? ''} onChange={(e) => on(Number(e.target.value))} className={field}>
      {value == null && <option value="">Escolha…</option>}
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
  )
  const grid = 'grid grid-cols-1 gap-2 sm:grid-cols-3'
  switch (a.kind) {
    case 'tx': {
      const tx = a.tx, up = (p: Partial<typeof tx>) => set({ ...a, tx: { ...tx, ...p } })
      return (
        <div className={grid}>
          <label className={lab}>Tipo<select value={tx.kind} onChange={(e) => up({ kind: e.target.value as 'in' | 'out' })} className={field}><option value="out">Despesa</option><option value="in">Receita</option></select></label>
          <label className={lab}>Valor (R$)<input inputMode="decimal" value={(tx.amount / 100).toFixed(2).replace('.', ',')} onChange={(e) => up({ amount: Math.round(Number(e.target.value.replace(/\./g, '').replace(',', '.')) * 100) || 0 })} className={field} /></label>
          <label className={lab}>Data<input type="date" value={tx.due} onChange={(e) => up({ due: e.target.value, paidAt: e.target.value <= ctx.today ? e.target.value : null })} className={field} /></label>
          <label className={lab}>Descrição<input value={tx.description} onChange={(e) => up({ description: e.target.value })} className={field} /></label>
          <label className={lab}>Categoria<input value={tx.category} onChange={(e) => up({ category: e.target.value })} className={field} /></label>
          <label className={lab}>Conta<input value={tx.account} onChange={(e) => up({ account: e.target.value })} placeholder="opcional" className={field} /></label>
        </div>
      )
    }
    case 'task':
      return (
        <div className={grid}>
          <label className={lab}>Título<input value={a.title} onChange={(e) => set({ ...a, title: e.target.value })} className={field} /></label>
          <label className={lab}>Quando<span className="flex gap-1.5"><input type="date" value={a.date} onChange={(e) => set({ ...a, date: e.target.value })} className={field} /><input type="time" aria-label="Hora" value={a.time} onChange={(e) => set({ ...a, time: e.target.value })} className={`${field} w-[96px] shrink-0`} /></span></label>
          {projSel(a.projectId, (id) => set({ ...a, projectId: id }))}
        </div>
      )
    case 'followup':
      return (
        <div className={grid}>
          <label className={lab}>O que fazer<input value={a.title} onChange={(e) => set({ ...a, title: e.target.value })} className={field} /></label>
          <label className={lab}>Dia<input type="date" value={a.date} onChange={(e) => set({ ...a, date: e.target.value })} className={field} /></label>
          <label className={lab}>Hora<input type="time" value={a.time} onChange={(e) => set({ ...a, time: e.target.value })} className={field} /></label>
        </div>
      )
    case 'opp':
      return (
        <div className={grid}>
          <label className={lab}>Cliente{a.companyId ? '' : ' (novo)'}<input value={a.companyName} disabled={!!a.companyId} onChange={(e) => set({ ...a, companyName: e.target.value })} className={field} /></label>
          <label className={lab}>Título<input value={a.title} onChange={(e) => set({ ...a, title: e.target.value })} className={field} /></label>
          <label className={lab}>Valor (R$)<input inputMode="decimal" value={(a.value / 100).toFixed(2).replace('.', ',')} onChange={(e) => set({ ...a, value: Math.round(Number(e.target.value.replace(/\./g, '').replace(',', '.')) * 100) || 0 })} className={field} /></label>
        </div>
      )
    case 'hours':
      return (
        <div className={grid}>
          <label className={lab}>Minutos<input type="number" min={1} value={a.minutes} onChange={(e) => set({ ...a, minutes: Math.max(1, Number(e.target.value) || 0) })} className={field} /></label>
          <label className={lab}>Dia<input type="date" value={a.day} onChange={(e) => set({ ...a, day: e.target.value })} className={field} /></label>
          {projSel(a.projectId, (id) => set({ ...a, projectId: id }))}
        </div>
      )
    case 'move':
      return <p className="text-[13.5px]">"{a.taskTitle}" vai para a coluna <b>{a.columnName}</b>.</p>
    case 'sprint':
      return (
        <div className="flex flex-col">
          <label className="flex items-start gap-2.5 border-b border-line py-2 text-[13.5px]"><input type="checkbox" checked disabled className="mt-1" /><span><b>Criar a "{a.name}"</b><br /><span className="text-muted">{a.start.slice(8, 10)}/{a.start.slice(5, 7)} a {a.end.slice(8, 10)}/{a.end.slice(5, 7)}</span></span></label>
          {a.items.length === 0 && <p className="border-b border-line py-2 text-[13px] text-muted">Nenhuma tarefa urgente aberta neste projeto: a sprint nasce vazia.</p>}
          {a.items.map((it, i) => (
            <label key={it.id} className="flex items-start gap-2.5 border-b border-line py-2 text-[13.5px]">
              <input type="checkbox" checked={it.checked} onChange={(e) => set({ ...a, items: a.items.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)) })} className="mt-1" />
              <span>Pôr <b>{it.title}</b> na sprint</span>
            </label>
          ))}
          <label className="flex items-start gap-2.5 py-2 text-[13.5px]"><input type="checkbox" checked={a.review} onChange={(e) => set({ ...a, review: e.target.checked })} className="mt-1" /><span>Tarefa "Reunião de revisão" no último dia, 16:00</span></label>
        </div>
      )
  }
}

/** Uma ou várias ações para conferir. `onAsk` manda a frase para o Chat em vez de fazer. */
export function ActionPlan({ actions, ctx, onDone, onCancel, onAsk, compact }: {
  actions: Action[]; ctx: Ctx; onDone: (msg: string) => void; onCancel: () => void; onAsk?: () => void; compact?: boolean
}) {
  const [list, setList] = useState(actions)
  const [on, setOn] = useState(actions.map(() => true))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setList(actions); setOn(actions.map(() => true)) }, [actions])
  const many = list.length > 1
  const n = on.filter(Boolean).length
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const msgs: string[] = []
      for (let i = 0; i < list.length; i++) {
        if (!on[i]) continue
        const d = await perform(list[i], ctx)
        logDone(d, ctx.today)
        msgs.push(d.text)
      }
      onDone(msgs.length === 1 ? `Feito: ${msgs[0]}.` : `Feito: ${msgs.length} ações.`)
    } catch (e) { setErr(message(e)) } finally { setBusy(false) }
  }
  const head = many ? `${list.length} ações` : list[0].kind === 'sprint' ? `Sprint · ${ctx.projects.find((p) => p.id === (list[0] as Extract<Action, { kind: 'sprint' }>).projectId)?.name ?? ''}` : `${KIND_NAME[list[0].kind]} · confira`
  const count = list.length === 1 && list[0].kind === 'sprint' ? 1 + list[0].items.filter((i) => i.checked).length + (list[0].review ? 1 : 0) : n
  return (
    <section aria-label="Ação para conferir" onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className={`anim-rise flex flex-col gap-3 rounded-[14px] border-[1.5px] border-accent bg-card ${compact ? 'p-3' : 'px-4 py-3.5'}`}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-link">{head}</span>
      {many ? (
        <div className="flex flex-col">
          {list.map((a, i) => {
            const d = describe(a, ctx)
            return (
              <label key={i} className="flex items-start gap-2.5 border-b border-line py-2 text-[13.5px] last:border-0">
                <input type="checkbox" checked={on[i]} onChange={(e) => setOn(on.map((x, j) => (j === i ? e.target.checked : x)))} className="mt-1" />
                <span><b>{KIND_NAME[a.kind]}: {d.title}</b><br /><span className="text-muted">{d.sub}</span></span>
              </label>
            )
          })}
        </div>
      ) : <Editor a={list[0]} ctx={ctx} set={(a) => setList([a])} />}
      {err && <p role="alert" className="text-[13px] text-[#B3261E] dark:text-[#FF8A80]">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" autoFocus={!compact} disabled={busy || count === 0} onClick={() => void run()}
          className="h-10 rounded-[10px] bg-accent px-4 text-[14px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50">
          {busy ? 'Fazendo…' : many || list[0].kind === 'sprint' ? `Fazer ${count === 1 ? 'a marcada' : `as ${count} marcadas`}` : list[0].kind === 'tx' ? 'Lançar' : list[0].kind === 'move' ? 'Mover' : 'Criar'}{compact && !busy ? ' · Enter' : ''}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-[10px] px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">Cancelar{compact ? ' · Esc' : ''}</button>
        {onAsk && <button type="button" onClick={onAsk} className="text-[13px] text-link hover:underline">Perguntar ao Chat em vez disso</button>}
      </div>
    </section>
  )
}

/** "Feito pelo Chat · hoje", com Abrir e Desfazer. */
export function DoneList({ title = 'Feito pelo Chat · hoje' }: { title?: string }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<Done[]>(() => doneToday(today()))
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const f = () => setItems(doneToday(today()))
    window.addEventListener('tesseract:chat-done', f)
    return () => window.removeEventListener('tesseract:chat-done', f)
  }, [])
  if (!items.length) return null
  const back = async (d: Done) => {
    setErr(null)
    try { await undo(d); markUndone(d.at, today()) } catch (e) { setErr(message(e)) }
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-xl border border-line bg-card px-4 py-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{title}</span>
      {items.map((d) => (
        <div key={d.at} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2 text-[13.5px] last:border-0 last:pb-0">
          <span className="font-mono text-[12px] text-faint">{new Date(d.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className={`min-w-0 flex-1 ${d.undone ? 'text-faint line-through' : ''}`}>{d.text}</span>
          {d.undone ? <span className="text-[12px] text-muted">desfeito</span> : <>
            {d.open && <button type="button" onClick={() => navigate(d.open!)} className="text-[12.5px] text-link hover:underline">Abrir</button>}
            {d.undo.length > 0 && <button type="button" onClick={() => void back(d)} className="inline-flex items-center gap-1 text-[12.5px] text-link hover:underline"><Undo2 size={12} />Desfazer</button>}
          </>}
        </div>
      ))}
      {err && <p role="alert" className="text-[12.5px] text-[#B3261E]">{err}</p>}
      <p className="text-[12px] text-faint"><Check size={11} className="mr-1 inline" />Nada é gravado sem você confirmar. Apagar e mandar mensagem para fora nunca são pelo Chat.</p>
    </section>
  )
}

export { brlCents }
