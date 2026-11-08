import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { call, inBrowser, message, useScopes, type Project } from '../data/api'
import { inboxProject, parse, saveCapture, type Kind } from '../data/capture'
import type { Company } from '../data/crm'
import { DEFAULT_PREFS, todayIso, type PrefsState } from '../data/extras'
import '../data/crm' // substituto do navegador do CRM

// Captura rápida (fase 8.5). Janela pequena que abre com Ctrl+Shift+Espaço de qualquer
// programa: escreva a frase, o app entende data, hora, cliente e etiquetas e mostra para onde vai. Enter guarda.

const field = 'h-9 w-full rounded-lg border border-line-strong bg-raised px-2.5 text-[13px] outline-none focus:border-accent'
const KINDS: [Kind, string][] = [['inbox', 'Caixa de entrada (GTD)'], ['tarefa', 'Tarefa em projeto'], ['followup', 'Follow-up no CRM']]

export function Capture() {
  const scopes = useScopes()
  const [text, setText] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [over, setOver] = useState<{ kind?: Kind; projectId?: number; companyId?: number; date?: string; time?: string }>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  const load = async () => {
    const [ps, prefs] = await Promise.all([call<Project[]>('projects_list').catch(() => []), call<PrefsState>('extras_prefs').catch(() => ({ prefs: DEFAULT_PREFS }) as PrefsState)])
    setProjects(ps); setChosen(prefs.prefs.captureProject ?? null)
    setCompanies((await Promise.all(scopes.map((s) => call<Company[]>('crm_companies', { scope: s.id }).catch(() => [] as Company[])))).flat())
  }
  const reset = () => { setText(''); setOver({}); setDone(null); setError(null); void load(); requestAnimationFrame(() => ref.current?.focus()) }
  useEffect(() => { reset() }, [scopes.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // a janela fica escondida entre um uso e outro: ao voltar, recarrega projetos e clientes
  useEffect(() => { const f = () => { void load() }; window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [scopes.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (inBrowser) return
    let off: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) => listen('captura-abrir', () => reset()).then((u) => { off = u }))
    return () => off?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const p = useMemo(() => parse(text, companies), [text, companies])
  const kind = over.kind ?? p.kind
  const inbox = inboxProject(projects, chosen)
  const projectId = over.projectId ?? inbox?.id ?? null
  const companyId = over.companyId ?? p.company?.id ?? null
  const date = over.date ?? p.date ?? ''
  const time = over.time ?? p.time ?? ''
  const open = projects.filter((x) => !x.archived)

  const hide = async () => {
    if (inBrowser) return reset()
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().hide()
  }
  const save = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      setDone(await saveCapture({ kind, projectId, companyId, date, time, title: p.title, tags: p.tags }, projects, companies, todayIso()))
      setTimeout(() => { void hide().then(reset) }, 900)
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); void hide() }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save() }
  }

  return (
    <div className="h-screen bg-panel" onKeyDown={onKey}>
      <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_240px] overflow-hidden border border-line-strong bg-panel">
        <div className="flex min-w-0 flex-col gap-2.5 p-4" data-tauri-drag-region>
          <span className="font-mono text-[10.5px] tracking-[0.16em] text-link" data-tauri-drag-region>CAPTURA RÁPIDA</span>
          <label className="flex-1"><span className="sr-only">O que você quer guardar</span>
            <textarea ref={ref} autoFocus value={text} onChange={(e) => { setText(e.target.value); setDone(null); setError(null) }} rows={4}
              placeholder="Ex.: mandar proposta pra Barbearia do Dom sexta 15h #vendas"
              className="h-full w-full resize-none bg-transparent font-serif text-[17px] leading-relaxed text-fg outline-none placeholder:text-faint" /></label>
          <div className="flex min-h-[26px] flex-wrap gap-1.5">{p.chips.map((c) => <span key={c} className="inline-flex h-[26px] items-center rounded-full bg-accent-soft px-2.5 text-[12px] font-semibold text-link">{c}</span>)}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={busy || !text.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13.5px] font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50">{done ? <><Check size={15} />Guardado</> : 'Guardar · Enter'}</button>
            <button type="button" onClick={() => void hide()} className="h-9 rounded-lg border border-line-strong px-3 text-[13px] text-muted hover:text-fg">Esc</button>
            <span className={`min-w-0 flex-1 truncate text-[12.5px] ${error ? 'text-[#B3261E] dark:text-[#FF8A80]' : 'text-ok'}`} role={error ? 'alert' : 'status'}>{error ?? done ?? ''}</span>
          </div>
        </div>
        <aside aria-label="Para onde vai" className="flex flex-col gap-2.5 border-l border-line bg-raised/60 p-3.5 text-[12.5px]">
          <span className="font-semibold text-muted">Para onde vai</span>
          <label className="flex flex-col gap-1 text-muted">Tipo
            <select value={kind} onChange={(e) => setOver({ ...over, kind: e.target.value as Kind })} className={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {kind === 'followup'
            ? <label className="flex flex-col gap-1 text-muted">Cliente
                <select value={companyId ?? ''} onChange={(e) => setOver({ ...over, companyId: +e.target.value })} className={field}><option value="">Escolha…</option>{companies.map((c) => <option key={c.id} value={c.id!}>{c.name}</option>)}</select></label>
            : <label className="flex flex-col gap-1 text-muted">Projeto
                <select value={projectId ?? ''} onChange={(e) => setOver({ ...over, projectId: +e.target.value })} className={field}><option value="">Escolha…</option>{open.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
          <label className="flex flex-col gap-1 text-muted">Quando
            <span className="grid grid-cols-[minmax(0,1fr)_76px] gap-1.5"><input type="date" value={date} onChange={(e) => setOver({ ...over, date: e.target.value })} className={`${field} min-w-0 !px-1.5`} /><input type="time" value={time} onChange={(e) => setOver({ ...over, time: e.target.value })} className={`${field} min-w-0 !px-1.5 [&::-webkit-calendar-picker-indicator]:hidden`} /></span></label>
          <span className="mt-auto leading-snug text-faint">Entendo data, hora, #etiqueta e o nome do cliente. Sem nada disso, vai para a caixa de entrada.</span>
        </aside>
      </div>
    </div>
  )
}
