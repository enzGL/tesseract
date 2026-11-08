import { useSyncExternalStore } from 'react'

// Aba Tutorial (fase 14). A fonte é uma só: os roteiros em docs/tutoriais/*.md, lidos no build.
// Mudou o roteiro, mudou a aba. O formato dos arquivos está em docs/tutoriais/README.md.

const RAW = import.meta.glob<string>('../../docs/tutoriais/*.md', { eager: true, query: '?raw', import: 'default' })

export type Step = { do: string; see: string; say: string }
export type Episode = {
  id: string; n: number; title: string; goal: string; screens: string; plan: string; time: string
  prepare: string; review: string; privacy: string; steps: Step[]; notes: string[]; tier: 'free' | 'pro' | 'mixed'; route: string | null
}
export type Stop = { label: string; route: string | null; eps: number[] }
export type Model = {
  id: string; name: string; who: string; art: number; title: string; forWhom: string; example: string[]
  episodes: Episode[]; config: string[]; mistakes: string[]; stops: Stop[]; minutes: number
}

// Ordem, nome curto, para quem é (uma linha) e a cena de cada trilha.
const META: { id: string; name: string; who: string; art: number }[] = [
  { id: 'primeiros-passos', name: 'Primeiros passos', who: 'Para todo mundo: instalar, montar o app, conhecimento, IA e backup', art: 5 },
  { id: 'freelancer', name: 'Freelancer', who: 'Vários clientes, quadro por cliente e propostas', art: 6 },
  { id: 'agencia', name: 'Agência', who: 'Clientes, sprints e posts com aprovação', art: 3 },
  { id: 'academia-clinica', name: 'Negócio local', who: 'Academia, clínica, estúdio: ICP, Maps e WhatsApp', art: 1 },
  { id: 'vendas-b2b', name: 'Vendas B2B', who: 'Prospecção ativa, bot de Vendas e campanhas', art: 1 },
  { id: 'vida-pessoal', name: 'Vida pessoal', who: 'GTD, Foco do dia e finanças pessoais', art: 5 },
  { id: 'produtor-conteudo', name: 'Conteúdo', who: 'Ideias, produção, marcas e calendário de posts', art: 3 },
  { id: 'consultor', name: 'Consultor', who: 'Cronograma, OKR e reuniões com o cliente', art: 4 },
]

// Nome da tela no roteiro → rota do app. A primeira que aparecer em "Telas" é a do episódio.
const SCREENS: [RegExp, string, string][] = [
  [/início|inicio|menu do seu jeito/i, '/', 'Início'],
  [/boas-vindas|cérebro|cerebro|conhecimento/i, '/cerebro', 'Conhecimento'],
  [/configurações|configuracoes|seletor de escopo/i, '/configuracoes', 'Configurações'],
  [/atalhos/i, '/atalhos', 'Atalhos'],
  [/projetos|gtd|foco do dia|eisenhower|backlog|sprint|morro|priorização|cronograma|okr/i, '/projetos', 'Projetos'],
  [/calendário|calendario/i, '/calendario', 'Calendário'],
  [/crm/i, '/crm', 'CRM e Funil'],
  [/prospecção|prospeccao/i, '/prospeccao', 'Prospecção'],
  [/contratos|documentos/i, '/contratos', 'Contratos'],
  [/finanças|financas/i, '/financas', 'Finanças'],
  [/campanhas/i, '/campanhas', 'Campanhas'],
  [/social/i, '/social', 'Social'],
  [/bots/i, '/bots', 'Bots'],
  [/chat/i, '/chat', 'Chat'],
]
function screenOf(screens: string): { route: string; label: string } | null {
  // a tela citada primeiro no texto ganha (não a primeira da lista acima)
  let best: { at: number; route: string; label: string } | null = null
  for (const [re, route, label] of SCREENS) {
    const m = re.exec(screens)
    if (m && (!best || m.index < best.at)) best = { at: m.index, route, label }
  }
  return best && { route: best.route, label: best.label }
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const field = (lines: string[], name: string) => {
  const l = lines.find((x) => x.startsWith(`- **${name}:**`))
  return l ? l.slice(`- **${name}:**`.length).trim() : ''
}
const minutesOf = (t: string) => {
  const m = /(\d+)\s*min(?:\s*(\d+)\s*s)?/.exec(t) ?? /(\d+)\s*a\s*\d+\s*min/.exec(t)
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0) : 0
}
const bullets = (block: string) => block.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim())

function section(md: string, title: RegExp) {
  const parts = md.split(/\n(?=## )/)
  const p = parts.find((x) => title.test(x.split('\n')[0]))
  return p ? p.split('\n').slice(1).join('\n').trim() : ''
}

function parseEpisodes(block: string, modelId: string): Episode[] {
  return block.split(/\n(?=### )/).filter((b) => /^### Ep\. \d+/.test(b.trim())).map((b) => {
    const lines = b.trim().split('\n')
    const head = /^### Ep\. (\d+): (.+)$/.exec(lines[0].trim())!
    const n = Number(head[1])
    const rows = lines.filter((l) => /^\|\s*\d+\s*\|/.test(l)).map(cells)
    const steps = rows.map((c) => ({ do: c[1] ?? '', see: c[2] ?? '', say: (c[3] ?? '').replace(/^"|"$/g, '') }))
    // texto solto fora das listas e da tabela (ex.: variações, como gravar a terceira opção)
    const notes = lines.slice(1).filter((l) => l.trim() && !l.startsWith('- ') && !l.startsWith('|')).map((l) => l.trim())
    const screens = field(lines, 'Telas'), plan = field(lines, 'Plano')
    return {
      id: `${modelId}-${n}`, n, title: head[2].trim(), goal: field(lines, 'Objetivo'), screens, plan,
      time: field(lines, 'Duração estimada').replace(/\.$/, ''), prepare: field(lines, 'Preparar antes'),
      review: field(lines, 'Revisar antes de gravar'), privacy: field(lines, 'Privacidade'),
      steps, notes, tier: /^\*\*Pro\*\*/.test(plan) ? 'pro' : /Pro\b/.test(plan) ? 'mixed' : 'free', route: screenOf(screens)?.route ?? null,
    }
  })
}

// Mapa da operação (direção C): as telas na ordem em que a trilha passa por elas.
function stopsOf(eps: Episode[]): Stop[] {
  const out: Stop[] = []
  for (const e of eps) {
    const s = screenOf(e.screens)
    const label = s?.label ?? 'Fora do app'
    const prev = out[out.length - 1]
    if (prev && prev.label === label) prev.eps.push(e.n)
    else {
      const seen = out.find((x) => x.label === label)
      if (seen) seen.eps.push(e.n)
      else out.push({ label, route: s?.route ?? null, eps: [e.n] })
    }
  }
  return out
}

function parse(id: string, md: string, meta: (typeof META)[number]): Model {
  const title = (/^# (.+)$/m.exec(md)?.[1] ?? meta.name).trim()
  const forWhom = section(md, /^## Para quem é/).split('\n\n')[0]?.trim() ?? ''
  const example = bullets(section(md, /^## A (empresa|pessoa) fictícia/))
  const episodes = parseEpisodes(section(md, /^## Episódios/), id)
  return {
    ...meta, title, forWhom, example, episodes,
    config: bullets(section(md, /^## Configuração recomendada/)), mistakes: bullets(section(md, /^## Erros comuns/)),
    stops: stopsOf(episodes), minutes: Math.round(episodes.reduce((s, e) => s + minutesOf(e.time), 0)),
  }
}

export const MODELS: Model[] = META.flatMap((m) => {
  const key = Object.keys(RAW).find((k) => k.endsWith(`/${m.id}.md`))
  return key ? [parse(m.id, RAW[key].replace(/\r\n/g, '\n'), m)] : []
})
export const modelById = (id: string | null | undefined) => MODELS.find((m) => m.id === id)
// Só tem guia o episódio que acontece numa tela do app e tem passos.
export const hasGuide = (e: Episode) => !!e.route && e.steps.length > 0
// Próximo episódio do modelo depois de `n` (o primeiro ainda não feito, se houver).
export const nextEpisode = (m: Model, n: number, done: string[]) =>
  m.episodes.find((e) => e.n > n && !done.includes(e.id)) ?? m.episodes.find((e) => e.n > n) ?? null

export const episodeById = (id: string | null | undefined) => {
  for (const m of MODELS) { const e = m.episodes.find((x) => x.id === id); if (e) return { model: m, episode: e } }
  return null
}

// Progresso e guia em andamento: ficam neste computador (como o roteiro de teste).
type State = { done: string[]; model: string; guide: { ep: string; step: number; min: boolean } | null }
const KEY = 'tesseract.tutorial'
let state: State = (() => {
  try { return { done: [], model: 'primeiros-passos', guide: null, ...JSON.parse(localStorage.getItem(KEY) || '{}') } }
  catch { return { done: [], model: 'primeiros-passos', guide: null } }
})()
const subs = new Set<() => void>()
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* sem armazenamento */ }
  subs.forEach((f) => f())
}
export function useTutorial() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}
export const tutorial = {
  pick: (model: string) => set({ model }),
  toggleDone: (ep: string) => set({ done: state.done.includes(ep) ? state.done.filter((x) => x !== ep) : [...state.done, ep] }),
  markDone: (ep: string) => !state.done.includes(ep) && set({ done: [...state.done, ep] }),
  start: (ep: string) => set({ guide: { ep, step: 0, min: false } }),
  step: (step: number) => state.guide && set({ guide: { ...state.guide, step } }),
  minimize: (min: boolean) => state.guide && set({ guide: { ...state.guide, min } }),
  stop: () => set({ guide: null }),
  finish: () => state.guide && set({ done: state.done.includes(state.guide.ep) ? state.done : [...state.done, state.guide.ep], guide: null }),
}
