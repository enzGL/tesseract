// Menu do seu jeito: ligar e desligar módulos, trocar nomes,
// arrastar para mudar a ordem e renomear seções. Grava na hora: o menu ao lado é a prévia.
import { useState } from 'react'
import { Link } from 'react-router'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ALL_MODULES } from '../app/nav'
import { useStore } from '../data/api'
import { DEFAULT_MENU, menuFor, saveMenu, segmentOf, useMenu, type MenuConfig } from '../data/layout'

const field = 'h-9 rounded-lg border border-line-strong bg-raised px-2.5 text-[13.5px] outline-none focus:border-accent'

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className={`flex h-6 w-10 shrink-0 items-center rounded-full p-[3px] transition-colors disabled:opacity-40 ${on ? 'justify-end bg-accent' : 'justify-start bg-line-strong'}`}>
      <span className="size-[18px] rounded-full bg-card shadow" />
    </button>
  )
}

function Row({ path, cfg, sections, sectionIndex }: { path: string; cfg: MenuConfig; sections: string[]; sectionIndex: number }) {
  const m = ALL_MODULES.find((x) => x.path === path)!
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: path })
  const on = !cfg.hidden.includes(path)
  const [name, setName] = useState(cfg.names[path] ?? m.label)
  const commit = () => {
    const names = { ...cfg.names }
    if (!name.trim() || name.trim() === m.label) { delete names[path]; setName(name.trim() || m.label) } else names[path] = name.trim()
    if ((cfg.names[path] ?? '') !== (names[path] ?? '')) void saveMenu({ ...cfg, names })
  }
  const toggle = () => void saveMenu({ ...cfg, hidden: on ? [...cfg.hidden, path] : cfg.hidden.filter((p) => p !== path) })
  const moveTo = (to: number) => {
    const secs = cfg.sections.map((s, i) => ({ ...s, items: i === sectionIndex ? s.items.filter((p) => p !== path) : s.items }))
    secs[to] = { ...secs[to], items: [...secs[to].items, path] }
    void saveMenu({ ...cfg, sections: secs })
  }
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 ${isDragging ? 'relative z-10 bg-raised shadow-lg' : ''} ${on ? '' : 'opacity-60'}`}>
      <button type="button" {...attributes} {...listeners} aria-label={`Mudar a ordem de ${m.label}`} className="grid size-7 cursor-grab touch-none place-items-center rounded-md text-faint hover:bg-raised hover:text-fg"><GripVertical size={15} /></button>
      <m.icon size={16} strokeWidth={1.7} className="shrink-0 text-accent dark:text-link" />
      <label className="flex min-w-0 flex-[0_1_220px]">
        <span className="sr-only">Nome de {m.label} no menu</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} maxLength={40} className={`${field} w-full`} />
      </label>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted" title={m.summary}>{name.trim() && name.trim() !== m.label ? `${m.label} · ` : ''}{m.summary}</span>
      {sections.length > 1 && (
        <label className="shrink-0">
          <span className="sr-only">Seção de {m.label}</span>
          <select value={sectionIndex} onChange={(e) => moveTo(+e.target.value)} className={`${field} w-36 text-[12.5px]`}>
            {sections.map((s, i) => <option key={i} value={i}>{s || 'Sem título (topo)'}</option>)}
          </select>
        </label>
      )}
      <Switch on={on} onChange={toggle} label={`Mostrar ${m.label} no menu`} disabled={path === '/'} />
    </li>
  )
}

function SectionCard({ index, cfg }: { index: number; cfg: MenuConfig }) {
  const s = cfg.sections[index]
  const [label, setLabel] = useState(s.label)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const set = (patch: Partial<MenuConfig['sections'][number]>) => void saveMenu({ ...cfg, sections: cfg.sections.map((x, i) => (i === index ? { ...x, ...patch } : x)) })
  const end = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    set({ items: arrayMove(s.items, s.items.indexOf(String(e.active.id)), s.items.indexOf(String(e.over.id))) })
  }
  const swap = (d: -1 | 1) => { const secs = [...cfg.sections]; [secs[index], secs[index + d]] = [secs[index + d], secs[index]]; void saveMenu({ ...cfg, sections: secs }) }
  const shown = s.items.filter((p) => !cfg.hidden.includes(p)).length
  return (
    <section className="anim-rise overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-2.5 bg-raised/60 px-4 py-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.16em] text-muted">SEÇÃO</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== s.label && set({ label: label.trim() })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Sem título (topo do menu)" maxLength={30} className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-[14px] font-semibold outline-none hover:border-line focus:border-accent focus:bg-card" />
        </label>
        <span className="text-[12px] text-muted">{shown} de {s.items.length} no menu</span>
        <button type="button" onClick={() => swap(-1)} disabled={index === 0} aria-label="Subir a seção" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover disabled:opacity-30"><ArrowUp size={14} /></button>
        <button type="button" onClick={() => swap(1)} disabled={index === cfg.sections.length - 1} aria-label="Descer a seção" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover disabled:opacity-30"><ArrowDown size={14} /></button>
        {!s.items.length && <button type="button" onClick={() => void saveMenu({ ...cfg, sections: cfg.sections.filter((_, i) => i !== index) })} aria-label="Apagar a seção vazia" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover"><Trash2 size={14} /></button>}
      </div>
      {s.items.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
          <SortableContext items={s.items} strategy={verticalListSortingStrategy}>
            <ul>{s.items.map((p) => <Row key={`${p}:${cfg.names[p] ?? ''}`} path={p} cfg={cfg} sections={cfg.sections.map((x) => x.label)} sectionIndex={index} />)}</ul>
          </SortableContext>
        </DndContext>
      ) : <p className="border-t border-line px-4 py-3 text-[13px] text-muted">Seção vazia. Mova módulos para cá pela caixa de seção de cada um.</p>}
    </section>
  )
}

export function MenuEditor() {
  const { settings } = useStore()
  const { cfg } = useMenu()
  const seg = segmentOf(settings['ui.segment'])
  const total = cfg.sections.reduce((n, s) => n + s.items.length, 0)
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-12 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted">CONFIGURAÇÕES · SEU NEGÓCIO</p>
          <h1 className="mt-2 font-serif text-[30px]">Menu do seu jeito</h1>
          <p className="mt-1.5 max-w-[620px] text-[14px] leading-relaxed text-muted">Ligue só o que você usa, troque os nomes e a ordem. Tudo é salvo na hora e o menu ao lado já mostra o resultado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {seg && <button type="button" onClick={() => void saveMenu(menuFor(seg))} className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-3.5 text-[13.5px] hover:bg-raised"><RotateCcw size={14} />Voltar ao modelo {seg.name}</button>}
          <button type="button" onClick={() => void saveMenu(DEFAULT_MENU)} className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-3.5 text-[13.5px] hover:bg-raised">Mostrar todos os módulos</button>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          {cfg.sections.map((_, i) => <SectionCard key={`${i}:${cfg.sections[i].label}:${cfg.sections.length}`} index={i} cfg={cfg} />)}
          <button type="button" onClick={() => void saveMenu({ ...cfg, sections: [...cfg.sections, { label: 'Nova seção', items: [] }] })}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13.5px] text-link hover:bg-raised"><Plus size={15} />Nova seção</button>
        </div>

        <aside aria-label="Ajuda do menu" className="flex max-w-[330px] min-w-[260px] flex-[1_1_280px] flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 text-[13px] leading-relaxed text-muted">
            <b className="text-[14px] font-semibold text-fg">O que acontece ao desligar</b>
            <span>O módulo sai do menu e vai para Mais módulos. Nada é apagado.</span>
            <span>Os widgets dele saem da lista do Início, e o atalho dele some da tela inicial.</span>
            <span>A busca ({total} módulos) continua achando, e ligar de novo é um clique.</span>
          </div>
          <div className="rounded-xl bg-accent-soft px-4 py-3.5 text-[13px] leading-relaxed">
            <b className="font-semibold">Dica:</b> clique com o botão direito em qualquer item do menu para esconder ou renomear sem vir até aqui.
          </div>
          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-4 text-[13px]">
            <b className="text-[14px] font-semibold">Seu modelo</b>
            <span className="text-muted">{seg ? `Montado para ${seg.short}.` : 'Nenhum modelo: todos os módulos disponíveis.'}</span>
            <Link to="/" className="text-link hover:text-fg">Editar o painel do Início →</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
