// @ts-check
// Hämtar ett Deezer-klipp till webbläsarens ljudmotor (Web Audio), där väntemusiken och vinnarlåten
// kan tonas även på iPhone. Går det inte spelas klippet i ett vanligt ljudelement, som iPhone inte
// kan ändra volymen på. Därför sparas varför, så att det går att se med ?debug=1.
import { wait } from '../shared/wait.js';

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

// Så länge ett klipp väntar på att ljudmotorn ska starta igen.
const RESUME_MS = 500;

// Ljudmotorn för väntemusiken eller vinnarlåten. Spelledaren och spelarnas mobiler startar,
// väcker och vilar den på samma sätt, se 4.3 i projektbeskrivningen.
export function createAudioEngine() {
  let ctx = null;
  let resting = false;

  // Anropas vid ett tryck. Ljudmotorn får bara starta av ett tryck, och sedan väckas utan.
  function unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!ctx) ctx = new Context();
    // Annars tystar iPhone ljudmotorn när ringsignalen är avstängd, men inte vanliga ljudelement.
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  // Startar ljudmotorn om den står still. Svaret kommer när den går, eller efter en kort stund.
  function resume() {
    resting = false;
    if (!ctx || ctx.state === 'running') return Promise.resolve();
    return Promise.race([ctx.resume().catch(() => {}), wait(RESUME_MS)]);
  }

  // Medan quizlåten spelas vilar ljudmotorn, så att klippet är det enda ljud sidan har igång.
  // Annars kan iPhone stanna upp klippet en kort stund när tangentbordet öppnas för ett svar.
  function pause() {
    if (!ctx || ctx.state !== 'running') return;
    resting = true;
    ctx.suspend().catch(() => {});
  }

  // Efter quizlåten startas den igen, om den vilade. Det tillåter iPhone utan tryck, eftersom ett
  // tryck har startat den förut. Gör den inte det spelas ljudet med ljudelementet i stället.
  function wake() {
    if (resting) resume();
  }

  // Ljudmotorn, eller null innan något tryck har startat den.
  return { unlock, resume, pause, wake, context: () => ctx, running: () => Boolean(ctx && ctx.state === 'running') };
}
