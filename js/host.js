// @ts-check
// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { t } from './shared/lang.js';
import { loadCategories, loadMusic, loadSongs, visibleCategories } from './data.js';
import { showConfirm } from './dialog.js';
import { hideMessage, showMessage, showUnexpectedErrors } from './message.js';
import { createGameView } from './game-view.js';
import { $ } from './shared/dom.js';
import { newCode, newId } from './shared/ids.js';
import { KEYS, readJson, remove, writeJson } from './shared/storage.js';
import * as prefs from './shared/preferences.js';
import * as protocol from './shared/protocol.js';
import { scrollToTop } from './ui.js';
import { showNowMusic } from './now-playing.js';
import { ICONS as MENU_ICONS, mountMenu } from './menu.js';
import { withoutUnknown } from './unknown-songs.js';
import { mountSeasonEffect } from './season.js';
import { createQuizClip } from './quiz-clip.js';
import { createSoundDirector } from './sound-director.js';
import { AUTO_NEXT_MS, INTRO_MS, createGameFlow } from './game-flow.js';
import { chosenCategory, mountCategoryPicker, renderCategories } from './category-picker.js';
import { createConnections } from './host-connections.js';
import { createHostSettings } from './host-settings.js';
import { menuGroups, mountCopyLink, mountKeys, setQrVisible, showJoinInfo } from './host-menu.js';
import { startTicker } from './shared/ticker.js';

// Oväntade fel visas i meddelanderutan i stället för att sidan bara stannar.
showUnexpectedErrors();
mountSeasonEffect();

// Ett sparat spel går att gå tillbaka till i tolv timmar.
const SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

let state = null;
let songs = [];
let music = null; // väntemusiken och vinnarlåtarna, från data/music.json
let category = null;
let ticker = null;
// Spelledaren spelar med och gissar i samma vy som spelarna, om spelledaren inte har valt att bara leda spelet.
let gameView = null;

// Inget sparas när spelet har avslutats. Annars sparas det igen när anslutningarna stängs,
// och knappen för att gå tillbaka till spelet finns kvar.
function save() {
  if (leaving) return;
  writeJson(KEYS.hostGame, { state, savedAt: Date.now() });
}

function loadSaved() {
  const saved = readJson(KEYS.hostGame, null);
  if (!saved || Date.now() - saved.savedAt > SAVE_MAX_AGE_MS) return null;
  return saved.state;
}

// Spelarna och deras anslutningar, se host-connections.js.
const connections = createConnections({ state: () => state, viewFor, changed: () => changed() });

// Väntemusiken, trumvirveln, vinnarlåten och raden Nu spelas, se sound-director.js.
const sound = createSoundDirector({
  state: () => state,
  categoryId: () => category && category.id,
  music: () => music,
  leaving: () => leaving,
  // Raden längst ner visar låten, både här och i mobilerna, som får veta när klippet börjar.
  changed: () => { showNowMusic($('#now-music'), sound.currentMusic()); broadcast(); },
});

// Nedräkningarna före första låten och mellan låtarna, se game-flow.js.
const flow = createGameFlow();
let introTimer = null;
// Klippet spelas när nedräkningen före första låten är slut.
const introDone = () => new Promise((resolve) => setTimeout(resolve, flow.introLeft()));

// Inställningar, och ändringarna som görs medan spelet pågår, se host-settings.js.
// Avdelningen Okända låtar syns bara med ?okanda=1.
const settings = createHostSettings({
  state: () => state,
  category: () => category,
  categoryChanged: (picked, pickedSongs) => { category = picked; songs = pickedSongs; },
  stopClip: () => quizClip.stop(),
  stopWinnerSong: () => sound.winnerSong.stop(),
  changed: () => changed(),
  showUnknown: prefs.showUnknown(location.search),
});

// Spelvyn för en spelare, med tiden kvar tills nästa låt startar av sig själv.
function viewFor(playerId) {
  const view = game.playerView(state, playerId, Date.now());
  const left = flow.nextLeft(state);
  if (view.round && left !== null) Object.assign(view.round, { nextInMs: left, nextTotalMs: AUTO_NEXT_MS });
  // Vinnarlåten är ett Deezer-klipp. Då står Deezer på vinnarkortet.
  view.winnerClip = prefs.extraSounds();
  // Spelarna vänder fram vinnaren när spelledaren gör det, det vill säga när vinnarlåten hörs.
  view.winnerDrum = Boolean(gameView && gameView.winnerDrum());
  view.winnerShown = Boolean(gameView && gameView.winnerShown());
  view.lobbyPlaying = sound.lobbyWanted();
  if (flow.introLeft() > 0) Object.assign(view, { introMs: flow.introLeft(), introTotalMs: INTRO_MS });
  const url = quizClip.urlForPlayers();
  if (url) view.clipUrl = url;
  const playerMusic = sound.forPlayers();
  if (playerMusic) view.music = playerMusic;
  // Låten står på raden längst ner även i mobilerna, också när den bara spelas hos spelledaren.
  const playing = sound.currentMusic();
  if (playing) view.nowMusic = playing;
  // Ändringar under en låt syns för spelarna direkt, fast de gäller först från nästa låt.
  const upcoming = settings.upcoming(view);
  if (upcoming) view.upcoming = upcoming;
  return view;
}

function broadcast() {
  connections.broadcast();
}

function changed() {
  // Ändringar i Inställningar gäller direkt om ingen låt har spelats än.
  if (settings.hasPending() && !state.round) settings.apply();
  save();
  broadcast();
  render();
}

function startNetwork() {
  connections.start(state.code);
  ticker = startTicker(tick, 250);
}

function tick() {
  const action = flow.due(state);
  if (action === 'next') nextSong();
  if (action === 'reveal') {
    // Klippet är längre än tiden per låt när spelledaren har valt en kortare tid.
    quizClip.stop();
    game.reveal(state);
    changed();
  }
}

// Spelledarens eget svar, som om det kom från en spelare.
function hostAnswer(field, value) {
  if (!state) return;
  game.submitAnswer(state, state.hostId, field, protocol.cleanAnswer(value), Date.now());
  changed();
}

// ---- Spelets steg ----

async function startGame(categoryId, resumeState, name, plays = true) {
  await scriptsLoaded;
  const categories = await loadCategories();
  category = categories.find((c) => c.id === categoryId) || visibleCategories(categories)[0];
  [songs, music] = await Promise.all([loadSongs(category), loadMusic()]);
  if (resumeState) {
    state = resumeState;
    // Alla räknas som frånkopplade tills de hör av sig igen.
    for (const player of Object.values(state.players)) player.connected = false;
  } else {
    state = {
      ...game.createGame({
        code: newCode(), categoryId: category.id, categoryName: category.name, labels: category.labels,
        settings: prefs.lastSettings(),
      }),
      hostPlays: plays,
      clipAll: prefs.clipAll(),
    };
  }
  // Ett äldre sparat spel kan ha valt Spotify, som inte finns längre.
  delete state.music;
  state.clipAll = state.clipAll === true;
  // Spelledaren är en spelare som alltid är ansluten, om spelledaren deltar. Ett äldre sparat spel får spelledaren nu.
  if (!state.hostId) state.hostId = newId('spelledare-');
  game.setHostPlaying(state, state.hostPlays !== false,
    game.cleanHostName(name || state.players[state.hostId]?.name || prefs.hostName()));
  // Även ett återupptaget spel från innan namnet sparades ska visa kategorin.
  state.categoryName = category.name;
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  // Går spelledaren tillbaka till ett spel har spelarna redan gått med, så QR-koden är stängd.
  showJoinInfo(state.code, !resumeState);
  gameView = createGameView({ onAnswer: hostAnswer, onError: showError, onWinnerDrum: sound.winnerDrum, onWinnerDrumShown: winnerShown, onWinnerShown: winnerShown, host: true });
  startNetwork();
  render();
}

// Bara låtar med Deezer-ID kan spelas, och inte de som är markerade som okända.
function playableSongs() {
  return withoutUnknown(prefs.unknownSongs(), category.id, songs).filter((song) => song.deezerId);
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  // Sparade inställningar gäller från och med den här låten. Inget väntas in här, eftersom
  // quizClip.play måste anropas direkt från trycket på Starta spelet.
  if (settings.hasPending() && (!state.round || state.round.phase === 'revealed')) settings.apply();
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  const playable = playableSongs();
  if (game.unplayedSongs(state, playable).length === 0) state.playedIds = [];
  const song = game.nextSong(state, playable);
  if (!song) return;
  changed();
  quizClip.play(state.round.number);
}

// ---- Quizklippet ----

const quizClip = createQuizClip({
  state: () => state,
  playableSongs,
  ready: async () => { await sound.lobbyMusic.silent(); await introDone(); },
  otherMusic: [sound.winnerSong, sound.lobbyMusic],
  render: () => render(),
  save: () => save(),
  broadcast: () => broadcast(),
  started: () => changed(),
});

// Meddelandet visas när klippets läge ändras, inte vid varje render, så att det inte tar över
// ett nyare meddelande om anslutningen.
let clipShown = null;
function updateClipMessage(round) {
  const msg = quizClip.message(round);
  const id = msg ? msg.title : null;
  if (id === clipShown) return;
  clipShown = id;
  if (msg) showMessage({ key: 'clip', ...msg });
  else hideMessage('clip');
}

// Spelarna får veta att en ny match har börjat. Spelledaren har själv valt det.
function restart() {
  quizClip.stop();
  // Vinnarlåten tystnar när en ny match börjar, och bara då. Pausas ljud vid varje omritning
  // kan quizlåten hacka till i iPhone när spelledaren trycker, se stop i winner-song.js.
  sound.winnerSong.stop();
  game.restart(state);
  flow.restarted();
  changed();
  connections.toAll(protocol.newMatch());
}

// Pausen stoppar timern, klippet och nedräkningen till nästa låt.
function pauseGame() {
  if (!game.pause(state, Date.now())) return;
  quizClip.stop();
  changed();
}

function resumeGame() {
  if (!state.pausedAt) return;
  flow.resumed(game.resume(state, Date.now()));
  quizClip.resume();
  changed();
}

async function endGame() {
  const ok = await showConfirm(t('endGame.text'), {
    title: t('endGame.title'), okText: t('endGame.ok'), danger: true, icon: MENU_ICONS.leave,
  });
  if (!ok) return;
  leaving = true;
  remove(KEYS.hostGame);
  quizClip.stop();
  sound.winnerSong.stop();
  sound.lobbyMusic.stop();
  await connections.close();
  if (ticker) ticker.stop();
  // Tillbaka till startsidan, med eventuella testparametrar.
  location.href = 'index.html' + location.search;
}

// ---- Visning ----

mountCopyLink(() => state.code);

// Menyn, se host-menu.js.
const menu = () => menuGroups(state, {
  stuck: (round) => quizClip.stuck(round), start: startClicked, resume: resumeGame, retry: () => quizClip.retry(),
  pause: pauseGame, settings: () => settings.edit(), end: endGame,
});

// Starta spelet i vyn startar första låten. QR-koden behövs inte längre när spelet har startat.
// Den kan visas igen i menyn.
function startClicked() {
  if (!state || state.round) return;
  setQrVisible(false);
  flow.startIntro();
  // När nedräkningen är slut ritas vyn om, hos spelledaren och spelarna.
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { render(); broadcast(); }, INTRO_MS);
  nextSong();
  // Spelledaren kan ha scrollat ner till knappen i rutan. Låten ska synas överst.
  scrollToTop();
}

// "Vi har en vinnare!" eller vinnarvyn har tagit över, så att Spela igen visas när vinnaren
// gör det. Spelarna får veta det direkt.
function winnerShown() {
  render();
  broadcast();
}

// Samma vy som spelarna ser, med Starta spelet och Spela igen för spelledaren.
function render() {
  $('#category').textContent = category.name;
  $('#lobby-note').hidden = !sound.updateLobby();
  showNowMusic($('#now-music'), sound.currentMusic());
  gameView.update(viewFor(state.hostId), state.hostId);
  const round = state.round;
  $('#start-game').hidden = Boolean(round);
  // Spela igen går att starta först när vinnarvyn har tagit över efter sista låten.
  $('#new-match').hidden = !(state.winners && gameView.winnerShown());
  updateClipMessage(round);
  // Första låten kan starta medan Inställningar är öppen. Denna låt är okänd gäller då den låt
  // som spelas nu.
  const mark = document.querySelector('dialog[open] #mark-unknown');
  if (mark) mark.setAttribute('aria-checked', String(settings.currentUnknown()));
}

function showError(err) {
  showMessage({ key: 'error', kind: 'problem', title: t('message.unexpected.title'), text: err.message });
}

// ---- Start ----

// Vinnarlåten spelas utan tryck när vinnaren visas. Ljudmotorn får det bara om den har startats
// av ett tryck tidigare, så varje tryck hos spelledaren startar den.
// iPhone räknar ibland bara touchend och click som tryck, så alla fyra lyssnas på.
// Medan låten spelas görs det inte. Då är spelledarens tryck och tangenter nästan bara svar i
// fälten, och ljudmotorn och ljudläget som startades om vid varje tryck kunde få klippet att
// hacka till på iPhone. Trycken mellan låtarna räcker för att hålla ljudet upplåst.
function unlockSound() {
  if (quizClip.sounding()) return;
  quizClip.unlock(sound.lobbyMusic.playing());
  sound.unlock();
}

for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(type, unlockSound, true);

document.addEventListener('click', (e) => {
  const id = /** @type {Element} */ (e.target).closest('[id]')?.id;
  // Knapparna i vyn försvinner när de har tryckts, så fokus flyttas vidare. Spelvyn rullar upp
  // till väntetexten och Starta spelet efter Spela igen, både hos spelledaren och spelarna.
  if (id === 'start-game') { startClicked(); $('#game .menu-button').focus({ preventScroll: true }); }
  else if (id === 'new-match') { restart(); $('#start-game').focus({ preventScroll: true }); }
  else if (id === 'settings') settings.edit();
  else if (id === 'hide-qr') setQrVisible(false);
});

mountKeys();

// Varnar om fliken stängs av misstag mitt i ett spel, men inte när
// spelledaren själv har avslutat det.
let leaving = false;

// Fliken stängs eller sidan laddas om. Spelet kan återupptas, så spelarna får veta att
// spelledaren har lämnat och kanske kommer tillbaka. Meddelandet hinner inte alltid fram.
window.addEventListener('pagehide', () => {
  if (!leaving) connections.toAll(protocol.leaving());
});

window.addEventListener('beforeunload', (e) => {
  if (leaving) return;
  if (state) e.preventDefault();
});

// PeerJS och QR-koden laddas efter den här modulen, så att startsidan visas utan
// att vänta på dem. Ett snabbt klick väntar in dem innan spelet startar.
const scriptsLoaded = new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else document.addEventListener('DOMContentLoaded', resolve, { once: true });
});

async function init() {
  mountMenu($('#setup'), menu);
  mountMenu($('#game'), menu);
  settings.renderSummary();
  $('#host-name').value = prefs.hostName();
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#host-name').value.trim().slice(0, game.MAX_NAME);
    const plays = settings.hostPlays();
    if (plays && !name) return;
    if (plays) prefs.setHostName(name);
    startGame(chosenCategory(), null, plays ? name : '', plays);
  });
  mountCategoryPicker();
  const saved = loadSaved();
  if (saved) {
    const resume = $('#resume');
    resume.hidden = false;
    resume.querySelector('button').textContent = t('host.resume', { code: saved.code });
    resume.querySelector('button').addEventListener('click', () => startGame(saved.categoryId, saved));
  }
  // Kategorierna står redan i host.html, så att sidan inte blinkar till. Här uppdateras de, och
  // säsongskategorier som Halloween kommer bara med när det är säsong för dem.
  renderCategories(visibleCategories(await loadCategories()));
}

init().catch(showError);
