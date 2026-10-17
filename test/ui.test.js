import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTracker } from '../js/ui.js';

test('poängräknaren ger den förra poängen bara när den har ändrats', () => {
  const changed = scoreTracker();
  assert.equal(changed('p1', 0), null);
  assert.equal(changed('p1', 0), null);
  assert.equal(changed('p1', 3), 0);
  assert.equal(changed('p1', 3), null);
  assert.equal(changed('p2', 5), null);
});
