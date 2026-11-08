-- 0007: calendário (fase 4C). A tarefa pode ganhar um bloco de horário na agenda (time blocking)
-- e ser marcada como marco, que aparece em destaque na linha do tempo.

ALTER TABLE tasks ADD COLUMN sched_start TEXT;                      -- AAAA-MM-DDTHH:MM, hora local
ALTER TABLE tasks ADD COLUMN sched_min INTEGER;                     -- duração do bloco em minutos
ALTER TABLE tasks ADD COLUMN milestone INTEGER NOT NULL DEFAULT 0;  -- 1 = marco
CREATE INDEX tasks_sched ON tasks(sched_start) WHERE sched_start IS NOT NULL;
