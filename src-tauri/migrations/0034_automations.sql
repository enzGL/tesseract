-- Automações QUANDO / SE / ENTÃO (fase 12).
-- trigger, conditions e actions são JSON (ver src-tauri/src/automations.rs). Cada vez que uma automação roda
-- fica em automation_runs, com o que ela criou (para Desfazer) e, quando a ação fala com alguém de fora,
-- a mensagem esperando a pessoa confirmar.
CREATE TABLE automations (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  trigger     TEXT NOT NULL,                  -- JSON {kind, ...}
  conditions  TEXT NOT NULL DEFAULT '[]',     -- JSON [{field, op, value}]
  actions     TEXT NOT NULL DEFAULT '[]',     -- JSON [{kind, ...}]
  recipe      TEXT NOT NULL DEFAULT '',       -- id da receita de origem, se veio de uma
  enabled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- vale daqui para frente
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE automation_runs (
  id            INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  event_key     TEXT NOT NULL,                -- o que disparou (ex.: doc:12); a mesma coisa não roda duas vezes
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  subject       TEXT NOT NULL DEFAULT '',     -- cliente ou item, para a lista
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error', 'waiting', 'skipped', 'undone', 'dismissed', 'sent')),
  summary       TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT '{}',   -- JSON {done: [...], pending: {...}, error}
  UNIQUE (automation_id, event_key)
);
CREATE INDEX automation_runs_at ON automation_runs (at);
