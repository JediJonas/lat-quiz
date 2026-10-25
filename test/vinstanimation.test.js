import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASON_WIN_EFFECTS, WIN_EFFECTS, pickWinEffect } from '../js/vinstanimation.js';

test('samma match ger samma vinstanimation på alla enheter', () => {
  const key = '14|Take On Me|a-ha|Anna';
  assert.equal(pickWinEffect(key), pickWinEffect(key));
  assert.ok(WIN_EFFECTS.includes(pickWinEffect(key)));
  assert.equal(pickWinEffect(key, 'halloween'), pickWinEffect(key, 'halloween'));
});

test('alla tre vinstanimationerna förekommer ungefär lika ofta', () => {
  const counts = Object.fromEntries(WIN_EFFECTS.map((e) => [e, 0]));
  for (let i = 0; i < 3000; i += 1) counts[pickWinEffect(`${i % 30}|Låt ${i}|Artist|Spelare ${i % 7}`, '80-tal')] += 1;
  for (const effect of WIN_EFFECTS) assert.ok(counts[effect] > 800, `${effect}: ${counts[effect]}`);
});

test('Halloween och Jul har bara sina egna vinstanimationer, ungefär lika ofta', () => {
  assert.deepEqual(SEASON_WIN_EFFECTS, { halloween: ['fladdermoss', 'spoken'], jul: ['slade', 'snoyra'] });
  for (const [category, effects] of Object.entries(SEASON_WIN_EFFECTS)) {
    const counts = Object.fromEntries(effects.map((e) => [e, 0]));
    for (let i = 0; i < 2000; i += 1) counts[pickWinEffect(`${i % 30}|Låt ${i}|Artist|Spelare ${i % 7}`, category)] += 1;
    for (const effect of effects) assert.ok(counts[effect] > 850, `${category} ${effect}: ${counts[effect]}`);
  }
});
