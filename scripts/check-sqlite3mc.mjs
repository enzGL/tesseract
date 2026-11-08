// Confere se o SQLite3 Multiple Ciphers que vem junto no código (src-tauri/vendor/libsqlite3-sys) está
// na última versão publicada. O `cargo audit` não olha crates por caminho, então esta é a conferência
// dele. Rodar: `npm run check:sqlite` (antes de cada versão do app).
// Saída 0 = em dia; 1 = há versão nova (ver as notas da versão por falhas de segurança); 2 = não deu para conferir.
import { readFileSync } from 'node:fs';

const SRC = new URL('../src-tauri/vendor/libsqlite3-sys/sqlite3/sqlite3.c', import.meta.url);
const text = readFileSync(SRC, 'utf8');
const mc = text.match(/#define SQLITE3MC_VERSION_STRING\s+"SQLite3 Multiple Ciphers ([\d.]+)"/)?.[1];
const sqlite = text.match(/#define SQLITE_VERSION\s+"([\d.]+)"/)?.[1];
if (!mc || !sqlite) {
  console.error('não achei as versões em sqlite3.c');
  process.exit(2);
}
console.log(`no código: SQLite3 Multiple Ciphers ${mc} (SQLite ${sqlite})`);

const cmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
let latest;
try {
  const r = await fetch('https://api.github.com/repos/utelle/SQLite3MultipleCiphers/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'tesseract-check-sqlite3mc' },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  latest = { tag: String(j.tag_name || '').replace(/^v/, ''), url: j.html_url, at: String(j.published_at || '').slice(0, 10) };
} catch (err) {
  console.error(`não deu para consultar o GitHub: ${err.message}`);
  process.exit(2);
}
console.log(`última publicada: ${latest.tag} (${latest.at}) ${latest.url}`);
if (cmp(latest.tag, mc) > 0) {
  console.log('há versão nova: leia as notas da versão e, se houver correção de segurança, atualize o vendor (Upgrade.md).');
  process.exit(1);
}
console.log('em dia.');
