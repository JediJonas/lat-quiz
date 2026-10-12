// Spelvyn som spelarna och spelledaren delar: väntetexten, gissningen med
// förslag, rätt svar och poänglistan. Den visar en playerView från game.js och
// vet inte varifrån den kommer, över nätet hos spelarna eller direkt hos spelledaren.
import { loadSuggestions } from './data.js';
import { autocomplete } from './autocomplete.js';
import { announce, renderRing, scoreTracker, statusTags } from './ui.js';

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
    if (!view || !view.round || view.round.phase !== 'playing') return;
    const ms = Math.max(0, deadline - Date.now());
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

  function waitingText(round, phase) {
    if (phase === 'ready') return `Låt ${round.number} startar snart…`;
    return host
      ? `Tryck på Nästa låt när alla har gått med. ${rulesText(view)}`
      : `Väntar på första låten… ${rulesText(view)}`;
  }

  function render() {
    const round = view.round;
    const phase = round ? round.phase : 'waiting';
    $('#waiting').hidden = !(phase === 'waiting' || phase === 'ready');
    $('#waiting-text').textContent = waitingText(round, phase);
    $('#guess').hidden = phase !== 'playing';
    $('#result').hidden = phase !== 'revealed';
    fields.artist.disable(phase !== 'playing');
    fields.title.disable(phase !== 'playing');
    $('label[for=artist]').textContent = view.labels.artist;
    $('label[for=title]').textContent = view.labels.title;

    if (phase === 'playing') {
      $('#round-title').textContent = `Låt ${round.number}`;
      announce(`Låt ${round.number} har börjat. Du har ${Math.round(round.roundMs / 1000)} sekunder på dig.`);
      renderTimer();
    } else if (phase === 'revealed') {
      const r = round.result || { artist: false, title: false, bonus: false, points: 0 };
      const mine = round.answer || { artist: '', title: '' };
      $('#result-body').innerHTML = `<h2 class="round-label">Låt ${round.number}</h2>
        <div class="answer reveal"><div class="title">${esc(round.song.title)}</div>
        <div class="artist">${esc(round.song.artist)} · ${round.song.year}</div></div>
        <ul class="mine">
          <li class="${r.artist ? 'right' : 'wrong'}"><span>${esc(view.labels.artist)}</span>${esc(mine.artist || '–')}</li>
          <li class="${r.title ? 'right' : 'wrong'}"><span>${esc(view.labels.title)}</span>${esc(mine.title || '–')}</li>
          ${r.bonus ? '<li class="right bonus"><span>Bonus</span>Snabbt svar</li>' : ''}
        </ul>
        <p class="points">+${r.points} poäng</p>
        ${view.winners ? `<div class="winner">${esc(view.winners.join(' och '))} vinner!</div>` : ''}`;
      announce(`Rätt svar: ${round.song.title} med ${round.song.artist}. Du fick ${r.points} poäng.`
        + (view.winners ? ` ${view.winners.join(' och ')} vinner!` : ''));
    }
    renderStandings();
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
      render();
    },
    // De svar som är valda just nu, till exempel för att skicka dem igen efter ett avbrott.
    answers: () => ({ ...local }),
  };
}
