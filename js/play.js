// Spelarvyn i mobilen.
import { codeBoxes } from './kodrutor.js';
import { createClient } from './net.js';
import { hideMessage, showJoined, showLeft, showMessage, showUnexpectedErrors } from './meddelande.js';
import { createGameView } from './spelvy.js';
import { settingsChangeText, upcomingSettings } from './game.js';
import { ICONS, commonItems, mountMenu, startItems } from './meny.js';
import { showConfirm } from './dialog.js';
import { scrollToTop } from './ui.js';
import { createClipPlayer } from './klipp.js';

// Oväntade fel visas i meddelanderutan i stället för att sidan bara stannar.
showUnexpectedErrors();

const SAVE_KEY = 'latquiz-player';
const MAX_NAME = 10;
const SETTINGS_MESSAGE_MS = 4000;
// Kategori och inställningar kan komma i olika lägen direkt efter varandra. De visas tillsammans.
const SETTINGS_SETTLE_MS = 400;
const $ = (sel) => document.querySelector(sel);

let me = null; // { playerId, name, code }
let net = null;
let view = null;
let gameView = null;
// Klippet spelas även här, om spelledaren har valt det.
let clipPlayer = null;
// Sant medan formuläret väntar på att spelledaren godkänner namnet.
let pending = false;
// Inställningarna som spelaren senast fick veta om, och timern som samlar ändringarna.
let knownSettings = null;
let settingsTimer = null;

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
  if (msg.type === 'new-match') {
    showMessage({ key: 'new-match', kind: 'info', title: 'Vi kör igen!', text: 'Alla börjar om från noll. Lycka till!', ms: SETTINGS_MESSAGE_MS });
    return;
  }
  if (msg.type === 'joined') { showJoined(String(msg.name || '')); return; }
  if (msg.type === 'left') { showLeft(String(msg.name || '')); return; }
  if (msg.type === 'name-taken') { leave(`Det finns redan en ${msg.name} i spelet. Välj ett annat namn, till exempel med en initial.`, false); return; }
  if (msg.type !== 'state') return;
  if (pending) showLobby();
  view = msg.view;
  checkSettings();
  $('#category-name').textContent = view.categoryName || '';
  gameView.update(view, me.playerId);
  clipPlayer.update(view);
  // Väntemusiken spelas här när spelledaren har valt att spela musik på alla enheter.
  $('#lobby-note').hidden = !(view.music && view.music.loop);
}

// Spelledaren har ändrat inställningarna eller kategorin. Det visas en kort stund. Under en låt
// gäller ändringen från nästa låt, men spelarna får veta det direkt, med samma rubrik.
function checkSettings() {
  if (!knownSettings) { knownSettings = upcomingSettings(view); return; }
  if (!settingsChangeText(knownSettings, upcomingSettings(view))) return;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    if (!view) return;
    const now = upcomingSettings(view);
    const text = settingsChangeText(knownSettings, now);
    knownSettings = now;
    if (!text) return;
    showMessage({ key: 'settings', kind: 'info', title: 'Spelet ändrades', text, ms: SETTINGS_MESSAGE_MS });
  }, SETTINGS_SETTLE_MS);
}

// Ett avbrott visas i meddelanderutan, och sedan att anslutningen är tillbaka. Att appen ansluter
// visas också i rutan, men först efter en stund, så att den inte blinkar till när det går fort.
const CONNECTING_DELAY_MS = 1500;
let connectedOnce = false;
let dropped = false;
let connectingTimer = null;
// Spelledaren har stängt fliken eller laddat om och kan gå tillbaka till spelet.
// Då visas det i stället för att anslutningen bröts, och appen fortsätter försöka ansluta.
let hostLeft = false;

function showHostLeft() {
  showMessage({ key: 'net', kind: 'busy', title: 'Spelledaren är borta', text: 'Väntar på spelledaren…' });
}

// Webbläsaren kan säga att spelledarens sida lämnas fast den finns kvar, till exempel när den
// sparas för bakåtknappen eller fryses i mobilen. Hörs spelledaren igen på samma förbindelse
// är spelledaren tillbaka, och rutan ska inte stå kvar.
function onHeard() {
  if (hostLeft) onStatus('connected');
}

// Ett avslutat spel går inte att gå tillbaka till. Poängen står kvar, men appen slutar
// försöka ansluta, och en omladdning visar sidan där man anger kod.
function gameEnded() {
  clipPlayer.stop();
  net.destroy();
  net = null;
  storage(() => localStorage.removeItem(SAVE_KEY));
  showMessage({ key: 'net', kind: 'info', title: 'Spelet avslutades', text: 'Tack för att du var med!' });
}

function onStatus(status) {
  if (status === 'connected') {
    clearTimeout(connectingTimer);
    if (dropped || hostLeft) showMessage({ key: 'net', kind: 'ok', title: 'Välkommen tillbaka!', text: 'Du är med i spelet igen.' });
    else hideMessage('net');
    connectedOnce = true;
    dropped = false;
    hostLeft = false;
  } else if (status === 'host-missing' || hostLeft) {
    // Spelledaren finns inte längre, även om meddelandet från fliken som stängdes inte kom fram.
    hostLeft = true;
    showHostLeft();
  } else if (connectedOnce) {
    dropped = true;
    showMessage({ key: 'net', kind: 'busy', title: 'Anslutningen bröts', text: 'Försöker ansluta igen…' });
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
  renderJoinInfo();
  connectedOnce = false;
  dropped = false;
  hostLeft = false;
  clearTimeout(connectingTimer);
  connectingTimer = setTimeout(() => showMessage({ key: 'net', kind: 'busy', title: 'Ansluter till spelet…', text: 'Det kan ta några sekunder.' }), CONNECTING_DELAY_MS);
  if (fromForm) setPending(true);
  else showLobby();
  net = createClient(code, { onOpen, onMessage, onHeard, onStatus, onNotFound, onUnreachable });
}

// Spelaren kan visa en QR-kod för att få med fler spelare. Länken är samma som den man själv gick med via.
function joinUrl() {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('kod', me.code);
  return url.toString();
}

function renderJoinInfo() {
  const url = joinUrl();
  $('#join-url').textContent = url;
  $('#join-url').href = url;
  $('#join-url-row').hidden = true;
  $('#copy-status').textContent = '';
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
}

// QR-koden ligger överst, som hos spelledaren. Sidan rullar upp så att den syns.
function showQr() {
  setQrVisible(true);
  scrollToTop();
}

let copiedTimer = null;
async function copyLink() {
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
}

function setPending(on) {
  pending = on;
  const button = $('#join-form button');
  button.disabled = on;
}

function showLobby() {
  setPending(false);
  $('#join').hidden = true;
  $('#lobby').hidden = false;
}

// Koden är fel eller spelet är avslutat: tillbaka till sidan där man anger kod.
function onNotFound() {
  leave(`Vi hittar inget spel med koden ${me.code}. Kolla koden och prova igen.`, true);
}

// Anslutningen lyckades aldrig, fast spelet finns. Koden står kvar, och spelaren sparas så att
// ett nytt försök går med som samma spelare och inte får namnet upptaget av sig själv.
function onUnreachable(reason) {
  const message = reason === 'relay'
    ? 'Det gick inte att ansluta. Kontrollera att du har internet och försök igen.'
    : `Spelet med koden ${me.code} svarar inte. Kontrollera att spelledarens sida är öppen och försök igen. Är du på ett gästnät? Prova samma wifi som spelledaren eller mobildata.`;
  leave(message, false, true);
}

// Spelaren lämnar spelet och hamnar på startsidan. Spelaren sparas, så att den som går med
// igen med samma kod får tillbaka sina poäng.
async function leaveGame() {
  const ok = await showConfirm('Du kan gå med igen med samma kod och får då tillbaka dina poäng.', {
    title: 'Lämna spelet?', okText: 'Lämna', danger: true, icon: ICONS.leave,
  });
  if (!ok) return;
  // Spelledaren och de andra spelarna får veta det. Vänta lite, så att meddelandet hinner iväg.
  if (net) {
    net.send({ type: 'leave' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    net.destroy();
  }
  net = null;
  const params = new URLSearchParams(location.search);
  params.delete('kod');
  const query = params.toString();
  location.href = 'index.html' + (query ? '?' + query : '');
}

// Före spelet finns samma rader som på startsidan. I spelet kan spelaren visa QR-koden och lämna spelet.
function menuGroups() {
  if ($('#lobby').hidden) return [startItems(), commonItems()];
  return [
    [{ label: 'Visa QR-kod', icon: ICONS.qr, action: showQr, disabled: !$('#join-info').hidden || !net }],
    commonItems(),
    [{ label: 'Lämna spelet', icon: ICONS.leave, action: leaveGame }],
  ];
}

// Tillbaka till sidan där man anger namn och kod, med ett felmeddelande.
function leave(message, clearCode, keepPlayer = false) {
  clearTimeout(connectingTimer);
  net.destroy();
  net = null;
  view = null;
  clipPlayer.stop();
  knownSettings = null;
  clearTimeout(settingsTimer);
  setQrVisible(false);
  hideMessage('net');
  if (!keepPlayer) storage(() => localStorage.removeItem(SAVE_KEY));
  const params = new URLSearchParams(location.search);
  if (clearCode) {
    params.delete('kod');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
    $('#code-input').value = '';
    $('#code-input').dispatchEvent(new Event('input'));
  }
  setPending(false);
  $('#join-error').textContent = message;
  $('#join-error').hidden = false;
  $('#lobby').hidden = true;
  $('#join').hidden = false;
}

async function init() {
  gameView = createGameView({ onAnswer: sendAnswer, onError: showError });
  clipPlayer = createClipPlayer({ onBlocked: (on) => { $('#clip-sound').hidden = !on; $('#lobby-sound').hidden = !on; } });
  // Mobilen spelar ljud först när spelaren har tryckt någonstans, till exempel på Gå med eller
  // i ett svarsfält. Varje tryck ger ljudet en ny chans, och knappen syns när inget tryck har kommit.
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => clipPlayer.unlock(), true);
  $('#clip-sound').addEventListener('click', () => clipPlayer.unlock());
  $('#lobby-sound').addEventListener('click', () => clipPlayer.unlock());

  const params = new URLSearchParams(location.search);
  const code = (params.get('kod') || '').toUpperCase();
  const saved = storage(() => JSON.parse(localStorage.getItem(SAVE_KEY)), null);
  $('#code-input').value = code;
  codeBoxes($('#code-input'));
  if (saved) $('#name-input').value = saved.name;

  mountMenu($('main'), menuGroups);
  $('#hide-qr').addEventListener('click', () => setQrVisible(false));
  $('#copy-link').addEventListener('click', copyLink);
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
