import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const root = new URL('../js/', import.meta.url);
const files = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.js'));
const folders = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

// Filerna ligger i en mapp efter vad de gör, enligt skillen kodkvalitet. Bara startfilerna ligger överst.
test('överst i js/ ligger bara startfilerna', () => {
  assert.deepEqual(files('').map((e) => e.name).sort(), ['host.js', 'menu.js', 'play.js']);
});

test('ingen mapp i js/ har fler än tolv filer eller egna undermappar', () => {
  for (const folder of folders) {
    assert.ok(files(folder + '/').length <= 12, `${folder}/ har fler än tolv filer, dela den`);
    const sub = readdirSync(new URL(folder + '/', root), { withFileTypes: true }).filter((e) => e.isDirectory());
    assert.deepEqual(sub.map((e) => e.name), [], `${folder}/ ska inte ha undermappar`);
  }
});
