// Busca por significado (fase 3B): vetor de cada trecho (bge-m3, local) e similaridade de cosseno.
// Força bruta em memória: para vaults pessoais (dezenas de milhares de trechos) é rápido o bastante e
// dispensa extensão nativa. A busca final funde texto (FTS5) e significado por posição (RRF).
use crate::ai::Source;
use crate::index::{self, Hit};
use rusqlite::{params, Connection};
use std::collections::HashMap;

type Res<T> = Result<T, String>;
fn e<E: std::fmt::Display>(x: E) -> String {
  x.to_string()
}

pub fn to_blob(v: &[f32]) -> Vec<u8> {
  v.iter().flat_map(|f| f.to_le_bytes()).collect()
}
pub fn from_blob(b: &[u8]) -> Vec<f32> {
  b.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect()
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
  if a.len() != b.len() || a.is_empty() {
    return 0.0;
  }
  let (mut dot, mut na, mut nb) = (0.0f32, 0.0f32, 0.0f32);
  for i in 0..a.len() {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na.sqrt() * nb.sqrt()) }
}

/// Trechos ainda sem vetor deste modelo (texto com o título da nota, que dá contexto ao vetor).
pub fn pending(c: &Connection, model: &str, limit: usize) -> Res<Vec<(i64, String)>> {
  let mut st = c
    .prepare(
      "SELECT ch.id, n.title || COALESCE(' > ' || ch.heading, '') || char(10) || ch.text
       FROM chunks ch JOIN notes n ON n.id = ch.note_id
       LEFT JOIN chunk_vectors v ON v.chunk_id = ch.id AND v.model = ?1
       WHERE v.chunk_id IS NULL ORDER BY ch.id LIMIT ?2",
    )
    .map_err(e)?;
  let rows = st.query_map(params![model, limit as i64], |r| Ok((r.get(0)?, r.get::<_, String>(1)?))).map_err(e)?;
  Ok(rows.flatten().map(|(id, t): (i64, String)| (id, t.chars().take(2000).collect())).collect())
}

pub fn counts(c: &Connection, model: &str) -> Res<(i64, i64)> {
  let total: i64 = c.query_row("SELECT count(*) FROM chunks", [], |r| r.get(0)).map_err(e)?;
  let done: i64 = c.query_row("SELECT count(*) FROM chunk_vectors WHERE model = ?1", [model], |r| r.get(0)).map_err(e)?;
  Ok((done, total))
}

pub fn store(c: &mut Connection, model: &str, items: &[(i64, Vec<f32>)]) -> Res<()> {
  let tx = c.transaction().map_err(e)?;
  for (id, v) in items {
    // o trecho pode ter sumido enquanto o vetor era calculado (reindexação): ignora
    let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM chunks WHERE id = ?1)", [id], |r| r.get(0)).map_err(e)?;
    if exists {
      tx.execute("INSERT OR REPLACE INTO chunk_vectors (chunk_id, model, vec) VALUES (?1, ?2, ?3)", params![id, model, to_blob(v)]).map_err(e)?;
    }
  }
  tx.commit().map_err(e)
}

/// Os k trechos mais parecidos com o vetor da pergunta.
pub fn top(c: &Connection, model: &str, q: &[f32], k: usize) -> Res<Vec<(i64, f32)>> {
  let mut st = c.prepare("SELECT chunk_id, vec FROM chunk_vectors WHERE model = ?1").map_err(e)?;
  let rows = st.query_map([model], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?))).map_err(e)?;
  let mut scored: Vec<(i64, f32)> = rows.flatten().map(|(id, b)| (id, cosine(q, &from_blob(&b)))).collect();
  scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
  scored.truncate(k);
  Ok(scored)
}

struct ChunkRow {
  id: i64,
  path: String,
  title: String,
  heading: Option<String>,
  text: String,
}

fn chunk_rows(c: &Connection, ids: &[i64]) -> Res<HashMap<i64, ChunkRow>> {
  let mut out = HashMap::new();
  let mut st = c
    .prepare("SELECT ch.id, n.path, n.title, ch.heading, ch.text FROM chunks ch JOIN notes n ON n.id = ch.note_id WHERE ch.id = ?1")
    .map_err(e)?;
  for id in ids {
    if let Ok(r) = st.query_row([id], |r| Ok(ChunkRow { id: r.get(0)?, path: r.get(1)?, title: r.get(2)?, heading: r.get(3)?, text: r.get(4)? })) {
      out.insert(r.id, r);
    }
  }
  Ok(out)
}

/// Fontes a partir de ids de trecho (na ordem dada), numeradas a partir de 1.
pub fn sources_by_ids(c: &Connection, ids: &[i64]) -> Res<Vec<Source>> {
  let rows = chunk_rows(c, ids)?;
  Ok(ids.iter().filter_map(|id| rows.get(id)).enumerate()
    .map(|(i, r)| Source { n: i + 1, chunk_id: r.id, path: r.path.clone(), title: r.title.clone(), heading: r.heading.clone(), text: r.text.clone() })
    .collect())
}

/// Ids de trecho da busca textual, em ordem de relevância.
fn fts_ids(c: &Connection, q: &str, k: usize) -> Res<Vec<i64>> {
  let Some(m) = index::fts_query(q) else { return Ok(vec![]) };
  let mut st = c.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?1 ORDER BY bm25(chunks_fts, 8.0, 3.0, 1.0) LIMIT ?2").map_err(e)?;
  let rows = st.query_map(params![m, k as i64], |r| r.get(0)).map_err(e)?;
  Ok(rows.flatten().collect())
}

/// Fusão por posição (Reciprocal Rank Fusion): quem aparece bem nas duas listas sobe.
pub fn fuse(lists: &[Vec<i64>]) -> Vec<i64> {
  let mut score: HashMap<i64, f64> = HashMap::new();
  for list in lists {
    for (rank, id) in list.iter().enumerate() {
      *score.entry(*id).or_default() += 1.0 / (60.0 + rank as f64 + 1.0);
    }
  }
  let mut ids: Vec<(i64, f64)> = score.into_iter().collect();
  ids.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.0.cmp(&b.0)));
  ids.into_iter().map(|(id, _)| id).collect()
}

/// Trechos para responder a uma pergunta: texto + significado (se houver vetor da pergunta).
pub fn retrieve(c: &Connection, q: &str, qvec: Option<&[f32]>, k: usize) -> Res<Vec<Source>> {
  let mut lists = vec![fts_ids(c, q, 20)?];
  if let Some(v) = qvec {
    lists.push(top(c, crate::ai::EMBED_MODEL, v, 20)?.into_iter().filter(|(_, s)| *s > 0.35).map(|(id, _)| id).collect());
  }
  let ids = fuse(&lists);
  let rows = chunk_rows(c, &ids)?;
  let mut out = Vec::new();
  let mut per_note: HashMap<String, usize> = HashMap::new();
  for id in ids {
    let Some(r) = rows.get(&id) else { continue };
    let n = per_note.entry(r.path.clone()).or_default();
    if *n >= 2 {
      continue; // no máximo 2 trechos por nota, para variar as fontes
    }
    *n += 1;
    out.push(Source { n: out.len() + 1, chunk_id: r.id, path: r.path.clone(), title: r.title.clone(), heading: r.heading.clone(), text: r.text.clone() });
    if out.len() >= k {
      break;
    }
  }
  Ok(out)
}

/// Busca híbrida para a tela: um resultado por nota, com trecho.
pub fn hybrid(c: &Connection, q: &str, qvec: &[f32], limit: usize) -> Res<Vec<Hit>> {
  let sem: Vec<i64> = top(c, crate::ai::EMBED_MODEL, qvec, 40)?.into_iter().filter(|(_, s)| *s > 0.35).map(|(id, _)| id).collect();
  let ids = fuse(&[fts_ids(c, q, 40)?, sem]);
  let rows = chunk_rows(c, &ids)?;
  let mut seen = std::collections::HashSet::new();
  let mut out = Vec::new();
  for id in ids {
    let Some(r) = rows.get(&id) else { continue };
    if !seen.insert(r.path.clone()) {
      continue;
    }
    let snippet: String = r.text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(220).collect();
    out.push(Hit { path: r.path.clone(), title: r.title.clone(), heading: r.heading.clone(), snippet });
    if out.len() >= limit {
      break;
    }
  }
  Ok(out)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn blob_e_cosseno() {
    let v = vec![1.0, 0.5, -2.0];
    assert_eq!(from_blob(&to_blob(&v)), v);
    assert!((cosine(&v, &v) - 1.0).abs() < 1e-6);
    assert!(cosine(&[1.0, 0.0], &[0.0, 1.0]).abs() < 1e-6);
  }

  #[test]
  fn fusao_privilegia_quem_esta_nas_duas() {
    let f = fuse(&[vec![1, 2, 3], vec![3, 4]]);
    assert_eq!(f[0], 3);
  }
}
