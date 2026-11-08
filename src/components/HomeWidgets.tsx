// Conteúdo de cada widget do Início (data/layout.ts > WIDGETS). Cada um lê o dado real do seu
// módulo; sem dado, mostra o zero ou uma frase dizendo o que falta, nunca número inventado.
import { Link } from 'react-router'
import { Brain, CheckSquare, FileSignature, UserPlus, Wallet } from 'lucide-react'
import { pro } from '@pro'
import { call, useStore, type CalTask, type Task, type Tx } from '../data/api'
import { brl } from '../data/statement'
import type { WidgetId } from '../data/layout'
import { Big, Empty, Fail, Row, Rows, Wait, ddmm, monthFrom, monthTo, plus, today, useLoad } from './widget-kit'

// ---------- os widgets ----------
function Tarefas() {
  const { data, error } = useLoad(() => call<{ task: Task; project: string; column: string }[]>('tasks_open', { limit: 8 }), [])
  if (error) return <Fail />
  if (!data) return <Wait />
  if (!data.length) return <Empty>Nenhuma tarefa aberta. <Link to="/projetos" className="text-link">Criar em Projetos</Link></Empty>
  return <Rows>{data.map((r) => <Row key={r.task.id} mid={r.task.title} right={r.task.due ? ddmm(r.task.due) : r.project} />)}</Rows>
}

function Quadro() {
  const { data, error } = useLoad(() => call<{ task: Task; project: string; column: string }[]>('tasks_open', { limit: 500 }), [])
  if (error) return <Fail />
  if (!data) return <Wait />
  if (!data.length) return <Empty>Nenhuma tarefa aberta nos quadros.</Empty>
  const by = new Map<string, number>()
  for (const r of data) by.set(r.column || 'Sem coluna', (by.get(r.column || 'Sem coluna') ?? 0) + 1)
  const cols = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = Math.max(...cols.map((c) => c[1]))
  return (
    <ul className="flex flex-col gap-1.5">
      {cols.map(([name, n]) => (
        <li key={name} className="grid grid-cols-[minmax(0,120px)_1fr_32px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-muted">{name}</span>
          <span className="h-2.5 rounded bg-raised"><span className="block h-2.5 rounded bg-accent" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="text-right font-mono">{n}</span>
        </li>
      ))}
    </ul>
  )
}

function Agenda() {
  const t = today()
  const { data, error } = useLoad(() => call<CalTask[]>('calendar_range', { from: t, to: t }), [t])
  if (error) return <Fail />
  if (!data) return <Wait />
  const list = data.filter((c) => !c.done).sort((a, b) => (a.task.schedStart ?? '99').localeCompare(b.task.schedStart ?? '99'))
  if (!list.length) return <Empty>Nada marcado para hoje. <Link to="/calendario" className="text-link">Abrir o calendário</Link></Empty>
  return <Rows>{list.map((c) => <Row key={c.task.id} left={c.task.schedStart ? c.task.schedStart.slice(11, 16) : 'dia'} mid={c.task.title} right={c.project} />)}</Rows>
}

function Receita({ scope }: { scope: string }) {
  const { data, error } = useLoad(() => call<Tx[]>('finance_list', { scope, from: monthFrom(), to: monthTo() }), [scope])
  if (error) return <Fail />
  if (!data) return <Wait />
  const ins = data.filter((x) => x.kind === 'in')
  const got = ins.filter((x) => x.paidAt).reduce((s, x) => s + x.amount, 0)
  const expected = ins.filter((x) => !x.paidAt).reduce((s, x) => s + x.amount, 0)
  return (
    <div className="flex flex-col gap-2">
      <Big>{brl(got)}</Big>
      <span className="text-[12.5px] text-muted">recebido neste mês · {brl(expected)} ainda previsto</span>
      {!ins.length && <Empty>Nenhuma receita lançada neste mês.</Empty>}
    </div>
  )
}

function Contas({ scope }: { scope: string }) {
  const { data, error } = useLoad(() => call<Tx[]>('finance_list', { scope, from: monthFrom(), to: monthTo() }), [scope])
  if (error) return <Fail />
  if (!data) return <Wait />
  const open = data.filter((x) => x.kind === 'out' && !x.paidAt)
  const late = open.filter((x) => x.due < today())
  return (
    <div className="flex items-baseline gap-3">
      <Big>{brl(open.reduce((s, x) => s + x.amount, 0))}</Big>
      <span className={`text-[12.5px] ${late.length ? 'font-medium text-[#9A3B12] dark:text-[#FFB38A]' : 'text-muted'}`}>{open.length ? `${open.length} em aberto${late.length ? ` · ${late.length} vencida(s)` : ''}` : 'nada a pagar'}</span>
    </div>
  )
}

function Lancamentos({ scope }: { scope: string }) {
  const { data, error } = useLoad(() => call<Tx[]>('finance_list', { scope, from: plus(today(), -45), to: plus(today(), 15) }), [scope])
  if (error) return <Fail />
  if (!data) return <Wait />
  const list = [...data].sort((a, b) => (b.paidAt ?? b.due).localeCompare(a.paidAt ?? a.due)).slice(0, 8)
  if (!list.length) return <Empty>Nenhum lançamento registrado.</Empty>
  return <Rows>{list.map((x) => <Row key={x.id} left={ddmm(x.paidAt ?? x.due)} mid={x.description} right={<span className={x.kind === 'in' ? 'text-ok' : ''}>{x.kind === 'in' ? '+ ' : '− '}{brl(x.amount)}{x.paidAt ? '' : ' · previsto'}</span>} />)}</Rows>
}

function Cerebro() {
  const { index, settings } = useStore()
  if (!settings['vault.path']) return <Empty>Não conectado. <Link to="/cerebro" className="text-link">Conectar</Link></Empty>
  return <div className="flex items-baseline gap-2"><Big>{index.last?.notes ?? '—'}</Big><span className="text-[12.5px] text-muted">notas no índice</span></div>
}

const QUICK = [
  { label: 'Tarefa', icon: CheckSquare, to: '/projetos' },
  { label: 'Lançamento', icon: Wallet, to: '/financas' },
  { label: 'Oportunidade', icon: UserPlus, to: '/crm' },
  { label: 'Contrato', icon: FileSignature, to: '/contratos' },
  { label: 'Nota', icon: Brain, to: '/cerebro' },
]
function Atalhos({ visible }: { visible: (p: string) => boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK.filter((q) => visible(q.to)).map((q) => (
        <Link key={q.label} to={q.to} className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-raised px-3 text-[13px] text-muted hover:border-accent hover:text-fg">
          <q.icon size={15} strokeWidth={1.7} className="text-accent dark:text-link" />{q.label}
        </Link>
      ))}
    </div>
  )
}

export const WIDGET_LINK: Partial<Record<WidgetId, string>> = {
  tarefas: '/projetos', quadro: '/projetos', agenda: '/calendario', receita: '/financas', contas: '/financas', lancamentos: '/financas',
  cobrancas: '/cobranca', horas: '/horas', funil: '/crm', followups: '/crm', leads: '/prospeccao', posts: '/social', cerebro: '/cerebro',
}

export function WidgetBody({ id, scope, visible }: { id: WidgetId; scope: string; visible: (p: string) => boolean }) {
  switch (id) {
    case 'tarefas': return <Tarefas />
    case 'quadro': return <Quadro />
    case 'agenda': return <Agenda />
    case 'receita': return <Receita scope={scope} />
    case 'contas': return <Contas scope={scope} />
    case 'lancamentos': return <Lancamentos scope={scope} />
    case 'cerebro': return <Cerebro />
    case 'atalhos': return <Atalhos visible={visible} />
  }
  // widgets do Pro (cobranças, horas, funil, follow-ups, leads, posts) vêm pela ponte '@pro'
  const P = pro.widgets[id]
  return P ? <P scope={scope} /> : <Empty>Este widget é do Tesseract Pro.</Empty>
}
