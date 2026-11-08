// Fase 4B-2c: Shape Up (ciclos com uma aposta e frentes no morro) e modelos de projeto da própria pessoa.
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}
fn valid_day(d: &str) -> bool {
  d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Cycle {
  pub id: Option<i64>,
  pub project_id: i64,
  pub name: String,
  #[serde(default)]
  pub bet: String,
  pub appetite_weeks: i64,
  pub start_day: String,
  #[serde(default)]
  pub closed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
  pub id: Option<i64>,
  pub cycle_id: i64,
  pub title: String,
  #[serde(default)]
  pub hill: i64,
  #[serde(default)]
  pub hill_at: Option<String>,
}

pub fn cycles(c: &Connection, project_id: i64) -> Res<Vec<Cycle>> {
  let mut st = c.prepare("SELECT id, project_id, name, bet, appetite_weeks, start_day, closed_at FROM cycles WHERE project_id = ?1 ORDER BY start_day, id").map_err(e)?;
  let rows = st
    .query_map([project_id], |r| Ok(Cycle { id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?, bet: r.get(3)?, appetite_weeks: r.get(4)?, start_day: r.get(5)?, closed_at: r.get(6)? }))
    .map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Cria ou edita um ciclo. Só um aberto por projeto.
pub fn cycle_save(c: &Connection, x: &Cycle) -> Res<i64> {
  if x.name.trim().is_empty() {
    return Err("dê um nome ao ciclo".into());
  }
  if !valid_day(&x.start_day) || !(1..=12).contains(&x.appetite_weeks) {
    return Err("início ou apetite inválido".into());
  }
  match x.id {
    Some(id) => {
      c.execute("UPDATE cycles SET name = ?1, bet = ?2, appetite_weeks = ?3, start_day = ?4 WHERE id = ?5 AND project_id = ?6", params![x.name.trim(), x.bet.trim(), x.appetite_weeks, x.start_day, id, x.project_id])
        .map_err(e)?;
      Ok(id)
    }
    None => {
      let open: i64 = c.query_row("SELECT count(*) FROM cycles WHERE project_id = ?1 AND closed_at IS NULL", [x.project_id], |r| r.get(0)).map_err(e)?;
      if open > 0 {
        return Err("encerre o ciclo atual antes de começar outro".into());
      }
      c.execute("INSERT INTO cycles (project_id, name, bet, appetite_weeks, start_day) VALUES (?1, ?2, ?3, ?4, ?5)", params![x.project_id, x.name.trim(), x.bet.trim(), x.appetite_weeks, x.start_day])
        .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

pub fn cycle_close(c: &Connection, id: i64, day: &str) -> Res<()> {
  if !valid_day(day) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  let n = c.execute("UPDATE cycles SET closed_at = ?1 WHERE id = ?2 AND closed_at IS NULL", params![day, id]).map_err(e)?;
  if n == 0 {
    return Err("ciclo não encontrado ou já encerrado".into());
  }
  Ok(())
}

pub fn scopes(c: &Connection, cycle_id: i64) -> Res<Vec<Scope>> {
  let mut st = c.prepare("SELECT id, cycle_id, title, hill, hill_at FROM scopes WHERE cycle_id = ?1 ORDER BY ord, id").map_err(e)?;
  let rows = st.query_map([cycle_id], |r| Ok(Scope { id: r.get(0)?, cycle_id: r.get(1)?, title: r.get(2)?, hill: r.get(3)?, hill_at: r.get(4)? })).map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Cria ou renomeia uma frente. A posição no morro muda por scope_move (que marca a data).
pub fn scope_save(c: &Connection, s: &Scope) -> Res<i64> {
  if s.title.trim().is_empty() {
    return Err("dê um nome à frente".into());
  }
  match s.id {
    Some(id) => {
      c.execute("UPDATE scopes SET title = ?1 WHERE id = ?2", params![s.title.trim(), id]).map_err(e)?;
      Ok(id)
    }
    None => {
      c.execute("INSERT INTO scopes (cycle_id, title, ord) VALUES (?1, ?2, (SELECT COALESCE(MAX(ord), 0) + 1 FROM scopes WHERE cycle_id = ?1))", params![s.cycle_id, s.title.trim()]).map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

pub fn scope_move(c: &Connection, id: i64, hill: i64, day: &str) -> Res<()> {
  if !(0..=100).contains(&hill) || !valid_day(day) {
    return Err("posição no morro entre 0 e 100".into());
  }
  c.execute("UPDATE scopes SET hill = ?1, hill_at = ?2 WHERE id = ?3", params![hill, day, id]).map(|_| ()).map_err(e)
}

pub fn scope_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("UPDATE tasks SET scope_id = NULL WHERE scope_id = ?1", [id]).map_err(e)?;
  c.execute("DELETE FROM scopes WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

// ---------- Modelos da pessoa ----------

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserTemplate {
  pub id: Option<i64>,
  pub name: String,
  #[serde(default)]
  pub about: String,
  pub data: String,
  #[serde(default)]
  pub created_at: Option<String>,
}

pub fn templates(c: &Connection) -> Res<Vec<UserTemplate>> {
  let mut st = c.prepare("SELECT id, name, about, data, created_at FROM user_templates ORDER BY name COLLATE NOCASE").map_err(e)?;
  let rows = st.query_map([], |r| Ok(UserTemplate { id: r.get(0)?, name: r.get(1)?, about: r.get(2)?, data: r.get(3)?, created_at: r.get(4)? })).map_err(e)?;
  Ok(rows.flatten().collect())
}

pub fn template_save(c: &Connection, t: &UserTemplate) -> Res<i64> {
  if t.name.trim().is_empty() {
    return Err("dê um nome ao modelo".into());
  }
  let ok = serde_json::from_str::<serde_json::Value>(&t.data).map(|v| v.get("columns").is_some_and(|x| x.is_array()) && v.get("methods").is_some_and(|x| x.is_array())).unwrap_or(false);
  if !ok {
    return Err("modelo inválido".into());
  }
  match t.id {
    Some(id) => {
      c.execute("UPDATE user_templates SET name = ?1, about = ?2, data = ?3 WHERE id = ?4", params![t.name.trim(), t.about.trim(), t.data, id]).map_err(e)?;
      Ok(id)
    }
    None => {
      c.execute("INSERT INTO user_templates (name, about, data) VALUES (?1, ?2, ?3)", params![t.name.trim(), t.about.trim(), t.data]).map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

pub fn template_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("DELETE FROM user_templates WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{db, tasks};

  fn setup() -> Connection {
    let dir = std::env::temp_dir().join(format!("tesseract-shape-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("s.db")).unwrap();
    db::migrate(&mut c).unwrap();
    c
  }

  #[test]
  fn ciclo_frentes_e_morro() {
    let mut c = setup();
    let pid = tasks::project_save(&mut c, None, "personal", "App", "", None).unwrap();
    let cy = Cycle { id: None, project_id: pid, name: "Ciclo 1".into(), bet: "Agenda".into(), appetite_weeks: 6, start_day: "2026-11-02".into(), closed_at: None };
    let cid = cycle_save(&c, &cy).unwrap();
    assert!(cycle_save(&c, &cy).is_err(), "um ciclo aberto por vez");
    let mut bad = cy.clone();
    bad.id = Some(cid);
    bad.appetite_weeks = 20;
    assert!(cycle_save(&c, &bad).is_err());
    let sid = scope_save(&c, &Scope { id: None, cycle_id: cid, title: "Bloquear horário".into(), hill: 0, hill_at: None }).unwrap();
    scope_move(&c, sid, 40, "2026-11-05").unwrap();
    assert!(scope_move(&c, sid, 140, "2026-11-05").is_err());
    let s = &scopes(&c, cid).unwrap()[0];
    assert_eq!((s.hill, s.hill_at.as_deref()), (40, Some("2026-11-05")));
    cycle_close(&c, cid, "2026-12-14").unwrap();
    assert!(cycle_close(&c, cid, "2026-12-14").is_err());
    let mut next = cy.clone();
    next.name = "Ciclo 2".into();
    cycle_save(&c, &next).unwrap();
    scope_delete(&c, sid).unwrap();
    assert!(scopes(&c, cid).unwrap().is_empty());
  }

  #[test]
  fn para_prioridade_e_modelos() {
    let mut c = setup();
    let pid = tasks::project_save(&mut c, None, "personal", "Saúde", "", None).unwrap();
    tasks::project_para(&c, pid, "area", Some("pessoal/saude")).unwrap();
    assert!(tasks::project_para(&c, pid, "gaveta", None).is_err());
    assert!(tasks::project_para(&c, pid, "area", Some("../fora")).is_err());
    let p = tasks::projects(&c).unwrap().into_iter().find(|p| p.id == pid).unwrap();
    assert_eq!((p.para_kind.as_str(), p.brain_path.as_deref()), ("area", Some("pessoal/saude")));

    let mut t = tasks::board(&c, pid).unwrap().tasks.into_iter().next().unwrap_or_else(|| tasks::Task {
      id: None, project_id: pid, column_id: None, title: "x".into(), notes: String::new(), priority: 0, due: None, estimate_min: None, labels: vec![], checklist: vec![], note_path: None, ord: 0.0, done_at: None, created_at: None,
      quadrant: None, focus_day: None, focus_slot: None, spent_min: 0, sched_start: None, sched_min: None, milestone: false, gtd_list: None, context: None, energy: None, waiting_for: None, waiting_since: None,
      points: None, sprint_id: None, kr_id: None, scope_id: None, prio: None,
    });
    t.prio = Some("[1,2]".into());
    assert!(tasks::task_save(&mut c, &t).is_err(), "prio precisa ser objeto");
    t.prio = Some("{\"rice\":{\"r\":100,\"i\":2,\"c\":80,\"e\":2}}".into());
    let id = tasks::task_save(&mut c, &t).unwrap();
    assert!(tasks::board(&c, pid).unwrap().tasks.iter().find(|x| x.id == Some(id)).unwrap().prio.as_deref().unwrap().contains("rice"));

    let tpl = UserTemplate { id: None, name: "Site para cliente".into(), about: "Etapas com aprovação".into(), data: "{\"columns\":[],\"methods\":[\"kanban\"]}".into(), created_at: None };
    let tid = template_save(&c, &tpl).unwrap();
    let mut bad = tpl.clone();
    bad.data = "{}".into();
    assert!(template_save(&c, &bad).is_err());
    assert_eq!(templates(&c).unwrap().len(), 1);
    template_delete(&c, tid).unwrap();
    assert!(templates(&c).unwrap().is_empty());
  }
}
