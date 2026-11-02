// @ts-check
// Quizklippet hos spelledaren: hämtar Deezer-klippet för låten, spelar det och startar timern
// när det hörs. Saknar Deezer klippet byts låten. Modulen äger klippets ljudelement och läge.
//
// Lägen (status): null innan något har hänt, 'loading' medan klippet hämtas, 'loaded' när det
// väntar på att en paus ska ta slut, 'playing' när det spelar, och 'error' (Deezer svarade inte),
// 'missing' (inga klipp, även efter flera låtar) eller 'blocked' (webbläsaren stoppade ljudet).
// De tre sista behöver ett nytt tryck på Starta spelet.
import * as game from './game.js';
import { SILENCE, findPreview } from './deezer.js';
import * as prefs from './shared/preferences.js';

// Så många låtar i rad hoppas över när Deezer saknar klipp, innan spelledaren får veta det.
const MAX_SKIPS = 5;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Med ?debug=1 visas överst på sidan en logg över quizlåtens ljud och spelledarens tryck, så att
// det går att se vad som händer i en riktig iPhone när musiken stannar upp. Loggen säger när
// ljudelementet pausar eller väntar på data, när låtens tid står still fast den spelar och när
// sidan har varit upptagen så länge att en kontroll kom för sent.
function audioDebug(el) {
  if (!('debug' in document.documentElement.dataset)) return;
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;margin:0;padding:4px 6px;max-height:35vh;overflow:auto;font:10px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.8);color:#fff;pointer-events:none;white-space:pre-wrap';
  document.body.append(box);
  const lines = [];
  const log = (text) => {
    lines.push(`${(performance.now() / 1000).toFixed(2)} ${text}`);
    if (lines.length > 40) lines.shift();
    box.textContent = lines.join('\n');
    box.scrollTop = box.scrollHeight;
  };
  const what = (node) => (node && node.tagName ? node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') : '-');
  for (const type of ['play', 'playing', 'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'emptied', 'ended', 'error']) {
    el.addEventListener(type, () => log(`ljud ${type} t=${el.currentTime.toFixed(2)} rs=${el.readyState} ns=${el.networkState}`));
  }
  for (const type of ['pointerdown', 'touchend', 'click', 'focusin', 'focusout', 'change']) {
    document.addEventListener(type, (e) => log(`${type} ${what(e.target)}`), true);
  }
  document.addEventListener('visibilitychange', () => log(`synlig=${document.visibilityState}`));
  let lastTime = 0;
  let lastAt = 0;
  let stillSince = 0;
  setInterval(() => {
    const now = performance.now();
    if (lastAt && now - lastAt > 300) log(`sidan upptagen ${Math.round(now - lastAt - 100)} ms`);
    lastAt = now;
    if (el.paused || !el.src.startsWith('http')) { stillSince = 0; return; }
    const t = el.currentTime;
    if (t === lastTime) { if (!stillSince) stillSince = now; }
    else if (stillSince) { log(`tiden stod still ${Math.round(now - stillSince)} ms`); stillSince = 0; }
    lastTime = t;
  }, 100);
}

/**
 * @param {object} deps
 * @param {() => any} deps.state spelläget just nu
 * @param {() => object[]} deps.playableSongs låtarna som går att byta till
 * @param {() => Promise<void>} deps.ready väntar in det som måste vara klart innan klippet spelas:
 *   att väntemusiken har tystnat och att nedräkningen före första låten är slut
 * @param {{ rest(): void, wake(): void }[]} deps.otherMusic väntemusiken och vinnarlåten, som vilar medan klippet hörs
 * @param {() => void} deps.render ritar om spelledarens vy
 * @param {() => void} deps.save sparar spelet
 * @param {() => void} deps.broadcast skickar läget till spelarna
 * @param {() => void} deps.started låten har börjat höras och timern har startat
 * @param {(song: object) => Promise<string | null>} [deps.find] hämtar klipplänken, findPreview i deezer.js
 */
export function createQuizClip({ state, playableSongs, ready, otherMusic, render, save, broadcast, started, find = findPreview }) {
  const clip = { audio: null, unlocked: false, round: 0, status: null, error: '', skipped: 0 };

  // Sant om klippet fortfarande hör till låten som väntar på att spelas.
  const stillWaiting = (roundNumber) => {
    const round = state().round;
    return Boolean(round && round.number === roundNumber && round.phase === 'ready');
  };

  function audio() {
    if (!clip.audio) {
      clip.audio = new Audio();
      audioDebug(clip.audio);
      // Väntemusikens och vinnarlåtens ljudmotor vilar medan quizlåten hörs, se rest i winner-song.js.
      clip.audio.addEventListener('playing', () => {
        if (!clip.audio.src.startsWith('http')) return;
        for (const music of otherMusic) music.rest();
      });
      for (const type of ['pause', 'ended']) {
        clip.audio.addEventListener(type, () => { for (const music of otherMusic) music.wake(); });
      }
    }
    return clip.audio;
  }

  // Måste anropas direkt från klicket. skipping: en låt utan klipp byts ut, utan nytt klick.
  async function play(roundNumber, skipping = false) {
    const el = audio();
    el.pause();
    // Är klippets ljudelement redan upplåst av ett tidigare tryck behövs ingen tystnad här, se unlock.
    if (!clip.unlocked) {
      el.src = SILENCE;
      el.play().catch(() => {});
    }
    Object.assign(clip, { round: roundNumber, status: 'loading', error: '' });
    if (!skipping) clip.skipped = 0;
    render();
    let url = null;
    try {
      url = await find(state().round.song);
    } catch (err) {
      clip.error = err.message;
    }
    // Spelledaren har gått vidare, eller visat svaret medan klippet laddades.
    if (!stillWaiting(roundNumber)) return;
    if (clip.error) {
      clip.status = 'error';
      render();
      return;
    }
    // Saknar Deezer klippet hoppas låten över och en annan slumpas.
    if (!url) {
      clip.skipped += 1;
      if (clip.skipped <= MAX_SKIPS && game.replaceSong(state(), playableSongs())) {
        save();
        play(roundNumber, true);
        return;
      }
      clip.status = 'missing';
      render();
      return;
    }
    el.src = url;
    // Spelarnas mobiler kan börja ladda klippet medan det laddas här.
    if (state().clipAll) broadcast();
    // Två klipp spelas aldrig samtidigt, så första låten väntar tills väntemusiken har tonat ut.
    await ready();
    if (!stillWaiting(roundNumber)) return;
    // Under en paus väntar klippet tills spelledaren fortsätter.
    if (state().pausedAt) {
      clip.status = 'loaded';
      render();
      return;
    }
    start();
  }

  // Timern startar först när klippet hörs. Ljudsynken är hur mycket senare det hörs i
  // högtalaren, och låtkortet vänds och timern startar först då, som för trumvirveln. Mobilerna spelar
  // klippet efter timern, så de går i takt med högtalaren.
  function start() {
    const el = audio();
    el.currentTime = 0;
    const roundNumber = state().round.number;
    el.play().then(() => wait(prefs.audioDelay())).then(() => {
      // Spelledaren kan ha pausat eller visat svaret medan klippet buffrades.
      if (!stillWaiting(roundNumber)) { el.pause(); return; }
      if (state().pausedAt) {
        el.pause();
        clip.status = 'loaded';
        render();
        return;
      }
      clip.status = 'playing';
      if (game.startRound(state(), Date.now())) started();
    }).catch(() => {
      // Nästa tryck får låsa upp ljudelementet igen.
      clip.unlocked = false;
      clip.status = 'blocked';
      render();
    });
  }

  // Starta spelet i menyn när klippet inte startade: försök igen, med en ny låt om Deezer saknade klippen.
  function retry() {
    const round = state().round;
    if (!round || round.phase !== 'ready') return;
    if (clip.round === round.number && clip.status === 'missing') {
      if (game.replaceSong(state(), playableSongs())) save();
      play(round.number);
      return;
    }
    if (clip.round === round.number && clip.audio && clip.audio.src.startsWith('http')) start();
    else play(round.number);
  }

  // Spelet fortsätter efter en paus. Klippet spelar vidare, eller startar nu om spelet pausades
  // medan det laddades.
  function resume() {
    const round = state().round;
    if (round.phase === 'playing' && clip.status === 'playing' && clip.audio) clip.audio.play().catch(() => {});
    if (round.phase === 'ready' && clip.round === round.number && clip.status === 'loaded') start();
  }

  function stop() {
    if (clip.audio) clip.audio.pause();
  }

  // Klippet har inte startat och behöver ett nytt tryck, till exempel när Deezer inte svarade.
  const stuck = (round) => Boolean(round && round.phase === 'ready' && clip.round === round.number
    && ['error', 'missing', 'blocked'].includes(clip.status));

  // Meddelandet för ett klipp som har fastnat, eller null.
  function message(round) {
    if (!stuck(round)) return null;
    const text = 'Välj Starta spelet i menyn för att försöka igen.';
    if (clip.status === 'error') return { kind: 'problem', title: clip.error.replace(/\.$/, ''), text };
    if (clip.status === 'missing') return { kind: 'problem', title: 'Inga klipp från Deezer', text };
    return { kind: 'problem', title: 'Klippet startade inte', text };
  }

  // Klipplänken som spelarnas mobiler spelar, om spelledaren har valt det. Länken säger inte
  // vilken låt det är, och den skickas inte längre när svaret visas.
  function urlForPlayers() {
    const s = state();
    const round = s && s.round;
    if (!round || !s.clipAll || round.phase === 'revealed') return null;
    if (clip.round !== round.number || !clip.audio || !clip.audio.src.startsWith('http')) return null;
    return clip.audio.src;
  }

  // Quizlåtens ljudelement låses upp med en kort tystnad redan vid ett tryck innan väntemusiken
  // spelar, till exempel på Dra igång. Startade tystnaden först i trycket på Starta spelet stannade
  // väntemusiken tvärt i iPhone, för att sedan börja igen och tonas ut. Sedan får klippet spela utan tryck.
  // lobbyPlaying: väntemusiken spelar redan, och då väntar upplåsningen.
  function unlock(lobbyPlaying) {
    if (clip.unlocked || lobbyPlaying) return;
    const el = audio();
    if (!el.paused) return;
    el.src = SILENCE;
    el.play().then(() => { clip.unlocked = true; }, () => {});
  }

  const sounding = () => Boolean(clip.audio && !clip.audio.paused);

  return { play, retry, resume, stop, stuck, message, urlForPlayers, unlock, sounding };
}
