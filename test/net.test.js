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
  constructor() { super(); this.destroyed = false; this.conns = []; peers.push(this); }
  connect() { const c = new FakeConn(); this.conns.push(c); return c; }
  reconnect() {}
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
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
const { createClient } = await import('../js/net.js');

function setup() {
  peers.length = 0;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const statuses = [];
  const events = { opens: 0, notFound: 0 };
  const client = createClient('ABCD', {
    onOpen: () => events.opens++,
    onMessage() {},
    onStatus: (s) => statuses.push(s),
    onNotFound: () => events.notFound++,
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
