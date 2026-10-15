import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// En låtsas-PeerJS som låter testet styra vad som händer.
class FakeEmitter {
  constructor() { this.handlers = {}; }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, ...args) { for (const fn of this.handlers[name] || []) fn(...args); }
}

const peers = [];
class FakePeer extends FakeEmitter {
  constructor() { super(); this.destroyed = false; this.disconnected = false; this.reconnects = 0; this.conns = []; peers.push(this); }
  connect() { const c = new FakeConn(); this.conns.push(c); return c; }
  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    this.emit('disconnected');
  }
  reconnect() {
    if (!this.disconnected) throw new Error('inte frånkopplad');
    this.disconnected = false;
    this.reconnects++;
  }
  destroy() { this.destroyed = true; }
}
class FakeConn extends FakeEmitter {
  constructor() { super(); this.open = false; this.sent = []; }
  send(msg) { this.sent.push(msg); }
  close() { this.open = false; }
}
function opened(conn) { conn.open = true; conn.emit('open'); }

globalThis.Peer = FakePeer;
globalThis.location = { search: '' };
const visibilityListeners = new Set();
globalThis.document = {
  visibilityState: 'visible',
  addEventListener(name, fn) { if (name === 'visibilitychange') visibilityListeners.add(fn); },
  removeEventListener(name, fn) { visibilityListeners.delete(fn); },
};
function setVisibility(state) {
  document.visibilityState = state;
  for (const fn of visibilityListeners) fn();
}
const { createClient, createHost } = await import('../js/net.js');

function setup() {
  peers.length = 0;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const statuses = [];
  const events = { opens: 0, notFound: 0, unreachable: [] };
  const client = createClient('ABCD', {
    onOpen: () => events.opens++,
    onMessage() {},
    onStatus: (s) => statuses.push(s),
    onNotFound: () => events.notFound++,
    onUnreachable: (reason) => events.unreachable.push(reason),
  });
  return { client, statuses, events };
}

test('ett tyst anslutningsförsök ges upp och görs om med en ny Peer', () => {
  const { client, statuses, events } = setup();
  try {
    peers[0].emit('open');
    assert.equal(peers[0].conns.length, 1);
    // Spelledaren svarar aldrig. Förr stod det "Ansluter…" för alltid.
    mock.timers.tick(8000);
    assert.equal(peers[0].destroyed, true);
    assert.equal(statuses.at(-1), 'offline');
    mock.timers.tick(1000);
    assert.equal(peers.length, 2);
    assert.equal(statuses.at(-1), 'connecting');
    peers[1].emit('open');
    opened(peers[1].conns[0]);
    assert.equal(statuses.at(-1), 'connected');
    assert.equal(events.opens, 1);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('om förmedlingsservern aldrig svarar görs ett nytt försök', () => {
  const { client } = setup();
  try {
    mock.timers.tick(8000);
    mock.timers.tick(1000);
    assert.equal(peers.length, 2);
    assert.equal(peers[0].destroyed, true);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('en tappad förbindelse ger en ny Peer, inte den gamla igen', () => {
  const { client, statuses } = setup();
  try {
    peers[0].emit('open');
    opened(peers[0].conns[0]);
    peers[0].conns[0].emit('close');
    assert.equal(statuses.at(-1), 'offline');
    mock.timers.tick(1000);
    assert.equal(peers.length, 2);
    assert.equal(peers[0].destroyed, true);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('fel mot förmedlingsservern bryter inte en öppen förbindelse', () => {
  const { client, statuses } = setup();
  try {
    peers[0].emit('open');
    opened(peers[0].conns[0]);
    peers[0].emit('error', { type: 'network' });
    assert.equal(statuses.at(-1), 'connected');
    assert.equal(peers.length, 1);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('fel kod rapporteras direkt utan nya försök', () => {
  const { client, events } = setup();
  try {
    peers[0].emit('open');
    peers[0].emit('error', { type: 'peer-unavailable' });
    assert.equal(events.notFound, 1);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('saknas spelledaren efter att vi har varit anslutna försöker klienten igen', () => {
  const { client, statuses, events } = setup();
  try {
    peers[0].emit('open');
    opened(peers[0].conns[0]);
    peers[0].conns[0].emit('close');
    mock.timers.tick(1000);
    peers[1].emit('open');
    peers[1].emit('error', { type: 'peer-unavailable' });
    assert.equal(statuses.at(-1), 'host-missing');
    assert.equal(events.notFound, 0);
    mock.timers.tick(2000);
    assert.equal(peers.length, 3);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('svarar spelledaren aldrig får en ny spelare veta det efter tre försök', () => {
  const { client, events } = setup();
  try {
    // Förmedlingsservern svarar, men spelledaren gör det aldrig. Förr stod det "Ansluter…" för alltid.
    peers[0].emit('open');
    mock.timers.tick(8000);
    mock.timers.tick(1000);
    peers[1].emit('open');
    mock.timers.tick(8000);
    assert.deepEqual(events.unreachable, []);
    mock.timers.tick(2000);
    peers[2].emit('open');
    mock.timers.tick(8000);
    assert.deepEqual(events.unreachable, ['host']);
    mock.timers.tick(60000);
    assert.equal(peers.length, 3);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('nås inte förmedlingsservern får en ny spelare veta det', () => {
  const { client, events } = setup();
  try {
    for (const ms of [8000, 1000, 8000, 2000]) mock.timers.tick(ms);
    assert.deepEqual(events.unreachable, []);
    mock.timers.tick(8000);
    assert.deepEqual(events.unreachable, ['relay']);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

test('en spelare som har varit ansluten ger aldrig upp', () => {
  const { client, events } = setup();
  try {
    peers[0].emit('open');
    opened(peers[0].conns[0]);
    peers[0].conns[0].emit('close');
    for (let i = 0; i < 60; i++) mock.timers.tick(2000);
    assert.deepEqual(events.unreachable, []);
    assert.ok(peers.length > 4);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});

function setupHost() {
  peers.length = 0;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const errors = [];
  const host = createHost('ABCD', {
    onReady() {}, onMessage() {}, onDisconnect() {},
    onError: (type) => errors.push(type),
  });
  return { host, errors };
}

test('spelledarens förbindelse till förmedlingsservern kopplas upp igen när sidan syns efter en stund', () => {
  const { host, errors } = setupHost();
  try {
    peers[0].emit('open');
    setVisibility('hidden');
    mock.timers.tick(30000);
    setVisibility('visible');
    assert.equal(peers[0].reconnects, 1);
    assert.equal(peers[0].disconnected, false);
    // Det är ingen avbrott att visa för spelledaren.
    assert.deepEqual(errors, []);
  } finally {
    host.destroy();
    setVisibility('visible');
    mock.timers.reset();
  }
});

test('en kort stund i bakgrunden kopplar inte upp förbindelsen igen', () => {
  const { host } = setupHost();
  try {
    setVisibility('hidden');
    mock.timers.tick(1000);
    setVisibility('visible');
    assert.equal(peers[0].reconnects, 0);
  } finally {
    host.destroy();
    mock.timers.reset();
  }
});

test('ett avbrott som redan har kopplats upp igen försöker inte koppla upp en gång till', () => {
  const { host, errors } = setupHost();
  try {
    setVisibility('hidden');
    mock.timers.tick(6000);
    // Avbrottet märks precis när sidan syns igen.
    peers[0].disconnect();
    assert.deepEqual(errors, ['relay']);
    setVisibility('visible');
    assert.equal(peers[0].reconnects, 1);
    // Den väntande återanslutningen ska inte kasta fel nu när förbindelsen redan är uppe.
    mock.timers.tick(2000);
    assert.equal(peers[0].reconnects, 1);
  } finally {
    host.destroy();
    setVisibility('visible');
    mock.timers.reset();
  }
});

test('spelaren får veta varje gång något hörs från spelledaren, även ping', () => {
  peers.length = 0;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  let heard = 0;
  const messages = [];
  const client = createClient('ABCD', {
    onOpen() {},
    onMessage: (msg) => messages.push(msg.type),
    onHeard: () => heard++,
    onStatus() {},
    onNotFound() {},
    onUnreachable() {},
  });
  try {
    peers[0].emit('open');
    const conn = peers[0].conns[0];
    opened(conn);
    conn.emit('data', { type: 'leaving' });
    conn.emit('data', { type: 'ping' });
    assert.equal(heard, 2);
    assert.deepEqual(messages, ['leaving']);
  } finally {
    client.destroy();
    mock.timers.reset();
  }
});
