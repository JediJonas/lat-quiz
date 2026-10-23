// Vinnarlåten: först ett kort ljud, till exempel en trumvirvel, sedan ett Deezer-klipp som spelas hos spelledaren när vinnarvyn tar över.
// Låten slumpas ur en handplockad lista, och samma låt spelas inte två gånger i rad.
import { SILENCE, findPreview } from './deezer.js';
import { levelGain } from './ljudniva.js';

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
  { artist: 'Bill Conti', title: 'Gonna Fly Now', deezerId: 99127208 },
  { artist: 'The Pointer Sisters', title: "I'm So Excited", deezerId: 5404568 },
  { artist: 'Måns Zelmerlöw', title: 'Heroes', deezerId: 95585876 },
  { artist: 'Cliff Richard', title: 'Congratulations', deezerId: 3124130 },
  { artist: 'Loreen', title: 'Euphoria', deezerId: 67466760 },
  { artist: 'The Script', title: 'Hall of Fame', deezerId: 55848051 },
  { artist: 'Justin Timberlake', title: "Can't Stop the Feeling!", deezerId: 132635814 },
  { artist: 'Harold Faltermeyer & Steve Stevens', title: 'Top Gun Anthem', deezerId: 7675060 },
  { artist: 'Vangelis', title: 'Chariots of Fire', deezerId: 624844592 },
  { artist: 'P!nk', title: 'Raise Your Glass', deezerId: 15597831 },
  { artist: 'Bob Sinclar', title: 'Rock This Party (Everybody Dance Now)', deezerId: 2634178712 },
  { artist: 'Sean Banan', title: 'Sean den förste Banan', deezerId: 16334737 },
  { artist: 'Drake', title: 'Started From the Bottom', deezerId: 70697359 },
  { artist: "Destiny's Child", title: 'Survivor', deezerId: 5817089 },
  { artist: 'Sia', title: 'Unstoppable', deezerId: 117708444 },
  { artist: 'Katy Perry', title: 'Roar', deezerId: 71645431 },
  { artist: 'TIX', title: 'Tronen 2016', deezerId: 2968786651 },
  { artist: '2 Unlimited', title: 'Get Ready for This', deezerId: 131708868 },
  { artist: 'Calvin Harris & Alesso', title: 'Under Control', deezerId: 71294452 },
  { artist: 'Yves Larock', title: 'Rise Up', deezerId: 1855992137 },
  { artist: 'Joe "Bean" Esposito', title: "You're the Best", deezerId: 14113314 },
  { artist: 'Whitney Houston', title: 'I Wanna Dance with Somebody', deezerId: 75981528 },
  { artist: 'Flo Rida', title: 'Good Feeling', deezerId: 65232772 },
  { artist: 'Lionel Richie', title: 'Dancing on the Ceiling', deezerId: 905690 },
  { artist: 'American Authors', title: 'Best Day of My Life', deezerId: 75711295 },
  { artist: 'Bill Withers', title: 'Lovely Day', deezerId: 70016835 },
  { artist: 'Niklas Strömstedt', title: 'Oslagbara', deezerId: 16754571 },
  { artist: 'Albatraoz', title: 'Wunderbar', deezerId: 113948726 },
  { artist: 'Chesney Hawkes', title: 'The One and Only', deezerId: 1787674467 },
  { artist: 'Nick Borgen', title: 'We Are All the Winners', deezerId: 3615874 },
];

// Hela klippet spelas. Den första sekunden tonar det in, och de sista sekunderna tonar det ut.
const FADE_IN_MS = 1000;
const FADE_MS = 5000;
const VOLUME = 0.8;
// Nivån som klippen jämnas ut mot, se ljudniva.js. Vinnarlåtarna är oftast starkt mixade poplåtar.
const LEVEL_DB = -12;
// Ljuden före vinnaren, ett slumpat varje gång men inte samma två gånger i rad. Alla är CC0 från
// Freesound och runt fyra och en halv sekund. Fanfaren och publiken är kortade och utjämnade mot virveln.
export const DRUM_SOUNDS = [
  'ljud/trumvirvel.mp3', // ljud 111653 av bigjoedrummer, kortat till den första virveln
  'ljud/fanfar.mp3', // ljud 413201 av joepayne
  'ljud/publik.mp3', // ljud 32260 av moxobna, kortat och uttonat
];
const DRUM_TAIL_S = 0.15; // tystnaden i slutet av ljudet

// Ett slumpat ljud före vinnaren, men inte samma som förra gången.
export function pickDrumSound(random = Math.random, last = null) {
  const choices = DRUM_SOUNDS.filter((s) => s !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// En slumpad låt, men inte samma som förra gången.
export function pickWinnerSong(random = Math.random, last = null) {
  const choices = WINNER_SONGS.filter((s) => s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Volymen under uttoningen. left går från 1 till 0. Volymen sänks efter en kurva, eftersom örat
// uppfattar en jämn sänkning som att låten är stark länge och sedan tystnar tvärt.
const fadeLevel = (left, volume = VOLUME) => volume * Math.max(0, left) ** 3;

// Hur klippet tonas, så att spelarnas mobiler kan göra likadant.
export const WINNER_FADE = { volume: VOLUME, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_MS, loop: false };
// Trumvirveln tonas inte, eftersom den börjar med ett tydligt slag.
export const DRUM_FADE = { volume: VOLUME, fadeInMs: 0, fadeOutMs: 0, loop: false };

export function createWinnerSong() {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let started = false; // låten har börjat, under trumvirveln eller när vinnaren visas
  let heard = () => {}; // säger till när låten hörs, så att vinnarkortet kan visas då
  // På iPhone går det inte att ändra volymen på ett ljudelement. Därför spelas låten helst genom
  // webbläsarens ljudmotor, som kan tona. Den måste startas av ett tryck, se unlock.
  let ctx = null;
  let source = null;
  let heardClip = null; // klippet som hörs och var i det, för spelarnas mobiler

  const clear = () => { timers.forEach(clearInterval); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    started = false;
    heardClip = null;
    if (audio) audio.pause();
    if (drumAudio) drumAudio.pause();
    if (source) { try { source.stop(); } catch { /* redan stoppad */ } source = null; }
  }

  let drumAudio = null;
  let drumUrl = null; // ljudet före vinnaren, för att inte spela samma två gånger i rad

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


  // Trumvirveln eller ett av de andra ljuden i DRUM_SOUNDS, som börjar när texten före vinnaren visas.
  // Svaret kommer när virveln hörs, så att texten visas då, och direkt om den inte kunde spelas.
  function drum() {
    prepare();
    if (!drumAudio) drumAudio = new Audio();
    // Virveln ska höras även när ringsignalen är avstängd.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    drumUrl = pickDrumSound(Math.random, drumUrl);
    drumAudio.src = drumUrl;
    drumAudio.volume = VOLUME;
    return new Promise((resolve) => {
      drumAudio.addEventListener('playing', () => resolve(), { once: true });
      drumAudio.play().catch(() => resolve());
    });
  }

  let prepared = null; // klippet, som hämtas medan texten innan vinnaren visas
  let current = null; // den slumpade låten
  let heardSong = null; // låten när den har börjat höras, för raden längst ner

  // Texten innan vinnaren visas. Klippet hämtas redan nu, så att låten startar direkt.
  function prepare() {
    stop();
    const song = pickWinnerSong(Math.random, last);
    last = song.deezerId;
    current = song;
    heardSong = null;
    prepared = findPreview(song).then(load).catch(() => null);
  }

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ett ljudelement.
  async function load(url) {
    if (!url) return null;
    try {
      if (!ctx) throw new Error('Ingen ljudmotor');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Inget svar');
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      return { url, buffer, volume: VOLUME * levelGain(buffer, LEVEL_DB) };
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

  // Låten börjar när trumvirveln är slut. Två klipp spelas aldrig samtidigt, eftersom iPhone då
  // ofta vägrar starta det andra. Svaret kommer när låten hörs, så att vinnarkortet visas då.
  // Utan klipp, till exempel när Deezer saknar det, kommer svaret när virveln är
  // slut, och kunde klippet inte spelas kommer det direkt.
  function play() {
    return new Promise((resolve) => {
      heard = resolve;
      if (!current) prepare();
      const next = prepared ? start : resolve;
      if (drumAudio && !drumAudio.paused && !drumAudio.ended) whenDrumEnds(next);
      else next();
    });
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
    if (!clip) { heard(); return; }
    heardSong = current;
    if (clip.buffer && ctx && ctx.state === 'running') {
      const at = ctx.currentTime;
      startBuffer(clip.buffer, clip.volume);
      heardClip = { url: clip.url, volume: clip.volume, position: () => ctx.currentTime - at, ended: () => ctx.currentTime - at >= clip.buffer.duration };
      heard();
    } else {
      startElement(clip.url);
      heardClip = { url: clip.url, volume: VOLUME, position: () => audio.currentTime, ended: () => audio.ended };
    }
  }

  // volume: klippets volym efter utjämningen.
  function startBuffer(buffer, volume) {
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const fade = Math.min(FADE_MS / 1000, buffer.duration / 2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + FADE_IN_MS / 1000);
    const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49, volume));
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
    // På iPhone går volymen inte att ändra, så där börjar klippet på full volym.
    audio.volume = 0;
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud, blir det tyst.
    audio.addEventListener('playing', () => heard(), { once: true });
    audio.play().catch(() => heard());
    // Volymen höjs i början och sänks när klippet närmar sig slutet.
    timers.push(setInterval(() => {
      const left = audio.duration ? (audio.duration - audio.currentTime) * 1000 / FADE_MS : 1;
      if (audio.ended) { stop(); return; }
      const fadeIn = Math.min(1, audio.currentTime * 1000 / FADE_IN_MS);
      audio.volume = Math.min(VOLUME * fadeIn, left < 1 ? fadeLevel(left) : VOLUME);
    }, 50));
  }

  // Klippet som hörs och var i det, eller null när det är slut.
  function now() {
    if (!heardClip) return null;
    if (heardClip.ended()) return null;
    return { url: heardClip.url, posMs: Math.round(heardClip.position() * 1000), volume: heardClip.volume };
  }

  // Trumvirveln och var i den, eller null när den inte spelar. Spelarnas mobiler spelar den i takt.
  function drumNow() {
    if (!drumAudio || drumAudio.paused || drumAudio.ended) return null;
    return { url: drumUrl, posMs: Math.round(drumAudio.currentTime * 1000) };
  }

  // Låten står kvar på raden längst ner även när klippet är slut, tills nästa vinnare.
  return { drum, play, stop, unlock, now, drumNow, heard: () => heardSong };
}
