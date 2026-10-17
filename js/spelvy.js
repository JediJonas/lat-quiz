// Spelvyn som spelarna och spelledaren delar: väntetexten, gissningen med
// förslag, rätt svar och poänglistan. Den visar en playerView från game.js och
// vet inte varifrån den kommer, över nätet hos spelarna eller direkt hos spelledaren.
import { loadSuggestions } from './data.js';
import { autocomplete } from './autocomplete.js';
import { announce, countUp, renderPie, renderRing, scoreTracker, scrollFieldToTop, scrollToTop, statusTags } from './ui.js';
import { setStandingMessage } from './meddelande.js';
import { roundCheer, winComment, winIntro } from './pepp.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Konfettin när någon vinner: bitarna sprids över hela bredden och släpps i omgångar, så att
// det regnar i ungefär tio sekunder. Var bit får egen fart, sidledsdrift och snurr.
const CONFETTI_COLORS = ['#ffd166', '#fff', '#7cf0b0', '#ff9ecb'];
function confetti(count = 110) {
  const rand = (min, max) => min + Math.random() * (max - min);
  return Array.from({ length: count }, (_, i) => `<i style="--x:${rand(-2, 98).toFixed(1)}%;`
    + `--d:${rand(0, 7.8).toFixed(2)}s;--t:${rand(1.3, 2).toFixed(2)}s;--s:${rand(-40, 40).toFixed(0)}px;`
    + `--r:${rand(-540, 540).toFixed(0)}deg;--c:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}"></i>`).join('');
}

// Gnistorna runt bonuspoängen: små stjärnor som skjuts ut åt alla håll och tonar bort.
function sparkles(count = 10) {
  return '<span class="sparkles" aria-hidden="true">' + Array.from({ length: count }, (_, i) =>
    `<i style="--a:${Math.round((360 / count) * i + Math.random() * 20)}deg;--l:${26 + Math.round(Math.random() * 16)}px"></i>`).join('')
    + '</span>';
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

// När den stora rubriken har rullat bort, till exempel medan man skriver ett svar, står
// kategorin i stället liten mitt i en rad överst, som i iOS. Raden är bara utsmyckning:
// rubriken finns kvar för skärmläsare. Medan en låt spelas står nedräkningen där i stället.
function compactTitle() {
  const heading = document.querySelector('.player-head h1');
  if (!heading || !('IntersectionObserver' in window)) return;
  const bar = document.createElement('div');
  bar.className = 'compact-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<span class="logo"></span><span class="compact-title"></span><span class="compact-title bar-time"></span>';
  document.body.append(bar);
  const title = bar.querySelector('.compact-title');
  new MutationObserver(() => { title.textContent = heading.textContent; })
    .observe(heading, { childList: true, characterData: true, subtree: true });
  new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('compact', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }).observe(heading);
}

// Så länge sista låten visas innan vinnaren tar över vyn. Först står till exempel "Vi har en
// vinnare!" medan spelledaren spelar en trumvirvel, och sedan visas namnet.
const WIN_DELAY_MS = 4000;
// Hos spelledaren visas namnet när vinnarlåten börjar höras, efter trumvirveln. Hos spelarna, och
// om låten dröjer, visas det efter en fast tid.
const DRUM_MS = 4000;
const DRUM_MAX_MS = 8000;

// onAnswer(field, value): ett svar har valts eller tagits bort.
// host: spelledaren startar låtarna själv och väntar därför inte på någon.
// onWinnerDrum: till exempel "Vi har en vinnare!" visas. Returnerar den ett löfte visas namnet när
// det uppfylls, men senast efter DRUM_MAX_MS. Annars visas namnet efter DRUM_MS.
// onWinnerShown: vinnarvyn har just tagit över, så att spelledarens knappar kan visas samtidigt.
export function createGameView({ onAnswer, onError, onWinnerDrum = () => {}, onWinnerShown = () => {}, host = false }) {
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
  for (const id of ['artist', 'title']) {
    const input = $(`#${id}`);
    input.addEventListener('focus', () => {
      document.body.classList.add('typing');
      scrollFieldToTop(input, input.closest('.field-row'));
    });
    input.addEventListener('blur', () => document.body.classList.remove('typing'));
  }
  // Förslagslistan är stor. Den laddas i bakgrunden, så att sidan visas direkt.
  loadSuggestions().then((suggestions) => {
    fields.artist.setList(suggestions.artists);
    fields.title.setList(suggestions.titles);
  }).catch(onError);
  setInterval(renderTimer, 250);
  compactTitle();

  function renderTimer() {
    const barTime = document.querySelector('.bar-time');
    document.body.classList.toggle('timing', Boolean(barTime && view && view.round && view.round.phase === 'playing'));
    if (!view || !view.round) return;
    // Under en paus står ringen och cirkeln still på det spelledaren skickade.
    const pie = $('#next-pie');
    const nextMs = view.paused ? view.round.nextInMs : Math.max(0, nextAt - Date.now());
    if (pie && view.round.phase === 'revealed') {
      renderPie(pie, nextMs, view.round.nextTotalMs);
      $('#next-text').textContent = `Nästa låt om ${Math.ceil(nextMs / 1000)} s`;
    }
    if (view.round.phase !== 'playing') return;
    $('#timer').classList.toggle('paused', Boolean(view.paused));
    $('#timer').classList.remove('loading');
    const ms = view.paused ? view.round.remainingMs : Math.max(0, deadline - Date.now());
    renderRing($('#timer'), ms, view.round.roundMs, view.round.bonusMs > 0 && view.round.roundMs - ms <= view.round.bonusMs);
    if (barTime) {
      const seconds = Math.ceil(ms / 1000);
      barTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
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
    const rankOf = (p) => 1 + view.standings.filter((q) => q.score > p.score).length;
    // När svaret visas får den som klättrat en liten pil med antalet placeringar.
    const revealed = view.round && view.round.phase === 'revealed';
    if (!revealed) ranksBefore = new Map(ranked ? view.standings.map((p) => [p.id, rankOf(p)]) : []);
    const climb = (p) => (revealed && ranksBefore.has(p.id) ? ranksBefore.get(p.id) - rankOf(p) : 0);
    const podium = winnerView();
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
      <td class="name"><span class="player"><span>${esc(p.name)}${p.connected ? '' : '<span class="visually-hidden"> (frånkopplad)</span>'}</span>${up > 0 ? `<span class="up"><span aria-hidden="true">▲</span>${up}<span class="visually-hidden"> placeringar upp</span></span>` : ''}</span></td>
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
        winDrum = true;
        render();
        const heard = onWinnerDrum();
        const show = () => {
          if (turn !== winTurn || winShown) return;
          clearTimeout(winTimer);
          winShown = true;
          if (view.winners) { render(); onWinnerShown(); }
        };
        winTimer = setTimeout(show, heard ? DRUM_MAX_MS : DRUM_MS);
        if (heard) heard.then(show, show);
      }, WIN_DELAY_MS);
    } else if (!view.winners) {
      winRound = null;
      winDrum = false;
      winShown = false;
      clearTimeout(winTimer);
      winTurn += 1;
    }
    const winner = winnerView();
    const drum = Boolean(view.winners && phase === 'revealed' && winDrum && !winner);
    // Spelledaren kan välja att inte delta. Då visas låten och timern, men inga fält eller egna svar.
    const playing = view.standings.some((p) => p.id === me);
    const guessFields = $('.guess-fields');
    if (guessFields) guessFields.hidden = !playing;
    // Utan fält och egna svar räcker en lägre ruta, både under låten och när svaret visas.
    document.body.classList.toggle('watching', !playing);
    // Medan låten laddas visas den fulla ringen och fälten redan, så att vyn inte hoppar när timern startar.
    $('#waiting').hidden = phase !== 'waiting';
    $('#waiting-title').textContent = host ? 'Väntar på spelarna' : 'Snart kör vi!';
    $('#waiting-text').textContent = host ? 'Starta spelet när alla är här' : 'Spelledaren startar första låten snart';
    $('#rules').innerHTML = rules(view).map((r) => `<li>${esc(r)}</li>`).join('');
    $('#guess').hidden = !(phase === 'ready' || phase === 'playing');
    $('#result').hidden = phase !== 'revealed';
    fields.artist.disable(phase !== 'playing' || view.paused);
    fields.title.disable(phase !== 'playing' || view.paused);
    // På vinnarkortet gäller Deezer vinnarlåten, inte quizlåtarna.
    document.querySelectorAll('.clip-note').forEach((note) => { if (!note.closest('.win')) note.hidden = !view.deezer; });
    $('label[for=artist]').textContent = view.labels.artist;
    $('label[for=title]').textContent = view.labels.title;

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
      // Den lilla ringen till höger om texten under svaret töms tills nästa låt startar av sig själv.
      const next = round.nextInMs == null ? '' : `<span class="next"><span id="next-text" aria-hidden="true"></span>
        <span id="next-pie" class="pie"></span>
        <span class="visually-hidden">Nästa låt startar av sig själv om ${Math.ceil(round.nextInMs / 1000)} sekunder.</span></span>`;
      // Vyn ritas om vid till exempel paus. Svaret animeras bara första gången.
      const key = winner ? `w${round.number}` : drum ? `d${round.number}` : round.number;
      const fresh = shownResult !== key;
      // När någon har vunnit visas sista låten först som vanligt, och sedan tar vinnaren omslaget.
      const clipNote = '<p class="round-label clip-note"><span class="clip-from">Ljudklipp från </span>Deezer</p>';
      const clip = view.deezer ? clipNote : '';
      const label = 'Matchen är slut';
      const intro = view.winners ? winIntro({ winners: view.winners, songs: round.number }) : null;
      const cover = drum
        ? `<div class="cover win drum reveal"><div class="cover-head"><p class="round-label">${label}</p></div>
          <h2 class="win-title">${esc(intro)}</h2>
          <p class="win-sub">Först till ${view.winScore} poäng.</p></div>`
        : winner
        ? `<div class="cover win reveal"><div class="confetti" aria-hidden="true">${confetti()}</div>
          <div class="cover-head"><p class="round-label">${label}</p>${view.winnerClip ? clipNote : ''}</div>
          <h2 class="win-title">${esc(view.winners.join(' och '))} vinner!</h2>
          <p class="win-sub">${esc(winComment({ winners: view.winners, standings: view.standings, songs: round.number, winScore: view.winScore }))}</p></div>`
        : `<div class="cover answer reveal"><div class="cover-head"><h2 class="round-label">Låt ${round.number} · Rätt svar</h2>${clip}</div>
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
      const points = own ? `<p class="points${r.points ? '' : ' zero'}"><span aria-hidden="true">+${r.points} `
        + '<span class="points-long">poäng</span><span class="points-short">p</span></span>'
        + `<span class="visually-hidden">+${r.points} poäng</span></p>` : '';
      // Under poängen står en kort kommentar, till exempel Klockrent! när allt var rätt.
      const cheer = own ? `<p class="cheer">${esc(roundCheer(r, round.number))}</p>` : '';
      const rest = `${mineRows}
        ${points || next ? `<div class="result-foot">${points ? `<div class="score-line">${points}${cheer}</div>` : ''}${next}</div>` : ''}`;
      // Ritas samma svar om, till exempel när spelledarens knappar byts, står omslaget kvar.
      // Då fortsätter vändningen och konfettin i stället för att börja om eller stoppas.
      const body = $('#result-body');
      const kept = fresh ? null : body.querySelector(':scope > .cover');
      if (kept) {
        while (kept.nextSibling) kept.nextSibling.remove();
        kept.insertAdjacentHTML('afterend', rest);
      } else {
        body.innerHTML = `${cover}${rest}`;
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
        text: host ? 'Tryck på spela för att fortsätta.' : 'Spelledaren pausade. Vi fortsätter snart.' } : null);
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
    winnerShown: () => winnerView(),
    // De svar som är valda just nu, till exempel för att skicka dem igen efter ett avbrott.
    answers: () => ({ ...local }),
  };
}
