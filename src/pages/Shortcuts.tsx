import { useEffect, useState } from 'react'
import { Keyboard, RotateCcw } from 'lucide-react'
import { Badge, Button, PageHeader } from '../components/ui'
import { setSetting, useStore } from '../data/api'
import { ACTIONS, RESERVED, bindingsFrom, capture, comboOf, type ActionId } from '../app/shortcuts'

function Kbd({ combo }: { combo: string }) {
  return <span className="inline-flex gap-1">{combo.split('+').map((k) => <kbd key={k} className="min-w-7 rounded-md border border-line-strong bg-raised px-1.5 py-0.5 text-center font-mono text-[12px]">{k}</kbd>)}</span>
}

export function Shortcuts() {
  const custom = useStore().settings['shortcuts'] ?? {}
  const bindings = bindingsFrom(custom)
  const [editing, setEditing] = useState<ActionId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = (next: Record<string, string>) => setSetting('shortcuts', next)
  const reset = (id: ActionId) => { const { [id]: _, ...rest } = custom; void _; save(rest) }

  // grava a próxima combinação: Esc cancela; reservadas e repetidas são recusadas
  useEffect(() => {
    if (!editing) return
    capture.active = true
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setEditing(null); setError(null); return }
      const combo = comboOf(e)
      if (!combo) { setError('Use Ctrl ou Alt junto com uma tecla (ou F1 a F12).'); return }
      if (RESERVED.has(combo)) { setError(`${combo} é do sistema ou da edição de texto.`); return }
      const taken = ACTIONS.find((a) => a.id !== editing && bindings[a.id] === combo)
      if (taken) { setError(`${combo} já abre "${taken.label}". Troque aquele antes.`); return }
      const def = ACTIONS.find((a) => a.id === editing)!.def
      const { [editing]: _, ...rest } = custom; void _
      save(combo === def ? rest : { ...rest, [editing]: combo })
      setEditing(null); setError(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); capture.active = false }
  }, [editing, custom, bindings])

  const changed = Object.keys(custom).length
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-16 py-12">
      <PageHeader title="Atalhos de teclado" subtitle="Clique em Mudar e pressione a nova combinação. Esc cancela."
        badge={changed ? <Badge>{changed} personalizado{changed > 1 ? 's' : ''}</Badge> : undefined}
        actions={changed ? <Button variant="ghost" icon={RotateCcw} onClick={() => save({})}>Restaurar todos</Button> : undefined} />
      <ul className="anim-rise divide-y divide-line rounded-xl border border-line bg-card">
        {ACTIONS.map((a) => {
          const on = editing === a.id
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 ${on ? 'bg-accent-soft/50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium">{a.label}</p>
                {a.hint && <p className="text-[13px] text-muted">{a.hint}</p>}
              </div>
              {on ? <span className="flex items-center gap-2 text-[13.5px] text-link"><Keyboard size={15} className="animate-pulse" />Pressione a combinação…</span> : <Kbd combo={bindings[a.id]} />}
              <div className="flex gap-1">
                <Button variant={on ? 'ghost' : 'secondary'} onClick={() => { setError(null); setEditing(on ? null : a.id) }}>{on ? 'Cancelar' : 'Mudar'}</Button>
                {custom[a.id] && !on && <Button variant="ghost" icon={RotateCcw} title={`Voltar para ${a.def}`} ariaLabel={`Voltar ${a.label} para ${a.def}`} onClick={() => reset(a.id)} />}
              </div>
              {on && error && <p className="w-full text-[13px] text-[#B3261E]" role="alert">{error}</p>}
            </li>
          )
        })}
      </ul>
      <p className="text-[13px] text-faint">Ctrl+C, Ctrl+V, Ctrl+Z e outras combinações de edição ficam reservadas. No Mac, Ctrl vale como ⌘.</p>
    </div>
  )
}
