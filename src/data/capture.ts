// Captura rápida (fase 8.5: "cartão que entende a frase").
// Lê a frase e tira dela a data ("amanhã", "sexta", "15/11"), a hora ("15h", "9:30"), as etiquetas (#vendas)
// e o cliente do CRM pelo nome. Com cliente, vira follow-up; com data, tarefa; sem nada, caixa de entrada (GTD).
import { call, newTask, type Board, type Project } from './api'
import type { Company, Opportunity } from './crm'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
// nomes completos primeiro; as abreviações só valem se nenhum nome completo aparecer
const WEEK: [RegExp, number][] = [
  [/\bdomingo\b/, 0], [/\bsegunda(-feira)?\b/, 1], [/\bterca(-feira)?\b/, 2], [/\bquarta(-feira)?\b/, 3],
  [/\bquinta(-feira)?\b/, 4], [/\bsexta(-feira)?\b/, 5], [/\bsabado\b/, 6],
  [/\bseg\b/, 1], [/\bter\b/, 2], [/\bqua\b/, 3], [/\bqui\b/, 4], [/\bsex\b/, 5], [/\bsab\b/, 6], [/\bdom\b/, 0],
]

export type Kind = 'inbox' | 'tarefa' | 'followup'
export type Parsed = { title: string; date: string | null; time: string | null; tags: string[]; company: Company | null; kind: Kind; chips: string[] }

/** Entende a frase. `now` é parâmetro para dar para testar. */
export function parse(text: string, companies: Company[], now = new Date()): Parsed {
  // cliente do CRM: o nome mais longo que aparece na frase. Ele sai do texto antes de procurar a data
  // (assim o "Dom" de "Barbearia do Dom" não vira domingo) e volta no fim, para o título.
  const company = [...companies].sort((a, b) => b.name.length - a.name.length).find((c) => c.name.trim().length >= 3 && plain(text).includes(plain(c.name.trim()))) ?? null
  const MARK = '\u0001'
  let t = ` ${text} `
  if (company) {
    const n = company.name.trim(), i = plain(t).indexOf(plain(n))
    t = t.slice(0, i) + MARK + t.slice(i + n.length)
  }
  const p = plain(t)
  const chips: string[] = []
  let date: string | null = null, time: string | null = null
  const cut = (re: RegExp) => { const m = plain(t).match(re); if (m && m.index != null) t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); return m }

  // data
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const add = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); return iso(d) }
  if (/\bdepois de amanha\b/.test(p)) { date = add(2); cut(/\s(para |pra )?depois de amanha\b/) }
  else if (/\bamanha\b/.test(p)) { date = add(1); cut(/\s(para |pra )?amanha\b/) }
  else if (/\bhoje\b/.test(p)) { date = add(0); cut(/\s(para |pra )?hoje\b/) }
  else {
    const dm = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : now.getFullYear()
      let d = new Date(y, +dm[2] - 1, +dm[1], 12)
      if (!dm[3] && d < day) d = new Date(y + 1, +dm[2] - 1, +dm[1], 12)
      if (d.getDate() === +dm[1]) { date = iso(d); cut(/\s(no |em |dia )?\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/) }
    } else {
      for (const [re, wd] of WEEK) {
        if (re.test(p)) {
          const diff = (wd - day.getDay() + 7) % 7
          date = add(diff === 0 ? 7 : diff)
          cut(new RegExp(`\\s(na |no |nesta |neste |proxima |proximo )?${re.source}`))
          break
        }
      }
      const dd = !date && p.match(/\bdia (\d{1,2})\b/)
      if (dd) {
        let d = new Date(now.getFullYear(), now.getMonth(), +dd[1], 12)
        if (d < day) d = new Date(now.getFullYear(), now.getMonth() + 1, +dd[1], 12)
        date = iso(d); cut(/\s(no )?dia \d{1,2}\b/)
      }
    }
  }
  // hora: 15h, 15h30, 15:30, às 9
  const hm = plain(t).match(/\b(?:as |às )?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\b|\bas (\d{1,2})\b/)
  if (hm) {
    const h = +(hm[1] ?? hm[4]), m = +(hm[2] ?? hm[3] ?? 0)
    if (h < 24 && m < 60) { time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; cut(/\s(as |às )?(\d{1,2}(h(\d{2})?|:\d{2})|as \d{1,2})\b/); if (!date) date = add(0) }
  }
  // etiquetas
  const tags = [...t.matchAll(/#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase())
  t = t.replace(/\s#[\p{L}\d_-]+/gu, ' ')
  if (company) t = t.replace(MARK, company.name.trim())

  if (date) chips.push(new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') + (time ? `, ${time}` : ''))
  if (company) chips.push(`${company.name} (CRM)`)
  for (const g of tags) chips.push(`#${g}`)
  const title = t.replace(/\s+/g, ' ').replace(/\s([,.;:!?])/g, '$1').trim().replace(/^(de |para |pra )/i, '')
  return { title: title || text.trim(), date, time, tags, company, kind: company ? 'followup' : date ? 'tarefa' : 'inbox', chips }
}

/** Projeto padrão da caixa de entrada: o escolhido em Configurações, senão o primeiro com GTD, senão o primeiro aberto. */
export function inboxProject(projects: Project[], chosen: number | null): Project | null {
  const open = projects.filter((p) => !p.archived)
  return open.find((p) => p.id === chosen) ?? open.find((p) => p.methods.includes('gtd')) ?? open[0] ?? null
}

export type Target = { kind: Kind; projectId: number | null; companyId: number | null; date: string; time: string; title: string; tags: string[] }

/** Guarda a captura no destino. Devolve uma frase curta dizendo onde foi parar. */
export async function saveCapture(t: Target, projects: Project[], companies: Company[], today: string): Promise<string> {
  const title = t.title.trim()
  if (!title) throw new Error('Escreva o que você quer guardar.')
  if (t.kind === 'followup') {
    const co = companies.find((c) => c.id === t.companyId)
    if (!co) throw new Error('Escolha o cliente do CRM.')
    const opps = await call<Opportunity[]>('crm_opportunities', { scope: co.scope })
    const opp = opps.find((o) => o.companyId === co.id && o.stage !== 'ganho' && o.stage !== 'perdido')
    if (opp) {
      const when = t.date ? (t.time ? `${t.date}T${t.time}` : t.date) : opp.followUpAt
      await call('crm_opp_save', { opp: { ...opp, followUpAt: when, followUp: title }, today })
      return `Follow-up de ${co.name}${t.date ? ` para ${new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}${t.time ? `, ${t.time}` : ''}` : ''}.`
    }
    // sem oportunidade aberta: vira anotação no histórico da empresa
    // a data falada ("sexta 15h") fica no texto da anotação; o registro é de hoje, quando foi capturado
    const when = t.date ? `${new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}${t.time ? `, ${t.time}` : ''}` : ''
    await call('crm_interaction_add', { interaction: { id: null, companyId: co.id, opportunityId: null, kind: 'nota', text: when ? `Para ${when}: ${title}` : title, at: today } })
    return `${co.name} não tem negócio aberto: guardei como anotação no histórico${when ? `, para ${when}` : ''}.`
  }
  const p = projects.find((x) => x.id === t.projectId)
  if (!p) throw new Error('Escolha o projeto.')
  const board = await call<Board>('board_get', { projectId: p.id })
  const col = board.columns.find((c) => !c.done) ?? board.columns[0]
  const task = { ...newTask(p.id, col?.id ?? null, title), labels: t.tags, due: t.date || null, schedStart: t.date && t.time ? `${t.date}T${t.time}` : null, schedMin: t.date && t.time ? 30 : null }
  await call('task_save', { task: t.kind === 'inbox' ? { ...task, gtdList: 'inbox' } : task })
  return t.kind === 'inbox' ? `Na caixa de entrada de ${p.name}.` : `Tarefa em ${p.name}${t.date ? `, prazo ${new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}.`
}
