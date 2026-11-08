//! Licença do Pro: entrar com e-mail + código; a licença em si é offline.
//!
//! Formato: `TESS1.<dados>.<assinatura>`, as duas partes em base64url sem `=`. A assinatura é
//! Ed25519 sobre os bytes de `TESS1.<dados>` (o prefixo entra na mensagem, então um token de outro
//! formato nunca confere). Os dados são JSON:
//! `{ "v":1, "id", "email", "plano":"pro", "ciclo":"mensal"|"anual", "emitida":<unix>, "ate":<unix>, "pc":"<id do computador>" }`.
//! `ate` já inclui a folga sem internet (fim do período pago + alguns dias). Quem emite é o Worker
//! do site (site/functions/api/license/[action].js), com a chave privada só como segredo dele.
//!
//! Onde fica: `licenca.json` na pasta de dados, FORA do banco, para o "dois computadores" (que
//! sincroniza o banco) nunca trocar a licença de um computador pela do outro. O token de renovação
//! fica no Cofre do Windows. A tela: janela de ativação (components/License.tsx) + página /plano.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

type Res<T> = Result<T, String>;

pub const PREFIX: &str = "TESS1.";

/// Chave pública embutida no build (hex de 32 bytes), via `TESSERACT_LICENSE_PUBKEY` na hora de
/// compilar. Sem ela, nenhuma licença confere: o app fica no Grátis, nunca o contrário.
/// Na versão de desenvolvimento, a variável também vale na hora de rodar (para testar com a chave
/// de teste do scripts/license-dev-server.mjs).
pub fn public_key() -> Res<[u8; 32]> {
  let runtime = if cfg!(debug_assertions) { std::env::var("TESSERACT_LICENSE_PUBKEY").ok() } else { None };
  let hex = runtime.or_else(|| option_env!("TESSERACT_LICENSE_PUBKEY").map(String::from)).ok_or("este build não tem a chave pública da licença")?;
  unhex32(&hex).ok_or_else(|| "chave pública da licença inválida neste build".into())
}

fn unhex32(s: &str) -> Option<[u8; 32]> {
  let s = s.trim();
  if s.len() != 64 {
    return None;
  }
  let mut out = [0u8; 32];
  for (i, b) in out.iter_mut().enumerate() {
    *b = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
  }
  Some(out)
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct License {
  pub v: u32,
  pub id: String,
  pub email: String,
  pub plano: String,
  pub ciclo: String,
  pub emitida: u64,
  pub ate: u64,
  pub pc: String,
}

/// Lê e confere o token com a chave pública dada. Não olha a data: isso é `status`.
pub fn parse(token: &str, key: &[u8; 32]) -> Res<License> {
  let token = token.trim();
  let rest = token.strip_prefix(PREFIX).ok_or("isso não é uma chave do Tesseract")?;
  let (data, sig) = rest.split_once('.').ok_or("chave incompleta")?;
  if data.is_empty() || sig.contains('.') || token.len() > 4096 {
    return Err("chave incompleta".into());
  }
  let sig = URL_SAFE_NO_PAD.decode(sig).map_err(|_| "chave com assinatura ilegível")?;
  let sig = Signature::from_slice(&sig).map_err(|_| "chave com assinatura ilegível")?;
  let vk = VerifyingKey::from_bytes(key).map_err(|_| "chave pública inválida")?;
  vk.verify_strict(&token.as_bytes()[..PREFIX.len() + data.len()], &sig).map_err(|_| "a chave não confere (assinatura inválida)")?;
  let json = URL_SAFE_NO_PAD.decode(data).map_err(|_| "chave com dados ilegíveis")?;
  let lic: License = serde_json::from_slice(&json).map_err(|_| "chave com dados ilegíveis")?;
  if lic.v != 1 {
    return Err("chave de uma versão mais nova: atualize o Tesseract".into());
  }
  if lic.plano != "pro" {
    return Err("plano desconhecido na chave".into());
  }
  Ok(lic)
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "plano", rename_all = "camelCase")]
pub enum Status {
  /// Sem licença (ou com uma que não é deste computador).
  Gratis,
  /// Pro em dia. `dias` = quantos faltam até `ate`.
  Pro { email: String, ciclo: String, ate: u64, dias: u64 },
  /// Venceu: os recursos Pro ficam só para leitura até renovar. Nada é apagado.
  Leitura { email: String, ate: u64 },
}

/// O relógio do computador pode ser atrasado para esticar a licença: usa o maior entre o agora e
/// o último horário já visto pelo app (guardado a cada abertura/conferência).
pub fn effective_now(now: u64, last_seen: u64) -> u64 {
  now.max(last_seen)
}

/// Situação da licença neste computador. Licença de outro computador conta como Grátis
/// (a pessoa precisa entrar de novo com o e-mail, o que ocupa uma vaga).
pub fn status(lic: Option<&License>, device: &str, now: u64) -> Status {
  let Some(l) = lic else { return Status::Gratis };
  if !l.pc.is_empty() && l.pc != device {
    return Status::Gratis;
  }
  if now <= l.ate {
    Status::Pro { email: l.email.clone(), ciclo: l.ciclo.clone(), ate: l.ate, dias: (l.ate - now) / 86_400 }
  } else {
    Status::Leitura { email: l.email.clone(), ate: l.ate }
  }
}

/// Licença nova (renovação) só substitui a guardada se for da mesma assinatura, deste computador
/// e mais nova. Evita que uma resposta antiga ou de outra conta troque a licença.
pub fn should_replace(old: Option<&License>, new: &License, device: &str) -> bool {
  if !new.pc.is_empty() && new.pc != device {
    return false;
  }
  match old {
    None => true,
    Some(o) => o.id == new.id && new.emitida >= o.emitida && new.ate >= o.ate,
  }
}

// ---------- guardar (licenca.json + Cofre) ----------

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const FILE: &str = "licenca.json";
const KEYRING_SERVICE: &str = "dev.tesseract.app";
/// Renova sozinho ao abrir se a última conferência online passou disso.
const RENEW_EVERY: u64 = 12 * 3600;

#[derive(Serialize, Deserialize, Default, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct Saved {
  /// Id deste computador para a licença (aleatório, criado uma vez nesta pasta de dados).
  pub device: String,
  /// Licença `TESS1...` atual; vazio = Grátis.
  pub token: String,
  /// Maior horário já visto (relógio atrasado não estica a licença).
  pub last_seen: u64,
  /// Última conferência online que deu certo.
  pub last_ok: u64,
  /// "" | "rede" | "assinatura" (pagamento não passou) | "cancelada" | "liberada" (vaga liberada em outro computador)
  pub problem: String,
  /// Entrou por e-mail (tem token de renovação no Cofre). Chave colada = false.
  pub online: bool,
}

fn path_of(dir: &Path) -> PathBuf {
  dir.join(FILE)
}

pub fn load(dir: &Path) -> Saved {
  let mut s: Saved = std::fs::read(path_of(dir)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
  if s.device.is_empty() {
    s.device = crate::common::hex(&crate::common::random::<8>());
  }
  s
}

pub fn save(dir: &Path, s: &Saved) -> Res<()> {
  std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  let tmp = dir.join(format!("{FILE}.tmp"));
  std::fs::write(&tmp, serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?).map_err(|e| format!("não foi possível gravar a licença: {e}"))?;
  std::fs::rename(&tmp, path_of(dir)).map_err(|e| format!("não foi possível gravar a licença: {e}"))
}

/// Token de renovação: o Cofre do Windows no app, memória nos testes.
pub trait Secret {
  fn get(&self, device: &str) -> Res<Option<String>>;
  fn set(&self, device: &str, token: &str) -> Res<()>;
  fn clear(&self, device: &str) -> Res<()>;
}

pub struct Vault;
impl Vault {
  fn entry(device: &str) -> Res<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("licenca.renovacao.{device}")).map_err(|e| e.to_string())
  }
}
impl Secret for Vault {
  fn get(&self, device: &str) -> Res<Option<String>> {
    match Self::entry(device)?.get_password() {
      Ok(t) => Ok(Some(t)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(format!("não foi possível ler a licença no Cofre do Windows: {e}")),
    }
  }
  fn set(&self, device: &str, token: &str) -> Res<()> {
    Self::entry(device)?.set_password(token).map_err(|e| format!("não foi possível guardar a licença no Cofre do Windows: {e}"))
  }
  fn clear(&self, device: &str) -> Res<()> {
    match Self::entry(device)?.delete_credential() {
      Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
      Err(e) => Err(e.to_string()),
    }
  }
}

// ---------- falar com o site ----------

/// `Ok((status, corpo))` quando o site respondeu; `Err` = sem internet / site fora.
pub trait Api {
  fn post(&self, action: &str, body: Value) -> Result<(u16, Value), String>;
}

pub struct Http;
pub fn api_base() -> String {
  let dev = if cfg!(debug_assertions) { std::env::var("TESSERACT_LICENSE_API").ok().filter(|s| !s.trim().is_empty()) } else { None };
  dev.unwrap_or_else(|| "https://tesseract.lanzilabs.dev".into()).trim_end_matches('/').to_string()
}
impl Api for Http {
  fn post(&self, action: &str, body: Value) -> Result<(u16, Value), String> {
    let agent = ureq::AgentBuilder::new().timeout_connect(std::time::Duration::from_secs(5)).timeout(std::time::Duration::from_secs(20)).build();
    match agent.post(&format!("{}/api/license/{action}", api_base())).set("user-agent", "Tesseract").send_json(body) {
      Ok(r) => Ok((r.status(), r.into_json().unwrap_or(Value::Null))),
      Err(ureq::Error::Status(code, r)) => Ok((code, r.into_json().unwrap_or(Value::Null))),
      Err(ureq::Error::Transport(t)) => Err(format!("sem conexão com o site ({})", t.kind())),
    }
  }
}

fn device_name() -> String {
  crate::common::device()
}

// ---------- o que a tela vê ----------

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct View {
  pub status: Status,
  pub device_id: String,
  pub device_name: String,
  pub online: bool,
  pub last_ok: u64,
  pub problem: String,
  /// Este build tem a chave pública (sem ela nada ativa; no build oficial nada é limitado: beta).
  pub ready: bool,
  /// Limites do Grátis valendo neste computador.
  pub limited: bool,
}

pub fn current(s: &Saved) -> Option<License> {
  if s.token.is_empty() {
    return None;
  }
  parse(&s.token, &public_key().ok()?).ok()
}

pub fn view_of(s: &Saved, now: u64) -> View {
  let lic = current(s);
  let status = status(lic.as_ref(), &s.device, effective_now(now, s.last_seen));
  let ready = public_key().is_ok();
  View {
    // no build do código aberto os limites valem mesmo sem a chave (ver plan_without_key)
    limited: (ready || !cfg!(pro)) && !matches!(status, Status::Pro { .. }),
    status,
    device_id: s.device.clone(),
    device_name: device_name(),
    online: s.online,
    last_ok: s.last_ok,
    problem: s.problem.clone(),
    ready,
  }
}

// ---------- limites do Grátis (fase 13E) ----------
//
// Regra: limite nunca apaga nem esconde o que já existe; só impede criar além dele.
// Build oficial (com o Pro) sem chave pública = beta: nada é limitado, porque não há como ativar o Pro nele.
// Build do código aberto (sem a pasta pro/) = sempre Grátis: sem chave ele não tem como virar Pro, e os limites
// valem; quem compila o núcleo público tem o Grátis completo, não o Pro.

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Plan {
  Beta,
  Pro,
  /// Grátis, ou Pro vencido (só leitura do que é Pro).
  Gratis,
}

pub const FREE_PROJECTS: usize = 3;
pub const FREE_METHODS: [&str; 3] = ["kanban", "lista", "foco"];

/// Plano de um build sem a chave pública da licença.
const fn plan_without_key(pro_build: bool) -> Plan {
  if pro_build { Plan::Beta } else { Plan::Gratis }
}

pub fn plan_of(s: &Saved, now: u64) -> Plan {
  if public_key().is_err() {
    return plan_without_key(cfg!(pro));
  }
  match view_of(s, now).status {
    Status::Pro { .. } => Plan::Pro,
    _ => Plan::Gratis,
  }
}

/// Plano deste computador; `db_path` é o tesseract.db (a licença fica na mesma pasta).
pub fn plan(db_path: &Path) -> Plan {
  let dir = db_path.parent().unwrap_or(Path::new("."));
  plan_of(&load(dir), crate::now_secs())
}

/// Plano pelo caminho do banco aberto na conexão (para quem não tem o AppDb, como as automações).
pub fn plan_conn(c: &rusqlite::Connection) -> Plan {
  match c.path().filter(|p| !p.is_empty()) {
    Some(p) => plan(Path::new(p)),
    // banco em memória (só nos testes): sem pasta de licença, nada limitado
    None => Plan::Beta,
  }
}

pub fn active_projects(c: &rusqlite::Connection) -> Res<usize> {
  c.query_row("SELECT COUNT(*) FROM projects WHERE archived_at IS NULL", [], |r| r.get::<_, i64>(0)).map(|n| n as usize).map_err(|e| e.to_string())
}

/// Erro que a tela reconhece (prefixo `PRO:`) para abrir a janela de ativação com o motivo.
pub fn pro_error(what: &str) -> String {
  format!("PRO:{what}")
}

pub fn need_pro(p: Plan, what: &str) -> Res<()> {
  if p == Plan::Gratis { Err(pro_error(what)) } else { Ok(()) }
}

/// Criar projeto: no Grátis, só no escopo Pessoal e até 3 ativos.
pub fn check_new_project(p: Plan, scope: &str, active: usize) -> Res<()> {
  if scope != "personal" {
    need_pro(p, "Projetos de organizações")?;
  }
  if active >= FREE_PROJECTS {
    need_pro(p, "Mais de 3 projetos ativos")?;
  }
  Ok(())
}

/// Métodos: no Grátis, só liga Kanban, Lista e Foco do dia. Os que o projeto já tem continuam.
pub fn check_methods(p: Plan, wanted: &[String], current: &[String]) -> Res<()> {
  if let Some(m) = wanted.iter().find(|m| !FREE_METHODS.contains(&m.as_str()) && !current.contains(m)) {
    need_pro(p, &format!("O método {}", method_label(m)))?;
  }
  Ok(())
}

fn method_label(id: &str) -> &str {
  match id {
    "eisenhower" => "Eisenhower",
    "gtd" => "GTD",
    "scrum" => "Scrum",
    "okr" => "OKR",
    "shapeup" => "Shape Up",
    "priorizacao" => "Priorização",
    "cronograma" => "Cronograma",
    other => other,
  }
}

fn err_of(v: &Value) -> &str {
  v["error"].as_str().unwrap_or("")
}

/// Lê a licença que o site mandou e só aceita se for deste computador.
fn accept(s: &Saved, token: &str) -> Res<License> {
  let lic = parse(token, &public_key()?)?;
  if !lic.pc.is_empty() && lic.pc != s.device {
    return Err("a licença veio para outro computador".into());
  }
  Ok(lic)
}

fn drop_license(s: &mut Saved, secret: &dyn Secret) {
  s.token.clear();
  s.online = false;
  let _ = secret.clear(&s.device);
}

pub fn send_code(api: &dyn Api, email: &str) -> Res<()> {
  let email = email.trim();
  if !email.contains('@') || email.len() > 254 {
    return Err("confira o e-mail".into());
  }
  match api.post("code", json!({ "email": email })) {
    Err(e) => Err(format!("{e}. Confira a internet e tente de novo.")),
    Ok((200, _)) => Ok(()),
    Ok((_, v)) if err_of(&v) == "email" => Err("confira o e-mail".into()),
    Ok((code, _)) => Err(format!("o site não conseguiu mandar o código agora (erro {code}). Tente de novo em instantes.")),
  }
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device {
  pub id: String,
  pub nome: String,
  pub visto: u64,
  pub is_me: bool,
}

fn devices_of(v: &Value, me: &str) -> Vec<Device> {
  v["devices"].as_array().map_or_else(Vec::new, |a| {
    a.iter()
      .map(|d| {
        let id = d["id"].as_str().unwrap_or("").to_string();
        Device { is_me: id == me, id, nome: d["nome"].as_str().unwrap_or("Computador").to_string(), visto: d["visto"].as_u64().unwrap_or(0) }
      })
      .collect()
  })
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Verified {
  /// Ativou: a licença já está guardada.
  Ok { view: View },
  /// As 2 vagas estão ocupadas: a pessoa escolhe uma para liberar e manda de novo (o código continua valendo).
  Vagas { devices: Vec<Device> },
}

pub fn verify(dir: &Path, secret: &dyn Secret, api: &dyn Api, email: &str, code: &str, release: Option<&str>, now: u64) -> Res<Verified> {
  let mut s = load(dir);
  let code: String = code.chars().filter(char::is_ascii_digit).collect();
  if code.len() != 6 {
    return Err("o código tem 6 números".into());
  }
  let mut body = json!({ "email": email.trim(), "code": code, "device": { "id": s.device, "name": device_name() } });
  if let Some(r) = release.filter(|r| !r.is_empty()) {
    body["release"] = json!(r);
  }
  let (st, v) = api.post("verify", body).map_err(|e| format!("{e}. Confira a internet e tente de novo."))?;
  match (st, err_of(&v)) {
    (200, _) => {
      let token = v["license"].as_str().ok_or("o site respondeu sem a licença")?;
      let renew = v["renew"].as_str().ok_or("o site respondeu sem o token de renovação")?;
      accept(&s, token)?;
      secret.set(&s.device, renew)?;
      s.token = token.trim().to_string();
      s.online = true;
      s.last_ok = now;
      s.last_seen = s.last_seen.max(now);
      s.problem.clear();
      save(dir, &s)?;
      Ok(Verified::Ok { view: view_of(&s, now) })
    }
    (_, "vagas") => Ok(Verified::Vagas { devices: devices_of(&v, &s.device) }),
    (_, "codigo") => Err(match v["restam"].as_u64() {
      Some(0) => "código errado. Peça um novo código.".into(),
      Some(n) => format!("código errado. {} {n} tentativa{}.", if n == 1 { "Resta" } else { "Restam" }, if n == 1 { "" } else { "s" }),
      None => "esse código venceu ou já foi usado. Peça um novo.".into(),
    }),
    (_, "assinatura") => Err("não achamos uma assinatura ativa com esse e-mail".into()),
    (st, _) => Err(format!("o site não conseguiu ativar agora (erro {st}). Tente de novo em instantes.")),
  }
}

/// Renova pela internet. Nunca apaga uma licença em dia por falta de internet: só anota o problema.
pub fn renew(dir: &Path, secret: &dyn Secret, api: &dyn Api, now: u64) -> Res<View> {
  let mut s = load(dir);
  s.last_seen = s.last_seen.max(now);
  if !s.online || s.token.is_empty() {
    save(dir, &s)?;
    return Ok(view_of(&s, now));
  }
  let Some(t) = secret.get(&s.device)? else {
    // o Cofre perdeu o token (Windows reinstalado, outro usuário): a licença vale até o fim, sem renovar
    s.online = false;
    save(dir, &s)?;
    return Ok(view_of(&s, now));
  };
  match api.post("renew", json!({ "renew": t, "device": { "id": s.device } })) {
    Err(_) => s.problem = "rede".into(),
    Ok((200, v)) => {
      let token = v["license"].as_str().unwrap_or("");
      let new = accept(&s, token)?;
      if should_replace(current(&s).as_ref(), &new, &s.device) {
        s.token = token.trim().to_string();
      }
      s.last_ok = now;
      s.problem.clear();
    }
    Ok((_, v)) => match err_of(&v) {
      "liberada" | "token" => {
        drop_license(&mut s, secret);
        s.problem = "liberada".into();
      }
      "assinatura" => s.problem = if v["ativa"] == Value::Bool(false) { "cancelada" } else { "assinatura" }.into(),
      _ => s.problem = "rede".into(),
    },
  }
  save(dir, &s)?;
  Ok(view_of(&s, now))
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Devices {
  pub devices: Vec<Device>,
  pub ativa: bool,
  pub pago_ate: u64,
}

pub fn devices(dir: &Path, secret: &dyn Secret, api: &dyn Api) -> Res<Devices> {
  let s = load(dir);
  let t = secret.get(&s.device)?.filter(|_| s.online).ok_or("esta licença não foi ativada por e-mail")?;
  let (st, v) = api.post("devices", json!({ "renew": t, "device": { "id": s.device } })).map_err(|e| format!("{e}. A lista aparece quando houver internet."))?;
  if st != 200 {
    return Err(if err_of(&v) == "liberada" { "a vaga deste computador foi liberada em outro".into() } else { format!("o site não respondeu a lista (erro {st})") });
  }
  Ok(Devices { devices: devices_of(&v, &s.device), ativa: v["ativa"].as_bool().unwrap_or(true), pago_ate: v["pagoAte"].as_u64().unwrap_or(0) })
}

pub fn release(dir: &Path, secret: &dyn Secret, api: &dyn Api, device_id: &str) -> Res<Vec<Device>> {
  let s = load(dir);
  let t = secret.get(&s.device)?.filter(|_| s.online).ok_or("esta licença não foi ativada por e-mail")?;
  let (st, v) = api.post("release", json!({ "renew": t, "deviceId": device_id })).map_err(|e| format!("{e}. Confira a internet e tente de novo."))?;
  if st != 200 {
    return Err(format!("o site não liberou a vaga (erro {st})"));
  }
  Ok(devices_of(&v, &s.device))
}

/// Plano B: colar uma chave `TESS1...` (sem renovação pela internet).
pub fn paste(dir: &Path, secret: &dyn Secret, token: &str, now: u64) -> Res<View> {
  let mut s = load(dir);
  let lic = accept(&s, token).map_err(|e| if e.contains("outro computador") { "essa chave é de outro computador".to_string() } else { e })?;
  if effective_now(now, s.last_seen) > lic.ate {
    return Err("essa chave já venceu".into());
  }
  drop_license(&mut s, secret);
  s.token = token.trim().to_string();
  s.problem.clear();
  s.last_seen = s.last_seen.max(now);
  save(dir, &s)?;
  Ok(view_of(&s, now))
}

/// Sair do Pro neste computador: libera a vaga no site (se der) e apaga a licença daqui.
pub fn logout(dir: &Path, secret: &dyn Secret, api: &dyn Api, now: u64) -> Res<View> {
  let mut s = load(dir);
  if s.online {
    if let Ok(Some(t)) = secret.get(&s.device) {
      let _ = api.post("release", json!({ "renew": t, "deviceId": s.device }));
    }
  }
  drop_license(&mut s, secret);
  s.problem.clear();
  save(dir, &s)?;
  Ok(view_of(&s, now))
}

// ---------- comandos ----------

use tauri::State;

fn dir_of(m: &State<crate::AppMode>) -> PathBuf {
  PathBuf::from(&m.data_dir)
}
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Res<T> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn license_status(m: State<crate::AppMode>) -> Res<View> {
  let dir = dir_of(&m);
  let mut s = load(&dir);
  let now = crate::now_secs();
  if now > s.last_seen || !path_of(&dir).exists() {
    s.last_seen = s.last_seen.max(now);
    save(&dir, &s)?;
  }
  Ok(view_of(&s, now))
}

#[tauri::command]
pub async fn license_send_code(email: String) -> Res<()> {
  blocking(move || send_code(&Http, &email)).await
}

#[tauri::command]
pub async fn license_verify(m: State<'_, crate::AppMode>, email: String, code: String, release: Option<String>) -> Res<Verified> {
  let dir = dir_of(&m);
  blocking(move || verify(&dir, &Vault, &Http, &email, &code, release.as_deref(), crate::now_secs())).await
}

#[tauri::command]
pub async fn license_renew(m: State<'_, crate::AppMode>) -> Res<View> {
  let dir = dir_of(&m);
  blocking(move || renew(&dir, &Vault, &Http, crate::now_secs())).await
}

#[tauri::command]
pub async fn license_devices(m: State<'_, crate::AppMode>) -> Res<Devices> {
  let dir = dir_of(&m);
  blocking(move || devices(&dir, &Vault, &Http)).await
}

#[tauri::command]
pub async fn license_release(m: State<'_, crate::AppMode>, device_id: String) -> Res<Vec<Device>> {
  let dir = dir_of(&m);
  blocking(move || release(&dir, &Vault, &Http, &device_id)).await
}

#[tauri::command]
pub fn license_paste(m: State<crate::AppMode>, token: String) -> Res<View> {
  paste(&dir_of(&m), &Vault, &token, crate::now_secs())
}

#[tauri::command]
pub async fn license_logout(m: State<'_, crate::AppMode>) -> Res<View> {
  let dir = dir_of(&m);
  blocking(move || logout(&dir, &Vault, &Http, crate::now_secs())).await
}

/// Abre a página de assinar no navegador (o checkout do Asaas sai de lá). Endereço fixo: a tela
/// não escolhe para onde vai.
#[tauri::command]
pub fn license_open_checkout() -> Res<()> {
  let url = format!("{}/assinar/", api_base());
  std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn().map(|_| ()).map_err(|x| format!("não deu para abrir o navegador: {x}"))
}

/// Ao abrir: renova sozinho se a última conferência foi há mais de 12 h (sem travar a abertura).
pub fn on_open(dir: PathBuf) {
  std::thread::spawn(move || {
    let s = load(&dir);
    if s.online && !s.token.is_empty() && crate::now_secs().saturating_sub(s.last_ok) > RENEW_EVERY {
      if let Err(e) = renew(&dir, &Vault, &Http, crate::now_secs()) {
        log::warn!("licença: renovação ao abrir falhou: {e}");
      }
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;
  use ed25519_dalek::{Signer, SigningKey};

  fn key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
  }
  fn make(sk: &SigningKey, lic: &License) -> String {
    let data = URL_SAFE_NO_PAD.encode(serde_json::to_vec(lic).unwrap());
    let msg = format!("{PREFIX}{data}");
    let sig = sk.sign(msg.as_bytes());
    format!("{msg}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
  }
  fn lic() -> License {
    License { v: 1, id: "sub_1".into(), email: "ana@exemplo.com".into(), plano: "pro".into(), ciclo: "mensal".into(), emitida: 1_000, ate: 1_000 + 40 * 86_400, pc: "pc-a".into() }
  }

  #[test]
  fn confere_a_assinatura() {
    let sk = key();
    let pk = sk.verifying_key().to_bytes();
    let t = make(&sk, &lic());
    assert_eq!(parse(&t, &pk).unwrap(), lic());
    assert_eq!(parse(&format!("  {t}\n"), &pk).unwrap(), lic(), "espaços ao colar");

    // outra chave privada, dados trocados, assinatura trocada, formato errado
    let outra = SigningKey::from_bytes(&[9u8; 32]);
    assert!(parse(&make(&outra, &lic()), &pk).is_err());
    let mut l2 = lic();
    l2.ate += 365 * 86_400;
    let forjada = format!("{}.{}", make(&sk, &l2).rsplit_once('.').unwrap().0, t.rsplit_once('.').unwrap().1);
    assert!(parse(&forjada, &pk).is_err(), "esticar a validade quebra a assinatura");
    for bad in ["", "TESS1.", "TESS1.abc", "TESS2.abc.def", &t.replacen("TESS1.", "TESS9.", 1), &format!("{t}.x")] {
      assert!(parse(bad, &pk).is_err(), "{bad}");
    }
    let mut free = lic();
    free.plano = "ouro".into();
    assert!(parse(&make(&sk, &free), &pk).is_err());
  }

  /// Licença assinada pelo Worker do site (scripts/test-license-worker.mjs, passo 10, mesma chave
  /// de teste): o app e o Worker têm de concordar byte a byte no formato.
  #[test]
  fn aceita_a_licenca_do_worker() {
    const VETOR: &str = "TESS1.eyJ2IjoxLCJpZCI6InN1Yl8xIiwiZW1haWwiOiJhbmFAZXhlbXBsby5jb20iLCJwbGFubyI6InBybyIsImNpY2xvIjoibWVuc2FsIiwiZW1pdGlkYSI6MTAwMCwiYXRlIjozNDU3MDAwLCJwYyI6InBjLWEifQ.SGsY85AdDMjqFhlpmnV_IqIozzTDH9mPn--F3FVz6QQiFr2yfvn-gk8En7zIRimjbHgzURNlDgtyqq-jMcpaAQ";
    let pk = key().verifying_key().to_bytes();
    assert_eq!(parse(VETOR, &pk).unwrap(), lic(), "o vetor tem os mesmos dados de lic()");
    assert_eq!(make(&key(), &lic()), VETOR, "e o Rust assina igual (Ed25519 é determinístico)");
  }

  #[test]
  fn situacao_por_data_e_computador() {
    let l = lic();
    assert_eq!(status(None, "pc-a", 5_000), Status::Gratis);
    assert!(matches!(status(Some(&l), "pc-a", 5_000), Status::Pro { dias: 39, .. }));
    assert_eq!(status(Some(&l), "pc-b", 5_000), Status::Gratis, "licença de outro computador");
    assert!(matches!(status(Some(&l), "pc-a", l.ate + 1), Status::Leitura { .. }));
    // relógio atrasado não estica
    assert!(matches!(status(Some(&l), "pc-a", effective_now(2_000, l.ate + 10)), Status::Leitura { .. }));
  }

  #[test]
  fn renovacao_so_troca_pela_mais_nova_da_mesma_assinatura() {
    let old = lic();
    let mut new = lic();
    new.emitida += 10;
    new.ate += 30 * 86_400;
    assert!(should_replace(Some(&old), &new, "pc-a"));
    assert!(!should_replace(Some(&new), &old, "pc-a"), "resposta antiga");
    let mut other = new.clone();
    other.id = "sub_2".into();
    assert!(!should_replace(Some(&old), &other, "pc-a"), "outra assinatura");
    assert!(!should_replace(Some(&old), &new, "pc-b"), "outro computador");
    assert!(should_replace(None, &new, "pc-a"));
  }

  #[test]
  fn chave_publica_em_hex() {
    let hex: String = (0..32).map(|i| format!("{:02x}", i)).collect();
    assert_eq!(unhex32(&hex).unwrap()[31], 31);
    assert!(unhex32("abc").is_none());
    assert!(unhex32(&"zz".repeat(32)).is_none());
  }

  // ---------- guardar e falar com o site (site falso, Cofre em memória) ----------

  use std::cell::RefCell;
  use std::collections::HashMap;

  fn use_test_key() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    let hex: String = key().verifying_key().to_bytes().iter().map(|b| format!("{b:02x}")).collect();
    // SAFETY: só nos testes, sempre com o mesmo valor
    ONCE.call_once(|| unsafe { std::env::set_var("TESSERACT_LICENSE_PUBKEY", hex) });
  }
  fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("tesseract-licenca-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
  }

  #[derive(Default)]
  struct Mem(RefCell<HashMap<String, String>>);
  impl Secret for Mem {
    fn get(&self, d: &str) -> Res<Option<String>> {
      Ok(self.0.borrow().get(d).cloned())
    }
    fn set(&self, d: &str, t: &str) -> Res<()> {
      self.0.borrow_mut().insert(d.into(), t.into());
      Ok(())
    }
    fn clear(&self, d: &str) -> Res<()> {
      self.0.borrow_mut().remove(d);
      Ok(())
    }
  }

  /// Site falso: responde o que a função manda e anota as chamadas.
  struct Fake<F: Fn(&str, &Value) -> Result<(u16, Value), String>>(F, RefCell<Vec<String>>);
  impl<F: Fn(&str, &Value) -> Result<(u16, Value), String>> Api for Fake<F> {
    fn post(&self, a: &str, b: Value) -> Result<(u16, Value), String> {
      self.1.borrow_mut().push(a.into());
      (self.0)(a, &b)
    }
  }
  fn fake<F: Fn(&str, &Value) -> Result<(u16, Value), String>>(f: F) -> Fake<F> {
    Fake(f, RefCell::new(vec![]))
  }
  fn lic_for(pc: &str, emitida: u64, ate: u64) -> String {
    make(&key(), &License { pc: pc.into(), emitida, ate, ..lic() })
  }

  #[test]
  fn ativa_por_email_guarda_fora_do_banco_e_renova() {
    use_test_key();
    let dir = tmp("ativa");
    let vault = Mem::default();
    let dev = load(&dir).device;
    save(&dir, &Saved { device: dev.clone(), ..Default::default() }).unwrap();
    let now = 10_000;

    // código errado, vagas cheias, e por fim certo
    let site = fake(|a, b| match (a, b["code"].as_str()) {
      ("verify", Some("111111")) => Ok((400, json!({ "error": "codigo", "restam": 3 }))),
      ("verify", _) if b.get("release").is_none() => Ok((409, json!({ "error": "vagas", "devices": [{ "id": "pc-x", "nome": "Notebook", "visto": 5 }, { "id": "pc-y", "nome": "Casa", "visto": 6 }] }))),
      ("verify", _) => {
        assert_eq!(b["release"], "pc-x");
        let pc = b["device"]["id"].as_str().unwrap().to_string();
        Ok((200, json!({ "license": lic_for(&pc, now, now + 40 * 86_400), "renew": "tok-1" })))
      }
      _ => unreachable!(),
    });
    assert!(verify(&dir, &vault, &site, "ana@exemplo.com", "111 111", None, now).unwrap_err().contains("Restam 3 tentativas"));
    assert!(verify(&dir, &vault, &site, "ana@exemplo.com", "12345", None, now).is_err(), "5 dígitos nem chega no site");
    let Verified::Vagas { devices } = verify(&dir, &vault, &site, "ana@exemplo.com", "222222", None, now).unwrap() else { panic!() };
    assert_eq!(devices.len(), 2);
    let Verified::Ok { view } = verify(&dir, &vault, &site, "ana@exemplo.com", "222222", Some("pc-x"), now).unwrap() else { panic!() };
    assert!(matches!(view.status, Status::Pro { dias: 40, .. }));
    assert_eq!(vault.get(&dev).unwrap().as_deref(), Some("tok-1"), "token de renovação no Cofre, não no arquivo");
    let file = std::fs::read_to_string(dir.join(FILE)).unwrap();
    assert!(!file.contains("tok-1") && file.contains("TESS1."));

    // renovar: sem internet não apaga; resposta mais nova troca; pagamento falhou só avisa
    let off = fake(|_, _| Err("sem conexão".into()));
    let v = renew(&dir, &vault, &off, now + 100).unwrap();
    assert_eq!(v.problem, "rede");
    assert!(matches!(v.status, Status::Pro { .. }));
    let on = fake(|_, b| Ok((200, json!({ "license": lic_for(b["device"]["id"].as_str().unwrap(), now + 200, now + 70 * 86_400) }))));
    let v = renew(&dir, &vault, &on, now + 200).unwrap();
    assert_eq!(v.problem, "");
    assert!(matches!(v.status, Status::Pro { dias: 69, .. }));
    let old = fake(|_, b| Ok((200, json!({ "license": lic_for(b["device"]["id"].as_str().unwrap(), now, now + 40 * 86_400) }))));
    assert!(matches!(renew(&dir, &vault, &old, now + 300).unwrap().status, Status::Pro { dias: 69, .. }), "resposta antiga não encurta");
    let unpaid = fake(|_, _| Ok((403, json!({ "error": "assinatura", "ativa": true }))));
    let v = renew(&dir, &vault, &unpaid, now + 400).unwrap();
    assert_eq!(v.problem, "assinatura");
    assert!(matches!(v.status, Status::Pro { .. }), "vale até o fim do que foi pago");
    let canceled = fake(|_, _| Ok((403, json!({ "error": "assinatura", "ativa": false }))));
    let v = renew(&dir, &vault, &canceled, now + 450).unwrap();
    assert_eq!(v.problem, "cancelada");
    assert!(matches!(v.status, Status::Pro { .. }), "cancelada também vale até o fim");

    // relógio atrasado não volta a licença vencida
    let late = now + 71 * 86_400;
    assert!(matches!(renew(&dir, &vault, &off, late).unwrap().status, Status::Leitura { .. }));
    assert!(matches!(view_of(&load(&dir), now).status, Status::Leitura { .. }));

    // vaga liberada em outro computador: a licença sai daqui
    let freed = fake(|_, _| Ok((403, json!({ "error": "liberada" }))));
    let v = renew(&dir, &vault, &freed, late).unwrap();
    assert_eq!((v.problem.as_str(), v.online), ("liberada", false));
    assert_eq!(v.status, Status::Gratis);
    assert_eq!(vault.get(&dev).unwrap(), None);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn limites_do_gratis() {
    use Plan::*;
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    // beta e Pro: nada limitado
    for p in [Beta, Pro] {
      assert!(check_new_project(p, "org:x", 10).is_ok());
      assert!(check_methods(p, &s(&["scrum"]), &[]).is_ok());
      assert!(need_pro(p, "x").is_ok());
    }
    // Grátis: só Pessoal, até 3 ativos
    assert!(check_new_project(Gratis, "personal", 2).is_ok());
    assert_eq!(check_new_project(Gratis, "personal", 3).unwrap_err(), "PRO:Mais de 3 projetos ativos");
    assert_eq!(check_new_project(Gratis, "org:x", 0).unwrap_err(), "PRO:Projetos de organizações");
    // métodos: os grátis passam; o que o projeto já tinha continua; ligar um novo do Pro não
    assert!(check_methods(Gratis, &s(&["kanban", "lista", "foco"]), &[]).is_ok());
    assert!(check_methods(Gratis, &s(&["kanban", "scrum"]), &s(&["kanban", "scrum"])).is_ok(), "não tira o que já existe");
    assert_eq!(check_methods(Gratis, &s(&["kanban", "okr"]), &s(&["kanban"])).unwrap_err(), "PRO:O método OKR");
  }

  #[test]
  fn sem_chave_o_oficial_e_beta_e_o_aberto_e_gratis() {
    assert_eq!(plan_without_key(true), Plan::Beta);
    assert_eq!(plan_without_key(false), Plan::Gratis);
  }

  #[test]
  fn plano_beta_sem_chave_e_gratis_com_chave() {
    use_test_key();
    let dir = tmp("plano");
    let mut s = load(&dir);
    assert_eq!(plan_of(&s, 5), Plan::Gratis, "com a chave no build e sem licença = Grátis");
    assert!(view_of(&s, 5).limited);
    s.token = lic_for(&s.device, 1, 1_000);
    assert_eq!(plan_of(&s, 5), Plan::Pro);
    assert!(!view_of(&s, 5).limited);
    assert_eq!(plan_of(&s, 2_000), Plan::Gratis, "vencida conta como Grátis para criar");
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn colar_chave_e_sair() {
    use_test_key();
    let dir = tmp("colar");
    let vault = Mem::default();
    let dev = load(&dir).device;
    save(&dir, &Saved { device: dev.clone(), ..Default::default() }).unwrap();
    assert!(paste(&dir, &vault, &lic_for("outro-pc", 1, 5_000_000), 2).unwrap_err().contains("outro computador"));
    assert!(paste(&dir, &vault, &lic_for(&dev, 1, 5), 100).unwrap_err().contains("venceu"));
    assert!(paste(&dir, &vault, "TESS1.lixo.lixo", 2).is_err());
    let v = paste(&dir, &vault, &lic_for("", 1, 5_000_000), 2).unwrap();
    assert!(matches!(v.status, Status::Pro { .. }) && !v.online, "chave sem computador vale em qualquer um, sem renovação");

    // ativar por e-mail e sair: libera a vaga no site e apaga tudo daqui
    vault.set(&dev, "tok-9").unwrap();
    let mut s = load(&dir);
    s.online = true;
    save(&dir, &s).unwrap();
    let site = fake(|a, b| {
      assert_eq!((a, b["renew"].as_str()), ("release", Some("tok-9")));
      Ok((200, json!({ "ok": true, "devices": [] })))
    });
    let v = logout(&dir, &vault, &site, 3).unwrap();
    assert_eq!(*site.1.borrow(), vec!["release".to_string()]);
    assert_eq!(v.status, Status::Gratis);
    assert_eq!(vault.get(&dev).unwrap(), None);
    assert_eq!(load(&dir).device, dev, "o id do computador continua o mesmo");
    let _ = std::fs::remove_dir_all(&dir);
  }
}
