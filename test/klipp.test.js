import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipPosition, musicPosition, musicVolume, wantedClip } from '../js/klipp.js';

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

test('väntemusiken och vinnarlåten spelas när ingen quizlåt spelas', () => {
  const music = { url: 'https://cdnt-preview.dzcdn.net/vanta.mp3', posMs: 0, loop: true, volume: 0.5, fadeInMs: 2000, fadeOutMs: 3000 };
  assert.equal(wantedClip({ music }), music.url);
  assert.equal(wantedClip({ music, round: { phase: 'playing' }, clipUrl: 'https://x/quiz.mp3' }), 'https://x/quiz.mp3');
  assert.equal(wantedClip({}), null);
});

test('trumvirveln tonas inte i mobilerna', () => {
  const drum = { posMs: 0, loop: false, volume: 0.8, fadeInMs: 0, fadeOutMs: 0 };
  assert.equal(musicVolume(drum, 0, 4), 0.8);
  assert.equal(musicVolume(drum, 3.9, 4), 0.8);
});

test('väntemusiken loopar i takt med spelledaren och tonas som där', () => {
  const lobby = { posMs: 29000, loop: true, volume: 0.5, fadeInMs: 2000, fadeOutMs: 3000 };
  assert.equal(musicPosition(lobby, 2000, 30), 1);
  assert.equal(musicPosition({ ...lobby, loop: false }, 2000, 30), 31);
  assert.equal(musicVolume(lobby, 0, 30), 0);
  assert.equal(musicVolume(lobby, 1, 30), 0.25);
  assert.equal(musicVolume(lobby, 15, 30), 0.5);
  assert.ok(musicVolume(lobby, 29, 30) < 0.1);
  assert.equal(musicVolume(lobby, 30, 30), 0);
});
