# Primeiros passos (para todo mundo)

## Para quem é

Para quem acabou de instalar o Tesseract, qualquer que seja o uso. No fim, a pessoa tem o app instalado, o menu e o Início montados para o que faz, uma base de conhecimento criada ou conectada, a IA escolhida (local ou externa), um backup feito e sabe os atalhos principais.

Todos os outros roteiros partem daqui. Grave esta série primeiro.

## A pessoa fictícia do exemplo

- **Nome:** Ana Exemplo (pessoa inventada, só para o exemplo).
- **O que faz:** designer freelancer em Curitiba (PR), atende pequenos negócios.
- **Por que instala:** quer juntar as notas, os projetos e o dinheiro num lugar só, sem mandar nada para a nuvem.
- **Computador do exemplo:** Windows 10 ou 11, 8 GB de memória.

Todos os nomes, valores e empresas deste roteiro são de exemplo.

## Episódios

### Ep. 1: Instalar o Tesseract

- **Objetivo:** baixar, instalar e abrir o app pela primeira vez.
- **Telas:** site (página de download), instalador do Windows.
- **Plano:** Grátis.
- **Duração estimada:** 2 min.
- **Preparar antes:** computador limpo ou máquina virtual sem o Tesseract; o instalador da versão que vai ao ar.
- **Revisar antes de gravar:** o instalador vai mudar na fase 13 (instalador próprio, "cartão sobre a cena", com a etapa "IA no seu computador"). Hoje o site está em beta fechado e o botão é "Entrar no beta". O aviso do Windows de "app desconhecido" só some quando houver assinatura de código.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Abrir a página de download do site e clicar no botão do instalador. | O arquivo `.exe` baixa. A página mostra o tamanho e o código SHA-256. | "Baixe o instalador na página oficial. Ele é pequeno." |
| 2 | (Opcional) Mostrar o botão de copiar o SHA-256. | O código é copiado. | "Quer conferir se o arquivo é o original? Compare este código." |
| 3 | Abrir o instalador. Se o Windows avisar, clicar em "Mais informações" e "Executar assim mesmo". | A tela de boas-vindas do instalador. | "O Windows pode avisar que o app é novo. É normal nesta fase." |
| 4 | Clicar em "Instalar o Tesseract". Mostrar o link "Escolher pasta e atalhos". | Barra de progresso e depois "Tudo pronto". | "Um clique instala. Se quiser, escolha a pasta e os atalhos." |
| 5 | Etapa "IA no seu computador (opcional)": mostrar as caixas já marcadas pelo tamanho da memória. | Ollama, um modelo de conversa e o bge-m3 marcados, com o tamanho de cada um. | "A IA pode rodar no seu computador. O instalador marca o que cabe." |
| 6 | Clicar em "Abrir o Tesseract". | A tela de boas-vindas do app. | "Pronto. Vamos abrir o app." |

### Ep. 2: Boas-vindas, o seu negócio e a sua base de conhecimento

- **Objetivo:** escolher o que você faz (o app monta o menu, o quadro e o Início) e criar a base de conhecimento respondendo quatro perguntas.
- **Telas:** Boas-vindas (primeira abertura), "O que você faz?" (segmento), Conhecimento (assistente).
- **Plano:** Grátis.
- **Duração estimada:** 4 min.
- **Preparar antes:** app com banco limpo (`npm run teste:limpo`), sem base de conhecimento configurada e sem segmento escolhido; uma pasta vazia, por exemplo `Documentos\Conhecimento-Ana`.
- **Revisar antes de gravar:** o piloto aprovado de 2026-11-02 mostra "Criar meu segundo cérebro" e não tem a tela "O que você faz?". Regravar com o mesmo molde.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Mostrar a tela "Boas-vindas. Por onde começamos?". | Três opções. A primeira tem o selo RECOMENDADO. No rodapé, as três promessas de privacidade. | "Na primeira abertura, o Tesseract pergunta por onde começar." |
| 2 | Passar o mouse pelas promessas do rodapé. | "Tudo fica neste computador", "A IA só age com o seu ok", "Exporte tudo quando quiser". | "Seus dados ficam com você. Sempre." |
| 3 | Clicar em "Criar minha base de conhecimento". | A tela "O que você faz?", com oito modelos e a prévia "Assim fica para…" ao lado. | "Antes, uma pergunta: o que você faz?" |
| 4 | Clicar em dois ou três modelos, devagar (por exemplo "Clínica ou estúdio" e "Agência"). | A prévia muda na hora: o menu, as colunas do quadro, os widgets do Início e a prospecção ligada ou desligada. | "Cada modelo monta o menu, o quadro e o Início do seu jeito." |
| 5 | Clicar em "Freelancer". | "Assim fica para freelancer": quadro Trabalhos (A fazer, Fazendo, Revisão do cliente, Feito), widgets de tarefas, horas, cobranças, receita e agenda. | "A Ana é freelancer. Então: projetos, horas e cobrança." |
| 6 | Mostrar a caixa "Criar o quadro Trabalhos em Projetos" marcada e o aviso do rodapé. | "Nada fica preso: dá para trocar depois no Início ou em Configurações." | "Nada fica preso. Dá para trocar depois." |
| 7 | Clicar em "Montar meu Tesseract". | O assistente do Conhecimento, com os passos Você, Para que, Onde atua, Onde salvar. | "Agora, a base de conhecimento. São quatro perguntas curtas." |
| 8 | Passo "Primeiro, quem é você?": digitar `Ana Exemplo` e `Designer freelancer em Curitiba`. Clicar em "Continuar". | O passo seguinte. | "Seu nome e o que você faz viram a primeira linha da base." |
| 9 | Passo "Para que vai usar?": marcar "Vida pessoal", "Trabalho" e "Empresa ou clientes". Clicar em "Continuar". | As caixas marcadas em azul. | "Cada escolha cria as pastas certas. Dá para mudar depois." |
| 10 | Passo "Onde você atua?": digitar `Estúdio Ana Exemplo` e clicar em "Adicionar". Clicar em "Continuar". | O nome aparece como etiqueta. | "Empresas e clientes fixos ganham uma pasta e um espaço próprio." |
| 11 | Passo "Onde salvar?": clicar em "Escolher" e apontar a pasta vazia. | O caminho da pasta no campo. | "É uma pasta comum, com arquivos de texto. São seus e abrem em qualquer editor." |
| 12 | Clicar em "Criar minha base de conhecimento". | A base criada, com o `LEIA-ME.md` e as pastas. | "Pronto. Sua base já tem estrutura, modelos e um guia." |

Quem não se encaixa em nenhum modelo escolhe "Montar do zero" (todos os módulos no menu) ou "Pular e manter tudo como está", no topo da tela. O Ep. 9 mostra como mudar o Início e o menu depois.

### Ep. 3: Conectar uma base que já existe

- **Objetivo:** usar uma pasta de notas que a pessoa já tem (por exemplo, um vault do Obsidian).
- **Telas:** Boas-vindas, Conhecimento ("Conectar as notas que você já tem").
- **Plano:** Grátis.
- **Duração estimada:** 1 min 30 s.
- **Preparar antes:** banco limpo; uma pasta de exemplo com 5 a 10 notas `.md` fictícias.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Na Boas-vindas, clicar em "Conectar uma pasta que já existe". | A tela "O que você faz?". | "Já usa Obsidian ou outra pasta de notas? Conecte." |
| 2 | Escolher "Freelancer" e clicar em "Montar meu Tesseract" (a escolha do modelo está no Ep. 2). | A tela "Conectar as notas que você já tem". | "Escolha o que você faz e siga para as notas." |
| 3 | Clicar em "Escolher", apontar a pasta e clicar em "Verificar". | A confirmação de que a pasta existe. | "O Tesseract só lê a pasta. Não muda nada nela." |
| 4 | Clicar em "Usar esta pasta". | A tela Conhecimento com "Conectado" e a busca. | "Conectado." |
| 5 | Clicar em "Atualizar índice" e digitar uma palavra no campo "Buscar nas suas notas" (no exemplo, `logo`). | As notas que têm a palavra. | "A busca por texto já funciona, mesmo sem internet." |
| 6 | Clicar numa nota da lista. | A nota aberta ao lado da lista. | "Clique numa nota para ler ali mesmo." |

Mostrar também, em 5 segundos, a terceira opção da Boas-vindas: "Começar sem notas por enquanto". Ela também passa por "O que você faz?" e depois abre o Início. Legenda: "Pode começar sem notas e criar depois."

### Ep. 4: Escolher a IA (local ou externa)

- **Objetivo:** ligar a IA no computador com o Ollama, ou usar um provedor externo com a própria chave.
- **Telas:** Configurações > IA e privacidade; Chat (Ctrl+J).
- **Plano:** chat com IA e busca por significado são **Pro**. Configurar é possível no Grátis.
- **Duração estimada:** 4 min.
- **Preparar antes:** Ollama instalado com um modelo de conversa e o `bge-m3` (`ollama pull llama3.2:3b` e `ollama pull bge-m3`); base de conhecimento do Ep. 2 com algumas notas de exemplo; uma chave de teste de um provedor externo (nunca mostrar a chave inteira na tela).
- **Revisar antes de gravar:** a lista de modelos vai mudar na fase 13 (Qwen3.5 4B, bge-m3 e outros na mesma lista do instalador). Conferir os nomes na tela no dia da gravação.
- **Privacidade:** mostrar o aviso "Isto vai sair do seu computador" no envio externo.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Abrir Configurações (Ctrl+,) e rolar até "IA e privacidade". | O selo "Ollama ligado". | "A IA pode morar no seu computador. Isso se chama Ollama." |
| 2 | Em "Modelo local (Ollama)", escolher o modelo instalado. | O nome do modelo no campo. | "Escolha o modelo que vai conversar com você." |
| 3 | Em "Quem responde no chat", escolher "Só local (nada sai do computador)". | A opção marcada. | "Só local: nada sai do seu computador." |
| 4 | Em "Busca por significado", clicar em "Gerar agora". | O índice sendo criado. | "A busca por significado acha notas pelo sentido, não só pela palavra." |
| 5 | Apertar Ctrl+J e perguntar algo sobre as notas de exemplo. | A resposta com "Notas que encontrei" abaixo. | "Toda resposta mostra de qual nota veio." |
| 6 | Voltar a Configurações. Em "Provedor externo", escolher um provedor e colar a chave em "Chave da API". Clicar em "Guardar chave". | "Chave guardada no Cofre do Windows." | "Quer usar uma IA da internet? Use a sua chave. Ela fica no Cofre do Windows." |
| 7 | Mostrar o aviso de política do provedor, se aparecer. | "Atenção: a política deste provedor permite registrar ou usar para treino..." | "O app avisa quando o provedor pode guardar o que você manda." |
| 8 | Trocar para "Só externo (com sua permissão a cada envio)" e perguntar no Chat. | O pedido de confirmação antes do envio, mostrando o que vai sair. Clicar em enviar. | "Antes de qualquer envio, você vê o que vai sair e decide." |
| 9 | Em Configurações > IA externa, pôr um limite de chamadas por mês e os endereços permitidos. Clicar em "Salvar IA externa". | A confirmação de salvo. | "Você também pode pôr um teto de uso por mês." |
| 10 | Voltar para "Só local". | A opção marcada. | "Para o dia a dia, recomendamos a IA local." |

### Ep. 5: Organizações e escopos

- **Objetivo:** entender o seletor de escopo (Pessoal e cada empresa) e criar uma organização.
- **Telas:** barra lateral (seletor de escopo), Configurações > Organizações.
- **Plano:** organizações são **Pro**. O escopo Pessoal é Grátis.
- **Duração estimada:** 1 min 30 s.
- **Preparar antes:** nada além dos episódios anteriores.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Clicar no seletor de escopo, no topo da barra lateral. | Pessoal e a organização criada no assistente. | "Pessoal e cada empresa ficam separados. Isso é o escopo." |
| 2 | Em Configurações > Organizações, clicar em "Nova organização" e digitar `Aurora Studio`. | A organização na lista. | "Cada organização tem seus projetos, clientes e dinheiro." |
| 3 | Mostrar "Renomear" e "Arquivar". | Os botões na linha da organização. | "Arquivar esconde do seletor, sem apagar nada." |

### Ep. 6: Backup, restaurar e exportar tudo

- **Objetivo:** fazer uma cópia de segurança e saber levar os dados para fora.
- **Telas:** Configurações > Dados e backups; Configurações > Exportar tudo.
- **Plano:** Grátis (backup e exportação são sempre grátis).
- **Duração estimada:** 2 min.
- **Preparar antes:** alguns projetos e lançamentos de exemplo (dá para usar "Criar dados de teste" em `/teste`); uma pasta vazia para a exportação.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Em "Dados e backups", clicar em "Fazer backup agora". | O backup novo na lista, com data e tamanho. | "Um clique faz uma cópia segura de tudo." |
| 2 | Clicar no ícone de restaurar de um backup. | O aviso: o estado de agora fica guardado como backup antes. Clicar em "Cancelar". | "Restaurar troca os dados pelo backup. Antes, o app guarda o estado atual." |
| 3 | Em "Exportar tudo", clicar em "Exportar para uma pasta" e escolher a pasta vazia. | A pasta com `tesseract.json`, `csv/` e `markdown/`. | "Seus dados são seus. Exporte tudo em formatos abertos." |
| 4 | Abrir um CSV no Excel. | A planilha com acentos corretos. | "Abre direto no Excel." |

### Ep. 7: Atalhos e captura rápida

- **Objetivo:** usar o teclado para andar rápido e anotar de qualquer programa.
- **Telas:** Atalhos (`/atalhos`), busca (Ctrl+K), Chat (Ctrl+J), janela de captura (Ctrl+Shift+Espaço), Configurações > Captura rápida.
- **Plano:** Grátis nos atalhos. Captura rápida: plano a definir na fase 13.
- **Duração estimada:** 2 min.
- **Preparar antes:** um projeto qualquer; o Bloco de Notas aberto, para mostrar a captura por cima de outro programa.
- **Revisar antes de gravar:** o atalho global e a janela de captura só foram testados no navegador; conferir no app de verdade.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Apertar Ctrl+K e digitar `fin`. | A busca mostra Finanças. Enter abre. | "Ctrl+K busca qualquer tela." |
| 2 | Apertar Ctrl+B. | A barra lateral recolhe. Apertar de novo expande. | "Ctrl+B recolhe o menu." |
| 3 | Apertar Ctrl+Shift+L. | O tema escuro. Apertar de novo volta. | "Tema claro ou escuro, quando quiser." |
| 4 | Abrir a tela Atalhos e trocar um atalho. | A combinação nova gravada. | "Todos os atalhos podem ser trocados." |
| 5 | Com o Bloco de Notas na frente, apertar Ctrl+Shift+Espaço e digitar `ligar para o contador amanhã 10h`. | A janelinha mostra em "Para onde vai": tarefa, amanhã, 10h. Enter guarda. | "De qualquer programa, anote sem sair do que está fazendo." |
| 6 | Digitar só `ideia de logo com folhas` e Enter. | Vai para a caixa de entrada. | "Sem data, vai para a caixa de entrada. Você decide depois." |

### Ep. 8: Privacidade em um minuto

- **Objetivo:** mostrar onde ficam os dados e como o app pede permissão.
- **Telas:** Configurações > Dados e backups (caminho do banco), Configurações > IA e privacidade.
- **Plano:** Grátis.
- **Duração estimada:** 1 min.
- **Preparar antes:** nada.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Mostrar o caminho do banco em "Dados e backups". | O arquivo no computador. | "Tudo fica num arquivo no seu computador. Sem conta, sem nuvem." |
| 2 | Mostrar "Incluir pastas sensíveis" desligado. | A opção desligada, com `financas/` e `pessoal/`. | "Pastas sensíveis ficam fora da IA, a não ser que você ligue." |
| 3 | Mostrar o aviso "Isto vai sair do seu computador" (gravado no Ep. 4). | O aviso com o que vai sair. | "Nada sai sem o seu sim." |

### Ep. 9: O Início e o menu do seu jeito

- **Objetivo:** mudar o Início (widgets, tamanho, painéis salvos) e o menu (mostrar, esconder, renomear) depois do modelo escolhido no Ep. 2.
- **Telas:** Início (aviso "Montado para…", "Editar painel"), menu lateral (clique direito, "Mais módulos"), Configurações > Menu do seu jeito (`/personalizar`).
- **Plano:** Grátis.
- **Duração estimada:** 3 min.
- **Preparar antes:** modelo "Freelancer" escolhido no Ep. 2; alguns lançamentos e tarefas de exemplo, para os widgets não aparecerem vazios.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Abrir o Início e mostrar o aviso "Montado para freelancer". | Os botões "Ajustar menu" e "Trocar de modelo" no aviso; abaixo, os widgets do modelo. | "O Início já vem montado para o que você faz." |
| 2 | Clicar em "Editar painel". | O título "Editando o Início", a grade pontilhada e a lista de widgets ao lado. | "Tudo aqui se arrasta e muda de tamanho." |
| 3 | Arrastar "Horas da semana" pelo título até o topo. Puxar o canto de "Receita do mês" para aumentar. | Os outros cartões abrem espaço sozinhos. | "Arraste pelo título. Puxe o canto para crescer." |
| 4 | Em "Buscar widget", digitar `lança` e clicar em "Adicionar" em "Lançamentos recentes". | O widget novo na grade. | "Só aparecem os widgets dos módulos que estão no seu menu." |
| 5 | Em "Painéis salvos", clicar em "Novo painel" e chamar de `Fim do mês`. | O painel novo, com o nome no campo. | "Um Início para cada momento. O app abre no último que você usou." |
| 6 | Clicar em "Salvar disposição". | O Início com o painel novo e o seletor "Painel" no topo. | "Salvo." |
| 7 | No menu lateral, abrir "Mais módulos". Clicar com o botão direito em "CRM e Funil" e em "Mostrar no menu". | O CRM volta para o menu. | "O que você não usa fica guardado em Mais módulos. Nada é apagado." |
| 8 | Clicar com o botão direito em "Projetos", depois em "Renomear". Digitar `Trabalhos` e clicar em "Salvar". | O menu mostra "Trabalhos". No menu do clique direito aparece "Voltar ao nome Projetos". | "Dê aos módulos o nome que você usa." |
| 9 | Clicar com o botão direito em qualquer módulo e em "Personalizar o menu todo". | A tela "Menu do seu jeito", com as seções, os interruptores e "Nova seção". | "Aqui você liga, desliga, renomeia e muda a ordem de tudo." |
| 10 | Voltar ao Início. Clicar em "Trocar de modelo" e depois em "Cancelar e manter o atual". | A tela "O que você faz?" e a volta ao Início sem mudança. | "Mudou de ramo? Troque de modelo. Seus dados não mudam." |

## Configuração recomendada

- **Modelo do começo:** o mais perto do dia a dia em "O que você faz?". Na dúvida, escolha um e ajuste o menu depois (Ep. 9); "Montar do zero" põe todos os módulos no menu.
- **IA:** "Só local (nada sai do computador)" com o Ollama. Provedor externo só para perguntas sem dado sensível.
- **Pastas sensíveis:** desligadas na busca por significado.
- **Backup:** um "Fazer backup agora" antes de qualquer mudança grande (importar, restaurar, apagar organização).
- **Exportação:** uma exportação completa por mês, guardada fora do computador.
- **Notificações:** ligar todas em Configurações > Notificações e clicar em "Testar notificação".

## Erros comuns

- **Achar que um módulo sumiu.** O modelo guarda em "Mais módulos" o que não usa. Clique direito e "Mostrar no menu".
- **Trocar de modelo depois de montar o Início.** O modelo novo troca o menu e o Início que você arrumou (os dados não mudam). O app avisa no rodapé da tela.
- **Apontar uma pasta com arquivos importantes para criar a base.** Use uma pasta vazia. Para pastas que já têm notas, use "Conectar".
- **Achar que a IA não funciona, quando o Ollama está desligado.** Confira o selo "Ollama ligado" em Configurações.
- **Esquecer de instalar o modelo de busca.** Sem o `bge-m3`, a busca por significado não roda.
- **Mostrar a chave da API no vídeo.** Use uma chave de teste e corte o trecho, ou desfoque.
- **Gravar com o banco real.** Sempre `npm run teste` (faixa amarela no topo) e dados de exemplo.
- **Restaurar um backup sem querer.** O app guarda o estado atual antes, mas leia o aviso.
