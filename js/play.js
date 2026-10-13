// Spelarvyn i mobilen.
import { createClient } from './net.js';
import { hideMessage, showMessage } from './meddelande.js';
import { createGameView } from './spelvy.js';
import { mountUserSettings } from './theme.js';

const SAVE_KEY = 'latquiz-player';
const MAX_NAME = 10;
const $ = (sel) => document.querySelector(sel);

let me = null; // { playerId, name, code }
let net = null;
let view = null;
let gameView = null;
// Sant medan formuläret väntar på att spelledaren godkänner namnet.
let pending = false;

function storage(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
}

function sendAnswer(field, value) {
  if (net) net.send({ type: 'answer', field, value });
}

function onOpen() {
  net.send({ type: 'hello', playerId: me.playerId, name: me.name });
  // Svar som valdes medan anslutningen var nere skickas nu.
  if (view && view.round && view.round.phase === 'playing') {
    const answers = gameView.answers();
    sendAnswer('artist', answers.artist);
    sendAnswer('title', answers.title);
  }
}

function onMessage(msg) {
  if (msg.type === 'ended') { gameEnded(); return; }
  if (msg.type === 'leaving') { hostLeft = true; showHostLeft(); return; }
  if (msg.type === 'name-taken') { leave(`Namnet ${msg.name} används redan i spelet. Välj ett annat namn.`, false); return; }
  if (msg.type !== 'state') return;
  if (pending) showLobby();
  view = msg.view;
  $('#category-name').textContent = view.categoryName || '';
  gameView.update(view, me.playerId);
}

// Ett avbrott visas i meddelanderutan, och sedan att anslutningen är tillbaka. Från formuläret
// visar knappen att appen ansluter, men efter en omladdning visas det i rutan.
let connectedOnce = false;
let dropped = false;
let showConnecting = false;
// Spelledaren har stängt fliken eller laddat om och kan gå tillbaka till spelet.
// Då visas det i stället för att anslutningen bröts, och appen fortsätter försöka ansluta.
let hostLeft = false;

function showHostLeft() {
  showMessage({ key: 'net', kind: 'busy', title: 'Spelledaren har lämnat spelet', text: 'Väntar på att spelledaren kommer tillbaka.' });
}

// Ett avslutat spel går inte att gå tillbaka till. Poängen står kvar, men appen slutar
// försöka ansluta, och en omladdning visar sidan där man anger kod.
function gameEnded() {
  net.destroy();
  net = null;
  storage(() => localStorage.removeItem(SAVE_KEY));
  showMessage({ key: 'net', kind: 'info', title: 'Spelledaren har avslutat spelet', text: 'Tack för att du var med!' });
}

function onStatus(status) {
  if (status === 'connected') {
    if (dropped || hostLeft) showMessage({ key: 'net', kind: 'ok', title: 'Ansluten igen' });
    else hideMessage('net');
    connectedOnce = true;
    dropped = false;
    hostLeft = false;
  } else if (hostLeft) {
    showHostLeft();
  } else if (connectedOnce) {
    dropped = true;
    showMessage({ key: 'net', kind: 'busy', title: 'Anslutningen bröts', text: 'Ansluter igen… Dina svar sparas.' });
  } else if (showConnecting) {
    showMessage({ key: 'net', kind: 'busy', title: 'Ansluter till spelet…' });
  }
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
  connectedOnce = false;
  dropped = false;
  hostLeft = false;
  showConnecting = !fromForm;
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
  hideMessage('net');
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
  gameView = createGameView({ onAnswer: sendAnswer, onError: showError });

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
  showMessage({ key: 'error', kind: 'problem', title: 'Något gick fel', text: err.message });
}

init().catch(showError);
