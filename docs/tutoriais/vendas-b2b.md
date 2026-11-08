# Vendas para empresas (prospecção ativa)

## Para quem é

Para quem vende para outras empresas e precisa ir atrás do cliente: software por assinatura, serviços recorrentes, representantes comerciais. No fim, a pessoa tem um ICP com nota, campanhas por segmento e cidade, mensagens no estilo dela escritas pelo bot de Vendas, o funil com follow-ups e, quando a fase 10 sair, a origem de cada venda medida.

## A empresa fictícia do exemplo

- **Nome:** Norte Labs (empresa inventada).
- **Ramo:** software de agendamento online por assinatura.
- **Cidade:** Florianópolis (SC).
- **O que vende (valores de exemplo):** plano Básico (R$ 89 por mês) e plano Equipe (R$ 189 por mês), para barbearias, salões e estúdios.
- **Cliente ideal:** negócios com agenda cheia, boas avaliações no Google, site ou Instagram ativo, em Florianópolis e São José.
- **Empresas de exemplo:** Barbearia do Dom, Salão Bela Trama, Estúdio Tinta Viva (todas inventadas).

Todos os nomes, valores e notas são de exemplo. Na gravação, use só a planilha fictícia de leads.

## Recursos Pro usados

Prospecção, CRM, Bots, Documentos, organizações e Campanhas são **Pro**.

## Episódios

### Ep. 1: O ICP de quem vende para empresas

- **Objetivo:** montar o ICP com segmentos, cidades e sinais pensados para venda B2B.
- **Telas:** Prospecção > "Montar a prospecção" (5 passos); aba "Seu ICP".
- **Plano:** **Pro**.
- **Duração estimada:** 3 min.
- **Preparar antes:** organização "Norte Labs" criada e selecionada. Se já gravou o roteiro do negócio local, aponte para ele e grave só as diferenças. No começo, modelo "Vendas B2B" (Primeiros passos, Ep. 2).

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | "Montar a prospecção". Passo "O que você vende": `Agenda online por assinatura para barbearias e salões. O cliente marca pelo WhatsApp e pelo Instagram.` | O texto em "Seu ICP até aqui". | "Diga o que você vende e para quem. O bot vai usar isso nas mensagens." |
| 2 | Passo "Segmentos e cidades": `barbearia`, `salão de beleza`, `estúdio de tatuagem`; cidades `Florianópolis` e `São José`. | A grade de segmentos e cidades. | "Cada segmento com cada cidade vira uma campanha." |
| 3 | Passo "Sinais e pesos": "Mais avaliações que" 100 (peso alto), "Tem Instagram" (peso alto), "Avaliação mínima no Google" 4,5, "Tem site próprio" (peso baixo). | A prévia da nota. | "Muitas avaliações quer dizer agenda cheia. Esse é o sinal que mais pesa aqui." |
| 4 | Passo "Fontes": "Planilha (CSV)", "Cadastro manual", "Google Maps" e "Apify". Ler o aviso do Google Maps. | O aviso de termos de uso e ritmo. | "Leia o aviso antes de ligar o Google Maps." |
| 5 | Passo "Abordagem": WhatsApp, cadência de 3 dias. "Concluir". | O ICP salvo. | "Pronto. Agora a nota de cada empresa sai daqui." |

### Ep. 2: Campanhas por segmento e cidade

- **Objetivo:** buscar e acompanhar cada campanha (segmento × cidade) com o seu funil.
- **Telas:** Prospecção > Campanhas, Lista, Fontes (Apify).
- **Plano:** **Pro**.
- **Duração estimada:** 3 min.
- **Preparar antes:** planilha CSV **fictícia** com 30 empresas inventadas, divididas entre os segmentos; uma chave de teste do Apify (não mostrar na tela).
- **Privacidade:** mostrar que a chave do Apify fica no Cofre do Windows e que o Apify cobra por empresa coletada.
- **Revisar antes de gravar:** Apify e "Achar Instagram e e-mail" (7B) ainda falta validar clicando.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Importar a planilha fictícia na Lista. | Os leads com a nota ICP. | "Comece pela planilha que você já tem." |
| 2 | Abrir a aba Campanhas. | A grade segmento × cidade. O número grande é a nota ICP média. | "Cada quadrado é uma campanha. O número é a nota média." |
| 3 | Dar duplo clique numa campanha. | A lista filtrada daquela campanha. | "Duplo clique abre a lista da campanha." |
| 4 | Mostrar o funil da campanha: Encontrados, Novos, Enviados ao CRM, Avançaram no funil, Descartados. | Os números da campanha de exemplo. | "Veja qual segmento rende mais." |
| 5 | Em Fontes, guardar a chave do Apify. | "Chave do Apify guardada no Cofre do Windows." | "Usa o Apify? A chave fica no Cofre do Windows, nunca no app." |
| 6 | Mostrar o botão "Buscar no Apify" sem rodar. | O botão. | "O Apify cobra por empresa. Os extras pagos ficam desligados." |
| 7 | Filtrar por "Nota B ou A" e ordenar por "Maior nota primeiro". | Só os melhores leads. | "Comece pelos que mais combinam com você." |

### Ep. 3: O bot de Vendas escreve no seu estilo

- **Objetivo:** ensinar o bot de Vendas com os seus modelos e gerar mensagens personalizadas.
- **Telas:** Bots > Vendas (Ajustes: "Modelos de prospecção", permissões); Prospecção (Triagem, "Mensagem de abordagem").
- **Plano:** **Pro**.
- **Duração estimada:** 4 min.
- **Preparar antes:** IA local ligada; três mensagens de exemplo escritas para a Norte Labs; telefone de teste próprio.
- **Privacidade:** com provedor externo ligado no bot de Vendas, mostrar o aviso "Isto vai sair do seu computador" e o que sai.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Em Bots, abrir Vendas, aba Ajustes. | Instruções, permissões e "MODELOS DE PROSPECÇÃO". | "O bot de Vendas é quem escreve as mensagens." |
| 2 | Colar três modelos e "Salvar modelos". | Os modelos guardados (até 10). | "Cole as mensagens que já funcionaram para você." |
| 3 | Mostrar a permissão "Usar provedor externo" desligada. | A chave desligada. | "Desligado, tudo é escrito pela IA do seu computador." |
| 4 | Na Triagem, num lead A, clicar em "Personalizar com IA". | Uma mensagem no mesmo tom dos modelos, com dados públicos da empresa. | "A mensagem imita o seu jeito e cita a empresa." |
| 5 | Ligar o provedor externo no bot e gerar de novo. | O aviso "Isto vai sair do seu computador" com o modelo, o que você vende e os dados públicos. Clicar em "Enviar". | "Com IA da internet, você vê antes o que sai. E decide." |
| 6 | Revisar o texto e clicar em "Abrir no WhatsApp". | O WhatsApp abre com o texto. | "O app não envia sozinho. Você revisa e aperta enviar." |
| 7 | Apertar E para enviar o lead ao CRM. | "Está no CRM, em Identificado." | "Mandou a mensagem? Leve para o CRM." |

### Ep. 4: Do primeiro contato à demonstração

- **Objetivo:** levar a oportunidade pelos estágios do funil com follow-up em cada passo.
- **Telas:** CRM e Funil (Funil, painel da oportunidade, Follow-ups), captura rápida.
- **Plano:** **Pro**.
- **Duração estimada:** 3 min 30 s.
- **Preparar antes:** 8 a 10 oportunidades em estágios diferentes; uma sem contato há mais de 14 dias.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Mostrar os 8 estágios abertos e as áreas Ganho e Perdido. | O funil com valor por estágio. | "Dez estágios, do Identificado ao Ganho ou Perdido." |
| 2 | Mover a Barbearia do Dom para "Reunião marcada". No painel, pôr valor por mês `189` e chance `40`. | A "Previsão ponderada" muda no topo. | "Valor vezes chance: a previsão mostra o que deve entrar de verdade." |
| 3 | Marcar o follow-up para o dia da demonstração, com o que fazer: `demonstrar agenda`. | O follow-up no cartão. | "Cada oportunidade tem sempre um próximo passo." |
| 4 | Com o app minimizado, apertar Ctrl+Shift+Espaço e digitar `ligar pro Salão Bela Trama sexta 15h`. | Em "Para onde vai": follow-up do cliente, sexta, 15h. Enter guarda. | "Lembrou no meio de outra coisa? Anote. O app acha o cliente e a data." |
| 5 | Aba Follow-ups, grupo Esfriando. | A oportunidade parada, com a cadência sugerida. | "Sem contato há duas semanas? Volte a falar antes que esfrie." |
| 6 | Na ficha da empresa, abrir "Personalizar com IA" pelo CRM e "Abrir no WhatsApp". | O registro no histórico da empresa. | "Pelo CRM também. Fica registrado no histórico." |

### Ep. 5: Proposta, assinatura e receita recorrente

- **Objetivo:** fechar com proposta, transformar em contrato mensal e prever a receita.
- **Telas:** Contratos (Mesa, editor), CRM, Finanças.
- **Plano:** **Pro**.
- **Duração estimada:** 3 min.
- **Preparar antes:** oportunidade em "Negociação"; "Sua marca" da Norte Labs com dados de exemplo.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | "Nova proposta" com cliente do CRM. Item `Plano Equipe`, 12 meses de R$ 189. | A folha A4 ao vivo. | "A proposta puxa o cliente e o valor do CRM." |
| 2 | "Marcar como enviada". | No CRM, "Proposta enviada". | "Enviou? O funil anda sozinho." |
| 3 | "Aceita" e confirmar. | 12 parcelas a receber em Finanças. Oportunidade ganha. | "Aceitou? O ano de receita já está previsto." |
| 4 | Em CRM > Relatórios, 90 dias. | Taxa de fechamento, ciclo médio, motivos de perda e origem dos ganhos. | "O relatório mostra quanto tempo leva para fechar e por quê se perde." |

### Ep. 6: De onde vem cada venda (UTM e atribuição)

- **Objetivo:** medir quais campanhas trazem clientes, com UTM, custo por lead e retorno.
- **Telas:** Marketing > Campanhas (abas Painel, Links, Jornada), CRM, Finanças.
- **Plano:** **Pro**.
- **Duração estimada:** 4 min.
- **Preparar antes:** escopo "Norte Labs"; empresas de exemplo no CRM, duas delas ganhas no período; valores de gasto de exemplo.
- **Revisar antes de gravar:** a fase 10 ainda falta validar clicando no app. O QR code do link ainda não existe.
- **Regra:** o traço no lugar do número quer dizer sem dado, nunca zero. Origem desconhecida fica à vista. Nunca inventar números no vídeo: só os de exemplo, marcados como exemplo.
- **Privacidade:** nada é rastreado no site da pessoa. A origem vem do link com UTM que o lead usou ou do que a pessoa registra.

| # | O que fazer | O que deve aparecer | Legenda |
|---|---|---|---|
| 1 | Abrir Campanhas. Clicar em "Nova campanha": `Instagram barbearias`, marcar "Tem gasto (anúncio, impulsionamento, patrocínio)". | A campanha no Painel, com um traço onde ainda não há dado. | "Cada campanha é um jeito de trazer clientes. Sem dado, o app mostra um traço, não zero." |
| 2 | "Lançar gasto" de R$ 300 (exemplo), com "Lançar também em Finanças (despesa paga, categoria Marketing)". | O gasto em "Gastos lançados" e a despesa em Finanças. | "Lance o gasto uma vez. Se quiser, ele já vai para Finanças." |
| 3 | Aba Links: "Página de destino", campanha, "Onde o link vai aparecer" e "Variação (opcional)". "Salvar e copiar". | "Salvo e copiado" e o link com UTM. | "Monte o link uma vez e use na bio, no anúncio ou no e-mail." |
| 4 | Aba Jornada, "De onde vieram": num lead sem origem, "Colar o link que ele usou (opcional)" e "Registrar origem". | "Campanha e link encontrados." | "O lead chegou? Cole o link que ele usou. O app acha a campanha." |
| 5 | Em outro lead, escolher só o canal `Instagram orgânico`. | O lead com origem. | "Não tem link? Escolha o canal." |
| 6 | Mostrar "Leads por origem" no Painel. | A origem desconhecida à vista. | "Quem ficou sem origem aparece aqui. O app não chuta." |
| 7 | Mostrar Investido, Leads, Custo por lead, Clientes, Custo por cliente e Retorno (ROAS). | Os números calculados dos dados de exemplo. | "Clientes e receita vêm dos ganhos no CRM. O painel faz a conta." |
| 8 | Em "Cliente conta pelo", trocar "Primeiro contato" por "Último antes de fechar". | Os clientes mudam de campanha conforme a regra. | "Primeiro contato: quem trouxe. Último antes de fechar: quem convenceu." |
| 9 | Na Jornada, abrir um cliente ganho. | A linha do tempo com os toques e as conversas do CRM. | "Veja o caminho inteiro até fechar." |

## Configuração recomendada

- **Modelo do começo:** "Vendas B2B" em "O que você faz?" (Prospecção ligada, bot de Vendas em Assistentes; widgets de follow-ups, funil, leads e receita). Todos os módulos dos episódios já ficam no menu.
- **Escopo:** a empresa como organização.
- **ICP:** "Mais avaliações que" 100 (30), "Tem Instagram" (25), "Avaliação mínima no Google" 4,5 (20), "Tem site próprio" (10), "Tem e-mail" (15) depois de "Achar Instagram e e-mail no site".
- **Campanhas:** um segmento por vez em cada cidade. Compare as notas médias antes de buscar mais.
- **Fontes:** planilha primeiro; Google Maps com moderação; Apify só com orçamento definido.
- **Bot de Vendas:** 3 a 10 modelos seus; "Usar provedor externo" desligado por padrão; "Entrar na rotina do dia" ligado para revisar o funil.
- **Abordagem:** WhatsApp, 3 tentativas a cada 3 dias; depois, Perdido com motivo "sem resposta".
- **CRM:** valor por mês e chance em toda oportunidade a partir de "Qualificado"; follow-up sempre marcado.
- **Documentos:** contrato de 12 parcelas mensais.
- **IA externa:** limite de chamadas por mês em Configurações > IA externa, se ligar o provedor externo.

## Erros comuns

- **Mensagem genérica para todo mundo.** Dê modelos ao bot de Vendas e revise cada texto.
- **Mensagem que soa como se você fosse o cliente.** Preencha "O que você vende" com quem vende e o que vende.
- **Mandar para leads nota C.** Comece pelos A e B.
- **Esquecer o pedido de exclusão.** Se a empresa pedir, use "Apagar (pedido de exclusão)" no lead ou "Anonimizar" na ficha do CRM.
- **Rodar o Apify sem olhar o custo.** O Apify cobra por empresa coletada.
- **Oportunidade sem valor e sem chance.** A previsão ponderada fica errada.
- **Mostrar telefones ou nomes reais no vídeo.** Só a planilha fictícia.
