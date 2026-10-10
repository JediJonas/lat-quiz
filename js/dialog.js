// Modaler i stället för webbläsarens alert() och confirm().
// Bygger på <dialog>, som sköter fokus, Esc och bakgrunden.

function open({ title, message, okText = 'OK', cancelText = null, danger = false }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.innerHTML = `
    <form method="dialog">
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
  ok.insertAdjacentHTML('beforeend', '<kbd>Enter</kbd>');
  if (danger) ok.classList.add('danger');
  if (cancelText) {
    const cancel = dialog.querySelector('[value=cancel]');
    cancel.textContent = cancelText;
    cancel.insertAdjacentHTML('beforeend', '<kbd>Esc</kbd>');
  }

  // Klick på bakgrunden stänger som Avbryt.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancel');
  });

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
