import { describe, expect, it } from 'vitest'
import { money, understand, type Ctx } from './commands'
import type { Project } from './api'
import type { Company } from './crm'

// Chat que faz (fase 12): as frases curtas da caixa do Início e do Chat, entendidas sem IA.
const project = (id: number, name: string): Project => ({ id, scope: 'personal', name, description: '', archived: false, open: 0, done: 0, methods: ['kanban'], preset: null, focusRule: 'mit3', reviewDay: null, reviewAt: null, paraKind: 'project', brainPath: null })
const company = (id: number, name: string): Company => ({ id, scope: 'personal', name, segment: '', city: '', site: '', instagram: '', phone: '', notes: '', source: '', icpScore: null, legalBasis: '', notePath: null })
// sábado, 07/11/2026
const ctx = (): Ctx => ({ projects: [project(1, 'Caixa de entrada'), project(2, 'Site institucional')], companies: [company(10, 'Padaria Sol')], today: '2026-11-07', inbox: 1, boards: new Map() })

describe('valor em reais', () => {
  it('lê os formatos de dinheiro e ignora datas e horas', () => {
    expect(money('despesa 110 software')).toBe(11000)
    expect(money('R$ 2.400,50 dia 20')).toBe(240050)
    expect(money('15/11 às 10h 59,90')).toBe(5990)
    expect(money('2h no projeto')).toBeNull()
  })
})

describe('entender o pedido', () => {
  it('despesa com categoria, conta e descrição', async () => {
    const [a] = await understand('despesa de 110 com software Figma no cartão Nubank', ctx())
    expect(a.kind).toBe('tx')
    if (a.kind !== 'tx') return
    expect(a.tx).toMatchObject({ kind: 'out', amount: 11000, category: 'Software', account: 'Nubank', description: 'Figma', due: '2026-11-07', paidAt: '2026-11-07' })
  })
  it('receita futura fica prevista, sem pagamento', async () => {
    const [a] = await understand('receita 2.400 Padaria Sol dia 20', ctx())
    if (a.kind !== 'tx') throw new Error(a.kind)
    expect(a.tx).toMatchObject({ kind: 'in', amount: 240000, description: 'Padaria Sol', due: '2026-11-20', paidAt: null })
  })
  it('tarefa com dia, hora, prioridade e projeto', async () => {
    const [a] = await understand('tarefa revisar contrato sexta 10h urgente no projeto Site', ctx())
    expect(a).toMatchObject({ kind: 'task', title: 'Revisar contrato', date: '2026-11-13', time: '10:00', priority: 4, projectId: 2 })
  })
  it('follow-up com cliente do CRM', async () => {
    const [a] = await understand('follow-up Padaria Sol amanhã 9h mandar proposta', ctx())
    expect(a).toMatchObject({ kind: 'followup', companyId: 10, date: '2026-11-08', time: '09:00' })
  })
  it('oportunidade com cliente novo: antes do valor é o cliente, depois o título', async () => {
    const [a] = await understand('oportunidade Academia Forma 1.900 landing page', ctx())
    expect(a).toMatchObject({ kind: 'opp', companyId: null, companyName: 'Academia Forma', title: 'Landing page', value: 190000 })
  })
  it('horas, com "ontem" no começo', async () => {
    const [a] = await understand('ontem 2h no projeto Site reunião com cliente', ctx())
    expect(a).toMatchObject({ kind: 'hours', minutes: 120, day: '2026-11-06', projectId: 2 })
  })
  it('várias ações só valem se todas forem entendidas; frase solta não vira ação', async () => {
    expect(await understand('despesa 50 almoço; tarefa ligar para o contador amanhã', ctx())).toHaveLength(2)
    expect(await understand('o que eu decidi sobre preço?', ctx())).toHaveLength(0)
  })
})
