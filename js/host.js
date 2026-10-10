// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs, spotifyUrl, spotifyAppUrl } from './data.js';

const SAVE_KEY = 'latquiz-host';
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

function storage(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function playedKey(categoryId) {
  return 'latquiz-played-' + categoryId;
}

function loadPlayed(categoryId) {
  return storage(() => JSON.parse(localStorage.getItem(playedKey(categoryId))) || [], []);
}

function save() {
  storage(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: Date.now() }));
    localStorage.setItem(playedKey(state.categoryId), JSON.stringify(state.playedIds));
  });
}

function loadSaved() {
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  if (!saved || Date.now() - saved.savedAt > SAVE_MAX_AGE_MS) return null;
  return saved.state;
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
    const name = String(msg.name || '').trim().slice(0, 20);
    const playerId = String(msg.playerId || '').slice(0, 40);
    if (!name || !playerId) return;
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
  setNetStatus('Startar …');
  net = createHost(state.code, {
    onReady: () => setNetStatus(''),
    onMessage,
    onDisconnect,
    onError: setNetStatus,
  });
  ticker = setInterval(tick, 250);
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
  const categories = await loadCategories();
  category = categories.find((c) => c.id === categoryId) || categories[0];
  songs = await loadSongs(category);
  if (resumeState) {
    state = resumeState;
    // Alla räknas som frånkopplade tills de hör av sig igen.
    for (const player of Object.values(state.players)) player.connected = false;
  } else {
    state = game.createGame({
      code: newCode(), categoryId: category.id, playedIds: loadPlayed(category.id), labels: category.labels,
    });
  }
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  showJoinInfo();
  startNetwork();
  render();
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  const song = game.nextSong(state, songs);
  if (!song) {
    alert('Alla låtar i kategorin är spelade. Nollställ spelade låtar för att börja om.');
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

function endGame() {
  if (!confirm('Avsluta spelet? Poängen försvinner.')) return;
  storage(() => localStorage.removeItem(SAVE_KEY));
  if (net) net.destroy();
  clearInterval(ticker);
  location.href = location.pathname + location.search;
}

function resetPlayed() {
  if (!confirm('Nollställ listan över spelade låtar i den här kategorin?')) return;
  state.playedIds = [];
  changed();
}

// ---- Visning ----

function showJoinInfo() {
  const url = joinUrl();
  $('#code').textContent = state.code;
  $('#join-url').textContent = url;
  $('#join-url').href = url;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

function renderTimer() {
  const el = $('#timer');
  if (!el) return;
  const ms = game.remainingMs(state, Date.now());
  el.textContent = Math.ceil(ms / 1000);
  const elapsed = state.roundMs - ms;
  el.classList.toggle('bonus', elapsed <= state.bonusMs);
}

function renderPlayers() {
  const round = state.round;
  const rows = game.standings(state).map((p) => {
    let status = '';
    if (round && round.phase === 'playing') {
      status = game.hasAnsweredBoth(state, p.id) ? '✅ Svarat' : '…';
    } else if (round && round.phase === 'revealed' && round.results[p.id]) {
      const r = round.results[p.id];
      const labels = state.labels || game.DEFAULT_LABELS;
      status = `${r.artist ? '✅' : '❌'} ${labels.artist.toLowerCase()} ${r.title ? '✅' : '❌'} ${labels.title.toLowerCase()}`
        + (r.bonus ? ' ⚡ bonus' : '') + ` <strong>+${r.points}</strong>`;
    }
    return `<tr class="${p.connected ? '' : 'offline'}">
      <td>${esc(p.name)}${p.connected ? '' : ' <small>(frånkopplad)</small>'}</td>
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
    return `<a id="play" class="button big" href="${web}" target="_blank" rel="noopener">▶ Spela låten i Spotify</a>
      <p class="muted small">Länken öppnar en sökning i Spotify. Välj översta träffen.</p>`;
  }
  return `<a id="play" class="button big" href="${esc(app)}">▶ Spela låten i Spotify-appen</a>
    <p class="muted small">Händer inget? <a id="play-web" href="${web}" target="_blank" rel="noopener">Öppna i webbläsaren i stället</a>.</p>`;
}

// Om Spotify inte öppnades av sig själv. Timern går redan.
function reopenLinks(song) {
  const app = spotifyAppUrl(song);
  const web = `<a href="${esc(spotifyUrl(song))}" target="_blank" rel="noopener">webbläsaren</a>`;
  return `<p class="muted small">Öppnades inte låten? Öppna den i ${
    app ? `<a href="${esc(app)}">Spotify-appen</a> eller i ${web}` : web}.</p>`;
}

function render() {
  const round = state.round;
  const left = game.unplayedSongs(state, songs).length;
  $('#category').textContent = `${category.name} · ${left} av ${songs.length} låtar kvar`;
  const stage = $('#stage');

  if (!round) {
    stage.innerHTML = `<p>Först till ${state.winScore || game.WIN_SCORE} poäng vinner. Vänta tills alla har anslutit och tryck sedan på Nästa låt.
      Låten öppnas i Spotify och timern startar. Stoppa låten efter ungefär 10 sekunder.</p>
      <button id="next" class="big">Nästa låt</button>`;
  } else if (round.phase === 'ready') {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <p>Klicka på knappen. Låten öppnas i Spotify och timern startar.
      Stoppa låten efter ungefär 10 sekunder.</p>
      ${playLinks(round.song)}`;
  } else if (round.phase === 'playing') {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <div id="timer" class="timer"></div>
      <p class="muted">Bonus för rätt svar inom ${state.bonusMs / 1000} sekunder.</p>
      <button id="reveal" class="secondary">Visa svar nu</button>
      ${reopenLinks(round.song)}`;
    renderTimer();
  } else {
    stage.innerHTML = `<h2>Låt ${round.number}</h2>
      <div class="answer"><div class="title">${esc(round.song.title)}</div>
      <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>
      ${state.winners
        ? `<div class="winner">🏆 ${esc(winnerNames())} vinner!</div>
           <button id="restart" class="big">Ny match med samma spelare</button>`
        : '<button id="next" class="big">Nästa låt</button>'}`;
  }
  renderPlayers();
}

// ---- Start ----

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  if (id === 'next') nextSong();
  else if (id === 'play' || id === 'play-web') startRound(); // länken öppnas som vanligt
  else if (id === 'reveal') revealNow();
  else if (id === 'end') endGame();
  else if (id === 'restart') restart();
  else if (id === 'reset-played') resetPlayed();
});

window.addEventListener('beforeunload', (e) => {
  if (state && Object.keys(state.players).length) e.preventDefault();
});

async function init() {
  const categories = await loadCategories();
  $('#category-select').innerHTML = categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('#create').addEventListener('click', () => startGame($('#category-select').value));
  const saved = loadSaved();
  if (saved) {
    const resume = $('#resume');
    resume.hidden = false;
    resume.querySelector('button').textContent = `Fortsätt spelet ${saved.code}`;
    resume.querySelector('button').addEventListener('click', () => startGame(saved.categoryId, saved));
  }
}

init().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<p class="error">${esc(err.message)}</p>`);
});
