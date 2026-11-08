import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Play, Square } from 'lucide-react'
import { TIMER_FOCUS, elapsed, stopTimer, stopwatch, useRunning } from '../data/hours'
import { useBindings } from '../app/shortcuts'

// Cronômetro de horas no rodapé da barra lateral (fase 12): sempre à vista, em qualquer tela.
export function TimerMini({ collapsed }: { collapsed: boolean }) {
  const running = useRunning()
  const navigate = useNavigate()
  const keys = useBindings()
  const [, tick] = useState(0)
  useEffect(() => { if (!running) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [running])
  const open = () => { navigate('/horas'); setTimeout(() => window.dispatchEvent(new Event(TIMER_FOCUS)), 150) }

  if (!running) return (
    <button type="button" onClick={open} title={collapsed ? `Iniciar cronômetro (${keys.timer})` : undefined}
      className={`flex items-center gap-2.5 rounded-xl border border-line bg-card text-left transition-colors hover:border-line-strong ${collapsed ? 'justify-center p-2' : 'px-3 py-2.5'}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><Play size={13} fill="currentColor" className="ml-0.5" /></span>
      {!collapsed && <span className="min-w-0"><span className="block text-[13px]">Iniciar cronômetro</span><span className="block text-[12px] text-faint">{keys.timer}</span></span>}
    </button>
  )
  const time = stopwatch(elapsed(running.runningSince!))
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border border-line bg-card ${collapsed ? 'flex-col p-2' : 'px-3 py-2.5'}`} title={collapsed ? `${running.title} · ${time}` : undefined}>
      <button type="button" onClick={() => void stopTimer()} aria-label={`Parar cronômetro de ${running.title}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-strong"><Square size={11} fill="currentColor" /></button>
      {!collapsed && (
        <button type="button" onClick={() => navigate('/horas')} className="min-w-0 flex-1 text-left">
          <span className="block font-mono text-[10px] tracking-[0.18em] text-faint">RODANDO</span>
          <span className="block font-mono text-[18px] leading-tight tabular-nums">{time}</span>
          <span className="block truncate text-[12px] text-muted">{running.title}{running.company ? ` · ${running.company}` : ''}</span>
        </button>
      )}
    </div>
  )
}
