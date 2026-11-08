import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { FolderOpen } from 'lucide-react'
import { HowItWorks } from '../components/Guide'
import type { ParaKind, Project } from '../data/api'
import { method } from '../data/methods'

// PARA (fase 4B-2c, proposta aprovada): todos os projetos, de todos os escopos, em quatro gavetas.
// Projetos têm fim; áreas não acabam; recursos são assuntos de consulta; arquivo é o que terminou.
// Cada item pode apontar a pasta dele no segundo cérebro. O app só lê o cérebro: arquivar aqui não move a pasta.

type Drawer = ParaKind | 'archive'
const DRAWERS: [Drawer, string, string][] = [
  ['project', 'Projetos', 'Têm fim e prazo'],
  ['area', 'Áreas', 'Responsabilidades que não acabam'],
  ['resource', 'Recursos', 'Assuntos que interessam, para consulta'],
  ['archive', 'Arquivo', 'O que terminou ou parou. Nada é apagado.'],
]
const drawerOf = (p: Project): Drawer => (p.archived ? 'archive' : p.paraKind)

function Item({ p, scope, onOpen }: { p: Project; scope: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} aria-label={`${p.name}, arraste para outra gaveta`} style={{ opacity: isDragging ? 0.35 : 1 }}
      className={`flex flex-col gap-1 rounded-[10px] border px-3 py-2.5 ${p.archived ? 'border-dashed border-line-strong text-muted' : 'kcard'}`}>
      <button type="button" onClick={onOpen} className="truncate text-left text-[13.5px] font-medium hover:underline">{p.name}</button>
      <span className="text-[11.5px] text-muted">{scope}{p.open ? ` · ${p.open} aberta${p.open === 1 ? '' : 's'}` : ''}</span>
      {p.brainPath && <span className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-link" title="Pasta no Conhecimento"><FolderOpen size={11} />{p.brainPath}</span>}
    </div>
  )
}

function Column({ id, title, hint, children, dashed }: { id: Drawer; title: string; hint: string; children: React.ReactNode; dashed?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} aria-label={title}
      className={`flex min-h-[260px] flex-col gap-2 rounded-2xl p-3.5 transition-colors ${dashed ? 'border border-dashed border-line-strong' : 'border border-line bg-card'} ${isOver ? '!border-accent bg-accent-soft/40' : ''}`}>
      <b className="text-[15px]">{title}</b><span className="-mt-1 text-[12px] text-muted">{hint}</span>
      {children}
    </section>
  )
}

export function ParaView({ projects, scopeName, onOpen, onMove }: {
  projects: Project[]; scopeName: (s: string) => string; onOpen: (id: number) => void; onMove: (p: Project, to: Drawer) => void
}) {
  const [active, setActive] = useState<Project | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null)
    const p = projects.find((x) => x.id === a.id)
    if (p && over && over.id !== drawerOf(p)) onMove(p, over.id as Drawer)
  }
  return (
    <div className="flex flex-col gap-4">
      <HowItWorks id="para" title="PARA (projetos, áreas, recursos, arquivo)" guide={method('para')!.guide} />
      <DndContext sensors={sensors} onDragStart={({ active: a }) => setActive(projects.find((x) => x.id === a.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {DRAWERS.map(([id, title, hint]) => {
            const items = projects.filter((p) => drawerOf(p) === id)
            return (
              <Column key={id} id={id} title={title} hint={hint} dashed={id === 'archive'}>
                {items.map((p) => <Item key={p.id} p={p} scope={scopeName(p.scope)} onOpen={() => onOpen(p.id)} />)}
                {items.length === 0 && <span className="mt-2 text-[12.5px] text-faint">Arraste um projeto para cá.</span>}
              </Column>
            )
          })}
        </div>
        <DragOverlay>{active ? <div className="kcard w-[240px] rotate-1 rounded-[10px] border px-3 py-2.5 text-[13.5px] font-medium shadow-xl">{active.name}</div> : null}</DragOverlay>
      </DndContext>
      <p className="text-[12.5px] text-muted">A pasta de cada item na base de conhecimento se escolhe em Configurar, dentro do projeto. O Tesseract só lê a base: arquivar aqui não move nem apaga a pasta. Para arquivar as notas também, mova a pasta para <span className="font-mono">arquivo/</span> no Obsidian ou no Explorador de Arquivos.</p>
    </div>
  )
}
