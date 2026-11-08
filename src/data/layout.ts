// App do seu jeito:
// o segmento monta o menu, o quadro e o Início; depois a pessoa muda tudo.
// Guardado nas configurações locais: ui.segment, ui.menu, ui.home, ui.banner.closed.
import type { LucideIcon } from 'lucide-react'
import { Code2, HeartPulse, Home, Layers, Play, Shapes, Target, TrendingUp, User } from 'lucide-react'
import { ALL_MODULES, SETTINGS, SIDEBAR, type Module } from '../app/nav'
import { call, setSetting, useStore, type Board, type Column, type MethodSetup, type Project } from './api'

// ---------- widgets do Início ----------
export type WidgetId =
  | 'tarefas' | 'quadro' | 'agenda' | 'receita' | 'contas' | 'lancamentos' | 'cobrancas' | 'horas'
  | 'funil' | 'followups' | 'leads' | 'posts' | 'cerebro' | 'atalhos'

export type WidgetDef = { id: WidgetId; name: string; about: string; module: string; w: number; h: number }

// module = rota do módulo de onde vem o dado: some da lista quando o módulo sai do menu.
export const WIDGETS: WidgetDef[] = [
  { id: 'tarefas', name: 'Tarefas abertas', about: 'As próximas por prazo', module: '/projetos', w: 4, h: 2 },
  { id: 'quadro', name: 'Quadro resumido', about: 'Quantas tarefas em cada coluna', module: '/projetos', w: 6, h: 2 },
  { id: 'agenda', name: 'Agenda de hoje', about: 'Tarefas com horário hoje', module: '/calendario', w: 4, h: 2 },
  { id: 'receita', name: 'Receita do mês', about: 'Recebido e previsto', module: '/financas', w: 4, h: 2 },
  { id: 'contas', name: 'Contas a pagar', about: 'Despesas do mês em aberto', module: '/financas', w: 4, h: 1 },
  { id: 'lancamentos', name: 'Lançamentos recentes', about: 'Últimas receitas e despesas', module: '/financas', w: 6, h: 2 },
  { id: 'cobrancas', name: 'Cobranças da semana', about: 'Atrasadas e as que vencem', module: '/cobranca', w: 4, h: 1 },
  { id: 'horas', name: 'Horas da semana', about: 'Total e por dia', module: '/horas', w: 4, h: 1 },
  { id: 'funil', name: 'Funil comercial', about: 'Oportunidades por estágio', module: '/crm', w: 6, h: 2 },
  { id: 'followups', name: 'Próximos follow-ups', about: 'Quem chamar hoje e nos próximos dias', module: '/crm', w: 4, h: 2 },
  { id: 'leads', name: 'Leads novos da prospecção', about: 'Para triar, pela nota ICP', module: '/prospeccao', w: 4, h: 2 },
  { id: 'posts', name: 'Posts da semana', about: 'O que sai nos próximos 7 dias', module: '/social', w: 6, h: 1 },
  { id: 'cerebro', name: 'Conhecimento', about: 'Notas no índice', module: '/cerebro', w: 3, h: 1 },
  { id: 'atalhos', name: 'Atalhos', about: 'Criar tarefa, lançamento, oportunidade…', module: '/', w: 5, h: 1 },
]
export const widgetDef = (id: string) => WIDGETS.find((w) => w.id === id)

export const COLS = 12
export const MAX_H = 4
export const minW = (id: WidgetId) => (id === 'cerebro' ? 2 : 3)

export type Placed = { id: WidgetId; x: number; y: number; w: number; h: number }
export type HomeBoard = { id: string; name: string; widgets: Placed[] }
export type HomeConfig = { current: string; boards: HomeBoard[] }

// ---------- grade: colisão, empurrar e subir (como as grades de painel) ----------
const hit = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const clampP = (p: Placed): Placed => {
  const w = Math.max(minW(p.id), Math.min(COLS, p.w)), h = Math.max(1, Math.min(MAX_H, p.h))
  return { ...p, w, h, x: Math.max(0, Math.min(COLS - w, p.x)), y: Math.max(0, p.y) }
}

/** O cartão mexido fica onde foi solto; os outros descem para abrir espaço e depois tudo sobe o quanto der. */
export function settle(items: Placed[], movedId?: WidgetId): Placed[] {
  const all = items.map(clampP)
  const moved = all.find((i) => i.id === movedId)
  const rest = all.filter((i) => i !== moved).sort((a, b) => a.y - b.y || a.x - b.x)
  const placed: Placed[] = moved ? [moved] : []
  for (const it of rest) {
    const c = { ...it }
    while (placed.some((o) => hit(o, c))) c.y++
    placed.push(c)
  }
  const order = [...placed].sort((a, b) => a.y - b.y || (a.id === movedId ? -1 : b.id === movedId ? 1 : a.x - b.x))
  const out: Placed[] = []
  for (const it of order) {
    const c = { ...it }
    while (c.y > 0 && !out.some((o) => hit(o, { ...c, y: c.y - 1 }))) c.y--
    out.push(c)
  }
  return out
}

/** Monta uma grade a partir de uma lista: enche as linhas da esquerda para a direita. */
export function pack(ids: WidgetId[]): Placed[] {
  const out: Placed[] = []
  for (const id of ids) {
    const d = widgetDef(id); if (!d) continue
    let y = 0, done = false
    while (!done) {
      for (let x = 0; x + d.w <= COLS && !done; x++) {
        const c = { id, x, y, w: d.w, h: d.h }
        if (!out.some((o) => hit(o, c))) { out.push(c); done = true }
      }
      y++
    }
  }
  return out
}

/** Lugar livre mais alto para um widget novo. */
export function addWidget(items: Placed[], id: WidgetId): Placed[] {
  const d = widgetDef(id)
  if (!d || items.some((i) => i.id === id)) return items
  for (let y = 0; ; y++) {
    for (let x = 0; x + d.w <= COLS; x++) {
      const c = { id, x, y, w: d.w, h: d.h }
      if (!items.some((o) => hit(o, c))) return [...items, c]
    }
  }
}

// ---------- menu ----------
export type MenuSection = { label: string; items: string[] }
export type MenuConfig = { sections: MenuSection[]; hidden: string[]; names: Record<string, string> }

const MENU_PATHS = ALL_MODULES.filter((m) => m !== SETTINGS).map((m) => m.path)
const byPath = (p: string) => ALL_MODULES.find((m) => m.path === p)

export const DEFAULT_MENU: MenuConfig = {
  sections: SIDEBAR.map((s) => ({ label: s.label ?? '', items: s.items.map((m) => m.path) })),
  hidden: [], names: {},
}

/** Garante que todo módulo existe em alguma seção (os novos entram escondidos) e que o Início fica visível. */
export function normalize(m: MenuConfig | undefined): MenuConfig {
  const base = m && Array.isArray(m.sections) ? m : DEFAULT_MENU
  const seen = new Set<string>()
  const sections = base.sections.map((s) => ({ label: s.label ?? '', items: s.items.filter((p) => MENU_PATHS.includes(p) && !seen.has(p) && (seen.add(p), true)) }))
  const missing = MENU_PATHS.filter((p) => !seen.has(p))
  const hidden = new Set((base.hidden ?? []).filter((p) => MENU_PATHS.includes(p)))
  if (missing.length) {
    let other = sections.find((s) => s.label === 'Outros')
    if (!other) { other = { label: 'Outros', items: [] }; sections.push(other) }
    for (const p of missing) { other.items.push(p); if (m) hidden.add(p) }
  }
  hidden.delete('/')
  return { sections, hidden: [...hidden], names: { ...(base.names ?? {}) } }
}

export type ShownModule = Module & { original: string }
export const labelOf = (m: Module, cfg: MenuConfig) => cfg.names[m.path]?.trim() || m.label

export function useMenu() {
  const { settings } = useStore()
  const cfg = normalize(settings['ui.menu'])
  const hidden = new Set(cfg.hidden)
  const wrap = (p: string): ShownModule | null => { const m = byPath(p); return m ? { ...m, label: labelOf(m, cfg), original: m.label } : null }
  const sections = cfg.sections
    .map((s) => ({ label: s.label, items: s.items.filter((p) => !hidden.has(p)).map(wrap).filter(Boolean) as ShownModule[] }))
    .filter((s) => s.items.length)
  const more = cfg.sections.flatMap((s) => s.items).filter((p) => hidden.has(p)).map(wrap).filter(Boolean) as ShownModule[]
  const visible = (path: string) => path === '/' || !hidden.has(path)
  return { cfg, sections, more, visible }
}

export const saveMenu = (m: MenuConfig) => setSetting('ui.menu', normalize(m))
export function hideModule(cfg: MenuConfig, path: string) { if (path !== '/') void saveMenu({ ...cfg, hidden: [...new Set([...cfg.hidden, path])] }) }
export function showModule(cfg: MenuConfig, path: string) { void saveMenu({ ...cfg, hidden: cfg.hidden.filter((p) => p !== path) }) }
export function renameModule(cfg: MenuConfig, path: string, name: string) {
  const names = { ...cfg.names }
  const original = byPath(path)?.label
  if (!name.trim() || name.trim() === original) delete names[path]; else names[path] = name.trim()
  void saveMenu({ ...cfg, names })
}

// ---------- segmentos ----------
export type SegmentId = 'clinica' | 'sites' | 'agencia' | 'freela' | 'consultor' | 'conteudo' | 'b2b' | 'pessoal'
export type Prospect = 'ligada' | 'desligada' | 'opcional'
export type Segment = {
  id: SegmentId; name: string; short: string; about: string; icon: LucideIcon
  sections: [string, string[]][]; names: Record<string, string>
  board: string; columns: string[]; widgets: WidgetId[]
  prospect: Prospect; prospectText: string; extra: string
}

export const SEGMENTS: Segment[] = [
  { id: 'clinica', name: 'Clínica ou estúdio', short: 'clínica ou estúdio', about: 'Atendimentos, retornos e mensalidades', icon: HeartPulse,
    sections: [['', ['/', '/chat']], ['Atender', ['/calendario', '/crm', '/projetos']], ['Dinheiro', ['/cobranca', '/financas']], ['Divulgar', ['/social', '/automacoes']]],
    names: { '/calendario': 'Agenda', '/crm': 'Pacientes', '/projetos': 'Atendimentos' },
    board: 'Atendimentos', columns: ['Primeiro contato', 'Agendado', 'Em tratamento', 'Retorno', 'Alta'],
    widgets: ['agenda', 'cobrancas', 'followups', 'quadro', 'posts'],
    prospect: 'desligada', prospectText: 'Clínica costuma receber gente por indicação e Instagram. Dá para ligar depois e buscar empresas para convênio.',
    extra: 'O CRM aparece com o nome Pacientes e o Calendário como Agenda.' },
  { id: 'sites', name: 'Vende sites', short: 'quem vende sites', about: 'Prospecção, proposta, projeto e manutenção', icon: Code2,
    sections: [['', ['/', '/painel', '/chat', '/cerebro']], ['Vender', ['/prospeccao', '/crm', '/briefing', '/contratos', '/modelos']], ['Entregar', ['/projetos', '/horas', '/calendario']], ['Dinheiro', ['/cobranca', '/financas']]],
    names: {},
    board: 'Sites', columns: ['Briefing', 'Layout', 'Montagem', 'Publicação', '30 dias de ajustes'],
    widgets: ['leads', 'funil', 'quadro', 'cobrancas', 'receita'],
    prospect: 'ligada', prospectText: 'Google Maps na sua cidade, com a nota ICP pelo que você definir (por exemplo: tem Instagram, não tem site). Você ajusta os pesos.',
    extra: 'O pacote Site institucional dos Modelos de negócio monta proposta, contrato e parcelas de uma vez.' },
  { id: 'agencia', name: 'Agência', short: 'agência', about: 'Vários clientes, posts e aprovação', icon: Layers,
    sections: [['', ['/', '/painel', '/chat']], ['Entregar', ['/projetos', '/social', '/campanhas', '/horas', '/relatorios']], ['Clientes', ['/crm', '/contratos', '/cobranca']], ['Assistentes', ['/bots']]],
    names: {},
    board: 'Pedidos dos clientes', columns: ['Pedido', 'Produção', 'Aprovação do cliente', 'Agendado', 'Publicado'],
    widgets: ['posts', 'quadro', 'horas', 'cobrancas', 'funil'],
    prospect: 'opcional', prospectText: 'Fica guardada em Mais módulos. Ligue quando quiser buscar clientes por segmento e cidade.',
    extra: 'Relatório do mês para o cliente e horas por cliente já no menu.' },
  { id: 'freela', name: 'Freelancer', short: 'freelancer', about: 'Projetos de vários clientes e horas', icon: User,
    sections: [['', ['/', '/chat', '/cerebro']], ['Trabalho', ['/projetos', '/horas', '/calendario', '/relatorios']], ['Dinheiro', ['/contratos', '/cobranca', '/financas']]],
    names: {},
    board: 'Trabalhos', columns: ['A fazer', 'Fazendo', 'Revisão do cliente', 'Feito'],
    widgets: ['tarefas', 'horas', 'cobrancas', 'receita', 'agenda'],
    prospect: 'desligada', prospectText: 'Sem busca ativa. Clientes, contratos e cobrança continuam à mão.',
    extra: 'O cronômetro fica no menu; as horas viram recibo com um clique.' },
  { id: 'consultor', name: 'Consultor', short: 'consultor', about: 'Diagnóstico, plano e reuniões', icon: Target,
    sections: [['', ['/', '/chat', '/cerebro']], ['Clientes', ['/briefing', '/crm', '/calendario']], ['Entregar', ['/projetos', '/horas', '/relatorios']], ['Dinheiro', ['/contratos', '/cobranca']]],
    names: {},
    board: 'Consultorias', columns: ['Diagnóstico', 'Plano', 'Execução', 'Acompanhamento'],
    widgets: ['agenda', 'followups', 'quadro', 'horas', 'cobrancas'],
    prospect: 'opcional', prospectText: 'Guardada. Útil se você faz busca ativa por empresas de um setor.',
    extra: 'Briefing antes de cada reunião logo no começo do menu.' },
  { id: 'conteudo', name: 'Produz conteúdo', short: 'quem produz conteúdo', about: 'Ideias, gravação, marcas e posts', icon: Play,
    sections: [['', ['/', '/chat', '/cerebro']], ['Produzir', ['/social', '/calendario', '/projetos', '/campanhas']], ['Marcas', ['/crm', '/contratos', '/financas']]],
    names: { '/crm': 'Marcas' },
    board: 'Produção', columns: ['Ideia', 'Roteiro', 'Gravação', 'Edição', 'Publicado'],
    widgets: ['posts', 'quadro', 'receita', 'followups'],
    prospect: 'desligada', prospectText: 'As marcas chegam até você. O CRM aparece com o nome Marcas.',
    extra: 'O calendário editorial fica no Social.' },
  { id: 'b2b', name: 'Vendas B2B', short: 'vendas B2B', about: 'Prospecção ativa e funil longo', icon: TrendingUp,
    sections: [['', ['/', '/painel', '/chat']], ['Vender', ['/prospeccao', '/crm', '/briefing', '/contratos']], ['Entregar', ['/projetos']], ['Dinheiro', ['/cobranca', '/financas']], ['Marketing', ['/campanhas']], ['Assistentes', ['/bots', '/automacoes']]],
    names: {},
    board: 'Implantações', columns: ['Kickoff', 'Configuração', 'Treinamento', 'Entregue'],
    widgets: ['followups', 'funil', 'leads', 'receita'],
    prospect: 'ligada', prospectText: 'Campanhas segmento × cidade, triagem um por um e mensagem com IA no WhatsApp.',
    extra: 'O bot de Vendas fica no menu, em Assistentes.' },
  { id: 'pessoal', name: 'Vida pessoal', short: 'a vida pessoal', about: 'Tarefas, contas e ideias', icon: Home,
    sections: [['', ['/', '/chat', '/cerebro']], ['Dia a dia', ['/projetos', '/calendario', '/financas']]],
    names: {},
    board: 'Minhas coisas', columns: ['Caixa de entrada', 'Próximas ações', 'Esperando', 'Feito'],
    widgets: ['tarefas', 'agenda', 'contas', 'cerebro'],
    prospect: 'desligada', prospectText: 'Nada de comercial: CRM, contratos e prospecção ficam guardados.',
    extra: 'Finanças, tarefas e notas, sem o resto.' },
]
export const ALL_SEGMENT = { id: 'tudo' as const, name: 'Montar do zero', icon: Shapes }
export const segmentOf = (id: string | undefined) => SEGMENTS.find((s) => s.id === id)

export function menuFor(seg: Segment): MenuConfig {
  const used = new Set(seg.sections.flatMap(([, it]) => it))
  // tudo o que o segmento não usa vai para uma seção guardada, para voltar com um clique
  const rest = MENU_PATHS.filter((p) => !used.has(p))
  return normalize({ sections: [...seg.sections.map(([label, items]) => ({ label, items })), { label: 'Outros', items: rest }], hidden: rest, names: seg.names })
}

export const homeFor = (seg: Segment | undefined): HomeConfig => ({
  current: 'dia', boards: [{ id: 'dia', name: 'Dia a dia', widgets: pack(seg ? seg.widgets : ['tarefas', 'receita', 'cobrancas', 'funil', 'followups', 'cerebro']) }],
})

export function readHome(h: HomeConfig | undefined, seg: Segment | undefined): HomeConfig {
  if (!h || !Array.isArray(h.boards) || !h.boards.length) return homeFor(seg)
  const boards = h.boards.map((b) => ({ ...b, widgets: settle((b.widgets ?? []).filter((w) => widgetDef(w.id))) }))
  return { current: boards.some((b) => b.id === h.current) ? h.current : boards[0].id, boards }
}
export const saveHome = (h: HomeConfig) => setSetting('ui.home', h)

/** Kanban do segmento: cores na regra do app (primeira cinza, meio amarelo, última verde e concluída). */
export function columnsFor(seg: Segment): Column[] {
  const n = seg.columns.length
  return seg.columns.map((name, i) => ({ id: null, name, color: i === 0 ? '#8A93B4' : i === n - 1 ? '#1D6B45' : '#E0A800', wip: null, done: i === n - 1 }))
}

/** Aplica o segmento: menu, Início e (se pedido) o quadro com as colunas, uma vez só. */
export async function applySegment(seg: Segment, opts: { board: boolean }) {
  if (opts.board) {
    const projects = await call<Project[]>('projects_list').catch(() => [] as Project[])
    if (!projects.some((p) => p.name.trim().toLowerCase() === seg.board.toLowerCase())) {
      const setup: MethodSetup = { methods: ['kanban'], preset: null, focusRule: null, reviewDay: null, columns: columnsFor(seg) }
      const id = await call<number>('project_save', { id: null, scope: 'personal', name: seg.board, description: `Quadro montado para ${seg.short}.`, setup })
      await call<Board>('board_get', { projectId: id }).catch(() => null)
    }
  }
  await setSetting('ui.menu', menuFor(seg))
  await setSetting('ui.home', homeFor(seg))
  await setSetting('ui.banner.closed', false)
  await setSetting('ui.segment', seg.id)
}

/** "Montar do zero" / "manter como está": nada muda além de marcar que a pergunta foi feita. */
export const keepAll = () => setSetting('ui.segment', 'tudo')
