// @ts-check
// Slumpade id:n och koder.

const CODE_LENGTH = 4;
// Koden har bara versaler som inte går att förväxla med siffror (inget I eller O).
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Ett unikt id för en spelare eller spelledaren. @param {string} [prefix] */
export function newId(prefix = '') {
  return prefix + ((crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now());
}

/** En kod på fyra bokstäver, som spelarna skriver in för att gå med. @param {() => number} [random] */
export function newCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}
