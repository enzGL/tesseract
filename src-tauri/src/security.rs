// Trava do app (segurança antes do beta). Desenho: a sugestão, com a tela de
// trava da A, o assistente da B na primeira vez (no tema do app) e o cartão Segurança da C em Configurações,
// mais o cadeado "Travar agora" (Ctrl+L) na barra lateral.
//
// Como funciona:
// - senha local, guardada só como Argon2id (sal aleatório); nunca sai do computador;
// - 2º fator opcional: código TOTP de app autenticador (RFC 6238, 6 dígitos, 30 s) e/ou Windows Hello;
//   o segredo do TOTP fica no Cofre do Windows, não no banco;
// - 10 códigos de recuperação de uso único (Argon2id), para quando o celular sumir;
// - enquanto travado, o Rust recusa todos os comandos da interface menos os `sec_*` (ver `allowed`);
//   o backup na nuvem roda numa thread própria e continua;
// - tentativas erradas seguidas fazem esperar (30 s, dobrando, até 15 min), contadas no banco;
// - trava ao abrir, depois de um tempo parado (a interface avisa) e ao bloquear o Windows (Win+L).
use crate::{db, AppDb};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, State};

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

const KEY: &str = "security";
const KEYRING_SERVICE: &str = "dev.tesseract.app";
const MAX_LOG: usize = 30;
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I: fácil de ler no papel

// ---------- configuração guardada (settings["security"]) ----------

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
struct Config {
  enabled: bool,
  pw_salt: String,
  pw_hash: String,
  totp: bool,
  hello: bool,
  /// minutos parado até travar; None = só ao abrir
  idle_min: Option<i64>,
  lock_with_windows: bool,
  code_salt: String,
  /// hashes dos códigos de recuperação; "" = já usado
  codes: Vec<String>,
  fails: u32,
  wait_until: u64,
  last_step: u64,
  log: Vec<LogItem>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LogItem {
  at: u64,
  what: String,
  how: String,
}

fn now() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn load(c: &rusqlite::Connection) -> Config {
  db::get_setting(c, KEY).ok().flatten().and_then(|v| serde_json::from_value(v).ok()).unwrap_or(Config { idle_min: Some(15), lock_with_windows: true, ..Default::default() })
}
fn save(c: &rusqlite::Connection, cfg: &Config) -> Res<()> {
  db::set_setting(c, KEY, &serde_json::to_value(cfg).map_err(e)?)
}
fn log(cfg: &mut Config, what: &str, how: &str) {
  cfg.log.insert(0, LogItem { at: now(), what: what.into(), how: how.into() });
  cfg.log.truncate(MAX_LOG);
}

// ---------- estado em memória ----------

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Stage {
  Senha,
  Segundo,
}

#[derive(Default)]
struct Pending {
  pw: Option<(String, String)>,
  totp_secret: Option<Vec<u8>>,
  totp_ok: bool,
  hello_ok: bool,
  codes: Vec<String>,
}

struct Inner {
  locked: bool,
  stage: Stage,
  pending: Pending,
  /// separa o segredo do TOTP do modo de teste do segredo de verdade no Cofre
  tag: String,
  windows_locked: bool,
}

pub struct Sec(Mutex<Inner>);

impl Sec {
  pub fn new(c: &rusqlite::Connection, data_dir: &std::path::Path) -> Sec {
    let tag = hex(&Sha256::digest(data_dir.display().to_string().as_bytes())[..4]);
    Sec(Mutex::new(Inner { locked: load(c).enabled, stage: Stage::Senha, pending: Pending::default(), tag, windows_locked: false }))
  }
  pub fn is_locked(&self) -> bool {
    self.0.lock().map(|i| i.locked).unwrap_or(true)
  }
}

/// Comandos que a interface pode chamar com o app travado.
pub fn allowed(cmd: &str) -> bool {
  cmd.starts_with("sec_") || cmd == "app_mode"
}

// ---------- criptografia ----------

fn hex(b: &[u8]) -> String {
  b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Option<Vec<u8>> {
  if s.len() % 2 != 0 {
    return None;
  }
  (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}
fn derive(secret: &str, salt: &[u8]) -> Res<[u8; 32]> {
  let mut out = [0u8; 32];
  argon2::Argon2::default().hash_password_into(secret.as_bytes(), salt, &mut out).map_err(e)?;
  Ok(out)
}
fn same(a: &[u8], b: &[u8]) -> bool {
  a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
fn hash_pw(pw: &str) -> Res<(String, String)> {
  let salt = crate::common::random::<16>();
  Ok((hex(&salt), hex(&derive(pw, &salt)?)))
}
fn check_pw(cfg: &Config, pw: &str) -> bool {
  match (unhex(&cfg.pw_salt), unhex(&cfg.pw_hash)) {
    (Some(s), Some(h)) => derive(pw, &s).map(|d| same(&d, &h)).unwrap_or(false),
    _ => false,
  }
}
fn valid_pw(pw: &str) -> Res<()> {
  if pw.chars().count() < 8 {
    return Err("a senha precisa de pelo menos 8 caracteres".into());
  }
  if pw.len() > 256 {
    return Err("senha longa demais".into());
  }
  Ok(())
}

// RFC 4648 base32 sem "=" (o formato dos apps autenticadores)
const B32: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
pub fn base32(b: &[u8]) -> String {
  let mut out = String::new();
  let (mut buf, mut bits) = (0u32, 0);
  for &x in b {
    buf = (buf << 8) | x as u32;
    bits += 8;
    while bits >= 5 {
      out.push(B32[((buf >> (bits - 5)) & 31) as usize] as char);
      bits -= 5;
    }
  }
  if bits > 0 {
    out.push(B32[((buf << (5 - bits)) & 31) as usize] as char);
  }
  out
}
fn unbase32(s: &str) -> Option<Vec<u8>> {
  let (mut buf, mut bits, mut out) = (0u32, 0, vec![]);
  for ch in s.chars().filter(|c| !c.is_whitespace() && *c != '=') {
    let v = B32.iter().position(|&x| x as char == ch.to_ascii_uppercase())? as u32;
    buf = (buf << 5) | v;
    bits += 5;
    if bits >= 8 {
      out.push((buf >> (bits - 8)) as u8);
      bits -= 8;
    }
  }
  Some(out)
}

/// HOTP de 6 dígitos (RFC 4226) com HMAC-SHA1, a base do TOTP.
pub fn hotp(secret: &[u8], counter: u64) -> u32 {
  use hmac::{Hmac, Mac};
  let mut m = <Hmac<sha1::Sha1> as Mac>::new_from_slice(secret).expect("HMAC aceita qualquer tamanho");
  m.update(&counter.to_be_bytes());
  let h = m.finalize().into_bytes();
  let o = (h[19] & 15) as usize;
  let v = ((h[o] as u32 & 0x7f) << 24) | ((h[o + 1] as u32) << 16) | ((h[o + 2] as u32) << 8) | h[o + 3] as u32;
  v % 1_000_000
}

/// Confere o código contra a janela de 30 s atual e as vizinhas (relógio do celular adiantado ou atrasado).
/// Devolve o passo usado, para o mesmo código não valer duas vezes.
fn totp_match(secret: &[u8], code: &str, at: u64, last_step: u64) -> Option<u64> {
  let digits: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
  if digits.len() != 6 {
    return None;
  }
  let want: u32 = digits.parse().ok()?;
  let step = at / 30;
  [step.saturating_sub(1), step, step + 1].into_iter().find(|&s| s > last_step && hotp(secret, s) == want)
}

fn norm_code(s: &str) -> String {
  s.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect()
}
fn new_codes() -> Vec<String> {
  (0..10)
    .map(|_| {
      let r = crate::common::random::<8>();
      let s: String = r.iter().map(|b| CODE_ALPHABET[(*b as usize) % CODE_ALPHABET.len()] as char).collect();
      format!("{}-{}", &s[..4], &s[4..])
    })
    .collect()
}
fn hash_codes(codes: &[String]) -> Res<(String, Vec<String>)> {
  let salt = crate::common::random::<16>();
  let hs = codes.iter().map(|c| derive(&norm_code(c), &salt).map(|h| hex(&h))).collect::<Res<Vec<_>>>()?;
  Ok((hex(&salt), hs))
}

// ---------- segredo do TOTP no Cofre do Windows ----------

fn vault(tag: &str) -> Res<keyring::Entry> {
  keyring::Entry::new(KEYRING_SERVICE, &format!("seguranca.totp.{tag}")).map_err(e)
}
fn secret_get(tag: &str) -> Res<Vec<u8>> {
  let s = vault(tag)?.get_password().map_err(|_| "o segredo do app autenticador sumiu do Cofre do Windows: use um código de recuperação".to_string())?;
  unbase32(&s).ok_or_else(|| "segredo do autenticador inválido".to_string())
}
fn secret_set(tag: &str, secret: &[u8]) -> Res<()> {
  vault(tag)?.set_password(&base32(secret)).map_err(e)
}
fn secret_del(tag: &str) {
  if let Ok(v) = vault(tag) {
    let _ = v.delete_credential();
  }
}

// ---------- espera depois de erros ----------

fn wait_left(cfg: &Config) -> u64 {
  cfg.wait_until.saturating_sub(now())
}
fn guard(cfg: &Config) -> Res<()> {
  let w = wait_left(cfg);
  if w > 0 {
    return Err(format!("muitas tentativas erradas: espere {w} s"));
  }
  Ok(())
}
fn failed(c: &rusqlite::Connection, cfg: &mut Config, how: &str) -> String {
  cfg.fails += 1;
  if cfg.fails >= 5 {
    let secs = (30u64 << (cfg.fails - 5).min(5)).min(900);
    cfg.wait_until = now() + secs;
  }
  log(cfg, "Tentativa errada", how);
  let _ = save(c, cfg);
  let left = wait_left(cfg);
  if left > 0 {
    format!("{how} não confere. Muitas tentativas: espere {left} s")
  } else {
    format!("{how} não confere")
  }
}
fn unlocked(c: &rusqlite::Connection, cfg: &mut Config, inner: &mut Inner, how: &str) -> Res<()> {
  cfg.fails = 0;
  cfg.wait_until = 0;
  log(cfg, "Destravado", how);
  save(c, cfg)?;
  inner.locked = false;
  inner.stage = Stage::Senha;
  Ok(())
}

// ---------- Windows Hello ----------

#[cfg(windows)]
fn hello_available() -> bool {
  use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerifierAvailability};
  UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.join()).map(|a| a == UserConsentVerifierAvailability::Available).unwrap_or(false)
}
#[cfg(not(windows))]
fn hello_available() -> bool {
  false
}

/// Pede rosto, digital ou PIN ao Windows, com o diálogo preso à janela do app.
#[cfg(windows)]
fn hello_verify(hwnd: isize, message: &str) -> Res<bool> {
  use windows::core::{factory, HSTRING};
  use windows_future::IAsyncOperation;
  use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};
  use windows::Win32::Foundation::HWND;
  use windows::Win32::System::WinRT::IUserConsentVerifierInterop;
  let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(e)?;
  let op: IAsyncOperation<UserConsentVerificationResult> =
    unsafe { interop.RequestVerificationForWindowAsync(HWND(hwnd as *mut core::ffi::c_void), &HSTRING::from(message)) }.map_err(e)?;
  let r = op.join().map_err(e)?;
  Ok(r == UserConsentVerificationResult::Verified)
}
#[cfg(not(windows))]
fn hello_verify(_hwnd: isize, _message: &str) -> Res<bool> {
  Err("Windows Hello só existe no Windows".into())
}

fn main_hwnd(app: &tauri::AppHandle) -> isize {
  #[cfg(windows)]
  if let Some(w) = app.get_webview_window("main") {
    if let Ok(h) = w.hwnd() {
      return h.0 as isize;
    }
  }
  let _ = app;
  0
}

async fn hello_run(app: &tauri::AppHandle, message: &'static str) -> Res<bool> {
  let hwnd = main_hwnd(app);
  tauri::async_runtime::spawn_blocking(move || hello_verify(hwnd, message)).await.map_err(e)?
}

// ---------- Windows bloqueado (Win+L) ----------

#[cfg(windows)]
fn windows_is_locked() -> bool {
  use windows::Win32::System::StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_ACCESS_FLAGS, DESKTOP_CONTROL_FLAGS};
  const DESKTOP_SWITCHDESKTOP: u32 = 0x0100;
  // com a tela de bloqueio na frente, a área de trabalho de entrada não pode ser aberta
  match unsafe { OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_ACCESS_FLAGS(DESKTOP_SWITCHDESKTOP)) } {
    Ok(d) => {
      let _ = unsafe { CloseDesktop(d) };
      false
    }
    Err(_) => true,
  }
}
#[cfg(not(windows))]
fn windows_is_locked() -> bool {
  false
}

/// Olha a cada 3 s se o Windows foi bloqueado; se a trava estiver ligada com essa opção, trava o app.
pub fn watch_windows_lock(app: tauri::AppHandle) {
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_secs(3));
    let now_locked = windows_is_locked();
    let (Some(sec), Some(s)) = (app.try_state::<Sec>(), app.try_state::<AppDb>()) else { continue };
    // mesma ordem dos comandos (banco, depois trava), para um nunca esperar o outro para sempre
    let Ok(c) = s.conn.lock() else { continue };
    let mut i = match sec.0.lock() {
      Ok(i) => i,
      Err(_) => continue,
    };
    let was = i.windows_locked;
    i.windows_locked = now_locked;
    if now_locked && !was && !i.locked {
      let mut cfg = load(&c);
      if cfg.enabled && cfg.lock_with_windows {
        i.locked = true;
        i.stage = Stage::Senha;
        log(&mut cfg, "Travado", "Windows bloqueado");
        let _ = save(&c, &cfg);
        #[cfg(pro)]
        crate::peek::cloud_peek_close(None);
        let _ = app.emit("seguranca-travou", ());
      }
    }
  });
}

// ---------- comandos ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
  enabled: bool,
  locked: bool,
  stage: Stage,
  totp: bool,
  hello: bool,
  hello_available: bool,
  idle_min: Option<i64>,
  lock_with_windows: bool,
  codes_left: usize,
  wait_secs: u64,
  log: Vec<LogItem>,
}

fn status_of(cfg: &Config, i: &Inner, hello_avail: bool) -> Status {
  Status {
    enabled: cfg.enabled,
    locked: i.locked,
    stage: i.stage,
    totp: cfg.totp,
    hello: cfg.hello,
    hello_available: hello_avail,
    idle_min: cfg.idle_min,
    lock_with_windows: cfg.lock_with_windows,
    codes_left: cfg.codes.iter().filter(|h| !h.is_empty()).count(),
    wait_secs: wait_left(cfg),
    // travado, o registro de acessos não aparece (é do dono)
    log: if i.locked { vec![] } else { cfg.log.clone() },
  }
}

macro_rules! open {
  ($s:expr, $sec:expr) => {{
    let c = $s.conn.lock().map_err(|_| "banco ocupado".to_string())?;
    let i = $sec.0.lock().map_err(|_| "trava ocupada".to_string())?;
    (c, i)
  }};
}

fn need_unlocked(cfg: &Config, i: &Inner) -> Res<()> {
  if cfg.enabled && i.locked {
    return Err("o Tesseract está travado".into());
  }
  Ok(())
}

#[tauri::command]
pub fn sec_status(s: State<AppDb>, sec: State<Sec>) -> Res<Status> {
  let avail = hello_available();
  let (c, i) = open!(s, sec);
  Ok(status_of(&load(&c), &i, avail))
}

// ----- assistente da primeira vez (e trocar o celular) -----

#[tauri::command]
pub fn sec_setup_password(s: State<AppDb>, sec: State<Sec>, password: String) -> Res<()> {
  let (c, mut i) = open!(s, sec);
  let cfg = load(&c);
  if cfg.enabled {
    return Err("a segurança já está ligada: troque a senha no cartão Segurança".into());
  }
  valid_pw(&password)?;
  i.pending = Pending { pw: Some(hash_pw(&password)?), ..Default::default() };
  Ok(())
}

#[derive(Serialize)]
pub struct TotpNew {
  secret: String,
  uri: String,
}

/// Novo segredo para o app autenticador. Com a segurança ligada, serve para "Trocar o celular".
#[tauri::command]
pub fn sec_totp_new(s: State<AppDb>, sec: State<Sec>, name: String) -> Res<TotpNew> {
  let (c, mut i) = open!(s, sec);
  let cfg = load(&c);
  need_unlocked(&cfg, &i)?;
  if !cfg.enabled && i.pending.pw.is_none() {
    return Err("defina a senha primeiro".into());
  }
  let secret = crate::common::random::<20>().to_vec();
  let b32 = base32(&secret);
  let label: String = name.trim().chars().filter(|c| c.is_alphanumeric() || *c == ' ').take(40).collect();
  let label = if label.is_empty() { "Tesseract".to_string() } else { label };
  let enc = |x: &str| x.replace(' ', "%20");
  i.pending.totp_secret = Some(secret);
  i.pending.totp_ok = false;
  Ok(TotpNew { uri: format!("otpauth://totp/Tesseract:{}?secret={b32}&issuer=Tesseract&algorithm=SHA1&digits=6&period=30", enc(&label)), secret: b32 })
}

#[tauri::command]
pub fn sec_totp_check(s: State<AppDb>, sec: State<Sec>, code: String) -> Res<bool> {
  let (_c, mut i) = open!(s, sec);
  let secret = i.pending.totp_secret.clone().ok_or("gere o código QR primeiro")?;
  let ok = totp_match(&secret, &code, now(), 0).is_some();
  i.pending.totp_ok = ok;
  Ok(ok)
}

#[tauri::command]
pub async fn sec_hello_check(app: tauri::AppHandle) -> Res<bool> {
  if !hello_available() {
    return Err("o Windows Hello não está configurado neste computador (Configurações do Windows › Contas › Opções de entrada)".into());
  }
  let ok = hello_run(&app, "Confirme para usar o Windows Hello no Tesseract").await?;
  let sec = app.state::<Sec>();
  let mut i = sec.0.lock().map_err(e)?;
  i.pending.hello_ok = ok;
  Ok(ok)
}

#[tauri::command]
pub fn sec_codes_new(sec: State<Sec>) -> Res<Vec<String>> {
  let mut i = sec.0.lock().map_err(e)?;
  if i.pending.pw.is_none() {
    return Err("defina a senha primeiro".into());
  }
  let codes = new_codes();
  i.pending.codes = codes.clone();
  Ok(codes)
}

/// Fim do assistente: grava tudo e liga a trava. `confirm` = o 4º código, para provar que foram guardados.
#[tauri::command]
pub fn sec_setup_finish(s: State<AppDb>, sec: State<Sec>, confirm: String, idle_min: Option<i64>) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  if cfg.enabled {
    return Err("a segurança já está ligada".into());
  }
  let (salt, hash) = i.pending.pw.clone().ok_or("defina a senha primeiro")?;
  let second = i.pending.totp_ok || i.pending.hello_ok;
  if second {
    let codes = &i.pending.codes;
    if codes.len() != 10 {
      return Err("gere os códigos de recuperação".into());
    }
    if norm_code(&confirm) != norm_code(&codes[3]) {
      return Err("o 4º código não confere: confira o que você guardou".into());
    }
    let (cs, ch) = hash_codes(codes)?;
    cfg.code_salt = cs;
    cfg.codes = ch;
  }
  if i.pending.totp_ok {
    secret_set(&i.tag, i.pending.totp_secret.as_ref().ok_or("sem segredo do autenticador")?)?;
  }
  cfg.enabled = true;
  cfg.pw_salt = salt;
  cfg.pw_hash = hash;
  cfg.totp = i.pending.totp_ok;
  cfg.hello = i.pending.hello_ok;
  cfg.idle_min = idle_min.filter(|m| (1..=480).contains(m)).or(Some(15));
  cfg.lock_with_windows = true;
  cfg.fails = 0;
  cfg.wait_until = 0;
  cfg.last_step = 0;
  let how = match (cfg.totp, cfg.hello) {
    (true, true) => "senha + app autenticador + Windows Hello",
    (true, false) => "senha + app autenticador",
    (false, true) => "senha + Windows Hello",
    _ => "só senha",
  };
  log(&mut cfg, "Segurança ligada", how);
  save(&c, &cfg)?;
  db::audit(&c, "security.enable", json!({ "totp": cfg.totp, "hello": cfg.hello }))?;
  i.pending = Pending::default();
  i.locked = false;
  Ok(status_of(&cfg, &i, hello_available()))
}

#[tauri::command]
pub fn sec_setup_cancel(sec: State<Sec>) -> Res<()> {
  sec.0.lock().map_err(e)?.pending = Pending::default();
  Ok(())
}

// ----- destravar -----

#[tauri::command]
pub fn sec_unlock_password(s: State<AppDb>, sec: State<Sec>, password: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  guard(&cfg)?;
  if !check_pw(&cfg, &password) {
    return Err(failed(&c, &mut cfg, "Senha"));
  }
  if cfg.totp || cfg.hello {
    // Não zera `fails` aqui: a espera vale para senha e 2º fator juntos e só
    // zera ao destravar de verdade (senão, redigitar a senha libera mais códigos).
    i.stage = Stage::Segundo;
  } else {
    unlocked(&c, &mut cfg, &mut i, "senha")?;
  }
  Ok(status_of(&cfg, &i, hello_available()))
}

fn second_stage(i: &Inner) -> Res<()> {
  if !i.locked {
    return Err("o Tesseract já está destravado".into());
  }
  if i.stage != Stage::Segundo {
    return Err("digite a senha primeiro".into());
  }
  Ok(())
}

#[tauri::command]
pub fn sec_unlock_code(s: State<AppDb>, sec: State<Sec>, code: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  second_stage(&i)?;
  guard(&cfg)?;
  if !cfg.totp {
    return Err("o app autenticador não está ligado".into());
  }
  let secret = secret_get(&i.tag)?;
  match totp_match(&secret, &code, now(), cfg.last_step) {
    Some(step) => {
      cfg.last_step = step;
      unlocked(&c, &mut cfg, &mut i, "senha + app autenticador")?;
      Ok(status_of(&cfg, &i, hello_available()))
    }
    None => Err(failed(&c, &mut cfg, "Código")),
  }
}

#[tauri::command]
pub fn sec_unlock_recovery(s: State<AppDb>, sec: State<Sec>, code: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  second_stage(&i)?;
  guard(&cfg)?;
  let salt = unhex(&cfg.code_salt).ok_or("sem códigos de recuperação")?;
  let h = hex(&derive(&norm_code(&code), &salt)?);
  match cfg.codes.iter().position(|x| !x.is_empty() && same(x.as_bytes(), h.as_bytes())) {
    Some(k) => {
      cfg.codes[k] = String::new();
      let left = cfg.codes.iter().filter(|x| !x.is_empty()).count();
      unlocked(&c, &mut cfg, &mut i, &format!("senha + código de recuperação (restam {left})"))?;
      Ok(status_of(&cfg, &i, hello_available()))
    }
    None => Err(failed(&c, &mut cfg, "Código de recuperação")),
  }
}

#[tauri::command]
pub async fn sec_unlock_hello(app: tauri::AppHandle) -> Res<Status> {
  {
    let (s, sec) = (app.state::<AppDb>(), app.state::<Sec>());
    let (c, i) = open!(s, sec);
    let cfg = load(&c);
    second_stage(&i)?;
    guard(&cfg)?;
    if !cfg.hello {
      return Err("o Windows Hello não está ligado".into());
    }
  }
  let ok = hello_run(&app, "Destravar o Tesseract").await?;
  let (s, sec) = (app.state::<AppDb>(), app.state::<Sec>());
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  second_stage(&i)?;
  if !ok {
    return Err(failed(&c, &mut cfg, "Windows Hello"));
  }
  unlocked(&c, &mut cfg, &mut i, "senha + Windows Hello")?;
  Ok(status_of(&cfg, &i, hello_available()))
}

#[tauri::command]
pub fn sec_lock(s: State<AppDb>, sec: State<Sec>, reason: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  if !cfg.enabled {
    return Err("ligue a segurança em Configurações para poder travar".into());
  }
  if !i.locked {
    let why = match reason.as_str() {
      "parado" => format!("{} min parado", cfg.idle_min.unwrap_or(0)),
      "atalho" => "Travar agora".to_string(),
      _ => "Travar agora".to_string(),
    };
    log(&mut cfg, "Travado", &why);
    save(&c, &cfg)?;
  }
  i.locked = true;
  i.stage = Stage::Senha;
  // uma versão do backup aberta só para consultar não fica no disco enquanto o app está travado
  #[cfg(pro)]
  crate::peek::cloud_peek_close(None);
  Ok(status_of(&cfg, &i, hello_available()))
}

#[tauri::command]
pub fn sec_back(s: State<AppDb>, sec: State<Sec>) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  i.stage = Stage::Senha;
  Ok(status_of(&load(&c), &i, hello_available()))
}

// ----- cartão Segurança (com o app destravado) -----

#[tauri::command]
pub fn sec_prefs(s: State<AppDb>, sec: State<Sec>, idle_min: Option<i64>, lock_with_windows: bool) -> Res<Status> {
  let (c, i) = open!(s, sec);
  let mut cfg = load(&c);
  need_unlocked(&cfg, &i)?;
  if let Some(m) = idle_min {
    if !(1..=480).contains(&m) {
      return Err("tempo de 1 a 480 minutos".into());
    }
  }
  cfg.idle_min = idle_min;
  cfg.lock_with_windows = lock_with_windows;
  save(&c, &cfg)?;
  Ok(status_of(&cfg, &i, hello_available()))
}

fn need_pw(c: &rusqlite::Connection, cfg: &mut Config, i: &Inner, password: &str) -> Res<()> {
  need_unlocked(cfg, i)?;
  guard(cfg)?;
  if !check_pw(cfg, password) {
    return Err(failed(c, cfg, "Senha"));
  }
  Ok(())
}

#[tauri::command]
pub fn sec_change_password(s: State<AppDb>, sec: State<Sec>, old: String, new: String) -> Res<()> {
  let (c, i) = open!(s, sec);
  let mut cfg = load(&c);
  need_pw(&c, &mut cfg, &i, &old)?;
  valid_pw(&new)?;
  let (salt, hash) = hash_pw(&new)?;
  cfg.pw_salt = salt;
  cfg.pw_hash = hash;
  cfg.fails = 0;
  log(&mut cfg, "Senha trocada", "");
  save(&c, &cfg)?;
  db::audit(&c, "security.password", json!({}))
}

#[tauri::command]
pub fn sec_codes_regen(s: State<AppDb>, sec: State<Sec>, password: String) -> Res<Vec<String>> {
  let (c, i) = open!(s, sec);
  let mut cfg = load(&c);
  need_pw(&c, &mut cfg, &i, &password)?;
  let codes = new_codes();
  let (cs, ch) = hash_codes(&codes)?;
  cfg.code_salt = cs;
  cfg.codes = ch;
  log(&mut cfg, "Códigos de recuperação novos", "os antigos deixaram de valer");
  save(&c, &cfg)?;
  Ok(codes)
}

/// "Trocar o celular": confirma o código do app novo (gerado por sec_totp_new) e troca o segredo no Cofre.
#[tauri::command]
pub fn sec_totp_save(s: State<AppDb>, sec: State<Sec>, password: String, code: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  need_pw(&c, &mut cfg, &i, &password)?;
  let secret = i.pending.totp_secret.clone().ok_or("gere o código QR primeiro")?;
  let step = totp_match(&secret, &code, now(), 0).ok_or("o código do app novo não confere")?;
  secret_set(&i.tag, &secret)?;
  let first = !cfg.totp;
  cfg.totp = true;
  cfg.last_step = step;
  if cfg.codes.iter().all(|x| x.is_empty()) {
    // primeiro 2º fator ligado depois: os códigos vêm junto, em sec_codes_regen
    log(&mut cfg, "App autenticador ligado", "gere os códigos de recuperação");
  } else {
    log(&mut cfg, if first { "App autenticador ligado" } else { "Celular trocado" }, "");
  }
  save(&c, &cfg)?;
  i.pending = Pending::default();
  Ok(status_of(&cfg, &i, hello_available()))
}

#[tauri::command]
pub async fn sec_hello_set(app: tauri::AppHandle, password: String, on: bool) -> Res<Status> {
  {
    let (s, sec) = (app.state::<AppDb>(), app.state::<Sec>());
    let (c, i) = open!(s, sec);
    let mut cfg = load(&c);
    need_pw(&c, &mut cfg, &i, &password)?;
  }
  if on && !hello_run(&app, "Confirme para usar o Windows Hello no Tesseract").await? {
    return Err("o Windows Hello não confirmou".into());
  }
  let (s, sec) = (app.state::<AppDb>(), app.state::<Sec>());
  let (c, i) = open!(s, sec);
  let mut cfg = load(&c);
  if !on && !cfg.totp && !cfg.codes.is_empty() {
    // sem nenhum 2º fator, os códigos de recuperação não servem para nada
    cfg.codes.clear();
  }
  cfg.hello = on;
  log(&mut cfg, if on { "Windows Hello ligado" } else { "Windows Hello desligado" }, "");
  save(&c, &cfg)?;
  Ok(status_of(&cfg, &i, hello_available()))
}

#[tauri::command]
pub fn sec_disable(s: State<AppDb>, sec: State<Sec>, password: String) -> Res<Status> {
  let (c, mut i) = open!(s, sec);
  let mut cfg = load(&c);
  need_pw(&c, &mut cfg, &i, &password)?;
  secret_del(&i.tag);
  let keep_log = std::mem::take(&mut cfg.log);
  cfg = Config { idle_min: Some(15), lock_with_windows: true, log: keep_log, ..Default::default() };
  log(&mut cfg, "Segurança desligada", "");
  save(&c, &cfg)?;
  db::audit(&c, "security.disable", json!({}))?;
  i.locked = false;
  i.pending = Pending::default();
  Ok(status_of(&cfg, &i, hello_available()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hotp_e_totp_batem_com_a_rfc() {
    // RFC 4226, apêndice D (segredo "12345678901234567890")
    let s = b"12345678901234567890";
    let want = [755224, 287082, 359152, 969429, 338314, 254676, 287922, 162583, 399871, 520489];
    for (i, w) in want.iter().enumerate() {
      assert_eq!(hotp(s, i as u64), *w);
    }
    // RFC 6238 (SHA1), T = 59 s → 94287082 em 8 dígitos; com 6 dígitos, 287082
    assert_eq!(totp_match(s, "287 082", 59, 0), Some(1));
    // o mesmo passo não vale duas vezes, e um código de 2 minutos atrás não vale
    assert_eq!(totp_match(s, "287082", 59, 1), None);
    assert_eq!(totp_match(s, "287082", 59 + 120, 0), None);
    assert_eq!(totp_match(s, "12345", 59, 0), None);
  }

  #[test]
  fn base32_vai_e_volta() {
    assert_eq!(base32(b"foobar"), "MZXW6YTBOI");
    for n in [1usize, 5, 19, 20] {
      let b: Vec<u8> = (0..n as u8).map(|x| x.wrapping_mul(37)).collect();
      assert_eq!(unbase32(&base32(&b)).unwrap(), b);
    }
    assert_eq!(unbase32("mzxw 6ytb oi").unwrap(), b"foobar");
  }

  #[test]
  fn senha_e_codigos_de_recuperacao() {
    let (salt, hash) = hash_pw("cavalo correto").unwrap();
    let cfg = Config { pw_salt: salt, pw_hash: hash, ..Default::default() };
    assert!(check_pw(&cfg, "cavalo correto"));
    assert!(!check_pw(&cfg, "cavalo errado!"));
    assert!(valid_pw("curta").is_err());

    let codes = new_codes();
    assert_eq!(codes.len(), 10);
    assert!(codes.iter().all(|c| c.len() == 9 && c.as_bytes()[4] == b'-'));
    let (cs, ch) = hash_codes(&codes).unwrap();
    let h = hex(&derive(&norm_code(&codes[2].to_lowercase().replace('-', " ")), &unhex(&cs).unwrap()).unwrap());
    assert_eq!(ch.iter().position(|x| *x == h), Some(2), "código digitado em minúsculas e com espaço ainda vale");
  }

  #[test]
  fn erros_seguidos_fazem_esperar() {
    let dir = std::env::temp_dir().join(format!("tesseract-sec-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let mut c = db::open(&dir.join("t.db")).unwrap();
    db::migrate(&mut c).unwrap();
    let mut cfg = load(&c);
    for _ in 0..4 {
      failed(&c, &mut cfg, "Senha");
    }
    assert!(guard(&cfg).is_ok(), "4 erros ainda não fazem esperar");
    let msg = failed(&c, &mut cfg, "Senha");
    assert!(msg.contains("espere"), "{msg}");
    assert!(guard(&load(&c)).is_err(), "a espera fica gravada no banco");
    assert!(allowed("sec_unlock_code") && !allowed("crm_companies"));
  }
}
