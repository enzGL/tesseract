// Finanças (fase 4D). Lançamentos previstos e realizados, por escopo.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

pub(crate) fn valid_day(d: &str) -> bool {
  d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}
pub(crate) fn valid_scope(scope: &str) -> bool {
  scope == "personal" || (scope.starts_with("org:") && scope.len() > 4 && scope[4..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tx {
  pub id: Option<i64>,
  pub scope: String,
  pub kind: String,
  pub description: String,
  #[serde(default)]
  pub category: String,
  #[serde(default)]
  pub account: String,
  pub amount: i64,
  pub due: String,
  pub paid_at: Option<String>,
  #[serde(default)]
  pub notes: String,
}

const COLS: &str = "id, scope, kind, description, category, account, amount, due, paid_at, notes";
fn row(r: &rusqlite::Row) -> rusqlite::Result<Tx> {
  Ok(Tx {
    id: r.get(0)?,
    scope: r.get(1)?,
    kind: r.get(2)?,
    description: r.get(3)?,
    category: r.get(4)?,
    account: r.get(5)?,
    amount: r.get(6)?,
    due: r.get(7)?,
    paid_at: r.get(8)?,
    notes: r.get(9)?,
  })
}

fn check(t: &Tx) -> Res<()> {
  if !valid_scope(&t.scope) {
    return Err("escopo inválido".into());
  }
  if t.kind != "in" && t.kind != "out" {
    return Err("tipo deve ser entrada ou saída".into());
  }
  if t.description.trim().is_empty() {
    return Err("dê uma descrição ao lançamento".into());
  }
  if t.amount <= 0 || t.amount > 1_000_000_000_00 {
    return Err("valor precisa ser maior que zero".into());
  }
  if !valid_day(&t.due) || t.paid_at.as_deref().is_some_and(|d| !valid_day(d)) {
    return Err("datas no formato AAAA-MM-DD".into());
  }
  Ok(())
}

/// Lançamentos do escopo com data prevista ou realizada entre `from` e `to` (inclusive).
pub fn list(c: &Connection, scope: &str, from: &str, to: &str) -> Res<Vec<Tx>> {
  if !valid_day(from) || !valid_day(to) {
    return Err("datas no formato AAAA-MM-DD".into());
  }
  let mut st = c
    .prepare(&format!("SELECT {COLS} FROM transactions WHERE scope = ?1 AND ((due BETWEEN ?2 AND ?3) OR (paid_at BETWEEN ?2 AND ?3)) ORDER BY due, id"))
    .map_err(e)?;
  let rows = st.query_map(params![scope, from, to], row).map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Previstos vencidos antes de `today` que ainda não aconteceram (de qualquer mês).
pub fn overdue(c: &Connection, scope: &str, today: &str) -> Res<Vec<Tx>> {
  let mut st = c.prepare(&format!("SELECT {COLS} FROM transactions WHERE scope = ?1 AND paid_at IS NULL AND due < ?2 ORDER BY due")).map_err(e)?;
  let rows = st.query_map(params![scope, today], row).map_err(e)?;
  Ok(rows.flatten().collect())
}

/// O que já foi usado no escopo, para sugerir no formulário (mais usado primeiro).
#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Names {
  pub categories: Vec<String>,
  pub accounts: Vec<String>,
  pub incomes: Vec<String>,
  pub expenses: Vec<String>,
}

pub fn names(c: &Connection, scope: &str) -> Res<Names> {
  let pick = |col: &str, kind: Option<&str>| -> Res<Vec<String>> {
    let k = kind.map(|k| format!(" AND kind = '{k}'")).unwrap_or_default();
    let mut st = c.prepare(&format!("SELECT {col} FROM transactions WHERE scope = ?1 AND {col} <> ''{k} GROUP BY {col} ORDER BY count(*) DESC, max(id) DESC LIMIT 30")).map_err(e)?;
    let v = st.query_map([scope], |r| r.get(0)).map_err(e)?.flatten().collect();
    Ok(v)
  };
  Ok(Names { categories: pick("category", None)?, accounts: pick("account", None)?, incomes: pick("description", Some("in"))?, expenses: pick("description", Some("out"))? })
}

pub fn save(c: &Connection, t: &Tx) -> Res<i64> {
  check(t)?;
  let d = t.description.trim();
  match t.id {
    Some(id) => {
      let n = c
        .execute(
          "UPDATE transactions SET scope = ?1, kind = ?2, description = ?3, category = ?4, account = ?5, amount = ?6, due = ?7, paid_at = ?8, notes = ?9,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10",
          params![t.scope, t.kind, d, t.category.trim(), t.account.trim(), t.amount, t.due, t.paid_at, t.notes, id],
        )
        .map_err(e)?;
      if n == 0 {
        return Err("lançamento não encontrado".into());
      }
      Ok(id)
    }
    None => {
      c.execute(
        "INSERT INTO transactions (scope, kind, description, category, account, amount, due, paid_at, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![t.scope, t.kind, d, t.category.trim(), t.account.trim(), t.amount, t.due, t.paid_at, t.notes],
      )
      .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

/// Marca como pago/recebido na data dada, ou volta a previsto (None).
pub fn set_paid(c: &Connection, id: i64, day: Option<&str>) -> Res<()> {
  if day.is_some_and(|d| !valid_day(d)) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  c.execute("UPDATE transactions SET paid_at = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2", params![day, id]).map(|_| ()).map_err(e)
}

pub fn delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("DELETE FROM transactions WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::db;

  fn setup() -> Connection {
    let dir = std::env::temp_dir().join(format!("tesseract-fin-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("f.db")).unwrap();
    db::migrate(&mut c).unwrap();
    c
  }
  fn tx(kind: &str, desc: &str, amount: i64, due: &str) -> Tx {
    Tx { id: None, scope: "personal".into(), kind: kind.into(), description: desc.into(), category: String::new(), account: String::new(), amount, due: due.into(), paid_at: None, notes: String::new() }
  }

  #[test]
  fn previsto_realizado_e_atrasado() {
    let c = setup();
    let a = save(&c, &tx("in", "Salário", 530000, "2026-11-05")).unwrap();
    save(&c, &tx("out", "Aluguel", 150000, "2026-11-01")).unwrap();
    let mut org = tx("out", "Contador", 45000, "2026-11-20");
    org.scope = "org:agencia".into();
    save(&c, &org).unwrap();
    assert_eq!(list(&c, "personal", "2026-11-01", "2026-11-30").unwrap().len(), 2, "pessoal e empresa separados");
    assert_eq!(overdue(&c, "personal", "2026-11-10").unwrap().len(), 2);
    set_paid(&c, a, Some("2026-11-06")).unwrap();
    assert_eq!(overdue(&c, "personal", "2026-11-10").unwrap().len(), 1);
    // pago no começo de dezembro aparece também em dezembro
    let mut late = tx("in", "Freela", 90000, "2026-11-28");
    late.paid_at = Some("2026-12-02".into());
    save(&c, &late).unwrap();
    assert_eq!(list(&c, "personal", "2026-12-01", "2026-12-31").unwrap().len(), 1);

    assert!(save(&c, &tx("in", "x", 0, "2026-11-01")).is_err());
    assert!(save(&c, &tx("x", "x", 10, "2026-11-01")).is_err());
    assert!(save(&c, &tx("in", " ", 10, "2026-11-01")).is_err());
    assert!(save(&c, &tx("in", "x", 10, "01/11/2026")).is_err());
    assert!(set_paid(&c, a, Some("ontem")).is_err());
  }
}
