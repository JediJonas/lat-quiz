// Meddelanderutan längst ner, samma hos spelledaren och spelarna. Den visar vad som händer,
// till exempel att appen ansluter igen, och vad som gick fel. Ett nytt meddelande ersätter
// det gamla, så det står aldrig flera rutor på varandra.
//
// kind: 'busy' (pågår, med snurra), 'info', 'ok' (försvinner efter 3 sekunder)
// eller 'problem' (röd ram, rubrik och ikon).
// key anger vad meddelandet gäller, så att hideMessage inte tar bort ett nyare meddelande.

import { announce } from './ui.js';

const OK_MS = 3000;
const ICONS = {
  busy: '<span class="spinner"></span>',
  info: '<svg viewBox="0 0 24 24"><rect x="10.75" y="10" width="2.5" height="8" rx="1.25"/><circle cx="12" cy="6.75" r="1.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  problem: '<svg viewBox="0 0 24 24"><rect x="10.75" y="5" width="2.5" height="9.5" rx="1.25"/><circle cx="12" cy="18" r="1.5"/></svg>',
};

let box = null;
let alertRow = null;
let current = null;
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

export function showMessage({ key, kind, title, text = '' }) {
  const el = elements();
  clearTimeout(hideTimer);
  const same = current && current.key === key && current.kind === kind && current.title === title && current.text === text;
  current = { key, kind, title, text };
  if (!same) {
    el.className = 'message ' + kind;
    el.innerHTML = `<span class="message-icon" aria-hidden="true">${ICONS[kind]}</span>
      <span class="message-body"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</span>`;
    el.hidden = false;
    const spoken = text ? `${title}. ${text}` : title;
    if (kind === 'problem') alertRow.textContent = spoken;
    else announce(spoken);
  }
  if (kind === 'ok') hideTimer = setTimeout(() => hideMessage(key), OK_MS);
}

// Utan key tas meddelandet bort oavsett vad det gäller.
export function hideMessage(key) {
  if (!current || (key && current.key !== key)) return;
  clearTimeout(hideTimer);
  current = null;
  box.hidden = true;
  alertRow.textContent = '';
}

export function currentMessage() {
  return current;
}
