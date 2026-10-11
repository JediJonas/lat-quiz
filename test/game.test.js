import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, addPlayer, setConnected, nextSong, startRound, submitAnswer,
  shouldReveal, reveal, standings, playerView, answeredFields, remainingMs, unplayedSongs, restart,
  cleanSettings, applySettings, changeCategory, nameTaken,
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
  assert.equal(submitAnswer(state, 'p1', 'artist', 'a-ha', 61001), false);
  assert.equal(submitAnswer(state, 'p1', 'artist', 'a-ha', 61000), true);
  reveal(state);
  assert.equal(submitAnswer(state, 'p1', 'title', 'Take On Me', 61000), false);
});

test('svaret visas när tiden är slut eller när alla anslutna har svarat', () => {
  const state = setup();
  assert.equal(shouldReveal(state, 60999), false);
  assert.equal(shouldReveal(state, 61000), true);
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  submitAnswer(state, 'p1', 'title', 'Take On Me', 2000);
  assert.equal(shouldReveal(state, 3000), false);
  setConnected(state, 'p2', false);
  assert.equal(shouldReveal(state, 3000), true);
  assert.equal(remainingMs(state, 3000), 58000);
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

test('spelarna ser vilka fält alla har fyllt i, och allas rättning efteråt', () => {
  const state = setup();
  submitAnswer(state, 'p1', 'title', 'Take On Me', 2000);
  const playing = playerView(state, 'p2', 2000).round;
  assert.deepEqual(playing.progress.p1, { artist: false, title: true });
  assert.deepEqual(playing.progress.p2, { artist: false, title: false });
  assert.equal(JSON.stringify(playing).includes('Take On Me'), false);
  assert.equal(playing.results, null);
  reveal(state);
  const revealed = playerView(state, 'p2', 2000).round;
  assert.deepEqual(revealed.progress.p2, { artist: false, title: false });
  assert.deepEqual(revealed.results.p1, state.round.results.p1);
});

test('poängställningen sorteras efter poäng och sedan namn', () => {
  const state = setup();
  submitAnswer(state, 'p2', 'artist', 'a-ha', 2000);
  reveal(state);
  assert.deepEqual(standings(state).map((p) => p.name), ['Bo', 'Anna']);
});

test('först till 10 poäng vinner, och sedan slumpas inga fler låtar', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ id: 's' + i, artist: 'A' + i, title: 'T' + i, year: 1985 }));
  const state = createGame({ code: 'ABCD', categoryId: '80-tal' });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  addPlayer(state, { id: 'p2', name: 'Bo' });
  let rounds = 0;
  while (!state.winners) {
    const song = nextSong(state, many, () => 0);
    startRound(state, 0);
    submitAnswer(state, 'p1', 'artist', song.artist, 1000);
    submitAnswer(state, 'p1', 'title', song.title, 1000);
    reveal(state);
    rounds += 1;
  }
  assert.equal(rounds, 4); // 3 + 3 + 3 + 3 = 12 poäng
  assert.deepEqual(state.winners, ['p1']);
  assert.deepEqual(playerView(state, 'p2', 0).winners, ['Anna']);
  assert.equal(nextSong(state, many), null);
  restart(state);
  assert.equal(state.players.p1.score, 0);
  assert.equal(state.winners, null);
  assert.ok(nextSong(state, many));
});

test('lika poäng över gränsen ger delad seger', () => {
  const state = setup();
  state.players.p1.score = 9;
  state.players.p2.score = 9;
  submitAnswer(state, 'p1', 'artist', 'a-ha', 20000);
  submitAnswer(state, 'p2', 'artist', 'a-ha', 20000);
  reveal(state);
  assert.deepEqual(state.winners.sort(), ['p1', 'p2']);
});

test('kategorins rubriker skickas till spelarna', () => {
  const plain = createGame({ code: 'ABCD', categoryId: '80-tal' });
  assert.deepEqual(playerView(plain, 'p1', 0).labels, { artist: 'Artist', title: 'Titel' });
  const classical = createGame({ code: 'ABCD', categoryId: 'klassiskt', labels: { artist: 'Kompositör', title: 'Verk' } });
  assert.equal(playerView(classical, 'p1', 0).labels.artist, 'Kompositör');
});

test('inställningar: utan sparade värden gäller standard, även för bonus', () => {
  assert.deepEqual(cleanSettings(null), { roundMs: 60000, bonusMs: 15000, winScore: 10 });
  assert.deepEqual(cleanSettings({ bonusMs: null }), { roundMs: 60000, bonusMs: 15000, winScore: 10 });
  assert.deepEqual(cleanSettings({ bonusMs: '0' }).bonusMs, 0);
});

test('inställningar: okända värden ersätts med standard, bonus 0 betyder ingen bonus', () => {
  assert.deepEqual(cleanSettings({ roundMs: 45000, bonusMs: 7, winScore: '20' }),
    { roundMs: 45000, bonusMs: 15000, winScore: 20 });
  const state = createGame({ code: 'ABCD', categoryId: '80-tal', settings: { bonusMs: 0, winScore: 5 } });
  assert.equal(state.winScore, 5);
  addPlayer(state, { id: 'p1', name: 'Anna' });
  nextSong(state, songs, () => 0);
  startRound(state, 1000);
  submitAnswer(state, 'p1', 'artist', 'a-ha', 2000);
  submitAnswer(state, 'p1', 'title', 'Take On Me', 2000);
  assert.equal(applySettings(state, { roundMs: 30000 }), false, 'ändras inte mitt i en låt');
  reveal(state);
  assert.deepEqual(state.round.results.p1, { artist: true, title: true, bonus: false, points: 2 });
  assert.equal(applySettings(state, { roundMs: 30000, bonusMs: 10000, winScore: 15 }), true);
  assert.equal(state.roundMs, 30000);
  assert.equal(state.winScore, 15);
});

test('spelarvyn visar kategorins namn', () => {
  const state = createGame({ code: 'ABCD', categoryId: 'pop80', categoryName: '80-talspop' });
  assert.equal(playerView(state, 'p1', 0).categoryName, '80-talspop');
  assert.equal(playerView(createGame({ code: 'ABCD', categoryId: 'pop80' }), 'p1', 0).categoryName, '');
});

test('normalize bortser från accenter och skiljetecken', async () => {
  const { normalize, compact } = await import('../js/text.js');
  assert.equal(normalize("Don't Go Breaking My Heart"), normalize('dont go breaking my heart'));
  assert.equal(normalize('Señorita'), 'senorita');
  assert.equal(normalize('  Beyoncé   –  Halo! '), 'beyonce halo');
  assert.equal(normalize('Mötley Crüe'), 'motley crue');
  assert.equal(compact('AC/DC'), compact('ac dc'));
  assert.equal(compact('Jay-Z'), 'jayz');
});

test('rättningen godtar svar utan accenter och apostrofer', () => {
  const state = createGame({ code: 'ABCD', categoryId: 'x' });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  nextSong(state, [{ id: 's', artist: 'Shawn Mendes', title: 'Señorita' }], () => 0);
  startRound(state, 1000);
  submitAnswer(state, 'p1', 'artist', 'shawn mendes', 2000);
  submitAnswer(state, 'p1', 'title', 'Senorita', 2000);
  reveal(state);
  assert.equal(state.players.p1.score > 0, true);
});

test('kategorin kan bytas mellan låtarna men inte medan en låt pågår', () => {
  const state = createGame({ code: 'ABCD', categoryId: '80-tal', categoryName: '80-tal' });
  addPlayer(state, { id: 'p1', name: 'Anna' });
  const klassiskt = { categoryId: 'klassiskt', categoryName: 'Klassisk musik', labels: { artist: 'Kompositör', title: 'Verk' } };
  nextSong(state, songs, () => 0);
  assert.equal(changeCategory(state, klassiskt), false);
  startRound(state, 0);
  assert.equal(changeCategory(state, klassiskt), false);
  reveal(state);
  state.players.p1.score = 3;
  assert.equal(changeCategory(state, klassiskt), true);
  assert.equal(state.categoryId, 'klassiskt');
  assert.equal(state.players.p1.score, 3);
  assert.deepEqual(state.playedIds, ['a']);
  const view = playerView(state, 'p1', 0);
  assert.equal(view.categoryName, 'Klassisk musik');
  assert.equal(view.labels.artist, 'Kompositör');
});

test('ett namn som en annan spelare har är upptaget, oavsett stora bokstäver och accenter', () => {
  const state = createGame({ code: 'ABCD', categoryId: '80-tal' });
  addPlayer(state, { id: 'p1', name: 'Åsa' });
  assert.equal(nameTaken(state, { id: 'p2', name: 'asa' }), true);
  assert.equal(nameTaken(state, { id: 'p2', name: 'Bo' }), false);
  // Samma spelare som ansluter igen får behålla sitt namn.
  assert.equal(nameTaken(state, { id: 'p1', name: 'Åsa' }), false);
});
