// @ts-check
// Väntemusiken och vinnarlåten i spelarens mobil, i webbläsarens ljudmotor (Web Audio), så att de
// kan tonas även på iPhone, precis som hos spelledaren. Quizlåten och trumvirveln spelas som förut
// i ljudelementet i clip-player.js, och dit går även musiken när ljudmotorn inte kan spela den.
// Varje klipp spelas hela tiden på samma sätt. Det byter aldrig mitt i, eftersom det då blir ett
// hopp eller en kort tystnad, och iPhone ofta vägrar starta ett ljud medan ett annat spelar.
import { wait } from '../shared/wait.js';
import { loadToEngine } from './engine-clip.js';

// Så långt får klippet glida från spelledarens innan det startas om på rätt ställe, som i clip-player.js.
const DRIFT_S = 0.4;
// Så länge klippet väntar på att ljudmotorn ska starta igen, som hos spelledaren.
const RESUME_MS = 500;

// Var i klippet ljudmotorn är, i sekunder. Väntemusiken loopar.
/** @param {{ startAt: number, offset: number, loop: boolean, duration: number }} playing @param {number} now */
export function enginePosition(playing, now) {
  const pos = playing.offset + now - playing.startAt;
  return playing.loop && playing.duration ? pos % playing.duration : pos;
}

// Musik som ska tonas, det vill säga väntemusiken och vinnarlåten men inte trumvirveln.
/** @param {{ fadeInMs: number, fadeOutMs: number } | null | undefined} music */
export const fades = (music) => Boolean(music && (music.fadeInMs || music.fadeOutMs));

// onChange: ett klipp har fått sitt sätt att spelas, så att clip-player.js kan börja spela det.
export function createMusicEngine({ onChange }) {
  let ctx = null;
  // Hur varje klipp spelas: 'engine' eller 'element'. Saknas klippet bestäms det fortfarande.
  const choices = new Map();
  const buffers = new Map();
  let playing = null; // { url, source, gain, startAt, offset, loop, duration }

  // Anropas vid spelarens tryck, men inte medan quizlåten spelas, se clip-player.js.
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
    if (!ctx || ctx.state === 'running') return Promise.resolve();
    return Promise.race([ctx.resume().catch(() => {}), wait(RESUME_MS)]);
  }

  // Hur klippet ska spelas, eller undefined medan det bestäms. Har inget tryck startat ljudmotorn
  // spelas klippet som vanligt ljud.
  /** @param {string} url @returns {'engine' | 'element' | undefined} */
  const choice = (url) => (ctx ? choices.get(url) : 'element');

  // Hämtar klippet till ljudmotorn och bestämmer hur det spelas. Svaret kommer när det är bestämt.
  /** @param {string} url */
  async function choose(url) {
    if (!ctx || choices.has(url)) return;
    choices.set(url, undefined);
    const loaded = await loadToEngine(ctx, url);
    await resume();
    const works = 'buffer' in loaded && ctx.state === 'running';
    if (works) buffers.set(url, loaded.buffer);
    choices.set(url, works ? 'engine' : 'element');
    onChange();
  }

  function stop() {
    if (!playing) return;
    try { playing.source.stop(); } catch { /* redan stoppad */ }
    playing = null;
  }

  // Medan quizlåten spelas vilar ljudmotorn, så att klippet är det enda ljud sidan har igång,
  // som hos spelledaren. Annars kan iPhone stanna upp klippet när tangentbordet öppnas.
  function rest() {
    stop();
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }

  /** @param {string} url @param {number} pos @param {boolean} loop */
  function start(url, pos, loop) {
    const buffer = buffers.get(url);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain).connect(ctx.destination);
    const offset = loop ? pos % buffer.duration : pos;
    source.start(0, offset);
    playing = { url, source, gain, startAt: ctx.currentTime, offset, loop, duration: buffer.duration };
  }

  // Spelar klippet på pos sekunder, eller fortsätter om det redan spelar nära där. Sant om det
  // spelas i ljudmotorn. Står motorn still, till exempel efter quizlåten, startas den igen, och går
  // den inte efter en kort stund spelas klippet som vanligt ljud.
  /** @param {string} url @param {number} pos @param {boolean} loop */
  function play(url, pos, loop) {
    if (choice(url) !== 'engine') return false;
    if (ctx.state !== 'running') {
      resume().then(() => {
        if (ctx.state === 'running' || choices.get(url) !== 'engine') return;
        choices.set(url, 'element');
        onChange();
      });
      return true;
    }
    const buffer = buffers.get(url);
    if (!loop && pos >= buffer.duration) { stop(); return true; }
    const near = playing && playing.url === url
      && Math.abs(enginePosition(playing, ctx.currentTime) - (loop ? pos % buffer.duration : pos)) <= DRIFT_S;
    if (!near) { stop(); start(url, pos, loop); }
    return true;
  }

  // Volymen just nu, med samma toning som hos spelledaren. Ljudmotorn kan spela starkare än 1.
  /** @param {(pos: number, duration: number) => number} volumeAt */
  function setVolume(volumeAt) {
    if (!playing) return;
    const pos = enginePosition(playing, ctx.currentTime);
    playing.gain.gain.setValueAtTime(volumeAt(pos, playing.duration), ctx.currentTime);
  }

  return { unlock, choice, choose, play, stop, rest, setVolume, playing: () => Boolean(playing) };
}
