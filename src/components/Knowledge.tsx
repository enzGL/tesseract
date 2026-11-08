// Conhecimento com editor (Grátis). Desenho escolhido em 2026-11-08: a "Sugestão" do canvas (três painéis:
// pastas e notas | a nota | vizinhas no grafo e ligações), com abas Notas, Grafo e Diário à esquerda.
// As notas são arquivos .md da pessoa; o Rust grava (src-tauri/src/notes.rs) e o índice acompanha.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, FilePlus2, Pencil, Plus, RefreshCw, Search, Eye } from 'lucide-react'
import { Link } from 'react-router'
import { pro } from '@pro'
import { Button } from './ui'
import { Markdown, plainText } from './Markdown'
import { call, indexBrain, message, useStore, type Hit, type NoteView } from '../data/api'
import {
  buildTree, folderColor, insertLink, layout, linkQuery, neighbors, newNotePath, noteName, parentsOf, suggest, todayIso,
  type Graph, type NoteItem, type Plugins, type TreeFolder,
} from '../data/notes'

type Tab = 'notas' | 'grafo' | 'diario'
const mono = 'font-mono text-[11px] font-medium tracking-[0.12em] text-faint uppercase'

// ---------- árvore ----------
function FolderRow({ f, depth, open, expanded, toggle, onOpen }: { f: TreeFolder; depth: number; open: string | null; expanded: Set<string>; toggle: (p: string) => void; onOpen: (p: string) => void }) {
  const isOpen = expanded.has(f.path)
  return (
    <li>
      <button type="button" onClick={() => toggle(f.path)} aria-expanded={isOpen} style={{ paddingLeft: 8 + depth * 14 }}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13.5px] text-muted hover:bg-hover hover:text-fg">
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className="truncate">{f.name}</span><span className="ml-auto text-[12px] text-faint">{f.count}</span>
      </button>
      {isOpen && (
        <ul>
          {f.folders.map((c) => <FolderRow key={c.path} f={c} depth={depth + 1} open={open} expanded={expanded} toggle={toggle} onOpen={onOpen} />)}
          {f.notes.map((n) => <NoteRow key={n.path} n={n} depth={depth + 1} active={open === n.path} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  )
}
function NoteRow({ n, depth, active, onOpen }: { n: NoteItem; depth: number; active: boolean; onOpen: (p: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(n.path)} aria-current={active ? 'page' : undefined} title={n.title} style={{ paddingLeft: 26 + depth * 14 }}
        className={`block w-full truncate rounded-md py-1.5 pr-2 text-left text-[13.5px] ${active ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:bg-hover hover:text-fg'}`}>{noteName(n.path)}</button>
    </li>
  )
}

// ---------- posição do cursor no textarea (para o [[ abrir a lista logo abaixo da linha) ----------
function caretPos(ta: HTMLTextAreaElement, pos: number) {
  const cs = getComputedStyle(ta)
  const div = document.createElement('div')
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'tabSize'] as const) div.style[p] = cs[p]
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${ta.clientWidth}px`, boxSizing: 'border-box' })
  div.textContent = ta.value.slice(0, pos)
  const mark = document.createElement('span')
  mark.textContent = '​'
  div.appendChild(mark)
  document.body.appendChild(div)
  const r = { top: mark.offsetTop + mark.offsetHeight + 4, left: Math.min(mark.offsetLeft, ta.clientWidth - 330) }
  div.remove()
  return r
}

// ---------- vizinhas no grafo (painel direito) ----------
function LocalGraph({ graph, path, onOpen }: { graph: Graph | null; path: string; onOpen: (p: string) => void }) {
  const nb = graph ? neighbors(graph, path) : null
  if (!graph || !nb) return <p className="text-[13px] text-faint">Esta nota ainda não está no grafo.</p>
  const shown = nb.around.slice(0, 12)
  if (!shown.length) return <p className="text-[13px] text-faint">Nenhuma ligação ainda. Use [[ para ligar outra nota.</p>
  const folders = [...new Set(graph.nodes.map(([p]) => (p.includes('/') ? p.split('/')[0] : '')).filter(Boolean))].sort()
  const W = 260, H = 200, cx = W / 2, cy = H / 2
  const pts = shown.map((i, k) => { const a = (k / shown.length) * Math.PI * 2 - Math.PI / 2; return { i, x: cx + Math.cos(a) * 88, y: cy + Math.sin(a) * 70 } })
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-card">
      <svg role="img" aria-label={`${shown.length} notas ligadas a esta`} viewBox={`0 0 ${W} ${H}`} className="block h-[200px] w-full">
        {pts.map((p) => <line key={p.i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--t-line-strong)" strokeWidth="1.3" />)}
        <circle cx={cx} cy={cy} r="9" fill="var(--t-accent)" />
        {pts.map((p) => (
          <g key={p.i} onClick={() => onOpen(graph.nodes[p.i][0])} style={{ cursor: 'pointer' }}>
            <title>{graph.nodes[p.i][1]}</title>
            <circle cx={p.x} cy={p.y} r="6" fill={folderColor(graph.nodes[p.i][0], folders)} />
            <text x={p.x} y={p.y + (p.y < cy ? -10 : 17)} textAnchor="middle" fontSize="9.5" fill="var(--t-muted)">{noteName(graph.nodes[p.i][0]).slice(0, 16)}</text>
          </g>
        ))}
      </svg>
      {nb.around.length > shown.length && <p className="px-3 pb-2 text-[12px] text-faint">e mais {nb.around.length - shown.length}</p>}
    </div>
  )
}

// ---------- grafo inteiro (aba Grafo) ----------
const MAX_NODES = 1500
function GraphView({ graph, open, onOpen }: { graph: Graph | null; open: string | null; onOpen: (p: string) => void }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const data = useMemo(() => {
    if (!graph) return null
    const deg = new Array(graph.nodes.length).fill(0)
    for (const [a, b] of graph.edges) { deg[a]++; deg[b]++ }
    // base muito grande: as mais ligadas primeiro
    let keep = graph.nodes.map((_, i) => i)
    if (keep.length > MAX_NODES) keep = keep.sort((a, b) => deg[b] - deg[a]).slice(0, MAX_NODES)
    const idx = new Map(keep.map((i, k) => [i, k]))
    const edges = graph.edges.filter(([a, b]) => idx.has(a) && idx.has(b)).map(([a, b]) => [idx.get(a)!, idx.get(b)!] as [number, number])
    const pos = layout(keep.length, edges, 1000, 700, keep.length > 600 ? 120 : 220)
    const folders = [...new Set(graph.nodes.map(([p]) => (p.includes('/') ? p.split('/')[0] : '')).filter(Boolean))].sort()
    return { keep, edges, pos, deg, folders, loose: deg.filter((d) => d === 0).length, cut: graph.nodes.length - keep.length }
  }, [graph])
  if (!graph || !data) return <p className="p-8 text-[14px] text-muted">Montando o grafo…</p>
  if (!graph.nodes.length) return <p className="p-8 text-[14px] text-muted">Nenhuma nota ainda.</p>
  const near = new Set<number>()
  if (hover != null) { near.add(hover); for (const [a, b] of data.edges) { if (a === hover) near.add(b); if (b === hover) near.add(a) } }
  // base pequena: todos os nomes; grande: só as mais ligadas, as de perto do mouse e as com zoom
  const label = (k: number) => data.keep.length <= 60 || view.k > 1.6 || data.deg[data.keep[k]] >= 4 || near.has(k) || graph.nodes[data.keep[k]][0] === open
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-3.5">
        <h2 className="font-serif text-[22px]">Sua base, ligada</h2>
        <span className="text-[13px] text-muted">{graph.nodes.length.toLocaleString('pt-BR')} notas · {graph.edges.length.toLocaleString('pt-BR')} ligações{data.loose ? ` · ${data.loose} soltas` : ''}</span>
        <span className="ml-auto text-[12.5px] text-faint">Role para aproximar, arraste para mover, clique para abrir.</span>
        <Button variant="ghost" onClick={() => setView({ x: 0, y: 0, k: 1 })}>Centralizar</Button>
      </header>
      <div className="relative min-h-[420px] flex-1 overflow-hidden"
        onWheel={(e) => setView((v) => ({ ...v, k: Math.min(6, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }))}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } }}
        onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) })) }}
        onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
        <svg role="img" aria-label="Grafo das notas e suas ligações" viewBox="0 0 1000 700" className="absolute inset-0 h-full w-full select-none">
          <g transform={`translate(${view.x} ${view.y}) translate(500 350) scale(${view.k}) translate(-500 -350)`}>
            {data.edges.map(([a, b], i) => <line key={i} x1={data.pos[a].x} y1={data.pos[a].y} x2={data.pos[b].x} y2={data.pos[b].y}
              stroke={hover != null && (near.has(a) && near.has(b)) ? 'var(--t-accent)' : 'var(--t-line-strong)'} strokeWidth={1 / Math.sqrt(view.k)} />)}
            {data.keep.map((ni, k) => {
              const [p, t] = graph.nodes[ni]
              const r = (3 + Math.sqrt(data.deg[ni]) * 1.6) / Math.sqrt(view.k)
              const dim = hover != null && !near.has(k)
              return (
                <g key={p} onClick={() => onOpen(p)} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)} style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }}>
                  <title>{t}</title>
                  <circle cx={data.pos[k].x} cy={data.pos[k].y} r={r} fill={p === open ? 'var(--t-accent)' : folderColor(p, data.folders)} stroke={p === open ? 'var(--t-fg)' : 'none'} strokeWidth="1.5" />
                  {label(k) && <text x={data.pos[k].x} y={data.pos[k].y - r - 3} textAnchor="middle" fontSize={11 / Math.sqrt(view.k)} fill="var(--t-fg)">{noteName(p).slice(0, 28)}</text>}
                </g>
              )
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-lg border border-line bg-card/95 px-3.5 py-3 text-[12.5px]">
          <span className={mono}>Cor = pasta</span>
          {data.folders.slice(0, 6).map((f) => <span key={f} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: folderColor(`${f}/x`, data.folders) }} />{f}</span>)}
          <span className="text-faint">Tamanho = quantas ligações</span>
          {data.cut > 0 && <span className="text-faint">Mostrando as {MAX_NODES} mais ligadas</span>}
        </div>
      </div>
    </div>
  )
}

// ---------- a nota: ler e editar ----------
type Status = { kind: 'ok' | 'dirty' | 'saving' | 'error' | 'conflict'; text?: string }

function NoteEditor({ path, items, graph, startEdit, onOpen, onCreateLink, onSaved }: {
  path: string; items: NoteItem[]; graph: Graph | null; startEdit: boolean
  onOpen: (p: string, edit?: boolean) => void; onCreateLink: (name: string, openIt: boolean) => void; onSaved: () => void
}) {
  const [note, setNote] = useState<NoteView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [edit, setEdit] = useState(startEdit)
  const [status, setStatus] = useState<Status>({ kind: 'ok' })
  const [links, setLinks] = useState<[string, string | null][]>([])
  const [ac, setAc] = useState<{ start: number; caret: number; query: string; top: number; left: number; sel: number } | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const saved = useRef('')
  const base = useRef<number | null>(null)
  const live = useRef({ path, text })
  live.current = { path, text }

  const save = useCallback(async (p: string, content: string) => {
    if (content === saved.current) return
    setStatus({ kind: 'saving' })
    try {
      base.current = await call<number>('note_write', { path: p, content, base: base.current })
      saved.current = content
      setStatus({ kind: 'ok' })
      call<[string, string | null][]>('note_links', { path: p }).then(setLinks).catch(() => undefined)
      onSaved()
    } catch (e) {
      const m = message(e)
      setStatus(m.includes('mudou fora') ? { kind: 'conflict', text: m } : { kind: 'error', text: m })
    }
  }, [onSaved])

  const load = useCallback(() => {
    setError(null)
    call<NoteView>('brain_read', { path }).then((n) => {
      setNote(n); setText(n.content); saved.current = n.content; base.current = n.mtime ?? null; setStatus({ kind: 'ok' })
    }).catch((e) => { setNote(null); setError(message(e)) })
    call<[string, string | null][]>('note_links', { path }).then(setLinks).catch(() => setLinks([]))
  }, [path])

  useEffect(() => {
    setEdit(startEdit); setAc(null); load()
    // ao trocar de nota (ou sair da tela), salva o que ficou pendente
    return () => { const { path: p, text: t } = live.current; if (t !== saved.current) void save(p, t) }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  // salva sozinho, pouco depois de parar de digitar
  useEffect(() => {
    if (!note || text === saved.current) return
    setStatus((s) => (s.kind === 'conflict' ? s : { kind: 'dirty' }))
    const t = setTimeout(() => { if (status.kind !== 'conflict') void save(path, text) }, 900)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // nota mudou fora (outro programa) e não há edição pendente: recarrega ao voltar para a janela
  useEffect(() => {
    const f = () => { if (live.current.text === saved.current) load() }
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [load])

  useLayoutEffect(() => { if (edit) ta.current?.focus() }, [edit, note])

  const matches = ac ? suggest(items, ac.query) : []
  const refreshAc = (el: HTMLTextAreaElement) => {
    const q = linkQuery(el.value, el.selectionStart)
    if (!q) { setAc(null); return }
    const p = caretPos(el, q.start)
    setAc((cur) => ({ start: q.start, caret: el.selectionStart, query: q.query, top: p.top, left: Math.max(0, p.left), sel: cur && cur.query === q.query ? cur.sel : 0 }))
  }
  const pick = (target: NoteItem | 'new') => {
    if (!ac || !ta.current) return
    if (target === 'new') {
      const name = ac.query.trim()
      const r = { text: `${text.slice(0, ac.start)}[[${name}]]${text.slice(ac.caret).replace(/^\]\]/, '')}`, caret: ac.start + name.length + 4 }
      setText(r.text); setAc(null)
      requestAnimationFrame(() => ta.current?.setSelectionRange(r.caret, r.caret))
      onCreateLink(name, false)
      return
    }
    const r = insertLink(text, ac.start, ac.caret, target, items)
    setText(r.text); setAc(null)
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(r.caret, r.caret) })
  }
  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(path, text); return }
    if (!ac) return
    const n = matches.length + (ac.query.trim() ? 1 : 0)
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setAc({ ...ac, sel: (ac.sel + 1) % n }) }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setAc({ ...ac, sel: (ac.sel - 1 + n) % n }) }
    else if ((e.key === 'Enter' || e.key === 'Tab') && n) { e.preventDefault(); pick(ac.sel < matches.length ? matches[ac.sel] : 'new') }
    else if (e.key === 'Escape') { e.preventDefault(); setAc(null) }
  }
  const openLink = (t: string) => {
    call<string | null>('brain_resolve', { target: t }).then((p) => { if (p) onOpen(p); else onCreateLink(t, true) }).catch(() => undefined)
  }

  const crumbs = path.split('/').slice(0, -1).join(' / ')
  const statusText = status.kind === 'ok' ? 'salvo no arquivo' : status.kind === 'saving' ? 'salvando…' : status.kind === 'dirty' ? 'editando' : status.text
  return (
    <>
      <section className="flex min-w-0 flex-[999_1_480px] flex-col overflow-y-auto px-12 py-6" aria-label="Nota">
        <div className="flex flex-wrap items-center gap-3">
          <span className={mono}>{crumbs || 'raiz'}</span>
          <span role="status" className={`ml-auto text-[12.5px] ${status.kind === 'ok' ? 'text-ok' : status.kind === 'error' || status.kind === 'conflict' ? 'text-[#B3261E] dark:text-[#FF8A80]' : 'text-muted'}`}>● {statusText}</span>
          {status.kind === 'conflict' && <Button variant="ghost" icon={RefreshCw} onClick={load}>Recarregar</Button>}
          <span className="inline-flex overflow-hidden rounded-lg border border-line-strong">
            <button type="button" aria-pressed={!edit} onClick={() => setEdit(false)} className={`inline-flex h-8 items-center gap-1.5 px-3 text-[13px] ${!edit ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}><Eye size={14} />Ler</button>
            <button type="button" aria-pressed={edit} onClick={() => setEdit(true)} className={`inline-flex h-8 items-center gap-1.5 px-3 text-[13px] ${edit ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}><Pencil size={14} />Editar</button>
          </span>
        </div>
        {error && <p className="mt-6 text-[14px] text-[#B3261E]" role="alert">{error}</p>}
        {note && !edit && (
          <div className="mt-3 max-w-[760px]" onDoubleClick={() => setEdit(true)}>
            <h1 className="mb-3 font-serif text-[32px] leading-tight">{note.title}</h1>
            <Markdown source={text} hideTitle={note.title} onLink={openLink} />
            {!text.trim() && <p className="text-[14px] text-faint">Nota vazia. Clique em Editar para escrever.</p>}
          </div>
        )}
        {note && edit && (
          <div className="relative mt-3 max-w-[760px]">
            <label><span className="sr-only">Texto da nota em Markdown</span>
              <textarea ref={ta} value={text} spellCheck
                onChange={(e) => { setText(e.target.value); refreshAc(e.target) }}
                onKeyDown={onKey} onClick={(e) => refreshAc(e.currentTarget)} onBlur={() => { setTimeout(() => setAc(null), 150); void save(path, text) }}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
                className="block min-h-[60vh] w-full resize-none bg-transparent text-[16px] leading-[1.75] outline-none" /></label>
            {ac && (matches.length > 0 || ac.query.trim()) && (
              <ul role="listbox" aria-label="Ligar a uma nota" style={{ top: ac.top, left: ac.left }}
                className="absolute z-20 w-[330px] rounded-xl border border-line-strong bg-card p-1.5 text-[13.5px] shadow-xl">
                {matches.map((m, i) => (
                  <li key={m.path} role="option" aria-selected={ac.sel === i}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m) }}
                      className={`flex w-full gap-1.5 rounded-md px-2.5 py-2 text-left ${ac.sel === i ? 'bg-accent-soft text-link' : 'hover:bg-hover'}`}>
                      <span className="truncate">{noteName(m.path)}</span><span className="truncate text-faint">· {m.path.split('/').slice(0, -1).join('/') || 'raiz'}</span>
                    </button>
                  </li>
                ))}
                {ac.query.trim() && (
                  <li role="option" aria-selected={ac.sel === matches.length}>
                    <button type="button" onMouseDown={(e) => { e.preventDefault(); pick('new') }}
                      className={`w-full rounded-md px-2.5 py-2 text-left text-link ${ac.sel === matches.length ? 'bg-accent-soft' : 'hover:bg-hover'}`}>+ Criar "{ac.query.trim()}" em inbox</button>
                  </li>
                )}
              </ul>
            )}
            <p className="mt-4 text-[12.5px] text-faint">Markdown. [[ liga outra nota, # marca título, - [ ] faz uma tarefa. Ctrl+S salva na hora; salva sozinho ao parar de digitar.</p>
          </div>
        )}
      </section>

      <aside className="flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line px-5 py-6" aria-label="Ligações da nota">
        <section>
          <h3 className={`${mono} mb-2`}>Vizinhas no grafo</h3>
          <LocalGraph graph={graph} path={path} onOpen={onOpen} />
        </section>
        <section>
          <h3 className={`${mono} mb-2`}>Quem aponta para esta nota · {note?.backlinks.length ?? 0}</h3>
          {note && note.backlinks.length === 0 && <p className="text-[13px] text-faint">Nenhuma nota liga a esta ainda.</p>}
          <ul className="flex flex-col gap-2">
            {note?.backlinks.map(([p, t]) => (
              <li key={p}><button type="button" onClick={() => onOpen(p)} className="w-full rounded-lg border border-line bg-card px-3 py-2 text-left text-[13.5px] text-link hover:border-accent">{t}<span className="block truncate font-mono text-[11px] text-faint">{p}</span></button></li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className={`${mono} mb-2`}>Esta nota liga · {links.length}</h3>
          <div className="flex flex-wrap gap-1.5">
            {links.map(([t, p]) => p
              ? <button key={t} type="button" onClick={() => onOpen(p)} className="rounded-md bg-raised px-2 py-1 text-[13px] text-link hover:bg-hover">{t}</button>
              : <button key={t} type="button" onClick={() => onCreateLink(t, true)} title="Essa nota ainda não existe: clique para criar no inbox" className="rounded-md bg-[#FFF4D6] px-2 py-1 text-[13px] text-[#7A5A00] dark:bg-[#3A2E0A] dark:text-[#F0D58A]">{t} · criar</button>)}
          </div>
        </section>
        {pro.built && <p className="rounded-lg border border-dashed border-line-strong p-3 text-[13px] leading-snug text-muted">Pergunte a esta nota e às vizinhas no Chat (Ctrl+J), com as fontes.</p>}
      </aside>
    </>
  )
}

// ---------- a tela ----------
export function Knowledge({ vault, initial }: { vault: string; initial: string | null }) {
  const { index } = useStore()
  const [items, setItems] = useState<NoteItem[]>([])
  const [graph, setGraph] = useState<Graph | null>(null)
  const [plugins, setPlugins] = useState<Plugins | null>(null)
  const [showPlugins, setShowPlugins] = useState(false)
  const [tab, setTab] = useState<Tab>('notas')
  const [open, setOpen] = useState<{ path: string; edit: boolean } | null>(initial ? { path: initial, edit: false } : null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(() => {
    call<NoteItem[]>('notes_list').then(setItems).catch(() => undefined)
    call<Graph>('notes_graph').then(setGraph).catch(() => undefined)
  }, [])
  useEffect(() => { refresh() }, [refresh, index.last])
  useEffect(() => { call<Plugins>('notes_plugins').then(setPlugins).catch(() => undefined) }, [vault])
  // ao voltar para a janela, o índice pega o que mudou fora (outro editor, sincronização)
  useEffect(() => { const f = () => void indexBrain(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [])
  useEffect(() => { if (initial) setOpen({ path: initial, edit: false }) }, [initial])

  // primeira abertura: o LEIA-ME, se houver
  useEffect(() => {
    if (open || !items.length) return
    const first = items.find((i) => /^leia-me\.md$/i.test(i.path)) ?? items.find((i) => !i.path.includes('/')) ?? items[0]
    setOpen({ path: first.path, edit: false })
  }, [items, open])
  // a árvore abre até a nota aberta
  useEffect(() => { if (open) setExpanded((s) => new Set([...s, ...parentsOf(open.path)])) }, [open])

  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    let alive = true
    const t = setTimeout(() => {
      call<{ hits: Hit[] }>('brain_search_hybrid', { query: q, limit: 30 }).then((r) => { if (alive) setHits(r.hits) })
        .catch(() => call<Hit[]>('brain_search', { query: q, limit: 30 }).then((h) => { if (alive) setHits(h) }).catch(() => setHits([])))
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [q, index.last])

  const tree = useMemo(() => buildTree(items), [items])
  const days = useMemo(() => items.filter((i) => /^diario\/\d{4}-\d{2}-\d{2}\.md$/.test(i.path)).sort((a, b) => b.path.localeCompare(a.path)), [items])
  const go = useCallback((p: string, edit = false) => { setOpen({ path: p, edit }); setTab((t) => (t === 'grafo' ? 'notas' : t)) }, [])
  const toggle = (p: string) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })

  const createNote = async (name: string, openIt = true) => {
    const p = newNotePath(name)
    if (!p) return
    setErr(null)
    try {
      const exists = items.find((i) => i.path.toLowerCase() === p.toLowerCase())
      if (!exists) await call('note_create', { path: p, content: `# ${noteName(p)}\n\n` })
      refresh(); if (openIt) go(p, true)
    } catch (e) { setErr(message(e)) }
  }
  const daily = async () => {
    setErr(null)
    try { const p = await call<string>('note_daily', { day: todayIso() }); refresh(); setOpen({ path: p, edit: true }) } catch (e) { setErr(message(e)) }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`h-8 flex-1 text-[13px] ${tab === t ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:text-fg'}`}>{label}</button>
  )

  return (
    <div className="flex h-full min-h-[600px]">
      <aside className="flex w-[268px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-raised/40 px-3 py-4" aria-label="Pastas e notas">
        <div role="tablist" aria-label="Ver" className="flex overflow-hidden rounded-lg border border-line-strong">
          {tabBtn('notas', 'Notas')}{tabBtn('grafo', 'Grafo')}{tabBtn('diario', 'Diário')}
        </div>
        <div className="flex gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-card px-2.5 focus-within:border-accent">
            <Search size={14} className="shrink-0 text-muted" /><span className="sr-only">Buscar nas notas</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas notas" className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          <Button variant="primary" icon={Plus} ariaLabel="Nota nova" onClick={() => setNaming('')} />
        </div>
        {naming != null && (
          <form onSubmit={(e) => { e.preventDefault(); const n = naming; setNaming(null); void createNote(n) }} className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2.5">
            <label className="text-[12.5px] text-muted">Nome da nota nova (vai para o inbox)
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }}
                className="mt-1 h-9 w-full rounded-md border border-line-strong bg-raised px-2.5 text-[13.5px] text-fg outline-none focus:border-accent" /></label>
            <div className="flex gap-2"><Button variant="primary" icon={FilePlus2}>Criar</Button><Button variant="ghost" onClick={() => setNaming(null)}>Cancelar</Button></div>
          </form>
        )}
        <Button icon={CalendarDays} onClick={() => void daily()}>Nota do dia · {todayIso().slice(8, 10)}/{todayIso().slice(5, 7)}</Button>
        {err && <p className="text-[12.5px] text-[#B3261E]" role="alert">{err}</p>}

        {q.trim() ? (
          <ul className="flex flex-col gap-1.5" aria-label="Resultados">
            {hits.length === 0 && <li className="px-1 text-[13px] text-faint">Nada encontrado.</li>}
            {hits.map((h) => (
              <li key={h.path}><button type="button" onClick={() => go(h.path)} className={`w-full rounded-lg border bg-card p-2.5 text-left hover:border-accent ${open?.path === h.path ? 'border-accent' : 'border-line'}`}>
                <span className="block truncate text-[13.5px] font-medium">{h.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{plainText(h.snippet).replace(/[\u0002\u0003]/g, '')}</span>
              </button></li>
            ))}
          </ul>
        ) : tab === 'diario' ? (
          <ul className="flex flex-col gap-0.5" aria-label="Dias">
            {days.length === 0 && <li className="px-1 text-[13px] text-faint">Nenhuma nota do dia ainda.</li>}
            {days.map((d) => { const day = d.path.slice(7, 17); return (
              <li key={d.path}><button type="button" onClick={() => go(d.path)} aria-current={open?.path === d.path ? 'page' : undefined}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-[13.5px] ${open?.path === d.path ? 'bg-accent-soft font-medium text-link' : 'text-muted hover:bg-hover hover:text-fg'}`}>
                {new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</button></li>
            ) })}
          </ul>
        ) : (
          <ul aria-label="Pastas">
            {tree.folders.map((f) => <FolderRow key={f.path} f={f} depth={0} open={open?.path ?? null} expanded={expanded} toggle={toggle} onOpen={(p) => go(p)} />)}
            {tree.notes.map((n) => <NoteRow key={n.path} n={n} depth={-1} active={open?.path === n.path} onOpen={(p) => go(p)} />)}
          </ul>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {plugins && (plugins.notes.length > 0 || plugins.canvas > 0) && (
            <div className="rounded-lg border border-[#F0D58A] bg-[#FFF8E3] p-2.5 text-[12.5px] leading-snug text-[#5C4300] dark:border-[#5C4A12] dark:bg-[#2A2208] dark:text-[#F0D58A]">
              Veio do Obsidian: {plugins.notes.length ? `${plugins.notes.length} nota(s) têm blocos de plugin, que aparecem como texto` : ''}{plugins.notes.length && plugins.canvas ? '; ' : ''}{plugins.canvas ? `${plugins.canvas} arquivo(s) .canvas ficam de fora` : ''}. O arquivo não muda.
              {plugins.notes.length > 0 && <button type="button" onClick={() => setShowPlugins((s) => !s)} className="ml-1 underline">{showPlugins ? 'Esconder' : 'Ver quais'}</button>}
              {showPlugins && <ul className="mt-1.5 flex flex-col gap-0.5">{plugins.notes.slice(0, 60).map((p) => <li key={p}><button type="button" onClick={() => go(p)} className="truncate text-left underline">{p}</button></li>)}</ul>}
            </div>
          )}
          <div className="flex items-center gap-2 px-1 text-[12px] text-faint">
            <span className="min-w-0 flex-1 truncate" title={vault}>{items.length.toLocaleString('pt-BR')} notas · {vault}</span>
            <button type="button" onClick={() => void indexBrain()} aria-label="Atualizar a lista com o que mudou na pasta" title="Atualizar" className="grid size-7 place-items-center rounded-md hover:bg-hover"><RefreshCw size={13} className={index.running ? 'animate-spin' : ''} /></button>
            <Link to="/guia" aria-label="Guia da base de conhecimento" title="Guia" className="grid size-7 place-items-center rounded-md hover:bg-hover"><BookOpen size={13} /></Link>
          </div>
        </div>
      </aside>

      {tab === 'grafo' ? (
        <section className="min-w-0 flex-1" aria-label="Grafo"><GraphView graph={graph} open={open?.path ?? null} onOpen={(p) => go(p)} /></section>
      ) : open ? (
        <NoteEditor key={open.path} path={open.path} startEdit={open.edit} items={items} graph={graph}
          onOpen={go} onCreateLink={(name, openIt) => void createNote(name, openIt)} onSaved={refresh} />
      ) : (
        <section className="grid flex-1 place-items-center p-10 text-center text-[14px] text-muted">
          <div className="flex flex-col items-center gap-3">{items.length ? 'Escolha uma nota à esquerda.' : 'Nenhuma nota ainda.'}<Button variant="primary" icon={Plus} onClick={() => setNaming('')}>Nota nova</Button></div>
        </section>
      )}
    </div>
  )
}
