import { Fragment } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Compass, Minus, X } from 'lucide-react'
import { episodeById, hasGuide, nextEpisode, tutorial, useTutorial } from '../data/tutorials'
import { Inline } from '../pages/Tutorial'

// Guia dentro da tela, com o mapa da operação (C) no topo.
// Fica por cima de qualquer módulo enquanto um episódio está em andamento. Não clica nada pela
// pessoa: mostra o passo, o que deve aparecer e por quê; ela faz e aperta "Fiz, próximo".

export function TutorialCoach() {
  const st = useTutorial()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const found = episodeById(st.guide?.ep)
  if (!st.guide || !found || pathname === '/tutorial') return null
  const { model: m, episode: e } = found
  const total = e.steps.length
  const i = Math.min(st.guide.step, Math.max(total - 1, 0))
  const s = e.steps[i]
  const last = i >= total - 1
  const away = e.route && !pathname.startsWith(e.route)
  // concluir passa para o próximo episódio da trilha: com guia, o guia continua nele; sem, volta à trilha
  const next = nextEpisode(m, e.n, [...st.done, e.id])
  const finish = () => {
    tutorial.markDone(e.id)
    if (next && hasGuide(next)) { tutorial.start(next.id); if (!pathname.startsWith(next.route!)) navigate(next.route!) }
    else { tutorial.pick(m.id); tutorial.stop(); navigate('/tutorial') }
  }

  if (st.guide.min) return (
    <button type="button" onClick={() => tutorial.minimize(false)}
      className="fixed right-24 bottom-6 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-accent bg-card px-4 text-[13.5px] shadow-[0_10px_30px_color-mix(in_srgb,var(--t-accent)_30%,transparent)]">
      <Compass size={16} className="text-link" />Guia · passo {i + 1} de {total}
    </button>
  )

  return (
    <aside role="dialog" aria-label={`Guia: ${e.title}`}
      className="anim-rise fixed right-24 bottom-6 z-40 flex w-[380px] max-w-[calc(100vw-120px)] flex-col gap-3 rounded-2xl border border-accent bg-card p-4 shadow-[0_18px_50px_rgba(0,0,0,.28)]">
      <div className="flex items-center gap-2">
        <Compass size={16} className="shrink-0 text-link" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{m.name} · Ep. {e.n} · {e.title}</span>
        <button type="button" aria-label="Minimizar o guia" onClick={() => tutorial.minimize(true)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"><Minus size={14} /></button>
        <button type="button" aria-label="Sair do guia" onClick={() => tutorial.stop()} className="grid size-7 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"><X size={14} /></button>
      </div>

      {/* mapa da operação (C): onde este episódio fica no caminho do modelo */}
      <div className="flex items-center gap-1 overflow-x-auto" aria-label="Mapa da operação">
        {m.stops.map((x, k) => {
          const here = x.eps.includes(e.n), ok = x.eps.every((n) => st.done.includes(`${m.id}-${n}`))
          return (
            <Fragment key={x.label + k}>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] ${here ? 'bg-accent text-on-accent' : ok ? 'bg-ok-bg text-ok' : 'bg-raised text-muted'}`}>{x.label}</span>
              {k < m.stops.length - 1 && <span className="shrink-0 text-[11px] text-faint" aria-hidden="true">›</span>}
            </Fragment>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.16em] text-link">PASSO {i + 1} DE {total}</span>
        <span className="flex flex-1 gap-[3px]" aria-hidden="true">
          {e.steps.map((_, k) => <span key={k} className={`h-1 flex-1 rounded ${k < i ? 'bg-ok' : k === i ? 'bg-accent' : 'bg-line'}`} />)}
        </span>
      </div>

      {s ? (
        <div className="flex flex-col gap-1.5">
          <b className="text-[15px] font-semibold leading-snug"><Inline text={s.do} /></b>
          {s.see && <p className="text-[13px] leading-relaxed text-muted">Deve aparecer: <Inline text={s.see} /></p>}
          {s.say && <p className="text-[13px] italic leading-relaxed text-link">{s.say}</p>}
        </div>
      ) : <p className="text-[13.5px] text-muted">Este episódio ainda não tem passos.</p>}

      {away && (
        <button type="button" onClick={() => navigate(e.route!)} className="self-start text-[13px] text-link hover:underline">Ir para a tela deste episódio →</button>
      )}

      <div className="flex items-center gap-2">
        <button type="button" disabled={i === 0} onClick={() => tutorial.step(i - 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft size={14} />Voltar</button>
        {last
          ? <button type="button" onClick={finish} title={next ? `Próximo: Ep. ${next.n} · ${next.title}` : 'Último episódio da trilha'} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ok px-3 text-[13px] font-medium text-white"><Check size={14} />{next ? 'Feito, próximo episódio' : 'Concluir a trilha'}</button>
          : <button type="button" onClick={() => tutorial.step(i + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-strong">Fiz, próximo<ArrowRight size={14} /></button>}
        <span className="flex-1" />
        <button type="button" onClick={() => navigate('/tutorial')} className="text-[12.5px] text-muted hover:text-fg">Ver a trilha</button>
      </div>
    </aside>
  )
}
