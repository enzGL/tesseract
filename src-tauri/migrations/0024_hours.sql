-- 0024: horas e faturamento (fase 12: A "cronômetro e o dia" como tela principal,
-- B "folha da semana" como aba e o painel de faturar da C).
-- Cada registro é um bloco de tempo de um cliente (empresa do CRM) e, se houver, de um projeto e de uma tarefa.
-- Um cronômetro por vez: o registro rodando tem running_since preenchido e minutes = 0 até parar.
-- Valor/hora em centavos: o do projeto vale sobre o do cliente; o registro guarda o valor usado.
-- Faturar liga o registro ao documento (recibo ou proposta). Se o documento for apagado, a hora volta a "a faturar".

CREATE TABLE time_entries (
  id            INTEGER PRIMARY KEY,
  scope         TEXT NOT NULL,                                          -- personal | org:<id>
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,    -- cliente
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id       INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,                                          -- o que foi feito
  day           TEXT NOT NULL,                                          -- AAAA-MM-DD
  start         TEXT,                                                   -- HH:MM; NULL = lançado só com a duração
  minutes       INTEGER NOT NULL DEFAULT 0 CHECK (minutes >= 0 AND minutes <= 1440),
  running_since TEXT,                                                   -- AAAA-MM-DDTHH:MM:SS (hora local) enquanto roda
  billable      INTEGER NOT NULL DEFAULT 1 CHECK (billable IN (0, 1)),
  rate          INTEGER NOT NULL DEFAULT 0 CHECK (rate >= 0),           -- centavos por hora
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('timer', 'manual')),
  document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,    -- faturada neste documento
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX time_entries_day ON time_entries(scope, day);
CREATE INDEX time_entries_doc ON time_entries(document_id);
-- um cronômetro rodando no app inteiro
CREATE UNIQUE INDEX time_entries_one_running ON time_entries((1)) WHERE running_since IS NOT NULL;

CREATE TABLE company_rates (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  rate       INTEGER NOT NULL CHECK (rate >= 0)
);
CREATE TABLE project_rates (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  rate       INTEGER NOT NULL CHECK (rate >= 0)
);
