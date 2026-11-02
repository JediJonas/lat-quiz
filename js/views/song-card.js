// @ts-check
// Låtkortet medan låten laddas och spelar: rubriken, timern och texten under den. Svarsfälten
// sköts av game-view.js, eftersom de har egna regler för iPhone.
import { $ } from '../shared/dom.js';
import { announce, renderRing } from '../ui.js';

/** @typedef {import('../shared/protocol.js').View} View */

/**
 * @param {View} view
 * @param {{ phase: string, playing: boolean }} state playing: den som tittar deltar i spelet
 * @param {() => void} tick ritar timern
 */
export function renderSongCard(view, { phase, playing }, tick) {
  const round = view.round;
  // Texten under timern säger vad man ska göra. Mätaren rör sig bara medan låten spelas.
  const eq = $('#guess .eq');
  eq.classList.toggle('idle', phase === 'ready');
  eq.classList.toggle('paused', Boolean(view.paused));
  $('#guess-hint').textContent = phase === 'ready' ? 'Låten laddas' : view.paused ? 'Pausad' : playing ? 'Lyssna och gissa' : 'Spelas nu';
  if (phase === 'ready') {
    $('#round-title').textContent = `Låt ${round.number}`;
    renderRing($('#timer'), round.roundMs, round.roundMs, false);
    $('#timer').classList.add('loading');
  } else if (phase === 'playing') {
    $('#round-title').textContent = `Låt ${round.number}`;
    announce(`Låt ${round.number} har börjat.${playing ? ` Du har ${Math.round(round.roundMs / 1000)} sekunder på dig.` : ''}`);
    tick();
  }
}

/**
 * Timern medan låten spelar. Under en paus står ringen still på det spelledaren skickade.
 * @param {View} view @param {number} deadline när tiden är slut
 */
export function tickSongTimer(view, deadline) {
  const round = view.round;
  if (round.phase !== 'playing') return;
  $('#timer').classList.toggle('paused', Boolean(view.paused));
  $('#timer').classList.remove('loading');
  const ms = view.paused ? round.remainingMs : Math.max(0, deadline - Date.now());
  renderRing($('#timer'), ms, round.roundMs, round.bonusMs > 0 && round.roundMs - ms <= round.bonusMs);
}
