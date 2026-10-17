// Väntemusiken: Deezer-klipp som spelas hos spelledaren medan spelarna går med, innan spelet startar.
// Låtarna är lugna, glada och mest instrumentala, så att ingen börjar gissa redan i lobbyn, och
// ingen av dem finns bland quizlåtarna. De slumpas, tonar in och ut och följer på varandra tills
// spelet startar. Då tonar musiken ut snabbt, och första låten väntar tills den är tyst.
import { SILENCE, findPreview } from './deezer.js';

export const LOBBY_SONGS = [
  { artist: 'Quincy Jones', title: 'Soul Bossa Nova', deezerId: 2507005 },
  { artist: 'Herb Alpert & the Tijuana Brass', title: 'Spanish Flea', deezerId: 1068117712 },
  { artist: 'Henry Mancini', title: 'Baby Elephant Walk', deezerId: 597555 },
  { artist: 'Vince Guaraldi Trio', title: 'Linus and Lucy', deezerId: 134403694 },
  { artist: 'The Dave Brubeck Quartet', title: 'Take Five', deezerId: 586127 },
  { artist: 'Bert Kaempfert', title: "A Swingin' Safari", deezerId: 24940331 },
  { artist: 'Stan Getz & João Gilberto', title: 'The Girl from Ipanema', deezerId: 2228684 },
  { artist: 'Marvin Hamlisch', title: 'The Entertainer', deezerId: 1097447 },
  { artist: 'Jan Johansson', title: 'Visa från Utanmyra', deezerId: 61592653 },
  { artist: 'Bobby McFerrin', title: "Don't Worry, Be Happy", deezerId: 3127387 },
];

// Musiken ligger i bakgrunden, så den är svagare än vinnarlåten.
const VOLUME = 0.5;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 3000; // i slutet av varje klipp
const STOP_MS = 800; // när spelet startar

// Volymen under en uttoning. left går från 1 till 0, efter samma kurva som vinnarlåten.
const fadeLevel = (left) => VOLUME * Math.max(0, left) ** 3;

// Alla låtar i slumpad ordning, men inte samma låt först som den som spelades sist.
export function shuffleLobbySongs(random = Math.random, last = null) {
  const songs = [...LOBBY_SONGS];
  for (let i = songs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  if (songs.length > 1 && songs[0].deezerId === last) songs.push(songs.shift());
  return songs;
}

export function createLobbyMusic() {
  let wanted = false; // musiken ska spela, det vill säga spelet väntar på att starta
  let running = false; // en slinga spelar eller hämtar klipp
  let turn = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let queue = [];
  let last = null;
  let current = null; // klippet som hörs, med sitt sätt att tona ut
  let silentAt = 0;
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
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    }
    if (wanted && !running) loop();
  }

  function play() {
    if (wanted) return;
    wanted = true;
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
    } else if (wasWanted && audio && !audio.paused) audio.pause();
  }

  const silent = () => new Promise((resolve) => { setTimeout(resolve, Math.max(0, silentAt - Date.now())); });

  function nextSong() {
    if (!queue.length) queue = shuffleLobbySongs(Math.random, last);
    const song = queue.shift();
    last = song.deezerId;
    return song;
  }

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ljudelementet.
  async function load(song) {
    try {
      const url = await findPreview(song);
      if (!url) return null;
      if (!ctx) return { url };
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Inget svar');
        return { url, buffer: await ctx.decodeAudioData(await res.arrayBuffer()) };
      } catch {
        return { url };
      }
    } catch {
      return null;
    }
  }

  // Klippen spelas ett i taget. Nästa hämtas medan det förra spelar, så att de följer tätt.
  async function loop() {
    const mine = turn;
    running = true;
    let misses = 0;
    let next = load(nextSong());
    while (wanted && mine === turn) {
      const clip = await next;
      if (mine !== turn) return;
      if (!clip) {
        // Saknas alla klipp, till exempel utan nätverk, blir det tyst.
        misses += 1;
        if (misses >= LOBBY_SONGS.length) { running = false; return; }
        next = load(nextSong());
        continue;
      }
      misses = 0;
      next = load(nextSong());
      const played = await (clip.buffer && ctx && ctx.state === 'running' ? playBuffer(clip.buffer) : playElement(clip.url));
      // Tillät inte webbläsaren ljud väntar musiken på nästa tryck, se unlock.
      if (!played) { if (mine === turn) running = false; return; }
    }
  }

  function playBuffer(buffer) {
    return new Promise((resolve) => {
      const gain = ctx.createGain();
      const source = ctx.createBufferSource();
      const now = ctx.currentTime;
      const length = buffer.duration;
      const fadeOut = Math.min(FADE_OUT_MS / 1000, length / 3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(VOLUME, now + Math.min(FADE_IN_MS / 1000, length / 3));
      const steps = Float32Array.from({ length: 50 }, (_, i) => fadeLevel(1 - i / 49));
      gain.gain.setValueCurveAtTime(steps, now + length - fadeOut, fadeOut);
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      const me = {
        fadeOut() {
          const at = ctx.currentTime;
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(gain.gain.value, at);
          gain.gain.linearRampToValueAtTime(0, at + STOP_MS / 1000);
          try { source.stop(at + STOP_MS / 1000); } catch { /* redan stoppad */ }
        },
      };
      source.onended = () => { if (current === me) current = null; resolve(true); };
      source.start();
      current = me;
    });
  }

  // På iPhone går volymen inte att ändra på ett ljudelement. Där börjar och slutar klippet tvärt.
  function playElement(url) {
    if (!audio) audio = new Audio();
    const el = audio;
    return new Promise((resolve) => {
      let stopping = 0;
      el.src = url;
      el.volume = 0;
      const timer = setInterval(() => {
        if (stopping) {
          const left = (stopping - Date.now()) / STOP_MS;
          if (left <= 0) { el.pause(); done(true); return; }
          el.volume = Math.min(el.volume, fadeLevel(left));
          return;
        }
        const fadeIn = Math.min(1, el.currentTime * 1000 / FADE_IN_MS);
        const left = el.duration ? (el.duration - el.currentTime) * 1000 / FADE_OUT_MS : 1;
        el.volume = Math.min(VOLUME * fadeIn, left < 1 ? fadeLevel(left) : VOLUME);
      }, 50);
      const me = { fadeOut() { stopping = Date.now() + STOP_MS; } };
      const done = (played) => { clearInterval(timer); if (current === me) current = null; resolve(played); };
      el.addEventListener('ended', () => done(true), { once: true });
      el.play().catch(() => done(false));
      current = me;
    });
  }

  return { play, stop, unlock, silent, playing: () => wanted };
}
