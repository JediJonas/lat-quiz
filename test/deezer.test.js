import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTrack } from '../js/deezer.js';

const track = (artist, title, preview = 'https://cdn/x.mp3') => ({ artist: { name: artist }, title, preview });

test('pickTrack väljer rätt artist och originalet före liveversioner', () => {
  const results = [
    track('Tribute Band', 'Take On Me'),
    track('a-ha', 'Take On Me (Live)', 'live'),
    track('a-ha', 'Take On Me', 'original'),
  ];
  assert.equal(pickTrack(results, { artist: 'a-ha', title: 'Take On Me' }).preview, 'original');
});

test('pickTrack bortser från accenter och skiljetecken', () => {
  const results = [track('Ted Gardestad', 'Sol, vind och vatten', 'ok')];
  assert.equal(pickTrack(results, { artist: 'Ted Gärdestad', title: 'Sol vind och vatten' }).preview, 'ok');
});

test('pickTrack returnerar null utan klipp eller rätt artist', () => {
  assert.equal(pickTrack([track('a-ha', 'Take On Me', '')], { artist: 'a-ha', title: 'Take On Me' }), null);
  assert.equal(pickTrack([track('Någon annan', 'Take On Me')], { artist: 'a-ha', title: 'Take On Me' }), null);
  assert.equal(pickTrack(undefined, { artist: 'a-ha', title: 'Take On Me' }), null);
});
