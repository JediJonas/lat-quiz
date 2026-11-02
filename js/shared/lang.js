// @ts-check
// Texterna i appen. Varje text har en nyckel och står i språkfilen js/lang/sv.js, så att
// appen kan få fler språk. Koden skriver t('nyckel') i stället för texten.
//
// Värden sätts in med {namn}: t('message.left.title', { name: 'Anna' }) ger "Hej då, Anna!".
// En text som beror på värdena, till exempel på antalet, är en funktion i språkfilen och får
// värdena som argument. Ett test kontrollerar att varje nyckel som används finns, att ingen
// nyckel är oanvänd och att varje {namn} får ett värde.
import sv from '../lang/sv.js';

/** @typedef {string | string[] | ((values: Record<string, any>) => string)} Text */

/** @type {Record<string, Text>} */
const texts = sv;

/**
 * Texten för nyckeln, med värdena insatta.
 * @param {string} key
 * @param {Record<string, any>} [values]
 * @returns {string}
 */
export function t(key, values = {}) {
  const text = texts[key];
  if (text === undefined) {
    console.error(`Texten ${key} saknas i språkfilen`);
    return key;
  }
  if (typeof text === 'function') return text(values);
  if (Array.isArray(text)) return text.join(', ');
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

/**
 * En lista med texter, till exempel peppkommentarerna att välja bland.
 * @param {string} key
 * @returns {string[]}
 */
export function tList(key) {
  const list = texts[key];
  if (!Array.isArray(list)) {
    console.error(`Listan ${key} saknas i språkfilen`);
    return [key];
  }
  return list;
}
