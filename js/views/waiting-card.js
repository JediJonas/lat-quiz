// @ts-check
// Väntekortet innan första låten: reglerna, equalizern och, när spelet har startats,
// nedräkningen "Nu börjar det!" tills första låten hörs.
import { $ } from '../shared/dom.js';
import { html } from '../shared/html.js';
import { announce, renderPie } from '../ui.js';
import { guessFields as fieldsOf } from '../game.js';
import { t } from '../shared/lang.js';

/** @typedef {import('../shared/protocol.js').View} View */

/**
 * Reglerna som små etiketter medan alla väntar på första låten, i stället för en lång mening.
 * Etiketterna följer kategorins ord, till exempel 1 p för kompositör.
 * @param {View} view
 */
export function ruleLabels(view) {
  const s = view.settings;
  if (!s) return [t('rules.winScore', { score: view.winScore })];
  const lowercase = (label) => label.toLocaleLowerCase('sv');
  return [
    t('rules.roundTime', { s: s.roundMs / 1000 }),
    ...fieldsOf(view.labels).map((field) => t('rules.field', { field: lowercase(view.labels[field]) })),
    ...(s.bonusMs ? [t('rules.bonus', { s: s.bonusMs / 1000 })] : []),
    t('rules.winScore', { score: s.winScore }),
  ];
}

export function createWaitingCard() {
  let introEnds = 0; // när nedräkningen före första låten är slut
  let introTotal = 0; // hela nedräkningens längd, för ringen

  // Nedräkningen före första låten, som bara visas med Deezer.
  function tick() {
    if ($('#intro').hidden) return;
    const ms = Math.max(0, introEnds - Date.now());
    const left = Math.ceil(ms / 1000);
    renderPie($('#intro-pie'), ms, introTotal);
    $('#intro-label').textContent = left > 0 ? t('intro.countdown', { s: left }) : t('intro.now');
  }

  /**
   * @param {View} view
   * @param {{ phase: string, holding: boolean, host: boolean }} state holding: förra kortet står
   *   kvar medan nästa låt laddas
   */
  function render(view, { phase, holding, host }) {
    // När spelet har startats står Nu börjar det! på väntekortet tills första låten hörs.
    const starting = phase === 'ready' && !$('#waiting').hidden;
    if (view.introMs) [introEnds, introTotal] = [Date.now() + view.introMs, view.introTotalMs];
    if (starting && $('#intro').hidden) {
      $('#intro').classList.add('reveal');
      announce(t('intro.announce'));
    }
    if (!starting) $('#intro').classList.remove('reveal');
    $('#intro').hidden = !starting;
    $('.waiting-cover').hidden = starting;
    tick();
    $('#waiting').hidden = phase !== 'waiting' && !(holding && !$('#waiting').hidden);
    $('#waiting-title').textContent = host ? t('waiting.title.host') : t('waiting.title.player');
    $('#waiting .eq').classList.toggle('idle', !view.lobbyPlaying);
    $('#waiting-text').textContent = host ? t('waiting.text.host') : t('waiting.text.player');
    $('#rules').innerHTML = ruleLabels(view).map((r) => html`<li>${r}</li>`).join('');
  }

  return { render, tick };
}
