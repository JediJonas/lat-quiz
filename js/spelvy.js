// Spelvyn som spelarna och spelledaren delar: väntetexten, gissningen med
// förslag, rätt svar och poänglistan. Den visar en playerView från game.js och
// vet inte varifrån den kommer, över nätet hos spelarna eller direkt hos spelledaren.
import { loadSuggestions } from './data.js';
import { autocomplete } from './autocomplete.js';
import { announce, renderPie, renderRing, scoreTracker, statusTags } from './ui.js';
import { setStandingMessage } from './meddelande.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Reglerna i klartext medan alla väntar på första låten.
function rulesText(view) {
  const s = view.settings;
  if (!s) return `Först till ${view.winScore} p vinner. Lycka till!`;
  // Hårda mellanslag efter talen, så att ett tal aldrig hamnar ensamt sist på en rad.
  const points = s.bonusMs
    ? `1 p för artist, 1 p för titel och 1 p i bonus om båda är rätt inom ${s.bonusMs / 1000} s`
    : '1 p för artist och 1 p för titel';
  return `${s.roundMs / 1000} s per låt. ${points}. Först till ${s.winScore} p vinner. Lycka till!`;
}

// onAnswer(field, value): ett svar har valts eller tagits bort.
// host: spelledaren startar låtarna själv och väntar därför inte på någon.
export function createGameView({ onAnswer, onError, host = false }) {
  let view = null;
  let me = null;
  let roundNumber = null;
  let deadline = 0;
  let nextAt = 0;
  let wasPaused = null;
  let shownResult = null; // låten vars svar senast visades
  const local = { artist: '', title: '' };
  const scoreChanged = scoreTracker();

  const answer = (field) => (value) => { local[field] = value; onAnswer(field, value); };
  const fields = {
    artist: autocomplete($('#artist'), [], answer('artist')),
    title: autocomplete($('#title'), [], answer('title')),
  };
  // Förslagslistan är stor. Den laddas i bakgrunden, så att sidan visas direkt.
  loadSuggestions().then((suggestions) => {
    fields.artist.setList(suggestions.artists);
    fields.title.setList(suggestions.titles);
  }).catch(onError);
  setInterval(renderTimer, 250);

  function renderTimer() {
    if (!view || !view.round) return;
    // Under en paus står ringen och cirkeln still på det spelledaren skickade.
    const pie = $('#next-pie');
    const nextMs = view.paused ? view.round.nextInMs : Math.max(0, nextAt - Date.now());
    if (pie && view.round.phase === 'revealed') renderPie(pie, nextMs, view.round.nextTotalMs);
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
    const rows = view.standings.map((p) => `<tr class="${p.id === me ? 'me' : ''} ${p.connected ? '' : 'offline'} ${scoreChanged(p.id, p.score) ? 'bump' : ''}">
      <td class="score">${p.score}<span class="visually-hidden"> poäng</span></td>
      <td class="name">${esc(p.name)}${p.connected ? '' : '<span class="visually-hidden"> (frånkopplad)</span>'}</td>
      <td class="status">${playerStatus(p.id)}</td></tr>`);
    $('#standings').innerHTML = `<table><tbody>${rows.join('')}</tbody></table>`;
  }

  function waitingText() {
    return host
      ? `Starta spelet när alla har gått med. ${rulesText(view)}`
      : `Väntar på första låten… ${rulesText(view)}`;
  }

  function render() {
    const round = view.round;
    const phase = round ? round.phase : 'waiting';
    // Spelledaren kan välja att inte delta. Då visas låten och timern, men inga fält eller egna svar.
    const playing = view.standings.some((p) => p.id === me);
    const guessFields = $('.guess-fields');
    if (guessFields) guessFields.hidden = !playing;
    // Utan fält och egna svar räcker en lägre ruta, både under låten och när svaret visas.
    document.body.classList.toggle('watching', !playing);
    // Medan låten laddas visas den fulla ringen och fälten redan, så att vyn inte hoppar när timern startar.
    $('#waiting').hidden = phase !== 'waiting';
    $('#waiting-text').textContent = waitingText();
    $('#guess').hidden = !(phase === 'ready' || phase === 'playing');
    $('#result').hidden = phase !== 'revealed';
    fields.artist.disable(phase !== 'playing' || view.paused);
    fields.title.disable(phase !== 'playing' || view.paused);
    document.querySelectorAll('.clip-note').forEach((note) => { note.hidden = !view.deezer; });
    $('label[for=artist]').textContent = view.labels.artist;
    $('label[for=title]').textContent = view.labels.title;

    if (phase !== 'revealed') shownResult = null;
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
      // Den lilla ringen längst ner till vänster töms tills nästa låt startar av sig själv.
      const next = round.nextInMs == null ? '' : `<span id="next-pie" class="pie"></span>
        <span class="visually-hidden">Nästa låt startar av sig själv om ${Math.ceil(round.nextInMs / 1000)} sekunder.</span>`;
      // Vyn ritas om vid till exempel paus. Svaret animeras bara första gången.
      const fresh = shownResult !== round.number;
      $('#result-body').classList.toggle('settled', !fresh);
      $('#result-body').innerHTML = `<div class="round-head"><h2 class="round-label">Låt ${round.number}</h2></div>
        <div class="answer reveal"><div class="title">${esc(round.song.title)}</div>
        <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>
        ${playing ? `<ul class="mine">
          <li class="${r.artist ? 'right' : 'wrong'}"><span>${esc(view.labels.artist)}</span>${esc(mine.artist || '–')}</li>
          <li class="${r.title ? 'right' : 'wrong'}"><span>${esc(view.labels.title)}</span>${esc(mine.title || '–')}</li>
          ${r.bonus ? '<li class="right bonus"><span>Bonus</span>Snabbt svar</li>' : ''}
        </ul>
        <p class="points">+${r.points} poäng</p>` : ''}
        ${view.winners ? `<div class="winner">${esc(view.winners.join(' och '))} vinner!</div>` : ''}
        ${next || view.deezer ? `<div class="result-foot">${next}<p class="note clip-note"${view.deezer ? '' : ' hidden'}>Ljudklipp från Deezer</p></div>` : ''}`;
      // Både spelledaren och spelarna kan ha scrollat ner, till exempel medan förslagslistan var
      // öppen. Svaret ska synas överst. När tangentbordet stängs i iPhone kan Safari avbryta den
      // mjuka scrollningen, så sidan hoppar upp om den ändå inte har kommit hela vägen.
      if (fresh) {
        if (document.activeElement && $('#guess').contains(document.activeElement)) document.activeElement.blur();
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setTimeout(() => { if (window.scrollY > 0) window.scrollTo({ top: 0 }); }, 800);
      }
      shownResult = round.number;
      announce(`Rätt svar: ${round.song.title} med ${round.song.artist}.${playing ? ` Du fick ${r.points} poäng.` : ''}`
        + (view.winners ? ` ${view.winners.join(' och ')} vinner!` : ''));
      renderTimer();
    }
    renderStandings();
    // Pausen står i meddelanderutan så länge den varar, och rutan läses upp.
    const paused = Boolean(view.paused);
    if (paused !== wasPaused) {
      setStandingMessage(paused ? { kind: 'pause', title: 'Spelet är pausat',
        text: host ? 'Tryck på spela för att fortsätta.' : 'Väntar på att spelledaren fortsätter.' } : null);
      if (wasPaused) announce('Spelet fortsätter.');
    }
    wasPaused = paused;
  }

  return {
    // Visar ett nytt läge. playerId är den som tittar, så att egna svar och den egna raden syns.
    update(newView, playerId) {
      view = newView;
      me = playerId;
      const round = view.round;
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
    // De svar som är valda just nu, till exempel för att skicka dem igen efter ett avbrott.
    answers: () => ({ ...local }),
  };
}
