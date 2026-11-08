-- 0015: escopo da recomendação (personal ou org:<id>), lido do que a recomendação cita. A tela usa para
-- sugerir um projeto do mesmo escopo (um gasto pessoal cai num projeto pessoal).
ALTER TABLE bot_recs ADD COLUMN scope TEXT;
