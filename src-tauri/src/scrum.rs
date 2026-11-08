// Scrum e OKR (fase 4B-2b). Sprints de um projeto e objetivos com resultados-chave.
// As tarefas guardam sprint_id (NULL = backlog), pontos e kr_id; isso fica em tasks.rs.
use rusqlite::{params, Connection};
use serde_json::json;
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
pub struct Sprint {
  pub id: Option<i64>,
  pub project_id: i64,
  pub name: String,
  #[serde(default)]
  pub goal: String,
  pub start_day: String,
  pub end_day: String,
  #[serde(default)]
  pub closed_at: Option<String>,
  #[serde(default)]
  pub retro: String,
  #[serde(default)]
  pub report: String,
  #[serde(default)]
  pub outcome: Option<String>,
}

pub fn sprints(c: &Connection, project_id: i64) -> Res<Vec<Sprint>> {
  let mut st = c.prepare("SELECT id, project_id, name, goal, start_day, end_day, closed_at, retro, report, outcome FROM sprints WHERE project_id = ?1 ORDER BY start_day, id").map_err(e)?;
  let rows = st
    .query_map([project_id], |r| {
      Ok(Sprint { id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?, goal: r.get(3)?, start_day: r.get(4)?, end_day: r.get(5)?, closed_at: r.get(6)?, retro: r.get(7)?, report: r.get(8)?, outcome: r.get(9)? })
    })
    .map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Cria ou edita uma sprint. Só uma aberta por projeto: abrir outra exige encerrar a atual.
pub fn sprint_save(c: &Connection, s: &Sprint) -> Res<i64> {
  if s.name.trim().is_empty() {
    return Err("dê um nome à sprint".into());
  }
  if !valid_day(&s.start_day) || !valid_day(&s.end_day) || s.end_day < s.start_day {
    return Err("datas da sprint inválidas".into());
  }
  match s.id {
    Some(id) => {
      c.execute(
        "UPDATE sprints SET name = ?1, goal = ?2, start_day = ?3, end_day = ?4 WHERE id = ?5 AND project_id = ?6",
        params![s.name.trim(), s.goal.trim(), s.start_day, s.end_day, id, s.project_id],
      )
      .map_err(e)?;
      Ok(id)
    }
    None => {
      let open: i64 = c.query_row("SELECT count(*) FROM sprints WHERE project_id = ?1 AND closed_at IS NULL", [s.project_id], |r| r.get(0)).map_err(e)?;
      if open > 0 {
        return Err("encerre a sprint atual antes de começar outra".into());
      }
      c.execute("INSERT INTO sprints (project_id, name, goal, start_day, end_day) VALUES (?1, ?2, ?3, ?4, ?5)", params![s.project_id, s.name.trim(), s.goal.trim(), s.start_day, s.end_day])
        .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

/// Encerra a sprint: guarda a retrospectiva, o resultado da meta e um relatório (foto do que aconteceu),
/// e devolve ao backlog as tarefas que não ficaram prontas.
/// Apaga uma sprint ainda aberta (o "Desfazer" do Chat). As tarefas voltam para o backlog (ON DELETE SET NULL).
pub fn sprint_delete(c: &Connection, id: i64) -> Res<()> {
  let n = c.execute("DELETE FROM sprints WHERE id = ?1 AND closed_at IS NULL", [id]).map_err(|e| e.to_string())?;
  if n == 0 {
    return Err("só dá para desfazer uma sprint que ainda não foi encerrada".into());
  }
  Ok(())
}

pub fn sprint_close(c: &mut Connection, id: i64, day: &str, retro: &str, outcome: Option<&str>) -> Res<i64> {
  if !valid_day(day) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  if outcome.is_some_and(|o| !["hit", "partial", "miss"].contains(&o)) {
    return Err("resultado da meta inválido".into());
  }
  let tx = c.transaction().map_err(e)?;
  // relatório antes de mexer nas tarefas: (título, pontos, feita, KR)
  let rows: Vec<(String, Option<i64>, bool, Option<String>)> = {
    let mut st = tx
      .prepare(
        "SELECT t.title, t.points, COALESCE(b.done, 0), k.title FROM tasks t
         LEFT JOIN board_columns b ON b.id = t.column_id LEFT JOIN okr_krs k ON k.id = t.kr_id
         WHERE t.sprint_id = ?1 ORDER BY t.ord",
      )
      .map_err(e)?;
    let v = st.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? == 1, r.get(3)?))).map_err(e)?.flatten().collect();
    v
  };
  let planned: i64 = rows.iter().map(|r| r.1.unwrap_or(0)).sum();
  let done: i64 = rows.iter().filter(|r| r.2).map(|r| r.1.unwrap_or(0)).sum();
  let delivered: Vec<&str> = rows.iter().filter(|r| r.2).map(|r| r.0.as_str()).collect();
  let returned: Vec<&str> = rows.iter().filter(|r| !r.2).map(|r| r.0.as_str()).collect();
  let mut krs: Vec<&str> = rows.iter().filter(|r| r.2).filter_map(|r| r.3.as_deref()).collect();
  krs.dedup();
  let report = json!({ "planned": planned, "done": done, "delivered": delivered, "returned": returned, "krs": krs }).to_string();
  let n = tx
    .execute("UPDATE sprints SET closed_at = ?1, retro = ?2, report = ?3, outcome = ?4 WHERE id = ?5 AND closed_at IS NULL", params![day, retro, report, outcome, id])
    .map_err(e)?;
  if n == 0 {
    return Err("sprint não encontrada ou já encerrada".into());
  }
  let back = tx
    .execute(
      "UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?1 AND COALESCE((SELECT done FROM board_columns b WHERE b.id = tasks.column_id), 0) = 0",
      [id],
    )
    .map_err(e)?;
  tx.commit().map_err(e)?;
  Ok(back as i64)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Kr {
  pub id: Option<i64>,
  pub objective_id: i64,
  pub title: String,
  #[serde(default)]
  pub start_value: f64,
  pub target: f64,
  #[serde(default)]
  pub current: f64,
  #[serde(default)]
  pub unit: String,
  #[serde(default = "two")]
  pub confidence: i64,
}
fn two() -> i64 {
  2
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Objective {
  pub id: i64,
  pub title: String,
  pub krs: Vec<Kr>,
}

pub fn okr(c: &Connection, project_id: i64) -> Res<Vec<Objective>> {
  let mut st = c.prepare("SELECT id, title FROM okr_objectives WHERE project_id = ?1 ORDER BY ord, id").map_err(e)?;
  let objs: Vec<(i64, String)> = st.query_map([project_id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
  let mut kst = c.prepare("SELECT id, objective_id, title, start_value, target, current, unit, confidence FROM okr_krs WHERE objective_id = ?1 ORDER BY ord, id").map_err(e)?;
  let mut out = Vec::new();
  for (id, title) in objs {
    let krs = kst
      .query_map([id], |r| {
        Ok(Kr { id: r.get(0)?, objective_id: r.get(1)?, title: r.get(2)?, start_value: r.get(3)?, target: r.get(4)?, current: r.get(5)?, unit: r.get(6)?, confidence: r.get(7)? })
      })
      .map_err(e)?
      .flatten()
      .collect();
    out.push(Objective { id, title, krs });
  }
  Ok(out)
}

pub fn objective_save(c: &Connection, project_id: i64, id: Option<i64>, title: &str) -> Res<i64> {
  let t = title.trim();
  if t.is_empty() {
    return Err("escreva o objetivo".into());
  }
  match id {
    Some(id) => {
      c.execute("UPDATE okr_objectives SET title = ?1 WHERE id = ?2 AND project_id = ?3", params![t, id, project_id]).map_err(e)?;
      Ok(id)
    }
    None => {
      c.execute("INSERT INTO okr_objectives (project_id, title, ord) VALUES (?1, ?2, (SELECT COALESCE(MAX(ord), 0) + 1 FROM okr_objectives WHERE project_id = ?1))", params![project_id, t])
        .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

/// Apaga o objetivo e seus resultados-chave; as tarefas ligadas ficam sem KR.
pub fn objective_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("UPDATE tasks SET kr_id = NULL WHERE kr_id IN (SELECT id FROM okr_krs WHERE objective_id = ?1)", [id]).map_err(e)?;
  c.execute("DELETE FROM okr_krs WHERE objective_id = ?1", [id]).map_err(e)?;
  c.execute("DELETE FROM okr_objectives WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

pub fn kr_save(c: &Connection, k: &Kr) -> Res<i64> {
  if k.title.trim().is_empty() {
    return Err("escreva o resultado-chave".into());
  }
  if !(k.target.is_finite() && k.current.is_finite() && k.start_value.is_finite()) || k.target == k.start_value {
    return Err("a meta precisa ser diferente do ponto de partida".into());
  }
  if !(1..=3).contains(&k.confidence) {
    return Err("confiança inválida".into());
  }
  match k.id {
    Some(id) => {
      c.execute(
        "UPDATE okr_krs SET title = ?1, start_value = ?2, target = ?3, current = ?4, unit = ?5, confidence = ?6 WHERE id = ?7",
        params![k.title.trim(), k.start_value, k.target, k.current, k.unit.trim(), k.confidence, id],
      )
      .map_err(e)?;
      Ok(id)
    }
    None => {
      c.execute(
        "INSERT INTO okr_krs (objective_id, title, start_value, target, current, unit, confidence, ord)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(MAX(ord), 0) + 1 FROM okr_krs WHERE objective_id = ?1))",
        params![k.objective_id, k.title.trim(), k.start_value, k.target, k.current, k.unit.trim(), k.confidence],
      )
      .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

pub fn kr_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("UPDATE tasks SET kr_id = NULL WHERE kr_id = ?1", [id]).map_err(e)?;
  c.execute("DELETE FROM okr_krs WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

// ---------- Resumos da operação (aba Resumo) ----------

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Report {
  pub id: Option<i64>,
  pub project_id: i64,
  #[serde(default)]
  pub created_at: Option<String>,
  pub period_from: String,
  pub period_to: String,
  pub title: String,
  pub data: String,
  #[serde(default)]
  pub note: String,
}

pub fn reports(c: &Connection, project_id: i64) -> Res<Vec<Report>> {
  let mut st = c.prepare("SELECT id, project_id, created_at, period_from, period_to, title, data, note FROM project_reports WHERE project_id = ?1 ORDER BY created_at DESC, id DESC").map_err(e)?;
  let rows = st
    .query_map([project_id], |r| {
      Ok(Report { id: r.get(0)?, project_id: r.get(1)?, created_at: r.get(2)?, period_from: r.get(3)?, period_to: r.get(4)?, title: r.get(5)?, data: r.get(6)?, note: r.get(7)? })
    })
    .map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Guarda um resumo novo (a foto é montada no app) ou só o comentário de um que já existe.
pub fn report_save(c: &Connection, r: &Report) -> Res<i64> {
  if !valid_day(&r.period_from) || !valid_day(&r.period_to) || r.period_to < r.period_from {
    return Err("período inválido".into());
  }
  if serde_json::from_str::<serde_json::Value>(&r.data).is_err() {
    return Err("resumo inválido".into());
  }
  match r.id {
    Some(id) => {
      c.execute("UPDATE project_reports SET note = ?1, title = ?2 WHERE id = ?3", params![r.note, r.title.trim(), id]).map_err(e)?;
      Ok(id)
    }
    None => {
      c.execute(
        "INSERT INTO project_reports (project_id, period_from, period_to, title, data, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![r.project_id, r.period_from, r.period_to, r.title.trim(), r.data, r.note],
      )
      .map_err(e)?;
      Ok(c.last_insert_rowid())
    }
  }
}

pub fn report_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("DELETE FROM project_reports WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{db, tasks};

  fn setup() -> Connection {
    let dir = std::env::temp_dir().join(format!("tesseract-scrum-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("s.db")).unwrap();
    db::migrate(&mut c).unwrap();
    c
  }

  #[test]
  fn sprint_uma_por_vez_e_encerrar_devolve_ao_backlog() {
    let mut c = setup();
    let pid = tasks::project_save(&mut c, None, "personal", "App", "", None).unwrap();
    let s = Sprint { id: None, project_id: pid, name: "Sprint 1".into(), goal: "Agendar sozinho".into(), start_day: "2026-11-02".into(), end_day: "2026-11-13".into(), closed_at: None, retro: String::new(), report: String::new(), outcome: None };
    let sid = sprint_save(&c, &s).unwrap();
    assert!(sprint_save(&c, &s).is_err(), "só uma sprint aberta");
    let mut bad = s.clone();
    bad.end_day = "2026-11-01".into();
    bad.id = Some(sid);
    assert!(sprint_save(&c, &bad).is_err());

    let b = tasks::board(&c, pid).unwrap();
    let mk = |t: &str, col: Option<i64>| {
      tasks::Task { id: None, project_id: pid, column_id: col, title: t.into(), notes: String::new(), priority: 0, due: None, estimate_min: None, labels: vec![], checklist: vec![], note_path: None, ord: 0.0, done_at: None, created_at: None, quadrant: None, focus_day: None, focus_slot: None, spent_min: 0, sched_start: None, sched_min: None, milestone: false, gtd_list: None, context: None, energy: None, waiting_for: None, waiting_since: None, points: Some(5), sprint_id: Some(sid), kr_id: None, scope_id: None, prio: None }
    };
    let done_col = b.columns.iter().find(|x| x.done).unwrap().id;
    let a = mk("feita", done_col);
    let o = mk("aberta", None);
    tasks::task_save(&mut c, &a).unwrap();
    let oid = tasks::task_save(&mut c, &o).unwrap();
    assert!(sprint_close(&mut c, sid, "2026-11-13", "{}", Some("talvez")).is_err());
    assert_eq!(sprint_close(&mut c, sid, "2026-11-13", "{}", Some("partial")).unwrap(), 1, "só a aberta volta");
    let sp = sprints(&c, pid).unwrap().remove(0);
    let r: serde_json::Value = serde_json::from_str(&sp.report).unwrap();
    assert_eq!((r["planned"].as_i64(), r["done"].as_i64(), sp.outcome.as_deref()), (Some(10), Some(5), Some("partial")));
    assert_eq!((r["delivered"][0].as_str(), r["returned"][0].as_str()), (Some("feita"), Some("aberta")));
    let t = tasks::board(&c, pid).unwrap().tasks.into_iter().find(|t| t.id == Some(oid)).unwrap();
    assert_eq!((t.sprint_id, t.points), (None, Some(5)));
    assert!(sprint_close(&mut c, sid, "2026-11-13", "{}", None).is_err());
    assert_eq!(sprints(&c, pid).unwrap()[0].closed_at.as_deref(), Some("2026-11-13"));
    // depois de encerrar, dá para abrir a próxima
    let mut s2 = s.clone();
    s2.name = "Sprint 2".into();
    sprint_save(&c, &s2).unwrap();
  }

  #[test]
  fn okr_objetivos_e_krs() {
    let mut c = setup();
    let pid = tasks::project_save(&mut c, None, "personal", "App", "", None).unwrap();
    let oid = objective_save(&c, pid, None, "Agendar ficar fácil").unwrap();
    let k = Kr { id: None, objective_id: oid, title: "Horários por semana".into(), start_value: 0.0, target: 200.0, current: 120.0, unit: "horários".into(), confidence: 3 };
    let kid = kr_save(&c, &k).unwrap();
    let mut bad = k.clone();
    bad.target = 0.0;
    assert!(kr_save(&c, &bad).is_err());
    bad.target = 10.0;
    bad.confidence = 5;
    assert!(kr_save(&c, &bad).is_err());
    let all = okr(&c, pid).unwrap();
    assert_eq!((all.len(), all[0].krs.len(), all[0].krs[0].current), (1, 1, 120.0));
    objective_delete(&c, oid).unwrap();
    assert!(okr(&c, pid).unwrap().is_empty());
    let _ = kid;
  }

  #[test]
  fn resumos_da_operacao() {
    let mut c = setup();
    let pid = tasks::project_save(&mut c, None, "personal", "App", "", None).unwrap();
    let r = Report { id: None, project_id: pid, created_at: None, period_from: "2026-10-25".into(), period_to: "2026-11-01".into(), title: "Últimos 7 dias".into(), data: "{\"done\":3}".into(), note: String::new() };
    let id = report_save(&c, &r).unwrap();
    let mut bad = r.clone();
    bad.period_to = "2026-10-01".into();
    assert!(report_save(&c, &bad).is_err());
    bad = r.clone();
    bad.data = "não é json".into();
    assert!(report_save(&c, &bad).is_err());
    let mut edit = r.clone();
    edit.id = Some(id);
    edit.note = "Mandado ao cliente".into();
    report_save(&c, &edit).unwrap();
    let all = reports(&c, pid).unwrap();
    assert_eq!((all.len(), all[0].note.as_str(), all[0].data.as_str()), (1, "Mandado ao cliente", "{\"done\":3}"));
    report_delete(&c, id).unwrap();
    assert!(reports(&c, pid).unwrap().is_empty());
  }
}
