// Abre o Tesseract em modo de teste: banco separado em .teste-dados/, sem tocar nos seus dados reais.
//   npm run teste          continua o teste de onde parou
//   npm run teste:limpo    apaga o banco de teste e começa do zero
// Só funciona na versão de desenvolvimento (tauri dev); o instalador ignora a variável.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '.teste-dados')
if (process.argv.includes('--limpar')) {
  rmSync(dir, { recursive: true, force: true })
  console.log('Banco de teste apagado.')
}
mkdirSync(dir, { recursive: true })
console.log(`\nTesseract em MODO DE TESTE. Banco separado em:\n  ${dir}\nSeus dados reais não são tocados.\nNo app: Configurações > Teste > "Criar dados de teste", depois siga o roteiro.\n`)

const child = spawn('npx', ['tauri', 'dev'], { stdio: 'inherit', shell: true, env: { ...process.env, TESSERACT_DATA_DIR: dir } })
child.on('exit', (code) => process.exit(code ?? 0))
