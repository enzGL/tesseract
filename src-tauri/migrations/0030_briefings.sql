-- 0030: briefing antes da reunião (fase 12: a sugestão, folha da A + reuniões da semana
-- e "depois da reunião" da B + linha do tempo da C como aba). Os fatos vêm do CRM, Contratos, Finanças,
-- Cobrança, Horas, Projetos e do cérebro; aqui fica só a foto de cada briefing montado (com as fontes).

CREATE TABLE briefings (
  id            INTEGER PRIMARY KEY,
  scope         TEXT NOT NULL,                                          -- personal | org:<id>
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  meeting_at    TEXT,                                                   -- AAAA-MM-DD ou AAAA-MM-DDTHH:MM
  meeting_title TEXT NOT NULL DEFAULT '',
  data          TEXT NOT NULL,                                          -- JSON: fatos numerados, resumo, pontos para levar
  provider      TEXT NOT NULL DEFAULT '',                               -- quem escreveu o resumo ('' = regras, sem IA)
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX briefings_company ON briefings(company_id, id);
