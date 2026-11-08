// Fase 8.5 ("Ganhos rápidos"): exportar tudo, agenda .ics, LGPD no contato (exportar e anonimizar),
// preferências de notificação e da IA externa (a trava que as aplica é do Pro: pro/rust/externa.rs).
use crate::{db, lock, AppDb};
use rusqlite::{types::ValueRef, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

// ---------- Exportar tudo ----------

/// Tabelas que não vão no arquivo: o índice do cérebro (dá para refazer a partir das notas) e as internas do SQLite.
fn skip(table: &str) -> bool {
  table.starts_with("sqlite_") || table.starts_with("chunks") || table.starts_with("chunk_") || table.contains("_fts")
}
fn cell(v: ValueRef) -> Value {
  match v {
    ValueRef::Null => Value::Null,
    ValueRef::Integer(i) => json!(i),
    ValueRef::Real(f) => json!(f),
    ValueRef::Text(t) => {
      let s = String::from_utf8_lossy(t).to_string();
      // colunas que guardam JSON voltam como JSON (itens, parcelas, configurações)
      match s.trim_start().chars().next() {
        Some('{') | Some('[') => serde_json::from_str(&s).unwrap_or(Value::String(s)),
        _ => Value::String(s),
      }
    }
    ValueRef::Blob(_) => Value::Null,
  }
}
fn table_rows(c: &Connection, table: &str) -> Res<(Vec<String>, Vec<Map<String, Value>>)> {
  let mut st = c.prepare(&format!("SELECT * FROM \"{}\"", table.replace('"', ""))).map_err(e)?;
  let cols: Vec<String> = st.column_names().map(|s| s.to_string()).collect();
  let mut rows = st.query([]).map_err(e)?;
  let mut out = vec![];
  while let Some(r) = rows.next().map_err(e)? {
    let mut m = Map::new();
    for (i, col) in cols.iter().enumerate() {
      m.insert(col.clone(), cell(r.get_ref(i).map_err(e)?));
    }
    out.push(m);
  }
  Ok((cols, out))
}
fn csv_cell(v: &Value) -> String {
  let s = match v {
    Value::Null => String::new(),
    Value::String(s) => s.clone(),
    other => other.to_string(),
  };
  if s.contains([',', ';', '"', '\n', '\r']) {
    format!("\"{}\"", s.replace('"', "\"\""))
  } else {
    s
  }
}
fn safe_name(s: &str) -> String {
  let n: String = s.chars().map(|ch| if ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' { ch } else { '-' }).collect();
  let n = n.trim().chars().take(80).collect::<String>();
  if n.is_empty() {
    "sem-nome".into()
  } else {
    n
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
  pub folder: String,
  pub tables: usize,
  pub rows: usize,
  pub projects: usize,
}

/// Cria `<pasta>/tesseract-exportacao-AAAA-MM-DD/` com tesseract.json (tudo), csv/ (uma planilha por tabela,
/// separada por vírgula, UTF-8 com BOM para o Excel abrir com acento) e markdown/ (um arquivo por projeto).
pub fn export_all(c: &Connection, dir: &Path, day: &str) -> Res<ExportReport> {
  if !dir.is_dir() {
    return Err("escolha uma pasta que exista".into());
  }
  let root = dir.join(format!("tesseract-exportacao-{day}"));
  let root = (0..100).map(|i| if i == 0 { root.clone() } else { PathBuf::from(format!("{}-{i}", root.display())) }).find(|p| !p.exists()).ok_or("pasta de exportação já existe")?;
  fs::create_dir_all(root.join("csv")).map_err(e)?;
  fs::create_dir_all(root.join("markdown")).map_err(e)?;
  let mut st = c.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map_err(e)?;
  let tables: Vec<String> = st.query_map([], |r| r.get::<_, String>(0)).map_err(e)?.flatten().filter(|t| !skip(t)).collect();
  let mut all = Map::new();
  let mut total = 0;
  for t in &tables {
    let (cols, rows) = table_rows(c, t)?;
    total += rows.len();
    let mut csv = String::from("\u{feff}");
    csv.push_str(&cols.iter().map(|c| csv_cell(&json!(c))).collect::<Vec<_>>().join(","));
    csv.push_str("\r\n");
    for r in &rows {
      csv.push_str(&cols.iter().map(|col| csv_cell(r.get(col).unwrap_or(&Value::Null))).collect::<Vec<_>>().join(","));
      csv.push_str("\r\n");
    }
    fs::write(root.join("csv").join(format!("{t}.csv")), csv).map_err(e)?;
    all.insert(t.clone(), Value::Array(rows.into_iter().map(Value::Object).collect()));
  }
  let version: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
  let doc = json!({ "app": "Tesseract", "exportedAt": day, "schemaVersion": version, "tables": all });
  fs::write(root.join("tesseract.json"), serde_json::to_string_pretty(&doc).map_err(e)?).map_err(e)?;

  // um Markdown por projeto, com as tarefas por coluna
  let mut projects = 0;
  let mut ps = c.prepare("SELECT id, name, scope FROM projects ORDER BY id").map_err(e)?;
  let list: Vec<(i64, String, String)> = ps.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(e)?.flatten().collect();
  for (pid, name, scope) in list {
    let mut md = format!("# {name}\n\nEscopo: {scope}\n");
    let mut cs = c.prepare("SELECT id, name FROM board_columns WHERE project_id = ?1 ORDER BY ord").map_err(e)?;
    let cols: Vec<(i64, String)> = cs.query_map([pid], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
    for (cid, cname) in &cols {
      md.push_str(&format!("\n## {cname}\n\n"));
      let mut ts = c.prepare("SELECT title, due, notes FROM tasks WHERE project_id = ?1 AND column_id = ?2 ORDER BY ord, id").map_err(e)?;
      let tasks: Vec<(String, Option<String>, Option<String>)> = ts.query_map(rusqlite::params![pid, cid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(e)?.flatten().collect();
      if tasks.is_empty() {
        md.push_str("_vazia_\n");
      }
      for (title, due, notes) in tasks {
        md.push_str(&format!("- {title}{}\n", due.map(|d| format!(" (prazo {d})")).unwrap_or_default()));
        if let Some(n) = notes.filter(|n| !n.trim().is_empty()) {
          for line in n.lines() {
            md.push_str(&format!("  > {line}\n"));
          }
        }
      }
    }
    fs::write(root.join("markdown").join(format!("{}.md", safe_name(&name))), md).map_err(e)?;
    projects += 1;
  }
  fs::write(
    root.join("LEIA-ME.txt"),
    "Exportação do Tesseract.\r\n\r\ntesseract.json: todos os dados, tabela por tabela.\r\ncsv/: uma planilha por tabela (abre no Excel ou no Google Planilhas).\r\nmarkdown/: um arquivo por projeto, com as tarefas por coluna.\r\n\r\nNão vão aqui: o índice de busca do Conhecimento (é refeito a partir das suas notas) e as chaves de IA (ficam no Cofre do Windows).\r\nAs suas notas da base de conhecimento já são arquivos Markdown na pasta delas.\r\n",
  )
  .map_err(e)?;
  Ok(ExportReport { folder: root.display().to_string(), tables: tables.len(), rows: total, projects })
}

// ---------- Agenda .ics ----------

fn ics_text(s: &str) -> String {
  s.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n")
}
/// Linhas de até 75 caracteres, como pede o formato (as seguintes começam com espaço).
fn fold(line: &str) -> String {
  let mut out = String::new();
  let mut n = 0;
  for ch in line.chars() {
    if n >= 73 {
      out.push_str("\r\n ");
      n = 0;
    }
    out.push(ch);
    n += 1;
  }
  out
}
fn ics_day(d: &str) -> String {
  d.chars().filter(|c| c.is_ascii_digit()).take(8).collect()
}
fn ics_when(dt: &str) -> String {
  // AAAA-MM-DDTHH:MM → AAAAMMDDTHHMM00 (hora local, sem fuso: o calendário usa o fuso do aparelho)
  let digits: String = dt.chars().filter(|c| c.is_ascii_digit()).collect();
  format!("{}T{}00", &digits[..8], &digits[8..12.min(digits.len())])
}
fn plus_minutes(dt: &str, min: i64) -> String {
  let (h, m) = (dt[11..13].parse::<i64>().unwrap_or(0), dt[14..16].parse::<i64>().unwrap_or(0));
  let t = (h * 60 + m + min).min(23 * 60 + 59);
  format!("{}T{:02}:{:02}", &dt[..10], t / 60, t % 60)
}
fn next_day(d: &str) -> String {
  let (y, m, day) = (d[0..4].parse::<i32>().unwrap_or(2000), d[5..7].parse::<u32>().unwrap_or(1), d[8..10].parse::<u32>().unwrap_or(1));
  let days = match m {
    2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
    2 => 28,
    4 | 6 | 9 | 11 => 30,
    _ => 31,
  };
  let (y, m, day) = if day < days { (y, m, day + 1) } else if m < 12 { (y, m + 1, 1) } else { (y + 1, 1, 1) };
  format!("{y:04}{m:02}{day:02}")
}

/// Calendário com blocos de horário, prazos de tarefas abertas, follow-ups do CRM e contas a pagar e receber.
pub fn ics(c: &Connection, stamp: &str) -> Res<String> {
  let mut ev: Vec<String> = vec![];
  let mut add = |uid: String, summary: String, start: String, end: String, all_day: bool, desc: String| {
    let mut v = vec!["BEGIN:VEVENT".to_string(), format!("UID:{uid}@tesseract.local"), format!("DTSTAMP:{stamp}")];
    if all_day {
      v.push(format!("DTSTART;VALUE=DATE:{start}"));
      v.push(format!("DTEND;VALUE=DATE:{end}"));
    } else {
      v.push(format!("DTSTART:{start}"));
      v.push(format!("DTEND:{end}"));
    }
    v.push(format!("SUMMARY:{}", ics_text(&summary)));
    if !desc.is_empty() {
      v.push(format!("DESCRIPTION:{}", ics_text(&desc)));
    }
    v.push("END:VEVENT".into());
    ev.push(v.into_iter().map(|l| fold(&l)).collect::<Vec<_>>().join("\r\n"));
  };
  // tarefas abertas: bloco marcado (com hora) ou prazo (dia inteiro)
  let mut st = c
    .prepare(
      "SELECT t.id, t.title, t.due, t.sched_start, t.sched_min, p.name FROM tasks t JOIN projects p ON p.id = t.project_id
       LEFT JOIN board_columns bc ON bc.id = t.column_id
       WHERE p.archived_at IS NULL AND COALESCE(bc.done, 0) = 0 AND (t.due IS NOT NULL OR t.sched_start IS NOT NULL)",
    )
    .map_err(e)?;
  let rows: Vec<(i64, String, Option<String>, Option<String>, Option<i64>, String)> =
    st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))).map_err(e)?.flatten().collect();
  for (id, title, due, start, min, project) in rows {
    if let Some(s) = start.filter(|s| s.len() >= 16) {
      add(format!("bloco-{id}"), title.clone(), ics_when(&s), ics_when(&plus_minutes(&s, min.unwrap_or(30))), false, format!("Projeto: {project}"));
    }
    if let Some(d) = due.filter(|d| d.len() == 10) {
      add(format!("prazo-{id}"), format!("Prazo: {title}"), ics_day(&d), next_day(&d), true, format!("Projeto: {project}"));
    }
  }
  // follow-ups do CRM (oportunidades abertas)
  if let Ok(mut st) = c.prepare(
    "SELECT o.id, co.name, o.title, o.follow_up_at, o.follow_up FROM opportunities o JOIN companies co ON co.id = o.company_id
     WHERE o.follow_up_at IS NOT NULL AND o.stage NOT IN ('ganho', 'perdido')",
  ) {
    let rows: Vec<(i64, String, String, String, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).map_err(e)?.flatten().collect();
    for (id, company, title, at, what) in rows {
      let summary = format!("Follow-up: {company}");
      let desc = if what.trim().is_empty() { title } else { format!("{what} ({title})") };
      if at.len() >= 16 {
        add(format!("followup-{id}"), summary, ics_when(&at), ics_when(&plus_minutes(&at, 15)), false, desc);
      } else {
        add(format!("followup-{id}"), summary, ics_day(&at), next_day(&at), true, desc);
      }
    }
  }
  // contas a pagar e a receber ainda abertas
  let mut st = c.prepare("SELECT id, kind, description, amount, due FROM transactions WHERE paid_at IS NULL").map_err(e)?;
  let rows: Vec<(i64, String, String, i64, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))).map_err(e)?.flatten().collect();
  for (id, kind, desc, amount, due) in rows {
    let what = if kind == "in" { "A receber" } else { "A pagar" };
    add(format!("conta-{id}"), format!("{what}: {desc} ({})", brl(amount)), ics_day(&due), next_day(&due), true, String::new());
  }
  Ok(format!(
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tesseract//Agenda//PT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Tesseract\r\n{}{}END:VCALENDAR\r\n",
    ev.join("\r\n"),
    if ev.is_empty() { "" } else { "\r\n" }
  ))
}

/// R$ 1.500,50
fn brl(cents: i64) -> String {
  let int = (cents.abs() / 100).to_string();
  let mut grouped = String::new();
  for (i, ch) in int.chars().enumerate() {
    if i > 0 && (int.len() - i) % 3 == 0 {
      grouped.push('.');
    }
    grouped.push(ch);
  }
  format!("{}R$ {grouped},{:02}", if cents < 0 { "-" } else { "" }, cents.abs() % 100)
}

// ---------- LGPD no contato ----------

/// Tudo o que o app guarda sobre uma empresa do CRM: ficha, contatos, oportunidades, histórico e documentos.
pub fn company_data(c: &Connection, id: i64) -> Res<Value> {
  let one = |sql: &str| -> Res<Vec<Map<String, Value>>> {
    let mut st = c.prepare(sql).map_err(e)?;
    let cols: Vec<String> = st.column_names().map(|s| s.to_string()).collect();
    let mut rows = st.query([id]).map_err(e)?;
    let mut out = vec![];
    while let Some(r) = rows.next().map_err(e)? {
      let mut m = Map::new();
      for (i, col) in cols.iter().enumerate() {
        m.insert(col.clone(), cell(r.get_ref(i).map_err(e)?));
      }
      out.push(m);
    }
    Ok(out)
  };
  let company = one("SELECT * FROM companies WHERE id = ?1")?;
  if company.is_empty() {
    return Err("empresa não encontrada".into());
  }
  Ok(json!({
    "empresa": company[0],
    "contatos": one("SELECT * FROM contacts WHERE company_id = ?1")?,
    "oportunidades": one("SELECT * FROM opportunities WHERE company_id = ?1")?,
    "historico": one("SELECT * FROM interactions WHERE company_id = ?1 ORDER BY at")?,
    "documentos": one("SELECT id, kind, number, title, status, client_name, issued_at FROM documents WHERE company_id = ?1").unwrap_or_default(),
  }))
}

/// Anonimiza: tira nome, telefone, e-mail, redes, anotações e o texto do histórico, e marca a origem.
/// Valores, datas e estágios ficam (o relatório continua certo). Documentos emitidos guardam o nome do cliente,
/// porque são registro do que foi combinado e pago (obrigação legal); o vínculo com o CRM é desfeito.
pub fn anonymize(c: &mut Connection, id: i64) -> Res<()> {
  let tx = c.transaction().map_err(e)?;
  let n = tx
    .execute(
      "UPDATE companies SET name = 'Anonimizado ' || id, segment = '', city = '', site = '', instagram = '', phone = '', notes = '', legal_basis = 'Anonimizado a pedido', note_path = NULL WHERE id = ?1",
      [id],
    )
    .map_err(e)?;
  if n == 0 {
    return Err("empresa não encontrada".into());
  }
  tx.execute("UPDATE contacts SET name = 'Contato anonimizado', role = '', phone = '', email = '', notes = '' WHERE company_id = ?1", [id]).map_err(e)?;
  tx.execute("UPDATE interactions SET text = '[removido a pedido do titular]' WHERE company_id = ?1 AND kind <> 'estagio'", [id]).map_err(e)?;
  tx.execute("UPDATE opportunities SET follow_up = '', note_path = NULL WHERE company_id = ?1", [id]).map_err(e)?;
  let _ = tx.execute("UPDATE documents SET company_id = NULL, contact_id = NULL WHERE company_id = ?1", [id]);
  tx.commit().map_err(e)?;
  Ok(())
}

// ---------- Preferências ----------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
  /// notificações do Windows
  pub notify: bool,
  pub notify_followups: bool,
  pub notify_tasks: bool,
  pub notify_blocks: bool,
  pub notify_money: bool,
  /// IA externa: limite de chamadas por mês (None = sem limite) e endereços permitidos (vazio = qualquer HTTPS)
  pub ai_monthly_limit: Option<i64>,
  pub ai_allow_hosts: Vec<String>,
  /// captura rápida: projeto da caixa de entrada (None = o primeiro projeto com GTD, senão o primeiro aberto)
  pub capture_project: Option<i64>,
}
impl Default for Prefs {
  fn default() -> Self {
    Prefs { notify: true, notify_followups: true, notify_tasks: true, notify_blocks: true, notify_money: true, ai_monthly_limit: None, ai_allow_hosts: vec![], capture_project: None }
  }
}
const PREFS_KEY: &str = "extras.prefs";

pub fn prefs_get(c: &Connection) -> Res<Prefs> {
  Ok(db::get_setting(c, PREFS_KEY)?.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default())
}
fn clean_host(h: &str) -> Option<String> {
  let h = h.trim().trim_start_matches("https://").trim_start_matches("http://").split('/').next().unwrap_or("").to_lowercase();
  let ok = !h.is_empty() && h.len() < 200 && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':' || c == '*');
  ok.then_some(h)
}
pub fn prefs_set(c: &Connection, p: &Prefs) -> Res<Prefs> {
  if p.ai_monthly_limit.is_some_and(|n| !(0..=1_000_000).contains(&n)) {
    return Err("limite de 0 a 1.000.000 chamadas por mês".into());
  }
  let mut p = p.clone();
  let mut hosts = vec![];
  for h in &p.ai_allow_hosts {
    if h.trim().is_empty() {
      continue;
    }
    hosts.push(clean_host(h).ok_or_else(|| format!("endereço inválido: {h}"))?);
  }
  hosts.dedup();
  p.ai_allow_hosts = hosts;
  db::set_setting(c, PREFS_KEY, &serde_json::to_value(&p).map_err(e)?)?;
  // a trava da IA externa (Pro) passa a valer na hora
  #[cfg(pro)]
  crate::externa::configure(&p);
  Ok(p)
}

// ---------- Captura rápida ----------

/// Atalho global da captura rápida (de qualquer programa do Windows).
pub const CAPTURE_SHORTCUT: &str = "ctrl+shift+space";

/// Abre (ou traz para a frente) a janelinha de captura, sempre por cima das outras.
pub fn open_capture(app: &tauri::AppHandle) {
  use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
  if let Some(w) = app.get_webview_window("captura") {
    let _ = w.center();
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.emit("captura-abrir", ());
    return;
  }
  let built = WebviewWindowBuilder::new(app, "captura", WebviewUrl::App("index.html".into()))
    .title("Captura · Tesseract")
    .inner_size(660.0, 340.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .focused(true)
    .build();
  if let Err(err) = built {
    log::warn!("não foi possível abrir a captura: {err}");
  }
}

// ---------- Comandos do Tauri ----------

// async: no Windows, criar janela dentro de comando síncrono trava (a janela fica em branco e a chamada não volta)
#[tauri::command]
pub async fn extras_capture_open(app: tauri::AppHandle) {
  open_capture(&app);
}

#[tauri::command]
pub fn extras_export_all(s: State<AppDb>, dir: String, day: String) -> Res<ExportReport> {
  let c = lock(&s)?;
  let r = export_all(&c, Path::new(&dir), &day)?;
  db::audit(&c, "export.all", json!({ "rows": r.rows }))?;
  Ok(r)
}
#[tauri::command]
pub fn extras_ics_save(s: State<AppDb>, path: String, stamp: String) -> Res<usize> {
  let c = lock(&s)?;
  let body = ics(&c, &stamp)?;
  let p = PathBuf::from(&path);
  if p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("ics")) != Some(true) {
    return Err("salve com a extensão .ics".into());
  }
  fs::write(&p, &body).map_err(e)?;
  Ok(body.matches("BEGIN:VEVENT").count())
}
#[tauri::command]
pub fn extras_company_export(s: State<AppDb>, id: i64, path: String) -> Res<()> {
  let c = lock(&s)?;
  let data = company_data(&c, id)?;
  if !path.to_lowercase().ends_with(".json") {
    return Err("salve com a extensão .json".into());
  }
  fs::write(&path, serde_json::to_string_pretty(&data).map_err(e)?).map_err(e)?;
  db::audit(&c, "lgpd.export", json!({ "company": id }))
}
#[tauri::command]
pub fn extras_company_anonymize(s: State<AppDb>, id: i64) -> Res<()> {
  let mut c = lock(&s)?;
  anonymize(&mut c, id)?;
  db::audit(&c, "lgpd.anonymize", json!({ "company": id }))
}
#[tauri::command]
pub fn extras_prefs(s: State<AppDb>) -> Res<Value> {
  let p = prefs_get(&*lock(&s)?)?;
  #[cfg(pro)]
  let (month, used) = crate::externa::usage();
  #[cfg(not(pro))]
  let (month, used) = (String::new(), 0);
  Ok(json!({ "prefs": p, "aiMonth": month, "aiUsed": used }))
}
#[tauri::command]
pub fn extras_prefs_set(s: State<AppDb>, prefs: Prefs) -> Res<Prefs> {
  prefs_set(&*lock(&s)?, &prefs)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn setup(tag: &str) -> (Connection, PathBuf) {
    let dir = std::env::temp_dir().join(format!("tesseract-extras-{tag}-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("x.db")).unwrap();
    db::migrate(&mut c).unwrap();
    (c, dir)
  }

  #[test]
  #[cfg(pro)] // usa o CRM (módulo Pro)
  fn exporta_tudo_em_json_csv_e_markdown() {
    let (mut c, dir) = setup("exp");
    crate::tasks::project_save(&mut c, None, "personal", "Site, \"Padaria\"", "", None).unwrap();
    let co = crate::crm::company_save(&c, &crate::crm::Company { scope: "personal".into(), name: "Barbearia; do Dom".into(), ..Default::default() }).unwrap();
    let r = export_all(&c, &dir, "2026-11-02").unwrap();
    let root = PathBuf::from(&r.folder);
    let j: Value = serde_json::from_str(&fs::read_to_string(root.join("tesseract.json")).unwrap()).unwrap();
    assert_eq!(j["tables"]["companies"][0]["id"], json!(co));
    assert!(j["tables"].get("chunks").is_none(), "índice do cérebro fica de fora");
    let csv = fs::read_to_string(root.join("csv").join("companies.csv")).unwrap();
    assert!(csv.contains("\"Barbearia; do Dom\""), "célula com separador vai entre aspas");
    assert!(root.join("markdown").read_dir().unwrap().count() >= 1);
    assert!(r.projects >= 1 && r.tables > 5);
    // exportar de novo no mesmo dia não sobrescreve
    let r2 = export_all(&c, &dir, "2026-11-02").unwrap();
    assert_ne!(r.folder, r2.folder);
  }

  #[test]
  fn ics_com_blocos_prazos_followups_e_contas() {
    let (mut c, _) = setup("ics");
    let pid = crate::tasks::project_save(&mut c, None, "personal", "Casa", "", None).unwrap();
    let col: i64 = c.query_row("SELECT id FROM board_columns WHERE project_id = ?1 AND done = 0 ORDER BY ord LIMIT 1", [pid], |r| r.get(0)).unwrap();
    c.execute("INSERT INTO tasks (project_id, column_id, title, due, sched_start, sched_min, ord) VALUES (?1, ?2, 'Pagar IPVA, já', '2026-12-31', '2026-11-03T09:30', 45, 1)", rusqlite::params![pid, col]).unwrap();
    crate::finance::save(&c, &crate::finance::Tx { id: None, scope: "personal".into(), kind: "out".into(), description: "Aluguel".into(), category: String::new(), account: String::new(), amount: 150_050, due: "2026-11-05".into(), paid_at: None, notes: String::new() }).unwrap();
    let out = ics(&c, "20261102T120000Z").unwrap();
    assert!(out.starts_with("BEGIN:VCALENDAR\r\n") && out.ends_with("END:VCALENDAR\r\n"));
    assert!(out.contains("DTSTART:20261103T093000") && out.contains("DTEND:20261103T101500"), "bloco de 45 min");
    assert!(out.contains("DTSTART;VALUE=DATE:20261231") && out.contains("DTEND;VALUE=DATE:20270101"), "virada do ano");
    assert!(out.contains("Pagar IPVA\\, já"), "vírgula escapada");
    assert!(out.contains(r"A pagar: Aluguel (R$ 1.500\,50)"), "valor com milhar e vírgula escapada");
    assert_eq!(out.matches("BEGIN:VEVENT").count(), 3);
  }

  #[test]
  #[cfg(pro)] // usa o CRM (módulo Pro)
  fn lgpd_exporta_e_anonimiza() {
    let (mut c, _) = setup("lgpd");
    let co = crate::crm::company_save(&c, &crate::crm::Company { scope: "personal".into(), name: "Clínica Vida".into(), phone: "11 99999-0000".into(), ..Default::default() }).unwrap();
    crate::crm::contact_save(&c, &crate::crm::Contact { company_id: co, name: "Dra. Helena".into(), email: "helena@vida.com".into(), ..Default::default() }).unwrap();
    let o = crate::crm::opp_save(&c, &crate::crm::Opportunity { company_id: co, title: "Site".into(), value: 500_000, stage: "reuniao".into(), chance: 35, ..Default::default() }, "2026-11-01").unwrap();
    crate::crm::interaction_add(&c, &crate::crm::Interaction { company_id: co, opportunity_id: Some(o), kind: "whatsapp".into(), text: "Falou do filho".into(), at: "2026-11-01".into(), ..Default::default() }).unwrap();
    let d = company_data(&c, co).unwrap();
    assert_eq!(d["contatos"][0]["email"], "helena@vida.com");
    anonymize(&mut c, co).unwrap();
    let d = company_data(&c, co).unwrap();
    assert!(d["empresa"]["name"].as_str().unwrap().starts_with("Anonimizado"));
    assert_eq!((d["empresa"]["phone"].as_str(), d["contatos"][0]["email"].as_str()), (Some(""), Some("")));
    let texts: Vec<&str> = d["historico"].as_array().unwrap().iter().filter(|h| h["kind"] != "estagio").map(|h| h["text"].as_str().unwrap()).collect();
    assert_eq!(texts, vec!["[removido a pedido do titular]"]);
    assert_eq!(d["oportunidades"][0]["value"], json!(500_000), "valores ficam para o relatório");
  }
}
