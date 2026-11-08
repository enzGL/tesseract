// CRM e funil (fase 6): tipos, estágios e o substituto do navegador.
// Tipos e chamadas do módulo Pro; a tela e o Rust ficam no repositório privado (pro/ui/pages/Crm.tsx e pro/rust/crm.rs; a migração 0016).

export type StageId = 'identificado' | 'qualificado' | 'contato' | 'conversa' | 'reuniao' | 'diagnostico' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
// Os 10 estágios do funil, na ordem, com a chance padrão de fechar e o tom da pílula (cinza → amarelo → azul).
export const STAGES: { id: StageId; name: string; chance: number; color: string }[] = [
  { id: 'identificado', name: 'Identificado', chance: 5, color: '#8A93B4' },
  { id: 'qualificado', name: 'Qualificado', chance: 10, color: '#8A93B4' },
  { id: 'contato', name: 'Primeiro contato', chance: 15, color: '#C9A227' },
  { id: 'conversa', name: 'Em conversa', chance: 25, color: '#C9A227' },
  { id: 'reuniao', name: 'Reunião marcada', chance: 35, color: '#E0A800' },
  { id: 'diagnostico', name: 'Diagnóstico', chance: 45, color: '#E0A800' },
  { id: 'proposta', name: 'Proposta enviada', chance: 60, color: '#2238C4' },
  { id: 'negociacao', name: 'Negociação', chance: 75, color: '#2238C4' },
  { id: 'ganho', name: 'Ganho', chance: 100, color: '#1D6B45' },
  { id: 'perdido', name: 'Perdido', chance: 0, color: '#8A93B4' },
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
