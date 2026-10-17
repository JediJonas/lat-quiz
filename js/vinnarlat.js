// Vinnarlåten: ett Deezer-klipp som spelas hos spelledaren när vinnarvyn tar över.
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

export function createWinnerSong() {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar

  const clear = () => { timers.forEach(clearInterval); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    if (audio) audio.pause();
  }

  let prepared = null; // klipplänken, som hämtas medan texten innan vinnaren visas

  // Texten innan vinnaren visas. Klippet hämtas redan nu, så att låten startar direkt.
  function prepare() {
    stop();
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    prepared = findPreview(song).catch(() => null);
  }

  async function play() {
    if (!prepared) prepare();
    const turn = playing;
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

  return { prepare, play, stop };
}
