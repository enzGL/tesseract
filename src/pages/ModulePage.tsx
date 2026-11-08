import { useLocation } from 'react-router'
import { Construction } from 'lucide-react'
import { moduleFor } from '../app/nav'
import { Badge, EmptyState } from '../components/ui'
import { useTheme } from '../app/theme'

// Cenas em dither do usuário (assets/), clara e escura (assets/modo escuro), por número.
const LIGHT = import.meta.glob<string>('../assets/art/[1-6].png', { eager: true, import: 'default' })
const DARK = import.meta.glob<string>('../assets/art-dark/[1-6].png', { eager: true, import: 'default' })
const scene = (n: number, dark: boolean) => (dark ? DARK : LIGHT)[`../assets/${dark ? 'art-dark' : 'art'}/${n}.png`]

// Cena de cada módulo. O tema do quadro acompanha o módulo.
const ART: Record<string, number> = {
  '/chat': 2, '/bots': 2, '/cerebro': 4,
  '/projetos': 6, '/calendario': 5, '/financas': 6,
  '/crm': 1, '/prospeccao': 5, '/contratos': 4,
  '/campanhas': 1, '/social': 3, '/automacoes': 2,
  '/configuracoes': 3,
}

// Tela de módulo ainda não implementado: diz o que vai existir e em que fase, sem simular funcionalidade.
export function ModulePage() {
  const m = moduleFor(useLocation().pathname)
  const { theme } = useTheme()
  const art = scene(ART[m.path] ?? 1, theme === 'dark')
  return (
    <div className="min-h-full">
      <section className="relative overflow-hidden border-b border-line">
        <img key={m.path + theme} src={art} alt="" aria-hidden="true" className="anim-fade absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--t-bg)_0%,color-mix(in_srgb,var(--t-bg)_90%,transparent)_38%,color-mix(in_srgb,var(--t-bg)_30%,transparent)_70%,transparent_100%)]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(0deg,var(--t-panel),transparent)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1200px] px-16 pt-14 pb-16">
          <div className="anim-rise"><Badge tone="muted">Fase {m.phase}</Badge></div>
          <h1 className="anim-rise mt-4 font-serif text-[44px] leading-[1.1] tracking-[-0.02em]" style={{ animationDelay: '.05s' }}>{m.label}</h1>
          <p className="anim-rise mt-3 max-w-lg text-[16px] leading-relaxed text-muted" style={{ animationDelay: '.1s' }}>{m.summary}</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1200px] px-16 py-10">
        <EmptyState icon={Construction} title="Módulo em construção" body={`Esta área entra na fase ${m.phase} do plano de implementação. A navegação e o layout já estão no lugar.`} />
      </div>
    </div>
  )
}
