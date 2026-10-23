import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowMusic } from '../js/nuspelas.js';
import { WINNER_SONGS } from '../js/vinnarlat.js';
import { LOBBY_SONGS } from '../js/vantemusik.js';

test('raden längst ner har rubrik, artist och titel för alla vinnarlåtar och all väntemusik', () => {
  for (const song of WINNER_SONGS) assert.deepEqual(nowMusic('Vinnarlåt', song), { label: 'Vinnarlåt', artist: song.artist, title: song.title });
  for (const song of LOBBY_SONGS) assert.ok(nowMusic('Väntemusik', song), song.title);
});

test('raden längst ner är tom när ingen låt spelas', () => {
  assert.equal(nowMusic('Väntemusik', null), null);
  assert.equal(nowMusic('Vinnarlåt', false), null);
});
