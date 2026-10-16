// Modaler i stället för webbläsarens alert() och confirm().
// Bygger på <dialog>, som sköter fokus, Esc och bakgrunden.

// icon: en ikon (svg) överst, till exempel före något som inte går att ångra.
function open({ title, message, okText = 'OK', cancelText = null, danger = false, icon = '' }) {
  const dialog = document.createElement('dialog');
  dialog.className = icon ? 'modal confirm' : 'modal';
  dialog.innerHTML = `
    <form method="dialog">
      ${icon ? `<span class="modal-icon${danger ? ' danger' : ''}" aria-hidden="true">${icon}</span>` : ''}
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
