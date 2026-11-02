// Versionsnummer på CSS och JS, så att webbläsaren hämtar nya filer efter varje deploy.
// GitHub Pages låter webbläsaren spara filerna i tio minuter, och då kan ny HTML visas med gammal CSS.
// Numret är en kort hash av alla filerna. Moduler som importeras från en sida (som js/menu.js i
// index.html) får numret via en import map i varje sida. Körs av tools/build.mjs på den byggda
// sidan i _site/, aldrig på sidorna i repot, så de saknar versionsnummer. Numret och när sidan
// publicerades skrivs i varje sida och visas överst i loggen med ?debug=1, så att det går att se
// vilken version som körs.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

export const PAGES = ['index.html', 'host.html', 'play.html'];

/** Alla moduler i js/ under dir, även i undermappar, till exempel 'shared/storage.js'. */
export function modules(dir) {
  return readdirSync(new URL('js/', dir), { recursive: true })
    .map(String).map((f) => f.split('\\').join('/')).filter((f) => f.endsWith('.js')).sort();
}

/** En kort hash av CSS och alla moduler under dir. */
export function contentHash(dir, mods = modules(dir)) {
  const hash = createHash('sha256');
  for (const file of ['css/style.css', ...mods.map((f) => 'js/' + f)]) {
    hash.update(file + '\0' + readFileSync(new URL(file, dir), 'utf8'));
  }
  return hash.digest('hex').slice(0, 8);
}

// Till exempel "Version 17 okt 20:12 · a1b2c3d4", i svensk tid.
export function versionText(v, date = new Date()) {
  const when = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date).replace('.', '');
  return `Version ${when} · ${v}`;
}

export function withVersion(html, v, mods, text = versionText(v)) {
  const map = { imports: Object.fromEntries(mods.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) };
  const importMap = `<script type="importmap">${JSON.stringify(map)}</script>`;
  html = html.replace(/href="css\/style\.css(\?v=\w+)?"/g, `href="css/style.css?v=${v}"`)
    .replace(/src="js\/([\w-]+)\.js(\?v=\w+)?"/g, `src="js/$1.js?v=${v}"`)
    .replace(/\n *<script type="importmap">.*<\/script>/g, '')
    .replace(/<p class="app-version">[^<]*<\/p>/g, `<p class="app-version">${text}</p>`);
  // Import mapen måste stå före alla moduler, så den läggs direkt efter stilmallen.
  return html.replace(/( *)(<link rel="stylesheet" href="css\/style\.css[^"]*">)/, `$1$2\n$1${importMap}`);
}

/** Sätter versionsnumret i sidorna under dir och returnerar numret. */
export function stampVersions(dir) {
  const mods = modules(dir);
  const v = contentHash(dir, mods);
  for (const page of PAGES) {
    const file = new URL(page, dir);
    writeFileSync(file, withVersion(readFileSync(file, 'utf8'), v, mods));
  }
  return v;
}
