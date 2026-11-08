// Monta o segundo cérebro de uma pessoa a partir das respostas do assistente (pages/Brain.tsx).
// Só gera textos; quem grava no disco, com as garantias de segurança, é o Rust (src-tauri/src/brain.rs).
// O formato é Markdown puro com [[links]]: arquivos da pessoa, que abrem em qualquer editor de texto.

export type Area = 'pessoal' | 'trabalho' | 'clientes' | 'estudos' | 'conteudo'
export type Profile = { name: string; role: string; areas: Area[]; orgs: string[] }
export type BrainFile = { path: string; content: string }
export type BrainPlan = { dirs: string[]; files: BrainFile[] }

export const AREAS: { id: Area; label: string; hint: string }[] = [
  { id: 'pessoal', label: 'Vida pessoal', hint: 'metas, rotina, saúde, finanças pessoais' },
  { id: 'trabalho', label: 'Trabalho', hint: 'projetos, reuniões, decisões' },
  { id: 'clientes', label: 'Empresa ou clientes', hint: 'clientes, empresas, propostas, dinheiro' },
  { id: 'estudos', label: 'Estudos', hint: 'cursos, leituras, resumos' },
  { id: 'conteudo', label: 'Conteúdo', hint: 'ideias de posts, roteiros' },
]

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nota'

// data local (toISOString seria UTC e viraria o dia antes da meia-noite)
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

type Folder = { path: string; what: string; when: string; areas?: Area[] }

// Pastas possíveis. Sem `areas` = sempre existe.
const FOLDERS: Folder[] = [
  { path: 'inbox', what: 'Captura rápida: tudo que ainda não tem lugar.', when: 'Não sei onde guardar, anoto e organizo depois' },
  { path: 'diario', what: 'Uma nota por dia (AAAA-MM-DD): o que fiz, pensei e decidi.', when: 'Registro do dia' },
  { path: 'projetos', what: 'Uma pasta por projeto, com um overview.md.', when: 'Status, decisão ou próximos passos de um projeto' },
  { path: 'pessoas', what: 'Uma nota por pessoa.', when: 'Quem é fulano, contato novo, o que conversamos' },
  { path: 'reunioes', what: 'Notas de reunião, uma por encontro.', when: 'Tenho uma reunião', areas: ['trabalho', 'clientes'] },
  { path: 'clientes', what: 'Uma pasta por cliente ativo.', when: 'Algo de um cliente', areas: ['clientes'] },
  { path: 'empresas', what: 'Empresas que ainda não são clientes.', when: 'Empresa nova, lead, parceiro', areas: ['clientes'] },
  { path: 'financas', what: 'Entradas, saídas, contratos e valores.', when: 'Recebi, paguei, quanto custa', areas: ['clientes', 'pessoal'] },
  { path: 'pessoal', what: 'Metas, rotina, saúde, estudos pessoais.', when: 'Meta, hábito, vida pessoal', areas: ['pessoal'] },
  { path: 'conhecimento', what: 'O que aprendi, em notas limpas e ligadas entre si.', when: 'Aprendi algo que quero lembrar' },
  { path: 'conhecimento/fontes', what: 'Material bruto: artigos, aulas, transcrições.', when: 'Material de estudo para processar', areas: ['estudos'] },
  { path: 'conteudo/ideias', what: 'Ideias de post, vídeo e texto.', when: 'Tive uma ideia de conteúdo', areas: ['conteudo'] },
  { path: 'conteudo/roteiros', what: 'Roteiros prontos para gravar.', when: 'Roteiro de vídeo', areas: ['conteudo'] },
  { path: 'referencias/modelos', what: 'Modelos de nota (pessoa, projeto, reunião, dia).', when: 'Criar nota nova a partir de um modelo' },
  { path: 'referencias/anexos', what: 'Imagens e PDFs colados nas notas.', when: 'Anexo' },
  { path: 'arquivo', what: 'O que terminou. Nada é apagado: vem pra cá com a data.', when: 'Projeto encerrado, nota velha' },
]

export function folders(areas: Area[]) {
  return FOLDERS.filter((f) => !f.areas || f.areas.some((a) => areas.includes(a)))
}

const TEMPLATES: BrainFile[] = [
  { path: 'referencias/modelos/diario.md', content: `# {{date}}

## Hoje
-

## Decisões
-

## Amanhã
-
` },
  { path: 'referencias/modelos/pessoa.md', content: `# {{title}}
- **Quem é:**
- **Onde nos conhecemos:**
- **Contato:**

## Histórico
- {{date}} |
` },
  { path: 'referencias/modelos/projeto.md', content: `# {{title}}
- **O que é:**
- **Status:** ideia | em andamento | pausado | concluído
- **Pessoas:** [[ ]]

## Próximos passos
1.

## Decisões
- {{date}} |

## Histórico
- {{date}} | criado
` },
  { path: 'referencias/modelos/reuniao.md', content: `# Reunião: {{title}}
- **Data:** {{date}}
- **Pessoas:** [[ ]]
- **Objetivo:**

## Pauta
-

## O que ficou decidido
-

## Próximos passos
- [ ]
` },
]

export function plan(p: Profile): BrainPlan {
  const name = p.name.trim() || 'Eu'
  const me = slug(name)
  const day = today()
  const fs = folders(p.areas)
  // um projeto por slug (dois nomes que viram a mesma pasta contam uma vez)
  const bySlug = new Map<string, string>()
  for (const o of p.orgs.map((x) => x.trim()).filter(Boolean)) if (!bySlug.has(slug(o))) bySlug.set(slug(o), o)
  const orgs = [...bySlug.values()]
  const first = orgs[0] ? slug(orgs[0]) : 'primeiro-projeto'
  const has = (path: string) => fs.some((f) => f.path === path)

  const leiame = `# Minha base de conhecimento
> Leia antes de guardar qualquer coisa. Este arquivo explica onde cada coisa vai. Criado pelo Tesseract em ${day}; é seu, edite à vontade.

## Quem sou eu
**${name}**${p.role.trim() ? `. ${p.role.trim()}` : ''}
Ficha: [[pessoas/${me}]]
${orgs.length ? `\n**Onde atuo:** ${orgs.map((o) => `[[projetos/${slug(o)}/overview|${o}]]`).join(', ')}\n` : ''}
## Estrutura
| Pasta | O que tem |
|---|---|
${fs.map((f) => `| \`${f.path}/\` | ${f.what} |`).join('\n')}

## Onde guardar cada coisa
| Quando for... | Vai para |
|---|---|
${fs.map((f) => `| ${f.when} | \`${f.path}/\` |`).join('\n')}

## Rotina
- **Todo dia:** jogue tudo no \`inbox/\` sem pensar onde vai. Escreva a nota do dia em \`diario/\` (3 linhas bastam).
- **Toda semana:** esvazie o \`inbox/\`: cada nota vai para a pasta certa ou para \`arquivo/\`. Atualize os próximos passos dos projetos.
- **Sempre:** ligue as notas com links (\`[[nome da nota]]\`). Uma nota sobre uma pessoa liga ao projeto; a reunião liga às duas.

## Combinados
- Datas no formato AAAA-MM-DD, no começo do nome das notas datadas.
- Nada é apagado: o que acabou vai para \`arquivo/\`.
- Informação nova sobre uma pessoa ou projeto vai para o \`## Histórico\` da nota dela, com a data.
- Diferencie o que é fato do que é ideia ou hipótese.

## Como o Tesseract usa esta base
O Tesseract lê estas notas no seu computador para buscar e responder com a fonte de cada informação. Ele só escreve aqui quando você pede ou confirma.
`

  const files: BrainFile[] = [
    { path: 'LEIA-ME.md', content: leiame },
    ...TEMPLATES,
    { path: `pessoas/${me}.md`, content: `# ${name}
- **Quem é:** eu${p.role.trim() ? `. ${p.role.trim()}` : ''}
${orgs.length ? `- **Projetos:** ${orgs.map((o) => `[[projetos/${slug(o)}/overview|${o}]]`).join(', ')}\n` : ''}
## Histórico
- ${day} | criei minha base de conhecimento com o Tesseract. Primeiro dia: [[diario/${day}]]
` },
    { path: `diario/${day}.md`, content: `# ${day}

## Hoje
- Criei minha base de conhecimento. A estrutura está em [[LEIA-ME]].
- Primeiro projeto: [[projetos/${first}/overview]]

## Amanhã
- Jogar no \`inbox/\` tudo que estiver na cabeça.
` },
    { path: `inbox/${day}-o-que-esta-na-cabeca.md`, content: `# O que está na minha cabeça agora
> Exemplo de captura rápida. Escreva sem organizar; na revisão da semana cada item vai para o lugar certo.

-
-
-
` },
    ...(orgs.length ? orgs : ['Primeiro projeto']).map((o): BrainFile => ({
      path: `projetos/${slug(o)}/overview.md`,
      content: `# ${o}
- **O que é:**
- **Status:** em andamento
- **Pessoas:** [[pessoas/${me}|${name}]]

## Próximos passos
1.

## Decisões
- ${day} |

## Histórico
- ${day} | criado com a base de conhecimento ([[diario/${day}]])
`,
    })),
    { path: 'conhecimento/como-funciona-uma-base-de-conhecimento.md', content: `# Como funciona uma base de conhecimento
Uma base de conhecimento (o que muita gente chama de segundo cérebro) é um lugar fora da sua cabeça onde fica o que você sabe, decide e precisa lembrar. A cabeça fica livre para pensar; o arquivo guarda.

## Os quatro hábitos
1. **Capturar:** anotou, jogou no \`inbox/\`. Sem decidir onde vai.
2. **Organizar:** uma vez por semana, cada nota do inbox vai para a pasta certa (ver [[LEIA-ME]]).
3. **Ligar:** use links (\`[[nome da nota]]\`) entre pessoas, projetos e reuniões. É isso que transforma notas soltas em memória.
4. **Usar:** antes de decidir, procure o que você já sabe. O Tesseract ajuda a buscar e responde com a fonte.

## Exemplo de ligação
[[pessoas/${me}]] → [[projetos/${first}/overview]] → [[diario/${day}]]
` },
  ]
  if (has('reunioes')) files.push({ path: 'reunioes/LEIA-ME.md', content: 'Notas de reunião. Use o modelo [[referencias/modelos/reuniao]] e nomeie como AAAA-MM-DD-assunto.\n' })

  return { dirs: fs.map((f) => f.path), files }
}

// Árvore de pastas para a prévia no assistente.
// Inclui as pastas intermediárias (referencias/ antes de referencias/modelos/), em ordem.
export function tree(p: Profile) {
  const out: { path: string; depth: number; what: string }[] = []
  const seen = new Set<string>()
  for (const f of folders(p.areas)) {
    const parts = f.path.split('/')
    parts.forEach((_, i) => {
      const path = parts.slice(0, i + 1).join('/')
      if (seen.has(path)) return
      seen.add(path)
      out.push({ path, depth: i, what: path === f.path ? f.what : '' })
    })
  }
  return out
}
