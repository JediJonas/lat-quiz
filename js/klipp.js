// Klippet i spelarens mobil, när spelledaren har valt att spela det på alla enheter.
// Spelledaren skickar bara Deezers klipplänk, aldrig vilken låt det är. Mobilen spolar till
// samma ställe som hos spelledaren, utifrån tiden som är kvar, så att alla hör ungefär samma sak.
import { SILENCE } from './deezer.js';

// Så långt får klippet glida från spelledarens innan mobilen spolar om. Mindre ger hack i ljudet.
const DRIFT_S = 0.4;

// Var i klippet låten är, i sekunder. Klippet och timern startar samtidigt hos spelledaren.
// sinceMs: tiden sedan läget kom från spelledaren.
export function clipPosition(round, sinceMs) {
  return Math.max(0, (round.roundMs - round.remainingMs + sinceMs) / 1000);
}

// Länken som ska spelas just nu, eller null.
export function wantedClip(view) {
  const round = view && view.round;
  if (!view || !view.clipUrl || !round || round.phase === 'revealed') return null;
  return view.clipUrl;
}

// onBlocked(blocked): mobilen vill att spelaren trycker någonstans innan ljudet får spela.
export function createClipPlayer({ onBlocked }) {
  const audio = new Audio();
  audio.preload = 'auto';
  let view = null;
  let receivedAt = 0;
  let url = null;
  let blocked = false;
  let unlocked = false;

  const setBlocked = (on) => {
    if (on === blocked) return;
    blocked = on;
    onBlocked(on);
  };

  // Låsskärmen och mediekontrollerna visar appen, inte låten.
  function hideSongInfo() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Låtquiz', artist: 'Ljudklipp från Deezer' });
  }

  function shouldPlay() {
    const round = view && view.round;
    return Boolean(wantedClip(view) && round.phase === 'playing' && !view.paused && round.remainingMs > 0);
  }

  function seek() {
    const pos = clipPosition(view.round, Date.now() - receivedAt);
    if (Math.abs(audio.currentTime - pos) > DRIFT_S) audio.currentTime = pos;
  }

  function sync() {
    const want = wantedClip(view);
    if (!want) {
      audio.pause();
      setBlocked(false);
      return;
    }
    if (want !== url) {
      url = want;
      audio.src = want;
    }
    if (!shouldPlay()) {
      audio.pause();
      return;
    }
    // Spolningen väntar tills mobilen vet hur långt klippet är.
    if (audio.readyState >= 1) seek();
    if (!audio.paused) return;
    hideSongInfo();
    audio.play().then(() => { unlocked = true; setBlocked(false); }).catch((err) => {
      if (err && err.name === 'NotAllowedError') setBlocked(true);
    });
  }

  audio.addEventListener('loadedmetadata', () => { if (wantedClip(view)) sync(); });
  // Klippet kan ha buffrat en stund innan det hördes. Då spolas det fram igen.
  audio.addEventListener('playing', () => { if (wantedClip(view) && view.round.phase === 'playing') seek(); });

  return {
    update(newView) {
      view = newView;
      receivedAt = Date.now();
      sync();
    },
    // Anropas direkt från ett tryck. Då får ljudet spela, även när länken kommer senare.
    unlock() {
      if (unlocked && !blocked) return;
      if (shouldPlay()) { sync(); return; }
      // Klippet laddas men har inte börjat. Det spelas en kort stund utan ljud.
      if (wantedClip(view)) {
        audio.muted = true;
        audio.play().then(() => { unlocked = true; }).catch(() => {}).finally(() => {
          audio.muted = false;
          if (!shouldPlay()) audio.pause();
        });
        return;
      }
      url = null;
      audio.src = SILENCE;
      audio.play().then(() => { unlocked = true; }).catch(() => {});
    },
    stop() {
      view = null;
      audio.pause();
      setBlocked(false);
    },
  };
}
