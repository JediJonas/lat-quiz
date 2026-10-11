// Ljust eller mörkt läge. Utan eget val följer sidan enhetens inställning.
// Själva valet läses in redan i <head>, så att sidan inte blinkar till.

const THEME_KEY = 'latquiz-tema';
const CHOICES = [['auto', 'Automatiskt (som enheten)'], ['light', 'Ljust'], ['dark', 'Mörkt']];

export function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
}

export function setTheme(theme) {
  try {
    if (theme === 'light' || theme === 'dark') localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch { /* privat läge: valet gäller bara den här sidvisningen */ }
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function showThemeSettings() {
  const current = currentTheme();
  const dialog = document.createElement('dialog');
  dialog.className = 'modal settings';
  dialog.innerHTML = `
    <form method="dialog">
      <h2>Inställningar</h2>
      <label for="setting-theme">Utseende</label>
      <select id="setting-theme" name="theme">
        ${CHOICES.map(([v, text]) => `<option value="${v}"${v === current ? ' selected' : ''}>${text}</option>`).join('')}
      </select>
      <div class="modal-actions">
        <button value="cancel" class="secondary">Avbryt</button>
        <button value="ok">Spara</button>
      </div>
    </form>`;
  // En rullista skickar inte formuläret med Enter, så Enter sparar här.
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'SELECT') {
      e.preventDefault();
      dialog.querySelector('[value=ok]').click();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') setTheme(dialog.querySelector('select').value);
    dialog.remove();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
