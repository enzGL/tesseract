# Consultor

## Para quem é

Para consultores que atendem poucas empresas em projetos longos, com etapas e entregas marcadas: consultoria financeira, de processos, de RH. No fim, a pessoa tem um cronograma por cliente com dependências, metas medidas (OKR), notas de reunião no Conhecimento, contrato com parcelas e um resumo para mandar ao cliente.

## A empresa fictícia do exemplo

- **Nome:** Bússola Consultoria (empresa inventada).
- **Ramo:** consultoria financeira para pequenas empresas.
- **Cidade:** Recife (PE).
- **O que vende (valores de exemplo):** diagnóstico financeiro (R$ 4.000), acompanhamento de 6 meses (R$ 2.500 por mês).
- **Cliente de exemplo:** Padaria Sol (inventada), projeto "Reorganizar o caixa".

Todos os nomes e valores são de exemplo.

## Recursos Pro usados

Organizações, Cronograma (Gantt), OKR, Linha do tempo, CRM, Documentos e busca por significado são **Pro**.

## Episódios

### Ep. 1: O cronograma do projeto

- **Objetivo:** planejar as etapas com dependências e ver o que destrava o quê.
- **Telas:** Projetos > aba Cronograma ("O que destrava o quê", "Barras no tempo").
- **Plano:** **Pro**.
- **Duração estimada:** 3 min 30 s.
- **Preparar antes:** projeto `Reorganizar o caixa` com 8 tarefas e um marco `Entrega do diagnóstico`. O "Site da Padaria Sol" dos dados de teste já tem um conflito para mostrar. No começo, modelo "Consultor" (Primeiros passos, Ep. 2) e Finanças ligada no menu.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Em Configurar, ligar o método "Cronograma (Gantt)". Salvar. | A aba Cronograma. | "Projeto com etapas? Ligue o cronograma." |
| 2 | Abrir a aba. | "O que destrava o quê": "Pode começar agora", "Esperando outra tarefa" e "Feitas". | "O app mostra o que já pode começar e o que espera outra tarefa." |
| 3 | No painel da tarefa `Montar o fluxo de caixa`, em "Depende de", acrescentar `Coletar os extratos`. | A tarefa passa para "Esperando outra tarefa", com o dia em que pode começar. | "Uma etapa depende da outra? Ligue as duas." |
| 4 | Ir para "Barras no tempo". | As barras, a linha de hoje e o marco em losango. | "Veja o projeto todo no tempo." |
| 5 | No aviso de conflito, clicar em "Empurrar para dd/mm". | As datas mudam e a duração fica igual. | "Começou antes da anterior terminar? Um clique ajeita as datas." |

### Ep. 2: Metas do cliente com OKR

- **Objetivo:** ligar o trabalho a resultados que o cliente entende.
- **Telas:** Projetos > aba OKR; painel da tarefa ("move o resultado-chave").
- **Plano:** **Pro**.
- **Duração estimada:** 2 min 30 s.
- **Preparar antes:** o projeto do Ep. 1.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Ligar OKR em Configurar. Criar o objetivo `Caixa sob controle`. | O objetivo na aba OKR. | "O objetivo diz onde o cliente quer chegar." |
| 2 | Criar o resultado-chave `Dias de caixa`, partida 10, meta 45 (números de exemplo). | A barra de progresso. | "O resultado-chave tem número. Assim dá para medir." |
| 3 | Ligar uma tarefa ao resultado-chave pelo painel da tarefa. | A tarefa listada no resultado-chave. | "Cada tarefa diz qual número ela move." |
| 4 | No check-in, atualizar o valor e a confiança. | A barra e a cor da confiança mudam. | "Uma vez por semana, atualize o número." |

### Ep. 3: Reunião com o cliente

- **Objetivo:** chegar à reunião sabendo tudo do cliente e registrar o que foi decidido.
- **Telas:** Conhecimento (modelo de reunião), CRM (histórico), Chat.
- **Plano:** Grátis no Conhecimento; CRM e Chat **Pro**.
- **Duração estimada:** 2 min 30 s.
- **Preparar antes:** notas de exemplo sobre a Padaria Sol no Conhecimento; histórico de contatos no CRM.
- **Revisar antes de gravar:** o "Briefing antes da reunião" (fase 12) vai juntar tudo numa página. Regravar quando sair.
- **Privacidade:** se o Chat usar provedor externo, mostrar o pedido de confirmação antes do envio.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | No Chat, perguntar: `o que eu já sei sobre a Padaria Sol?`. | A resposta com as notas de fonte. | "Antes da reunião, pergunte à sua base." |
| 2 | Na ficha da empresa no CRM, ler a linha do tempo. | Os contatos e propostas anteriores. | "O histórico mostra cada conversa." |
| 3 | Abrir a pasta da base de conhecimento no Obsidian (ou num editor de texto) e criar a nota pelo modelo `referencias/modelos/reuniao.md`. Voltar ao Tesseract e clicar em "Atualizar índice". | A nota nova aparece na busca do Conhecimento. | "As notas ficam numa pasta comum. Escreva no Obsidian. O Tesseract lê e acha." |
| 4 | Registrar o contato no CRM e criar a tarefa com prazo pelo painel da oportunidade. | A tarefa no projeto. | "O que foi combinado vira tarefa." |

### Ep. 4: Contrato de acompanhamento e resumo mensal

- **Objetivo:** fechar o contrato de 6 meses e mandar o resumo de cada mês.
- **Telas:** Contratos, Finanças, Projetos > Resumo.
- **Plano:** **Pro**.
- **Duração estimada:** 3 min.
- **Preparar antes:** "Sua marca" da Bússola com dados de exemplo.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | "Novo contrato": item `Acompanhamento`, 6 parcelas mensais. | A folha com as 6 parcelas. | "Contrato de 6 meses, uma parcela por mês." |
| 2 | "Marcar como enviado" e "Assinado". | As parcelas em Finanças. | "Assinou? As parcelas entram em Finanças." |
| 3 | No fim do mês, aba Resumo: "Gerar resumo da operação", últimos 30 dias. | Entregas, marcos, resultados-chave movidos. | "Todo mês, o resumo do que foi feito." |
| 4 | "Copiar como texto" e colar no e-mail. | O texto pronto. | "Mande ao cliente. Ele vê o andamento sem pedir." |

## Configuração recomendada

- **Modelo do começo:** "Consultor" em "O que você faz?" (Briefing no começo do menu; quadro Consultorias). Esse modelo guarda Finanças em "Mais módulos": antes do Ep. 4, mostre Finanças no menu.
- **Escopo:** a consultoria como organização; um projeto por cliente.
- **Métodos:** Kanban + Cronograma (Gantt) + OKR. Lista para revisar tudo de uma vez.
- **Colunas:** A fazer, Fazendo (limite 3), Aguardando cliente, Feito.
- **Ritual:** revisão semanal com check-in do OKR na segunda.
- **Conhecimento:** uma nota por cliente e uma nota por reunião, ligadas entre si.
- **CRM:** a oportunidade ligada à nota do cliente.
- **Documentos:** diagnóstico em parcela única; acompanhamento em parcelas mensais.

## Erros comuns

- **Cronograma sem dependências.** Sem elas, o app não avisa conflito.
- **Resultado-chave sem número.** "Melhorar o caixa" não se mede. "Dias de caixa de 10 para 45" se mede.
- **Decisão de reunião só na memória.** Escreva na nota e crie a tarefa.
- **Esquecer o resumo do mês.** Crie uma tarefa com prazo no último dia útil do mês, ou use "desde o último resumo" como período.
