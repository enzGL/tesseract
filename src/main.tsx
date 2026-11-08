import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './app/router'
import { WindowFrame } from './app/WindowFrame'
import { inBrowser } from './data/api'
import { SecurityGate } from './app/LockScreen'
import { Capture } from './pages/Capture'
import './styles.css'

// o app (boot, banco, lembretes) só começa depois da trava: ver SecurityGate em app/LockScreen.tsx

// A janelinha da captura rápida (Ctrl+Shift+Espaço) usa o mesmo app, mas mostra só a tela de captura.
// No navegador, abra com #/captura para ver.
async function isCapture() {
  if (location.hash.startsWith('#/captura')) return true
  if (inBrowser) return false
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow().label === 'captura'
}

void isCapture().then((capture) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {capture ? <Capture /> : (
        <WindowFrame>
          <SecurityGate><RouterProvider router={router} /></SecurityGate>
        </WindowFrame>
      )}
    </StrictMode>,
  ),
)
