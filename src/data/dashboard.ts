// Dados do dashboard. Enquanto o banco local (SQLite, fase 2) não existe, o estado real é vazio:
// a tela mostra o que falta em vez de números inventados. DEMO só aparece com ?demo=1 e vem marcado.

export type FunnelStage = { label: string; value: number }
export type TaskRow = { title: string; project: string; due: string; status: string }
export type DealRow = { company: string; stage: string; value: number; next: string }
export type EntryRow = { description: string; amount: number; status: 'Previsto' | 'Pago' | 'Recebido'; date: string }
export type Dashboard = {
  openTasks: TaskRow[]
  deals: DealRow[]
  entries: EntryRow[]
  notesIndexed: number | null
  funnel: FunnelStage[]
  revenue: { total: number | null; deltaPct: number | null; expected: number | null; parts: { label: string; value: number }[] }
  retention: { labels: string[]; values: number[] } | null
  tasks: { done: number | null; delta: number | null; perWeekday: number[] }
  insight: { value: number; text: string; to: string } | null
}

const STAGES = ['Identificadas', 'Qualificadas', 'Contatadas', 'Reunião', 'Proposta']

export const EMPTY: Dashboard = {
  openTasks: [],
  deals: [],
  entries: [],
  notesIndexed: null,
  funnel: STAGES.map((label) => ({ label, value: 0 })),
  revenue: { total: null, deltaPct: null, expected: null, parts: [] },
  retention: null,
  tasks: { done: null, delta: null, perWeekday: [0, 0, 0, 0, 0, 0, 0] },
  insight: null,
}

export const DEMO: Dashboard = {
  openTasks: [
    { title: 'Revisar proposta do Portal Cliente', project: 'Portal Cliente', due: 'Hoje, 18:00', status: 'Em andamento' },
    { title: 'Follow-up com lead de prospecção', project: 'Radar', due: 'Hoje', status: 'A fazer' },
    { title: 'Ajustar escopo do App Agenda', project: 'App Agenda', due: 'Amanhã', status: 'A fazer' },
    { title: 'Roteiro do carrossel de quinta', project: 'Aurora Studio', due: 'Qui, 06 nov', status: 'A fazer' },
  ],
  deals: [
    { company: 'Empresa Exemplo A', stage: 'Proposta', value: 8500, next: 'Ligar sexta' },
    { company: 'Empresa Exemplo B', stage: 'Reunião', value: 4200, next: 'Enviar agenda' },
    { company: 'Empresa Exemplo C', stage: 'Negociação', value: 12000, next: 'Revisar desconto' },
  ],
  entries: [
    { description: 'Parcela 2/3 · site institucional', amount: 3200, status: 'Recebido', date: '28 out 2026' },
    { description: 'Assinatura de software', amount: -110, status: 'Pago', date: '27 out 2026' },
    { description: 'Mensalidade de manutenção', amount: 900, status: 'Previsto', date: '05 nov 2026' },
  ],
  notesIndexed: 218,
  funnel: STAGES.map((label, i) => ({ label, value: [42, 28, 19, 11, 6][i] })),
  revenue: {
    total: 18240, deltaPct: 12, expected: 4100,
    parts: [{ label: 'Projetos', value: 11600 }, { label: 'Recorrências', value: 4800 }, { label: 'Avulsos', value: 1840 }],
  },
  retention: { labels: ['mai', 'jun', 'jul', 'ago', 'set', 'out'], values: [62, 68, 77, 86, 81, 75] },
  tasks: { done: 32, delta: 9, perWeekday: [3, 5, 8, 6, 5, 3, 2] },
  insight: { value: 3, text: 'clientes sem follow-up há mais de 7 dias', to: '/crm' },
}

export function loadDashboard(demo: boolean): Dashboard {
  return demo ? DEMO : EMPTY
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const money = (v: number) => brl.format(v)
