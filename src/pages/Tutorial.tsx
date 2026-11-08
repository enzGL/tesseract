import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Check, ChevronRight, Compass, PlayCircle, Search, ShieldCheck } from 'lucide-react'
import { useTheme } from '../app/theme'
import { hasGuide, MODELS, modelById, nextEpisode, tutorial, useTutorial, type Episode, type Model } from '../data/tutorials'

// Aba Tutorial (fase 14):
// direção A (trilhas por modelo) como tela principal, com o mapa da operação da C no topo da trilha.
// "Fazer no app com o guia" abre o módulo com o guia da direção B (components/TutorialCoach.tsx).

const LIGHT = import.meta.glob<string>('../assets/art/[1-6].png', { eager: true, import: 'default' })
const DARK = import.meta.glob<string>('../assets/art-dark/[1-6].png', { eager: true, import: 'default' })
const scene = (n: number, dark: boolean) => (dark ? DARK : LIGHT)[`../assets/${dark ? 'art-dark' : 'art'}/${n}.png`]

// Negrito e `código` dos roteiros, como elementos (nunca HTML).
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[1] ? <b key={k++} className="font-semibold">{m[1].slice(2, -2)}</b> : <code key={k++} className="rounded bg-raised px-1 font-mono text-[0.88em]">{m[2]!.slice(1, -1)}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function Tier({ e }: { e: Episode }) {
  if (e.tier === 'free') return null
  return <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.12em] text-link">{e.tier === 'pro' ? 'PRO' : 'GRÁTIS + PRO'}</span>
}

function ModelCard({ m, on, done, dark, onPick }: { m: Model; on: boolean; done: number; dark: boolean; onPick: () => void }) {
  const pct = m.episodes.length ? Math.round((done / m.episodes.length) * 100) : 0
  return (
    <button type="button" onClick={onPick} aria-pressed={on}
      className={`flex flex-col gap-2 rounded-xl bg-card p-2.5 text-left transition-colors ${on ? 'border-2 border-accent p-[9px]' : 'border border-line hover:border-line-strong'}`}>
      <span className="block h-14 overflow-hidden rounded-lg bg-accent-soft"><img src={scene(m.art, dark)} alt="" aria-hidden="true" className="size-full object-cover opacity-90" /></span>
      <span className="flex items-center justify-between gap-2">
        <b className="text-[14px] font-semibold">{m.name}</b>
        <span className="font-mono text-[11px] text-muted">{done}/{m.episodes.length}</span>
      </span>
      <span className="text-[12px] leading-snug text-muted">{m.who}</span>
      <span className="block h-1 overflow-hidden rounded bg-line"><span className="block h-1 rounded bg-ok" style={{ width: `${pct}%` }} /></span>
    </button>
  )
}

// Mapa da operação (direção C): as telas na ordem da trilha, com o que já foi feito em cada uma.
function OperationMap({ m, done, open, onOpen }: { m: Model; done: string[]; open: number; onOpen: (n: number) => void }) {
  return (
    <div className="flex items-stretch overflow-x-auto pb-1" aria-label="Mapa da operação">
      {m.stops.map((s, i) => {
        const all = s.eps.every((n) => done.includes(`${m.id}-${n}`))
        const here = s.eps.includes(open)
        return (
          <Fragment key={s.label + i}>
            <button type="button" onClick={() => onOpen(s.eps.find((n) => !done.includes(`${m.id}-${n}`)) ?? s.eps[0])}
              className={`flex w-[136px] shrink-0 flex-col gap-1 rounded-xl bg-card px-3 py-2.5 text-left ${here ? 'border-2 border-accent px-[11px] py-[9px]' : 'border border-line hover:border-line-strong'}`}>
              <span className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted">PARADA {i + 1}</span>
                {all && <Check size={13} className="text-ok" aria-label="feita" />}
              </span>
              <b className="text-[13.5px] font-semibold">{s.label}</b>
              <span className="font-mono text-[11px] text-link">Ep. {s.eps.join(' · ')}</span>
            </button>
            {i < m.stops.length - 1 && <span className="grid w-7 shrink-0 place-items-center text-line-strong" aria-hidden="true"><ChevronRight size={16} /></span>}
          </Fragment>
        )
      })}
    </div>
  )
}

function EpisodePanel({ m, e, done, onGuide, onDone }: { m: Model; e: Episode; done: boolean; onGuide: () => void; onDone: () => void }) {
  const { theme } = useTheme()
  return (
    <aside aria-label="Episódio aberto" className="flex w-full flex-col gap-3 rounded-2xl border border-line-strong bg-card p-4 lg:sticky lg:top-4 lg:w-[400px] lg:shrink-0">
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-accent-soft">
        <img src={scene(m.art, theme === 'dark')} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-50" />
        <div className="relative flex flex-col items-center gap-2 px-6 text-center">
          <PlayCircle size={40} strokeWidth={1.4} className="text-link" />
          <span className="rounded-md bg-card px-2.5 py-1 text-[12.5px]">Vídeo em gravação. Por enquanto, siga o passo a passo.</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-[0.16em] text-link">EPISÓDIO {e.n}{e.time ? ` · ${e.time.toUpperCase()}` : ''}</span>
        <div className="flex items-start gap-2"><b className="flex-1 text-[17px] font-semibold leading-snug">{e.title}</b><Tier e={e} /></div>
        {e.goal && <p className="text-[13.5px] text-muted"><Inline text={e.goal} /></p>}
        {e.screens && <p className="text-[12.5px] text-faint">Telas: <Inline text={e.screens} /></p>}
      </div>
      {e.steps.length > 0
        ? <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-relaxed">
            {e.steps.map((s, i) => <li key={i}><Inline text={s.do} />{s.see && <span className="block text-[12.5px] text-muted">Deve aparecer: <Inline text={s.see} /></span>}</li>)}
          </ol>
        : <p className="text-[13.5px] text-muted">Os passos deste episódio ainda estão sendo escritos.</p>}
      {e.privacy && (
        <p className="flex gap-2 rounded-xl bg-raised px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-link" /><span><Inline text={e.privacy} /></span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {hasGuide(e) && (
          <button type="button" onClick={onGuide}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[14px] font-medium text-on-accent hover:bg-accent-strong">
            <Compass size={16} />Fazer no app com o guia
          </button>
        )}
        <button type="button" onClick={onDone} aria-pressed={done}
          className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium ${done ? 'bg-ok text-white' : 'border border-line-strong hover:border-ok'}`}>
          <Check size={15} />{done ? 'Feito' : 'Marcar como feito'}
        </button>
      </div>
      {!e.route && <p className="text-[12px] text-faint">Este episódio acontece fora do app (site ou instalador), por isso não tem guia.</p>}
    </aside>
  )
}

export function Tutorial() {
  const st = useTutorial()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const m = modelById(st.model) ?? MODELS[0]
  const firstOpen = m?.episodes.find((e) => !st.done.includes(e.id))?.n ?? 1
  const [openN, setOpenN] = useState<Record<string, number>>({})
  const open = openN[m?.id ?? ''] ?? firstOpen
  const setOpen = (n: number) => m && setOpenN((o) => ({ ...o, [m.id]: n }))
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return MODELS.flatMap((x) => x.episodes.filter((e) => `${e.title} ${e.goal} ${e.screens}`.toLowerCase().includes(t)).map((e) => ({ m: x, e }))).slice(0, 12)
  }, [q])

  if (!m) return <div className="p-12"><h1 className="font-serif text-[26px]">Tutorial</h1><p className="mt-2 text-muted">Nenhum roteiro encontrado em docs/tutoriais.</p></div>
  const ep = m.episodes.find((e) => e.n === open) ?? m.episodes[0]
  const guide = (e: Episode) => { tutorial.start(e.id); if (e.route) navigate(e.route) }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-10 py-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-1.5">
          <span className="font-mono text-[11px] tracking-[0.18em] text-link">TUTORIAL</span>
          <h1 className="font-serif text-[30px] leading-tight">Monte a sua operação, <em className="text-link">um episódio por vez</em></h1>
          <p className="text-[14px] text-muted">Escolha o jeito que você trabalha. Cada trilha mostra o caminho inteiro, com o passo a passo e o guia dentro de cada tela.</p>
        </div>
        <label className="flex h-10 w-[280px] items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-muted focus-within:border-accent">
          <Search size={15} />
          <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar: proposta, ICP, sprint…" aria-label="Buscar nos tutoriais"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-faint" />
        </label>
      </header>

      {hits.length > 0 && (
        <section aria-label="Resultados da busca" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card p-3">
          {hits.map(({ m: x, e }) => (
            <button key={e.id} type="button" onClick={() => { tutorial.pick(x.id); setOpenN((o) => ({ ...o, [x.id]: e.n })); setQ('') }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-raised">
              <span className="w-[120px] shrink-0 text-[12.5px] text-muted">{x.name}</span>
              <span className="flex-1 text-[14px]">Ep. {e.n} · {e.title}</span>
              <Tier e={e} /><ArrowRight size={14} className="text-muted" />
            </button>
          ))}
        </section>
      )}

      <section aria-label="Modelos de operação" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {MODELS.map((x) => <ModelCard key={x.id} m={x} on={x.id === m.id} dark={dark} done={x.episodes.filter((e) => st.done.includes(e.id)).length} onPick={() => tutorial.pick(x.id)} />)}
      </section>

      <section aria-label={`Trilha: ${m.name}`} className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-serif text-[22px]">{m.title}</h2>
              <span className="text-[13px] text-muted">{m.episodes.length} episódios · cerca de {m.minutes} min</span>
            </div>
            {m.forWhom && <p className="max-w-[680px] text-[13.5px] leading-relaxed text-muted"><Inline text={m.forWhom} /></p>}
          </div>

          <OperationMap m={m} done={st.done} open={ep.n} onOpen={setOpen} />

          <ol className="flex flex-col gap-1.5">
            {m.episodes.map((e) => {
              const done = st.done.includes(e.id), here = e.n === ep.n
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpen(e.n)} aria-current={here ? 'step' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${here ? 'border border-accent bg-accent-soft' : 'border border-line bg-card hover:border-line-strong'}`}>
                    <span className={`grid size-[26px] shrink-0 place-items-center rounded-full font-mono text-[12px] ${done ? 'bg-ok text-white' : here ? 'bg-accent text-on-accent' : 'border border-line-strong text-muted'}`}>
                      {done ? <Check size={13} /> : e.n}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[14px] font-medium">{e.title}</span>
                      <span className="truncate text-[12px] text-muted">{e.screens.replace(/\*\*/g, '')}</span>
                    </span>
                    <Tier e={e} />
                    <span className="w-[64px] shrink-0 text-right font-mono text-[11.5px] text-muted">{e.time}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          {(m.config.length > 0 || m.mistakes.length > 0) && (
            <div className="grid gap-4 rounded-2xl border border-line bg-card p-4 md:grid-cols-2">
              {m.config.length > 0 && <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] tracking-[0.16em] text-muted">CONFIGURAÇÃO RECOMENDADA</span>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed">{m.config.map((c, i) => <li key={i}><Inline text={c} /></li>)}</ul>
              </div>}
              {m.mistakes.length > 0 && <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] tracking-[0.16em] text-muted">ERROS COMUNS</span>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed">{m.mistakes.map((c, i) => <li key={i}><Inline text={c} /></li>)}</ul>
              </div>}
            </div>
          )}
        </div>

        <EpisodePanel m={m} e={ep} done={st.done.includes(ep.id)} onGuide={() => guide(ep)} onDone={() => {
          // marcar como feito passa para o próximo episódio; desmarcar fica onde está
          if (st.done.includes(ep.id)) { tutorial.toggleDone(ep.id); return }
          tutorial.markDone(ep.id)
          const nx = nextEpisode(m, ep.n, [...st.done, ep.id])
          if (nx) setOpen(nx.n)
        }} />
      </section>
    </div>
  )
}
