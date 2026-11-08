// Backup criptografado na pasta da nuvem (fase 12, item 17). Desenho: a sugestão, com o cartão em
// Configurações (A), o assistente de 4 passos na primeira vez (B) e as versões em linha do tempo com "o que mudou" (C).
// A criptografia e os arquivos ficam no Rust (cloud.rs); aqui, tipos, textos e o substituto do navegador.
import { useEffect, useState } from 'react'
import { call } from './api'

export type Status = {
  configured: boolean; keyHere: boolean; enabled: boolean; folder: string; folderOk: boolean; everyHours: number; onClose: boolean
  passwordAt: string; lastAt: string; lastFile: string; lastError: string; device: string
  /** versão aberta só para consultar agora ('' = nenhuma) */
  peekAt: string
}
export type Meta = { at: string; device: string; schema: number; bytes: number; hash: string; projects: number; openTasks: number; doneTasks: number; companies: number; documents: number; transactions: number; hoursMin: number }
export type Version = { file: string; bytes: number; ownSet: boolean; meta: Meta | null }
export type Place = { name: string; path: string }
export const EVERY: [number, string][] = [[1, 'A cada hora'], [4, 'A cada 4 horas'], [24, 'Uma vez por dia']]
export const MIN_PASSWORD = 10

// ---------- abrir uma versão só para consultar (peek.rs) ----------
export type PeekKind = 'projects' | 'tasks' | 'companies' | 'documents' | 'transactions'
export type PeekFilter = 'all' | 'deleted' | 'changed'
export type PeekTab = { kind: PeekKind; total: number; deleted: number; changed: number }
export type Peek = { token: string; file: string; at: string; device: string; tabs: PeekTab[] }
export type PeekItem = { id: number; title: string; sub: string; body: string; state: 'same' | 'changed' | 'deleted'; now: { title: string; sub: string; body: string } | null; canBring: boolean }
export const PEEK_TABS: [PeekKind, string][] = [['projects', 'Projetos'], ['tasks', 'Tarefas'], ['companies', 'Clientes'], ['documents', 'Documentos'], ['transactions', 'Lançamentos']]
export const BROUGHT: Record<PeekKind, string> = {
  projects: '', documents: '',
  tasks: 'Tarefa de volta no projeto.',
  companies: 'Cliente de volta no CRM, com os contatos.',
  transactions: 'Lançamento de volta em Finanças.',
}
/** Texto para "Copiar texto": título, linha de detalhes e o conteúdo. */
export const peekText = (i: { title: string; sub: string; body: string }) => [i.title, i.sub, i.body].filter(Boolean).join('\n\n')

const local = (s: string) => new Date(s.length === 19 ? s : `${s}T00:00:00`)
/** "há 2 h", "há 5 min", "ontem" — para o status. */
export function ago(at: string, now = new Date()): string {
  if (!at) return 'nunca'
  const m = Math.max(0, Math.round((now.getTime() - local(at).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 48 * 60) return `há ${Math.round(m / 60)} h`
  return `há ${Math.round(m / 1440)} dias`
}
/** "Hoje, 14:02", "Ontem, 18:40", "26/10, 09:15". */
export function when(at: string, now = new Date()): string {
  const d = local(at), hm = at.slice(11, 16)
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (day(d) === day(now)) return `Hoje, ${hm}`
  if (day(d) === day(y)) return `Ontem, ${hm}`
  return `${at.slice(8, 10)}/${at.slice(5, 7)}${d.getFullYear() !== now.getFullYear() ? `/${at.slice(0, 4)}` : ''}, ${hm}`
}
export const mb = (b: number) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
/** Atrasado: passou mais de 2 intervalos sem backup, ou o último deu erro. */
export const late = (s: Status, now = new Date()) => s.enabled && (!!s.lastError || !s.lastAt || now.getTime() - local(s.lastAt).getTime() > s.everyHours * 2 * 3600e3)

/** "O que mudou" de uma versão para a anterior (mais antiga) do mesmo conjunto. */
export function changes(cur: Meta, prev: Meta | null | undefined): string {
  if (!prev) return 'primeira versão'
  const parts: string[] = []
  const d = (n: number, one: string, many: string) => { if (n > 0) parts.push(`+${n} ${n === 1 ? one : many}`); if (n < 0) parts.push(`${n} ${n === -1 ? one : many}`) }
  d(cur.projects - prev.projects, 'projeto', 'projetos')
  d(cur.companies - prev.companies, 'cliente no CRM', 'clientes no CRM')
  d(cur.documents - prev.documents, 'documento', 'documentos')
  d(cur.transactions - prev.transactions, 'lançamento', 'lançamentos')
  const done = cur.doneTasks - prev.doneTasks, open = cur.openTasks - prev.openTasks
  if (done > 0) parts.push(`${done} ${done === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`)
  if (open + done > 0) parts.push(`+${open + done} ${open + done === 1 ? 'tarefa' : 'tarefas'}`)
  const h = cur.hoursMin - prev.hoursMin
  if (h > 0) parts.push(`${Math.floor(h / 60)}h${String(h % 60).padStart(2, '0')} em Horas`)
  return parts.length ? parts.join(', ') : 'sem mudanças grandes'
}

/** Status do backup para a barra lateral, relido a cada minuto. */
export function useCloudStatus() {
  const [s, setS] = useState<Status | null>(null)
  useEffect(() => {
    let off = false
    const load = () => call<Status>('cloud_status').then((x) => { if (!off) setS(x) }).catch(() => undefined)
    void load()
    const t = setInterval(load, 60000)
    const onChange = () => void load()
    window.addEventListener('tesseract:cloud', onChange)
    return () => { off = true; clearInterval(t); window.removeEventListener('tesseract:cloud', onChange) }
  }, [])
  return s
}
export const cloudChanged = () => window.dispatchEvent(new Event('tesseract:cloud'))
