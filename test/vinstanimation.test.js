import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIN_EFFECTS, pickWinEffect } from '../js/vinstanimation.js';

test('samma match ger samma vinstanimation på alla enheter', () => {
  const key = '14|Take On Me|a-ha|Anna';
  assert.equal(pickWinEffect(key), pickWinEffect(key));
  assert.ok(WIN_EFFECTS.includes(pickWinEffect(key)));
});

test('alla tre vinstanimationerna förekommer ungefär lika ofta', () => {
  const counts = Object.fromEntries(WIN_EFFECTS.map((e) => [e, 0]));
  for (let i = 0; i < 3000; i += 1) counts[pickWinEffect(`${i % 30}|Låt ${i}|Artist|Spelare ${i % 7}`)] += 1;
  for (const effect of WIN_EFFECTS) assert.ok(counts[effect] > 800, `${effect}: ${counts[effect]}`);
});
