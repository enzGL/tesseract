-- 0006: métodos de organização (fase 4B). Um método é um preset de visões sobre as mesmas tarefas.
-- O projeto guarda os métodos ligados, o modelo de origem, a regra do Foco do dia e o ritual semanal.
-- A tarefa ganha o quadrante de Eisenhower, o lugar no Foco do dia e o tempo de foco registrado.

ALTER TABLE projects ADD COLUMN methods TEXT NOT NULL DEFAULT '["kanban","lista"]'; -- JSON, ids conhecidos
ALTER TABLE projects ADD COLUMN preset TEXT;                                       -- modelo da galeria
ALTER TABLE projects ADD COLUMN focus_rule TEXT NOT NULL DEFAULT 'mit3';           -- mit3 | 135 | ivy
ALTER TABLE projects ADD COLUMN review_day INTEGER;                                -- 0 domingo .. 6 sábado; NULL = sem ritual
ALTER TABLE projects ADD COLUMN review_at TEXT;                                    -- última revisão (AAAA-MM-DD)

ALTER TABLE tasks ADD COLUMN quadrant INTEGER CHECK (quadrant BETWEEN 1 AND 4);    -- 1 fazer, 2 agendar, 3 delegar, 4 eliminar
ALTER TABLE tasks ADD COLUMN focus_day TEXT;                                       -- AAAA-MM-DD em que está no foco
ALTER TABLE tasks ADD COLUMN focus_slot INTEGER;                                   -- posição no foco daquele dia
ALTER TABLE tasks ADD COLUMN spent_min INTEGER NOT NULL DEFAULT 0;                 -- minutos de foco registrados
CREATE INDEX tasks_focus ON tasks(project_id, focus_day) WHERE focus_day IS NOT NULL;
