-- 0022: Social Media (fase 9: calendário do mês da A, quadro de produção da B,
-- estúdio do post da C). Um post nasce como ideia e anda: rascunho → aprovação → agendado → publicado.
-- Publicação assistida: na hora, o app copia a legenda e abre a rede; a pessoa posta. Métricas são
-- anotadas depois, à mão (nada é inventado nem puxado sem API oficial conectada).

CREATE TABLE social_posts (
  id            INTEGER PRIMARY KEY,
  scope         TEXT NOT NULL,                      -- personal | org:<id>
  title         TEXT NOT NULL,
  caption       TEXT NOT NULL DEFAULT '',
  hashtags      TEXT NOT NULL DEFAULT '',
  networks      TEXT NOT NULL DEFAULT '[]',          -- JSON: ["instagram", "linkedin", ...]
  status        TEXT NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia', 'rascunho', 'aprovacao', 'agendado', 'publicado')),
  scheduled_at  TEXT,                                -- AAAA-MM-DDTHH:MM (hora local)
  published_at  TEXT,
  media         TEXT NOT NULL DEFAULT '[]',          -- JSON: caminhos de arquivos no computador
  approval_note TEXT NOT NULL DEFAULT '',            -- o que o cliente pediu ou aprovou
  metrics       TEXT NOT NULL DEFAULT '{}',          -- JSON: {alcance, curtidas, comentarios, salvos, cliques}
  ord           REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX social_posts_scope ON social_posts(scope, status);
CREATE INDEX social_posts_when ON social_posts(scheduled_at);
