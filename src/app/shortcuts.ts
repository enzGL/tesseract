import { useStore } from '../data/api'

// Atalhos de teclado do app. Padrões aqui; o que a pessoa trocar fica em settings['shortcuts'] (só as diferenças).
export type ActionId = 'palette' | 'chat' | 'sidebar' | 'theme' | 'home' | 'brain' | 'guide' | 'settings' | 'timer' | 'lock'

export const ACTIONS: { id: ActionId; label: string; hint: string; def: string }[] = [
  { id: 'palette', label: 'Buscar', hint: 'Abre a busca de módulos e notas', def: 'Ctrl+K' },
  { id: 'chat', label: 'Tesseract Chat', hint: 'Abre e fecha o painel do chat', def: 'Ctrl+J' },
  { id: 'sidebar', label: 'Recolher menu', hint: 'Recolhe e expande a barra lateral', def: 'Ctrl+B' },
  { id: 'theme', label: 'Tema claro ou escuro', hint: 'Alterna o tema', def: 'Ctrl+Shift+L' },
  { id: 'home', label: 'Ir para o Início', hint: '', def: 'Alt+1' },
  { id: 'brain', label: 'Ir para o Conhecimento', hint: '', def: 'Alt+2' },
  { id: 'guide', label: 'Abrir o Guia', hint: '', def: 'Alt+3' },
  { id: 'settings', label: 'Abrir Configurações', hint: '', def: 'Ctrl+,' },
  { id: 'timer', label: 'Cronômetro de horas', hint: 'Para o cronômetro; parado, abre Horas para iniciar', def: 'Ctrl+Shift+H' },
  { id: 'lock', label: 'Travar agora', hint: 'Com a segurança ligada (Configurações › Segurança)', def: 'Ctrl+L' },
]

// Combinações do sistema e de edição de texto: não podem virar atalho do app.
export const RESERVED = new Set(['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Ctrl+Shift+Z', 'Ctrl+R', 'Ctrl+W', 'Alt+F4', 'Ctrl+Tab', 'Ctrl+Shift+Tab'])

const NAMES: Record<string, string> = { ' ': 'Espaço', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', enter: 'Enter', backspace: 'Backspace', delete: 'Delete', tab: 'Tab' }

/** "Ctrl+Shift+K" a partir do evento; null para tecla de modificador sozinha ou sem Ctrl/Alt (exceto F1 a F12). */
export function comboOf(e: KeyboardEvent): string | null {
  const k = e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(k)) return null
  const fn = /^F\d{1,2}$/.test(k)
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !fn) return null
  // com Shift, e.key vira o símbolo; e.code mantém a tecla física (KeyK, Digit1)
  let key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : (NAMES[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k))
  if (fn) key = k
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+')
}

export function bindingsFrom(custom: Record<string, string> | undefined): Record<ActionId, string> {
  const out = {} as Record<ActionId, string>
  for (const a of ACTIONS) out[a.id] = custom?.[a.id] ?? a.def
  return out
}

export function useBindings() {
  return bindingsFrom(useStore().settings['shortcuts'])
}

// Enquanto a tela de atalhos grava uma combinação nova, o atalho global fica mudo.
export const capture = { active: false }
