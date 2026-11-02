import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COPY, ENTRIES } from '../tools/build.mjs';

const root = new URL('../', import.meta.url);

// Bygget kopierar mapparna i COPY. En mapp som har bytt namn får inte stå kvar där (hände i PR 431).
test('mapparna och startfilerna som publiceras finns', () => {
  const missing = [...COPY, ...ENTRIES].filter((name) => !existsSync(new URL(name, root)));
  assert.deepEqual(missing, []);
});

test('publiceringen och webbkvaliteten bygger sidan på samma sätt', () => {
  for (const file of ['publish.yml', 'quality.yml']) {
    const workflow = readFileSync(new URL('.github/workflows/' + file, root), 'utf8');
    assert.match(workflow, /run: npm ci\n/, `${file}: npm ci saknas`);
    assert.match(workflow, /run: npm run build\n/, `${file}: npm run build saknas`);
  }
});
