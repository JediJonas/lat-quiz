// Väntemusiken: ett Deezer-klipp som loopar hos spelledaren medan spelarna går med, innan spelet startar.
// Låtarna är lugna, glada och instrumentala, utan sång, så att ingen börjar gissa redan i lobbyn, och
// ingen av dem finns bland quizlåtarna. Varje väntan får en slumpad låt, som tonar in och ut och
// spelas om tills spelet startar. Då tonar musiken ut snabbt, och första låten väntar tills den är tyst.
import { SILENCE, findPreview } from './deezer.js';

export const LOBBY_SONGS = [
  { artist: 'Quincy Jones', title: 'Soul Bossa Nova', deezerId: 2507005, spotifyId: '0Jw3cPBXlGnA6DEJrZSTI0' },
  { artist: 'Herb Alpert & the Tijuana Brass', title: 'Spanish Flea', deezerId: 1068117712, spotifyId: '689DTIE4YIRfuIUG58Z2H2' },
  { artist: 'Henry Mancini', title: 'Baby Elephant Walk', deezerId: 597555, spotifyId: '6jbuv8pHbSbFMnYoQ9Glsf' },
  { artist: 'Vince Guaraldi Trio', title: 'Linus and Lucy', deezerId: 134403694, spotifyId: '1IzKmhRmil5n0iwPOMcG7Y' },
  { artist: 'The Dave Brubeck Quartet', title: 'Take Five', deezerId: 586127, spotifyId: '4YlZMAxpH4hZOHPq2s1axj' },
  { artist: 'Bert Kaempfert', title: "A Swingin' Safari", deezerId: 24940331, spotifyId: '58BD2GQZh6HVRnqp9hGALE' },
  { artist: 'Marvin Hamlisch', title: 'The Entertainer', deezerId: 1097447 },
  { artist: 'Jan Johansson', title: 'Visa från Utanmyra', deezerId: 61592653 },
  { artist: 'Herb Alpert & the Tijuana Brass', title: 'A Taste of Honey', deezerId: 1064027062, spotifyId: '6gJyJsLvGVCQane5HVV9rC' },
  { artist: 'Ramsey Lewis Trio', title: 'The "In" Crowd', deezerId: 925778, spotifyId: '1RCriBo6McFaqfftZ5OAd0' },
  { artist: 'Cannonball Adderley', title: 'Mercy, Mercy, Mercy', deezerId: 3152183, spotifyId: '6NF8MZ2trxckVBr82pyyPt' },
  { artist: 'Lee Morgan', title: 'The Sidewinder', deezerId: 3105342, spotifyId: '1dZHIbmuBDAwXfQOM4dyM3' },
  { artist: 'Horace Silver', title: 'Song for My Father', deezerId: 3104557, spotifyId: '1CDBaGlisZlOJzvx88lL8A' },
  { artist: 'Herbie Hancock', title: 'Cantaloupe Island', deezerId: 3104591, spotifyId: '0sCeNwt8xRCMR4NhKpMyBe' },
  { artist: 'Santo & Johnny', title: 'Sleep Walk', deezerId: 791797812 },
  { artist: 'Acker Bilk', title: 'Stranger on the Shore', deezerId: 3368088 },
  { artist: 'Erroll Garner', title: 'Misty', deezerId: 2237627, spotifyId: '5A8R1LgbHKBCKyZdVFdyXH' },
  { artist: 'James Last', title: 'Biscaya', deezerId: 666384992 },
  { artist: 'Jan Johansson', title: 'Emigrantvisa', deezerId: 61592659 },
  { artist: 'Stan Getz & Charlie Byrd', title: 'Desafinado', deezerId: 602453972 },
  { artist: 'The Dave Brubeck Quartet', title: 'Unsquare Dance', deezerId: 8164849, spotifyId: '3FYDiueg0uwQiN7JVtC9CE' },
  { artist: 'Vince Guaraldi Trio', title: 'Cast Your Fate to the Wind', deezerId: 2604673, spotifyId: '1OreHcG7YGrd5iP3zH2GfX' },
  { artist: "Booker T. & the M.G.'s", title: 'Time Is Tight', deezerId: 4286773, spotifyId: '3XOVanRi3prWDEZQiZTlYx' },
  { artist: 'Herb Alpert & the Tijuana Brass', title: 'Tijuana Taxi', deezerId: 1068117682, spotifyId: '2vLgPIAJj1Z7fd69QoFxqK' },
  { artist: 'Björn J:son Lindh', title: 'Brusa högre lilla å', deezerId: 915549 },
];

// Musiken ligger i bakgrunden, så den är svagare än vinnarlåten.
const VOLUME = 0.5;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 3000; // i slutet av varje klipp
const STOP_MS = 800; // när spelet startar

// Volymen under en uttoning. left går från 1 till 0, efter samma kurva som vinnarlåten.
const fadeLevel = (left) => VOLUME * Math.max(0, left) ** 3;

// En slumpad låt, men inte samma som förra väntan. key: deezerId med Deezer, spotifyId med Spotify,
// eftersom bara låtar som finns hos den valda tjänsten spelas.
export function pickLobbySong(random = Math.random, last = null, key = 'deezerId') {
  const choices = LOBBY_SONGS.filter((s) => s[key] && s[key] !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Hur klippet tonas, så att spelarnas mobiler kan göra likadant.
export const LOBBY_FADE = { volume: VOLUME, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS, loop: true };

// onStart: klippet har börjat höras, så att spelarnas mobiler kan börja spela det.
export function createLobbyMusic({ onStart = () => {} } = {}) {
  let wanted = false; // musiken ska spela, det vill säga spelet väntar på att starta
  let running = false; // en slinga spelar eller hämtar klipp
  let turn = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let song = null; // låten som loopar under den här väntan
  let clip = null; // dess klipp, som hämtas en gång
  let current = null; // klippet som hörs, med sitt sätt att tona ut och var det är
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

  // Varje väntan får en ny slumpad låt, som loopar tills spelet startar.
  function play() {
    if (wanted) return;
    wanted = true;
    song = pickLobbySong(Math.random, song && song.deezerId);
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
    } else if (wasWanted && audio && !audio.paused) audio.pause();
  }

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
        return { url, buffer: await ctx.decodeAudioData(await res.arrayBuffer()) };
      } catch {
        return { url };
      }
    } catch {
      return null;
    }
  }

  // Samma klipp spelas om och om igen. Det hämtas bara en gång.
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
          if (misses >= LOBBY_SONGS.length) { running = false; return; }
          song = pickLobbySong(Math.random, song.deezerId);
          continue;
        }
        clip = loaded;
      }
      const playing = clip.buffer && ctx && ctx.state === 'running' ? playBuffer(clip.buffer) : playElement(clip.url);
      if (current) { current.url = clip.url; onStart(); }
      const played = await playing;
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
        position: () => ctx.currentTime - now,
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
      const me = { position: () => el.currentTime, fadeOut() { stopping = Date.now() + STOP_MS; } };
      const done = (played) => { clearInterval(timer); if (current === me) current = null; resolve(played); };
      el.addEventListener('ended', () => done(true), { once: true });
      el.play().catch(() => done(false));
      current = me;
    });
  }

  // Klippet som hörs och var i det, för spelarnas mobiler, eller null.
  const now = () => (current && current.url ? { url: current.url, posMs: Math.round(current.position() * 1000) } : null);

  return { play, stop, unlock, silent, now, playing: () => wanted };
}
