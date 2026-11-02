import { test } from 'node:test';
import assert from 'node:assert/strict';

// En enkel localStorage, eftersom Node inte har någon.
const store = new Map([['latquiz-musik', 'spotify'], ['latquiz-vinnarlat', '0']]);
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const { KEYS, readJson, readText, remove, writeJson, writeText } = await import('../js/shared/storage.js');
const prefs = await import('../js/shared/preferences.js');

test('gamla nycklar tas bort när lagringen läses in', () => {
  assert.equal(store.has('latquiz-musik'), false);
  assert.equal(store.has('latquiz-vinnarlat'), false);
});

test('nycklarnas namn är oförändrade, så att sparade val finns kvar', () => {
  assert.equal(KEYS.hostGame, 'latquiz-host');
  assert.equal(KEYS.player, 'latquiz-player');
  assert.equal(KEYS.extraSounds, 'latquiz-extraljud');
  assert.equal(KEYS.audioDelay, 'latquiz-ljudfordrojning');
  assert.equal(KEYS.unknown, 'latquiz-okanda');
  assert.equal(KEYS.theme, 'latquiz-tema');
});

test('text och JSON sparas, läses och tas bort', () => {
  writeText('a', 'x');
  assert.equal(readText('a'), 'x');
  writeText('a', null);
  assert.equal(readText('a'), null);
  writeJson('b', { n: 1 });
  assert.deepEqual(readJson('b', null), { n: 1 });
  remove('b');
  assert.deepEqual(readJson('b', { n: 0 }), { n: 0 });
});

test('trasig JSON och en lagring som vägrar ger standardvärdet', () => {
  store.set('c', '{inte json');
  assert.deepEqual(readJson('c', []), []);
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('privat läge'); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } };
  assert.equal(readText('a'), null);
  assert.doesNotThrow(() => writeText('a', 'x'));
  assert.equal(prefs.extraSounds(), true);
  globalThis.localStorage = saved;
});

test('enhetens val har samma standard och lagras som förut', () => {
  assert.equal(prefs.extraSounds(), true);
  prefs.setExtraSounds(false);
  assert.equal(store.get('latquiz-extraljud'), '0');
  prefs.setExtraSounds(true);
  assert.equal(store.has('latquiz-extraljud'), false);

  assert.equal(prefs.clipAll(), false);
  prefs.setClipAll(true);
  assert.equal(store.get('latquiz-klipp-alla'), '1');

  assert.equal(prefs.audioDelay(), 0);
  prefs.setAudioDelay(400);
  assert.equal(prefs.audioDelay(), 400);
  prefs.setAudioDelay(0);
  assert.equal(store.has('latquiz-ljudfordrojning'), false);

  assert.deepEqual(prefs.lastSettings(), { roundMs: 30000, bonusMs: 15000, winScore: 10 });
});

test('spelledarens namn tas från spelarsidan när inget eget finns', () => {
  writeJson(KEYS.player, { name: 'Anna', playerId: 'p1', code: 'ABCD' });
  assert.equal(prefs.hostName(), 'Anna');
  prefs.setHostName('Bo');
  assert.equal(prefs.hostName(), 'Bo');
});

test('?okanda=1 slår på Okända låtar och ?okanda=0 slår av', () => {
  assert.equal(prefs.showUnknown(''), false);
  assert.equal(prefs.showUnknown('?okanda=1'), true);
  assert.equal(prefs.showUnknown(''), true);
  assert.equal(prefs.showUnknown('?okanda=0'), false);
});
