// Chat que faz (fase 12). Desenho: a sugestão, com a caixa do Início que entende
// frases curtas e mostra o cartão para conferir (A + B), a lista marcável para pedidos com várias ações (C) e o
// "Feito pelo Chat" com Desfazer.
// Regras: nada é gravado sem a pessoa confirmar; apagar e mandar mensagem para fora nunca são por aqui. As frases
// são entendidas no próprio computador, sem IA, pelos mesmos comandos que as telas usam.
import { call, newTask, type Board, type Project, type Task, type Tx } from './api'
import type { Company, Opportunity } from './crm'
import { inboxProject, parse } from './capture'

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
export const brlCents = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export type Ctx = { projects: Project[]; companies: Company[]; today: string; inbox: number | null; boards: Map<number, Board> }

export async function loadCtx(scopes: string[], today: string): Promise<Ctx> {
  const [projects, companies] = await Promise.all([
    call<Project[]>('projects_list').catch(() => [] as Project[]),
    Promise.all(scopes.map((s) => call<Company[]>('crm_companies', { scope: s }).catch(() => [] as Company[]))).then((x) => x.flat()),
  ])
  return { projects: projects.filter((p) => !p.archived), companies, today, inbox: null, boards: new Map() }
}
async function board(ctx: Ctx, pid: number) {
  if (!ctx.boards.has(pid)) ctx.boards.set(pid, await call<Board>('board_get', { projectId: pid }))
  return ctx.boards.get(pid)!
}

export type SprintItem = { id: number; title: string; checked: boolean }
export type Action =
  | { kind: 'tx'; tx: Tx }
  | { kind: 'task'; projectId: number | null; title: string; date: string; time: string; tags: string[]; priority: number }
  | { kind: 'followup'; companyId: number; title: string; date: string; time: string }
  | { kind: 'opp'; scope: string; companyId: number | null; companyName: string; title: string; value: number }
  | { kind: 'hours'; projectId: number | null; minutes: number; day: string; title: string }
  | { kind: 'move'; projectId: number; taskId: number; taskTitle: string; columnId: number; columnName: string }
  | { kind: 'sprint'; projectId: number; name: string; start: string; end: string; items: SprintItem[]; review: boolean }

export const KIND_NAME: Record<Action['kind'], string> = {
  tx: 'Lançamento', task: 'Tarefa', followup: 'Follow-up', opp: 'Oportunidade', hours: 'Horas', move: 'Mover tarefa', sprint: 'Sprint',
}

// ---------- entender ----------

/** Valor em reais na frase: "R$ 110", "110 reais", "1.900", "2.400,50". Em centavos. */
export function money(text: string): number | null {
  const t = text.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}(h\d{0,2}|:\d{2})\b/gi, ' ')
  const m = t.match(/(?:r\$\s*)?\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\b(?!\s*(?:h|min|horas?|semanas?|dias)\b)/i) // "3 dias" é prazo; "dia 20" é data, não
  if (!m) return null
  const v = Math.round(Number(m[1].replace(/\./g, '')) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0))
  return v > 0 ? v : null
}
const dropMoney = (t: string) => t.replace(/(?:r\$\s*)?\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s*(reais)?\b/i, ' ')

function findProject(text: string, ctx: Ctx): Project | null {
  const p = plain(text)
  const named = p.match(/\b(?:no|do|pro|para o|pra o) projeto ([^,;.]+)/)
  const byName = [...ctx.projects].sort((a, b) => b.name.length - a.name.length)
  if (named) {
    const want = named[1].trim()
    return byName.find((x) => plain(x.name).includes(want) || want.includes(plain(x.name))) ?? byName.find((x) => plain(x.name).split(/\s+/).some((w) => w.length > 3 && want.includes(w))) ?? null
  }
  return byName.find((x) => x.name.trim().length >= 4 && p.includes(plain(x.name))) ?? null
}
const cutProject = (t: string) => t.replace(/\s*\b(no|do|pro|para o|pra o) projeto [^,;.]+/i, ' ')
function findCompany(text: string, ctx: Ctx) {
  return [...ctx.companies].sort((a, b) => b.name.length - a.name.length).find((c) => c.name.trim().length >= 3 && plain(text).includes(plain(c.name.trim()))) ?? null
}
function dayOf(text: string, ctx: Ctx): string | null {
  const p = plain(text)
  const d = new Date(`${ctx.today}T12:00:00`)
  if (/\bontem\b/.test(p)) { d.setDate(d.getDate() - 1); return iso(d) }
  if (/\banteontem\b/.test(p)) { d.setDate(d.getDate() - 2); return iso(d) }
  return parse(text, [], d).date
}
const clean = (t: string) => t.replace(/\s+/g, ' ').replace(/\s([,.;:!?])/g, '$1').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim()

const TX_RE = /^\s*(?:registr[ae]r?|lanc[ae]r?|anot[ae]r?|coloc[ae]r?)?\s*(?:uma?\s+)?(despesa|gasto|paguei|pagamento|receita|recebi|entrada)\b/i
const TASK_RE = /^\s*(?:cri[ae]r?\s+(?:uma\s+)?|nova\s+|adicion[ae]r?\s+(?:uma\s+)?)?tarefa\b[:\s]*/i
const FU_RE = /^\s*(?:follow[- ]?up|retorno)\b[:\s]*(?:com|para|pra|de|da|do)?\s*/i
const CALL_RE = /^\s*(ligar|liga|ligue|chamar|chame|mandar mensagem|falar)\s+(pra|para|com|a|o)\b/i
const OPP_RE = /^\s*(?:cri[ae]r?\s+(?:uma\s+)?|nova\s+)?(oportunidade|neg[oó]cio)\b[:\s]*(?:com|para|pra|de|da|do)?\s*/i
const HOURS_RE = /^\s*(?:(?:hoje|ontem|anteontem),?\s+)?(?:registr[ae]r?|lanc[ae]r?|anot[ae]r?)?\s*(\d+(?:[.,]\d+)?)\s*(h|horas?|min|minutos?)\b/i
const MOVE_RE = /^\s*mov[ea]r?\s+(?:a\s+tarefa\s+)?["“]?(.+?)["”]?\s+(?:para|pra|pro)\s+(?:a\s+coluna\s+)?["“]?(.+?)["”]?\s*$/i
const SPRINT_RE = /\bsprint\b/i

const CATEGORY: [RegExp, string][] = [
  [/\b(software|figma|notion|adobe|canva|assinatura|app|aplicativo|google workspace|chatgpt|claude)\b/, 'Software'],
  [/\b(aluguel|condominio)\b/, 'Aluguel'], [/\b(internet|telefone|celular|energia|luz|agua)\b/, 'Contas'],
  [/\b(uber|gasolina|combustivel|onibus|estacionamento|transporte)\b/, 'Transporte'],
  [/\b(almoco|jantar|lanche|cafe|mercado|ifood|restaurante)\b/, 'Alimentação'],
  [/\b(imposto|das|mei|inss|iss)\b/, 'Impostos'], [/\b(anuncio|ads|trafego|meta ads|google ads)\b/, 'Marketing'],
]

async function one(text: string, ctx: Ctx): Promise<Action | null> {
  const p = plain(text)
  // sprint com as urgentes (várias ações)
  if (SPRINT_RE.test(text) && /\b(cri[ae]r?|mont[ae]r?|abr[ae]r?|nova)\b/.test(p)) {
    const proj = findProject(text, ctx) ?? ctx.projects.find((x) => x.methods.includes('scrum')) ?? null
    if (!proj) return null
    const weeks = Number(p.match(/\b(\d+)\s*semanas?\b/)?.[1] ?? 2)
    const start = new Date(`${ctx.today}T12:00:00`)
    // começa na próxima segunda (ou hoje, se for segunda)
    start.setDate(start.getDate() + ((8 - start.getDay()) % 7))
    const end = new Date(start); end.setDate(end.getDate() + weeks * 7 - 3)
    const b = await board(ctx, proj.id)
    const open = b.tasks.filter((t) => !t.doneAt && !b.columns.find((c) => c.id === t.columnId)?.done && t.sprintId == null)
    const minPri = /\burgent/.test(p) ? 4 : /\b(alta|importantes?)\b/.test(p) ? 3 : 3
    let items = open.filter((t) => t.priority >= minPri)
    if (!items.length && minPri === 4) items = open.filter((t) => t.priority >= 3)
    const n = await call<{ id: number; name: string }[]>('sprints_list', { projectId: proj.id }).then((s) => s.length + 1).catch(() => 1)
    return {
      kind: 'sprint', projectId: proj.id, name: `Sprint ${n}`, start: iso(start), end: iso(end), review: /\brevis|\breuniao\b/.test(p),
      items: [...items.map((t) => ({ id: t.id!, title: t.title, checked: true })), ...open.filter((t) => t.priority === 3 && minPri === 4 && !items.includes(t)).map((t) => ({ id: t.id!, title: t.title, checked: false }))],
    }
  }
  if (TX_RE.test(text)) {
    const kindWord = plain(text.match(TX_RE)![1])
    const kind: 'in' | 'out' = /^(receita|recebi|entrada)/.test(kindWord) ? 'in' : 'out'
    const amount = money(text.replace(TX_RE, ' '))
    if (!amount) return null
    let rest = dropMoney(text.replace(TX_RE, ' '))
    const acc = rest.match(/\b(?:no|na|pelo|pela|via)?\s*(cart[aã]o|conta|pix)\s+(?:do\s+|da\s+)?([\p{L}\d]+)/iu)
    const account = acc ? cap(acc[2]) : ''
    if (acc) rest = rest.replace(acc[0], ' ')
    const date = dayOf(rest, ctx) ?? ctx.today
    rest = parse(rest, []).title === rest.trim() ? rest : rest.replace(/\b(hoje|ontem|amanh[aã]|dia \d{1,2}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/gi, ' ')
    const company = findCompany(rest, ctx)
    const cat = CATEGORY.find(([re]) => re.test(plain(rest)))?.[1] ?? (kind === 'in' ? 'Serviços' : '')
    let desc = clean(rest.replace(/^\s*(de|com|em|no|na|pelo|pela)\s+/i, ' ').replace(/\b(reais)\b/gi, ' '))
    desc = clean(desc.replace(/^(com|de)\s+/i, '').replace(/\s+(com|de)\s+/i, ', '))
    // "software Figma" com a categoria Software: a descrição fica "Figma"
    if (cat && desc.split(/\s+/).length > 1) desc = clean(desc.replace(new RegExp(`^${cat}\\b`, 'i'), '')) || desc
    const scope = company?.scope ?? 'personal'
    return { kind: 'tx', tx: { id: null, scope, kind, description: company?.name ?? (desc ? cap(desc) : cat || (kind === 'in' ? 'Receita' : 'Despesa')), category: cat || 'Outros', account, amount, due: date, paidAt: date <= ctx.today ? date : null, notes: '' } }
  }
  if (HOURS_RE.test(text) && /\b(projeto|no|em|para)\b/.test(p)) {
    const m = text.match(HOURS_RE)!
    const n = Number(m[1].replace(',', '.'))
    const minutes = Math.round(/^min/i.test(m[2]) ? n : n * 60)
    const proj = findProject(text, ctx)
    if (!minutes || !proj) return null
    const rest = clean(cutProject(text.replace(HOURS_RE, ' ')).replace(/\b(ontem|anteontem|hoje)\b/gi, ' ').replace(/^(de|em|no|com)\s+/i, ''))
    return { kind: 'hours', projectId: proj.id, minutes, day: dayOf(text, ctx) ?? ctx.today, title: rest ? cap(rest) : proj.name }
  }
  if (MOVE_RE.test(text)) {
    const [, what, to] = text.match(MOVE_RE)!
    const projs = findProject(text, ctx) ? [findProject(text, ctx)!] : ctx.projects
    for (const pr of projs) {
      const b = await board(ctx, pr.id)
      const task = b.tasks.find((t) => plain(t.title) === plain(what)) ?? b.tasks.find((t) => plain(t.title).includes(plain(what)))
      const col = b.columns.find((c) => plain(c.name) === plain(to)) ?? b.columns.find((c) => plain(c.name).includes(plain(to)))
      if (task && col) return { kind: 'move', projectId: pr.id, taskId: task.id!, taskTitle: task.title, columnId: col.id!, columnName: col.name }
    }
    return null
  }
  if (OPP_RE.test(text)) {
    const value = money(text) ?? 0
    const body = text.replace(OPP_RE, ' ')
    const rest = dropMoney(body)
    const company = findCompany(rest, ctx)
    // cliente novo: o que vem antes do valor é o cliente; o que vem depois, o título ("Padaria Sol 3.800 site")
    const mm = body.match(/(?:r\$\s*)?\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s*(reais)?\b/i)
    const [before, after] = mm && mm.index != null ? [body.slice(0, mm.index), body.slice(mm.index + mm[0].length)] : [rest, '']
    const name = company?.name ?? clean(before.split(/[,;]|\s+(?:de|para|pra|no valor)\s+/)[0])
    if (!name) return null
    const title = clean((company ? rest.replace(new RegExp(company.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : after).replace(/^\s*(de|para|pra|no valor de|com)\s+/i, ''))
    return { kind: 'opp', scope: company?.scope ?? 'personal', companyId: company?.id ?? null, companyName: cap(name), title: title ? cap(title) : 'Novo negócio', value }
  }
  const company = findCompany(text, ctx)
  if (FU_RE.test(text) || (CALL_RE.test(text) && company)) {
    if (!company) return null
    const pz = parse(text.replace(FU_RE, ''), ctx.companies, new Date(`${ctx.today}T12:00:00`))
    const title = FU_RE.test(text) ? clean(pz.title.replace(new RegExp(company.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')) || `Falar com ${company.name}` : pz.title
    return { kind: 'followup', companyId: company.id!, title: cap(title), date: pz.date ?? ctx.today, time: pz.time ?? '' }
  }
  if (TASK_RE.test(text) || CALL_RE.test(text) || /^\s*lembrar de\b/i.test(text)) {
    const proj = findProject(text, ctx)
    const body = cutProject(text.replace(TASK_RE, ' ').replace(/^\s*lembrar de\s+/i, ' '))
    const pz = parse(body, [], new Date(`${ctx.today}T12:00:00`))
    const priority = /\burgente\b/i.test(body) ? 4 : /\b(prioridade alta|importante)\b/i.test(body) ? 3 : 0
    const title = clean(pz.title.replace(/\b(urgente|prioridade alta|importante)\b/gi, ' '))
    if (!title) return null
    const target = proj ?? inboxProject(ctx.projects, ctx.inbox)
    return { kind: 'task', projectId: target?.id ?? null, title: cap(title), date: pz.date ?? '', time: pz.time ?? '', tags: pz.tags, priority }
  }
  return null
}

/** Entende o pedido. Várias ações ("…; …", "… e depois …", uma por linha) só valem se todas forem entendidas. */
export async function understand(text: string, ctx: Ctx): Promise<Action[]> {
  const parts = text.split(/\s*(?:;|\n|\s+e depois\s+|\s+e tamb[eé]m\s+)\s*/i).map((x) => x.trim()).filter(Boolean)
  if (parts.length > 1) {
    const all = await Promise.all(parts.map((x) => one(x, ctx)))
    if (all.every(Boolean)) return all as Action[]
  }
  const a = await one(text, ctx)
  return a ? [a] : []
}

// ---------- o que mostrar ----------

export function describe(a: Action, ctx: Ctx): { title: string; sub: string } {
  const proj = (id: number | null) => ctx.projects.find((x) => x.id === id)?.name ?? 'sem projeto'
  switch (a.kind) {
    case 'tx': return { title: `${a.tx.kind === 'in' ? 'Receita' : 'Despesa'} de ${brlCents(a.tx.amount)} · ${a.tx.description}`, sub: [a.tx.category, a.tx.account, a.tx.paidAt ? `paga em ${fmtDay(a.tx.due)}` : `vence ${fmtDay(a.tx.due)}`].filter(Boolean).join(' · ') }
    case 'task': return { title: a.title, sub: [proj(a.projectId), a.date ? `${fmtDay(a.date)}${a.time ? `, ${a.time}` : ''}` : 'sem prazo', a.priority >= 4 ? 'urgente' : a.priority === 3 ? 'prioridade alta' : ''].filter(Boolean).join(' · ') }
    case 'followup': return { title: `${a.title}`, sub: `${ctx.companies.find((c) => c.id === a.companyId)?.name ?? ''} · ${fmtDay(a.date)}${a.time ? `, ${a.time}` : ''}` }
    case 'opp': return { title: `${a.companyName}: ${a.title}`, sub: [a.value ? brlCents(a.value) : 'sem valor', a.companyId ? 'cliente do CRM' : 'cliente novo no CRM'].join(' · ') }
    case 'hours': return { title: `${Math.floor(a.minutes / 60)}h${String(a.minutes % 60).padStart(2, '0')} · ${a.title}`, sub: `${proj(a.projectId)} · ${fmtDay(a.day)}` }
    case 'move': return { title: `"${a.taskTitle}" para ${a.columnName}`, sub: proj(a.projectId) }
    case 'sprint': return { title: `${a.name}: ${fmtDay(a.start)} a ${fmtDay(a.end)}`, sub: `${proj(a.projectId)} · ${a.items.filter((i) => i.checked).length} tarefas${a.review ? ' · reunião de revisão' : ''}` }
  }
}

// ---------- fazer e desfazer ----------

export type Undo = { cmd: string; args: Record<string, unknown> }[]
export type Done = { at: string; text: string; undo: Undo; open: string | null; undone?: boolean }

export async function perform(a: Action, ctx: Ctx): Promise<Done> {
  const at = new Date().toISOString()
  const d = describe(a, ctx)
  switch (a.kind) {
    case 'tx': {
      const id = await call<number>('finance_save', { tx: a.tx })
      return { at, text: d.title, undo: [{ cmd: 'finance_delete', args: { id } }], open: '/financas' }
    }
    case 'task': {
      if (!a.projectId) throw new Error('Escolha o projeto da tarefa.')
      const b = await board(ctx, a.projectId)
      const col = b.columns.find((c) => !c.done) ?? b.columns[0]
      const task: Task = { ...newTask(a.projectId, col?.id ?? null, a.title), labels: a.tags, priority: a.priority, due: a.date || null, schedStart: a.date && a.time ? `${a.date}T${a.time}` : null, schedMin: a.date && a.time ? 30 : null }
      const id = await call<number>('task_save', { task })
      return { at, text: `Tarefa: ${d.title}`, undo: [{ cmd: 'task_delete', args: { id } }], open: '/projetos' }
    }
    case 'followup': {
      const co = ctx.companies.find((c) => c.id === a.companyId)!
      const opps = await call<Opportunity[]>('crm_opportunities', { scope: co.scope })
      const opp = opps.find((o) => o.companyId === co.id && o.stage !== 'ganho' && o.stage !== 'perdido')
      const when = a.time ? `${a.date}T${a.time}` : a.date
      if (opp) {
        await call('crm_opp_save', { opp: { ...opp, followUpAt: when, followUp: a.title }, today: ctx.today })
        return { at, text: `Follow-up: ${co.name}, ${fmtDay(a.date)}`, undo: [{ cmd: 'crm_opp_save', args: { opp, today: ctx.today } }], open: '/crm' }
      }
      const id = await call<number>('crm_interaction_add', { interaction: { id: null, companyId: co.id, opportunityId: null, kind: 'nota', text: `Para ${fmtDay(a.date)}${a.time ? `, ${a.time}` : ''}: ${a.title}`, at: ctx.today } })
      return { at, text: `Anotação em ${co.name} (sem negócio aberto)`, undo: [{ cmd: 'crm_interaction_delete', args: { id } }], open: '/crm' }
    }
    case 'opp': {
      const undo: Undo = []
      let companyId = a.companyId
      if (!companyId) {
        companyId = await call<number>('crm_company_save', { company: { id: null, scope: a.scope, name: a.companyName, segment: '', city: '', site: '', instagram: '', phone: '', notes: '', source: 'Chat', icpScore: null, legalBasis: '', notePath: null } })
        undo.push({ cmd: 'crm_company_delete', args: { id: companyId } })
      }
      const id = await call<number>('crm_opp_save', { opp: { id: null, companyId, contactId: null, title: a.title, value: a.value, monthly: false, stage: 'identificado', chance: 5, stageAt: ctx.today, followUpAt: null, followUp: '', lostReason: '', closedAt: null, financeTx: null, notePath: null, ord: 0 }, today: ctx.today })
      undo.unshift({ cmd: 'crm_opp_delete', args: { id } })
      return { at, text: `Oportunidade: ${d.title}`, undo, open: '/crm' }
    }
    case 'hours': {
      const proj = ctx.projects.find((x) => x.id === a.projectId)
      const id = await call<number>('hours_save', { entry: { id: null, scope: proj?.scope ?? 'personal', companyId: null, projectId: a.projectId, taskId: null, title: a.title, day: a.day, start: null, minutes: a.minutes, billable: true, rate: null } })
      return { at, text: `Horas: ${d.title}`, undo: [{ cmd: 'hours_delete', args: { id } }], open: '/horas' }
    }
    case 'move': {
      const b = await board(ctx, a.projectId)
      const t = b.tasks.find((x) => x.id === a.taskId)!
      const ord = Math.max(0, ...b.tasks.filter((x) => x.columnId === a.columnId).map((x) => x.ord)) + 1
      await call('task_move', { id: a.taskId, columnId: a.columnId, ord })
      return { at, text: `Movida: ${d.title}`, undo: t.columnId != null ? [{ cmd: 'task_move', args: { id: a.taskId, columnId: t.columnId, ord: t.ord } }] : [], open: '/projetos' }
    }
    case 'sprint': {
      const id = await call<number>('sprint_save', { sprint: { id: null, projectId: a.projectId, name: a.name, goal: '', startDay: a.start, endDay: a.end, closedAt: null, retro: '', report: '', outcome: null } })
      const b = await board(ctx, a.projectId)
      const undo: Undo = []
      for (const it of a.items.filter((i) => i.checked)) {
        const t = b.tasks.find((x) => x.id === it.id)
        if (t) await call('task_save', { task: { ...t, sprintId: id } })
      }
      if (a.review) {
        const col = b.columns.find((c) => !c.done) ?? b.columns[0]
        const rid = await call<number>('task_save', { task: { ...newTask(a.projectId, col?.id ?? null, 'Reunião de revisão'), due: a.end, schedStart: `${a.end}T16:00`, schedMin: 60, sprintId: id } })
        undo.push({ cmd: 'task_delete', args: { id: rid } })
      }
      undo.push({ cmd: 'sprint_delete', args: { id } })
      return { at, text: `${d.title} · ${d.sub}`, undo, open: '/projetos' }
    }
  }
}

export async function undo(d: Done) {
  for (const u of d.undo) await call(u.cmd, u.args)
}

// "Feito pelo Chat · hoje": só neste computador, para o Desfazer do dia.
const LOG = 'tesseract.chat.done'
export function doneToday(today: string): Done[] {
  try { return (JSON.parse(localStorage.getItem(LOG) ?? '[]') as Done[]).filter((d) => d.at.slice(0, 10) === today || new Date(d.at).toLocaleDateString('sv') === today) } catch { return [] }
}
export function logDone(d: Done, today: string) {
  try { localStorage.setItem(LOG, JSON.stringify([d, ...doneToday(today)].slice(0, 30))) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event('tesseract:chat-done'))
}
export function markUndone(at: string, today: string) {
  try { localStorage.setItem(LOG, JSON.stringify(doneToday(today).map((d) => (d.at === at ? { ...d, undone: true } : d)))) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event('tesseract:chat-done'))
}
