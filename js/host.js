// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs, spotifyUrl, spotifyAppUrl } from './data.js';
import { showAlert, showConfirm } from './dialog.js';
import { announce, renderRing, ranks, scoreTracker, settingsSummary, statusTags } from './ui.js';
import { mountUserSettings } from './theme.js';

const SAVE_KEY = 'latquiz-host';
const SETTINGS_KEY = 'latquiz-settings';
const SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const $ = (sel) => document.querySelector(sel);
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let state = null;
let songs = [];
let category = null;
let net = null;
const connToPlayer = new Map();
let ticker = null;
const scoreChanged = scoreTracker();

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
  net.send(connId, { type: 'state', view: game.playerView(state, playerId, Date.now()) });
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
  setNetStatus('Startar…');
  net = createHost(state.code, {
    onReady: () => setNetStatus(''),
    onMessage,
    onDisconnect,
    onError: setNetStatus,
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

function setNetStatus(text) {
  const el = $('#net-status');
  el.textContent = text;
  el.hidden = !text;
}

function tick() {
  if (!state.round || state.round.phase !== 'playing') return;
  if (game.shouldReveal(state, Date.now())) {
    game.reveal(state);
    changed();
  } else {
    renderTimer();
  }
}

// ---- Spelets steg ----

async function startGame(categoryId, resumeState) {
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
  // Även ett återupptaget spel från innan namnet sparades ska visa kategorin.
  state.categoryName = category.name;
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  showJoinInfo();
  startNetwork();
  render();
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  if (game.unplayedSongs(state, songs).length === 0) state.playedIds = [];
  const song = game.nextSong(state, songs);
  if (!song) return;
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

function winnerNames() {
  return state.winners.map((id) => state.players[id].name).join(' och ');
}

function restart() {
  game.restart(state);
  changed();
}

function startRound() {
  if (game.startRound(state, Date.now())) changed();
}

function revealNow() {
  if (game.reveal(state)) changed();
}

async function endGame() {
  const ok = await showConfirm('Poängen försvinner och spelarna kopplas bort.', {
    title: 'Avsluta spelet?', okText: 'Avsluta', danger: true,
  });
  if (!ok) return;
  storage(() => localStorage.removeItem(SAVE_KEY));
  if (net) net.destroy();
  if (ticker) ticker.stop();
  leaving = true;
  location.href = location.pathname + location.search;
}

const SETTING_FIELDS = [
  { key: 'roundMs', label: 'Betänketid', text: (v) => `${v / 1000} sekunder` },
  { key: 'bonusMs', label: 'Bonus för snabbt svar', text: (v) => (v ? `Inom ${v / 1000} sekunder` : 'Ingen bonus') },
  { key: 'winScore', label: 'Poänggräns', text: (v) => `Först till ${v} poäng` },
];

// Returnerar de valda inställningarna, eller null om spelledaren avbryter.
// I ett pågående spel finns även kategorin med. Den returneras som categoryId.
function showSettings(current, categories = null, categoryId = null) {
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
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const form = dialog.querySelector('form');
      const values = Object.fromEntries(new FormData(form));
      resolve(dialog.returnValue === 'ok'
        ? { ...game.cleanSettings(values), ...(categories ? { categoryId: values.categoryId } : {}) } : null);
      dialog.remove();
    }, { once: true });
  });
}

async function editSettings() {
  if (state && state.round && state.round.phase === 'playing') {
    showAlert('Inställningarna kan ändras när svaret har visats.', { title: 'Låten pågår' });
    return;
  }
  const categories = state ? await loadCategories() : null;
  const chosen = await showSettings(state ? game.cleanSettings(state) : loadSettings(), categories, category && category.id);
  if (!chosen) return;
  const { categoryId, ...settings } = chosen;
  saveSettings(settings);
  if (!state) {
    renderSetupSummary();
    return;
  }
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
  category = chosen;
  songs = chosenSongs;
}

function renderSetupSummary() {
  $('#settings-summary').textContent = settingsSummary(loadSettings());
}

// ---- Visning ----

function showJoinInfo() {
  const url = joinUrl();
  $('#code').textContent = state.code;
  $('#show-qr').textContent = 'Kod ' + state.code;
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

function renderTimer() {
  const el = $('#timer');
  if (!el) return;
  const ms = game.remainingMs(state, Date.now());
  renderRing(el, ms, state.roundMs, state.bonusMs > 0 && state.roundMs - ms <= state.bonusMs);
}

function renderPlayers() {
  const round = state.round;
  const list = game.standings(state);
  const places = ranks(list);
  const rows = list.map((p, i) => {
    const status = round ? statusTags({
      phase: round.phase,
      progress: game.answeredFields(state, p.id),
      result: round.results && round.results[p.id],
      labels: state.labels || game.DEFAULT_LABELS,
      esc,
    }) : '';
    return `<tr class="${p.connected ? '' : 'offline'} ${scoreChanged(p.id, p.score) ? 'bump' : ''}">
      <td class="place${places[i] === 1 && p.score ? ' first' : ''}">${places[i]}</td>
      <td class="name">${esc(p.name)}${p.connected ? '' : ' <small>(frånkopplad)</small>'}</td>
      <td class="status">${status}</td>
      <td class="score">${p.score}</td></tr>`;
  });
  $('#players').innerHTML = rows.length
    ? `<table><tbody>${rows.join('')}</tbody></table>`
    : '<p class="muted">Inga spelare ännu. Be dem skanna QR-koden.</p>';
}

// Med Spotify-ID öppnas låten i appen, med webbspelaren som reserv.
function playLinks(song) {
  const app = spotifyAppUrl(song);
  const web = esc(spotifyUrl(song));
  if (!app) {
    return `<a id="play" class="button big huge" href="${web}" target="_blank" rel="noopener">Spela låten i Spotify</a>
      <p class="muted small">Länken öppnar en sökning i Spotify. Välj översta träffen.</p>`;
  }
  return `<a id="play" class="button big huge" href="${esc(app)}">Spela låten i Spotify-appen</a>
    <p class="muted small">Händer inget? <a id="play-web" href="${web}" target="_blank" rel="noopener">Öppna i webbläsaren i stället</a>.</p>`;
}

// Om Spotify inte öppnades av sig själv. Timern går redan.
function reopenLinks(song) {
  const app = spotifyAppUrl(song);
  const web = `<a href="${esc(spotifyUrl(song))}" target="_blank" rel="noopener">webbläsaren</a>`;
  return `<p class="muted small reopen">Öppnades inte låten? Öppna den i ${
    app ? `<a href="${esc(app)}">Spotify-appen</a> eller i ${web}` : web}.</p>`;
}

function render() {
  const round = state.round;
  $('#category').textContent = category.name;
  const stage = $('#stage');

  if (!round) {
    stage.innerHTML = `<p>Vänta tills alla har anslutit och tryck sedan på Nästa låt.
      Låten öppnas i Spotify och timern startar. Stoppa låten när tiden har gått ut.</p>
      <button id="next" class="big huge">Nästa låt</button>`;
  } else if (round.phase === 'ready') {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <p>Klicka på knappen. Låten öppnas i Spotify och timern startar.
      Stoppa låten när tiden har gått ut.</p>
      ${playLinks(round.song)}`;
  } else if (round.phase === 'playing') {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <div id="timer" class="ring"></div>
      <button id="reveal" class="secondary">Visa svar nu</button>
      ${reopenLinks(round.song)}`;
    renderTimer();
  } else {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <div class="answer reveal"><div class="title">${esc(round.song.title)}</div>
      <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>
      ${state.winners
        ? `<div class="winner">${esc(winnerNames())} vinner!</div>
           <button id="restart" class="big huge">Ny match med samma spelare</button>`
        : '<button id="next" class="big huge">Nästa låt</button>'}`;
    announce(`Rätt svar: ${round.song.title} med ${round.song.artist}.` + (state.winners ? ` ${winnerNames()} vinner!` : ''));
  }
  renderPlayers();
  $('#game-settings-summary').textContent = settingsSummary(game.cleanSettings(state));
}

// ---- Start ----

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  if (id === 'next') nextSong();
  else if (id === 'play' || id === 'play-web') startRound(); // länken öppnas som vanligt
  else if (id === 'reveal') revealNow();
  else if (id === 'end') endGame();
  else if (id === 'restart') restart();
  else if (id === 'settings' || id === 'game-settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
  else if (id === 'show-qr') setQrVisible($('#join-info').hidden);
});

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#next', '#play', '#reveal', '#restart'];

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
  if (state && Object.keys(state.players).length) e.preventDefault();
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
  $('#create').addEventListener('click', () => startGame($('#category-select').value));
  renderSetupSummary();
  const saved = loadSaved();
  if (saved) {
    const resume = $('#resume');
    resume.hidden = false;
    resume.querySelector('button').textContent = `Tillbaka till ${saved.code}`;
    resume.querySelector('button').addEventListener('click', () => startGame(saved.categoryId, saved));
  }
  renderCategories(await loadCategories());
}

init().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<p class="error" role="alert">${esc(err.message)}</p>`);
});
