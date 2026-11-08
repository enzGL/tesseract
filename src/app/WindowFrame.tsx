import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, Minus, Square, X } from 'lucide-react'
import { Logo } from './theme'

// Dentro do Tauri a janela não tem moldura nativa: o app desenha cantos arredondados e a barra
// de título própria. No navegador (dev) a moldura aparece igual, mas os botões não agem.
const inTauri = '__TAURI_INTERNALS__' in window
if (inTauri) document.documentElement.dataset.tauri = ''

const win = () => (inTauri ? getCurrentWindow() : null)

// Controles próprios do Tesseract: ícones de linha fina em botões discretos; fechar ganha o cobalto.
function Controls({ maximized }: { maximized: boolean }) {
  const base = 'grid h-7 w-9 place-items-center rounded-md text-muted transition-colors'
  return (
    <div className="flex items-center gap-1 pr-2">
      <button type="button" onClick={() => win()?.minimize()} aria-label="Minimizar" title="Minimizar" className={`${base} hover:bg-raised hover:text-fg`}>
        <Minus size={14} strokeWidth={1.6} />
      </button>
      <button type="button" onClick={() => win()?.toggleMaximize()} aria-label={maximized ? 'Restaurar' : 'Maximizar'} title={maximized ? 'Restaurar' : 'Maximizar'} className={`${base} hover:bg-raised hover:text-fg`}>
        {maximized ? <Copy size={12} strokeWidth={1.6} /> : <Square size={11} strokeWidth={1.6} />}
      </button>
      <button type="button" onClick={() => win()?.close()} aria-label="Fechar" title="Fechar" className={`${base} hover:bg-accent hover:text-on-accent`}>
        <X size={14} strokeWidth={1.6} />
      </button>
    </div>
  )
}

export function WindowFrame({ children }: { children: ReactNode }) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const w = win()
    if (!w) return
    const sync = () => { w.isMaximized().then(setMaximized) }
    sync()
    const off = w.onResized(sync)
    return () => { off.then((f) => f()) }
  }, [])

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-bg ${inTauri && !maximized ? 'rounded-[12px] border border-line-strong' : ''}`}>
      <header data-tauri-drag-region onDoubleClick={() => win()?.toggleMaximize()} className="relative flex h-9 shrink-0 items-center justify-end select-none">
        <div data-tauri-drag-region className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[12.5px] text-muted">
          <Logo className="size-4" />
          <span className="font-serif">Tesseract</span>
        </div>
        <div className="relative"><Controls maximized={maximized} /></div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
