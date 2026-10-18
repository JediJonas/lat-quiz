// Ljust eller mörkt läge. Utan eget val följer sidan enhetens inställning.
// Själva valet läses in redan i <head>, så att sidan inte blinkar till.
import { dragToClose } from './ark.js';

const THEME_KEY = 'latquiz-tema';
const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : deviceDark.matches;
}

// Stor text gör all text större, för den som vill se bättre.
const TEXT_KEY = 'latquiz-text';

function isLargeText() {
  return document.documentElement.dataset.text === 'large';
}

function setLargeText(large) {
  const root = document.documentElement;
  if (large) root.dataset.text = 'large'; else delete root.dataset.text;
  try {
    if (large) localStorage.setItem(TEXT_KEY, 'large'); else localStorage.removeItem(TEXT_KEY);
  } catch { /* privat läge */ }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* privat läge: gäller bara den här sidvisningen */ }
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
      <h2 id="user-settings-title">Utseende</h2>
      <div class="switches">
        <button type="button" class="theme-switch" id="switch-dark"></button>
        <button type="button" class="theme-switch" id="switch-text"></button>
      </div>
      <div class="modal-actions">
        <button value="ok">OK</button>
      </div>
    </form>`;
  mountSwitch(dialog.querySelector('#switch-dark'), 'Mörkt läge', isDark, () => setTheme(isDark() ? 'light' : 'dark'));
  mountSwitch(dialog.querySelector('#switch-text'), 'Stor text', isLargeText, () => setLargeText(!isLargeText()));
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
