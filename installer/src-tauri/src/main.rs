// Instalador próprio do Tesseract (fase 13, "cartão sobre a cena").
// Instala por usuário (sem administrador): extrai o app embutido, cria atalhos, registra em
// "Aplicativos instalados" e deixa a marca welcome.pending para o app abrir na boas-vindas.
// Com --uninstall, o mesmo .exe vira o desinstalador: ele se copia para a pasta temporária e roda
// de lá, para conseguir apagar a pasta do app.
//
// TESSERACT_SETUP_SANDBOX=<pasta> (teste): tudo vai para dentro dessa pasta (programa, atalhos,
// dados) e o registro usa uma chave própria fora de "Aplicativos instalados".
// Com --update (atualização automática, chamado pelo app): instala direto na pasta registrada,
// mantém os atalhos que existem, não mostra a boas-vindas de novo e abre o app no fim.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;

use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, State};
use winreg::RegKey;
use winreg::enums::HKEY_CURRENT_USER;

const PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.zst"));
const PAYLOAD_LEN: &str = env!("PAYLOAD_LEN");
const VERSION: &str = env!("TESSERACT_VERSION");
const APP_ID: &str = "dev.tesseract.app"; // pasta de dados do app (a mesma do tauri.conf.json)
const EXE: &str = "Tesseract.exe";
const UNINSTALLER: &str = "uninstall.exe";
const LINK: &str = "Tesseract.lnk";
const PUBLISHER: &str = "Lanzi Labs";
const SITE: &str = "https://lanzilabs.dev";
const NO_WINDOW: u32 = 0x0800_0000;

type Res<T> = Result<T, String>;

#[derive(Clone)]
struct Places {
  sandbox: bool,
  reg_key: String,
  default_dir: PathBuf,
  desktop: PathBuf,
  start_menu: PathBuf,
  data: Vec<PathBuf>, // [0] = dados (banco, backups, marca); os outros são caches do WebView
}

impl Places {
  fn new() -> Places {
    if let Some(sb) = std::env::var_os("TESSERACT_SETUP_SANDBOX").map(PathBuf::from) {
      return Places {
        sandbox: true,
        reg_key: r"Software\Lanzi Labs\TesseractSetupSandbox".into(),
        default_dir: sb.join("Programs").join("Tesseract"),
        desktop: sb.join("Desktop"),
        start_menu: sb.join("StartMenu"),
        data: vec![sb.join("Data").join(APP_ID)],
      };
    }
    let local = dirs::data_local_dir().unwrap_or_default();
    let roaming = dirs::data_dir().unwrap_or_default();
    Places {
      sandbox: false,
      reg_key: r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Tesseract".into(),
      default_dir: local.join("Tesseract"),
      desktop: dirs::desktop_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Desktop")),
      start_menu: roaming.join(r"Microsoft\Windows\Start Menu\Programs"),
      data: vec![roaming.join(APP_ID), local.join(APP_ID)],
    }
  }
}

#[derive(Clone)]
struct Ctx {
  places: Places,
  update: bool,
  uninstall: Option<PathBuf>, // pasta do app, quando rodando como desinstalador
  self_temp: Option<PathBuf>, // cópia temporária do desinstalador, apagada ao sair
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Installed {
  version: String,
  dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
  version: String,
  default_dir: String,
  installed: Option<Installed>,
  uninstall: bool,
  update: bool,
  desktop_link: bool,
  start_link: bool,
  has_payload: bool,
  sandbox: bool,
  data_dir: String,
}

#[derive(Serialize, Clone)]
struct Progress {
  phase: &'static str, // "app" ou "ai"
  pct: u32,
  status: String,
  detail: String,
}

fn emit(app: &AppHandle, pct: u32, status: &str) {
  let _ = app.emit("progress", Progress { phase: "app", pct, status: status.into(), detail: String::new() });
}

fn emit_ai(app: &AppHandle, pct: u32, status: &str, detail: String) {
  let _ = app.emit("progress", Progress { phase: "ai", pct, status: status.into(), detail });
}

fn installed(p: &Places) -> Option<(String, PathBuf, String)> {
  let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(&p.reg_key).ok()?;
  let dir: String = key.get_value("InstallLocation").ok()?;
  let version: String = key.get_value("DisplayVersion").unwrap_or_default();
  let bin: String = key.get_value("MainBinaryName").unwrap_or_default();
  Some((version, PathBuf::from(dir.trim_matches('"')), bin))
}

#[tauri::command]
fn setup_info(ctx: State<Ctx>) -> Info {
  let p = &ctx.places;
  let inst = installed(p);
  let default_dir = inst.as_ref().map(|(_, d, _)| d.clone()).unwrap_or_else(|| p.default_dir.clone());
  Info {
    version: VERSION.into(),
    default_dir: default_dir.display().to_string(),
    installed: inst.map(|(version, dir, _)| Installed { version, dir: dir.display().to_string() }),
    uninstall: ctx.uninstall.is_some(),
    update: ctx.update,
    desktop_link: p.desktop.join(LINK).exists(),
    start_link: p.start_menu.join(LINK).exists(),
    has_payload: !PAYLOAD.is_empty(),
    sandbox: p.sandbox,
    data_dir: p.data[0].display().to_string(),
  }
}

// Fecha o Tesseract que estiver rodando a partir desta pasta (só ele: o app de desenvolvimento e
// outros programas ficam em paz).
fn close_running(dir: &Path) {
  let d = dir.display().to_string().replace('\'', "''");
  let script = format!(
    "Get-Process | Where-Object {{ $_.Path -and $_.Path.StartsWith('{d}\\', 'OrdinalIgnoreCase') -and $_.Id -ne {pid} }} | Stop-Process -Force",
    pid = std::process::id()
  );
  let _ = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).creation_flags(NO_WINDOW).status();
  std::thread::sleep(std::time::Duration::from_millis(400));
}

fn extract(app: &AppHandle, target: &Path) -> Res<u64> {
  let total: u64 = PAYLOAD_LEN.parse().unwrap_or(0);
  let tmp = target.with_extension("exe.novo");
  let mut dec = zstd::stream::read::Decoder::new(PAYLOAD).map_err(|e| e.to_string())?;
  let mut out = fs::File::create(&tmp).map_err(|e| format!("não deu para gravar em {}: {e}", tmp.display()))?;
  let mut buf = vec![0u8; 256 * 1024];
  let mut done = 0u64;
  loop {
    let n = dec.read(&mut buf).map_err(|e| format!("pacote do instalador corrompido: {e}"))?;
    if n == 0 {
      break;
    }
    out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    done += n as u64;
    if total > 0 {
      emit(app, 10 + (done * 70 / total) as u32, "Copiando o Tesseract");
    }
  }
  out.sync_all().map_err(|e| e.to_string())?;
  drop(out);
  if target.exists() {
    fs::remove_file(target).map_err(|_| "o Tesseract ainda está aberto. Feche o app e tente de novo.".to_string())?;
  }
  fs::rename(&tmp, target).map_err(|e| e.to_string())?;
  Ok(done)
}

fn shortcut(target: &Path, link: &Path) -> Res<()> {
  if let Some(parent) = link.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut sl = mslnk::ShellLink::new(target).map_err(|e| e.to_string())?;
  sl.set_working_dir(target.parent().map(|p| p.display().to_string()));
  sl.set_name(Some("Tesseract".into()));
  sl.create_lnk(link).map_err(|e| format!("atalho {}: {e}", link.display()))
}

fn register(p: &Places, dir: &Path, size: u64) -> Res<()> {
  let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(&p.reg_key).map_err(|e| e.to_string())?;
  let q = |f: &str| format!("\"{}\"", dir.join(f).display());
  let set = |k: &str, v: String| key.set_value(k, &v).map_err(|e| e.to_string());
  set("DisplayName", "Tesseract".into())?;
  set("DisplayVersion", VERSION.into())?;
  set("DisplayIcon", q(EXE))?;
  set("Publisher", PUBLISHER.into())?;
  set("InstallLocation", format!("\"{}\"", dir.display()))?;
  set("UninstallString", format!("{} --uninstall", q(UNINSTALLER)))?;
  set("MainBinaryName", EXE.into())?;
  set("URLInfoAbout", SITE.into())?;
  set("HelpLink", SITE.into())?;
  key.set_value("NoModify", &1u32).map_err(|e| e.to_string())?;
  key.set_value("NoRepair", &1u32).map_err(|e| e.to_string())?;
  key.set_value("EstimatedSize", &((size / 1024) as u32)).map_err(|e| e.to_string())?;
  Ok(())
}

fn do_install(app: &AppHandle, p: &Places, dir: &Path, desktop: bool, start_menu: bool, welcome: bool) -> Res<()> {
  if PAYLOAD.is_empty() {
    return Err("este instalador foi gerado sem o app dentro (versão de teste da interface)".into());
  }
  emit(app, 2, "Preparando a pasta");
  fs::create_dir_all(dir).map_err(|e| format!("não deu para criar {}: {e}", dir.display()))?;
  let previous = installed(p);
  emit(app, 6, "Fechando o Tesseract, se estiver aberto");
  close_running(dir);
  if let Some((_, old_dir, _)) = &previous {
    if old_dir != dir {
      close_running(old_dir);
    }
  }

  let exe = dir.join(EXE);
  let size = extract(app, &exe)?;

  emit(app, 82, "Preparando o desinstalador");
  let me = std::env::current_exe().map_err(|e| e.to_string())?;
  let uninstaller = dir.join(UNINSTALLER);
  if me != uninstaller {
    fs::copy(&me, &uninstaller).map_err(|e| format!("desinstalador: {e}"))?;
  }
  // restos do instalador antigo (NSIS): app.exe no lugar do Tesseract.exe
  if let Some((_, old_dir, bin)) = &previous {
    if !bin.is_empty() && bin != EXE {
      let _ = fs::remove_file(old_dir.join(bin));
    }
  }

  emit(app, 88, "Criando os atalhos");
  for (want, folder) in [(desktop, &p.desktop), (start_menu, &p.start_menu)] {
    let link = folder.join(LINK);
    if want {
      shortcut(&exe, &link)?;
    } else {
      let _ = fs::remove_file(&link);
    }
  }

  emit(app, 94, "Registrando em Aplicativos instalados");
  register(p, dir, size)?;

  // marca da boas-vindas: o app mostra a tela na primeira abertura e apaga a marca
  if welcome {
    write_marker(p, None)?;
  }

  emit(app, 100, "Tudo pronto");
  Ok(())
}

// welcome.pending: "1", ou {"model": "..."} quando o instalador baixou um modelo de conversa (o app
// escolhe esse modelo em Configurações > IA se ainda não houver um).
fn write_marker(p: &Places, model: Option<&str>) -> Res<()> {
  let data = &p.data[0];
  fs::create_dir_all(data).map_err(|e| e.to_string())?;
  let body = match model {
    Some(m) => serde_json::json!({ "model": m }).to_string(),
    None => "1".into(),
  };
  fs::write(data.join("welcome.pending"), body).map_err(|e| e.to_string())
}

// Etapa da IA, depois do app instalado: cada falha vira um aviso e não desfaz nada.
fn do_ai(app: &AppHandle, p: &Places, items: &[String], chat_model: Option<&str>, welcome: bool) -> Vec<String> {
  use std::sync::atomic::Ordering;
  ai::SKIP.store(false, Ordering::Relaxed);
  let mut warnings = Vec::new();
  let skipped = "A IA foi pulada. Dá para baixar depois em Configurações > IA.".to_string();
  let info = ai::info();
  let mut ready = info.ollama_running();
  if items.iter().any(|i| i == "ollama") && !info.ollama_installed() {
    match ai::install_ollama(&|pct, st, d| emit_ai(app, pct, st, d)) {
      Ok(()) => {}
      Err(e) if e == "pulado" => { warnings.push(skipped); return warnings; }
      Err(e) => { warnings.push(format!("Ollama: {e}")); return warnings; }
    }
  }
  let models: Vec<&String> = items.iter().filter(|i| *i != "ollama").collect();
  if !models.is_empty() && !ready {
    emit_ai(app, 0, "Ligando o Ollama", String::new());
    match ai::ensure_running() {
      Ok(()) => ready = true,
      Err(e) => warnings.push(format!("Ollama: {e}")),
    }
  }
  let mut chat_ok = None;
  if ready {
    let have = ai::info().models();
    for (i, id) in models.iter().enumerate() {
      let is_chat = Some(id.as_str()) == chat_model;
      if ai::has(&have, id) {
        if is_chat { chat_ok = chat_model; }
        continue;
      }
      let label = format!("Baixando {id} ({} de {})", i + 1, models.len());
      emit_ai(app, 0, &label, String::new());
      match ai::pull(id, &|pct, _, d| emit_ai(app, pct, &label, d)) {
        Ok(()) => if is_chat { chat_ok = chat_model; },
        Err(e) if e == "pulado" => { warnings.push(skipped); break; }
        Err(e) => warnings.push(e),
      }
    }
  }
  if welcome {
    let _ = write_marker(p, chat_ok);
  }
  warnings
}

#[tauri::command]
async fn setup_install(app: AppHandle, ctx: State<'_, Ctx>, dir: String, desktop: bool, start_menu: bool, ai: Vec<String>, chat_model: Option<String>) -> Res<Vec<String>> {
  let p = ctx.places.clone();
  let welcome = !ctx.update;
  let dir = PathBuf::from(dir.trim());
  if !dir.is_absolute() {
    return Err("escolha uma pasta completa, como C:\\Users\\voce\\AppData\\Local\\Tesseract".into());
  }
  tauri::async_runtime::spawn_blocking(move || {
    do_install(&app, &p, &dir, desktop, start_menu, welcome)?;
    Ok(if ai.is_empty() { Vec::new() } else { do_ai(&app, &p, &ai, chat_model.as_deref(), welcome) })
  })
  .await
  .map_err(|e| e.to_string())?
}

/// A IA no computador é do Pro (decidido em 2026-11-07). Instalador com a licença ligada no build
/// (`--com-licenca`): a etapa só aparece se esta pasta de dados já tem uma licença (reinstalação ou
/// atualização de quem assina); quem instala pela primeira vez baixa depois, em Configurações › IA,
/// já com o Pro ativo. Sem a chave no build (beta), aparece para todos. Não confere a assinatura:
/// o que se ganha burlando é só baixar modelos grátis do Ollama; o app confere de verdade.
fn ai_allowed(p: &Places) -> bool {
  option_env!("TESSERACT_LICENSE_PUBKEY").is_none() || p.data.iter().any(|d| has_license(d))
}
fn has_license(data: &Path) -> bool {
  fs::read(data.join("licenca.json"))
    .ok()
    .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
    .and_then(|v| v["token"].as_str().map(|t| t.starts_with("TESS1.")))
    .unwrap_or(false)
}

#[tauri::command]
async fn setup_ai_info(ctx: State<'_, Ctx>) -> Result<Option<ai::AiInfo>, ()> {
  if !ai_allowed(&ctx.places) {
    return Ok(None);
  }
  Ok(Some(tauri::async_runtime::spawn_blocking(ai::info).await.unwrap_or_else(|_| ai::info())))
}

#[tauri::command]
fn setup_skip_ai() {
  ai::SKIP.store(true, std::sync::atomic::Ordering::Relaxed);
}

// Quando a pessoa escolhe uma pasta, o app vai para uma subpasta Tesseract dentro dela.
#[tauri::command]
fn setup_pick_dir(chosen: String) -> String {
  let p = PathBuf::from(&chosen);
  if p.file_name().is_some_and(|n| n.eq_ignore_ascii_case("tesseract")) { chosen } else { p.join("Tesseract").display().to_string() }
}

#[tauri::command]
fn setup_open(app: AppHandle, dir: String) -> Res<()> {
  let dir = PathBuf::from(dir);
  Command::new(dir.join(EXE)).current_dir(&dir).spawn().map_err(|e| format!("não deu para abrir o Tesseract: {e}"))?;
  app.exit(0);
  Ok(())
}

fn do_uninstall(app: &AppHandle, p: &Places, dir: &Path, delete_data: bool) -> Res<()> {
  emit(app, 5, "Fechando o Tesseract, se estiver aberto");
  close_running(dir);
  emit(app, 30, "Removendo o programa");
  // só os arquivos do app: a pasta pode ter sido escolhida pela pessoa e ter outras coisas
  for f in [EXE, UNINSTALLER, "app.exe"] {
    let path = dir.join(f);
    if path.exists() {
      fs::remove_file(&path).map_err(|e| format!("não deu para apagar {}: {e}", path.display()))?;
    }
  }
  let _ = fs::remove_dir(dir); // só sai se ficou vazia
  emit(app, 60, "Removendo os atalhos");
  for folder in [&p.desktop, &p.start_menu] {
    let _ = fs::remove_file(folder.join(LINK));
  }
  let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&p.reg_key);
  if delete_data {
    emit(app, 80, "Apagando os dados do app");
    for d in &p.data {
      if d.ends_with(APP_ID) && d.exists() {
        fs::remove_dir_all(d).map_err(|e| format!("não deu para apagar {}: {e}", d.display()))?;
      }
    }
  }
  emit(app, 100, "Pronto");
  Ok(())
}

#[tauri::command]
async fn setup_uninstall(app: AppHandle, ctx: State<'_, Ctx>, delete_data: bool) -> Res<()> {
  let p = ctx.places.clone();
  let dir = ctx.uninstall.clone().ok_or("este instalador não está no modo de desinstalar")?;
  tauri::async_runtime::spawn_blocking(move || do_uninstall(&app, &p, &dir, delete_data))
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn setup_quit(app: AppHandle) {
  app.exit(0);
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
  args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn main() {
  let args: Vec<String> = std::env::args().collect();
  let mut uninstall = None;
  let mut self_temp = None;
  if args.iter().any(|a| a == "--uninstall") {
    match arg_value(&args, "--dir") {
      // segunda etapa: rodando da pasta temporária
      Some(dir) => {
        uninstall = Some(PathBuf::from(dir));
        self_temp = std::env::current_exe().ok();
      }
      // primeira etapa: copia para a pasta temporária e roda de lá (o .exe aberto não se apaga)
      None => {
        let me = std::env::current_exe().expect("caminho do desinstalador");
        let dir = me.parent().expect("pasta do app").to_path_buf();
        let temp = std::env::temp_dir().join(format!("tesseract-desinstalar-{}.exe", std::process::id()));
        if fs::copy(&me, &temp).is_ok() && Command::new(&temp).args(["--uninstall", "--dir"]).arg(&dir).spawn().is_ok() {
          return;
        }
        uninstall = Some(dir);
      }
    }
  }
  let update = args.iter().any(|a| a == "--update");
  let ctx = Ctx { places: Places::new(), update, uninstall, self_temp };
  let cleanup = ctx.self_temp.clone();

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(ctx)
    .setup(|app| {
      let c = app.state::<Ctx>();
      let title = if c.uninstall.is_some() { "Desinstalar o Tesseract" } else if c.update { "Atualizar o Tesseract" } else { "Instalar o Tesseract" };
      tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(760.0, 480.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .center()
        // o cache do WebView fica na pasta temporária, para não deixar restos no computador
        .data_directory(std::env::temp_dir().join("tesseract-setup-webview"))
        .build()?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![setup_info, setup_ai_info, setup_skip_ai, setup_install, setup_pick_dir, setup_open, setup_uninstall, setup_quit])
    .build(tauri::generate_context!())
    .expect("erro ao abrir o instalador")
    .run(move |_app, ev| {
      if let tauri::RunEvent::Exit = ev {
        // apaga a cópia temporária do desinstalador depois que ele fechar
        if let Some(t) = &cleanup {
          let _ = Command::new("cmd")
            .raw_arg(format!("/C ping 127.0.0.1 -n 3 > nul & del /f /q \"{}\"", t.display()))
            .creation_flags(NO_WINDOW)
            .spawn();
        }
      }
    });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn etapa_da_ia_so_com_licenca_na_pasta() {
    let d = std::env::temp_dir().join(format!("tess-setup-lic-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    assert!(!has_license(&d), "sem arquivo");
    fs::write(d.join("licenca.json"), r#"{"device":"a","token":""}"#).unwrap();
    assert!(!has_license(&d), "Grátis (token vazio)");
    fs::write(d.join("licenca.json"), r#"{"device":"a","token":"TESS1.x.y"}"#).unwrap();
    assert!(has_license(&d));
    fs::write(d.join("licenca.json"), "lixo").unwrap();
    assert!(!has_license(&d));
    let _ = fs::remove_dir_all(&d);
  }
}
