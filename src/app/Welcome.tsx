import { ArrowRight, BookOpenCheck, FolderOpen, Sparkles } from 'lucide-react'
import { useTheme } from './theme'
import heroLight from '../assets/art/hero.png'
import heroDark from '../assets/art-dark/hero.png'

// Boas-vindas da primeira abertura.
// Aparece na primeira abertura depois de cada instalação e enquanto não há base configurada nem a
// escolha "Começar sem notas". Criar e conectar levam ao assistente do Conhecimento; "skip" grava
// onboarding.skipped; "keep" (só quando a base de antes continua lá) segue direto para o app.
export type WelcomeChoice = 'create' | 'connect' | 'skip' | 'keep'

function Option({ icon: Icon, title, body, recommended, onClick }: { icon: typeof Sparkles; title: string; body: string; recommended?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`anim-rise group flex items-center gap-4 rounded-[14px] bg-card px-5 py-[18px] text-left transition-all hover:-translate-y-0.5 ${recommended ? 'border-2 border-accent' : 'border border-line hover:border-accent'}`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${recommended ? 'bg-accent-soft text-link' : 'bg-raised text-muted'}`}><Icon size={20} strokeWidth={1.8} /></span>
      <span className="flex flex-1 flex-col gap-[3px]">
        <b className="text-[15.5px] font-semibold">{title}</b>
        <span className="text-[13.5px] text-muted">{body}</span>
      </span>
      {recommended && <span className="font-mono text-[11px] tracking-[0.08em] text-link">RECOMENDADO</span>}
    </button>
  )
}

export function Welcome({ onChoose, vault }: { onChoose: (c: WelcomeChoice) => void; vault?: string }) {
  const folder = vault?.split(/[\\/]/).filter(Boolean).pop()
  const { theme } = useTheme()
  return (
    <div className="flex h-full bg-bg text-fg">
      <div className="relative hidden w-[46%] overflow-hidden md:block">
        <img key={theme} src={theme === 'dark' ? heroDark : heroLight} alt="" aria-hidden="true" className="anim-fade absolute inset-0 size-full object-cover [image-rendering:pixelated]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,transparent_60%,var(--t-bg)_100%)]" />
      </div>
      <main className="flex flex-1 flex-col gap-[22px] overflow-y-auto py-[72px] pr-20 pl-10 pb-12 max-md:px-8">
        <span className="anim-rise font-mono text-[11px] tracking-[0.2em] text-link">{vault ? 'NOVA INSTALAÇÃO' : 'PRIMEIRA ABERTURA'}</span>
        <h1 className="anim-rise m-0 font-serif text-[44px] leading-[1.12] font-normal">Boas-vindas.<br />Por onde <em className="text-link">começamos</em>?</h1>
        <p className="anim-rise m-0 max-w-[520px] text-[15.5px] leading-[1.6] text-muted">O Tesseract funciona melhor com uma base de conhecimento: uma pasta de notas no seu computador que ele lê e organiza.</p>
        <div className="mt-1.5 flex max-w-[640px] flex-col gap-2.5">
          {vault && <Option icon={BookOpenCheck} recommended title="Continuar com a minha base" body={`Seus dados e a pasta ${folder ?? vault} continuam aqui.`} onClick={() => onChoose('keep')} />}
          <Option icon={Sparkles} recommended={!vault} title={vault ? 'Criar uma base nova' : 'Criar minha base de conhecimento'} body="Quatro perguntas e ele monta pastas, modelos e o guia." onClick={() => onChoose('create')} />
          <Option icon={FolderOpen} title={vault ? 'Conectar outra pasta' : 'Conectar uma pasta que já existe'} body="Qualquer pasta de notas em Markdown. Vindo do Obsidian? Traga o seu cofre como está." onClick={() => onChoose('connect')} />
          {!vault && <button type="button" onClick={() => onChoose('skip')} className="group flex items-center rounded-[14px] px-5 py-3 text-left text-[14px] text-muted hover:text-fg">
            Começar sem notas por enquanto <ArrowRight size={14} className="ml-1.5 text-link transition-transform group-hover:translate-x-0.5" />
          </button>}
        </div>
        <p className="mt-auto flex flex-wrap gap-x-[22px] gap-y-2 text-[12.5px] text-muted">
          <span>Tudo fica neste computador</span><span>A IA só age com o seu ok</span><span>Exporte tudo quando quiser</span>
        </p>
      </main>
    </div>
  )
}
