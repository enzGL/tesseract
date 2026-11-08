import { Link } from 'react-router'
import { Check, Circle, Lock } from 'lucide-react'
import { Badge, PageHeader } from '../components/ui'
import { setSetting, useStore } from '../data/api'

// Guia do segundo cérebro: os mesmos passos do tutorial do site (site/guia/), com progresso salvo no banco.
type Step = { id: string; title: string; why: string; how: string[]; example?: string; action?: { to: string; label: string }; soon?: boolean }

export const GUIDE: Step[] = [
  { id: 'criar', title: 'Crie ou conecte sua base de conhecimento',
    why: 'Tudo começa com um lugar fixo. Uma pasta no seu computador, com uma estrutura que diz onde cada coisa vai.',
    how: ['Em Conhecimento, escolha "Criar minha base de conhecimento" e responda quatro perguntas.', 'Já tem notas, por exemplo um cofre do Obsidian? Escolha "Já tenho uma" e aponte para a pasta.', 'Leia o LEIA-ME.md que foi criado: ele é o mapa da sua base.'],
    action: { to: '/cerebro', label: 'Ir para Conhecimento' } },
  { id: 'capturar', title: 'Capture tudo no inbox',
    why: 'A cabeça é boa para ter ideias, não para guardar. Anotar sem decidir onde vai tira o peso de organizar na hora.',
    how: ['Ideia, tarefa, link, frase de reunião: vira uma nota em inbox/.', 'Não pense na pasta certa agora. Só escreva.'],
    example: 'inbox/2026-11-03-ideia-de-preco.md: "cobrar por projeto em vez de por hora?"' },
  { id: 'diario', title: 'Escreva a nota do dia',
    why: 'Três linhas por dia viram um histórico que responde "quando foi que decidi isso?" meses depois.',
    how: ['Uma nota por dia em diario/, com o nome AAAA-MM-DD.', 'O que fiz, o que decidi, o que fica para amanhã.', 'Ligue o que importa: [[projetos/x/overview]], [[pessoas/fulana]].'],
    example: 'diario/2026-11-03.md: "Reunião com [[pessoas/marina]]: escopo do [[projetos/site-novo/overview]] fechado."' },
  { id: 'organizar', title: 'Organize uma vez por semana',
    why: 'O inbox enche rápido. Esvaziar toda semana mantém a base confiável.',
    how: ['Abra o inbox/ e decida o destino de cada nota, usando a tabela do LEIA-ME.', 'O que não serve mais vai para arquivo/, nunca para a lixeira.', 'Atualize os próximos passos de cada projeto.'] },
  { id: 'ligar', title: 'Ligue as notas',
    why: 'Notas soltas são uma gaveta. Notas ligadas são memória: de uma pessoa você chega ao projeto, à reunião e à decisão.',
    how: ['Use [[links]] sempre que citar uma pessoa, um projeto ou um assunto que tem nota.', 'Informação nova sobre alguém vai para o "## Histórico" da nota dela, com a data.', 'Separe fato (aconteceu) de ideia (talvez).'] },
  { id: 'perguntar', title: 'Pergunte ao Tesseract', soon: true,
    why: 'Com a base organizada, a IA busca no que você já sabe e responde com a nota de onde tirou cada informação.',
    how: ['Chega na fase 3, junto com a IA local.', 'Ela só escreve na sua base quando você pede ou confirma.'] },
]

export function Guide() {
  const { settings } = useStore()
  const done = new Set<string>(settings['guide.done'] ?? [])
  if (settings['vault.path']) done.add('criar')
  const total = GUIDE.filter((s) => !s.soon).length
  const count = GUIDE.filter((s) => !s.soon && done.has(s.id)).length
  const toggle = (id: string) => {
    const next = new Set(settings['guide.done'] ?? [])
    if (next.has(id)) next.delete(id); else next.add(id)
    setSetting('guide.done', [...next])
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-8 px-16 py-12">
      <PageHeader title="Guia da base de conhecimento" subtitle="Seis hábitos para montar e manter o seu. Marque cada passo quando ele virar rotina." badge={<Badge tone={count === total ? 'ok' : 'accent'}>{count} de {total}</Badge>} />
      <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(count / total) * 100}%` }} /></div>
      <ol className="flex flex-col gap-4">
        {GUIDE.map((s, i) => {
          const ok = done.has(s.id)
          return (
            <li key={s.id} className={`anim-rise rounded-xl border bg-card p-6 ${ok ? 'border-line' : 'border-line-strong'} ${s.soon ? 'opacity-70' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="flex items-start gap-4">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-[12px] ${ok ? 'bg-accent text-on-accent' : 'bg-raised text-muted'}`}>{ok ? <Check size={16} /> : `0${i + 1}`}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 font-serif text-[22px]">{s.title}{s.soon && <Badge tone="muted">Fase 3</Badge>}</h2>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.why}</p>
                  <ul className="mt-3 flex flex-col gap-1.5 text-[14px]">
                    {s.how.map((h) => <li key={h} className="flex gap-2"><Circle size={6} className="mt-2 shrink-0 fill-accent text-accent" />{h}</li>)}
                  </ul>
                  {s.example && <p className="mt-3 rounded-lg bg-raised px-3 py-2 font-mono text-[12.5px] text-muted">{s.example}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {s.action && !ok && <Link to={s.action.to} className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-[13.5px] font-medium text-on-accent hover:bg-accent-strong">{s.action.label}</Link>}
                    {s.soon ? <span className="inline-flex h-9 items-center gap-2 text-[13.5px] text-faint"><Lock size={14} />Em breve</span>
                      : s.id !== 'criar' && <button type="button" onClick={() => toggle(s.id)} aria-pressed={ok}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13.5px] transition-colors ${ok ? 'border-line text-muted hover:text-fg' : 'border-line-strong hover:border-accent hover:text-link'}`}>
                        {ok ? 'Desmarcar' : 'Já faço isso'}</button>}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
