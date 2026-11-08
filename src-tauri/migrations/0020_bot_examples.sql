-- 0020: modelos que a pessoa já usa, guardados no bot (ex.: mensagens de prospecção no bot de Vendas).
-- Não é treino: os exemplos vão junto em cada pedido para o modelo imitar o tom e a estrutura.
ALTER TABLE bots ADD COLUMN examples TEXT NOT NULL DEFAULT '[]';
