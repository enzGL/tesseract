// Trava do app (segurança do beta): estado compartilhado, chamadas ao Rust (src-tauri/src/security.rs)
// e o substituto do navegador. Desenho: a sugestão (trava da A, assistente da B, cartão da C).
import { useSyncExternalStore } from 'react'
import { call, inBrowser, registerMock } from './api'

export type Stage = 'senha' | 'segundo'
export type LogItem = { at: number; what: string; how: string }
export type SecStatus = {
  enabled: boolean; locked: boolean; stage: Stage; totp: boolean; hello: boolean; helloAvailable: boolean
  idleMin: number | null; lockWithWindows: boolean; codesLeft: number; waitSecs: number; log: LogItem[]
}
export type TotpNew = { secret: string; uri: string }

export const IDLE_OPTIONS: { min: number | null; label: string }[] = [
  { min: 5, label: '5 min' }, { min: 15, label: '15 min' }, { min: 60, label: '1 hora' }, { min: null, label: 'Só ao abrir' },
]
export const MIN_PASSWORD = 8

// ---------- estado compartilhado ----------
let status: SecStatus | null = null
const subs = new Set<() => void>()
const set = (s: SecStatus) => { status = s; subs.forEach((f) => f()) }
export const useSecurity = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => status)

export async function refresh(): Promise<SecStatus> { const s = await call<SecStatus>('sec_status'); set(s); return s }
/** Chamada que devolve o status novo (destravar, travar, preferências): já atualiza quem está olhando. */
export async function act(cmd: string, args: Record<string, unknown> = {}): Promise<SecStatus> { const s = await call<SecStatus>(cmd, args); set(s); return s }
export const lockNow = (reason: 'atalho' | 'parado' | 'botao' = 'botao') => act('sec_lock', { reason })

export const ago = (at: number) => {
  const d = new Date(at * 1000), today = new Date()
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `hoje ${hm}`
  const y = new Date(today); y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `ontem ${hm}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`
}

// ---------- substituto do navegador (sem criptografia de verdade: só para navegar nas telas) ----------
if (inBrowser) {
  type Mem = { cfg: Omit<SecStatus, 'locked' | 'stage' | 'helloAvailable' | 'waitSecs' | 'codesLeft'> & { pw: string; codes: string[] }; locked: boolean; stage: Stage; pending: { pw?: string; totp?: boolean; hello?: boolean; codes?: string[] } }
  const m: Mem = { cfg: { enabled: false, totp: false, hello: false, idleMin: 15, lockWithWindows: true, log: [], pw: '', codes: [] }, locked: false, stage: 'senha', pending: {} }
  const now = () => Math.floor(Date.now() / 1000)
  const log = (what: string, how = '') => { m.cfg.log = [{ at: now(), what, how }, ...m.cfg.log].slice(0, 30) }
  const st = (): SecStatus => ({ ...m.cfg, locked: m.locked, stage: m.stage, helloAvailable: true, waitSecs: 0, codesLeft: m.cfg.codes.filter(Boolean).length, log: m.locked ? [] : m.cfg.log })
  const fail = (t: string): never => { log('Tentativa errada', t); throw new Error(`${t} não confere`) }
  const codes = () => Array.from({ length: 10 }, () => { const s = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, 'X'); return `${s.slice(0, 4)}-${s.slice(4, 8)}` })
  const unlock = (how: string) => { m.locked = false; m.stage = 'senha'; log('Destravado', how); return st() }
  // no navegador, o código do "app autenticador" é sempre 123456
  registerMock({
    sec_status: () => st(),
    sec_setup_password: (a) => { if (String(a.password).length < MIN_PASSWORD) throw new Error('a senha precisa de pelo menos 8 caracteres'); m.pending = { pw: String(a.password) } },
    sec_totp_new: (a) => ({ secret: 'JBSWY3DPEHPK3PXP', uri: `otpauth://totp/Tesseract:${encodeURIComponent(String(a.name || 'Tesseract'))}?secret=JBSWY3DPEHPK3PXP&issuer=Tesseract` }),
    sec_totp_check: (a) => { m.pending.totp = String(a.code).replace(/\D/g, '') === '123456'; return m.pending.totp },
    sec_hello_check: () => { m.pending.hello = true; return true },
    sec_codes_new: () => { m.pending.codes = codes(); return m.pending.codes },
    sec_setup_finish: (a) => {
      const second = m.pending.totp || m.pending.hello
      if (second && String(a.confirm).toUpperCase().replace(/[^A-Z0-9]/g, '') !== (m.pending.codes?.[3] ?? '').replace('-', '')) throw new Error('o 4º código não confere: confira o que você guardou')
      m.cfg = { ...m.cfg, enabled: true, pw: m.pending.pw ?? '', totp: !!m.pending.totp, hello: !!m.pending.hello, codes: second ? [...(m.pending.codes ?? [])] : [], idleMin: (a.idleMin as number | null) ?? 15 }
      log('Segurança ligada'); m.pending = {}; return st()
    },
    sec_setup_cancel: () => { m.pending = {} },
    sec_unlock_password: (a) => { if (a.password !== m.cfg.pw) fail('Senha'); if (m.cfg.totp || m.cfg.hello) { m.stage = 'segundo'; return st() } return unlock('senha') },
    sec_unlock_code: (a) => (String(a.code).replace(/\D/g, '') === '123456' ? unlock('senha + app autenticador') : fail('Código')),
    sec_unlock_recovery: (a) => { const c = String(a.code).toUpperCase().trim(); const k = m.cfg.codes.indexOf(c); if (k < 0) fail('Código de recuperação'); m.cfg.codes[k] = ''; return unlock('senha + código de recuperação') },
    sec_unlock_hello: () => unlock('senha + Windows Hello'),
    sec_lock: (a) => { if (!m.cfg.enabled) throw new Error('ligue a segurança em Configurações para poder travar'); if (!m.locked) log('Travado', a.reason === 'parado' ? `${m.cfg.idleMin} min parado` : 'Travar agora'); m.locked = true; m.stage = 'senha'; return st() },
    sec_back: () => { m.stage = 'senha' },
    sec_prefs: (a) => { m.cfg.idleMin = (a.idleMin as number | null) ?? null; m.cfg.lockWithWindows = !!a.lockWithWindows; return st() },
    sec_change_password: (a) => { if (a.old !== m.cfg.pw) fail('Senha'); m.cfg.pw = String(a.new); log('Senha trocada') },
    sec_codes_regen: (a) => { if (a.password !== m.cfg.pw) fail('Senha'); m.cfg.codes = codes(); log('Códigos de recuperação novos'); return [...m.cfg.codes] },
    sec_totp_save: (a) => { if (a.password !== m.cfg.pw) fail('Senha'); if (String(a.code).replace(/\D/g, '') !== '123456') throw new Error('o código do app novo não confere'); m.cfg.totp = true; log('Celular trocado'); return st() },
    sec_hello_set: (a) => { if (a.password !== m.cfg.pw) fail('Senha'); m.cfg.hello = !!a.on; return st() },
    sec_disable: (a) => { if (a.password !== m.cfg.pw) fail('Senha'); m.cfg = { ...m.cfg, enabled: false, totp: false, hello: false, codes: [], pw: '' }; log('Segurança desligada'); return st() },
  })
}
