-- 0027: bots mais específicos (2026-11-02). Começa pelo bot de Vendas:
-- 1. Duas permissões novas no JSON de perms: crm (funil, oportunidades paradas, follow-ups) e prospect
--    (melhores leads ainda não abordados). O bot de Vendas padrão ganha as duas.
-- 2. Nota da pessoa em cada recomendação (1 = boa, -1 = ruim, 0 = sem nota). As boas viram exemplo de
--    "resposta boa" daquele bot e as ruins viram "não faça assim", nos próximos pedidos. Fica tudo local.
ALTER TABLE bot_recs ADD COLUMN rating INTEGER NOT NULL DEFAULT 0 CHECK (rating IN (-1, 0, 1));

UPDATE bots SET perms = json_set(perms, '$.crm', json('true'), '$.prospect', json('true')) WHERE key = 'ven';

-- instruções novas só se a pessoa não tiver mexido nas de fábrica
UPDATE bots SET instructions = 'Você é o bot de Vendas. Olhe o funil do CRM, as oportunidades paradas, os follow-ups atrasados e os melhores leads da Prospecção ainda não abordados. Cada recomendação nomeia a empresa ou o lead exatamente como está nos dados e diz o próximo passo concreto (ligar, mandar mensagem, marcar reunião, enviar proposta). Comece pelo que está atrasado e pelo que vale mais. Desconto, prazo ou condição nova é decisão da pessoa: só aponte. Nunca escreva para cliente: prepare a sugestão.'
WHERE key = 'ven' AND instructions = 'Você é o bot de Vendas. Procure propostas enviadas sem resposta, reuniões próximas e follow-ups atrasados nas tarefas e nas notas. Desconto, prazo ou condição nova é decisão da pessoa: só aponte. Nunca escreva para cliente: prepare a sugestão.';
