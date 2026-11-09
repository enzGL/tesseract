// O instalador (e o app) desenham a tela com o Microsoft Edge WebView2. Ele vem no Windows 11 e na
// maioria dos Windows 10, mas não em todos. Sem ele, a janela nem abre e o Windows mostra só um erro em
// inglês. Por isso, antes de abrir qualquer janela, o instalador confere e, se faltar, oferece instalar
// pelo instalador oficial da Microsoft (o "bootstrapper", que baixa a versão certa para o computador).
// O arquivo baixado só roda com assinatura digital válida da Microsoft.
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use windows_sys::Win32::UI::WindowsAndMessaging::{IDYES, MB_ICONERROR, MB_ICONINFORMATION, MB_OK, MB_YESNO, MessageBoxW};

const BOOTSTRAPPER: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
const PAGINA: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";
const TITULO: &str = "Instalar o Tesseract";
const NO_WINDOW: u32 = 0x0800_0000;

fn has() -> bool {
  tauri::webview_version().map(|v| !v.trim().is_empty()).unwrap_or(false)
}

fn wide(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn ask(text: &str, flags: u32) -> i32 {
  let (t, c) = (wide(text), wide(TITULO));
  unsafe { MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), flags) }
}

fn download(to: &Path) -> Result<(), String> {
  let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout_read(Duration::from_secs(60)).build();
  let res = agent.get(BOOTSTRAPPER).call().map_err(|e| format!("não deu para baixar: {e}"))?;
  let mut buf = Vec::new();
  res.into_reader().take(20 * 1024 * 1024).read_to_end(&mut buf).map_err(|e| format!("o download parou: {e}"))?;
  if buf.len() < 100 * 1024 || !buf.starts_with(b"MZ") {
    return Err("o arquivo baixado não é um instalador".into());
  }
  std::fs::write(to, &buf).map_err(|e| format!("não deu para gravar o arquivo: {e}"))
}

/// Assinatura Authenticode válida e emitida para a Microsoft (conferida pelo próprio Windows).
fn signed_by_microsoft(file: &Path) -> bool {
  let script = "$s = Get-AuthenticodeSignature -LiteralPath $env:TESS_WV2; \
                if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match 'O=Microsoft Corporation') { 'ok' }";
  Command::new("powershell.exe")
    .args(["-NoProfile", "-NonInteractive", "-Command", script])
    .env("TESS_WV2", file)
    .creation_flags(NO_WINDOW)
    .output()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "ok")
    .unwrap_or(false)
}

fn install() -> Result<(), String> {
  let file = std::env::temp_dir().join(format!("tesseract-webview2-{}.exe", std::process::id()));
  download(&file)?;
  if !signed_by_microsoft(&file) {
    let _ = std::fs::remove_file(&file);
    return Err("o arquivo baixado não tem a assinatura da Microsoft, então não foi aberto".into());
  }
  // sem /silent: a Microsoft mostra a própria janela de progresso enquanto instala
  let status = Command::new(&file).arg("/install").status();
  let _ = std::fs::remove_file(&file);
  status.map_err(|e| format!("não deu para abrir o instalador da Microsoft: {e}"))?;
  Ok(())
}

/// true: pode abrir a janela. false: falta o WebView2 e a pessoa já foi avisada (o instalador fecha).
pub fn ensure() -> bool {
  if has() {
    return true;
  }
  let pergunta = "O Tesseract precisa do Microsoft Edge WebView2, um componente gratuito da Microsoft que mostra as telas do app. Ele já vem na maioria dos computadores, mas não neste.\n\nInstalar agora? Precisa de internet e leva cerca de um minuto.";
  if ask(pergunta, MB_YESNO | MB_ICONINFORMATION) != IDYES {
    ask(&format!("Sem o WebView2 o Tesseract não abre. Você pode instalá-lo pela página da Microsoft e depois abrir este instalador de novo:\n\n{PAGINA}"), MB_OK | MB_ICONINFORMATION);
    return false;
  }
  let erro = match install() {
    Ok(()) if has() => return true,
    Ok(()) => "a instalação da Microsoft não terminou".to_string(),
    Err(e) => e,
  };
  ask(&format!("Não deu para instalar o WebView2: {erro}.\n\nInstale pela página da Microsoft e abra este instalador de novo:\n\n{PAGINA}"), MB_OK | MB_ICONERROR);
  false
}
