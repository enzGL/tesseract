// Regras pequenas de horas (front). As do banco são testadas no Rust; cobrança e prospecção no Pro.
import { describe, expect, it } from 'vitest'
import { parseDuration, value } from './hours'

describe('horas', () => {
  it.each([
    ['1:30', 90], ['1h30', 90], ['2h', 120], ['45min', 45], ['45m', 45], ['1,5', 90], ['1.25h', 75], ['0:05', 5], ['', 0], ['-', 0],
  ])('"%s" vira %i minutos', (s, m) => expect(parseDuration(s)).toBe(m))
  it.each(['abc', '1:30:00', '100h'])('"%s" não é duração', (s) => expect(parseDuration(s)).toBeNull())
  it('valor em centavos só quando é cobrável', () => {
    expect(value({ minutes: 90, rate: 10000, billable: true })).toBe(15000)
    expect(value({ minutes: 90, rate: 10000, billable: false })).toBe(0)
    expect(value({ minutes: 90, rate: null, billable: true })).toBe(0)
  })
})
