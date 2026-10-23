import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseTitle, titleMatches } from '../js/lookup.js';

test('tillägg som remaster och version tas bort från titeln', () => {
  assert.equal(baseTitle('Take On Me (2015 Remaster)'), 'take on me');
  assert.equal(baseTitle('Take On Me - 2015 Remastered Version'), 'take on me');
  assert.equal(baseTitle("Livin' on a Prayer"), 'livin on a prayer');
});

test('titeln får ha ett tillägg som Radio Edit, men orden måste stå i rätt ordning', () => {
  assert.ok(titleMatches('Take On Me', 'Take On Me (2015 Remaster)'));
  assert.ok(titleMatches('Crazy', 'Crazy (Radio Edit)'));
  assert.ok(!titleMatches('Take On Me', 'Take Me On'));
});
