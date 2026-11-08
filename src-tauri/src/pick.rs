//! Arquivos e pastas escolhidos pela pessoa no diálogo do sistema.
//!
//! O diálogo é aberto aqui, no Rust, e o caminho escolhido fica liberado por pouco tempo e uma vez só.
//! Os comandos que gravam ou leem num caminho vindo da tela (exportar, salvar .ics, restaurar um
//! backup…) só aceitam um caminho liberado assim. Com isso, nem um script malicioso na tela consegue
//! gravar onde quiser (por exemplo, na pasta Inicializar do Windows): no máximo abre um diálogo, e
//! quem escolhe o lugar continua sendo a pessoa.
//!
//! A interface não tem mais permissão de abrir o diálogo por conta própria (capabilities/default.json):
//! todo diálogo passa por estes comandos, que também ficam travados com o app travado.
type Res<T> = Result<T, String>;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri_plugin_dialog::DialogExt;

/// Quanto tempo um caminho escolhido fica liberado.
const TTL: Duration = Duration::from_secs(10 * 60);
/// Pedidos de diálogo ao mesmo tempo não acumulam liberações sem fim.
const MAX_GRANTS: usize = 32;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
  Save,
  Open,
  Folder,
}

struct Grant {
  path: PathBuf,
  kind: Kind,
  at: Instant,
}

static GRANTS: Mutex<Vec<Grant>> = Mutex::new(Vec::new());

fn key(p: &Path) -> String {
  p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

fn grant(path: PathBuf, kind: Kind) {
  let mut g = GRANTS.lock().unwrap_or_else(|e| e.into_inner());
  g.retain(|x| x.at.elapsed() < TTL);
  if g.len() >= MAX_GRANTS {
    g.remove(0);
  }
  g.push(Grant { path, kind, at: Instant::now() });
}

/// Confere a liberação de `path` (do tipo pedido). Gravar (salvar, pasta) gasta a liberação; abrir
/// não, para a pessoa poder errar a senha do backup e tentar de novo com o mesmo arquivo. Erro se o
/// caminho não veio do diálogo, já foi usado ou passou do tempo.
fn take(path: &str, kind: Kind) -> Res<PathBuf> {
  let want = key(Path::new(path.trim()));
  let mut g = GRANTS.lock().unwrap_or_else(|e| e.into_inner());
  g.retain(|x| x.at.elapsed() < TTL);
  let i = g.iter().position(|x| x.kind == kind && key(&x.path) == want).ok_or("escolha o lugar de novo pela janela do sistema (o caminho não veio dela ou passou do tempo)")?;
  Ok(if kind == Kind::Open { g[i].path.clone() } else { g.remove(i).path })
}

fn ext_of(p: &Path) -> String {
  p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Caminho para salvar um arquivo `.ext`, escolhido no diálogo.
pub fn take_save(path: &str, ext: &str) -> Res<PathBuf> {
  let p = take(path, Kind::Save)?;
  if ext_of(&p) != ext.to_lowercase() {
    return Err(format!("salve com a extensão .{ext}"));
  }
  Ok(p)
}

/// Arquivo para abrir, escolhido no diálogo, com uma das extensões dadas (hoje só o Pro usa).
#[cfg_attr(not(pro), allow(dead_code))]
pub fn take_open(path: &str, exts: &[&str]) -> Res<PathBuf> {
  let p = take(path, Kind::Open)?;
  if !exts.iter().any(|e| ext_of(&p) == e.to_lowercase()) {
    return Err(format!("escolha um arquivo {}", exts.iter().map(|e| format!(".{e}")).collect::<Vec<_>>().join(" ou ")));
  }
  Ok(p)
}

/// Pasta escolhida no diálogo.
pub fn take_folder(path: &str) -> Res<PathBuf> {
  take(path, Kind::Folder)
}

fn clean_exts(exts: &[String]) -> Vec<String> {
  exts.iter().map(|e| e.trim().trim_start_matches('.').to_lowercase()).filter(|e| !e.is_empty() && e.len() <= 10 && e.chars().all(|c| c.is_ascii_alphanumeric())).collect()
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Res<T> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

fn into_path(f: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
  f.into_path().ok()
}

/// "Salvar como". Sem extensão no nome escolhido, põe a pedida.
#[tauri::command]
pub async fn pick_save(app: tauri::AppHandle, title: String, default_name: String, ext: String, label: String) -> Res<Option<String>> {
  let ext = clean_exts(&[ext]).pop().ok_or("extensão inválida")?;
  let name: String = default_name.chars().filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|')).take(120).collect();
  let e2 = ext.clone();
  let picked = blocking(move || app.dialog().file().set_title(title).set_file_name(name).add_filter(label, &[e2.as_str()]).blocking_save_file()).await?;
  let Some(mut p) = picked.and_then(into_path) else { return Ok(None) };
  if ext_of(&p) != ext {
    let mut s = p.into_os_string();
    s.push(format!(".{ext}"));
    p = PathBuf::from(s);
  }
  let out = p.to_string_lossy().to_string();
  grant(p, Kind::Save);
  Ok(Some(out))
}

/// "Abrir": um ou vários arquivos com as extensões dadas.
#[tauri::command]
pub async fn pick_open(app: tauri::AppHandle, title: String, label: String, exts: Vec<String>, multiple: bool) -> Res<Vec<String>> {
  let exts = clean_exts(&exts);
  if exts.is_empty() {
    return Err("extensão inválida".into());
  }
  let filters = exts.clone();
  let picked: Vec<PathBuf> = blocking(move || {
    let refs: Vec<&str> = filters.iter().map(String::as_str).collect();
    let d = app.dialog().file().set_title(title).add_filter(label, &refs);
    if multiple {
      d.blocking_pick_files().unwrap_or_default().into_iter().filter_map(into_path).collect()
    } else {
      d.blocking_pick_file().and_then(into_path).into_iter().collect()
    }
  })
  .await?;
  let mut out = Vec::new();
  for p in picked.into_iter().take(20) {
    if exts.contains(&ext_of(&p)) {
      out.push(p.to_string_lossy().to_string());
      grant(p, Kind::Open);
    }
  }
  Ok(out)
}

/// Escolher uma pasta.
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle, title: String) -> Res<Option<String>> {
  let picked = blocking(move || app.dialog().file().set_title(title).blocking_pick_folder()).await?;
  let Some(p) = picked.and_then(into_path) else { return Ok(None) };
  let out = p.to_string_lossy().to_string();
  grant(p, Kind::Folder);
  Ok(Some(out))
}

/// Para os testes: libera um caminho como se tivesse vindo do diálogo.
#[cfg(test)]
pub fn grant_for_test(path: &str, kind: &str) {
  grant(PathBuf::from(path), match kind {
    "save" => Kind::Save,
    "open" => Kind::Open,
    _ => Kind::Folder,
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn so_aceita_o_que_veio_do_dialogo_uma_vez() {
    assert!(take_save(r"C:\Users\x\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\a.ics", "ics").is_err(), "caminho inventado pela tela");
    grant_for_test(r"C:\Users\x\Documents\agenda.ics", "save");
    assert!(take_save(r"C:\Users\x\Documents\outra.ics", "ics").is_err(), "outro caminho");
    assert!(take_open(r"C:\Users\x\Documents\agenda.ics", &["ics"]).is_err(), "liberado para salvar, não para abrir");
    assert_eq!(take_save(r"c:/users/x/documents/AGENDA.ics", "ics").unwrap(), PathBuf::from(r"C:\Users\x\Documents\agenda.ics"), "mesmo caminho, outra grafia");
    assert!(take_save(r"C:\Users\x\Documents\agenda.ics", "ics").is_err(), "só uma vez");
  }

  #[test]
  fn confere_a_extensao() {
    grant_for_test(r"C:\Users\x\Documents\relatorio.bat", "save");
    assert!(take_save(r"C:\Users\x\Documents\relatorio.bat", "html").unwrap_err().contains(".html"));
    grant_for_test(r"C:\Users\x\Documents\b.tbak", "open");
    assert!(take_open(r"C:\Users\x\Documents\b.tbak", &["tbak"]).is_ok());
    assert!(take_open(r"C:\Users\x\Documents\b.tbak", &["tbak"]).is_ok(), "abrir não gasta (senha errada, tenta de novo)");
    assert!(take_open(r"C:\Users\x\Documents\c.tbak", &["tbak"]).is_err(), "outro arquivo não");
    grant_for_test(r"C:\Users\x\Documents\pasta", "folder");
    assert!(take_folder(r"C:\Users\x\Documents\pasta\").is_ok(), "barra no fim é o mesmo lugar");
  }

  #[test]
  fn extensoes_limpas() {
    assert_eq!(clean_exts(&[".JPG".into(), "mp4".into(), "../x".into(), "".into(), "exe;bat".into()]), vec!["jpg", "mp4"]);
  }
}
