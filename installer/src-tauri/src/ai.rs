// Etapa "IA no seu computador (opcional)": memória do computador, o que já existe, download e
// instalação silenciosa do Ollama e download dos modelos pela API local (/api/pull). Nada fica
// embutido no instalador; cada item só é baixado se marcado. Falhas aqui não desfazem o app.
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub const OLLAMA: &str = "http://127.0.0.1:11434";
const OLLAMA_SETUP: &str = "https://ollama.com/download/OllamaSetup.exe";
const NO_WINDOW: u32 = 0x0800_0000;

pub static SKIP: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiInfo {
  ram_gb: u32,
  ollama_installed: bool,
  ollama_running: bool,
  models: Vec<String>,
}

impl AiInfo {
  pub fn ollama_running(&self) -> bool { self.ollama_running }
  pub fn ollama_installed(&self) -> bool { self.ollama_installed }
  pub fn models(self) -> Vec<String> { self.models }
}

pub fn ram_gb() -> u32 {
  use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
  let mut m: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
  m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
  if unsafe { GlobalMemoryStatusEx(&mut m) } == 0 {
    return 0;
  }
  ((m.ullTotalPhys as f64) / 1_073_741_824.0).round() as u32
}

fn ollama_dir() -> PathBuf {
  dirs::data_local_dir().unwrap_or_default().join(r"Programs\Ollama")
}

fn ollama_exe() -> Option<PathBuf> {
  let exe = ollama_dir().join("ollama.exe");
  if exe.exists() {
    return Some(exe);
  }
  // instalado em outro lugar e no PATH
  let out = Command::new("where").arg("ollama").creation_flags(NO_WINDOW).output().ok()?;
  String::from_utf8_lossy(&out.stdout).lines().next().map(|l| PathBuf::from(l.trim())).filter(|p| p.exists())
}

fn agent(read_s: u64) -> ureq::Agent {
  ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(5)).timeout_read(Duration::from_secs(read_s)).build()
}

fn tags() -> Option<Vec<String>> {
  let v: Value = agent(4).get(&format!("{OLLAMA}/api/tags")).call().ok()?.into_json().ok()?;
  Some(v["models"].as_array()?.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
}

/// "bge-m3" no catálogo aparece como "bge-m3:latest" no Ollama.
pub fn has(models: &[String], id: &str) -> bool {
  let want = if id.contains(':') { id.to_string() } else { format!("{id}:latest") };
  models.iter().any(|m| *m == want)
}

pub fn info() -> AiInfo {
  let models = tags();
  AiInfo { ram_gb: ram_gb(), ollama_installed: ollama_exe().is_some(), ollama_running: models.is_some(), models: models.unwrap_or_default() }
}

fn gb(b: u64) -> String {
  format!("{:.1}", b as f64 / 1_073_741_824.0).replace('.', ",")
}

/// Baixa e instala o Ollama em silêncio (por usuário, sem administrador).
pub fn install_ollama(progress: &dyn Fn(u32, &str, String)) -> Result<(), String> {
  let resp = agent(60).get(OLLAMA_SETUP).call().map_err(|e| format!("não deu para baixar o Ollama: {e}"))?;
  let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
  let tmp = std::env::temp_dir().join("OllamaSetup-tesseract.exe");
  let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
  let mut reader = resp.into_reader();
  let mut buf = vec![0u8; 256 * 1024];
  let mut done = 0u64;
  let mut last = Instant::now();
  loop {
    if SKIP.load(Ordering::Relaxed) {
      drop(file);
      let _ = fs::remove_file(&tmp);
      return Err("pulado".into());
    }
    let n = reader.read(&mut buf).map_err(|e| format!("download do Ollama interrompido: {e}"))?;
    if n == 0 {
      break;
    }
    file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    done += n as u64;
    if last.elapsed() > Duration::from_millis(200) && total > 0 {
      last = Instant::now();
      progress((done * 90 / total) as u32, "Baixando o Ollama", format!("{} de {} GB", gb(done), gb(total)));
    }
  }
  drop(file);
  progress(92, "Instalando o Ollama", String::new());
  let ok = Command::new(&tmp)
    .args(["/VERYSILENT", "/NORESTART", "/SUPPRESSMSGBOXES", "/SP-"])
    .status()
    .map_err(|e| format!("não deu para abrir o instalador do Ollama: {e}"))?
    .success();
  let _ = fs::remove_file(&tmp);
  if !ok {
    return Err("o instalador do Ollama não terminou".into());
  }
  Ok(())
}

/// Garante o Ollama respondendo em 127.0.0.1:11434 (abre o app dele se precisar).
pub fn ensure_running() -> Result<(), String> {
  if tags().is_some() {
    return Ok(());
  }
  let tray = ollama_dir().join("ollama app.exe");
  if tray.exists() {
    let _ = Command::new(&tray).spawn();
  } else if let Some(exe) = ollama_exe() {
    let _ = Command::new(exe).arg("serve").creation_flags(NO_WINDOW).spawn();
  } else {
    return Err("o Ollama não está instalado".into());
  }
  let start = Instant::now();
  while start.elapsed() < Duration::from_secs(60) {
    if tags().is_some() {
      return Ok(());
    }
    std::thread::sleep(Duration::from_millis(700));
  }
  Err("o Ollama não respondeu em 127.0.0.1:11434".into())
}

/// Baixa um modelo pela API do Ollama, com o progresso de cada camada.
pub fn pull(id: &str, progress: &dyn Fn(u32, &str, String)) -> Result<(), String> {
  let resp = agent(300)
    .post(&format!("{OLLAMA}/api/pull"))
    .send_json(json!({ "model": id, "stream": true }))
    .map_err(|e| format!("{id}: {e}"))?;
  let mut parts: std::collections::HashMap<String, (u64, u64)> = std::collections::HashMap::new();
  let mut last = Instant::now();
  for line in BufReader::new(resp.into_reader()).lines() {
    if SKIP.load(Ordering::Relaxed) {
      return Err("pulado".into());
    }
    let line = line.map_err(|e| format!("{id}: download interrompido ({e})"))?;
    let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
    if let Some(err) = v["error"].as_str() {
      return Err(format!("{id}: {err}"));
    }
    let status = v["status"].as_str().unwrap_or("");
    if status == "success" {
      return Ok(());
    }
    // o Ollama baixa o modelo em partes (camadas): soma todas para a barra mostrar o modelo inteiro
    if let (Some(d), Some(t)) = (v["digest"].as_str(), v["total"].as_u64()) {
      parts.insert(d.to_string(), (t, v["completed"].as_u64().unwrap_or(0)));
    }
    let (total, done) = parts.values().fold((0u64, 0u64), |(t, c), (pt, pc)| (t + pt, c + pc));
    if total > 1_000_000 && last.elapsed() > Duration::from_millis(200) {
      last = Instant::now();
      progress((done * 100 / total) as u32, "", format!("{} de {} GB", gb(done), gb(total)));
    } else if status.starts_with("verifying") || status.starts_with("writing") {
      progress(100, "", "conferindo o arquivo".into());
    }
  }
  if tags().is_some_and(|m| has(&m, id)) { Ok(()) } else { Err(format!("{id}: o download não terminou")) }
}
