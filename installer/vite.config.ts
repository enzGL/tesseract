import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Interface do instalador (installer/ui). Usa as dependências da raiz e as imagens do app.
const repo = fileURLToPath(new URL('..', import.meta.url))
export default defineConfig({
  root: fileURLToPath(new URL('./ui', import.meta.url)),
  plugins: [react()],
  clearScreen: false,
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  server: { port: 1430, strictPort: true, fs: { allow: [repo] } },
})
