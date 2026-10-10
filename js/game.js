// Spellogik: låtval, gissningar och poäng.
// Modulen känner inte till nätverk eller gränssnitt, så kommunikationen kan
// bytas (till exempel mot Firebase) utan att något här ändras.
// Spelläget är ett vanligt objekt som går att spara som JSON.

import { normalize } from './text.js';

export const ROUND_MS = 60000;
export const BONUS_MS = 15000;
export const WIN_SCORE = 10;
export const DEFAULT_LABELS = { artist: 'Artist', title: 'Titel' };

// Inställningar som spelledaren kan välja. Bonus 0 betyder ingen bonus.
export const SETTING_CHOICES = {
  roundMs: [30000, 45000, 60000, 90000, 120000],
  bonusMs: [0, 10000, 15000, 20000, 30000],
  winScore: [5, 10, 15, 20, 30],
};
export const DEFAULT_SETTINGS = { roundMs: ROUND_MS, bonusMs: BONUS_MS, winScore: WIN_SCORE };

// Okända eller saknade värden ersätts med standardvärdet.
export function cleanSettings(settings = {}) {
  const clean = {};
  for (const [key, choices] of Object.entries(SETTING_CHOICES)) {
    const raw = settings ? settings[key] : undefined;
    // null och tom text får inte bli 0, som betyder ingen bonus.
    const value = raw == null || raw === '' ? NaN : Number(raw);
    clean[key] = choices.includes(value) ? value : DEFAULT_SETTINGS[key];
  }
  return clean;
}

// Ändras inte mitt i en låt, eftersom timern och bonusen räknas från dem.
export function applySettings(state, settings) {
  if (state.round && state.round.phase === 'playing') return false;
  Object.assign(state, cleanSettings(settings));
  return true;
}

export { normalize };

// labels: vad fälten heter i kategorin, till exempel Kompositör och Verk.
export function createGame({ code, categoryId, categoryName = '', playedIds = [], labels = DEFAULT_LABELS, settings }) {
  return {
    code,
    categoryId,
    categoryName,
    players: {},
    playedIds: [...playedIds],
    roundNumber: 0,
    round: null,
    ...cleanSettings(settings),
    winners: null,
    labels: { ...labels },
  };
}

// Byter kategori i ett pågående spel. Poängen och spelade låtar finns kvar.
// Går inte medan en låt pågår, eftersom låten hör till den gamla kategorin.
export function changeCategory(state, { categoryId, categoryName = '', labels = DEFAULT_LABELS }) {
  if (state.round && state.round.phase !== 'revealed') return false;
  state.categoryId = categoryId;
  state.categoryName = categoryName;
  state.labels = { ...labels };
  return true;
}

// Ny spelare, eller en spelare som ansluter igen med samma id.
export function addPlayer(state, { id, name }) {
  const existing = state.players[id];
  if (existing) {
    existing.connected = true;
    if (name) existing.name = name;
    return existing;
  }
  const player = { id, name, score: 0, connected: true };
  state.players[id] = player;
  return player;
}

export function setConnected(state, id, connected) {
  if (state.players[id]) state.players[id].connected = connected;
}

export function removePlayer(state, id) {
  delete state.players[id];
}

export function unplayedSongs(state, songs) {
  const played = new Set(state.playedIds);
  return songs.filter((s) => !played.has(s.id));
}

// Slumpar en ospelad låt. Returnerar null när alla låtar är spelade.
export function nextSong(state, songs, random = Math.random) {
  const left = unplayedSongs(state, songs);
  if (left.length === 0 || state.winners) return null;
  const song = left[Math.floor(random() * left.length)];
  state.roundNumber += 1;
  state.round = {
    number: state.roundNumber,
    song,
    phase: 'ready',
    startedAt: null,
    answers: {},
    results: null,
  };
  return song;
}

// Spelledaren har klickat på låtlänken. Timern startar.
export function startRound(state, now) {
  const round = state.round;
  if (!round || round.phase !== 'ready') return false;
  round.phase = 'playing';
  round.startedAt = now;
  return true;
}

export function remainingMs(state, now) {
  const round = state.round;
  if (!round || round.phase !== 'playing') return 0;
  return Math.max(0, round.startedAt + state.roundMs - now);
}

// field är 'artist' eller 'title'. Ett tomt värde betyder att svaret tas bort.
export function submitAnswer(state, playerId, field, value, now) {
  const round = state.round;
  if (!round || round.phase !== 'playing') return false;
  if (!state.players[playerId]) return false;
  if (field !== 'artist' && field !== 'title') return false;
  if (now > round.startedAt + state.roundMs) return false;
  const answer = round.answers[playerId] || (round.answers[playerId] = {
    artist: '', title: '', changedAt: null,
  });
  const clean = (value || '').trim();
  if (answer[field] === clean) return true;
  answer[field] = clean;
  answer.changedAt = now;
  return true;
}

// Vilka fält en spelare har fyllt i under omgången, utan själva svaren.
export function answeredFields(state, playerId) {
  const answer = state.round && state.round.answers[playerId];
  return { artist: Boolean(answer && answer.artist), title: Boolean(answer && answer.title) };
}

export function hasAnsweredBoth(state, playerId) {
  const answer = state.round && state.round.answers[playerId];
  return Boolean(answer && answer.artist && answer.title);
}

// Alla anslutna spelare har svarat i båda fälten.
export function allAnswered(state) {
  const connected = Object.values(state.players).filter((p) => p.connected);
  return connected.length > 0 && connected.every((p) => hasAnsweredBoth(state, p.id));
}

export function shouldReveal(state, now) {
  const round = state.round;
  if (!round || round.phase !== 'playing') return false;
  return remainingMs(state, now) === 0 || allAnswered(state);
}

export function scoreAnswer(state, song, answer) {
  const artist = Boolean(answer && normalize(answer.artist) === normalize(song.artist));
  const title = Boolean(answer && normalize(answer.title) === normalize(song.title));
  const fast = Boolean(state.bonusMs > 0 && answer && answer.changedAt !== null
    && answer.changedAt - state.round.startedAt <= state.bonusMs);
  const bonus = artist && title && fast;
  return { artist, title, bonus, points: Number(artist) + Number(title) + Number(bonus) };
}

// Visar rätt svar, delar ut poäng och markerar låten som spelad.
export function reveal(state) {
  const round = state.round;
  if (!round || round.phase !== 'playing') return false;
  round.results = {};
  for (const player of Object.values(state.players)) {
    const result = scoreAnswer(state, round.song, round.answers[player.id]);
    round.results[player.id] = result;
    player.score += result.points;
  }
  round.phase = 'revealed';
  if (!state.playedIds.includes(round.song.id)) state.playedIds.push(round.song.id);
  state.winners = findWinners(state);
  return true;
}

// Först till winScore vinner. Når flera gränsen samtidigt vinner den med
// flest poäng, och vid lika poäng delar de på segern.
export function findWinners(state) {
  const limit = state.winScore || WIN_SCORE;
  const top = Math.max(0, ...Object.values(state.players).map((p) => p.score));
  if (top < limit) return null;
  return Object.values(state.players).filter((p) => p.score === top).map((p) => p.id);
}

// Ny match med samma spelare. Spelade låtar räknas fortfarande som spelade.
export function restart(state) {
  for (const player of Object.values(state.players)) player.score = 0;
  state.winners = null;
  state.round = null;
  state.roundNumber = 0;
}

export function standings(state) {
  return Object.values(state.players)
    .map(({ id, name, score, connected }) => ({ id, name, score, connected }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sv'));
}

// Det en spelare får se. Låten skickas först när svaret visas.
export function playerView(state, playerId, now) {
  const round = state.round;
  const view = {
    code: state.code,
    categoryName: state.categoryName || '',
    standings: standings(state),
    answered: round ? Object.keys(state.players).filter((id) => hasAnsweredBoth(state, id)) : [],
    winScore: state.winScore || WIN_SCORE,
    winners: state.winners ? state.winners.map((id) => state.players[id].name) : null,
    labels: state.labels || DEFAULT_LABELS,
    round: null,
  };
  if (round) {
    view.round = {
      number: round.number,
      phase: round.phase,
      remainingMs: remainingMs(state, now),
      roundMs: state.roundMs,
      bonusMs: state.bonusMs,
      answer: round.answers[playerId] || null,
      song: round.phase === 'revealed'
        ? { artist: round.song.artist, title: round.song.title, year: round.song.year }
        : null,
      result: round.results ? round.results[playerId] || null : null,
      // Alla spelares läge: vilka fält som är ifyllda, och rätt och fel när svaret visas.
      progress: Object.fromEntries(Object.keys(state.players).map((id) => [id, answeredFields(state, id)])),
      results: round.results || null,
    };
  }
  return view;
}
