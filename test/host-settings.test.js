import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../js/game.js';

// Rutan Inställningar och menyn lyssnar på sidan när de laddas.
const noop = () => {};
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), addEventListener: noop };
globalThis.document = { addEventListener: noop, documentElement: { dataset: {} } };

const { createHostSettings, pendingDiffers, summaryParts } = await import('../js/host-settings.js');

const device = { clipAll: false, extraSounds: true, audioDelay: 0, hostPlays: true };

test('raden Inställningar visar tid, bonus och poänggräns', () => {
  assert.deepEqual(summaryParts({ roundMs: 30000, bonusMs: 15000, winScore: 10 }, device),
    ['30 s per låt', 'Bonus inom 15 s', 'Först till 10 poäng']);
});

test('raden Inställningar visar det som avviker från standard', () => {
  const parts = summaryParts({ roundMs: 20000, bonusMs: 0, winScore: 5 },
    { clipAll: true, extraSounds: false, audioDelay: 200, hostPlays: false });
  assert.equal(parts[1], 'Ingen bonus');
  assert.ok(parts.includes('Ljud på alla enheter'));
  assert.ok(parts.includes('Inga extraljud'));
  assert.ok(parts.some((p) => p.startsWith('Ljudsynk ')));
  assert.equal(parts.at(-1), 'Jag deltar inte');
});

function playing() {
  const state = game.createGame({ code: 'ABCD', categoryId: '60', categoryName: '60-tal', settings: { roundMs: 30000, bonusMs: 15000, winScore: 10 } });
  state.hostId = 'h';
  state.clipAll = false;
  game.setHostPlaying(state, true, 'Jonas');
  return state;
}

test('samma inställningar räknas inte som en ändring', () => {
  const state = playing();
  const pending = { settings: game.cleanSettings(state), category: null, host: { plays: true, name: 'Jonas' }, clipAll: false };
  assert.equal(pendingDiffers(pending, state), false);
  assert.equal(pendingDiffers({ ...pending, host: null }, state), false);
});

test('ny tid, kategori, ljud på alla enheter eller spelledare räknas som en ändring', () => {
  const state = playing();
  const same = { settings: game.cleanSettings(state), category: null, host: { plays: true, name: 'Jonas' }, clipAll: false };
  assert.equal(pendingDiffers({ ...same, settings: { ...same.settings, roundMs: 20000 } }, state), true);
  assert.equal(pendingDiffers({ ...same, category: { id: '70' } }, state), true);
  assert.equal(pendingDiffers({ ...same, clipAll: true }, state), true);
  assert.equal(pendingDiffers({ ...same, host: { plays: false } }, state), true);
  assert.equal(pendingDiffers({ ...same, host: { plays: true, name: 'Bo' } }, state), true);
});

test('utan sparade ändringar finns inget kommande och spelledaren deltar', () => {
  const settings = createHostSettings({
    state: () => null, category: () => null, categoryChanged: noop, stopClip: noop, stopWinnerSong: noop, changed: noop, showUnknown: false,
  });
  assert.equal(settings.hasPending(), false);
  assert.equal(settings.upcoming({ categoryName: '60-tal', settings: {} }), null);
  assert.equal(settings.hostPlays(), true);
  assert.equal(settings.currentUnknown(), false);
});
