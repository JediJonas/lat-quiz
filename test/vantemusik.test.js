import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from '../js/lookup.js';
import { LOBBY_SONGS, shuffleLobbySongs } from '../js/vantemusik.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));
const quizSongs = read('categories.json').flatMap((c) => read(c.file));

test('väntemusiken har Deezer-ID och finns inte bland quizlåtarna', () => {
  assert.ok(LOBBY_SONGS.every((s) => s.artist && s.title && Number.isInteger(s.deezerId)));
  assert.equal(new Set(LOBBY_SONGS.map((s) => s.deezerId)).size, LOBBY_SONGS.length);
  const ids = new Set(quizSongs.map((s) => s.deezerId));
  const titles = new Set(quizSongs.flatMap((s) => [s.title, s.track].filter(Boolean).map(norm)));
  for (const song of LOBBY_SONGS) {
    assert.ok(!ids.has(song.deezerId), song.title);
    assert.ok(!titles.has(norm(song.title)), song.title);
  }
});

test('väntemusiken slumpas och börjar inte om med samma låt', () => {
  for (const r of [0, 0.3, 0.999]) {
    const order = shuffleLobbySongs(() => r);
    assert.equal(order.length, LOBBY_SONGS.length);
    assert.equal(new Set(order).size, LOBBY_SONGS.length);
    assert.notEqual(shuffleLobbySongs(() => r, order[0].deezerId)[0], order[0]);
  }
});
