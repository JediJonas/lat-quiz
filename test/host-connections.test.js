import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game/game.js';
import * as protocol from '../js/shared/protocol.js';
import { createConnections } from '../js/host/host-connections.js';

// En spelledare med falskt nät, som minns vad som skickades till vem.
function setup() {
  const state = game.createGame({ code: 'ABCD', categoryId: '60', categoryName: '60-tal', settings: {} });
  const sent = [];
  const dropped = [];
  const shown = [];
  let handlers = null;
  let destroyed = false;
  let changes = 0;
  const connections = createConnections({
    state: () => state,
    viewFor: (playerId) => ({ me: playerId }),
    changed: () => { changes += 1; },
    createHost: (code, h) => {
      handlers = h;
      return {
        send: (connId, msg) => sent.push([connId, msg]),
        drop: (connId) => { dropped.push(connId); h.onDisconnect(connId); },
        destroy: () => { destroyed = true; },
      };
    },
    show: {
      joined: (name) => shown.push(['joined', name]),
      left: (name) => shown.push(['left', name]),
      message: (msg) => shown.push(['message', msg.title]),
    },
  });
  connections.start('ABCD');
  const hello = (connId, playerId, name) => handlers.onMessage(connId, { type: protocol.MSG.hello, playerId, name, version: protocol.PROTOCOL_VERSION });
  return { state, sent, dropped, shown, connections, hello, handlers: () => handlers, destroyed: () => destroyed, changes: () => changes };
}

test('en ny spelare läggs till och de andra får veta det', () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.sent.length = 0;
  t.hello('c2', 'p2', 'Bo');
  assert.ok(t.state.players.p2);
  assert.deepEqual(t.shown.map(([kind, name]) => `${kind} ${name}`), ['joined Anna', 'joined Bo']);
  assert.deepEqual(t.sent, [['c1', protocol.joined('Bo')]]);
  assert.equal(t.changes(), 2);
});

test('ett upptaget namn får nameTaken och läggs inte till', () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.hello('c2', 'p2', 'Anna');
  assert.equal(t.state.players.p2, undefined);
  assert.deepEqual(t.sent.at(-1), ['c2', protocol.nameTaken('Anna')]);
});

test('samma spelare på en ny anslutning släpper den gamla och räknas inte som ny', () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.hello('c2', 'p1', 'Anna');
  assert.deepEqual(t.dropped, ['c1']);
  assert.equal(t.state.players.p1.connected, true);
  assert.equal(t.shown.length, 1);
  t.connections.broadcast();
  assert.deepEqual(t.sent.at(-1), ['c2', protocol.state({ me: 'p1' })]);
});

test('broadcast ger varje spelare sin egen vy', () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.hello('c2', 'p2', 'Bo');
  t.sent.length = 0;
  t.connections.broadcast();
  assert.deepEqual(t.sent, [['c1', protocol.state({ me: 'p1' })], ['c2', protocol.state({ me: 'p2' })]]);
});

test('svar räknas bara från anslutna spelare', () => {
  const t = setup();
  t.handlers().onMessage('okänd', { type: protocol.MSG.answer, field: 'artist', value: 'ABBA' });
  assert.equal(t.changes(), 0);
  t.hello('c1', 'p1', 'Anna');
  t.handlers().onMessage('c1', { type: protocol.MSG.answer, field: 'artist', value: 'ABBA' });
  assert.equal(t.changes(), 2);
});

test('en spelare som lämnar kopplas bort och de andra får veta det', () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.hello('c2', 'p2', 'Bo');
  t.sent.length = 0;
  t.handlers().onMessage('c1', { type: protocol.MSG.leave });
  assert.deepEqual(t.dropped, ['c1']);
  assert.equal(t.state.players.p1.connected, false);
  assert.deepEqual(t.shown.at(-1), ['left', 'Anna']);
  assert.deepEqual(t.sent, [['c2', protocol.left('Anna')]]);
});

test('ogiltiga meddelanden ignoreras', () => {
  const t = setup();
  t.handlers().onMessage('c1', { type: 'nonsens' });
  t.handlers().onMessage('c1', null);
  assert.equal(t.changes(), 0);
});

test('nätverksfel visas, och Välkommen tillbaka när anslutningen fungerar igen', () => {
  const t = setup();
  t.handlers().onReady();
  assert.equal(t.shown.length, 0);
  t.handlers().onError('relay');
  t.handlers().onError('konstigt');
  t.handlers().onReady();
  assert.deepEqual(t.shown.map(([, title]) => title), ['Anslutningen bröts', 'Anslutningsfel', 'Välkommen tillbaka!']);
});

test('close skickar Spelet är slut till alla och stänger nätet', async () => {
  const t = setup();
  t.hello('c1', 'p1', 'Anna');
  t.sent.length = 0;
  await t.connections.close();
  assert.deepEqual(t.sent, [['c1', protocol.ended()]]);
  assert.equal(t.destroyed(), true);
});

test('före start skickas inget och close gör inget', async () => {
  const connections = createConnections({ state: () => null, viewFor: () => ({}), changed: () => {}, createHost: () => assert.fail() });
  connections.toAll(protocol.leaving());
  connections.broadcast();
  await connections.close();
});
