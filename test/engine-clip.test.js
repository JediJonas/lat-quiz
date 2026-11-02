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

test('ljudmotorn vilar under quizlåten och väcks bara om den vilade', async () => {
  const calls = [];
  const ctx = {
    state: 'suspended',
    resume: async () => { calls.push('resume'); ctx.state = 'running'; },
    suspend: async () => { calls.push('suspend'); ctx.state = 'suspended'; },
  };
  globalThis.window = { AudioContext: function AudioContext() { return ctx; } };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  const { createAudioEngine } = await import('../js/sound/engine-clip.js');
  const engine = createAudioEngine();
  assert.equal(engine.context(), null);
  engine.wake();
  engine.unlock();
  await engine.resume();
  assert.equal(engine.running(), true);
  engine.wake();
  engine.pause();
  engine.wake();
  assert.deepEqual(calls, ['resume', 'suspend', 'resume']);
});
