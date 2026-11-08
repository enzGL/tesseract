-- 0008: finanças (fase 4D, direção A "fluxo do mês").
-- Um lançamento é previsto até ganhar paid_at (a data em que o dinheiro entrou ou saiu de verdade).
-- Pessoal e cada organização ficam separados pelo escopo. Valores em centavos, sempre positivos; o sentido vem de kind.

CREATE TABLE transactions (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,                              -- personal | org:<id>
  kind        TEXT NOT NULL CHECK (kind IN ('in', 'out')),
  description TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  account     TEXT NOT NULL DEFAULT '',
  amount      INTEGER NOT NULL CHECK (amount > 0),        -- centavos
  due         TEXT NOT NULL,                              -- AAAA-MM-DD: vencimento ou data prevista
  paid_at     TEXT,                                       -- AAAA-MM-DD: quando aconteceu; NULL = previsto
  notes       TEXT NOT NULL DEFAULT '',
  import_key  TEXT,                                       -- evita importar o mesmo extrato duas vezes
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX transactions_scope_due ON transactions(scope, due);
CREATE UNIQUE INDEX transactions_import ON transactions(scope, import_key) WHERE import_key IS NOT NULL;
