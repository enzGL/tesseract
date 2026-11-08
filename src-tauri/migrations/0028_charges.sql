-- 0028: cobrança sem esquecer (fase 12: A "fila de cobrança" como tela + calendário da C).
-- As parcelas a receber já vivem em transactions (kind = 'in'); aqui fica só o histórico de cada cobrança:
-- quando, em que tom e por qual canal a pessoa cobrou. O Tesseract não envia: abre o WhatsApp ou o e-mail.

CREATE TABLE charge_events (
  id         INTEGER PRIMARY KEY,
  tx_id      INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tone       TEXT NOT NULL CHECK (tone IN ('lembrete', 'venceu', 'segunda')),
  channel    TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'copiado', 'manual')),
  message    TEXT NOT NULL DEFAULT '',                   -- o texto que saiu (até 2.000 caracteres)
  at         TEXT NOT NULL,                              -- AAAA-MM-DD
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX charge_events_tx ON charge_events(tx_id, at);
