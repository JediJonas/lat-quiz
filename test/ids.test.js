import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, newId } from '../js/shared/ids.js';

test('koden har fyra bokstäver utan I och O', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^[A-HJ-NP-Z]{4}$/);
  assert.equal(newCode(() => 0), 'AAAA');
});

test('id:n är unika och kan ha ett prefix', () => {
  assert.notEqual(newId(), newId());
  assert.match(newId('host-'), /^host-/);
});
