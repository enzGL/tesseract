import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '../components/ui'
import { call, message, type Tx } from '../data/api'
import { brl } from '../data/statement'

// Resumo das receitas (Finanças). A pessoa escolhe o período e vê quanto entrou, quanto ainda vai entrar,
// o que está atrasado e de onde veio o dinheiro (cliente/projeto, categoria, conta), com comparação ao período anterior.
// Conta pela data do dinheiro: quando entrou, senão quando está previsto. Dá para copiar como texto.

const LATE = 'text-[#B3261E] dark:text-[#FF8A80]'
const field = 'h-9 rounded-lg border border-line-strong bg-raised px-3 text-[13.5px] outline-none focus:border-accent'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ref = (t: Tx) => t.paidAt ?? t.due
const sum = (xs: Tx[]) => xs.reduce((s, t) => s + t.amount, 0)

type Preset = 'mes' | 'anterior' | 'tri' | 'ano' | 'livre'
const PRESETS: [Preset, string][] = [['mes', 'Mês aberto'], ['anterior', 'Mês anterior'], ['tri', 'Últimos 3 meses'], ['ano', 'Este ano'], ['livre', 'Escolher datas']]

function range(p: Preset, month: Date): [string, string] {
  const y = month.getFullYear(), m = month.getMonth()
  if (p === 'anterior') return [iso(new Date(y, m - 1, 1, 12)), iso(new Date(y, m, 0, 12))]
  if (p === 'tri') return [iso(new Date(y, m - 2, 1, 12)), iso(new Date(y, m + 1, 0, 12))]
  if (p === 'ano') return [`${y}-01-01`, `${y}-12-31`]
  return [iso(new Date(y, m, 1, 12)), iso(new Date(y, m + 1, 0, 12))]
}
// período anterior do mesmo tamanho, para comparar
function before(from: string, to: string): [string, string] {
  const a = new Date(`${from}T12:00:00`), b = new Date(`${to}T12:00:00`)
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1
  const end = new Date(a); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setDate(start.getDate() - days + 1)
  return [iso(start), iso(end)]
}

type Group = { name: string; total: number; got: number; n: number }
function groupBy(xs: Tx[], key: (t: Tx) => string): Group[] {
  const m = new Map<string, Group>()
  for (const t of xs) {
    const k = key(t).trim() || 'Sem nome'
    const g = m.get(k) ?? { name: k, total: 0, got: 0, n: 0 }
    g.total += t.amount; g.n += 1; if (t.paidAt) g.got += t.amount
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => b.total - a.total)
}

export function IncomeReport({ scope, scopeName, month, onClose }: { scope: string; scopeName: string; month: Date; onClose: () => void }) {
  const [preset, setPreset] = useState<Preset>('mes')
  const [custom, setCustom] = useState<[string, string]>(() => range('mes', month))
  const [from, to] = preset === 'livre' ? custom : range(preset, month)
  const [prevFrom, prevTo] = before(from, to)
  const [txs, setTxs] = useState<Tx[] | null>(null)
  const [prev, setPrev] = useState<Tx[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const t0 = iso(new Date())

  useEffect(() => {
    if (!from || !to || from > to) { setTxs([]); return }
    setError(null)
    const ins = (xs: Tx[], a: string, b: string) => xs.filter((t) => t.kind === 'in' && ref(t) >= a && ref(t) <= b)
    // a lista traz o que vence ou foi pago no intervalo; busca o período anterior junto, para comparar
    call<Tx[]>('finance_list', { scope, from: prevFrom, to })
      .then((xs) => { setTxs(ins(xs, from, to)); setPrev(ins(xs, prevFrom, prevTo)) }).catch((e) => setError(message(e)))
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [scope, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = txs ?? []
  const got = sum(list.filter((t) => t.paidAt))
  const late = list.filter((t) => !t.paidAt && t.due < t0)
  const coming = list.filter((t) => !t.paidAt && t.due >= t0)
  const total = sum(list)
  const prevGot = sum(prev.filter((t) => t.paidAt))
  const diff = prevGot ? Math.round(((got - prevGot) / prevGot) * 100) : null
  const origins = groupBy(list, (t) => t.description)
  const cats = groupBy(list, (t) => t.category || 'Sem categoria')
  const accounts = groupBy(list.filter((t) => t.paidAt), (t) => t.account || 'Sem conta')
  const top = origins[0]
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0)

  const text = () => [
    `Resumo das receitas · ${scopeName} · ${fmt(from)} a ${fmt(to)}`, '',
    `Recebido: ${brl(got)}${diff != null ? ` (${diff >= 0 ? '+' : ''}${diff}% sobre o período anterior)` : ''}`,
    `A receber: ${brl(sum(coming))} (${coming.length})`,
    `Atrasado: ${brl(sum(late))} (${late.length})`,
    `Total previsto no período: ${brl(total)}`, '',
    'Por origem:', ...origins.map((g) => `  ${g.name}: ${brl(g.total)} (${share(g.total)}%), recebido ${brl(g.got)}`), '',
    'Por categoria:', ...cats.map((g) => `  ${g.name}: ${brl(g.total)} (${share(g.total)}%)`),
    ...(late.length ? ['', 'Atrasados:', ...late.map((t) => `  ${t.description}: ${brl(t.amount)}, venceu em ${fmt(t.due)}`)] : []),
  ].join('\n')

  const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-raised/50 px-4 py-3">
      <span className="text-[12px] text-muted">{label}</span>
      <b className={`text-[20px] font-semibold tabular-nums ${tone ?? ''}`}>{value}</b>
      {sub && <span className="text-[11.5px] text-muted">{sub}</span>}
    </div>
  )
  const Table = ({ title, rows, showGot }: { title: string; rows: Group[]; showGot?: boolean }) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] font-semibold text-muted">{title}</h3>
      {rows.length === 0 ? <p className="text-[13px] text-faint">Nada no período.</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((g) => (
            <li key={g.name} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {showGot && g.got < g.total && <span className="text-[11.5px] text-muted">recebido {brl(g.got)}</span>}
                <b className="font-semibold tabular-nums">{brl(g.total)}</b>
                <span className="w-10 text-right text-[12px] text-muted tabular-nums">{share(g.total)}%</span>
              </div>
              <span className="flex h-[5px] overflow-hidden rounded-full bg-line">
                <span className="rounded-full bg-ok" style={{ width: `${share(g.got)}%` }} />
                <span className="bg-ok/35" style={{ width: `${share(g.total - g.got)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#080E22]/40 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-label="Resumo das receitas" className="anim-rise flex max-h-[88vh] w-[720px] max-w-full flex-col rounded-xl border border-line-strong bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-1 flex-col">
            <span className="font-mono text-[10.5px] tracking-[0.14em] text-link uppercase">Resumo das receitas · {scopeName}</span>
            <h2 className="font-serif text-[22px] leading-tight">{fmt(from)} a {fmt(to)}</h2>
          </div>
          <Button variant="ghost" icon={X} ariaLabel="Fechar" onClick={onClose} />
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Período" className="inline-flex flex-wrap gap-1 rounded-lg border border-line-strong p-1">
              {PRESETS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={preset === id} onClick={() => { if (id === 'livre') setCustom([from, to]); setPreset(id) }}
                  className={`h-8 rounded-md px-3 text-[13px] ${preset === id ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{label}</button>
              ))}
            </div>
            {preset === 'livre' && (
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <input type="date" aria-label="De" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} className={field} />a
                <input type="date" aria-label="Até" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} className={field} />
              </span>
            )}
          </div>

          {error && <p className={`text-[13px] ${LATE}`} role="alert">{error}</p>}
          {txs == null ? <p className="text-[13px] text-muted">Carregando…</p> : list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">Nenhuma receita entre {fmt(from)} e {fmt(to)}. Troque o período ou lance o que você espera receber.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="Recebido" value={brl(got)} tone="text-ok" sub={diff == null ? 'sem receitas no período anterior' : `${diff >= 0 ? '+' : ''}${diff}% sobre o período anterior`} />
                <Kpi label="A receber" value={brl(sum(coming))} sub={`${coming.length} lançamento(s)`} />
                <Kpi label="Atrasado" value={brl(sum(late))} tone={late.length ? LATE : ''} sub={`${late.length} lançamento(s)`} />
                <Kpi label="Total do período" value={brl(total)} sub={`${share(got)}% já entrou`} />
              </div>
              {top && origins.length > 1 && share(top.total) >= 50 && (
                <p className="rounded-lg bg-accent-soft px-4 py-2.5 text-[13px] text-link">{top.name} é {share(top.total)}% das receitas do período. Vale ficar de olho na dependência de uma origem só.</p>
              )}
              <Table title="De onde veio (cliente ou projeto)" rows={origins} showGot />
              <div className="grid gap-5 sm:grid-cols-2">
                <Table title="Por categoria" rows={cats} />
                <Table title="Onde entrou (conta)" rows={accounts} />
              </div>
              {late.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className={`text-[12px] font-semibold ${LATE}`}>Atrasados para cobrar</h3>
                  <ul className="flex flex-col gap-1 text-[13.5px]">
                    {late.map((t) => <li key={t.id} className="flex gap-2"><span className="flex-1 truncate">{t.description}</span><span className="text-muted">venceu {fmt(t.due)}</span><b className="font-semibold tabular-nums">{brl(t.amount)}</b></li>)}
                  </ul>
                </section>
              )}
              <p className="text-[12px] text-faint">Barra cheia: já recebido. Barra clara: ainda a receber. Conta pela data em que o dinheiro entrou, senão pela data prevista.</p>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="primary" icon={copied ? Check : Copy} disabled={!list.length}
            onClick={() => void navigator.clipboard.writeText(text()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })}>{copied ? 'Copiado' : 'Copiar como texto'}</Button>
        </footer>
      </div>
    </div>
  )
}
