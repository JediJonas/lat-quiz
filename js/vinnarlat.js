// Vinnarlåten: först en trumvirvel, sedan ett Deezer-klipp som spelas hos spelledaren när vinnarvyn tar över.
// Låten slumpas ur en handplockad lista, och samma låt spelas inte två gånger i rad.
// Med Spotify som musiktjänst slumpas låten också, men den öppnas i Spotify när spelledaren trycker
// på Spela vinnarlåt, eftersom Spotify bara kan öppnas med ett klick.
import { SILENCE, findPreview } from './deezer.js';

export const WINNER_SONGS = [
  { artist: 'Queen', title: 'We Are the Champions', deezerId: 4092339021, spotifyId: '1lCRw5FEZ1gPDNPzy1K4zW' },
  { artist: 'Kool & the Gang', title: 'Celebration', deezerId: 906583, spotifyId: '3K7Q9PHUWPTaknlbFPThn2' },
  { artist: 'ABBA', title: 'The Winner Takes It All', deezerId: 884035, spotifyId: '3oEkrIfXfSh9zGnE7eBzSV' },
  { artist: 'Survivor', title: 'Eye of the Tiger', deezerId: 576431, spotifyId: '2HHtWyy5CgaQbC7XSoOb0e' },
  { artist: 'Tina Turner', title: 'The Best', deezerId: 3142379, spotifyId: '4OeFQtRyT7vsLnRTv7t8YT' },
  { artist: 'Europe', title: 'The Final Countdown', deezerId: 565260, spotifyId: '3MrRksHupTVEQ7YbA0FsZK' },
  { artist: 'Queen', title: "Don't Stop Me Now", deezerId: 4092329741, spotifyId: '5T8EDUDqKcs6OSOwEsfqG7' },
  { artist: 'Pharrell Williams', title: 'Happy', deezerId: 701326562, spotifyId: '60nZcImufyMA1MKQY3dcCH' },
  { artist: 'Katrina & the Waves', title: 'Walking on Sunshine', deezerId: 3166724, spotifyId: '0PMxyLltr8XbHka7EcZZ6G' },
  { artist: 'Chumbawamba', title: 'Tubthumping', deezerId: 3154917, spotifyId: '22HYEJveCvykVDHDiEEmjZ' },
  { artist: 'DJ Khaled', title: 'All I Do Is Win', deezerId: 66022789, spotifyId: '5NEKjqTQPKiqOiOG8YxLdS' },
  { artist: 'Bill Conti', title: 'Gonna Fly Now', deezerId: 99127208, spotifyId: '5dulYd9AKIprMoF837OTDb' },
  { artist: 'The Pointer Sisters', title: "I'm So Excited", deezerId: 5404568, spotifyId: '1ot6jEe4w4hYnsOPjd3xKQ' },
  { artist: 'Måns Zelmerlöw', title: 'Heroes', deezerId: 95585876, spotifyId: '21BYhl07wWqGRQaj7sUxdV' },
];

// Hela klippet spelas, och de sista sekunderna tonar det ut.
const FADE_MS = 5000;
const VOLUME = 0.8;
const DRUM_URL = 'ljud/trumvirvel.mp3';
const DRUM_TAIL_S = 0.15; // tystnaden i slutet av trumvirveln

// En slumpad låt, men inte samma som förra gången.
export function pickWinnerSong(random = Math.random, last = null) {
  const choices = WINNER_SONGS.filter((s) => s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Volymen under uttoningen. left går från 1 till 0. Volymen sänks efter en kurva, eftersom örat
// uppfattar en jämn sänkning som att låten är stark länge och sedan tystnar tvärt.
const fadeLevel = (left) => VOLUME * Math.max(0, left) ** 3;

export function createWinnerSong() {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let started = false; // låten har börjat, under trumvirveln eller när vinnaren visas
  // På iPhone går det inte att ändra volymen på ett ljudelement. Därför spelas låten helst genom
  // webbläsarens ljudmotor, som kan tona. Den måste startas av ett tryck, se unlock.
  let ctx = null;
  let source = null;

  const clear = () => { timers.forEach(clearInterval); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    started = false;
    if (audio) audio.pause();
    if (drumAudio) drumAudio.pause();
    if (source) { try { source.stop(); } catch { /* redan stoppad */ } source = null; }
  }

  let drumAudio = null;

  // Ljudelementen spelar en kort tystnad vid ett tryck. Sedan låter iPhone dem spela utan tryck.
  const unlocked = new Set();
  function unlockElement(el) {
    if (unlocked.has(el) || !el.paused) return;
    el.src = SILENCE;
    el.play().then(() => unlocked.add(el), () => {});
  }

  // Anropas vid varje tryck hos spelledaren, så att ljudet får spela senare utan tryck.
  function unlock() {
    if (!audio) audio = new Audio();
    if (!drumAudio) drumAudio = new Audio();
    unlockElement(audio);
    unlockElement(drumAudio);
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!ctx) ctx = new Context();
    // Annars tystar iPhone ljudmotorn när ringsignalen är avstängd, men inte vanliga ljudelement.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }


  // Trumvirveln, som börjar två sekunder innan texten före vinnaren visas. Den är fyra sekunder.
  // Klippet är ljud 111653 av bigjoedrummer på Freesound (CC0), kortat till den första virveln.
  // clip: false med Spotify som musiktjänst. Då slumpas bara låten, och inget Deezer-klipp
  // hämtas eller spelas.
  function drum({ clip = true } = {}) {
    prepare({ clip });
    if (!drumAudio) drumAudio = new Audio();
    drumAudio.src = DRUM_URL;
    drumAudio.volume = VOLUME;
    drumAudio.play().catch(() => {});
  }

  let prepared = null; // klippet, som hämtas medan texten innan vinnaren visas
  let current = null; // den slumpade låten, för Spela vinnarlåt med Spotify

  // Texten innan vinnaren visas. Klippet hämtas redan nu, så att låten startar direkt.
  function prepare({ clip = true } = {}) {
    stop();
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    current = song;
    if (clip) prepared = findPreview(song).then(load).catch(() => null);
  }

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ett ljudelement.
  async function load(url) {
    if (!url) return null;
    try {
      if (!ctx) throw new Error('Ingen ljudmotor');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Inget svar');
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      return { url, buffer };
    } catch {
      preload(url);
      return { url };
    }
  }

  // Ljudelementet börjar ladda klippet medan trumvirveln spelar, så att låten startar direkt.
  function preload(url) {
    if (!audio) audio = new Audio();
    if (!audio.paused) return;
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
  }

  // Vinnarvyn har tagit över. Två klipp spelas aldrig samtidigt, eftersom iPhone då ofta vägrar
  // starta det andra. Spelar trumvirveln fortfarande börjar låten när den är slut.
  function play() {
    if (!prepared) prepare();
    if (drumAudio && !drumAudio.paused && !drumAudio.ended) whenDrumEnds(start);
    else start();
  }

  // Trumvirveln har en kort tystnad på slutet, så låten börjar när ljudet tar slut, inte filen.
  function whenDrumEnds(done) {
    let called = false;
    const turn = playing;
    const once = () => {
      if (called || turn !== playing) return;
      called = true;
      clearInterval(check);
      done();
    };
    const check = setInterval(() => {
      // Kunde trumvirveln inte spela börjar låten ändå.
      if (drumAudio.paused || (drumAudio.duration && drumAudio.duration - drumAudio.currentTime <= DRUM_TAIL_S)) once();
    }, 30);
    timers.push(check);
    drumAudio.addEventListener('ended', once, { once: true });
  }

  // Låten spelas på full volym och tonar ut under FADE_MS på slutet.
  async function start() {
    if (started) return;
    started = true;
    const turn = playing;
    const clip = await prepared;
    if (turn !== playing) return;
    if (!clip) return;
    if (clip.buffer && ctx && ctx.state === 'running') startBuffer(clip.buffer);
    else startElement(clip.url);
  }

  function startBuffer(buffer) {
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const fade = Math.min(FADE_MS / 1000, buffer.duration / 2);
    gain.gain.setValueAtTime(VOLUME, now);
    const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49));
    gain.gain.setValueCurveAtTime(steps, now + buffer.duration - fade, fade);
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  function startElement(url) {
    if (!audio) audio = new Audio();
    // Klippet är oftast redan laddat medan trumvirveln spelade.
    if (audio.src !== url) audio.src = url;
    audio.volume = VOLUME;
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud, blir det tyst.
    audio.play().catch(() => {});
    // Volymen sänks när klippet närmar sig slutet.
    timers.push(setInterval(() => {
      const left = audio.duration ? (audio.duration - audio.currentTime) * 1000 / FADE_MS : 1;
      if (audio.ended) { stop(); return; }
      audio.volume = left < 1 ? fadeLevel(left) : VOLUME;
    }, 50));
  }

  return { drum, play, stop, unlock, current: () => current };
}
