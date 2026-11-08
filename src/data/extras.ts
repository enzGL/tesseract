// Fase 8.5 ("Ganhos rápidos"): tipos e substituto do navegador para exportar tudo, agenda .ics,
// LGPD no contato, preferências de notificação e trava da IA externa (src-tauri/src/extras.rs).
import { call, inBrowser, mockId, registerMock } from './api'

export type Prefs = {
  notify: boolean; notifyFollowups: boolean; notifyTasks: boolean; notifyBlocks: boolean; notifyMoney: boolean
  aiMonthlyLimit: number | null; aiAllowHosts: string[]
  /** projeto da caixa de entrada da captura rápida (null = o primeiro com GTD) */
  captureProject: number | null
}
export type PrefsState = { prefs: Prefs; aiMonth: string; aiUsed: number }
export type ExportReport = { folder: string; tables: number; rows: number; projects: number }
export const DEFAULT_PREFS: Prefs = { notify: true, notifyFollowups: true, notifyTasks: true, notifyBlocks: true, notifyMoney: true, aiMonthlyLimit: null, aiAllowHosts: [], captureProject: null }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => iso(new Date())

/** Janela "Salvar como" do sistema. No navegador não há arquivo: devolve null. */
export async function saveDialog(title: string, defaultPath: string, ext: string, name: string): Promise<string | null> {
  if (inBrowser) return `C:\\simulado\\${defaultPath}`
  const { save } = await import('@tauri-apps/plugin-dialog')
  return (await save({ title, defaultPath, filters: [{ name, extensions: [ext] }] })) ?? null
}
export async function folderDialog(title: string): Promise<string | null> {
  if (inBrowser) return 'C:\\simulado'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const r = await open({ directory: true, multiple: false, title })
  return typeof r === 'string' ? r : null
}

// ---------- substituto do navegador ----------
let prefs: Prefs = { ...DEFAULT_PREFS }
registerMock({
  extras_prefs: () => ({ prefs: { ...prefs }, aiMonth: todayIso().slice(0, 7), aiUsed: 0 }),
  extras_prefs_set: (a) => {
    const p = a.prefs as Prefs
    if (p.aiMonthlyLimit != null && !(p.aiMonthlyLimit >= 0)) throw new Error('limite de 0 a 1.000.000 chamadas por mês')
    prefs = { ...p, aiAllowHosts: p.aiAllowHosts.map((h) => h.trim().replace(/^https?:\/\//, '').split('/')[0].toLowerCase()).filter(Boolean) }
    return { ...prefs }
  },
  extras_export_all: () => ({ folder: `C:\\simulado\\tesseract-exportacao-${todayIso()}`, tables: 30, rows: mockId(), projects: 8 }),
  extras_ics_save: () => 12,
  extras_capture_open: () => { location.hash = '#/captura' },
  extras_company_export: () => undefined,
  extras_company_anonymize: async (a) => {
    // no navegador: o mesmo efeito na ficha, pelos comandos do CRM (o app de verdade limpa também contatos e histórico)
    const cos = await call<{ id: number }[]>('crm_companies', { scope: a.scope })
    const co = cos.find((c) => c.id === a.id)
    if (co) await call('crm_company_save', { company: { ...co, name: `Anonimizado ${a.id}`, segment: '', city: '', site: '', instagram: '', phone: '', notes: '', legalBasis: 'Anonimizado a pedido', notePath: null } })
  },
})
