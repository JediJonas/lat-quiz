import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, CSS, categoriesJson, styleCss } from '../tools/categories.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const categories = JSON.parse(read(CATEGORIES));

test('style.css har kategoriernas färger och tecken från categories.json', () => {
  assert.equal(read(CSS), styleCss(read(CSS), categories), 'Kör node tools/categories.mjs');
});

test('categories.json har en kategori per rad', () => {
  assert.equal(read(CATEGORIES), categoriesJson(categories), 'Kör node tools/categories.mjs');
});

test('varje kategori har ett omslag med tecken, två färger och mörkhetsgrad', () => {
  for (const { id, cover } of categories) {
    assert.ok(cover, `${id} saknar cover`);
    assert.ok(cover.glyph && !/["\\]/.test(cover.glyph), `${id}: tecknet ska finnas och inte ha " eller \\`);
    assert.equal(cover.colors.length, 2, `${id}: två färger`);
    for (const color of cover.colors) assert.match(color, /^#[0-9a-f]{6}$/, `${id}: ${color} ska vara #rrggbb`);
    assert.ok(cover.dim >= 0 && cover.dim <= 1, `${id}: dim mellan 0 och 1`);
  }
});

// Vit text på omslaget ska nå 4,5:1 även där ljuset är starkast: den första färgen med 16 % vitt
// ljus ovanpå, mörkad med dim. Se .cover i style.css.
const linear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function whiteContrast(hex, dim) {
  const [r, g, b] = hex.match(/\w\w/g).map((h) => parseInt(h, 16)).map((v) => (v * 0.84 + 255 * 0.16) * (1 - dim));
  return 1.05 / (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) + 0.05);
}
test('vit text på omslaget når 4,5:1 där ljuset är starkast', () => {
  for (const { id, cover } of categories) {
    const ratio = whiteContrast(cover.colors[0], cover.dim);
    assert.ok(ratio >= 4.5, `${id}: ${ratio.toFixed(2)}:1, höj dim`);
  }
});

test('hyllan på startsidan visar bara kategorier som finns, med rätt namn', () => {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const tiles = [...read('index.html').matchAll(/<span class="tile" data-category="([^"]+)">([^<]+)<\/span>/g)];
  assert.ok(tiles.length > 0);
  for (const [, id, name] of tiles) {
    assert.ok(names.has(id), `Hyllan har ${id}, som inte finns i categories.json`);
    assert.equal(name, names.get(id), `Hyllan: ${id} heter ${names.get(id)}`);
  }
});
