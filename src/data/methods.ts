// Métodos de organização (fase 4B).
// Uma tarefa só, muitas formas de ver: um método é um preset de visões, colunas e rituais.
// `ready` = o app já mostra a visão; os outros aparecem como "em breve", sem fingir que existem.
// Cada método, regra e modelo traz um tutorial curto: como usar, por que é assim e quando vale a pena.
import type { Column, FocusRule, MethodId } from './api'

export type Guide = { how: string[]; why: string; when: string; origin?: string }
// elsewhere: o método já existe, mas fora do projeto (ex.: no menu Calendário)
export type MethodInfo = { id: string; name: string; what: string; ready: boolean; guide: Guide; elsewhere?: string }

export const METHODS: MethodInfo[] = [
  {
    id: 'kanban', name: 'Kanban', ready: true,
    what: 'Colunas que mostram em que pé cada tarefa está, com limite do que pode estar em andamento.',
    guide: {
      how: [
        'Cada coluna é uma etapa do trabalho: A fazer, Fazendo, Feito (ou as que fizerem sentido para você).',
        'Arraste o cartão para a direita conforme ele avança.',
        'Dê um limite à coluna "Fazendo" (o WIP). Quando ela enche, a regra é terminar algo antes de puxar outra tarefa.',
        'Uma coluna marcada como "concluída" conta como feito nos números do projeto.',
      ],
      why: 'Ver o trabalho inteiro de uma vez mostra onde as coisas travam. O limite de andamento existe porque começar muitas tarefas ao mesmo tempo faz todas demorarem mais: a atenção se divide e nada fecha.',
      when: 'Quase sempre. Funciona bem para trabalho contínuo, com pedidos chegando o tempo todo (clientes, suporte, conteúdo) e para quem quer enxergar gargalos.',
      origin: 'Criado na Toyota nos anos 1940 para controlar a produção e levado para software nos anos 2000.',
    },
  },
  {
    id: 'lista', name: 'Lista', ready: true,
    what: 'Todas as tarefas numa tabela, com filtro e ordenação.',
    guide: {
      how: ['Use o filtro para achar tarefas por título, etiqueta ou texto.', 'Clique no nome de uma coluna da tabela para ordenar por ela (prazo, prioridade, etapa).', 'Clique na linha para abrir a tarefa.'],
      why: 'O quadro é ótimo para ver o fluxo, mas ruim para comparar. A lista põe tudo lado a lado e responde perguntas rápidas: o que vence esta semana? o que é urgente?',
      when: 'Quando o projeto tem muitas tarefas, ou na hora de planejar e revisar.',
    },
  },
  {
    id: 'foco', name: 'Foco do dia', ready: true,
    what: 'Você escolhe poucas tarefas para hoje, em vez de olhar a lista inteira.',
    guide: {
      how: [
        'De manhã, escolha uma regra (3 MITs, 1-3-5 ou Ivy Lee) e preencha os lugares com tarefas do quadro.',
        'Comece pela primeira, que fica destacada: é a mais importante, ou a mais chata, do dia.',
        'Use "Focar 25 min" para trabalhar sem interrupção. O tempo fica registrado na tarefa.',
        'O que não couber fica para amanhã. No dia seguinte o foco começa vazio.',
      ],
      why: 'Uma lista grande dá a sensação de que nunca acaba e leva a fazer primeiro o que é fácil. Limitar o dia a poucas tarefas força a escolher o que importa e deixa claro quando o dia foi bom.',
      when: 'Para quem tem mais coisas do que tempo, se distrai com facilidade ou termina o dia sem saber o que fez.',
    },
  },
  {
    id: 'eisenhower', name: 'Eisenhower', ready: true,
    what: 'Separa as tarefas por urgência e importância em quatro quadrantes.',
    guide: {
      how: [
        'Pergunte duas coisas sobre cada tarefa: é urgente (tem prazo perto ou alguém esperando)? É importante (leva você para os seus objetivos)?',
        'Urgente e importante: fazer agora.',
        'Importante, mas não urgente: agendar um horário para fazer.',
        'Urgente, mas não importante: delegar, se der. Não importante e não urgente: eliminar.',
      ],
      why: 'O urgente grita e o importante espera calado. Sem separar os dois, o dia vai embora apagando incêndios e o que faz diferença de verdade (planejar, aprender, melhorar o negócio) nunca acontece.',
      when: 'Quando chega coisa demais e você precisa decidir o que cortar ou passar adiante. Bom para triagem semanal.',
      origin: 'Atribuído a Dwight Eisenhower e popularizado por Stephen Covey no livro "Os 7 hábitos das pessoas altamente eficazes".',
    },
  },
  {
    id: 'gtd', name: 'GTD', ready: true,
    what: 'Tira tudo da cabeça para uma caixa de entrada e decide o próximo passo de cada coisa.',
    guide: {
      how: ['Anote tudo na caixa de entrada, sem organizar.', 'Esvazie a caixa: se leva menos de 2 minutos, faça; se não, vira próxima ação, aguardando ou algum dia.', 'Agrupe as ações por contexto (@computador, @rua, @telefone).', 'Toda semana, faça a revisão: esvazie tudo e confira os projetos.'],
      why: 'A cabeça é boa para ter ideias, não para guardá-las. Cada pendência solta ocupa atenção. Com tudo anotado e com próximo passo definido, sobra calma para fazer.',
      when: 'Para quem tem muitas frentes ao mesmo tempo e sente que está esquecendo coisas.',
      origin: 'Criado por David Allen no livro "A arte de fazer acontecer" (2001).',
    },
  },
  {
    id: 'para', name: 'PARA', ready: false, elsewhere: 'Em Projetos, botão "Visão PARA"',
    what: 'Organiza tudo em Projetos, Áreas, Recursos e Arquivo.',
    guide: {
      how: ['Projetos: o que tem fim e prazo.', 'Áreas: responsabilidades contínuas (saúde, finanças, um cliente fixo).', 'Recursos: assuntos de interesse e material de consulta.', 'Arquivo: o que terminou ou parou.'],
      why: 'Organiza pela ação, não pelo assunto: o que precisa de você agora fica na frente, e o resto não atrapalha. Combina com as pastas da sua base de conhecimento.',
      when: 'Para organizar a vida inteira, e não só um projeto, junto com as notas.',
      origin: 'Criado por Tiago Forte ("Building a Second Brain").',
    },
  },
  {
    id: 'scrum', name: 'Scrum', ready: true,
    what: 'Trabalho em ciclos curtos (sprints) com um backlog priorizado.',
    guide: {
      how: ['Liste tudo no backlog, em ordem de prioridade.', 'A cada 1 ou 2 semanas, escolha o que cabe no sprint.', 'Acompanhe o quanto falta no gráfico de burndown.', 'No fim, entregue e faça uma retrospectiva: o que melhorar?'],
      why: 'Ciclos curtos dão ritmo e mostram cedo se o plano está errado. A retrospectiva faz o time melhorar a cada volta.',
      when: 'Produto ou software em equipe, com entregas frequentes.',
    },
  },
  {
    id: 'shapeup', name: 'Shape Up', ready: true,
    what: 'Ciclos de 6 semanas com apostas definidas antes.',
    guide: {
      how: ['Antes do ciclo, desenhe o problema e o limite de tempo (a aposta).', 'Durante 6 semanas, o time resolve do seu jeito.', 'Acompanhe pelo "morro": subindo = descobrindo; descendo = executando.', 'Depois, 2 semanas de respiro.'],
      why: 'Fixa o tempo e deixa o escopo flexível. Evita projetos que se arrastam para sempre.',
      when: 'Times pequenos de produto que querem autonomia e prazos firmes.',
      origin: 'Criado na Basecamp por Ryan Singer.',
    },
  },
  {
    id: 'okr', name: 'OKR', ready: true,
    what: 'Objetivos com resultados-chave mensuráveis.',
    guide: {
      how: ['Escreva um objetivo inspirador para o trimestre.', 'Defina de 2 a 4 resultados-chave com número.', 'Ligue os projetos e as tarefas que movem cada resultado.', 'Atualize o progresso toda semana.'],
      why: 'Liga o dia a dia ao que importa no longo prazo e mostra com número se está funcionando.',
      when: 'Para metas de negócio ou pessoais de médio prazo.',
    },
  },
  {
    id: 'calendario', name: 'Linha do tempo', ready: false, elsewhere: 'No menu Calendário, aba Linha do tempo',
    what: 'Os prazos de todos os projetos em seis semanas, com os marcos em destaque.',
    guide: {
      how: [
        'Cada linha é um projeto; a barra vai do primeiro ao último prazo dentro do período.',
        'Os pontos são as tarefas com prazo. Os losangos são os marcos (marque "É um marco" no painel da tarefa).',
        'A linha azul é hoje. Use as setas para andar no tempo.',
        'Clique no nome do projeto para abrir o quadro dele.',
      ],
      why: 'Olhando um projeto de cada vez, você não percebe que três entregas caem na mesma semana. A linha do tempo põe todos lado a lado e mostra os choques antes que eles aconteçam.',
      when: 'Para quem toca vários projetos ou clientes ao mesmo tempo e precisa prometer prazos realistas.',
    },
  },
  {
    id: 'timeblocking', name: 'Time blocking', ready: false, elsewhere: 'No menu Calendário, aba Semana',
    what: 'Cada tarefa ganha um horário na agenda da semana.',
    guide: {
      how: [
        'À esquerda ficam as tarefas sem horário. Arraste uma para o dia e a hora em que vai fazê-la.',
        'Prefere digitar? Clique no relógio ao lado da tarefa e escreva o dia, a hora e a duração. No resumo do dia (clique no nome do dia) também dá para agendar e mudar a hora digitando.',
        'O bloco nasce com a estimativa da tarefa (ou 1 hora). Mude a duração no resumo do dia.',
        'Arraste o bloco para outro horário se o plano mudar.',
        'Confira a carga da semana: se as horas planejadas passam das livres, algo precisa sair.',
      ],
      why: 'Uma lista de tarefas não diz se elas cabem no seu tempo. Dar horário a cada uma transforma intenção em compromisso e mostra, logo na segunda, se a semana é possível.',
      when: 'Para trabalho que exige concentração, semanas com muitas reuniões e para quem sempre acha que vai dar tempo.',
      origin: 'Prática antiga, popularizada por Cal Newport ("Trabalho focado").',
    },
  },
  {
    id: 'priorizacao', name: 'Priorização', ready: true,
    what: 'MoSCoW, RICE e ICE com pontuação calculada.',
    guide: {
      how: [
        'Escolha o jeito de pontuar no topo: RICE (mais completo), ICE (mais rápido) ou MoSCoW (para decidir o que entra numa entrega).',
        'RICE: diga quantas pessoas a tarefa atinge por mês (alcance), o tamanho do efeito (impacto), o quanto você confia nisso e quantas semanas leva (esforço).',
        'ICE: dê de 1 a 10 para impacto, confiança e facilidade. A nota é a média.',
        'A lista se ordena sozinha: a de cima é a próxima a fazer. As notas ficam guardadas na tarefa; trocar de método não apaga nada.',
      ],
      why: 'Quando tudo parece prioridade, a escolha vira palpite ou fica com quem fala mais alto. Dar nota pelos mesmos critérios para todas as tarefas deixa a decisão clara e fácil de explicar.',
      when: 'Backlogs grandes, listas de ideias, ou na hora de escolher a próxima aposta do Shape Up ou o que entra na sprint.',
      origin: 'RICE foi criado na Intercom; ICE, por Sean Ellis; MoSCoW, por Dai Clegg na Oracle.',
    },
  },
  {
    id: 'cronograma', name: 'Cronograma (Gantt)', ready: true,
    what: 'Tarefas no tempo, com início, prazo e o que depende do quê.',
    guide: {
      how: [
        'Cada linha é uma tarefa: dê um início e um prazo. A barra mostra quanto tempo ela ocupa.',
        'No "+" de "Depende de", escolha a tarefa que precisa terminar antes. Ela aparece como etiqueta na linha.',
        'Se uma tarefa começa antes de a anterior terminar, aparece um aviso de conflito com "Empurrar": um clique e ela passa para o dia seguinte, mantendo a duração.',
        'Mudar uma data nunca empurra as outras sozinho: o app só avisa. Tarefas sem data ficam numa lista abaixo, prontas para receber uma.',
      ],
      why: 'Quando uma entrega depende de várias etapas em ordem, o atraso de uma vira o atraso de todas. Ver as etapas no tempo e o que espera o quê mostra cedo onde o prazo vai estourar.',
      when: 'Projetos com etapas em sequência e uma data final: site para cliente, evento, lançamento, obra, mudança. Para trabalho contínuo sem data final, o quadro Kanban basta.',
      origin: 'O gráfico de barras no tempo foi popularizado por Henry Gantt por volta de 1910; as dependências vêm do método do caminho crítico, dos anos 1950.',
    },
  },
]
export const method = (id: string) => METHODS.find((m) => m.id === id)
export const methodName = (id: string) => method(id)?.name ?? id

export type RuleInfo = { id: FocusRule; label: string; title: string; slots: number[]; hint: string; guide: Guide }
export const FOCUS_RULES: RuleInfo[] = [
  // slots: quantos lugares em cada grupo (1-3-5 = uma grande, três médias, cinco pequenas)
  {
    id: 'mit3', label: '3 mais importantes', title: '3 MITs', slots: [3], hint: 'As três tarefas mais importantes do dia.',
    guide: {
      how: ['Escolha as 3 tarefas que fariam o dia valer a pena, mesmo que nada mais saísse.', 'Faça essas três antes de responder mensagens ou pegar coisas pequenas.', 'Terminou as três? O resto do dia é bônus.'],
      why: 'MIT vem do inglês "Most Important Tasks". Três é pouco o bastante para caber num dia real e muito o bastante para avançar. Ter só três evita a ilusão de produtividade de riscar vinte coisas pequenas.',
      when: 'O jeito mais simples de começar. Bom para quem nunca usou um método de foco.',
      origin: 'Popularizado por Leo Babauta (Zen Habits).',
    },
  },
  {
    id: '135', label: '1 grande, 3 médias, 5 pequenas', title: 'Regra 1-3-5', slots: [1, 3, 5], hint: 'Uma grande, três médias e cinco pequenas.',
    guide: {
      how: ['Uma tarefa grande: a que exige mais concentração (escrever uma proposta, fechar um projeto).', 'Três médias: importantes, mas de uma ou duas horas.', 'Cinco pequenas: rápidas, de minutos (responder alguém, pagar uma conta).', 'Faça a grande primeiro, enquanto a energia está alta.'],
      why: 'Um dia tem espaço para pouca coisa grande e várias pequenas. A regra equilibra os dois: você avança no que importa sem deixar as pendências rápidas acumularem.',
      when: 'Dias variados, com uma entrega grande e muita coisa miúda em volta. Bom para freelancers e para a casa.',
    },
  },
  {
    id: 'ivy', label: '6 em ordem, uma por vez', title: 'Método Ivy Lee', slots: [6], hint: 'Seis tarefas em ordem. Só passa para a próxima quando terminar a anterior.',
    guide: {
      how: ['No fim do dia, escreva as 6 tarefas mais importantes de amanhã.', 'Coloque em ordem de importância.', 'No dia seguinte, trabalhe só na primeira até terminar. Depois, a segunda, e assim por diante.', 'O que sobrar vai para a lista do dia seguinte.'],
      why: 'Decidir a ordem na véspera tira a dúvida de "por onde começo" da manhã. Fazer uma de cada vez acaba com a troca constante de tarefa, que gasta energia sem você perceber.',
      when: 'Para quem se perde pulando de uma coisa para outra ou demora para engrenar de manhã.',
      origin: 'Criado em 1918 pelo consultor Ivy Lee para o empresário Charles Schwab.',
    },
  },
]

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Cores do quadro: cinza, amarelo, verde; extras da paleta do editor de colunas.
const GRAY = '#8A93B4', YELLOW = '#E0A800', GREEN = '#1D6B45', COBALT = '#2238C4', ORANGE = '#C2410C'
const col = (name: string, color: string, wip: number | null = null, done = false): Column => ({ id: null, name, color, wip, done })

export type Preview = 'columns' | 'bars' | 'grid' | 'matrix' | 'line' | 'blank'
export type Template = {
  id: string; name: string; combo: string; about: string; preview: Preview; ready: boolean
  columns: Column[]; methods: MethodId[]; views: string; fields: string; rituals: string
  focusRule: FocusRule; reviewDay: number | null; guide: Guide
}

export const TEMPLATES: Template[] = [
  {
    id: 'freelancer', name: 'Freelancer', combo: 'Kanban + Foco do dia', preview: 'columns', ready: true,
    about: 'Para quem atende vários clientes e precisa saber, toda manhã, as três coisas que importam hoje.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 3), col('Aguardando cliente', COBALT), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'foco', 'lista'], views: 'Quadro · Foco do dia · Lista', fields: 'Prazo, estimativa, prioridade',
    rituals: 'Escolher as 3 do dia ao abrir · revisão de sexta', focusRule: 'mit3', reviewDay: 5,
    guide: {
      how: ['Tudo que um cliente pede entra em "A fazer".', 'Quando você manda algo para aprovação, mova para "Aguardando cliente": sai da sua frente, mas não some.', 'Toda manhã, abra o Foco do dia e escolha as 3 mais importantes.', 'Na sexta, faça a revisão: cobre quem está em "Aguardando" e planeje a semana seguinte.'],
      why: 'O que mais atrasa um freelancer é esperar o cliente sem perceber e se perder entre vários clientes. A coluna "Aguardando" separa o que depende de você do que depende dos outros, e o foco diário escolhe por onde começar.',
      when: 'Prestadores de serviço, consultores e quem trabalha sozinho com vários clientes.',
    },
  },
  {
    id: 'agencia', name: 'Agência', combo: 'Kanban + Eisenhower', preview: 'matrix', ready: true,
    about: 'Muitos pedidos ao mesmo tempo: separe o que é urgente do que é importante e delegue o resto.',
    columns: [col('Entrada', GRAY), col('Produção', YELLOW, 4), col('Revisão', ORANGE, 2), col('Entregue', GREEN, null, true)],
    methods: ['kanban', 'eisenhower', 'lista'], views: 'Quadro · Eisenhower · Lista', fields: 'Prazo, prioridade, quadrante',
    rituals: 'Triagem da entrada · revisão de segunda', focusRule: 'mit3', reviewDay: 1,
    guide: {
      how: ['Todo pedido novo cai em "Entrada".', 'Na segunda, abra a matriz de Eisenhower e classifique a entrada: fazer, agendar, delegar ou eliminar.', 'O que é para fazer vai para "Produção", que tem limite de 4 para ninguém se afogar.', '"Revisão" tem limite de 2: se encher, alguém para de produzir e revisa.'],
      why: 'Em agência, tudo chega como urgente. A triagem com a matriz separa o que realmente importa. Os limites nas colunas evitam o acúmulo de trabalho pela metade, que é o que atrasa entregas.',
      when: 'Pequenas agências, times de marketing e quem recebe muitos pedidos de várias pessoas.',
    },
  },
  {
    id: 'dia-a-dia', name: 'Dia a dia', combo: 'Foco do dia 1-3-5', preview: 'bars', ready: true,
    about: 'Tarefas pessoais e da casa. Uma grande, três médias e cinco pequenas por dia, sem lista infinita.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 2), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'foco'], views: 'Foco do dia · Quadro', fields: 'Prazo, estimativa',
    rituals: 'Montar o dia de manhã · revisão de domingo', focusRule: '135', reviewDay: 0,
    guide: {
      how: ['Jogue tudo que precisa fazer no quadro, sem pensar em ordem.', 'De manhã, monte o dia no Foco: uma tarefa grande, três médias e cinco pequenas.', 'No domingo, revise a semana e limpe o que não faz mais sentido.'],
      why: 'Tarefas pessoais nunca acabam, e uma lista enorme desanima. Montar um dia de tamanho fixo traz a sensação de dia completo e ainda abre espaço para a tarefa grande que você vive adiando.',
      when: 'Vida pessoal, casa, estudos e quem quer começar a se organizar sem complicação.',
    },
  },
  {
    id: 'produto', name: 'Produto', combo: 'Scrum + OKR', preview: 'bars', ready: true,
    about: 'Para construir um produto em ciclos curtos, sabendo a cada duas semanas se o trabalho está movendo os números que importam.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 3), col('Revisão', COBALT, 2), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'scrum', 'okr', 'lista'], views: 'Sprint · OKR · Quadro · Lista', fields: 'Pontos, sprint, resultado-chave',
    rituals: 'Planejar a sprint · retrospectiva ao encerrar · check-in de OKR na segunda', focusRule: 'mit3', reviewDay: 1,
    guide: {
      how: ['Escreva 1 a 3 objetivos para o trimestre e, em cada um, 2 a 4 resultados-chave com número.', 'Jogue tudo que precisa ser feito no backlog e dê pontos (o tamanho relativo de cada coisa).', 'A cada duas semanas, abra uma sprint com uma meta e traga do backlog o que cabe.', 'No fim, encerre a sprint: o que não ficou pronto volta ao backlog e você faz a retrospectiva.', 'Toda segunda, atualize o número de cada resultado-chave.'],
      why: 'A sprint dá ritmo e mostra cedo se o plano estava errado; o OKR garante que esse ritmo esteja indo para algum lugar. Ligar cada tarefa a um resultado-chave revela o trabalho que não move nada.',
      when: 'Produto digital, software, ou qualquer projeto longo em equipe com entregas frequentes e metas medidas.',
    },
  },
  {
    id: 'vida', name: 'Vida pessoal', combo: 'GTD + revisão semanal', preview: 'grid', ready: true,
    about: 'Para tirar tudo da cabeça: uma caixa de entrada para anotar qualquer coisa e listas que dizem o que dá para fazer onde você está.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 2), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'gtd', 'foco'], views: 'GTD · Quadro · Foco do dia', fields: 'Contexto, tempo, energia, de quem espera',
    rituals: 'Esvaziar a caixa todo dia · revisão semanal de sexta', focusRule: 'mit3', reviewDay: 5,
    guide: {
      how: ['Anote na caixa de entrada tudo que aparecer na cabeça, sem organizar.', 'Uma vez por dia, abra o GTD e esvazie a caixa respondendo às quatro perguntas.', 'Quando for trabalhar, diga onde você está e quanto tempo tem: o app mostra só o que dá para fazer ali.', 'Na sexta, faça a revisão semanal: caixa em zero, aguardando cobrado, algum dia relido.'],
      why: 'A cabeça é boa para ter ideias, não para guardá-las. Com tudo anotado e com o próximo passo decidido, você para de se preocupar com o que pode estar esquecendo.',
      when: 'Vida pessoal e casa, ou para quem sente que tem coisa demais solta e esquece compromissos.',
    },
  },
  {
    id: 'ciclos', name: 'Ciclos', combo: 'Shape Up + priorização', preview: 'line', ready: true,
    about: 'Para times pequenos que querem prazo firme: uma aposta por ciclo de 6 semanas, sem esticar.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 3), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'shapeup', 'priorizacao'], views: 'Morro · Priorização · Quadro', fields: 'Frente do ciclo, pontuação',
    rituals: 'Mover os pontos no morro toda semana · 2 semanas de respiro entre ciclos', focusRule: 'mit3', reviewDay: 5,
    guide: {
      how: ['Use a priorização para escolher a próxima aposta: o que tem mais impacto pelo esforço.', 'Abra um ciclo com a aposta e o apetite (quanto tempo vale gastar, em geral 6 semanas).', 'Quebre a aposta em frentes e ligue as tarefas a elas.', 'Toda semana, mova cada frente no morro: subindo enquanto descobre, descendo quando só falta fazer.', 'Se não couber no prazo, corte escopo. No fim, encerre e descanse duas semanas.'],
      why: 'Prazo fixo e escopo flexível impedem o projeto que nunca acaba. O morro mostra risco melhor que porcentagem: uma frente parada na subida é onde mora a dúvida.',
      when: 'Produtos e projetos internos de time pequeno, com autonomia para decidir o como.',
    },
  },
  {
    id: 'branco', name: 'Em branco', combo: 'Só o Kanban padrão', preview: 'blank', ready: true,
    about: 'Quadro A fazer, Fazendo e Feito. Ligue outros métodos quando quiser.',
    columns: [col('A fazer', GRAY), col('Fazendo', YELLOW, 3), col('Feito', GREEN, null, true)],
    methods: ['kanban', 'lista'], views: 'Quadro · Lista', fields: 'Os campos básicos', rituals: 'Nenhum', focusRule: 'mit3', reviewDay: null,
    guide: {
      how: ['Comece com três colunas: A fazer, Fazendo e Feito.', 'Use por uma ou duas semanas.', 'Depois, nas configurações do projeto, ligue o que fizer falta: Foco do dia, Eisenhower ou um ritual semanal.'],
      why: 'Às vezes o melhor método é o mais simples. Começar sem regra mostra o que você realmente precisa antes de adicionar processo.',
      when: 'Projetos pequenos, ou quando você ainda não sabe qual método combina com você.',
    },
  },
]

// Próxima data do ritual semanal (hoje conta, se ainda não foi feito hoje).
export function nextReview(day: number, lastDone: string | null, today: Date = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  let add = (day - d.getDay() + 7) % 7
  if (add === 0 && lastDone === iso(d)) add = 7
  const next = new Date(d); next.setDate(d.getDate() + add)
  return { date: next, inDays: add, iso: iso(next) }
}
