import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_MAX_MS, DRUM_MS, DRUM_WAIT_MS, WIN_DELAY_MS, createWinnerTiming } from '../js/views/winner-timing.js';

const won = (extra = {}) => ({ winners: ['Anna'], round: { number: 7, phase: 'revealed' }, ...extra });

function setup({ host, sound = null }) {
  let view = won();
  const calls = [];
  const timing = createWinnerTiming({
    view: () => view,
    host,
    onWinnerDrum: () => { calls.push('drum'); return sound; },
    onWinnerDrumShown: () => calls.push('drumShown'),
    onWinnerShown: () => calls.push('shown'),
    render: () => calls.push('render'),
  });
  return { timing, calls, set: (v) => { view = v; timing.follow(); } };
}

test('spelledaren utan vinnarlåt: texten efter en stund, namnet efter DRUM_MS', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { timing, calls, set } = setup({ host: true });
  set(won());
  assert.equal(timing.drum(), false);
  t.mock.timers.tick(WIN_DELAY_MS);
  assert.deepEqual(calls, ['drum', 'render', 'drumShown']);
  assert.equal(timing.drum(), true);
  assert.equal(timing.winner(), false);
  t.mock.timers.tick(DRUM_MS);
  assert.equal(timing.winner(), true);
  assert.deepEqual(calls.slice(3), ['render', 'shown']);
});

test('spelledaren med vinnarlåt vänder när virveln och låten hörs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let drumHeard; let songHeard;
  const sound = { drum: new Promise((r) => { drumHeard = r; }), song: new Promise((r) => { songHeard = r; }) };
  const { timing, set } = setup({ host: true, sound });
  set(won());
  t.mock.timers.tick(WIN_DELAY_MS);
  assert.equal(timing.drum(), false);
  drumHeard();
  await Promise.resolve();
  assert.equal(timing.drum(), true);
  songHeard();
  await Promise.resolve();
  assert.equal(timing.winner(), true);
});

test('spelledaren: dröjer virveln visas texten ändå efter DRUM_WAIT_MS, och namnet efter DRUM_MAX_MS', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sound = { drum: new Promise(() => {}), song: new Promise(() => {}) };
  const { timing, set } = setup({ host: true, sound });
  set(won());
  t.mock.timers.tick(WIN_DELAY_MS);
  t.mock.timers.tick(DRUM_WAIT_MS);
  assert.equal(timing.drum(), true);
  t.mock.timers.tick(DRUM_MAX_MS - 1);
  assert.equal(timing.winner(), false);
  t.mock.timers.tick(1);
  assert.equal(timing.winner(), true);
});

test('spelaren vänder samtidigt som spelledaren säger till', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { timing, calls, set } = setup({ host: false });
  set(won());
  set(won({ winnerDrum: true }));
  assert.equal(timing.drum(), true);
  assert.equal(timing.winner(), false);
  set(won({ winnerDrum: true, winnerShown: true }));
  assert.equal(timing.winner(), true);
  // Spelaren spelar inget ljud.
  t.mock.timers.tick(WIN_DELAY_MS);
  t.mock.timers.tick(DRUM_MAX_MS);
  assert.equal(calls.includes('drum'), false);
});

test('spelaren visar vinnaren ändå om spelledaren dröjer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { timing, set } = setup({ host: false });
  set(won());
  t.mock.timers.tick(WIN_DELAY_MS);
  t.mock.timers.tick(DRUM_WAIT_MS);
  assert.equal(timing.drum(), true);
  t.mock.timers.tick(DRUM_MAX_MS);
  assert.equal(timing.winner(), true);
});

test('Spela igen nollställer, och ett sent löfte från förra vinnaren visar ingenting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let songHeard;
  const sound = { drum: Promise.resolve(), song: new Promise((r) => { songHeard = r; }) };
  const { timing, calls, set } = setup({ host: true, sound });
  set(won());
  t.mock.timers.tick(WIN_DELAY_MS);
  await Promise.resolve();
  set({ winners: null, round: null });
  assert.equal(timing.drum(), false);
  const before = calls.length;
  songHeard();
  await Promise.resolve();
  assert.equal(calls.length, before);
  assert.equal(timing.winner(), false);
});
