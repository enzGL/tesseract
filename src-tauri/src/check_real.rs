// Verificação de migração num banco real (fase 4). Fica desligada nos testes normais.
// Uso, sempre numa CÓPIA do banco (nunca no original):
//   TESS_DB_COPY=caminho/da/copia/tesseract.db cargo test check_real -- --ignored --nocapture
use crate::{db, finance, scrum, shape, tasks};
use rusqlite::Connection;

fn count(c: &Connection, table: &str) -> i64 {
  c.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0)).unwrap_or(-1)
}

#[test]
#[ignore]
fn check_real_copy() {
  let path = std::env::var("TESS_DB_COPY").expect("defina TESS_DB_COPY com o caminho da cópia");
  // banco cifrado: TESS_DB_KEY com a chave do Cofre (entrada "banco.chave")
  let mut c = db::open_keyed(std::path::Path::new(&path), std::env::var("TESS_DB_KEY").ok().as_deref()).unwrap();
  let before = db::schema_version(&c).unwrap();
  let tables = ["organizations", "projects", "settings", "audit_log"];
  let counts: Vec<(&str, i64)> = tables.iter().map(|t| (*t, count(&c, t))).collect();
  let extra = |c: &Connection| ["notes", "chunks", "board_columns", "tasks"].iter().map(|t| (*t, count(c, t))).collect::<Vec<_>>();
  let extra_before = extra(&c);
  println!("antes: esquema {before}, {counts:?} {extra_before:?}");

  let applied = db::migrate(&mut c).unwrap();
  let after = db::schema_version(&c).unwrap();
  println!("migrações aplicadas: {applied}; esquema agora {after}");

  let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
  assert_eq!(ok, "ok", "integridade");
  let fk: i64 = c.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap();
  assert_eq!(fk, 0, "chaves estrangeiras quebradas");
  for (t, n) in &counts {
    assert_eq!(count(&c, t), *n, "a tabela {t} perdeu linhas");
  }
  for (t, n) in &extra_before {
    if *n >= 0 {
      assert!(count(&c, t) >= *n, "a tabela {t} perdeu linhas");
    }
  }

  // passa por todas as leituras da fase 4 com os dados reais
  let ps = tasks::projects(&c).unwrap();
  println!("projetos: {}", ps.len());
  for p in &ps {
    let b = tasks::board(&c, p.id).unwrap();
    let _ = scrum::sprints(&c, p.id).unwrap();
    let _ = scrum::okr(&c, p.id).unwrap();
    let _ = scrum::reports(&c, p.id).unwrap();
    let _ = shape::cycles(&c, p.id).unwrap();
    println!("  {} ({}): {} colunas, {} tarefas, métodos {:?}, gaveta {}", p.name, p.scope, b.columns.len(), b.tasks.len(), p.methods, p.para_kind);
  }
  let _ = tasks::calendar(&c, "2026-10-01", "2026-12-31").unwrap();
  let _ = tasks::unscheduled(&c, 50).unwrap();
  let _ = tasks::open_tasks(&c, 50).unwrap();
  let _ = shape::templates(&c).unwrap();
  for scope in std::iter::once("personal".to_string()).chain(c.prepare("SELECT 'org:' || id FROM organizations").unwrap().query_map([], |r| r.get::<_, String>(0)).unwrap().flatten()) {
    let _ = finance::list(&c, &scope, "2026-10-01", "2026-12-31").unwrap();
    let _ = finance::names(&c, &scope).unwrap();
  }
  println!("leituras da fase 4: ok");
}
