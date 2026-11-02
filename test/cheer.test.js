import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundCheer, winComment, winIntro } from '../js/game/cheer.js';
import { readFileSync } from 'node:fs';
import { pickWinnerSong } from '../js/sound/winner-song.js';
import sv from '../js/lang/sv.js';

// Kommentaren ska vara en av texterna i listan.
const isIn = (key, text) => assert.ok(sv[key].includes(text), `${text} finns inte i ${key}`);

const WINNER_SONGS = JSON.parse(readFileSync(new URL('../data/music.json', import.meta.url), 'utf8')).winner.default;

const players = (...scores) => scores.map((score, i) => ({ id: `p${i}`, name: `P${i}`, score }));

test('kommentaren efter en låt följer hur många rätt man hade', () => {
  isIn('cheer.all', roundCheer({ artist: true, title: true }, 1));
  isIn('cheer.half', roundCheer({ artist: true, title: false }, 1));
  isIn('cheer.none', roundCheer({ artist: false, title: false }, 1));
  isIn('cheer.all', roundCheer({ artist: false, title: true }, 1, 1));
  assert.equal(roundCheer({ artist: true, title: true }, 7), roundCheer({ artist: true, title: true }, 7));
});

test('vinnarkommentaren beror på hur matchen gick', () => {
  const base = { winners: ['P0'], winScore: 10, songs: 8 };
  isIn('win.shared', winComment({ ...base, winners: ['P0', 'P1'], standings: players(10, 10) }));
  isIn('win.alone', winComment({ ...base, standings: players(10) }));
  isIn('win.close', winComment({ ...base, standings: players(10, 9) }));
  isIn('win.fast', winComment({ ...base, songs: 4, standings: players(11, 3) }));
  isIn('win.big', winComment({ ...base, standings: players(12, 4) }));
  isIn('win.long', winComment({ ...base, songs: 16, standings: players(10, 7) }));
  const general = winComment({ ...base, standings: players(10, 7, 2) });
  isIn('win.general', general);
  assert.equal(general, winComment({ ...base, standings: players(10, 7, 2) }));
});

test('vinnarlåten slumpas och blir inte samma två gånger i rad', () => {
  assert.ok(WINNER_SONGS.every((s) => s.artist && s.title && Number.isInteger(s.deezerId)));
  const first = pickWinnerSong(() => 0, null, WINNER_SONGS);
  assert.equal(first, WINNER_SONGS[0]);
  for (const r of [0, 0.5, 0.999]) assert.notEqual(pickWinnerSong(() => r, first.deezerId, WINNER_SONGS), first);
});

test('texten innan vinnaren är densamma på alla enheter', () => {
  const intro = winIntro({ winners: ['Anna'], songs: 8 });
  isIn('win.intro', intro);
  assert.ok(sv['win.intro'].every((text) => text.endsWith('!')));
  assert.equal(winIntro({ winners: ['Anna'], songs: 8 }), intro);
});
