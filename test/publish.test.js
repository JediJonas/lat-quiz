import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

// Publiceringen kopierar sidan med cp. En mapp som har bytt namn får inte stå kvar där (hände i PR 431).
test('mapparna som publiceras finns', () => {
  const workflow = readFileSync(new URL('.github/workflows/publish.yml', root), 'utf8');
  const line = workflow.match(/cp -r (.+) _site\//);
  assert.ok(line, 'cp-raden saknas i publish.yml');
  const missing = line[1].split(/\s+/).filter((name) => !name.includes('*') && !existsSync(new URL(name, root)));
  assert.deepEqual(missing, []);
});
