// @ts-check
// Hämtar ett Deezer-klipp till webbläsarens ljudmotor (Web Audio), där väntemusiken och vinnarlåten
// kan tonas även på iPhone. Går det inte spelas klippet i ett vanligt ljudelement, som iPhone inte
// kan ändra volymen på. Därför sparas varför, så att det går att se med ?debug=1.

/**
 * @param {{ decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> } | null} ctx ljudmotorn, eller null före första trycket
 * @param {string} url klipplänken
 * @param {(url: string) => Promise<{ ok: boolean, status: number, arrayBuffer(): Promise<ArrayBuffer> }>} [get] fetch
 * @returns {Promise<{ buffer: AudioBuffer } | { why: string }>}
 */
export async function loadToEngine(ctx, url, get = (u) => fetch(u)) {
  if (!ctx) return { why: 'no audio engine, no tap yet' };
  let res;
  try {
    res = await get(url);
  } catch {
    // fetch säger inte varför, men oftast är det att Deezer inte tillåter hämtningen (CORS).
    return { why: 'fetch was refused, probably by Deezer (CORS)' };
  }
  if (!res.ok) return { why: `Deezer answered ${res.status}` };
  try {
    return { buffer: await ctx.decodeAudioData(await res.arrayBuffer()) };
  } catch {
    return { why: 'clip could not be decoded' };
  }
}

// Varför klippet spelas som vanligt ljud när det fanns i ljudmotorn: motorn gick inte.
/** @param {{ state: string } | null} ctx */
export const engineStopped = (ctx) => `audio engine was ${ctx ? ctx.state : 'gone'}`;
