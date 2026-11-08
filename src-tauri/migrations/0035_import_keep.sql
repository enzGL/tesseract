-- 0035: importador do Google Keep (fase 12). As notas viram arquivos .md no Conhecimento; o lote guarda o
-- caminho e o hash de cada uma (tbl 'notes', row_id 0, prev = {"path", "hash"}) para o Desfazer apagar só a
-- nota que ninguém mexeu. O SQLite não muda CHECK: as duas tabelas são refeitas com os mesmos dados.
-- Ordem: copiar para tabelas sem chave estrangeira, apagar a filha e depois a mãe (assim o ON DELETE
-- CASCADE não leva nada junto), criar de novo e devolver os dados.

CREATE TABLE import_batches_old AS SELECT * FROM import_batches;
CREATE TABLE import_items_old AS SELECT rowid AS rid, * FROM import_items;
DROP INDEX import_items_batch;
DROP TABLE import_items;
DROP TABLE import_batches;

CREATE TABLE import_batches (
  id        INTEGER PRIMARY KEY,
  scope     TEXT NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('notion', 'trello', 'keep', 'financas', 'contatos')),
  file      TEXT NOT NULL,
  summary   TEXT NOT NULL,                 -- "1 projeto, 52 tarefas"
  skipped   TEXT NOT NULL DEFAULT '',      -- "12 arquivados"
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undone_at TEXT
);

CREATE TABLE import_items (
  batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  tbl      TEXT NOT NULL CHECK (tbl IN ('projects', 'tasks', 'companies', 'contacts', 'transactions', 'notes')),
  row_id   INTEGER NOT NULL,
  prev     TEXT                            -- JSON; NULL = linha criada pela importação
);
CREATE INDEX import_items_batch ON import_items(batch_id);

INSERT INTO import_batches (id, scope, source, file, summary, skipped, at, undone_at)
  SELECT id, scope, source, file, summary, skipped, at, undone_at FROM import_batches_old;
-- a ordem das linhas importa: o desfazer percorre por rowid, de trás para a frente
INSERT INTO import_items (rowid, batch_id, tbl, row_id, prev)
  SELECT rid, batch_id, tbl, row_id, prev FROM import_items_old ORDER BY rid;
DROP TABLE import_items_old;
DROP TABLE import_batches_old;
