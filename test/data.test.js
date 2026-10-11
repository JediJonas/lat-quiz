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
