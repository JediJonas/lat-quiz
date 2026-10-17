// Vinnarlåten: först en trumvirvel, sedan ett Deezer-klipp som spelas hos spelledaren när vinnarvyn tar över.
// Låten slumpas ur en handplockad lista, och samma låt spelas inte två gånger i rad.
// Med Spotify som musiktjänst spelas bara trumvirveln, eftersom Spotify bara kan öppnas med ett klick.
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
const DRUM_URL = 'ljud/trumvirvel.mp3';
const DRUM_MS = 4000; // trumvirvelns längd, lika lång som texten innan vinnaren visas
const EARLY_MS = 1000; // låten börjar så här länge innan trumvirveln slutar
const QUIET = 0.25; // låtens volym när den börjar under trumvirveln

// En slumpad låt, men inte samma som förra gången.
export function pickWinnerSong(random = Math.random, last = null) {
  const choices = WINNER_SONGS.filter((s) => s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

export function createWinnerSong() {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar

  let started = false; // låten har börjat, under trumvirveln eller när vinnaren visas

  const clear = () => { timers.forEach(clearInterval); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    started = false;
    if (audio) audio.pause();
    if (drumAudio) drumAudio.pause();
  }

  let drumAudio = null;

  // Trumvirveln medan texten innan vinnaren visas. Den är lika lång som texten, fyra sekunder.
  // Klippet är ljud 111653 av bigjoedrummer på Freesound (CC0), kortat till den första virveln.
  // Låten börjar svagt under virvelns sista sekund. song: false när ingen låt ska följa,
  // till exempel med Spotify som musiktjänst.
  function drum({ song = true } = {}) {
    if (song) prepare(); else stop();
    if (!drumAudio) drumAudio = new Audio(DRUM_URL);
    drumAudio.currentTime = 0;
    drumAudio.volume = VOLUME;
    drumAudio.play().catch(() => {});
    if (song) timers.push(setTimeout(() => start(QUIET), DRUM_MS - EARLY_MS));
  }

  let prepared = null; // klipplänken, som hämtas medan texten innan vinnaren visas

  // Texten innan vinnaren visas. Klippet hämtas redan nu, så att låten startar direkt.
  function prepare() {
    stop();
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    prepared = findPreview(song).catch(() => null);
  }

  // Vinnarvyn har tagit över. Har låten inte börjat under trumvirveln, börjar den nu.
  function play() {
    if (!prepared) prepare();
    start(VOLUME);
  }

  // Låten börjar på volume och växer till full volym på EARLY_MS. Efter PLAY_MS tonar den ut.
  async function start(volume) {
    if (started) return;
    started = true;
    const turn = playing;
    const url = await prepared;
    if (!url || turn !== playing) return;
    if (!audio) audio = new Audio();
    audio.src = url;
    audio.volume = volume;
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud, blir det bara tyst.
    audio.play().catch(() => {});
    const begin = Date.now();
    if (volume < VOLUME) {
      const up = setInterval(() => {
        const part = Math.min(1, (Date.now() - begin) / EARLY_MS);
        audio.volume = volume + (VOLUME - volume) * part;
        if (part >= 1) clearInterval(up);
      }, 100);
      timers.push(up);
    }
    // Låten tonar ut i små steg och stannar sedan.
    timers.push(setTimeout(() => {
      const fadeStart = Date.now();
      timers.push(setInterval(() => {
        const left = 1 - (Date.now() - fadeStart) / FADE_MS;
        if (left <= 0) { stop(); return; }
        audio.volume = VOLUME * left;
      }, 100));
    }, PLAY_MS));
  }

  return { drum, play, stop };
}
