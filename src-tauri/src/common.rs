// Funções pequenas que o núcleo e os módulos Pro usam: bytes aleatórios, hex, nome do computador e os
// temporários em claro em tmp/ (backup, dois computadores, consulta de versão; o PlainTmp que os cria é do Pro). Moravam em cloud.rs, que é Pro.
use crate::AppDb;
use aes_gcm::aead::{rand_core::RngCore, OsRng};
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn random<const N: usize>() -> [u8; N] {
  let mut b = [0u8; N];
  OsRng.fill_bytes(&mut b);
  b
}

pub(crate) fn hex(b: &[u8]) -> String {
  b.iter().map(|x| format!("{x:02x}")).collect()
}

pub(crate) fn device() -> String {
  std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "este computador".into())
}

pub(crate) fn tmp_of(s: &AppDb) -> PathBuf {
  s.path.parent().map(|p| p.join("tmp")).unwrap_or_else(std::env::temp_dir)
}

// ---------- temporários em claro ----------

/// Prefixos dos temporários em claro que o app cria em tmp/ (backup, conferir, restaurar, dois computadores,
/// consultar versão).
pub(crate) const PLAIN_PREFIXES: &[&str] = &["nuvem-", "conferir-", "restaurar-", "sync-", "consulta-"];

/// Ao abrir o app: apaga os temporários em claro que sobraram de uma queda ou de desligar o computador no meio.
/// Só os do app (pelos prefixos), nada mais da pasta.
pub fn clean_tmp(tmp: &Path) -> usize {
  let Ok(rd) = fs::read_dir(tmp) else { return 0 };
  let mut n = 0;
  for f in rd.flatten() {
    let name = f.file_name().to_string_lossy().to_string();
    if f.path().is_file() && PLAIN_PREFIXES.iter().any(|p| name.starts_with(p)) && name.contains(".db") && fs::remove_file(f.path()).is_ok() {
      n += 1;
    }
  }
  n
}
