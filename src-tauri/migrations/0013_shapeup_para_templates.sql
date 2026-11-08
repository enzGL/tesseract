-- 0013: fase 4B-2c. Shape Up (ciclos com uma aposta e frentes no morro), priorização (RICE, ICE, MoSCoW
-- guardados na tarefa), PARA (gaveta de cada projeto e a pasta dele no segundo cérebro) e modelos da pessoa.

CREATE TABLE cycles (
  id             INTEGER PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  bet            TEXT NOT NULL DEFAULT '',   -- a aposta (o que o ciclo vai entregar)
  appetite_weeks INTEGER NOT NULL DEFAULT 6, -- quanto tempo vale gastar
  start_day      TEXT NOT NULL,              -- AAAA-MM-DD
  closed_at      TEXT                        -- AAAA-MM-DD; NULL = em andamento
);
CREATE INDEX cycles_project ON cycles(project_id, start_day);

CREATE TABLE scopes (
  id         INTEGER PRIMARY KEY,
  cycle_id   INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  hill       INTEGER NOT NULL DEFAULT 0 CHECK (hill BETWEEN 0 AND 100), -- 0 a 50 subindo, 50 a 100 descendo
  hill_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),       -- última vez que o ponto andou
  ord        REAL NOT NULL
);

ALTER TABLE tasks ADD COLUMN scope_id INTEGER REFERENCES scopes(id) ON DELETE SET NULL; -- frente do Shape Up
ALTER TABLE tasks ADD COLUMN prio TEXT;  -- JSON {rice:{r,i,c,e}, ice:{i,c,e}, moscow:"must|should|could|wont"}

ALTER TABLE projects ADD COLUMN para_kind TEXT NOT NULL DEFAULT 'project' CHECK (para_kind IN ('project', 'area', 'resource'));
ALTER TABLE projects ADD COLUMN brain_path TEXT;  -- pasta ligada no segundo cérebro (relativa ao vault)

CREATE TABLE user_templates (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  about      TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL,  -- JSON {columns, methods, focusRule, reviewDay, tasks}
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
