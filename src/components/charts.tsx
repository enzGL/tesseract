import { useState, type CSSProperties } from 'react'
import type { FunnelStage } from '../data/dashboard'

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

// Funil em degraus: colunas clicáveis, barras hachuradas, coluna ativa sólida com tooltip.
export function FunnelChart({ stages, initial = 3 }: { stages: FunnelStage[]; initial?: number }) {
  const [sel, setSel] = useState(initial)
  const max = Math.max(1, ...stages.map((s) => s.value))
  const empty = stages.every((s) => s.value === 0)
  const ticks = empty ? ['', '', '', '', '0'] : [max, Math.round(max * 0.75), Math.round(max / 2), Math.round(max / 4), 0]

  return (
    <div className="flex px-5 pt-3.5">
      <div className="flex h-[330px] w-9 shrink-0 flex-col justify-between pt-16 pb-1 font-mono text-[10px] text-muted">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>
      <div className="grid min-w-0 flex-1 border-l border-line" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const on = sel === i && s.value > 0
          const prev = i ? stages[i - 1].value : s.value
          const conv = prev ? Math.round((s.value / prev) * 100) : 0
          const pct = (s.value / max) * 100
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setSel(i)}
              aria-pressed={on}
              aria-label={`${s.label}: ${s.value} oportunidades`}
              className={`relative flex h-[330px] flex-col items-start gap-1 border-r border-line px-3 pt-3 text-left transition-colors hover:bg-raised ${on ? 'bg-accent-soft' : ''}`}
            >
              <span className={`text-[12px] ${on ? 'text-fg' : 'text-muted'}`}>{s.label}</span>
              <span className={`text-[26px] font-medium tracking-[-0.02em] ${on ? 'text-fg' : 'text-muted'}`}>{s.value}</span>
              <span className="relative mt-3 flex w-full flex-1 items-end">
                {s.value > 0 && (
                  <span className="anim-grow-y relative block w-full" style={{ height: `${pct}%`, ...delay(0.3 + i * 0.12) }}>
                    <span className={`absolute inset-0 block ${on ? 'bg-accent' : 'hatch'}`} />
                    <span className="absolute -top-[3px] left-1/2 -ml-3.5 block h-[3px] w-7 bg-accent" />
                  </span>
                )}
                {on && (
                  <span className="anim-tip absolute left-1/2 z-10 whitespace-nowrap bg-fg px-2.5 py-1.5 text-[11.5px] text-bg" style={{ bottom: `calc(${pct}% + 18px)`, transform: 'translateX(-50%)' }}>
                    <b className="font-semibold">{s.value}</b> oportunidades · conversão <b className="font-semibold">{conv}%</b> · perda −{100 - conv}%
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const PART_STYLES = ['hatch-strong', 'hatch-gray', 'hatch-dim']

export function PartBars({ parts, format }: { parts: { label: string; value: number }[]; format: (v: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div className="flex flex-col gap-[18px]">
      {parts.map((p, i) => (
        <div key={p.label} className="flex flex-col gap-2">
          <div className="flex justify-between text-[13px]">
            <span className="text-[#D4D4D8]">{p.label}</span>
            <span className="font-mono text-[12px]">{format(p.value)}</span>
          </div>
          <div className="h-2.5 bg-raised">
            <div className={`anim-grow-x h-full ${PART_STYLES[i % PART_STYLES.length]}`} style={{ width: `${(p.value / total) * 100}%`, ...delay(0.5 + i * 0.12) }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Linha em degraus com área hachurada; o pico ganha um ponto.
export function StepChart({ labels, values }: { labels: string[]; values: number[] }) {
  const w = 300, h = 150, step = w / values.length
  const max = Math.max(...values), min = Math.min(...values)
  const y = (v: number) => 20 + (1 - (v - min) / (max - min || 1)) * (h - 50)
  const d = `M0 ${y(values[0])}` + values.map((_, i) => ` H${(i + 1) * step}` + (i + 1 < values.length ? ` V${y(values[i + 1])}` : '')).join('')
  const peak = values.indexOf(max)
  return (
    <>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-[18px] block h-[170px] w-full" role="img" aria-label={`Retenção de clientes; pico de ${max}% em ${labels[peak]}`}>
        <defs>
          <pattern id="ret-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="6" className="fill-accent" opacity="0.4" /></pattern>
        </defs>
        <path d={`${d} V${h} H0Z`} fill="url(#ret-hatch)" className="anim-fade" style={delay(1.2)} />
        <path d={d} fill="none" className="stroke-accent anim-draw" strokeWidth="2" pathLength={1} style={delay(0.5)} vectorEffect="non-scaling-stroke" />
        <circle cx={peak * step + step / 2} cy={y(max)} r="4" className="fill-accent anim-pop" style={delay(2)} />
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase text-muted">
        {labels.map((l, i) => <span key={l} className={i === peak ? 'text-accent' : ''}>{l}{i === peak ? ` · ${max}%` : ''}</span>)}
      </div>
    </>
  )
}

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

export function DotMatrix({ counts }: { counts: number[] }) {
  const peak = counts.some((c) => c > 0) ? counts.indexOf(Math.max(...counts)) : -1
  return (
    <div className="grid grid-cols-[repeat(7,16px)] items-end gap-1.5" aria-hidden="true">
      {counts.map((c, i) => (
        <div key={i} className="flex flex-col-reverse items-center gap-1">
          <span className={`mt-1 font-mono text-[9.5px] ${i === peak ? 'text-accent' : 'text-muted'}`}>{WEEKDAYS[i]}</span>
          {c === 0 && <span className="size-3 rounded-full border border-line-strong" />}
          {Array.from({ length: c }, (_, k) => (
            <span key={k} className={`anim-pop size-3 rounded-full ${i === peak ? 'bg-accent' : k === c - 1 ? 'bg-faint' : 'bg-hover'}`} style={delay(0.6 + i * 0.06 + k * 0.04)} />
          ))}
        </div>
      ))}
    </div>
  )
}
