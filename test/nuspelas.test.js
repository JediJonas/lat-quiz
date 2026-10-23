import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowMusic } from '../js/nuspelas.js';
import { WINNER_SONGS } from '../js/vinnarlat.js';
import { LOBBY_SONGS } from '../js/vantemusik.js';

test('raden längst ner har artist och titel för alla vinnarlåtar och all väntemusik', () => {
  assert.equal(nowMusic(WINNER_SONGS[0]), 'Nu spelas Queen – We Are the Champions');
  for (const song of [...WINNER_SONGS, ...LOBBY_SONGS]) assert.equal(nowMusic(song), `Nu spelas ${song.artist} – ${song.title}`);
});

test('raden längst ner är tom när ingen låt spelas', () => {
  assert.equal(nowMusic(null), null);
  assert.equal(nowMusic(false), null);
});
