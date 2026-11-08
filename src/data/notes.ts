// Editor do Conhecimento (Grátis): árvore de pastas, o [[ com autocompletar e o desenho do grafo.
// Regras puras (testadas em notes.test.ts); a gravação e o índice ficam no Rust (src-tauri/src/notes.rs).

export type NoteItem = { path: string; title: string; mtime: number }
export type Graph = { nodes: [string, string][]; edges: [number, number][] }
export type Plugins = { notes: string[]; canvas: number }

export type TreeFolder = { name: string; path: string; folders: TreeFolder[]; notes: NoteItem[]; count: number }

/** Monta a árvore de pastas a partir dos caminhos (pastas primeiro, por nome). */
export function buildTree(items: NoteItem[]): TreeFolder {
  const root: TreeFolder = { name: '', path: '', folders: [], notes: [], count: 0 }
  for (const it of items) {
    const parts = it.path.split('/')
    let cur = root
    cur.count++
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/')
      let next = cur.folders.find((f) => f.path === p)
      if (!next) { next = { name: parts[i], path: p, folders: [], notes: [], count: 0 }; cur.folders.push(next) }
      next.count++
      cur = next
    }
    cur.notes.push(it)
  }
  const sort = (f: TreeFolder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    f.notes.sort((a, b) => noteName(a.path).localeCompare(noteName(b.path), 'pt-BR'))
    f.folders.forEach(sort)
  }
  sort(root)
  return root
}

/** Nome do arquivo sem pasta e sem .md. */
export const noteName = (path: string) => (path.split('/').pop() ?? path).replace(/\.md$/i, '')
/** Pastas que contêm a nota (para abrir a árvore até ela). */
export const parentsOf = (path: string) => path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))

/** O [[ que está sendo digitado antes do cursor: o texto já escrito e onde ele começa. */
export function linkQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const open = before.lastIndexOf('[[')
  if (open < 0) return null
  const q = before.slice(open + 2)
  if (q.includes(']]') || q.includes('\n') || q.length > 80) return null
  return { query: q, start: open }
}

/** Notas que combinam com o que foi digitado: começa com > contém; nome e título, sem acento. */
export function suggest(items: NoteItem[], query: string, max = 7): NoteItem[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(query.trim())
  const scored = items.map((it) => {
    const name = fold(noteName(it.path)), title = fold(it.title)
    const s = !q ? 1 : name.startsWith(q) || title.startsWith(q) ? 3 : name.includes(q) || title.includes(q) ? 2 : fold(it.path).includes(q) ? 1 : 0
    return { it, s }
  }).filter((x) => x.s > 0)
  scored.sort((a, b) => b.s - a.s || noteName(a.it.path).length - noteName(b.it.path).length)
  return scored.slice(0, max).map((x) => x.it)
}

/** Troca o [[consulta pelo link completo. Usa o nome curto quando ele é único; senão o caminho. */
export function insertLink(text: string, start: number, caret: number, target: NoteItem, items: NoteItem[]): { text: string; caret: number } {
  const name = noteName(target.path)
  const unique = items.filter((i) => noteName(i.path).toLowerCase() === name.toLowerCase()).length === 1
  const link = `[[${unique ? name : target.path.replace(/\.md$/i, '')}]]`
  const after = text.slice(caret).startsWith(']]') ? text.slice(caret + 2) : text.slice(caret)
  return { text: text.slice(0, start) + link + after, caret: start + link.length }
}

/** Caminho de uma nota nova no inbox a partir do nome digitado (sem caracteres proibidos no Windows). */
export function newNotePath(name: string, folder = 'inbox'): string | null {
  const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  if (!clean) return null
  return `${folder}/${clean.slice(0, 120)}.md`
}

export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Cor de cada pasta de primeiro nível no grafo (mesma pasta, mesma cor). */
const PALETTE = ['#2238C4', '#C98A00', '#1D8A5B', '#8A4FD6', '#C2412D', '#0F8BA8', '#6A7499']
export function folderColor(path: string, folders: string[]): string {
  const top = path.includes('/') ? path.split('/')[0] : ''
  const i = folders.indexOf(top)
  return i < 0 ? PALETTE[PALETTE.length - 1] : PALETTE[i % (PALETTE.length - 1)]
}

/**
 * Posições do grafo por forças simples (atração nas ligações, repulsão entre todos, puxão ao centro).
 * Determinístico (a semente vem do índice), para o desenho não pular entre aberturas.
 */
export function layout(n: number, edges: [number, number][], w = 1000, h = 700, steps = 220): { x: number; y: number }[] {
  const pos = Array.from({ length: n }, (_, i) => {
    const a = i * 2.399963, r = 18 * Math.sqrt(i + 1)
    return { x: w / 2 + r * Math.cos(a), y: h / 2 + r * Math.sin(a) }
  })
  if (n < 2) return pos
  const k = Math.sqrt((w * h) / n) * 0.55
  for (let s = 0; s < steps; s++) {
    const t = 1 - s / steps
    const dx = new Float64Array(n), dy = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let x = pos[i].x - pos[j].x, y = pos[i].y - pos[j].y
        let d2 = x * x + y * y
        if (d2 < 0.01) { x = 0.1; y = 0.1; d2 = 0.02 }
        if (d2 > k * k * 16) continue
        const f = (k * k) / d2
        dx[i] += x * f; dy[i] += y * f; dx[j] -= x * f; dy[j] -= y * f
      }
    }
    for (const [a, b] of edges) {
      const x = pos[a].x - pos[b].x, y = pos[a].y - pos[b].y
      const d = Math.sqrt(x * x + y * y) || 0.1
      const f = d / k
      dx[a] -= x * f; dy[a] -= y * f; dx[b] += x * f; dy[b] += y * f
    }
    for (let i = 0; i < n; i++) {
      dx[i] += (w / 2 - pos[i].x) * 0.02; dy[i] += (h / 2 - pos[i].y) * 0.02
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1
      const lim = Math.min(d, 12 * t + 0.5)
      pos[i].x += (dx[i] / d) * lim; pos[i].y += (dy[i] / d) * lim
    }
  }
  return pos
}

/** Vizinhas de uma nota no grafo: as que ela liga e as que ligam a ela. */
export function neighbors(g: Graph, path: string): { center: number; around: number[] } | null {
  const center = g.nodes.findIndex(([p]) => p === path)
  if (center < 0) return null
  const around = new Set<number>()
  for (const [a, b] of g.edges) { if (a === center) around.add(b); else if (b === center) around.add(a) }
  return { center, around: [...around] }
}
