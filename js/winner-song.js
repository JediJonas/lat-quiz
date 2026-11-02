// @ts-check
// Vinnarlåten: först en trumvirvel, sedan ett Deezer-klipp som spelas hos spelledaren när vinnarvyn tar över.
// Låten slumpas ur en handplockad lista, och samma låt spelas inte två gånger i rad.
import { wait } from './shared/wait.js';
import { SILENCE, findPreview } from './deezer.js';
import { fadeLevel, fadeOutCurve, levelGain } from './audio-level.js';

// Låtarna står i data/music.json under winner: default för alla kategorier, och en egen lista
// för säsongskategorierna (beslutat 25 oktober 2026).

// Hela klippet spelas och börjar på full volym, så att det hörs tydligt när vinnarkortet visas.
// De sista sekunderna tonar det ut. Intoningen på en sekund togs bort, eftersom låten då kändes
// sen med en blåtandshögtalare (beslutat 24 oktober 2026).
const FADE_MS = 5000;
const VOLUME = 0.8;
// Nivån som klippen jämnas ut mot, se audio-level.js. Vinnarlåtarna är oftast starkt mixade poplåtar.
const LEVEL_DB = -12;
const DRUM_URL = 'sounds/drumroll.mp3';
const DRUM_TAIL_S = 0.15; // tystnaden i slutet av trumvirveln
// Hur ofta trumvirveln kollas, så att vinnarlåten börjar strax innan virveln tystnar.
const DRUM_CHECK_MS = 30;
// Hur ofta volymen ändras när ett ljudelement tonar ut.
const VOLUME_STEP_MS = 50;

// Vinnarlåtarna för en kategori: säsongens egen, annars de vanliga.
/** @param {{ winner: Record<string, object[]> }} music data/music.json @param {string | null} categoryId */
export const winnerSongs = (music, categoryId) => music.winner[categoryId] || music.winner.default;

// En slumpad låt, men inte samma som förra gången, om det finns fler att välja på.
export function pickWinnerSong(random, last, songs) {
  const others = songs.filter((s) => s.deezerId !== last);
  const choices = others.length ? others : songs;
  return choices[Math.floor(random() * choices.length) % choices.length];
}

// Så länge ljudmotorns klocka får stå still innan låten spelas med ljudelementet i stället.
const CHECK_MS = 300;
// Så länge låten väntar på att ljudmotorn ska starta igen.
const RESUME_MS = 500;

// Hur klippet tonas, så att spelarnas mobiler kan göra likadant.
export const WINNER_FADE = { volume: VOLUME, fadeInMs: 0, fadeOutMs: FADE_MS, loop: false };
// Trumvirveln tonas inte, eftersom den börjar med ett tydligt slag.
export const DRUM_FADE = { volume: VOLUME, fadeInMs: 0, fadeOutMs: 0, loop: false };

// onChange: låten har börjat höras, eller tystnat för att klippet inte gick att spela, så att raden
// längst ner följer med. songs: låtarna för spelets kategori, se winnerSongs.
export function createWinnerSong({ onChange = () => {}, songs }) {
  let audio = null;
  let last = null;
  let timers = [];
  let playing = 0; // ökar vid varje start och stopp, så att ett sent svar från Deezer inte spelar
  let started = false; // låten har börjat, under trumvirveln eller när vinnaren visas
  /** @type {(kind?: string) => void} */
  let heard = () => {}; // säger till när låten hörs, så att vinnarkortet kan visas då
  // På iPhone går det inte att ändra volymen på ett ljudelement. Därför spelas låten helst genom
  // webbläsarens ljudmotor, som kan tona. Den måste startas av ett tryck, se unlock.
  let ctx = null;
  let source = null;
  let heardClip = null; // klippet som hörs och var i det, för spelarnas mobiler

  // Tidtagare och lyssnare som tas bort vid stopp.
  const clear = () => { timers.forEach((t) => (t && t.off ? t.off() : clearInterval(t))); timers = []; };

  function stop() {
    playing += 1;
    clear();
    prepared = null;
    started = false;
    heardClip = null;
    // stop anropas vid varje omritning hos spelledaren, också när spelledaren väljer ett svar eller
    // sparar Inställningar under en quizlåt. Pausas ett ljudelement i ett tryck tar iPhone ljudet
    // från quizlåten en kort stund, även när elementet redan står still. Därför rörs bara det som spelar.
    if (audio && !audio.paused) audio.pause();
    if (drumAudio && !drumAudio.paused) drumAudio.pause();
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
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }


  // Medan quizlåten spelas vilar ljudmotorn, så att klippet är det enda ljud sidan har igång.
  // Annars kan iPhone stanna upp klippet en kort stund när tangentbordet öppnas för ett svar.
  // Efter låten startas den igen. Det tillåter iPhone utan tryck, eftersom ett tryck har startat
  // den förut. Gör den inte det spelas ljudet med ljudelementet i stället.
  let resting = false;
  function pauseEngine() {
    if (!ctx || ctx.state !== 'running') return;
    resting = true;
    ctx.suspend().catch(() => {});
  }
  function resumeEngine() {
    if (resting && ctx) ctx.resume().catch(() => {});
    resting = false;
  }

  // Trumvirveln, som börjar när texten före vinnaren visas. Den är fyra sekunder.
  // Klippet är ljud 111653 av bigjoedrummer på Freesound (CC0), kortat till den första virveln.
  // Svaret kommer när virveln hörs, så att texten visas då, och direkt om den inte kunde spelas.
  function playDrumRoll() {
    prepare();
    if (!drumAudio) drumAudio = new Audio();
    // Virveln ska höras även när ringsignalen är avstängd.
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    drumAudio.src = DRUM_URL;
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
    const song = pickWinnerSong(Math.random, last, songs());
    last = song.deezerId;
    current = song;
    heardSong = null;
    // Ljudmotorn kan ha vilat under sista quizlåten utan att vakna igen. Den väcks redan nu, så att
    // den hinner gå när låten börjar. Annars spelas låten som vanligt ljud, som inte kan tonas på iPhone.
    resting = false;
    resume();
    prepared = findPreview(song).then(load).catch(() => null);
  }

  // Startar ljudmotorn om den står still. Svaret kommer när den går, eller efter en kort stund.
  function resume() {
    if (!ctx || ctx.state === 'running') return Promise.resolve();
    return Promise.race([ctx.resume().catch(() => {}), wait(RESUME_MS)]);
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
  // slut, och kunde klippet inte spelas kommer det direkt. Svaret är 'engine' när låten spelas i
  // ljudmotorn, som hörs senare än ett ljudelement över blåtand.
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
    const startSongOnce = () => {
      if (called || turn !== playing) return;
      called = true;
      clearInterval(check);
      done();
    };
    const check = setInterval(() => {
      // Kunde trumvirveln inte spela börjar låten ändå.
      if (drumAudio.paused || (drumAudio.duration && drumAudio.duration - drumAudio.currentTime <= DRUM_TAIL_S)) startSongOnce();
    }, DRUM_CHECK_MS);
    timers.push(check);
    drumAudio.addEventListener('ended', startSongOnce, { once: true });
  }

  // Låten spelas på full volym och tonar ut under FADE_MS på slutet.
  async function start() {
    if (started) return;
    started = true;
    const turn = playing;
    const clip = await prepared;
    if (turn !== playing) return;
    if (!clip) { heard(); return; }
    if (clip.buffer) await resume();
    if (turn !== playing) return;
    if (clip.buffer && ctx && ctx.state === 'running') {
      const at = ctx.currentTime;
      startBuffer(clip.buffer, clip.volume);
      // iPhone kan säga att ljudmotorn går fast den står still och inget hörs. Rör sig inte dess
      // klocka efter en kort stund spelas låten med ljudelementet i stället.
      await wait(CHECK_MS);
      if (turn !== playing) return;
      if (ctx.currentTime <= at) {
        if (source) { try { source.stop(); } catch { /* redan stoppad */ } source = null; }
        startElement(clip.url, turn);
        return;
      }
      heardClip = { url: clip.url, volume: clip.volume, position: () => ctx.currentTime - at, ended: () => ctx.currentTime - at >= clip.buffer.duration };
      heardSong = current;
      onChange();
      heard('engine');
    } else {
      startElement(clip.url, turn);
    }
  }

  // volume: klippets volym efter utjämningen.
  function startBuffer(buffer, volume) {
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const fade = Math.min(FADE_MS / 1000, buffer.duration / 2);
    gain.gain.setValueAtTime(volume, now);
    const steps = fadeOutCurve(volume);
    gain.gain.setValueCurveAtTime(steps, now + buffer.duration - fade, fade);
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }

  // Låten räknas som hörd först när ljudelementet faktiskt spelar, och inte medan klippet laddar.
  function startElement(url, turn) {
    if (!audio) audio = new Audio();
    const el = audio;
    // Klippet är oftast redan laddat medan trumvirveln spelade.
    if (el.src !== url) el.src = url;
    el.volume = VOLUME;
    const onPlaying = () => {
      if (turn !== playing || heardSong) return;
      heardClip = { url, volume: VOLUME, position: () => el.currentTime, ended: () => el.ended };
      heardSong = current;
      onChange();
      heard();
    };
    // Spelar det inte, till exempel för att webbläsaren inte tillåter ljud eller länken inte
    // fungerar, blir det tyst och raden längst ner försvinner.
    const onPlayFailed = () => {
      if (turn !== playing) return;
      stop();
      if (heardSong) { heardSong = null; onChange(); }
      heard();
    };
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onPlayFailed, { once: true });
    timers.push({ off: () => { el.removeEventListener('playing', onPlaying); el.removeEventListener('error', onPlayFailed); } });
    el.play().catch(onPlayFailed);
    // Volymen sänks när klippet närmar sig slutet.
    timers.push(setInterval(() => {
      const left = audio.duration ? (audio.duration - audio.currentTime) * 1000 / FADE_MS : 1;
      if (audio.ended) { stop(); return; }
      audio.volume = left < 1 ? fadeLevel(left, VOLUME) : VOLUME;
    }, VOLUME_STEP_MS));
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
    return { url: DRUM_URL, posMs: Math.round(drumAudio.currentTime * 1000) };
  }

  // Låten står kvar på raden längst ner även när klippet är slut, tills nästa vinnare.
  return { playDrumRoll, play, stop, unlock, pauseEngine, resumeEngine, now, drumNow, heard: () => heardSong };
}
