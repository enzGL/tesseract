// Ponte com o Tesseract Pro (open core). As telas Pro ficam no repositório privado tesseract-pro, na pasta
// pro/ui; o vite.config.ts aponta '@pro' para pro/ui/index.tsx quando a pasta existe e, senão, para
// src/pro-stub.tsx. Quem compila só o código aberto tem o Grátis completo, e as telas Pro do menu mostram
// que são do instalador oficial (pages/ProOnly.tsx).
import type { ComponentType } from 'react'
import type { ImportReport } from './data/api'

export type ProBridge = {
  /** true quando o build tem os módulos Pro (pasta pro/). */
  built: boolean
  /** Telas do Pro, pelo caminho do menu (app/nav.ts, módulos com pro: true). */
  pages: Record<string, ComponentType>
  /** Seções extras em Configurações (backup na nuvem, dois computadores). */
  Settings: ComponentType
  /** Importar extrato com conciliação, aberto pela tela Finanças. null no build aberto. */
  FinanceImport: ComponentType<{ scope: string; accounts: string[]; onDone: (r: ImportReport) => void; onClose: () => void }> | null
  /** Widgets do Início que leem módulos Pro (ex.: cobrancas, funil), pelo id de data/layout.ts. */
  widgets: Partial<Record<string, ComponentType<{ scope: string }>>>
  /** Dados de teste dos módulos Pro (modo de teste), depois dos do núcleo. */
  seed: ((log: (s: string) => void, org: string, day: (n: number) => string) => Promise<void>) | null
  /** Fica montado na moldura do app (vigia do "dois computadores"). */
  Shell: ComponentType
}
