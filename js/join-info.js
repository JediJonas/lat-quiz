// QR-koden och länken för att gå med i spelet, likadana hos spelledaren och spelarna.
// qrcode kommer från vendor/qrcode.js via en script-tagg.
import { $ } from './shared/dom.js';

/** Skriver länken och ritar QR-koden för den. @param {string} url */
export function renderJoinInfo(url) {
  $('#join-url').textContent = url;
  $('#join-url').href = url;
  $('#join-url-row').hidden = true;
  $('#copy-status').textContent = '';
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

// Länken kopieras, så att den kan skickas till fler spelare. Utan tillgång till urklipp visas
// länken i stället, så att den kan kopieras för hand.
let copiedTimer = null;

/** @param {string} url */
export async function copyJoinLink(url) {
  const button = $('#copy-link');
  const status = $('#copy-status');
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'länken (kopierad)';
    status.textContent = 'Länken är kopierad';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { button.textContent = 'länken'; status.textContent = ''; }, 3000);
  } catch {
    $('#join-url-row').hidden = false;
    status.textContent = '';
  }
}

/** Sant när QR-koden syns, så att Visa QR-kod i menyn blir grå. */
export const joinInfoShown = () => !$('#join-info').hidden;
