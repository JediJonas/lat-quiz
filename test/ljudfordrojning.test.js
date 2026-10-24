import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELAY_CHOICES, after, cleanDelay, delayShort, delayText } from '../js/ljudfordrojning.js';

test('ljudfördröjningen väljs i steg om 0,25 sekunder upp till en sekund', () => {
  assert.deepEqual(DELAY_CHOICES, [0, 250, 500, 750, 1000]);
});

test('ett okänt sparat värde blir ingen fördröjning', () => {
  assert.equal(cleanDelay('500'), 500);
  assert.equal(cleanDelay(null), 0);
  assert.equal(cleanDelay('300'), 0);
  assert.equal(cleanDelay('abc'), 0);
});

test('fördröjningen skrivs med decimalkomma', () => {
  assert.deepEqual(DELAY_CHOICES.map(delayShort), ['Ingen', '0,25 s', '0,5 s', '0,75 s', '1 s']);
  assert.equal(delayText(750), '0,75 sekunder');
  assert.equal(delayText(0), 'Ingen fördröjning');
});

test('after väntar fördröjningen efter löftet, även när det avvisas', async () => {
  const start = Date.now();
  await after(Promise.resolve(), 60);
  assert.ok(Date.now() - start >= 55);
  await after(Promise.reject(new Error('fel')), 10);
  const same = Promise.resolve(1);
  assert.equal(after(same, 0), same);
});
