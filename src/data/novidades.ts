// O que mudou em cada versão (src/data/novidades.json): a mesma lista vira a nota do latest.json no
// instalador (scripts/build-installer.mjs) e o cartão "O que há de novo" depois de atualizar.
import lista from './novidades.json'

export type Novidade = { version: string; date: string; rascunho?: boolean; seguranca?: boolean; todos: string[]; pro: string[] }
export const NOVIDADES = lista as Novidade[]

/** Compara versões x.y.z (sem sufixo): negativo se a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0), pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Novidades entre a última versão vista (exclusive) e a atual (inclusive), da mais nova para a mais velha. */
export function unseen(list: Novidade[], seen: string, current: string): Novidade[] {
  return list
    .filter((n) => !n.rascunho && compareVersions(n.version, seen) > 0 && compareVersions(n.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
