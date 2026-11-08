-- 0033: importadores (fase 12, item 19). Cada importação é um lote; cada linha que ela criou
-- ou completou fica registrada para o "Desfazer". prev = valores antigos de uma empresa que já existia e
-- foi completada (o desfazer devolve esses valores em vez de apagar).

CREATE TABLE import_batches (
  id        INTEGER PRIMARY KEY,
  scope     TEXT NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('notion', 'trello', 'financas', 'contatos')),
  file      TEXT NOT NULL,
  summary   TEXT NOT NULL,                 -- "1 projeto, 52 tarefas"
  skipped   TEXT NOT NULL DEFAULT '',      -- "12 arquivados"
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undone_at TEXT
);

CREATE TABLE import_items (
  batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  tbl      TEXT NOT NULL CHECK (tbl IN ('projects', 'tasks', 'companies', 'contacts', 'transactions')),
  row_id   INTEGER NOT NULL,
  prev     TEXT                            -- JSON; NULL = linha criada pela importação
);
CREATE INDEX import_items_batch ON import_items(batch_id);
