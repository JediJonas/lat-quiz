// Ljust eller mörkt läge. Utan eget val följer sidan enhetens inställning.
// Själva valet läses in redan i <head>, så att sidan inte blinkar till.

const THEME_KEY = 'latquiz-tema';
const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : deviceDark.matches;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* privat läge: gäller bara den här sidvisningen */ }
}

// Gör alla knappar med klassen theme-switch till en strömbrytare för mörkt läge.
export function mountThemeSwitches() {
  const switches = [...document.querySelectorAll('.theme-switch')];
  const update = () => {
    for (const el of switches) el.setAttribute('aria-checked', String(isDark()));
  };
  for (const el of switches) {
    el.innerHTML = '<span class="track" aria-hidden="true"></span>Mörkt läge';
    el.setAttribute('role', 'switch');
    el.addEventListener('click', () => { setTheme(isDark() ? 'light' : 'dark'); update(); });
  }
  deviceDark.addEventListener('change', update);
  update();
}
