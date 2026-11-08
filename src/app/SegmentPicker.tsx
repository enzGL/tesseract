// "O que você faz?":
// escolher o segmento mostra ao vivo o menu, o quadro, os widgets e a prospecção; "Montar" aplica.
import { useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { message, setSetting, useStore } from '../data/api'
import { ALL_MODULES } from './nav'
import { ALL_SEGMENT, SEGMENTS, applySegment, menuFor, widgetDef, type Prospect, type Segment, type SegmentId } from '../data/layout'
import { Logo } from './theme'

export const PREV_SEGMENT = 'tesseract.segment.prev'

const pill = (i: number, n: number) =>
  i === 0 ? 'bg-raised text-muted' : i === n - 1 ? 'bg-ok-bg text-ok' : 'bg-[#FBE7A6] text-[#6B4E00] dark:bg-[#4A3A06] dark:text-[#F5D46B]'
const PROSPECT: Record<Prospect, [string, string]> = {
  ligada: ['Ligada', 'bg-ok-bg text-ok'],
  desligada: ['Desligada', 'bg-raised text-muted'],
  opcional: ['Opcional', 'bg-[#FBE7A6] text-[#6B4E00] dark:bg-[#4A3A06] dark:text-[#F5D46B]'],
}

function Preview({ seg }: { seg: Segment }) {
  const menu = menuFor(seg)
  const hidden = new Set(menu.hidden)
  const shown = menu.sections.flatMap((s) => s.items).filter((p) => !hidden.has(p))
  const mods = shown.map((p) => ALL_MODULES.find((m) => m.path === p)!).filter(Boolean)
  const [pLabel, pTone] = PROSPECT[seg.prospect]
  return (
    <section aria-label={`Prévia para ${seg.short}`} aria-live="polite" className="flex min-w-0 flex-[1.25_1_520px] flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[20px]">Assim fica para {seg.short}</h2>
        <span className="text-[12.5px] text-muted">{mods.length} módulos no menu · {hidden.size} guardados em Mais módulos</span>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-[180px] flex-[0_1_210px] flex-col gap-0.5 rounded-xl border border-line bg-bg p-3">
          <span className="px-1.5 pb-1.5 font-mono text-[10px] tracking-[0.18em] text-muted">SEU MENU</span>
          {mods.map((m) => (
            <span key={m.path} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px]">
              <m.icon size={15} strokeWidth={1.7} className="shrink-0 text-accent dark:text-link" />{seg.names[m.path] ?? m.label}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
            <div className="flex justify-between gap-2"><b className="text-[14px] font-semibold">Quadro · {seg.board}</b><span className="text-[12px] text-muted">colunas editáveis</span></div>
            <div className="flex flex-wrap gap-1.5">
              {seg.columns.map((c, i) => <span key={c} className={`rounded-full px-2.5 py-1 text-[12px] ${pill(i, seg.columns.length)}`}>{c}</span>)}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-4">
            <b className="text-[14px] font-semibold">No seu Início</b>
            <div className="grid grid-cols-2 gap-2">
              {seg.widgets.map((w) => <span key={w} className="rounded-lg border border-line-strong bg-raised px-2.5 py-2 text-[12.5px]">{widgetDef(w)?.name}</span>)}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pTone}`}>{pLabel}</span>
            <div><b className="text-[14px] font-semibold">Prospecção</b><p className="mt-1 text-[12.5px] leading-snug text-muted">{seg.prospectText}</p></div>
          </div>
          <p className="px-0.5 text-[12.5px] leading-snug text-muted">{seg.extra}</p>
        </div>
      </div>
    </section>
  )
}

export function SegmentPicker({ onKeep }: { onKeep: () => void }) {
  const { settings } = useStore()
  const [sel, setSel] = useState<SegmentId>('sites')
  const [board, setBoard] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seg = SEGMENTS.find((s) => s.id === sel)!
  const prev = (() => { try { return localStorage.getItem(PREV_SEGMENT) } catch { return null } })()
  const customized = !!settings['ui.menu'] || !!settings['ui.home']

  const keep = () => {
    if (!prev) return onKeep()
    try { localStorage.removeItem(PREV_SEGMENT) } catch { /* sem armazenamento */ }
    void setSetting('ui.segment', prev)
  }
  const go = async () => {
    setBusy(true); setError(null)
    try { await applySegment(seg, { board }); try { localStorage.removeItem(PREV_SEGMENT) } catch { /* sem armazenamento */ } }
    catch (e) { setError(message(e)); setBusy(false) }
  }

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-bg text-fg">
      <div className="flex flex-wrap items-center justify-between gap-3 px-8 pt-6">
        <span className="flex items-center gap-2.5"><Logo className="size-8" /><span className="font-serif text-[18px] text-accent dark:text-link">Tesseract</span></span>
        <span className="font-mono text-[11px] tracking-[0.16em] text-muted">SEU NEGÓCIO</span>
        <button type="button" onClick={keep} className="text-[13.5px] text-link hover:text-fg">{prev ? 'Cancelar e manter o atual' : 'Pular e manter tudo como está'}</button>
      </div>

      <div className="flex flex-1 flex-wrap items-start gap-6 px-8 py-6">
        <section className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
          <div>
            <h1 className="anim-rise font-serif text-[36px] leading-[1.15]">O que você <em className="text-accent dark:text-link">faz</em>?</h1>
            <p className="anim-rise mt-2 max-w-[520px] text-[15px] leading-relaxed text-muted">Escolha o mais perto do seu dia a dia. O Tesseract monta o menu, o quadro e o Início, e depois tudo dá para mudar.</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5" role="radiogroup" aria-label="Segmento">
            {SEGMENTS.map((s) => {
              const on = s.id === sel
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setSel(s.id)}
                  className={`anim-rise flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:border-line-strong'}`}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-[9px] ${on ? 'bg-accent text-on-accent' : 'bg-raised text-accent dark:text-link'}`}><s.icon size={18} strokeWidth={1.7} /></span>
                  <span className="flex min-w-0 flex-col gap-0.5"><b className="text-[14.5px] font-semibold">{s.name}</b><span className="text-[12.5px] leading-snug text-muted">{s.about}</span></span>
                </button>
              )
            })}
            <button type="button" onClick={onKeep} className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong p-3.5 text-left text-muted hover:text-fg">
              <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-raised"><ALL_SEGMENT.icon size={18} strokeWidth={1.7} /></span>
              <span className="flex flex-col gap-0.5"><b className="text-[14.5px] font-semibold">{ALL_SEGMENT.name}</b><span className="text-[12.5px] leading-snug">Todos os módulos no menu; você esconde o que não usa.</span></span>
            </button>
          </div>
        </section>
        <Preview seg={seg} />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-8 py-4">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} className="size-4 accent-[var(--t-accent)]" />
            Criar o quadro {seg.board} em Projetos
          </label>
          <span className="text-[12.5px] text-muted">{customized ? 'Isto troca o menu e o Início que você montou. Seus dados não mudam.' : 'Nada fica preso: dá para trocar depois no Início ou em Configurações.'}</span>
          {error && <span className="text-[12.5px] text-[#B3261E] dark:text-[#FF8A80]">{error}</span>}
        </div>
        <button type="button" onClick={() => void go()} disabled={busy}
          className="flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14.5px] font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Montar meu Tesseract<ArrowRight size={15} />
        </button>
      </footer>
    </main>
  )
}
