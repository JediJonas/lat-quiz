// @ts-check
// Poänglistan under spelvyn: poängen, vilka fält var och en har fyllt i och, när svaret visas, vem
// som klättrat. När matchen är slut står placeringarna stora först.
import { $, esc } from '../shared/dom.js';
import { html, raw } from '../shared/html.js';
import { countUp, scoreTracker, statusTags } from '../ui.js';
import { t } from '../shared/lang.js';

/** @typedef {import('../shared/protocol.js').View} View */

/**
 * Placeringen i listan. Lika många poäng ger samma placering.
 * @param {{ score: number }[]} standings @param {number} score
 */
export const rankIn = (standings, score) => 1 + standings.filter((q) => q.score > score).length;

/** @param {View} view @param {string} id */
function playerStatus(view, id) {
  const round = view.round;
  if (!round) return '';
  return statusTags({
    phase: round.phase,
    progress: round.progress && round.progress[id],
    result: round.results && round.results[id],
    labels: view.labels,
    esc,
  });
}

const climbArrow = (up) => html`<span class="up"><span aria-hidden="true">▲</span>${up}<span class="visually-hidden"> ${t('standings.up')}</span></span>`;

/**
 * En rad i listan. Under spelet står poängen först. När matchen är slut (podium) står placeringen
 * först och poängen sist, och plats 1–3 får stora siffror.
 * @param {{ player: View['standings'][number], view: View, me: string, rank: number, up: number,
 *   bump: boolean, podium: boolean }} row
 */
export function standingsRow({ player: p, view, me, rank, up, bump, podium }) {
  const score = html`<td class="score" data-id="${p.id}"><span class="num">${p.score}</span><span class="visually-hidden"> ${t('standings.points')}</span></td>`;
  return html`<tr class="${p.id === me ? 'me' : ''} ${p.connected ? '' : 'offline'} ${bump ? 'bump' : ''}">
      ${podium ? html`<td class="rank${rank <= 3 ? ' top' : ''}"><span class="visually-hidden">${t('standings.place')} </span><span class="rank-num">${rank}</span></td>` : score}
      <td class="name"><span class="player"><span>${p.name}${!p.connected && html`<span class="visually-hidden"> ${t('standings.offline')}</span>`}</span>${up > 0 && climbArrow(up)}</span></td>
      <td class="status">${raw(playerStatus(view, p.id))}</td>${podium && html`
      ${score}`}</tr>`;
}

export function createStandings() {
  let ranksBefore = new Map(); // placeringen innan svaret visades, för att visa vem som klättrat
  const scoreChanged = scoreTracker();

  return {
    // Placeringen innan svaret visades, eller undefined.
    /** @param {string} id */
    rankBefore: (id) => ranksBefore.get(id),

    /** @param {View} view @param {string} me @param {boolean} podium vinnaren visas */
    render(view, me, podium) {
      // Utan spelare döljs poänglistan med rubrik, till exempel när spelledaren inte deltar och ingen har gått med än.
      $('#standings-section').hidden = view.standings.length === 0;
      // Placeringen räknas när någon har fått poäng. Lika många poäng ger samma placering.
      const ranked = view.standings.some((p) => p.score > 0);
      const rankOf = (p) => rankIn(view.standings, p.score);
      // När svaret visas får den som klättrat en liten pil med antalet placeringar. Den står still,
      // eftersom brickan vid poängen visar klättringen.
      const revealed = view.round && view.round.phase === 'revealed';
      if (!revealed) ranksBefore = new Map(ranked ? view.standings.map((p) => [p.id, rankOf(p)]) : []);
      // I vinnarvyn står placeringarna stora, så där visas ingen pil.
      const climb = (p) => (revealed && !podium && ranksBefore.has(p.id) ? ranksBefore.get(p.id) - rankOf(p) : 0);
      const counts = [];
      const rows = view.standings.map((p) => {
        const before = scoreChanged(p.id, p.score);
        if (before !== null) counts.push([p.id, before, p.score]);
        return standingsRow({ player: p, view, me, rank: rankOf(p), up: climb(p), bump: before !== null, podium });
      });
      // När matchen är slut får listan stora placeringssiffror.
      $('#standings').classList.toggle('podium', podium);
      $('#standings').innerHTML = html`<table><tbody>${rows}</tbody></table>`.toString();
      for (const [id, from, to] of counts) {
        const cell = [...document.querySelectorAll('#standings td.score')].find((td) => /** @type {HTMLElement} */ (td).dataset.id === id);
        if (cell) countUp(cell.querySelector('.num'), from, to);
      }
    },
  };
}
