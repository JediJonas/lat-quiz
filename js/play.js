// Spelarvyn i mobilen.
import { createClient } from './net.js';
import { loadSuggestions } from './data.js';
import { autocomplete } from './autocomplete.js';
import { renderRing, ranks, scoreTracker, statusTags } from './ui.js';

const SAVE_KEY = 'latquiz-player';
const $ = (sel) => document.querySelector(sel);
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let me = null; // { playerId, name, code }
let net = null;
let view = null;
let roundNumber = null;
let deadline = 0;
const local = { artist: '', title: '' };
let fields = null;
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
  if (msg.type !== 'state') return;
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
  el.textContent = { connecting: 'Ansluter …', connected: 'Ansluten', offline: 'Frånkopplad, försöker igen …' }[status];
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
    points: false,
  });
}

function renderStandings() {
  const places = ranks(view.standings);
  const rows = view.standings.map((p, i) => `<tr class="${p.id === me.playerId ? 'me' : ''} ${p.connected ? '' : 'offline'} ${scoreChanged(p.id, p.score) ? 'bump' : ''}">
    <td class="place${places[i] === 1 && p.score ? ' first' : ''}">${places[i]}</td>
    <td class="name">${esc(p.name)}</td>
    <td class="status">${playerStatus(p.id)}</td>
    <td class="score">${p.score}</td></tr>`);
  $('#standings').innerHTML = `<table><tbody>${rows.join('')}</tbody></table>`;
}

function render() {
  if (!view) return;
  const round = view.round;
  const phase = round ? round.phase : 'waiting';
  $('#waiting').hidden = !(phase === 'waiting' || phase === 'ready');
  $('#waiting-text').textContent = phase === 'ready'
    ? `Låt ${round.number} startar snart …`
    : `Väntar på första låten … Först till ${view.winScore} poäng vinner.`;
  $('#guess').hidden = phase !== 'playing';
  $('#result').hidden = phase !== 'revealed';
  fields.artist.disable(phase !== 'playing');
  fields.title.disable(phase !== 'playing');
  $('label[for=artist]').textContent = view.labels.artist;
  $('label[for=title]').textContent = view.labels.title;

  if (phase === 'playing') {
    $('#round-title').textContent = `Låt ${round.number}`;
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
  }
  renderStandings();
}

function join(name, code) {
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  const playerId = saved && saved.code === code ? saved.playerId : newId();
  me = { playerId, name, code };
  storage(() => localStorage.setItem(SAVE_KEY, JSON.stringify(me)));
  $('#join').hidden = true;
  $('#join-error').hidden = true;
  $('#lobby').hidden = false;
  $('#me').textContent = code;
  net = createClient(code, { onOpen, onMessage, onStatus, onNotFound });
}

// Koden är fel eller spelet är avslutat: tillbaka till sidan där man anger kod.
function onNotFound() {
  const code = me.code;
  net.destroy();
  net = null;
  view = null;
  storage(() => localStorage.removeItem(SAVE_KEY));
  const params = new URLSearchParams(location.search);
  params.delete('kod');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
  $('#code-input').value = '';
  $('#join-error').textContent = `Det finns inget aktivt spel med koden ${code}. Kontrollera koden och försök igen.`;
  $('#join-error').hidden = false;
  $('#lobby').hidden = true;
  $('#join').hidden = false;
}

async function init() {
  const suggestions = await loadSuggestions();
  fields = {
    artist: autocomplete($('#artist'), suggestions.artists, (v) => { local.artist = v; sendAnswer('artist'); render(); }),
    title: autocomplete($('#title'), suggestions.titles, (v) => { local.title = v; sendAnswer('title'); render(); }),
  };
  setInterval(renderTimer, 250);

  const params = new URLSearchParams(location.search);
  const code = (params.get('kod') || '').toUpperCase();
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  $('#code-input').value = code;
  if (saved) $('#name-input').value = saved.name;

  $('#join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#name-input').value.trim().slice(0, 20);
    const joinCode = $('#code-input').value.trim().toUpperCase();
    if (!name || joinCode.length !== 4) return;
    const query = new URLSearchParams(location.search);
    query.set('kod', joinCode);
    history.replaceState(null, '', '?' + query.toString());
    join(name, joinCode);
  });

  // Samma spel som förra gången: anslut direkt, till exempel efter omladdning.
  if (saved && code && saved.code === code) {
    join(saved.name, code);
    return;
  }
  $('#join').hidden = false;
}

init().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<p class="error">${esc(err.message)}</p>`);
});
