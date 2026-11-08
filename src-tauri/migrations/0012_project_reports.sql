-- 0012: resumos da operação (aba Resumo). A pessoa gera quando quiser, para um período;
-- o app guarda uma foto (JSON) do que aconteceu, para reler depois ou copiar e mandar a alguém.

CREATE TABLE project_reports (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  period_from TEXT NOT NULL,             -- AAAA-MM-DD
  period_to   TEXT NOT NULL,             -- AAAA-MM-DD
  title       TEXT NOT NULL,
  data        TEXT NOT NULL,             -- JSON com os números e as listas do período
  note        TEXT NOT NULL DEFAULT ''   -- comentário da pessoa
);
CREATE INDEX project_reports_project ON project_reports(project_id, created_at);
