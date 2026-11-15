// Editar o menu no próprio menu: arrastar para mudar a ordem, olho para esconder,
// alfinete para pôr no topo e clique no nome para renomear. Grava na hora.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Pin, PinOff } from 'lucide-react'
import { ALL_MODULES } from './nav'
import { useStore } from '../data/api'
import { DEFAULT_MENU, hideModule, labelOf, menuFor, renameModule, saveMenu, segmentOf, showModule, toggleTop, topOf, useMenu, type MenuConfig } from '../data/layout'

const iconBtn = 'grid size-6 shrink-0 place-items-center rounded-md hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent'

function Row({ path, cfg, pinned, canPin }: { path: string; cfg: MenuConfig; pinned: boolean; canPin: boolean }) {
  const m = ALL_MODULES.find((x) => x.path === path)!
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: path })
  const shown = !cfg.hidden.includes(path)
  const label = labelOf(m, cfg)
  const [name, setName] = useState<string | null>(null)
  const commit = () => { if (name !== null) renameModule(cfg, path, name); setName(null) }
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex h-9 items-center gap-1 rounded-lg text-[14px] ${isDragging ? 'relative z-10 bg-card shadow-lg' : ''}`}>
      <button type="button" {...attributes} {...listeners} aria-label={`Mudar a ordem de ${label}`} className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-faint hover:text-fg"><GripVertical size={14} /></button>
      <m.icon size={16} strokeWidth={1.7} className={`shrink-0 ${shown ? 'text-muted' : 'text-faint opacity-60'}`} />
      {name === null ? (
        <button type="button" onClick={() => setName(label)} title={`Renomear ${label}`}
          className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left hover:bg-raised ${shown ? '' : 'text-faint line-through decoration-line-strong'}`}>{label}</button>
      ) : (
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Nome de {m.label} no menu</span>
          <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setName(null) }}
            className="h-7 w-full min-w-0 rounded-md border border-accent bg-card px-1.5 text-[14px] text-fg outline-none" />
        </label>
      )}
      {canPin && shown && (
        <button type="button" onClick={() => toggleTop(cfg, path)} aria-label={pinned ? `Tirar ${label} do topo` : `Pôr ${label} no topo`} title={pinned ? 'Tirar do topo' : 'Pôr no topo'}
          className={`${iconBtn} ${pinned ? 'text-link' : 'text-faint'}`}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
      )}
      <button type="button" disabled={path === '/'} onClick={() => (shown ? hideModule(cfg, path) : showModule(cfg, path))}
        aria-label={shown ? `Esconder ${label} do menu` : `Mostrar ${label} no menu`} title={shown ? 'Esconder do menu' : 'Mostrar no menu'}
        className={`${iconBtn} ${shown ? 'text-link' : 'text-faint'}`}>{shown ? <Eye size={15} /> : <EyeOff size={15} />}</button>
    </li>
  )
}

function Group({ label, ids, cfg, pinned, canPin, onSort }: { label: string; ids: string[]; cfg: MenuConfig; pinned: boolean; canPin: boolean; onSort: (from: string, to: string) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const end = (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) onSort(String(e.active.id), String(e.over.id)) }
  return (
    <section className="mt-2 flex flex-col">
      <h3 className="px-1.5 pt-1.5 pb-1 text-[12px] font-normal text-faint">{label}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-0.5">{ids.map((p) => <Row key={p} path={p} cfg={cfg} pinned={pinned} canPin={canPin} />)}</ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

export function MenuEdit({ onDone }: { onDone: () => void }) {
  const { settings } = useStore()
  const { cfg, style } = useMenu()
  const navigate = useNavigate()
  const canPin = style !== 'trilho'
  const top = canPin ? topOf(cfg) : []
  const inTop = new Set(top)
  const seg = segmentOf(settings['ui.segment'])
  const sortTop = (from: string, to: string) => void saveMenu({ ...cfg, top: arrayMove(top, top.indexOf(from), top.indexOf(to)) })
  const sortSection = (i: number) => (from: string, to: string) => {
    const items = cfg.sections[i].items
    void saveMenu({ ...cfg, sections: cfg.sections.map((s, k) => (k === i ? { ...s, items: arrayMove(items, items.indexOf(from), items.indexOf(to)) } : s)) })
  }
  const reset = () => void saveMenu({ ...(seg ? menuFor(seg) : DEFAULT_MENU), style })
  return (
    <>
      <div className="flex items-center justify-between pr-0.5 pl-2">
        <h2 className="font-serif text-[15px] font-normal">Seu menu</h2>
        <button type="button" onClick={onDone} className="h-8 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent hover:bg-accent-strong">Concluir</button>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        {canPin && top.length > 0 && <Group label={style === 'secoes' ? 'Fixados' : 'No topo'} ids={top} cfg={cfg} pinned canPin onSort={sortTop} />}
        {cfg.sections.map((s, i) => {
          const ids = s.items.filter((p) => !inTop.has(p))
          return ids.length ? <Group key={i} label={s.label || 'Sem título'} ids={ids} cfg={cfg} pinned={false} canPin={canPin} onSort={sortSection(i)} /> : null
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line px-2 pt-3 text-[12.5px]">
        <button type="button" onClick={() => { navigate('/personalizar'); onDone() }} className="text-link hover:text-fg">Seções e formato</button>
        <button type="button" onClick={reset} className="text-muted hover:text-fg">Voltar ao padrão</button>
      </div>
    </>
  )
}
