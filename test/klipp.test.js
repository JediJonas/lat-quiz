import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipPosition, wantedClip } from '../js/klipp.js';

const round = (phase, remainingMs = 30000) => ({ phase, remainingMs, roundMs: 30000 });

test('clipPosition räknar fram samma ställe som hos spelledaren', () => {
  assert.equal(clipPosition(round('playing', 30000), 0), 0);
  assert.equal(clipPosition(round('playing', 20000), 500), 10.5);
});

test('wantedClip ger länken bara medan låten laddas eller spelas', () => {
  const url = 'https://cdnt-preview.dzcdn.net/x.mp3';
  assert.equal(wantedClip({ clipUrl: url, round: round('ready') }), url);
  assert.equal(wantedClip({ clipUrl: url, round: round('playing') }), url);
  assert.equal(wantedClip({ clipUrl: url, round: round('revealed') }), null);
  assert.equal(wantedClip({ round: round('playing') }), null);
  assert.equal(wantedClip(null), null);
});
