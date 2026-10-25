// Väntemusiken: ett Deezer-klipp som loopar hos spelledaren medan spelarna går med, innan spelet startar.
// Låtarna är instrumental jazz med groove, i stil med Unsquare Dance, så att ingen börjar gissa redan i lobbyn, och
// ingen av dem finns bland quizlåtarna. Varje väntan får en slumpad låt, som tonar in och ut och
// spelas om tills spelet startar. Då tonar musiken ut, och första låten väntar tills den är tyst.
import { SILENCE, findPreview } from './deezer.js';
import { levelGain } from './ljudniva.js';

export const LOBBY_SONGS = [
  { artist: 'The Dave Brubeck Quartet', title: 'Unsquare Dance', deezerId: 8164849 },
  { artist: 'The Dave Brubeck Quartet', title: 'Three to Get Ready', deezerId: 3571290 },
  { artist: 'The Dave Brubeck Quartet', title: "Kathy's Waltz", deezerId: 3571291 },
  { artist: 'Ramsey Lewis', title: 'The "In" Crowd', deezerId: 925778 },
  { artist: 'Richard "Groove" Holmes', title: 'Misty', deezerId: 1164074 },
  { artist: 'Cannonball Adderley', title: 'Mercy, Mercy, Mercy', deezerId: 3131203 },
  { artist: 'Herbie Mann', title: "Comin' Home Baby", deezerId: 1099848062 },
  { artist: 'Jimmy Smith', title: 'The Cat', deezerId: 2515289 },
  { artist: 'Herbie Hancock', title: 'Watermelon Man', deezerId: 3486410 },
  { artist: 'Herbie Hancock', title: 'Cantaloupe Island', deezerId: 3363488 },
  { artist: 'Lou Donaldson', title: 'Alligator Bogaloo', deezerId: 3234555 },
  { artist: 'Oscar Peterson Trio', title: 'C Jam Blues', deezerId: 7290401 },
  { artist: 'Vince Guaraldi Trio', title: 'Oh, Good Grief', deezerId: 104271088 },
  { artist: 'Wes Montgomery', title: "Bumpin' on Sunset", deezerId: 2537494 },
  { artist: 'Esbjörn Svensson Trio', title: 'Seven Days of Falling', deezerId: 520623912 },
  { artist: 'Esbjörn Svensson Trio', title: 'When Everyone Has Gone', deezerId: 894835082 },
];

// Säsongskategorierna har egen väntemusik, instrumental som jazzen, så att stämningen finns
// redan i lobbyn. Jul har jullåtar med storband kring Christmas Time Is Here, och Halloween har läskig orgel, båda valda av Jonas 25 oktober 2026. Ingen av låtarna finns bland quizlåtarna.
export const SEASON_LOBBY_SONGS = {
  jul: [
    { artist: 'Vince Guaraldi Trio', title: 'Christmas Time Is Here', deezerId: 134403696 },
    { artist: 'The Count Basie Orchestra', title: 'Jingle Bells', deezerId: 1762631337 },
    { artist: "Gordon Goodwin's Big Phat Band", title: 'Carol of the Bells', deezerId: 110353364 },
    { artist: 'The Count Basie Orchestra', title: 'Good "Swing" Wenceslas', deezerId: 1762631377 },
  ],
  halloween: [
    { artist: 'Jack Marshall', title: 'Theme from The Munsters', deezerId: 4008734421 },
    { artist: 'Cybermonsters', title: 'Haunted Pipe Organ Stomp', deezerId: 3576637671 },
    { artist: 'Classic Carnival Circus Calliope Music', title: 'Dardanella', deezerId: 70731041 },
    { artist: 'Lalo Schifrin', title: 'Amityville Horror Main Title', deezerId: 1231894852 },
    { artist: 'Danny Elfman', title: 'Music Box', deezerId: 3453190731 },
    { artist: 'Raphaël Imbert', title: 'My Love (musical saw version)', deezerId: 64699066 },
  ],
};

// Väntemusiken för en kategori: säsongens egen, annars jazzen.
export const lobbySongs = (categoryId) => SEASON_LOBBY_SONGS[categoryId] || LOBBY_SONGS;

// Musiken ligger i bakgrunden, så den är svagare än vinnarlåten.
const VOLUME = 0.5;
// Nivån som klippen jämnas ut mot, se ljudniva.js. Lugna låtar är ofta svagare mixade än poplåtar.
const LEVEL_DB = -16;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 3000; // i slutet av varje klipp
const STOP_MS = 5000; // när spelet startar, lika länge som vinnarlåten tonar ut
// Står ljudelementet still så här länge, till exempel för att nätet hackar, hämtas klippet igen.
const STALL_MS = 10000;
// Väntan efter ett klipp som inte gick att hämta eller spela, så att en kort störning hos Deezer
// inte tar slut på alla låtar på en gång.
const RETRY_MS = 2000;

// Volymen under en uttoning. left går från 1 till 0, efter samma kurva som vinnarlåten.
const fadeLevel = (left, volume = VOLUME) => volume * Math.max(0, left) ** 3;

// En slumpad låt, men inte samma som förra väntan.
export function pickLobbySong(random = Math.random, last = null, songs = LOBBY_SONGS) {
  const choices = songs.filter((s) => s.deezerId && s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Hur klippet tonas, så att spelarnas mobiler kan göra likadant.
export const LOBBY_FADE = { volume: VOLUME, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS, loop: true };

// onChange: klippet har börjat höras, eller tystnat utan att musiken stoppades, så att raden längst
// ner och spelarnas mobiler följer med. songs: låtarna för spelets kategori, se lobbySongs.
export function createLobbyMusic({ onChange = () => {}, songs = () => LOBBY_SONGS } = {}) {
  let wanted = false; // musiken ska spela, det vill säga spelet väntar på att starta
  let running = false; // en slinga spelar eller hämtar klipp
  let turn = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let song = null; // låten som loopar under den här väntan
  let clip = null; // dess klipp, som hämtas en gång
  let current = null; // klippet som hörs, med sitt sätt att tona ut och var det är
  let silentAt = 0;
  let abort = null; // avbryter ljudelementet medan det laddar eller har fastnat
  // Som vinnarlåten spelas klippen helst genom ljudmotorn, som kan tona även på iPhone.
  let ctx = null;
  let audio = null;
  let unlocked = false;

  // Anropas vid varje tryck hos spelledaren. Kunde musiken inte starta utan tryck, till exempel när
  // spelledaren går tillbaka till ett spel efter att sidan laddats om, börjar den nu.
  function unlock() {
    if (!audio) audio = new Audio();
    if (!unlocked && audio.paused) {
      audio.src = SILENCE;
      audio.play().then(() => { unlocked = true; }, () => {});
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (Context) {
      if (!ctx) ctx = new Context();
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    }
    if (wanted && !running) loop();
  }

  // Medan quizlåten spelas vilar ljudmotorn, så att klippet är det enda ljud sidan har igång.
  // Annars kan iPhone stanna upp klippet en kort stund när tangentbordet öppnas för ett svar.
  // Efter låten startas den igen. Det tillåter iPhone utan tryck, eftersom ett tryck har startat
  // den förut. Gör den inte det spelas ljudet med ljudelementet i stället.
  let resting = false;
  function rest() {
    if (!ctx || ctx.state !== 'running') return;
    resting = true;
    ctx.suspend().catch(() => {});
  }
  function wake() {
    if (resting && ctx) ctx.resume().catch(() => {});
    resting = false;
  }

  // Varje väntan får en ny slumpad låt, som loopar tills spelet startar.
  function play() {
    if (wanted) return;
    wanted = true;
    song = pickLobbySong(Math.random, song && song.deezerId, songs());
    clip = null;
    loop();
  }

  // Tonar ut och stannar. Svaret kommer när musiken är tyst.
  function stop() {
    const wasWanted = wanted;
    wanted = false;
    turn += 1;
    running = false;
    if (current) {
      current.fadeOut();
      current = null;
      silentAt = Date.now() + STOP_MS;
    } else if (abort) abort();
    else if (wasWanted && audio && !audio.paused) audio.pause();
  }

  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  const silent = () => new Promise((resolve) => { setTimeout(resolve, Math.max(0, silentAt - Date.now())); });

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ljudelementet.
  async function load(song) {
    try {
      const url = await findPreview(song);
      if (!url) return null;
      if (!ctx) return { url };
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Inget svar');
        const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        return { url, buffer, volume: VOLUME * levelGain(buffer, LEVEL_DB) };
      } catch {
        return { url };
      }
    } catch {
      return null;
    }
  }

  // Samma klipp spelas om och om igen. Det hämtas bara en gång, så länge det går att spela.
  async function loop() {
    const mine = turn;
    running = true;
    let misses = 0;
    while (wanted && mine === turn) {
      if (!clip) {
        const loaded = await load(song);
        if (mine !== turn) return;
        if (!loaded) {
          // Saknar Deezer klippet tas en annan låt. Saknas alla, till exempel utan nätverk, blir det tyst.
          misses += 1;
          if (misses >= songs().length) { running = false; return; }
          await wait(RETRY_MS);
          if (mine !== turn) return;
          song = pickLobbySong(Math.random, song.deezerId, songs());
          continue;
        }
        clip = loaded;
      }
      const result = await (clip.buffer && ctx && ctx.state === 'running' ? playBuffer(clip) : playElement(clip));
      if (mine !== turn) return;
      // Tillät inte webbläsaren ljud väntar musiken på nästa tryck, se unlock.
      if (result === 'blocked') { running = false; return; }
      if (result === 'played') { misses = 0; continue; }
      // Klipplänken gäller bara en kvart, och nätet kan ha hackat. Då hämtas en ny länk.
      clip = null;
      misses += 1;
      if (misses >= songs().length) { running = false; return; }
      await wait(RETRY_MS);
    }
  }

  // Klippet spelas i ljudmotorn, med volymen efter utjämningen. Det hörs direkt.
  function playBuffer({ url, buffer, volume }) {
    return new Promise((resolve) => {
      const gain = ctx.createGain();
      const source = ctx.createBufferSource();
      const now = ctx.currentTime;
      const length = buffer.duration;
      const fadeOut = Math.min(FADE_OUT_MS / 1000, length / 3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + Math.min(FADE_IN_MS / 1000, length / 3));
      const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49, volume));
      gain.gain.setValueCurveAtTime(steps, now + length - fadeOut, fadeOut);
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      const me = {
        url,
        volume,
        position: () => ctx.currentTime - now,
        fadeOut() {
          const at = ctx.currentTime;
          const from = gain.gain.value;
          gain.gain.cancelScheduledValues(at);
          const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49, from));
          gain.gain.setValueCurveAtTime(steps, at, STOP_MS / 1000);
          try { source.stop(at + STOP_MS / 1000); } catch { /* redan stoppad */ }
        },
      };
      source.onended = () => { if (current === me) current = null; resolve('played'); };
      source.start();
      current = me;
      onChange();
    });
  }

  // På iPhone går volymen inte att ändra på ett ljudelement. Där börjar och slutar klippet tvärt.
  // Klippet räknas som hört först när det faktiskt spelar, och inte medan det laddar.
  // Svaret är played när klippet är slut, blocked när webbläsaren inte tillåter ljud utan tryck,
  // och failed när det inte gick att spela, till exempel för att länken har gått ut.
  function playElement({ url }) {
    if (!audio) audio = new Audio();
    const el = audio;
    return new Promise((resolve) => {
      let stopping = 0;
      let finished = false;
      let lastPos = -1;
      let movedAt = Date.now();
      el.src = url;
      el.volume = 0;
      const timer = setInterval(() => {
        if (stopping) {
          const left = (stopping - Date.now()) / STOP_MS;
          if (left <= 0) { el.pause(); done('played'); return; }
          el.volume = Math.min(el.volume, fadeLevel(left));
          return;
        }
        if (el.currentTime !== lastPos) { lastPos = el.currentTime; movedAt = Date.now(); }
        else if (Date.now() - movedAt > STALL_MS) { el.pause(); done('failed'); return; }
        const fadeIn = Math.min(1, el.currentTime * 1000 / FADE_IN_MS);
        const left = el.duration ? (el.duration - el.currentTime) * 1000 / FADE_OUT_MS : 1;
        el.volume = Math.min(VOLUME * fadeIn, left < 1 ? fadeLevel(left) : VOLUME);
      }, 50);
      const me = { url, volume: VOLUME, position: () => el.currentTime, fadeOut() { stopping = Date.now() + STOP_MS; } };
      // Raden längst ner syns medan klippet spelar, och försvinner när det fastnar och laddar.
      const heard = (on) => {
        if (finished || stopping || on === (current === me)) return;
        current = on ? me : null;
        onChange();
      };
      const onPlaying = () => heard(true);
      const onWaiting = () => heard(false);
      const onEnded = () => done('played');
      const onError = () => done('failed');
      const done = (result) => {
        if (finished) return;
        finished = true;
        abort = null;
        clearInterval(timer);
        el.removeEventListener('playing', onPlaying);
        el.removeEventListener('waiting', onWaiting);
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onError);
        const wasHeard = current === me;
        if (wasHeard) current = null;
        if (wasHeard && result !== 'played') onChange();
        resolve(result);
      };
      abort = () => { el.pause(); done('played'); };
      el.addEventListener('playing', onPlaying);
      el.addEventListener('waiting', onWaiting);
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onError);
      el.play().catch((err) => done(err && err.name === 'NotAllowedError' ? 'blocked' : 'failed'));
    });
  }

  // Klippet som hörs, var i det och med vilken volym, för spelarnas mobiler, eller null.
  const now = () => (current && current.url
    ? { url: current.url, posMs: Math.round(current.position() * 1000), volume: current.volume } : null);

  // Låten som hörs, för raden längst ner, eller null.
  const heardSong = () => (now() ? song : null);

  return { play, stop, unlock, rest, wake, silent, now, song: heardSong, playing: () => wanted };
}
