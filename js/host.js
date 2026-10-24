// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs } from './data.js';
import { SILENCE, findPreview } from './deezer.js';
import { showAlert, showConfirm } from './dialog.js';
import { currentMessage, hideMessage, showJoined, showLeft, showMessage, showUnexpectedErrors } from './meddelande.js';
import { createGameView, esc } from './spelvy.js';
import { scrollToTop } from './ui.js';
import { enhanceSelect } from './rullista.js';
import { mountSwitch } from './theme.js';
import { dragToClose } from './ark.js';
import { DRUM_FADE, WINNER_FADE, createWinnerSong } from './vinnarlat.js';
import { LOBBY_FADE, createLobbyMusic } from './vantemusik.js';
import { nowMusic, showNowMusic } from './nuspelas.js';
import { ICONS as MENU_ICONS, commonItems, mountMenu, startItems } from './meny.js';
import { DELAY_CHOICES, after, cleanDelay, delayShort, delayText } from './ljudfordrojning.js';
import { UNKNOWN_KEY, cleanUnknown, countUnknown, formatUnknown, isUnknown, toggleUnknown, withoutUnknown } from './okanda.js';

// Oväntade fel visas i meddelanderutan i stället för att sidan bara stannar.
showUnexpectedErrors();

const SAVE_KEY = 'latquiz-host';
const NAME_KEY = 'latquiz-namn';
const SETTINGS_KEY = 'latquiz-settings';
const CLIP_ALL_KEY = 'latquiz-klipp-alla';
const EXTRA_SOUNDS_KEY = 'latquiz-extraljud';
const AUDIO_DELAY_KEY = 'latquiz-ljudfordrojning';
// Tidigare fanns Spela vinnarlåt och Spela väntemusik var för sig. De tas bort när extraljuden sparas.
const OLD_SOUND_KEYS = ['latquiz-vinnarlat', 'latquiz-vantemusik'];
// Tidigare gick det att välja Spotify som musiktjänst. Valet tas bort, eftersom bara Deezer finns kvar.
const OLD_MUSIC_KEY = 'latquiz-musik';
const SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const $ = (sel) => document.querySelector(sel);

let state = null;
let songs = [];
let category = null;
let net = null;
const connToPlayer = new Map();
let ticker = null;
// Spelledaren spelar med och gissar i samma vy som spelarna, om spelledaren inte har valt att bara leda spelet.
let gameView = null;
// Strömbrytaren Jag deltar i spelet i Inställningar, innan spelet startar. Spelledaren deltar om inget annat väljs.
let hostPlays = true;
const DEFAULT_HOST_NAME = 'Spelledare';

function storage(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

// Inget sparas när spelet har avslutats. Annars sparas det igen när anslutningarna stängs,
// och knappen för att gå tillbaka till spelet finns kvar.
function save() {
  if (leaving) return;
  storage(() => localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() })));
}

function loadSaved() {
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  if (!saved || Date.now() - saved.savedAt > SAVE_MAX_AGE_MS) return null;
  return saved.state;
}

// Senast valda inställningar används när nästa spel skapas.
function loadSettings() {
  return game.cleanSettings(storage(() => JSON.parse(localStorage.getItem(SETTINGS_KEY)), {}));
}

function saveSettings(settings) {
  storage(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)));
}

storage(() => localStorage.removeItem(OLD_MUSIC_KEY));

// Klippet kan också spelas i spelarnas mobiler. Det är av som standard, och senaste valet
// gäller nästa spel.
function loadClipAll() {
  return storage(() => localStorage.getItem(CLIP_ALL_KEY) === '1', false);
}

function saveClipAll(on) {
  storage(() => (on ? localStorage.setItem(CLIP_ALL_KEY, '1') : localStorage.removeItem(CLIP_ALL_KEY)));
}

// Extraljuden är väntemusiken medan spelarna går med, trumvirveln före vinnaren och vinnarlåten.
// Quizlåtarna spelas alltid. Extraljuden är på som standard, även för den som stängde av
// vinnarlåten eller väntemusiken tidigare, och valet gäller den här enheten.
function loadExtraSounds() {
  return storage(() => localStorage.getItem(EXTRA_SOUNDS_KEY) !== '0', true);
}

function saveExtraSounds(on) {
  storage(() => {
    for (const key of OLD_SOUND_KEYS) localStorage.removeItem(key);
    if (on) localStorage.removeItem(EXTRA_SOUNDS_KEY); else localStorage.setItem(EXTRA_SOUNDS_KEY, '0');
  });
}

// Ljudfördröjningen för en blåtandshögtalare, i millisekunder, se ljudfordrojning.js. Den är av
// som standard, och valet gäller den här enheten.
function loadAudioDelay() {
  return cleanDelay(storage(() => localStorage.getItem(AUDIO_DELAY_KEY), 0));
}

function saveAudioDelay(ms) {
  storage(() => (ms ? localStorage.setItem(AUDIO_DELAY_KEY, String(ms)) : localStorage.removeItem(AUDIO_DELAY_KEY)));
}

// Spelarnas mobiler får veta när klippet börjar, så att de kan spela det i takt, och raden längst
// ner visar låten, både här och i mobilerna. Tystnar klippet för att det inte gick att spela,
// till exempel när Deezer inte svarar, försvinner raden igen.
// Med ljudfördröjning visas raden först när musiken hörs i högtalaren.
function musicChanged() {
  if (!state) return;
  showNowMusic($('#now-music'), currentMusic());
  broadcast();
  const delay = loadAudioDelay();
  if (delay) setTimeout(() => { if (state) { showNowMusic($('#now-music'), currentMusic()); broadcast(); } }, delay);
}

const winnerSong = createWinnerSong({ onChange: musicChanged });
const lobbyMusic = createLobbyMusic({ onChange: musicChanged });

// Musiken spelar innan första låten, även efter Spela igen, och tystnar när spelet startar.
const lobbyWanted = () => Boolean(state && !state.round && !state.winners && !leaving && loadExtraSounds());

// Väntemusiken eller vinnarlåten som spelas, för raden längst ner, eller null. Låten står där
// först när klippet faktiskt hörs, och vinnarlåten står kvar tills en ny match börjar.
function currentMusic() {
  const text = playingMusic();
  if (text !== musicSeen.text) musicSeen = { text, at: Date.now() };
  return text && Date.now() - musicSeen.at >= loadAudioDelay() ? text : null;
}

// Texten och när den började spela här. Med ljudfördröjning hörs den så mycket senare.
let musicSeen = { text: null, at: 0 };

function playingMusic() {
  if (!state) return null;
  if (lobbyWanted()) return nowMusic(lobbyMusic.song());
  if (!state.winners || !loadExtraSounds()) return null;
  return nowMusic(winnerSong.heard());
}

// När spelledaren startar spelet visas "Nu börjar det!" innan första låten, lika länge som
// nedräkningen mellan låtarna (AUTO_NEXT_MS). Klippet laddas under tiden och spelas när tiden är slut.
const INTRO_MS = 10000;
let introEnds = 0;
let introTimer = null;
const introLeft = () => Math.max(0, introEnds - Date.now());
const introDone = () => new Promise((resolve) => setTimeout(resolve, introLeft()));

function startIntro() {
  introEnds = Date.now() + INTRO_MS;
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { render(); broadcast(); }, INTRO_MS);
}

// Equalizern på väntekortet rör sig snabbt när väntemusiken spelas, och långsamt annars.
const lobbyPlaying = lobbyWanted;

function updateLobbyMusic() {
  const on = lobbyWanted();
  if (on) lobbyMusic.play();
  else lobbyMusic.stop();
  $('#lobby-note').hidden = !on;
}

// Spelledarens namn föreslås nästa gång, även om namnet från spelarsidan finns.
function loadName() {
  return storage(() => localStorage.getItem(NAME_KEY), null)
    || storage(() => JSON.parse(localStorage.getItem('latquiz-player')).name, '') || '';
}

function newId() {
  return 'spelledare-' + ((crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2));
}

// Okända låtar sparas på den här datorn och gäller alla kommande spel.
function loadUnknown() {
  return cleanUnknown(storage(() => JSON.parse(localStorage.getItem(UNKNOWN_KEY)), {}));
}

function saveUnknown(list) {
  storage(() => localStorage.setItem(UNKNOWN_KEY, JSON.stringify(list)));
}

// Avdelningen Okända låtar i Inställningar syns bara för den som har slagit på den med
// ?okanda=1 i adressen, på förstasidan eller här. Valet sparas på datorn, och ?okanda=0 slår av.
const SHOW_UNKNOWN_KEY = 'latquiz-visa-okanda';
const showUnknown = (() => {
  const param = new URLSearchParams(location.search).get('okanda');
  if (param === '1') storage(() => localStorage.setItem(SHOW_UNKNOWN_KEY, '1'));
  if (param === '0') storage(() => localStorage.removeItem(SHOW_UNKNOWN_KEY));
  return storage(() => localStorage.getItem(SHOW_UNKNOWN_KEY) === '1', false);
})();

function newCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return code;
}

function joinUrl() {
  const url = new URL('play.html', location.href);
  url.search = peerQuery();
  url.searchParams.set('kod', state.code);
  return url.toString();
}

// ---- Kommunikation ----

function sendState(connId) {
  const playerId = connToPlayer.get(connId);
  if (!playerId) return;
  net.send(connId, { type: 'state', view: viewFor(playerId) });
}

// Spelvyn för en spelare, med tiden kvar tills nästa låt startar av sig själv.
function viewFor(playerId) {
  const view = game.playerView(state, playerId, Date.now());
  const left = autoNextLeft();
  if (view.round && left !== null) Object.assign(view.round, { nextInMs: left, nextTotalMs: AUTO_NEXT_MS });
  // Vinnarlåten är ett Deezer-klipp. Då står Deezer på vinnarkortet.
  view.winnerClip = loadExtraSounds();
  // Spelarna vänder fram vinnaren när spelledaren gör det, det vill säga när vinnarlåten hörs.
  view.winnerDrum = Boolean(gameView && gameView.winnerDrum());
  view.winnerShown = Boolean(gameView && gameView.winnerShown());
  view.lobbyPlaying = lobbyPlaying();
  if (introLeft() > 0) Object.assign(view, { introMs: introLeft(), introTotalMs: INTRO_MS });
  const url = clipUrlForPlayers();
  if (url) view.clipUrl = url;
  const music = musicForPlayers();
  if (music) view.music = music;
  // Låten står på raden längst ner även i mobilerna, också när den bara spelas hos spelledaren.
  const playing = currentMusic();
  if (playing) view.nowMusic = playing;
  // Ändringar under en låt syns för spelarna direkt, fast de gäller först från nästa låt.
  if (pending) {
    view.upcoming = {
      categoryName: pending.category ? pending.category.name : view.categoryName,
      settings: { ...view.settings, ...pending.settings },
    };
  }
  return view;
}

function broadcast() {
  for (const connId of connToPlayer.keys()) sendState(connId);
}

// Ändringar som görs medan spelet pågår. De gäller när nästa låt startar, eller direkt om
// ingen låt har spelats än.
let pending = null;

function changed() {
  if (pending && !state.round) applyPending();
  save();
  broadcast();
  render();
}

function onMessage(connId, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'hello') {
    const name = String(msg.name || '').trim().slice(0, game.MAX_NAME);
    const playerId = String(msg.playerId || '').slice(0, 40);
    if (!name || !playerId) return;
    if (game.nameTaken(state, { id: playerId, name })) {
      net.send(connId, { type: 'name-taken', name });
      return;
    }
    // Samma spelare på en ny anslutning: släpp den gamla.
    for (const [otherConn, otherId] of connToPlayer) {
      if (otherId === playerId && otherConn !== connId) {
        connToPlayer.delete(otherConn);
        net.drop(otherConn);
      }
    }
    connToPlayer.set(connId, playerId);
    const isNew = !state.players[playerId];
    game.addPlayer(state, { id: playerId, name });
    changed();
    // Alla utom den nya spelaren får veta det. Den som ansluter igen är inte ny.
    if (isNew) {
      showJoined(name);
      for (const otherConn of connToPlayer.keys()) {
        if (otherConn !== connId) net.send(otherConn, { type: 'joined', name });
      }
    }
  } else if (msg.type === 'answer') {
    const playerId = connToPlayer.get(connId);
    if (!playerId) return;
    game.submitAnswer(state, playerId, msg.field, String(msg.value || '').slice(0, 200), Date.now());
    changed();
  } else if (msg.type === 'leave') {
    // Spelaren valde Lämna spelet. Den räknas som frånkopplad och får tillbaka poängen om den går med igen.
    const playerId = connToPlayer.get(connId);
    if (!playerId || !state.players[playerId]) return;
    const { name } = state.players[playerId];
    net.drop(connId);
    showLeft(name);
    for (const otherConn of connToPlayer.keys()) net.send(otherConn, { type: 'left', name });
  }
}

function onDisconnect(connId) {
  const playerId = connToPlayer.get(connId);
  connToPlayer.delete(connId);
  if (!playerId || [...connToPlayer.values()].includes(playerId)) return;
  game.setConnected(state, playerId, false);
  changed();
}

// Kontakten med förmedlingsservern bryts oftast när spelledaren har lämnat webbläsaren, till
// exempel för en annan app i mobilen. Meddelandet är därför allmänt, som hos spelarna.
const NET_MESSAGES = {
  relay: { kind: 'busy', title: 'Anslutningen bröts', text: 'Försöker ansluta igen…' },
  'unavailable-id': { kind: 'busy', title: 'Väntar på koden…', text: 'Spelet startar strax.' },
  network: { kind: 'busy', title: 'Ingen anslutning', text: 'Försöker ansluta igen…' },
};
let netTrouble = false;

function startNetwork() {
  net = createHost(state.code, {
    onReady: () => {
      if (netTrouble) showMessage({ key: 'net', kind: 'ok', title: 'Välkommen tillbaka!', text: 'Du är med i spelet igen.' });
      netTrouble = false;
    },
    onMessage,
    onDisconnect,
    onError: (type) => {
      netTrouble = true;
      showMessage({ key: 'net', ...(NET_MESSAGES[type] || { kind: 'problem', title: 'Anslutningsfel', text: type }) });
    },
  });
  ticker = startTicker(tick, 250);
}

// Webbläsare bromsar timers i flikar som inte syns, till exempel när spelledaren
// har bytt till en annan flik, ibland till en gång i minuten. En timer i en worker
// bromsas inte lika hårt, så svaret visas i tid ändå.
function startTicker(fn, ms) {
  try {
    const code = `setInterval(() => postMessage(0), ${ms});`;
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = fn;
    return { stop: () => worker.terminate() };
  } catch {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}

function tick() {
  checkAutoNext();
  if (!state.round || state.round.phase !== 'playing') return;
  if (game.shouldReveal(state, Date.now())) {
    // Klippet är längre än tiden per låt när spelledaren har valt en kortare tid.
    stopClip();
    game.reveal(state);
    changed();
  }
}

// Spelledarens eget svar, som om det kom från en spelare.
function hostAnswer(field, value) {
  if (!state) return;
  game.submitAnswer(state, state.hostId, field, value.slice(0, 200), Date.now());
  changed();
}

// ---- Spelets steg ----

// Namnet som spelledaren deltar med. Utan namn heter spelledaren Spelledare.
function hostName(name) {
  return String(name || '').trim().slice(0, game.MAX_NAME) || DEFAULT_HOST_NAME;
}

function hostNameTaken(name) {
  return game.nameTaken(state, { id: state.hostId, name: hostName(name) });
}

// Utan att delta behövs inget namn på startsidan, och spelledaren kan varken svara eller få poäng.
function setHostPlays(plays) {
  hostPlays = plays;
  $('#host-name-row').hidden = !plays;
  $('#host-name').required = plays;
  renderSettingsSummary();
}

// Raden Inställningar på Starta nytt spel visar vad som gäller. Ändra öppnar samma ruta som i menyn.
function renderSettingsSummary() {
  const s = loadSettings();
  // Samma ordning som i rutan Inställningar.
  const parts = [`${s.roundMs / 1000} s per låt`, s.bonusMs ? `Bonus inom ${s.bonusMs / 1000} s` : 'Ingen bonus', `Först till ${s.winScore} poäng`,
    ...(loadClipAll() ? ['Ljud på alla enheter'] : []), ...(loadExtraSounds() ? [] : ['Inga extraljud']),
    ...(loadAudioDelay() ? [`Ljud-/bildfördröjning ${delayShort(loadAudioDelay())}`] : []),
    ...(hostPlays ? [] : ['Jag deltar inte'])];
  // Raden bryts bara mellan delarna, inte mitt i till exempel Bonus inom 15 sekunder.
  $('#settings-text').textContent = parts.map((p) => p.replaceAll(' ', '\u00a0')).join(' · ');
}

async function startGame(categoryId, resumeState, name, plays = true) {
  await scriptsLoaded;
  const categories = await loadCategories();
  category = categories.find((c) => c.id === categoryId) || categories[0];
  songs = await loadSongs(category);
  if (resumeState) {
    state = resumeState;
    // Alla räknas som frånkopplade tills de hör av sig igen.
    for (const player of Object.values(state.players)) player.connected = false;
  } else {
    state = game.createGame({
      code: newCode(), categoryId: category.id, categoryName: category.name, labels: category.labels,
      settings: loadSettings(),
    });
    state.hostPlays = plays;
    state.clipAll = loadClipAll();
  }
  // Ett äldre sparat spel kan ha valt Spotify, som inte finns längre.
  delete state.music;
  state.clipAll = state.clipAll === true;
  // Spelledaren är en spelare som alltid är ansluten, om spelledaren deltar. Ett äldre sparat spel får spelledaren nu.
  if (!state.hostId) state.hostId = newId();
  game.setHostPlaying(state, state.hostPlays !== false,
    hostName(name || state.players[state.hostId]?.name || loadName()));
  // Även ett återupptaget spel från innan namnet sparades ska visa kategorin.
  state.categoryName = category.name;
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  // Går spelledaren tillbaka till ett spel har spelarna redan gått med, så QR-koden är stängd.
  showJoinInfo({ qrOpen: !resumeState });
  gameView = createGameView({ onAnswer: hostAnswer, onError: showError, onWinnerDrum: winnerDrum, onWinnerDrumShown: winnerShown, onWinnerShown: winnerShown, host: true });
  startNetwork();
  render();
}

// Bara låtar med Deezer-ID kan spelas, och inte de som är markerade som okända.
function playableSongs() {
  return withoutUnknown(loadUnknown(), category.id, songs).filter((song) => song.deezerId);
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  // Sparade inställningar gäller från och med den här låten. Inget väntas in här, eftersom
  // playDeezer måste anropas direkt från trycket på Starta spelet.
  if (pending && (!state.round || state.round.phase === 'revealed')) applyPending();
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  const playable = playableSongs();
  if (game.unplayedSongs(state, playable).length === 0) state.playedIds = [];
  const song = game.nextSong(state, playable);
  if (!song) return;
  changed();
  playDeezer(state.round.number);
}

// ---- Deezer-klipp ----

const clip = { audio: null, round: 0, status: null, error: '', skipped: 0 };
// Så många låtar i rad hoppas över när Deezer saknar klipp, innan spelledaren får veta det.
const MAX_SKIPS = 5;

// Klipplänken som spelarnas mobiler spelar, om spelledaren har valt det. Länken säger inte
// vilken låt det är, och den skickas inte längre när svaret visas.
function clipUrlForPlayers() {
  const round = state && state.round;
  if (!round || !state.clipAll || round.phase === 'revealed') return null;
  if (clip.round !== round.number || !clip.audio || !clip.audio.src.startsWith('http')) return null;
  return clip.audio.src;
}

// Väntemusiken, trumvirveln och vinnarlåten spelas också i spelarnas mobiler, i takt med
// spelledaren, när spelledaren har valt att spela ljud på alla enheter.
// Med ljudfördröjning hörs musiken senare i spelledarens högtalare, så mobilerna spelar så mycket
// längre bak i klippet.
function musicForPlayers() {
  const music = playerMusic();
  return music ? { ...music, posMs: Math.max(0, music.posMs - loadAudioDelay()) } : null;
}

function playerMusic() {
  if (!state.clipAll) return null;
  const lobby = lobbyWanted() && lobbyMusic.now();
  if (lobby) return { ...LOBBY_FADE, ...lobby };
  if (!state.winners || !loadExtraSounds()) return null;
  const winner = winnerSong.now();
  if (winner) return { ...WINNER_FADE, ...winner };
  const drum = winnerSong.drumNow();
  return drum ? { ...DRUM_FADE, ...drum } : null;
}

function clipAudio() {
  if (!clip.audio) {
    clip.audio = new Audio();
    // Väntemusikens och vinnarlåtens ljudmotor vilar medan quizlåten hörs, se rest i vinnarlat.js.
    clip.audio.addEventListener('playing', () => {
      if (!clip.audio.src.startsWith('http')) return;
      winnerSong.rest();
      lobbyMusic.rest();
    });
    for (const type of ['pause', 'ended']) {
      clip.audio.addEventListener(type, () => { winnerSong.wake(); lobbyMusic.wake(); });
    }
  }
  return clip.audio;
}

function stopClip() {
  if (clip.audio) clip.audio.pause();
}

// Måste anropas direkt från klicket. skipping: en låt utan klipp byts ut, utan nytt klick.
async function playDeezer(roundNumber, skipping = false) {
  const audio = clipAudio();
  audio.pause();
  audio.src = SILENCE;
  audio.play().catch(() => {});
  Object.assign(clip, { round: roundNumber, status: 'loading', error: '' });
  if (!skipping) clip.skipped = 0;
  render();
  let url = null;
  try {
    url = await findPreview(state.round.song);
  } catch (err) {
    clip.error = err.message;
  }
  // Spelledaren har gått vidare, eller visat svaret medan klippet laddades.
  if (!state.round || state.round.number !== roundNumber || state.round.phase !== 'ready') return;
  if (clip.error) {
    clip.status = 'error';
    render();
    return;
  }
  // Saknar Deezer klippet hoppas låten över och en annan slumpas.
  if (!url) {
    clip.skipped += 1;
    if (clip.skipped <= MAX_SKIPS && game.replaceSong(state, playableSongs())) {
      save();
      playDeezer(roundNumber, true);
      return;
    }
    clip.status = 'missing';
    render();
    return;
  }
  audio.src = url;
  // Spelarnas mobiler kan börja ladda klippet medan det laddas här.
  if (state.clipAll) broadcast();
  // Två klipp spelas aldrig samtidigt, så första låten väntar tills väntemusiken har tonat ut.
  await lobbyMusic.silent();
  await introDone();
  if (!state.round || state.round.number !== roundNumber || state.round.phase !== 'ready') return;
  // Under en paus väntar klippet tills spelledaren fortsätter.
  if (state.pausedAt) {
    clip.status = 'loaded';
    render();
    return;
  }
  startClip();
}

// Timern startar först när klippet hörs. Ljud-/bildfördröjningen gäller inte quizlåten, eftersom
// den inte behövdes där när Jonas provade med en blåtandshögtalare (24 oktober 2026).
function startClip() {
  const audio = clipAudio();
  audio.currentTime = 0;
  audio.play().then(() => {
    // Spelledaren kan ha pausat eller visat svaret medan klippet buffrades.
    if (!state.round || state.round.phase !== 'ready') { audio.pause(); return; }
    if (state.pausedAt) {
      audio.pause();
      clip.status = 'loaded';
      render();
      return;
    }
    clip.status = 'playing';
    if (game.startRound(state, Date.now())) changed();
  }).catch(() => {
    clip.status = 'blocked';
    render();
  });
}

function playClipClicked() {
  const round = state.round;
  if (!round || round.phase !== 'ready') return;
  if (clip.round === round.number && clip.status === 'missing') {
    if (game.replaceSong(state, playableSongs())) save();
    playDeezer(round.number);
    return;
  }
  if (clip.round === round.number && clip.audio && clip.audio.src.startsWith('http')) startClip();
  else playDeezer(round.number);
}

// Klippet har inte startat och behöver ett nytt tryck, till exempel när Deezer inte svarade.
const clipStuck = (round) => Boolean(round && round.phase === 'ready' && clip.round === round.number
  && ['error', 'missing', 'blocked'].includes(clip.status));

// Starta spelet i menyn försöker igen, med en ny låt om Deezer saknade klippen.
function clipMessage(round) {
  if (!clipStuck(round)) return null;
  const text = 'Välj Starta spelet i menyn för att försöka igen.';
  if (clip.status === 'error') return { kind: 'problem', title: clip.error.replace(/\.$/, ''), text };
  if (clip.status === 'missing') return { kind: 'problem', title: 'Inga klipp från Deezer', text };
  return { kind: 'problem', title: 'Klippet startade inte', text };
}

// Meddelandet visas när klippets läge ändras, inte vid varje render, så att det inte tar över
// ett nyare meddelande om anslutningen.
let clipShown = null;
function updateClipMessage(round) {
  const msg = clipMessage(round);
  const id = msg ? msg.title : null;
  if (id === clipShown) return;
  clipShown = id;
  if (msg) showMessage({ key: 'clip', ...msg });
  else hideMessage('clip');
}

// Strömbrytaren i Inställningar, likadan som i Utseende. Gäller direkt, utan att spelledaren behöver spara.
function currentUnknown() {
  const song = state.round && state.round.song;
  return Boolean(song) && isUnknown(loadUnknown(), category.id, song.id);
}

function toggleCurrentUnknown() {
  const song = state.round && state.round.song;
  if (song) saveUnknown(toggleUnknown(loadUnknown(), category.id, song));
}

// Låtens titel visas inte, eftersom spelledaren också gissar.
function unknownCheckbox() {
  const song = state && state.round && state.round.song;
  if (!song) return '';
  return `
    <div class="current-song">
      <button type="button" class="theme-switch" id="mark-unknown"></button>
    </div>`;
}

// Spelarna får veta att en ny match har börjat. Spelledaren har själv valt det.
function restart() {
  stopClip();
  game.restart(state);
  changed();
  for (const connId of connToPlayer.keys()) net.send(connId, { type: 'new-match' });
}

// Pausen stoppar timern, klippet och nedräkningen till nästa låt.
function pauseGame() {
  if (!game.pause(state, Date.now())) return;
  stopClip();
  changed();
}

function resumeGame() {
  if (!state.pausedAt) return;
  autoNext.at += game.resume(state, Date.now());
  if (state.round.phase === 'playing' && clip.status === 'playing' && clip.audio) clip.audio.play().catch(() => {});
  // Pausades spelet medan klippet laddades startar låten nu.
  if (state.round.phase === 'ready' && clip.round === state.round.number && clip.status === 'loaded') startClip();
  changed();
}

async function endGame() {
  const ok = await showConfirm('Poängen försvinner och spelarna kopplas bort.', {
    title: 'Avsluta spelet?', okText: 'Avsluta', danger: true, icon: MENU_ICONS.leave,
  });
  if (!ok) return;
  leaving = true;
  storage(() => localStorage.removeItem(SAVE_KEY));
  stopClip();
  winnerSong.stop();
  lobbyMusic.stop();
  // Spelarna får veta att spelet är slut, så att de inte tror att anslutningen bara bröts.
  // En kort stund behövs för att meddelandet ska hinna fram innan anslutningarna stängs.
  if (net) {
    for (const connId of connToPlayer.keys()) net.send(connId, { type: 'ended' });
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    net.destroy();
  }
  if (ticker) ticker.stop();
  // Tillbaka till startsidan, med eventuella testparametrar.
  location.href = 'index.html' + location.search;
}

// short: den korta texten på segmentet. text: hela texten, som skärmläsare läser.
const SETTING_FIELDS = [
  { key: 'roundMs', label: 'Tid per låt', short: (v) => `${v / 1000} s`, text: (v) => `${v / 1000} sekunder per låt` },
  { key: 'bonusMs', label: 'Bonus för snabbt svar', short: (v) => (v ? `${v / 1000} s` : 'Av'), text: (v) => (v ? `Inom ${v / 1000} sekunder` : 'Ingen bonus') },
  { key: 'winScore', label: 'Poänggräns', short: (v) => String(v), text: (v) => `Först till ${v} poäng` },
];

// Ett fåtal val står sida vid sida som en segmentväljare, som i iPhone. Valen är radioknappar,
// så att piltangenterna byter val och formuläret läser värdet som förut.
function segmented(name, label, choices) {
  return `<fieldset class="segmented-field"><legend>${label}</legend><div class="segmented">
    ${choices.map(({ value, short, text, checked }) => `<label><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>`
      + `<span aria-hidden="true">${esc(short)}</span><span class="visually-hidden">${esc(text)}</span></label>`).join('')}
  </div></fieldset>`;
}

// Okända låtar kopieras som text och skickas vidare, så att de tas bort ur kategorin.
// Allt om okända låtar ligger i samma avdelning. Under ett spel gäller den aktuella låten.
function unknownGroup(checkbox, list) {
  if (!showUnknown || (!checkbox && !list)) return '';
  return `<div class="unknown-group"><h3>Okända låtar</h3>${checkbox}${list}</div>`;
}

function unknownSection(count) {
  if (!count) return '';
  return `
    <div class="unknown-songs">
      <p class="unknown-actions">
        <button type="button" id="copy-unknown" class="link">Kopiera okända låtar (${count})</button>
        <button type="button" id="clear-unknown" class="link">Rensa</button>
      </p>
      <p id="unknown-status" class="note" role="status"></p>
      <textarea id="unknown-text" class="unknown-text" readonly rows="6" aria-label="Okända låtar" hidden></textarea>
    </div>`;
}

function wireUnknown(dialog, names) {
  const copy = dialog.querySelector('#copy-unknown');
  if (!copy) return;
  const status = dialog.querySelector('#unknown-status');
  copy.addEventListener('click', async () => {
    const text = formatUnknown(loadUnknown(), names);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Kopierat. Klistra in listan i projektet, så tas låtarna bort ur kategorierna.';
    } catch {
      // Utan tillgång till urklipp visas texten, så att den kan kopieras för hand.
      const area = dialog.querySelector('#unknown-text');
      area.value = text;
      area.hidden = false;
      area.focus();
      area.select();
      status.textContent = 'Kopiera texten nedan.';
    }
  });
  dialog.querySelector('#clear-unknown').addEventListener('click', async () => {
    const ok = await showConfirm('Låtarna spelas igen i kommande spel. Kopiera listan först om den inte är skickad.', {
      title: 'Rensa okända låtar?', okText: 'Rensa', danger: true, icon: MENU_ICONS.delete,
    });
    if (!ok) return;
    saveUnknown({});
    dialog.querySelector('.unknown-songs').remove();
    const group = dialog.querySelector('.unknown-group');
    if (!group.querySelector('.current-song')) group.remove();
  });
}

// Strömbrytaren Jag deltar i spelet står i Inställningar, både före och under spelet.
function currentHost() {
  if (!state) return { plays: hostPlays };
  if (pending && pending.host) return pending.host;
  return { plays: state.hostPlays !== false };
}

// Namnet som spelledaren redan har angett, i spelet eller i ett tidigare spel. Spelledare räknas inte.
function knownHostName() {
  const player = state && (state.players[state.hostId] || state.benchedHost);
  if (player && player.name && player.name !== DEFAULT_HOST_NAME) return player.name;
  if (pending && pending.host && pending.host.name !== DEFAULT_HOST_NAME) return pending.host.name;
  return loadName();
}

// Namnfältet under strömbrytarna, där Jag deltar i spelet står. Före spelet står namnet på
// startsidan. Under spelet visas namnfältet bara om spelledaren inte har angett något namn
// tidigare. Lämnas det tomt heter spelledaren Spelledare.
function hostNameRow() {
  const askName = Boolean(state) && !knownHostName();
  return askName ? `
    <div id="setting-host-name-row" class="field-group host-name-row"><div class="field-row">
      <label for="setting-host-name">Namn</label>
      <input id="setting-host-name" name="hostName" maxlength="${game.MAX_NAME}" autocomplete="nickname"
        placeholder="${DEFAULT_HOST_NAME}">
    </div></div>` : '';
}

// Returnerar en funktion som ger { plays, name }. Ett namn som en spelare redan har
// stoppar Spara, så att två inte heter likadant.
function wireHostPlays(dialog) {
  let on = currentHost().plays;
  const row = dialog.querySelector('#setting-host-name-row');
  const input = dialog.querySelector('#setting-host-name');
  const update = () => { if (row) row.hidden = !on; };
  mountSwitch(dialog.querySelector('#setting-host-plays'), 'Jag deltar i spelet', () => on, () => { on = !on; update(); });
  update();
  if (input) {
    input.addEventListener('input', () => input.setCustomValidity(''));
    dialog.querySelector('form').addEventListener('submit', (e) => {
      if (e.submitter?.value !== 'ok' || !on || !hostNameTaken(input.value)) return;
      e.preventDefault();
      input.setCustomValidity(`${hostName(input.value)} är redan med i spelet. Välj ett annat namn.`);
      input.reportValidity();
    });
  }
  return () => ({ plays: on, name: hostName(input ? input.value : knownHostName()) });
}

// Bonustider som inte är kortare än tiden per låt går inte att välja. Var en sådan vald byts den
// mot den längsta som går, samma val som cleanSettings gör.
function wireBonus(dialog) {
  const form = dialog.querySelector('form');
  const update = () => {
    const roundMs = Number(new FormData(form).get('roundMs'));
    const inputs = [...form.querySelectorAll('input[name=bonusMs]')];
    for (const input of inputs) input.disabled = !game.bonusAllowed(Number(input.value), roundMs);
    const checked = inputs.find((input) => input.checked);
    if (checked && checked.disabled) inputs.filter((input) => !input.disabled).at(-1).checked = true;
  };
  for (const input of form.querySelectorAll('input[name=roundMs]')) input.addEventListener('change', update);
  update();
}

// Returnerar de valda inställningarna, eller null om spelledaren avbryter.
// I ett pågående spel finns även kategorin med. Den returneras som categoryId.
// names: kategoriernas namn, som används när okända låtar kopieras.
// running: ett spel pågår.
// clipAll: klippet spelas även i spelarnas mobiler.
// extraSounds: väntemusiken, trumvirveln och vinnarlåten spelas.
// audioDelay: ljudfördröjningen för en blåtandshögtalare, i millisekunder.
function showSettings(current, categories = null, categoryId = null, names = {}, { running = false, clipAll = false, extraSounds = true, audioDelay = 0 } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="settings-title">Inställningar</h2>
      <div class="settings-group">
      ${categories ? `
        <div class="setting-row"><label for="setting-category">Kategori</label>
        <select id="setting-category" name="categoryId">
          ${categories.map((c) => `<option value="${esc(c.id)}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>` : ''}
      ${SETTING_FIELDS.map(({ key, label, short, text }) => segmented(key, label,
        game.SETTING_CHOICES[key].map((v) => ({ value: v, short: short(v), text: text(v), checked: v === current[key] })))).join('')}
      </div>
      <div class="switches clip-all"><button type="button" class="theme-switch" id="setting-clip-all"></button><button type="button" class="theme-switch" id="setting-extra-sounds"></button><button type="button" class="theme-switch" id="setting-host-plays"></button></div>
      ${hostNameRow()}
      <div class="settings-group audio-delay">
      ${segmented('audioDelay', 'Ljud-/bildfördröjning', DELAY_CHOICES.map((v) => ({ value: v, short: delayShort(v), text: delayText(v), checked: v === audioDelay })))}
      </div>
      ${unknownGroup(running ? unknownCheckbox() : '', unknownSection(countUnknown(loadUnknown())))}
      <div class="modal-actions">
        <button value="cancel" class="secondary">Avbryt</button>
        <button value="ok">Spara</button>
      </div>
    </form>`;
  // En rullista skickar inte formuläret med Enter, så Enter sparar här. I namnfältet skulle
  // Enter annars trycka på formulärets första knapp, Avbryt.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) {
      e.preventDefault();
      e.stopPropagation(); // annars startar Enter även spelet
      dialog.querySelector('[value=ok]').click();
    }
  });
  wireUnknown(dialog, names);
  wireBonus(dialog);
  const host = wireHostPlays(dialog);
  let clipOn = clipAll;
  mountSwitch(dialog.querySelector('#setting-clip-all'), 'Spela ljud på alla enheter', () => clipOn, () => { clipOn = !clipOn; });
  let soundsOn = extraSounds;
  mountSwitch(dialog.querySelector('#setting-extra-sounds'), 'Spela extraljud', () => soundsOn, () => { soundsOn = !soundsOn; });
  const mark = dialog.querySelector('#mark-unknown');
  // Antalet i länken följer strömbrytaren.
  const copyUnknown = dialog.querySelector('#copy-unknown');
  if (mark) mountSwitch(mark, 'Denna låt är okänd', currentUnknown, () => {
    toggleCurrentUnknown();
    if (copyUnknown) copyUnknown.textContent = `Kopiera okända låtar (${countUnknown(loadUnknown())})`;
  });
  // Rutan själv får fokus, inte första valet, så att inget ser markerat ut i mobilen.
  // Skärmläsaren läser rubriken, och Tab går till valen.
  dialog.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', 'settings-title');
  document.body.append(dialog);
  dragToClose(dialog);
  const categorySelect = dialog.querySelector('#setting-category');
  if (categorySelect) enhanceSelect(categorySelect, { touch: true });
  dialog.showModal();
  dialog.focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const form = dialog.querySelector('form');
      const values = Object.fromEntries(new FormData(form));
      resolve(dialog.returnValue === 'ok'
        ? {
          ...game.cleanSettings(values),
          ...(categories ? { categoryId: values.categoryId } : {}),
          clipAll: clipOn,
          extraSounds: soundsOn,
          audioDelay: cleanDelay(values.audioDelay),
          host: host(),
        } : null);
      dialog.remove();
    }, { once: true });
  });
}

// Under spelet sparas ändringarna och gäller från nästa låt.
async function editSettings() {
  const all = await loadCategories();
  const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
  const categories = state ? all : null;
  const current = pending ? pending.settings : state ? game.cleanSettings(state) : loadSettings();
  const currentCategory = pending && pending.category ? pending.category.id : category && category.id;
  const clipAll = pending ? pending.clipAll : state ? state.clipAll : loadClipAll();
  const chosen = await showSettings(current, categories, currentCategory, names,
    { running: Boolean(state), clipAll, extraSounds: loadExtraSounds(), audioDelay: loadAudioDelay() });
  if (!chosen) return;
  const { categoryId, host, clipAll: chosenClipAll, extraSounds: chosenExtraSounds, audioDelay, ...settings } = chosen;
  // Ljudfördröjningen gäller enheten, från nästa gång ett ljud börjar.
  saveAudioDelay(audioDelay);
  // Extraljuden gäller enheten direkt. Vinnarlåten tystnar om de stängs av, och väntemusiken
  // börjar eller tystnar direkt medan spelarna går med.
  saveExtraSounds(chosenExtraSounds);
  if (!chosenExtraSounds) winnerSong.stop();
  saveSettings(settings);
  saveClipAll(chosenClipAll);
  if (!state) {
    setHostPlays(host.plays);
    return;
  }
  if (host.plays && host.name !== DEFAULT_HOST_NAME) storage(() => localStorage.setItem(NAME_KEY, host.name));
  const picked = categoryId && categoryId !== category.id ? categories.find((c) => c.id === categoryId) : null;
  // Låtarna laddas redan nu, så att kategorin kan bytas utan väntan när nästa låt startar.
  const pickedSongs = picked ? await loadSongs(picked) : null;
  pending = { settings, category: picked, songs: pickedSongs, host, clipAll: chosenClipAll };
  // Har ingen låt spelats än gäller ändringen direkt. Det avgör changed().
  changed();
  // Gäller ändringen först från nästa låt får spelledaren veta det, men bara om något ändrades.
  // Ett fel eller något som pågår får stå kvar.
  const shown = currentMessage();
  if (shown && (shown.kind === 'problem' || shown.kind === 'busy')) return;
  if (pending && pendingDiffers()) {
    showMessage({ key: 'settings', kind: 'info', title: 'Spelet ändrades', text: 'Ändringarna gäller från nästa låt.', ms: SETTINGS_MESSAGE_MS });
  }
}

const SETTINGS_MESSAGE_MS = 4000;

// Skiljer sig de sparade ändringarna från det som gäller nu?
function pendingDiffers() {
  const { settings, category: picked, host, clipAll } = pending;
  const now = game.cleanSettings(state);
  if (Object.keys(now).some((key) => now[key] !== settings[key])) return true;
  if (picked || clipAll !== state.clipAll) return true;
  if (!host) return false;
  if (host.plays !== (state.hostPlays !== false)) return true;
  const me = state.players[state.hostId];
  return Boolean(host.plays && me && me.name !== host.name);
}

function applyPending() {
  const { settings, category: picked, songs: pickedSongs, host, clipAll } = pending;
  pending = null;
  game.applySettings(state, settings);
  state.clipAll = clipAll;
  // En spelare kan ha tagit namnet medan låten pågick. Då heter spelledaren Spelledare.
  if (host) game.setHostPlaying(state, host.plays, hostNameTaken(host.name) ? DEFAULT_HOST_NAME : host.name);
  // Poängen och spelade låtar finns kvar.
  if (picked && game.changeCategory(state, { categoryId: picked.id, categoryName: picked.name, labels: picked.labels })) {
    stopClip();
    category = picked;
    songs = pickedSongs;
  }
}

// ---- Visning ----

function showJoinInfo({ qrOpen = true } = {}) {
  const url = joinUrl();
  $('#code').textContent = state.code;
  setQrVisible(qrOpen);
  $('#join-url').textContent = url;
  $('#join-url').href = url;
  $('#join-url-row').hidden = true;
  $('#copy-status').textContent = '';
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

// Länken kopieras, så att spelledaren kan skicka den till spelarna. Utan tillgång till
// urklipp visas länken i stället, så att den kan kopieras för hand.
let copiedTimer = null;
$('#copy-link').addEventListener('click', async () => {
  const button = $('#copy-link');
  const status = $('#copy-status');
  try {
    await navigator.clipboard.writeText(joinUrl());
    button.textContent = 'länken (kopierad)';
    status.textContent = 'Länken är kopierad';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { button.textContent = 'länken'; status.textContent = ''; }, 3000);
  } catch {
    $('#join-url-row').hidden = false;
    status.textContent = '';
  }
});

// QR-koden kan stängas när alla har gått med. Den visas alltid i ett nytt spel, men inte när
// spelledaren går tillbaka till ett spel.
function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
  $('#game').classList.toggle('qr-hidden', !visible);
}

// QR-koden visas överst, och sidan rullar upp så att den syns.
function showQr() {
  setQrVisible(true);
  scrollToTop();
}

// Pausa spelet och Starta spelet delar rad i menyn. Raden finns från första låten tills någon har
// vunnit. Starta spelet fortsätter efter en paus, eller försöker igen när klippet inte startade.
// Medan spelarna går med står Starta spelet här, som knappen i vyn.
function pauseItem() {
  const round = state.round;
  if (!round && !state.winners) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: startClicked }];
  if (!round || state.winners) return [];
  if (state.pausedAt) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: resumeGame }];
  if (clipStuck(round)) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: playClipClicked }];
  return [{ label: 'Pausa spelet', icon: MENU_ICONS.pause, action: pauseGame }];
}

// I spelet finns Pausa spelet, QR-koden, inställningarna och Avsluta spelet i menyn. Före spelet
// samma rader som på startsidan.
function menuGroups() {
  const settings = { label: 'Inställningar', icon: MENU_ICONS.settings, action: editSettings };
  if (!state) return [startItems(), [settings], commonItems()];
  return [
    [...pauseItem(), { label: 'Visa QR-kod', icon: MENU_ICONS.qr, action: showQr, disabled: !$('#join-info').hidden }, settings],
    commonItems(),
    [{ label: 'Avsluta spelet', icon: MENU_ICONS.leave, action: endGame }],
  ];
}

// Nästa låt startar av sig själv en stund efter att svaret visats.
const AUTO_NEXT_MS = 10000;
let autoNext = { round: 0, at: 0 };

function autoNextLeft() {
  const round = state.round;
  if (!round || round.phase !== 'revealed' || state.winners) return null;
  if (autoNext.round !== round.number) autoNext = { round: round.number, at: Date.now() + AUTO_NEXT_MS };
  // Under en paus står nedräkningen still.
  return Math.max(0, autoNext.at - (state.pausedAt || Date.now()));
}

// Anropas av tickern. Nästa låt startar även om en ruta som Inställningar är öppen, eftersom
// spelarna ser nedräkningen. Ändringar i rutan gäller då från låten efter.
function checkAutoNext() {
  const left = autoNextLeft();
  if (left === null || state.pausedAt) return;
  if (left > 0) return;
  nextSong();
}

// Starta spelet i vyn startar första låten. QR-koden behövs inte längre när spelet har startat.
// Den kan visas igen i menyn.
function startClicked() {
  if (!state || state.round) return;
  setQrVisible(false);
  startIntro();
  nextSong();
  // Spelledaren kan ha scrollat ner till knappen i rutan. Låten ska synas överst.
  scrollToTop();
}

// Texten innan vinnaren visas. Då spelas en trumvirvel, om vinnarlåten är på, och låten börjar när
// virveln är slut. Vinnarvyn tar över när låten hörs, eller när virveln är slut om ingen låt spelas.
// Med ljud-/bildfördröjning vänds rubriken och vinnarkortet när ljudet hörs i högtalaren.
// Vinnarlåten tonar in under första sekunden och känns därför senare än virveln, så vinnarkortet
// väntar WINNER_FADE_WAIT_MS extra (uppmätt med blåtandshögtalare 24 oktober 2026).
const WINNER_FADE_WAIT_MS = 500;
function winnerDrum() {
  if (!loadExtraSounds()) return null;
  const delay = loadAudioDelay();
  const drum = after(winnerSong.drum(), delay);
  return { drum, song: after(winnerSong.play(), delay ? delay + WINNER_FADE_WAIT_MS : 0) };
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
  // Vinnarlåten tystnar när en ny match börjar.
  if (!state.winners) winnerSong.stop();
  updateLobbyMusic();
  showNowMusic($('#now-music'), currentMusic());
  gameView.update(viewFor(state.hostId), state.hostId);
  const round = state.round;
  $('#start-game').hidden = Boolean(round);
  // Spela igen går att starta först när vinnarvyn har tagit över efter sista låten.
  $('#new-match').hidden = !(state.winners && gameView.winnerShown());
  updateClipMessage(round);
  // Första låten kan starta medan Inställningar är öppen. Denna låt är okänd gäller då den låt
  // som spelas nu.
  const mark = document.querySelector('dialog[open] #mark-unknown');
  if (mark) mark.setAttribute('aria-checked', String(currentUnknown()));
}

function showError(err) {
  showMessage({ key: 'error', kind: 'problem', title: 'Något gick fel', text: err.message });
}

// ---- Start ----

// Vinnarlåten spelas utan tryck när vinnaren visas. Ljudmotorn får det bara om den har startats
// av ett tryck tidigare, så varje tryck hos spelledaren startar den.
// iPhone räknar ibland bara touchend och click som tryck, så alla fyra lyssnas på.
// Medan låten spelas görs det inte. Då är spelledarens tryck och tangenter nästan bara svar i
// fälten, och ljudmotorn och ljudläget som startades om vid varje tryck kunde få klippet att
// hacka till på iPhone. Trycken mellan låtarna räcker för att hålla ljudet upplåst.
function unlockSound() {
  if (clip.audio && !clip.audio.paused) return;
  winnerSong.unlock();
  lobbyMusic.unlock();
}
for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(type, unlockSound, true);

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  // Knapparna i vyn försvinner när de har tryckts, så fokus flyttas vidare. Spelvyn rullar upp
  // till väntetexten och Starta spelet efter Spela igen, både hos spelledaren och spelarna.
  if (id === 'start-game') { startClicked(); $('#game .menu-button').focus({ preventScroll: true }); }
  else if (id === 'new-match') { restart(); $('#start-game').focus({ preventScroll: true }); }
  else if (id === 'settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
});

// Safari på iPhone visar bara :active-läget när sidan lyssnar på touchstart.
document.addEventListener('touchstart', () => {}, { passive: true });

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#start-game', '#new-match'];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (document.querySelector('dialog[open]')) return; // modalen sköter sig själv
  if (e.target.closest('button, a, input, textarea')) return; // fokuserade knappar och länkar trycks redan
  const target = ENTER_TARGETS.map((sel) => $(sel)).find((el) => el && el.offsetParent && !el.disabled);
  if (!target) return;
  e.preventDefault();
  target.click();
});

// Varnar om fliken stängs av misstag mitt i ett spel, men inte när
// spelledaren själv har avslutat det.
let leaving = false;

// Fliken stängs eller sidan laddas om. Spelet kan återupptas, så spelarna får veta att
// spelledaren har lämnat och kanske kommer tillbaka. Meddelandet hinner inte alltid fram.
window.addEventListener('pagehide', () => {
  if (leaving || !net) return;
  for (const connId of connToPlayer.keys()) net.send(connId, { type: 'leaving' });
});

window.addEventListener('beforeunload', (e) => {
  if (leaving) return;
  if (state) e.preventDefault();
});

// Kategorierna står redan i host.html, så att sidan inte blinkar till.
// Här uppdateras de från listan och det val som redan är gjort behålls.
function renderCategories(categories) {
  const picker = $('#category-picker');
  const chosen = chosenCategory();
  picker.innerHTML = categories.map((c) => `<label class="cat-option"><input type="radio" name="category" value="${esc(c.id)}" class="visually-hidden">`
    + `<span class="tile" data-kategori="${esc(c.id)}"></span><span class="cat-name">${esc(hyphenate(c.name))}`
    + `${c.songs ? `<span class="cat-songs">${c.songs} låtar</span>` : ''}</span></label>`).join('');
  $('.cat-count').textContent = `${categories.length} kategorier`;
  $('#category-select').innerHTML = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const radios = [...picker.querySelectorAll('input')];
  (radios.find((r) => r.value === chosen) || radios[0]).checked = true;
  $('#category-select').value = chosenCategory();
  showChosenCategory({ scroll: true });
}

// Namnen står under smala omslag. Melodifestivalen får ett mjukt bindestreck, så att det
// bryts som Melodi-festivalen i stället för mitt i ett ord eller utanför omslaget.
const hyphenate = (name) => name.replace('Melodifestivalen', 'Melodi\u00adfestivalen');

const chosenCategory = () => ($('#category-picker input:checked') || {}).value;

// Sidans ljus får den valda kategorins färger. När sidan visas rullas det valda omslaget fram.
function showChosenCategory({ scroll = false } = {}) {
  document.documentElement.dataset.kategori = chosenCategory() || '';
  if (!scroll) return;
  // Bara raden rullas i sidled, inte sidan.
  const picker = $('#category-picker');
  const option = $('#category-picker input:checked').parentElement;
  const left = option.offsetLeft - picker.offsetLeft - 16;
  if (left < picker.scrollLeft || left + option.offsetWidth + 32 > picker.scrollLeft + picker.clientWidth) picker.scrollLeft = left;
}

// PeerJS och QR-koden laddas efter den här modulen, så att startsidan visas utan
// att vänta på dem. Ett snabbt klick väntar in dem innan spelet startar.
const scriptsLoaded = new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else document.addEventListener('DOMContentLoaded', resolve, { once: true });
});

async function init() {
  mountMenu($('#setup'), menuGroups);
  mountMenu($('#game'), menuGroups);
  renderSettingsSummary();
  $('#host-name').value = loadName();
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#host-name').value.trim().slice(0, game.MAX_NAME);
    if (hostPlays && !name) return;
    if (hostPlays) storage(() => localStorage.setItem(NAME_KEY, name));
    startGame(chosenCategory(), null, hostPlays ? name : '', hostPlays);
  });
  // I mobilen väljs kategorin bland omslag och på dator i en rullgardin. De två hålls lika.
  enhanceSelect($('#category-select'));
  $('#category-picker').addEventListener('change', () => {
    $('#category-select').value = chosenCategory();
    showChosenCategory();
  });
  $('#category-select').addEventListener('change', (e) => {
    const radio = [...$('#category-picker').querySelectorAll('input')].find((r) => r.value === e.target.value);
    if (radio) radio.checked = true;
    showChosenCategory({ scroll: true });
  });
  const saved = loadSaved();
  if (saved) {
    const resume = $('#resume');
    resume.hidden = false;
    resume.querySelector('button').textContent = `Tillbaka till ${saved.code}`;
    resume.querySelector('button').addEventListener('click', () => startGame(saved.categoryId, saved));
  }
  renderCategories(await loadCategories());
}

init().catch(showError);
