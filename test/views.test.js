import { test } from 'node:test';
import assert from 'node:assert/strict';
import { climbBadge, nextCountdown, resultBelow, resultCover } from '../js/views/result-card.js';
import { rankIn, standingsRow } from '../js/views/standings.js';
import { rules } from '../js/views/waiting-card.js';

const labels = { artist: 'Artist', title: 'Låt' };
const settings = { roundMs: 30000, bonusMs: 10000, winScore: 10 };
const song = { artist: 'Abba <live>', title: 'Waterloo', year: 1974 };
const round = (extra = {}) => ({ number: 3, phase: 'revealed', remainingMs: 0, roundMs: 30000, bonusMs: 10000,
  answer: null, song, result: null, progress: {}, results: {}, ...extra });
const view = (extra = {}) => ({ code: 'ABCD', categoryId: '70-tal', categoryName: '70-tal', winScore: 10, settings, labels,
  standings: [{ id: 'a', name: 'Anna', score: 4, connected: true }, { id: 'b', name: '<Bo>', score: 2, connected: false }],
  answered: [], winners: null, paused: false, round: round(), ...extra });

test('reglerna följer inställningarna och kategorins ord', () => {
  assert.deepEqual(rules(view()), ['30 s per låt', '1 p för artist', '1 p för låt', 'Bonus inom 10 s', 'Först till 10 p']);
  assert.deepEqual(rules(view({ settings: null })), ['Först till 10 p']);
  assert.deepEqual(rules(view({ settings: { ...settings, bonusMs: 0 }, labels: { title: 'Serie' } })),
    ['30 s per låt', '1 p för serie', 'Först till 10 p']);
});

test('rätt svar escapar låtens namn', () => {
  const cover = String(resultCover({ view: view(), round: round(), winner: false, drum: false, intro: null }));
  assert.match(cover, /Låt 3 · Rätt svar/);
  assert.match(cover, /Abba &#60;live&#62; · 1974/);
});

test('vinnarkortet och trumvirveln', () => {
  const won = view({ winners: ['Anna', '<Bo>'], winnerClip: true });
  const cover = String(resultCover({ view: won, round: round(), winner: true, drum: false, intro: null }));
  assert.match(cover, /Anna och &#60;Bo&#62; vinner!/);
  assert.match(cover, /clip-note/);
  assert.match(cover, /class="win-fx"/);
  const drum = String(resultCover({ view: won, round: round(), winner: false, drum: true, intro: 'Vi har en vinnare!' }));
  assert.match(drum, /Vi har en vinnare!/);
  assert.match(drum, /Först till 10 poäng/);
});

test('de egna svaren: rätt, fel, inget svar och bonus', () => {
  const r = round({ answer: { artist: 'Abba', title: '' }, result: { artist: true, title: false, bonus: true, points: 2 } });
  const fresh = resultBelow({ view: view(), round: r, own: true, fresh: true, climb: null });
  assert.match(fresh, /<li class="right"><span class="lab">Artist<\/span><span class="val">Abba<\/span><span class="pts">\+1<\/span><\/li>/);
  assert.match(fresh, /<li class="none"><span class="lab">Låt<\/span><span class="val">Inget svar<\/span><span class="pts">0<\/span><\/li>/);
  assert.match(fresh, /<li class="right bonus pop">.*<span class="pts"><span class="sparkles"/);
  assert.match(fresh, /\+2 <span class="points-long">poäng/);
  // Ritas samma svar om får bonusraden inga nya gnistor.
  const again = resultBelow({ view: view(), round: r, own: true, fresh: false, climb: null });
  assert.match(again, /<li class="right bonus"><span class="lab">Bonus<\/span><span class="val">Blixtsnabbt!<\/span><span class="pts">\+1<\/span>/);
});

test('den som bara tittar ser inga egna svar, bara nedräkningen', () => {
  const below = resultBelow({ view: view(), round: round({ nextInMs: 8000, nextTotalMs: 10000 }), own: false, fresh: true, climb: null });
  assert.doesNotMatch(below, /class="mine"|class="points/);
  assert.match(below, /Nästa låt startar av sig själv om 8 sekunder/);
  assert.equal(nextCountdown(round()), null);
});

test('brickan för den som klättrat rullar från gamla till nya placeringen', () => {
  const badge = String(climbBadge(3, 1, true));
  assert.match(badge, /class="climb pop climb-lead" style="--steps:2;--shine-at:1.94s"/);
  assert.match(badge, /<span>3<\/span><span>2<\/span><span>1<\/span>/);
  const r = round({ result: { artist: true, title: true, bonus: false, points: 2 } });
  assert.match(resultBelow({ view: view(), round: r, own: true, fresh: true, climb: { from: 2, to: 1 } }), /Du klättrade till plats 1/);
  assert.doesNotMatch(resultBelow({ view: view(), round: r, own: true, fresh: true, climb: { from: 1, to: 1 } }), /climb/);
});

test('placeringen: lika många poäng ger samma plats', () => {
  const list = [{ score: 5 }, { score: 3 }, { score: 3 }, { score: 1 }];
  assert.deepEqual(list.map((p) => rankIn(list, p.score)), [1, 2, 2, 4]);
});

test('en rad i poänglistan, under spelet och när matchen är slut', () => {
  const v = view();
  const bo = v.standings[1];
  const row = String(standingsRow({ player: bo, view: v, me: 'a', rank: 2, up: 1, bump: true, podium: false }));
  assert.match(row, /<tr class=" offline bump">/);
  assert.match(row, /&#60;Bo&#62;<span class="visually-hidden"> \(frånkopplad\)<\/span>/);
  assert.match(row, /<span class="up"><span aria-hidden="true">▲<\/span>1/);
  assert.match(row, /^<tr[^>]*>\s*<td class="score"/);
  const podium = String(standingsRow({ player: v.standings[0], view: v, me: 'a', rank: 1, up: 0, bump: false, podium: true }));
  assert.match(podium, /<tr class="me {2}">\s*<td class="rank top">/);
  assert.match(podium, /<td class="score"[^>]*><span class="num">4<\/span>.*<\/td><\/tr>$/s);
  assert.doesNotMatch(podium, /class="up"/);
});
