// Dinheiro em centavos e leitura de arquivos de texto do usuário (usados por Finanças e por outras telas).

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// "1.234,56", "1234,56", "1234.56", "R$ 12" -> centavos. null se não for número.
export function parseMoney(s: string): number | null {
  let x = s.replace(/[R$\s]/g, '').trim()
  if (!x) return null
  const neg = /^-|\(.*\)$/.test(x)
  x = x.replace(/[-()]/g, '')
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '')
  else if (x.includes(',')) x = x.replace(',', '.')
  else if ((x.match(/\./g) ?? []).length > 1) x = x.replace(/\./g, '')
  const n = Number(x)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) * (neg ? -1 : 1)
}

// Bancos brasileiros costumam gravar em Windows-1252; tenta UTF-8 primeiro.
export async function readText(file: File) {
  const buf = await file.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

export function toIso(s: string) {
  const a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (a) return `${a[3].length === 2 ? `20${a[3]}` : a[3]}-${a[2].padStart(2, '0')}-${a[1].padStart(2, '0')}`
  const b = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return b ? `${b[1]}-${b[2]}-${b[3]}` : null
}
