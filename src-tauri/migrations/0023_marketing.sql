-- 0023: Marketing Analytics (fase 10: painel de campanhas da A, com a jornada do
-- cliente da C e os links com rastreio da B). Valores em centavos.
-- O Tesseract não rastreia cliques nem instala nada no site da pessoa: a origem de um lead é um "toque"
-- registrado (à mão ou colando o link com UTM que ele usou). Sem toque nem origem no CRM, o lead fica
-- como "origem desconhecida", nunca é adivinhado. Receita e clientes vêm dos ganhos no CRM.

CREATE TABLE mkt_campaigns (
  id         INTEGER PRIMARY KEY,
  scope      TEXT NOT NULL,                             -- personal | org:<id>
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,                             -- utm_campaign; fixado na criação para não quebrar links
  channel    TEXT NOT NULL,                             -- Google Ads, Meta Ads, Instagram orgânico…
  paid       INTEGER NOT NULL DEFAULT 1 CHECK (paid IN (0, 1)),
  notes      TEXT NOT NULL DEFAULT '',
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX mkt_campaigns_slug ON mkt_campaigns(scope, slug);

CREATE TABLE mkt_spend (
  id          INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES mkt_campaigns(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,                            -- AAAA-MM-DD
  amount      INTEGER NOT NULL CHECK (amount > 0),      -- centavos
  note        TEXT NOT NULL DEFAULT '',
  finance_tx  INTEGER REFERENCES transactions(id) ON DELETE SET NULL, -- despesa lançada junto em Finanças
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX mkt_spend_campaign ON mkt_spend(campaign_id, day);

CREATE TABLE mkt_links (
  id          INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES mkt_campaigns(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,                            -- https://… (página de destino)
  placement   TEXT NOT NULL,                            -- onde o link aparece: instagram-bio, google-ads…
  content     TEXT NOT NULL DEFAULT '',                 -- utm_content (variação), já em slug
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX mkt_links_campaign ON mkt_links(campaign_id);

CREATE TABLE mkt_touches (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  campaign_id INTEGER REFERENCES mkt_campaigns(id) ON DELETE SET NULL,
  link_id     INTEGER REFERENCES mkt_links(id) ON DELETE SET NULL,
  at          TEXT NOT NULL,                            -- AAAA-MM-DD
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX mkt_touches_company ON mkt_touches(company_id, at);
