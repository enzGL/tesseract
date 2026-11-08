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
// TESSERACT_UPDATE_URL troca o endereço (teste); a assinatura continua exigida. Endereço http só
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
static PENDING: Mutex<Option<PathBuf>> = Mutex::new(None);

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
  if let Ok(url) = std::env::var("TESSERACT_UPDATE_URL") {
    b = b.endpoints(vec![url.parse().map_err(|e| format!("endereço de atualização: {e}"))?]).map_err(|e| e.to_string())?;
  }
  b.build().map_err(|e| e.to_string())?.check().await.map_err(|e| format!("não deu para procurar atualização: {e}"))
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

fn spawn_installer(app: &AppHandle, exe: &PathBuf) -> Res<()> {
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
      Some(exe) if exe.exists() => spawn_installer(&app, &exe),
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
  let exe = std::env::temp_dir().join(format!("Tesseract-Setup-{}.exe", update.version));
  std::fs::write(&exe, bytes).map_err(|e| e.to_string())?;
  if when == "ao-fechar" {
    *PENDING.lock().map_err(|_| "atualização indisponível")? = Some(exe);
    return Ok(());
  }
  spawn_installer(&app, &exe)
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

  #[test]
  fn canal_segue_o_build() {
    assert_eq!(channel(), if cfg!(pro) { "oficial" } else { "codigo-aberto" });
  }
}
