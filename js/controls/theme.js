// @ts-check
// Ljust eller mörkt läge. Utan eget val är sidan mörk, eftersom den är snyggast så.
// Själva valet läses in redan i <head>, så att sidan inte blinkar till.
import { dragToClose } from './sheet.js';
import { t } from '../shared/lang.js';
import { KEYS, writeText } from '../shared/storage.js';

const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : deviceDark.matches;
}

// Stor text gör all text större, för den som vill se bättre.

function isLargeText() {
  return document.documentElement.dataset.text === 'large';
}

function setLargeText(large) {
  const root = document.documentElement;
  if (large) root.dataset.text = 'large'; else delete root.dataset.text;
  writeText(KEYS.text, large ? 'large' : null);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // I privat läge gäller valet bara den här sidvisningen.
  writeText(KEYS.theme, theme);
}

// Gör en knapp till en strömbrytare.
export function mountSwitch(el, label, isOn, toggle) {
  const update = () => el.setAttribute('aria-checked', String(isOn()));
  el.innerHTML = `<span class="track" aria-hidden="true"></span>${label}`;
  el.setAttribute('role', 'switch');
  el.addEventListener('click', () => { toggle(); update(); });
  update();
}

// Utseendet gäller den här enheten och inte spelet.
export function showUserSettings() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.setAttribute('aria-labelledby', 'user-settings-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="user-settings-title">${t('menu.appearance')}</h2>
      <div class="switches">
        <button type="button" class="theme-switch" id="switch-dark"></button>
        <button type="button" class="theme-switch" id="switch-text"></button>
      </div>
      <div class="modal-actions">
        <button value="ok">${t('dialog.ok')}</button>
      </div>
    </form>`;
  mountSwitch(dialog.querySelector('#switch-dark'), t('appearance.dark'), isDark, () => setTheme(isDark() ? 'light' : 'dark'));
  mountSwitch(dialog.querySelector('#switch-text'), t('appearance.largeText'), isLargeText, () => setLargeText(!isLargeText()));
  // Tangenter i rutan ska inte nå sidan, där Enter annars styr spelet.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  // Rutan själv får fokus, inte första strömbrytaren, så att inget ser valt ut i mobilen.
  // Skärmläsaren läser rubriken, och Tab går till strömbrytarna.
  dialog.tabIndex = -1;
  document.body.append(dialog);
  dragToClose(dialog);
  dialog.showModal();
  dialog.focus();
}
