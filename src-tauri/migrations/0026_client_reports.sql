-- 0026: relatório para o cliente (fase 12: A "relatório na folha da marca" como tela,
-- "Salvar página (.html)" da B como segunda saída e o banco de horas da C para cliente com pacote mensal).
-- Cada relatório guarda uma foto (JSON) do que foi mostrado ao cliente. Enviado não muda mais: o próximo é outro.

CREATE TABLE client_reports (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,                                          -- personal | org:<id>
  kind        TEXT NOT NULL CHECK (kind IN ('projeto', 'extrato')),
  number      INTEGER NOT NULL,                                       -- Relatório nº 3, por escopo
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  period_from TEXT NOT NULL,                                          -- AAAA-MM-DD
  period_to   TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',                               -- recado para o cliente
  data        TEXT NOT NULL,                                          -- JSON com o que aparece no relatório
  sent_at     TEXT,                                                   -- AAAA-MM-DD; NULL = rascunho
  channel     TEXT NOT NULL DEFAULT '',                               -- WhatsApp, e-mail, em mãos
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX client_reports_number ON client_reports(scope, number);
CREATE INDEX client_reports_company ON client_reports(company_id);

-- Pacote mensal de horas do cliente (banco de horas): minutos por mês e a mensalidade, se houver.
CREATE TABLE company_packages (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  minutes    INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 744 * 60),
  fee        INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0)            -- centavos por mês
);
