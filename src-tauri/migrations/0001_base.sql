-- 0001: base da Fase 2. Configurações, organizações, projetos e registro de auditoria.
-- Todo registro operacional carrega scope: 'personal' ou 'org:<id>' (ARCHITECTURE.md, Modelo de dados).

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,              -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,          -- slug estável, usado em scope = 'org:<id>'
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);

CREATE TABLE projects (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'concluido', 'arquivado')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX projects_scope ON projects(scope);

CREATE TABLE audit_log (
  id     INTEGER PRIMARY KEY,
  at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  action TEXT NOT NULL,
  detail TEXT                            -- JSON
);
