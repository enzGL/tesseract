-- 0019: cronograma (fase 8.5: "tabela + barras").
-- Data de início da tarefa e dependências entre tarefas ("só começa depois que a outra terminar").
-- Fica em tabelas próprias para não mexer na estrutura das tarefas. O prazo continua sendo tasks.due.

CREATE TABLE task_plan (
  task_id    INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  start_day  TEXT                                        -- AAAA-MM-DD; NULL = sem início definido
);

CREATE TABLE task_deps (
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, -- a tarefa que espera
  depends_on INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, -- a que precisa terminar antes
  PRIMARY KEY (task_id, depends_on),
  CHECK (task_id <> depends_on)
);
CREATE INDEX task_deps_on ON task_deps(depends_on);
