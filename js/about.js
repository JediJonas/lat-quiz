// @ts-check
// Om Låtquiz, som en ruta. Den går att läsa när som helst, även under ett spel.
import { t } from './shared/lang.js';

export function showAbout() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal about';
  dialog.setAttribute('aria-labelledby', 'about-title');
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="about-title">${t('about.title')}</h2>
      ${t('about.body')}
      <div class="modal-actions">
        <button value="ok">${t('dialog.ok')}</button>
      </div>
    </form>`;
  // Tangenter i rutan ska inte nå sidan, där Enter annars styr spelet.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  // Rutan själv får fokus, så att texten läses från början och inte rullas ner till Stäng.
  dialog.tabIndex = -1;
  document.body.append(dialog);
  dialog.showModal();
  dialog.focus();
  // showModal har redan lagt fokus på Stäng och rullat ner dit. Texten ska börja överst.
  dialog.scrollTop = 0;
}
