// Dados de teste (modo de teste). Monta um projeto por modelo da galeria, com tarefas, sprint, OKR, ciclo,
// GTD, agenda, finanças e um modelo salvo, para dar para conferir cada tela só clicando.
// Usa os mesmos comandos do app; só aparece no modo de teste (banco separado) ou no navegador.
import { call, newTask, type Board, type MethodSetup, type Task } from './api'
import { TEMPLATES } from './methods'
import { pro } from '@pro' // com o Pro, registra também os substitutos do navegador do CRM e dos documentos
import '../pages/Gantt' // registra o substituto do cronograma

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

type T = Partial<Task> & { title: string; done?: boolean }

async function project(name: string, scope: string, templateId: string) {
  const tp = TEMPLATES.find((x) => x.id === templateId)!
  const setup: MethodSetup = { methods: tp.methods, preset: tp.id, focusRule: tp.focusRule, reviewDay: tp.reviewDay, columns: tp.columns }
  const id = await call<number>('project_save', { id: null, scope, name, description: '', setup })
  const board = await call<Board>('board_get', { projectId: id })
  return { id, board }
}

async function tasks(pid: number, board: Board, list: T[]) {
  const open = board.columns.find((c) => !c.done)!
  const doing = board.columns.filter((c) => !c.done)[1] ?? open
  const done = board.columns.find((c) => c.done)!
  const ids: number[] = []
  for (const { done: isDone, ...t } of list) {
    const col = isDone ? done.id : t.columnId === -1 ? doing.id : open.id
    ids.push(await call<number>('task_save', { task: { ...newTask(pid, col, t.title), ...t, columnId: col } }))
  }
  return ids
}

export async function seedTestData(log: (s: string) => void) {
  // organização de teste
  let org = 'org:agencia-exemplo'
  try { org = `org:${await call<string>('org_save', { id: null, name: 'Agência Exemplo' })}` } catch { /* já existe */ }

  log('Freelancer: Site da Padaria Sol (Kanban + Foco do dia)')
  {
    const { id, board } = await project('Site da Padaria Sol', 'personal', 'freelancer')
    const ids = await tasks(id, board, [
      { title: 'Corrigir formulário de pedidos', priority: 4, due: day(0), estimateMin: 120, labels: ['urgente'], columnId: -1 },
      { title: 'Enviar orçamento revisado', priority: 3, due: day(1), estimateMin: 45 },
      { title: 'Publicar cardápio de Natal', priority: 2, due: day(3), estimateMin: 90, milestone: true },
      { title: 'Reescrever página Sobre', priority: 1, estimateMin: 60, checklist: [{ text: 'Texto novo', done: true }, { text: 'Fotos', done: false }] },
      { title: 'Responder fornecedor', priority: 2, due: day(-2) },
      { title: 'Aprovar cores com a cliente', done: true },
    ])
    await call('task_save', { task: { ...(await call<Board>('board_get', { projectId: id })).tasks.find((t) => t.id === ids[0])!, focusDay: day(0), focusSlot: 0 } })
    await call('task_schedule', { id: ids[1], start: `${day(1)}T10:00`, minutes: 45 })
    await call('task_schedule', { id: ids[3], start: `${day(2)}T14:30`, minutes: 60 })
    // cronograma (fase 8.5): método ligado, inícios e dependências, com um conflito de propósito
    const fl = TEMPLATES.find((x) => x.id === 'freelancer')!
    await call('project_methods', { id, setup: { methods: [...fl.methods, 'cronograma'], preset: fl.id, focusRule: fl.focusRule, reviewDay: fl.reviewDay } })
    await call('gantt_start', { task: ids[3], day: day(0) })
    const sobre = (await call<Board>('board_get', { projectId: id })).tasks.find((t) => t.id === ids[3])!
    await call('task_save', { task: { ...sobre, due: day(4) } }) // a página Sobre vai até daqui a 4 dias
    await call('gantt_start', { task: ids[2], day: day(3) })
    await call('gantt_dep_add', { task: ids[2], on: ids[3] }) // cardápio espera a página Sobre
    await call('gantt_dep_add', { task: ids[1], on: ids[3] }) // orçamento começa antes de a página Sobre terminar: conflito
  }

  log('Agência: Campanha de Natal (Kanban + Eisenhower)')
  {
    const { id, board } = await project('Campanha de Natal', org, 'agencia')
    await tasks(id, board, [
      { title: 'Roteiro do vídeo', quadrant: 1, due: day(1), priority: 3 },
      { title: 'Calendário de posts', quadrant: 2, due: day(6) },
      { title: 'Responder e-mails de fornecedor', quadrant: 3 },
      { title: 'Trocar a fonte do rodapé', quadrant: 4 },
      { title: 'Briefing com o cliente' },
    ])
  }

  log('Dia a dia: Casa e rotina (Foco 1-3-5)')
  {
    const { id, board } = await project('Casa e rotina', 'personal', 'dia-a-dia')
    await tasks(id, board, [
      { title: 'Organizar a garagem', estimateMin: 180 },
      { title: 'Marcar dentista', estimateMin: 10 }, { title: 'Pagar IPVA', estimateMin: 10, due: day(4) },
      { title: 'Comprar presente da Ana', estimateMin: 30 }, { title: 'Trocar filtro do ar', estimateMin: 20 },
    ])
  }

  log('Vida pessoal (GTD)')
  {
    const { id, board } = await project('Vida pessoal', 'personal', 'vida')
    await tasks(id, board, [
      { title: 'Ver com o contador a nota de outubro', gtdList: 'inbox' },
      { title: 'Ideia: curso de fotografia', gtdList: 'inbox' },
      { title: 'Presente de aniversário da mãe', gtdList: 'inbox' },
      { title: 'Ligar para o eletricista', gtdList: 'next', context: 'telefone', estimateMin: 5, energy: 1 },
      { title: 'Pagar a conta de luz no app', gtdList: 'next', context: 'computador', estimateMin: 5, energy: 1 },
      { title: 'Planejar as férias', gtdList: 'next', context: 'computador', estimateMin: 60, energy: 3 },
      { title: 'Orçamento da reforma', gtdList: 'waiting', waitingFor: 'Carlos', waitingSince: day(-8) },
      { title: 'Aprender espanhol', gtdList: 'someday' }, { title: 'Viagem ao Chile', gtdList: 'someday' },
    ])
    await call('project_para', { id, kind: 'area', brainPath: 'pessoal' })
  }

  log('Produto: App de agendamento (Scrum + OKR, uma sprint encerrada e outra em andamento)')
  {
    const { id, board } = await project('App de agendamento', 'personal', 'produto')
    const oid = await call<number>('objective_save', { projectId: id, id: null, title: 'Agendar ficar tão fácil que ninguém liga mais' })
    const kr1 = await call<number>('kr_save', { kr: { id: null, objectiveId: oid, title: 'Horários marcados pelo próprio cliente por semana', startValue: 0, target: 200, current: 120, unit: 'horários', confidence: 3 } })
    const kr2 = await call<number>('kr_save', { kr: { id: null, objectiveId: oid, title: 'Faltas caem de 18% para 8%', startValue: 18, target: 8, current: 13, unit: '%', confidence: 2 } })
    const s1 = await call<number>('sprint_save', { sprint: { id: null, projectId: id, name: 'Sprint 1', goal: 'Cliente cria conta e escolhe o serviço', startDay: day(-14), endDay: day(-1), closedAt: null, retro: '', report: '', outcome: null } })
    await tasks(id, board, [
      { title: 'Cadastro do cliente', points: 8, sprintId: s1, krId: kr1, done: true },
      { title: 'Escolher serviço', points: 5, sprintId: s1, krId: kr1, done: true },
      { title: 'Login por código', points: 5, sprintId: s1 },
    ])
    await call('sprint_close', { id: s1, day: day(-1), retro: JSON.stringify({ bom: 'Dividir as telas em tarefas pequenas.', melhorar: 'Revisão ficou parada dois dias.', acao: 'Limite de 2 em Revisão.' }), outcome: 'partial' })
    const s2 = await call<number>('sprint_save', { sprint: { id: null, projectId: id, name: 'Sprint 2', goal: 'Cliente marca horário sozinho', startDay: day(-3), endDay: day(10), closedAt: null, retro: '', report: '', outcome: null } })
    await tasks(id, board, [
      { title: 'Agenda do profissional', points: 5, sprintId: s2, krId: kr1, done: true },
      { title: 'Lembrete por WhatsApp', points: 5, sprintId: s2, krId: kr2, columnId: -1 },
      { title: 'Tela de cancelamento', points: 3, sprintId: s2 },
      { title: 'Pagamento antecipado por Pix', points: 8 }, { title: 'Relatório de faltas', points: 5, krId: kr2 }, { title: 'Modo escuro', points: 3 },
    ])
  }

  log('Ciclos: Painel interno (Shape Up + priorização)')
  {
    const { id, board } = await project('Painel interno', org, 'ciclos')
    const cid = await call<number>('cycle_save', { cycle: { id: null, projectId: id, name: 'Ciclo 1', bet: 'Painel de vendas da equipe', appetiteWeeks: 6, startDay: day(-12), closedAt: null } })
    const scopes: [string, number, number][] = [['Importar planilhas', 85, -1], ['Gráfico por vendedor', 40, -7], ['Filtros por período', 15, -2], ['Exportar PDF', 100, -3]]
    for (const [title, hill, ago] of scopes) {
      const sid = await call<number>('scope_save', { scope: { id: null, cycleId: cid, title, hill: 0, hillAt: null } })
      await call('scope_move', { id: sid, hill, day: day(ago) })
    }
    await tasks(id, board, [
      { title: 'Alerta de meta batida', prio: JSON.stringify({ rice: { r: 40, i: 2, c: 80, e: 1 }, ice: { i: 7, c: 8, e: 8 }, moscow: 'should' }) },
      { title: 'Ranking semanal', prio: JSON.stringify({ rice: { r: 40, i: 3, c: 80, e: 2 }, ice: { i: 9, c: 7, e: 6 }, moscow: 'must' }) },
      { title: 'Modo TV para a parede', prio: JSON.stringify({ rice: { r: 10, i: 1, c: 50, e: 1 }, ice: { i: 4, c: 5, e: 8 }, moscow: 'could' }) },
      { title: 'Integração com CRM externo', prio: JSON.stringify({ rice: { r: 40, i: 2, c: 50, e: 6 }, moscow: 'wont' }) },
    ])
  }

  log('PARA: um recurso e um projeto arquivado')
  {
    const r = await project('Referências de design', 'personal', 'branco')
    await call('project_para', { id: r.id, kind: 'resource', brainPath: 'conhecimento/design' })
    const old = await project('Logo antigo da oficina', org, 'branco')
    await call('project_archive', { id: old.id, archived: true })
  }

  log('Finanças: Pessoal e Agência Exemplo')
  const tx = (scope: string, kind: 'in' | 'out', description: string, category: string, account: string, reais: number, due: string, paidAt: string | null) =>
    call('finance_save', { tx: { id: null, scope, kind, description, category, account, amount: reais * 100, due, paidAt, notes: '' } })
  await tx('personal', 'in', 'Salário', 'Salário', 'Nubank', 5300, day(-5), day(-5))
  await tx('personal', 'out', 'Aluguel', 'Moradia', 'Nubank', 1500, day(-6), day(-6))
  await tx('personal', 'out', 'Internet', 'Contas da casa', 'Nubank', 130, day(3), null)
  await tx('personal', 'out', 'Fatura do cartão', 'Cartão de crédito', 'Nubank', 1840, day(-2), null)
  await tx('personal', 'in', 'Site da Padaria Sol', 'Freela', 'Nubank', 3200, day(8), null)
  await tx(org, 'in', 'Campanha de Natal', 'Serviços', 'Itaú', 4500, day(-1), null)
  await tx(org, 'out', 'Contador', 'Contador', 'Itaú', 450, day(5), null)

  log('Modelo salvo: "Site para cliente"')
  await call('template_save', { template: { id: null, name: 'Site para cliente', about: 'Briefing, layout, aprovação e publicação.', createdAt: null,
    data: JSON.stringify({ columns: [{ id: null, name: 'Briefing', color: '#8A93B4', wip: null, done: false }, { id: null, name: 'Layout', color: '#E0A800', wip: 2, done: false }, { id: null, name: 'Aprovação', color: '#2238C4', wip: null, done: false }, { id: null, name: 'Publicado', color: '#1D6B45', wip: null, done: true }], methods: ['kanban', 'foco', 'lista'], focusRule: 'mit3', reviewDay: 5, tasks: ['Reunião de briefing', 'Mapa do site', 'Primeira versão do layout', 'Publicar'] }) } })

  // CRM e documentos: dados de teste dos módulos do Pro
  if (pro.seed) await pro.seed(log, org, day)

  log('Pronto. Abra o roteiro de teste.')
}
