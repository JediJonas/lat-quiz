// @ts-check
// Kortet när svaret visas: rätt svar, "Vi har en vinnare!" eller vinnaren, de egna svaren med
// poängen och nedräkningen till nästa låt. HTML:en byggs av rena funktioner, så att den går att
// testa i Node, och createResultCard lägger in den på sidan.
import { $ } from '../shared/dom.js';
import { html, join } from '../shared/html.js';
import { announce, renderPie, scrollToTop } from '../ui.js';
import { roundCheer, winComment, winIntro } from '../cheer.js';
import { guessFields as fieldsOf } from '../game.js';
import { WIN_EFFECT_MS, pickWinEffect, startWinEffect } from '../winner-animation.js';
import { pauseSeasonEffect } from '../season.js';
import { rankIn } from './standings.js';
import { t } from '../shared/lang.js';

/** @typedef {import('../shared/protocol.js').View} View */
/** @typedef {import('../shared/protocol.js').RoundView} RoundView */

// Gnistorna runt bonuspoängen: små stjärnor som skjuts ut åt alla håll och tonar bort.
export function sparkles(count = 12, random = Math.random) {
  return html`<span class="sparkles" aria-hidden="true">${Array.from({ length: count }, (_, i) =>
    html`<i style="--a:${(360 / count) * i}deg;--d:${(0.7 + random() * 0.6).toFixed(2)}s"></i>`)}</span>`;
}

// Brickan vid poängen för den som klättrat: Plats och en siffra som rullar från den gamla
// placeringen till den nya, som ett räkneverk, medan pilen hoppar en gång för varje placering.
// Första gången svaret visas rullar den, annars står den på den nya placeringen. Skimret vid
// ledning sveper strax efter att siffran har stannat, som rullar 0,32 sekunder per placering.
/** @param {number} from @param {number} to @param {boolean} fresh */
export function climbBadge(from, to, fresh) {
  const digits = [];
  for (let n = from; n >= to; n -= 1) digits.push(html`<span>${n}</span>`);
  return join(
    html`<span class="climb${fresh ? ' pop' : ''}${to === 1 ? ' climb-lead' : ''}" style="--steps:${from - to};--shine-at:${(1.3 + (from - to) * 0.32).toFixed(2)}s">`,
    html`<span aria-hidden="true"><span class="climb-arrow">▲</span>${t('result.place')}&nbsp;`,
    html`<span class="climb-roll"><span class="climb-strip">${digits}</span></span></span>`,
    html`<span class="visually-hidden">${t('result.climbed', { rank: to })}</span></span>`,
  );
}

// Den lilla ringen framför texten under svaret töms tills nästa låt startar av sig själv.
/** @param {RoundView} round */
export function nextCountdown(round) {
  if (round.nextInMs == null) return null;
  return html`<span class="next"><span id="next-pie" class="pie"></span>
        <span id="next-text" aria-hidden="true">${t('result.nextIn')} <span class="next-count" data-widest="${t('unit.seconds', { s: Math.ceil(round.nextTotalMs / 1000) })}"><span id="next-num"></span></span></span>
        <span class="visually-hidden">${t('result.nextInLong', { s: Math.ceil(round.nextInMs / 1000) })}</span></span>`;
}

const clipNote = html`<p class="round-label clip-note"><span class="clip-from">${t('result.clipFrom')} </span>Deezer</p>`;
const LABEL = t('result.gameOver');

/**
 * Omslaget överst: rätt svar, "Vi har en vinnare!" (drum) eller vinnaren.
 * När någon har vunnit visas sista låten först som vanligt, och sedan tar vinnaren omslaget.
 * @param {{ view: View, round: RoundView, winner: boolean, drum: boolean, intro: string | null }} card
 */
export function resultCover({ view, round, winner, drum, intro }) {
  if (drum) {
    return html`<div class="cover win drum reveal"><div class="cover-head"><p class="round-label">${LABEL}</p></div>
          <h2 class="win-title">${intro}</h2>
          <p class="win-sub">${t('result.winScore', { score: view.winScore })}</p></div>`;
  }
  if (winner) {
    return html`<div class="cover win reveal"><div class="win-fx" aria-hidden="true"></div>
          <div class="cover-head"><p class="round-label">${LABEL}</p>${view.winnerClip && clipNote}</div>
          <h2 class="win-title">${t('result.winners', { names: view.winners })}</h2>
          <p class="win-sub">${winComment({ winners: view.winners, standings: view.standings, songs: round.number, winScore: view.winScore })}</p></div>`;
  }
  return html`<div class="cover answer reveal"><div class="cover-head"><h2 class="round-label">${t('result.answerLabel', { number: round.number })}</h2>${clipNote}</div>
          <div class="title">${round.song.title}</div>
          <div class="artist">${round.song.artist} · ${round.song.year}</div></div>`;
}

// De egna svaren i en grupp: vad man svarade och vad det gav. Rätt är grönt, fel rött och inget svar grått.
// Bonusraden lyser upp i guld med lite gnistor runt +1, när svaret visas första gången.
function answerRow(label, given, right, { bonus = false, fresh = false } = {}) {
  const cls = right ? 'right' : given ? 'wrong' : 'none';
  return join(
    html`<li class="${cls}${bonus ? ` bonus${fresh ? ' pop' : ''}` : ''}">`,
    html`<span class="lab">${label}</span><span class="val">${given || t('result.noAnswer')}</span>`,
    html`<span class="pts">${bonus && fresh && sparkles()}${right ? '+1' : '0'}</span></li>`,
  );
}

/**
 * Det som står under omslaget: de egna svaren, poängen med en kort kommentar och nedräkningen
 * till nästa låt. own: spelaren deltar och vinnaren visas inte än.
 * @param {{ view: View, round: RoundView, own: boolean, fresh: boolean, climb: { from: number, to: number } | null }} card
 */
export function resultBelow({ view, round, own, fresh, climb }) {
  const r = round.result || { artist: false, title: false, bonus: false, points: 0 };
  const mine = round.answer || { artist: '', title: '' };
  const next = nextCountdown(round);
  const fields = fieldsOf(view.labels);
  const mineRows = own && html`<ul class="mine">${fields.map((field) => answerRow(view.labels[field], mine[field], r[field]))}${
    r.bonus && answerRow(t('result.bonus'), t('result.bonusText'), true, { bonus: true, fresh })}</ul>`;
  // Med stor text skrivs poängen kort som p, så att den får plats på en rad. Skärmläsare får hela ordet.
  // Har man klättrat står placeringen i en bricka till höger om poängen.
  const badge = own && climb && climb.from > climb.to && climbBadge(climb.from, climb.to, fresh);
  const points = own && join(
    html`<p class="points${r.points ? '' : ' zero'}"><span aria-hidden="true">+${r.points} `,
    html`<span class="points-long">${t('result.pointsLong')}</span><span class="points-short">${t('result.pointsShort')}</span></span>`,
    html`<span class="visually-hidden">+${r.points} ${t('result.pointsLong')}</span>${badge}</p>`,
  );
  // Under poängen står en kort kommentar, till exempel Klockrent! när allt var rätt.
  const cheer = own && html`<p class="cheer">${roundCheer(r, round.number, fields.length)}</p>`;
  const foot = (points || next) && html`<div class="result-foot">${points && html`<div class="score-line">${points}${cheer}</div>`}${next}</div>`;
  return html`${mineRows}
        ${foot}`.toString();
}

export function createResultCard() {
  let shown = null; // svaret som senast visades: låtens nummer, eller w och numret för vinnaren

  return {
    // Ett nytt svar animeras igen nästa gång det visas.
    reset() { shown = null; },

    /**
     * @param {{ view: View, me: string, playing: boolean, winner: boolean, drum: boolean,
     *   rankBefore: (id: string) => number | undefined }} state
     */
    render({ view, me, playing, winner, drum, rankBefore }) {
      const round = view.round;
      // Vyn ritas om vid till exempel paus. Svaret animeras bara första gången.
      const key = winner ? `w${round.number}` : drum ? `d${round.number}` : round.number;
      const fresh = shown !== key;
      const intro = view.winners ? winIntro({ winners: view.winners, songs: round.number }) : null;
      const own = playing && !winner && !drum;
      const meNow = view.standings.find((p) => p.id === me);
      const climb = meNow && rankBefore(me) ? { from: rankBefore(me), to: rankIn(view.standings, meNow.score) } : null;
      const below = resultBelow({ view, round, own, fresh, climb });
      // Ritas samma svar om, till exempel när spelledarens knappar byts, står omslaget kvar.
      // Då fortsätter vändningen och vinstanimationen i stället för att börja om eller stoppas.
      const body = $('#result-body');
      const kept = fresh ? null : body.querySelector(':scope > .cover');
      if (kept) {
        while (kept.nextSibling) kept.nextSibling.remove();
        kept.insertAdjacentHTML('afterend', below);
      } else {
        body.innerHTML = `${resultCover({ view, round, winner, drum, intro })}${below}`;
        // Vinnarkortet får konfetti, fyrverkeri eller strålkastare, eller säsongens egna effekter i
        // Halloween och Jul. Valet görs från sista låten, vinnarna och kategorin, så att alla enheter
        // visar samma utan att något skickas över nätet. Löven och snön bakom sidan pausas så länge.
        const fx = winner && body.querySelector('.win-fx');
        if (fx) {
          pauseSeasonEffect(WIN_EFFECT_MS);
          startWinEffect(fx, pickWinEffect(`${round.number}|${round.song.title}|${round.song.artist}|${view.winners.join('|')}`, view.categoryId));
        }
      }
      // Både spelledaren och spelarna kan ha scrollat ner, till exempel medan förslagslistan var
      // öppen. Svaret ska synas överst.
      if (fresh) {
        const active = /** @type {HTMLElement | null} */ (document.activeElement);
        if (active && $('#guess').contains(active)) active.blur();
        scrollToTop();
      }
      shown = key;
      announce(drum ? intro
        : t('result.announce', { title: round.song.title, artist: round.song.artist })
        + (playing ? ' ' + t('result.announcePoints', { points: (round.result || { points: 0 }).points }) : '')
        + (winner ? ' ' + t('result.winners', { names: view.winners }) : ''));
    },

    // Nedräkningen till nästa låt. Under en paus står cirkeln still på det spelledaren skickade.
    /** @param {View} view @param {number} nextAt */
    tick(view, nextAt) {
      const pie = $('#next-pie');
      if (!pie || view.round.phase !== 'revealed') return;
      const nextMs = view.paused ? view.round.nextInMs : Math.max(0, nextAt - Date.now());
      renderPie(pie, nextMs, view.round.nextTotalMs);
      $('#next-num').textContent = t('unit.seconds', { s: Math.ceil(nextMs / 1000) });
    },
  };
}
