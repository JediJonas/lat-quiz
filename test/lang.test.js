import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import sv from '../js/lang/sv.js';
import { t } from '../js/shared/lang.js';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

// Alla moduler i js/ utom språkfilerna och lang.js, vars kommentarer har exempel.
const SOURCES = readdirSync(new URL('js/', root), { recursive: true }).map(String)
  .map((f) => f.split('\\').join('/')).filter((f) => f.endsWith('.js') && !f.startsWith('lang/') && f !== 'shared/lang.js')
  .map((f) => ({ file: 'js/' + f, code: read('js/' + f) }));

// Varje anrop t('nyckel') eller t('nyckel', { a, b: … }), med namnen på värdena som skickas.
function calls() {
  const found = [];
  for (const { file, code } of SOURCES) {
    for (const m of code.matchAll(/\bt\(\s*'([^']+)'\s*(?:,\s*\{([^}]*)\})?/g)) {
      const names = (m[2] || '').split(',').map((part) => part.split(':')[0].trim()).filter(Boolean);
      found.push({ file, key: m[1], names, hasValues: m[2] !== undefined });
    }
  }
  return found;
}

test('t sätter in värden', () => {
  assert.equal(t('message.left.title', { name: 'Anna' }), 'Hej då, Anna!');
  assert.equal(t('menu.pause'), 'Pausa spelet');
});

test('t räknar upp namn med och', () => {
  assert.equal(t('message.joined.text', { names: ['Anna'] }), 'Anna har gått med i spelet.');
  assert.equal(t('message.joined.text', { names: ['Anna', 'Bo', 'Cia'] }), 'Anna, Bo och Cia har gått med i spelet.');
});

test('t ger nyckeln om texten saknas', (ctx) => {
  ctx.mock.method(console, 'error', () => {});
  assert.equal(t('finns.inte'), 'finns.inte');
});

test('varje nyckel som används finns i språkfilen', () => {
  const missing = calls().filter(({ key }) => !(key in sv)).map(({ file, key }) => `${key} i ${file}`);
  assert.deepEqual(missing, []);
});

test('ingen nyckel i språkfilen är oanvänd', () => {
  const used = new Set(calls().map(({ key }) => key));
  assert.deepEqual(Object.keys(sv).filter((key) => !used.has(key)), []);
});

test('varje {namn} i en text får ett värde', () => {
  const problems = [];
  for (const { file, key, names } of calls()) {
    const text = sv[key];
    if (typeof text !== 'string') continue;
    for (const [, name] of text.matchAll(/\{(\w+)\}/g)) {
      if (!names.includes(name)) problems.push(`${key} i ${file} saknar ${name}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('språkfilen har bara texter och funktioner', () => {
  for (const [key, text] of Object.entries(sv)) {
    assert.ok(typeof text === 'string' || typeof text === 'function', key);
    assert.match(key, /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$/, `${key} ska se ut som omrade.text`);
  }
});
