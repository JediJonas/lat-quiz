import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, findUntranslated, withTexts } from '../tools/texts.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('sidorna har texterna från språkfilen', () => {
  for (const page of PAGES) assert.equal(read(page), withTexts(read(page)), `${page}: kör node tools/texts.mjs`);
});

test('varje text i sidorna har en nyckel i språkfilen', () => {
  for (const page of PAGES) assert.deepEqual(findUntranslated(read(page)), [], `${page}: lägg till data-t och texten i js/lang/sv.js`);
});

test('withTexts skriver text, attribut och HTML och behåller blankstegen', () => {
  const texts = { 'a.text': 'Ny & <fin>', 'a.label': 'Säg "hej"', 'a.html': 'Rad<br>två' };
  const page = '<p data-t="a.text"> Gammal </p><b aria-label="x" data-t-aria-label="a.label">B</b><p data-t-html="a.html">X</p>';
  assert.equal(withTexts(page, texts),
    '<p data-t="a.text"> Ny &amp; &lt;fin&gt; </p><b aria-label="Säg &quot;hej&quot;" data-t-aria-label="a.label">B</b><p data-t-html="a.html">Rad<br>två</p>');
});

test('withTexts säger till om en nyckel saknas eller elementet har barn', () => {
  assert.throws(() => withTexts('<p data-t="a.b">x</p>', {}), /a\.b saknas/);
  assert.throws(() => withTexts('<p data-t="a.b">x <i>y</i></p>', { 'a.b': 'z' }), /har barn/);
  assert.throws(() => withTexts('<p data-t-title="a.b">x</p>', { 'a.b': 'z' }), /title saknas/);
});

test('findUntranslated hittar text och attribut utan nyckel', () => {
  assert.deepEqual(findUntranslated('<p>Hej</p><p data-t="a.b">Hej</p><button aria-label="Stäng">×</button>'),
    ['Hej', 'aria-label i <button aria-label="Stäng">']);
});
