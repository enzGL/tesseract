-- 0018: documentos (fase 8, "editor com prévia da folha").
-- Propostas, contratos e recibos por escopo, com itens, texto com campos que se preenchem sozinhos,
-- parcelas que viram "a receber" em Finanças no aceite, versões guardadas e a marca de cada escopo.
-- Recibo comprova pagamento entre as partes; não é nota fiscal. Valores em centavos.

CREATE TABLE documents (
  id             INTEGER PRIMARY KEY,
  scope          TEXT NOT NULL,                             -- personal | org:<id>
  kind           TEXT NOT NULL CHECK (kind IN ('proposta', 'contrato', 'recibo')),
  number         INTEGER NOT NULL,                          -- sequência por escopo e tipo (Proposta nº 0012)
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada', 'assinado', 'emitido', 'cancelado')),
  company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL, -- cliente do CRM, quando houver
  contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  client_name    TEXT NOT NULL DEFAULT '',                  -- nome do cliente na folha (fica mesmo se o CRM apagar)
  client_doc     TEXT NOT NULL DEFAULT '',                  -- CPF/CNPJ do cliente, se a pessoa quiser na folha
  items          TEXT NOT NULL DEFAULT '[]',                -- JSON [{name, qty, value}] (value = centavos por unidade)
  body           TEXT NOT NULL DEFAULT '',                  -- texto com campos {{cliente.nome}}
  valid_days     INTEGER NOT NULL DEFAULT 15 CHECK (valid_days BETWEEN 0 AND 365),
  payment        TEXT NOT NULL DEFAULT '',                  -- forma de pagamento (Pix, boleto…)
  account        TEXT NOT NULL DEFAULT '',                  -- conta que recebe, usada nas parcelas em Finanças
  version        INTEGER NOT NULL DEFAULT 1,
  issued_at      TEXT NOT NULL,                             -- AAAA-MM-DD da folha
  sent_at        TEXT,
  closed_at      TEXT,                                      -- aceite, recusa ou assinatura
  receipt_of     INTEGER REFERENCES installments(id) ON DELETE SET NULL, -- recibo de qual parcela
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX documents_scope ON documents(scope, kind, number);
CREATE UNIQUE INDEX documents_number ON documents(scope, kind, number);

CREATE TABLE installments (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  n           INTEGER NOT NULL,                             -- 1, 2, 3…
  description TEXT NOT NULL DEFAULT '',
  due         TEXT NOT NULL,                                -- AAAA-MM-DD
  amount      INTEGER NOT NULL CHECK (amount > 0),          -- centavos
  finance_tx  INTEGER REFERENCES transactions(id) ON DELETE SET NULL -- criada no aceite ou na assinatura
);
CREATE INDEX installments_document ON installments(document_id, n);

CREATE TABLE document_versions (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',                     -- o que mudou
  snapshot    TEXT NOT NULL,                                -- JSON com título, itens, texto, parcelas e total
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX document_versions_doc ON document_versions(document_id, version);

-- Marca de cada escopo para a folha (nome, CNPJ/CPF, contato, cor, rodapé).
CREATE TABLE doc_brands (
  scope TEXT PRIMARY KEY,
  data  TEXT NOT NULL                                       -- JSON
);
