-- 0016: CRM e funil (fase 6, "funil em quadro").
-- Empresas e contatos por escopo; oportunidades com os 10 estágios do funil, valor, chance e próximo follow-up;
-- interações (ligação, mensagem, reunião, mudança de estágio) formam o histórico. Valores em centavos.
-- Dados de contato são dados pessoais: a empresa guarda a base legal e pode ser apagada por inteiro.

CREATE TABLE companies (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,                              -- personal | org:<id>
  name        TEXT NOT NULL,
  segment     TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  site        TEXT NOT NULL DEFAULT '',
  instagram   TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',                   -- de onde veio: indicação, prospecção, Instagram…
  icp_score   INTEGER CHECK (icp_score BETWEEN 0 AND 100),-- nota ICP da prospecção (fase 7); NULL = sem nota
  legal_basis TEXT NOT NULL DEFAULT '',                   -- base legal dos dados (ex.: legítimo interesse)
  note_path   TEXT,                                       -- nota ligada no segundo cérebro
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX companies_scope ON companies(scope, name);

CREATE TABLE contacts (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  decides     INTEGER NOT NULL DEFAULT 0 CHECK (decides IN (0, 1)),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX contacts_company ON contacts(company_id);

CREATE TABLE opportunities (
  id           INTEGER PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id   INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  value        INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),  -- centavos
  monthly      INTEGER NOT NULL DEFAULT 0 CHECK (monthly IN (0, 1)), -- valor por mês (contrato recorrente)
  stage        TEXT NOT NULL DEFAULT 'identificado' CHECK (stage IN
                 ('identificado', 'qualificado', 'contato', 'conversa', 'reuniao', 'diagnostico', 'proposta', 'negociacao', 'ganho', 'perdido')),
  chance       INTEGER NOT NULL DEFAULT 10 CHECK (chance BETWEEN 0 AND 100),
  stage_at     TEXT NOT NULL,                             -- AAAA-MM-DD: quando entrou no estágio atual
  follow_up_at TEXT,                                      -- AAAA-MM-DDTHH:MM do próximo contato; NULL = nenhum
  follow_up    TEXT NOT NULL DEFAULT '',                  -- o que fazer no próximo contato
  lost_reason  TEXT NOT NULL DEFAULT '',
  closed_at    TEXT,                                      -- AAAA-MM-DD: ganho ou perdido
  finance_tx   INTEGER REFERENCES transactions(id) ON DELETE SET NULL, -- receita prevista criada ao ganhar
  note_path    TEXT,
  ord          INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX opportunities_company ON opportunities(company_id);
CREATE INDEX opportunities_follow ON opportunities(follow_up_at) WHERE follow_up_at IS NOT NULL;

CREATE TABLE interactions (
  id             INTEGER PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota', 'estagio')),
  text           TEXT NOT NULL DEFAULT '',
  at             TEXT NOT NULL,                           -- AAAA-MM-DD ou AAAA-MM-DDTHH:MM
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX interactions_company ON interactions(company_id, at);
CREATE INDEX interactions_opportunity ON interactions(opportunity_id, at);
