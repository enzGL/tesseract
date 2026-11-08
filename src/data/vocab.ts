// Vocabulário por área (fase 12). Desenho: a sugestão, com o dicionário em
// Configurações (A), os pacotes por área como "Começar de" (C) e o lápis no próprio funil para renomear e
// esconder estágios (B). Muda só os nomes na tela; os dados ficam iguais.
// Fica em settings "ui.vocab". Os nomes dos estágios e os motivos de perda são aplicados direto nas listas de
// crm.ts (STAGES, LOST_REASONS), para todas as telas que já as usam mudarem juntas.
import { LOST_REASONS, OPEN_STAGES, STAGES, type StageId } from './crm'
import { setSetting, useStore } from './api'

export type TermKey = 'empresa' | 'empresas' | 'oportunidade' | 'oportunidades' | 'projeto' | 'proposta'
export type Lost = { name: string; hidden?: boolean }
export type Vocab = {
  pack?: string
  terms?: Partial<Record<TermKey, string>>
  stages?: Partial<Record<StageId, { name?: string; hidden?: boolean }>>
  /** null/ausente = os motivos padrão */
  lost?: Lost[] | null
}

export const TERM_LABELS: [TermKey, string][] = [
  ['empresa', 'Empresa / cliente'], ['empresas', 'Empresas (plural)'], ['oportunidade', 'Oportunidade'],
  ['oportunidades', 'Oportunidades (plural)'], ['projeto', 'Projeto'], ['proposta', 'Proposta'],
]
export const DEFAULT_TERMS: Record<TermKey, string> = {
  empresa: 'empresa', empresas: 'empresas', oportunidade: 'oportunidade', oportunidades: 'oportunidades', projeto: 'projeto', proposta: 'proposta',
}
const DEFAULT_STAGE_NAMES: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.id, s.name]))
export const DEFAULT_LOST = [...LOST_REASONS]
export const defaultStageName = (id: string) => DEFAULT_STAGE_NAMES[id] ?? id

export type Pack = { id: string; name: string; about: string; vocab: Vocab }
export const PACKS: Pack[] = [
  {
    id: 'clinica', name: 'Clínica', about: 'paciente, avaliação, tratamento',
    vocab: {
      pack: 'clinica',
      terms: { empresa: 'paciente', empresas: 'pacientes', oportunidade: 'tratamento', oportunidades: 'tratamentos', projeto: 'atendimento', proposta: 'orçamento' },
      stages: {
        identificado: { name: 'Primeiro contato' }, qualificado: { hidden: true }, contato: { name: 'Retornou o contato' }, conversa: { hidden: true },
        reuniao: { name: 'Avaliação agendada' }, diagnostico: { name: 'Avaliação feita' }, proposta: { name: 'Orçamento entregue' }, negociacao: { hidden: true },
        ganho: { name: 'Iniciou o tratamento' }, perdido: { name: 'Não iniciou' },
      },
      lost: [{ name: 'Preço' }, { name: 'Convênio não cobre' }, { name: 'Horário não encaixou' }, { name: 'Medo do procedimento' }, { name: 'Sem resposta' }],
    },
  },
  {
    id: 'escola', name: 'Escola ou curso', about: 'aluno, aula experimental, matrícula',
    vocab: {
      pack: 'escola',
      terms: { empresa: 'aluno', empresas: 'alunos', oportunidade: 'matrícula', oportunidades: 'matrículas', projeto: 'turma', proposta: 'proposta de plano' },
      stages: {
        identificado: { name: 'Interessado' }, qualificado: { hidden: true }, contato: { name: 'Respondeu' }, conversa: { hidden: true },
        reuniao: { name: 'Aula experimental' }, diagnostico: { hidden: true }, proposta: { name: 'Proposta de plano' }, negociacao: { hidden: true },
        ganho: { name: 'Matriculado' }, perdido: { name: 'Não matriculou' },
      },
      lost: [{ name: 'Preço' }, { name: 'Horário da turma' }, { name: 'Vai voltar no semestre que vem' }, { name: 'Escolheu outra escola' }, { name: 'Sem resposta' }],
    },
  },
  {
    id: 'agencia', name: 'Agência', about: 'conta, briefing, job',
    vocab: {
      pack: 'agencia',
      terms: { empresa: 'conta', empresas: 'contas', oportunidade: 'job', oportunidades: 'jobs', projeto: 'job', proposta: 'proposta' },
      stages: { diagnostico: { name: 'Briefing' }, ganho: { name: 'Aprovado' } },
      lost: [{ name: 'Preço' }, { name: 'Fechou com outra agência' }, { name: 'Prazo não serviu' }, { name: 'Sem verba agora' }, { name: 'Sem resposta' }],
    },
  },
  {
    id: 'consultoria', name: 'Consultoria', about: 'cliente, diagnóstico, plano',
    vocab: {
      pack: 'consultoria',
      terms: { empresa: 'cliente', empresas: 'clientes', oportunidade: 'projeto', oportunidades: 'projetos', projeto: 'plano', proposta: 'proposta' },
      stages: { reuniao: { name: 'Conversa inicial' }, diagnostico: { name: 'Diagnóstico' }, proposta: { name: 'Plano enviado' } },
      lost: [{ name: 'Preço' }, { name: 'Não era a hora' }, { name: 'Fez sozinho' }, { name: 'Fechou com outro' }, { name: 'Sem resposta' }],
    },
  },
]

let current: Vocab = {}
let applied = ''

/** Põe os nomes do vocabulário nas listas do CRM. Idempotente; barato o bastante para rodar a cada render. */
export function applyVocab(v: Vocab | undefined | null) {
  const key = JSON.stringify(v ?? {})
  if (key === applied) return
  applied = key
  current = v ?? {}
  for (const s of STAGES) s.name = current.stages?.[s.id]?.name?.trim() || DEFAULT_STAGE_NAMES[s.id]
  const lost = current.lost ? current.lost.filter((l) => !l.hidden && l.name.trim()).map((l) => l.name.trim()) : DEFAULT_LOST
  LOST_REASONS.splice(0, LOST_REASONS.length, ...lost)
}

/** Termo no vocabulário de agora ("empresa", "paciente"…). `cap` põe a primeira letra maiúscula. */
export function term(k: TermKey, cap = false) {
  const t = current.terms?.[k]?.trim() || DEFAULT_TERMS[k]
  return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t
}
/** "Nova oportunidade", "Novo tratamento": pelo fim da palavra. */
export const novo = (k: TermKey) => { const t = term(k); return `${/a$/i.test(t) ? 'Nova' : 'Novo'} ${t}` }
export const stageHidden = (id: StageId) => !!current.stages?.[id]?.hidden
/** Estágios abertos que aparecem no funil: os não escondidos, mais os escondidos que ainda têm algo dentro. */
export const shownStages = (used: Set<string> = new Set()) => OPEN_STAGES.filter((s) => !stageHidden(s.id) || used.has(s.id))

/** Lê o vocabulário salvo e aplica; chamar no topo do app (Shell) para tudo abaixo ver os nomes. */
export function useVocab(): Vocab {
  const { settings } = useStore()
  const v = (settings['ui.vocab'] as Vocab | undefined) ?? {}
  applyVocab(v)
  return v
}
export const saveVocab = (v: Vocab) => setSetting('ui.vocab', v)
/** Renomear ou esconder um estágio pelo lápis do funil. */
export function setStage(v: Vocab, id: StageId, patch: { name?: string; hidden?: boolean }) {
  const prev = v.stages?.[id] ?? {}
  const next = { ...prev, ...patch }
  if (next.name !== undefined && (!next.name.trim() || next.name.trim() === DEFAULT_STAGE_NAMES[id])) delete next.name
  return saveVocab({ ...v, stages: { ...v.stages, [id]: next } })
}
