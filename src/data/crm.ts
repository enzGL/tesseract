// CRM e funil (fase 6): tipos, estágios e o substituto do navegador.
// Tipos e chamadas do módulo Pro; a tela e o Rust ficam no repositório privado (pro/ui/pages/Crm.tsx e pro/rust/crm.rs; a migração 0016).

export type StageId = 'identificado' | 'qualificado' | 'contato' | 'conversa' | 'reuniao' | 'diagnostico' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
// Os 10 estágios do funil, na ordem, com a chance padrão de fechar e o tom da pílula (cinza → amarelo → azul).
// hint: o que quer dizer estar no estágio (aparece ao passar o mouse no nome da coluna do funil)
export const STAGES: { id: StageId; name: string; chance: number; color: string; hint: string }[] = [
  { id: 'identificado', name: 'Identificado', chance: 5, color: '#8A93B4', hint: 'Você achou a empresa e ela pode virar cliente, mas ainda não falou com ela. É onde chegam os leads da Prospecção.' },
  { id: 'qualificado', name: 'Qualificado', chance: 10, color: '#8A93B4', hint: 'Você conferiu que vale a pena: tem o perfil do seu cliente ideal e um jeito de chegar em quem decide. Ainda sem contato.' },
  { id: 'contato', name: 'Primeiro contato', chance: 15, color: '#C9A227', hint: 'Você já mandou a primeira mensagem ou ligou, e está esperando a resposta.' },
  { id: 'conversa', name: 'Em conversa', chance: 25, color: '#C9A227', hint: 'A pessoa respondeu e vocês estão conversando.' },
  { id: 'reuniao', name: 'Reunião marcada', chance: 35, color: '#E0A800', hint: 'Tem uma reunião ou ligação marcada para entender o que a pessoa precisa.' },
  { id: 'diagnostico', name: 'Diagnóstico', chance: 45, color: '#E0A800', hint: 'Você já entendeu o problema e o que resolveria; falta montar a proposta.' },
  { id: 'proposta', name: 'Proposta enviada', chance: 60, color: '#2238C4', hint: 'A proposta, com o que você vai fazer e o preço, foi enviada. Aguardando a resposta.' },
  { id: 'negociacao', name: 'Negociação', chance: 75, color: '#2238C4', hint: 'A pessoa quer fechar, mas ainda acerta preço, prazo ou condições.' },
  { id: 'ganho', name: 'Ganho', chance: 100, color: '#1D6B45', hint: 'Fechou negócio. Vira receita prevista em Finanças.' },
  { id: 'perdido', name: 'Perdido', chance: 0, color: '#8A93B4', hint: 'Não fechou. O motivo vai para o relatório.' },
]
export const OPEN_STAGES = STAGES.slice(0, 8)
export const stageOf = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0]
export const isOpen = (o: Opportunity) => o.stage !== 'ganho' && o.stage !== 'perdido'

export const KINDS: { id: Interaction['kind']; name: string }[] = [
  { id: 'whatsapp', name: 'WhatsApp' }, { id: 'ligacao', name: 'Ligação' }, { id: 'email', name: 'E-mail' },
  { id: 'reuniao', name: 'Reunião' }, { id: 'visita', name: 'Visita' }, { id: 'nota', name: 'Anotação' },
]
export const kindName = (k: string) => (k === 'estagio' ? 'Funil' : KINDS.find((x) => x.id === k)?.name ?? k)
export const LOST_REASONS = ['Preço', 'Sem resposta', 'Fechou com outro', 'Sem orçamento agora', 'Não era o perfil', 'Desistiu do projeto']
export const SOURCES = ['Indicação', 'Prospecção', 'Instagram', 'Google', 'Site', 'Evento', 'Cliente antigo']

export type Company = {
  id: number | null; scope: string; name: string; segment: string; city: string; site: string; instagram: string; phone: string
  notes: string; source: string; icpScore: number | null; legalBasis: string; notePath: string | null
  openValue?: number; openCount?: number; lastContact?: string | null
}
export type Contact = { id: number | null; companyId: number; name: string; role: string; phone: string; email: string; decides: boolean; notes: string }
export type Opportunity = {
  id: number | null; companyId: number; contactId: number | null; title: string; value: number; monthly: boolean; stage: StageId; chance: number
  stageAt: string; followUpAt: string | null; followUp: string; lostReason: string; closedAt: string | null; financeTx: number | null; notePath: string | null; ord: number
  createdAt: string; company: string; contact: string | null; scope: string
  /** radar de esfriados (calculado na tela): dias sem contato, quando passa do limite */
  cold?: number
}
export type Interaction = { id: number | null; companyId: number; opportunityId: number | null; kind: 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'visita' | 'nota' | 'estagio'; text: string; at: string }

export const blankCompany = (scope: string, name = ''): Company => ({ id: null, scope, name, segment: '', city: '', site: '', instagram: '', phone: '', notes: '', source: '', icpScore: null, legalBasis: '', notePath: null })
export const blankContact = (companyId: number): Contact => ({ id: null, companyId, name: '', role: '', phone: '', email: '', decides: false, notes: '' })
