// Sidvikt per sida: allt som laddas, före och efter gzip (GitHub Pages komprimerar).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const songs = JSON.parse(read('data/categories.json')).map((c) => 'data/' + c.file);
const common = ['css/style.css', 'vendor/fonts/inter.woff2', 'favicon.svg', 'js/theme.js'];
const pages = {
  'index.html': [...common],
  'om.html': [...common],
  'host.html': [...common, 'vendor/peerjs.min.js', 'vendor/qrcode.js', 'js/host.js', 'js/game.js', 'js/net.js',
    'js/data.js', 'js/dialog.js', 'js/ui.js', 'js/text.js', 'data/categories.json'],
  'play.html': [...common, 'vendor/peerjs.min.js', 'js/play.js', 'js/net.js', 'js/data.js', 'js/autocomplete.js',
    'js/ui.js', 'js/text.js', 'data/categories.json', 'data/forslag.json', ...songs],
};
const kb = (n) => (n / 1024).toFixed(0) + ' kB';

console.log('| Sida | Okomprimerat | Med gzip |\n|---|---|---|');
for (const [page, files] of Object.entries(pages)) {
  let raw = 0;
  let gz = 0;
  for (const file of [page, ...files]) {
    const data = read(file);
    raw += data.length;
    gz += file.endsWith('.woff2') ? data.length : gzipSync(data, { level: 9 }).length;
  }
  console.log(`| ${page} | ${kb(raw)} | ${kb(gz)} |`);
}
