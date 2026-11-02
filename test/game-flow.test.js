import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game/game.js';
import { AUTO_NEXT_MS, INTRO_MS, createGameFlow } from '../js/game/game-flow.js';

const SONGS = [{ id: 'a', artist: 'A', title: 'Ett' }, { id: 'b', artist: 'B', title: 'Två' }, { id: 'c', artist: 'C', title: 'Tre' }];

// En klocka som bara går när testet flyttar den.
function setup() {
  let t = 1000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const flow = createGameFlow({ now: clock.now });
  const state = game.createGame({ code: 'ABCD', categoryId: 'x', settings: { roundMs: 10000, bonusMs: 5000, winScore: 3 } });
  game.addPlayer(state, { id: 'p1', name: 'Anna' });
  return { clock, flow, state };
}

// Spelar en låt tills svaret visas. answer: rätt svar på båda fälten, annars inget svar.
function playRound({ clock, flow, state }, { answer = false } = {}) {
  game.nextSong(state, SONGS, () => 0);
  game.startRound(state, clock.now());
  if (answer) {
    game.submitAnswer(state, 'p1', { field: 'artist', value: state.round.song.artist }, clock.now());
    game.submitAnswer(state, 'p1', { field: 'title', value: state.round.song.title }, clock.now());
  }
  assert.equal(flow.nextAction(state), null);
  clock.advance(state.roundMs);
  assert.equal(flow.nextAction(state), 'reveal');
  game.reveal(state);
  // Tickern frågar fyra gånger i sekunden, så nedräkningen börjar när svaret visas.
  flow.nextAction(state);
}

test('nedräkningen före första låten är 10 sekunder', () => {
  const { clock, flow } = setup();
  assert.equal(INTRO_MS, 10000);
  assert.equal(flow.introLeft(), 0);
  flow.startIntro();
  assert.equal(flow.introLeft(), 10000);
  clock.advance(4000);
  assert.equal(flow.introLeft(), 6000);
  clock.advance(7000);
  assert.equal(flow.introLeft(), 0);
});

test('nästa låt startar 10 sekunder efter att svaret visats', () => {
  const ctx = setup();
  playRound(ctx);
  assert.equal(ctx.flow.nextLeft(ctx.state), AUTO_NEXT_MS);
  ctx.clock.advance(9999);
  assert.equal(ctx.flow.nextAction(ctx.state), null);
  ctx.clock.advance(1);
  assert.equal(ctx.flow.nextAction(ctx.state), 'next');
});

test('under en paus står nedräkningen still och fortsätter där den stod', () => {
  const ctx = setup();
  playRound(ctx);
  ctx.clock.advance(3000);
  game.pause(ctx.state, ctx.clock.now());
  ctx.clock.advance(60000);
  assert.equal(ctx.flow.nextLeft(ctx.state), 7000);
  assert.equal(ctx.flow.nextAction(ctx.state), null);
  ctx.flow.resumed(game.resume(ctx.state, ctx.clock.now()));
  assert.equal(ctx.flow.nextLeft(ctx.state), 7000);
  ctx.clock.advance(7000);
  assert.equal(ctx.flow.nextAction(ctx.state), 'next');
});

test('ingen nästa låt när någon har vunnit', () => {
  const ctx = setup();
  playRound(ctx, { answer: true });
  assert.deepEqual(ctx.state.winners, ['p1']);
  assert.equal(ctx.flow.nextLeft(ctx.state), null);
  ctx.clock.advance(60000);
  assert.equal(ctx.flow.nextAction(ctx.state), null);
});

test('efter Spela igen får första låten en egen nedräkning', () => {
  const ctx = setup();
  playRound(ctx);
  ctx.clock.advance(AUTO_NEXT_MS);
  playRound(ctx, { answer: true });
  game.restart(ctx.state);
  ctx.flow.restarted();
  ctx.clock.advance(60000);
  playRound(ctx);
  assert.equal(ctx.state.round.number, 1);
  assert.equal(ctx.flow.nextLeft(ctx.state), AUTO_NEXT_MS);
  assert.equal(ctx.flow.nextAction(ctx.state), null);
});
