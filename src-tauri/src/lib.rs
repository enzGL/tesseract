mod ai;
#[cfg(test)]
mod check_real;
mod extras;
mod gantt;
mod brain;
mod db;
mod finance;
mod index;
mod notes;
mod scrum;
mod semantic;
mod shape;
// Licença do Pro: guardada fora do banco (licenca.json); tela em components/License.tsx e /plano.
mod license;
mod common;
mod security;
mod tasks;
mod update;


// ---------- Tesseract Pro (repositório privado tesseract-pro, na pasta pro/) ----------
// Sem a pasta pro/, o build sai com o Grátis completo (núcleo aberto). Ver build.rs.
#[cfg(pro)]
#[path = "../../pro/rust/crm.rs"]
mod crm;
#[cfg(pro)]
#[path = "../../pro/rust/prospect.rs"]
mod prospect;
#[cfg(pro)]
#[path = "../../pro/rust/bots.rs"]
mod bots;
#[cfg(pro)]
#[path = "../../pro/rust/mkt.rs"]
mod mkt;
#[cfg(pro)]
#[path = "../../pro/rust/social.rs"]
mod social;
#[cfg(pro)]
#[path = "../../pro/rust/hours.rs"]
mod hours;
#[cfg(pro)]
#[path = "../../pro/rust/charge.rs"]
mod charge;
#[cfg(pro)]
#[path = "../../pro/rust/creport.rs"]
mod creport;
#[cfg(pro)]
#[path = "../../pro/rust/briefing.rs"]
mod briefing;
#[cfg(pro)]
#[path = "../../pro/rust/models.rs"]
mod models;
#[cfg(pro)]
#[path = "../../pro/rust/cloud.rs"]
mod cloud;
#[cfg(pro)]
#[path = "../../pro/rust/sync.rs"]
mod sync;
#[cfg(pro)]
#[path = "../../pro/rust/importer.rs"]
mod importer;
#[cfg(pro)]
#[path = "../../pro/rust/docs.rs"]
mod docs;
#[cfg(pro)]
#[path = "../../pro/rust/peek.rs"]
mod peek;
#[cfg(pro)]
#[path = "../../pro/rust/automations.rs"]
mod automations;
#[cfg(pro)]
#[path = "../../pro/rust/externa.rs"]
mod externa;
// sem o Pro, o chat só usa a IA local: o ramo externo responde com erro
#[cfg(not(pro))]
mod externa {
  pub fn answer(_: &std::collections::BTreeMap<&'static str, String>, _: &crate::Provider, _: &[serde_json::Value]) -> Result<String, String> {
    Err("provedor externo só no Tesseract Pro".into())
  }
}
#[cfg(pro)]
#[path = "../../pro/rust/extrato.rs"]
mod extrato;
#[cfg(pro)]
#[path = "../../pro/rust/pro.rs"]
mod pro;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

const DEFAULT_KEEP: usize = 10;
const AUTO_EVERY_SECS: u64 = 24 * 60 * 60;

struct AppDb {
  conn: Mutex<Connection>,
  path: PathBuf,
  backups: PathBuf,
  startup: Startup,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct Startup {
  migrations_applied: usize,
  backup_before_migration: Option<String>,
  auto_backup: Option<String>,
  /// Backup (em claro, cifrado logo depois) feito antes de cifrar o banco pela primeira vez.
  backup_before_encryption: Option<String>,
}

type Res<T> = Result<T, String>;

fn now_secs() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn keep(c: &Connection) -> usize {
  db::get_setting(c, "backup.keep").ok().flatten().and_then(|v| v.as_u64()).map_or(DEFAULT_KEEP, |n| n.clamp(1, 100) as usize)
}

/// Onde fica a chave do banco: o Cofre do Windows no app; uma memória nos testes.
trait KeyStore {
  fn get(&self) -> Res<Option<String>>;
  fn set(&self, key: &str) -> Res<()>;
}

const KEYRING_SERVICE: &str = "dev.tesseract.app";

struct Vault;
impl Vault {
  fn entry() -> Res<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, "banco.chave").map_err(|e| e.to_string())
  }
}
impl KeyStore for Vault {
  fn get(&self) -> Res<Option<String>> {
    match Self::entry()?.get_password() {
      Ok(k) => Ok(Some(k)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(format!("não foi possível ler a chave do banco no Cofre do Windows: {e}")),
    }
  }
  fn set(&self, key: &str) -> Res<()> {
    Self::entry()?.set_password(key).map_err(|e| format!("não foi possível guardar a chave do banco no Cofre do Windows: {e}"))
  }
}

/// A chave do banco. Cria uma aleatória só se o banco ainda não existe ou está em claro; um banco cifrado
/// sem chave no Cofre nunca ganha outra (o caminho é restaurar do backup na nuvem).
fn db_key(store: &dyn KeyStore, path: &Path) -> Res<String> {
  if let Some(k) = store.get()? {
    return Ok(k);
  }
  if path.exists() && !db::is_plain(path) {
    return Err("o banco está cifrado, mas a chave dele não está no Cofre do Windows. Se você reinstalou o Windows ou trocou de usuário, restaure um backup da nuvem num banco novo.".into());
  }
  let k = common::hex(&common::random::<32>());
  store.set(&k)?;
  if store.get()?.as_deref() != Some(k.as_str()) {
    return Err("a chave do banco não ficou guardada no Cofre do Windows".into());
  }
  Ok(k)
}

/// Abre o banco, faz backup antes de migrar um banco existente, migra e faz o backup diário automático.
/// Um banco em claro (de antes da cifragem) ganha backup e é cifrado no lugar, junto com os backups antigos.
/// Devolve também a chave, que quem chama guarda com db::set_app_key.
fn init(data_dir: &Path, store: &dyn KeyStore) -> Res<(AppDb, String)> {
  fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
  let path = data_dir.join("tesseract.db");
  let backups = data_dir.join("backups");
  let existed = path.exists();
  let key = db_key(store, &path)?;
  let mut startup = Startup::default();
  if existed && db::is_plain(&path) {
    {
      let c = db::open(&path)?;
      let b = db::backup(&c, &backups, "pre-cifragem", keep(&c) + 1)?;
      startup.backup_before_encryption = Some(b.name);
    }
    db::encrypt_in_place(&path, &key)?;
    for b in db::list_backups(&backups)? {
      let p = PathBuf::from(&b.path);
      if db::is_plain(&p) {
        db::encrypt_in_place(&p, &key).map_err(|e| format!("cifrar o backup {}: {e}", b.name))?;
      }
    }
  }
  let mut conn = db::open_keyed(&path, Some(&key))?;
  if let Some(b) = &startup.backup_before_encryption {
    db::audit(&conn, "db.encrypt", json!({ "backup": b }))?;
  }

  if existed && db::schema_version(&conn)? > 0 && db::pending(&conn)? > 0 {
    let b = db::backup(&conn, &backups, "pre-migracao", keep(&conn))?;
    startup.backup_before_migration = Some(b.name);
  }
  startup.migrations_applied = db::migrate(&mut conn)?;
  if startup.migrations_applied > 0 {
    db::audit(&conn, "db.migrate", json!({ "applied": startup.migrations_applied, "version": db::schema_version(&conn)? }))?;
  }

  let auto = db::get_setting(&conn, "backup.auto")?.and_then(|v| v.as_bool()).unwrap_or(true);
  if auto && existed {
    let newest = db::list_backups(&backups)?.first().map_or(0, |b| b.modified);
    if now_secs().saturating_sub(newest) >= AUTO_EVERY_SECS {
      startup.auto_backup = Some(db::backup(&conn, &backups, "auto", keep(&conn))?.name);
    }
  }
  Ok((AppDb { conn: Mutex::new(conn), path, backups, startup }, key))
}

fn lock<'a>(s: &'a State<AppDb>) -> Res<std::sync::MutexGuard<'a, Connection>> {
  s.conn.lock().map_err(|_| "banco indisponível".to_string())
}

// ---------- Banco e backups ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DbInfo {
  path: String,
  backups_dir: String,
  bytes: u64,
  schema_version: usize,
  latest_schema: usize,
  startup: Startup,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppMode {
  test: bool,
  data_dir: String,
  // o instalador deixa `welcome.pending` na pasta de dados: a boas-vindas aparece na primeira
  // abertura depois de cada instalação, mesmo quando os dados de antes continuam lá
  fresh_install: bool,
  // modelo de conversa que o instalador baixou (welcome.pending = {"model": "..."})
  install_model: Option<String>,
}

const WELCOME_MARK: &str = "welcome.pending";

#[tauri::command]
fn app_mode(m: State<AppMode>) -> AppMode {
  m.inner().clone()
}

#[tauri::command]
fn app_welcome_done(m: State<AppMode>) {
  let _ = std::fs::remove_file(std::path::Path::new(&m.data_dir).join(WELCOME_MARK));
}

#[tauri::command]
fn db_info(s: State<AppDb>) -> Res<DbInfo> {
  let c = lock(&s)?;
  // O WAL guarda escritas recentes fora do arquivo principal; soma os dois para o tamanho real.
  let wal = PathBuf::from(format!("{}-wal", s.path.display()));
  let bytes = fs::metadata(&s.path).map_or(0, |m| m.len()) + fs::metadata(wal).map_or(0, |m| m.len());
  Ok(DbInfo {
    path: s.path.to_string_lossy().to_string(),
    backups_dir: s.backups.to_string_lossy().to_string(),
    bytes,
    schema_version: db::schema_version(&c)?,
    latest_schema: db::MIGRATIONS.len(),
    startup: s.startup.clone(),
  })
}

#[tauri::command]
fn backup_now(s: State<AppDb>) -> Res<db::BackupFile> {
  let c = lock(&s)?;
  let b = db::backup(&c, &s.backups, "manual", keep(&c))?;
  db::audit(&c, "backup.create", json!({ "file": b.name }))?;
  Ok(b)
}

#[tauri::command]
fn backups_list(s: State<AppDb>) -> Res<Vec<db::BackupFile>> {
  db::list_backups(&s.backups)
}

/// Volta o banco para um backup. Antes, guarda o estado atual como "pre-restauracao".
#[tauri::command]
fn backup_restore(s: State<AppDb>, name: String) -> Res<String> {
  let src = db::find_backup(&s.backups, &name)?;
  let mut c = lock(&s)?;
  let k = keep(&c);
  let safety = db::restore(&mut c, &src, &s.backups, k, db::app_key())?;
  db::audit(&c, "backup.restore", json!({ "from": name, "safety": safety }))?;
  Ok(safety)
}

// ---------- Configurações ----------

/// Chaves aceitas. Qualquer outra é recusada, para o front não gravar lixo no banco.
const SETTING_KEYS: &[&str] = &[
  "backup.auto", "backup.keep", "vault.path", "vault.sensitive", "profile.name", "profile.role", "guide.done",
  "ai.mode", "ai.localModel", "ai.provider", "ai.externalBase", "ai.externalModel", "shortcuts",
  "onboarding.skipped", "update.auto",
  // app do seu jeito (src/data/layout.ts)
  "ui.segment", "ui.menu", "ui.home", "ui.banner.closed",
  // vocabulário por área (src/data/vocab.ts)
  "ui.vocab",
];

#[tauri::command]
fn settings_all(s: State<AppDb>) -> Res<BTreeMap<String, Value>> {
  let c = lock(&s)?;
  let mut st = c.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
  let rows = st
    .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
    .map_err(|e| e.to_string())?;
  let mut out = BTreeMap::new();
  for (k, v) in rows.flatten() {
    if let Ok(v) = serde_json::from_str(&v) {
      out.insert(k, v);
    }
  }
  Ok(out)
}

#[tauri::command]
fn setting_set(s: State<AppDb>, key: String, value: Value) -> Res<()> {
  if !SETTING_KEYS.contains(&key.as_str()) {
    return Err(format!("configuração desconhecida: {key}"));
  }
  let c = lock(&s)?;
  // trocar de cérebro invalida o índice inteiro (ele aponta para outra pasta)
  if key == "vault.path" && db::get_setting(&c, "vault.path")? != Some(value.clone()) {
    index::clear(&c)?;
  }
  db::set_setting(&c, &key, &value)?;
  db::audit(&c, "setting.set", json!({ "key": key }))
}

// ---------- Vault ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultCheck {
  exists: bool,
  obsidian: bool,
  notes: usize,
  /// true quando a contagem parou no limite (vault maior que isso).
  capped: bool,
}

const NOTE_CAP: usize = 50_000;

fn count_notes(dir: &Path, n: &mut usize) {
  let Ok(entries) = fs::read_dir(dir) else { return };
  for e in entries.flatten() {
    if *n >= NOTE_CAP {
      return;
    }
    let name = e.file_name();
    let name = name.to_string_lossy();
    if name.starts_with('.') {
      continue; // .obsidian, .git, .trash
    }
    let Ok(ft) = e.file_type() else { continue };
    if ft.is_dir() {
      count_notes(&e.path(), n);
    } else if name.to_lowercase().ends_with(".md") {
      *n += 1;
    }
  }
}

/// Só lê: confere se a pasta existe, se é um vault do Obsidian e quantas notas .md tem.
#[tauri::command]
async fn vault_check(path: String) -> Res<VaultCheck> {
  let p = PathBuf::from(path.trim());
  if !p.is_dir() {
    return Ok(VaultCheck { exists: false, obsidian: false, notes: 0, capped: false });
  }
  let mut n = 0;
  count_notes(&p, &mut n);
  Ok(VaultCheck { exists: true, obsidian: p.join(".obsidian").is_dir(), notes: n, capped: n >= NOTE_CAP })
}

/// Cria um segundo cérebro novo na pasta escolhida e passa a usá-lo como vault.
#[tauri::command]
async fn brain_create(s: State<'_, AppDb>, root: String, dirs: Vec<String>, files: Vec<brain::BrainFile>) -> Res<brain::Created> {
  let out = brain::create(&root, &dirs, &files)?;
  let c = lock(&s)?;
  db::set_setting(&c, "vault.path", &json!(out.root))?;
  db::audit(&c, "brain.create", json!({ "root": out.root, "dirs": out.dirs, "files": out.files }))?;
  Ok(out)
}

/// Só confere se a pasta serve para um cérebro novo (vazia ou inexistente).
#[tauri::command]
fn brain_check_root(root: String) -> Res<()> {
  brain::check_root(&root).map(|_| ())
}

// ---------- Índice e busca no cérebro (fase 3) ----------

fn vault_root(c: &Connection) -> Res<(PathBuf, bool)> {
  let path = db::get_setting(c, "vault.path")?.and_then(|v| v.as_str().map(String::from)).filter(|p| !p.is_empty());
  let Some(path) = path else { return Err("nenhuma base de conhecimento conectada".into()) };
  let sensitive = db::get_setting(c, "vault.sensitive")?.and_then(|v| v.as_bool()).unwrap_or(false);
  Ok((PathBuf::from(path), sensitive))
}

/// Atualiza o índice (incremental). Só lê o vault.
#[tauri::command]
async fn brain_index(s: State<'_, AppDb>) -> Res<index::Report> {
  let mut c = lock(&s)?;
  let (root, sensitive) = vault_root(&c)?;
  let r = index::run(&mut c, &root, sensitive)?;
  if r.added + r.updated + r.removed > 0 {
    db::audit(&c, "brain.index", json!({ "added": r.added, "updated": r.updated, "removed": r.removed }))?;
  }
  Ok(r)
}

#[tauri::command]
fn brain_search(s: State<AppDb>, query: String, limit: Option<usize>) -> Res<Vec<index::Hit>> {
  let c = lock(&s)?;
  index::search(&c, &query, limit.unwrap_or(20).min(100))
}

#[tauri::command]
fn brain_read(s: State<AppDb>, path: String) -> Res<index::NoteView> {
  let c = lock(&s)?;
  let (root, _) = vault_root(&c)?;
  index::read(&c, &root, &path)
}

// ---------- Editor do Conhecimento (Grátis): escrever, criar, nota do dia, grafo ----------

/// Depois de escrever, o índice é atualizado (incremental) para a árvore, a busca e o grafo verem a mudança.
fn reindex(c: &mut Connection) -> Res<()> {
  let (root, sensitive) = vault_root(c)?;
  index::run(c, &root, sensitive).map(|_| ())
}

#[tauri::command]
fn notes_list(s: State<AppDb>) -> Res<Vec<notes::Item>> {
  notes::list(&*lock(&s)?)
}

#[tauri::command]
fn note_write(s: State<AppDb>, path: String, content: String, base: Option<i64>) -> Res<i64> {
  let mut c = lock(&s)?;
  let (root, _) = vault_root(&c)?;
  let m = notes::write(&root, &path, &content, base)?;
  reindex(&mut c)?;
  Ok(m)
}

#[tauri::command]
fn note_create(s: State<AppDb>, path: String, content: String) -> Res<()> {
  let mut c = lock(&s)?;
  let (root, _) = vault_root(&c)?;
  notes::create(&root, &path, &content)?;
  reindex(&mut c)?;
  db::audit(&c, "note.create", json!({ "path": path }))
}

#[tauri::command]
fn note_daily(s: State<AppDb>, day: String) -> Res<String> {
  let mut c = lock(&s)?;
  let (root, _) = vault_root(&c)?;
  let (path, created) = notes::daily(&root, &day)?;
  if created {
    reindex(&mut c)?;
  }
  Ok(path)
}

#[tauri::command]
fn notes_graph(s: State<AppDb>) -> Res<notes::Graph> {
  notes::graph(&*lock(&s)?)
}

#[tauri::command]
fn note_links(s: State<AppDb>, path: String) -> Res<Vec<(String, Option<String>)>> {
  notes::links_of(&*lock(&s)?, &path)
}

#[tauri::command]
fn notes_plugins(s: State<AppDb>) -> Res<notes::Plugins> {
  let c = lock(&s)?;
  let (root, _) = vault_root(&c)?;
  notes::plugins(&c, &root)
}

/// Caminho da nota de um [[link]] (ou nada, se ela não existe no índice).
#[tauri::command]
fn brain_resolve(s: State<AppDb>, target: String) -> Res<Option<String>> {
  index::resolve(&*lock(&s)?, &target)
}

#[derive(Serialize)]
struct BrainStats {
  notes: i64,
  chunks: i64,
}

#[tauri::command]
fn brain_stats(s: State<AppDb>) -> Res<BrainStats> {
  let c = lock(&s)?;
  let n = |sql: &str| c.query_row(sql, [], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string());
  Ok(BrainStats { notes: n("SELECT count(*) FROM notes")?, chunks: n("SELECT count(*) FROM chunks")? })
}

// ---------- IA: busca por significado e chat com fontes (fase 3B e 3C) ----------

fn setting_str(c: &Connection, key: &str) -> Res<String> {
  Ok(db::get_setting(c, key)?.and_then(|v| v.as_str().map(String::from)).unwrap_or_default())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiStatus {
  ollama: bool,
  ollama_error: Option<String>,
  models: Vec<ai::LocalModel>,
  embed_ready: bool,
  vectors_done: i64,
  vectors_total: i64,
  keys: BTreeMap<String, bool>,
}

#[tauri::command]
fn ai_ram() -> u32 {
  ai::ram_gb()
}

#[derive(Serialize, Clone)]
struct PullProgress {
  model: String,
  pct: u32,
  detail: String,
}

/// Baixa um modelo do catálogo no Ollama (Configurações > IA), com o progresso no evento "ai-pull".
#[tauri::command]
async fn ai_pull(app: tauri::AppHandle, s: State<'_, AppDb>, model: String) -> Res<()> {
  use tauri::Emitter;
  // IA no computador é do Pro (decidido em 2026-11-07); no beta (sem chave no build), livre
  license::need_pro(license::plan(&s.path), "IA no seu computador")?;
  tauri::async_runtime::spawn_blocking(move || {
    ai::pull(&model, &|pct, detail| {
      let _ = app.emit("ai-pull", PullProgress { model: model.clone(), pct, detail });
    })
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ai_status(s: State<'_, AppDb>) -> Res<AiStatus> {
  let (ollama, ollama_error, models) = match ai::ollama_models() {
    Ok(m) => (true, None, m),
    Err(e) => (false, Some(e), vec![]),
  };
  let embed_ready = models.iter().any(|m| m.name.split(':').next() == Some(ai::EMBED_MODEL));
  let (vectors_done, vectors_total) = semantic::counts(&*lock(&s)?, ai::EMBED_MODEL)?;
  #[cfg(pro)]
  let keys = externa::PROVIDERS.iter().map(|p| (p.to_string(), externa::key_get(p).ok().flatten().is_some())).collect();
  #[cfg(not(pro))]
  let keys = BTreeMap::new();
  Ok(AiStatus { ollama, ollama_error, models, embed_ready, vectors_done, vectors_total, keys })
}

#[derive(Serialize)]
struct EmbedStep {
  done: i64,
  total: i64,
  embedded: usize,
}

/// Calcula vetores de até 24 trechos pendentes. O front chama em sequência até zerar; o banco fica
/// livre enquanto o Ollama trabalha.
#[tauri::command]
async fn brain_embed_step(s: State<'_, AppDb>) -> Res<EmbedStep> {
  // busca por significado é do Pro: no Grátis não calcula vetores (o laço da tela para com 0)
  if license::plan(&s.path) == license::Plan::Gratis {
    let (done, total) = semantic::counts(&*lock(&s)?, ai::EMBED_MODEL)?;
    return Ok(EmbedStep { done, total, embedded: 0 });
  }
  let batch = semantic::pending(&*lock(&s)?, ai::EMBED_MODEL, 24)?;
  let mut embedded = 0;
  if !batch.is_empty() {
    let texts: Vec<String> = batch.iter().map(|(_, t)| t.clone()).collect();
    let vecs = ai::embed(&texts)?;
    let items: Vec<(i64, Vec<f32>)> = batch.iter().map(|(id, _)| *id).zip(vecs).collect();
    embedded = items.len();
    semantic::store(&mut *lock(&s)?, ai::EMBED_MODEL, &items)?;
  }
  let (done, total) = semantic::counts(&*lock(&s)?, ai::EMBED_MODEL)?;
  Ok(EmbedStep { done, total, embedded })
}

#[derive(Serialize)]
struct SearchResult {
  hits: Vec<index::Hit>,
  semantic: bool,
}

/// Busca texto + significado. Sem Ollama ou sem vetores, cai para a busca textual.
#[tauri::command]
async fn brain_search_hybrid(s: State<'_, AppDb>, query: String, limit: Option<usize>) -> Res<SearchResult> {
  let limit = limit.unwrap_or(20).min(100);
  let (done, _) = semantic::counts(&*lock(&s)?, ai::EMBED_MODEL)?;
  // no Grátis, só a busca por texto (sem erro: a tela mostra os resultados de texto)
  if done > 0 && query.trim().chars().count() >= 3 && license::plan(&s.path) != license::Plan::Gratis {
    if let Ok(mut v) = ai::embed(&[query.clone()]) {
      let hits = semantic::hybrid(&*lock(&s)?, &query, &v.remove(0), limit)?;
      return Ok(SearchResult { hits, semantic: true });
    }
  }
  Ok(SearchResult { hits: index::search(&*lock(&s)?, &query, limit)?, semantic: false })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Provider {
  kind: String, // "local" | "external"
  id: String,
  model: String,
}

fn ai_settings(c: &Connection) -> Res<BTreeMap<&'static str, String>> {
  let mut m = BTreeMap::new();
  for k in ["ai.mode", "ai.localModel", "ai.provider", "ai.externalBase", "ai.externalModel", "profile.name"] {
    m.insert(k, setting_str(c, k)?);
  }
  Ok(m)
}

/// Escolhe quem responde, conforme ai.mode: auto (local se der, senão externo), local, external.
fn resolve(cfg: &BTreeMap<&'static str, String>) -> Res<Provider> {
  let mode = if cfg["ai.mode"].is_empty() { "auto" } else { cfg["ai.mode"].as_str() };
  let local_model = &cfg["ai.localModel"];
  let local_ok = mode != "external"
    && !local_model.is_empty()
    && ai::ollama_models().map(|ms| ms.iter().any(|m| &m.name == local_model)).unwrap_or(false);
  if local_ok {
    return Ok(Provider { kind: "local".into(), id: "ollama".into(), model: local_model.clone() });
  }
  // provedor externo (Pro): sem escolha salva, Groq com o modelo sugerido
  #[cfg(pro)]
  if mode != "local" {
    if let Some(p) = externa::resolve(cfg) {
      return Ok(p);
    }
  }
  Err(match mode {
    "local" => "Nenhum modelo local pronto. Instale um no Ollama (ex.: ollama pull llama3.2:3b) e escolha em Configurações.".into(),
    "external" => "Provedor externo sem chave ou sem modelo. Configure em Configurações > IA e privacidade.".into(),
    _ => "Nenhuma IA configurada. Escolha um modelo local ou um provedor em Configurações > IA e privacidade.".into(),
  })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Prepared {
  sources: Vec<ai::Source>,
  provider: Option<Provider>,
  provider_error: Option<String>,
}

/// Passo 1 do chat: acha os trechos e diz quem vai responder. Nada sai do computador aqui.
#[tauri::command]
async fn chat_prepare(s: State<'_, AppDb>, question: String) -> Res<Prepared> {
  license::need_pro(license::plan(&s.path), "Perguntar às suas notas")?;
  let cfg = ai_settings(&*lock(&s)?)?;
  let (done, _) = semantic::counts(&*lock(&s)?, ai::EMBED_MODEL)?;
  let qvec = if done > 0 { ai::embed(&[question.clone()]).ok().map(|mut v| v.remove(0)) } else { None };
  let sources = semantic::retrieve(&*lock(&s)?, &question, qvec.as_deref(), 6)?;
  let (provider, provider_error) = match resolve(&cfg) {
    Ok(p) => (Some(p), None),
    Err(e) => (None, Some(e)),
  };
  Ok(Prepared { sources, provider, provider_error })
}

/// Passo 2: envia a pergunta e os trechos escolhidos. Para provedor externo, exige o consentimento
/// dado na tela que mostrou o que vai sair.
#[tauri::command]
async fn chat_send(s: State<'_, AppDb>, question: String, chunk_ids: Vec<i64>, history: Vec<(String, String)>, consent: bool) -> Res<String> {
  license::need_pro(license::plan(&s.path), "Perguntar às suas notas")?;
  let cfg = ai_settings(&*lock(&s)?)?;
  let p = resolve(&cfg)?;
  let sources = semantic::sources_by_ids(&*lock(&s)?, &chunk_ids)?;
  let msgs = ai::messages(&cfg["profile.name"], &question, &sources, &history);
  let answer = if p.kind == "local" {
    ai::ollama_chat(&p.model, &msgs)?
  } else {
    if !consent {
      return Err("envio para provedor externo sem consentimento".into());
    }
    externa::answer(&cfg, &p, &msgs)?
  };
  db::audit(&*lock(&s)?, "chat.answer", json!({ "provider": p.id, "model": p.model, "sources": sources.len(), "external": p.kind == "external" }))?;
  Ok(answer)
}

// ---------- Projetos, quadro e tarefas (fase 4A) ----------

#[tauri::command]
fn projects_list(s: State<AppDb>) -> Res<Vec<tasks::Project>> {
  tasks::projects(&*lock(&s)?)
}

/// Projetos ativos e (do projeto `id`) escopo e métodos atuais, para os limites do Grátis.
use license::active_projects;
fn project_now(c: &Connection, id: i64) -> (String, Vec<String>) {
  c.query_row("SELECT scope, methods FROM projects WHERE id = ?1", [id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
    .map(|(sc, m)| (sc, m.and_then(|m| serde_json::from_str(&m).ok()).unwrap_or_default()))
    .unwrap_or_default()
}

#[tauri::command]
fn project_save(s: State<AppDb>, id: Option<i64>, scope: String, name: String, description: Option<String>, setup: Option<tasks::MethodSetup>) -> Res<i64> {
  let mut c = lock(&s)?;
  let plan = license::plan(&s.path);
  match id {
    None => {
      license::check_new_project(plan, &scope, active_projects(&c)?)?;
      if let Some(m) = &setup {
        license::check_methods(plan, &m.methods, &[])?;
      }
    }
    Some(id) => {
      if scope != "personal" && project_now(&c, id).0 != scope {
        license::need_pro(plan, "Projetos de organizações")?;
      }
    }
  }
  let pid = tasks::project_save(&mut c, id, &scope, &name, description.as_deref().unwrap_or(""), setup.as_ref())?;
  db::audit(&c, if id.is_some() { "project.update" } else { "project.create" }, json!({ "id": pid }))?;
  Ok(pid)
}

#[tauri::command]
fn project_archive(s: State<AppDb>, id: i64, archived: bool) -> Res<()> {
  let c = lock(&s)?;
  if !archived && active_projects(&c)? >= license::FREE_PROJECTS {
    license::need_pro(license::plan(&s.path), "Mais de 3 projetos ativos")?;
  }
  tasks::project_archive(&c, id, archived)?;
  db::audit(&c, if archived { "project.archive" } else { "project.unarchive" }, json!({ "id": id }))
}

#[tauri::command]
fn project_methods(s: State<AppDb>, id: i64, setup: tasks::MethodSetup) -> Res<()> {
  let c = lock(&s)?;
  license::check_methods(license::plan(&s.path), &setup.methods, &project_now(&c, id).1)?;
  tasks::project_methods(&c, id, &setup)?;
  db::audit(&c, "project.methods", json!({ "id": id, "methods": setup.methods }))
}

#[tauri::command]
fn project_review_done(s: State<AppDb>, id: i64, day: String) -> Res<()> {
  tasks::project_review_done(&*lock(&s)?, id, &day)
}

#[tauri::command]
fn task_log_time(s: State<AppDb>, id: i64, minutes: i64) -> Res<i64> {
  tasks::task_log_time(&*lock(&s)?, id, minutes)
}

// ---------- Shape Up, PARA e modelos (fase 4B-2c) ----------

#[tauri::command]
fn cycles_list(s: State<AppDb>, project_id: i64) -> Res<Vec<shape::Cycle>> {
  shape::cycles(&*lock(&s)?, project_id)
}

#[tauri::command]
fn cycle_save(s: State<AppDb>, cycle: shape::Cycle) -> Res<i64> {
  shape::cycle_save(&*lock(&s)?, &cycle)
}

#[tauri::command]
fn cycle_close(s: State<AppDb>, id: i64, day: String) -> Res<()> {
  shape::cycle_close(&*lock(&s)?, id, &day)
}

#[tauri::command]
fn scopes_list(s: State<AppDb>, cycle_id: i64) -> Res<Vec<shape::Scope>> {
  shape::scopes(&*lock(&s)?, cycle_id)
}

#[tauri::command]
fn scope_save(s: State<AppDb>, scope: shape::Scope) -> Res<i64> {
  shape::scope_save(&*lock(&s)?, &scope)
}

#[tauri::command]
fn scope_move(s: State<AppDb>, id: i64, hill: i64, day: String) -> Res<()> {
  shape::scope_move(&*lock(&s)?, id, hill, &day)
}

#[tauri::command]
fn scope_delete(s: State<AppDb>, id: i64) -> Res<()> {
  shape::scope_delete(&*lock(&s)?, id)
}

#[tauri::command]
fn project_para(s: State<AppDb>, id: i64, kind: String, brain_path: Option<String>) -> Res<()> {
  tasks::project_para(&*lock(&s)?, id, &kind, brain_path.as_deref())
}

#[tauri::command]
fn templates_list(s: State<AppDb>) -> Res<Vec<shape::UserTemplate>> {
  shape::templates(&*lock(&s)?)
}

#[tauri::command]
fn template_save(s: State<AppDb>, template: shape::UserTemplate) -> Res<i64> {
  shape::template_save(&*lock(&s)?, &template)
}

#[tauri::command]
fn template_delete(s: State<AppDb>, id: i64) -> Res<()> {
  shape::template_delete(&*lock(&s)?, id)
}

// ---------- Scrum e OKR (fase 4B-2b) ----------

#[tauri::command]
fn sprints_list(s: State<AppDb>, project_id: i64) -> Res<Vec<scrum::Sprint>> {
  scrum::sprints(&*lock(&s)?, project_id)
}

#[tauri::command]
fn sprint_save(s: State<AppDb>, sprint: scrum::Sprint) -> Res<i64> {
  scrum::sprint_save(&*lock(&s)?, &sprint)
}

#[tauri::command]
fn sprint_delete(s: State<AppDb>, id: i64) -> Res<()> {
  scrum::sprint_delete(&*lock(&s)?, id)
}

#[tauri::command]
fn sprint_close(s: State<AppDb>, id: i64, day: String, retro: String, outcome: Option<String>) -> Res<i64> {
  let mut c = lock(&s)?;
  let n = scrum::sprint_close(&mut c, id, &day, &retro, outcome.as_deref())?;
  db::audit(&c, "sprint.close", json!({ "id": id, "back_to_backlog": n }))?;
  Ok(n)
}

#[tauri::command]
fn reports_list(s: State<AppDb>, project_id: i64) -> Res<Vec<scrum::Report>> {
  scrum::reports(&*lock(&s)?, project_id)
}

#[tauri::command]
fn report_save(s: State<AppDb>, report: scrum::Report) -> Res<i64> {
  let c = lock(&s)?;
  let id = scrum::report_save(&c, &report)?;
  if report.id.is_none() {
    db::audit(&c, "report.create", json!({ "id": id, "project": report.project_id }))?;
  }
  Ok(id)
}

#[tauri::command]
fn report_delete(s: State<AppDb>, id: i64) -> Res<()> {
  scrum::report_delete(&*lock(&s)?, id)
}

#[tauri::command]
fn okr_list(s: State<AppDb>, project_id: i64) -> Res<Vec<scrum::Objective>> {
  scrum::okr(&*lock(&s)?, project_id)
}

#[tauri::command]
fn objective_save(s: State<AppDb>, project_id: i64, id: Option<i64>, title: String) -> Res<i64> {
  scrum::objective_save(&*lock(&s)?, project_id, id, &title)
}

#[tauri::command]
fn objective_delete(s: State<AppDb>, id: i64) -> Res<()> {
  scrum::objective_delete(&*lock(&s)?, id)
}

#[tauri::command]
fn kr_save(s: State<AppDb>, kr: scrum::Kr) -> Res<i64> {
  scrum::kr_save(&*lock(&s)?, &kr)
}

#[tauri::command]
fn kr_delete(s: State<AppDb>, id: i64) -> Res<()> {
  scrum::kr_delete(&*lock(&s)?, id)
}

// ---------- Finanças (fase 4D) ----------

#[tauri::command]
fn finance_list(s: State<AppDb>, scope: String, from: String, to: String) -> Res<Vec<finance::Tx>> {
  finance::list(&*lock(&s)?, &scope, &from, &to)
}

#[tauri::command]
fn finance_overdue(s: State<AppDb>, scope: String, today: String) -> Res<Vec<finance::Tx>> {
  finance::overdue(&*lock(&s)?, &scope, &today)
}

#[tauri::command]
fn finance_names(s: State<AppDb>, scope: String) -> Res<finance::Names> {
  finance::names(&*lock(&s)?, &scope)
}

#[tauri::command]
fn finance_save(s: State<AppDb>, tx: finance::Tx) -> Res<i64> {
  let c = lock(&s)?;
  let id = finance::save(&c, &tx)?;
  if tx.id.is_none() {
    db::audit(&c, "finance.create", json!({ "id": id, "scope": tx.scope }))?;
  }
  Ok(id)
}

#[tauri::command]
fn finance_paid(s: State<AppDb>, id: i64, day: Option<String>) -> Res<()> {
  finance::set_paid(&*lock(&s)?, id, day.as_deref())
}

#[tauri::command]
fn finance_delete(s: State<AppDb>, id: i64) -> Res<()> {
  let c = lock(&s)?;
  finance::delete(&c, id)?;
  db::audit(&c, "finance.delete", json!({ "id": id }))
}

#[tauri::command]
fn calendar_range(s: State<AppDb>, from: String, to: String) -> Res<Vec<tasks::CalTask>> {
  tasks::calendar(&*lock(&s)?, &from, &to)
}

#[tauri::command]
fn calendar_unscheduled(s: State<AppDb>, limit: Option<i64>) -> Res<Vec<tasks::CalTask>> {
  tasks::unscheduled(&*lock(&s)?, limit.unwrap_or(50).min(500))
}

#[tauri::command]
fn task_schedule(s: State<AppDb>, id: i64, start: Option<String>, minutes: Option<i64>) -> Res<()> {
  tasks::task_schedule(&*lock(&s)?, id, start.as_deref(), minutes)
}

#[tauri::command]
fn board_get(s: State<AppDb>, project_id: i64) -> Res<tasks::Board> {
  tasks::board(&*lock(&s)?, project_id)
}

#[tauri::command]
fn columns_save(s: State<AppDb>, project_id: i64, columns: Vec<tasks::Column>) -> Res<tasks::Board> {
  let mut c = lock(&s)?;
  tasks::columns_save(&mut c, project_id, &columns)?;
  tasks::board(&c, project_id)
}

#[tauri::command]
fn task_save(s: State<AppDb>, task: tasks::Task) -> Res<i64> {
  let mut c = lock(&s)?;
  let id = tasks::task_save(&mut c, &task)?;
  if task.id.is_none() {
    db::audit(&c, "task.create", json!({ "id": id, "project": task.project_id }))?;
  }
  Ok(id)
}

#[tauri::command]
fn task_move(s: State<AppDb>, id: i64, column_id: i64, ord: f64) -> Res<()> {
  tasks::task_move(&*lock(&s)?, id, column_id, ord)
}

#[tauri::command]
fn task_delete(s: State<AppDb>, id: i64) -> Res<()> {
  let c = lock(&s)?;
  tasks::task_delete(&c, id)?;
  db::audit(&c, "task.delete", json!({ "id": id }))
}

#[derive(Serialize)]
struct OpenTask {
  task: tasks::Task,
  project: String,
  column: String,
}

#[tauri::command]
fn tasks_open(s: State<AppDb>, limit: Option<i64>) -> Res<Vec<OpenTask>> {
  Ok(tasks::open_tasks(&*lock(&s)?, limit.unwrap_or(50).min(500))?.into_iter().map(|(task, project, column)| OpenTask { task, project, column }).collect())
}

// ---------- Organizações ----------

#[derive(Serialize)]
struct Org {
  id: String,
  name: String,
  archived: bool,
  projects: i64,
}

#[tauri::command]
fn orgs_list(s: State<AppDb>) -> Res<Vec<Org>> {
  let c = lock(&s)?;
  let mut st = c
    .prepare(
      "SELECT o.id, o.name, o.archived_at IS NOT NULL,
              (SELECT count(*) FROM projects p WHERE p.scope = 'org:' || o.id)
       FROM organizations o ORDER BY o.archived_at IS NOT NULL, o.name COLLATE NOCASE",
    )
    .map_err(|e| e.to_string())?;
  let rows = st
    .query_map([], |r| Ok(Org { id: r.get(0)?, name: r.get(1)?, archived: r.get(2)?, projects: r.get(3)? }))
    .map_err(|e| e.to_string())?;
  Ok(rows.flatten().collect())
}

fn slug(name: &str) -> String {
  let mut out = String::new();
  for ch in name.to_lowercase().chars() {
    let ch = match ch {
      'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
      'é' | 'è' | 'ê' | 'ë' => 'e',
      'í' | 'ì' | 'î' | 'ï' => 'i',
      'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
      'ú' | 'ù' | 'û' | 'ü' => 'u',
      'ç' => 'c',
      'ñ' => 'n',
      c => c,
    };
    if ch.is_ascii_alphanumeric() {
      out.push(ch);
    } else if !out.ends_with('-') && !out.is_empty() {
      out.push('-');
    }
  }
  let out = out.trim_end_matches('-').to_string();
  if out.is_empty() { "org".into() } else { out }
}

/// Cria (sem id) ou renomeia (com id) uma organização.
#[tauri::command]
fn org_save(s: State<AppDb>, id: Option<String>, name: String) -> Res<String> {
  let name = name.trim();
  if name.is_empty() {
    return Err("dê um nome à organização".into());
  }
  let c = lock(&s)?;
  match id {
    Some(id) => {
      c.execute("UPDATE organizations SET name = ?1 WHERE id = ?2", (name, &id)).map_err(|e| e.to_string())?;
      db::audit(&c, "org.rename", json!({ "id": id, "name": name }))?;
      Ok(id)
    }
    None => {
      license::need_pro(license::plan(&s.path), "Organizações")?;
      let base = slug(name);
      let mut id = base.clone();
      let mut n = 2;
      while c
        .query_row("SELECT 1 FROM organizations WHERE id = ?1", [&id], |_| Ok(()))
        .is_ok()
      {
        id = format!("{base}-{n}");
        n += 1;
      }
      c.execute("INSERT INTO organizations (id, name) VALUES (?1, ?2)", (&id, name)).map_err(|e| e.to_string())?;
      db::audit(&c, "org.create", json!({ "id": id, "name": name }))?;
      Ok(id)
    }
  }
}

/// Arquivar não apaga nada: some do seletor de escopo, mas os dados ficam.
#[tauri::command]
fn org_archive(s: State<AppDb>, id: String, archived: bool) -> Res<()> {
  let c = lock(&s)?;
  let sql = if archived {
    "UPDATE organizations SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1"
  } else {
    "UPDATE organizations SET archived_at = NULL WHERE id = ?1"
  };
  c.execute(sql, [&id]).map_err(|e| e.to_string())?;
  db::audit(&c, if archived { "org.archive" } else { "org.unarchive" }, json!({ "id": id }))
}

#[derive(Deserialize)]
struct SeedOrg {
  id: String,
  name: String,
  #[serde(default)]
  projects: Vec<String>,
}

/// Primeira execução: importa as organizações do seed (seed.local.json ou o exemplo). Roda uma vez só.
#[tauri::command]
fn workspace_seed(s: State<AppDb>, orgs: Vec<SeedOrg>) -> Res<bool> {
  let mut c = lock(&s)?;
  if db::get_setting(&c, "seed.done")?.is_some() {
    return Ok(false);
  }
  let tx = c.transaction().map_err(|e| e.to_string())?;
  for o in &orgs {
    let id = slug(&o.id);
    tx.execute("INSERT OR IGNORE INTO organizations (id, name) VALUES (?1, ?2)", (&id, o.name.trim()))
      .map_err(|e| e.to_string())?;
    for p in &o.projects {
      tx.execute("INSERT INTO projects (scope, name) VALUES (?1, ?2)", (format!("org:{id}"), p.trim()))
        .map_err(|e| e.to_string())?;
      let pid = tx.last_insert_rowid();
      for (i, (n, color, wip, done)) in tasks::DEFAULT_COLUMNS.iter().enumerate() {
        tx.execute("INSERT INTO board_columns (project_id, name, ord, color, wip, done) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", rusqlite::params![pid, n, (i + 1) as f64, color, wip, *done as i64])
          .map_err(|e| e.to_string())?;
      }
    }
  }
  db::set_setting(&tx, "seed.done", &json!(true))?;
  db::audit(&tx, "workspace.seed", json!({ "orgs": orgs.len() }))?;
  tx.commit().map_err(|e| e.to_string())?;
  Ok(true)
}

/// Com o app travado, só os comandos da trava passam (security::allowed); o resto é recusado no Rust,
/// não só escondido na tela.
fn guarded<R: tauri::Runtime>(handler: impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static) -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
  move |invoke| {
    if !security::allowed(invoke.message.command()) {
      if let Some(sec) = invoke.message.webview().try_state::<security::Sec>() {
        if sec.is_locked() {
          invoke.resolver.reject("o Tesseract está travado");
          return true;
        }
      }
    }
    handler(invoke)
  }
}

/// Só fixa o tipo do generate_handler! (sem isso o compilador não sabe o Runtime da closure).
fn typed<F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static>(f: F) -> F {
  f
}

/// Comandos do núcleo; com o Pro, os nomes de pro::COMMANDS vão para os comandos do Pro.
fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
  let core = typed(tauri::generate_handler![
      app_mode,
      app_welcome_done,
      ai_ram,
      ai_pull,
      update::update_check,
      update::update_install,
      license::license_status,
      license::license_send_code,
      license::license_verify,
      license::license_renew,
      license::license_devices,
      license::license_release,
      license::license_paste,
      license::license_logout,
      license::license_open_checkout,
      gantt::gantt_plan,
      gantt::gantt_start,
      gantt::gantt_dep_add,
      gantt::gantt_dep_remove,
      extras::extras_export_all,
      extras::extras_ics_save,
      extras::extras_company_export,
      extras::extras_company_anonymize,
      extras::extras_prefs,
      extras::extras_prefs_set,
      extras::extras_capture_open,
      db_info,
      backup_now,
      backups_list,
      backup_restore,
      settings_all,
      setting_set,
      vault_check,
      orgs_list,
      org_save,
      org_archive,
      workspace_seed,
      brain_create,
      brain_check_root,
      brain_index,
      brain_search,
      brain_read,
      brain_stats,
      brain_resolve,
      notes_list,
      note_write,
      note_create,
      note_daily,
      notes_graph,
      note_links,
      notes_plugins,
      ai_status,
      brain_embed_step,
      brain_search_hybrid,
      chat_prepare,
      chat_send,
      projects_list,
      project_save,
      project_archive,
      project_methods,
      project_review_done,
      task_log_time,
      calendar_range,
      finance_list,
      sprints_list,
      sprint_save,
      sprint_delete,
      sprint_close,
      okr_list,
      cycles_list,
      cycle_save,
      cycle_close,
      scopes_list,
      scope_save,
      scope_move,
      scope_delete,
      project_para,
      templates_list,
      template_save,
      template_delete,
      reports_list,
      report_save,
      report_delete,
      objective_save,
      objective_delete,
      kr_save,
      kr_delete,
      finance_overdue,
      finance_names,
      finance_save,
      finance_paid,
      finance_delete,
      calendar_unscheduled,
      task_schedule,
      board_get,
      columns_save,
      task_save,
      task_move,
      task_delete,
      tasks_open,
      security::sec_status,
      security::sec_setup_password,
      security::sec_totp_new,
      security::sec_totp_check,
      security::sec_hello_check,
      security::sec_codes_new,
      security::sec_setup_finish,
      security::sec_setup_cancel,
      security::sec_unlock_password,
      security::sec_unlock_code,
      security::sec_unlock_recovery,
      security::sec_unlock_hello,
      security::sec_lock,
      security::sec_back,
      security::sec_prefs,
      security::sec_change_password,
      security::sec_codes_regen,
      security::sec_totp_save,
      security::sec_hello_set,
      security::sec_disable,
  ]);
  #[cfg(pro)]
  {
    let pro = pro::handler();
    move |invoke: tauri::ipc::Invoke<tauri::Wry>| {
      if pro::COMMANDS.contains(&invoke.message.command()) { pro(invoke) } else { core(invoke) }
    }
  }
  #[cfg(not(pro))]
  core
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    // captura rápida: Ctrl+Shift+Espaço abre a janelinha de captura de qualquer programa
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
          if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            extras::open_capture(app);
          }
        })
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Modo de teste (só na versão de desenvolvimento): TESSERACT_DATA_DIR aponta um banco separado,
      // para testar sem tocar nos dados reais. O instalador ignora a variável.
      let test_dir = std::env::var("TESSERACT_DATA_DIR").ok().filter(|d| cfg!(debug_assertions) && !d.trim().is_empty());
      let dir = match &test_dir {
        Some(d) => std::path::PathBuf::from(d),
        None => app.path().app_data_dir()?,
      };
      let mark = dir.join(WELCOME_MARK);
      let fresh_install = test_dir.is_none() && mark.exists();
      let install_model = if fresh_install {
        std::fs::read_to_string(&mark).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()).and_then(|v| v["model"].as_str().map(String::from))
      } else {
        None
      };
      app.manage(AppMode { test: test_dir.is_some(), data_dir: dir.display().to_string(), fresh_install, install_model });
      let (state, key) = init(&dir, &Vault).map_err(|e| format!("Não foi possível abrir o banco em {}: {e}", dir.display()))?;
      db::set_app_key(key);
      log::info!("banco em {}", state.path.display());
      // cópias do banco em claro que uma queda deixou em tmp/ (backup, sync, consulta) saem antes de tudo
      let sobras = common::clean_tmp(&common::tmp_of(&state));
      if sobras > 0 {
        log::warn!("{sobras} temporário(s) em claro apagado(s) de tmp/");
      }
      // atalho global da captura; se outro programa já usa a combinação, o app segue sem ele
      {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        if let Err(err) = app.global_shortcut().register(extras::CAPTURE_SHORTCUT) {
          log::warn!("atalho da captura indisponível ({}): {err}", extras::CAPTURE_SHORTCUT);
        }
      }
      // trava da IA externa (Pro): limite do mês e endereços permitidos
      #[cfg(pro)]
      if let Ok(c) = state.conn.lock() {
        externa::init(&c, &dir);
      }
      // trava do app: começa travada se a segurança estiver ligada; vigia o Win+L
      if let Ok(c) = state.conn.lock() {
        app.manage(security::Sec::new(&c, &dir));
      }
      app.manage(state);
      security::watch_windows_lock(app.handle().clone());
      // Pro: backup na nuvem e dois computadores
      #[cfg(pro)]
      pro::on_setup(app.handle());
      // licença do Pro: renova sozinha pela internet (fora do banco, em licenca.json)
      license::on_open(dir.clone());
      Ok(())
    })
    // ao fechar a janela principal, um último backup na nuvem (se ligado e se algo mudou)
    .on_window_event(|w, ev| {
      if let tauri::WindowEvent::CloseRequested { .. } = ev {
        if w.label() == "main" {
          #[cfg(pro)]
          pro::on_close(w.app_handle());
        }
      }
    })
    .invoke_handler(guarded(handlers()))
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn slug_tira_acento_e_espaco() {
    assert_eq!(slug("Lanzi Labs"), "lanzi-labs");
    assert_eq!(slug("  Ação & Cia. "), "acao-cia");
    assert_eq!(slug("!!!"), "org");
  }

  #[test]
  fn init_migra_e_faz_backup_automatico() {
    let dir = std::env::temp_dir().join(format!("tesseract-test-init-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    // Primeiro boot cria e migra do zero; o segundo encontra o banco pronto.
    let store = MemStore::default();
    let key;
    {
      let (a, k) = init(&dir, &store).unwrap();
      assert_eq!(a.startup.migrations_applied, db::MIGRATIONS.len());
      assert!(a.startup.backup_before_migration.is_none());
      assert!(a.startup.backup_before_encryption.is_none());
      key = k;
    }
    assert!(!db::is_plain(&dir.join("tesseract.db")));
    let (b, k) = init(&dir, &store).unwrap();
    assert_eq!(k, key);
    assert_eq!(b.startup.migrations_applied, 0);
    // Segundo boot de um banco existente sem backup anterior: faz o automático.
    assert!(b.startup.auto_backup.is_some());
  }

  #[derive(Default)]
  struct MemStore(std::cell::RefCell<Option<String>>);
  impl KeyStore for MemStore {
    fn get(&self) -> Res<Option<String>> {
      Ok(self.0.borrow().clone())
    }
    fn set(&self, key: &str) -> Res<()> {
      *self.0.borrow_mut() = Some(key.to_string());
      Ok(())
    }
  }

  #[test]
  fn init_cifra_banco_antigo_e_backups() {
    let dir = std::env::temp_dir().join(format!("tesseract-test-cifra-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    {
      let mut c = db::open(&dir.join("tesseract.db")).unwrap();
      db::migrate(&mut c).unwrap();
      c.execute("INSERT INTO organizations (id, name) VALUES ('x', 'Org X')", []).unwrap();
      db::backup(&c, &dir.join("backups"), "manual", 10).unwrap();
    }
    let store = MemStore::default();
    let (a, key) = init(&dir, &store).unwrap();
    assert!(a.startup.backup_before_encryption.is_some());
    let name: String = a.conn.lock().unwrap().query_row("SELECT name FROM organizations WHERE id = 'x'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Org X");
    drop(a);
    assert!(!db::is_plain(&dir.join("tesseract.db")));
    for b in db::list_backups(&dir.join("backups")).unwrap() {
      assert!(matches!(db::open_any(Path::new(&b.path), Some(&key)), Ok((_, true))), "{} ficou em claro", b.name);
    }
    // banco cifrado sem a chave no Cofre: recusa, não cria outra
    assert!(init(&dir, &MemStore::default()).is_err());
  }
  /// Abertura com o Cofre de verdade sobre uma CÓPIA dos dados reais (nunca o original):
  ///   TESS_REAL_DIR=%APPDATA%/dev.tesseract.app TESS_COPY_DIR=pasta-vazia cargo test init_real -- --ignored --nocapture
  #[test]
  #[ignore]
  fn init_real_copia() {
    let real = PathBuf::from(std::env::var("TESS_REAL_DIR").unwrap());
    let copy = PathBuf::from(std::env::var("TESS_COPY_DIR").unwrap());
    assert!(!copy.join("tesseract.db").exists(), "use uma pasta vazia");
    fs::create_dir_all(copy.join("backups")).unwrap();
    let (src, plain) = db::open_any(&real.join("tesseract.db"), Vault.get().unwrap().as_deref()).unwrap();
    src.execute("VACUUM INTO ?1", [copy.join("tesseract.db").to_string_lossy().to_string()]).unwrap();
    println!("original cifrado: {plain}");
    for b in db::list_backups(&real.join("backups")).unwrap() {
      fs::copy(&b.path, copy.join("backups").join(&b.name)).unwrap();
    }
    let tables: Vec<String> = src.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").unwrap().query_map([], |r| r.get(0)).unwrap().flatten().collect();
    let count = |c: &Connection, t: &str| c.query_row(&format!("SELECT count(*) FROM \"{t}\""), [], |r| r.get::<_, i64>(0)).unwrap();
    let before: Vec<(String, i64)> = tables.iter().map(|t| (t.clone(), count(&src, t))).collect();
    drop(src);

    let (a, key) = init(&copy, &Vault).unwrap();
    println!("startup: pre-cifragem {:?}, migrações {}, auto {:?}", a.startup.backup_before_encryption, a.startup.migrations_applied, a.startup.auto_backup);
    {
      let c = a.conn.lock().unwrap();
      let ok: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
      assert_eq!(ok, "ok");
      for (t, n) in &before {
        assert!(count(&c, t) >= *n, "{t} perdeu linhas");
      }
      println!("{} tabelas, {} linhas, todas presentes", before.len(), before.iter().map(|x| x.1).sum::<i64>());
    }
    drop(a);
    assert!(!db::is_plain(&copy.join("tesseract.db")));
    let bs = db::list_backups(&copy.join("backups")).unwrap();
    for b in &bs {
      assert!(matches!(db::open_any(Path::new(&b.path), Some(&key)), Ok((_, true))), "{} em claro", b.name);
    }
    println!("{} backups, todos cifrados", bs.len());
    // segunda abertura com a mesma chave do Cofre
    let (b, k2) = init(&copy, &Vault).unwrap();
    assert_eq!(k2, key);
    assert!(b.startup.backup_before_encryption.is_none());
    println!("segunda abertura ok");
  }
}
