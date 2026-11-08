-- 0010: Scrum e OKR (fase 4B-2b). Sprints com meta, datas e retrospectiva; tarefas ganham pontos,
-- sprint (NULL = backlog) e o resultado-chave que movem. O gráfico de quanto falta sai de done_at das tarefas.

CREATE TABLE sprints (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  goal       TEXT NOT NULL DEFAULT '',
  start_day  TEXT NOT NULL,           -- AAAA-MM-DD
  end_day    TEXT NOT NULL,           -- AAAA-MM-DD
  closed_at  TEXT,                    -- AAAA-MM-DD; NULL = em andamento ou planejada
  retro      TEXT NOT NULL DEFAULT '' -- JSON {bom, melhorar, acao}
);
CREATE INDEX sprints_project ON sprints(project_id, start_day);

CREATE TABLE okr_objectives (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  ord        REAL NOT NULL
);

CREATE TABLE okr_krs (
  id           INTEGER PRIMARY KEY,
  objective_id INTEGER NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  start_value  REAL NOT NULL DEFAULT 0,
  target       REAL NOT NULL,
  current      REAL NOT NULL DEFAULT 0,
  unit         TEXT NOT NULL DEFAULT '',
  confidence   INTEGER NOT NULL DEFAULT 2 CHECK (confidence BETWEEN 1 AND 3), -- 1 baixa, 2 média, 3 alta
  ord          REAL NOT NULL
);

ALTER TABLE tasks ADD COLUMN points INTEGER;                                            -- estimativa em pontos
ALTER TABLE tasks ADD COLUMN sprint_id INTEGER REFERENCES sprints(id) ON DELETE SET NULL; -- NULL = backlog
ALTER TABLE tasks ADD COLUMN kr_id INTEGER REFERENCES okr_krs(id) ON DELETE SET NULL;     -- resultado-chave que a tarefa move
