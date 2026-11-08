import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tesseract Pro (open core): '@pro' é pro/ui/index.tsx quando a pasta pro/ existe (cópia do repositório
// privado tesseract-pro) e src/pro-stub.tsx quando não existe. `vite build --mode sem-pro` força o
// substituto, para testar o build do código aberto. Ver src/pro-bridge.ts.
function tesseractPro(): Plugin {
  let semPro = false
  return {
    name: 'tesseract-pro',
    enforce: 'pre',
    configResolved(c) {
      semPro = c.mode === 'sem-pro'
    },
    async resolveId(id, importer, opts) {
      if (id !== '@pro') return null
      const pro = semPro ? null : await this.resolve('/pro/ui/index.tsx', importer, { ...opts, skipSelf: true })
      return pro ?? this.resolve('/src/pro-stub.tsx', importer, { ...opts, skipSelf: true })
    },
  }
}

// Porta fixa para o Tauri apontar (devUrl em src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [tesseractPro(), react(), tailwindcss()],
  // '@/x' é src/x: as telas Pro (pro/ui) usam o núcleo por aqui
  resolve: { alias: [{ find: /^@\//, replacement: '/src/' }] },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
})
