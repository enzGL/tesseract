-- 0009: GTD (fase 4B-2a). A tarefa ganha a lista do GTD, o contexto (onde dá para fazer),
-- a energia que exige e, quando depende de outra pessoa, de quem e desde quando.

ALTER TABLE tasks ADD COLUMN gtd_list TEXT CHECK (gtd_list IN ('inbox', 'next', 'waiting', 'someday')); -- NULL = fora do GTD (conta como próxima ação)
ALTER TABLE tasks ADD COLUMN context TEXT;        -- computador, telefone, rua, casa ou outro
ALTER TABLE tasks ADD COLUMN energy INTEGER CHECK (energy BETWEEN 1 AND 3); -- 1 baixa, 2 média, 3 alta
ALTER TABLE tasks ADD COLUMN waiting_for TEXT;    -- de quem você espera
ALTER TABLE tasks ADD COLUMN waiting_since TEXT;  -- AAAA-MM-DD
CREATE INDEX tasks_gtd ON tasks(project_id, gtd_list) WHERE gtd_list IS NOT NULL;
