import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatar, scoreTracker } from '../js/ui.js';

test('initialen är namnets första bokstav som versal, och färgen följer namnet', () => {
  assert.equal(avatar('anna').letter, 'A');
  assert.equal(avatar(' örjan').letter, 'Ö');
  assert.equal(avatar('').letter, '?');
  assert.equal(avatar('Erik').color, avatar('Erik').color);
  for (const name of ['Anna', 'Erik', 'Jonas', 'Åsa', '🎸 Gitarr']) {
    const { color } = avatar(name);
    assert.ok(Number.isInteger(color) && color >= 0 && color < 8);
  }
});

test('poängräknaren ger den förra poängen bara när den har ändrats', () => {
  const changed = scoreTracker();
  assert.equal(changed('p1', 0), null);
  assert.equal(changed('p1', 0), null);
  assert.equal(changed('p1', 3), 0);
  assert.equal(changed('p1', 3), null);
  assert.equal(changed('p2', 5), null);
});
