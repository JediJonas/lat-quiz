// Modaler i stället för webbläsarens alert() och confirm().
// Bygger på <dialog>, som sköter fokus, Esc och bakgrunden.

// Material Symbols Rounded (Apache 2.0): info_i.
const INFO_ICON = '<svg viewBox="0 -960 960 960"><path d="M480-680q-33 0-56.5-23.5T400-760q0-33 23.5-56.5T480-840q33 0 56.5 23.5T560-760q0 33-23.5 56.5T480-680Zm0 560q-25 0-42.5-17.5T420-180v-360q0-25 17.5-42.5T480-600q25 0 42.5 17.5T540-540v360q0 25-17.5 42.5T480-120Z"/></svg>';

// Alla frågor och meddelanden ser likadana ut: en ikon överst, rubrik, text och knappar.
// icon: ikonen (svg). Utan egen ikon visas i. Röd ton när knappen gör något som inte går att ångra.
function open({ title, message, okText = 'OK', cancelText = null, danger = false, icon = INFO_ICON }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal confirm';
  dialog.innerHTML = `
    <form method="dialog">
      <span class="modal-icon${danger ? ' danger' : ''}" aria-hidden="true">${icon}</span>
      <h2></h2>
      <p></p>
      <div class="modal-actions">
        ${cancelText ? '<button value="cancel" class="secondary"></button>' : ''}
        <button value="ok" class="ok"></button>
      </div>
    </form>`;
  const h2 = dialog.querySelector('h2');
  if (title) h2.textContent = title; else h2.remove();
  dialog.querySelector('p').textContent = message;
  const ok = dialog.querySelector('.ok');
  ok.textContent = okText;
  if (danger) ok.classList.add('danger');
  if (cancelText) dialog.querySelector('[value=cancel]').textContent = cancelText;


  document.body.append(dialog);
  dialog.showModal();
  ok.focus();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    }, { once: true });
  });
}

export function showAlert(message, options = {}) {
  return open({ message, ...options }).then(() => undefined);
}

export function showConfirm(message, options = {}) {
  return open({ message, okText: 'OK', cancelText: 'Avbryt', ...options });
}
