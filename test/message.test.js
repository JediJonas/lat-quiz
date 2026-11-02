import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// En liten låtsassida med det som meddelanderutan använder.
function fakeElement() {
  return {
    hidden: false, className: '', innerHTML: '', textContent: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    append() {},
  };
}
const announced = fakeElement();
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
globalThis.matchMedia = globalThis.window.matchMedia;
globalThis.document = {
  documentElement: { dataset: {} },
  body: fakeElement(),
  createElement: () => fakeElement(),
  getElementById: (id) => (id === 'announce' ? announced : null),
};

mock.timers.enable({ apis: ['setTimeout'] });
const { showMessage, hideMessage, setStandingMessage, currentMessage, showJoined, showLeft, INFO_MS } = await import('../js/message.js');

const reset = () => { setStandingMessage(null); hideMessage(); };

test('ett meddelande visas och läses upp', (ctx) => {
  ctx.after(reset);
  showMessage({ key: 'net', kind: 'busy', title: 'Ansluter', text: 'Vänta lite' });
  assert.equal(currentMessage().title, 'Ansluter');
  assert.equal(announced.textContent, 'Ansluter. Vänta lite');
});

test('klart försvinner av sig självt, annat står kvar', (ctx) => {
  ctx.after(reset);
  showMessage({ key: 'saved', kind: 'ok', title: 'Sparat' });
  mock.timers.tick(3000);
  assert.equal(currentMessage(), null);
  showMessage({ key: 'net', kind: 'busy', title: 'Ansluter' });
  mock.timers.tick(60000);
  assert.equal(currentMessage().key, 'net');
});

test('hideMessage tar inte bort ett nyare meddelande om något annat', (ctx) => {
  ctx.after(reset);
  showMessage({ key: 'net', kind: 'busy', title: 'Ansluter' });
  showMessage({ key: 'settings', kind: 'info', title: 'Spelet ändrades' });
  hideMessage('net');
  assert.equal(currentMessage().key, 'settings');
});

test('det stående meddelandet kommer tillbaka när ett annat försvinner', (ctx) => {
  ctx.after(reset);
  setStandingMessage({ kind: 'pause', title: 'Pausat' });
  showMessage({ key: 'left', kind: 'info', title: 'Hej då', ms: INFO_MS });
  assert.equal(currentMessage().key, 'left');
  mock.timers.tick(INFO_MS);
  assert.equal(currentMessage().title, 'Pausat');
  setStandingMessage(null);
  assert.equal(currentMessage(), null);
});

test('spelare som går med nästan samtidigt hälsas i samma ruta', (ctx) => {
  ctx.after(reset);
  showJoined('Anna');
  showJoined('Bo');
  mock.timers.tick(400);
  assert.equal(currentMessage().title, 'Välkomna!');
  assert.match(currentMessage().text, /Anna och Bo/);
});

test('en ny spelare eller en som lämnar tar inte över ett fel', (ctx) => {
  ctx.after(reset);
  showMessage({ key: 'net', kind: 'problem', title: 'Anslutningen bröts' });
  showJoined('Anna');
  mock.timers.tick(400);
  showLeft('Bo');
  assert.equal(currentMessage().key, 'net');
});
