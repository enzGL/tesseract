# Tutoriais: índice dos roteiros

Roteiros dos vídeos e da futura aba Tutorial (fase 14). Organizados por modelo de operação, não por função. Briefing completo em `TUTORIAIS.md`.

**A aba Tutorial do app lê estes arquivos** (`src/data/tutorials.ts`). Mantenha o formato: `### Ep. N: Título`, os campos `- **Objetivo:**`, `- **Telas:**`, `- **Plano:**`, `- **Duração estimada:**`, `- **Privacidade:**`, a tabela de passos com 4 colunas e as seções `## Configuração recomendada` e `## Erros comuns`. Um modelo novo precisa entrar também na lista `META` de `src/data/tutorials.ts`.

Começo do app: depois da Boas-vindas vem "O que você faz?", que monta o menu, o quadro e o Início pelo segmento. Cada roteiro diz em "Configuração recomendada" qual modelo escolher e quais módulos ligar no menu (os que o modelo guarda em "Mais módulos").

Regras de gravação: sempre no modo de teste (`npm run teste`, faixa amarela no topo), com dados fictícios. Nunca mostrar chave de API, telefone ou empresa real. Legendas em pt-BR; EN e ES depois.

## Situação dos roteiros

| Arquivo | Modelo | Situação |
|---|---|---|
| `primeiros-passos.md` | Todo mundo | Escrito |
| `freelancer.md` | Freelancer de serviços | Escrito |
| `agencia.md` | Agência pequena | Escrito |
| `academia-clinica.md` | Negócio local | Escrito |
| `vida-pessoal.md` | Uso pessoal | Escrito |
| `vendas-b2b.md` | Vendas para empresas | Escrito |
| `produtor-conteudo.md` | Produtor de conteúdo (extra) | Escrito |
| `consultor.md` | Consultor (extra) | Escrito |

## Episódios por modelo

Legenda da coluna "Revisar": **sim** = a tela ainda vai mudar; conferir antes de gravar.

### Primeiros passos (Ana Exemplo)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | Instalar o Tesseract | Site, instalador | Grátis | **sim** (instalador próprio na fase 13; site em beta fechado) |
| 2 | Boas-vindas, o seu negócio e a sua base de conhecimento | Boas-vindas, O que você faz?, Conhecimento | Grátis | **sim** (piloto de 2026-11-02 sem a tela do segmento; regravar) |
| 3 | Conectar uma base que já existe | Boas-vindas, O que você faz?, Conhecimento | Grátis | não |
| 4 | Escolher a IA (local ou externa) | Configurações > IA e privacidade, IA externa; Chat | Pro (chat) | **sim** (lista de modelos na fase 13) |
| 5 | Organizações e escopos | Seletor de escopo, Configurações > Organizações | Pro | não |
| 6 | Backup, restaurar e exportar tudo | Configurações > Dados e backups, Exportar tudo | Grátis | não |
| 7 | Atalhos e captura rápida | Atalhos, Ctrl+K, captura | Grátis / a definir | **sim** (atalho global não testado no app) |
| 8 | Privacidade em um minuto | Configurações | Grátis | não |
| 9 | O Início e o menu do seu jeito | Início (Editar painel), menu lateral, Menu do seu jeito | Grátis | não |

### Freelancer (Estúdio Ana Exemplo)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | Um projeto por cliente | Projetos (galeria, Quadro) | Grátis / Pro | não |
| 2 | Foco do dia | Projetos > Foco do dia | Grátis | não |
| 3 | A semana no Calendário | Calendário (Semana, Linha do tempo) | Grátis / Pro | não |
| 4 | O cliente no CRM | CRM e Funil | Pro | não |
| 5 | Proposta, aceite e parcelas | Contratos, Finanças, CRM | Pro | **sim** (PDF no app; marca na fase 12) |
| 6 | Receber e emitir recibo | Finanças, Contratos | Grátis / Pro | não |
| 7 | Importar o extrato e conciliar | Finanças | Pro | não |
| 8 | O cliente no Conhecimento | Conhecimento, CRM | Pro | não |
| 9 | A revisão de sexta | Projetos, CRM > Follow-ups, Resumo | Grátis / Pro | **sim** (horas e faturamento na fase 12) |

### Agência (Aurora Studio)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | A agência como organização | Organizações, Projetos (modelo Agência) | Pro | não |
| 2 | Triagem com Eisenhower | Projetos > Eisenhower | Pro | não |
| 3 | Entrega em sprints | Backlog, Sprint, OKR | Pro | não |
| 4 | Entrega em ciclos | Priorização, Morro | Pro | não |
| 5 | Funil de vendas | CRM e Funil | Pro | não |
| 6 | Posts com aprovação | Social (Produção, Estúdio do post, Calendário) | Pro | **sim** (fase 9 sem validação clicando) |
| 7 | Relatório do mês para o cliente | Projetos > Resumo | Pro | **sim** (relatório em PDF na fase 12) |
| 8 | Proposta e contrato | Contratos, Finanças | Pro | **sim** (PDF no app) |
| 9 | Bots para a agência | Bots | Pro | **sim** (fase 5 sem validação clicando) |

### Negócio local (Studio Maré)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | Cliente ideal (ICP) | Prospecção (assistente, Seu ICP) | Pro | não |
| 2 | Trazer as empresas | Prospecção > Lista, Fontes | Pro | **sim** (7B sem validação clicando) |
| 3 | Triagem um por um | Prospecção > Triagem | Pro | não |
| 4 | Mensagem com IA no WhatsApp | Prospecção, Bots > Vendas | Pro | **sim** (7B) |
| 5 | Follow-ups até fechar | CRM, notificações | Pro | **sim** (notificações no app) |
| 6 | Mensalidades em Finanças | CRM, Contratos, Finanças | Pro | **sim** (vocabulário por área na fase 12) |

### Uso pessoal (Ana Exemplo)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | A base de conhecimento da vida pessoal | Conhecimento, Chat | Grátis / Pro | não |
| 2 | Tirar tudo da cabeça com o GTD | Projetos > GTD, captura | Pro | não |
| 3 | Montar o dia no Foco | Projetos > Foco do dia | Grátis | não |
| 4 | Finanças pessoais | Finanças | Grátis / Pro | não |
| 5 | Revisão semanal e visão PARA | GTD, Visão PARA | Pro | não |

### Vendas B2B (Norte Labs)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | O ICP de quem vende para empresas | Prospecção (assistente) | Pro | não |
| 2 | Campanhas por segmento e cidade | Prospecção > Campanhas, Lista, Fontes | Pro | **sim** (Apify e 7B sem validação) |
| 3 | O bot de Vendas no seu estilo | Bots > Vendas, Prospecção > Triagem | Pro | **sim** (fase 5 e 7B) |
| 4 | Do primeiro contato à demonstração | CRM, captura rápida | Pro | **sim** (atalho global no app) |
| 5 | Proposta, assinatura e receita recorrente | Contratos, CRM, Finanças | Pro | **sim** (PDF no app) |
| 6 | De onde vem cada venda (UTM) | Campanhas (Painel, Links, Jornada) | Pro | **sim** (fase 10 sem validação clicando; QR code ainda não existe) |

### Produtor de conteúdo (Horta na Varanda)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | Ideias e roteiros no Conhecimento | Conhecimento, captura rápida, Chat | Grátis / Pro | **sim** (captura no app) |
| 2 | Quadro de produção | Projetos (Editar colunas, Foco), Calendário | Grátis | não |
| 3 | Marcas parceiras e proposta de publi | CRM, Contratos, Finanças | Pro | não |
| 4 | Calendário editorial | Social (Produção, Estúdio do post, Calendário) | Pro | **sim** (fase 9 sem validação clicando) |

### Consultor (Bússola Consultoria)

| Ep. | Título | Telas | Plano | Revisar |
|---|---|---|---|---|
| 1 | O cronograma do projeto | Projetos > Cronograma | Pro | não |
| 2 | Metas do cliente com OKR | Projetos > OKR | Pro | não |
| 3 | Reunião com o cliente | Chat, CRM, Conhecimento | Grátis / Pro | **sim** (briefing antes da reunião na fase 12) |
| 4 | Contrato e resumo mensal | Contratos, Finanças, Resumo | Pro | **sim** (relatório para o cliente na fase 12) |

## Ordem sugerida de gravação

1. Primeiros passos (base de todos).
2. Vida pessoal e Freelancer (quase tudo estável).
3. Consultor, Agência e Negócio local.
4. Vendas B2B e Produtor de conteúdo (Social e Campanhas são as telas mais novas).

## Telas que ainda vão mudar (revisar antes de gravar)

- **Instalador e Boas-vindas:** instalador próprio em Tauri e etapa "IA no seu computador" (fase 13).
- **Configurações > IA:** lista de modelos do Ollama (fase 13); Licença (fase 13).
- **Limites do Grátis:** entram no app na fase 13. Conferir a marcação Grátis/Pro de cada episódio.
- **Automações** e **Chat que executa ações** (fase 12).
- **Recursos Pro da fase 12:** horas e faturamento, documentos com a sua marca, relatório para o cliente, painel do negócio, vocabulário por área.
- **Sem validação clicando no app:** Bots (fase 5), Prospecção 7B, PDF dos Documentos, atalho global, captura e notificações do Windows (fase 8.5), Social (fase 9) e Campanhas (fase 10).
- **Fase 11 (refinamento):** pode mudar textos e posições em qualquer tela. Conferir os nomes dos botões no dia da gravação.

## Dados de exemplo

- `/teste` > "Criar dados de teste" cria Padaria Sol, Agência Exemplo (renomear para Aurora Studio), Barbearia do Dom, Contabilidade Prisma, Ótica Visão Clara, Academia Forma Livre, sprints, ciclo e finanças.
- O que falta preparar à mão está em "Preparar antes" de cada episódio (planilha CSV fictícia de leads, extrato OFX fictício, notas de exemplo).
