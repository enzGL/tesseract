import { describe, expect, it } from 'vitest'
import { ALL_MODULES, SETTINGS } from '../app/nav'
import {
  COLS, DEFAULT_MENU, MAX_H, SEGMENTS, WIDGETS, addWidget, columnsFor, homeFor, menuFor, minW, normalize, pack, readHome, settle,
  type Placed, type WidgetId,
} from './layout'

const hit = (a: Placed, b: Placed) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const noOverlap = (ps: Placed[]) => ps.every((a, i) => ps.every((b, j) => i === j || !hit(a, b)))
const inside = (ps: Placed[]) => ps.every((p) => p.x >= 0 && p.y >= 0 && p.x + p.w <= COLS && p.w >= minW(p.id) && p.h >= 1 && p.h <= MAX_H)
const MENU_PATHS = ALL_MODULES.filter((m) => m !== SETTINGS).map((m) => m.path)

// gerador previsível, para o teste repetir igual
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31 } }

describe('grade do Início', () => {
  it('pack enche a linha da esquerda para a direita', () => {
    expect(pack(['funil', 'leads', 'horas'])).toEqual([
      { id: 'funil', x: 0, y: 0, w: 6, h: 2 },
      { id: 'leads', x: 6, y: 0, w: 4, h: 2 },
      { id: 'horas', x: 0, y: 2, w: 4, h: 1 },
    ])
  })

  it('settle nunca deixa cartões um em cima do outro, nem fora da grade', () => {
    const r = rng(7)
    const ids = WIDGETS.map((w) => w.id)
    for (let round = 0; round < 300; round++) {
      const chosen = ids.filter(() => r() < 0.6) as WidgetId[]
      if (!chosen.length) continue
      const base = pack(chosen)
      const moved = chosen[Math.floor(r() * chosen.length)]
      const target = { x: Math.floor(r() * 16) - 2, y: Math.floor(r() * 8) - 1, w: Math.floor(r() * 14), h: Math.floor(r() * 6) }
      const out = settle(base.map((p) => (p.id === moved ? { ...p, ...target } : p)), moved)
      expect(out).toHaveLength(chosen.length)
      expect(noOverlap(out)).toBe(true)
      expect(inside(out)).toBe(true)
    }
  })

  it('o cartão solto fica na coluna em que foi solto e os outros descem', () => {
    const base = pack(['funil', 'leads', 'horas']) // funil 0,0 · leads 6,0 · horas 0,2
    const out = settle(base.map((p) => (p.id === 'horas' ? { ...p, x: 2, y: 0 } : p)), 'horas')
    expect(out.find((p) => p.id === 'horas')).toMatchObject({ x: 2, y: 0 })
    expect(out.find((p) => p.id === 'funil')!.y).toBe(1)
    expect(noOverlap(out)).toBe(true)
  })

  it('settle sobe tudo o que der (sem buraco no topo)', () => {
    const out = settle([{ id: 'horas', x: 0, y: 5, w: 4, h: 1 }])
    expect(out[0].y).toBe(0)
  })

  it('addWidget acha um espaço livre e não repete o widget', () => {
    const base = pack(['funil'])
    const one = addWidget(base, 'leads')
    expect(one.find((p) => p.id === 'leads')).toMatchObject({ x: 6, y: 0 })
    expect(addWidget(one, 'leads')).toBe(one)
  })

  it('readHome descarta widget que não existe mais', () => {
    const h = readHome({ current: 'x', boards: [{ id: 'x', name: 'X', widgets: [{ id: 'sumiu' as WidgetId, x: 0, y: 0, w: 4, h: 2 }, { id: 'horas', x: 0, y: 3, w: 4, h: 1 }] }] }, undefined)
    expect(h.boards[0].widgets.map((w) => w.id)).toEqual(['horas'])
    expect(h.boards[0].widgets[0].y).toBe(0)
  })

  it('sem nada salvo, o Início vem do segmento', () => {
    const seg = SEGMENTS.find((s) => s.id === 'clinica')!
    expect(readHome(undefined, seg).boards[0].widgets.map((w) => w.id)).toEqual(seg.widgets)
    expect(homeFor(undefined).boards[0].widgets.length).toBeGreaterThan(0)
  })
})

describe('menu', () => {
  it('o padrão tem todos os módulos, nada escondido', () => {
    const m = normalize(undefined)
    expect(m.sections.flatMap((s) => s.items).sort()).toEqual([...MENU_PATHS].sort())
    expect(m.hidden).toEqual([])
    expect(m).toEqual(normalize(DEFAULT_MENU))
  })

  it('módulo novo entra escondido num menu já personalizado', () => {
    const m = normalize({ sections: [{ label: '', items: ['/', '/crm'] }], hidden: [], names: {} })
    expect(m.sections.flatMap((s) => s.items).sort()).toEqual([...MENU_PATHS].sort())
    expect(m.hidden).not.toContain('/crm')
    expect(m.hidden).toContain('/financas')
  })

  it('o Início nunca fica escondido, e caminho repetido ou desconhecido sai', () => {
    const m = normalize({ sections: [{ label: 'a', items: ['/', '/crm', '/crm', '/nao-existe'] }], hidden: ['/', '/nao-existe'], names: {} })
    expect(m.hidden).not.toContain('/')
    expect(m.sections[0].items).toEqual(['/', '/crm'])
  })

  it.each(SEGMENTS.map((s) => [s.id, s] as const))('o segmento %s cobre todos os módulos uma vez só', (_, seg) => {
    const m = menuFor(seg)
    const all = m.sections.flatMap((s) => s.items)
    expect(all.length).toBe(new Set(all).size)
    expect([...all].sort()).toEqual([...MENU_PATHS].sort())
    const shown = all.filter((p) => !m.hidden.includes(p))
    expect(shown).toEqual(seg.sections.flatMap(([, items]) => items))
    // os widgets do segmento só usam módulos que ficam no menu
    for (const id of seg.widgets) {
      const mod = WIDGETS.find((w) => w.id === id)!.module
      expect(mod === '/' || shown.includes(mod)).toBe(true)
    }
    // o quadro que o segmento cria precisa estar ao alcance no menu
    expect(shown).toContain('/projetos')
  })

  it('colunas do quadro: primeira cinza, meio amarelo, última verde e concluída', () => {
    const cols = columnsFor(SEGMENTS.find((s) => s.id === 'sites')!)
    expect(cols[0]).toMatchObject({ color: '#8A93B4', done: false })
    expect(cols[1]).toMatchObject({ color: '#E0A800', done: false })
    expect(cols.at(-1)).toMatchObject({ color: '#1D6B45', done: true })
    expect(cols.filter((c) => c.done)).toHaveLength(1)
  })
})
