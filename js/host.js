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

// Saknas klippet spelas låten i Spotify i stället, med spela-knappen.
function clipNote(round) {
  if (clip.round !== round.number || clip.status !== 'missing') return '';
  return `<p class="muted small panel-note">${clip.error ? esc(clip.error) : 'Deezer har inget klipp för den här låten.'}
    Spela den i Spotify i stället.</p>`;
}

// Kryssrutan i Inställningar. Gäller direkt, utan att spelledaren behöver spara.
function setUnknown(marked) {
  const song = state.round && state.round.song;
  if (!song || isUnknown(loadUnknown(), category.id, song.id) === marked) return;
  saveUnknown(toggleUnknown(loadUnknown(), category.id, song));
  announce(marked ? 'Låten är markerad som okänd och hoppas över i kommande spel.' : 'Markeringen är borttagen.');
}

// Låtens titel visas inte, eftersom spelledaren också gissar.
function unknownCheckbox() {
  const song = state && state.round && state.round.song;
  if (!song) return '';
  const marked = isUnknown(loadUnknown(), category.id, song.id);
  return `
    <div class="current-song">
      <label class="check"><input type="checkbox" id="mark-unknown"${marked ? ' checked' : ''}>
        Hoppa över den i kommande spel</label>
    </div>`;
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
function pauseGame() {
  if (!game.pause(state, Date.now())) return;
  stopClip();
  changed();
}

function resumeGame() {
  if (!state.pausedAt) return;
  autoNext.at += game.resume(state, Date.now());
  if (state.round.phase === 'playing' && clip.status === 'playing' && clip.audio) clip.audio.play().catch(() => {});
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
// Allt om okända låtar ligger i samma avdelning. Under ett spel gäller den aktuella låten.
function unknownGroup(checkbox, list) {
  if (!checkbox && !list) return '';
  return `<div class="unknown-group"><h3>${checkbox ? 'Okänd låt' : 'Okända låtar'}</h3>${checkbox}${list}</div>`;
}

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
    const group = dialog.querySelector('.unknown-group');
    if (!group.querySelector('.current-song')) group.remove();
  });
}

// Returnerar de valda inställningarna, eller null om spelledaren avbryter.
// I ett pågående spel finns även kategorin med. Den returneras som categoryId.
// names: kategoriernas namn, som används när okända låtar kopieras.
// running: ett spel pågår och kan avslutas härifrån. Returnerar då { end: true } om spelledaren avslutar.
// later: en låt pågår, så ändringarna gäller först från nästa låt.
function showSettings(current, categories = null, categoryId = null, names = {}, { running = false, later = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.innerHTML = `
    <form method="dialog">
      <h2>Inställningar</h2>
      ${categories ? `
        <label for="setting-category">Kategori</label>
        <select id="setting-category" name="categoryId">
          ${categories.map((c) => `<option value="${esc(c.id)}"${c.id === categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>` : ''}
      ${SETTING_FIELDS.map(({ key, label, text }) => `
        <label for="setting-${key}">${label}</label>
        <select id="setting-${key}" name="${key}">
          ${game.SETTING_CHOICES[key].map((v) => `<option value="${v}"${v === current[key] ? ' selected' : ''}>${text(v)}</option>`).join('')}
        </select>`).join('')}
      ${unknownGroup(running ? unknownCheckbox() : '', unknownSection(countUnknown(loadUnknown())))}
      ${running ? `<div class="end-game">
        <button value="end" class="secondary danger-text">Avsluta spelet</button>
      </div>` : ''}
      ${later ? '<p class="later-note">Ändringarna gäller från nästa låt.</p>' : ''}
      <div class="modal-actions">
        <button value="cancel" class="secondary">Avbryt</button>
        <button value="ok">Spara</button>
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
  const mark = dialog.querySelector('#mark-unknown');
  if (mark) mark.addEventListener('change', () => setUnknown(mark.checked));
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

// Under en låt sparas ändringarna och gäller från nästa låt.
async function editSettings() {
  const later = Boolean(state && state.round && state.round.phase !== 'revealed');
  const all = await loadCategories();
  const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
  const categories = state ? all : null;
  const current = pending ? pending.settings : state ? game.cleanSettings(state) : loadSettings();
  const currentCategory = pending && pending.category ? pending.category.id : category && category.id;
  const chosen = await showSettings(current, categories, currentCategory, names, { running: Boolean(state), later });
  if (!chosen) return;
  if (chosen.end) { endGame(); return; }
  const { categoryId, ...settings } = chosen;
  saveSettings(settings);
  if (!state) return;
  const picked = categoryId && categoryId !== category.id ? categories.find((c) => c.id === categoryId) : null;
  pending = { settings, category: picked };
  // Svaret kan ha visats medan dialogen var öppen, så changed() avgör om ändringen gäller nu.
  changed();
}

async function applyPending() {
  const { settings, category: picked } = pending;
  pending = null;
  game.applySettings(state, settings);
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

const svg = (body) => `<svg viewBox="0 -960 960 960" aria-hidden="true">${body}</svg>`;
// Material Symbols Rounded, fylld variant (Apache 2.0).
const ICONS = {
  next: svg('<path d="M680-270v-420q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v420q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37Zm-460-27v-366q0-13.5 9-21.75t21-8.25q5 0 9 1.5t8 4.5l263 182q7 5 10 11.3 3 6.29 3 13.7 0 7.41-3 13.7-3 6.3-10 11.3L267-273q-4 3-8 4.5t-9 1.5q-12 0-21-8.25T220-297Z"/>'),
  play: svg('<path d="M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z"/>'),
  restart: svg('<path d="M418-126q-111-21-184.5-109T160-439q0-71 30-134t85-107q8-6 19-5.5t19 8.5q10 10 9 23t-13 23q-42 35-65.5 85.5T220-439q0 94 58 163.5T425-186q11 2 18.5 11t7.5 20q0 14-10 22.5t-23 6.5Zm126 0q-13 2-23-6.5T511-155q0-11 7.5-20t18.5-11q90-20 147-89.5T741-439q0-109-75.5-184.5T481-699h-20l39 39q8 8 8 21t-8 21q-9 9-22 9t-21-9l-91-90q-5-5-7-10t-2-11q0-6 2-11t7-10l91-91q8-8 21-8t22 8q8 9 8 22t-8 21l-39 39h20q134 0 227 93.5T801-439q0 116-73 204T544-126Z"/>'),
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

// Anropas av tickern. Väntar medan en ruta som Inställningar är öppen.
function checkAutoNext() {
  const left = autoNextLeft();
  if (left === null || state.pausedAt) return;
  if (left > 0) return;
  if (document.querySelector('dialog[open]')) { autoNext.at = Date.now() + 1000; return; }
  nextSong();
}

// Vad spela gör just nu: startar spelet eller klippet, fortsätter efter en paus eller
// öppnar låten i Spotify. null betyder att knappen är avstängd.
function playAction() {
  const round = state.round;
  if (!round) return { action: 'start', label: 'Starta spelet' };
  if (state.pausedAt) return { action: 'resume', label: 'Fortsätt' };
  const missing = clip.round === round.number && clip.status === 'missing';
  if (round.phase === 'ready') {
    if (usesDeezer() && !missing) {
      return clip.round === round.number && clip.status === 'loading' ? null : { action: 'clip', label: 'Spela klippet' };
    }
    return { action: 'spotify', label: 'Spela låten i Spotify' };
  }
  if (round.phase === 'playing' && (!usesDeezer() || missing)) return { action: 'reopen', label: 'Öppna låten i Spotify igen' };
  return null;
}

// Spola fram visar svaret under låten och startar nästa låt efter svaret.
function nextAction() {
  const round = state.round;
  if (!round || round.phase === 'ready') return null;
  if (round.phase === 'playing') return { action: 'reveal', label: 'Visa svar nu' };
  return state.winners ? { action: 'restart', label: 'Ny match med samma spelare' } : { action: 'next', label: 'Nästa låt' };
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
  if (choice.action === 'start') nextSong();
  else if (choice.action === 'resume') resumeGame();
  else if (choice.action === 'clip') playClipClicked();
  else if (choice.action === 'spotify') { startRound(); openSpotify(song); }
  else if (choice.action === 'reopen') openSpotify(song);
}

function nextClicked() {
  const choice = nextAction();
  if (!choice) return;
  if (choice.action === 'reveal') revealNow();
  else if (choice.action === 'restart') restart();
  else nextSong();
}

// Samma vy som spelarna ser, och under den spelledarens panel.
// Panelen byggs bara om när den ändras, så att fokus stannar kvar.
function render() {
  $('#category').textContent = category.name;
  gameView.update(viewFor(state.hostId), state.hostId);
  // Knapparna står kvar hela spelet och är avstängda när de inte går att använda.
  const round = state.round;
  $('#pause').disabled = !round || Boolean(state.pausedAt) || round.phase === 'ready'
    || Boolean(state.winners && round.phase === 'revealed');
  const play = playAction();
  setButton($('#play'), play, 'Spela');
  $('#play').classList.toggle('start-hint', Boolean(play && play.action === 'start'));
  const next = nextAction();
  setButton($('#next'), next, 'Nästa låt');
  setHtml($('#next'), next && next.action === 'restart' ? ICONS.restart : ICONS.next);
  setHtml($('#controls-note'), round && round.phase !== 'revealed' && usesDeezer() ? clipNote(round) : '');
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
  if (id === 'play') playClicked();
  else if (id === 'pause') pauseGame();
  else if (id === 'next') nextClicked();
  else if (id === 'settings' || id === 'game-settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
  else if (id === 'show-qr') setQrVisible($('#join-info').hidden);
});

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
