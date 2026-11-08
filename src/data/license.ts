import { useSyncExternalStore } from 'react'
import { call, inBrowser, PRO_EVENT } from './api'

// Licença do Pro (src-tauri/src/license.rs). Guardada fora do banco, em licenca.json na pasta de dados.

export type LicenseStatus =
  | { plano: 'gratis' }
  | { plano: 'pro'; email: string; ciclo: 'mensal' | 'anual' | string; ate: number; dias: number }
  | { plano: 'leitura'; email: string; ate: number }
export type Problem = '' | 'rede' | 'assinatura' | 'cancelada' | 'liberada'
export type LicenseView = {
  status: LicenseStatus; deviceId: string; deviceName: string; online: boolean; lastOk: number; problem: Problem; ready: boolean
  /** Limites do Grátis valendo (build com chave e sem Pro em dia). Sem chave = beta, nada limitado. */
  limited: boolean
}
export type LicenseDevice = { id: string; nome: string; visto: number; isMe: boolean }
export type Verified = { kind: 'ok'; view: LicenseView } | { kind: 'vagas'; devices: LicenseDevice[] }
export type Devices = { devices: LicenseDevice[]; ativa: boolean; pagoAte: number }

const GRATIS: LicenseView = { status: { plano: 'gratis' }, deviceId: 'navegador', deviceName: 'Navegador', online: false, lastOk: 0, problem: '', ready: false, limited: false }

let view: LicenseView | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const set = (v: LicenseView) => { view = v; emit() }

const run = async <T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> => {
  if (inBrowser) throw new Error('A licença só funciona no app.')
  return call<T>(cmd, args)
}

export async function refreshLicense(): Promise<LicenseView> {
  const v = inBrowser ? GRATIS : await call<LicenseView>('license_status')
  set(v)
  return v
}
export function useLicense(): LicenseView | null {
  return useSyncExternalStore(
    (f) => { subs.add(f); if (!view) void refreshLicense().catch(() => set(GRATIS)); return () => subs.delete(f) },
    () => view,
  )
}
export const isPro = (v: LicenseView | null) => v?.status.plano === 'pro'

export const sendCode = (email: string) => run<void>('license_send_code', { email })
export async function verifyCode(email: string, code: string, release?: string): Promise<Verified> {
  const r = await run<Verified>('license_verify', { email, code, release: release ?? null })
  if (r.kind === 'ok') set(r.view)
  return r
}
export async function renewLicense() { const v = await run<LicenseView>('license_renew'); set(v); return v }
export const licenseDevices = () => run<Devices>('license_devices')
export const releaseDevice = (deviceId: string) => run<LicenseDevice[]>('license_release', { deviceId })
export async function pasteKey(token: string) { const v = await run<LicenseView>('license_paste', { token }); set(v); return v }
export async function logoutLicense() { const v = await run<LicenseView>('license_logout'); set(v); return v }
export const openCheckout = () => run<void>('license_open_checkout')

// Janela de ativação (B): qualquer tela abre com openActivation(); quem mostra é <ActivationHost/> no Shell.
let activation: { reason?: string } | null = null
const asubs = new Set<() => void>()
export function openActivation(reason?: string) { activation = { reason }; asubs.forEach((f) => f()) }
export function closeActivation() { activation = null; asubs.forEach((f) => f()) }
if (typeof window !== 'undefined') window.addEventListener(PRO_EVENT, (e) => openActivation((e as CustomEvent<string>).detail))
export const useActivation = () => useSyncExternalStore((f) => { asubs.add(f); return () => asubs.delete(f) }, () => activation)

export const day = (secs: number) => new Date(secs * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
export function seenAgo(secs: number): string {
  if (!secs) return 'nunca'
  const d = Math.floor((Date.now() / 1000 - secs) / 86_400)
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`
}
