// Versionsnummer på CSS och JS, så att webbläsaren hämtar nya filer efter varje deploy.
// GitHub Pages låter webbläsaren spara filerna i tio minuter, och då kan ny HTML visas med gammal CSS.
// Numret är en kort hash av alla filerna. Moduler som importeras av andra moduler får numret via en
// import map i varje sida. Skriptet körs av sig självt när sidan publiceras och i CI, aldrig för hand,
// så sidorna i repot saknar versionsnummer. Längst ner på varje sida står numret och när sidan
// publicerades, så att det går att se vilken version som körs.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
export const PAGES = ['index.html', 'host.html', 'play.html'];
const MODULES = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).sort();

export function version() {
  const hash = createHash('sha256');
  for (const file of ['css/style.css', ...MODULES.map((f) => 'js/' + f)]) hash.update(file + '\0' + read(file));
  return hash.digest('hex').slice(0, 8);
}

// Till exempel "Version 17 okt 20:12 · a1b2c3d4", i svensk tid.
export function versionText(v, date = new Date()) {
  const when = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date).replace('.', '');
  return `Version ${when} · ${v}`;
}

export function withVersion(html, v, text = versionText(v)) {
  const map = { imports: Object.fromEntries(MODULES.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) };
  const importMap = `<script type="importmap">${JSON.stringify(map)}</script>`;
  html = html.replace(/href="css\/style\.css(\?v=\w+)?"/g, `href="css/style.css?v=${v}"`)
    .replace(/src="js\/([\w-]+)\.js(\?v=\w+)?"/g, `src="js/$1.js?v=${v}"`)
    .replace(/\n *<script type="importmap">.*<\/script>/g, '')
    .replace(/<p class="app-version">[^<]*<\/p>/g, `<p class="app-version">${text}</p>`);
  // Import mapen måste stå före alla moduler, så den läggs direkt efter stilmallen.
  return html.replace(/( *)(<link rel="stylesheet" href="css\/style\.css[^"]*">)/, `$1$2\n$1${importMap}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = version();
  for (const page of PAGES) writeFileSync(new URL(page, root), withVersion(read(page), v));
  console.log(`Version ${v} i ${PAGES.join(', ')}`);
}
