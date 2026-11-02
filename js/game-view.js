// @ts-check
// Spelvyn som spelarna och spelledaren delar: väntetexten, gissningen med
// förslag, rätt svar och poänglistan. Den visar en playerView från game.js och
// vet inte varifrån den kommer, över nätet hos spelarna eller direkt hos spelledaren.
// Varje kort ritas av en egen modul i js/views/. Här bestäms vilket kort som syns, och här
// finns svarsfälten med sina regler för iPhone.
import { loadSuggestions, suggestionKind } from './data.js';
import { $ } from './shared/dom.js';
import { autocomplete } from './autocomplete.js';
import { announce, scrollFieldToTop, scrollToTop } from './ui.js';
import { setStandingMessage } from './message.js';
import { t } from './shared/lang.js';
import { guessFields as fieldsOf } from './game.js';
import { createWaitingCard } from './views/waiting-card.js';
import { renderSongCard, tickSongTimer } from './views/song-card.js';
import { createResultCard } from './views/result-card.js';
import { createStandings } from './views/standings.js';
import { createWinnerTiming } from './views/winner-timing.js';

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

// onAnswer(field, value): ett svar har valts eller tagits bort.
// host: spelledaren startar låtarna själv och väntar därför inte på någon.
// onWinnerDrum: trumvirveln ska börja, se views/winner-timing.js.
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
  const local = { artist: '', title: '' };
  const waitingCard = createWaitingCard();
  const resultCard = createResultCard();
  const standings = createStandings();
  const winTiming = createWinnerTiming({ view: () => view, host, onWinnerDrum, onWinnerDrumShown, onWinnerShown, render: () => render() });

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

  function renderTimer() {
    if (!view || !view.round) return;
    waitingCard.tick();
    resultCard.tick(view, nextAt);
    tickSongTimer(view, deadline);
  }

  // Vinnaren visas när matchen är avgjord och sista låten har visats en stund.
  const winnerView = () => winTiming.winner();

  function render() {
    const round = view.round;
    const phase = round ? round.phase : 'waiting';
    winTiming.follow();
    const winner = winnerView();
    const drum = winTiming.drum() && !winner;
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
    waitingCard.render(view, { phase, holding, host });
    $('#guess').hidden = holding || !(phase === 'ready' || phase === 'playing');
    $('#result').hidden = phase !== 'revealed' && !(holding && !$('#result').hidden);
    fields.artist.disable(phase !== 'playing' || view.paused);
    fields.title.disable(phase !== 'playing' || view.paused);
    // I en kategori utan artistfält, som TV-serier, gissar man bara på titeln.
    const single = fieldsOf(view.labels).length === 1;
    $('#artist').closest('.field-row').hidden = single;
    $('label[for=artist]').textContent = view.labels.artist || '';
    $('label[for=title]').textContent = view.labels.title;
    showSuggestions();

    if (phase !== 'revealed') resultCard.reset();
    renderSongCard(view, { phase, playing }, renderTimer);
    if (phase === 'revealed') {
      resultCard.render({ view, me, playing, winner, drum, rankBefore: standings.rankBefore });
      renderTimer();
    }
    standings.render(view, me, winner);
    // Under ställningen, när matchen är slut, står att spelledaren startar nästa match.
    const winWait = $('#win-wait');
    if (winWait) winWait.hidden = !winner;
    // Pausen står i meddelanderutan så länge den varar, och rutan läses upp.
    const paused = Boolean(view.paused);
    if (paused !== wasPaused) {
      setStandingMessage(paused ? { kind: 'pause', title: host ? t('pause.title.host') : t('pause.title.player'),
        text: host ? t('pause.text.host') : t('pause.text.player') } : null);
      if (wasPaused) announce(t('pause.resumed'));
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
      document.documentElement.dataset.category = view.categoryId || '';
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
    winnerDrum: () => Boolean(view && winTiming.drum()),
    // De svar som är valda just nu, till exempel för att skicka dem igen efter ett avbrott.
    answers: () => ({ ...local }),
  };
}
