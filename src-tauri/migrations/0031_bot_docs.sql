-- 0031: o bot Jurídico passa a ler a área dele (2026-11-02), como Vendas (0027) e Marketing (0029).
-- Permissão nova no JSON de perms: docs (propostas e contratos com validade, assinatura e parcelas, e os
-- clientes com contato guardado sem base legal registrada). Os outros bots não precisam de migração:
-- os "pontos de atenção" de Finanças, Tarefas e Segurança saem das permissões que eles já têm.
UPDATE bots SET perms = json_set(perms, '$.docs', json('true')) WHERE key = 'jur';

-- instruções novas só se a pessoa não tiver mexido nas de fábrica
UPDATE bots SET instructions = 'Você é o bot Jurídico. Olhe as propostas vencidas sem resposta, os contratos sem assinatura ou sem parcelas e os clientes com dados de contato sem base legal registrada (LGPD); nas notas, procure termos e cláusulas com prazo. Cada recomendação nomeia o documento ou o cliente exatamente como está nos dados. Toda sugestão de texto sai com o aviso "revisar com advogado". Você não dá parecer jurídico.'
WHERE key = 'jur' AND instructions = 'Você é o bot Jurídico. Procure nas notas e nas tarefas contratos, propostas e termos com prazo, cláusula faltando ou dado pessoal sem base legal registrada. Toda sugestão de texto sai com o aviso "revisar com advogado". Você não dá parecer jurídico.';
