import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, FolderOpen, FolderPlus, FolderSearch, Plus, Sparkles, X } from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { call, inBrowser, indexBrain, message, reload, setSetting, useStore, type Org, type VaultCheck } from '../data/api'
import { AREAS, plan, slug, tree, type Area, type Profile } from '../data/brain'
import { useTheme } from '../app/theme'
import { Knowledge } from '../components/Knowledge'

const LIGHT = import.meta.glob<string>('../assets/art/4.png', { eager: true, import: 'default' })
const DARK = import.meta.glob<string>('../assets/art-dark/4.png', { eager: true, import: 'default' })
const field = 'h-11 w-full rounded-lg border border-line-strong bg-raised px-3.5 text-[14.5px] outline-none focus:border-accent'

async function defaultRoot() {
  if (inBrowser) return 'C:\\Users\\voce\\Documents\\Base de conhecimento'
  const { documentDir, join } = await import('@tauri-apps/api/path')
  return join(await documentDir(), 'Base de conhecimento')
}
async function pickFolder() {
  if (inBrowser) return null
  const { folderDialog } = await import('../data/extras')
  return folderDialog('Escolha a pasta')
}

function Banner({ title, sub, badge }: { title: string; sub: string; badge?: ReactNode }) {
  const { theme } = useTheme()
  const art = Object.values(theme === 'dark' ? DARK : LIGHT)[0]
  return (
    <section className="relative overflow-hidden border-b border-line">
      <img key={theme} src={art} alt="" aria-hidden="true" className="anim-fade absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--t-bg)_0%,color-mix(in_srgb,var(--t-bg)_90%,transparent)_38%,color-mix(in_srgb,var(--t-bg)_30%,transparent)_70%,transparent_100%)]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(0deg,var(--t-panel),transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1100px] px-16 pt-14 pb-16">
        {badge && <div className="anim-rise">{badge}</div>}
        <h1 className="anim-rise mt-4 font-serif text-[44px] leading-[1.1] tracking-[-0.02em]">{title}</h1>
        <p className="anim-rise mt-3 max-w-xl text-[16px] leading-relaxed text-muted" style={{ animationDelay: '.08s' }}>{sub}</p>
      </div>
    </section>
  )
}

function Choice({ icon: Icon, title, body, onClick }: { icon: typeof FolderPlus; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="anim-rise group flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-accent">
      <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-link"><Icon size={20} strokeWidth={1.7} /></span>
      <span className="text-[17px] font-semibold">{title}</span>
      <span className="text-[14px] leading-relaxed text-muted">{body}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-[14px] text-link">Começar <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
    </button>
  )
}

// ---------- Conectar um vault existente ----------
function Connect({ onBack }: { onBack: () => void }) {
  const [path, setPath] = useState('')
  const [check, setCheck] = useState<VaultCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const verify = async (p = path) => { setError(null); try { setCheck(await call<VaultCheck>('vault_check', { path: p })) } catch (e) { setError(message(e)) } }
  const browse = async () => { const p = await pickFolder(); if (p) { setPath(p); verify(p) } }
  const save = async () => { await setSetting('vault.path', path.trim()) }
  return (
    <div className="anim-rise flex max-w-2xl flex-col gap-4">
      <h2 className="text-[20px] font-semibold">Conectar as notas que você já tem</h2>
      <p className="text-[14.5px] text-muted">Aponte para a sua pasta de notas .md. Vindo do Obsidian? Escolha a pasta do cofre. Nada é copiado nem convertido: o Tesseract lê e escreve os mesmos arquivos .md.</p>
      <div className="flex gap-2">
        <label className="flex-1"><span className="sr-only">Pasta do vault</span>
          <input value={path} onChange={(e) => { setPath(e.target.value); setCheck(null) }} placeholder="C:\Users\voce\Documents\vault" className={`${field} font-mono text-[13px]`} />
        </label>
        <Button icon={FolderOpen} onClick={browse}>Escolher</Button>
        <Button icon={FolderSearch} onClick={() => verify()}>Verificar</Button>
      </div>
      {error && <p className="text-[13.5px] text-[#B3261E]" role="alert">{error}</p>}
      {check && (check.exists
        ? <p className="text-[13.5px] text-ok">{check.capped ? 'Mais de ' : ''}{check.notes.toLocaleString('pt-BR')} notas .md{check.obsidian ? ' · veio do Obsidian' : ''}</p>
        : <p className="text-[13.5px] text-[#B3261E]">Pasta não encontrada.</p>)}
      <div className="flex gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>Voltar</Button>
        <Button variant="primary" icon={Check} onClick={save}>{check?.exists ? 'Usar esta pasta' : 'Salvar mesmo assim'}</Button>
      </div>
    </div>
  )
}

// ---------- Assistente: criar um cérebro novo ----------
const STEPS = ['Você', 'Para que', 'Onde atua', 'Onde salvar']

function Wizard({ onBack }: { onBack: () => void }) {
  const { orgs: existing } = useStore()
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Profile>({ name: '', role: '', areas: ['pessoal', 'trabalho'], orgs: existing.filter((o) => !o.archived).map((o) => o.name) })
  const [org, setOrg] = useState('')
  const [root, setRoot] = useState('')
  const [rootError, setRootError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { defaultRoot().then(setRoot) }, [])
  const preview = useMemo(() => tree(p), [p])

  const toggle = (a: Area) => setP((x) => ({ ...x, areas: x.areas.includes(a) ? x.areas.filter((y) => y !== a) : [...x.areas, a] }))
  const addOrg = () => { const o = org.trim(); if (o && !p.orgs.some((x) => slug(x) === slug(o))) setP((x) => ({ ...x, orgs: [...x.orgs, o] })); setOrg('') }
  const canNext = [p.name.trim().length > 0, p.areas.length > 0, true, root.trim().length > 0][step]

  const checkRoot = async (r = root) => {
    if (inBrowser) return true
    try { await call('brain_check_root', { root: r }); setRootError(null); return true } catch (e) { setRootError(message(e)); return false }
  }
  const browse = async () => { const r = await pickFolder(); if (r) { setRoot(r); checkRoot(r) } }

  const create = async () => {
    if (!(await checkRoot())) return
    setBusy(true); setError(null)
    try {
      const { dirs, files } = plan(p)
      await call('brain_create', { root, dirs, files })
      await setSetting('profile.name', p.name.trim())
      if (p.role.trim()) await setSetting('profile.role', p.role.trim())
      // organizações novas viram escopos no app
      const known = new Set(existing.map((o: Org) => slug(o.name)))
      for (const o of p.orgs) if (!known.has(slug(o))) await call('org_save', { id: null, name: o })
      await reload()
      void indexBrain()
    } catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="anim-rise grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <ol className="flex flex-wrap gap-2" aria-label="Passos">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] ${i === step ? 'border-accent bg-accent-soft text-link' : i < step ? 'border-line text-fg' : 'border-line text-faint'}`} aria-current={i === step ? 'step' : undefined}>
              <span className="font-mono text-[11px]">{i < step ? <Check size={12} /> : `0${i + 1}`}</span>{s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-serif text-[28px]">Primeiro, quem é você?</h2>
            <p className="text-[14.5px] text-muted">Vira a primeira linha da sua base, para você (e o Tesseract) lembrarem do contexto.</p>
            <label className="flex flex-col gap-1.5 text-[13.5px] text-muted">Seu nome
              <input autoFocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Ana Souza" className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13.5px] text-muted">O que você faz, em uma frase (opcional)
              <input value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="Designer freelancer e estudante de arquitetura" className={field} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-serif text-[28px]">Para que vai usar?</h2>
            <p className="text-[14.5px] text-muted">Escolha quantas quiser. Cada escolha cria as pastas certas; dá para criar outras depois.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AREAS.map((a) => {
                const on = p.areas.includes(a.id)
                return (
                  <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={on}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${on ? 'border-accent bg-accent-soft/60' : 'border-line bg-card hover:border-line-strong'}`}>
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>{on && <Check size={13} />}</span>
                    <span><span className="block text-[14.5px] font-medium">{a.label}</span><span className="text-[13px] text-muted">{a.hint}</span></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-serif text-[28px]">Onde você atua?</h2>
            <p className="text-[14.5px] text-muted">Empresas, clientes fixos ou projetos grandes. Cada um ganha uma pasta na base e um escopo no Tesseract. Pode pular.</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addOrg() }}>
              <label className="flex-1"><span className="sr-only">Nome</span><input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Ex.: Estúdio Aurora" className={field} /></label>
              <Button type="submit" icon={Plus}>Adicionar</Button>
            </form>
            <ul className="flex flex-wrap gap-2">
              {p.orgs.map((o) => (
                <li key={o} className="flex items-center gap-1.5 rounded-full border border-line-strong bg-card py-1 pr-1 pl-3 text-[14px]">
                  {o}<button type="button" aria-label={`Remover ${o}`} onClick={() => setP({ ...p, orgs: p.orgs.filter((x) => x !== o) })} className="grid size-6 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg"><X size={13} /></button>
                </li>
              ))}
              {p.orgs.length === 0 && <li className="text-[13.5px] text-faint">Nenhuma ainda. Sem problema: a base ganha um "Primeiro projeto" de exemplo.</li>}
            </ul>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-serif text-[28px]">Onde salvar?</h2>
            <p className="text-[14.5px] text-muted">Uma pasta comum no seu computador, com arquivos de texto (.md). São seus: abrem em qualquer editor e, se um dia sair do Tesseract, você leva a pasta.</p>
            <div className="flex gap-2">
              <label className="flex-1"><span className="sr-only">Pasta</span>
                <input value={root} onChange={(e) => { setRoot(e.target.value); setRootError(null) }} onBlur={() => checkRoot()} className={`${field} font-mono text-[13px]`} />
              </label>
              <Button icon={FolderOpen} onClick={browse}>Escolher</Button>
            </div>
            {rootError && <p className="text-[13.5px] text-[#B3261E]" role="alert">{rootError}</p>}
            {error && <p className="text-[13.5px] text-[#B3261E]" role="alert">{error}</p>}
            {inBrowser && <p className="text-[13.5px] text-faint">No navegador não há disco: abra o app para criar.</p>}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>Voltar</Button>
          {step < 3
            ? <Button variant="primary" onClick={() => canNext && setStep(step + 1)}>Continuar</Button>
            : <Button variant="primary" icon={Sparkles} onClick={create}>{busy ? 'Criando…' : 'Criar minha base de conhecimento'}</Button>}
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-line bg-card p-5" aria-label="Prévia das pastas">
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.18em] text-link uppercase">Prévia</p>
        <p className="mt-1 truncate font-mono text-[12.5px] text-muted" title={root}>{root.split(/[\\/]/).pop() || 'Base de conhecimento'}/</p>
        <ul className="mt-3 flex flex-col gap-1 font-mono text-[12.5px]">
          <li className="text-fg">LEIA-ME.md</li>
          {preview.map((f) => <li key={f.path} title={f.what} className="text-muted" style={{ paddingLeft: f.depth * 14 }}>{f.path.split('/').pop()}/</li>)}
        </ul>
        <p className="mt-4 text-[12.5px] leading-snug text-faint">Mais modelos de nota, uma nota do dia e um projeto de exemplo, todos ligados entre si.</p>
      </aside>
    </div>
  )
}

export function Brain() {
  const { ready, settings } = useStore()
  // a boas-vindas da primeira abertura chega com ?modo=criar ou ?modo=conectar
  const [params] = useSearchParams()
  const start = params.get('modo')
  const [mode, setMode] = useState<'choose' | 'create' | 'connect'>(start === 'criar' ? 'create' : start === 'conectar' ? 'connect' : 'choose')
  useEffect(() => { if (start === 'criar') setMode('create'); else if (start === 'conectar') setMode('connect') }, [start])
  const path = settings['vault.path']
  const created = mode === 'create' && path

  // base conectada: o editor ocupa a tela toda (pastas | nota | ligações)
  if (ready && path) return <Knowledge vault={path} initial={params.get('nota')} />

  return (
    <div className="min-h-full">
      <Banner
        badge={<Badge tone="muted">Conhecimento</Badge>}
        title={created ? 'Sua base de conhecimento está pronta.' : 'Monte sua base de conhecimento'}
        sub={'Um lugar fora da cabeça para o que você sabe, decide e precisa lembrar. O Tesseract monta a estrutura com você em quatro passos.'}
      />
      <div className="mx-auto max-w-[1100px] px-16 py-10">
        {!ready ? null : mode === 'create' ? <Wizard onBack={() => setMode('choose')} /> : mode === 'connect' ? <Connect onBack={() => setMode('choose')} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <Choice icon={FolderPlus} title="Criar minha base de conhecimento" body="Responda quatro perguntas. O Tesseract cria as pastas, um guia de onde guardar cada coisa, modelos de nota e exemplos ligados entre si." onClick={() => setMode('create')} />
            <Choice icon={FolderSearch} title="Já tenho uma" body="Conecte a sua pasta de notas .md, inclusive um cofre do Obsidian. Os arquivos ficam onde estão; o Tesseract lê e escreve neles." onClick={() => setMode('connect')} />
          </div>
        )}
      </div>
    </div>
  )
}
