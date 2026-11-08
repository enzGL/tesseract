-- 0032: modelos de negócio prontos (fase 12). Desenho: a sugestão,
-- com a galeria de pacotes por área (A), o painel "o que vai ser criado" (B) e "Meus modelos" (C).
-- Os pacotes que vêm com o app ficam no código (src/data/models.ts); aqui ficam os da pessoa e
-- cada uso de um pacote, para comparar as horas previstas com as que de fato foram gastas.

CREATE TABLE biz_models (
  id         INTEGER PRIMARY KEY,
  scope      TEXT NOT NULL,                                             -- personal | org:<id>
  area       TEXT NOT NULL,                                             -- design | consultoria | dev | social | outro
  name       TEXT NOT NULL,
  origin     TEXT NOT NULL DEFAULT 'zero' CHECK (origin IN ('copia', 'projeto', 'zero', 'arquivo')),
  data       TEXT NOT NULL,                                             -- JSON do pacote: etapas, extras, textos, parcelas
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX biz_models_scope ON biz_models(scope, name);

-- Um uso = um "Criar tudo". model_key: 'p:<chave do pacote pronto>' ou 'u:<id em biz_models>'.
CREATE TABLE biz_model_uses (
  id           INTEGER PRIMARY KEY,
  scope        TEXT NOT NULL,
  model_key    TEXT NOT NULL,
  model_name   TEXT NOT NULL,
  data         TEXT NOT NULL,                                           -- foto do pacote usado (para "salvar como modelo")
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  proposal_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  contract_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  planned_min  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX biz_model_uses_key ON biz_model_uses(scope, model_key);
CREATE INDEX biz_model_uses_project ON biz_model_uses(project_id);
