// Spelvyn som spelarna och spelledaren delar: väntetexten, gissningen med
// förslag, rätt svar och poänglistan. Den visar en playerView från game.js och
// vet inte varifrån den kommer, över nätet hos spelarna eller direkt hos spelledaren.
import { loadSuggestions, suggestionKind } from './data.js';
import { autocomplete } from './autocomplete.js';
import { announce, countUp, renderPie, renderRing, scoreTracker, scrollFieldToTop, scrollToTop, statusTags } from './ui.js';
import { setStandingMessage } from './meddelande.js';
import { roundCheer, winComment, winIntro } from './pepp.js';
import { pickWinEffect, startWinEffect } from './vinstanimation.js';
import { pauseSeasonEffect } from './sasong.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Gnistorna runt bonuspoängen: små stjärnor som skjuts ut åt alla håll och tonar bort.
function sparkles(count = 12) {
  return '<span class="sparkles" aria-hidden="true">' + Array.from({ length: count }, (_, i) =>
    `<i style="--a:${(360 / count) * i}deg;--d:${(0.7 + Math.random() * 0.6).toFixed(2)}s"></i>`).join('')
    + '</span>';
}

// Placeringen i listan. Lika många poäng ger samma placering.
const rankIn = (standings, score) => 1 + standings.filter((q) => q.score > score).length;

// Brickan vid poängen för den som klättrat: Plats och en siffra som rullar från den gamla
// placeringen till den nya, som ett räkneverk, medan pilen hoppar en gång för varje placering.
// Första gången svaret visas rullar den, annars står den på den nya placeringen. Skimret vid
// ledning sveper strax efter att siffran har stannat, som rullar 0,32 sekunder per placering.
function climbBadge(from, to, fresh) {
  const digits = [];
  for (let n = from; n >= to; n -= 1) digits.push(`<span>${n}</span>`);
  return `<span class="climb${fresh ? ' pop' : ''}${to === 1 ? ' climb-lead' : ''}" style="--steps:${from - to};--shine-at:${(1.3 + (from - to) * 0.32).toFixed(2)}s">`
    + '<span aria-hidden="true"><span class="climb-arrow">▲</span>Plats&nbsp;'
    + `<span class="climb-roll"><span class="climb-strip">${digits.join('')}</span></span></span>`
    + `<span class="visually-hidden">Du klättrade till plats ${to}.</span></span>`;
}

// Reglerna som små etiketter medan alla väntar på första låten, i stället för en lång mening.
// Etiketterna följer kategorins ord, till exempel 1 p för kompositör.
function rules(view) {
  const s = view.settings;
  if (!s) return [`Först till ${view.winScore} p`];
  const lower = (label) => label.toLocaleLowerCase('sv');
  return [
    `${s.roundMs / 1000} s per låt`,
    `1 p för ${lower(view.labels.artist)}`,
    `1 p för ${lower(view.labels.title)}`,
    ...(s.bonusMs ? [`Bonus inom ${s.bonusMs / 1000} s`] : []),
    `Först till ${s.winScore} p`,
  ];
}

// Med ?debug=1 visas en liten logg nederst på sidan över tryck, fokus och rullning kring
// svarsfälten, så att det går att se vad Safari gör i en riktig telefon.
function debugLog() {
  if (!('debug' in document.documentElement.dataset)) return () => {};
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;margin:0;padding:4px 6px;max-height:40vh;overflow:auto;font:10px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.8);color:#fff;pointer-events:none;white-space:pre-wrap';
  document.body.append(box);
  const lines = [];
  let last = 0;
  return (what, row, often = false) => {
    const now = performance.now();
    if (often && now - last < 100) return;
    last = now;
    const vv = window.visualViewport;
    const r = (n) => Math.round(n ?? -1);
    lines.push(`${(now / 1000).toFixed(2)} ${what} fokus=${document.activeElement?.id || '-'} y=${r(scrollY)} rad=${r(row.getBoundingClientRect().top)} vvTop=${r(vv?.offsetTop)} vvH=${r(vv?.height)} cH=${document.documentElement.clientHeight} iH=${innerHeight}`);
    if (lines.length > 30) lines.shift();
    box.textContent = lines.join('\n');
    box.scrollTop = box.scrollHeight;
  };
}

// Så länge sista låten visas innan vinnaren tar över vyn. Först står till exempel "Vi har en
// vinnare!" medan spelledaren spelar en trumvirvel, och sedan visas namnet.
const WIN_DELAY_MS = 4000;
// Hos spelledaren visas namnet när vinnarlåten börjar höras, efter trumvirveln, eller efter DRUM_MS
// om ingen låt spelas. Spelarna visar namnet samtidigt, när spelledaren säger till. Dröjer det
// visas namnet ändå efter DRUM_MAX_MS.
const DRUM_MS = 4000;
const DRUM_MAX_MS = 8000;
const DRUM_WAIT_MS = 2000; // längsta väntan på att trumvirveln hörs

// onAnswer(field, value): ett svar har valts eller tagits bort.
// host: spelledaren startar låtarna själv och väntar därför inte på någon.
// onWinnerDrum: trumvirveln ska börja. Den returnerar { drum, song }, två löften som uppfylls när
// virveln och vinnarlåten hörs, eller null utan vinnarlåt. "Vi har en vinnare!" visas när virveln
// hörs, men senast efter DRUM_WAIT_MS. Namnet visas när låten hörs, men senast efter DRUM_MAX_MS.
// Utan vinnarlåt visas texten direkt och namnet efter DRUM_MS.
// onWinnerDrumShown: "Vi har en vinnare!" har just visats, så att spelarna kan vända samtidigt.
// onWinnerShown: vinnarvyn har just tagit över, så att spelledarens knappar kan visas samtidigt.
export function createGameView({ onAnswer, onError, onWinnerDrum = () => {}, onWinnerDrumShown = () => {},
  onWinnerShown = () => {}, host = false }) {
  let view = null;
  let me = null;
  let roundNumber = null;
  let deadline = 0;
  let nextAt = 0;
  let wasPaused = null;
  let shownResult = null; // svaret som senast visades: låtens nummer, eller w och numret för vinnaren
  // När matchen avgörs visas sista låten först som vanligt. Efter en stund byts vyn mot vinnaren.
  let winRound = null; // låten som avgjorde matchen
  let winDrum = false; // texten innan namnet visas, till exempel Vi har en vinnare!
  let winShown = false; // vinnarvyn har tagit över
  let winTimer = null;
  let winTurn = 0; // ökar för varje vinnare, så att ett sent löfte inte visar fel vinnare
  let introEnds = 0; // när nedräkningen före första låten är slut
  let introTotal = 0; // hela nedräkningens längd, för ringen
  let ranksBefore = new Map(); // placeringen innan svaret visades, för att visa vem som klättrat
  const local = { artist: '', title: '' };
  const scoreChanged = scoreTracker();

  const answer = (field) => (value) => { local[field] = value; onAnswer(field, value); };
  const fields = {
    artist: autocomplete($('#artist'), [], answer('artist')),
    title: autocomplete($('#title'), [], answer('title')),
  };
  // Fältet man skriver i rullas upp, så att fler förslag syns under det. Under tiden får
  // sidan luft längst ner, så att den går att rulla så långt även när den är kort.
  // I iPhone räknar Safari ut vart sidan ska rulla redan när fältet får fokus, utifrån var
  // fältet stod då, och rullar dit när tangentbordet öppnas. Rullade vi i fokushändelsen
  // drog Safari sedan tillbaka sidan, så att fältet hamnade nere vid tangentbordet. Därför
  // tar vi själva hand om ett tryck på raden: först rullas fältet upp, och sedan får det
  // fokus utan att webbläsaren rullar. Står fältet redan överst har Safari inget att rulla.
  // Regel (se projektbeskrivningen): rulla aldrig i fokushändelsen och rätta inte läget efter att
  // tangentbordet har öppnats. Prova ändringar i en riktig iPhone, både första och andra trycket.
  // Har fältet redan fokus tappar det fokus och får det igen, så att tangentbordet öppnas om det
  // var stängt, och sidan ändå inte rullar. Ett långt tryck lämnas åt webbläsaren, så att man
  // kan markera text. Tryck på förslagslistan och krysset lämnas också, så att ett val i listan
  // stänger fältet som det ska.
  const log = debugLog();
  for (const id of ['artist', 'title']) {
    const input = $(`#${id}`);
    const row = input.closest('.field-row');
    let tapped = false;
    let start = null;
    row.addEventListener('touchstart', (e) => {
      start = e.touches.length !== 1 || e.target.closest('button, .suggestions') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
      log(`touchstart ${id}`, row);
    }, { passive: true });
    row.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0];
      const tap = start && t && Date.now() - start.at < 500 && Math.hypot(t.clientX - start.x, t.clientY - start.y) <= 10;
      start = null;
      log(`touchend ${id} ${tap ? 'tap' : 'skip'}`, row);
      if (!tap) return;
      e.preventDefault();
      if (document.activeElement === input) input.blur();
      document.body.classList.add('typing');
      scrollFieldToTop(input, row);
      tapped = true;
      input.focus({ preventScroll: true });
      log(`scrolled ${id}`, row);
    });
    input.addEventListener('focus', () => {
      document.body.classList.add('typing');
      if (!tapped) scrollFieldToTop(input, row);
      log(`focus ${id}${tapped ? '' : ' (ej tryck)'}`, row);
      tapped = false;
    });
    input.addEventListener('blur', () => {
      document.body.classList.remove('typing');
      log(`blur ${id}`, row);
    });
    const vv = window.visualViewport;
    if (vv) for (const type of ['resize', 'scroll']) vv.addEventListener(type, () => log(`vv ${type}`, row, true));
    window.addEventListener('scroll', () => log('scroll', row, true), { passive: true });
  }
  // Förslagslistan är stor. Den laddas i bakgrunden, så att sidan visas direkt.
  // Fälten får förslag efter vad de heter i kategorin, och listan byts när kategorin byts.
  let suggestions = null;
  const shownKinds = { artist: null, title: null };
  function showSuggestions() {
    if (!suggestions || !view) return;
    for (const field of ['artist', 'title']) {
      const kind = suggestionKind(field, view.labels[field]);
      if (kind === shownKinds[field]) continue;
      shownKinds[field] = kind;
      fields[field].setList(suggestions[kind]);
    }
  }
  loadSuggestions().then((loaded) => {
    suggestions = loaded;
    showSuggestions();
  }).catch(onError);
  setInterval(renderTimer, 250);

  // Nedräkningen före första låten, som bara visas med Deezer.
  function renderIntro() {
    if ($('#intro').hidden) return;
    const ms = Math.max(0, introEnds - Date.now());
    const left = Math.ceil(ms / 1000);
    renderPie($('#intro-pie'), ms, introTotal);
    $('#intro-label').textContent = left > 0 ? `Första låten spelas om ${left} s` : 'Första låten spelas nu';
  }

  function renderTimer() {
    if (!view || !view.round) return;
    renderIntro();
    // Under en paus står ringen och cirkeln still på det spelledaren skickade.
    const pie = $('#next-pie');
    const nextMs = view.paused ? view.round.nextInMs : Math.max(0, nextAt - Date.now());
    if (pie && view.round.phase === 'revealed') {
      renderPie(pie, nextMs, view.round.nextTotalMs);
      $('#next-num').textContent = `${Math.ceil(nextMs / 1000)} s`;
    }
    if (view.round.phase !== 'playing') return;
    $('#timer').classList.toggle('paused', Boolean(view.paused));
    $('#timer').classList.remove('loading');
    const ms = view.paused ? view.round.remainingMs : Math.max(0, deadline - Date.now());
    renderRing($('#timer'), ms, view.round.roundMs, view.round.bonusMs > 0 && view.round.roundMs - ms <= view.round.bonusMs);
  }

  function playerStatus(id) {
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

  function renderStandings() {
    // Utan spelare döljs poänglistan med rubrik, till exempel när spelledaren inte deltar och ingen har gått med än.
    $('#standings-section').hidden = view.standings.length === 0;
    // Placeringen räknas när någon har fått poäng. Lika många poäng ger samma placering.
    const ranked = view.standings.some((p) => p.score > 0);
    const rankOf = (p) => rankIn(view.standings, p.score);
    const podium = winnerView();
    // När svaret visas får den som klättrat en liten pil med antalet placeringar. Den står still,
    // eftersom brickan vid poängen visar klättringen.
    const revealed = view.round && view.round.phase === 'revealed';
    if (!revealed) ranksBefore = new Map(ranked ? view.standings.map((p) => [p.id, rankOf(p)]) : []);
    // I vinnarvyn står placeringarna stora, så där visas ingen pil.
    const climb = (p) => (revealed && !podium && ranksBefore.has(p.id) ? ranksBefore.get(p.id) - rankOf(p) : 0);
    const climbArrow = (up) => `<span class="up"><span aria-hidden="true">▲</span>${up}`
      + '<span class="visually-hidden"> placeringar upp</span></span>';
    const counts = [];
    const rows = view.standings.map((p) => {
      const before = scoreChanged(p.id, p.score);
      if (before !== null) counts.push([p.id, before, p.score]);
      const rank = rankOf(p);
      const up = climb(p);
      const score = `<td class="score" data-id="${esc(p.id)}"><span class="num">${p.score}</span><span class="visually-hidden"> poäng</span></td>`;
      // Under spelet står poängen först. När matchen är slut står placeringen först och poängen sist.
      // Plats 1–3 får stora siffror.
      return `<tr class="${p.id === me ? 'me' : ''} ${p.connected ? '' : 'offline'} ${before !== null ? 'bump' : ''}">
      ${podium ? `<td class="rank${rank <= 3 ? ' top' : ''}"><span class="visually-hidden">Plats </span><span class="rank-num">${rank}</span></td>` : score}
      <td class="name"><span class="player"><span>${esc(p.name)}${p.connected ? '' : '<span class="visually-hidden"> (frånkopplad)</span>'}</span>${up > 0 ? climbArrow(up) : ''}</span></td>
      <td class="status">${playerStatus(p.id)}</td>${podium ? `
      ${score}` : ''}</tr>`;
    });
    // När matchen är slut får listan stora placeringssiffror.
    $('#standings').classList.toggle('podium', podium);
    $('#standings').innerHTML = `<table><tbody>${rows.join('')}</tbody></table>`;
    for (const [id, from, to] of counts) {
      const cell = [...document.querySelectorAll('#standings td.score')].find((td) => td.dataset.id === id);
      if (cell) countUp(cell.querySelector('.num'), from, to);
    }
  }

  // Vinnaren visas när matchen är avgjord och sista låten har visats en stund.
  const winnerView = () => Boolean(view.winners && view.round && view.round.phase === 'revealed' && winShown);

  function render() {
    const round = view.round;
    const phase = round ? round.phase : 'waiting';
    if (view.winners && phase === 'revealed' && winRound !== round.number) {
      winRound = round.number;
      winDrum = false;
      winShown = false;
      clearTimeout(winTimer);
      const turn = ++winTurn;
      winTimer = setTimeout(() => {
        if (!view.winners) return;
        // Spelarna spelar inget ljud. De vänder när spelledaren gör det, och väntar bara en stund.
        const sound = host ? onWinnerDrum() : null;
        const show = () => {
          if (turn !== winTurn || winShown) return;
          clearTimeout(winTimer);
          winDrum = true;
          winShown = true;
          if (view.winners) { render(); onWinnerShown(); }
        };
        const flip = () => {
          if (turn !== winTurn || winDrum) return;
          clearTimeout(winTimer);
          winDrum = true;
          if (!view.winners) return;
          render();
          onWinnerDrumShown();
          winTimer = setTimeout(show, sound || !host ? DRUM_MAX_MS : DRUM_MS);
        };
        if (sound) {
          sound.drum.then(flip, flip);
          sound.song.then(show, show);
        }
        if (host && !sound) flip();
        else winTimer = setTimeout(flip, DRUM_WAIT_MS);
      }, WIN_DELAY_MS);
    } else if (!view.winners) {
      winRound = null;
      winDrum = false;
      winShown = false;
      clearTimeout(winTimer);
      winTurn += 1;
    }
    // Spelarna vänder fram "Vi har en vinnare!" och vinnaren samtidigt som spelledaren.
    if (!host && view.winners && view.winnerShown && !winShown) {
      clearTimeout(winTimer);
      winTurn += 1;
      winDrum = true;
      winShown = true;
    } else if (!host && view.winners && view.winnerDrum && !winDrum && phase === 'revealed') {
      clearTimeout(winTimer);
      winDrum = true;
      const turn = winTurn;
      winTimer = setTimeout(() => {
        if (turn !== winTurn || winShown) return;
        winShown = true;
        if (view.winners) render();
      }, DRUM_MAX_MS);
    }
    const winner = winnerView();
    const drum = Boolean(view.winners && phase === 'revealed' && winDrum && !winner);
    // Spelledaren kan välja att inte delta. Då visas låten och timern, men inga fält eller egna svar.
    const playing = view.standings.some((p) => p.id === me);
    const guessFields = $('.guess-fields');
    if (guessFields) guessFields.hidden = !playing;
    // Utan fält och egna svar räcker en lägre ruta, både under låten och när svaret visas.
    document.body.classList.toggle('watching', !playing);
    // Medan nästa låt laddas står förra kortet kvar, och låtkortet vänds fram när ljudet hörs.
    // Kommer man in medan låten laddas visas låtkortet med den fulla ringen direkt.
    const holding = phase === 'ready' && (!$('#waiting').hidden || !$('#result').hidden);
    // Nedräkningen till nästa låt döljs, så att den inte står still medan klippet laddas. Den
    // behåller sin plats, så att poänglistan under inte flyttar sig.
    const nextCount = $('#result-body .next');
    if (holding && nextCount) nextCount.classList.add('held');
    // När spelet har startats står Nu börjar det! på väntekortet tills första låten hörs.
    const starting = phase === 'ready' && !$('#waiting').hidden;
    if (view.introMs) [introEnds, introTotal] = [Date.now() + view.introMs, view.introTotalMs];
    if (starting && $('#intro').hidden) {
      $('#intro').classList.add('reveal');
      announce('Nu börjar det!');
    }
    if (!starting) $('#intro').classList.remove('reveal');
    $('#intro').hidden = !starting;
    $('.waiting-cover').hidden = starting;
    renderIntro();
    $('#waiting').hidden = phase !== 'waiting' && !(holding && !$('#waiting').hidden);
    $('#waiting-title').textContent = host ? 'Väntar på spelarna' : 'Snart kör vi!';
    $('#waiting .eq').classList.toggle('idle', !view.lobbyPlaying);
    $('#waiting-text').textContent = host ? 'Starta spelet när alla är här' : 'Spelledaren startar första låten snart';
    $('#rules').innerHTML = rules(view).map((r) => `<li>${esc(r)}</li>`).join('');
    $('#guess').hidden = holding || !(phase === 'ready' || phase === 'playing');
    $('#result').hidden = phase !== 'revealed' && !(holding && !$('#result').hidden);
    fields.artist.disable(phase !== 'playing' || view.paused);
    fields.title.disable(phase !== 'playing' || view.paused);
    $('label[for=artist]').textContent = view.labels.artist;
    $('label[for=title]').textContent = view.labels.title;
    showSuggestions();

    if (phase !== 'revealed') shownResult = null;
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
      renderTimer();
    } else if (phase === 'revealed') {
      const r = round.result || { artist: false, title: false, bonus: false, points: 0 };
      const mine = round.answer || { artist: '', title: '' };
      // Den lilla ringen framför texten under svaret töms tills nästa låt startar av sig själv.
      const next = round.nextInMs == null ? '' : `<span class="next"><span id="next-pie" class="pie"></span>
        <span id="next-text" aria-hidden="true">Nästa låt om <span class="next-count" data-widest="${Math.ceil(round.nextTotalMs / 1000)} s"><span id="next-num"></span></span></span>
        <span class="visually-hidden">Nästa låt startar av sig själv om ${Math.ceil(round.nextInMs / 1000)} sekunder.</span></span>`;
      // Vyn ritas om vid till exempel paus. Svaret animeras bara första gången.
      const key = winner ? `w${round.number}` : drum ? `d${round.number}` : round.number;
      const fresh = shownResult !== key;
      // När någon har vunnit visas sista låten först som vanligt, och sedan tar vinnaren omslaget.
      const clipNote = '<p class="round-label clip-note"><span class="clip-from">Ljudklipp från </span>Deezer</p>';
      const label = 'Spelet är slut';
      const intro = view.winners ? winIntro({ winners: view.winners, songs: round.number }) : null;
      const cover = drum
        ? `<div class="cover win drum reveal"><div class="cover-head"><p class="round-label">${label}</p></div>
          <h2 class="win-title">${esc(intro)}</h2>
          <p class="win-sub">Först till ${view.winScore} poäng.</p></div>`
        : winner
        ? `<div class="cover win reveal"><div class="win-fx" aria-hidden="true"></div>
          <div class="cover-head"><p class="round-label">${label}</p>${view.winnerClip ? clipNote : ''}</div>
          <h2 class="win-title">${esc(view.winners.join(' och '))} vinner!</h2>
          <p class="win-sub">${esc(winComment({ winners: view.winners, standings: view.standings, songs: round.number, winScore: view.winScore }))}</p></div>`
        : `<div class="cover answer reveal"><div class="cover-head"><h2 class="round-label">Låt ${round.number} · Rätt svar</h2>${clipNote}</div>
          <div class="title">${esc(round.song.title)}</div>
          <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>`;
      // De egna svaren i en grupp: vad man svarade och vad det gav. Rätt är grönt, fel rött och inget svar grått.
      const row = (label, given, right) => `<li class="${right ? 'right' : given ? 'wrong' : 'none'}">`
        + `<span class="lab">${esc(label)}</span><span class="val">${esc(given || 'Inget svar')}</span>`
        + `<span class="pts">${right ? '+1' : '0'}</span></li>`;
      // Bonusraden lyser upp i guld med lite gnistor runt +1, när svaret visas första gången.
      const bonusRow = () => row('Bonus', 'Blixtsnabbt!', true)
        .replace('<li class="right">', `<li class="right bonus${fresh ? ' pop' : ''}">`)
        .replace('<span class="pts">', `<span class="pts">${fresh ? sparkles() : ''}`);
      const own = playing && !winner && !drum;
      const mineRows = own ? `<ul class="mine">${row(view.labels.artist, mine.artist, r.artist)}${row(view.labels.title, mine.title, r.title)}`
        + `${r.bonus ? bonusRow() : ''}</ul>` : '';
      // Med stor text skrivs poängen kort som p, så att den får plats på en rad. Skärmläsare får hela ordet.
      // Har man klättrat står placeringen i en bricka till höger om poängen.
      const meNow = view.standings.find((p) => p.id === me);
      const rankFrom = ranksBefore.get(me);
      const rankTo = meNow ? rankIn(view.standings, meNow.score) : 0;
      const climb = own && rankFrom > rankTo ? climbBadge(rankFrom, rankTo, fresh) : '';
      const points = own ? `<p class="points${r.points ? '' : ' zero'}"><span aria-hidden="true">+${r.points} `
        + '<span class="points-long">poäng</span><span class="points-short">p</span></span>'
        + `<span class="visually-hidden">+${r.points} poäng</span>${climb}</p>` : '';
      // Under poängen står en kort kommentar, till exempel Klockrent! när allt var rätt.
      const cheer = own ? `<p class="cheer">${esc(roundCheer(r, round.number))}</p>` : '';
      const rest = `${mineRows}
        ${points || next ? `<div class="result-foot">${points ? `<div class="score-line">${points}${cheer}</div>` : ''}${next}</div>` : ''}`;
      // Ritas samma svar om, till exempel när spelledarens knappar byts, står omslaget kvar.
      // Då fortsätter vändningen och vinstanimationen i stället för att börja om eller stoppas.
      const body = $('#result-body');
      const kept = fresh ? null : body.querySelector(':scope > .cover');
      if (kept) {
        while (kept.nextSibling) kept.nextSibling.remove();
        kept.insertAdjacentHTML('afterend', rest);
      } else {
        body.innerHTML = `${cover}${rest}`;
        // Vinnarkortet får konfetti, fyrverkeri eller strålkastare, eller säsongens egna effekter i
        // Halloween och Jul. Valet görs från sista låten, vinnarna och kategorin, så att alla enheter
        // visar samma utan att något skickas över nätet. Löven och snön bakom sidan pausas så länge.
        const fx = winner && body.querySelector('.win-fx');
        if (fx) {
          pauseSeasonEffect(13500);
          startWinEffect(fx, pickWinEffect(`${round.number}|${round.song.title}|${round.song.artist}|${view.winners.join('|')}`, view.categoryId));
        }
      }
      // Både spelledaren och spelarna kan ha scrollat ner, till exempel medan förslagslistan var
      // öppen. Svaret ska synas överst.
      if (fresh) {
        if (document.activeElement && $('#guess').contains(document.activeElement)) document.activeElement.blur();
        scrollToTop();
      }
      shownResult = key;
      announce(drum ? intro
        : `Rätt svar: ${round.song.title} med ${round.song.artist}.${playing ? ` Du fick ${r.points} poäng.` : ''}`
        + (winner ? ` ${view.winners.join(' och ')} vinner!` : ''));
      renderTimer();
    }
    renderStandings();
    // Under ställningen, när matchen är slut, står att spelledaren startar nästa match.
    const winWait = $('#win-wait');
    if (winWait) winWait.hidden = !winner;
    // Pausen står i meddelanderutan så länge den varar, och rutan läses upp.
    const paused = Boolean(view.paused);
    if (paused !== wasPaused) {
      setStandingMessage(paused ? { kind: 'pause', title: host ? 'Spelet är pausat' : 'Kort paus',
        text: host ? 'Tryck på Starta spelet för att fortsätta.' : 'Spelledaren pausade. Vi fortsätter snart.' } : null);
      if (wasPaused) announce('Spelet fortsätter.');
    }
    wasPaused = paused;
  }

  return {
    // Visar ett nytt läge. playerId är den som tittar, så att egna svar och den egna raden syns.
    update(newView, playerId) {
      const shown = view !== null;
      view = newView;
      me = playerId;
      // Kategorins färg lyser svagt överst på sidan, som ljuset från ett skivomslag.
      document.documentElement.dataset.kategori = view.categoryId || '';
      const round = view.round;
      // En ny låt eller en ny match visas överst, om man har scrollat ner till exempel till poängen.
      // Inte när man precis har gått med, och inte när svaret visas, eftersom det rullar själv.
      if (shown && (round ? round.number !== roundNumber && round.phase !== 'revealed' : roundNumber !== null)) {
        scrollToTop();
      }
      if (!round) roundNumber = null;
      if (round && round.number !== roundNumber) {
        roundNumber = round.number;
        local.artist = round.answer ? round.answer.artist : '';
        local.title = round.answer ? round.answer.title : '';
        fields.artist.set(local.artist);
        fields.title.set(local.title);
      }
      deadline = round && round.phase === 'playing' ? Date.now() + round.remainingMs : 0;
      nextAt = round && round.nextInMs != null ? Date.now() + round.nextInMs : 0;
      render();
    },
    // Vinnarvyn visas, efter att sista låten har visats en stund.
    winnerShown: () => Boolean(view && winnerView()),
    // "Vi har en vinnare!" eller vinnaren visas.
    winnerDrum: () => Boolean(view && view.winners && view.round && view.round.phase === 'revealed' && winDrum),
    // De svar som är valda just nu, till exempel för att skicka dem igen efter ett avbrott.
    answers: () => ({ ...local }),
  };
}
