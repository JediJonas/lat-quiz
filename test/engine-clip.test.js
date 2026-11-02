import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineStopped, loadToEngine } from '../js/sound/engine-clip.js';

const buffer = { duration: 30 };
const ctx = { decodeAudioData: async () => buffer };
const ok = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });

test('klippet hamnar i ljudmotorn när Deezer tillåter hämtningen', async () => {
  assert.deepEqual(await loadToEngine(ctx, 'https://x/a.mp3', ok), { buffer });
});

// På iPhone kan bara ljudmotorn tona. Därför ska det gå att se varför den inte användes.
test('det står varför klippet inte kunde spelas i ljudmotorn', async () => {
  assert.match((await loadToEngine(null, 'u', ok)).why, /no tap/);
  const refused = async () => { throw new TypeError('Load failed'); };
  assert.match((await loadToEngine(ctx, 'u', refused)).why, /CORS/);
  const missing = async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) });
  assert.equal((await loadToEngine(ctx, 'u', missing)).why, 'Deezer answered 403');
  const broken = { decodeAudioData: async () => { throw new Error('EncodingError'); } };
  assert.match((await loadToEngine(broken, 'u', ok)).why, /decoded/);
  assert.equal(engineStopped({ state: 'interrupted' }), 'audio engine was interrupted');
});
