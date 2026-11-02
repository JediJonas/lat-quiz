import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, ENTRIES } from '../tools/build.mjs';
import { PAGES, withVersion } from '../tools/versions.mjs';

test('bygget ger en bundle per startfil, med versionsnummer i sidorna', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'latquiz-build-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = pathToFileURL(dir + '/');
  const v = await build(out);
  const read = (file) => readFileSync(new URL(file, out), 'utf8');

  // Bara bundlarna och deras source maps, inga lösa moduler som sidorna kunde råka ladda.
  const bundles = ENTRIES.map((f) => f.slice(3));
  assert.deepEqual(readdirSync(new URL('js/', out)).sort(), bundles.flatMap((f) => [f, f + '.map']).sort());
  for (const file of bundles) assert.match(read('js/' + file), new RegExp(`//# sourceMappingURL=${file}\\.map\\s*$`));

  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, new RegExp(`href="css/style\\.css\\?v=${v}"`), page);
    assert.match(html, new RegExp(`<p class="app-version">Version .* · ${v}</p>`), page);
    // Varje modul som sidan laddar finns i bygget.
    for (const [, src] of html.matchAll(/<script type="module" src="([^"?]+)/g)) assert.ok(read(src), `${page}: ${src}`);
    for (const [, src] of html.matchAll(/from '\.\/(js\/[^']+)'/g)) assert.ok(read(src), `${page}: ${src}`);
  }

  // Startsidan importerar menyn, så menybundlen måste ha kvar sina exporter.
  const exports = read('js/menu.js').match(/export\{([^}]*)\}/)?.[1] ?? '';
  for (const name of ['commonItems', 'mountDebugLog', 'mountMenu', 'startItems']) assert.match(exports, new RegExp(`\\b${name}\\b`), name);

  // qrcode.js är ett vanligt skript som sätter qrcode globalt, så namnet får inte minifieras bort.
  assert.match(read('vendor/qrcode.js'), /^var qrcode=/);
  assert.ok(read('css/style.css').length < readFileSync(new URL('../css/style.css', import.meta.url), 'utf8').length);
});

test('withVersion sätter numret på CSS, startfilen och import mapen', () => {
  const page = '<link rel="stylesheet" href="css/style.css">\n<script type="module" src="js/host.js"></script>\n<p class="app-version"></p>';
  assert.equal(withVersion(page, 'abc', ['host.js', 'menu.js'], 'Version X'),
    '<link rel="stylesheet" href="css/style.css?v=abc">\n'
    + '<script type="importmap">{"imports":{"./js/host.js":"./js/host.js?v=abc","./js/menu.js":"./js/menu.js?v=abc"}}</script>\n'
    + '<script type="module" src="js/host.js?v=abc"></script>\n<p class="app-version">Version X</p>');
});
