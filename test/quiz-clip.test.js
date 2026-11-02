import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game/game.js';

// Ett ljudelement som spelar direkt, eller vägrar om blocked är sant.
class FakeAudio {
  constructor() { this.src = ''; this.paused = true; this.currentTime = 0; this.listeners = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  play() {
    if (FakeAudio.blocked && this.src.startsWith('http')) return Promise.reject(new Error('blockerat'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
}
globalThis.Audio = FakeAudio;
globalThis.document = { documentElement: { dataset: {} } };

const { createQuizClip } = await import('../js/host/quiz-clip.js');

const SONGS = [
  { id: 'a', artist: 'A', title: 'Ett', deezerId: 1 },
  { id: 'b', artist: 'B', title: 'Två', deezerId: 2 },
  { id: 'c', artist: 'C', title: 'Tre', deezerId: 3 },
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function setup({ find, ready = async () => {} } = {}) {
  const state = game.createGame({ code: 'ABCD', categoryId: 'x' });
  game.nextSong(state, SONGS, () => 0);
  const calls = { started: 0, saved: 0 };
  const clip = createQuizClip({
    state: () => state, playableSongs: () => SONGS, ready, otherMusic: [], render() {},
    save: () => { calls.saved += 1; }, broadcast() {}, started: () => { calls.started += 1; }, find,
  });
  return { state, clip, calls };
}

test('låten startar och timern går när klippet spelar', async () => {
  const { state, clip, calls } = setup({ find: async () => 'https://klipp/1' });
  clip.play(state.round.number);
  await settle();
  assert.equal(state.round.phase, 'playing');
  assert.equal(calls.started, 1);
  assert.equal(clip.stuck(state.round), false);
});

test('saknas klippet byts låten, och den överhoppade räknas som spelad', async () => {
  const { state, clip, calls } = setup({ find: async (song) => (song.id === 'a' ? null : 'https://klipp/' + song.id) });
  const first = state.round.song.id;
  clip.play(state.round.number);
  await settle();
  assert.equal(first, 'a');
  assert.notEqual(state.round.song.id, 'a');
  assert.ok(state.playedIds.includes('a'));
  assert.equal(state.round.phase, 'playing');
  assert.equal(calls.saved, 1);
});

test('saknar alla låtar klipp fastnar klippet med ett meddelande', async () => {
  const { state, clip } = setup({ find: async () => null });
  clip.play(state.round.number);
  await settle();
  assert.equal(state.round.phase, 'ready');
  assert.equal(clip.stuck(state.round), true);
  assert.equal(clip.stuckMessage(state.round).title, 'Inga klipp från Deezer');
});

test('svarar inte Deezer visas felet, och Starta spelet försöker igen', async () => {
  let fail = true;
  const { state, clip } = setup({ find: async () => { if (fail) throw new Error('Deezer svarade inte.'); return 'https://klipp/1'; } });
  clip.play(state.round.number);
  await settle();
  assert.equal(clip.stuckMessage(state.round).title, 'Deezer svarade inte');
  fail = false;
  clip.retry();
  await settle();
  assert.equal(state.round.phase, 'playing');
});

test('pausas spelet medan klippet laddas startar låten först när spelet fortsätter', async () => {
  let release;
  const { state, clip } = setup({ find: async () => 'https://klipp/1', ready: () => new Promise((r) => { release = r; }) });
  clip.play(state.round.number);
  await settle();
  game.pause(state, Date.now());
  release();
  await settle();
  assert.equal(state.round.phase, 'ready');
  game.resume(state, Date.now());
  clip.resume();
  await settle();
  assert.equal(state.round.phase, 'playing');
});

test('stoppar webbläsaren ljudet behövs ett nytt tryck', async () => {
  FakeAudio.blocked = true;
  const { state, clip } = setup({ find: async () => 'https://klipp/1' });
  clip.play(state.round.number);
  await settle();
  assert.equal(clip.stuckMessage(state.round).title, 'Klippet startade inte');
  FakeAudio.blocked = false;
  clip.retry();
  await settle();
  assert.equal(state.round.phase, 'playing');
});

test('spelarna får klipplänken bara med Spela ljud på alla enheter och inte när svaret visas', async () => {
  const { state, clip } = setup({ find: async () => 'https://klipp/1' });
  clip.play(state.round.number);
  await settle();
  assert.equal(clip.urlForPlayers(), null);
  state.clipAll = true;
  assert.equal(clip.urlForPlayers(), 'https://klipp/1');
  game.reveal(state);
  assert.equal(clip.urlForPlayers(), null);
});
