import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELAY_CHOICES, after, cleanDelay, delayShort, delayText } from '../js/ljudfordrojning.js';

test('ljudsynken väljs i steg om 0,2 sekunder upp till 0,8 sekunder', () => {
  assert.deepEqual(DELAY_CHOICES, [0, 200, 400, 600, 800]);
});

test('ett sparat värde blir närmaste val, och det som inte är ett tal ingen fördröjning', () => {
  assert.equal(cleanDelay('400'), 400);
  assert.equal(cleanDelay('500'), 400);
  assert.equal(cleanDelay('250'), 200);
  assert.equal(cleanDelay('750'), 800);
  assert.equal(cleanDelay('1000'), 800);
  assert.equal(cleanDelay(null), 0);
  assert.equal(cleanDelay(''), 0);
  assert.equal(cleanDelay('abc'), 0);
  assert.equal(cleanDelay('-200'), 0);
});

test('fördröjningen skrivs med decimalkomma', () => {
  assert.deepEqual(DELAY_CHOICES.map(delayShort), ['Ingen', '0,2 s', '0,4 s', '0,6 s', '0,8 s']);
  assert.equal(delayText(600), '0,6 sekunder');
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
