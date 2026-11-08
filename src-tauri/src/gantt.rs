// Cronograma (fase 8.5: tabela + barras, com aviso de conflito).
// Data de início e dependências entre tarefas do mesmo projeto. O app avisa conflitos (tarefa que começa
// antes de a anterior terminar) e só muda datas quando a pessoa clica em "Empurrar".
use crate::{db, lock, AppDb};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use tauri::State;

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}
fn valid_day(d: &str) -> bool {
  d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
  /// [tarefa, início]
  pub starts: Vec<(i64, String)>,
  /// [tarefa que espera, tarefa que precisa terminar antes]
  pub deps: Vec<(i64, i64)>,
}

pub fn plan(c: &Connection, project_id: i64) -> Res<Plan> {
  let mut st = c.prepare("SELECT p.task_id, p.start_day FROM task_plan p JOIN tasks t ON t.id = p.task_id WHERE t.project_id = ?1 AND p.start_day IS NOT NULL").map_err(e)?;
  let starts = st.query_map([project_id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
  let mut st = c.prepare("SELECT d.task_id, d.depends_on FROM task_deps d JOIN tasks t ON t.id = d.task_id WHERE t.project_id = ?1 ORDER BY d.task_id, d.depends_on").map_err(e)?;
  let deps = st.query_map([project_id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
  Ok(Plan { starts, deps })
}

pub fn set_start(c: &Connection, task: i64, day: Option<&str>) -> Res<()> {
  if day.is_some_and(|d| !valid_day(d)) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  let exists: Option<i64> = c.query_row("SELECT id FROM tasks WHERE id = ?1", [task], |r| r.get(0)).optional().map_err(e)?;
  exists.ok_or("tarefa não encontrada")?;
  c.execute("INSERT INTO task_plan (task_id, start_day) VALUES (?1, ?2) ON CONFLICT(task_id) DO UPDATE SET start_day = excluded.start_day", params![task, day]).map_err(e)?;
  Ok(())
}

/// `task` só começa depois que `on` terminar. Mesmo projeto, sem ciclo (A espera B que espera A).
pub fn dep_add(c: &Connection, task: i64, on: i64) -> Res<()> {
  if task == on {
    return Err("uma tarefa não depende dela mesma".into());
  }
  let p = |id: i64| -> Res<i64> { c.query_row("SELECT project_id FROM tasks WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e)?.ok_or_else(|| "tarefa não encontrada".to_string()) };
  if p(task)? != p(on)? {
    return Err("as duas tarefas precisam ser do mesmo projeto".into());
  }
  // ciclo: `on` já depende (direta ou indiretamente) de `task`?
  let cycle: i64 = c
    .query_row(
      "WITH RECURSIVE up(id) AS (SELECT depends_on FROM task_deps WHERE task_id = ?1 UNION SELECT d.depends_on FROM task_deps d JOIN up ON d.task_id = up.id)
       SELECT COUNT(*) FROM up WHERE id = ?2",
      params![on, task],
      |r| r.get(0),
    )
    .map_err(e)?;
  if cycle > 0 {
    return Err("isso faria um círculo: uma tarefa ficaria esperando a si mesma".into());
  }
  c.execute("INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES (?1, ?2)", params![task, on]).map_err(e)?;
  Ok(())
}

pub fn dep_remove(c: &Connection, task: i64, on: i64) -> Res<()> {
  c.execute("DELETE FROM task_deps WHERE task_id = ?1 AND depends_on = ?2", params![task, on]).map_err(e)?;
  Ok(())
}

#[tauri::command]
pub fn gantt_plan(s: State<AppDb>, project_id: i64) -> Res<Plan> {
  plan(&*lock(&s)?, project_id)
}
#[tauri::command]
pub fn gantt_start(s: State<AppDb>, task: i64, day: Option<String>) -> Res<()> {
  set_start(&*lock(&s)?, task, day.as_deref())
}
#[tauri::command]
pub fn gantt_dep_add(s: State<AppDb>, task: i64, on: i64) -> Res<()> {
  let c = lock(&s)?;
  dep_add(&c, task, on)?;
  db::audit(&c, "gantt.dep", json!({ "task": task, "on": on }))
}
#[tauri::command]
pub fn gantt_dep_remove(s: State<AppDb>, task: i64, on: i64) -> Res<()> {
  dep_remove(&*lock(&s)?, task, on)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn inicio_dependencias_e_ciclo() {
    let dir = std::env::temp_dir().join(format!("tesseract-gantt-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("g.db")).unwrap();
    db::migrate(&mut c).unwrap();
    let p1 = crate::tasks::project_save(&mut c, None, "personal", "Site", "", None).unwrap();
    let p2 = crate::tasks::project_save(&mut c, None, "personal", "Outro", "", None).unwrap();
    let col = |p: i64| -> i64 { c.query_row("SELECT id FROM board_columns WHERE project_id = ?1 ORDER BY ord LIMIT 1", [p], |r| r.get(0)).unwrap() };
    let (c1, c2) = (col(p1), col(p2));
    let mk = |c: &Connection, p: i64, col: i64, t: &str| -> i64 {
      c.execute("INSERT INTO tasks (project_id, column_id, title, ord) VALUES (?1, ?2, ?3, 1)", params![p, col, t]).unwrap();
      c.last_insert_rowid()
    };
    let (a, b, d, x) = (mk(&c, p1, c1, "Briefing"), mk(&c, p1, c1, "Layout"), mk(&c, p1, c1, "Desenvolvimento"), mk(&c, p2, c2, "Fora"));
    set_start(&c, b, Some("2026-11-03")).unwrap();
    assert!(set_start(&c, b, Some("3/11")).is_err());
    dep_add(&c, b, a).unwrap();
    dep_add(&c, d, b).unwrap();
    dep_add(&c, d, b).unwrap(); // repetir não duplica
    assert!(dep_add(&c, a, d).is_err(), "ciclo indireto");
    assert!(dep_add(&c, a, a).is_err());
    assert!(dep_add(&c, a, x).is_err(), "outro projeto");
    let pl = plan(&c, p1).unwrap();
    assert_eq!(pl.starts, vec![(b, "2026-11-03".to_string())]);
    assert_eq!(pl.deps, vec![(b, a), (d, b)]);
    dep_remove(&c, d, b).unwrap();
    set_start(&c, b, None).unwrap();
    let pl = plan(&c, p1).unwrap();
    assert_eq!((pl.starts.len(), pl.deps.len()), (0, 1));
    c.execute("DELETE FROM tasks WHERE id = ?1", [a]).unwrap();
    assert_eq!(plan(&c, p1).unwrap().deps.len(), 0, "apagar a tarefa leva a dependência");
  }
}
