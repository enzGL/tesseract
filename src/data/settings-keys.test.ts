// O Rust só grava configurações da lista SETTING_KEYS (lib.rs). Uma chave nova no tipo Settings
// que não entra lá falha só no app de verdade (no navegador o substituto aceita tudo).
// Este teste compara os dois arquivos, para pegar isso antes.
import { describe, expect, it } from 'vitest'
import apiSrc from './api.ts?raw'
import libSrc from '../../src-tauri/src/lib.rs?raw'

function frontKeys(): string[] {
  const src = apiSrc
  const start = src.indexOf('export type Settings = {')
  const body = src.slice(start, src.indexOf('\n}', start))
  return [...body.matchAll(/^\s*'([a-zA-Z0-9.]+)'\?:/gm)].map((m) => m[1])
}

function rustKeys(): string[] {
  const src = libSrc
  const start = src.indexOf('const SETTING_KEYS')
  const body = src.slice(start, src.indexOf('];', start))
  return [...body.matchAll(/"([a-zA-Z0-9.]+)"/g)].map((m) => m[1])
}

describe('configurações', () => {
  it('toda chave do tipo Settings é aceita pelo Rust', () => {
    const front = frontKeys(), rust = new Set(rustKeys())
    expect(front.length).toBeGreaterThan(10)
    expect(front.filter((k) => !rust.has(k))).toEqual([])
  })
})
