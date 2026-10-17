// Vinnarlåten: först en trumvirvel eller en fanfar och en cymbal, sedan ett Deezer-klipp som spelas hos
// spelledaren när vinnarvyn tar över.
// Låten slumpas ur en handplockad lista, och samma låt spelas inte två gånger i rad.
// Klippen kräver inget konto, så de spelas även när spelledaren har valt Spotify.
import { findPreview } from './deezer.js';

export const WINNER_SONGS = [
  { artist: 'Queen', title: 'We Are the Champions', deezerId: 4092339021 },
  { artist: 'Kool & the Gang', title: 'Celebration', deezerId: 906583 },
  { artist: 'ABBA', title: 'The Winner Takes It All', deezerId: 884035 },
  { artist: 'Survivor', title: 'Eye of the Tiger', deezerId: 576431 },
  { artist: 'Tina Turner', title: 'The Best', deezerId: 3142379 },
  { artist: 'Europe', title: 'The Final Countdown', deezerId: 565260 },
  { artist: 'Queen', title: "Don't Stop Me Now", deezerId: 4092329741 },
  { artist: 'Pharrell Williams', title: 'Happy', deezerId: 701326562 },
  { artist: 'Katrina & the Waves', title: 'Walking on Sunshine', deezerId: 3166724 },
  { artist: 'Chumbawamba', title: 'Tubthumping', deezerId: 3154917 },
  { artist: 'DJ Khaled', title: 'All I Do Is Win', deezerId: 66022789 },
  { artist: 'Bill Conti', title: 'Gonna Fly Now', deezerId: 99127208 },
  { artist: 'The Pointer Sisters', title: "I'm So Excited", deezerId: 5404568 },
  { artist: 'Måns Zelmerlöw', title: 'Heroes', deezerId: 95585876 },
];

// Så länge låten spelas innan den tonar ut, och hur lång uttoningen är.
const PLAY_MS = 15000;
const FADE_MS = 2500;
const VOLUME = 0.8;

// En slumpad låt, men inte samma som förra gången.
export function pickWinnerSong(random = Math.random, last = null) {
  const choices = WINNER_SONGS.filter((s) => s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Trumvirveln, fanfaren och cymbalen skapas med Web Audio, så att inga ljudfiler behövs.
// Virveln är korta brusslag som blir starkare, och cymbalen är brus som klingar av, med en
// dov bastrumma under.
const ROLL_HITS_PER_S = 22;
// Fanfaren: MIDI-ton, start och längd i sekunder. G, G, G, C, sedan E, G och ett långt C.
const FANFARE = [
  [67, 0, 0.12], [67, 0.15, 0.12], [67, 0.3, 0.12], [72, 0.45, 0.5],
  [76, 1.0, 0.16], [79, 1.2, 0.16], [84, 1.4, 0.9],
  [60, 1.4, 0.9], [64, 1.4, 0.9],
];

function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noiseHit(ctx, out, noise, { at, peak, decay, filter, freq }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  src.connect(shape).connect(gain).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + decay + 0.05);
}

export function createWinnerSong() {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let ctx = null;
  let noise = null;
  let master = null; // trummornas volym, som stängs av vid stopp
  let prepared = null; // klipplänken som hämtas medan trummorna spelar

  const clear = () => { timers.forEach(clearInterval); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    if (audio) audio.pause();
    if (master) { master.disconnect(); master = null; }
  }

  // Ljudet i webbläsaren, eller null om det saknas.
  function sound() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) { ctx = new Ctx(); noise = noiseBuffer(ctx); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    return ctx;
  }

  function prepare() {
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    prepared = findPreview(song).catch(() => null);
  }

  // En trumvirvel eller en fanfar, slumpat, medan "Vi har en vinnare!" visas.
  // Klippet hämtas under tiden.
  function drum(ms) {
    stop();
    prepare();
    if (!sound()) return;
    if (Math.random() < 0.5) fanfare(); else roll(ms);
  }

  function roll(ms) {
    const start = ctx.currentTime + 0.05;
    const hits = Math.floor((ms / 1000) * ROLL_HITS_PER_S);
    for (let i = 0; i < hits; i += 1) {
      const at = start + i / ROLL_HITS_PER_S + (Math.random() - 0.5) * 0.006;
      const peak = 0.25 + 1.4 * (i / hits) ** 1.6 + Math.random() * 0.1;
      noiseHit(ctx, master, noise, { at, peak, decay: 0.07, filter: 'bandpass', freq: 1800 });
    }
  }

  // En kort fanfar som trumpeter: ta-ta-ta-taaa, ta-ta-taaaa, i C-dur.
  function fanfare() {
    const start = ctx.currentTime + 0.05;
    for (const [note, at, length] of FANFARE) brass(440 * 2 ** ((note - 69) / 12), start + at, length);
  }

  function brass(freq, at, length) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.985, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.04);
    // Klangen öppnar sig när tonen ansätts, som när man blåser i en trumpet.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(900, at);
    tone.frequency.exponentialRampToValueAtTime(2600, at + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.26, at + 0.03);
    gain.gain.setValueAtTime(0.2, at + Math.max(0.04, length - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(tone).connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  // Cymbalen och bastrumman när namnet visas.
  function crash() {
    const out = master || (sound() && master);
    if (!out) return;
    const at = ctx.currentTime + 0.01;
    noiseHit(ctx, out, noise, { at, peak: 0.5, decay: 1.8, filter: 'highpass', freq: 5000 });
    const kick = ctx.createOscillator();
    const gain = ctx.createGain();
    kick.frequency.setValueAtTime(130, at);
    kick.frequency.exponentialRampToValueAtTime(40, at + 0.3);
    gain.gain.setValueAtTime(0.45, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    kick.connect(gain).connect(out);
    kick.start(at);
    kick.stop(at + 0.45);
  }

  // Namnet visas: cymbalen slår och vinnarlåten börjar.
  async function play() {
    if (!prepared) { stop(); prepare(); }
    const turn = playing;
    crash();
    const url = await prepared;
    if (!url || turn !== playing) return;
    if (!audio) audio = new Audio();
    audio.src = url;
    audio.volume = VOLUME;
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud, blir det bara tyst.
    audio.play().catch(() => {});
    // Låten tonar ut i små steg och stannar sedan.
    timers.push(setTimeout(() => {
      const start = Date.now();
      timers.push(setInterval(() => {
        const left = 1 - (Date.now() - start) / FADE_MS;
        if (left <= 0) { stop(); return; }
        audio.volume = VOLUME * left;
      }, 100));
    }, PLAY_MS));
  }

  return { drum, play, stop };
}
