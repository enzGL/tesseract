// Atualização automática (fase 13). O tauri-plugin-updater lê o latest.json do site, baixa o
// instalador novo e confere a assinatura com a chave pública do tauri.conf.json; quem instala é o
// nosso instalador, chamado com --update (instala na mesma pasta, mantém atalhos e reabre o app).
// A checagem só manda um pedido do arquivo latest.json: nenhum dado da pessoa sai do computador.
//
// TESSERACT_UPDATE_URL troca o endereço (teste); a assinatura continua exigida. Endereço http só
// funciona num build de teste com --config '{"plugins":{"updater":{"dangerousInsecureTransportProtocol":true}}}'.
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

type Res<T> = Result<T, String>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Available {
  version: String,
  current: String,
  notes: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
  done: u64,
  total: u64,
}

async fn find(app: &AppHandle) -> Res<Option<tauri_plugin_updater::Update>> {
  let mut b = app.updater_builder();
  if let Ok(url) = std::env::var("TESSERACT_UPDATE_URL") {
    b = b.endpoints(vec![url.parse().map_err(|e| format!("endereço de atualização: {e}"))?]).map_err(|e| e.to_string())?;
  }
  b.build().map_err(|e| e.to_string())?.check().await.map_err(|e| format!("não deu para procurar atualização: {e}"))
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Res<Option<Available>> {
  Ok(find(&app).await?.map(|u| Available { version: u.version.clone(), current: u.current_version.clone(), notes: u.body.clone() }))
}

/// Baixa (com a assinatura conferida), grava o instalador na pasta temporária, abre com --update e
/// fecha o app; o instalador reabre a versão nova no fim.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Res<()> {
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
      if e.to_lowercase().contains("signature") {
        "a assinatura da atualização não confere: o arquivo baixado não é o original. Nada foi instalado.".to_string()
      } else {
        format!("download da atualização: {e}")
      }
    })?;
  let exe = std::env::temp_dir().join(format!("Tesseract-Setup-{}.exe", update.version));
  std::fs::write(&exe, bytes).map_err(|e| e.to_string())?;
  std::process::Command::new(&exe).arg("--update").spawn().map_err(|e| format!("não deu para abrir o instalador: {e}"))?;
  app.exit(0);
  Ok(())
}
