// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs, spotifyUrl, spotifyAppUrl } from './data.js';
import { findPreview } from './deezer.js';
import { showAlert, showConfirm } from './dialog.js';
import { hideMessage, showJoined, showLeft, showMessage } from './meddelande.js';
import { createGameView, esc } from './spelvy.js';
import { scrollToTop } from './ui.js';
import { mountSwitch } from './theme.js';
import { ICONS as MENU_ICONS, commonItems, mountMenu, startItems } from './meny.js';
import { UNKNOWN_KEY, cleanUnknown, countUnknown, formatUnknown, isUnknown, toggleUnknown, withoutUnknown } from './okanda.js';

const SAVE_KEY = 'latquiz-host';
const NAME_KEY = 'latquiz-namn';
const SETTINGS_KEY = 'latquiz-settings';
const MUSIC_KEY = 'latquiz-musik';
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

// Musiktjänsten väljs i Inställningar. Deezer spelar klippet i sidan, Spotify öppnar låten
// i spelledarens Spotify-app. Senaste valet gäller nästa spel.
const MUSIC_SERVICES = [{ id: 'deezer', name: 'Deezer' }, { id: 'spotify', name: 'Spotify' }];

function cleanMusic(value) {
  return value === 'spotify' ? 'spotify' : 'deezer';
}

function loadMusic() {
  return cleanMusic(storage(() => localStorage.getItem(MUSIC_KEY), null));
}

function saveMusic(music) {
  storage(() => localStorage.setItem(MUSIC_KEY, music));
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
  view.deezer = usesDeezer();
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

// Ändringar som görs medan en låt pågår. De gäller när svaret har visats.
let pending = null;

function changed() {
  if (pending && (!state.round || state.round.phase === 'revealed')) applyPending();
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
// exempel för Spotify i mobilen. Meddelandet är därför allmänt, som hos spelarna.
const NET_MESSAGES = {
  relay: { kind: 'busy', title: 'Anslutningen bröts', text: 'Försöker ansluta igen…' },
  'unavailable-id': { kind: 'busy', title: 'Väntar på koden…', text: 'Spelet startar strax.' },
  network: { kind: 'busy', title: 'Ingen anslutning', text: 'Försöker ansluta igen…' },
};
let netTrouble = false;

function startNetwork() {
  net = createHost(state.code, {
    onReady: () => {
      if (netTrouble) showMessage({ key: 'net', kind: 'ok', title: 'Ansluten', text: 'Du är med i spelet igen.' });
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
// har bytt till Spotify, ibland till en gång i minuten. En timer i en worker
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
  const music = MUSIC_SERVICES.find((m) => m.id === loadMusic()).name;
  // Samma ordning som i rutan Inställningar.
  const parts = [s.bonusMs ? `Bonus inom ${s.bonusMs / 1000} s` : 'Ingen bonus', `Först till ${s.winScore} poäng`, music,
    hostPlays ? 'Jag deltar' : 'Jag deltar inte'];
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
    state.music = loadMusic();
  }
  // Ett äldre sparat spel spelar med Deezer.
  state.music = cleanMusic(state.music);
  // Spelledaren är en spelare som alltid är ansluten, om spelledaren deltar. Ett äldre sparat spel får spelledaren nu.
  if (!state.hostId) state.hostId = newId();
  game.setHostPlaying(state, state.hostPlays !== false,
    hostName(name || state.players[state.hostId]?.name || loadName()));
  // Även ett återupptaget spel från innan namnet sparades ska visa kategorin.
  state.categoryName = category.name;
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  showJoinInfo();
  gameView = createGameView({ onAnswer: hostAnswer, onError: showError, host: true });
  startNetwork();
  render();
}

// Bara låtar som finns hos den valda musiktjänsten kan spelas, och inte de som är markerade som okända.
function playableSongs() {
  const key = usesDeezer() ? 'deezerId' : 'spotifyId';
  return withoutUnknown(loadUnknown(), category.id, songs).filter((song) => song[key]);
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  if (Date.now() - revealedAt < DOUBLE_TAP_MS) return;
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  const playable = playableSongs();
  if (game.unplayedSongs(state, playable).length === 0) state.playedIds = [];
  const song = game.nextSong(state, playable);
  if (!song) return;
  if (usesDeezer()) {
    changed();
    playDeezer(state.round.number);
    return;
  }
  // Ett tryck räcker: låten öppnas i Spotify och timern startar direkt.
  game.startRound(state, Date.now());
  changed();
  openSpotify(song);
}

// I mobilen frågar webbläsaren varje gång en spotify:-länk ska öppna appen. Den vanliga
// länken till open.spotify.com öppnar i stället appen direkt, om den finns.
const MOBILE = window.matchMedia('(pointer: coarse)').matches;

// Måste anropas direkt från klicket, annars kan webbläsaren stoppa öppnandet.
function openSpotify(song) {
  const app = spotifyAppUrl(song);
  if (!app || MOBILE) {
    window.open(spotifyUrl(song), '_blank', 'noopener');
    return;
  }
  const link = document.createElement('a');
  link.href = app;
  document.body.append(link);
  link.click();
  link.remove();
}

// ---- Deezer-klipp ----

// En kort tystnad som spelas direkt i klicket. Då räknas ljudet som startat av
// spelledaren, och klippet får spela fast det hämtas först efteråt (Safari).
const SILENCE = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const clip = { audio: null, round: 0, status: null, error: '', skipped: 0 };
// Så många låtar i rad hoppas över när Deezer saknar klipp, innan spelledaren får veta det.
const MAX_SKIPS = 5;

// Med Spotify som musiktjänst öppnas alla låtar i Spotify, som när Deezer saknar klipp.
function usesDeezer() {
  return Boolean(category && category.audio === 'deezer' && (!state || state.music !== 'spotify'));
}

function clipAudio() {
  if (!clip.audio) clip.audio = new Audio();
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
  // Saknar Deezer klippet hoppas låten över och en annan slumpas, utan att spela den i Spotify.
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
  // Under en paus väntar klippet tills spelledaren fortsätter.
  if (state.pausedAt) {
    clip.status = 'loaded';
    render();
    return;
  }
  startClip();
}

// Timern startar först när klippet hörs.
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

// Spela försöker igen, med en ny låt om Deezer saknade klippen.
function clipMessage(round) {
  if (!round || round.phase === 'revealed' || !usesDeezer() || clip.round !== round.number) return null;
  if (clip.status === 'error') return { kind: 'problem', title: clip.error.replace(/\.$/, ''), text: 'Tryck på spela för att försöka igen.' };
  if (clip.status === 'missing') return { kind: 'problem', title: 'Inga klipp från Deezer', text: 'Tryck på spela för att försöka igen.' };
  if (clip.status === 'blocked') return { kind: 'problem', title: 'Klippet startade inte', text: 'Tryck på spela igen.' };
  return null;
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

function startRound() {
  if (game.startRound(state, Date.now())) changed();
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

// Samma knapp visar svaret och startar nästa låt. Ett dubbeltryck ska inte hoppa över svaret.
const DOUBLE_TAP_MS = 1000;
let revealedAt = 0;

function revealNow() {
  // Medan klippet laddas har låten inte börjat. Svaret kan ändå visas direkt.
  if (state.round && state.round.phase === 'ready') {
    stopClip();
    game.startRound(state, Date.now());
  }
  if (!game.reveal(state)) return;
  revealedAt = Date.now();
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

// Före spelet står namnet på startsidan. Under spelet visas namnfältet bara om spelledaren
// inte har angett något namn tidigare. Lämnas det tomt heter spelledaren Spelledare.
function hostPlaysGroup() {
  const askName = Boolean(state) && !knownHostName();
  return `
    <div class="host-plays-group">
      <div class="switches host-plays"><button type="button" class="theme-switch" id="setting-host-plays"></button></div>
      ${askName ? `<div id="setting-host-name-row" class="field-group"><div class="field-row">
        <label for="setting-host-name">Namn</label>
        <input id="setting-host-name" name="hostName" maxlength="${game.MAX_NAME}" autocomplete="nickname"
          placeholder="${DEFAULT_HOST_NAME}">
      </div></div>` : ''}
    </div>`;
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

// Returnerar de valda inställningarna, eller null om spelledaren avbryter.
// I ett pågående spel finns även kategorin med. Den returneras som categoryId.
// names: kategoriernas namn, som används när okända låtar kopieras.
// running: ett spel pågår.
// later: en låt pågår, så ändringarna gäller först från nästa låt.
// music: vald musiktjänst.
function showSettings(current, categories = null, categoryId = null, names = {}, { running = false, later = false, music = 'deezer' } = {}) {
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
      ${segmented('music', 'Musiktjänst', MUSIC_SERVICES.map((m) => ({ value: m.id, short: m.name, text: m.name, checked: m.id === music })))}
      </div>
      ${hostPlaysGroup()}
      ${unknownGroup(running ? unknownCheckbox() : '', unknownSection(countUnknown(loadUnknown())))}
      ${running ? `<p class="note later-note"${later ? '' : ' hidden'}>Ändringarna gäller från nästa låt.</p>` : ''}
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
  const host = wireHostPlays(dialog);
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
          music: cleanMusic(values.music),
          host: host(),
        } : null);
      dialog.remove();
    }, { once: true });
  });
}

// Under en låt sparas ändringarna och gäller från nästa låt.
async function editSettings() {
  const later = Boolean(state && state.round && state.round.phase !== 'revealed');
  const all = await loadCategories();
  const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
  const categories = state ? all : null;
  const current = pending ? pending.settings : state ? game.cleanSettings(state) : loadSettings();
  const currentCategory = pending && pending.category ? pending.category.id : category && category.id;
  const music = pending ? pending.music : state ? state.music : loadMusic();
  const chosen = await showSettings(current, categories, currentCategory, names, { running: Boolean(state), later, music });
  if (!chosen) return;
  const { categoryId, host, music: chosenMusic, ...settings } = chosen;
  saveSettings(settings);
  saveMusic(chosenMusic);
  if (!state) {
    setHostPlays(host.plays);
    return;
  }
  if (host.plays && host.name !== DEFAULT_HOST_NAME) storage(() => localStorage.setItem(NAME_KEY, host.name));
  const picked = categoryId && categoryId !== category.id ? categories.find((c) => c.id === categoryId) : null;
  pending = { settings, category: picked, host, music: chosenMusic };
  // Svaret kan ha visats medan dialogen var öppen, så changed() avgör om ändringen gäller nu.
  changed();
}

async function applyPending() {
  const { settings, category: picked, host, music } = pending;
  pending = null;
  game.applySettings(state, settings);
  if (music !== state.music) {
    stopClip();
    state.music = music;
  }
  // En spelare kan ha tagit namnet medan låten pågick. Då heter spelledaren Spelledare.
  if (host) game.setHostPlaying(state, host.plays, hostNameTaken(host.name) ? DEFAULT_HOST_NAME : host.name);
  if (picked) {
    await switchCategory(picked);
    changed();
  }
}

// Poängen och spelade låtar finns kvar. Går inte medan en låt pågår, eftersom låten hör till den gamla kategorin.
async function switchCategory(chosen) {
  if (!chosen) return;
  if (state.round && state.round.phase !== 'revealed') {
    showAlert('Kategorin kan bytas när svaret har visats.', { title: 'Låten pågår' });
    return;
  }
  const chosenSongs = await loadSongs(chosen);
  if (!game.changeCategory(state, { categoryId: chosen.id, categoryName: chosen.name, labels: chosen.labels })) return;
  stopClip();
  category = chosen;
  songs = chosenSongs;
}

// ---- Visning ----

function showJoinInfo() {
  const url = joinUrl();
  $('#code').textContent = state.code;
  setQrVisible(true);
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

// QR-koden kan stängas när alla har gått med. Den visas alltid i ett nytt spel.
function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
  $('#game').classList.toggle('qr-hidden', !visible);
}

// QR-koden visas överst, och sidan rullar upp så att den syns.
function showQr() {
  setQrVisible(true);
  scrollToTop();
}

// I spelet finns QR-koden, inställningarna och Avsluta spelet i menyn. Före spelet samma rader som på startsidan.
function menuGroups() {
  const settings = { label: 'Inställningar', icon: MENU_ICONS.settings, action: editSettings };
  if (!state) return [startItems(), [settings], commonItems()];
  return [
    [{ label: 'Visa QR-kod', icon: MENU_ICONS.qr, action: showQr, disabled: !$('#join-info').hidden }, settings],
    commonItems(),
    [{ label: 'Avsluta spelet', icon: MENU_ICONS.leave, action: endGame }],
  ];
}

const svg = (body) => `<svg viewBox="0 -960 960 960" aria-hidden="true">${body}</svg>`;
// Material Symbols Rounded, fylld variant (Apache 2.0).
const ICONS = {
  next: svg('<path d="M680-270v-420q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v420q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37Zm-460-27v-366q0-13.5 9-21.75t21-8.25q5 0 9 1.5t8 4.5l263 182q7 5 10 11.3 3 6.29 3 13.7 0 7.41-3 13.7-3 6.3-10 11.3L267-273q-4 3-8 4.5t-9 1.5q-12 0-21-8.25T220-297Z"/>'),
  play: svg('<path d="M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z"/>'),
  external: svg('<path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h249q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H180v600h600v-249q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v249q0 24-18 42t-42 18H180Zm600-617L403-360q-9 9-21 8.5t-21-9.5q-9-9-9-21t9-21l377-377H549q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h261q12.75 0 21.38 8.62Q840-822.75 840-810v261q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-188Z"/>'),
};

// Nästa låt startar av sig själv en stund efter att svaret visats, om spelledaren inte
// redan har tryckt. Bara när klippet spelas i sidan: Spotify kan bara öppnas med ett klick.
const AUTO_NEXT_MS = 10000;
let autoNext = { round: 0, at: 0 };

function autoNextLeft() {
  const round = state.round;
  if (!usesDeezer() || !round || round.phase !== 'revealed' || state.winners) return null;
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

// Vad spela gör just nu: startar spelet eller klippet eller fortsätter efter en paus. Med Spotify
// startar spelet i Spotify, och nästa låt startas med Nästa låt. null betyder att knappen är avstängd.
function playAction() {
  const round = state.round;
  if (!round) return { action: 'start', label: 'Starta spelet' };
  if (state.pausedAt) return { action: 'resume', label: 'Fortsätt' };
  if (round.phase === 'ready') {
    if (usesDeezer()) {
      return clip.round === round.number && clip.status === 'loading' ? null : { action: 'clip', label: 'Spela klippet' };
    }
    return { action: 'spotify', label: 'Spela låten i Spotify' };
  }
  return null;
}

// Spola fram visar svaret under låten och startar nästa låt efter svaret.
function nextAction() {
  const round = state.round;
  if (!round) return null;
  if (round.phase !== 'revealed') return { action: 'reveal', label: 'Visa svar nu' };
  return state.winners ? { action: 'restart', label: 'Ny match' } : { action: 'next', label: 'Nästa låt' };
}

// Visar en av två knappar på samma plats. Hade den dolda knappen fokus flyttas fokus till den andra.
function showOne(first, second, showFirst, focused) {
  const shown = showFirst ? first : second;
  const hidden = showFirst ? second : first;
  hidden.hidden = true;
  shown.hidden = false;
  if (focused === hidden) shown.focus({ preventScroll: true });
}

function setButton(button, choice, fallback) {
  button.disabled = !choice;
  button.dataset.action = choice ? choice.action : '';
  const label = choice ? choice.label : fallback;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function playClicked() {
  const choice = playAction();
  if (!choice) return;
  const song = state.round && state.round.song;
  // QR-koden behövs inte längre när spelet har startat. Den kan visas igen med ikonen.
  if (choice.action === 'start') {
    setQrVisible(false);
    nextSong();
    // Spelledaren kan ha scrollat ner till knappen i rutan. Låten ska synas överst.
    scrollToTop();
  }
  else if (choice.action === 'resume') resumeGame();
  else if (choice.action === 'clip') playClipClicked();
  else if (choice.action === 'spotify') { startRound(); openSpotify(song); }
}

function nextClicked() {
  const choice = nextAction();
  if (!choice) return;
  if (choice.action === 'reveal') revealNow();
  // Spelvyn rullar upp till väntetexten och Starta spelet, både hos spelledaren och spelarna.
  else if (choice.action === 'restart') restart();
  else nextSong();
}

// Samma vy som spelarna ser, och under den spelledarens kontrollpanel.
// Panelen byggs bara om när den ändras, så att fokus stannar kvar.
function render() {
  $('#category').textContent = category.name;
  gameView.update(viewFor(state.hostId), state.hostId);
  // Knapparna står kvar hela spelet och är avstängda när de inte går att använda.
  const round = state.round;
  const focused = document.activeElement;
  // Paus och nästa går att använda hela låten, även medan klippet laddas.
  $('#pause').disabled = !round || Boolean(state.pausedAt)
    || Boolean(state.winners && round.phase === 'revealed');
  const play = playAction();
  setButton($('#play'), play, 'Spela');
  // Spela och pausa delar plats i kontrollpanelen. Pausa visas bara när spela inte går att använda.
  showOne($('#play'), $('#pause'), Boolean(play) || $('#pause').disabled, focused);
  // Spelet startas med knappen i vyn eller med spela, och en ny match på samma sätt med nästa.
  $('#start-game').hidden = !(play && play.action === 'start');
  const next = nextAction();
  setButton($('#next'), next, 'Nästa låt');
  setHtml($('#next'), ICONS.next);
  $('#new-match').hidden = !(next && next.action === 'restart');
  // Med Spotify startar nästa låt inte av sig själv, eftersom Spotify bara kan öppnas med ett klick.
  $('#next-song').hidden = !(next && next.action === 'next' && !usesDeezer());
  updateClipMessage(round);
  // Nästa låt kan starta medan Inställningar är öppen. Ändringarna gäller då från låten efter,
  // och Denna låt är okänd gäller den låt som spelas nu.
  const laterNote = document.querySelector('dialog[open] .later-note');
  if (laterNote) laterNote.hidden = !round || round.phase === 'revealed';
  const mark = document.querySelector('dialog[open] #mark-unknown');
  if (mark) mark.setAttribute('aria-checked', String(currentUnknown()));
}

// Byggs bara om när innehållet ändras, så att fokus stannar kvar.
function setHtml(box, html) {
  if (box.dataset.html === html) return;
  box.innerHTML = html;
  box.dataset.html = html;
}

function showError(err) {
  showMessage({ key: 'error', kind: 'problem', title: 'Något gick fel', text: err.message });
}

// ---- Start ----

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  if (id === 'play') playClicked();
  else if (id === 'pause') pauseGame();
  else if (id === 'next') nextClicked();
  // Knapparna i vyn försvinner när de har tryckts, så fokus flyttas vidare.
  else if (id === 'start-game') { playClicked(); $('#play').focus({ preventScroll: true }); }
  else if (id === 'new-match') { nextClicked(); $('#start-game').focus({ preventScroll: true }); }
  else if (id === 'next-song') { nextClicked(); $('#next').focus(); }
  else if (id === 'settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
});

// Safari på iPhone visar bara :active-läget när sidan lyssnar på touchstart.
document.addEventListener('touchstart', () => {}, { passive: true });

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#play', '#next'];

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

// En spotify:-länk räknas av webbläsaren som att sidan lämnas, fast den bara
// öppnar appen. Varningen hoppas därför över en kort stund efter ett sådant klick.
let appLinkAt = 0;

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (link && !/^https?:/.test(link.href)) appLinkAt = Date.now();
}, true);

// Fliken stängs eller sidan laddas om. Spelet kan återupptas, så spelarna får veta att
// spelledaren har lämnat och kanske kommer tillbaka. Meddelandet hinner inte alltid fram.
window.addEventListener('pagehide', () => {
  if (leaving || !net) return;
  for (const connId of connToPlayer.keys()) net.send(connId, { type: 'leaving' });
});

window.addEventListener('beforeunload', (e) => {
  if (leaving || Date.now() - appLinkAt < 1000) return;
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
