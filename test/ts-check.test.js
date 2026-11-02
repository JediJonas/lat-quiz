import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../js/', import.meta.url);

const modules = readdirSync(root, { recursive: true })
  .map(String).map((file) => file.split('\\').join('/')).filter((file) => file.endsWith('.js'));

// Alla filer i js/ typkontrolleras sedan PR 438, så en ny fil ska också börja med // @ts-check.
test('alla filer i js/ typkontrolleras', () => {
  const unchecked = modules.filter((file) => !readFileSync(new URL(file, root), 'utf8').includes('// @ts-check'));
  assert.deepEqual(unchecked, [], 'lägg till // @ts-check överst i filen');
});
