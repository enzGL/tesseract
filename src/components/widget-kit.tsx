// Peças comuns dos widgets do Início (núcleo e Pro): datas, carregar dado e linhas.
import { useEffect, useState, type ReactNode } from 'react'

export const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => iso(new Date())
export const plus = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d) }
export const monthFrom = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)) }
export const monthTo = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }
export const weekStart = () => { const t = today(); const d = new Date(`${t}T12:00:00`); return plus(t, -((d.getDay() + 6) % 7)) }
export const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: boolean } {
  const [st, setSt] = useState<{ data: T | null; error: boolean }>({ data: null, error: false })
  useEffect(() => {
    let alive = true
    fn().then((data) => alive && setSt({ data, error: false })).catch(() => alive && setSt({ data: null, error: true }))
    return () => { alive = false }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return st
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-snug text-muted">{children}</p>
export const Big = ({ children }: { children: ReactNode }) => <span className="font-serif text-[24px] leading-none tracking-[-0.01em]">{children}</span>
export const Wait = () => <span className="text-[13px] text-faint">Carregando…</span>
export const Fail = () => <Empty>Não deu para ler agora.</Empty>

export function Rows({ children }: { children: ReactNode }) { return <ul className="flex min-h-0 flex-col divide-y divide-line overflow-hidden">{children}</ul> }
export function Row({ left, mid, right }: { left?: ReactNode; mid: ReactNode; right?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5 text-[13px]">
      {left !== undefined && <span className="w-11 shrink-0 font-mono text-[12px] text-muted">{left}</span>}
      <span className="min-w-0 flex-1 truncate">{mid}</span>
      {right !== undefined && <span className="shrink-0 text-[12px] text-muted">{right}</span>}
    </li>
  )
}
