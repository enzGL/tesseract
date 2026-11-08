-- 0004: tarefas e quadro Kanban personalizável (fase 4A).
-- Colunas são do projeto (criar, renomear, reordenar, cor, limite WIP). "Concluída" é uma propriedade da
-- coluna: mover para uma coluna done marca done_at. Ordem por número real (insere no meio sem renumerar).

ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN archived_at TEXT;

CREATE TABLE board_columns (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT,
  ord        REAL NOT NULL,
  wip        INTEGER,                     -- limite de tarefas em andamento; NULL = sem limite
  done       INTEGER NOT NULL DEFAULT 0   -- 1 = tarefas aqui contam como concluídas
);
CREATE INDEX board_columns_project ON board_columns(project_id, ord);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_id    INTEGER REFERENCES board_columns(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',  -- Markdown
  priority     INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4), -- 0 sem, 1 baixa, 2 média, 3 alta, 4 urgente
  due          TEXT,                       -- AAAA-MM-DD
  estimate_min INTEGER,
  labels       TEXT NOT NULL DEFAULT '[]', -- JSON ["cliente","design"]
  checklist    TEXT NOT NULL DEFAULT '[]', -- JSON [{"text":"...","done":false}]
  note_path    TEXT,                       -- nota do segundo cérebro ligada
  ord          REAL NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  done_at      TEXT
);
CREATE INDEX tasks_project ON tasks(project_id, column_id, ord);
CREATE INDEX tasks_due ON tasks(due) WHERE due IS NOT NULL;

-- Projetos que já existem (do seed) ganham o quadro padrão.
INSERT INTO board_columns (project_id, name, ord, wip, done)
  SELECT id, 'A fazer', 1, NULL, 0 FROM projects;
INSERT INTO board_columns (project_id, name, ord, wip, done)
  SELECT id, 'Fazendo', 2, 3, 0 FROM projects;
INSERT INTO board_columns (project_id, name, ord, wip, done)
  SELECT id, 'Feito', 3, NULL, 1 FROM projects;
