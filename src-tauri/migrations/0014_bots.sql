-- 0014: fase 5, bots. Cada bot é um conjunto de instruções e permissões sobre o mesmo modelo do chat.
-- Toda rodada fica guardada (o que leu, quem respondeu) e cada recomendação espera o "sim" da pessoa
-- para virar tarefa. Os 6 bots padrão são criados pelo app (bots.rs) na primeira abertura da tela.

CREATE TABLE bots (
  id           INTEGER PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,      -- seg, jur, mkt, ven, fin, tec, ou custom-N
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',  -- uma linha: do que ele cuida
  instructions TEXT NOT NULL,
  perms        TEXT NOT NULL,             -- JSON {finance, tasks, brain, app, suggest, external, routine}
  builtin      INTEGER NOT NULL DEFAULT 0,
  ord          REAL NOT NULL DEFAULT 0,
  archived_at  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE bot_runs (
  id         INTEGER PRIMARY KEY,
  bot_id     INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('routine', 'question')),
  question   TEXT NOT NULL DEFAULT '',
  answer     TEXT NOT NULL DEFAULT '',
  provider   TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL DEFAULT '',
  reads      TEXT NOT NULL DEFAULT '[]',  -- JSON: o que o bot leu (rótulos, sem o conteúdo)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX bot_runs_bot ON bot_runs(bot_id, created_at);

CREATE TABLE bot_recs (
  id         INTEGER PRIMARY KEY,
  bot_id     INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  run_id     INTEGER NOT NULL REFERENCES bot_runs(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  why        TEXT NOT NULL DEFAULT '',
  fact       TEXT NOT NULL DEFAULT '',   -- o que está registrado, com a fonte
  inference  TEXT NOT NULL DEFAULT '',   -- dedução do bot, mostrada separada do fato
  priority   INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, -- projeto sugerido
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'later', 'task', 'dismissed')),
  task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT
);
CREATE INDEX bot_recs_status ON bot_recs(status, bot_id);
