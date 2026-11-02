import { test } from 'node:test';
import assert from 'node:assert/strict';

// Menyn lyssnar på sidan när den laddas.
const noop = () => {};
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), addEventListener: noop };
globalThis.document = { addEventListener: noop, documentElement: { dataset: {} } };

const { pauseItem } = await import('../js/host/host-menu.js');

const actions = { stuck: () => false, start: () => 'start', resume: () => 'resume', retry: () => 'retry', pause: () => 'pause' };
const item = (state, a = actions) => pauseItem(state, a).map((i) => `${i.label} ${i.action()}`);

test('medan spelarna går med står Starta spelet i menyn', () => {
  assert.deepEqual(item({ round: null, winners: null }), ['Starta spelet start']);
});

test('under en låt står Pausa spelet, och Starta spelet efter en paus', () => {
  const round = { phase: 'playing' };
  assert.deepEqual(item({ round }), ['Pausa spelet pause']);
  assert.deepEqual(item({ round, pausedAt: 1 }), ['Starta spelet resume']);
});

test('ett klipp som har fastnat startas om från menyn', () => {
  assert.deepEqual(item({ round: { phase: 'ready' } }, { ...actions, stuck: () => true }), ['Starta spelet retry']);
});

test('när någon har vunnit finns raden inte', () => {
  assert.deepEqual(item({ round: { phase: 'revealed' }, winners: ['p1'] }), []);
  assert.deepEqual(item({ round: null, winners: ['p1'] }), []);
});
