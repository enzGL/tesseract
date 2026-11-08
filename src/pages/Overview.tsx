import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowUp, Brain, CheckSquare, ChevronsUpDown, FileSignature, Plus, Wallet, UserPlus } from 'lucide-react'
import { Badge } from '../components/ui'
import { loadDashboard, money, type TaskRow } from '../data/dashboard'
import { HomePanel } from '../components/HomeGrid'
import { useMenu } from '../data/layout'
import { askTesseract } from '../app/Shell'
import { workspace } from '../data/workspace'
import garden from '../assets/garden.png'
import gardenDark from '../assets/art-dark/hero.png'
import { useTheme } from '../app/theme'
import { call, useScopes, useStore, type Task } from '../data/api'
import { loadCtx, understand, type Action, type Ctx } from '../data/commands'
import { ActionPlan, DoneList } from '../components/ActionCard'

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

const QUICK = [
  { label: 'Tarefa', icon: CheckSquare, to: '/projetos' },
  { label: 'Lançamento', icon: Wallet, to: '/financas' },
  { label: 'Oportunidade', icon: UserPlus, to: '/crm' },
  { label: 'Contrato', icon: FileSignature, to: '/contratos' },
  { label: 'Nota', icon: Brain, to: '/cerebro' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

// Hero do Início: jardim em dither ao fundo, névoa creme à esquerda para o texto ler bem
// e um cartão "Hoje" à direita com o estado real (vazio enquanto não há dados).
function Hero({ demo, data }: { demo: boolean; data: ReturnType<typeof loadDashboard> }) {
  const { theme } = useTheme()
  const { settings } = useStore()
  const owner = settings['profile.name'] || workspace.owner
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const pipeline = data.deals.reduce((a, d) => a + d.value, 0)
  // o que está escolhido em Configurações > IA (o instalador já deixa o modelo local que baixou)
  const aiMode = settings['ai.mode'] ?? 'auto'
  const aiLabel = aiMode !== 'external' && settings['ai.localModel'] ? `Local · ${settings['ai.localModel']}`
    : aiMode !== 'local' && settings['ai.externalModel'] ? `Externo · ${settings['ai.provider'] ?? ''}` : null
  const rows: { label: string; value: string; muted?: boolean; to?: string }[] = [
    { label: 'Tarefas abertas', value: String(data.openTasks.length), to: '/projetos' },
    { label: 'A receber no mês', value: money(data.revenue.expected ?? 0), to: '/financas' },
    { label: 'Pipeline aberto', value: money(pipeline), to: '/crm' },
    { label: 'Conhecimento', value: data.notesIndexed === null ? 'Não conectado' : `${data.notesIndexed} notas`, muted: data.notesIndexed === null, to: '/cerebro' },
    { label: 'Assistente de IA', value: aiLabel ?? 'Não configurado', muted: !aiLabel, to: '/configuracoes' },
  ]
  return (
    <section className="relative overflow-hidden border-b border-line">
      <img key={theme} src={theme === 'dark' ? gardenDark : garden} alt="" aria-hidden="true" className="anim-fade absolute inset-0 size-full object-cover [image-rendering:pixelated]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--t-bg)_0%,color-mix(in_srgb,var(--t-bg)_92%,transparent)_34%,color-mix(in_srgb,var(--t-bg)_35%,transparent)_62%,transparent_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(0deg,var(--t-panel),transparent)]" aria-hidden="true" />
      <span className="absolute top-6 left-12 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">01 · Início</span>

      <div className="relative mx-auto grid min-h-[440px] max-w-[1200px] grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center gap-10 px-16 pt-14 pb-24">
        <div>
          {demo && <div className="anim-rise mb-4"><Badge>Dados de exemplo</Badge></div>}
          <p className="anim-rise font-mono text-[11px] font-semibold tracking-[0.2em] text-accent uppercase dark:text-link">{greeting()}{owner ? `, ${owner}` : ''}</p>
          <h1 className="anim-rise mt-4 font-serif text-[52px] leading-[1.08] tracking-[-0.02em]" style={delay(0.05)}>
            O que vamos <em className="text-accent dark:text-link">resolver</em> hoje?
          </h1>
          <p className="anim-rise mt-4 max-w-md text-[16px] leading-relaxed text-muted" style={delay(0.1)}>
            Toda a sua operação, num núcleo só. Peça ao Tesseract ou comece por um atalho.
          </p>
        </div>

        <aside className="anim-rise justify-self-end w-full max-w-[340px] rounded-2xl border border-line-strong bg-card/92 p-5 shadow-[0_24px_60px_color-mix(in_srgb,var(--t-accent)_16%,transparent)] backdrop-blur-md" style={delay(0.15)} aria-label="Resumo de hoje">
          <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-accent uppercase dark:text-link">Hoje</p>
          <p className="mt-1.5 font-serif text-[20px] first-letter:uppercase">{today}</p>
          <ul className="mt-4 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.label}>
                <Link to={r.to ?? '/'} className="group flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-[13.5px] text-muted transition-colors group-hover:text-fg">{r.label}</span>
                  <span className={`text-[14px] font-medium ${r.muted ? 'text-faint' : 'text-fg'}`}>{r.value}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-faint"><span className="size-1.5 rounded-full bg-ok" />Tudo local, nada enviado para fora</p>
        </aside>
      </div>
    </section>
  )
}

// Caixa de pedido no padrão do bolt: texto, "+", seletor de modo e envio redondo.
// Chat que faz (fase 12): enquanto a pessoa digita, a frase curta é entendida aqui mesmo
// (sem IA) e o cartão aparece logo abaixo para conferir; Enter cria, Esc cancela. O que não for entendido vai ao Chat.
const EXAMPLES = ['despesa 110 software Figma', 'follow-up Joana amanhã 9h', '2h no projeto Site, ontem', 'tarefa revisar contrato sexta 10h']
function PromptBox() {
  const [text, setText] = useState('')
  const scopes = useScopes()
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [dismissed, setDismissed] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const scopeKey = scopes.map((s) => s.id).join(',')
  useEffect(() => { void loadCtx(scopes.map((s) => s.id), new Date().toLocaleDateString('sv')).then(setCtx) }, [scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx || !text.trim() || text === dismissed) { setActions([]); return }
    const t = setTimeout(() => { void understand(text.trim(), { ...ctx, boards: new Map() }).then(setActions).catch(() => setActions([])) }, 250)
    return () => clearTimeout(t)
  }, [text, ctx, dismissed])
  const ask = (onlyAsk = false) => { if (text.trim()) { askTesseract(text.trim(), onlyAsk); setText(''); setActions([]) } }
  const submit = () => {
    if (actions.length) { card.current?.querySelector<HTMLButtonElement>('button')?.click(); return }
    ask()
  }
  const finished = (msg: string) => {
    setDone(msg); setText(''); setActions([])
    void loadCtx(scopes.map((s) => s.id), new Date().toLocaleDateString('sv')).then(setCtx)
    setTimeout(() => setDone(null), 6000)
  }
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-3">
      <form className="anim-rise w-full rounded-2xl border border-line-strong bg-card/90 p-3 shadow-[0_24px_60px_color-mix(in_srgb,var(--t-accent)_18%,transparent)] backdrop-blur" style={delay(0.1)}
        onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label>
          <span className="sr-only">Peça algo ao Tesseract</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setDone(null) }} rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              if (e.key === 'Escape' && actions.length) { e.preventDefault(); setDismissed(text); setActions([]) }
            }}
            placeholder="Registre uma despesa de R$ 110 com software..."
            className="w-full resize-none bg-transparent px-1.5 pt-1 text-[15px] leading-relaxed outline-none placeholder:text-faint" />
        </label>
        <div className="mt-1 flex items-center gap-1">
          <button type="button" aria-label="Anexar" className="grid size-8 place-items-center rounded-full border border-line-strong text-muted hover:text-fg"><Plus size={15} /></button>
          <button type="button" className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-hover hover:text-fg">Local <ChevronsUpDown size={12} /></button>
          <button type="submit" aria-label="Enviar" disabled={!text.trim()} className="ml-auto grid size-8 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-strong disabled:bg-accent-soft disabled:text-faint"><ArrowUp size={15} /></button>
        </div>
      </form>
      {actions.length > 0 && ctx && (
        <div ref={card}>
          <ActionPlan compact actions={actions} ctx={ctx} onDone={finished} onCancel={() => { setDismissed(text); setActions([]) }} onAsk={() => ask(true)} />
        </div>
      )}
      {done && <p role="status" className="anim-rise rounded-xl bg-ok-bg px-4 py-2.5 text-[13.5px] text-ok">{done} Está em "Feito pelo Chat", com Desfazer.</p>}
      {!text && !done && (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Exemplos">
          {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setText(x)} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-muted hover:bg-raised hover:text-fg">{x}</button>)}
        </div>
      )}
    </div>
  )
}

export function Overview() {
  const [params] = useSearchParams()
  const demo = params.has('demo')
  const { index } = useStore()
  // notas indexadas vêm do índice real do cérebro; os dados de exemplo só com ?demo=1
  // tarefas abertas reais (projetos), ordenadas por prazo; os dados de exemplo só com ?demo=1
  const [open, setOpen] = useState<TaskRow[]>([])
  useEffect(() => {
    if (demo) return
    call<{ task: Task; project: string; column: string }[]>('tasks_open', { limit: 50 })
      .then((rows) => setOpen(rows.map((r) => ({ title: r.task.title, project: r.project, status: r.column || 'A fazer',
        due: r.task.due ? new Date(`${r.task.due}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '·' }))))
      .catch(() => setOpen([]))
  }, [demo])
  const data = { ...loadDashboard(demo), ...(demo ? {} : { notesIndexed: index.last?.notes ?? null, openTasks: open }) }
  const { visible } = useMenu() // atalhos só dos módulos que estão no menu

  return (
    <div className="min-h-full">
      <Hero demo={demo} data={data} />
      <div className="flex flex-col items-center px-8 pb-12">
        <div className="-mt-10 flex w-full justify-center"><PromptBox /></div>
        <div className="mt-4 flex w-full max-w-[640px] flex-col"><DoneList /></div>
        <div className="anim-rise mt-7 flex flex-wrap justify-center gap-3" style={delay(0.2)}>
          {QUICK.filter((q) => visible(q.to)).map((q) => (
            <Link key={q.label} to={q.to} className="group flex w-[88px] flex-col items-center gap-2 text-[13px] text-muted">
              <span className="grid size-12 place-items-center rounded-xl border border-line-strong bg-card text-accent transition-all group-hover:-translate-y-0.5 group-hover:border-accent group-hover:bg-accent-soft">
                <q.icon size={18} strokeWidth={1.7} />
              </span>
              <span className="transition-colors group-hover:text-fg">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-10 pb-16">
        <HomePanel />
      </div>
    </div>
  )
}
