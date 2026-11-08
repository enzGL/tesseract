// Horas e faturamento (fase 12): tipos, o cronômetro compartilhado (barra lateral, atalho e a tela) e o
// substituto do navegador com as mesmas regras do hours.rs.
// Tipos e chamadas do módulo Pro; a tela e o Rust ficam no repositório privado (pro/ui/pages/Hours.tsx e pro/rust/hours.rs; a migração 0024).
import { useSyncExternalStore } from 'react'
import { call } from './api'

export type Entry = {
  id: number | null; scope: string; companyId: number | null; projectId: number | null; taskId: number | null
  title: string; day: string; start: string | null; minutes: number; billable: boolean; rate: number | null
  // só leitura
  runningSince?: string | null; source?: 'timer' | 'manual'; company?: string | null; project?: string | null; task?: string | null
  documentId?: number | null; document?: string | null; billed?: boolean
}
export type Rate = { id: number; name: string; rate: number | null }
export type Rates = { companies: Rate[]; projects: Rate[] }

// ---------- datas e formatos ----------
const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const nowLocal = (d = new Date()) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
export const today = () => iso(new Date())
export const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d) }
/** segunda-feira da semana do dia */
export const weekStart = (s: string) => { const d = new Date(`${s}T12:00:00`); return addDays(s, -((d.getDay() + 6) % 7)) }
export const hm = (min: number) => `${Math.floor(min / 60)}h ${pad(min % 60)}`
export const clock = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`
export const stopwatch = (sec: number) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`
/** "1:30", "1h30", "1,5", "90m" -> minutos; null se não entender. Vazio = 0. */
export function parseDuration(s: string): number | null {
  const x = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!x || x === '-' || x === '–') return 0
  let m = x.match(/^(\d{1,2})[:h](\d{1,2})?(min|m)?$/)
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0)
  m = x.match(/^(\d{1,4})(min|m)$/)
  if (m) return Number(m[1])
  m = x.match(/^(\d{1,2})([.,]\d{1,2})?h?$/)
  if (m) return Math.round(parseFloat(`${m[1]}${(m[2] ?? '').replace(',', '.')}`) * 60)
  return null
}
/** valor de um registro em centavos (não cobrável = 0) */
export const value = (e: Pick<Entry, 'minutes' | 'rate' | 'billable'>) => (e.billable ? Math.round((e.minutes * (e.rate ?? 0)) / 60) : 0)
/** segundos desde que o cronômetro começou */
export const elapsed = (since: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))

// ---------- cronômetro compartilhado ----------
let running: Entry | null = null
let loaded = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
export const TIMER_EVENT = 'tesseract:timer-changed'
/** pede à tela de Horas para pôr o foco no campo do cronômetro */
export const TIMER_FOCUS = 'tesseract:timer-focus'
async function refresh() {
  try { running = await call<Entry | null>('hours_running') } catch { running = null }
  loaded = true; emit(); window.dispatchEvent(new Event(TIMER_EVENT))
}
export function useRunning(): Entry | null {
  if (!loaded) { loaded = true; void refresh() }
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => running)
}
export async function startTimer(e: Entry) { await call('hours_start', { entry: e, now: nowLocal() }); await refresh() }
export async function stopTimer() { const r = await call<Entry | null>('hours_stop', { now: nowLocal() }); await refresh(); return r }
export const reloadTimer = refresh
