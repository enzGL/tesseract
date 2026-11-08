-- 0002: índice do segundo cérebro (fase 3). O vault continua sendo a fonte da verdade; isto é só índice
-- e pode ser apagado e refeito a qualquer momento.

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,      -- relativo ao vault, com "/"
  title      TEXT NOT NULL,
  mtime      INTEGER NOT NULL,          -- segundos; com size, decide se precisa reindexar
  size       INTEGER NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Trechos da nota, cortados por título e por tamanho.
CREATE TABLE chunks (
  id      INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  ord     INTEGER NOT NULL,
  heading TEXT,
  text    TEXT NOT NULL
);
CREATE INDEX chunks_note ON chunks(note_id);

-- Busca textual. rowid = chunks.id. Sem acento e sem caixa: "decisao" acha "Decisão".
CREATE VIRTUAL TABLE chunks_fts USING fts5(title, heading, text, tokenize = 'unicode61 remove_diacritics 2');

-- [[links]] entre notas, para o grafo e para "o que liga a esta nota".
CREATE TABLE note_links (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target  TEXT NOT NULL
);
CREATE INDEX note_links_target ON note_links(target);
