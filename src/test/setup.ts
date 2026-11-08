// O código do app lê window e localStorage ao carregar; no Node os dois não existem.
const mem = new Map<string, string>()
const g = globalThis as unknown as Record<string, unknown>
g.window ??= globalThis
g.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}
