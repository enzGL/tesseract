// Social Media (fase 9): tipos, redes e o substituto do navegador.
// Tipos e chamadas do módulo Pro; a tela e o Rust ficam no repositório privado (pro/ui/pages/Social.tsx e pro/rust/social.rs; a migração 0022).
import type { Provider } from './api'

export type Status = 'ideia' | 'rascunho' | 'aprovacao' | 'agendado' | 'publicado'
export type NetworkId = 'instagram' | 'linkedin' | 'tiktok' | 'facebook' | 'x' | 'youtube'
export type Metrics = { alcance?: number; curtidas?: number; comentarios?: number; salvos?: number; cliques?: number }
export type Post = {
  id: number | null; scope: string; title: string; caption: string; hashtags: string; networks: NetworkId[]; status: Status
  scheduledAt: string | null; publishedAt: string | null; media: string[]; approvalNote: string; metrics: Metrics; createdAt?: string
}
export type VariationPrep = { provider: Provider | null; providerError: string | null; examples: number }

// Etapas do quadro (B) e o tom de cada uma no calendário (A).
export const STAGES: { id: Status; name: string; hint: string; tone: string }[] = [
  { id: 'ideia', name: 'Ideias', hint: 'sem data ainda', tone: 'border border-dashed border-line-strong' },
  { id: 'rascunho', name: 'Rascunho', hint: 'texto e imagem', tone: 'border border-dashed border-[#8A93B4]' },
  { id: 'aprovacao', name: 'Aprovação', hint: 'com o cliente', tone: 'bg-[#FBE7C6] text-[#6B4300] dark:bg-[#3A2A0A] dark:text-[#F2C27A]' },
  { id: 'agendado', name: 'Agendado', hint: 'data e hora', tone: 'bg-accent-soft text-link' },
  { id: 'publicado', name: 'Publicado', hint: 'e a métrica depois', tone: 'bg-ok-bg text-ok' },
]
export const stageOf = (s: Status) => STAGES.find((x) => x.id === s) ?? STAGES[0]

// O mesmo catálogo do Rust (social.rs NETWORKS): limite da legenda de cada rede.
export const NETWORKS: { id: NetworkId; name: string; short: string; limit: number }[] = [
  { id: 'instagram', name: 'Instagram', short: 'IG', limit: 2200 },
  { id: 'linkedin', name: 'LinkedIn', short: 'IN', limit: 3000 },
  { id: 'tiktok', name: 'TikTok', short: 'TT', limit: 2200 },
  { id: 'facebook', name: 'Facebook', short: 'FB', limit: 63206 },
  { id: 'x', name: 'X', short: 'X', limit: 280 },
  { id: 'youtube', name: 'YouTube', short: 'YT', limit: 5000 },
]
export const METRICS: [keyof Metrics, string][] = [['alcance', 'Alcance'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['salvos', 'Salvos'], ['cliques', 'Cliques']]
export const blankPost = (scope: string, day?: string): Post => ({
  id: null, scope, title: '', caption: '', hashtags: '', networks: ['instagram'], status: day ? 'rascunho' : 'ideia',
  scheduledAt: day ? `${day}T09:00` : null, publishedAt: null, media: [], approvalNote: '', metrics: {},
})
export const fullCaption = (p: Post) => (p.hashtags.trim() ? `${p.caption.trim()}\n\n${p.hashtags.trim()}` : p.caption.trim())
