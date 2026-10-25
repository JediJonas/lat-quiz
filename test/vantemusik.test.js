import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm } from '../js/lookup.js';
import { LOBBY_SONGS, SEASON_LOBBY_SONGS, lobbySongs, pickLobbySong } from '../js/vantemusik.js';

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

test('säsongskategorierna har egen väntemusik som inte finns bland quizlåtarna', () => {
  const categories = read('categories.json');
  const all = [LOBBY_SONGS, ...Object.values(SEASON_LOBBY_SONGS)].flat();
  assert.equal(new Set(all.map((s) => s.deezerId)).size, all.length);
  const ids = new Set(quizSongs.map((s) => s.deezerId));
  const titles = new Set(quizSongs.flatMap((s) => [s.title, s.track].filter(Boolean).map(norm)));
  for (const [id, songs] of Object.entries(SEASON_LOBBY_SONGS)) {
    assert.ok(categories.some((c) => c.id === id && c.season), `${id} är en säsongskategori`);
    assert.ok(songs.length >= 2, id);
    for (const song of songs) {
      assert.ok(song.artist && song.title && Number.isInteger(song.deezerId), song.title);
      assert.ok(!ids.has(song.deezerId), song.title);
      assert.ok(!titles.has(norm(song.title)), song.title);
    }
  }
  assert.equal(lobbySongs('jul'), SEASON_LOBBY_SONGS.jul);
  assert.equal(lobbySongs('80-tal'), LOBBY_SONGS);
  assert.ok(SEASON_LOBBY_SONGS.jul.includes(pickLobbySong(() => 0.5, null, SEASON_LOBBY_SONGS.jul)));
});

test('väntemusiken slumpas och blir inte samma två väntor i rad', () => {
  const first = pickLobbySong(() => 0);
  assert.equal(first, LOBBY_SONGS[0]);
  for (const r of [0, 0.5, 0.999]) assert.notEqual(pickLobbySong(() => r, first.deezerId), first);
});
