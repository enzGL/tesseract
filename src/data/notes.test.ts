import { describe, expect, it } from 'vitest'
import { buildTree, insertLink, layout, linkQuery, neighbors, newNotePath, parentsOf, suggest, type NoteItem } from './notes'

const it_ = (path: string, title = path): NoteItem => ({ path, title, mtime: 0 })
const items = [it_('inbox/ideia.md', 'Ideia'), it_('projetos/padaria/overview.md', 'Padaria Sol'), it_('projetos/padaria/reunião.md', 'Reunião'), it_('pessoas/Márcia.md', 'Márcia Lopes'), it_('LEIA-ME.md', 'Leia-me')]

describe('árvore', () => {
  it('pastas primeiro, contagem e notas da raiz', () => {
    const t = buildTree(items)
    expect(t.count).toBe(5)
    expect(t.folders.map((f) => f.name)).toEqual(['inbox', 'pessoas', 'projetos'])
    expect(t.notes.map((n) => n.path)).toEqual(['LEIA-ME.md'])
    expect(t.folders[2].folders[0].count).toBe(2)
    expect(parentsOf('projetos/padaria/overview.md')).toEqual(['projetos', 'projetos/padaria'])
  })
})

describe('[[ com autocompletar', () => {
  it('acha o [[ aberto antes do cursor', () => {
    expect(linkQuery('Ligar para [[forn', 17)).toEqual({ query: 'forn', start: 11 })
    expect(linkQuery('ver [[a]] e mais', 16)).toBeNull()
    expect(linkQuery('sem link', 8)).toBeNull()
    expect(linkQuery('[[x\ny', 5)).toBeNull()
  })
  it('sugere sem acento, começo antes de meio', () => {
    expect(suggest(items, 'marc').map((x) => x.path)).toEqual(['pessoas/Márcia.md'])
    expect(suggest(items, 're')[0].path).toBe('projetos/padaria/reunião.md')
    expect(suggest(items, 'padaria').map((x) => x.path)).toContain('projetos/padaria/overview.md')
  })
  it('insere o nome curto quando é único e fecha o link', () => {
    const r = insertLink('Ligar para [[marc e depois', 11, 17, items[3], items)
    expect(r.text).toBe('Ligar para [[Márcia]] e depois')
    expect(r.caret).toBe(21)
    const dup = [...items, it_('arquivo/overview.md')]
    expect(insertLink('[[ov', 0, 4, items[1], dup).text).toBe('[[projetos/padaria/overview]]')
    expect(insertLink('[[ov]]', 0, 4, items[1], items).text).toBe('[[overview]]')
  })
  it('nome de nota nova sem caracteres proibidos', () => {
    expect(newNotePath('  Ideia: app / site? ')).toBe('inbox/Ideia app site.md')
    expect(newNotePath('...')).toBeNull()
    expect(newNotePath('[[x]]')).toBe('inbox/x.md')
  })
})

describe('grafo', () => {
  it('posições estáveis e dentro da área; vizinhas nos dois sentidos', () => {
    const edges: [number, number][] = [[0, 1], [1, 2], [3, 1]]
    const a = layout(4, edges), b = layout(4, edges)
    expect(a).toEqual(b)
    for (const p of a) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true) }
    const g = { nodes: [['a.md', 'A'], ['b.md', 'B'], ['c.md', 'C'], ['d.md', 'D']] as [string, string][], edges }
    expect(neighbors(g, 'b.md')).toEqual({ center: 1, around: [0, 2, 3] })
    expect(neighbors(g, 'x.md')).toBeNull()
  })
})
