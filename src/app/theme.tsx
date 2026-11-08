import { useEffect, useState } from 'react'
import staticLight from '../assets/logo/tesseract-light.png'
import staticDark from '../assets/logo/tesseract-dark.png'
import animatedLight from '../assets/logo/tesseract-light.gif'
import animatedDark from '../assets/logo/tesseract-dark.gif'

export type Theme = 'light' | 'dark'
const KEY = 'tesseract.theme'

// Claro é o padrão fixo; o escuro só vale se a pessoa escolher.
document.documentElement.dataset.theme = localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'

const listeners = new Set<(t: Theme) => void>()

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme as Theme)
  useEffect(() => {
    listeners.add(setTheme)
    return () => { listeners.delete(setTheme) }
  }, [])
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem(KEY, next)
    listeners.forEach((l) => l(next))
  }
  return { theme, toggle }
}

// Logo definitiva (cubo em dither). Estática nos lugares pequenos; animada nos de destaque.
// Cada uma tem a versão do tema claro e a do escuro.
export function Logo({ className = '', animated = false }: { className?: string; animated?: boolean }) {
  const { theme } = useTheme()
  const src = animated ? (theme === 'dark' ? animatedDark : animatedLight) : (theme === 'dark' ? staticDark : staticLight)
  return <img src={src} alt="" className={`object-contain ${className}`} draggable={false} />
}
