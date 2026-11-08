-- 0017: prospecção (fase 7A: lista com nota ICP como tela principal, triagem um por um
-- como modo, campanhas em grade segmento × cidade como aba, assistente de contexto).
-- Fluxo: segmento + cidade → lista → nota ICP → (enriquecimento) → CRM. A nota é sempre a soma dos sinais
-- ligados, e os critérios ficam guardados no lead para a tela mostrar o porquê.
-- Dados de contato de empresa são dados pessoais: cada lead guarda a base legal e pode ser apagado.

CREATE TABLE prospect_profiles (
  scope      TEXT PRIMARY KEY,               -- personal | org:<id>
  offer      TEXT NOT NULL DEFAULT '',       -- o que vende e para quem (o ICP em texto)
  segments   TEXT NOT NULL DEFAULT '[]',     -- JSON: ["academias", ...]
  cities     TEXT NOT NULL DEFAULT '[]',     -- JSON: ["Americana, SP", ...]
  signals    TEXT NOT NULL DEFAULT '[]',     -- JSON: [{id, on, weight, value}] (catálogo em prospect.rs)
  sources    TEXT NOT NULL DEFAULT '[]',     -- JSON: ["csv", "manual", "gmaps"]
  approach   TEXT NOT NULL DEFAULT '{}',     -- JSON: {channel, message, cadenceDays}
  step       INTEGER NOT NULL DEFAULT 1,     -- passo do assistente em que a pessoa parou (6 = concluído)
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE prospect_campaigns (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,
  segment     TEXT NOT NULL,
  city        TEXT NOT NULL,
  searched_at TEXT,                          -- última busca no Google Maps (para o ritmo)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (scope, segment, city)
);

CREATE TABLE leads (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,
  campaign_id INTEGER REFERENCES prospect_campaigns(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  district    TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  site        TEXT NOT NULL DEFAULT '',
  instagram   TEXT NOT NULL DEFAULT '',
  rating      REAL,                          -- nota no Google Maps; NULL = sem dado
  reviews     INTEGER,
  employees   INTEGER,
  source      TEXT NOT NULL CHECK (source IN ('csv', 'manual', 'gmaps', 'apify')),
  source_ref  TEXT NOT NULL DEFAULT '',      -- link ou id na fonte
  match_key   TEXT NOT NULL,                 -- telefone só com dígitos, senão nome+cidade normalizados
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  criteria    TEXT NOT NULL DEFAULT '[]',    -- JSON: [{id, label, points, max, state: yes|no|unknown}]
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'skipped', 'dropped', 'crm')),
  dup_of      INTEGER REFERENCES leads(id) ON DELETE SET NULL, -- parecido com outro lead do escopo
  company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  legal_basis TEXT NOT NULL DEFAULT 'legítimo interesse (dado público de empresa, para oferta B2B)',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at  TEXT
);
CREATE INDEX leads_scope ON leads(scope, status, score DESC);
CREATE INDEX leads_match ON leads(scope, match_key);
CREATE INDEX leads_campaign ON leads(campaign_id);
