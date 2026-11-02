import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeLevel, fadeOutCurve, measureLevel, levelGain } from '../js/sound/audio-level.js';
import { musicVolume } from '../js/sound/clip-player.js';

// Ett påhittat klipp med samma delar som ljudmotorns AudioBuffer: en ton med amplituden amp,
// och tystnad under de sekunder som anges i silentS.
function clip(amp, { seconds = 4, silentS = 0, rate = 8000 } = {}) {
  const length = seconds * rate;
  const data = Float32Array.from({ length }, (_, i) => (i < silentS * rate ? 0 : amp * Math.sin(i / 3)));
  return { numberOfChannels: 2, sampleRate: rate, length, getChannelData: () => data };
}

test('ett starkt klipp mäts starkare än ett svagt', () => {
  const loud = measureLevel(clip(0.8));
  const soft = measureLevel(clip(0.1));
  assert.ok(loud.db > soft.db);
  assert.ok(Math.abs(loud.db - soft.db - 20 * Math.log10(8)) < 0.1);
  assert.ok(Math.abs(loud.peak - 0.8) < 0.01);
});

test('tystnad räknas inte in i nivån', () => {
  const quietStart = measureLevel(clip(0.3, { silentS: 2 }));
  const full = measureLevel(clip(0.3));
  assert.ok(Math.abs(quietStart.db - full.db) < 0.1);
});

test('starka klipp skruvas ner och svaga upp mot samma nivå', () => {
  const target = -16;
  const loud = clip(0.4);
  const soft = clip(0.15);
  const loudGain = levelGain(loud, target);
  const softGain = levelGain(soft, target);
  assert.ok(loudGain < 1);
  assert.ok(softGain > 1);
  const after = (c, g) => measureLevel(c).db + 20 * Math.log10(g);
  assert.ok(Math.abs(after(loud, loudGain) - target) < 0.1);
  assert.ok(Math.abs(after(soft, softGain) - target) < 0.1);
});

test('ett svagt klipp skruvas inte upp så att det slår i taket, och tystnad lämnas som den är', () => {
  const gain = levelGain(clip(0.5), 0);
  assert.ok(gain * 0.5 <= 1.0001);
  assert.equal(levelGain(clip(0), -16), 1);
  assert.ok(levelGain(clip(0.001), -16) <= 2.5);
  assert.ok(levelGain(clip(0.99), -40) >= 0.3);
});

test('mobilerna spelar som starkast på full volym', () => {
  const lobby = { posMs: 0, loop: true, volume: 1.2, fadeInMs: 2000, fadeOutMs: 3000 };
  assert.equal(musicVolume(lobby, 15, 30), 1);
});

test('uttoningen börjar på volymen, slutar tyst och sjunker hela vägen', () => {
  const curve = fadeOutCurve(0.8);
  assert.equal(curve.length, 50);
  assert.ok(Math.abs(curve[0] - 0.8) < 1e-6);
  assert.equal(curve[curve.length - 1], 0);
  assert.ok(curve.every((v, i) => i === 0 || v <= curve[i - 1]));
  assert.equal(fadeLevel(0.5, 0.8), 0.8 * 0.125);
});
