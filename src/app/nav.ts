import type { LucideIcon } from 'lucide-react'
import {
  Bot, Brain, CalendarDays, GraduationCap, FileSignature, FolderKanban, LayoutGrid, Megaphone,
  MessageSquare, Radar, Timer, ChartNoAxesColumn, ClipboardList, Settings, Share2, Users, Wallet, Workflow, HandCoins, ScrollText, Package, FileInput,
} from 'lucide-react'

export type Module = {
  path: string
  label: string
  code: string
  icon: LucideIcon
  summary: string
  phase: number
  /** Tela do Tesseract Pro (repositório privado, pasta pro/ui); sem o Pro no build, mostra pages/ProOnly. */
  pro?: true
}

export type NavGroup = { label: string; items: Module[] }

// Agrupamento da navegação.
export const NAV: NavGroup[] = [
  {
    label: 'Núcleo',
    items: [
      { path: '/', label: 'Início', code: 'OVERVIEW', icon: LayoutGrid, summary: 'Seu dia, indicadores e o que precisa de atenção.', phase: 2 },
      { path: '/painel', label: 'Painel do negócio', code: 'BUSINESS', icon: ChartNoAxesColumn, summary: 'Receita por mês e por cliente, ticket médio, funil e o que cobrar.', phase: 12, pro: true },
      { path: '/chat', label: 'Chat', code: 'CHAT', icon: MessageSquare, summary: 'Converse com o Tesseract e execute ações internas com confirmação.', phase: 3 },
      { path: '/tutorial', label: 'Tutorial', code: 'TUTORIAL', icon: GraduationCap, summary: 'Trilhas por modelo de operação, com passo a passo e guia dentro de cada tela.', phase: 14 },
      { path: '/bots', label: 'Bots', code: 'BOTS', icon: Bot, summary: 'Especialistas de Segurança, Jurídico, Marketing, Vendas, Finanças e Tecnologia.', phase: 5, pro: true },
      { path: '/cerebro', label: 'Conhecimento', code: 'BRAIN', icon: Brain, summary: 'Monte ou conecte sua base de conhecimento; busca e respostas com fonte na fase 3.', phase: 2.5 },
    ],
  },
  {
    label: 'Trabalho',
    items: [
      { path: '/projetos', label: 'Projetos', code: 'PROJECTS', icon: FolderKanban, summary: 'Organizações, projetos, tarefas, Kanban e lista.', phase: 4 },
      { path: '/horas', label: 'Horas', code: 'HOURS', icon: Timer, summary: 'Cronômetro por tarefa e cliente; horas viram recibo ou proposta.', phase: 12, pro: true },
      { path: '/relatorios', label: 'Relatórios', code: 'REPORTS', icon: ClipboardList, summary: 'Relatório do projeto e extrato do mês para o cliente, em PDF ou página.', phase: 12, pro: true },
      { path: '/calendario', label: 'Calendário', code: 'CALENDAR', icon: CalendarDays, summary: 'Prazos, reuniões, vencimentos e publicações num só lugar.', phase: 4 },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { path: '/crm', label: 'CRM e Funil', code: 'CRM', icon: Users, summary: 'Empresas, contatos e oportunidades nos 10 estágios do funil.', phase: 6, pro: true },
      { path: '/briefing', label: 'Briefing', code: 'BRIEFING', icon: ScrollText, summary: 'Tudo sobre o cliente numa folha antes da reunião, com a fonte de cada item.', phase: 12, pro: true },
      { path: '/modelos', label: 'Modelos de negócio', code: 'MODELS', icon: Package, summary: 'Pacotes prontos por área: projeto, proposta, contrato e parcelas montados de uma vez.', phase: 12, pro: true },
      { path: '/prospeccao', label: 'Prospecção', code: 'PROSPECT', icon: Radar, summary: 'Descoberta e qualificação de empresas por nicho e cidade.', phase: 7, pro: true },
      { path: '/contratos', label: 'Contratos', code: 'DOCS', icon: FileSignature, summary: 'Propostas, contratos e recibos com versões e parcelas.', phase: 8, pro: true },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { path: '/campanhas', label: 'Campanhas', code: 'CAMPAIGNS', icon: Megaphone, summary: 'Investimento, leads, CPL, CAC, ROAS e atribuição.', phase: 10, pro: true },
      { path: '/social', label: 'Social', code: 'SOCIAL', icon: Share2, summary: 'Calendário editorial, rascunhos, aprovação e publicação.', phase: 9, pro: true },
    ],
  },
  {
    label: 'Operação',
    items: [
      { path: '/financas', label: 'Finanças', code: 'FINANCE', icon: Wallet, summary: 'Receitas, despesas, contas, orçamentos e fluxo de caixa.', phase: 4 },
      { path: '/cobranca', label: 'Cobrança', code: 'CHARGES', icon: HandCoins, summary: 'Parcelas atrasadas e da semana com mensagem de cobrança pronta e calendário de recebimentos.', phase: 12, pro: true },
      { path: '/importar', label: 'Importar dados', code: 'IMPORT', icon: FileInput, summary: 'Traga Notion, Trello e planilhas de finanças e contatos, com desfazer.', phase: 12, pro: true },
      { path: '/automacoes', label: 'Automações', code: 'AUTOMATION', icon: Workflow, summary: 'Gatilhos, condições e ações com histórico e confirmação.', phase: 12, pro: true },
    ],
  },
]

export const SETTINGS: Module = { path: '/configuracoes', label: 'Configurações', code: 'SETTINGS', icon: Settings, summary: 'Provedores de IA, privacidade, vault, backups e organizações.', phase: 2 }

export const ALL_MODULES: Module[] = [...NAV.flatMap((g) => g.items), SETTINGS]

// Sidebar no padrão bolt.new: lista plana, seções com rótulo.
export type SideSection = { label?: string; items: Module[] }
const byPath = (p: string) => ALL_MODULES.find((m) => m.path === p)!
export const SIDEBAR: SideSection[] = [
  { items: ['/', '/painel', '/chat', '/cerebro'].map(byPath) },
  { label: 'Trabalho', items: ['/projetos', '/horas', '/relatorios', '/calendario', '/financas', '/cobranca'].map(byPath) },
  { label: 'Comercial', items: ['/crm', '/briefing', '/prospeccao', '/contratos', '/modelos'].map(byPath) },
  { label: 'Marketing', items: ['/campanhas', '/social'].map(byPath) },
  { label: 'Assistentes', items: ['/bots', '/automacoes'].map(byPath) },
  { label: 'Aprender', items: ['/tutorial'].map(byPath) },
  { label: 'Sistema', items: ['/importar'].map(byPath) },
]
export const indexOf = (m: Module) => String(ALL_MODULES.indexOf(m) + 1).padStart(2, '0')
export const moduleFor = (pathname: string) =>
  ALL_MODULES.find((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path))) ?? ALL_MODULES[0]
