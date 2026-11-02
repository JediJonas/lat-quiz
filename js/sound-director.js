// @ts-check
// Ljudregin hos spelledaren: vilket extraljud som spelas när. Väntemusiken spelas medan
// spelarna går med, trumvirveln och vinnarlåten när någon har vunnit, och raden Nu spelas
// visar låten först när den hörs. Quizklippet sköts av quiz-clip.js.
import * as prefs from './shared/preferences.js';
import { showMessage } from './message.js';
import { after } from './audio-delay.js';
import { DRUM_FADE, WINNER_FADE, createWinnerSong, winnerSongs } from './winner-song.js';
import { LOBBY_FADE, createLobbyMusic, lobbySongs } from './lobby-music.js';
import { nowMusic } from './now-playing.js';

// Ljudmotorn, där väntemusiken och vinnarlåten spelas, hörs senare än ett vanligt ljudelement över
// blåtand, så med ljudsynk väntar vinnarkortet och raden Nu spelas ENGINE_WAIT_MS extra
// (provat med blåtandshögtalare och iPhone 24 oktober 2026).
const ENGINE_WAIT_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} deps
 * @param {() => any} deps.state spelläget, eller null före spelet
 * @param {() => string | null} deps.categoryId kategorin som spelas, för säsongens väntemusik
 * @param {() => any} deps.music data/music.json, som har lästs in innan spelet visas
 * @param {() => boolean} deps.leaving spelet håller på att avslutas
 * @param {() => void} deps.changed musiken har börjat höras eller tystnat
 */
export function createSoundDirector({ state, categoryId, music, leaving, changed }) {
  // Hur mycket senare väntemusiken och vinnarlåten hörs i högtalaren med Ljudsynk.
  const musicDelay = () => { const delay = prefs.audioDelay(); return delay ? delay + ENGINE_WAIT_MS : 0; };

  // Spelarnas mobiler får veta när klippet börjar, så att de kan spela det i takt, och raden längst
  // ner visar låten. Tystnar klippet för att det inte gick att spela, till exempel när Deezer inte
  // svarar, försvinner raden igen. Med ljudfördröjning visas raden först när musiken hörs i högtalaren.
  function musicChanged() {
    if (!state()) return;
    changed();
    const delay = musicDelay();
    if (delay) setTimeout(() => { if (state()) changed(); }, delay);
  }

  const winnerSong = createWinnerSong({ onChange: musicChanged, songs: () => winnerSongs(music(), state() && state().categoryId) });
  const lobbyMusic = createLobbyMusic({ onChange: musicChanged, songs: () => lobbySongs(music(), categoryId()) });

  // Musiken spelar innan första låten, även efter Spela igen, och tystnar när spelet startar.
  // Equalizern på väntekortet rör sig snabbt när den spelar, och långsamt annars.
  const lobbyWanted = () => {
    const s = state();
    return Boolean(s && !s.round && !s.winners && !leaving() && prefs.extraSounds());
  };

  // Startar eller stoppar väntemusiken efter spelets läge. Returnerar om den ska spela.
  function updateLobby() {
    const on = lobbyWanted();
    if (on) lobbyMusic.play();
    else lobbyMusic.stop();
    return on;
  }

  function playingMusic() {
    const s = state();
    if (!s) return null;
    if (lobbyWanted()) return nowMusic(lobbyMusic.song());
    if (!s.winners || !prefs.extraSounds()) return null;
    return nowMusic(winnerSong.heard());
  }

  // Texten och när den började spela här. Med ljudfördröjning hörs den så mycket senare.
  let musicSeen = { text: null, at: 0 };

  // Väntemusiken eller vinnarlåten som spelas, för raden längst ner, eller null. Låten står där
  // först när klippet faktiskt hörs, och vinnarlåten står kvar tills ett nytt spel börjar.
  function currentMusic() {
    const text = playingMusic();
    if (text !== musicSeen.text) musicSeen = { text, at: Date.now() };
    return text && Date.now() - musicSeen.at >= musicDelay() ? text : null;
  }

  function playerMusic() {
    const s = state();
    if (!s.clipAll) return null;
    const lobby = lobbyWanted() && lobbyMusic.now();
    if (lobby) return { ...LOBBY_FADE, ...lobby };
    if (!s.winners || !prefs.extraSounds()) return null;
    const winner = winnerSong.now();
    if (winner) return { ...WINNER_FADE, ...winner };
    const drum = winnerSong.drumNow();
    return drum ? { ...DRUM_FADE, ...drum } : null;
  }

  // Väntemusiken, trumvirveln och vinnarlåten spelas också i spelarnas mobiler, i takt med
  // spelledaren, när spelledaren har valt att spela ljud på alla enheter.
  // Med ljudfördröjning hörs musiken senare i spelledarens högtalare, så mobilerna spelar så mycket
  // längre bak i klippet.
  function forPlayers() {
    const music = playerMusic();
    return music ? { ...music, posMs: Math.max(0, music.posMs - musicDelay()) } : null;
  }

  // Texten innan vinnaren visas. Då spelas en trumvirvel, om extraljuden är på, och låten börjar när
  // virveln är slut. Vinnarvyn tar över när låten hörs, eller när virveln är slut om ingen låt spelas.
  // Med ljudsynk vänds rubriken och vinnarkortet när ljudet hörs i högtalaren.
  function winnerDrum() {
    if (!prefs.extraSounds()) return null;
    const delay = prefs.audioDelay();
    const drum = after(winnerSong.drum(), delay);
    // Med ?debug=1 står det hur låten spelades, så att fördröjningen går att felsöka.
    const song = winnerSong.play().then((kind) => {
      if ('debug' in document.documentElement.dataset) {
        showMessage({ key: 'debug', kind: 'info', title: 'Vinnarlåten', text: `${kind === 'engine' ? 'Ljudmotorn' : 'Vanligt ljud'}, kortet väntar ${musicDelay() / 1000} s.`, ms: 6000 });
      }
      return wait(musicDelay());
    });
    return { drum, song };
  }

  // Ljudmotorn och ljudelementen låses upp vid spelledarens tryck.
  function unlock() {
    winnerSong.unlock();
    lobbyMusic.unlock();
  }

  return { winnerSong, lobbyMusic, lobbyWanted, updateLobby, currentMusic, forPlayers, winnerDrum, unlock };
}
