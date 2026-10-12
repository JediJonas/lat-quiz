import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUnknown, countUnknown, formatUnknown, isUnknown, toggleUnknown, withoutUnknown } from '../js/okanda.js';

const song = { id: 'a-ha-take-on-me', artist: 'a-ha', title: 'Take On Me', year: 1985, spotifyId: 'x' };

test('en låt markeras och avmarkeras', () => {
  const marked = toggleUnknown({}, '80-tal', song);
  assert.deepEqual(marked, { '80-tal': [{ id: song.id, artist: 'a-ha', title: 'Take On Me' }] });
  assert.ok(isUnknown(marked, '80-tal', song.id));
  assert.ok(!isUnknown(marked, '90-tal', song.id));
  assert.equal(countUnknown(marked), 1);
  assert.deepEqual(toggleUnknown(marked, '80-tal', song), {});
});

test('okända låtar hoppas över, men inte om alla är okända', () => {
  const other = { id: 'b', artist: 'B', title: 'B' };
  const list = toggleUnknown({}, '80-tal', song);
  assert.deepEqual(withoutUnknown(list, '80-tal', [song, other]), [other]);
  assert.deepEqual(withoutUnknown(list, '80-tal', [song]), [song]);
  assert.deepEqual(withoutUnknown(list, '90-tal', [song, other]), [song, other]);
});

test('listan kopieras med kategorins namn', () => {
  const list = toggleUnknown({}, '80-tal', song);
  assert.equal(formatUnknown(list, { '80-tal': '80-tal' }), '80-tal:\n- a-ha – Take On Me (a-ha-take-on-me)');
});

test('trasig sparad lista blir tom', () => {
  assert.deepEqual(cleanUnknown(null), {});
  assert.deepEqual(cleanUnknown([1]), {});
  assert.deepEqual(cleanUnknown({ x: 'fel', y: [{ id: 3 }], z: [{ id: 'a', artist: 'A', title: 'T', extra: 1 }] }),
    { z: [{ id: 'a', artist: 'A', title: 'T' }] });
});
