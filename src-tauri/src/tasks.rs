// Projetos, colunas do quadro e tarefas (fase 4A). Toda escrita passa por aqui; o front só pede.
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

/// Quadro padrão de um projeto novo.
// Nome, cor, limite WIP, conta como concluída. Cores: cinza, amarelo e verde.
pub const DEFAULT_COLUMNS: &[(&str, &str, Option<i64>, bool)] =
  &[("A fazer", "#8A93B4", None, false), ("Fazendo", "#E0A800", Some(3), false), ("Feito", "#1D6B45", None, true)];

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
  pub id: i64,
  pub scope: String,
  pub name: String,
  pub description: String,
  pub archived: bool,
  pub open: i64,
  pub done: i64,
  pub methods: Vec<String>,
  pub preset: Option<String>,
  pub focus_rule: String,
  pub review_day: Option<i64>,
  pub review_at: Option<String>,
  pub para_kind: String,
  pub brain_path: Option<String>,
}

/// Métodos que o app já sabe mostrar (fase 4B). Os outros da galeria aparecem como "em breve".
pub const METHODS: &[&str] = &["kanban", "lista", "foco", "eisenhower", "gtd", "scrum", "okr", "shapeup", "priorizacao", "cronograma"];
pub const PARA_KINDS: &[&str] = &["project", "area", "resource"];
pub const GTD_LISTS: &[&str] = &["inbox", "next", "waiting", "someday"];
pub const FOCUS_RULES: &[&str] = &["mit3", "135", "ivy"];

/// Ajustes de método de um projeto: o que a galeria manda na criação e o trilho muda depois.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MethodSetup {
  pub methods: Vec<String>,
  pub preset: Option<String>,
  pub focus_rule: Option<String>,
  pub review_day: Option<i64>,
  #[serde(default)]
  pub columns: Vec<Column>,
}

/// Kanban sempre ligado (é a visão principal); ids desconhecidos e repetidos saem.
fn clean_methods(m: &[String]) -> Vec<String> {
  let mut out = vec!["kanban".to_string()];
  for id in m {
    if METHODS.contains(&id.as_str()) && !out.contains(id) {
      out.push(id.clone());
    }
  }
  out
}

fn check_setup(m: &MethodSetup) -> Res<()> {
  if let Some(r) = &m.focus_rule {
    if !FOCUS_RULES.contains(&r.as_str()) {
      return Err("regra do foco desconhecida".into());
    }
  }
  if m.review_day.is_some_and(|d| !(0..=6).contains(&d)) {
    return Err("dia da revisão inválido".into());
  }
  if m.columns.iter().any(|c| c.name.trim().is_empty()) {
    return Err("toda coluna precisa de nome".into());
  }
  Ok(())
}

fn valid_day(d: &str) -> bool {
  d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

pub fn projects(c: &Connection) -> Res<Vec<Project>> {
  let mut st = c
    .prepare(
      "SELECT p.id, p.scope, p.name, p.description, p.archived_at IS NOT NULL,
              (SELECT count(*) FROM tasks t LEFT JOIN board_columns b ON b.id = t.column_id WHERE t.project_id = p.id AND COALESCE(b.done, 0) = 0),
              (SELECT count(*) FROM tasks t JOIN board_columns b ON b.id = t.column_id WHERE t.project_id = p.id AND b.done = 1),
              p.methods, p.preset, p.focus_rule, p.review_day, p.review_at, p.para_kind, p.brain_path
       FROM projects p ORDER BY p.archived_at IS NOT NULL, p.name COLLATE NOCASE",
    )
    .map_err(e)?;
  let rows = st
    .query_map([], |r| {
      let methods: String = r.get(7)?;
      Ok(Project {
        id: r.get(0)?,
        scope: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        archived: r.get(4)?,
        open: r.get(5)?,
        done: r.get(6)?,
        methods: clean_methods(&serde_json::from_str::<Vec<String>>(&methods).unwrap_or_default()),
        preset: r.get(8)?,
        focus_rule: r.get(9)?,
        review_day: r.get(10)?,
        review_at: r.get(11)?,
        para_kind: r.get(12)?,
        brain_path: r.get(13)?,
      })
    })
    .map_err(e)?;
  Ok(rows.flatten().collect())
}

fn valid_scope(scope: &str) -> bool {
  scope == "personal" || (scope.starts_with("org:") && scope.len() > 4 && scope[4..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

/// Cria (id None) ou edita um projeto. Na criação, `setup` vem do modelo escolhido na galeria
/// (colunas, métodos, regra do foco, ritual); sem ele, o quadro padrão.
pub fn project_save(c: &mut Connection, id: Option<i64>, scope: &str, name: &str, description: &str, setup: Option<&MethodSetup>) -> Res<i64> {
  let name = name.trim();
  if name.is_empty() {
    return Err("dê um nome ao projeto".into());
  }
  if !valid_scope(scope) {
    return Err("escopo inválido".into());
  }
  match id {
    Some(id) => {
      c.execute("UPDATE projects SET scope = ?1, name = ?2, description = ?3 WHERE id = ?4", params![scope, name, description, id]).map_err(e)?;
      Ok(id)
    }
    None => {
      let tx = c.transaction().map_err(e)?;
      if let Some(m) = setup {
        check_setup(m)?;
      }
      tx.execute("INSERT INTO projects (scope, name, description) VALUES (?1, ?2, ?3)", params![scope, name, description]).map_err(e)?;
      let pid = tx.last_insert_rowid();
      match setup.filter(|m| !m.columns.is_empty()) {
        Some(m) => {
          for (i, col) in m.columns.iter().enumerate() {
            tx.execute(
              "INSERT INTO board_columns (project_id, name, ord, color, wip, done) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
              params![pid, col.name.trim(), (i + 1) as f64, col.color, col.wip.filter(|w| *w > 0), col.done as i64],
            )
            .map_err(e)?;
          }
        }
        None => {
          for (i, (n, color, wip, done)) in DEFAULT_COLUMNS.iter().enumerate() {
            tx.execute("INSERT INTO board_columns (project_id, name, ord, color, wip, done) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![pid, n, (i + 1) as f64, color, wip, *done as i64]).map_err(e)?;
          }
        }
      }
      if let Some(m) = setup {
        let methods = serde_json::to_string(&clean_methods(&m.methods)).map_err(e)?;
        tx.execute(
          "UPDATE projects SET methods = ?1, preset = ?2, focus_rule = COALESCE(?3, 'mit3'), review_day = ?4 WHERE id = ?5",
          params![methods, m.preset, m.focus_rule, m.review_day, pid],
        )
        .map_err(e)?;
      }
      tx.commit().map_err(e)?;
      Ok(pid)
    }
  }
}

/// Liga e desliga métodos, troca a regra do foco e o dia do ritual (trilho do projeto).
pub fn project_methods(c: &Connection, id: i64, m: &MethodSetup) -> Res<()> {
  check_setup(m)?;
  let methods = serde_json::to_string(&clean_methods(&m.methods)).map_err(e)?;
  let n = c
    .execute("UPDATE projects SET methods = ?1, focus_rule = COALESCE(?2, focus_rule), review_day = ?3 WHERE id = ?4", params![methods, m.focus_rule, m.review_day, id])
    .map_err(e)?;
  if n == 0 {
    return Err("projeto não encontrado".into());
  }
  Ok(())
}

/// PARA: em que gaveta o projeto fica (projeto, área, recurso; arquivado = arquivo) e a pasta dele no cérebro.
pub fn project_para(c: &Connection, id: i64, kind: &str, brain_path: Option<&str>) -> Res<()> {
  if !PARA_KINDS.contains(&kind) {
    return Err("gaveta desconhecida".into());
  }
  let path = brain_path.map(str::trim).filter(|p| !p.is_empty());
  if path.is_some_and(|p| p.contains("..") || p.starts_with('/') || p.starts_with('\\') || p.contains(':')) {
    return Err("a pasta precisa ser um caminho dentro da base de conhecimento".into());
  }
  c.execute("UPDATE projects SET para_kind = ?1, brain_path = ?2 WHERE id = ?3", params![kind, path, id]).map(|_| ()).map_err(e)
}

/// Marca a revisão semanal como feita no dia dado (data local vem do front).
pub fn project_review_done(c: &Connection, id: i64, day: &str) -> Res<()> {
  if !valid_day(day) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  c.execute("UPDATE projects SET review_at = ?1 WHERE id = ?2", params![day, id]).map(|_| ()).map_err(e)
}

/// Soma minutos de foco à tarefa (cronômetro do Foco do dia).
pub fn task_log_time(c: &Connection, id: i64, minutes: i64) -> Res<i64> {
  if !(1..=600).contains(&minutes) {
    return Err("minutos fora do intervalo".into());
  }
  c.execute("UPDATE tasks SET spent_min = spent_min + ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2", params![minutes, id]).map_err(e)?;
  c.query_row("SELECT spent_min FROM tasks WHERE id = ?1", [id], |r| r.get(0)).map_err(|_| "tarefa não encontrada".to_string())
}

pub fn project_archive(c: &Connection, id: i64, archived: bool) -> Res<()> {
  let sql = if archived { "UPDATE projects SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1" } else { "UPDATE projects SET archived_at = NULL WHERE id = ?1" };
  c.execute(sql, [id]).map(|_| ()).map_err(e)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Column {
  pub id: Option<i64>,
  pub name: String,
  pub color: Option<String>,
  pub wip: Option<i64>,
  pub done: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
  pub id: Option<i64>,
  pub project_id: i64,
  pub column_id: Option<i64>,
  pub title: String,
  #[serde(default)]
  pub notes: String,
  #[serde(default)]
  pub priority: i64,
  pub due: Option<String>,
  pub estimate_min: Option<i64>,
  #[serde(default)]
  pub labels: Vec<String>,
  #[serde(default)]
  pub checklist: Vec<Value>,
  pub note_path: Option<String>,
  #[serde(default)]
  pub ord: f64,
  #[serde(default)]
  pub done_at: Option<String>,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub quadrant: Option<i64>,
  #[serde(default)]
  pub focus_day: Option<String>,
  #[serde(default)]
  pub focus_slot: Option<i64>,
  #[serde(default)]
  pub spent_min: i64,
  #[serde(default)]
  pub sched_start: Option<String>,
  #[serde(default)]
  pub sched_min: Option<i64>,
  #[serde(default)]
  pub milestone: bool,
  #[serde(default)]
  pub gtd_list: Option<String>,
  #[serde(default)]
  pub context: Option<String>,
  #[serde(default)]
  pub energy: Option<i64>,
  #[serde(default)]
  pub waiting_for: Option<String>,
  #[serde(default)]
  pub waiting_since: Option<String>,
  #[serde(default)]
  pub points: Option<i64>,
  #[serde(default)]
  pub sprint_id: Option<i64>,
  #[serde(default)]
  pub kr_id: Option<i64>,
  #[serde(default)]
  pub scope_id: Option<i64>,
  #[serde(default)]
  pub prio: Option<String>,
}

fn task_row(r: &Row) -> rusqlite::Result<Task> {
  let labels: String = r.get(8)?;
  let checklist: String = r.get(9)?;
  Ok(Task {
    id: r.get(0)?,
    project_id: r.get(1)?,
    column_id: r.get(2)?,
    title: r.get(3)?,
    notes: r.get(4)?,
    priority: r.get(5)?,
    due: r.get(6)?,
    estimate_min: r.get(7)?,
    labels: serde_json::from_str(&labels).unwrap_or_default(),
    checklist: serde_json::from_str(&checklist).unwrap_or_default(),
    note_path: r.get(10)?,
    ord: r.get(11)?,
    done_at: r.get(12)?,
    created_at: r.get(13)?,
    quadrant: r.get(14)?,
    focus_day: r.get(15)?,
    focus_slot: r.get(16)?,
    spent_min: r.get(17)?,
    sched_start: r.get(18)?,
    sched_min: r.get(19)?,
    milestone: r.get::<_, i64>(20)? == 1,
    gtd_list: r.get(21)?,
    context: r.get(22)?,
    energy: r.get(23)?,
    waiting_for: r.get(24)?,
    waiting_since: r.get(25)?,
    points: r.get(26)?,
    sprint_id: r.get(27)?,
    kr_id: r.get(28)?,
    scope_id: r.get(29)?,
    prio: r.get(30)?,
  })
}

const TASK_COLS: &str = "id, project_id, column_id, title, notes, priority, due, estimate_min, labels, checklist, note_path, ord, done_at, created_at, quadrant, focus_day, focus_slot, spent_min, sched_start, sched_min, milestone, gtd_list, context, energy, waiting_for, waiting_since, points, sprint_id, kr_id, scope_id, prio";

#[derive(Serialize)]
pub struct Board {
  pub columns: Vec<Column>,
  pub tasks: Vec<Task>,
}

pub fn board(c: &Connection, project_id: i64) -> Res<Board> {
  let mut st = c.prepare("SELECT id, name, color, wip, done FROM board_columns WHERE project_id = ?1 ORDER BY ord").map_err(e)?;
  let columns = st
    .query_map([project_id], |r| Ok(Column { id: r.get(0)?, name: r.get(1)?, color: r.get(2)?, wip: r.get(3)?, done: r.get::<_, i64>(4)? == 1 }))
    .map_err(e)?
    .flatten()
    .collect();
  let mut st = c.prepare(&format!("SELECT {TASK_COLS} FROM tasks WHERE project_id = ?1 ORDER BY ord")).map_err(e)?;
  let tasks = st.query_map([project_id], task_row).map_err(e)?.flatten().collect();
  Ok(Board { columns, tasks })
}

/// Grava a lista de colunas na ordem dada: cria as novas (id None), atualiza as existentes e apaga as que
/// sumiram. Tarefas de coluna apagada vão para a primeira coluna que sobrar.
pub fn columns_save(c: &mut Connection, project_id: i64, cols: &[Column]) -> Res<()> {
  if cols.is_empty() {
    return Err("o quadro precisa de pelo menos uma coluna".into());
  }
  if cols.iter().any(|c| c.name.trim().is_empty()) {
    return Err("toda coluna precisa de nome".into());
  }
  let tx = c.transaction().map_err(e)?;
  let mut keep = Vec::new();
  for (i, col) in cols.iter().enumerate() {
    let wip = col.wip.filter(|w| *w > 0);
    let id = match col.id {
      Some(id) => {
        let n = tx
          .execute("UPDATE board_columns SET name = ?1, color = ?2, wip = ?3, done = ?4, ord = ?5 WHERE id = ?6 AND project_id = ?7", params![col.name.trim(), col.color, wip, col.done as i64, (i + 1) as f64, id, project_id])
          .map_err(e)?;
        if n == 0 {
          return Err("coluna de outro projeto".into());
        }
        id
      }
      None => {
        tx.execute("INSERT INTO board_columns (project_id, name, color, wip, done, ord) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![project_id, col.name.trim(), col.color, wip, col.done as i64, (i + 1) as f64]).map_err(e)?;
        tx.last_insert_rowid()
      }
    };
    keep.push(id);
  }
  let first = keep[0];
  let list = keep.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",");
  tx.execute(&format!("UPDATE tasks SET column_id = ?1 WHERE project_id = ?2 AND (column_id IS NULL OR column_id NOT IN ({list}))"), params![first, project_id]).map_err(e)?;
  tx.execute(&format!("DELETE FROM board_columns WHERE project_id = ?1 AND id NOT IN ({list})"), [project_id]).map_err(e)?;
  // done_at acompanha o "concluída" da coluna em que cada tarefa está
  sync_done(&tx, project_id)?;
  tx.commit().map_err(e)
}

fn sync_done(c: &Connection, project_id: i64) -> Res<()> {
  c.execute(
    "UPDATE tasks SET done_at = CASE
        WHEN (SELECT done FROM board_columns b WHERE b.id = tasks.column_id) = 1 THEN COALESCE(done_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ELSE NULL END
     WHERE project_id = ?1",
    [project_id],
  )
  .map(|_| ())
  .map_err(e)
}

fn column_of(c: &Connection, project_id: i64, column_id: Option<i64>) -> Res<i64> {
  if let Some(cid) = column_id {
    let ok: Option<i64> = c.query_row("SELECT id FROM board_columns WHERE id = ?1 AND project_id = ?2", params![cid, project_id], |r| r.get(0)).optional().map_err(e)?;
    if let Some(id) = ok {
      return Ok(id);
    }
  }
  let first = |c: &Connection| c.query_row("SELECT id FROM board_columns WHERE project_id = ?1 ORDER BY ord LIMIT 1", [project_id], |r| r.get::<_, i64>(0)).optional().map_err(e);
  if let Some(id) = first(c)? {
    return Ok(id);
  }
  // projeto sem quadro (veio do seed de primeira abertura ou de versão antiga): ganha as colunas padrão
  let exists: Option<i64> = c.query_row("SELECT id FROM projects WHERE id = ?1", [project_id], |r| r.get(0)).optional().map_err(e)?;
  exists.ok_or("projeto não encontrado")?;
  for (i, (n, color, wip, done)) in DEFAULT_COLUMNS.iter().enumerate() {
    c.execute("INSERT INTO board_columns (project_id, name, ord, color, wip, done) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![project_id, n, (i + 1) as f64, color, wip, *done as i64]).map_err(e)?;
  }
  first(c)?.ok_or_else(|| "projeto sem colunas".to_string())
}

/// Cria ou atualiza uma tarefa. Nova tarefa entra no fim da coluna.
pub fn task_save(c: &mut Connection, t: &Task) -> Res<i64> {
  let title = t.title.trim();
  if title.is_empty() {
    return Err("dê um título à tarefa".into());
  }
  if let Some(d) = &t.due {
    if !(d.len() == 10 && d.as_bytes()[4] == b'-' && d.as_bytes()[7] == b'-') {
      return Err("prazo no formato AAAA-MM-DD".into());
    }
  }
  if t.quadrant.is_some_and(|q| !(1..=4).contains(&q)) {
    return Err("quadrante inválido".into());
  }
  if t.focus_day.as_deref().is_some_and(|d| !valid_day(d)) || t.focus_slot.is_some_and(|s| !(0..20).contains(&s)) {
    return Err("lugar no foco inválido".into());
  }
  if t.gtd_list.as_deref().is_some_and(|l| !GTD_LISTS.contains(&l)) {
    return Err("lista do GTD desconhecida".into());
  }
  if t.energy.is_some_and(|x| !(1..=3).contains(&x)) || t.waiting_since.as_deref().is_some_and(|d| !valid_day(d)) {
    return Err("energia ou data de espera inválida".into());
  }
  if t.points.is_some_and(|x| !(0..=100).contains(&x)) {
    return Err("pontos entre 0 e 100".into());
  }
  let prio = t.prio.as_deref().filter(|p| !p.trim().is_empty());
  if prio.is_some_and(|p| serde_json::from_str::<Value>(p).map(|v| !v.is_object()).unwrap_or(true)) {
    return Err("priorização inválida".into());
  }
  let ctx = t.context.as_deref().map(str::trim).filter(|x| !x.is_empty()).map(|x| x.trim_start_matches('@').to_lowercase());
  let wfor = t.waiting_for.as_deref().map(str::trim).filter(|x| !x.is_empty());
  // dia e lugar andam juntos; um lugar do foco guarda uma tarefa só: quem estava ali sai
  let (fday, fslot) = match (&t.focus_day, t.focus_slot) {
    (Some(d), Some(s)) => (Some(d.clone()), Some(s)),
    _ => (None, None),
  };
  if let (Some(d), Some(sl)) = (&fday, fslot) {
    c.execute("UPDATE tasks SET focus_day = NULL, focus_slot = NULL WHERE project_id = ?1 AND focus_day = ?2 AND focus_slot = ?3 AND id IS NOT ?4", params![t.project_id, d, sl, t.id])
      .map_err(e)?;
  }
  let col = column_of(c, t.project_id, t.column_id)?;
  let labels = serde_json::to_string(&t.labels.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>()).map_err(e)?;
  let checklist = serde_json::to_string(&t.checklist).map_err(e)?;
  let pri = t.priority.clamp(0, 4);
  let id = match t.id {
    Some(id) => {
      c.execute(
        "UPDATE tasks SET column_id = ?1, title = ?2, notes = ?3, priority = ?4, due = ?5, estimate_min = ?6, labels = ?7, checklist = ?8,
                note_path = ?9, quadrant = ?12, focus_day = ?13, focus_slot = ?14, milestone = ?15, gtd_list = ?16, context = ?17, energy = ?18, waiting_for = ?19, waiting_since = ?20, points = ?21, sprint_id = ?22, kr_id = ?23, scope_id = ?24, prio = ?25, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10 AND project_id = ?11",
        params![col, title, t.notes, pri, t.due, t.estimate_min, labels, checklist, t.note_path, id, t.project_id, t.quadrant, fday, fslot, t.milestone as i64, t.gtd_list, ctx, t.energy, wfor, t.waiting_since, t.points, t.sprint_id, t.kr_id, t.scope_id, prio],
      )
      .map_err(e)?;
      id
    }
    None => {
      let ord: f64 = c.query_row("SELECT COALESCE(MAX(ord), 0) + 1 FROM tasks WHERE column_id = ?1", [col], |r| r.get(0)).map_err(e)?;
      c.execute(
        "INSERT INTO tasks (project_id, column_id, title, notes, priority, due, estimate_min, labels, checklist, note_path, ord, quadrant, focus_day, focus_slot, milestone, gtd_list, context, energy, waiting_for, waiting_since, points, sprint_id, kr_id, scope_id, prio)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)",
        params![t.project_id, col, title, t.notes, pri, t.due, t.estimate_min, labels, checklist, t.note_path, ord, t.quadrant, fday, fslot, t.milestone as i64, t.gtd_list, ctx, t.energy, wfor, t.waiting_since, t.points, t.sprint_id, t.kr_id, t.scope_id, prio],
      )
      .map_err(e)?;
      c.last_insert_rowid()
    }
  };
  sync_done(c, t.project_id)?;
  Ok(id)
}

/// Move a tarefa para a coluna e a posição dadas (ord calculado no front entre os vizinhos).
pub fn task_move(c: &Connection, id: i64, column_id: i64, ord: f64) -> Res<()> {
  let pid: i64 = c.query_row("SELECT project_id FROM tasks WHERE id = ?1", [id], |r| r.get(0)).map_err(|_| "tarefa não encontrada".to_string())?;
  let col = column_of(c, pid, Some(column_id))?;
  if col != column_id {
    return Err("coluna de outro projeto".into());
  }
  c.execute("UPDATE tasks SET column_id = ?1, ord = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?3", params![column_id, ord, id]).map_err(e)?;
  sync_done(c, pid)
}

pub fn task_delete(c: &Connection, id: i64) -> Res<()> {
  c.execute("DELETE FROM tasks WHERE id = ?1", [id]).map(|_| ()).map_err(e)
}

/// Tarefas abertas com prazo, de todos os projetos não arquivados (para o Início e o calendário).
pub fn open_tasks(c: &Connection, limit: i64) -> Res<Vec<(Task, String, String)>> {
  let mut st = c
    .prepare(&format!(
      "SELECT {cols}, p.name, COALESCE(b.name, '') FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN board_columns b ON b.id = t.column_id
       WHERE COALESCE(b.done, 0) = 0 AND p.archived_at IS NULL
       ORDER BY t.due IS NULL, t.due, t.priority DESC LIMIT ?1",
      cols = TASK_COLS.split(", ").map(|c| format!("t.{c}")).collect::<Vec<_>>().join(", ")
    ))
    .map_err(e)?;
  let rows = st.query_map([limit], |r| Ok((task_row(r)?, r.get::<_, String>(31)?, r.get::<_, String>(32)?))).map_err(e)?;
  Ok(rows.flatten().collect())
}

// ---------- Calendário (fase 4C) ----------

fn valid_start(s: &str) -> bool {
  s.len() == 16 && valid_day(&s[..10]) && s.as_bytes()[10] == b'T' && s.as_bytes()[13] == b':' && s[11..13].parse::<u8>().is_ok_and(|h| h < 24) && s[14..16].parse::<u8>().is_ok_and(|m| m < 60)
}

/// Põe a tarefa num horário da agenda (time blocking) ou tira (start None).
pub fn task_schedule(c: &Connection, id: i64, start: Option<&str>, minutes: Option<i64>) -> Res<()> {
  match start {
    Some(s) => {
      if !valid_start(s) {
        return Err("horário no formato AAAA-MM-DDTHH:MM".into());
      }
      let m = minutes.unwrap_or(60);
      if !(5..=720).contains(&m) {
        return Err("duração entre 5 minutos e 12 horas".into());
      }
      c.execute("UPDATE tasks SET sched_start = ?1, sched_min = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?3", params![s, m, id]).map_err(e)?
    }
    None => c.execute("UPDATE tasks SET sched_start = NULL, sched_min = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1", [id]).map_err(e)?,
  };
  Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalTask {
  pub task: Task,
  pub project: String,
  pub column: String,
  pub column_color: Option<String>,
  pub done: bool,
}

fn cal_rows(c: &Connection, filter: &str, args: &[&dyn rusqlite::ToSql]) -> Res<Vec<CalTask>> {
  let cols = TASK_COLS.split(", ").map(|c| format!("t.{c}")).collect::<Vec<_>>().join(", ");
  let mut st = c
    .prepare(&format!(
      "SELECT {cols}, p.name, COALESCE(b.name, ''), b.color, COALESCE(b.done, 0)
       FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN board_columns b ON b.id = t.column_id
       WHERE p.archived_at IS NULL AND ({filter})"
    ))
    .map_err(e)?;
  let rows = st
    .query_map(args, |r| Ok(CalTask { task: task_row(r)?, project: r.get(31)?, column: r.get(32)?, column_color: r.get(33)?, done: r.get::<_, i64>(34)? == 1 }))
    .map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Tarefas com prazo ou bloco de horário entre `from` e `to` (inclusive), de todos os projetos ativos.
pub fn calendar(c: &Connection, from: &str, to: &str) -> Res<Vec<CalTask>> {
  if !valid_day(from) || !valid_day(to) {
    return Err("datas no formato AAAA-MM-DD".into());
  }
  cal_rows(c, "(t.due BETWEEN ?1 AND ?2) OR (substr(t.sched_start, 1, 10) BETWEEN ?1 AND ?2)", &[&from, &to])
}

/// Tarefas abertas ainda sem horário na agenda, as de prazo mais perto primeiro.
pub fn unscheduled(c: &Connection, limit: i64) -> Res<Vec<CalTask>> {
  let mut v = cal_rows(c, "t.sched_start IS NULL AND COALESCE(b.done, 0) = 0", &[])?;
  v.sort_by(|a, b| (a.task.due.is_none(), &a.task.due, -a.task.priority).cmp(&(b.task.due.is_none(), &b.task.due, -b.task.priority)));
  v.truncate(limit.max(0) as usize);
  Ok(v)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::db;

  fn setup() -> Connection {
    let dir = std::env::temp_dir().join(format!("tesseract-tasks-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("t.db")).unwrap();
    db::migrate(&mut c).unwrap();
    c
  }

  fn task(pid: i64, title: &str) -> Task {
    Task { id: None, project_id: pid, column_id: None, title: title.into(), notes: String::new(), priority: 2, due: None, estimate_min: None, labels: vec![], checklist: vec![], note_path: None, ord: 0.0, done_at: None, created_at: None, quadrant: None, focus_day: None, focus_slot: None, spent_min: 0, sched_start: None, sched_min: None, milestone: false, gtd_list: None, context: None, energy: None, waiting_for: None, waiting_since: None, points: None, sprint_id: None, kr_id: None, scope_id: None, prio: None }
  }

  #[test]
  fn projeto_novo_tem_quadro_padrao_e_concluir_marca_done_at() {
    let mut c = setup();
    let pid = project_save(&mut c, None, "personal", "Site novo", "", None).unwrap();
    let b = board(&c, pid).unwrap();
    assert_eq!(b.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), vec!["A fazer", "Fazendo", "Feito"]);
    assert_eq!(b.columns[1].wip, Some(3));

    let tid = task_save(&mut c, &task(pid, "Escrever copy")).unwrap();
    let b = board(&c, pid).unwrap();
    assert_eq!(b.tasks[0].column_id, b.columns[0].id, "tarefa nova entra na primeira coluna");
    assert!(b.tasks[0].done_at.is_none());

    task_move(&c, tid, b.columns[2].id.unwrap(), 1.0).unwrap();
    assert!(board(&c, pid).unwrap().tasks[0].done_at.is_some(), "coluna done marca done_at");
    let p = projects(&c).unwrap();
    assert_eq!((p[0].open, p[0].done), (0, 1));
  }

  #[test]
  fn projeto_sem_quadro_ganha_colunas_ao_receber_tarefa() {
    // projetos do seed de primeira abertura nasciam sem colunas e a captura rápida falhava com "projeto sem colunas"
    let mut c = setup();
    c.execute("INSERT INTO projects (scope, name) VALUES ('personal', 'Do seed')", []).unwrap();
    let pid = c.last_insert_rowid();
    task_save(&mut c, &task(pid, "comprar papel")).unwrap();
    let b = board(&c, pid).unwrap();
    assert_eq!(b.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), vec!["A fazer", "Fazendo", "Feito"]);
    assert_eq!(b.tasks[0].column_id, b.columns[0].id);
    assert!(task_save(&mut c, &task(9999, "x")).is_err(), "projeto que não existe continua dando erro");
  }

  #[test]
  fn apagar_coluna_leva_tarefas_para_a_primeira() {
    let mut c = setup();
    let pid = project_save(&mut c, None, "personal", "X", "", None).unwrap();
    let b = board(&c, pid).unwrap();
    let mut t = task(pid, "t");
    t.column_id = b.columns[1].id;
    task_save(&mut c, &t).unwrap();
    // fica só "A fazer" renomeada e uma coluna nova "Revisão"
    let mut cols = vec![b.columns[0].clone()];
    cols[0].name = "Backlog".into();
    cols.push(Column { id: None, name: "Revisão".into(), color: Some("#2238C4".into()), wip: Some(2), done: false });
    columns_save(&mut c, pid, &cols).unwrap();
    let b2 = board(&c, pid).unwrap();
    assert_eq!(b2.columns.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), vec!["Backlog", "Revisão"]);
    assert_eq!(b2.tasks[0].column_id, b2.columns[0].id);
    assert!(columns_save(&mut c, pid, &[]).is_err());
  }

  #[test]
  fn valida_entrada() {
    let mut c = setup();
    assert!(project_save(&mut c, None, "org:../x", "X", "", None).is_err());
    let pid = project_save(&mut c, None, "org:nimbus", "X", "", None).unwrap();
    let mut t = task(pid, "  ");
    assert!(task_save(&mut c, &t).is_err());
    t.title = "ok".into();
    t.due = Some("31/10/2026".into());
    assert!(task_save(&mut c, &t).is_err());
    t.due = Some("2026-10-31".into());
    t.priority = 9;
    let id = task_save(&mut c, &t).unwrap();
    assert_eq!(board(&c, pid).unwrap().tasks.iter().find(|x| x.id == Some(id)).unwrap().priority, 4);
  }

  #[test]
  fn modelo_da_galeria_cria_colunas_e_metodos() {
    let mut c = setup();
    let m = MethodSetup {
      methods: vec!["foco".into(), "inexistente".into(), "foco".into()],
      preset: Some("freelancer".into()),
      focus_rule: Some("135".into()),
      review_day: Some(5),
      columns: vec![
        Column { id: None, name: "A fazer".into(), color: None, wip: None, done: false },
        Column { id: None, name: "Aguardando cliente".into(), color: None, wip: Some(0), done: false },
        Column { id: None, name: "Feito".into(), color: None, wip: None, done: true },
      ],
    };
    let pid = project_save(&mut c, None, "personal", "Cliente A", "", Some(&m)).unwrap();
    let p = projects(&c).unwrap().into_iter().find(|p| p.id == pid).unwrap();
    assert_eq!(p.methods, vec!["kanban", "foco"], "kanban sempre ligado; desconhecido e repetido saem");
    assert_eq!((p.preset.as_deref(), p.focus_rule.as_str(), p.review_day), (Some("freelancer"), "135", Some(5)));
    let b = board(&c, pid).unwrap();
    assert_eq!(b.columns.len(), 3);
    assert_eq!(b.columns[1].wip, None, "limite 0 vira sem limite");

    let mut bad = m.clone();
    bad.focus_rule = Some("x".into());
    assert!(project_methods(&c, pid, &bad).is_err());
    bad.focus_rule = None;
    bad.review_day = Some(7);
    assert!(project_methods(&c, pid, &bad).is_err());
    bad.review_day = None;
    bad.methods = vec!["eisenhower".into()];
    project_methods(&c, pid, &bad).unwrap();
    let p = projects(&c).unwrap().into_iter().find(|p| p.id == pid).unwrap();
    assert_eq!((p.methods, p.focus_rule.as_str(), p.review_day), (vec!["kanban".to_string(), "eisenhower".to_string()], "135", None));
    assert!(project_review_done(&c, pid, "ontem").is_err());
    project_review_done(&c, pid, "2026-11-07").unwrap();
  }

  #[test]
  fn foco_um_por_lugar_quadrante_e_tempo() {
    let mut c = setup();
    let pid = project_save(&mut c, None, "personal", "X", "", None).unwrap();
    let mut a = task(pid, "a");
    a.focus_day = Some("2026-11-01".into());
    a.focus_slot = Some(0);
    a.quadrant = Some(1);
    let ida = task_save(&mut c, &a).unwrap();
    let mut b = task(pid, "b");
    b.focus_day = Some("2026-11-01".into());
    b.focus_slot = Some(0);
    let idb = task_save(&mut c, &b).unwrap();
    let bd = board(&c, pid).unwrap();
    let ta = bd.tasks.iter().find(|t| t.id == Some(ida)).unwrap();
    let tb = bd.tasks.iter().find(|t| t.id == Some(idb)).unwrap();
    assert_eq!((ta.focus_slot, ta.quadrant), (None, Some(1)), "quem estava no lugar sai");
    assert_eq!(tb.focus_slot, Some(0));
    b.quadrant = Some(5);
    assert!(task_save(&mut c, &b).is_err());
    assert_eq!(task_log_time(&c, idb, 25).unwrap(), 25);
    assert_eq!(task_log_time(&c, idb, 5).unwrap(), 30);
    assert!(task_log_time(&c, idb, 0).is_err());
    // salvar a tarefa não mexe no tempo registrado
    let mut tb = board(&c, pid).unwrap().tasks.into_iter().find(|t| t.id == Some(idb)).unwrap();
    tb.spent_min = 0;
    task_save(&mut c, &tb).unwrap();
    assert_eq!(board(&c, pid).unwrap().tasks.iter().find(|t| t.id == Some(idb)).unwrap().spent_min, 30);
  }

  #[test]
  fn agenda_prazos_e_blocos() {
    let mut c = setup();
    let pid = project_save(&mut c, None, "personal", "Site", "", None).unwrap();
    let mut a = task(pid, "com prazo");
    a.due = Some("2026-11-04".into());
    a.milestone = true;
    let ida = task_save(&mut c, &a).unwrap();
    let idb = task_save(&mut c, &task(pid, "sem prazo")).unwrap();
    let idc = task_save(&mut c, &task(pid, "fora da semana")).unwrap();
    task_schedule(&c, idc, Some("2026-12-01T09:00"), Some(30)).unwrap();

    // sem horário: as duas sem bloco, a de prazo primeiro
    let u = unscheduled(&c, 10).unwrap();
    assert_eq!(u.iter().map(|x| x.task.id.unwrap()).collect::<Vec<_>>(), vec![ida, idb]);

    task_schedule(&c, idb, Some("2026-11-03T14:30"), Some(90)).unwrap();
    let w = calendar(&c, "2026-11-01", "2026-11-07").unwrap();
    let ids: Vec<i64> = w.iter().map(|x| x.task.id.unwrap()).collect();
    assert!(ids.contains(&ida) && ids.contains(&idb) && !ids.contains(&idc), "prazo e bloco da semana entram; o de dezembro não");
    let b = w.iter().find(|x| x.task.id == Some(idb)).unwrap();
    assert_eq!((b.task.sched_start.as_deref(), b.task.sched_min, b.project.as_str()), (Some("2026-11-03T14:30"), Some(90), "Site"));
    assert!(w.iter().find(|x| x.task.id == Some(ida)).unwrap().task.milestone);

    assert!(task_schedule(&c, idb, Some("2026-11-03 14:30"), None).is_err());
    assert!(task_schedule(&c, idb, Some("2026-11-03T25:00"), None).is_err());
    assert!(task_schedule(&c, idb, Some("2026-11-03T10:00"), Some(0)).is_err());
    assert!(calendar(&c, "ontem", "2026-11-07").is_err());
    task_schedule(&c, idb, None, None).unwrap();
    assert_eq!(unscheduled(&c, 10).unwrap().len(), 2);
  }

  #[test]
  fn gtd_listas_contexto_e_espera() {
    let mut c = setup();
    let pid = project_save(&mut c, None, "personal", "Vida", "", None).unwrap();
    let mut a = task(pid, "Ver nota com o contador");
    a.gtd_list = Some("inbox".into());
    let id = task_save(&mut c, &a).unwrap();
    let mut t = board(&c, pid).unwrap().tasks.into_iter().find(|x| x.id == Some(id)).unwrap();
    t.gtd_list = Some("next".into());
    t.context = Some(" @Computador ".into());
    t.energy = Some(2);
    task_save(&mut c, &t).unwrap();
    let t2 = board(&c, pid).unwrap().tasks.into_iter().find(|x| x.id == Some(id)).unwrap();
    assert_eq!((t2.gtd_list.as_deref(), t2.context.as_deref(), t2.energy), (Some("next"), Some("computador"), Some(2)));

    let mut w = t2.clone();
    w.gtd_list = Some("waiting".into());
    w.waiting_for = Some("Carlos".into());
    w.waiting_since = Some("2026-11-01".into());
    task_save(&mut c, &w).unwrap();
    let w2 = board(&c, pid).unwrap().tasks.into_iter().find(|x| x.id == Some(id)).unwrap();
    assert_eq!((w2.waiting_for.as_deref(), w2.waiting_since.as_deref()), (Some("Carlos"), Some("2026-11-01")));

    let mut bad = w2.clone();
    bad.gtd_list = Some("lixo".into());
    assert!(task_save(&mut c, &bad).is_err());
    bad.gtd_list = None;
    bad.energy = Some(4);
    assert!(task_save(&mut c, &bad).is_err());
  }
}
