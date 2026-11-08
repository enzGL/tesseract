import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent } from 'react'
import { ago, late, useCloudStatus, when } from '../data/cloud'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { ArrowUp, BadgeCheck, BookOpen, ChevronDown, Circle, Keyboard, Loader2, Lock, Moon, MoreHorizontal, PanelLeft, Search, Sun, X } from 'lucide-react'
import { ALL_MODULES, SETTINGS, type Module } from './nav'
import { hideModule, keepAll, labelOf, renameModule, showModule, useMenu, type MenuConfig, type ShownModule } from '../data/layout'
import { SegmentPicker } from './SegmentPicker'
import { call, message, PROVIDERS, setSetting, useScopes, useStore, type Prepared, type Provider, type Source } from '../data/api'
import { Logo, useTheme } from './theme'
import { capture, comboOf, useBindings, type ActionId } from './shortcuts'
import { version as APP_VERSION } from '../../package.json'
import { Welcome, type WelcomeChoice } from './Welcome'
import { UpdateBanner } from '../components/Updates'
import { useReminders } from './reminders'
import { TimerMini } from '../components/TimerMini'
import { TIMER_FOCUS, stopTimer, useRunning } from '../data/hours'
import { TutorialCoach } from '../components/TutorialCoach'
import { lockNow, useSecurity } from '../data/security'
import { useSyncStatus } from '../data/sync'
import { useVocab } from '../data/vocab'
import { loadCtx, understand, type Action, type Ctx } from '../data/commands'
import { ActionPlan, DoneList } from '../components/ActionCard'
import { pro } from '@pro'
import { ActivationHost } from '../components/License'
import { useLicense } from '../data/license'

// "0.1.0" vira "0.1": a versão aparece discreta ao lado do seletor de escopo.
const APP_VERSION_SHORT = APP_VERSION.split('.').slice(0, 2).join('.')

// Evento usado pela caixa de pedido do Início para mandar texto ao Chat.
export const ASK_EVENT = 'tesseract:ask'
/** Manda ao Chat. `onlyAsk`: a pessoa escolheu perguntar, não fazer (o Chat não oferece o cartão de ação). */
export const askTesseract = (text: string, onlyAsk = false) => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text, onlyAsk } }))

const navItem = (active: boolean, collapsed: boolean) =>
  `flex h-9 items-center gap-3 rounded-lg text-[14px] transition-colors ${collapsed ? 'justify-center' : 'px-2.5'} ${active ? 'bg-raised text-fg' : 'text-muted hover:bg-raised hover:text-fg'}`

function Item({ m, collapsed, onMenu }: { m: Module; collapsed: boolean; onMenu?: (e: RMouseEvent) => void }) {
  return (
    <NavLink to={m.path} end={m.path === '/'} title={collapsed ? m.label : undefined} onContextMenu={onMenu} className={({ isActive }) => navItem(isActive, collapsed)}>
      <m.icon size={16} strokeWidth={1.7} className="shrink-0" />
      {!collapsed && <span className="truncate">{m.label}</span>}
    </NavLink>
  )
}

// Paleta de comandos (Ctrl+K): filtra módulos e navega.
function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const { cfg } = useMenu()
  // a busca acha também os módulos guardados em "Mais módulos", pelo nome novo ou pelo original
  const results = useMemo(() => ALL_MODULES.map((m) => ({ ...m, label: labelOf(m, cfg), original: m.label }))
    .filter((m) => `${m.label} ${m.original} ${m.summary}`.toLowerCase().includes(q.toLowerCase())), [q, cfg])
  const go = (m?: Module) => { if (m) { navigate(m.path); onClose() } }
  return (
    <div className="anim-fade fixed inset-0 z-50 grid place-items-start justify-center bg-[#080E22]/50 pt-[18vh]" style={{ animationDuration: '.2s' }} onMouseDown={onClose}>
      <div role="dialog" aria-label="Buscar" className="anim-rise w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl" style={{ animationDuration: '.25s' }} onMouseDown={(e) => e.stopPropagation()}>
        <label className="flex h-12 items-center gap-3 border-b border-line px-4 text-muted">
          <Search size={16} />
          <span className="sr-only">Buscar</span>
          <input autoFocus value={q} placeholder="Buscar módulos, notas, clientes..."
            onChange={(e) => { setQ(e.target.value); setI(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
              if (e.key === 'Enter') go(results[i])
            }}
            className="flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint" />
          <kbd className="rounded border border-line-strong px-1.5 text-[11px]">Esc</kbd>
        </label>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-muted">Nada encontrado.</li>}
          {results.map((m, k) => (
            <li key={m.path}>
              <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(m)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${k === i ? 'bg-hover' : ''}`}>
                <m.icon size={16} className="text-muted" />
                <span className="text-[14px]">{m.label}</span>
                <span className="ml-auto truncate text-[12.5px] text-faint">{m.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const SCOPES = useScopes()
  const [scope, setScope] = useState('personal')
  const [open, setOpen] = useState(false)
  const current = SCOPES.find((s) => s.id === scope) ?? SCOPES[0]
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={current.name}
        className={`flex h-10 w-full items-center gap-2.5 rounded-lg text-[14px] transition-colors hover:bg-raised ${collapsed ? 'justify-center' : 'px-2'}`}>
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-hover text-[12px] font-semibold">{current.name.slice(0, 1)}</span>
        {!collapsed && <>
          <span className="truncate">{current.name}</span>
          <span className="ml-auto font-mono text-[10.5px] tracking-wide text-faint" title={`Tesseract ${APP_VERSION}`}>v{APP_VERSION_SHORT}</span>
          <ChevronDown size={14} className="text-muted" />
        </>}
      </button>
      {open && (
        <div className="anim-rise absolute bottom-12 left-0 z-30 w-56 rounded-xl border border-line-strong bg-raised p-1 shadow-2xl" style={{ animationDuration: '.2s' }}>
          <div className="px-3 pt-2 pb-1 text-[12px] text-faint">Escopo</div>
          {SCOPES.map((s) => (
            <button key={s.id} type="button" onClick={() => { setScope(s.id); setOpen(false) }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] hover:bg-hover ${s.id === scope ? 'text-fg' : 'text-muted'}`}>
              {s.name}
              {s.id === scope && <Circle size={7} className="fill-accent text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Card promocional no rodapé da sidebar (padrão bolt "Refer & earn"), aqui para configurar a IA.
function SetupCard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="anim-rise relative overflow-hidden rounded-xl border border-line bg-card">
      <button type="button" onClick={onClose} aria-label="Fechar" className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"><X size={14} /></button>
      <div className="hero-sky relative grid h-24 place-items-center overflow-hidden">
        <Logo animated className="h-20 w-20" />
      </div>
      <div className="p-3">
        <p className="font-serif text-[14px]">Conecte o que você sabe</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">Monte sua base de conhecimento em quatro passos, ou conecte as notas que você já tem.</p>
        <button type="button" onClick={() => navigate('/cerebro')} className="mt-3 h-8 w-full rounded-md bg-accent text-[13px] font-semibold tracking-[0.04em] text-on-accent transition-colors hover:bg-accent-strong">Começar</button>
      </div>
    </div>
  )
}

const PROMO_KEY = 'tesseract.promo.closed'

function Sidebar({ collapsed, onToggle, onSearch }: { collapsed: boolean; onToggle: () => void; onSearch: () => void }) {
  // Cartão de boas-vindas: some quando há cérebro conectado ou quando a pessoa fecha (lembrado entre aberturas).
  const { settings } = useStore()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(PROMO_KEY) === '1')
  const promo = !dismissed && !settings['vault.path']
  const closePromo = () => { localStorage.setItem(PROMO_KEY, '1'); setDismissed(true) }
  const { theme, toggle } = useTheme()
  const keys = useBindings()
  const menu = useMenu()
  const [more, setMore] = useState(false)
  const [ctx, setCtx] = useState<{ m: ShownModule; hidden: boolean; x: number; y: number } | null>(null)
  const openMenu = (m: ShownModule, hidden: boolean) => (e: RMouseEvent) => { e.preventDefault(); setCtx({ m, hidden, x: e.clientX, y: e.clientY }) }
  return (
    <aside className={`flex shrink-0 flex-col px-3 pt-4 pb-3 transition-[width] duration-300 ${collapsed ? 'w-[68px]' : 'w-[260px]'}`}>
      {ctx && <ItemMenu {...ctx} cfg={menu.cfg} onClose={() => setCtx(null)} />}
      <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between px-1'}`}>
        <NavLink to="/" className="flex items-center gap-2.5" aria-label="Tesseract, início">
          <Logo className="size-8" />
          {!collapsed && <span className="font-serif text-[18px] tracking-[-0.01em] text-accent dark:text-link">Tesseract</span>}
        </NavLink>
        <div className={`flex ${collapsed ? 'flex-col' : ''} gap-0.5`}>
          <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-fg">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" onClick={onToggle} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-fg"><PanelLeft size={16} /></button>
        </div>
      </div>

      <nav aria-label="Módulos" className="mt-5 flex flex-1 flex-col overflow-y-auto">
        <button type="button" onClick={onSearch} title={collapsed ? `Buscar (${keys.palette})` : undefined} className={navItem(false, collapsed)}>
          <Search size={16} strokeWidth={1.7} className="shrink-0" />
          {!collapsed && <><span>Buscar</span><span className="ml-auto text-[12px] text-faint">{keys.palette}</span></>}
        </button>
        {menu.sections.map((s, k) => (
          <div key={k} className="mt-1 flex flex-col gap-0.5">
            {s.label && (collapsed ? <div className="mx-2 my-2 border-t border-line" /> : <div className="px-2.5 pt-3 pb-1 text-[12.5px] text-faint">{s.label}</div>)}
            {s.items.map((m) => <Item key={m.path} m={m} collapsed={collapsed} onMenu={openMenu(m, false)} />)}
          </div>
        ))}
        {menu.more.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            <button type="button" onClick={() => setMore((o) => !o)} aria-expanded={more} title={collapsed ? `Mais módulos (${menu.more.length})` : undefined} className={navItem(false, collapsed)}>
              <MoreHorizontal size={16} strokeWidth={1.7} className="shrink-0" />
              {!collapsed && <><span>Mais módulos</span><span className="ml-auto text-[12px] text-faint">{menu.more.length}</span></>}
            </button>
            {more && menu.more.map((m) => <Item key={m.path} m={m} collapsed={collapsed} onMenu={openMenu(m, true)} />)}
          </div>
        )}
        <div className="mx-1 my-3 border-t border-line" />
        <Item m={SETTINGS} collapsed={collapsed} />
        <PlanItem collapsed={collapsed} />
        <NavLink to="/atalhos" title={collapsed ? 'Atalhos' : undefined} className={({ isActive }) => navItem(isActive, collapsed)}><Keyboard size={16} strokeWidth={1.7} className="shrink-0" />{!collapsed && 'Atalhos'}</NavLink>
        <NavLink to="/guia" title={collapsed ? 'Guia do Tesseract' : undefined} className={({ isActive }) => navItem(isActive, collapsed)}><BookOpen size={16} strokeWidth={1.7} className="shrink-0" />{!collapsed && 'Guia do Tesseract'}</NavLink>
      </nav>

      <div className="flex flex-col gap-2 pt-3">
        {pro.built && <TimerMini collapsed={collapsed} />}
        {!collapsed && promo && <SetupCard onClose={closePromo} />}
        <SyncLine collapsed={collapsed} />
        <CloudLine collapsed={collapsed} />
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <div className="min-w-0 flex-1"><WorkspaceSwitcher collapsed={collapsed} /></div>
          <LockButton />
        </div>
      </div>
    </aside>
  )
}

// ---------- Tesseract Chat: pergunta → trechos das notas → (consentimento) → resposta com fontes ----------
type Msg =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'tesseract'; text: string; sources?: Source[]; provider?: Provider }
  | { id: number; from: 'notice'; text: string; sources?: Source[] }
  | { id: number; from: 'consent'; question: string; prep: Prepared }
  | { id: number; from: 'thinking'; text: string }
  | { id: number; from: 'actions'; question: string; actions: Action[]; ctx: Ctx }

let msgId = 0
const nextId = () => ++msgId

// Resposta com [n] virando botão para a nota e "Inferência:" destacada como dedução, não fato.
function Answer({ text, sources, onOpen }: { text: string; sources: Source[]; onOpen: (s: Source) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n+/).filter((l) => l.trim()).map((line, i) => {
        const inference = /^\s*(\*\*)?infer[eê]ncia/i.test(line)
        return (
          <p key={i} className={inference ? 'border-l-2 border-line-strong pl-2.5 text-muted italic' : ''}>
            {line.split(/(\[\d+\])/g).map((part, k) => {
              const m = part.match(/^\[(\d+)\]$/)
              const src = m ? sources.find((s) => s.n === +m[1]) : undefined
              return src
                ? <button key={k} type="button" onClick={() => onOpen(src)} title={src.title} className="mx-0.5 rounded bg-accent-soft px-1 font-mono text-[11.5px] text-link hover:bg-accent hover:text-on-accent">{src.n}</button>
                : <span key={k}>{part.replace(/\*\*/g, '')}</span>
            })}
          </p>
        )
      })}
    </div>
  )
}

function SourceList({ sources, onOpen, label = 'Fontes' }: { sources: Source[]; onOpen: (s: Source) => void; label?: string }) {
  if (!sources.length) return null
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <p className="text-[12px] text-faint">{label}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {sources.map((s) => (
          <li key={s.chunk_id}><button type="button" onClick={() => onOpen(s)} className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-[13px] hover:bg-raised">
            <span className="font-mono text-[11px] text-link">{s.n}</span><span className="truncate">{s.title}{s.heading && s.heading !== s.title ? ` · ${s.heading}` : ''}</span>
          </button></li>
        ))}
      </ul>
    </div>
  )
}

function Consent({ m, onSend, onCancel }: { m: Extract<Msg, { from: 'consent' }>; onSend: (withNotes: boolean, remember: boolean) => void; onCancel: () => void }) {
  const [remember, setRemember] = useState(false)
  const p = m.prep.provider!
  const name = PROVIDERS.find((x) => x.id === p.id)?.name ?? p.id
  return (
    <div className="anim-rise rounded-xl border border-accent bg-card p-3.5 text-[13.5px]" role="alertdialog" aria-label="Confirmar envio">
      <p className="font-medium">Isto vai sair do seu computador</p>
      <p className="mt-1 text-muted">Para {name} ({p.model}): a pergunta e {m.prep.sources.length ? `${m.prep.sources.length} trecho(s) destas notas:` : 'nenhuma nota (nada relevante encontrado).'}</p>
      {m.prep.sources.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-raised p-2 font-mono text-[11.5px]">
          {m.prep.sources.map((s) => <li key={s.chunk_id} className="truncate" title={s.text}>{s.path}{s.heading ? ` › ${s.heading}` : ''}</li>)}
        </ul>
      )}
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--t-accent)]" />Não perguntar de novo até fechar o app</label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onSend(true, remember)} className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-strong">Enviar</button>
        {m.prep.sources.length > 0 && <button type="button" onClick={() => onSend(false, remember)} className="h-8 rounded-md border border-line-strong px-3 text-[13px] hover:bg-hover">Só a pergunta</button>}
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-[13px] text-muted hover:bg-hover hover:text-fg">Cancelar</button>
      </div>
    </div>
  )
}

function ChatPanel({ messages, onClose, onSend, onConsent, onOpen, onActions }: {
  messages: Msg[]; onClose: () => void; onSend: (t: string) => void
  onActions: (m: Extract<Msg, { from: 'actions' }>, result: { done: string } | { cancel: true } | { ask: true }) => void
  onConsent: (m: Extract<Msg, { from: 'consent' }>, withNotes: boolean | null, remember: boolean) => void; onOpen: (s: Source) => void
}) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const busy = messages.some((m) => m.from === 'thinking' || m.from === 'consent' || m.from === 'actions')
  return (
    <aside className="anim-slide-in flex w-[400px] shrink-0 flex-col border-l border-line bg-bg" aria-label="Tesseract Chat">
      <header className="flex h-14 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2 text-[15px] font-medium"><Logo className="size-6" />Tesseract Chat</span>
        <button type="button" onClick={onClose} aria-label="Fechar chat" className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-fg"><X size={16} /></button>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="mt-auto rounded-xl border border-line bg-card p-4 text-[14px] leading-relaxed text-muted">
            Pergunte sobre o que está nas suas notas, e eu respondo citando de onde tirei cada coisa. Ex.: "o que decidi sobre preço?". Ou peça: "despesa 110 Figma", "tarefa revisar contrato sexta 10h", "crie uma sprint de 2 semanas no projeto Site com as urgentes". Nada é gravado sem você confirmar.
          </p>
        )}
        {messages.map((m) => {
          if (m.from === 'user') return <div key={m.id} className="anim-rise max-w-[88%] self-end rounded-xl bg-accent px-3.5 py-2.5 text-[14px] leading-relaxed text-on-accent">{m.text}</div>
          if (m.from === 'thinking') return <div key={m.id} className="anim-rise flex items-center gap-2 self-start text-[13px] text-muted"><Loader2 size={14} className="animate-spin" />{m.text}</div>
          if (m.from === 'actions') return <ActionPlan key={m.id} actions={m.actions} ctx={m.ctx} onDone={(t) => onActions(m, { done: t })} onCancel={() => onActions(m, { cancel: true })} onAsk={() => onActions(m, { ask: true })} />
          if (m.from === 'consent') return <Consent key={m.id} m={m} onSend={(w, r) => onConsent(m, w, r)} onCancel={() => onConsent(m, null, false)} />
          if (m.from === 'notice') return (
            <div key={m.id} className="anim-rise rounded-xl border border-line bg-card px-3.5 py-2.5 text-[13.5px] leading-relaxed text-muted">
              {m.text}{m.sources && <SourceList sources={m.sources} onOpen={onOpen} label="Notas que encontrei" />}
            </div>
          )
          return (
            <div key={m.id} className="anim-rise max-w-[95%] rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14px] leading-relaxed">
              <Answer text={m.text} sources={m.sources ?? []} onOpen={onOpen} />
              <SourceList sources={m.sources ?? []} onOpen={onOpen} />
              {m.provider && <p className="mt-2 text-[11.5px] text-faint">{m.provider.kind === 'local' ? 'Local' : 'Externo'} · {m.provider.model}</p>}
            </div>
          )
        })}
        <DoneList />
        <div ref={end} />
      </div>
      <form className="p-3" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !busy) { onSend(draft.trim()); setDraft('') } }}>
        <label className="flex items-center gap-2 rounded-xl border border-line-strong bg-raised py-2 pr-2 pl-3.5 focus-within:border-faint">
          <span className="sr-only">Mensagem</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pergunte ou peça: crie, lance, mova…" className="h-8 w-full bg-transparent text-[14px] outline-none placeholder:text-faint" />
          <button type="submit" aria-label="Enviar" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-40" disabled={!draft.trim() || busy}><ArrowUp size={15} /></button>
        </label>
      </form>
    </aside>
  )
}

// Estado e fluxo do chat (vive no Shell para o painel abrir de qualquer tela).
function useChat() {
  const navigate = useNavigate()
  const scopes = useScopes()
  const [messages, setMessages] = useState<Msg[]>([])
  const history = useRef<[string, string][]>([])
  const sessionConsent = useRef(false)
  const push = (m: Msg) => setMessages((x) => [...x, m])
  const drop = (id: number) => setMessages((x) => x.filter((m) => m.id !== id))

  const answer = async (question: string, prep: Prepared, withNotes: boolean) => {
    const wait = nextId()
    push({ id: wait, from: 'thinking', text: prep.provider?.kind === 'local' ? 'Pensando no seu computador… (modelos locais podem levar um minuto)' : 'Pensando…' })
    const sources = withNotes ? prep.sources : []
    try {
      const text = await call<string>('chat_send', { question, chunkIds: sources.map((s) => s.chunk_id), history: history.current, consent: true })
      drop(wait)
      history.current = [...history.current, [question, text]].slice(-6) as [string, string][]
      push({ id: nextId(), from: 'tesseract', text, sources, provider: prep.provider! })
    } catch (e) {
      drop(wait)
      push({ id: nextId(), from: 'notice', text: message(e), sources: prep.sources })
    }
  }

  // mode: 'auto' entende pedidos de ação; 'ask' só pergunta; 'retry' pergunta sem repetir a mensagem
  const send = async (question: string, mode: 'auto' | 'ask' | 'retry' = 'auto') => {
    if (mode !== 'retry') push({ id: nextId(), from: 'user', text: question })
    // Chat que faz: pedido de ação ("despesa 110 Figma") vira cartão para conferir, sem IA
    if (mode === 'auto') {
      try {
        const ctx = await loadCtx(scopes.map((x) => x.id), new Date().toLocaleDateString('sv'))
        const actions = await understand(question, ctx)
        if (actions.length) { push({ id: nextId(), from: 'actions', question, actions, ctx: { ...ctx, boards: new Map() } }); return }
      } catch { /* segue como pergunta */ }
    }
    const wait = nextId()
    push({ id: wait, from: 'thinking', text: 'Procurando nas suas notas…' })
    let prep: Prepared
    try { prep = await call<Prepared>('chat_prepare', { question }) } catch (e) { drop(wait); push({ id: nextId(), from: 'notice', text: message(e) }); return }
    drop(wait)
    if (!prep.provider) {
      // sem IA ainda: mostra pelo menos as notas que respondem
      push({ id: nextId(), from: 'notice', text: prep.providerError ?? 'Nenhuma IA configurada.', sources: prep.sources })
      return
    }
    if (prep.provider.kind === 'external' && !sessionConsent.current) { push({ id: nextId(), from: 'consent', question, prep }); return }
    await answer(question, prep, true)
  }

  const consent = (m: Extract<Msg, { from: 'consent' }>, withNotes: boolean | null, remember: boolean) => {
    drop(m.id)
    if (withNotes === null) { push({ id: nextId(), from: 'notice', text: 'Envio cancelado. Nada saiu do computador.', sources: m.prep.sources }); return }
    if (remember) sessionConsent.current = true
    void answer(m.question, m.prep, withNotes)
  }

  const actions = (m: Extract<Msg, { from: 'actions' }>, r: { done: string } | { cancel: true } | { ask: true }) => {
    drop(m.id)
    if ('done' in r) push({ id: nextId(), from: 'notice', text: `${r.done} Está em "Feito pelo Chat", com Desfazer.` })
    else if ('cancel' in r) push({ id: nextId(), from: 'notice', text: 'Cancelado. Nada foi gravado.' })
    else void send(m.question, 'retry')
  }
  const open = (s: Source) => navigate(`/cerebro?nota=${encodeURIComponent(s.path)}`)
  return { messages, send, consent, open, actions }
}

// Faixa fixa no modo de teste (banco separado), com atalho para o roteiro.
function TestBanner() {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E0A800]/40 bg-[#F6EBC4] px-5 py-1.5 text-[12.5px] text-[#6B5300] dark:bg-[#3A3110] dark:text-[#F5D46B]">
      <b className="font-semibold">Modo de teste</b><span>banco separado: seus dados reais não são tocados.</span>
      <span className="flex-1" /><NavLink to="/teste" className="font-medium underline">Roteiro de teste</NavLink>
    </div>
  )
}

export function Shell() {
  useReminders() // notificações do Windows (fase 8.5)
  useVocab() // nomes do funil e motivos de perda no vocabulário da pessoa
  const [testMode, setTestMode] = useState(false)
  // freshInstall: o instalador acabou de rodar (welcome.pending na pasta de dados); null até responder
  const [fresh, setFresh] = useState<boolean | null>(null)
  const [installModel, setInstallModel] = useState<string | null>(null)
  useEffect(() => {
    call<{ test: boolean; freshInstall?: boolean; installModel?: string | null }>('app_mode')
      .then((m) => {
        setTestMode(m.test); setFresh(!!m.freshInstall); setInstallModel(m.installModel ?? null)
      })
      .catch(() => { setTestMode(false); setFresh(false) })
  }, [])
  const [collapsed, setCollapsed] = useState(false)
  const [palette, setPalette] = useState(false)
  const [chat, setChat] = useState(false)
  const chatState = useChat()
  const sendRef = useRef(chatState.send)
  sendRef.current = chatState.send

  // Atalhos globais: combinações vêm de Configurações > Atalhos (app/shortcuts.ts).
  const navigate = useNavigate()
  const { toggle: toggleTheme } = useTheme()
  const bindings = useRef(useBindings())
  bindings.current = useBindings()
  const timerOn = useRef(false)
  timerOn.current = !!useRunning()
  const run = useRef<Record<ActionId, () => void>>(null!)
  run.current = {
    palette: () => setPalette((p) => !p), chat: () => setChat((c) => !c), sidebar: () => setCollapsed((c) => !c),
    theme: toggleTheme, home: () => navigate('/'), brain: () => navigate('/cerebro'), guide: () => navigate('/guia'), settings: () => navigate('/configuracoes'),
    timer: () => { if (timerOn.current) void stopTimer(); else { navigate('/horas'); setTimeout(() => window.dispatchEvent(new Event(TIMER_FOCUS)), 150) } },
    lock: () => { void lockNow('atalho').catch(() => navigate('/configuracoes')) },
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (capture.active) return
      const combo = comboOf(e)
      if (!combo) return
      const id = (Object.keys(bindings.current) as ActionId[]).find((k) => bindings.current[k] === combo)
      if (id) { e.preventDefault(); run.current[id]() }
    }
    const onAsk = (e: Event) => { const d = (e as CustomEvent<{ text: string; onlyAsk: boolean }>).detail; setChat(true); void sendRef.current(d.text, d.onlyAsk ? 'ask' : 'auto') }
    window.addEventListener('keydown', onKey)
    window.addEventListener(ASK_EVENT, onAsk)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(ASK_EVENT, onAsk) }
  }, [])

  // Boas-vindas: na primeira abertura depois de cada instalação (fresh) e sempre que não houver base
  // nem a escolha "Começar sem notas". Criar ou conectar só esconde a tela nesta sessão; se a pessoa
  // desistir, ela volta na próxima abertura (a marca do instalador sai na primeira escolha).
  const { ready, settings } = useStore()
  const [welcomeDone, setWelcomeDone] = useState(false)
  // o instalador baixou um modelo de conversa: vira o modelo local, se ainda não houver um
  useEffect(() => {
    if (ready && installModel && !settings['ai.localModel']) void setSetting('ai.localModel', installModel)
  }, [ready, installModel, settings])
  if (ready && fresh === null) return null
  if (ready && !welcomeDone && (fresh || (!settings['vault.path'] && !settings['onboarding.skipped']))) {
    const choose = (c: WelcomeChoice) => {
      setWelcomeDone(true)
      if (fresh) void call('app_welcome_done').catch(() => {})
      if (c === 'skip') void setSetting('onboarding.skipped', true)
      else if (c !== 'keep') navigate(`/cerebro?modo=${c === 'create' ? 'criar' : 'conectar'}`)
    }
    return <Welcome onChoose={choose} vault={settings['vault.path']} />
  }
  // Depois da boas-vindas: o segmento monta menu, quadro e Início (data/layout.ts). Uma vez só;
  // "Trocar de modelo" no Início limpa ui.segment e a pergunta volta.
  if (ready && !settings['ui.segment']) return <SegmentPicker onKeep={() => void keepAll()} />

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onSearch={() => setPalette(true)} />
      <div className="my-2.5 mr-2.5 flex min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-panel">
        {/* a faixa do modo de teste ocupa o topo e a página fica com o resto da altura (sem sobrar rolagem) */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{testMode && <TestBanner />}<UpdateBanner testMode={testMode} /><div className="min-h-0 flex-1"><Outlet /></div></main>
        {chat && <ChatPanel messages={chatState.messages} onClose={() => setChat(false)} onSend={(t) => void chatState.send(t)} onConsent={chatState.consent} onOpen={chatState.open} onActions={chatState.actions} />}
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <TutorialCoach />
      {/* vigia do "dois computadores" (Pro) */}
      <pro.Shell />
      <ActivationHost />
      <button type="button" onClick={() => setChat((c) => !c)} aria-label="Abrir Tesseract Chat (Ctrl+J)" title="Tesseract Chat (Ctrl+J)"
        className={`chat-fab fixed right-6 bottom-6 z-40 grid size-12 place-items-center rounded-full bg-card border border-line-strong shadow-[0_10px_30px_color-mix(in_srgb,var(--t-accent)_45%,transparent)] transition-transform hover:scale-105 ${chat ? 'hidden' : ''}`}>
        <Logo className="size-9" />
      </button>
    </div>
  )
}

// Menu do clique direito num item do menu lateral: esconder, renomear, mostrar de volta.
function ItemMenu({ m, hidden, x, y, cfg, onClose }: { m: ShownModule; hidden: boolean; x: number; y: number; cfg: MenuConfig; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const item = 'flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13.5px] hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent'
  const top = Math.min(y, window.innerHeight - 230)
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div role="menu" aria-label={`Opções de ${m.label}`} onMouseDown={(e) => e.stopPropagation()} style={{ left: x, top }}
        className="anim-rise absolute w-60 rounded-xl border border-line-strong bg-raised p-1.5 shadow-2xl">
        {name === null ? <>
          {hidden
            ? <button type="button" role="menuitem" className={item} onClick={() => { showModule(cfg, m.path); onClose() }}>Mostrar no menu</button>
            : <button type="button" role="menuitem" className={item} disabled={m.path === '/'} onClick={() => { hideModule(cfg, m.path); onClose() }}>Esconder do menu</button>}
          <button type="button" role="menuitem" className={item} onClick={() => setName(m.label)}>Renomear</button>
          {m.label !== m.original && <button type="button" role="menuitem" className={item} onClick={() => { renameModule(cfg, m.path, ''); onClose() }}>Voltar ao nome {m.original}</button>}
          <div className="mx-2 my-1 border-t border-line" />
          <button type="button" role="menuitem" className={`${item} text-link`} onClick={() => { navigate('/personalizar'); onClose() }}>Personalizar o menu todo</button>
        </> : (
          <form className="flex flex-col gap-2 p-1.5" onSubmit={(e) => { e.preventDefault(); renameModule(cfg, m.path, name); onClose() }}>
            <label className="flex flex-col gap-1 text-[12px] text-muted">Nome no menu
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-9 rounded-lg border border-line-strong bg-card px-2.5 text-[13.5px] text-fg outline-none focus:border-accent" />
            </label>
            <div className="flex gap-1.5">
              <button type="submit" className="h-8 flex-1 rounded-md bg-accent text-[13px] font-medium text-on-accent hover:bg-accent-strong">Salvar</button>
              <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[13px] text-muted hover:bg-hover">Cancelar</button>
            </div>
            <span className="text-[11.5px] text-faint">Original: {m.original}</span>
          </form>
        )}
      </div>
    </div>
  )
}

// Cadeado "Travar agora" (segurança do beta): só aparece com a segurança ligada; Ctrl+L faz o mesmo.
function LockButton() {
  const st = useSecurity()
  if (!st?.enabled) return null
  return (
    <button type="button" onClick={() => void lockNow('botao')} aria-label="Travar agora (Ctrl+L)" title="Travar agora · Ctrl+L"
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong bg-card text-muted hover:bg-raised hover:text-fg">
      <Lock size={15} strokeWidth={1.8} />
    </button>
  )
}

// Dois computadores (fase 12, item 18): "Em dia · X com a vez" ou "Os dois mexeram · N para ver".
// Item "Seu plano" no rodapé do menu, com a situação da licença ao lado.
function PlanItem({ collapsed }: { collapsed: boolean }) {
  const v = useLicense()
  const tag = v?.status.plano === 'pro' ? 'Pro' : v?.status.plano === 'leitura' ? 'venceu' : 'Grátis'
  return (
    <NavLink to="/plano" title={collapsed ? `Seu plano (${tag})` : undefined} className={({ isActive }) => navItem(isActive, collapsed)}>
      <BadgeCheck size={16} strokeWidth={1.7} className="shrink-0" />
      {!collapsed && <><span>Seu plano</span><span className={`ml-auto text-[12px] ${v?.status.plano === 'pro' ? 'text-link' : 'text-faint'}`}>{tag}</span></>}
    </NavLink>
  )
}

function SyncLine({ collapsed }: { collapsed: boolean }) {
  const st = useSyncStatus()
  if (!st?.enabled) return null
  const turn = st.devices.find((d) => d.hasTurn)
  const n = st.conflicts.length
  const text = n ? `Os dois mexeram · ${n} para ver` : st.lastError ? 'Dois computadores com erro' : st.behind ? 'Versão nova do outro na pasta' : `Em dia · ${turn ? `${turn.isMe ? 'este' : turn.name} com a vez` : 'ninguém com a vez'}`
  const warn = n > 0 || st.behind
  return (
    <NavLink to="/configuracoes" title={st.lastError || text} className={`flex items-center gap-2 text-[12.5px] hover:text-fg ${st.lastError ? 'text-[#B3261E] dark:text-[#FF8A80]' : warn ? 'text-[#7A5A00] dark:text-[#F2C14E]' : 'text-faint'} ${collapsed ? 'justify-center' : 'px-2.5'}`}>
      <span className={`size-1.5 rounded-full ${st.lastError ? 'bg-[#B3261E]' : warn ? 'bg-[#D9A21B]' : 'bg-ok'}`} />{!collapsed && text}
    </NavLink>
  )
}

// Status local + backup na nuvem (fase 12): verde em dia, vermelho atrasado ou com erro; leva às Configurações.
function CloudLine({ collapsed }: { collapsed: boolean }) {
  const st = useCloudStatus()
  if (st?.peekAt) return (
    <NavLink to="/configuracoes" title="Uma versão do backup está aberta só para consultar" className={`flex items-center gap-2 text-[12.5px] text-[#7A5A00] hover:text-fg dark:text-[#F2C14E] ${collapsed ? 'justify-center' : 'px-2.5'}`}>
      <span className="size-1.5 rounded-full bg-[#D9A21B]" />{!collapsed && `Consultando: ${when(st.peekAt).toLowerCase()}`}
    </NavLink>
  )
  const on = !!st?.enabled
  const bad = !!st && late(st)
  const text = !on ? 'Local · offline' : bad ? (st!.lastError ? 'Backup na nuvem com erro' : `Nuvem atrasada · ${ago(st!.lastAt)}`) : `Local · nuvem ${ago(st!.lastAt)}`
  const title = !on ? 'Tudo local, sem nuvem' : bad ? `Backup na nuvem: ${st!.lastError || 'passou do intervalo sem backup'}` : `Backup criptografado na nuvem: último ${ago(st!.lastAt)}`
  return (
    <NavLink to="/configuracoes" title={title} className={`flex items-center gap-2 text-[12.5px] hover:text-fg ${bad ? 'text-[#B3261E] dark:text-[#FF8A80]' : 'text-faint'} ${collapsed ? 'justify-center' : 'px-2.5'}`}>
      <span className={`size-1.5 rounded-full ${bad ? 'bg-[#B3261E]' : 'bg-ok'}`} />{!collapsed && text}
    </NavLink>
  )
}
