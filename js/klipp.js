// Klippet i spelarens mobil, när spelledaren har valt att spela det på alla enheter.
// Spelledaren skickar bara Deezers klipplänk, aldrig vilken låt det är. Mobilen spolar till
// samma ställe som hos spelledaren, utifrån tiden som är kvar, så att alla hör ungefär samma sak.
// Väntemusiken och vinnarlåten kommer som view.music, med var i klippet spelledaren är och hur
// klippet tonas. På iPhone går volymen inte att ändra, så där börjar och slutar de tvärt.
import { SILENCE } from './deezer.js';

// Så långt får klippet glida från spelledarens innan mobilen spolar om. Mindre ger hack i ljudet.
const DRIFT_S = 0.4;

// Var i klippet låten är, i sekunder. Klippet och timern startar samtidigt hos spelledaren.
// sinceMs: tiden sedan läget kom från spelledaren.
export function clipPosition(round, sinceMs) {
  return Math.max(0, (round.roundMs - round.remainingMs + sinceMs) / 1000);
}

// Var i väntemusiken eller vinnarlåten spelledaren är, i sekunder. Väntemusiken loopar.
export function musicPosition(music, sinceMs, duration) {
  const pos = Math.max(0, (music.posMs + sinceMs) / 1000);
  return music.loop && duration ? pos % duration : pos;
}

// Volymen i väntemusiken eller vinnarlåten, med samma toning som hos spelledaren.
export function musicVolume(music, pos, duration) {
  const fadeIn = Math.min(1, pos * 1000 / music.fadeInMs);
  const left = duration ? (duration - pos) * 1000 / music.fadeOutMs : 1;
  return music.volume * Math.min(fadeIn, left < 1 ? Math.max(0, left) ** 3 : 1);
}

// Länken som ska spelas just nu, eller null. Quizlåten går före musiken.
export function wantedClip(view) {
  const round = view && view.round;
  if (view && view.clipUrl && round && round.phase !== 'revealed') return view.clipUrl;
  if (view && view.music && view.music.url) return view.music.url;
  return null;
}

const quizClip = (view) => Boolean(view && view.clipUrl && view.round && view.round.phase !== 'revealed');

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
    if (!wantedClip(view)) return false;
    if (!quizClip(view)) return true;
    const round = view.round;
    return Boolean(round.phase === 'playing' && !view.paused && round.remainingMs > 0);
  }

  function seek() {
    const pos = quizClip(view) ? clipPosition(view.round, Date.now() - receivedAt)
      : musicPosition(view.music, Date.now() - receivedAt, audio.duration);
    if (Math.abs(audio.currentTime - pos) > DRIFT_S) audio.currentTime = pos;
  }

  // Väntemusiken och vinnarlåten tonas som hos spelledaren. Quizlåten spelas på full volym.
  function setVolume() {
    const music = !quizClip(view) && view && view.music;
    audio.volume = music ? musicVolume(music, audio.currentTime, audio.duration) : 1;
  }
  setInterval(() => { if (!audio.paused) setVolume(); }, 50);

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
    audio.loop = Boolean(!quizClip(view) && view.music.loop);
    if (!shouldPlay()) {
      audio.pause();
      return;
    }
    // Spolningen väntar tills mobilen vet hur långt klippet är.
    if (audio.readyState >= 1) seek();
    setVolume();
    if (!audio.paused) return;
    hideSongInfo();
    audio.play().then(() => { unlocked = true; setBlocked(false); }).catch((err) => {
      if (err && err.name === 'NotAllowedError') setBlocked(true);
    });
  }

  audio.addEventListener('loadedmetadata', () => { if (wantedClip(view)) sync(); });
  // Klippet kan ha buffrat en stund innan det hördes. Då spolas det fram igen.
  audio.addEventListener('playing', () => { if (shouldPlay()) seek(); });

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
