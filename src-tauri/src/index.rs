// Índice do Conhecimento: lê as notas .md da pasta (o editor fica em notes.rs), corta em trechos e guarda no SQLite
// com busca textual FTS5. Incremental: só reprocessa nota nova ou alterada (data e tamanho) e tira do
// índice o que sumiu do disco. O vault é a fonte da verdade; o índice pode ser refeito a qualquer hora.
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::{Instant, UNIX_EPOCH};

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

/// Pastas sensíveis: só entram no índice com opt-in (vault.sensitive). ARCHITECTURE.md, Segundo cérebro.
pub const SENSITIVE: &[&str] = &["financas", "pessoal"];
const MAX_CHUNK: usize = 1200;
const MAX_FILE: u64 = 2 * 1024 * 1024; // nota maior que 2 MB não é nota: ignora

#[derive(Serialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Report {
  pub scanned: usize,
  pub added: usize,
  pub updated: usize,
  pub removed: usize,
  pub notes: usize,
  pub chunks: usize,
  pub ms: u128,
}

struct FileInfo {
  rel: String,
  mtime: i64,
  size: i64,
}

fn walk(root: &Path, dir: &Path, sensitive: bool, out: &mut Vec<FileInfo>) {
  let Ok(entries) = fs::read_dir(dir) else { return };
  for ent in entries.flatten() {
    let name = ent.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue; // .obsidian, .git, .trash
    }
    let Ok(ft) = ent.file_type() else { continue };
    let path = ent.path();
    if ft.is_dir() {
      if dir == root && !sensitive && SENSITIVE.contains(&name.to_lowercase().as_str()) {
        continue;
      }
      walk(root, &path, sensitive, out);
    } else if name.to_lowercase().ends_with(".md") {
      let Ok(meta) = ent.metadata() else { continue };
      if meta.len() > MAX_FILE {
        continue;
      }
      let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs() as i64);
      let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
      out.push(FileInfo { rel, mtime, size: meta.len() as i64 });
    }
  }
}

/// Pasta de modelos configurada no Obsidian (.obsidian/templates.json), se houver.
fn templates_dir(root: &Path) -> Option<String> {
  let raw = fs::read_to_string(root.join(".obsidian").join("templates.json")).ok()?;
  let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
  let d = v["folder"].as_str()?.trim().trim_matches('/').replace('\\', "/");
  if d.is_empty() { None } else { Some(d) }
}

/// Nota dentro da pasta de modelos do Obsidian, ou de uma pasta chamada modelos/templates.
fn is_template_path(rel: &str, tpl: Option<&str>) -> bool {
  if let Some(t) = tpl {
    if rel == t || rel.starts_with(&format!("{t}/")) {
      return true;
    }
  }
  let lower = rel.to_lowercase();
  lower.split('/').rev().skip(1).any(|dir| matches!(dir, "modelos" | "templates" | "plantillas" | "_templates"))
}

/// Tira o frontmatter YAML (--- ... ---) do começo.
fn strip_frontmatter(s: &str) -> &str {
  if let Some(rest) = s.strip_prefix("---\n").or_else(|| s.strip_prefix("---\r\n")) {
    if let Some(end) = rest.find("\n---") {
      let after = &rest[end + 4..];
      return after.trim_start_matches(['\r', '\n']);
    }
  }
  s
}

pub struct Parsed {
  pub title: String,
  pub chunks: Vec<(Option<String>, String)>,
  pub links: Vec<String>,
}

/// Título (primeiro "# ", senão o nome do arquivo), trechos por seção e [[links]].
pub fn parse(rel: &str, raw: &str) -> Parsed {
  let body = strip_frontmatter(raw);
  let fallback = rel.rsplit('/').next().unwrap_or(rel).trim_end_matches(".md").to_string();
  let mut title = None;
  let mut sections: Vec<(Option<String>, String)> = vec![(None, String::new())];
  let mut in_code = false;
  for line in body.lines() {
    if line.trim_start().starts_with("```") {
      in_code = !in_code;
    }
    let t = line.trim_start();
    if !in_code && t.starts_with('#') {
      let level = t.chars().take_while(|c| *c == '#').count();
      if level <= 6 && t[level..].starts_with(' ') {
        let h = t[level..].trim().to_string();
        if level == 1 && title.is_none() {
          title = Some(h.clone());
        }
        sections.push((Some(h), String::new()));
        continue;
      }
    }
    let cur = &mut sections.last_mut().unwrap().1;
    cur.push_str(line);
    cur.push('\n');
  }

  let mut chunks = Vec::new();
  for (heading, text) in sections {
    let text = text.trim();
    if text.is_empty() {
      continue;
    }
    // seção longa: corta em parágrafos até ~MAX_CHUNK caracteres
    let mut buf = String::new();
    for para in text.split("\n\n") {
      if !buf.is_empty() && buf.chars().count() + para.chars().count() > MAX_CHUNK {
        chunks.push((heading.clone(), std::mem::take(&mut buf)));
      }
      if !buf.is_empty() {
        buf.push_str("\n\n");
      }
      buf.push_str(para.trim());
    }
    if !buf.trim().is_empty() {
      chunks.push((heading.clone(), buf));
    }
  }
  if chunks.is_empty() {
    chunks.push((None, String::new())); // nota vazia ainda acha pelo título
  }

  let mut links = Vec::new();
  let mut rest = body;
  while let Some(i) = rest.find("[[") {
    rest = &rest[i + 2..];
    let Some(j) = rest.find("]]") else { break };
    let inner = &rest[..j];
    let target = inner.split(['|', '#']).next().unwrap_or("").trim();
    if !target.is_empty() && target.len() < 200 && !target.contains('\n') {
      links.push(target.to_string());
    }
    rest = &rest[j + 2..];
  }

  Parsed { title: title.unwrap_or(fallback), chunks, links }
}

fn delete_note(tx: &Connection, id: i64) -> Res<()> {
  tx.execute("DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE note_id = ?1)", [id]).map_err(e)?;
  tx.execute("DELETE FROM notes WHERE id = ?1", [id]).map_err(e)?;
  Ok(())
}

/// Indexa o vault em `root`. `sensitive`: incluir pastas sensíveis.
pub fn run(c: &mut Connection, root: &Path, sensitive: bool) -> Res<Report> {
  let t0 = Instant::now();
  if !root.is_dir() {
    return Err(format!("pasta do Conhecimento não encontrada: {}", root.display()));
  }
  let mut files = Vec::new();
  walk(root, root, sensitive, &mut files);
  // modelos de nota ({{title}}, {{date}}) não são conhecimento: ficam fora do índice
  let tpl = templates_dir(root);
  files.retain(|f| !is_template_path(&f.rel, tpl.as_deref()));
  let mut rep = Report { scanned: files.len(), ..Default::default() };

  let tx = c.transaction().map_err(e)?;
  let mut known: HashMap<String, (i64, i64, i64)> = HashMap::new();
  {
    let mut st = tx.prepare("SELECT id, path, mtime, size FROM notes").map_err(e)?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(1)?, (r.get(0)?, r.get(2)?, r.get(3)?)))).map_err(e)?;
    for row in rows.flatten() {
      known.insert(row.0, row.1);
    }
  }

  for f in &files {
    let prev = known.remove(&f.rel);
    if let Some((_, m, s)) = prev {
      if m == f.mtime && s == f.size {
        continue; // sem mudança
      }
    }
    let Ok(raw) = fs::read_to_string(root.join(&f.rel)) else { continue };
    let p = parse(&f.rel, &raw);
    if p.title.contains("{{") {
      // nota-modelo fora da pasta de modelos: não entra (e sai, se já estava)
      if let Some((id, _, _)) = prev {
        delete_note(&tx, id)?;
        rep.removed += 1;
      }
      continue;
    }
    if let Some((id, _, _)) = prev {
      delete_note(&tx, id)?;
      rep.updated += 1;
    } else {
      rep.added += 1;
    }
    tx.execute("INSERT INTO notes (path, title, mtime, size) VALUES (?1, ?2, ?3, ?4)", params![f.rel, p.title, f.mtime, f.size]).map_err(e)?;
    let nid = tx.last_insert_rowid();
    for (i, (h, text)) in p.chunks.iter().enumerate() {
      tx.execute("INSERT INTO chunks (note_id, ord, heading, text) VALUES (?1, ?2, ?3, ?4)", params![nid, i as i64, h, text]).map_err(e)?;
      let cid = tx.last_insert_rowid();
      tx.execute("INSERT INTO chunks_fts (rowid, title, heading, text) VALUES (?1, ?2, ?3, ?4)", params![cid, p.title, h.clone().unwrap_or_default(), text]).map_err(e)?;
    }
    for l in &p.links {
      tx.execute("INSERT INTO note_links (note_id, target) VALUES (?1, ?2)", params![nid, l]).map_err(e)?;
    }
  }
  // o que sobrou em `known` sumiu do disco (ou virou pasta sensível excluída)
  for (_, (id, _, _)) in known {
    delete_note(&tx, id)?;
    rep.removed += 1;
  }
  tx.commit().map_err(e)?;

  rep.notes = c.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0)).map_err(e)? as usize;
  rep.chunks = c.query_row("SELECT count(*) FROM chunks", [], |r| r.get::<_, i64>(0)).map_err(e)? as usize;
  rep.ms = t0.elapsed().as_millis();
  Ok(rep)
}

/// Apaga o índice inteiro (troca de vault).
pub fn clear(c: &Connection) -> Res<()> {
  c.execute_batch("DELETE FROM chunks_fts; DELETE FROM note_links; DELETE FROM chunks; DELETE FROM notes;").map_err(e)
}

#[derive(Serialize, Debug)]
pub struct Hit {
  pub path: String,
  pub title: String,
  pub heading: Option<String>,
  /// Trecho com o termo entre \u{2} e \u{3} (o front marca em negrito sem usar HTML).
  pub snippet: String,
}

/// Transforma o que a pessoa digitou numa consulta FTS5 segura: cada palavra entre aspas, a última com
/// prefixo (busca enquanto digita). Nada do texto vira operador.
pub fn fts_query(q: &str) -> Option<String> {
  let words: Vec<String> = q
    .split(|c: char| !c.is_alphanumeric())
    .filter(|w| !w.is_empty())
    .take(12)
    .map(|w| format!("\"{}\"", w))
    .collect();
  if words.is_empty() {
    return None;
  }
  let n = words.len();
  Some(words.into_iter().enumerate().map(|(i, w)| if i == n - 1 { format!("{w}*") } else { w }).collect::<Vec<_>>().join(" "))
}

pub fn search(c: &Connection, q: &str, limit: usize) -> Res<Vec<Hit>> {
  let Some(m) = fts_query(q) else { return Ok(vec![]) };
  let mut st = c
    .prepare(
      "SELECT n.path, n.title, ch.heading, snippet(chunks_fts, 2, char(2), char(3), '…', 14)
       FROM chunks_fts f JOIN chunks ch ON ch.id = f.rowid JOIN notes n ON n.id = ch.note_id
       WHERE chunks_fts MATCH ?1
       ORDER BY bm25(chunks_fts, 8.0, 3.0, 1.0)
       LIMIT ?2",
    )
    .map_err(e)?;
  let rows = st
    .query_map(params![m, (limit * 3) as i64], |r| Ok(Hit { path: r.get(0)?, title: r.get(1)?, heading: r.get(2)?, snippet: r.get(3)? }))
    .map_err(e)?;
  // um resultado por nota (o melhor trecho)
  let mut seen = std::collections::HashSet::new();
  Ok(rows.flatten().filter(|h| seen.insert(h.path.clone())).take(limit).collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteView {
  pub path: String,
  pub title: String,
  pub content: String,
  /// Notas que apontam para esta ([[links]] de volta).
  pub backlinks: Vec<(String, String)>,
  /// Data do arquivo quando foi lido: o editor manda de volta ao salvar (não pisa em mudança de fora).
  pub mtime: Option<i64>,
}

/// Lê uma nota do vault (só dentro dele) e as que ligam a ela.
pub fn read(c: &Connection, root: &Path, rel: &str) -> Res<NoteView> {
  if rel.contains("..") || rel.contains(':') || rel.starts_with('/') || rel.starts_with('\\') {
    return Err("caminho inválido".into());
  }
  let title: Option<String> = c.query_row("SELECT title FROM notes WHERE path = ?1", [rel], |r| r.get(0)).optional().map_err(e)?;
  let Some(title) = title else { return Err("nota não está no índice".into()) };
  let content = fs::read_to_string(root.join(rel)).map_err(e)?;
  let stem = rel.trim_end_matches(".md");
  let name = stem.rsplit('/').next().unwrap_or(stem);
  let mut st = c
    .prepare("SELECT DISTINCT n.path, n.title FROM note_links l JOIN notes n ON n.id = l.note_id WHERE (l.target = ?1 OR l.target = ?2) AND n.path <> ?3 ORDER BY n.title LIMIT 50")
    .map_err(e)?;
  let backlinks = st.query_map(params![stem, name, rel], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?.flatten().collect();
  let mtime = crate::notes::file_mtime(root, rel);
  Ok(NoteView { path: rel.to_string(), title, content, backlinks, mtime })
}

/// Caminho da nota para um [[link]] do Obsidian: caminho exato, nome do arquivo em qualquer pasta
/// (o mais curto ganha, como no Obsidian) ou título igual.
pub fn resolve(c: &Connection, target: &str) -> Res<Option<String>> {
  let t = target.trim().trim_end_matches(".md").replace('\\', "/");
  if t.is_empty() {
    return Ok(None);
  }
  let exact = format!("{t}.md");
  let tail = format!("%/{}", exact.replace('%', "\\%").replace('_', "\\_"));
  let found: Option<String> = c
    .query_row(
      "SELECT path FROM notes WHERE lower(path) = lower(?1) OR lower(path) LIKE lower(?2) ESCAPE '\\'
       ORDER BY (lower(path) = lower(?1)) DESC, length(path) LIMIT 1",
      params![exact, tail],
      |r| r.get(0),
    )
    .optional()
    .map_err(e)?;
  if found.is_some() {
    return Ok(found);
  }
  c.query_row("SELECT path FROM notes WHERE lower(title) = lower(?1) ORDER BY length(path) LIMIT 1", [&t], |r| r.get(0)).optional().map_err(e)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::db;

  #[test]
  fn corta_por_titulo_e_acha_links() {
    let p = parse("projetos/x/overview.md", "---\ntags: [a]\n---\n# Projeto X\nIntro\n## Decisões\n- usar [[pessoas/ana|Ana]] e [[LEIA-ME#Rotina]]\n```\n# não é título\n```\n");
    assert_eq!(p.title, "Projeto X");
    assert_eq!(p.links, vec!["pessoas/ana", "LEIA-ME"]);
    assert!(p.chunks.iter().any(|(h, t)| h.as_deref() == Some("Decisões") && t.contains("# não é título")));
  }

  #[test]
  fn ignora_modelos() {
    assert!(is_template_path("referencias/modelos/pessoa.md", None));
    assert!(is_template_path("tpl/x.md", Some("tpl")));
    assert!(!is_template_path("projetos/modelos-de-negocio.md", None));
    assert!(!is_template_path("projetos/x/overview.md", Some("tpl")));
  }

  #[test]
  fn consulta_nao_vira_operador() {
    assert_eq!(fts_query("decisão OR \"x\" NEAR(").as_deref(), Some("\"decisão\" \"OR\" \"x\" \"NEAR\"*"));
    assert!(fts_query("  !!  ").is_none());
  }

  #[test]
  fn indexa_incremental_busca_sem_acento_e_respeita_sensiveis() {
    let dir = std::env::temp_dir().join(format!("tesseract-index-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    let vault = dir.join("vault");
    fs::create_dir_all(vault.join("projetos/x")).unwrap();
    fs::create_dir_all(vault.join("financas")).unwrap();
    fs::create_dir_all(vault.join(".obsidian")).unwrap();
    fs::write(vault.join("projetos/x/overview.md"), "# Projeto X\n## Decisões\nCobrar por projeto. Ver [[pessoas/ana]].\n").unwrap();
    fs::write(vault.join("pessoas.md"), "# Ana\nDesigner. Trabalha no [[projetos/x/overview]].\n").unwrap();
    fs::write(vault.join("financas/salario.md"), "# Salário\nValor secreto decisao\n").unwrap();
    fs::write(vault.join(".obsidian/x.md"), "# config").unwrap();

    let mut c = db::open(&dir.join("t.db")).unwrap();
    db::migrate(&mut c).unwrap();
    let r = run(&mut c, &vault, false).unwrap();
    assert_eq!((r.scanned, r.added, r.notes), (2, 2, 2));

    let hits = search(&c, "decisoes", 10).unwrap();
    assert_eq!(hits.len(), 1, "acha 'Decisões' sem acento e não acha a pasta sensível");
    assert_eq!(hits[0].path, "projetos/x/overview.md");
    assert_eq!(search(&c, "cobr", 10).unwrap().len(), 1, "prefixo enquanto digita");

    // segunda rodada sem mudança: nada reprocessado
    let r = run(&mut c, &vault, false).unwrap();
    assert_eq!((r.added, r.updated, r.removed), (0, 0, 0));

    // apaga uma nota e liga as sensíveis
    fs::remove_file(vault.join("pessoas.md")).unwrap();
    let r = run(&mut c, &vault, true).unwrap();
    assert_eq!((r.added, r.removed, r.notes), (1, 1, 2));
    assert_eq!(search(&c, "secreto", 10).unwrap().len(), 1);
    assert!(search(&c, "designer", 10).unwrap().is_empty(), "nota apagada sai do FTS também");

    assert_eq!(resolve(&c, "projetos/x/overview").unwrap().as_deref(), Some("projetos/x/overview.md"));
    assert_eq!(resolve(&c, "overview").unwrap().as_deref(), Some("projetos/x/overview.md"));
    assert_eq!(resolve(&c, "Projeto X").unwrap().as_deref(), Some("projetos/x/overview.md"));
    assert_eq!(resolve(&c, "nada").unwrap(), None);

    let v = read(&c, &vault, "projetos/x/overview.md").unwrap();
    assert!(v.content.contains("Cobrar"));
    assert!(read(&c, &vault, "../t.db").is_err());
  }
}
