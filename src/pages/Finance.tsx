import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BarChart3, Check, ChevronLeft, ChevronRight, FileUp, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '../components/ui'
import { HowItWorks } from '../components/Guide'
import { call, message, useScopes, type FinanceNames, type ImportReport, type Project, type Tx } from '../data/api'
import { ACCOUNT_PRESETS, categoryPresets, expensePresets } from '../data/finance-presets'
import { brl, parseMoney } from '../data/statement'
import { pro } from '@pro'
import type { Guide } from '../data/methods'
import { IncomeReport } from './IncomeReport'

// Finanças (fase 4D). Desenho: direção A, "fluxo do mês". A importação de extrato com conciliação é do Pro
// (pro/ui/components/ImportStatement.tsx, pela ponte '@pro').
// Previsto, pago e recebido são coisas diferentes: um lançamento é previsto até ganhar a data em que aconteceu.

const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const field = 'h-10 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = () => iso(new Date())
const fmtDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
const addMonths = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1 + n, 1, 12); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(d, last)); return iso(x) }
// data do dinheiro: quando aconteceu, senão quando está previsto
const ref = (t: Tx) => t.paidAt ?? t.due

type Status = 'Recebido' | 'Pago' | 'A receber' | 'A pagar' | 'Atrasado'
const status = (t: Tx): Status => (t.paidAt ? (t.kind === 'in' ? 'Recebido' : 'Pago') : t.due < today() ? 'Atrasado' : t.kind === 'in' ? 'A receber' : 'A pagar')
const PILL: Record<Status, string> = {
  Recebido: 'bg-ok-bg text-ok',
  Pago: 'bg-raised text-fg',
  'A receber': 'text-muted ring-1 ring-inset ring-line-strong',
  'A pagar': 'text-muted ring-1 ring-inset ring-line-strong',
  Atrasado: `bg-[#B3261E]/12 ${LATE}`,
}

const GUIDE: Guide = {
  how: [
    'Lance o que você espera receber e pagar no mês, com a data prevista. Isso é o previsto.',
    'Quando o dinheiro entrar ou sair de verdade, clique em "Recebi" ou "Paguei". Ele passa a contar como realizado.',
    'Contas fixas (aluguel, internet, mensalidade de cliente): ao criar, peça para repetir nos próximos meses.',
    ...(pro.FinanceImport ? ['Baixe o extrato do banco (OFX ou CSV) e importe. O que bate com um previsto aparece para você confirmar, sem lançar duas vezes.'] : []),
    'Use as abas do topo para separar Pessoal de cada empresa. Os números nunca se misturam.',
  ],
  why: 'Saldo de banco mostra o passado. Separar previsto de realizado mostra o futuro: quanto ainda vai entrar, quanto ainda vai sair e se o mês fecha no positivo. Os atrasados ficam em vermelho porque são o que mais custa caro esquecer.',
  when: 'Todo mês, para quem tem renda variável, atende clientes ou mistura conta pessoal com a da empresa. Cinco minutos por semana bastam.',
}

// ---------- Painel do lançamento ----------
// Lista com opções prontas, as que a pessoa já usou e "Outro…" para escrever.
function PickOrType({ label, empty, value, onChange, presets, used, placeholder }: {
  label: string; empty: string; value: string; onChange: (v: string) => void; presets: string[]; used: string[]; placeholder: string
}) {
  const mine = used.filter((u) => !presets.includes(u))
  const known = [...presets, ...mine]
  const [typing, setTyping] = useState(() => !!value && !known.includes(value))
  return (
    <div className="flex flex-col gap-1 text-[13.5px] text-muted">
      <span>{label}</span>
      {typing ? (
        <div className="flex gap-2">
          <label className="flex-1"><span className="sr-only">{label}</span>
            <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={field} /></label>
          <button type="button" onClick={() => { setTyping(false); if (!known.includes(value)) onChange('') }} className="shrink-0 text-[12.5px] text-link hover:underline">Ver lista</button>
        </div>
      ) : (
        <label><span className="sr-only">{label}</span>
          <select value={known.includes(value) ? value : ''} onChange={(e) => { if (e.target.value === '__outro') { setTyping(true); onChange('') } else onChange(e.target.value) }} className={field}>
            <option value="">{empty}</option>
            <optgroup label="Sugestões">{presets.map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>
            {mine.length > 0 && <optgroup label="Usadas por você">{mine.map((p) => <option key={p} value={p}>{p}</option>)}</optgroup>}
            <option value="__outro">Outro… (escrever)</option>
          </select></label>
      )}
    </div>
  )
}

function TxPanel({ tx, names, projects, onSave, onDelete, onClose }: {
  tx: Tx; names: FinanceNames; projects: Project[]
  onSave: (t: Tx, repeat: number) => Promise<void>; onDelete: (t: Tx) => Promise<void>; onClose: () => void
}) {
  const [t, setT] = useState<Tx>(tx)
  // entrada: os projetos (clientes) do escopo, senão os de todos; saída: despesas comuns e as já usadas
  const active = projects.filter((p) => !p.archived)
  const scopeProjects = active.filter((p) => p.scope === t.scope)
  const suggestions = [...new Set(t.kind === 'in'
    ? [...(scopeProjects.length ? scopeProjects : active).map((p) => p.name), ...names.incomes]
    : [...names.expenses, ...expensePresets(t.scope)])].slice(0, 12)
  const [value, setValue] = useState(tx.amount ? (tx.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')
  const [repeat, setRepeat] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const set = (p: Partial<Tx>) => setT((x) => ({ ...x, ...p }))
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const save = async () => {
    const cents = parseMoney(value)
    if (cents == null || cents <= 0) { setError('Digite um valor maior que zero, como 1.250,00.'); return }
    if (!t.description.trim()) { setError('Dê uma descrição ao lançamento.'); return }
    setError(null)
    try { await onSave({ ...t, amount: Math.abs(cents) }, repeat); onClose() } catch (e) { setError(message(e)) }
  }
  return (
    <aside aria-label="Lançamento" className="anim-slide-in flex w-[380px] shrink-0 flex-col border-l border-line bg-card">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted">{t.id ? 'LANÇAMENTO' : 'NOVO LANÇAMENTO'}</span>
        <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} />
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 text-[13.5px]">
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-lg border border-line-strong p-1">
          {([['in', 'Entrada', ArrowDownLeft], ['out', 'Saída', ArrowUpRight]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={t.kind === k} onClick={() => set({ kind: k, category: k !== t.kind && categoryPresets(t.scope, t.kind).includes(t.category) ? '' : t.category })}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md font-medium ${t.kind === k ? (k === 'in' ? 'bg-ok-bg text-ok' : 'bg-raised text-fg') : 'text-muted hover:text-fg'}`}><Icon size={15} />{label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1 text-muted">{t.kind === 'in' ? 'De quem (cliente ou projeto)' : 'Com o quê'}
            <input autoFocus={!t.id} value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={t.kind === 'in' ? 'Nome do cliente ou do projeto' : 'Aluguel, internet, fornecedor…'} className={field} /></label>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] text-faint">{t.kind === 'in' ? (scopeProjects.length ? 'Dos seus projetos' : 'Usados antes') : 'Sugestões'}</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => set({ description: s })} aria-pressed={t.description === s}
                    className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[12px] ${t.description === s ? 'border-accent bg-accent-soft text-link' : 'border-line-strong text-fg hover:border-accent'}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {t.kind === 'in' && projects.length === 0 && <span className="text-[11.5px] text-faint">Crie seus clientes e projetos em Projetos: eles aparecem aqui para escolher.</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-muted">Valor (R$)
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className={`${field} font-mono`} /></label>
          <label className="flex flex-col gap-1 text-muted">{t.kind === 'in' ? 'Previsto para' : 'Vence em'}
            <input type="date" value={t.due} onChange={(e) => set({ due: e.target.value })} className={field} /></label>
        </div>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={!!t.paidAt} onChange={(e) => set({ paidAt: e.target.checked ? (t.due <= today() ? t.due : today()) : null })} className="size-4 accent-[var(--t-accent)]" />
          {t.kind === 'in' ? 'Já recebi' : 'Já paguei'}
          {t.paidAt && <input type="date" aria-label="Data em que aconteceu" value={t.paidAt} onChange={(e) => set({ paidAt: e.target.value || null })} className={`${field} h-8 w-auto flex-1`} />}
        </label>
        <PickOrType key={`cat-${t.kind}`} label="Categoria" empty="Sem categoria" value={t.category} onChange={(v) => set({ category: v })}
          presets={categoryPresets(t.scope, t.kind)} used={names.categories} placeholder="Escreva a categoria" />
        <PickOrType label="Conta" empty="Sem conta" value={t.account} onChange={(v) => set({ account: v })}
          presets={ACCOUNT_PRESETS} used={names.accounts} placeholder="Ex.: Itaú PJ, Sicredi, cofre" />
        {!t.id && (
          <label className="flex flex-col gap-1 text-muted">Repetir
            <select value={repeat} onChange={(e) => setRepeat(+e.target.value)} className={field}>
              <option value={0}>Só este mês</option>
              {[2, 3, 6, 12, 24].map((n) => <option key={n} value={n - 1}>Todo mês, {n} vezes no total</option>)}
            </select>
            <span className="text-[12px] text-faint">Para contas fixas e parcelas. As próximas nascem como previstas.</span>
          </label>
        )}
        <label className="flex flex-col gap-1 text-muted">Notas
          <textarea value={t.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} className="rounded-lg border border-line-strong bg-raised p-3 outline-none focus:border-accent" /></label>
      </div>
      <footer className="flex flex-col gap-2 border-t border-line px-5 py-3">
        {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          {t.id && <Button variant="ghost" icon={Trash2} onClick={() => onDelete(t).then(onClose)}>Excluir</Button>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()}>Salvar</Button>
        </div>
      </footer>
    </aside>
  )
}

// ---------- Página ----------
export function Finance() {
  const scopes = useScopes()
  const [scope, setScope] = useState('personal')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1, 12) })
  const [txs, setTxs] = useState<Tx[]>([])
  const [late, setLate] = useState<Tx[]>([])
  const [names, setNames] = useState<FinanceNames>({ categories: [], accounts: [], incomes: [], expenses: [] })
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState<'todos' | 'receber' | 'pagar' | 'atrasados' | 'realizados'>('todos')
  const [editing, setEditing] = useState<Tx | null>(null)
  const [importing, setImporting] = useState(false)
  const [incomeReport, setIncomeReport] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const from = iso(month), to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0, 12))
  const t0 = today()

  const load = () => Promise.all([
    call<Tx[]>('finance_list', { scope, from, to }).then(setTxs),
    call<Tx[]>('finance_overdue', { scope, today: t0 }).then(setLate),
    call<FinanceNames>('finance_names', { scope }).then(setNames),
    call<Project[]>('projects_list').then(setProjects),
  ]).catch((e) => setError(message(e)))
  useEffect(() => { void load(); setEditing(null) }, [scope, from]) // eslint-disable-line react-hooks/exhaustive-deps

  // o mês conta pela data do dinheiro: quando aconteceu, senão quando está previsto
  const inMonth = txs.filter((t) => ref(t) >= from && ref(t) <= to)
  const sum = (xs: Tx[]) => xs.reduce((s, t) => s + t.amount, 0)
  const ins = inMonth.filter((t) => t.kind === 'in'), outs = inMonth.filter((t) => t.kind === 'out')
  const k = {
    inAll: sum(ins), inPaid: sum(ins.filter((t) => t.paidAt)), outAll: sum(outs), outPaid: sum(outs.filter((t) => t.paidAt)),
    late: sum(late), lateIn: late.filter((t) => t.kind === 'in').length, lateOut: late.filter((t) => t.kind === 'out').length,
  }
  const result = k.inAll - k.outAll
  const lastDay = Number(to.slice(8))
  const weeks = [[1, 7], [8, 14], [15, 21], [22, 28], [29, lastDay]].filter(([a]) => a <= lastDay).map(([a, b]) => {
    const xs = inMonth.filter((t) => { const d = Number(ref(t).slice(8)); return d >= a && d <= b })
    const i = xs.filter((t) => t.kind === 'in'), o = xs.filter((t) => t.kind === 'out')
    return { label: `${a}–${b}`, inAll: sum(i), inPaid: sum(i.filter((t) => t.paidAt)), outAll: sum(o), outPaid: sum(o.filter((t) => t.paidAt)) }
  })
  const maxBar = Math.max(1, ...weeks.flatMap((w) => [w.inAll, w.outAll]))

  const rows = useMemo(() => {
    const all = [...late.filter((t) => !inMonth.some((x) => x.id === t.id)), ...inMonth]
    const pick = { todos: all, receber: all.filter((t) => t.kind === 'in' && !t.paidAt), pagar: all.filter((t) => t.kind === 'out' && !t.paidAt), atrasados: all.filter((t) => status(t) === 'Atrasado'), realizados: all.filter((t) => t.paidAt) }[filter]
    return [...pick].sort((a, b) => ref(a).localeCompare(ref(b)) || (a.id ?? 0) - (b.id ?? 0))
  }, [txs, late, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (t: Tx, repeat: number) => {
    await call('finance_save', { tx: t })
    for (let i = 1; i <= repeat; i++) await call('finance_save', { tx: { ...t, id: null, due: addMonths(t.due, i), paidAt: null } })
    await load()
  }
  const paid = (t: Tx, on: boolean) => call('finance_paid', { id: t.id, day: on ? t0 : null }).then(load).catch((e) => setError(message(e)))
  const blank = (): Tx => ({ id: null, scope, kind: 'out', description: '', category: '', account: names.accounts[0] ?? '', amount: 0, due: t0 >= from && t0 <= to ? t0 : from, paidAt: null, notes: '' })
  const scopeName = scopes.find((s) => s.id === scope)?.name ?? 'Pessoal'
  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long' })
  const bar = (v: number, all: number) => `${Math.max(all ? 3 : 0, (v / maxBar) * 100)}%`

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {error && <p className={`text-[13px] ${LATE}`} role="alert">{error} <button type="button" onClick={() => setError(null)} className="underline">ok</button></p>}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Finanças · {scopeName}</span>
            <h1 className="font-serif text-[26px] leading-tight"><span className="capitalize">{monthLabel}</span> <em className="text-link">{month.getFullYear()}</em></h1>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" icon={ChevronLeft} ariaLabel="Mês anterior" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1, 12))} />
            <Button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12)) }}>Hoje</Button>
            <Button variant="ghost" icon={ChevronRight} ariaLabel="Próximo mês" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1, 12))} />
          </div>
          <div role="tablist" aria-label="Escopo" className="inline-flex flex-wrap gap-1 rounded-lg border border-line-strong p-1">
            {scopes.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
                className={`h-8 rounded-md px-3 text-[13.5px] ${scope === s.id ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{s.name}</button>
            ))}
          </div>
          <span className="flex-1" />
          <Button icon={BarChart3} onClick={() => setIncomeReport(true)} title="Quanto entrou, quanto falta e de onde veio, no período que você escolher">Resumo das receitas</Button>
          {pro.FinanceImport && <Button icon={FileUp} onClick={() => setImporting(true)}>Importar extrato (CSV/OFX)</Button>}
          <Button variant="primary" icon={Plus} onClick={() => setEditing(blank())}>Lançamento</Button>
        </header>

        {report && (
          <p className="anim-rise flex items-center gap-3 rounded-xl border border-ok/30 bg-ok-bg px-4 py-2.5 text-[13.5px] text-ok" role="status">
            <Check size={15} />Extrato importado: {report.inserted} novo(s), {report.matched} conciliado(s) com previstos{report.skipped ? `, ${report.skipped} já existia(m) ou não deu para ler` : ''}.
            <button type="button" onClick={() => setReport(null)} className="ml-auto underline">ok</button>
          </p>
        )}

        <HowItWorks id="financas" title="Fluxo do mês" guide={GUIDE} />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-4">
            <span className="text-[12px] text-muted">Recebido</span>
            <b className="font-serif text-[24px] font-normal text-ok">{brl(k.inPaid)}</b>
            <span className="text-[12px] text-muted">de {brl(k.inAll)} previstos</span>
            <span className="flex h-[5px] rounded-full bg-line"><span className="rounded-full bg-ok" style={{ width: `${k.inAll ? (k.inPaid / k.inAll) * 100 : 0}%` }} /></span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-4">
            <span className="text-[12px] text-muted">Pago</span>
            <b className="font-serif text-[24px] font-normal">{brl(k.outPaid)}</b>
            <span className="text-[12px] text-muted">de {brl(k.outAll)} previstos</span>
            <span className="flex h-[5px] rounded-full bg-line"><span className="rounded-full bg-fg" style={{ width: `${k.outAll ? (k.outPaid / k.outAll) * 100 : 0}%` }} /></span>
          </div>
          <button type="button" onClick={() => setFilter('atrasados')} className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left ${late.length ? 'border-[#B3261E]/30 bg-[#B3261E]/8' : 'border-line bg-card'}`}>
            <span className={`text-[12px] ${late.length ? LATE : 'text-muted'}`}>Atrasado</span>
            <b className={`font-serif text-[24px] font-normal ${late.length ? LATE : ''}`}>{brl(k.late)}</b>
            <span className={`text-[12px] ${late.length ? LATE : 'text-muted'}`}>{late.length ? [k.lateIn ? `${k.lateIn} a receber` : '', k.lateOut ? `${k.lateOut} a pagar` : ''].filter(Boolean).join(' · ') + ' vencido(s)' : 'Nada vencido'}</span>
          </button>
          <div className="flex flex-col gap-1.5 rounded-xl border-2 border-accent bg-card p-4">
            <span className="text-[12px] text-muted">Resultado previsto do mês</span>
            <b className={`font-serif text-[24px] font-normal ${result < 0 ? LATE : 'text-link'}`}>{result < 0 ? '− ' : ''}{brl(Math.abs(result))}</b>
            <span className="text-[12px] text-muted">entradas menos saídas, se tudo que falta acontecer</span>
          </div>
        </div>

        <div className="flex min-h-[340px] flex-wrap gap-4">
          <section aria-label="Entradas e saídas por semana" className="flex w-[380px] max-w-full flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b className="text-[13.5px]">Por semana</b><span className="flex-1" />
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"><span className="size-2.5 rounded-sm bg-ok" />entrou</span>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"><span className="size-2.5 rounded-sm bg-fg" />saiu</span>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted"><span className="size-2.5 rounded-sm border border-dashed border-faint" />previsto</span>
            </div>
            <div className="grid min-h-[200px] flex-1 items-end gap-2.5 border-b border-line-strong pb-px" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
              {weeks.map((w) => (
                <div key={w.label} className="flex h-full items-end gap-1" title={`Dias ${w.label}: entrou ${brl(w.inPaid)} de ${brl(w.inAll)}; saiu ${brl(w.outPaid)} de ${brl(w.outAll)}`}>
                  <span className="relative flex flex-1 flex-col justify-end rounded-t border border-dashed border-ok/60" style={{ height: bar(w.inAll, w.inAll) }}><span className="rounded-t bg-ok" style={{ height: w.inAll ? `${(w.inPaid / w.inAll) * 100}%` : 0 }} /></span>
                  <span className="relative flex flex-1 flex-col justify-end rounded-t border border-dashed border-fg/50" style={{ height: bar(w.outAll, w.outAll) }}><span className="rounded-t bg-fg" style={{ height: w.outAll ? `${(w.outPaid / w.outAll) * 100}%` : 0 }} /></span>
                </div>
              ))}
            </div>
            <div className="grid gap-2.5 text-center text-[11px] text-muted" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>{weeks.map((w) => <span key={w.label}>{w.label}</span>)}</div>
          </section>

          <section aria-label="Lançamentos" className="flex min-w-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex flex-wrap gap-1.5 border-b border-line px-3.5 py-3 text-[12.5px]">
              {([['todos', 'Todos'], ['receber', 'A receber'], ['pagar', 'A pagar'], ['atrasados', 'Atrasados'], ['realizados', 'Realizados']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
                  className={`rounded-full px-3 py-1 ${filter === v ? 'bg-fg text-bg' : 'border border-line-strong text-muted hover:text-fg'}`}>{label}</button>
              ))}
            </div>
            {rows.length === 0 && (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-[13.5px] text-muted">
                {inMonth.length === 0 && late.length === 0 ? <>Nenhum lançamento em {monthLabel}. Comece pelo que você já sabe que vai entrar e sair.<Button variant="primary" icon={Plus} onClick={() => setEditing(blank())}>Primeiro lançamento</Button></> : 'Nada neste filtro.'}
              </div>
            )}
            <ul className="flex-1 overflow-y-auto">
              {rows.map((t) => {
                const s = status(t)
                return (
                  <li key={t.id} className={`grid grid-cols-[56px_minmax(0,1fr)_auto_110px_auto] items-center gap-3 border-b border-line/70 px-3.5 py-2.5 text-[13px] hover:bg-raised ${editing?.id === t.id ? 'bg-accent-soft/40' : ''}`}>
                    <span className={`text-[12px] ${s === 'Atrasado' ? LATE : 'text-muted'}`}>{fmtDay(ref(t))}</span>
                    <button type="button" onClick={() => setEditing(t)} className="flex min-w-0 flex-col text-left">
                      <span className="truncate font-medium hover:underline">{t.description}</span>
                      <span className="truncate text-[11.5px] text-muted">{[t.category, t.account].filter(Boolean).join(' · ') || 'Sem categoria'}</span>
                    </button>
                    <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${PILL[s]}`}>{s}</span>
                    <b className={`text-right font-semibold ${t.kind === 'in' ? 'text-ok' : ''} ${t.paidAt ? '' : 'opacity-70'}`}>{t.kind === 'in' ? '+ ' : '− '}{brl(t.amount)}</b>
                    {t.paidAt
                      ? <button type="button" onClick={() => void paid(t, false)} title="Voltar para previsto" aria-label={`Voltar ${t.description} para previsto`} className="grid size-8 place-items-center rounded-md text-faint hover:bg-raised hover:text-fg"><RotateCcw size={13} /></button>
                      : <button type="button" onClick={() => void paid(t, true)} className="h-8 rounded-md border border-line-strong px-2.5 text-[12px] font-medium hover:border-accent">{t.kind === 'in' ? 'Recebi' : 'Paguei'}</button>}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </section>

      {editing && (
        <TxPanel key={editing.id ?? 'novo'} tx={editing} names={names} projects={projects} onClose={() => setEditing(null)} onSave={save}
          onDelete={async (t) => { await call('finance_delete', { id: t.id }); await load() }} />
      )}
      {incomeReport && <IncomeReport scope={scope} scopeName={scopeName} month={month} onClose={() => setIncomeReport(false)} />}
      {importing && pro.FinanceImport && <pro.FinanceImport scope={scope} accounts={names.accounts} onClose={() => setImporting(false)} onDone={(r) => { setImporting(false); setReport(r); void load() }} />}
    </div>
  )
}
