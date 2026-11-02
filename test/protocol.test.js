import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as protocol from '../js/shared/protocol.js';

const { MSG, fromPlayer } = protocol;

test('meddelandetyperna har samma namn som förut, så att äldre sidor förstår dem', () => {
  assert.deepEqual(MSG, {
    hello: 'hello', answer: 'answer', leave: 'leave', pong: 'pong', state: 'state', joined: 'joined',
    left: 'left', newMatch: 'new-match', nameTaken: 'name-taken', ended: 'ended', leaving: 'leaving', ping: 'ping',
  });
});

test('hello har med protokollversionen', () => {
  assert.deepEqual(protocol.hello({ playerId: 'p1', name: 'Anna', code: 'ABCD' }),
    { type: 'hello', playerId: 'p1', name: 'Anna', version: protocol.PROTOCOL_VERSION });
});

test('ett hello från en spelare kortas och kräver namn och id', () => {
  assert.deepEqual(fromPlayer({ type: 'hello', playerId: 'p1', name: '  Anna-Karin Svensson ' }),
    { type: 'hello', playerId: 'p1', name: 'Anna-Karin', version: 0 });
  assert.equal(fromPlayer({ type: 'hello', playerId: 'p1', name: '   ' }), null);
  assert.equal(fromPlayer({ type: 'hello', name: 'Anna' }), null);
  assert.equal(fromPlayer({ type: 'hello', playerId: 'x'.repeat(100), name: 'Anna' }).playerId.length, 40);
});

test('svar tas bara emot i artist och titel, och kortas', () => {
  assert.deepEqual(fromPlayer(protocol.answer('title', 'Hello')), { type: 'answer', field: 'title', value: 'Hello' });
  assert.deepEqual(fromPlayer({ type: 'answer', field: 'artist' }), { type: 'answer', field: 'artist', value: '' });
  assert.equal(fromPlayer({ type: 'answer', field: 'score', value: 99 }), null);
  assert.equal(fromPlayer(protocol.answer('title', 'x'.repeat(500))).value.length, 200);
});

test('okända och trasiga meddelanden släpps', () => {
  for (const msg of [null, undefined, 'hello', 42, {}, { type: 'state', view: {} }, { type: 'ended' }]) {
    assert.equal(fromPlayer(msg), null);
  }
  assert.deepEqual(fromPlayer({ type: 'leave', extra: 1 }), { type: 'leave' });
});
