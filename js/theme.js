// Ljust eller mörkt läge. Utan eget val följer sidan enhetens inställning.
// Själva valet läses in redan i <head>, så att sidan inte blinkar till.

const THEME_KEY = 'latquiz-tema';
const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : deviceDark.matches;
}

const TEXT_KEY = 'latquiz-text';
const TEXT_SIZES = [['small', 'Liten'], ['medium', 'Mellan'], ['large', 'Stor']];

function textSize() {
  return document.documentElement.dataset.text || 'medium';
}

function setTextSize(size) {
  document.documentElement.dataset.text = size;
  try { localStorage.setItem(TEXT_KEY, size); } catch { /* privat läge */ }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* privat läge: gäller bara den här sidvisningen */ }
}

// Gör en knapp till en strömbrytare för mörkt läge.
function mountThemeSwitch(el) {
  const update = () => el.setAttribute('aria-checked', String(isDark()));
  el.innerHTML = '<span class="track" aria-hidden="true"></span>Mörkt läge';
  el.setAttribute('role', 'switch');
  el.addEventListener('click', () => { setTheme(isDark() ? 'light' : 'dark'); update(); });
  update();
}

// Utseendet gäller den här enheten och inte spelet.
function showUserSettings() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.setAttribute('aria-labelledby', 'user-settings-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="user-settings-title">Utseende</h2>
      <button type="button" class="theme-switch"></button>
      <fieldset class="segmented">
        <legend>Textstorlek</legend>
        ${TEXT_SIZES.map(([value, text]) => `<label><input type="radio" name="text-size" value="${value}"${value === textSize() ? ' checked' : ''}><span>${text}</span></label>`).join('')}
      </fieldset>
      <div class="modal-actions">
        <button value="ok">Stäng</button>
      </div>
    </form>`;
  mountThemeSwitch(dialog.querySelector('.theme-switch'));
  dialog.querySelector('.segmented').addEventListener('change', (e) => setTextSize(e.target.value));
  // Tangenter i rutan ska inte nå sidan, där Enter annars styr spelet.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

// Gör alla knappar med klassen user-settings till länken Utseende.
export function mountUserSettings() {
  for (const el of document.querySelectorAll('.user-settings')) {
    el.textContent = 'Utseende';
    el.addEventListener('click', showUserSettings);
  }
}
