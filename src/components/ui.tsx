import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, type LucideIcon } from 'lucide-react'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

export function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'ok' | 'muted' | 'accent' }) {
  const tones = { ok: 'bg-ok-bg text-ok', muted: 'bg-raised text-muted', accent: 'bg-accent-soft text-link' }
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[12.5px] font-medium', tones[tone])}>{children}</span>
}

export function Button({ children, icon: Icon, variant = 'secondary', onClick, title, ariaLabel, type = 'button', disabled }: {
  children?: ReactNode; icon?: LucideIcon; variant?: 'primary' | 'secondary' | 'light' | 'ghost'; onClick?: () => void; title?: string; ariaLabel?: string; type?: 'button' | 'submit'; disabled?: boolean
}) {
  const variants = {
    primary: 'bg-accent text-on-accent hover:bg-accent-strong',
    light: 'bg-fg text-black hover:bg-white',
    secondary: 'border border-line-strong bg-raised text-fg hover:bg-hover',
    ghost: 'text-muted hover:bg-raised hover:text-fg',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        children ? 'px-4' : 'w-10',
        variants[variant],
      )}
    >
      {Icon && <Icon size={16} strokeWidth={1.8} />}
      {children}
    </button>
  )
}

// Abas em segmento (como o Monthly/Yearly do bolt).
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div role="tablist" className="inline-flex gap-1 self-start rounded-lg border border-line-strong p-1">
      {tabs.map((t, i) => (
        <button key={t} type="button" role="tab" aria-selected={value === i} onClick={() => onChange(i)}
          className={cx('h-8 rounded-md px-3.5 text-[14px] transition-colors', value === i ? 'bg-accent-soft text-link' : 'text-muted hover:text-fg')}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, badge, actions }: { title: string; subtitle?: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="anim-rise flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  )
}

// Métrica sem dado mostra o zero real ou "—" com o motivo; nunca um número inventado.
export function StatCard({ label, value, hint, style }: { label: string; value: string; hint?: string; style?: CSSProperties }) {
  return (
    <div className="anim-rise rounded-xl border border-line bg-card px-5 py-5 transition-colors hover:border-line-strong" style={style}>
      <div className="text-[14px] text-muted">{label}</div>
      <div className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-faint">{hint}</div>}
    </div>
  )
}

export function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[14px] text-link transition-colors hover:text-fg">
      Ver tudo <ArrowRight size={14} />
    </Link>
  )
}

export function Section({ title, subtitle, action, children, style }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="anim-rise flex flex-col gap-4" style={style}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
          {action}
        </div>
        {subtitle && <p className="text-[13px] text-faint">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; width?: string }

export function DataTable<T>({ columns, rows, empty, emptyAction }: { columns: Column<T>[]; rows: T[]; empty: string; emptyAction?: ReactNode }) {
  const template = columns.map((c) => c.width ?? 'minmax(0, 1fr)').join(' ')
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div role="table" className="min-w-[640px]">
        <div role="row" className="grid border-b border-line px-5 py-3.5 text-[13px] font-medium text-muted" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => <div key={c.key} role="columnheader">{c.label}</div>)}
        </div>
        {rows.length === 0 ? (
          <div role="row" className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[14px] text-muted">{empty}</p>
            {emptyAction}
          </div>
        ) : rows.map((r, i) => (
          <div key={i} role="row" className="anim-rise grid border-t border-line px-5 py-3.5 text-[14px] transition-colors first:border-t-0 hover:bg-raised" style={{ gridTemplateColumns: template, animationDelay: `${0.1 + i * 0.05}s` }}>
            {columns.map((c) => <div key={c.key} role="cell" className="min-w-0 truncate">{c.render(r)}</div>)}
          </div>
        ))}
      </div>
    </div>
  )
}

// Estado vazio do bolt: ícone em círculo, título, explicação e ação azul.
export function EmptyState({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-card py-14 text-center">
      <span className="mb-1 grid size-10 place-items-center rounded-full bg-raised text-muted"><Icon size={18} strokeWidth={1.6} /></span>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="max-w-md text-[14px] leading-relaxed text-muted">{body}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
