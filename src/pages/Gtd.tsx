import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Inbox, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui'
import { HowItWorks } from '../components/Guide'
import type { Board, GtdList, Project, Task } from '../data/api'
import { method } from '../data/methods'

// GTD (fase 4B-2a). Desenho: a direção A como tela principal (esvaziar a caixa de entrada um item
// por vez, com as quatro perguntas) e, da C, as próximas ações filtradas por onde você está, tempo e energia.

const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())
const daysSince = (s: string) => Math.max(0, Math.round((new Date(`${today()}T12:00:00`).getTime() - new Date(`${s}T12:00:00`).getTime()) / 864e5))
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`)
const ENERGY = ['', 'baixa', 'média', 'alta']
const BASE_CONTEXTS = ['computador', 'telefone', 'rua', 'casa']
const TIMES = [5, 15, 30, 60, 120]

const QUESTIONS = [
  { q: 'Isso exige alguma ação sua?', help: 'Se não exige: vai para "algum dia" ou sai da lista. Informação útil pode virar nota na sua base de conhecimento.' },
  { q: 'Dá para fazer em menos de 2 minutos?', help: 'Se sim, faça agora: anotar, organizar e lembrar depois custa mais do que fazer.' },
  { q: 'É você quem vai fazer?', help: 'Se depende de outra pessoa, vai para Aguardando, com de quem e desde quando. Na revisão você cobra.' },
  { q: 'Qual é a próxima ação, e onde dá para fazer?', help: 'Escreva com um verbo ("ligar para", "enviar", "comprar") e diga o contexto: onde você precisa estar para fazer.' },
]

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`h-8 rounded-full px-3 text-[12.5px] ${on ? 'bg-fg font-medium text-bg' : 'border border-line-strong text-muted hover:text-fg'}`}>{children}</button>
  )
}

// ---------- Caixa de entrada: um item por vez (direção A) ----------
function Process({ items, contexts, onSave, onDelete, onDone, onEmpty }: {
  items: Task[]; contexts: string[]; onSave: (t: Task) => Promise<void>; onDelete: (t: Task) => Promise<void>; onDone: (t: Task) => void; onEmpty: () => void
}) {
  const [skip, setSkip] = useState(0)
  const cur = items.length ? items[skip % items.length] : null
  const [step, setStep] = useState(0)
  const [branch, setBranch] = useState<'none' | 'noaction' | 'now' | 'waiting'>('none')
  const [who, setWho] = useState('')
  const [title, setTitle] = useState('')
  const [ctx, setCtx] = useState<string | null>(null)
  const [newCtx, setNewCtx] = useState('')
  const [mins, setMins] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  useEffect(() => { setStep(0); setBranch('none'); setWho(''); setTitle(cur?.title ?? ''); setCtx(cur?.context ?? null); setMins(cur?.estimateMin ?? null); setEnergy(cur?.energy ?? null); setNewCtx('') }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-ok-bg text-ok"><Check size={22} /></span>
      <h2 className="font-serif text-[24px]">Caixa vazia.</h2>
      <p className="max-w-md text-[14px] text-muted">Tudo o que estava solto já tem lugar. Anote no campo acima quando aparecer algo novo.</p>
      <Button variant="primary" icon={ArrowRight} onClick={onEmpty}>Ver próximas ações</Button>
    </div>
  )
  const n = skip % items.length
  const btn = 'h-11 rounded-[11px] px-4 text-[14px] font-semibold'
  const primary = `${btn} bg-accent text-on-accent hover:bg-accent-strong`
  const second = `${btn} border border-line-strong bg-card hover:border-accent`
  const ctxs = [...new Set([...contexts, ...(ctx && !contexts.includes(ctx) ? [ctx] : [])])]
  const saveNext = () => void onSave({ ...cur, title: title.trim() || cur.title, gtdList: 'next', context: ctx, estimateMin: mins, energy })

  return (
    <div className="flex flex-wrap gap-5">
      <section className="flex min-w-[420px] flex-1 flex-col gap-5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-[26px]">Esvaziar a <em className="text-link">caixa</em></h2>
          <span className="text-[13px] text-muted">item {n + 1} de {items.length}</span>
          <span className="flex-1" />
          {items.length > 1 && <button type="button" onClick={() => setSkip((s) => s + 1)} className="text-[13px] text-muted hover:text-fg">Decidir depois →</button>}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border-2 border-accent bg-card px-6 py-5">
          <span className="text-[12px] text-muted">Anotado {cur.createdAt ? new Date(cur.createdAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <b className="font-serif text-[22px] font-normal leading-snug">{cur.title}</b>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] tracking-[0.14em] text-link">PERGUNTA {step + 1} DE 4</span>
          <b className="text-[18px]">{QUESTIONS[step].q}</b>

          {step === 0 && branch === 'none' && (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className={primary} onClick={() => setStep(1)}>Sim</button>
              <button type="button" className={second} onClick={() => setBranch('noaction')}>Não</button>
            </div>
          )}
          {step === 0 && branch === 'noaction' && (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className={second} onClick={() => void onSave({ ...cur, gtdList: 'someday' })}>Guardar em "algum dia / talvez"</button>
              <button type="button" className={`${second} inline-flex items-center gap-2`} onClick={() => void onDelete(cur)}><Trash2 size={15} />Não preciso: tirar da lista</button>
              <button type="button" className="h-11 px-2 text-[13px] text-muted hover:text-fg" onClick={() => setBranch('none')}>Voltar</button>
            </div>
          )}

          {step === 1 && branch === 'none' && (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className={primary} onClick={() => setBranch('now')}>Sim: faço agora</button>
              <button type="button" className={second} onClick={() => setStep(2)}>Não, leva mais</button>
            </div>
          )}
          {step === 1 && branch === 'now' && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
              <span className="text-[14px]">Faça agora. Quando terminar, marque como feito.</span>
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className={`${primary} inline-flex items-center gap-2`} onClick={() => onDone(cur)}><Check size={16} />Feito</button>
                <button type="button" className={second} onClick={() => { setBranch('none'); setStep(2) }}>Levou mais que 2 minutos</button>
              </div>
            </div>
          )}

          {step === 2 && branch === 'none' && (
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className={primary} onClick={() => setStep(3)}>Sim, sou eu</button>
              <button type="button" className={second} onClick={() => setBranch('waiting')}>Não, depende de outra pessoa</button>
            </div>
          )}
          {step === 2 && branch === 'waiting' && (
            <form className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4" onSubmit={(e) => { e.preventDefault(); if (who.trim()) void onSave({ ...cur, gtdList: 'waiting', waitingFor: who.trim(), waitingSince: today() }) }}>
              <label className="flex flex-col gap-1 text-[13px] text-muted">De quem você está esperando?
                <input autoFocus value={who} onChange={(e) => setWho(e.target.value)} placeholder="Nome da pessoa ou da empresa" className={field} /></label>
              <div className="flex gap-2.5">
                <button type="submit" disabled={!who.trim()} className={`${primary} disabled:opacity-50`}>Guardar em Aguardando</button>
                <button type="button" className="h-11 px-2 text-[13px] text-muted hover:text-fg" onClick={() => setBranch('none')}>Voltar</button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-4" onSubmit={(e) => { e.preventDefault(); saveNext() }}>
              <label className="flex flex-col gap-1 text-[13px] text-muted">Próxima ação (comece com um verbo)
                <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
              <div className="flex flex-col gap-1.5 text-[13px] text-muted">Onde dá para fazer
                <div className="flex flex-wrap gap-1.5">
                  {ctxs.map((c) => <Chip key={c} on={ctx === c} onClick={() => setCtx(ctx === c ? null : c)}>@{c}</Chip>)}
                  <input value={newCtx} onChange={(e) => setNewCtx(e.target.value)} placeholder="+ outro lugar (Enter)" aria-label="Novo contexto"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newCtx.trim().replace(/^@/, '').toLowerCase(); if (v) { setCtx(v); setNewCtx('') } } }}
                    className="h-8 w-40 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] outline-none focus:border-accent" />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-1.5 text-[13px] text-muted">Quanto tempo leva
                  <div className="flex flex-wrap gap-1.5">{TIMES.map((m) => <Chip key={m} on={mins === m} onClick={() => setMins(mins === m ? null : m)}>{fmtMin(m)}</Chip>)}</div>
                </div>
                <div className="flex flex-col gap-1.5 text-[13px] text-muted">Energia que exige
                  <div className="flex gap-1.5">{[1, 2, 3].map((x) => <Chip key={x} on={energy === x} onClick={() => setEnergy(energy === x ? null : x)}>{ENERGY[x]}</Chip>)}</div>
                </div>
              </div>
              <div><button type="submit" className={primary}>Guardar em Próximas ações</button></div>
            </form>
          )}
          <p className="text-[12.5px] text-muted">{QUESTIONS[step].help}</p>
          {step > 0 && <button type="button" onClick={() => { setStep(step - 1); setBranch('none') }} className="self-start text-[12.5px] text-muted hover:text-fg">← Pergunta anterior</button>}
        </div>
      </section>

      <aside aria-label="O caminho de cada item" className="flex w-[300px] shrink-0 flex-col gap-2.5 self-start rounded-2xl border border-line bg-card p-5">
        <b className="text-[14px]">O caminho de cada item</b>
        {QUESTIONS.map((x, i) => {
          const done = i < step, now = i === step
          return (
            <div key={i} className={`flex gap-3 rounded-[10px] p-3 ${now ? 'border-2 border-accent' : done ? 'bg-ok-bg' : 'border border-line'}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[12px] ${done ? 'bg-ok text-white' : now ? 'bg-accent text-on-accent' : 'bg-raised text-muted'}`}>{done ? <Check size={12} /> : i + 1}</span>
              <span className="text-[13px] leading-snug"><b className="font-semibold">{x.q}</b></span>
            </div>
          )
        })}
        <p className="pt-1 text-[12px] leading-relaxed text-muted">Depois de esvaziar, a caixa fica em zero e cada coisa está na lista certa.</p>
      </aside>
    </div>
  )
}

// ---------- Próximas ações por contexto, tempo e energia (da direção C) ----------
function NextActions({ items, contexts, doneIds, onDone, onUndo, onOpen }: {
  items: Task[]; contexts: string[]; doneIds: Set<number>; onDone: (t: Task) => void; onUndo: (t: Task) => void; onOpen: (t: Task) => void
}) {
  const [where, setWhere] = useState<string | null>(null)
  const [time, setTime] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const count = (c: string | null) => items.filter((t) => !c || t.context === c).length
  const inPlace = items.filter((t) => !where || t.context === where)
  // sem tempo ou energia anotados, a tarefa aparece (não dá para saber que não cabe)
  const shown = inPlace.filter((t) => (!time || !t.estimateMin || t.estimateMin <= time) && (!energy || !t.energy || t.energy <= energy))
  const hidden = inPlace.length - shown.length
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.14em] text-muted">ONDE VOCÊ ESTÁ AGORA?</span>
        <div className="flex flex-wrap gap-2">
          {[null, ...contexts].map((c) => (
            <button key={c ?? 'all'} type="button" aria-pressed={where === c} onClick={() => setWhere(c)}
              className={`flex h-11 items-center gap-2.5 rounded-[11px] px-4 text-[14px] ${where === c ? 'border-2 border-accent bg-card font-semibold' : 'border border-line hover:border-line-strong'}`}>
              {c ? `@${c}` : 'Qualquer lugar'}<span className="text-[12.5px] font-normal text-muted">{count(c)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1.5 text-[12.5px] text-muted">Tempo que eu tenho
          <div className="flex gap-1.5">{([[null, 'Qualquer'], [15, 'até 15 min'], [30, 'até 30 min'], [60, 'até 1 h']] as const).map(([v, l]) => <Chip key={l} on={time === v} onClick={() => setTime(v)}>{l}</Chip>)}</div>
        </div>
        <div className="flex flex-col gap-1.5 text-[12.5px] text-muted">Minha energia agora
          <div className="flex gap-1.5">{([[null, 'Qualquer'], [1, 'Baixa'], [2, 'Média'], [3, 'Alta']] as const).map(([v, l]) => <Chip key={l} on={energy === v} onClick={() => setEnergy(v)}>{l}</Chip>)}</div>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">Nada para fazer {where ? `@${where}` : ''} com esses filtros.</li>}
        {shown.map((t) => {
          const isDone = doneIds.has(t.id!)
          return (
          <li key={t.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isDone ? 'kcard-done' : 'kcard'}`}>
            <input type="checkbox" checked={isDone} onChange={() => (isDone ? onUndo(t) : onDone(t))} aria-label={isDone ? `Desfazer: ${t.title}` : `Concluir ${t.title}`} className="size-[18px] accent-[var(--t-ok)]" />
            <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 flex-col text-left">
              <b className={`truncate text-[14.5px] font-semibold hover:underline ${isDone ? 'text-ok line-through' : ''}`}>{t.title}</b>
              {isDone && <span className="text-[12px] text-ok">Feita. Desmarque para desfazer.</span>}
              <span className="text-[12px] text-muted">{[t.context ? `@${t.context}` : 'sem contexto', t.estimateMin ? fmtMin(t.estimateMin) : null, t.energy ? `energia ${ENERGY[t.energy]}` : null].filter(Boolean).join(' · ')}</span>
            </button>
            {t.due && !isDone && <span className={`text-[12px] ${t.due < today() ? LATE : 'text-muted'}`}>{new Date(`${t.due}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
          </li>
          )
        })}
      </ul>
      {hidden > 0 && <button type="button" onClick={() => { setTime(null); setEnergy(null) }} className="self-start text-[12.5px] text-link hover:underline">{hidden} ação(ões) escondida(s) pelos filtros de tempo e energia. Mostrar</button>}
    </div>
  )
}

// ---------- Página do GTD ----------
export function GtdView({ project, board, onSave, onDelete, onMove, onOpen, onAdd }: {
  project: Project; board: Board; onSave: (t: Task) => Promise<void>; onDelete: (t: Task) => Promise<void>
  onMove: (id: number, colId: number, ord: number) => Promise<void>; onOpen: (t: Task) => void; onAdd: (title: string) => Promise<void>
}) {
  const done = (t: Task) => !!board.columns.find((c) => c.id === t.columnId)?.done
  const open = board.tasks.filter((t) => !done(t))
  const lists: Record<GtdList, Task[]> = {
    inbox: open.filter((t) => t.gtdList === 'inbox'),
    next: open.filter((t) => t.gtdList === 'next' || t.gtdList == null),
    waiting: open.filter((t) => t.gtdList === 'waiting'),
    someday: open.filter((t) => t.gtdList === 'someday'),
  }
  const [list, setList] = useState<GtdList>(() => (lists.inbox.length ? 'inbox' : 'next'))
  const [draft, setDraft] = useState('')
  const contexts = useMemo(() => [...new Set([...BASE_CONTEXTS, ...board.tasks.map((t) => t.context).filter((c): c is string => !!c)])], [board.tasks])
  const doneCol = board.columns.find((c) => c.done)
  const endOf = (colId: number) => Math.max(0, ...board.tasks.filter((x) => x.columnId === colId).map((x) => x.ord)) + 1
  // concluídas nesta visita continuam na lista, riscadas, para dar para ver e desfazer (id -> coluna de antes)
  const [justDone, setJustDone] = useState<Record<number, number>>({})
  const complete = (t: Task) => {
    if (!doneCol) return
    if (t.columnId != null) setJustDone((m) => ({ ...m, [t.id!]: t.columnId! }))
    void onMove(t.id!, doneCol.id!, endOf(doneCol.id!))
  }
  const undo = (t: Task) => {
    const back = justDone[t.id!] ?? board.columns.find((c) => !c.done)?.id
    setJustDone((m) => { const n = { ...m }; delete n[t.id!]; return n })
    if (back != null) void onMove(t.id!, back, endOf(back))
  }
  const doneIds = new Set(Object.keys(justDone).map(Number))
  const recentNext = board.tasks.filter((t) => doneIds.has(t.id!) && done(t) && (t.gtdList === 'next' || t.gtdList == null))
  const nav: [GtdList, string, string][] = [['inbox', 'Caixa de entrada', 'Tudo que você anotou e ainda não decidiu'], ['next', 'Próximas ações', 'O que dá para fazer, por lugar'], ['waiting', 'Aguardando', 'Depende de outra pessoa'], ['someday', 'Algum dia / talvez', 'Ideias sem compromisso']]

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) void onAdd(v).then(() => setDraft('')) }}
        className="flex h-12 items-center gap-2.5 rounded-xl border border-line-strong bg-card px-4 focus-within:border-accent">
        <button type="submit" aria-label="Guardar na caixa de entrada" title="Guardar na caixa de entrada"
          onClick={(e) => { if (!draft.trim()) { e.preventDefault(); (e.currentTarget.nextElementSibling?.querySelector('input') as HTMLInputElement | null)?.focus() } }}
          className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-link hover:bg-accent-soft"><Plus size={17} /></button>
        <label className="flex-1"><span className="sr-only">Anotar na caixa de entrada</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Anote qualquer coisa que está na cabeça. Enter guarda na caixa de entrada." className="h-full w-full bg-transparent text-[14px] outline-none placeholder:text-faint" /></label>
      </form>
      <HowItWorks id="gtd" title="GTD (A arte de fazer acontecer)" guide={method('gtd')!.guide} />
      <div className="flex flex-wrap gap-5">
        <nav aria-label="Listas do GTD" className="flex w-[220px] shrink-0 flex-col gap-1">
          {nav.map(([id, label, hint]) => (
            <button key={id} type="button" onClick={() => setList(id)} aria-current={list === id ? 'page' : undefined}
              className={`flex flex-col rounded-[10px] px-3 py-2.5 text-left ${list === id ? 'bg-accent-soft' : 'hover:bg-raised'}`}>
              <span className={`flex items-center gap-2 text-[14px] ${list === id ? 'font-semibold text-link' : ''}`}>
                {id === 'inbox' && <Inbox size={15} />}<span className="flex-1">{label}</span>
                <span className={`text-[12.5px] ${id === 'inbox' && lists.inbox.length ? 'rounded-full bg-accent px-2 font-semibold text-on-accent' : 'text-muted'}`}>{lists[id].length}</span>
              </span>
              <span className="text-[11.5px] text-faint">{hint}</span>
            </button>
          ))}
          {project.reviewDay != null && <p className="px-3 pt-3 text-[12px] text-muted">Revisão semanal toda {['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][project.reviewDay]}: caixa em zero, aguardando cobrado, algum dia relido.</p>}
        </nav>
        <div className="min-w-0 flex-1">
          {list === 'inbox' && <Process items={lists.inbox} contexts={contexts} onSave={onSave} onDelete={onDelete} onDone={complete} onEmpty={() => setList('next')} />}
          {list === 'next' && <NextActions items={[...lists.next, ...recentNext]} contexts={contexts} doneIds={doneIds} onDone={complete} onUndo={undo} onOpen={onOpen} />}
          {list === 'waiting' && (
            <ul className="flex flex-col gap-2">
              {lists.waiting.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">Nada esperando por outra pessoa.</li>}
              {lists.waiting.map((t) => {
                const d = t.waitingSince ? daysSince(t.waitingSince) : null
                return (
                  <li key={t.id} className="kcard flex items-center gap-3 rounded-xl border px-4 py-3">
                    <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 flex-col text-left">
                      <b className="truncate text-[14.5px] font-semibold hover:underline">{t.title}</b>
                      <span className={`text-[12px] ${d != null && d >= 7 ? LATE : 'text-muted'}`}>De: {t.waitingFor ?? '?'}{d != null ? ` · há ${d} dia${d === 1 ? '' : 's'}${d >= 7 ? ', vale cobrar' : ''}` : ''}</span>
                    </button>
                    <Button onClick={() => void onSave({ ...t, gtdList: 'next', waitingFor: null, waitingSince: null })}>Chegou: virou ação</Button>
                    <Button variant="ghost" icon={Check} ariaLabel={`Concluir ${t.title}`} title="Resolvido" onClick={() => complete(t)} />
                  </li>
                )
              })}
            </ul>
          )}
          {list === 'someday' && (
            <ul className="flex flex-col gap-2">
              {lists.someday.length === 0 && <li className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[13.5px] text-muted">Nenhuma ideia guardada para algum dia.</li>}
              {lists.someday.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
                  <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 truncate text-left text-[14px] text-muted hover:text-fg">{t.title}</button>
                  <Button onClick={() => void onSave({ ...t, gtdList: 'inbox' })}>Ativar</Button>
                  <Button variant="ghost" icon={Trash2} ariaLabel={`Tirar ${t.title}`} onClick={() => void onDelete(t)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
