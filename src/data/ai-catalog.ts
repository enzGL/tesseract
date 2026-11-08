// Catálogo da IA local (fase 13): a mesma lista aparece no instalador (etapa "IA no seu computador")
// e em Configurações > IA. Nomes e tamanhos conferidos em ollama.com/library em 2026-11-07 (tamanho
// do download no Windows, quantização padrão q4_K_M). Conferir de novo antes de cada versão.

export type CatalogItem = {
  id: string // nome no Ollama (ollama pull <id>)
  name: string
  kind: 'engine' | 'chat' | 'embed'
  use: string // uso indicado, uma linha
  gb: number // tamanho do download
  ramGb: number // memória mínima para rodar com folga
  license: string
  vendor: string
  about: string // a explicação da tecnologia, curta
  minShowRam?: number // só aparece com esta memória ou mais
}

export const OLLAMA_URL = 'https://ollama.com/download/OllamaSetup.exe'

export const CATALOG: CatalogItem[] = [
  { id: 'ollama', name: 'Ollama', kind: 'engine', use: 'Motor que roda a IA no seu computador. Sem ele, nenhum modelo funciona.', gb: 1.2, ramGb: 0,
    license: 'MIT', vendor: 'Ollama', about: 'Programa gratuito que roda modelos de linguagem dentro do computador, sem internet e sem mandar nada para fora. O Tesseract conversa com ele pelo endereço local 127.0.0.1.' },
  { id: 'qwen3.5:4b', name: 'Qwen3.5 4B', kind: 'chat', use: 'Conversar com as notas e o chat do dia a dia. Bom em português.', gb: 3.3, ramGb: 8,
    license: 'Apache 2.0 (uso livre, inclusive comercial)', vendor: 'Alibaba (Qwen)', about: 'Modelo de conversa com 4 bilhões de parâmetros: o equilíbrio entre qualidade e leveza para 8 GB de memória.' },
  { id: 'bge-m3', name: 'bge-m3', kind: 'embed', use: 'Busca por significado no Conhecimento.', gb: 1.2, ramGb: 4,
    license: 'MIT', vendor: 'BAAI', about: 'Não conversa: transforma cada trecho das notas em números para achar o que tem o mesmo sentido, mesmo sem palavras em comum.' },
  { id: 'phi4-mini', name: 'Phi-4-mini (3,8B)', kind: 'chat', use: 'Para computadores mais fracos. Respostas curtas, melhor em inglês.', gb: 2.5, ramGb: 4,
    license: 'MIT', vendor: 'Microsoft', about: 'Modelo pequeno, pensado para rodar com pouca memória.' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', kind: 'chat', use: 'Leve. É o modelo usado hoje nos testes do app.', gb: 2.0, ramGb: 6,
    license: 'Llama Community License (livre até 700 milhões de usuários por mês)', vendor: 'Meta', about: 'Modelo de conversa compacto, rápido em quase qualquer computador.' },
  { id: 'gemma4:e4b', name: 'Gemma 4 E4B', kind: 'chat', use: 'Respostas melhores, ainda leve.', gb: 6.6, ramGb: 12, minShowRam: 16,
    license: 'Termos do Gemma (permite uso comercial, com regras de uso)', vendor: 'Google', about: 'Modelo eficiente do Google, com qualidade de modelo maior.' },
  { id: 'gemma4:12b', name: 'Gemma 4 12B', kind: 'chat', use: 'A melhor qualidade da lista. Resumos e textos mais longos.', gb: 8.0, ramGb: 16, minShowRam: 16,
    license: 'Termos do Gemma', vendor: 'Google', about: 'Modelo de 12 bilhões de parâmetros: mais lento, respostas mais completas.' },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', kind: 'chat', use: 'Alternativa equilibrada, muito testada.', gb: 4.9, ramGb: 12, minShowRam: 16,
    license: 'Llama Community License', vendor: 'Meta', about: 'Modelo de 8 bilhões de parâmetros, bem conhecido e estável.' },
]

/** O que fica marcado por padrão para esta memória: Ollama, bge-m3 e um modelo de conversa que caiba. */
export function defaults(ramGb: number): string[] {
  const out = ['ollama']
  if (ramGb >= 4) out.push('bge-m3')
  if (ramGb >= 8) out.push('qwen3.5:4b')
  else if (ramGb >= 4) out.push('phi4-mini')
  return out
}

export const visible = (ramGb: number) => CATALOG.filter((m) => !m.minShowRam || ramGb >= m.minShowRam)
export const fits = (m: CatalogItem, ramGb: number) => ramGb >= m.ramGb
export const gbLabel = (gb: number) => `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
