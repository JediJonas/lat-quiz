// @ts-check
// All lagring i webbläsaren går genom den här modulen, så att varje nyckel och varje
// migrering av gamla nycklar finns på ett ställe. localStorage kan saknas eller vägra, till
// exempel i privat läge, och då gäller standardvärdet och inget sparas.

/** Alla nycklar som appen sparar under. Namnen ändras inte, så att sparade val finns kvar. */
export const KEYS = {
  hostGame: 'latquiz-host', // spelledarens pågående spel
  player: 'latquiz-player', // spelarens namn, id och kod
  hostName: 'latquiz-namn', // namnet som spelledaren deltar med
  settings: 'latquiz-settings', // senaste Tid per låt, bonus och poänggräns
  clipAll: 'latquiz-klipp-alla', // Spela ljud på alla enheter
  extraSounds: 'latquiz-extraljud', // Spela extraljud, '0' när det är av
  audioDelay: 'latquiz-ljudfordrojning', // Ljudsynk i millisekunder
  unknown: 'latquiz-okanda', // okända låtar per kategori
  showUnknown: 'latquiz-visa-okanda', // ?okanda=1
  theme: 'latquiz-tema', // läses också av skriptet i <head> på varje sida
  text: 'latquiz-text', // Stor text, läses också i <head>
  debug: 'latquiz-debug', // ?debug=1, läses i <head>
};

// Nycklar från val som inte finns längre. De tas bort när sidan läses in.
// Spela vinnarlåt och Spela väntemusik blev Spela extraljud (18 oktober 2026), och valet av
// musiktjänst försvann med Spotify (23 oktober 2026). Listan kan tömmas efter 1 februari 2027.
const OLD_KEYS = ['latquiz-vinnarlat', 'latquiz-vantemusik', 'latquiz-musik'];

/**
 * Kör fn och returnerar fallback om lagringen inte går att nå.
 * @template T
 * @param {() => T} fn
 * @param {T} [fallback]
 * @returns {T}
 */
function safely(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** @param {string} key @returns {string | null} */
export function readText(key) {
  return safely(() => localStorage.getItem(key), null);
}

/** Sparar texten, eller tar bort nyckeln när value är null. @param {string} key @param {string | null} value */
export function writeText(key, value) {
  safely(() => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)));
}

/**
 * @template T
 * @param {string} key
 * @param {T} fallback värdet när inget är sparat eller det inte går att läsa
 * @returns {T}
 */
export function readJson(key, fallback) {
  const value = safely(() => JSON.parse(localStorage.getItem(key)), null);
  return value ?? fallback;
}

/** @param {string} key @param {unknown} value */
export function writeJson(key, value) {
  safely(() => localStorage.setItem(key, JSON.stringify(value)));
}

/** @param {string} key */
export function remove(key) {
  safely(() => localStorage.removeItem(key));
}

// Gamla nycklar tas bort en gång per sidvisning, när modulen läses in.
for (const key of OLD_KEYS) remove(key);
