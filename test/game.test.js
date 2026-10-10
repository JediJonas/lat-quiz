import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setConnected, nextSong, startRound, submitAnswer,
  shouldReveal, reveal, standings, playerView, remainingMs, unplayedSongs,
} from '../js/game.js';

const songs = [
  { id: 'a', artist: 'a-ha', title: 'Take On Me', year: 1985 },
  { id: 'b', artist: 'Europe', title: 'The Final Countdown', year: 1986 },
];

function setup() {
  const state = createGame({ code: 'ABCD', categoryId: '80-tal' });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  addPlayer(state, { id: 'p2', name: 'Bo' });
  nextSong(state, songs, () => 0);
  startRound(state, 1000);
  return state;
}

test('rätt artist och titel ger 1 poäng var, plus bonus inom 15 sekunder', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'artist', 'a-ha', 5000);
  submitAnswer(state, 'p1', 'title', 'take on me', 9000);
  reveal(state);
  assert.deepEqual(state.round.results.p1, { artist: true, title: true, bonus: true, points: 3 });
  assert.equal(state.players.p1.score, 3);
});

test('ingen bonus när senaste ändringen kom efter 15 sekunder', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  submitAnswer(state, 'p1', 'title', 'Take On Me', 3000);
  submitAnswer(state, 'p1', 'title', 'Take On Me', 20000); // samma värde räknas inte som ändring
  assert.equal(state.round.answers.p1.changedAt, 3000);
  submitAnswer(state, 'p1', 'artist', 'Europe', 17000);
  submitAnswer(state, 'p1', 'artist', 'a-ha', 17000);
  reveal(state);
  assert.deepEqual(state.round.results.p1, { artist: true, title: true, bonus: false, points: 2 });
});

test('tomt eller fel svar ger 0 poäng och ingen bonus', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'artist', 'Europe', 2000);
  reveal(state);
  assert.equal(state.round.results.p1.points, 0);
  assert.equal(state.round.results.p2.points, 0);
});

test('bara en rätt del ger 1 poäng utan bonus', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  submitAnswer(state, 'p1', 'title', 'The Final Countdown', 2000);
  reveal(state);
  assert.deepEqual(state.round.results.p1, { artist: true, title: false, bonus: false, points: 1 });
});

test('svar tas inte emot före start, efter tidens slut eller efter visat svar', () => {
  const state = createGame({ code: 'ABCD', categoryId: '80-tal' });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  nextSong(state, songs, () => 0);
  assert.equal(submitAnswer(state, 'p1', 'artist', 'a-ha', 500), false);
  startRound(state, 1000);
  assert.equal(submitAnswer(state, 'p1', 'artist', 'a-ha', 31001), false);
  assert.equal(submitAnswer(state, 'p1', 'artist', 'a-ha', 31000), true);
  reveal(state);
  assert.equal(submitAnswer(state, 'p1', 'title', 'Take On Me', 31000), false);
});

test('svaret visas när tiden är slut eller när alla anslutna har svarat', () => {
  const state = setup();
  assert.equal(shouldReveal(state, 30999), false);
  assert.equal(shouldReveal(state, 31000), true);
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  submitAnswer(state, 'p1', 'title', 'Take On Me', 2000);
  assert.equal(shouldReveal(state, 3000), false);
  setConnected(state, 'p2', false);
  assert.equal(shouldReveal(state, 3000), true);
  assert.equal(remainingMs(state, 3000), 28000);
});

test('spelade låtar slumpas inte igen, och null när alla är spelade', () => {
  const state = createGame({ code: 'ABCD', categoryId: '80-tal', playedIds: ['a'] });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  assert.equal(nextSong(state, songs, () => 0).id, 'b');
  startRound(state, 0);
  reveal(state);
  assert.deepEqual(state.playedIds, ['a', 'b']);
  assert.equal(unplayedSongs(state, songs).length, 0);
  assert.equal(nextSong(state, songs), null);
});

test('återanslutning med samma id behåller poängen', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  reveal(state);
  setConnected(state, 'p1', false);
  addPlayer(state, { id: 'p1', name: 'Anna' });
  assert.equal(state.players.p1.score, 1);
  assert.equal(state.players.p1.connected, true);
  assert.equal(Object.keys(state.players).length, 2);
});

test('spelaren ser inte låten förrän svaret visas', () => {
  const state = setup();
  assert.equal(playerView(state, 'p1', 2000).round.song, null);
  reveal(state);
  const view = playerView(state, 'p1', 2000);
  assert.equal(view.round.song.title, 'Take On Me');
  assert.equal(view.round.result.points, 0);
});

test('poängställningen sorteras efter poäng och sedan namn', () => {
  const state = setup();
  submitAnswer(state, 'p2', 'artist', 'a-ha', 2000);
  reveal(state);
  assert.deepEqual(standings(state).map((p) => p.name), ['Bo', 'Anna']);
});
