import { afterEach, describe, expect, it } from 'vitest'
import { applyVocab, novo } from './vocab'

describe('novo', () => {
  afterEach(() => applyVocab({}))
  it('concorda com o gênero do termo', () => {
    expect(novo('oportunidade')).toBe('Nova oportunidade')
    expect(novo('empresa')).toBe('Nova empresa')
    expect(novo('projeto')).toBe('Novo projeto')
    applyVocab({ terms: { oportunidade: 'tratamento', proposta: 'proposta de plano', projeto: 'avaliação' } })
    expect(novo('oportunidade')).toBe('Novo tratamento')
    expect(novo('proposta')).toBe('Nova proposta de plano')
    expect(novo('projeto')).toBe('Nova avaliação')
    applyVocab({ terms: { oportunidade: 'job', empresa: 'cliente' } })
    expect(novo('oportunidade')).toBe('Novo job')
    expect(novo('empresa')).toBe('Novo cliente')
  })
})
