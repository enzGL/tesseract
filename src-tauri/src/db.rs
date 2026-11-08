// Banco local do Tesseract: abre o SQLite, aplica migrações versionadas e faz backups com VACUUM INTO.
// Regras (ARCHITECTURE.md): migrações embutidas no binário, nunca sem backup prévio de um banco que já
// tem dados, e backup nunca por cópia do arquivo em uso.
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Migrações em ordem. A versão do esquema é o número de migrações aplicadas (PRAGMA user_version).
/// Nunca edite uma migração publicada: acrescente outra.
pub const MIGRATIONS: &[&str] = &[
  include_str!("../migrations/0001_base.sql"),
  include_str!("../migrations/0002_brain_index.sql"),
  include_str!("../migrations/0003_vectors.sql"),
  include_str!("../migrations/0004_tasks.sql"),
  include_str!("../migrations/0005_column_colors.sql"),
  include_str!("../migrations/0006_methods.sql"),
  include_str!("../migrations/0007_calendar.sql"),
  include_str!("../migrations/0008_finance.sql"),
  include_str!("../migrations/0009_gtd.sql"),
  include_str!("../migrations/0010_scrum_okr.sql"),
  include_str!("../migrations/0011_sprint_report.sql"),
  include_str!("../migrations/0012_project_reports.sql"),
  include_str!("../migrations/0013_shapeup_para_templates.sql"),
  include_str!("../migrations/0014_bots.sql"),
  include_str!("../migrations/0015_bot_rec_scope.sql"),
  include_str!("../migrations/0016_crm.sql"),
  include_str!("../migrations/0017_prospect.sql"),
  include_str!("../migrations/0018_documents.sql"),
  include_str!("../migrations/0019_gantt.sql"),
  include_str!("../migrations/0020_bot_examples.sql"),
  include_str!("../migrations/0022_social.sql"),
  include_str!("../migrations/0023_marketing.sql"),
  include_str!("../migrations/0024_hours.sql"),
  include_str!("../migrations/0025_lead_whatsapp.sql"),
  include_str!("../migrations/0026_client_reports.sql"),
  include_str!("../migrations/0027_bot_learning.sql"),
  include_str!("../migrations/0028_charges.sql"),
  include_str!("../migrations/0029_bot_mkt.sql"),
  include_str!("../migrations/0030_briefings.sql"),
  include_str!("../migrations/0031_bot_docs.sql"),
  include_str!("../migrations/0032_biz_models.sql"),
  include_str!("../migrations/0033_imports.sql"),
  include_str!("../migrations/0034_automations.sql"),
  include_str!("../migrations/0035_import_keep.sql"),
];

pub type Result<T> = std::result::Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
  e.to_string()
}

pub fn open(path: &Path) -> Result<Connection> {
  open_keyed(path, None)
}

// ---------- Banco criptografado (SQLite3 Multiple Ciphers, ver vendor/libsqlite3-sys) ----------
// A chave do banco é aleatória e fica no Cofre do Windows (lib.rs). A senha da trava só libera a interface.
// Backups locais (VACUUM INTO) saem cifrados com a mesma chave. O backup na nuvem pega uma cópia EM CLARO
// num temporário (export_plain) e cifra com a chave dele.

static APP_KEY: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Guarda a chave do banco do app (uma vez, na abertura).
pub fn set_app_key(key: String) {
  let _ = APP_KEY.set(key);
}

/// A chave do banco do app, se ele é cifrado. Nos testes fica vazia.
pub fn app_key() -> Option<&'static str> {
  APP_KEY.get().map(String::as_str)
}

/// Abre o banco; com `key`, ele é cifrado (a chave tem de vir antes de qualquer leitura).
pub fn open_keyed(path: &Path, key: Option<&str>) -> Result<Connection> {
  let c = Connection::open(path).map_err(err)?;
  if let Some(k) = key {
    c.pragma_update(None, "key", k).map_err(err)?;
  }
  c.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
    .map_err(|e| if key.is_some() { format!("não foi possível abrir o banco com a chave do Cofre: {e}") } else { e.to_string() })?;
  Ok(c)
}

fn readable(c: &Connection) -> bool {
  c.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0)).is_ok()
}

/// Abre só para ler um arquivo que pode estar cifrado com `key` ou em claro (backups antigos, temporários
/// da nuvem). Devolve a conexão e se ele estava cifrado.
pub fn open_any(path: &Path, key: Option<&str>) -> Result<(Connection, bool)> {
  use rusqlite::OpenFlags;
  if !path.is_file() {
    return Err(format!("arquivo não encontrado: {}", path.display()));
  }
  if let Some(k) = key {
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
    if c.pragma_update(None, "key", k).is_ok() && readable(&c) {
      return Ok((c, true));
    }
  }
  let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
  if readable(&c) {
    return Ok((c, false));
  }
  Err("o arquivo não é um banco válido (ou está cifrado com outra chave)".into())
}

/// URI de arquivo com a chave do Multiple Ciphers (`key=` vazio = em claro). Usada no VACUUM INTO.
fn key_uri(path: &Path, key: Option<&str>) -> String {
  let mut p = String::new();
  for ch in path.to_string_lossy().chars() {
    match ch {
      '\\' => p.push('/'),
      '%' | '?' | '#' | ' ' | '&' | '=' => p.push_str(&format!("%{:02X}", ch as u32)),
      _ => p.push(ch),
    }
  }
  let k: String = key.unwrap_or("").bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
  format!("file:{p}?key={k}")
}

/// Cópia consistente do banco EM CLARO em `dest` (para o backup na nuvem cifrar com a chave dele).
/// Quem chama apaga o arquivo logo depois.
#[cfg_attr(not(pro), allow(dead_code))] // usado pelo backup na nuvem e pelos dois computadores (Pro)
pub fn export_plain(c: &Connection, dest: &Path) -> Result<()> {
  let _ = fs::remove_file(dest);
  c.execute("VACUUM INTO ?1", [key_uri(dest, None)]).map_err(err)?;
  Ok(())
}

/// ATTACH de outro banco na conexão: com `key`, cifrado; sem, em claro (KEY '' é preciso quando a
/// conexão principal é cifrada, senão o SQLite tenta a chave dela).
#[cfg_attr(not(pro), allow(dead_code))] // usado pelo backup na nuvem e pelos dois computadores (Pro)
pub fn attach(c: &Connection, path: &Path, alias: &str, key: Option<&str>) -> Result<()> {
  if alias.is_empty() || !alias.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
    return Err("apelido de banco inválido".into());
  }
  c.execute(&format!("ATTACH DATABASE ?1 AS {alias} KEY ?2"), (path.to_string_lossy().to_string(), key.unwrap_or("")))
    .map_err(err)?;
  Ok(())
}

/// O banco em `path` está em claro? (arquivo inexistente conta como não.)
pub fn is_plain(path: &Path) -> bool {
  path.is_file() && matches!(open_any(path, None), Ok((_, false)))
}

/// Cifra no lugar um banco em claro (que ninguém mais tem aberto). O WAL é desligado antes, para o
/// rekey valer para o arquivo inteiro; quem abrir depois com open_keyed religa.
pub fn encrypt_in_place(path: &Path, key: &str) -> Result<()> {
  let c = Connection::open(path).map_err(err)?;
  c.execute_batch("PRAGMA journal_mode = DELETE;").map_err(err)?;
  c.pragma_update(None, "rekey", key).map_err(err)?;
  drop(c);
  match open_any(path, Some(key))? {
    (_, true) => Ok(()),
    _ => Err("o banco continuou em claro depois de cifrar".into()),
  }
}

pub fn schema_version(c: &Connection) -> Result<usize> {
  let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(err)?;
  Ok(v as usize)
}

/// Quantas migrações faltam. Erro se o banco veio de uma versão mais nova do app.
pub fn pending(c: &Connection) -> Result<usize> {
  let v = schema_version(c)?;
  if v > MIGRATIONS.len() {
    return Err(format!(
      "O banco está na versão {v} do esquema, mais nova que esta versão do Tesseract ({}). Atualize o app.",
      MIGRATIONS.len()
    ));
  }
  Ok(MIGRATIONS.len() - v)
}

/// Aplica as migrações pendentes, cada uma na sua transação. Devolve quantas aplicou.
pub fn migrate(c: &mut Connection) -> Result<usize> {
  let todo = pending(c)?;
  let from = schema_version(c)?;
  for (i, sql) in MIGRATIONS.iter().enumerate().skip(from) {
    let tx = c.transaction().map_err(err)?;
    tx.execute_batch(sql).map_err(|e| format!("migração {}: {e}", i + 1))?;
    tx.pragma_update(None, "user_version", (i + 1) as i64).map_err(err)?;
    tx.commit().map_err(err)?;
  }
  Ok(todo)
}

pub fn audit(c: &Connection, action: &str, detail: serde_json::Value) -> Result<()> {
  c.execute("INSERT INTO audit_log (action, detail) VALUES (?1, ?2)", (action, detail.to_string()))
    .map_err(err)?;
  Ok(())
}

// ---------- Configurações (chave → JSON) ----------

pub fn get_setting(c: &Connection, key: &str) -> Result<Option<serde_json::Value>> {
  let raw: Option<String> = c
    .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
    .optional()
    .map_err(err)?;
  Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

pub fn set_setting(c: &Connection, key: &str, value: &serde_json::Value) -> Result<()> {
  c.execute(
    "INSERT INTO settings (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    (key, value.to_string()),
  )
  .map_err(err)?;
  Ok(())
}

// ---------- Backups ----------

#[derive(Serialize, Clone, Debug)]
pub struct BackupFile {
  pub name: String,
  pub path: String,
  pub bytes: u64,
  /// Segundos desde 1970 (UTC).
  pub modified: u64,
}

const PREFIX: &str = "tesseract-";

pub fn list_backups(dir: &Path) -> Result<Vec<BackupFile>> {
  let mut out = Vec::new();
  let Ok(entries) = fs::read_dir(dir) else { return Ok(out) };
  for e in entries.flatten() {
    let name = e.file_name().to_string_lossy().to_string();
    if !(name.starts_with(PREFIX) && name.ends_with(".db")) {
      continue;
    }
    let Ok(meta) = e.metadata() else { continue };
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
    out.push(BackupFile { name, path: e.path().to_string_lossy().to_string(), bytes: meta.len(), modified });
  }
  // O nome começa com data e hora, então ordem alfabética = ordem cronológica. Mais novo primeiro.
  out.sort_by(|a, b| b.name.cmp(&a.name));
  Ok(out)
}

/// Cria um backup consistente com VACUUM INTO e apaga os mais antigos além de `keep`.
/// `reason` vira sufixo do nome (manual, auto, pre-migracao).
pub fn backup(c: &Connection, dir: &Path, reason: &str, keep: usize) -> Result<BackupFile> {
  fs::create_dir_all(dir).map_err(err)?;
  let stamp: String = c
    .query_row("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')", [], |r| r.get(0))
    .map_err(err)?;
  let mut path: PathBuf = dir.join(format!("{PREFIX}{stamp}-{reason}.db"));
  let mut n = 2;
  while path.exists() {
    path = dir.join(format!("{PREFIX}{stamp}-{reason}-{n}.db"));
    n += 1;
  }
  c.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()]).map_err(err)?;

  let all = list_backups(dir)?;
  for old in all.iter().skip(keep.max(1)) {
    let _ = fs::remove_file(&old.path);
  }
  let meta = fs::metadata(&path).map_err(err)?;
  let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
  Ok(BackupFile {
    name: path.file_name().unwrap().to_string_lossy().to_string(),
    path: path.to_string_lossy().to_string(),
    bytes: meta.len(),
    modified,
  })
}

/// Encontra um backup pelo nome, só dentro da pasta de backups (nome com barra ou ".." é recusado).
pub fn find_backup(dir: &Path, name: &str) -> Result<PathBuf> {
  if name.contains(['/', '\\']) || name.contains("..") || !name.starts_with(PREFIX) || !name.ends_with(".db") {
    return Err("nome de backup inválido".into());
  }
  let p = dir.join(name);
  if !p.is_file() {
    return Err(format!("backup não encontrado: {name}"));
  }
  Ok(p)
}

/// Restaura `src` sobre o banco aberto `c`, sem fechar a conexão (API de backup do SQLite).
/// 1. confere o arquivo (integridade e versão do esquema);
/// 2. copia para um temporário cifrado com a chave de `c` (`key`), para a rotação de backups não apagar a
///    origem no meio do caminho e porque a API de backup só copia entre bancos com a mesma cifra;
/// 3. faz um backup de segurança do estado atual ("pre-restauracao");
/// 4. sobrescreve o banco e aplica migrações, se o backup for de uma versão anterior.
/// A origem pode estar cifrada com `key` ou em claro (backups de antes da cifragem, temporários da nuvem).
/// Devolve o nome do backup de segurança.
pub fn restore(c: &mut Connection, src: &Path, dir: &Path, keep: usize, key: Option<&str>) -> Result<String> {
  use rusqlite::backup::Backup;
  use std::time::Duration;

  let (source, _) = open_any(src, key)?;
  let ok: String = source.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|_| "o arquivo não é um banco válido".to_string())?;
  if ok != "ok" {
    return Err(format!("backup corrompido: {ok}"));
  }
  let v = schema_version(&source)?;
  if v > MIGRATIONS.len() {
    return Err(format!("backup de uma versão mais nova do Tesseract (esquema {v}); atualize o app"));
  }

  fs::create_dir_all(dir).map_err(err)?;
  let tmp = dir.join(format!(".restaurando-{}.db", std::process::id()));
  let _ = fs::remove_file(&tmp);
  let r = (|| -> Result<String> {
    source.execute("VACUUM INTO ?1", [key_uri(&tmp, key)]).map_err(err)?;
    let snapshot = open_keyed(&tmp, key)?;
    let safety = backup(c, dir, "pre-restauracao", keep + 1)?;
    Backup::new(&snapshot, c).map_err(err)?.run_to_completion(256, Duration::ZERO, None).map_err(err)?;
    migrate(c)?;
    Ok(safety.name)
  })();
  drop(source);
  for ext in ["", "-wal", "-shm"] {
    let _ = fs::remove_file(format!("{}{ext}", tmp.to_string_lossy()));
  }
  r
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("tesseract-test-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
  }

  #[test]
  fn migra_do_zero_e_e_idempotente() {
    let dir = temp_dir("migra");
    let mut c = open(&dir.join("t.db")).unwrap();
    assert_eq!(pending(&c).unwrap(), MIGRATIONS.len());
    assert_eq!(migrate(&mut c).unwrap(), MIGRATIONS.len());
    assert_eq!(schema_version(&c).unwrap(), MIGRATIONS.len());
    assert_eq!(migrate(&mut c).unwrap(), 0);
    set_setting(&c, "backup.keep", &serde_json::json!(5)).unwrap();
    assert_eq!(get_setting(&c, "backup.keep").unwrap(), Some(serde_json::json!(5)));
  }

  #[test]
  fn restaura_backup_com_o_banco_aberto() {
    let dir = temp_dir("restore");
    let bdir = dir.join("backups");
    let mut c = open(&dir.join("t.db")).unwrap();
    migrate(&mut c).unwrap();
    c.execute("INSERT INTO organizations (id, name) VALUES ('a', 'Antes')", []).unwrap();
    let b = backup(&c, &bdir, "manual", 1).unwrap();
    c.execute("UPDATE organizations SET name = 'Depois' WHERE id = 'a'", []).unwrap();
    c.execute("INSERT INTO organizations (id, name) VALUES ('b', 'Nova')", []).unwrap();

    // keep = 1: o backup de segurança faria a rotação apagar a origem; a cópia em memória protege.
    let src = find_backup(&bdir, &b.name).unwrap();
    let safety = restore(&mut c, &src, &bdir, 1, None).unwrap();
    let name: String = c.query_row("SELECT name FROM organizations WHERE id = 'a'", [], |r| r.get(0)).unwrap();
    let count: i64 = c.query_row("SELECT count(*) FROM organizations", [], |r| r.get(0)).unwrap();
    assert_eq!((name.as_str(), count), ("Antes", 1));
    assert_eq!(schema_version(&c).unwrap(), MIGRATIONS.len());

    // o estado de antes da restauração ficou guardado
    let saved = Connection::open(find_backup(&bdir, &safety).unwrap()).unwrap();
    let name: String = saved.query_row("SELECT name FROM organizations WHERE id = 'a'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Depois");

    assert!(find_backup(&bdir, "../t.db").is_err());
    assert!(find_backup(&bdir, "outro.db").is_err());
  }

  #[test]
  fn recusa_banco_mais_novo() {
    let dir = temp_dir("novo");
    let c = open(&dir.join("t.db")).unwrap();
    c.pragma_update(None, "user_version", 999).unwrap();
    assert!(pending(&c).is_err());
  }

  #[test]
  fn backup_le_os_dados_e_roda() {
    let dir = temp_dir("backup");
    let mut c = open(&dir.join("t.db")).unwrap();
    migrate(&mut c).unwrap();
    c.execute("INSERT INTO organizations (id, name) VALUES ('x', 'Org X')", []).unwrap();
    let bdir = dir.join("backups");
    for _ in 0..4 {
      backup(&c, &bdir, "manual", 3).unwrap();
    }
    let files = list_backups(&bdir).unwrap();
    assert_eq!(files.len(), 3);
    let copy = Connection::open(&files[0].path).unwrap();
    let name: String = copy.query_row("SELECT name FROM organizations WHERE id = 'x'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Org X");
    assert_eq!(schema_version(&copy).unwrap(), MIGRATIONS.len());
  }
  const K: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  #[test]
  fn banco_cifrado_backup_restauracao_e_export() {
    let dir = temp_dir("cifrado");
    let bdir = dir.join("backups");
    let main = dir.join("t.db");
    let mut c = open_keyed(&main, Some(K)).unwrap();
    migrate(&mut c).unwrap();
    c.execute("INSERT INTO organizations (id, name) VALUES ('a', 'Antes')", []).unwrap();
    // sem a chave, ninguém lê; o backup local sai cifrado
    assert!(open_any(&main, None).is_err());
    assert!(open_any(&main, Some("outra")).is_err());
    let b = backup(&c, &bdir, "manual", 3).unwrap();
    assert!(matches!(open_any(Path::new(&b.path), Some(K)), Ok((_, true))));
    assert!(open_any(Path::new(&b.path), None).is_err());
    // a cópia para a nuvem sai em claro
    let plain = dir.join("nuvem.db");
    export_plain(&c, &plain).unwrap();
    assert!(is_plain(&plain));

    // restaura do backup cifrado e de um arquivo em claro
    c.execute("UPDATE organizations SET name = 'Depois' WHERE id = 'a'", []).unwrap();
    restore(&mut c, Path::new(&b.path), &bdir, 3, Some(K)).unwrap();
    let name: String = c.query_row("SELECT name FROM organizations WHERE id = 'a'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Antes");
    c.execute("UPDATE organizations SET name = 'Outro' WHERE id = 'a'", []).unwrap();
    restore(&mut c, &plain, &bdir, 3, Some(K)).unwrap();
    let name: String = c.query_row("SELECT name FROM organizations WHERE id = 'a'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Antes");
    // o banco continua cifrado e nenhum temporário ficou para trás
    drop(c);
    assert!(matches!(open_any(&main, Some(K)), Ok((_, true))));
    let left: Vec<String> = fs::read_dir(&bdir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.starts_with(".restaurando")).collect();
    assert!(left.is_empty(), "{left:?}");

    // ATTACH: cifrado com a chave, em claro com KEY ''
    let c = open_keyed(&main, Some(K)).unwrap();
    attach(&c, &plain, "peek", None).unwrap();
    let n: i64 = c.query_row("SELECT count(*) FROM peek.organizations", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
    let p = Connection::open(&plain).unwrap();
    attach(&p, &main, "now", Some(K)).unwrap();
    let n: i64 = p.query_row("SELECT count(*) FROM now.organizations", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
    assert!(attach(&p, &main, "x; DROP", Some(K)).is_err());
  }

  #[test]
  fn cifra_banco_existente_no_lugar() {
    let dir = temp_dir("cifrar");
    let path = dir.join("t.db");
    {
      let mut c = open(&path).unwrap();
      migrate(&mut c).unwrap();
      c.execute("INSERT INTO organizations (id, name) VALUES ('x', 'Org X')", []).unwrap();
    }
    assert!(is_plain(&path));
    encrypt_in_place(&path, K).unwrap();
    assert!(!is_plain(&path));
    let c = open_keyed(&path, Some(K)).unwrap();
    let name: String = c.query_row("SELECT name FROM organizations WHERE id = 'x'", [], |r| r.get(0)).unwrap();
    assert_eq!(name, "Org X");
    assert_eq!(schema_version(&c).unwrap(), MIGRATIONS.len());
  }
}
