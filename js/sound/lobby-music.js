// @ts-check
// Väntemusiken: ett Deezer-klipp som loopar hos spelledaren medan spelarna går med, innan spelet startar.
// Låtarna är instrumental jazz med groove, i stil med Unsquare Dance, så att ingen börjar gissa redan i lobbyn, och
// ingen av dem finns bland quizlåtarna. Varje väntan får en slumpad låt, som tonar in och ut och
// spelas om tills spelet startar. Då tonar musiken ut, och första låten väntar tills den är tyst.
import { wait } from '../shared/wait.js';
import { SILENCE, findPreview } from './deezer.js';
import { fadeLevel, fadeOutCurve, levelGain } from './audio-level.js';
import { createAudioEngine, engineStopped, loadToEngine } from './engine-clip.js';

// Låtarna står i data/music.json under lobby: default för alla kategorier, och en egen lista för
// säsongskategorierna. Jul har jazziga jullåtar kring Christmas Time Is Here, och Halloween har
// läskig orgel, båda valda av Jonas 25 oktober 2026.

// Väntemusiken för en kategori: säsongens egen, annars jazzen.
/** @param {{ lobby: Record<string, object[]> }} music data/music.json @param {string | null} categoryId */
export const lobbySongs = (music, categoryId) => music.lobby[categoryId] || music.lobby.default;

// Musiken ligger i bakgrunden, så den är svagare än vinnarlåten.
const VOLUME = 0.5;
// Nivån som klippen jämnas ut mot, se audio-level.js. Lugna låtar är ofta svagare mixade än poplåtar.
const LEVEL_DB = -16;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 3000; // i slutet av varje klipp
const STOP_MS = 5000; // när spelet startar, lika länge som vinnarlåten tonar ut
// Står ljudelementet still så här länge, till exempel för att nätet hackar, hämtas klippet igen.
const STALL_MS = 10000;
// Väntan efter ett klipp som inte gick att hämta eller spela, så att en kort störning hos Deezer
// inte tar slut på alla låtar på en gång.
const RETRY_MS = 2000;
// Hur ofta volymen ändras när ett ljudelement tonar in eller ut.
const VOLUME_STEP_MS = 50;

// En slumpad låt, men inte samma som förra väntan.
export function pickLobbySong(random, last, songs) {
  const choices = songs.filter((s) => s.deezerId && s.deezerId !== last);
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Hur klippet tonas, så att spelarnas mobiler kan göra likadant.
// stopMs: när spelet startar slutar spelledaren skicka musiken, och mobilerna tonar då ut lika länge.
export const LOBBY_FADE = { volume: VOLUME, fadeInMs: FADE_IN_MS, fadeOutMs: FADE_OUT_MS, stopMs: STOP_MS, loop: true };

// onChange: klippet har börjat höras, eller tystnat utan att musiken stoppades, så att raden längst
// ner och spelarnas mobiler följer med. songs: låtarna för spelets kategori, se lobbySongs.
export function createLobbyMusic({ onChange = () => {}, songs }) {
  let wanted = false; // musiken ska spela, det vill säga spelet väntar på att starta
  let running = false; // en slinga spelar eller hämtar klipp
  let turn = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let song = null; // låten som loopar under den här väntan
  let clip = null; // dess klipp, som hämtas en gång
  let current = null; // klippet som hörs, med sitt sätt att tona ut och var det är
  let silentAt = 0;
  let abort = null; // avbryter ljudelementet medan det laddar eller har fastnat
  // Som vinnarlåten spelas klippen helst genom ljudmotorn, som kan tona även på iPhone.
  const engine = createAudioEngine();
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
    engine.unlock();
    if (wanted && !running) loop();
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

  const untilSilent = () => wait(Math.max(0, silentAt - Date.now()));

  // Hämtar klippet till ljudmotorn. Tillåter inte Deezer det spelas länken i ljudelementet,
  // och why säger varför, så att det syns med ?debug=1.
  async function load(song) {
    let url;
    try {
      url = await findPreview(song);
    } catch {
      return null;
    }
    if (!url) return null;
    const loaded = await loadToEngine(engine.context(), url);
    if ('buffer' in loaded) return { url, buffer: loaded.buffer, volume: VOLUME * levelGain(loaded.buffer, LEVEL_DB) };
    return { url, why: loaded.why, engineTried: Boolean(engine.context()) };
  }

  // Hur klippet spelas: 'engine' i ljudmotorn, annars varför ljudmotorn inte används.
  let how = null;

  // Spelar klippet en gång, helst i ljudmotorn, som kan tona även på iPhone. mine: slingans
  // omgång. Har musiken stoppats medan ljudmotorn startade spelas inget, och svaret är played.
  async function playOnce(clip, mine) {
    // Hämtades klippet före första trycket, till exempel när spelledaren gick tillbaka till ett
    // sparat spel, finns ljudmotorn nu. Då hämtas det till den, så att det kan tonas.
    if (!clip.buffer && !clip.engineTried && engine.context()) {
      const again = await load(song);
      Object.assign(clip, again, { engineTried: true });
    }
    if (clip.buffer) await engine.resume();
    if (mine !== turn) return 'played';
    if (clip.buffer && engine.running()) {
      how = 'engine';
      return playBuffer(clip);
    }
    how = clip.why || engineStopped(engine.context());
    return playElement(clip);
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
      const result = await playOnce(clip, mine);
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
    const ctx = engine.context();
    return new Promise((resolve) => {
      const gain = ctx.createGain();
      const source = ctx.createBufferSource();
      const now = ctx.currentTime;
      const length = buffer.duration;
      const fadeOut = Math.min(FADE_OUT_MS / 1000, length / 3);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + Math.min(FADE_IN_MS / 1000, length / 3));
      const steps = fadeOutCurve(volume);
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
          const steps = fadeOutCurve(from);
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
          el.volume = Math.min(el.volume, fadeLevel(left, VOLUME));
          return;
        }
        if (el.currentTime !== lastPos) { lastPos = el.currentTime; movedAt = Date.now(); }
        else if (Date.now() - movedAt > STALL_MS) { el.pause(); done('failed'); return; }
        const fadeIn = Math.min(1, el.currentTime * 1000 / FADE_IN_MS);
        const left = el.duration ? (el.duration - el.currentTime) * 1000 / FADE_OUT_MS : 1;
        el.volume = Math.min(VOLUME * fadeIn, left < 1 ? fadeLevel(left, VOLUME) : VOLUME);
      }, VOLUME_STEP_MS);
      const me = { url, volume: VOLUME, position: () => el.currentTime, fadeOut() { stopping = Date.now() + STOP_MS; } };
      // Raden längst ner syns medan klippet spelar, och försvinner när det fastnar och laddar.
      const setSounding = (on) => {
        if (finished || stopping || on === (current === me)) return;
        current = on ? me : null;
        onChange();
      };
      const onPlaying = () => setSounding(true);
      const onWaiting = () => setSounding(false);
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

  return { play, stop, unlock, pauseEngine: engine.pause, resumeEngine: engine.wake, untilSilent, now, song: heardSong, playing: () => wanted, howPlayed: () => how };
}
