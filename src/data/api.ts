import { invoke } from '@tauri-apps/api/core'
import { useSyncExternalStore } from 'react'
import { workspace } from './workspace'

// Ponte com o banco local (comandos Rust em src-tauri/src/lib.rs).
// Fora do Tauri (Vite no navegador) não há banco: um substituto em memória deixa a UI navegável,
// e a tela avisa com `inBrowser`. Nada desse modo é gravado em disco.

export type BackupFile = { name: string; path: string; bytes: number; modified: number }
export type DbInfo = {
  path: string
  backupsDir: string
  bytes: number
  schemaVersion: number
  latestSchema: number
  startup: { migrationsApplied: number; backupBeforeMigration: string | null; autoBackup: string | null }
}
export type Org = { id: string; name: string; archived: boolean; projects: number }
export type VaultCheck = { exists: boolean; obsidian: boolean; notes: number; capped: boolean }
export type IndexReport = { scanned: number; added: number; updated: number; removed: number; notes: number; chunks: number; ms: number }
// snippet: o termo encontrado vem entre  e  (ver Highlight em pages/Brain.tsx)
export type Hit = { path: string; title: string; heading: string | null; snippet: string }
export type NoteView = { path: string; title: string; content: string; backlinks: [string, string][]; mtime?: number | null }
export type LocalModel = { name: string; embedding: boolean }
// ---------- Projetos e tarefas (fase 4A) ----------
export type MethodId = 'kanban' | 'lista' | 'foco' | 'eisenhower' | 'gtd' | 'scrum' | 'okr' | 'shapeup' | 'priorizacao' | 'cronograma'
export type ParaKind = 'project' | 'area' | 'resource'
export type GtdList = 'inbox' | 'next' | 'waiting' | 'someday'
export type FocusRule = 'mit3' | '135' | 'ivy'
export type Project = {
  id: number; scope: string; name: string; description: string; archived: boolean; open: number; done: number
  methods: MethodId[]; preset: string | null; focusRule: FocusRule; reviewDay: number | null; reviewAt: string | null
  paraKind: ParaKind; brainPath: string | null
}
// O que a galeria manda ao criar o projeto e o trilho manda ao ligar/desligar métodos.
export type MethodSetup = { methods: MethodId[]; preset?: string | null; focusRule?: FocusRule | null; reviewDay: number | null; columns?: Column[] }
export type Column = { id: number | null; name: string; color: string | null; wip: number | null; done: boolean }
export type CheckItem = { text: string; done: boolean }
export type Task = {
  id: number | null; projectId: number; columnId: number | null; title: string; notes: string; priority: number
  due: string | null; estimateMin: number | null; labels: string[]; checklist: CheckItem[]; notePath: string | null
  ord: number; doneAt: string | null; createdAt: string | null
  quadrant: number | null; focusDay: string | null; focusSlot: number | null; spentMin: number
  schedStart: string | null; schedMin: number | null; milestone: boolean
  gtdList: GtdList | null; context: string | null; energy: number | null; waitingFor: string | null; waitingSince: string | null
  points: number | null; sprintId: number | null; krId: number | null; scopeId: number | null; prio: string | null
}
// Shape Up e modelos da pessoa (fase 4B-2c)
export type Cycle = { id: number | null; projectId: number; name: string; bet: string; appetiteWeeks: number; startDay: string; closedAt: string | null }
export type Scope = { id: number | null; cycleId: number; title: string; hill: number; hillAt: string | null }
export type UserTemplate = { id: number | null; name: string; about: string; data: string; createdAt: string | null }
// Scrum e OKR (fase 4B-2b)
export type Sprint = { id: number | null; projectId: number; name: string; goal: string; startDay: string; endDay: string; closedAt: string | null; retro: string; report: string; outcome: 'hit' | 'partial' | 'miss' | null }
// Resumo da operação: foto de um período, gerada quando a pessoa quiser (data = JSON)
export type Report = { id: number | null; projectId: number; createdAt: string | null; periodFrom: string; periodTo: string; title: string; data: string; note: string }
export type Kr = { id: number | null; objectiveId: number; title: string; startValue: number; target: number; current: number; unit: string; confidence: number }
export type Objective = { id: number; title: string; krs: Kr[] }
// Finanças (fase 4D): valores em centavos, sempre positivos; o sentido vem de kind. paidAt null = previsto.
export type Tx = {
  id: number | null; scope: string; kind: 'in' | 'out'; description: string; category: string; account: string
  amount: number; due: string; paidAt: string | null; notes: string
}
export type ImportRow = { date: string; description: string; amount: number; key: string; matchId?: number | null }
export type ImportReport = { inserted: number; matched: number; skipped: number }
// Modo de teste: banco separado (npm run teste) ou navegador, onde dá para criar dados de teste
export type AppMode = { test: boolean; dataDir: string }
export type FinanceNames = { categories: string[]; accounts: string[]; incomes: string[]; expenses: string[] }
// Calendário (fase 4C): a tarefa com o nome do projeto e a coluna em que está.
export type CalTask = { task: Task; project: string; column: string; columnColor: string | null; done: boolean }
export type Board = { columns: Column[]; tasks: Task[] }
export const PRIORITIES = ['Sem prioridade', 'Baixa', 'Média', 'Alta', 'Urgente']
export const newTask = (projectId: number, columnId: number | null, title: string): Task => ({
  id: null, projectId, columnId, title, notes: '', priority: 0, due: null, estimateMin: null, labels: [], checklist: [], notePath: null, ord: 0, doneAt: null, createdAt: null,
  quadrant: null, focusDay: null, focusSlot: null, spentMin: 0, schedStart: null, schedMin: null, milestone: false,
  gtdList: null, context: null, energy: null, waitingFor: null, waitingSince: null,
  points: null, sprintId: null, krId: null, scopeId: null, prio: null,
})
export type AiStatus = { ollama: boolean; ollamaError: string | null; models: LocalModel[]; embedReady: boolean; vectorsDone: number; vectorsTotal: number; keys: Record<string, boolean> }
export type Source = { n: number; chunk_id: number; path: string; title: string; heading: string | null; text: string }
export type Provider = { kind: 'local' | 'external'; id: string; model: string }
// Bots (fase 5): o que cada bot lê e faz. Escrever, apagar ou enviar sempre pede confirmação.
export type BotPerms = { finance: boolean; tasks: boolean; brain: boolean; app: boolean; crm: boolean; prospect: boolean; mkt: boolean; docs: boolean; suggest: boolean; external: boolean; routine: boolean }
export type Bot = { id: number; key: string; name: string; role: string; instructions: string; perms: BotPerms; builtin: boolean; lastRun: string | null; newRecs: number; examples: string[] }
export type RecStatus = 'new' | 'later' | 'task' | 'dismissed'
export type BotRec = {
  id: number; botId: number; botName: string; runId: number; title: string; why: string; fact: string; inference: string
  priority: number; projectId: number | null; status: RecStatus; taskId: number | null; createdAt: string
  scope: string | null // personal ou org:<id>, lido do que a recomendação cita
  rating: -1 | 0 | 1 // 👍 / 👎 da pessoa: as boas viram exemplo do bot, as ruins viram "não faça assim"
}
export type BotRun = { id: number; botId: number; botName: string; kind: 'routine' | 'question'; question: string; answer: string; provider: string; model: string; reads: string[]; createdAt: string; recs: BotRec[] }
export type BotPrepared = { reads: string[]; provider: Provider | null; providerError: string | null }
export type Prepared = { sources: Source[]; provider: Provider | null; providerError: string | null }
export type AiMode = 'auto' | 'local' | 'external'
export type ProviderId = 'groq' | 'gemini' | 'openrouter' | 'custom'

// Provedores externos conhecidos (todos falam a API da OpenAI). Nome de modelo é sugestão: confira no site.
// private: false quando a política do provedor permite registrar ou treinar com o que você envia (ARCHITECTURE.md).
export const PROVIDERS: { id: ProviderId; name: string; model: string; private: boolean; keyUrl: string }[] = [
  { id: 'groq', name: 'Groq', model: 'llama-3.3-70b-versatile', private: true, keyUrl: 'console.groq.com/keys' },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.0-flash', private: false, keyUrl: 'aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct:free', private: false, keyUrl: 'openrouter.ai/keys' },
  { id: 'custom', name: 'Outro (compatível com OpenAI)', model: '', private: false, keyUrl: '' },
]
export type Settings = {
  'backup.auto'?: boolean
  'backup.keep'?: number
  'vault.path'?: string
  'vault.sensitive'?: boolean
  'profile.name'?: string
  'profile.role'?: string
  'guide.done'?: string[]
  'ai.mode'?: AiMode
  'ai.localModel'?: string
  'ai.provider'?: ProviderId
  'ai.externalBase'?: string
  'ai.externalModel'?: string
  'shortcuts'?: Record<string, string>
  'onboarding.skipped'?: boolean
  'update.auto'?: boolean
  // app do seu jeito (data/layout.ts)
  'ui.segment'?: string
  'ui.menu'?: import('./layout').MenuConfig
  'ui.home'?: import('./layout').HomeConfig
  'ui.banner.closed'?: boolean
  // vocabulário por área (data/vocab.ts)
  'ui.vocab'?: import('./vocab').Vocab
}

export const inBrowser = !('__TAURI_INTERNALS__' in window)

// ---------- substituto do navegador ----------
const mem = {
  settings: {} as Record<string, unknown>,
  orgs: [] as Org[],
  seeded: false,
  backups: [] as BackupFile[],
  seq: 100,
  projects: [] as Project[],
  columns: [] as { pid: number; ord: number; col: Column }[],
  tasks: [] as Task[],
  txs: [] as Tx[],
  sprints: [] as Sprint[],
  reports: [] as Report[],
  cycles: [] as Cycle[],
  scopes: [] as Scope[],
  templates: [] as UserTemplate[],
  objectives: [] as { id: number; projectId: number; title: string }[],
  krs: [] as Kr[],
  bots: [] as Bot[],
}
// No navegador os bots existem só para navegar pela tela; rodar precisa do app (Ollama ou provedor pelo Rust).
const mockBots = () => {
  if (!mem.bots.length) {
    const base = { finance: false, tasks: true, brain: true, app: false, crm: false, prospect: false, mkt: false, docs: false, suggest: true, external: false, routine: true }
    mem.bots = ([['seg', 'Segurança', 'backups, acessos e privacidade'], ['jur', 'Jurídico', 'contratos, termos e LGPD'], ['mkt', 'Marketing', 'campanhas e conteúdo'], ['ven', 'Vendas', 'funil, propostas e follow-ups'], ['fin', 'Finanças', 'contas, recebíveis e fluxo'], ['tec', 'Tecnologia', 'projetos e prazos técnicos']] as const)
      .map(([key, name, role], i) => ({ id: i + 1, key, name, role, instructions: `Instruções padrão do bot ${name} (no app, vêm do Rust).`, perms: { ...base, finance: key === 'fin', app: key === 'seg', crm: key === 'ven', prospect: key === 'ven', mkt: key === 'mkt', docs: key === 'jur' }, builtin: true, lastRun: null, newRecs: 0, examples: [] as string[] }))
  }
  return mem.bots
}
const calRows = (): CalTask[] => mem.tasks.flatMap((t) => {
  const p = mem.projects.find((x) => x.id === t.projectId)
  if (!p || p.archived) return []
  const c = mem.columns.find((x) => x.col.id === t.columnId)?.col
  return [{ task: { ...t }, project: p.name, column: c?.name ?? '', columnColor: c?.color ?? null, done: !!c?.done }]
})
const browser: Record<string, (a: Record<string, unknown>) => unknown> = {
  db_info: () => ({ path: '(navegador: sem banco)', backupsDir: '—', bytes: 0, schemaVersion: 0, latestSchema: 1, startup: { migrationsApplied: 0, backupBeforeMigration: null, autoBackup: null } }),
  backups_list: () => mem.backups,
  backup_now: () => { throw new Error('Backup só funciona no app (npm run tauri dev).') },
  backup_restore: () => { throw new Error('Restaurar só funciona no app (npm run tauri dev).') },
  settings_all: () => mem.settings,
  setting_set: (a) => { mem.settings[a.key as string] = a.value },
  vault_check: () => ({ exists: false, obsidian: false, notes: 0, capped: false }),
  orgs_list: () => mem.orgs.map((o) => ({ ...o })),
  org_save: (a) => {
    if (a.id) { mem.orgs.find((o) => o.id === a.id)!.name = a.name as string; return a.id }
    const id = String(a.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
    mem.orgs.push({ id, name: a.name as string, archived: false, projects: 0 })
    return id
  },
  org_archive: (a) => { mem.orgs.find((o) => o.id === a.id)!.archived = a.archived as boolean },
  brain_index: () => ({ scanned: 0, added: 0, updated: 0, removed: 0, notes: 0, chunks: 0, ms: 0 }),
  brain_search: () => [],
  brain_stats: () => ({ notes: 0, chunks: 0 }),
  brain_read: () => { throw new Error('Ler notas só funciona no app.') },
  notes_list: () => [],
  notes_graph: () => ({ nodes: [], edges: [] }),
  notes_plugins: () => ({ notes: [], canvas: 0 }),
  note_links: () => [],
  note_write: () => { throw new Error('Escrever notas só funciona no app.') },
  note_create: () => { throw new Error('Escrever notas só funciona no app.') },
  note_daily: () => { throw new Error('Escrever notas só funciona no app.') },
  brain_search_hybrid: () => ({ hits: [], semantic: false }),
  ai_status: () => ({ ollama: false, ollamaError: 'navegador: sem Ollama', models: [], embedReady: false, vectorsDone: 0, vectorsTotal: 0, keys: {} }),
  brain_embed_step: () => ({ done: 0, total: 0, embedded: 0 }),
  ai_key_set: () => { throw new Error('Chaves só no app.') },
  ai_key_clear: () => undefined,
  chat_prepare: () => ({ sources: [], provider: null, providerError: 'A IA só funciona no app (npm run tauri dev).' }),
  chat_send: () => { throw new Error('A IA só funciona no app.') },
  projects_list: () => mem.projects.map((p) => {
    const ts = mem.tasks.filter((t) => t.projectId === p.id)
    const done = ts.filter((t) => mem.columns.find((c) => c.col.id === t.columnId)?.col.done).length
    return { ...p, open: ts.length - done, done }
  }),
  project_save: (a) => {
    if (a.id) { Object.assign(mem.projects.find((p) => p.id === a.id)!, { name: a.name, scope: a.scope, description: a.description ?? '' }); return a.id }
    const id = ++mem.seq
    const setup = a.setup as MethodSetup | undefined
    mem.projects.push({
      id, scope: a.scope as string, name: a.name as string, description: (a.description as string) ?? '', archived: false, open: 0, done: 0,
      methods: ['kanban', ...(setup?.methods ?? ['lista']).filter((m) => m !== 'kanban')], preset: setup?.preset ?? null,
      focusRule: setup?.focusRule ?? 'mit3', reviewDay: setup?.reviewDay ?? null, reviewAt: null, paraKind: 'project', brainPath: null,
    })
    const cols: Column[] = setup?.columns?.length ? setup.columns : [
      { id: null, name: 'A fazer', color: '#8A93B4', wip: null, done: false }, { id: null, name: 'Fazendo', color: '#E0A800', wip: 3, done: false }, { id: null, name: 'Feito', color: '#1D6B45', wip: null, done: true }]
    cols.forEach((c, i) => mem.columns.push({ pid: id, ord: i, col: { ...c, id: ++mem.seq } }))
    return id
  },
  project_methods: (a) => {
    const s = a.setup as MethodSetup
    Object.assign(mem.projects.find((p) => p.id === a.id)!, { methods: ['kanban', ...s.methods.filter((m) => m !== 'kanban')], reviewDay: s.reviewDay, ...(s.focusRule ? { focusRule: s.focusRule } : {}) })
  },
  project_review_done: (a) => { mem.projects.find((p) => p.id === a.id)!.reviewAt = a.day as string },
  task_log_time: (a) => { const t = mem.tasks.find((x) => x.id === a.id)!; t.spentMin += a.minutes as number; return t.spentMin },
  project_archive: (a) => { mem.projects.find((p) => p.id === a.id)!.archived = a.archived as boolean },
  board_get: (a) => ({ columns: mem.columns.filter((c) => c.pid === a.projectId).sort((x, y) => x.ord - y.ord).map((c) => c.col), tasks: mem.tasks.filter((t) => t.projectId === a.projectId).sort((x, y) => x.ord - y.ord) }),
  columns_save: (a) => {
    const pid = a.projectId as number
    const cols = (a.columns as Column[]).map((c, i) => ({ pid, ord: i, col: { ...c, id: c.id ?? ++mem.seq } }))
    mem.columns = [...mem.columns.filter((c) => c.pid !== pid), ...cols]
    const ids = cols.map((c) => c.col.id)
    mem.tasks.forEach((t) => { if (t.projectId === pid && !ids.includes(t.columnId!)) t.columnId = ids[0] })
    return browser.board_get({ projectId: pid })
  },
  task_save: (a) => {
    const t = a.task as Task
    // como no Rust: um lugar do foco guarda uma tarefa só, e o tempo registrado não muda por aqui
    if (t.focusDay && t.focusSlot != null) mem.tasks.forEach((x) => { if (x.id !== t.id && x.projectId === t.projectId && x.focusDay === t.focusDay && x.focusSlot === t.focusSlot) { x.focusDay = null; x.focusSlot = null } })
    if (t.id) { const cur = mem.tasks.find((x) => x.id === t.id)!; Object.assign(cur, { ...t, spentMin: cur.spentMin }); return t.id }
    const col = t.columnId ?? mem.columns.filter((c) => c.pid === t.projectId).sort((x, y) => x.ord - y.ord)[0].col.id
    const id = ++mem.seq
    mem.tasks.push({ ...t, id, columnId: col as number, ord: Math.max(0, ...mem.tasks.filter((x) => x.columnId === col).map((x) => x.ord)) + 1, createdAt: new Date().toISOString() })
    return id
  },
  task_move: (a) => { const t = mem.tasks.find((x) => x.id === a.id)!; t.columnId = a.columnId as number; t.ord = a.ord as number },
  task_delete: (a) => { mem.tasks = mem.tasks.filter((t) => t.id !== a.id) },
  tasks_open: () => [],
  app_mode: () => ({ test: true, dataDir: 'navegador (só na memória: recarregar apaga)', freshInstall: false, installModel: null }),
  ai_ram: () => 16,
  update_check: () => null,
  update_install: () => { throw new Error('navegador: sem atualização') },
  ai_pull: () => { throw new Error('navegador: sem Ollama') },
  app_welcome_done: () => undefined,
  sprints_list: (a) => mem.sprints.filter((s) => s.projectId === a.projectId).map((s) => ({ ...s })),
  sprint_save: (a) => {
    const s = a.sprint as Sprint
    if (!s.name.trim()) throw new Error('dê um nome à sprint')
    if (s.id) { Object.assign(mem.sprints.find((x) => x.id === s.id)!, s); return s.id }
    if (mem.sprints.some((x) => x.projectId === s.projectId && !x.closedAt)) throw new Error('encerre a sprint atual antes de começar outra')
    const id = ++mem.seq; mem.sprints.push({ ...s, id, closedAt: null, retro: '', report: '', outcome: null }); return id
  },
  sprint_close: (a) => {
    const s = mem.sprints.find((x) => x.id === a.id)!
    const its = mem.tasks.filter((t) => t.sprintId === s.id)
    const isDone = (t: Task) => !!mem.columns.find((c) => c.col.id === t.columnId)?.col.done
    s.report = JSON.stringify({ planned: its.reduce((x, t) => x + (t.points ?? 0), 0), done: its.filter(isDone).reduce((x, t) => x + (t.points ?? 0), 0), delivered: its.filter(isDone).map((t) => t.title), returned: its.filter((t) => !isDone(t)).map((t) => t.title), krs: [...new Set(its.filter(isDone).map((t) => mem.krs.find((k) => k.id === t.krId)?.title).filter(Boolean))] })
    s.closedAt = a.day as string; s.retro = a.retro as string; s.outcome = (a.outcome as Sprint['outcome']) ?? null
    let n = 0
    mem.tasks.forEach((t) => { if (t.sprintId === s.id && !mem.columns.find((c) => c.col.id === t.columnId)?.col.done) { t.sprintId = null; n++ } })
    return n
  },
  reports_list: (a) => mem.reports.filter((r) => r.projectId === a.projectId).map((r) => ({ ...r })).reverse(),
  report_save: (a) => {
    const r = a.report as Report
    if (r.id) { Object.assign(mem.reports.find((x) => x.id === r.id)!, { note: r.note, title: r.title }); return r.id }
    const id = ++mem.seq; mem.reports.push({ ...r, id, createdAt: new Date().toISOString() }); return id
  },
  report_delete: (a) => { mem.reports = mem.reports.filter((r) => r.id !== a.id) },
  cycles_list: (a) => mem.cycles.filter((c) => c.projectId === a.projectId).map((c) => ({ ...c })),
  cycle_save: (a) => {
    const c = a.cycle as Cycle
    if (c.id) { Object.assign(mem.cycles.find((x) => x.id === c.id)!, c); return c.id }
    if (mem.cycles.some((x) => x.projectId === c.projectId && !x.closedAt)) throw new Error('encerre o ciclo atual antes de começar outro')
    const id = ++mem.seq; mem.cycles.push({ ...c, id, closedAt: null }); return id
  },
  cycle_close: (a) => { mem.cycles.find((x) => x.id === a.id)!.closedAt = a.day as string },
  scopes_list: (a) => mem.scopes.filter((s) => s.cycleId === a.cycleId).map((s) => ({ ...s })),
  scope_save: (a) => {
    const s = a.scope as Scope
    if (s.id) { mem.scopes.find((x) => x.id === s.id)!.title = s.title; return s.id }
    const id = ++mem.seq; mem.scopes.push({ ...s, id, hill: 0, hillAt: new Date().toISOString().slice(0, 10) }); return id
  },
  scope_move: (a) => { const s = mem.scopes.find((x) => x.id === a.id)!; s.hill = a.hill as number; s.hillAt = a.day as string },
  scope_delete: (a) => { mem.scopes = mem.scopes.filter((s) => s.id !== a.id); mem.tasks.forEach((t) => { if (t.scopeId === a.id) t.scopeId = null }) },
  project_para: (a) => { Object.assign(mem.projects.find((p) => p.id === a.id)!, { paraKind: a.kind, brainPath: (a.brainPath as string | null) || null }) },
  templates_list: () => mem.templates.map((t) => ({ ...t })),
  template_save: (a) => {
    const t = a.template as UserTemplate
    if (!t.name.trim()) throw new Error('dê um nome ao modelo')
    if (t.id) { Object.assign(mem.templates.find((x) => x.id === t.id)!, t); return t.id }
    const id = ++mem.seq; mem.templates.push({ ...t, id, createdAt: new Date().toISOString() }); return id
  },
  template_delete: (a) => { mem.templates = mem.templates.filter((t) => t.id !== a.id) },
  okr_list: (a) => mem.objectives.filter((o) => o.projectId === a.projectId).map((o) => ({ id: o.id, title: o.title, krs: mem.krs.filter((k) => k.objectiveId === o.id).map((k) => ({ ...k })) })),
  objective_save: (a) => {
    if (a.id) { mem.objectives.find((o) => o.id === a.id)!.title = a.title as string; return a.id }
    const id = ++mem.seq; mem.objectives.push({ id, projectId: a.projectId as number, title: a.title as string }); return id
  },
  objective_delete: (a) => { mem.objectives = mem.objectives.filter((o) => o.id !== a.id); mem.krs = mem.krs.filter((k) => k.objectiveId !== a.id) },
  kr_save: (a) => {
    const k = a.kr as Kr
    if (k.target === k.startValue) throw new Error('a meta precisa ser diferente do ponto de partida')
    if (k.id) { Object.assign(mem.krs.find((x) => x.id === k.id)!, k); return k.id }
    const id = ++mem.seq; mem.krs.push({ ...k, id }); return id
  },
  kr_delete: (a) => { mem.krs = mem.krs.filter((k) => k.id !== a.id); mem.tasks.forEach((t) => { if (t.krId === a.id) t.krId = null }) },
  finance_list: (a) => mem.txs.filter((t) => t.scope === a.scope && ((t.due >= (a.from as string) && t.due <= (a.to as string)) || (t.paidAt && t.paidAt >= (a.from as string) && t.paidAt <= (a.to as string)))).map((t) => ({ ...t })),
  finance_overdue: (a) => mem.txs.filter((t) => t.scope === a.scope && !t.paidAt && t.due < (a.today as string)).map((t) => ({ ...t })),
  finance_names: (a) => {
    const pick = (k: 'category' | 'account' | 'description', kind?: 'in' | 'out') => [...new Set(mem.txs.filter((t) => t.scope === a.scope && t[k] && (!kind || t.kind === kind)).map((t) => t[k]))]
    return { categories: pick('category'), accounts: pick('account'), incomes: pick('description', 'in'), expenses: pick('description', 'out') }
  },
  finance_save: (a) => {
    const t = a.tx as Tx
    if (!t.description.trim()) throw new Error('dê uma descrição ao lançamento')
    if (!(t.amount > 0)) throw new Error('valor precisa ser maior que zero')
    if (t.id) { Object.assign(mem.txs.find((x) => x.id === t.id)!, t); return t.id }
    const id = ++mem.seq; mem.txs.push({ ...t, id }); return id
  },
  finance_paid: (a) => { mem.txs.find((x) => x.id === a.id)!.paidAt = (a.day as string | null) ?? null },
  finance_delete: (a) => { mem.txs = mem.txs.filter((x) => x.id !== a.id) },
  calendar_range: (a) => calRows().filter((x) => (x.task.due && x.task.due >= (a.from as string) && x.task.due <= (a.to as string)) || (x.task.schedStart && x.task.schedStart.slice(0, 10) >= (a.from as string) && x.task.schedStart.slice(0, 10) <= (a.to as string))),
  calendar_unscheduled: () => calRows().filter((x) => !x.task.schedStart && !x.done).sort((a, b) => (a.task.due ?? '9999').localeCompare(b.task.due ?? '9999')),
  task_schedule: (a) => { const t = mem.tasks.find((x) => x.id === a.id)!; t.schedStart = (a.start as string | null) ?? null; t.schedMin = a.start ? ((a.minutes as number | null) ?? 60) : null },
  bots_list: () => mockBots().map((b) => ({ ...b })),
  bot_save: (a) => {
    const bots = mockBots()
    const b = bots.find((x) => x.id === a.id)
    const v = { name: a.name as string, role: a.role as string, instructions: a.instructions as string, perms: a.perms as BotPerms }
    if (b) { Object.assign(b, v); return b.id }
    const id = ++mem.seq
    bots.push({ id, key: `custom-${id}`, builtin: false, lastRun: null, newRecs: 0, examples: [], ...v })
    return id
  },
  bot_examples_save: (a) => { const b = mockBots().find((x) => x.id === a.id)!; b.examples = (a.examples as string[]).map((x) => x.trim()).filter(Boolean); return b.examples },
  bot_reset: () => { throw new Error('Restaurar o padrão só funciona no app (npm run tauri dev).') },
  bot_archive: (a) => { mem.bots = mockBots().filter((b) => b.id !== a.id || b.builtin) },
  bot_prepare: () => ({ reads: [], provider: null, providerError: 'Os bots só rodam no app (npm run tauri dev).' }),
  bot_run: () => { throw new Error('Os bots só rodam no app (npm run tauri dev).') },
  bot_runs: () => [],
  bot_recs: () => [],
  rec_decide: () => undefined,
  rec_rate: () => undefined,
  rec_to_task: () => { throw new Error('Só funciona no app (npm run tauri dev).') },
  workspace_seed: (a) => {
    if (mem.seeded) return false
    mem.seeded = true
    mem.orgs = (a.orgs as { id: string; name: string; projects: string[] }[]).map((o) => ({ id: o.id, name: o.name, archived: false, projects: o.projects.length }))
    return true
  },
}

// Módulos que ficam em arquivo próprio (ex.: CRM, módulo Pro) registram aqui o seu substituto do navegador.
export const registerMock = (cmds: Record<string, (a: Record<string, unknown>) => unknown>) => { Object.assign(browser, cmds) }
// Próximo id do substituto do navegador, compartilhado com esses módulos.
export const mockId = () => ++mem.seq
// Lançamentos de Finanças do substituto, para os módulos que mexem neles (ex.: importação de extrato).
export const mockTxs = () => mem.txs

// Limite do Grátis: o Rust responde "PRO:<o que é>". A janela de ativação (data/license.ts) ouve
// o evento e abre com o motivo; quem chamou recebe um erro legível.
export const PRO_EVENT = 'tesseract:pro'
export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inBrowser) return browser[cmd](args) as T
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    const m = typeof e === 'string' ? e : e instanceof Error ? e.message : ''
    if (m.startsWith('PRO:')) {
      const what = m.slice(4)
      window.dispatchEvent(new CustomEvent(PRO_EVENT, { detail: what }))
      throw new Error(`${what}: recurso do Pro.`)
    }
    throw e
  }
}

// Erros do Rust chegam como string; os do JS como Error.
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---------- estado compartilhado: organizações e configurações ----------
type State = { ready: boolean; orgs: Org[]; settings: Settings; error: string | null; index: { running: boolean; last: IndexReport | null; error: string | null }; embed: { running: boolean; done: number; total: number; error: string | null } }
let state: State = { ready: false, orgs: [], settings: {}, error: null, index: { running: false, last: null, error: null }, embed: { running: false, done: 0, total: 0, error: null } }
const subs = new Set<() => void>()
const emit = (next: Partial<State>) => { state = { ...state, ...next }; subs.forEach((f) => f()) }

export async function reload() {
  try {
    const [orgs, settings] = await Promise.all([call<Org[]>('orgs_list'), call<Settings>('settings_all')])
    emit({ ready: true, orgs, settings, error: null })
  } catch (e) {
    emit({ ready: true, error: message(e) })
  }
}

// Primeira execução importa as organizações do seed (local ou exemplo); depois o banco manda.
export async function boot() {
  try {
    await call<boolean>('workspace_seed', { orgs: workspace.orgs })
  } catch (e) {
    emit({ ready: true, error: message(e) })
    return
  }
  await reload()
  if (state.settings['vault.path']) void indexBrain()
}

// Atualiza o índice do cérebro (incremental, só lê o vault). Uma rodada por vez.
export async function indexBrain() {
  if (state.index.running) return
  emit({ index: { ...state.index, running: true, error: null } })
  try {
    const last = await call<IndexReport>('brain_index')
    emit({ index: { running: false, last, error: null } })
    void embedAll()
  } catch (e) {
    emit({ index: { running: false, last: state.index.last, error: message(e) } })
  }
}

// Vetores para a busca por significado: em lotes, em segundo plano, só se o Ollama tiver o bge-m3.
export async function embedAll() {
  if (state.embed.running || inBrowser) return
  let status: AiStatus
  try { status = await call<AiStatus>('ai_status') } catch { return }
  emit({ embed: { running: false, done: status.vectorsDone, total: status.vectorsTotal, error: status.embedReady ? null : status.ollamaError ?? 'o modelo bge-m3 não está instalado no Ollama' } })
  if (!status.embedReady || status.vectorsDone >= status.vectorsTotal) return
  emit({ embed: { ...state.embed, running: true } })
  try {
    for (;;) {
      const r = await call<{ done: number; total: number; embedded: number }>('brain_embed_step')
      emit({ embed: { running: true, done: r.done, total: r.total, error: null } })
      if (r.embedded === 0 || r.done >= r.total) break
    }
    emit({ embed: { ...state.embed, running: false } })
  } catch (e) {
    emit({ embed: { ...state.embed, running: false, error: message(e) } })
  }
}

export async function setSetting<K extends keyof Settings>(key: K, value: NonNullable<Settings[K]>) {
  await call('setting_set', { key, value })
  emit({ settings: { ...state.settings, [key]: value } })
  // trocou de cérebro ou mudou o que entra no índice: reindexa
  if (key === 'vault.path' || key === 'vault.sensitive') { emit({ index: { running: false, last: null, error: null } }); void indexBrain() }
}

export function useStore() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)
}

// Escopos do seletor: Pessoal sempre, mais as organizações não arquivadas.
export function useScopes() {
  const { orgs } = useStore()
  return [{ id: 'personal', name: 'Pessoal' }, ...orgs.filter((o) => !o.archived).map((o) => ({ id: `org:${o.id}`, name: o.name }))]
}
