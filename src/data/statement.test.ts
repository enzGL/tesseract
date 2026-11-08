import { describe, expect, it } from 'vitest'
import { parseMoney, toIso } from './statement'

describe('parseMoney (centavos)', () => {
  it.each([
    ['1.234,56', 123456], ['1234,56', 123456], ['1234.56', 123456], ['R$ 12', 1200], ['1,234.56', 123456],
    ['-89,90', -8990], ['(50,00)', -5000], ['1.000.000', 100000000], ['0,1', 10],
  ])('%s → %i', (s, v) => expect(parseMoney(s)).toBe(v))
  it.each(['', 'abc', 'R$'])('"%s" não é número', (s) => expect(parseMoney(s)).toBeNull())
})

describe('toIso', () => {
  it('lê dd/mm/aaaa, dd/mm/aa e aaaa-mm-dd', () => {
    expect(toIso('5/3/2026')).toBe('2026-03-05')
    expect(toIso('05/03/26')).toBe('2026-03-05')
    expect(toIso('2026-03-05T10:00')).toBe('2026-03-05')
    expect(toIso('ontem')).toBeNull()
  })
})
