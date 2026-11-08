// Painel do Início montável: grade de 12 colunas,
// arrastar pelo título, puxar o canto para mudar o tamanho, os outros cartões abrem espaço.
// Teclado: no botão de mover, setas movem uma casa e Shift + setas mudam o tamanho.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, GripVertical, LayoutGrid, Plus, Trash2, X } from 'lucide-react'
import { setSetting, useScopes, useStore } from '../data/api'
import {
  COLS, MAX_H, WIDGETS, addWidget, homeFor, minW, readHome, saveHome, segmentOf, settle, useMenu, widgetDef,
  type HomeBoard, type HomeConfig, type Placed, type WidgetId,
} from '../data/layout'
import { WIDGET_LINK, WidgetBody } from './HomeWidgets'
import { PREV_SEGMENT } from '../app/SegmentPicker'

const ROW = 92
const GAP = 12
const store = { get: (k: string, d: string) => { try { return localStorage.getItem(k) || d } catch { return d } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } } }

type Drag = { id: WidgetId; mode: 'move' | 'resize'; sx: number; sy: number; base: Placed[]; orig: Placed; dx: number; dy: number }

const cell = (p: Placed): CSSProperties => ({ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` })
const btn = 'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium transition-colors'

export function HomePanel() {
  const navigate = useNavigate()
  const { settings } = useStore()
  const { visible } = useMenu()
  const seg = segmentOf(settings['ui.segment'])
  const saved = readHome(settings['ui.home'], seg)
  const scopes = useScopes()
  const [scope, setScopeS] = useState(() => store.get('tesseract.home.scope', 'personal'))
  const setScope = (s: string) => { setScopeS(s); store.set('tesseract.home.scope', s) }

  const [draft, setDraft] = useState<HomeConfig | null>(null)
  const editing = draft !== null
  const home = draft ?? saved
  const board = home.boards.find((b) => b.id === home.current) ?? home.boards[0]
  const shown = (w: Placed) => { const d = widgetDef(w.id); return !!d && visible(d.module) }
  const items = editing ? board.widgets : settle(board.widgets.filter(shown))

  const setItems = (widgets: Placed[]) => setDraft((d) => d && ({ ...d, boards: d.boards.map((b) => (b.id === d.current ? { ...b, widgets } : b)) }))
  const startEdit = () => setDraft({ ...saved, boards: saved.boards.map((b) => ({ ...b, widgets: settle(b.widgets.filter(shown)) })) })
  const save = async () => { if (draft) { await saveHome(draft); setDraft(null) } }
  const pickBoard = (id: string) => { if (draft) setDraft({ ...draft, current: id }); else void saveHome({ ...saved, current: id }) }

  // ---------- arrastar e redimensionar ----------
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const step = () => { const w = grid.current?.getBoundingClientRect().width ?? 1200; const cw = (w - GAP * (COLS - 1)) / COLS; return { x: cw + GAP, y: ROW + GAP, cw } }

  const target = (d: Drag): Placed[] => {
    const s = step()
    const nx = Math.round(d.dx / s.x), ny = Math.round(d.dy / s.y)
    const moved: Placed = d.mode === 'move'
      ? { ...d.orig, x: d.orig.x + nx, y: d.orig.y + ny }
      : { ...d.orig, w: d.orig.w + nx, h: d.orig.h + ny }
    return settle(d.base.map((i) => (i.id === d.id ? moved : i)), d.id)
  }
  const preview = drag ? target(drag) : items

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => { const d = dragRef.current; if (d) setDrag({ ...d, dx: e.clientX - d.sx, dy: e.clientY - d.sy }) }
    const up = () => { const d = dragRef.current; if (d) setItems(target(d)); setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (e: RPointerEvent, id: WidgetId, mode: Drag['mode']) => {
    if (!editing || e.button !== 0) return
    e.preventDefault()
    const orig = items.find((i) => i.id === id)!
    setDrag({ id, mode, sx: e.clientX, sy: e.clientY, base: items, orig, dx: 0, dy: 0 })
  }
  const nudge = (e: KeyboardEvent, p: Placed) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!k) return
    e.preventDefault()
    const n = e.shiftKey ? { ...p, w: p.w + k[0], h: p.h + k[1] } : { ...p, x: p.x + k[0], y: p.y + k[1] }
    setItems(settle(items.map((i) => (i.id === p.id ? n : i)), p.id))
  }

  const rows = Math.max(2, ...preview.map((p) => p.y + p.h)) + (editing ? 2 : 0)
  const s = drag?.mode === 'move' ? step() : null
  const lifted = drag && s ? {
    left: drag.orig.x * s.x + drag.dx, top: drag.orig.y * s.y + drag.dy,
    width: drag.orig.w * s.x - GAP, height: drag.orig.h * s.y - GAP,
  } : null

  const card = (p: Placed, style: CSSProperties, extra = '') => {
    const d = widgetDef(p.id)!
    const link = WIDGET_LINK[p.id]
    return (
      <article key={p.id} style={style} aria-label={d.name}
        className={`relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-xl border bg-card p-4 ${editing ? 'border-line-strong' : 'border-line'} ${extra}`}>
        <header className="flex items-center gap-2">
          {editing && (
            <button type="button" onPointerDown={(e) => begin(e, p.id, 'move')} onKeyDown={(e) => nudge(e, p)}
              aria-label={`Mover ${d.name}. Setas movem; Shift e setas mudam o tamanho`} title="Arraste para mover"
              className="-ml-1.5 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-raised hover:text-fg active:cursor-grabbing">
              <GripVertical size={15} />
            </button>
          )}
          <h3 onPointerDown={(e) => begin(e, p.id, 'move')} className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${editing ? 'cursor-grab touch-none select-none' : ''}`}>{d.name}</h3>
          {!editing && link && <Link to={link} className="shrink-0 text-[12.5px] text-link hover:text-fg">Abrir</Link>}
          {editing && (
            <button type="button" onClick={() => setItems(settle(items.filter((i) => i.id !== p.id)))} aria-label={`Tirar ${d.name} do painel`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"><X size={15} /></button>
          )}
        </header>
        <div className={`min-h-0 flex-1 overflow-hidden ${editing ? 'pointer-events-none opacity-90' : ''}`}><WidgetBody id={p.id} scope={scope} visible={visible} /></div>
        {editing && (
          <span onPointerDown={(e) => begin(e, p.id, 'resize')} aria-hidden="true" title="Puxe para mudar o tamanho"
            className="absolute right-1 bottom-1 size-4 cursor-se-resize touch-none border-r-2 border-b-2 border-accent dark:border-link" style={{ borderBottomRightRadius: 4 }} />
        )}
      </article>
    )
  }

  const closed = settings['ui.banner.closed'] === true
  return (
    <section className="flex flex-col gap-4" aria-label="Seu painel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-[22px]">{editing ? 'Editando o Início' : board.name}</h2>
          <p className="mt-1 text-[13px] text-muted">{editing ? 'Arraste pelo título para mover · puxe o canto para mudar o tamanho · os outros cartões abrem espaço sozinhos' : 'Seu painel. Mude o que aparece aqui em Editar painel.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scopes.length > 1 && !editing && (
            <div role="tablist" aria-label="Escopo do painel" className="flex rounded-lg border border-line bg-raised p-0.5">
              {scopes.map((x) => <button key={x.id} type="button" role="tab" aria-selected={scope === x.id} onClick={() => setScope(x.id)}
                className={`h-8 rounded-md px-3 text-[13px] ${scope === x.id ? 'bg-card font-medium text-fg shadow-sm' : 'text-muted hover:text-fg'}`}>{x.name}</button>)}
            </div>
          )}
          {home.boards.length > 1 && (
            <label className="flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-card px-2.5 text-[13px]">
              <span className="text-muted">Painel</span>
              <select value={home.current} onChange={(e) => pickBoard(e.target.value)} className="bg-transparent font-medium outline-none">
                {home.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          {editing ? <>
            <button type="button" onClick={() => setItems(homeFor(seg).boards[0].widgets.filter(shown))} className={`${btn} border border-line-strong bg-card hover:bg-raised`}>Restaurar padrão</button>
            <button type="button" onClick={() => setDraft(null)} className={`${btn} text-muted hover:bg-raised hover:text-fg`}>Cancelar</button>
            <button type="button" onClick={() => void save()} className={`${btn} bg-accent text-on-accent hover:bg-accent-strong`}>Salvar disposição</button>
          </> : (
            <button type="button" onClick={startEdit} className={`${btn} border border-line-strong bg-card hover:bg-raised`}><LayoutGrid size={15} strokeWidth={1.7} />Editar painel</button>
          )}
        </div>
      </div>

      {!editing && seg && !closed && (
        <div className="anim-rise flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-card px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent"><seg.icon size={18} strokeWidth={1.7} /></span>
          <div className="min-w-[260px] flex-1">
            <p className="text-[14px] font-semibold">Montado para {seg.short}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">Menu, quadro {seg.board} e estes widgets vieram do modelo. {seg.extra}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate('/personalizar')} className={`${btn} h-8 border border-line-strong bg-panel text-[13px] font-normal hover:bg-raised`}>Ajustar menu</button>
            <button type="button" onClick={() => { store.set(PREV_SEGMENT, seg.id); void setSetting('ui.segment', '') }} className={`${btn} h-8 border border-line-strong bg-panel text-[13px] font-normal hover:bg-raised`}>Trocar de modelo</button>
            <button type="button" onClick={() => void setSetting('ui.banner.closed', true)} aria-label="Fechar aviso" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"><X size={15} /></button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="relative min-w-0 flex-[999_1_620px]">
          {editing && (
            <div aria-hidden="true" className="absolute inset-0 grid gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${ROW}px)` }}>
              {Array.from({ length: rows * COLS }, (_, i) => <span key={i} className="rounded-[10px] border border-dashed border-line bg-raised/50" />)}
            </div>
          )}
          <div ref={grid} className="relative grid gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${ROW}px)` }}>
            {preview.map((p) => (drag?.mode === 'move' && p.id === drag.id
              ? <div key={p.id} style={cell(p)} className="flex items-end rounded-xl border-2 border-dashed border-accent bg-accent/5 px-3.5 py-2.5 font-mono text-[11px] tracking-[0.1em] text-accent dark:text-link">SOLTAR AQUI · {p.w} × {p.h}</div>
              : card(p, cell(p), drag?.id === p.id ? 'ring-2 ring-accent' : 'transition-[grid-area]')))}
            {!preview.length && (
              <div className="col-span-full row-span-2 grid place-items-center rounded-xl border border-dashed border-line-strong text-center">
                <div>
                  <p className="text-[14px] text-muted">Seu Início está vazio.</p>
                  {!editing && <button type="button" onClick={startEdit} className="mt-2 text-[14px] text-link hover:text-fg">Escolher widgets</button>}
                </div>
              </div>
            )}
            {lifted && drag && card(drag.orig, { position: 'absolute', ...lifted, zIndex: 20, transform: 'rotate(-1.2deg)' }, 'pointer-events-none border-accent shadow-[0_18px_40px_rgba(20,32,87,0.25)]')}
          </div>
        </div>

        {editing && draft && <Palette draft={draft} setDraft={setDraft} items={items} setItems={setItems} visible={visible} />}
      </div>
    </section>
  )
}

function Palette({ draft, setDraft, items, setItems, visible }: {
  draft: HomeConfig; setDraft: (h: HomeConfig) => void; items: Placed[]; setItems: (w: Placed[]) => void; visible: (p: string) => boolean
}) {
  const [q, setQ] = useState('')
  const on = new Set(items.map((i) => i.id))
  const list = WIDGETS.filter((w) => visible(w.module) && `${w.name} ${w.about}`.toLowerCase().includes(q.toLowerCase()))
  const board = draft.boards.find((b) => b.id === draft.current)!
  const rename = (name: string) => setDraft({ ...draft, boards: draft.boards.map((b) => (b.id === board.id ? { ...b, name } : b)) })
  const add = () => {
    const id = `p${Date.now().toString(36)}`
    const b: HomeBoard = { id, name: `Painel ${draft.boards.length + 1}`, widgets: [] }
    setDraft({ current: id, boards: [...draft.boards, b] })
  }
  const remove = () => {
    const boards = draft.boards.filter((b) => b.id !== board.id)
    if (boards.length) setDraft({ current: boards[0].id, boards })
  }
  return (
    <div role="group" aria-label="Widgets e painéis salvos" className="anim-rise flex max-w-[340px] min-w-[260px] flex-[1_1_280px] flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
        <div>
          <p className="text-[15px] font-semibold">Widgets</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Só aparecem os dos módulos que estão no seu menu.</p>
        </div>
        <label className="flex h-9 items-center rounded-lg border border-line-strong bg-raised px-3">
          <span className="sr-only">Buscar widget</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar widget" className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
        </label>
        <ul className="flex flex-col gap-1.5">
          {list.map((w) => {
            const placed = on.has(w.id)
            return (
              <li key={w.id} className={`flex items-center gap-3 rounded-lg border border-line px-3 py-2 ${placed ? 'bg-raised' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{w.name}</span>
                  <span className="block truncate text-[12px] text-muted">{w.about} · {w.w} × {w.h}</span>
                </span>
                {placed
                  ? <button type="button" onClick={() => setItems(settle(items.filter((i) => i.id !== w.id)))} className="shrink-0 text-[12.5px] text-muted hover:text-fg">Tirar</button>
                  : <button type="button" onClick={() => setItems(addWidget(items, w.id))} className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-link hover:text-fg"><Plus size={13} />Adicionar</button>}
              </li>
            )
          })}
          {!list.length && <li className="py-3 text-center text-[13px] text-muted">Nenhum widget com esse nome.</li>}
        </ul>
        <Link to="/personalizar" className="flex items-center gap-1 text-[12.5px] text-link hover:text-fg">Ligar outros módulos no menu <ArrowRight size={13} /></Link>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4">
        <p className="text-[15px] font-semibold">Painéis salvos</p>
        <p className="text-[12.5px] leading-snug text-muted">Um Início para cada momento. O app abre no último que você usou.</p>
        {draft.boards.map((b) => (
          <button key={b.id} type="button" onClick={() => setDraft({ ...draft, current: b.id })}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ${b.id === draft.current ? 'bg-accent-soft font-medium' : 'border border-line hover:bg-raised'}`}>
            <span className="truncate">{b.name}</span><span className="shrink-0 text-[12px] text-muted">{b.id === draft.current ? 'editando' : `${b.widgets.length} widgets`}</span>
          </button>
        ))}
        <label className="mt-1 flex flex-col gap-1">
          <span className="text-[12px] text-muted">Nome deste painel</span>
          <input value={board.name} onChange={(e) => rename(e.target.value)} className="h-9 rounded-lg border border-line-strong bg-raised px-3 text-[13.5px] outline-none focus:border-accent" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={add} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[13px] text-link hover:bg-raised"><Plus size={14} />Novo painel</button>
          {draft.boards.length > 1 && <button type="button" onClick={remove} aria-label="Apagar este painel" title="Apagar este painel" className="grid size-9 place-items-center rounded-lg border border-line-strong text-muted hover:bg-raised hover:text-fg"><Trash2 size={14} /></button>}
        </div>
      </div>
      <p className="px-1 text-[12px] leading-snug text-faint">Tamanho de {Math.min(...WIDGETS.map((w) => minW(w.id)))} a {COLS} colunas e de 1 a {MAX_H} linhas.</p>
    </div>
  )
}
