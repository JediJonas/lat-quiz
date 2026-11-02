// @ts-check
// En liten HTML-hjälp som escapar själv. Allt som stoppas in i html`…` blir text, så att ett namn
// som <b>Anna</b> visas som det står. HTML som redan är byggd med html`…`, eller som uttryckligen
// märks med raw(), stoppas in som den är. Listor fogas ihop, och null, undefined och false blir
// ingenting, så att villkor kan skrivas som ${winner && html`…`}.
import { esc } from './dom.js';

/** Färdig HTML, som inte escapas igen. */
export class Html {
  /** @param {string} value */
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/**
 * Märker en sträng som färdig HTML. Bara för HTML som koden själv har byggt.
 * @param {string} value
 */
export const raw = (value) => new Html(value);

/** @param {unknown} value @returns {string} */
function part(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(part).join('');
  return esc(value);
}

/**
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += part(value) + strings[i + 1]; });
  return new Html(out);
}

/** Fogar ihop delar till en HTML, med samma regler som i html`…`. @param {...unknown} parts */
export const join = (...parts) => new Html(parts.map(part).join(''));
