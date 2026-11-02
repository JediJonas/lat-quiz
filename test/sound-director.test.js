import { test } from 'node:test';
import assert from 'node:assert/strict';

// Inställningarna läses från enhetens minne, här en vanlig Map.
const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => (saved.has(key) ? saved.get(key) : null),
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};
globalThis.document = { documentElement: { dataset: {} } };

const prefs = await import('../js/shared/preferences.js');
const { createSoundDirector } = await import('../js/sound/sound-director.js');

const music = { lobby: { default: [] }, winner: { default: [] } };

function director({ state, leaving = false }) {
  return createSoundDirector({ state: () => state, categoryId: () => null, music: () => music, leaving: () => leaving, changed: () => {} });
}

test('väntemusiken spelas bara medan spelarna går med och extraljuden är på', (ctx) => {
  ctx.after(() => saved.clear());
  assert.equal(director({ state: null }).lobbyWanted(), false, 'inget spel än');
  assert.equal(director({ state: { round: null, winners: null } }).lobbyWanted(), true);
  assert.equal(director({ state: { round: { number: 1 }, winners: null } }).lobbyWanted(), false, 'spelet har startat');
  assert.equal(director({ state: { round: null, winners: ['Bo'] } }).lobbyWanted(), false, 'någon har vunnit');
  assert.equal(director({ state: { round: null, winners: null }, leaving: true }).lobbyWanted(), false, 'spelet avslutas');
  prefs.setExtraSounds(false);
  assert.equal(director({ state: { round: null, winners: null } }).lobbyWanted(), false, 'extraljuden är av');
});

test('utan extraljud blir det ingen trumvirvel och ingen vinnarlåt', (ctx) => {
  ctx.after(() => saved.clear());
  prefs.setExtraSounds(false);
  assert.equal(director({ state: { round: { number: 5 }, winners: ['Bo'] } }).winnerDrum(), null);
});

test('spelarnas mobiler får ingen musik utan Spela ljud på alla enheter', () => {
  assert.equal(director({ state: { round: null, winners: null, clipAll: false } }).forPlayers(), null);
});

test('raden Nu spelas är tom när ingen musik hörs', () => {
  assert.equal(director({ state: null }).currentMusic(), null);
  assert.equal(director({ state: { round: { number: 2 }, winners: null } }).currentMusic(), null);
});
