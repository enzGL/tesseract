import { Sparkles } from 'lucide-react'
import type { Module } from '../app/nav'
import { Badge, Button, EmptyState } from '../components/ui'
import { openCheckout } from '../data/license'

// Tela de um módulo Pro num build do código aberto (sem a pasta pro/, ver src/pro-bridge.ts): diz o que é e
// onde ele existe, sem simular a tela.
export function ProOnly({ module: m }: { module: Module }) {
  return (
    <div className="min-h-full">
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-16 pt-14 pb-16">
          <Badge tone="muted">Tesseract Pro</Badge>
          <h1 className="mt-4 font-serif text-[44px] leading-[1.1] tracking-[-0.02em]">{m.label}</h1>
          <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-muted">{m.summary}</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1200px] px-16 py-10">
        <EmptyState
          icon={Sparkles}
          title="Isso é do Tesseract Pro"
          body={`Este build foi compilado do código aberto, que traz o Grátis completo. ${m.label} vem no instalador oficial, com a assinatura do Pro.`}
        >
          <Button variant="primary" icon={Sparkles} onClick={() => void openCheckout()}>Ver o Pro</Button>
        </EmptyState>
      </div>
    </div>
  )
}
