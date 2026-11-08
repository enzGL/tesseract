import { describe, expect, it } from 'vitest'
import { NOVIDADES, compareVersions, unseen, type Novidade } from './novidades'

const n = (version: string, rascunho = false): Novidade => ({ version, date: '', rascunho, todos: [version], pro: [] })

describe('novidades', () => {
  it('compara versões por número, não por texto', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.3.0', '0.3')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })
  it('mostra só o que veio depois da última vista, até a atual, sem rascunho', () => {
    const list = [n('0.2.0'), n('0.3.0'), n('0.3.1'), n('0.4.0', true), n('0.5.0')]
    expect(unseen(list, '0.2.0', '0.3.1').map((x) => x.version)).toEqual(['0.3.1', '0.3.0'])
    expect(unseen(list, '0.3.1', '0.3.1')).toEqual([])
    expect(unseen(list, '0.3.1', '0.4.0')).toEqual([])
  })
  it('a lista do app é válida: versões únicas, texto em toda entrada fora de rascunho', () => {
    const vs = NOVIDADES.map((x) => x.version)
    expect(new Set(vs).size).toBe(vs.length)
    for (const x of NOVIDADES) {
      expect(/^\d+\.\d+\.\d+$/.test(x.version)).toBe(true)
      if (!x.rascunho) { expect(x.todos.length + x.pro.length).toBeGreaterThan(0); expect(/^\d{4}-\d{2}-\d{2}$/.test(x.date)).toBe(true) }
    }
  })
})
