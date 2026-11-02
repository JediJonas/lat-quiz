// Texterna i html-sidorna skrivs från språkfilen js/lang/sv.js, så att en text bara ändras där.
// Sidorna har kvar den svenska texten, så att de visas direkt utan att vänta på JavaScript.
//
// - data-t="nyckel" på ett element utan barn: texten i elementet. Blanksteg före och efter står kvar.
// - data-t-html="nyckel": elementets innehåll som HTML, till exempel med <br>.
// - data-t-<attribut>="nyckel": attributet, till exempel data-t-aria-label och data-t-content.
//
//   node tools/texts.mjs
//
// Ett test (test/texts.test.js) säger till om verktyget behöver köras eller om en text i en sida
// saknar nyckel.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sv from '../js/lang/sv.js';

const root = new URL('../', import.meta.url);
const path = (file) => fileURLToPath(new URL(file, root));
export const PAGES = ['index.html', 'host.html', 'play.html'];

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

function lookup(texts, key) {
  const text = texts[key];
  if (typeof text !== 'string') throw new Error(`Texten ${key} saknas i språkfilen, eller är inte en vanlig text`);
  return text;
}

/** Sidan med texterna från språkfilen. */
export function withTexts(html, texts = sv) {
  // Attributen: data-t-aria-label="nyckel" skriver aria-label i samma tagg.
  html = html.replace(/<[a-z][^>]*\sdata-t-(?!html=)[a-z-]+="[^"]*"[^>]*>/g, (tag) => {
    for (const [, attr, key] of [...tag.matchAll(/\sdata-t-(?!html=)([a-z-]+)="([^"]+)"/g)]) {
      const re = new RegExp(`(\\s${attr}=")[^"]*(")`);
      if (!re.test(tag)) throw new Error(`${attr} saknas i ${tag}`);
      tag = tag.replace(re, `$1${escAttr(lookup(texts, key))}$2`);
    }
    return tag;
  });
  // Innehållet: texten i ett element utan barn, eller HTML med data-t-html.
  return html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-t(-html)?="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (match, open, tag, isHtml, key, inner, close) => {
      const text = lookup(texts, key);
      if (isHtml) return open + text + close;
      if (inner.includes('<')) throw new Error(`Elementet med ${key} har barn. Använd data-t-html.`);
      const [, before, , after] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return open + before + escText(text) + after + close;
    });
}

// Attribut som läses eller visas och därför ska ha en nyckel.
const READ_ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
// Text som får stå utan nyckel: namn och tecken som är samma på alla språk.
const ALLOWED = new Set(['Deezer', '×']);
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'area', 'base', 'col', 'embed', 'wbr']);

/** Texter och attribut i sidan som inte kommer från språkfilen. Kategorierna i hyllan räknas inte. */
export function untranslated(html) {
  const found = [];
  const body = html.replace(/<!doctype[^>]*>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-z0-9]+)\b([^>]*)>|([^<]+)/g)) {
    const [, closing, tag, attrs, text] = m;
    const covered = stack.some((s) => s.covered);
    if (text !== undefined) {
      const clean = text.trim();
      if (clean && /\p{L}/u.test(clean) && !covered && !ALLOWED.has(clean)) found.push(clean);
      continue;
    }
    if (closing) {
      while (stack.length && stack.pop().tag !== tag);
      continue;
    }
    for (const attr of READ_ATTRS) {
      if (new RegExp(`\\s${attr}="[^"]*\\p{L}`, 'u').test(attrs) && !new RegExp(`\\sdata-t-${attr}="`).test(attrs)) {
        found.push(`${attr} i <${tag}${attrs}>`);
      }
    }
    if (tag === 'meta' && /name="description"/.test(attrs) && !/data-t-content=/.test(attrs)) found.push('<meta name="description">');
    if (VOID.has(tag)) continue;
    stack.push({ tag, covered: /\sdata-t(-html)?="/.test(attrs) || /class="(tile|shelf-row)"/.test(attrs) });
  }
  return found;
}

/** Nycklarna som sidorna använder. */
export function pageKeys(html) {
  return [...html.matchAll(/\sdata-t(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const page of PAGES) writeFileSync(path(page), withTexts(readFileSync(path(page), 'utf8')));
  console.log(`Skrev texterna i ${PAGES.join(', ')}.`);
}
