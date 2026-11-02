// @ts-check
// Väntemusiken och vinnarlåten i spelarens mobil, i webbläsarens ljudmotor (Web Audio), så att de
// kan tonas även på iPhone, precis som hos spelledaren. Quizlåten och trumvirveln spelas som förut
// i ljudelementet i clip-player.js, och dit går även musiken när ljudmotorn inte kan spela den.
// Varje klipp spelas hela tiden på samma sätt. Det byter aldrig mitt i, eftersom det då blir ett
// hopp eller en kort tystnad, och iPhone ofta vägrar starta ett ljud medan ett annat spelar.
import { createAudioEngine, loadToEngine } from './engine-clip.js';
import { fadeOutCurve } from './audio-level.js';

// Så långt får klippet glida från spelledarens innan det startas om på rätt ställe, som i clip-player.js.
const DRIFT_S = 0.4;

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
  const engine = createAudioEngine();
  // Hur varje klipp spelas: 'engine' eller 'element'. Saknas klippet bestäms det fortfarande.
  const choices = new Map();
  const buffers = new Map();
  let playing = null; // { url, source, gain, volume, startAt, offset, loop, duration }
  let fadingUntil = 0; // när uttoningen efter väntemusiken är klar, se fadeOut
  let restTimer = null;

  // Hur klippet ska spelas, eller undefined medan det bestäms. Har inget tryck startat ljudmotorn
  // spelas klippet som vanligt ljud.
  /** @param {string} url @returns {'engine' | 'element' | undefined} */
  const choice = (url) => (engine.context() ? choices.get(url) : 'element');

  // Hämtar klippet till ljudmotorn och bestämmer hur det spelas. Svaret kommer när det är bestämt.
  /** @param {string} url */
  async function choose(url) {
    if (!engine.context() || choices.has(url)) return;
    choices.set(url, undefined);
    const loaded = await loadToEngine(engine.context(), url);
    await engine.resume();
    const works = 'buffer' in loaded && engine.running();
    if (works) buffers.set(url, loaded.buffer);
    choices.set(url, works ? 'engine' : 'element');
    onChange();
  }

  function stop() {
    if (!playing) return;
    try { playing.source.stop(); } catch { /* redan stoppad */ }
    playing = null;
  }

  // Tonar ut klippet under ms och stoppar det, som spelledaren gör med väntemusiken när spelet
  // startar. Spelledaren slutar då skicka musiken direkt, så mobilen tonar ut på egen hand.
  /** @param {number} ms */
  function fadeOut(ms) {
    if (!playing) return;
    const now = engine.context().currentTime;
    const { gain, source, volume } = playing;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueCurveAtTime(fadeOutCurve(volume), now, ms / 1000);
    try { source.stop(now + ms / 1000); } catch { /* redan stoppad */ }
    playing = null;
    fadingUntil = Date.now() + ms;
  }

  // Medan quizlåten spelas vilar ljudmotorn, som hos spelledaren, se engine-clip.js. Tonar
  // väntemusiken fortfarande ut vilar motorn först när den är tyst.
  function rest() {
    stop();
    clearTimeout(restTimer);
    const left = fadingUntil - Date.now();
    if (left > 0) restTimer = setTimeout(engine.pause, left);
    else engine.pause();
  }

  /** @param {string} url @param {number} pos @param {boolean} loop */
  function start(url, pos, loop) {
    const ctx = engine.context();
    const buffer = buffers.get(url);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain).connect(ctx.destination);
    const offset = loop ? pos % buffer.duration : pos;
    source.start(0, offset);
    playing = { url, source, gain, volume: 0, startAt: ctx.currentTime, offset, loop, duration: buffer.duration };
  }

  // Spelar klippet på pos sekunder, eller fortsätter om det redan spelar nära där. Sant om det
  // spelas i ljudmotorn. Står motorn still, till exempel efter quizlåten, startas den igen, och går
  // den inte efter en kort stund spelas klippet som vanligt ljud.
  /** @param {string} url @param {number} pos @param {boolean} loop */
  function play(url, pos, loop) {
    if (choice(url) !== 'engine') return false;
    if (!engine.running()) {
      engine.resume().then(() => {
        if (engine.running() || choices.get(url) !== 'engine') return;
        choices.set(url, 'element');
        onChange();
      });
      return true;
    }
    const buffer = buffers.get(url);
    if (!loop && pos >= buffer.duration) { stop(); return true; }
    const near = playing && playing.url === url
      && Math.abs(enginePosition(playing, engine.context().currentTime) - (loop ? pos % buffer.duration : pos)) <= DRIFT_S;
    clearTimeout(restTimer);
    if (!near) { stop(); start(url, pos, loop); }
    return true;
  }

  // Volymen just nu, med samma toning som hos spelledaren. Ljudmotorn kan spela starkare än 1.
  /** @param {(pos: number, duration: number) => number} volumeAt */
  function setVolume(volumeAt) {
    if (!playing) return;
    const now = engine.context().currentTime;
    playing.volume = volumeAt(enginePosition(playing, now), playing.duration);
    playing.gain.gain.setValueAtTime(playing.volume, now);
  }

  return { unlock: engine.unlock, choice, choose, play, stop, fadeOut, rest, setVolume, playing: () => Boolean(playing) };
}
