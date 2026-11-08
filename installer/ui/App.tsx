import { useEffect, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import { ArrowLeft, Check, FolderOpen, Info as InfoIcon, Minus, X } from 'lucide-react'
import { CATALOG, defaults, fits, gbLabel, visible } from '../../src/data/ai-catalog'
import garden from '../../src/assets/garden.png'
import logo from '../../src/assets/logo/tesseract-light.png'
import license from '../../LICENSE?raw'

// Cartão sobre a cena: o jardim no fundo e um cartão creme com
// as etapas (boas-vindas, pasta e atalhos, IA no seu computador, progresso, tudo pronto). Com
// --uninstall, o mesmo cartão desinstala; com --update, instala direto e reabre o app.
type Info = {
  version: string
  defaultDir: string
  installed: { version: string; dir: string } | null
  uninstall: boolean
  update: boolean
  desktopLink: boolean
  startLink: boolean
  hasPayload: boolean
  sandbox: boolean
  dataDir: string
}
type AiInfo = { ramGb: number; ollamaInstalled: boolean; ollamaRunning: boolean; models: string[] }
type Step = 'welcome' | 'options' | 'license' | 'ai' | 'progress' | 'done' | 'error'
type Progress = { phase: 'app' | 'ai'; pct: number; status: string; detail: string }

// "bge-m3" no catálogo aparece como "bge-m3:latest" no Ollama
const installedModel = (ai: AiInfo, id: string) => ai.models.includes(id.includes(':') ? id : `${id}:latest`)

const win = getCurrentWindow()

export function App() {
  const [info, setInfo] = useState<Info | null>(null)
  const [step, setStep] = useState<Step>('welcome')
  const [dir, setDir] = useState('')
  const [desktop, setDesktop] = useState(true)
  const [startMenu, setStartMenu] = useState(true)
  const [deleteData, setDeleteData] = useState(false)
  const [progress, setProgress] = useState<Progress>({ phase: 'app', pct: 0, status: '', detail: '' })
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [ai, setAi] = useState<AiInfo | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    invoke<Info>('setup_info').then((i) => {
      setInfo(i); setDir(i.defaultDir)
      if (i.update) { setDesktop(i.desktopLink); setStartMenu(i.startLink); void run(i, i.defaultDir, i.desktopLink, i.startLink, []) }
    })
    // null = etapa da IA escondida (é do Pro e esta pasta não tem licença); o instalador pula direto
    invoke<AiInfo | null>('setup_ai_info').then((a) => {
      if (!a) return
      setAi(a)
      setPicked(defaults(a.ramGb).filter((id) => (id === 'ollama' ? !a.ollamaInstalled : !installedModel(a, id))))
    })
    const off = listen<Progress>('progress', (e) => setProgress(e.payload))
    return () => { void off.then((f) => f()) }
  }, [])

  const busy = step === 'progress'
  async function run(i = info, d = dir, desk = desktop, start = startMenu, items = picked) {
    setStep('progress'); setProgress({ phase: 'app', pct: 0, status: 'Começando', detail: '' }); setError(''); setWarnings([])
    try {
      if (i?.uninstall) await invoke('setup_uninstall', { deleteData })
      else {
        const chatModel = CATALOG.find((m) => m.kind === 'chat' && items.includes(m.id))?.id ?? null
        setWarnings(await invoke<string[]>('setup_install', { dir: d, desktop: desk, startMenu: start, ai: items, chatModel }))
        // atualização automática: reabre o app sozinho
        if (i?.update) { setStep('done'); setTimeout(() => void invoke('setup_open', { dir: d }), 1200); return }
      }
      setStep('done')
    } catch (e) {
      setError(String(e)); setStep('error')
    }
  }
  // sem o Ollama, nenhum modelo funciona: marcar um modelo marca o Ollama; desmarcar o Ollama
  // (quando ele ainda não existe) desmarca os modelos
  const toggle = (id: string) => setPicked((cur) => {
    const on = cur.includes(id)
    if (id === 'ollama') return on ? [] : [...cur, id]
    const next = on ? cur.filter((x) => x !== id) : [...cur, id]
    return !on && ai && !ai.ollamaInstalled && !next.includes('ollama') ? ['ollama', ...next] : next
  })
  const pick = async () => {
    const chosen = await open({ directory: true, defaultPath: dir, title: 'Onde instalar o Tesseract' })
    if (typeof chosen === 'string') setDir(await invoke<string>('setup_pick_dir', { chosen }))
  }

  if (!info) return <Scene busy><div className="card" /></Scene>

  const count = { welcome: 1, options: 2, license: 1, ai: 3, progress: 4, done: 5, error: 4 }[step]
  const same = info.installed?.version === info.version
  const verb = info.update ? 'Atualizar' : info.installed ? (same ? 'Reinstalar' : 'Atualizar') : 'Instalar'
  const toAi = () => (ai ? setStep('ai') : void run())

  if (info.uninstall) {
    return (
      <Scene busy={busy}>
        <Card count={null}>
          {step === 'welcome' && <>
            <span className="eyebrow">DESINSTALAR</span>
            <h1>Remover o <em>Tesseract</em> deste computador?</h1>
            <p>Sai o programa, os atalhos e a entrada em Aplicativos instalados. As suas notas (a pasta da base de conhecimento) nunca são apagadas.</p>
            <label className="check">
              <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} />
              <span>Apagar também os dados do app<small>Banco, backups locais e configurações, em {info.dataDir}</small></span>
            </label>
            {deleteData && <p className="warn">Isto não tem volta. Se ainda quiser estes dados, faça um backup em Configurações antes.</p>}
            <div className="actions">
              <button type="button" className="ghost" onClick={() => void invoke('setup_quit')}>Cancelar</button>
              <button type="button" className={`primary ${deleteData ? 'danger' : ''}`} onClick={() => void run()}>Desinstalar</button>
            </div>
          </>}
          {step === 'progress' && <Bar p={progress} title="Desinstalando" />}
          {step === 'done' && <>
            <Done />
            <h1>O Tesseract foi <em>removido</em>.</h1>
            <p>{deleteData ? 'O programa e os dados do app saíram deste computador.' : 'Os seus dados continuam guardados. Se instalar de novo, tudo volta como estava.'}</p>
            <div className="actions"><button type="button" className="primary" onClick={() => void invoke('setup_quit')}>Fechar</button></div>
          </>}
          {step === 'error' && <Failed error={error} onRetry={() => setStep('welcome')} />}
        </Card>
      </Scene>
    )
  }

  return (
    <Scene busy={busy}>
      <Card count={info.update ? null : count} wide={step === 'ai'}>
        {step === 'welcome' && <>
          <span className="eyebrow">{info.installed ? (same ? 'JÁ INSTALADO' : 'NOVA VERSÃO') : 'BOAS-VINDAS'}</span>
          <h1>{info.installed ? <>{verb} o <em>Tesseract</em></> : <>Toda a sua operação, num <em>núcleo só</em>.</>}</h1>
          <p>
            {info.installed
              ? (same ? `A versão ${info.version} já está aqui. Reinstalar troca só o programa: dados, notas e configurações continuam onde estão.`
                : `Da versão ${info.installed.version} para a ${info.version}. Dados, notas e configurações continuam onde estão.`)
              : 'Leva menos de um minuto e não pede senha de administrador. Tudo fica neste computador.'}
          </p>
          {!info.hasPayload && <p className="warn">Este instalador foi gerado sem o app dentro (só para testar a interface).</p>}
          <div className="actions">
            <button type="button" className="link" onClick={() => setStep('options')}>Escolher pasta e atalhos</button>
            <button type="button" className="primary" onClick={toAi}>{verb} o Tesseract</button>
          </div>
          <p className="fine">Ao {verb.toLowerCase()}, você concorda com a <button type="button" className="inline" onClick={() => setStep('license')}>licença de uso</button>.</p>
        </>}

        {step === 'license' && <>
          <span className="eyebrow">LICENÇA DE USO</span>
          <pre className="license">{license}</pre>
          <div className="actions"><button type="button" className="ghost" onClick={() => setStep('welcome')}><ArrowLeft size={14} /> Voltar</button></div>
        </>}

        {step === 'options' && <>
          <span className="eyebrow">PASTA E ATALHOS</span>
          <h1>Onde o <em>Tesseract</em> fica?</h1>
          <div className="field">
            <span title={dir}>{dir}</span>
            <button type="button" onClick={() => void pick()}><FolderOpen size={14} /> Alterar</button>
          </div>
          <label className="check"><input type="checkbox" checked={desktop} onChange={(e) => setDesktop(e.target.checked)} /><span>Atalho na área de trabalho</span></label>
          <label className="check"><input type="checkbox" checked={startMenu} onChange={(e) => setStartMenu(e.target.checked)} /><span>Atalho no menu Iniciar</span></label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setStep('welcome')}><ArrowLeft size={14} /> Voltar</button>
            <button type="button" className="primary" onClick={toAi}>Continuar</button>
          </div>
        </>}

        {step === 'ai' && ai && <AiStep ai={ai} picked={picked} toggle={toggle} onBack={() => setStep('welcome')}
          onSkip={() => void run(info, dir, desktop, startMenu, [])} onGo={() => void run()} verb={verb} />}

        {step === 'progress' && <>
          <Bar p={progress} title={progress.phase === 'ai' ? 'IA no seu computador' : info.installed ? 'Atualizando' : 'Instalando'} />
          {progress.phase === 'ai' && <div className="actions"><button type="button" className="ghost" onClick={() => void invoke('setup_skip_ai')}>Pular a IA</button></div>}
        </>}

        {step === 'done' && <>
          <Done />
          <h1>Tudo <em>pronto</em>.</h1>
          <p>{info.update ? 'Abrindo a nova versão…' : info.installed ? 'O Tesseract foi atualizado. Na próxima abertura, ele mostra a boas-vindas e você segue de onde parou.' : 'O Tesseract está instalado. Na primeira abertura, ele pergunta por onde começar.'}</p>
          {warnings.map((w) => <p key={w} className="warn">{w}</p>)}
          {!info.update && <div className="actions">
            <button type="button" className="ghost" onClick={() => void invoke('setup_quit')}>Fechar</button>
            <button type="button" className="primary" onClick={() => void invoke('setup_open', { dir }).catch((e) => { setError(String(e)); setStep('error') })}>Abrir o Tesseract</button>
          </div>}
        </>}

        {step === 'error' && <Failed error={error} onRetry={() => setStep('welcome')} />}
      </Card>
    </Scene>
  )
}

function Scene({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <div className="scene" data-tauri-drag-region>
      <img src={garden} alt="" className="garden" data-tauri-drag-region draggable={false} />
      <div className="controls">
        <button type="button" aria-label="Minimizar" onClick={() => void win.minimize()}><Minus size={15} /></button>
        <button type="button" aria-label="Fechar" disabled={busy} onClick={() => void win.close()}><X size={15} /></button>
      </div>
      {children}
    </div>
  )
}

function Card({ count, wide, children }: { count: number | null; wide?: boolean; children: ReactNode }) {
  return (
    <main className={`card ${wide ? 'wide' : ''}`}>
      <header>
        <span className="brand"><img src={logo} alt="" draggable={false} />Tesseract</span>
        {count && <span className="count">{count} / 5</span>}
      </header>
      <div className="body">{children}</div>
    </main>
  )
}

function Bar({ p, title }: { p: Progress; title: string }) {
  return <>
    <span className="eyebrow">{title.toUpperCase()}</span>
    <h1>{p.status || title}<span className="dots" /></h1>
    <div className="bar"><div style={{ width: `${Math.max(3, p.pct)}%` }} /></div>
    <p className="fine">{p.pct}%{p.detail ? ` · ${p.detail}` : ''}</p>
  </>
}

function AiStep({ ai, picked, toggle, onBack, onSkip, onGo, verb }: {
  ai: AiInfo; picked: string[]; toggle: (id: string) => void; onBack: () => void; onSkip: () => void; onGo: () => void; verb: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const total = CATALOG.filter((m) => picked.includes(m.id)).reduce((s, m) => s + m.gb, 0)
  return <>
    <span className="eyebrow">IA NO SEU COMPUTADOR · OPCIONAL</span>
    <h1>Quer a IA rodando <em>aqui</em>?</h1>
    <p>Este computador tem {ai.ramGb} GB de memória, e já marcamos o que cabe. Baixa agora e depois funciona sem internet. Dá para mudar em Configurações › IA.</p>
    <ul className="models">
      {visible(ai.ramGb).map((m) => {
        const have = m.id === 'ollama' ? ai.ollamaInstalled : installedModel(ai, m.id)
        const ok = fits(m, ai.ramGb)
        return (
          <li key={m.id}>
            <label className="check">
              <input type="checkbox" checked={have || picked.includes(m.id)} disabled={have} onChange={() => toggle(m.id)} />
              <span>
                <span className="row"><b>{m.name}</b><span className="size">{have ? 'já instalado' : gbLabel(m.gb)}</span></span>
                <small>{m.use}{!ok && !have && <em className="tight"> Pede {m.ramGb} GB de memória: pode ficar lento aqui.</em>}</small>
              </span>
            </label>
            <button type="button" className="more" aria-label={`Sobre o ${m.name}`} onClick={() => setOpen(open === m.id ? null : m.id)}><InfoIcon size={14} /></button>
            {open === m.id && <p className="about">{m.about}<br />Fornecedor: {m.vendor} · Licença: {m.license}</p>}
          </li>
        )
      })}
    </ul>
    <div className="actions">
      <button type="button" className="ghost" aria-label="Voltar" onClick={onBack}><ArrowLeft size={14} /></button>
      <button type="button" className="link" onClick={onSkip}>Pular e instalar só o app</button>
      <button type="button" className="primary" onClick={onGo}>{total > 0 ? `${verb} + ${gbLabel(total)}` : verb}</button>
    </div>
  </>
}

const Done = () => <span className="ok"><Check size={18} strokeWidth={2.4} /></span>

function Failed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <>
    <span className="eyebrow err">ALGO DEU ERRADO</span>
    <h1>Não deu para <em>terminar</em>.</h1>
    <p className="warn">{error}</p>
    <div className="actions">
      <button type="button" className="ghost" onClick={() => void invoke('setup_quit')}>Fechar</button>
      <button type="button" className="primary" onClick={onRetry}>Tentar de novo</button>
    </div>
  </>
}
