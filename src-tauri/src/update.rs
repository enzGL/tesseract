// Atualização automática (fase 13). O tauri-plugin-updater lê o latest.json do site, baixa o
// instalador novo e confere a assinatura com a chave pública do tauri.conf.json; quem instala é o
// nosso instalador, chamado com --update (instala na mesma pasta, mantém atalhos e reabre o app).
// A checagem só manda um pedido do arquivo latest.json: nenhum dado da pessoa sai do computador.
//
// Um app só para Grátis e Pro: toda versão vai para todo mundo (o que é do Pro fica travado sem a
// licença). O latest.json traz, além da nota, as novidades separadas ("todos" e "pro") e a marca
// "seguranca" (a faixa não deixa adiar). Build do código aberto (sem a pasta pro/) não se atualiza
// sozinho: quem compilou atualiza pelo GitHub, e o instalador oficial nunca troca o build da pessoa.
//
// TESSERACT_UPDATE_URL troca o endereço, só na versão de desenvolvimento (segurança: no
// lançamento o endereço é o do tauri.conf.json e pronto); a assinatura continua exigida. Endereço http só
// funciona num build de teste com --config '{"plugins":{"updater":{"dangerousInsecureTransportProtocol":true}}}'.
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

type Res<T> = Result<T, String>;

/// Página das versões do código aberto (endereço fixo: a tela não escolhe para onde vai).
const GITHUB_RELEASES: &str = "https://github.com/enzGL/tesseract/releases";

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Available {
  version: String,
  current: String,
  notes: Option<String>,
  /// Novidades para todos e só do Pro (vazias se o latest.json não trouxer).
  todos: Vec<String>,
  pro: Vec<String>,
  /// Correção de segurança: instalar sem adiar.
  seguranca: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
  /// "oficial" (instalador do site) ou "codigo-aberto" (compilado do GitHub, sem atualização automática).
  channel: &'static str,
  available: Option<Available>,
}

#[derive(Serialize, Clone)]
struct Progress {
  done: u64,
  total: u64,
}

/// Instalador já baixado esperando o app fechar ("instalar ao fechar").
static PENDING: Mutex<Option<(PathBuf, [u8; 32])>> = Mutex::new(None);

const fn channel() -> &'static str {
  if cfg!(pro) {
    "oficial"
  } else {
    "codigo-aberto"
  }
}

fn strings(v: &Value) -> Vec<String> {
  v.as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(|s| s.trim().chars().take(300).collect::<String>()).filter(|s| !s.is_empty()).take(20).collect()).unwrap_or_default()
}

async fn find(app: &AppHandle) -> Res<Option<tauri_plugin_updater::Update>> {
  let mut b = app.updater_builder();
  if let Some(url) = test_url() {
    b = b.endpoints(vec![url.parse().map_err(|e| format!("endereço de atualização: {e}"))?]).map_err(|e| e.to_string())?;
  }
  b.build().map_err(|e| e.to_string())?.check().await.map_err(|e| format!("não deu para procurar atualização: {e}"))
}

/// Endereço de teste da atualização: só existe na versão de desenvolvimento.
fn test_url() -> Option<String> {
  if cfg!(debug_assertions) {
    pick_test_url(std::env::var("TESSERACT_UPDATE_URL").ok(), true)
  } else {
    None
  }
}
fn pick_test_url(var: Option<String>, dev: bool) -> Option<String> {
  var.filter(|u| dev && !u.trim().is_empty())
}

/// SHA-256 do instalador conferido, para reconferir o arquivo antes de abrir.
fn sha256(bytes: &[u8]) -> [u8; 32] {
  use sha2::{Digest, Sha256};
  Sha256::digest(bytes).into()
}

/// Abre o instalador só se o arquivo ainda é o que teve a assinatura conferida: entre gravar e abrir
/// (no "instalar ao fechar" podem ser horas) outro programa podia trocar o arquivo na pasta temporária.
fn same_file(exe: &PathBuf, hash: &[u8; 32]) -> bool {
  std::fs::read(exe).map(|b| &sha256(&b) == hash).unwrap_or(false)
}

/// Versão gravada DENTRO do instalador (o recurso de versão do Windows, "0.3.2" -> [0, 3, 2, 0]).
/// Faz parte do arquivo assinado, ao contrário do número do latest.json, que qualquer um que
/// controle o site escreve como quiser.
fn exe_version(bytes: &[u8]) -> Option<[u16; 4]> {
  let tag: Vec<u8> = "VS_VERSION_INFO".encode_utf16().flat_map(u16::to_le_bytes).collect();
  let at = bytes.windows(tag.len()).position(|w| w == tag)? + tag.len();
  let rest = bytes.get(at..(at + 64).min(bytes.len()))?;
  let sig = rest.windows(4).position(|w| w == [0xBD, 0x04, 0xEF, 0xFE])?; // VS_FIXEDFILEINFO
  let u = |o: usize| rest.get(sig + o..sig + o + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]));
  let (ms, ls) = (u(8)?, u(12)?);
  Some([(ms >> 16) as u16, ms as u16, (ls >> 16) as u16, ls as u16])
}

/// A atualização só anda para a frente: o instalador baixado tem de ser de uma versão MAIOR que a
/// deste app. A assinatura garante quem fez o arquivo, não qual versão ele é: sem isto, quem trocasse
/// o latest.json do site por "versão 9.9.9" apontando para um instalador oficial antigo faria o app
/// voltar para uma versão com falhas já corrigidas (segurança). Instalador sem a versão
/// gravada não passa.
fn goes_forward(installer: Option<[u16; 4]>, current: &str) -> bool {
  let cur: Vec<u64> = current.trim().split(['.', '-', '+']).take(3).map(|p| p.parse().unwrap_or(0)).collect();
  installer.is_some_and(|v| v[..3].iter().map(|x| u64::from(*x)).collect::<Vec<_>>() > cur)
}

/// `probe`: só diz o canal, sem pedido de rede (a tela de Configurações usa ao abrir).
#[tauri::command]
pub async fn update_check(app: AppHandle, probe: Option<bool>) -> Res<Check> {
  if channel() != "oficial" || probe == Some(true) {
    return Ok(Check { channel: channel(), available: None });
  }
  let available = find(&app).await?.map(|u| {
    let n = &u.raw_json["novidades"];
    Available {
      version: u.version.clone(),
      current: u.current_version.clone(),
      notes: u.body.clone(),
      todos: strings(&n["todos"]),
      pro: strings(&n["pro"]),
      seguranca: u.raw_json["seguranca"].as_bool().unwrap_or(false),
    }
  });
  Ok(Check { channel: channel(), available })
}

fn spawn_installer(app: &AppHandle, exe: &PathBuf, hash: &[u8; 32]) -> Res<()> {
  if !same_file(exe, hash) {
    let _ = std::fs::remove_file(exe);
    return Err("o instalador baixado foi alterado depois de conferido. Nada foi instalado; procure a atualização de novo.".into());
  }
  std::process::Command::new(exe).arg("--update").spawn().map_err(|e| format!("não deu para abrir o instalador: {e}"))?;
  app.exit(0);
  Ok(())
}

/// `when`: "agora" (padrão) baixa, confere a assinatura e instala; "ao-fechar" só baixa e guarda,
/// e "fechando" (chamado pela tela quando a janela vai fechar) roda o que foi guardado;
/// "github" abre a página das versões do código aberto.
#[tauri::command]
pub async fn update_install(app: AppHandle, when: Option<String>) -> Res<()> {
  let when = when.unwrap_or_else(|| "agora".into());
  if when == "github" {
    return std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", GITHUB_RELEASES]).spawn().map(|_| ()).map_err(|x| format!("não deu para abrir o navegador: {x}"));
  }
  if channel() != "oficial" {
    return Err("este Tesseract foi compilado do código aberto: atualize pelo GitHub".into());
  }
  if when == "fechando" {
    let exe = PENDING.lock().map_err(|_| "atualização indisponível")?.take();
    return match exe {
      Some((exe, hash)) if exe.exists() => spawn_installer(&app, &exe, &hash),
      _ => Ok(()),
    };
  }
  let update = find(&app).await?.ok_or("nenhuma atualização disponível")?;
  let mut done = 0u64;
  let a = app.clone();
  let bytes = update
    .download(
      move |chunk, total| {
        done += chunk as u64;
        let _ = a.emit("update-progress", Progress { done, total: total.unwrap_or(0) });
      },
      || {},
    )
    .await
    .map_err(|e| {
      let e = e.to_string();
      let low = e.to_lowercase();
      if low.contains("signature") || low.contains("minisign") {
        "a assinatura da atualização não confere: o arquivo baixado não é o original. Nada foi instalado.".to_string()
      } else {
        format!("download da atualização: {e}")
      }
    })?;
  if !goes_forward(exe_version(&bytes), env!("CARGO_PKG_VERSION")) {
    return Err("a atualização oferecida não é mais nova que a versão instalada. Nada foi instalado.".into());
  }
  // nome com um trecho aleatório: ninguém deixa um arquivo pronto no caminho antes do download
  let exe = std::env::temp_dir().join(format!("Tesseract-Setup-{}-{}.exe", update.version, crate::common::hex(&crate::common::random::<6>())));
  let hash = sha256(&bytes);
  std::fs::write(&exe, bytes).map_err(|e| e.to_string())?;
  if when == "ao-fechar" {
    *PENDING.lock().map_err(|_| "atualização indisponível")? = Some((exe, hash));
    return Ok(());
  }
  spawn_installer(&app, &exe, &hash)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn novidades_do_latest_json() {
    let v: Value = serde_json::json!({ "todos": [" Editor de notas ", "", 3, "Grafo"], "pro": "x" });
    assert_eq!(strings(&v["todos"]), vec!["Editor de notas", "Grafo"]);
    assert!(strings(&v["pro"]).is_empty());
    assert!(strings(&v["nada"]).is_empty());
    let longo = serde_json::json!(["a".repeat(500)]);
    assert_eq!(strings(&longo)[0].chars().count(), 300);
  }

  // Segurança: o instalador só abre se o arquivo ainda é o que foi conferido.
  #[test]
  fn instalador_trocado_depois_de_conferido_nao_abre() {
    let exe = std::env::temp_dir().join(format!("tesseract-update-teste-{}.exe", std::process::id()));
    std::fs::write(&exe, b"instalador conferido").unwrap();
    let hash = sha256(b"instalador conferido");
    assert!(same_file(&exe, &hash));
    std::fs::write(&exe, b"outro arquivo no lugar").unwrap();
    assert!(!same_file(&exe, &hash), "trocado");
    let _ = std::fs::remove_file(&exe);
    assert!(!same_file(&exe, &hash), "apagado");
  }

  // Segurança: o instalador baixado tem de ser de uma versão maior que a do app, pela versão
  // gravada dentro do arquivo assinado (não pela do latest.json).
  #[test]
  fn atualizacao_so_anda_para_a_frente() {
    let exe = |v: [u16; 4]| {
      let mut b = vec![0x4D, 0x5A, 1, 2, 3];
      b.extend("VS_VERSION_INFO".encode_utf16().flat_map(u16::to_le_bytes));
      b.extend([0, 0, 0, 0]); // terminador e alinhamento
      b.extend([0xBD, 0x04, 0xEF, 0xFE, 0, 0, 1, 0]); // assinatura e versão da estrutura
      b.extend(((u32::from(v[0]) << 16) | u32::from(v[1])).to_le_bytes());
      b.extend(((u32::from(v[2]) << 16) | u32::from(v[3])).to_le_bytes());
      b.extend([0u8; 40]);
      b
    };
    assert_eq!(exe_version(&exe([0, 3, 1, 0])), Some([0, 3, 1, 0]));
    assert!(goes_forward(exe_version(&exe([0, 3, 3, 0])), "0.3.2"));
    assert!(goes_forward(exe_version(&exe([0, 10, 0, 0])), "0.9.9"), "compara número, não texto");
    assert!(!goes_forward(exe_version(&exe([0, 3, 1, 0])), "0.3.2"), "instalador oficial antigo");
    assert!(!goes_forward(exe_version(&exe([0, 3, 2, 0])), "0.3.2"), "a mesma versão não é atualização");
    assert!(!goes_forward(exe_version(b"MZ sem recurso de versao"), "0.3.2"), "sem versão gravada não passa");
    assert!(!goes_forward(exe_version(&exe([0, 3, 3, 0])[..40]), "0.3.2"), "arquivo cortado");
  }

  // Segurança: o endereço de teste só vale na versão de desenvolvimento.
  #[test]
  fn endereco_de_teste_so_no_desenvolvimento() {
    let url = || Some("https://exemplo.invalid/latest.json".to_string());
    assert_eq!(pick_test_url(url(), true), url());
    assert_eq!(pick_test_url(url(), false), None, "no lançamento a variável não vale");
    assert_eq!(pick_test_url(Some("  ".into()), true), None);
  }

  #[test]
  fn canal_segue_o_build() {
    assert_eq!(channel(), if cfg!(pro) { "oficial" } else { "codigo-aberto" });
  }
}
