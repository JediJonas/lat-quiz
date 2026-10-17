// Meddelanderutan längst ner, samma hos spelledaren och spelarna. Den visar vad som händer,
// till exempel att appen ansluter igen, och vad som gick fel. Ett nytt meddelande ersätter
// det gamla, så det står aldrig flera rutor på varandra.
//
// kind: 'busy' (pågår, med snurra), 'info', 'ok' (försvinner efter 3 sekunder)
// eller 'problem' (röd rubrik och ikon).
// key anger vad meddelandet gäller, så att hideMessage inte tar bort ett nyare meddelande.
// Ett stående meddelande, till exempel att spelet är pausat, visas när inget annat visas.

import { announce } from './ui.js';
import { joinedMessage } from './game.js';

const OK_MS = 3000;
// Ikoner: Material Symbols Rounded (Apache 2.0): info_i, pause, check och priority_high.
const ICONS = {
  busy: '<span class="spinner"></span>',
  info: '<svg viewBox="0 -960 960 960"><path d="M480-680q-33 0-56.5-23.5T400-760q0-33 23.5-56.5T480-840q33 0 56.5 23.5T560-760q0 33-23.5 56.5T480-680Zm0 560q-25 0-42.5-17.5T420-180v-360q0-25 17.5-42.5T480-600q25 0 42.5 17.5T540-540v360q0 25-17.5 42.5T480-120Z"/></svg>',
  pause: '<svg viewBox="0 -960 960 960"><path d="M640-200q-33 0-56.5-23.5T560-280v-400q0-33 23.5-56.5T640-760q33 0 56.5 23.5T720-680v400q0 33-23.5 56.5T640-200Zm-320 0q-33 0-56.5-23.5T240-280v-400q0-33 23.5-56.5T320-760q33 0 56.5 23.5T400-680v400q0 33-23.5 56.5T320-200Z"/></svg>',
  ok: '<svg viewBox="0 -960 960 960"><path d="m382-354 339-339q12-12 28-12t28 12q12 12 12 28.5T777-636L410-268q-12 12-28 12t-28-12L182-440q-12-12-11.5-28.5T183-497q12-12 28.5-12t28.5 12l142 143Z"/></svg>',
  // person_add
  person: '<svg viewBox="0 -960 960 960"><path d="M720-520h-80q-17 0-28.5-11.5T600-560q0-17 11.5-28.5T640-600h80v-80q0-17 11.5-28.5T760-720q17 0 28.5 11.5T800-680v80h80q17 0 28.5 11.5T920-560q0 17-11.5 28.5T880-520h-80v80q0 17-11.5 28.5T760-400q-17 0-28.5-11.5T720-440v-80Zm-360 40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM40-240v-32q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v32q0 33-23.5 56.5T600-160H120q-33 0-56.5-23.5T40-240Z"/></svg>',
  problem: '<svg viewBox="0 -960 960 960"><path d="M480-120q-33 0-56.5-23.5T400-200q0-33 23.5-56.5T480-280q33 0 56.5 23.5T560-200q0 33-23.5 56.5T480-120Zm0-240q-33 0-56.5-23.5T400-440v-320q0-33 23.5-56.5T480-840q33 0 56.5 23.5T560-760v320q0 33-23.5 56.5T480-360Z"/></svg>',
};

let box = null;
let alertRow = null;
let current = null;
let standing = null;
let hideTimer = null;

function elements() {
  if (!box) {
    box = document.createElement('div');
    box.className = 'message';
    box.hidden = true;
    // Fel läses upp direkt. Övriga meddelanden läses upp via den vanliga statusraden.
    alertRow = document.createElement('p');
    alertRow.className = 'visually-hidden';
    alertRow.setAttribute('role', 'alert');
    // Allt innehåll ska ligga i ett landmärke.
    const aside = document.createElement('aside');
    aside.setAttribute('aria-label', 'Meddelande');
    aside.append(box, alertRow);
    document.body.append(aside);
  }
  return box;
}

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ms: meddelandet försvinner av sig självt efter så lång tid. Klart försvinner alltid efter en stund.
// icon: en annan ikon än den som hör till kind, till exempel person när en spelare går med.
export function showMessage({ key, kind, title, text = '', ms = 0, icon = kind }) {
  const el = elements();
  clearTimeout(hideTimer);
  const same = current && current.key === key && current.kind === kind && current.title === title && current.text === text;
  current = { key, kind, title, text };
  if (!same) {
    el.className = 'message ' + kind;
    el.innerHTML = `<span class="message-icon" aria-hidden="true">${ICONS[icon] || ICONS[kind]}</span>
      <span class="message-body"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</span>`;
    el.hidden = false;
    const spoken = text ? `${title}. ${text}` : title;
    if (kind === 'problem') alertRow.textContent = spoken;
    else announce(spoken);
  }
  if (kind === 'ok' || ms) hideTimer = setTimeout(() => hideMessage(key), ms || OK_MS);
}

// Utan key tas meddelandet bort oavsett vad det gäller.
export function hideMessage(key) {
  if (!current || (key && current.key !== key)) return;
  clearTimeout(hideTimer);
  current = null;
  box.hidden = true;
  alertRow.textContent = '';
  if (standing) showMessage(standing);
}

// null tar bort det stående meddelandet.
export function setStandingMessage(msg) {
  const was = standing;
  standing = msg && { key: 'standing', ...msg };
  if (standing) showMessage(standing); // det senaste ersätter det gamla, som alltid
  else if (!standing && was) hideMessage('standing');
}

export function currentMessage() {
  return current;
}

// En ny spelare har gått med. Spelare som går med nästan samtidigt, eller medan rutan visas,
// läggs till i samma ruta. En spelare som ansluter igen räknas inte som ny. Ett fel eller något som pågår, till exempel
// att anslutningen bröts, är viktigare och får stå kvar.
const JOINED_MS = 4000;
const JOINED_SETTLE_MS = 400;
let joined = [];
let joinedShown = [];
let joinedTimer = null;

export function showJoined(name) {
  joined.push(name);
  clearTimeout(joinedTimer);
  joinedTimer = setTimeout(() => {
    const names = joined;
    joined = [];
    if (current && (current.kind === 'problem' || current.kind === 'busy')) return;
    joinedShown = current && current.key === 'joined' ? [...joinedShown, ...names] : names;
    showMessage({ key: 'joined', kind: 'info', icon: 'person', ...joinedMessage(joinedShown), ms: JOINED_MS });
  }, JOINED_SETTLE_MS);
}

// En spelare har valt Lämna spelet i menyn. Visas lika länge som en ny spelare, och inte över ett fel.
export function showLeft(name) {
  if (current && (current.kind === 'problem' || current.kind === 'busy')) return;
  showMessage({ key: 'left', kind: 'info', title: `Hej då, ${name}!`, text: `${name} har lämnat spelet.`, ms: JOINED_MS });
}

// Oväntade fel, till exempel ett programmeringsfel, visas i rutan. Annars stannar sidan bara
// halvvägs utan förklaring.
export function showUnexpectedErrors() {
  window.addEventListener('error', (event) => {
    const detail = event.message ? ` (${event.message})` : '';
    showMessage({ key: 'unexpected', kind: 'problem', title: 'Något gick fel', text: `Ladda om sidan och försök igen.${detail}` });
  });
}
