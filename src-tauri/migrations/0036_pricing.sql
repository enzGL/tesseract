-- Precificação (Pro): a tabela de preços de cada escopo e o orçamento de cada oportunidade ou lead.
-- O conteúdo é JSON (ver pro/ui/data/pricing.ts): a conta (hora, custo fixo, margens) e os serviços com
-- entregas em horas; o orçamento guarda uma cópia das linhas, para a tabela mudar sem mexer no que já foi orçado.
CREATE TABLE pricing_tables (
  scope       TEXT PRIMARY KEY,
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE pricing_quotes (
  key         TEXT PRIMARY KEY,                -- 'opp:<id>' ou 'lead:<id>'
  scope       TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX pricing_quotes_scope ON pricing_quotes (scope);
