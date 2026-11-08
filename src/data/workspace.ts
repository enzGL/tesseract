import example from './seed.example.json'

export type SeedOrg = { id: string; name: string; projects: string[] }
export type Workspace = { owner: string; orgs: SeedOrg[] }

// Seed da primeira execução, só em desenvolvimento: dados reais em seed.local.json (fora do git) ou o
// exemplo fictício. O build de distribuição não leva seed nenhum: uma instalação nova começa vazia e
// a pessoa monta o próprio espaço (assistente do segundo cérebro, fase 2.5).
// Depois do primeiro boot as organizações vivem no banco (src/data/api.ts) e são editadas em Configurações.
const local = import.meta.env.DEV ? import.meta.glob<{ default: Workspace }>('./seed.local.json', { eager: true }) : {}
const EMPTY: Workspace = { owner: '', orgs: [] }
export const workspace: Workspace = import.meta.env.DEV ? (Object.values(local)[0]?.default ?? (example as Workspace)) : EMPTY
