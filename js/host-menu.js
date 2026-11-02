// @ts-check
// Menyn och tangenterna hos spelledaren, och QR-koden med länken för att gå med.
import { ICONS, commonItems, startItems } from './meny.js';
import { copyJoinLink, joinInfoShown, renderJoinInfo } from './join-info.js';
import { peerQuery } from './net.js';
import { $ } from './shared/dom.js';
import { t } from './shared/lang.js';
import { scrollToTop } from './ui.js';

// QR-koden kan stängas när alla har gått med. Den visas alltid i ett nytt spel, men inte när
// spelledaren går tillbaka till ett spel.
/** @param {boolean} visible */
export function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
  $('#game').classList.toggle('qr-hidden', !visible);
}

/** Länken som spelarna går med via. @param {string} code */
function joinUrl(code) {
  const url = new URL('play.html', location.href);
  url.search = peerQuery();
  url.searchParams.set('kod', code);
  return url.toString();
}

/** Spelets kod, länken och QR-koden. @param {string} code @param {boolean} qrOpen */
export function showJoinInfo(code, qrOpen) {
  $('#code').textContent = code;
  setQrVisible(qrOpen);
  renderJoinInfo(joinUrl(code));
}

/** Knappen som kopierar länken. @param {() => string} code */
export function mountCopyLink(code) {
  $('#copy-link').addEventListener('click', () => copyJoinLink(joinUrl(code())));
}

// QR-koden visas överst, och sidan rullar upp så att den syns.
export function showQr() {
  setQrVisible(true);
  scrollToTop();
}

/**
 * Pausa spelet och Starta spelet delar rad i menyn. Raden finns från första låten tills någon har
 * vunnit. Starta spelet fortsätter efter en paus, eller försöker igen när klippet inte startade.
 * Medan spelarna går med står Starta spelet här, som knappen i vyn.
 * @param {any} state
 * @param {{ stuck: (round: any) => boolean, start: () => void, resume: () => void, retry: () => void, pause: () => void }} actions
 */
export function pauseItem(state, { stuck, start, resume, retry, pause }) {
  const round = state.round;
  if (!round && !state.winners) return [{ label: t('menu.start'), icon: ICONS.play, action: start }];
  if (!round || state.winners) return [];
  if (state.pausedAt) return [{ label: t('menu.start'), icon: ICONS.play, action: resume }];
  if (stuck(round)) return [{ label: t('menu.start'), icon: ICONS.play, action: retry }];
  return [{ label: t('menu.pause'), icon: ICONS.pause, action: pause }];
}

/**
 * I spelet finns Pausa spelet, QR-koden, inställningarna och Avsluta spelet i menyn. Före spelet
 * samma rader som på startsidan.
 * @param {any} state null före spelet
 * @param {Parameters<typeof pauseItem>[1] & { settings: () => void, end: () => void }} actions
 */
export function menuGroups(state, actions) {
  const settingsItem = { label: t('menu.settings'), icon: ICONS.settings, action: actions.settings };
  if (!state) return [startItems(), [settingsItem], commonItems()];
  return [
    [...pauseItem(state, actions), { label: t('menu.showQr'), icon: ICONS.qr, action: showQr, disabled: joinInfoShown() }, settingsItem],
    commonItems(),
    [{ label: t('menu.endGame'), icon: ICONS.leave, action: actions.end }],
  ];
}

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#start-game', '#new-match'];

export function mountKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return; // modalen sköter sig själv
    const el = /** @type {Element} */ (e.target);
    if (el.closest('button, a, input, textarea')) return; // fokuserade knappar och länkar trycks redan
    const target = /** @type {HTMLButtonElement | undefined} */ (ENTER_TARGETS.map((sel) => $(sel))
      .find((b) => b && b.offsetParent && !(/** @type {HTMLButtonElement} */ (b)).disabled));
    if (!target) return;
    e.preventDefault();
    target.click();
  });
  // Safari på iPhone visar bara :active-läget när sidan lyssnar på touchstart.
  document.addEventListener('touchstart', () => {}, { passive: true });
}
