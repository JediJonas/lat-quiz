import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicEngine, enginePosition, fades } from '../js/sound/music-engine.js';
import { musicLevel, musicVolume } from '../js/sound/clip-player.js';

// En påhittad ljudmotor, som räcker för att se hur klippen väljs och startas.
function fakeContext({ state = 'running', resumes = true } = {}) {
  const ctx = {
    state, currentTime: 0, destination: {}, started: [],
    resume: async () => { if (resumes) ctx.state = 'running'; },
    suspend: async () => { ctx.state = 'suspended'; },
    decodeAudioData: async () => ({ duration: 30 }),
    createGain: () => ({ gain: { value: 0, setValueAtTime(v) { this.value = v; } }, connect: (n) => n }),
    createBufferSource: () => ({
      connect: (n) => n,
      start: (when, offset) => ctx.started.push(offset),
      stop() {},
    }),
  };
  return ctx;
}

function setup(ctx) {
  globalThis.window = { AudioContext: function AudioContext() { return ctx; } };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
  let changes = 0;
  const engine = createMusicEngine({ onChange: () => { changes += 1; } });
  return { engine, changes: () => changes };
}

test('väntemusiken och vinnarlåten tonas, men inte trumvirveln', () => {
  assert.equal(fades({ fadeInMs: 2000, fadeOutMs: 3000 }), true);
  assert.equal(fades({ fadeInMs: 0, fadeOutMs: 5000 }), true);
  assert.equal(fades({ fadeInMs: 0, fadeOutMs: 0 }), false);
  assert.equal(fades(null), false);
});

test('ljudmotorn loopar väntemusiken i takt med spelledaren', () => {
  assert.equal(enginePosition({ startAt: 10, offset: 28, loop: true, duration: 30 }, 14), 2);
  assert.equal(enginePosition({ startAt: 10, offset: 28, loop: false, duration: 30 }, 14), 32);
});

test('ljudmotorn kan spela starkare än 1, men inte ljudelementet', () => {
  const loud = { volume: 1.5, fadeInMs: 0, fadeOutMs: 5000 };
  assert.equal(musicLevel(loud, 10, 30), 1.5);
  assert.equal(musicVolume(loud, 10, 30), 1);
});

test('utan tryck spelas musiken som vanligt ljud', () => {
  const { engine } = setup(fakeContext());
  assert.equal(engine.choice('u'), 'element');
  assert.equal(engine.play('u', 0, true), false);
});

test('mobilen spelar musiken i ljudmotorn och startar om den när den glider', async () => {
  const ctx = fakeContext();
  const { engine, changes } = setup(ctx);
  engine.unlock();
  await engine.choose('u');
  assert.equal(engine.choice('u'), 'engine');
  assert.equal(changes(), 1);
  assert.equal(engine.play('u', 31, true), true);
  assert.deepEqual(ctx.started, [1]);
  ctx.currentTime = 1;
  engine.play('u', 32.2, true);
  assert.deepEqual(ctx.started, [1], 'nära nog, spelar vidare');
  engine.play('u', 40, true);
  assert.deepEqual(ctx.started, [1, 10]);
});

// Det värsta som ska kunna hända är att musiken spelas som förut, utan toning.
test('går ljudmotorn inte spelas klippet som vanligt ljud, och byter aldrig mitt i', async () => {
  const stuck = fakeContext({ state: 'suspended', resumes: false });
  const { engine } = setup(stuck);
  engine.unlock();
  await engine.choose('u');
  assert.equal(engine.choice('u'), 'element');

  const refused = setup(fakeContext());
  globalThis.fetch = async () => { throw new TypeError('Load failed'); };
  refused.engine.unlock();
  await refused.engine.choose('v');
  assert.equal(refused.engine.choice('v'), 'element');
});

test('ljudmotorn vilar under quizlåten och väcks igen för vinnarlåten', async () => {
  const ctx = fakeContext();
  const { engine } = setup(ctx);
  engine.unlock();
  await engine.choose('lobby');
  engine.play('lobby', 0, true);
  engine.rest();
  await Promise.resolve();
  assert.equal(ctx.state, 'suspended');
  assert.equal(engine.playing(), false);
  await engine.choose('winner');
  assert.equal(ctx.state, 'running');
  assert.equal(engine.choice('winner'), 'engine');
});
