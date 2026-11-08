fn main() {
  // Tesseract Pro: com a pasta pro/ (cópia do repositório privado tesseract-pro) ao lado de src-tauri/,
  // os módulos Pro entram no app (cfg `pro`). Sem ela, sai o Grátis completo do código aberto.
  // TESSERACT_SEM_PRO=1 força o build sem o Pro mesmo com a pasta (para testar o código aberto).
  println!("cargo:rustc-check-cfg=cfg(pro)");
  println!("cargo:rerun-if-changed=../pro/rust/pro.rs");
  println!("cargo:rerun-if-env-changed=TESSERACT_SEM_PRO");
  let sem_pro = std::env::var("TESSERACT_SEM_PRO").is_ok_and(|v| !v.trim().is_empty() && v != "0");
  if std::path::Path::new("../pro/rust/pro.rs").exists() && !sem_pro {
    println!("cargo:rustc-cfg=pro");
  }
  tauri_build::build()
}
