// @ts-check
// Små hjälpfunktioner för sidorna.

/**
 * Första elementet som matchar, eller null.
 * @param {string} selector
 * @returns {any}
 */
export const $ = (selector) => document.querySelector(selector);

/**
 * Gör text säker att lägga i HTML, så att ett namn som <b>Anna</b> visas som text.
 * @param {unknown} text
 */
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
