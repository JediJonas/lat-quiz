// Spelarvyn i mobilen.
import { createClient } from './net.js';
import { loadSuggestions } from './data.js';
import { autocomplete } from './autocomplete.js';
import { announce, renderRing, scoreTracker, settingsSummary, statusTags } from './ui.js';
import { mountUserSettings } from './theme.js';

const SAVE_KEY = 'latquiz-player';
const MAX_NAME = 10;
const $ = (sel) => document.querySelector(sel);
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let me = null; // { playerId, name, code }
let net = null;
let view = null;
let roundNumber = null;
let deadline = 0;
const local = { artist: '', title: '' };
let fields = null;
// Sant medan formuläret väntar på att spelledaren godkänner namnet.
let pending = false;
const scoreChanged = scoreTracker();

function storage(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
}

function sendAnswer(field) {
  if (net) net.send({ type: 'answer', field, value: local[field] });
}

function onOpen() {
  net.send({ type: 'hello', playerId: me.playerId, name: me.name });
  // Svar som valdes medan anslutningen var nere skickas nu.
  if (view && view.round && view.round.phase === 'playing') {
    sendAnswer('artist');
    sendAnswer('title');
  }
}

function onMessage(msg) {
  if (msg.type === 'name-taken') { leave(`Namnet ${msg.name} används redan i spelet. Välj ett annat namn.`, false); return; }
  if (msg.type !== 'state') return;
  if (pending) showLobby();
  view = msg.view;
  $('#category-name').textContent = view.categoryName || '';
  const round = view.round;
  if (round && round.number !== roundNumber) {
    roundNumber = round.number;
    local.artist = round.answer ? round.answer.artist : '';
    local.title = round.answer ? round.answer.title : '';
    fields.artist.set(local.artist);
    fields.title.set(local.title);
  }
  deadline = round && round.phase === 'playing' ? Date.now() + round.remainingMs : 0;
  render();
}

function onStatus(status) {
  const el = $('#conn');
  el.className = 'conn ' + status;
  el.textContent = { connecting: 'Ansluter…', connected: 'Ansluten', offline: 'Frånkopplad' }[status];
}

function renderTimer() {
  const el = $('#timer');
  if (!view || !view.round || view.round.phase !== 'playing') return;
  const ms = Math.max(0, deadline - Date.now());
  renderRing(el, ms, view.round.roundMs, view.round.bonusMs > 0 && view.round.roundMs - ms <= view.round.bonusMs);
}

function playerStatus(id) {
  const round = view.round;
  if (!round) return '';
  return statusTags({
    phase: round.phase,
    progress: round.progress && round.progress[id],
    result: round.results && round.results[id],
    labels: view.labels,
    esc,
  });
}

function renderStandings() {
  const rows = view.standings.map((p) => `<tr class="${p.id === me.playerId ? 'me' : ''} ${p.connected ? '' : 'offline'} ${scoreChanged(p.id, p.score) ? 'bump' : ''}">
    <td class="score">${p.score}<span class="visually-hidden"> poäng</span></td>
    <td class="name">${esc(p.name)}</td>
    <td class="status">${playerStatus(p.id)}</td></tr>`);
  $('#standings').innerHTML = `<table><tbody>${rows.join('')}</tbody></table>`;
}

// Reglerna i klartext medan spelarna väntar på första låten.
function rulesText(view) {
  const s = view.settings;
  if (!s) return `Först till ${view.winScore} poäng vinner.`;
  // Hårda mellanslag efter talen, så att ett tal aldrig hamnar ensamt sist på en rad.
  const bonus = s.bonusMs ? ` och 1\u00a0i bonus om båda är rätt inom ${s.bonusMs / 1000}\u00a0s` : '';
  return `${s.roundMs / 1000}\u00a0s per låt. 1\u00a0poäng för artist, 1\u00a0för titel${bonus}. Först till ${s.winScore}\u00a0vinner.`;
}

function render() {
  if (!view) return;
  const round = view.round;
  const phase = round ? round.phase : 'waiting';
  $('#waiting').hidden = !(phase === 'waiting' || phase === 'ready');
  $('#waiting-text').textContent = phase === 'ready'
    ? `Låt ${round.number} startar snart…`
    : `Väntar på första låten… ${rulesText(view)}`;
  $('#game-rules').textContent = view.settings
    ? ' · ' + settingsSummary(view.settings) : '';
  $('#guess').hidden = phase !== 'playing';
  $('#result').hidden = phase !== 'revealed';
  fields.artist.disable(phase !== 'playing');
  fields.title.disable(phase !== 'playing');
  $('label[for=artist]').textContent = view.labels.artist;
  $('label[for=title]').textContent = view.labels.title;

  if (phase === 'playing') {
    $('#round-title').textContent = `Låt ${round.number}`;
    announce(`Låt ${round.number} har börjat. Du har ${Math.round(round.roundMs / 1000)} sekunder på dig.`);
    renderTimer();
  } else if (phase === 'revealed') {
    const r = round.result || { artist: false, title: false, bonus: false, points: 0 };
    const mine = round.answer || { artist: '', title: '' };
    $('#result').innerHTML = `<h2 class="round-label">Låt ${round.number}</h2>
      <div class="answer reveal"><div class="title">${esc(round.song.title)}</div>
      <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>
      <ul class="mine">
        <li class="${r.artist ? 'right' : 'wrong'}"><span>${esc(view.labels.artist)}</span>${esc(mine.artist || '–')}</li>
        <li class="${r.title ? 'right' : 'wrong'}"><span>${esc(view.labels.title)}</span>${esc(mine.title || '–')}</li>
        ${r.bonus ? '<li class="right bonus"><span>Bonus</span>Snabbt svar</li>' : ''}
      </ul>
      <p class="points">+${r.points} poäng</p>
      ${view.winners ? `<div class="winner">${esc(view.winners.join(' och '))} vinner!</div>` : ''}`;
    announce(`Rätt svar: ${round.song.title} med ${round.song.artist}. Du fick ${r.points} poäng.`
      + (view.winners ? ` ${view.winners.join(' och ')} vinner!` : ''));
  }
  renderStandings();
}

// Från formuläret stannar man kvar där tills spelledaren har svarat, så att ett upptaget namn
// visas som ett fel i formuläret. Vid återanslutning visas spelvyn direkt.
function join(name, code, fromForm) {
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  const playerId = saved && saved.code === code ? saved.playerId : newId();
  me = { playerId, name, code };
  storage(() => localStorage.setItem(SAVE_KEY, JSON.stringify(me)));
  $('#join-error').hidden = true;
  $('#me').textContent = code;
  if (fromForm) setPending(true);
  else showLobby();
  net = createClient(code, { onOpen, onMessage, onStatus, onNotFound });
}

function setPending(on) {
  pending = on;
  const button = $('#join-form button');
  button.disabled = on;
  button.textContent = on ? 'Ansluter…' : 'Jag är med!';
}

function showLobby() {
  setPending(false);
  $('#join').hidden = true;
  $('#lobby').hidden = false;
}

// Koden är fel eller spelet är avslutat: tillbaka till sidan där man anger kod.
function onNotFound() {
  leave(`Det finns inget aktivt spel med koden ${me.code}. Kontrollera koden och försök igen.`, true);
}

// Tillbaka till sidan där man anger namn och kod, med ett felmeddelande.
function leave(message, clearCode) {
  net.destroy();
  net = null;
  view = null;
  storage(() => localStorage.removeItem(SAVE_KEY));
  const params = new URLSearchParams(location.search);
  if (clearCode) {
    params.delete('kod');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
    $('#code-input').value = '';
  }
  setPending(false);
  $('#join-error').textContent = message;
  $('#join-error').hidden = false;
  $('#lobby').hidden = true;
  $('#join').hidden = false;
}

async function init() {
  // Förslagslistan är stor. Den laddas i bakgrunden, så att kodsidan visas direkt.
  fields = {
    artist: autocomplete($('#artist'), [], (v) => { local.artist = v; sendAnswer('artist'); render(); }),
    title: autocomplete($('#title'), [], (v) => { local.title = v; sendAnswer('title'); render(); }),
  };
  loadSuggestions().then((suggestions) => {
    fields.artist.setList(suggestions.artists);
    fields.title.setList(suggestions.titles);
  }).catch(showError);
  setInterval(renderTimer, 250);

  const params = new URLSearchParams(location.search);
  const code = (params.get('kod') || '').toUpperCase();
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  $('#code-input').value = code;
  if (saved) $('#name-input').value = saved.name;

  mountUserSettings();
  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#name-input').value.trim().slice(0, MAX_NAME);
    const joinCode = $('#code-input').value.trim().toUpperCase();
    if (!name || joinCode.length !== 4) return;
    const query = new URLSearchParams(location.search);
    query.set('kod', joinCode);
    history.replaceState(null, '', '?' + query.toString());
    join(name, joinCode, true);
  });

  // Samma spel som förra gången: anslut direkt, till exempel efter omladdning.
  if (saved && code && saved.code === code) {
    join(saved.name, code);
    return;
  }
  $('#join').hidden = false;
}

function showError(err) {
  document.body.insertAdjacentHTML('afterbegin', `<p class="error" role="alert">${esc(err.message)}</p>`);
}

init().catch(showError);
