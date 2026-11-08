// Cria a base de conhecimento da pessoa: uma pasta de arquivos Markdown, dela, que abre em qualquer editor.
// O conteúdo vem do front (src/data/brain.ts); aqui ficam as garantias:
//   - só escreve dentro da pasta escolhida (caminhos relativos, sem "..", sem unidade);
//   - só .md, e .json dentro de .obsidian/ (aceito por compatibilidade; a base nova não cria essa pasta);
//   - a pasta precisa estar vazia ou não existir, e nenhum arquivo é sobrescrito.
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize)]
pub struct BrainFile {
  pub path: String,
  pub content: String,
}

#[derive(Serialize)]
pub struct Created {
  pub root: String,
  pub dirs: usize,
  pub files: usize,
}

/// Caminho relativo seguro dentro da raiz, ou erro.
fn rel(p: &str) -> Result<PathBuf, String> {
  let path = Path::new(p);
  if p.is_empty() || p.contains(':') || p.len() > 240 {
    return Err(format!("caminho inválido: {p}"));
  }
  for c in path.components() {
    match c {
      Component::Normal(_) => {}
      _ => return Err(format!("caminho inválido: {p}")),
    }
  }
  Ok(path.to_path_buf())
}

fn allowed_file(p: &Path) -> bool {
  let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
  let in_obsidian = p.components().next().is_some_and(|c| c.as_os_str() == ".obsidian");
  ext == "md" || (ext == "json" && in_obsidian)
}

/// A raiz precisa ser absoluta e estar vazia (ou não existir).
pub fn check_root(root: &str) -> Result<PathBuf, String> {
  let r = PathBuf::from(root.trim());
  if !r.is_absolute() {
    return Err("escolha uma pasta completa (ex.: C:\\Users\\voce\\Documents\\Base de conhecimento)".into());
  }
  if r.exists() {
    if !r.is_dir() {
      return Err("já existe um arquivo com esse nome".into());
    }
    if fs::read_dir(&r).map_err(|e| e.to_string())?.next().is_some() {
      return Err("a pasta já tem arquivos; escolha uma pasta vazia ou um nome novo".into());
    }
  }
  Ok(r)
}

pub fn create(root: &str, dirs: &[String], files: &[BrainFile]) -> Result<Created, String> {
  // valida tudo antes de escrever qualquer coisa
  let r = check_root(root)?;
  let dirs: Vec<PathBuf> = dirs.iter().map(|d| rel(d)).collect::<Result<_, _>>()?;
  let mut plan = Vec::with_capacity(files.len());
  for f in files {
    let p = rel(&f.path)?;
    if !allowed_file(&p) {
      return Err(format!("tipo de arquivo não permitido: {}", f.path));
    }
    plan.push((p, &f.content));
  }

  fs::create_dir_all(&r).map_err(|e| e.to_string())?;
  for d in &dirs {
    fs::create_dir_all(r.join(d)).map_err(|e| e.to_string())?;
  }
  for (p, content) in &plan {
    let full = r.join(p);
    if let Some(parent) = full.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // create_new: nunca sobrescreve
    let mut f = OpenOptions::new().write(true).create_new(true).open(&full).map_err(|e| format!("{}: {e}", p.display()))?;
    f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
  }
  Ok(Created { root: r.to_string_lossy().to_string(), dirs: dirs.len(), files: plan.len() })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn f(path: &str) -> BrainFile {
    BrainFile { path: path.into(), content: "# ok".into() }
  }

  #[test]
  fn recusa_caminhos_fora_da_pasta() {
    for bad in ["../fora.md", "C:\\x.md", "/abs.md", "a/../../b.md", ""] {
      assert!(rel(bad).is_err(), "{bad}");
    }
    assert!(rel("projetos/x/overview.md").is_ok());
  }

  #[test]
  fn so_markdown_e_config_do_obsidian() {
    assert!(allowed_file(Path::new("inbox/a.md")));
    assert!(allowed_file(Path::new(".obsidian/daily-notes.json")));
    assert!(!allowed_file(Path::new("inbox/a.json")));
    assert!(!allowed_file(Path::new("script.exe")));
  }

  #[test]
  fn cria_e_recusa_pasta_com_arquivos() {
    let root = std::env::temp_dir().join(format!("tesseract-brain-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let rs = root.to_string_lossy().to_string();
    let out = create(&rs, &["inbox".into(), "arquivo".into()], &[f("LEIA-ME.md"), f("diario/2026-10-31.md"), f(".obsidian/app.json")]).unwrap();
    assert_eq!((out.dirs, out.files), (2, 3));
    assert!(root.join("inbox").is_dir() && root.join("diario/2026-10-31.md").is_file());
    // segunda vez: pasta não está vazia
    assert!(create(&rs, &[], &[f("LEIA-ME.md")]).is_err());
    // nada é escrito se um caminho for inválido
    let other = root.with_extension("b");
    let _ = fs::remove_dir_all(&other);
    assert!(create(&other.to_string_lossy(), &[], &[f("ok.md"), f("../ruim.md")]).is_err());
    assert!(!other.exists());
  }
}
