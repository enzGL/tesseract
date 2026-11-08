import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Testes do front: regras puras de src/data e, quando a pasta pro/ existe, de pro/ui/data (sem tela). O Rust tem os dele (cd src-tauri && cargo test).
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', ...(existsSync('pro/ui') ? ['pro/ui/**/*.test.ts'] : [])],
    setupFiles: ['src/test/setup.ts'],
  },
})
