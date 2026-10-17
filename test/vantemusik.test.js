import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from '../js/lookup.js';
import { LOBBY_SONGS, pickLobbySong } from '../js/vantemusik.js';

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

test('väntemusiken slumpas och blir inte samma två väntor i rad', () => {
  const first = pickLobbySong(() => 0);
  assert.equal(first, LOBBY_SONGS[0]);
  for (const r of [0, 0.5, 0.999]) assert.notEqual(pickLobbySong(() => r, first.deezerId), first);
});
