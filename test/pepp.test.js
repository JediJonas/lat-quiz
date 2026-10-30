import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundCheer, winComment, winIntro } from '../js/pepp.js';
import { WINNER_SONGS, pickWinnerSong } from '../js/vinnarlat.js';

const players = (...scores) => scores.map((score, i) => ({ id: `p${i}`, name: `P${i}`, score }));

test('kommentaren efter en låt följer hur många rätt man hade', () => {
  assert.match(roundCheer({ artist: true, title: true }, 1), /Klockrent|Snyggt|Vilken koll|Mitt i prick/);
  assert.match(roundCheer({ artist: true, title: false }, 1), /Halvvägs|en av två|Nästan/);
  assert.match(roundCheer({ artist: false, title: false }, 1), /Nästa tar du|klurig|Ny chans/);
  assert.match(roundCheer({ artist: false, title: true }, 1, 1), /Klockrent|Snyggt|Vilken koll|Mitt i prick/);
  assert.equal(roundCheer({ artist: true, title: true }, 7), roundCheer({ artist: true, title: true }, 7));
});

test('vinnarkommentaren beror på hur matchen gick', () => {
  const base = { winners: ['P0'], winScore: 10, songs: 8 };
  assert.equal(winComment({ ...base, winners: ['P0', 'P1'], standings: players(10, 10) }), 'Delad glädje är dubbel glädje!');
  assert.match(winComment({ ...base, standings: players(10) }), /kompisar/);
  assert.match(winComment({ ...base, standings: players(10, 9) }), /jämnt|nöd och näppe/);
  assert.equal(winComment({ ...base, songs: 4, standings: players(11, 3) }), 'Det gick undan!');
  assert.match(winComment({ ...base, standings: players(12, 4) }), /Ingen chans|Överlägset/);
  assert.equal(winComment({ ...base, songs: 16, standings: players(10, 7) }), 'Det blev ett riktigt maraton!');
  const general = winComment({ ...base, standings: players(10, 7, 2) });
  assert.equal(general, winComment({ ...base, standings: players(10, 7, 2) }));
});

test('vinnarlåten slumpas och blir inte samma två gånger i rad', () => {
  assert.ok(WINNER_SONGS.every((s) => s.artist && s.title && Number.isInteger(s.deezerId)));
  const first = pickWinnerSong(() => 0);
  assert.equal(first, WINNER_SONGS[0]);
  for (const r of [0, 0.5, 0.999]) assert.notEqual(pickWinnerSong(() => r, first.deezerId), first);
});

test('texten innan vinnaren är densamma på alla enheter', () => {
  const intro = winIntro({ winners: ['Anna'], songs: 8 });
  assert.ok(intro.endsWith('!'));
  assert.equal(winIntro({ winners: ['Anna'], songs: 8 }), intro);
});
