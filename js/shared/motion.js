// @ts-check
// Slump och minskad rörelse, som animationerna delar: säsongens bakgrund och vinstanimationen.

/** Ett slumpat tal från min till max. @param {number} min @param {number} max */
export const randomBetween = (min, max) => min + Math.random() * (max - min);

/** En slumpad sak ur listan. @template T @param {T[]} list @returns {T} */
export const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

/** Sant när enheten vill ha minskad rörelse. Då står animationerna still. */
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
