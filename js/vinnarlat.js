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
const DRUM_MS = 4000; // trumvirvelns längd, lika lång som texten innan vinnaren visas
const EARLY_MS = 500; // låten börjar så här länge innan trumvirveln slutar
const QUIET = 0.25; // låtens volym när den börjar under trumvirveln

// En slumpad låt, men inte samma som förra gången.
export function pickWinnerSong(random = Math.random, last = null) {
  const choices = WINNER_SONGS.filter((s) => s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Volymen under uttoningen. left går från 1 till 0. Volymen sänks efter en kurva, eftersom örat
// uppfattar en jämn sänkning som att låten är stark länge och sedan tystnar tvärt.
const fadeLevel = (left) => VOLUME * Math.max(0, left) ** 3;

// onChange: anropas när status ändras, så att spelledaren kan se om låten spelas.
export function createWinnerSong({ onChange = () => {} } = {}) {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let started = false; // låten har börjat, under trumvirveln eller när vinnaren visas
  // Hur det gick: null innan låten startar, 'playing', 'missing' (inget klipp hos Deezer)
  // eller 'blocked' (webbläsaren spelade inte klippet).
  let status = null;
  const setStatus = (value) => { status = value; onChange(); };
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


  // Trumvirveln medan texten innan vinnaren visas. Den är lika lång som texten, fyra sekunder.
  // Klippet är ljud 111653 av bigjoedrummer på Freesound (CC0), kortat till den första virveln.
  // Låten börjar svagt under virvelns sista halva sekund. clip: false med Spotify som musiktjänst.
  // Då slumpas bara låten, och inget Deezer-klipp hämtas eller spelas.
  function drum({ clip = true } = {}) {
    prepare({ clip });
    if (!drumAudio) drumAudio = new Audio();
    drumAudio.src = DRUM_URL;
    drumAudio.volume = VOLUME;
    drumAudio.play().catch(() => {});
    if (clip) timers.push(setTimeout(() => start(QUIET), DRUM_MS - EARLY_MS));
  }

  let prepared = null; // klippet, som hämtas medan texten innan vinnaren visas
  let current = null; // den slumpade låten, för Spela vinnarlåt med Spotify

  // Texten innan vinnaren visas. Klippet hämtas redan nu, så att låten startar direkt.
  function prepare({ clip = true } = {}) {
    stop();
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    current = song;
    status = null;
    if (clip) prepared = findPreview(song).then(load).catch(() => null);
  }

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ett ljudelement.
  async function load(url) {
    if (!url) return null;
    if (!ctx) return { url };
    try {
      const res = await fetch(url);
      if (!res.ok) return { url };
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      return { url, buffer };
    } catch {
      return { url };
    }
  }

  // Vinnarvyn har tagit över. Har låten inte börjat under trumvirveln, börjar den nu.
  function play() {
    if (!prepared) prepare();
    start(VOLUME);
  }

  // Låten börjar på volume och växer till full volym på EARLY_MS. Sist tonar den ut under FADE_MS.
  async function start(volume) {
    if (started) return;
    started = true;
    const turn = playing;
    const clip = await prepared;
    if (turn !== playing) return;
    if (!clip) { setStatus('missing'); return; }
    if (clip.buffer && ctx && ctx.state === 'running') {
      startBuffer(clip.buffer, volume);
      setStatus('playing');
    } else startElement(clip.url, volume);
  }

  function startBuffer(buffer, volume) {
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const fade = Math.min(FADE_MS / 1000, buffer.duration / 2);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(VOLUME, now + EARLY_MS / 1000);
    const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49));
    gain.gain.setValueCurveAtTime(steps, now + buffer.duration - fade, fade);
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  function startElement(url, volume) {
    if (!audio) audio = new Audio();
    audio.src = url;
    audio.volume = volume;
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud, blir det bara tyst.
    audio.play().then(() => setStatus('playing'), () => setStatus('blocked'));
    const begin = Date.now();
    // Volymen växer först till full och sänks sedan när klippet närmar sig slutet.
    timers.push(setInterval(() => {
      const up = Math.min(1, (Date.now() - begin) / EARLY_MS);
      const left = audio.duration ? (audio.duration - audio.currentTime) * 1000 / FADE_MS : 1;
      if (audio.ended) { stop(); return; }
      audio.volume = Math.min(volume + (VOLUME - volume) * up, left < 1 ? fadeLevel(left) : VOLUME);
    }, 50));
  }

  return { drum, play, stop, unlock, current: () => current, status: () => status };
}
