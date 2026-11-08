-- 0003: vetores dos trechos para busca por significado (fase 3B). Gerados localmente pelo Ollama (bge-m3).
-- Saem junto com o trecho (ON DELETE CASCADE) quando a nota muda ou some.
CREATE TABLE chunk_vectors (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model    TEXT NOT NULL,
  vec      BLOB NOT NULL                -- f32 little-endian
);
