// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs, spotifyUrl, spotifyAppUrl } from './data.js';
import { findPreview } from './deezer.js';
import { showAlert, showConfirm } from './dialog.js';
import { announce } from './ui.js';
import { createGameView, esc } from './spelvy.js';
import { mountUserSettings } from './theme.js';
import { UNKNOWN_KEY, cleanUnknown, countUnknown, formatUnknown, isUnknown, toggleUnknown, withoutUnknown } from './okanda.js';

const SAVE_KEY = 'latquiz-host';
const NAME_KEY = 'latquiz-namn';
const SETTINGS_KEY = 'latquiz-settings';
const SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const $ = (sel) => document.querySelector(sel);

let state = null;
let songs = [];
let category = null;
let net = null;
const connToPlayer = new Map();
let ticker = null;
// Spelledaren spelar med och gissar i samma vy som spelarna.
let gameView = null;

function storage(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function save() {
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
  return view;
}

function broadcast() {
  for (const connId of connToPlayer.keys()) sendState(connId);
}

function changed() {
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
    game.addPlayer(state, { id: playerId, name });
    changed();
  } else if (msg.type === 'answer') {
    const playerId = connToPlayer.get(connId);
    if (!playerId) return;
    game.submitAnswer(state, playerId, msg.field, String(msg.value || '').slice(0, 200), Date.now());
    if (game.shouldReveal(state, Date.now())) game.reveal(state);
    changed();
  }
}

function onDisconnect(connId) {
  const playerId = connToPlayer.get(connId);
  connToPlayer.delete(connId);
  if (!playerId || [...connToPlayer.values()].includes(playerId)) return;
  game.setConnected(state, playerId, false);
  if (game.shouldReveal(state, Date.now())) game.reveal(state);
  changed();
}

function startNetwork() {
  setConn('connecting');
  net = createHost(state.code, {
    onReady: () => { setConn('connected'); setNetStatus(''); },
    onMessage,
    onDisconnect,
    onError: (text, status) => { setConn(status); setNetStatus(text); },
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

// Samma etikett som hos spelarna. Ansluten betyder att nya spelare kan gå med.
function setConn(status) {
  const el = $('#conn');
  el.className = 'conn ' + status;
  el.textContent = { connecting: 'Ansluter…', connected: 'Ansluten', offline: 'Frånkopplad' }[status];
}

function setNetStatus(text) {
  const el = $('#net-status');
  el.textContent = text;
  el.hidden = !text;
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
  if (game.shouldReveal(state, Date.now())) game.reveal(state);
  changed();
}

// ---- Spelets steg ----

async function startGame(categoryId, resumeState, name) {
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
  }
  // Spelledaren är en spelare som alltid är ansluten. Ett äldre sparat spel får spelledaren nu.
  if (!state.hostId) state.hostId = newId();
  game.addPlayer(state, { id: state.hostId, name: name || state.players[state.hostId]?.name || loadName() || 'Spelledare' });
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

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  if (Date.now() - revealedAt < DOUBLE_TAP_MS) return;
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  const playable = withoutUnknown(loadUnknown(), category.id, songs);
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

// Måste anropas direkt från klicket, annars kan webbläsaren stoppa öppnandet.
function openSpotify(song) {
  const app = spotifyAppUrl(song);
  if (!app) {
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
const clip = { audio: null, round: 0, status: null, error: '' };

function usesDeezer() {
  return category && category.audio === 'deezer';
}

function clipAudio() {
  if (!clip.audio) clip.audio = new Audio();
  return clip.audio;
}

function stopClip() {
  if (clip.audio) clip.audio.pause();
}

// Måste anropas direkt från klicket.
async function playDeezer(roundNumber) {
  const audio = clipAudio();
  audio.pause();
  audio.src = SILENCE;
  audio.play().catch(() => {});
  Object.assign(clip, { round: roundNumber, status: 'loading', error: '' });
  render();
  let url = null;
  try {
    url = await findPreview(state.round.song);
  } catch (err) {
    clip.error = err.message;
  }
  if (!state.round || state.round.number !== roundNumber) return; // spelledaren har gått vidare
  if (!url) {
    clip.status = 'missing';
    render();
    return;
  }
  audio.src = url;
  startClip();
}

// Timern startar först när klippet hörs.
function startClip() {
  const audio = clipAudio();
  audio.currentTime = 0;
  audio.play().then(() => {
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
  if (clip.round === round.number && clip.audio && clip.audio.src.startsWith('http')) startClip();
  else playDeezer(round.number);
}

// Medan klippet hämtas är spela-knappen avstängd. Saknas klippet får spelledaren länkar till Spotify.
function clipButton(round) {
  const loading = clip.round === round.number && clip.status === 'loading';
  if (clip.round === round.number && clip.status === 'missing') return playLink(round.song);
  return iconButton('play-clip', 'Spela klippet', ICONS.play, { primary: true, disabled: loading });
}

function clipNote(round) {
  if (clip.round !== round.number || clip.status !== 'missing') return '';
  return `<p class="muted small panel-note">${clip.error ? esc(clip.error) : 'Deezer har inget klipp för den här låten.'}
    Spela den i Spotify i stället.</p>`;
}

// Uppdaterar bara knappen, så att rätt svar inte läses upp igen.
function unknownClicked() {
  const song = state.round && state.round.song;
  if (!song) return;
  const list = toggleUnknown(loadUnknown(), category.id, song);
  saveUnknown(list);
  const marked = isUnknown(list, category.id, song.id);
  $('#unknown').setAttribute('aria-pressed', String(marked));
  announce(marked ? 'Låten är markerad som okänd och hoppas över i kommande spel.' : 'Markeringen är borttagen.');
}

function restart() {
  stopClip();
  game.restart(state);
  changed();
}

function startRound() {
  if (game.startRound(state, Date.now())) changed();
}

// Pausen stoppar timern, klippet och nedräkningen till nästa låt.
function togglePause() {
  if (!state.round) return;
  const playing = state.round.phase === 'playing';
  if (state.pausedAt) {
    autoNext.at += game.resume(state, Date.now());
    if (playing && clip.status === 'playing' && clip.audio) clip.audio.play().catch(() => {});
  } else {
    if (!game.pause(state, Date.now())) return;
    stopClip();
  }
  changed();
}

// Samma knapp visar svaret och startar nästa låt. Ett dubbeltryck ska inte hoppa över svaret.
const DOUBLE_TAP_MS = 1000;
let revealedAt = 0;

function revealNow() {
  if (!game.reveal(state)) return;
  revealedAt = Date.now();
  changed();
}

async function endGame() {
  const ok = await showConfirm('Poängen försvinner och spelarna kopplas bort.', {
    title: 'Avsluta spelet?', okText: 'Avsluta', danger: true,
  });
  if (!ok) return;
  storage(() => localStorage.removeItem(SAVE_KEY));
  stopClip();
  if (net) net.destroy();
  if (ticker) ticker.stop();
  leaving = true;
  location.href = location.pathname + location.search;
}

const SETTING_FIELDS = [
  { key: 'bonusMs', label: 'Bonus för snabbt svar', text: (v) => (v ? `Inom ${v / 1000} sekunder` : 'Ingen bonus') },
  { key: 'winScore', label: 'Poänggräns', text: (v) => `Först till ${v} poäng` },
];

// Okända låtar kopieras som text och skickas vidare, så att de tas bort ur kategorin.
function unknownSection(count) {
  if (!count) return '';
  return `
    <div class="unknown-songs">
      <p id="unknown-count">${count === 1 ? '1 låt är markerad' : `${count} låtar är markerade`} som okänd.</p>
      <p class="unknown-actions">
        <button type="button" id="copy-unknown" class="link">Kopiera okända låtar</button>
        <button type="button" id="clear-unknown" class="link">Rensa</button>
      </p>
      <p id="unknown-status" class="muted small" role="status"></p>
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
      title: 'Rensa okända låtar?', okText: 'Rensa', danger: true,
    });
    if (!ok) return;
    saveUnknown({});
    dialog.querySelector('.unknown-songs').remove();
  });
}

// Returnerar de valda inställningarna, eller null om spelledaren avbryter.
// I ett pågående spel finns även kategorin med. Den returneras som categoryId.
// names: kategoriernas namn, som används när okända låtar kopieras.
// running: ett spel pågår och kan avslutas härifrån. Returnerar då { end: true } om spelledaren avslutar.
// locked: låten spelas, så inställningarna kan inte ändras just nu.
function showSettings(current, categories = null, categoryId = null, names = {}, { running = false, locked = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.innerHTML = `
    <form method="dialog">
      <h2>Inställningar</h2>
      ${locked ? '<p>Inställningarna kan ändras när svaret har visats.</p>' : ''}
      ${categories && !locked ? `
        <label for="setting-category">Kategori</label>
        <select id="setting-category" name="categoryId">
          ${categories.map((c) => `<option value="${esc(c.id)}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>` : ''}
      ${locked ? '' : SETTING_FIELDS.map(({ key, label, text }) => `
        <label for="setting-${key}">${label}</label>
        <select id="setting-${key}" name="${key}">
          ${game.SETTING_CHOICES[key].map((v) => `<option value="${v}"${v === current[key] ? ' selected' : ''}>${text(v)}</option>`).join('')}
        </select>`).join('')}
      ${unknownSection(countUnknown(loadUnknown()))}
      ${running ? `<div class="end-game">
        <button value="end" class="secondary danger-text">Avsluta spelet</button>
      </div>` : ''}
      <div class="modal-actions">
        <button value="cancel" class="secondary">${locked ? 'Stäng' : 'Avbryt'}</button>
        ${locked ? '' : '<button value="ok">Spara</button>'}
      </div>
    </form>`;
  // En rullista skickar inte formuläret med Enter, så Enter sparar här.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'SELECT') {
      e.preventDefault();
      e.stopPropagation(); // annars startar Enter även spelet
      dialog.querySelector('[value=ok]').click();
    }
  });
  wireUnknown(dialog, names);
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const form = dialog.querySelector('form');
      const values = Object.fromEntries(new FormData(form));
      if (dialog.returnValue === 'end') resolve({ end: true });
      else resolve(dialog.returnValue === 'ok'
        ? { ...game.cleanSettings(values), ...(categories ? { categoryId: values.categoryId } : {}) } : null);
      dialog.remove();
    }, { once: true });
  });
}

// Under en låt går bara att avsluta spelet. Inställningarna ändras när svaret har visats.
async function editSettings() {
  const locked = Boolean(state && state.round && state.round.phase === 'playing');
  const all = await loadCategories();
  const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
  const categories = state ? all : null;
  const chosen = await showSettings(state ? game.cleanSettings(state) : loadSettings(), categories, category && category.id, names,
    { running: Boolean(state), locked });
  if (!chosen) return;
  if (chosen.end) { endGame(); return; }
  const { categoryId, ...settings } = chosen;
  saveSettings(settings);
  if (!state) return;
  game.applySettings(state, settings);
  if (categoryId && categoryId !== category.id) await switchCategory(categories.find((c) => c.id === categoryId));
  changed();
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
  $('#show-qr').title = `Visa eller dölj QR-koden (kod ${state.code})`;
  setQrVisible(true);
  $('#join-url').textContent = url;
  $('#join-url').href = url;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

// QR-koden kan stängas när alla har gått med. Den visas alltid i ett nytt spel.
function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
  $('#game').classList.toggle('qr-hidden', !visible);
  $('#show-qr').setAttribute('aria-expanded', String(visible));
}

// Med Spotify-ID öppnas låten i appen, annars som en sökning i webbläsaren.
function playLink(song) {
  const app = spotifyAppUrl(song);
  const href = esc(app || spotifyUrl(song));
  const target = app ? '' : ' target="_blank" rel="noopener"';
  return `<a id="play" class="icon-btn primary" href="${href}"${target} aria-label="Spela låten i Spotify" title="Spela låten i Spotify">${ICONS.play}</a>`;
}

// Om Spotify inte öppnades av sig själv. Timern går redan.
function reopenLink(song) {
  const app = spotifyAppUrl(song);
  const href = esc(app || spotifyUrl(song));
  const target = app ? '' : ' target="_blank" rel="noopener"';
  return `<a class="icon-btn" href="${href}"${target} aria-label="Öppna låten i Spotify igen" title="Öppna låten i Spotify igen">${ICONS.external}</a>`;
}

const svg = (body) => `<svg viewBox="0 0 256 256" aria-hidden="true">${body}</svg>`;
// Phosphor Icons, fylld variant (MIT).
const ICONS = {
  next: svg('<path d="M208,40V216a8,8,0,0,1-16,0V146.77L72.43,221.55A15.95,15.95,0,0,1,48,208.12V47.88A15.95,15.95,0,0,1,72.43,34.45L192,109.23V40a8,8,0,0,1,16,0Z"/>'),
  play: svg('<path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/>'),
  restart: svg('<path d="M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L60.63,81.29l17,17A8,8,0,0,1,72,112H24a8,8,0,0,1-8-8V56A8,8,0,0,1,29.66,50.3L49.31,70,60.25,60A96,96,0,0,1,224,128Z"/>'),
  external: svg('<path d="M192,136v72a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V80A16,16,0,0,1,48,64h72a8,8,0,0,1,0,16H48V208H176V136a8,8,0,0,1,16,0Zm32-96a8,8,0,0,0-8-8H152a8,8,0,0,0-5.66,13.66L172.69,72l-42.35,42.34a8,8,0,0,0,11.32,11.32L184,83.31l26.34,26.35A8,8,0,0,0,224,104Z"/>'),
};

function iconButton(id, label, icon, { primary = false, disabled = false } = {}) {
  return `<button id="${id}" class="icon-btn${primary ? ' primary' : ''}" aria-label="${label}" title="${label}"${disabled ? ' disabled' : ''}>${icon}</button>`;
}

// Nästa låt startar av sig själv en stund efter att svaret visats, om spelledaren inte
// redan har tryckt. Bara när klippet spelas i sidan: Spotify kan bara öppnas med ett klick.
const AUTO_NEXT_MS = 15000;
let autoNext = { round: 0, at: 0 };

function autoNextLeft() {
  const round = state.round;
  if (!usesDeezer() || !round || round.phase !== 'revealed' || state.winners) return null;
  if (autoNext.round !== round.number) autoNext = { round: round.number, at: Date.now() + AUTO_NEXT_MS };
  // Under en paus står nedräkningen still.
  return Math.max(0, autoNext.at - (state.pausedAt || Date.now()));
}

// Anropas av tickern. Väntar medan en ruta som Inställningar är öppen.
function checkAutoNext() {
  const left = autoNextLeft();
  if (left === null || state.pausedAt) return;
  if (left > 0) return;
  if (document.querySelector('dialog[open]')) { autoNext.at = Date.now() + 1000; return; }
  nextSong();
}

// Panelens huvudknapp längst till höger: det spelledaren gör härnäst. Spola fram visar
// svaret under låten och startar nästa låt efter svaret.
function controls() {
  const round = state.round;
  if (!round) return iconButton('next', 'Nästa låt', ICONS.next, { primary: true });
  if (round.phase === 'ready') return usesDeezer() ? clipButton(round) : playLink(round.song);
  if (round.phase === 'playing') {
    return (usesDeezer() ? '' : reopenLink(round.song)) + iconButton('reveal', 'Visa svar nu', ICONS.next, { primary: true });
  }
  return state.winners
    ? iconButton('restart', 'Ny match med samma spelare', ICONS.restart, { primary: true })
    : iconButton('next', 'Nästa låt', ICONS.next, { primary: true });
}

// Samma vy som spelarna ser, och under den spelledarens panel.
// Panelen byggs bara om när den ändras, så att fokus stannar kvar.
function render() {
  $('#category').textContent = category.name;
  gameView.update(viewFor(state.hostId), state.hostId);
  // Knapparna står kvar hela spelet och är avstängda när de inte går att använda.
  const round = state.round;
  const unknown = $('#unknown');
  unknown.disabled = !round;
  unknown.setAttribute('aria-pressed', String(Boolean(round) && isUnknown(loadUnknown(), category.id, round.song.id)));
  const pause = $('#pause');
  pause.disabled = !round || round.phase === 'ready' || Boolean(state.winners && round.phase === 'revealed');
  pause.setAttribute('aria-pressed', String(Boolean(state.pausedAt)));
  pause.title = state.pausedAt ? 'Fortsätt spelet' : 'Pausa spelet';
  setHtml($('#controls'), controls());
  setHtml($('#controls-note'), round && round.phase === 'ready' && usesDeezer() ? clipNote(round) : '');
}

// Byggs bara om när innehållet ändras, så att fokus stannar kvar.
function setHtml(box, html) {
  if (box.dataset.html === html) return;
  box.innerHTML = html;
  box.dataset.html = html;
}

function showError(err) {
  document.body.insertAdjacentHTML('afterbegin', `<p class="error" role="alert">${esc(err.message)}</p>`);
}

// ---- Start ----

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  if (id === 'next') nextSong();
  else if (id === 'play' || id === 'play-web') startRound(); // länken öppnas som vanligt
  else if (id === 'play-clip') playClipClicked();
  else if (id === 'reveal') revealNow();
  else if (id === 'end') endGame();
  else if (id === 'restart') restart();
  else if (id === 'unknown') unknownClicked();
  else if (id === 'pause') togglePause();
  else if (id === 'settings' || id === 'game-settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
  else if (id === 'show-qr') setQrVisible($('#join-info').hidden);
});

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#next', '#play', '#play-clip', '#reveal', '#restart'];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (document.querySelector('dialog[open]')) return; // modalen sköter sig själv
  if (e.target.closest('button, a, input, textarea')) return; // fokuserade knappar och länkar trycks redan
  const target = ENTER_TARGETS.map((sel) => $(sel)).find((el) => el && el.offsetParent);
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

window.addEventListener('beforeunload', (e) => {
  if (leaving || Date.now() - appLinkAt < 1000) return;
  if (state) e.preventDefault();
});

// Kategorierna står redan i host.html, så att sidan inte blinkar till.
// Här uppdateras de från listan och det val som redan är gjort behålls.
function renderCategories(categories) {
  const select = $('#category-select');
  const chosen = select.value;
  select.innerHTML = categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  if (categories.some((c) => c.id === chosen)) select.value = chosen;
}

// PeerJS och QR-koden laddas efter den här modulen, så att startsidan visas utan
// att vänta på dem. Ett snabbt klick väntar in dem innan spelet startar.
const scriptsLoaded = new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else document.addEventListener('DOMContentLoaded', resolve, { once: true });
});

async function init() {
  mountUserSettings();
  $('#host-name').value = loadName();
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#host-name').value.trim().slice(0, game.MAX_NAME);
    if (!name) return;
    storage(() => localStorage.setItem(NAME_KEY, name));
    startGame($('#category-select').value, null, name);
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
