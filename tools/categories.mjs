// Kategorierna beskrivs bara i data/categories.json. Det här verktyget skriver det som följer av
// den filen till de ställen där det måste stå, så att ingen behöver uppdatera dem för hand:
//
// - antalet låtar (songs) i categories.json, räknat från kategorins fil
// - omslagens färger, tecken och mörkhetsgrad (cover) som CSS-variabler i css/style.css
// - listan över tecken med fler än två tecken, som står mitt i omslaget i mobilen
//
//   node tools/categories.mjs
//
// Ett test (test/categories.test.js) säger till om verktyget behöver köras.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const path = (file) => fileURLToPath(new URL(file, root));
const read = (file) => readFileSync(path(file), 'utf8');

export const CATEGORIES = 'data/categories.json';
export const CSS = 'css/style.css';

// CSS:en mellan markeringarna skrivs av verktyget. Markeringarna står kvar.
const START = '/* Från data/categories.json, skrivs av tools/categories.mjs. */';
const END = '/* Slut på det som skrivs av tools/categories.mjs. */';
const LONG_START = '/* Långa tecken, skrivs av tools/categories.mjs. */';
const LONG_END = '/* Slut på långa tecken. */';

// Hur många synliga tecken tecknet har. Fler än två får inte plats i hörnet i mobilen.
const glyphCount = (glyph) => [...glyph].length;

/** Färgerna och tecknen för varje kategori, som CSS. */
export function coverCss(categories) {
  return categories.map(({ id, cover: { glyph, colors: [c1, c2], dim } }) =>
    `[data-category="${id}"] { --cat-glyph: "${glyph}"; --cat-1: ${c1}; --cat-2: ${c2}; --cat-dim: ${dim.toFixed(2)}; }`).join('\n');
}

/** Väljarna för kategorierna vars tecken står mitt i omslaget i mobilen. */
export function longGlyphCss(categories) {
  const list = categories.filter((c) => glyphCount(c.cover.glyph) > 2).map((c) => `[data-category="${c.id}"]`).join(', ');
  return `  .tile:is(${list})::after,\n  :root:is(${list}) .cover::after {`;
}

function replaceBetween(text, start, end, inner) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`Markeringarna ${start} och ${end} saknas i ${CSS}`);
  // Markeringen för slutet behåller sitt indrag.
  return text.slice(0, a + start.length) + '\n' + inner + '\n' + text.slice(text.lastIndexOf('\n', b) + 1);
}

/** Hela style.css som den ska se ut. */
export function styleCss(css, categories) {
  return replaceBetween(replaceBetween(css, START, END, coverCss(categories)), LONG_START, LONG_END, longGlyphCss(categories));
}

// En kategori per rad, som filen alltid har sett ut.
export function categoriesJson(categories) {
  const oneLine = (c) => JSON.stringify(c, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  return `[\n${categories.map((c) => '  ' + oneLine(c)).join(',\n')}\n]\n`;
}

/** categories.json med rätt antal låtar. */
export function withSongCounts(categories, readSongs) {
  return categories.map((c) => ({ ...c, songs: readSongs(c.file).length }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const categories = withSongCounts(JSON.parse(read(CATEGORIES)), (file) => JSON.parse(read('data/' + file)));
  writeFileSync(path(CATEGORIES), categoriesJson(categories));
  writeFileSync(path(CSS), styleCss(read(CSS), categories));
  console.log(`Skrev ${CATEGORIES} och ${CSS} för ${categories.length} kategorier.`);
}
