// Spellogik: låtval, gissningar och poäng.
// Modulen känner inte till nätverk eller gränssnitt, så kommunikationen kan
// bytas (till exempel mot Firebase) utan att något här ändras.
// Spelläget är ett vanligt objekt som går att spara som JSON.

import { normalize, answerKey } from './text.js';
import { songLabels } from './data.js';

// 30 sekunder per låt som standard, lika långt som hela Deezer-klippet.
export const ROUND_MS = 30000;
export const BONUS_MS = 15000;
export const WIN_SCORE = 10;
export const DEFAULT_LABELS = { artist: 'Artist', title: 'Titel' };
export const MAX_NAME = 10;

// Inställningar som spelledaren kan välja. roundMs är hur lång del av klippet som spelas, och
// lika lång tid har spelarna på sig. Bonus 0 betyder ingen bonus.
export const SETTING_CHOICES = {
  roundMs: [10000, 15000, 20000, 25000, ROUND_MS],
  bonusMs: [0, 5000, 10000, 15000, 20000],
  winScore: [3, 5, 10, 15, 20],
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
  // En bonus som räcker hela låten vore ingen bonus för snabbhet. Då gäller den längsta som är kortare.
  if (!bonusAllowed(clean.bonusMs, clean.roundMs)) {
    clean.bonusMs = Math.max(...SETTING_CHOICES.bonusMs.filter((v) => bonusAllowed(v, clean.roundMs)));
  }
  return clean;
}

// Bonustiden måste vara kortare än tiden per låt.
export function bonusAllowed(bonusMs, roundMs) {
  return bonusMs < roundMs;
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

// Ett namn som en annan spelare redan har, utan hänsyn till stora bokstäver och accenter.
export function nameTaken(state, { id, name }) {
  const wanted = normalize(name);
  return Object.values(state.players).some((p) => p.id !== id && normalize(p.name) === wanted);
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

// Spelledaren kan välja att inte delta. Då finns spelledaren inte bland spelarna och kan inte svara.
// Poängen sparas, så att den finns kvar om spelledaren deltar igen senare i matchen.
// Byts bara mellan låtarna, eftersom ändringarna gäller från nästa låt.
export function setHostPlaying(state, playing, name) {
  const id = state.hostId;
  if (!id) return;
  state.hostPlays = Boolean(playing);
  if (playing) {
    if (!state.players[id] && state.benchedHost) state.players[id] = state.benchedHost;
    state.benchedHost = null;
    addPlayer(state, { id, name });
  } else if (state.players[id]) {
    state.benchedHost = { ...state.players[id], connected: true };
    delete state.players[id];
  }
  if (state.winners) state.winners = findWinners(state);
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
  state.pausedAt = null;
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

// Byter låten innan den har börjat, när musiktjänsten saknar den. Den överhoppade låten
// räknas som spelad, så att den inte slumpas igen. Returnerar null om ingen låt finns kvar.
export function replaceSong(state, songs, random = Math.random) {
  const round = state.round;
  if (!round || round.phase !== 'ready') return null;
  if (!state.playedIds.includes(round.song.id)) state.playedIds.push(round.song.id);
  const left = unplayedSongs(state, songs);
  if (left.length === 0) return null;
  round.song = left[Math.floor(random() * left.length)];
  return round.song;
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
  // Under en paus står tiden still där den var.
  const at = state.pausedAt || now;
  return Math.max(0, round.startedAt + state.roundMs - at);
}

// Spelledaren pausar spelet. Timern står still och inga svar tas emot.
export function pause(state, now) {
  if (state.pausedAt || !state.round) return false;
  state.pausedAt = now;
  return true;
}

// Spelet fortsätter. Returnerar hur länge pausen varade, eller 0 om spelet inte var pausat.
export function resume(state, now) {
  if (!state.pausedAt) return 0;
  const pausedMs = Math.max(0, now - state.pausedAt);
  const round = state.round;
  if (round && round.phase === 'playing') round.startedAt += pausedMs;
  state.pausedAt = null;
  return pausedMs;
}

// field är 'artist' eller 'title'. Ett tomt värde betyder att svaret tas bort.
export function submitAnswer(state, playerId, field, value, now) {
  const round = state.round;
  if (!round || round.phase !== 'playing' || state.pausedAt) return false;
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

// Svaret visas först när tiden är slut, även om alla har svarat, så att
// spelarna kan ändra sina svar tills dess.
export function shouldReveal(state, now) {
  const round = state.round;
  if (!round || round.phase !== 'playing' || state.pausedAt) return false;
  return remainingMs(state, now) === 0;
}

export function scoreAnswer(state, song, answer) {
  // Samma nycklar som förslagen, så att ett svar som bara stavas annorlunda, som
  // "Nick Cave and the Bad Seeds" för "Nick Cave & The Bad Seeds", räknas som rätt.
  const artist = Boolean(answer && answerKey(answer.artist, { article: true }) === answerKey(song.artist, { article: true }));
  const title = Boolean(answer && answerKey(answer.title) === answerKey(song.title));
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
  state.pausedAt = null;
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

// Spela igen med samma spelare. Spelade låtar räknas fortfarande som spelade.
export function restart(state) {
  for (const player of Object.values(state.players)) player.score = 0;
  if (state.benchedHost) state.benchedHost.score = 0;
  state.winners = null;
  state.round = null;
  state.roundNumber = 0;
  state.pausedAt = null;
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
    categoryId: state.categoryId || '',
    categoryName: state.categoryName || '',
    standings: standings(state),
    answered: round ? Object.keys(state.players).filter((id) => hasAnsweredBoth(state, id)) : [],
    winScore: state.winScore || WIN_SCORE,
    settings: { roundMs: state.roundMs, bonusMs: state.bonusMs, winScore: state.winScore || WIN_SCORE },
    winners: state.winners ? state.winners.map((id) => state.players[id].name) : null,
    paused: Boolean(state.pausedAt),
    // Låtens egna fältnamn syns redan medan man gissar, så att man vet att det är en film.
    labels: songLabels(round && round.song, state.labels || DEFAULT_LABELS),
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

// Inställningarna som gäller från nästa låt, om spelledaren har ändrat dem under en låt.
export function upcomingSettings(view) {
  return view && view.upcoming ? { ...view, ...view.upcoming } : view;
}

// Det spelarna ska få veta när spelledaren har ändrat inställningarna eller kategorin under
// spelet, som en rad text. null om inget som syns för spelarna har ändrats.
export function settingsChangeText(before, after) {
  if (!before || !after || !before.settings || !after.settings) return null;
  const parts = [];
  if (after.categoryName && after.categoryName !== before.categoryName) parts.push(`Ny kategori: ${after.categoryName}.`);
  const { roundMs, bonusMs } = after.settings;
  if (roundMs !== before.settings.roundMs) parts.push(`${roundMs / 1000} sekunder per låt.`);
  if (bonusMs !== before.settings.bonusMs) parts.push(bonusMs ? `Bonus för svar inom ${bonusMs / 1000} sekunder.` : 'Ingen bonus.');
  if (after.settings.winScore !== before.settings.winScore) parts.push(`Först till ${after.settings.winScore} poäng vinner.`);
  return parts.length ? parts.join(' ') : null;
}

// Rutan när nya spelare har gått med: rubriken Välkommen, Anna! eller Välkomna! och till exempel "Anna och Bo har gått med i spelet."
export function joinedMessage(names) {
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}` : names[0];
  return { title: names.length > 1 ? 'Välkomna!' : `Välkommen, ${names[0]}!`, text: `${list} har gått med i spelet.` };
}
