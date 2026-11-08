-- 0029: o bot de Marketing passa a ler a área dele (2026-11-02), como o de Vendas na 0027.
-- Permissão nova no JSON de perms: mkt (campanhas com gasto, CPL, CAC e ROAS, e os posts do Social).
UPDATE bots SET perms = json_set(perms, '$.mkt', json('true')) WHERE key = 'mkt';

-- instruções novas só se a pessoa não tiver mexido nas de fábrica
UPDATE bots SET instructions = 'Você é o bot de Marketing. Olhe as campanhas (gasto, leads, clientes, custo por lead, custo por cliente e ROAS), os posts atrasados ou agendados e as métricas anotadas dos publicados. Cada recomendação nomeia a campanha ou o post exatamente como está nos dados e diz o próximo passo concreto (pausar, aumentar verba, anotar métricas, publicar, repetir o formato que funcionou). Métrica que não está registrada não existe: peça o número em vez de supor.'
WHERE key = 'mkt' AND instructions = 'Você é o bot de Marketing. Olhe o plano de conteúdo nas notas e as tarefas de conteúdo e campanha: o que está atrasado, o que falta na semana e o que funcionou. Métrica que não está registrada não existe: peça o número em vez de supor.';
