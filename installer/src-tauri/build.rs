use std::{env, fs, path::PathBuf};

// Empacota o app dentro do instalador: lê o app.exe da versão de lançamento (ou TESSERACT_APP_EXE),
// comprime com zstd e deixa no OUT_DIR para o include_bytes!. A versão vem do tauri.conf.json do app.
fn main() {
  let out = PathBuf::from(env::var("OUT_DIR").unwrap());
  let exe = env::var("TESSERACT_APP_EXE")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("../../src-tauri/target/release/app.exe"));
  println!("cargo:rerun-if-env-changed=TESSERACT_APP_EXE");
  println!("cargo:rerun-if-changed={}", exe.display());
  let (payload, len) = match fs::read(&exe) {
    Ok(bytes) => {
      let level = if env::var("PROFILE").as_deref() == Ok("release") { 19 } else { 3 };
      (zstd::encode_all(&bytes[..], level).expect("zstd"), bytes.len())
    }
    Err(_) => {
      println!("cargo:warning=app.exe não encontrado em {}: o instalador sai sem o app (só para testar a interface)", exe.display());
      (Vec::new(), 0)
    }
  };
  fs::write(out.join("payload.zst"), payload).unwrap();
  println!("cargo:rustc-env=PAYLOAD_LEN={len}");

  let conf_path = "../../src-tauri/tauri.conf.json";
  println!("cargo:rerun-if-changed={conf_path}");
  let conf: serde_json::Value = serde_json::from_str(&fs::read_to_string(conf_path).unwrap()).unwrap();
  println!("cargo:rustc-env=TESSERACT_VERSION={}", conf["version"].as_str().unwrap());

  tauri_build::build()
}
