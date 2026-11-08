// Dois computadores (fase 12, item 18). Desenho: a sugestão, com o revezamento (A), as vagas e o
// pareamento por código (C) e o quadro "Os dois mexeram" (B) só quando os dois editaram sem passar a vez.
// A decisão, a junção e os arquivos da pasta ficam no Rust (sync.rs); aqui, tipos, textos e o substituto do navegador.
import { useEffect, useState } from 'react'
import { call } from './api'

export type Device = { id: string; name: string; pairedAt: string; isMe: boolean; hasTurn: boolean; open: boolean; heartbeat: number }
export type ConflictView = { index: number; table: string; what: string; title: string; diff: [string, string, string][]; localDeleted: boolean; remoteDeleted: boolean; chosen: 'local' | 'remote' }
export type SyncStatus = {
  available: boolean; enabled: boolean; folder: string; me: string; meName: string; openSince: string
  devices: Device[]; max: number; otherOpen: string | null
  lastAt: string; lastAction: string; lastError: string
  mergedAt: string; mergedFrom: string; mergedAuto: number; conflicts: ConflictView[]; behind: boolean
}
export type Outcome = { action: 'pull' | 'push' | 'merge' | 'nothing' | 'waiting' | 'removed' | 'off'; conflicts: number; mergedAuto: number; from: string }

const COLS: Record<string, string> = {
  name: 'Nome', title: 'Título', city: 'Cidade', phone: 'Telefone', email: 'E-mail', notes: 'Notas', description: 'Descrição',
  column_id: 'Coluna', priority: 'Prioridade', due: 'Prazo', due_date: 'Prazo', amount: 'Valor', value: 'Valor', status: 'Situação',
  stage: 'Estágio', segment: 'Segmento', site: 'Site', instagram: 'Instagram', minutes: 'Minutos', role: 'Cargo', category: 'Categoria',
}
export const colName = (c: string) => COLS[c] ?? c.replace(/_/g, ' ')

/** "agora", "há 5 min", "há 2 h", "há 3 dias", a partir de segundos desde 1970. */
export function seen(secs: number, now = Date.now()): string {
  if (!secs) return 'nunca'
  const m = Math.max(0, Math.round((now / 1000 - secs) / 60))
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 48 * 60) return `há ${Math.round(m / 60)} h`
  return `há ${Math.round(m / 1440)} dias`
}
export const pairedDay = (at: string) => (at ? `${at.slice(8, 10)}/${at.slice(5, 7)}` : '')

/** O que dizer depois de uma rodada. */
export function outcomeText(o: Outcome): string {
  switch (o.action) {
    case 'pull': return `Dados atualizados com a versão de ${o.from}.`
    case 'merge': return `Os dois mexeram: ${o.mergedAuto} ${o.mergedAuto === 1 ? 'mudança juntada' : 'mudanças juntadas'} sozinhas${o.conflicts ? ` e ${o.conflicts} no mesmo item para você ver` : ''}.`
    case 'push': return 'Gravado na pasta. O outro computador pega ao abrir.'
    case 'waiting': return 'Há mudanças aqui; elas vão para a pasta ao fechar ou em "Passar a vez agora".'
    case 'removed': return 'Este computador foi removido no outro. A sincronização foi desligada aqui.'
    case 'off': return 'Dois computadores está desligado.'
    default: return 'Em dia: nada novo na pasta.'
  }
}

/** Status para a barra lateral e o aviso de abertura, relido a cada minuto e quando o Rust avisa. */
export function useSyncStatus() {
  const [s, setS] = useState<SyncStatus | null>(null)
  useEffect(() => {
    let off = false
    const load = () => call<SyncStatus>('sync_status').then((x) => { if (!off) setS(x) }).catch(() => undefined)
    void load()
    const t = setInterval(load, 60000)
    window.addEventListener('tesseract:sync', load)
    return () => { off = true; clearInterval(t); window.removeEventListener('tesseract:sync', load) }
  }, [])
  return s
}
export const syncChanged = () => window.dispatchEvent(new Event('tesseract:sync'))
