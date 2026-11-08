// Editor do Conhecimento (Grátis): lista, salva e cria notas na pasta da pessoa, faz a nota do dia,
// monta o grafo das ligações e acha as notas com blocos de plugin do Obsidian (que aparecem como texto).
// Garantias: só .md, só dentro da pasta (caminho relativo, sem "..", sem unidade, sem pasta oculta),
// gravação atômica (arquivo temporário + troca) e nada é salvo por cima de uma mudança feita fora do app.
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

const MAX_NOTE: usize = 2 * 1024 * 1024;

/// Caminho relativo de uma nota: .md, dentro da pasta, sem pasta oculta (.obsidian, .git, .trash).
pub fn note_rel(p: &str) -> Res<PathBuf> {
  let p = p.trim().replace('\\', "/");
  let bad = || format!("caminho de nota inválido: {p}");
  if p.is_empty() || p.contains(':') || p.len() > 240 || !p.to_lowercase().ends_with(".md") {
    return Err(bad());
  }
  let path = PathBuf::from(&p);
  for c in path.components() {
    match c {
      // sem pasta oculta, sem nome de dispositivo do Windows ("con.md") e sem ponto ou espaço no fim
      // (o Windows corta e o caminho apontaria para outro arquivo)
      Component::Normal(s)
        if {
          let n = s.to_string_lossy();
          !n.starts_with('.') && !n.trim().is_empty() && !n.ends_with(['.', ' ']) && !crate::common::windows_reserved(&n)
        } => {}
      _ => return Err(bad()),
    }
  }
  Ok(path)
}

fn mtime(p: &Path) -> Option<i64> {
  fs::metadata(p).ok()?.modified().ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs() as i64)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
  pub path: String,
  pub title: String,
  pub mtime: i64,
}

/// Todas as notas do índice, por caminho (a árvore é montada na tela).
pub fn list(c: &Connection) -> Res<Vec<Item>> {
  let mut st = c.prepare("SELECT path, title, mtime FROM notes ORDER BY lower(path)").map_err(e)?;
  let rows = st.query_map([], |r| Ok(Item { path: r.get(0)?, title: r.get(1)?, mtime: r.get(2)? })).map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Salva a nota. `base`: a data do arquivo quando a tela o leu; se mudou no disco desde então
/// (editado em outro programa), não salva por cima. Devolve a data nova.
pub fn write(root: &Path, rel: &str, content: &str, base: Option<i64>) -> Res<i64> {
  let r = note_rel(rel)?;
  if content.len() > MAX_NOTE {
    return Err("nota grande demais (mais de 2 MB)".into());
  }
  let full = root.join(&r);
  if let (Some(b), Some(now)) = (base, mtime(&full)) {
    if now != b {
      return Err("a nota mudou fora do Tesseract; recarregue antes de salvar para não perder nada".into());
    }
  }
  let parent = full.parent().ok_or("caminho inválido")?;
  fs::create_dir_all(parent).map_err(e)?;
  let name = full.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
  let tmp = parent.join(format!(".{name}.tesseract-tmp"));
  {
    let mut f = fs::File::create(&tmp).map_err(e)?;
    f.write_all(content.as_bytes()).map_err(e)?;
    f.sync_all().map_err(e)?;
  }
  if let Err(err) = fs::rename(&tmp, &full) {
    let _ = fs::remove_file(&tmp);
    return Err(e(err));
  }
  mtime(&full).ok_or_else(|| "não deu para ler a nota salva".into())
}

/// Cria uma nota nova; nunca sobrescreve.
pub fn create(root: &Path, rel: &str, content: &str) -> Res<()> {
  let r = note_rel(rel)?;
  if content.len() > MAX_NOTE {
    return Err("nota grande demais (mais de 2 MB)".into());
  }
  let full = root.join(&r);
  if let Some(parent) = full.parent() {
    fs::create_dir_all(parent).map_err(e)?;
  }
  let mut f = OpenOptions::new().write(true).create_new(true).open(&full).map_err(|err| {
    if err.kind() == std::io::ErrorKind::AlreadyExists {
      format!("já existe uma nota em {rel}")
    } else {
      e(err)
    }
  })?;
  f.write_all(content.as_bytes()).map_err(e)
}

fn valid_day(d: &str) -> bool {
  d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

/// Nota do dia em diario/AAAA-MM-DD.md. Se ainda não existe, nasce do modelo
/// (referencias/modelos/diario.md, com {{date}} e {{title}}) ou de um esqueleto curto.
/// Devolve o caminho e se foi criada agora.
pub fn daily(root: &Path, day: &str) -> Res<(String, bool)> {
  if !valid_day(day) {
    return Err("data no formato AAAA-MM-DD".into());
  }
  let rel = format!("diario/{day}.md");
  if root.join(&rel).exists() {
    return Ok((rel, false));
  }
  let tpl = ["referencias/modelos/diario.md", "modelos/diario.md", "templates/diario.md"]
    .iter()
    .find_map(|t| fs::read_to_string(root.join(t)).ok());
  let content = match tpl {
    Some(t) => t.replace("{{date}}", day).replace("{{title}}", day),
    None => format!("# {day}\n\n## O que fiz\n\n## O que decidi\n\n## Para lembrar\n"),
  };
  create(root, &rel, &content)?;
  Ok((rel, true))
}

#[derive(Serialize)]
pub struct Graph {
  /// (caminho, título) de cada nota.
  pub nodes: Vec<(String, String)>,
  /// Ligações entre notas que existem (índices em `nodes`), sem repetição.
  pub edges: Vec<(usize, usize)>,
}

/// Resolve [[alvo]] como o Obsidian: caminho exato, nome do arquivo (o caminho mais curto ganha) ou título.
struct Resolver {
  by_path: HashMap<String, usize>,
  by_name: HashMap<String, usize>,
  by_title: HashMap<String, usize>,
}
impl Resolver {
  fn new(nodes: &[(String, String)]) -> Self {
    let mut r = Resolver { by_path: HashMap::new(), by_name: HashMap::new(), by_title: HashMap::new() };
    let mut order: Vec<usize> = (0..nodes.len()).collect();
    order.sort_by_key(|&i| nodes[i].0.len());
    for i in order {
      let (path, title) = &nodes[i];
      let stem = path.trim_end_matches(".md").to_lowercase();
      let name = stem.rsplit('/').next().unwrap_or(&stem).to_string();
      r.by_path.entry(stem).or_insert(i);
      r.by_name.entry(name).or_insert(i);
      r.by_title.entry(title.to_lowercase()).or_insert(i);
    }
    r
  }
  fn get(&self, target: &str) -> Option<usize> {
    let t = target.trim().trim_end_matches(".md").replace('\\', "/").to_lowercase();
    self.by_path.get(&t).or_else(|| self.by_name.get(&t)).or_else(|| self.by_title.get(&t)).copied()
  }
}

pub fn graph(c: &Connection) -> Res<Graph> {
  let mut st = c.prepare("SELECT id, path, title FROM notes ORDER BY id").map_err(e)?;
  let rows: Vec<(i64, String, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(e)?.flatten().collect();
  let pos: HashMap<i64, usize> = rows.iter().enumerate().map(|(i, r)| (r.0, i)).collect();
  let nodes: Vec<(String, String)> = rows.into_iter().map(|r| (r.1, r.2)).collect();
  let res = Resolver::new(&nodes);
  let mut seen = std::collections::HashSet::new();
  let mut edges = Vec::new();
  let mut st = c.prepare("SELECT note_id, target FROM note_links").map_err(e)?;
  for (nid, target) in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))).map_err(e)?.flatten() {
    let (Some(&a), Some(b)) = (pos.get(&nid), res.get(&target)) else { continue };
    if a != b && seen.insert((a.min(b), a.max(b))) {
      edges.push((a, b));
    }
  }
  Ok(Graph { nodes, edges })
}

/// Ligações que saem de uma nota: o alvo escrito e o caminho da nota, se ela existe.
pub fn links_of(c: &Connection, rel: &str) -> Res<Vec<(String, Option<String>)>> {
  let mut st = c.prepare("SELECT path, title FROM notes").map_err(e)?;
  let nodes: Vec<(String, String)> = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
  let res = Resolver::new(&nodes);
  let mut st = c.prepare("SELECT DISTINCT l.target FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.path = ?1").map_err(e)?;
  let targets: Vec<String> = st.query_map(params![rel], |r| r.get(0)).map_err(e)?.flatten().collect();
  Ok(targets.into_iter().map(|t| { let p = res.get(&t).map(|i| nodes[i].0.clone()); (t, p) }).collect())
}

#[derive(Serialize)]
pub struct Plugins {
  /// Notas com blocos de plugin (Dataview, Excalidraw, Tasks...): aparecem como texto aqui.
  pub notes: Vec<String>,
  /// Arquivos .canvas do Obsidian: ficam de fora.
  pub canvas: usize,
}

fn has_plugin_block(s: &str) -> bool {
  s.lines().any(|l| {
    let t = l.trim_start().to_lowercase();
    t.starts_with("```dataview") || t.starts_with("```dataviewjs") || t.starts_with("```tasks") || t.starts_with("```excalidraw") || t.starts_with("excalidraw-plugin:")
  })
}

fn count_canvas(dir: &Path, n: &mut usize, depth: usize) {
  if depth > 12 {
    return;
  }
  let Ok(rd) = fs::read_dir(dir) else { return };
  for ent in rd.flatten() {
    let name = ent.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    match ent.file_type() {
      Ok(ft) if ft.is_dir() => count_canvas(&ent.path(), n, depth + 1),
      Ok(_) if name.to_lowercase().ends_with(".canvas") => *n += 1,
      _ => {}
    }
  }
}

pub fn plugins(c: &Connection, root: &Path) -> Res<Plugins> {
  let mut st = c.prepare("SELECT path FROM notes ORDER BY lower(path)").map_err(e)?;
  let paths: Vec<String> = st.query_map([], |r| r.get(0)).map_err(e)?.flatten().collect();
  let notes = paths.into_iter().filter(|p| fs::read_to_string(root.join(p)).is_ok_and(|s| has_plugin_block(&s))).collect();
  let mut canvas = 0;
  count_canvas(root, &mut canvas, 0);
  Ok(Plugins { notes, canvas })
}

pub fn file_mtime(root: &Path, rel: &str) -> Option<i64> {
  mtime(&root.join(rel))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{db, index};

  fn setup(tag: &str) -> (Connection, PathBuf) {
    let dir = std::env::temp_dir().join(format!("tesseract-notes-{tag}-{}-{:?}", std::process::id(), std::thread::current().id()));
    let _ = fs::remove_dir_all(&dir);
    let vault = dir.join("base");
    fs::create_dir_all(&vault).unwrap();
    let mut c = db::open(&dir.join("n.db")).unwrap();
    db::migrate(&mut c).unwrap();
    (c, vault)
  }

  #[test]
  fn caminho_so_md_dentro_da_pasta() {
    assert!(note_rel("inbox/ideia.md").is_ok());
    assert!(note_rel("inbox\\ideia.md").is_ok());
    for bad in ["../fora.md", "C:/x.md", "/abs.md", ".obsidian/app.md", "inbox/.oculta.md", "nota.txt", "", "a/ /b.md", "con.md", "inbox/NUL.md", "com7/a.md", "lpt9.md", "pasta./a.md", "pasta /a.md"] {
      assert!(note_rel(bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn salva_sem_pisar_em_mudanca_de_fora() {
    let (_c, v) = setup("write");
    create(&v, "inbox/a.md", "# A\n").unwrap();
    assert!(create(&v, "inbox/a.md", "x").is_err(), "não sobrescreve");
    let m = mtime(&v.join("inbox/a.md")).unwrap();
    let m2 = write(&v, "inbox/a.md", "# A\n\nnovo", Some(m)).unwrap();
    assert_eq!(fs::read_to_string(v.join("inbox/a.md")).unwrap(), "# A\n\nnovo");
    assert!(write(&v, "inbox/a.md", "x", Some(m2 - 100)).is_err(), "mudou fora: recusa");
    assert!(!v.join("inbox/.a.md.tesseract-tmp").exists());
  }

  #[test]
  fn nota_do_dia_usa_o_modelo() {
    let (_c, v) = setup("daily");
    fs::create_dir_all(v.join("referencias/modelos")).unwrap();
    fs::write(v.join("referencias/modelos/diario.md"), "# {{date}}\n\n## Hoje\n").unwrap();
    assert_eq!(daily(&v, "2026-11-08").unwrap(), ("diario/2026-11-08.md".to_string(), true));
    assert_eq!(fs::read_to_string(v.join("diario/2026-11-08.md")).unwrap(), "# 2026-11-08\n\n## Hoje\n");
    assert_eq!(daily(&v, "2026-11-08").unwrap().1, false, "já existe: só abre");
    assert!(daily(&v, "08/11/2026").is_err());
  }

  #[test]
  fn grafo_liga_por_nome_caminho_e_titulo_e_acha_plugins() {
    let (mut c, v) = setup("graph");
    create(&v, "projetos/padaria/overview.md", "# Padaria Sol\n\n[[reuniao]] e [[pessoas/Marcia]] e [[nao existe]]").unwrap();
    create(&v, "projetos/padaria/reuniao.md", "# Reunião\n\nVer [[Padaria Sol]].\n\n```dataview\nlist\n```").unwrap();
    create(&v, "pessoas/Marcia.md", "# Márcia").unwrap();
    fs::write(v.join("mapa.canvas"), "{}").unwrap();
    index::run(&mut c, &v, false).unwrap();
    let g = graph(&c).unwrap();
    assert_eq!(g.nodes.len(), 3);
    assert_eq!(g.edges.len(), 2, "overview-reuniao (nos dois sentidos conta uma vez) e overview-Marcia");
    let l = links_of(&c, "projetos/padaria/overview.md").unwrap();
    assert!(l.contains(&("nao existe".to_string(), None)));
    assert!(l.contains(&("reuniao".to_string(), Some("projetos/padaria/reuniao.md".to_string()))));
    let p = plugins(&c, &v).unwrap();
    assert_eq!((p.notes, p.canvas), (vec!["projetos/padaria/reuniao.md".to_string()], 1));
  }
}
