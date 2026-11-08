-- 0011: relatório da sprint (aba Resumo, direção A). Ao encerrar, guarda uma foto do que aconteceu
-- (pontos planejados e feitos, entregas, o que voltou ao backlog, resultados-chave movidos) e se a meta foi atingida.

ALTER TABLE sprints ADD COLUMN report TEXT NOT NULL DEFAULT '';  -- JSON gerado no encerramento
ALTER TABLE sprints ADD COLUMN outcome TEXT CHECK (outcome IN ('hit', 'partial', 'miss')); -- meta atingida, parcial, não atingida
