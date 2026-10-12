import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));

test('alla JSON-filer i data går att läsa', () => {
  for (const dir of ['data', 'data/kandidater']) {
    for (const file of readdirSync(new URL('../' + dir, import.meta.url))) {
      if (file.endsWith('.json')) assert.doesNotThrow(() => read(`${dir}/${file}`), `${dir}/${file}`);
    }
  }
});

test('varje quizlåt har ett unikt id och ett giltigt Spotify-ID', () => {
  for (const category of read('data/categories.json')) {
    const ids = new Set();
    for (const song of read('data/' + category.file)) {
      assert.ok(song.artist && song.title, `${category.file}: ${song.id} saknar artist eller titel`);
      assert.ok(!ids.has(song.id), `${category.file}: ${song.id} finns två gånger`);
      ids.add(song.id);
      assert.match(song.spotifyId, /^[A-Za-z0-9]{22}$/, `${category.file}: ${song.id}`);
    }
  }
});

test('kategorierna i host.html är desamma som i categories.json', () => {
  const html = readFileSync(new URL('../host.html', import.meta.url), 'utf8');
  const select = html.match(/<select id="category-select">([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(([, id, name]) => ({ id, name }));
  const categories = read('data/categories.json').map(({ id, name }) => ({ id, name }));
  assert.deepEqual(options, categories, 'Uppdatera listan i host.html');
});

test('standardinställningarna i host.html stämmer med spelet', async () => {
  const html = readFileSync(new URL('../host.html', import.meta.url), 'utf8');
  const { settingsSummary } = await import('../js/ui.js');
  const { DEFAULT_SETTINGS } = await import('../js/game.js');
  const text = settingsSummary(DEFAULT_SETTINGS).replaceAll('\u00a0', '&nbsp;');
  assert.ok(html.includes(`<span id="settings-summary" class="muted small">${text}</span>`));
});
