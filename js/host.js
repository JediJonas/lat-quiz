// Spelledarvyn. Håller hela spelläget och skickar det till spelarna.
import * as game from './game.js';
import { createHost, peerQuery } from './net.js';
import { loadCategories, loadSongs, visibleCategories } from './data.js';
import { showConfirm } from './dialog.js';
import { INFO_MS, currentMessage, hideMessage, showJoined, showLeft, showMessage, showUnexpectedErrors } from './meddelande.js';
import { createGameView } from './spelvy.js';
import { $ } from './shared/dom.js';
import { newCode, newId } from './shared/ids.js';
import { KEYS, readJson, remove, writeJson } from './shared/storage.js';
import * as prefs from './shared/preferences.js';
import * as protocol from './shared/protocol.js';
import { scrollToTop } from './ui.js';
import { showNowMusic } from './nuspelas.js';
import { ICONS as MENU_ICONS, commonItems, mountMenu, startItems } from './meny.js';
import { delayShort } from './ljudfordrojning.js';
import { isUnknown, toggleUnknown, withoutUnknown } from './okanda.js';
import { mountSeasonEffect } from './sasong.js';
import { showSettings } from './settings-dialog.js';
import { createQuizClip } from './quiz-clip.js';
import { createSoundDirector } from './sound-director.js';
import { copyJoinLink, joinInfoShown, renderJoinInfo } from './join-info.js';
import { chosenCategory, mountCategoryPicker, renderCategories } from './category-picker.js';

// Oväntade fel visas i meddelanderutan i stället för att sidan bara stannar.
showUnexpectedErrors();
mountSeasonEffect();

// Ett sparat spel går att gå tillbaka till i tolv timmar.
const SAVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

let state = null;
let songs = [];
let category = null;
let net = null;
const connToPlayer = new Map();
let ticker = null;
// Spelledaren spelar med och gissar i samma vy som spelarna, om spelledaren inte har valt att bara leda spelet.
let gameView = null;
// Strömbrytaren Jag deltar i spelet i Inställningar, innan spelet startar. Spelledaren deltar om inget annat väljs.
let hostPlays = true;

// Inget sparas när spelet har avslutats. Annars sparas det igen när anslutningarna stängs,
// och knappen för att gå tillbaka till spelet finns kvar.
function save() {
  if (leaving) return;
  writeJson(KEYS.hostGame, { state, savedAt: Date.now() });
}

function loadSaved() {
  const saved = readJson(KEYS.hostGame, null);
  if (!saved || Date.now() - saved.savedAt > SAVE_MAX_AGE_MS) return null;
  return saved.state;
}

// Väntemusiken, trumvirveln, vinnarlåten och raden Nu spelas, se sound-director.js.
const sound = createSoundDirector({
  state: () => state,
  categoryId: () => category && category.id,
  leaving: () => leaving,
  // Raden längst ner visar låten, både här och i mobilerna, som får veta när klippet börjar.
  changed: () => { showNowMusic($('#now-music'), sound.currentMusic()); broadcast(); },
});

// När spelledaren startar spelet visas "Nu börjar det!" innan första låten, lika länge som
// nedräkningen mellan låtarna (AUTO_NEXT_MS). Klippet laddas under tiden och spelas när tiden är slut.
const INTRO_MS = 10000;
let introEnds = 0;
let introTimer = null;
const introLeft = () => Math.max(0, introEnds - Date.now());
const introDone = () => new Promise((resolve) => setTimeout(resolve, introLeft()));

function startIntro() {
  introEnds = Date.now() + INTRO_MS;
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { render(); broadcast(); }, INTRO_MS);
}

// Avdelningen Okända låtar i Inställningar syns bara med ?okanda=1, se preferences.js.
const showUnknown = prefs.showUnknown(location.search);

function joinUrl() {
  const url = new URL('play.html', location.href);
  url.search = peerQuery();
  url.searchParams.set('kod', state.code);
  return url.toString();
}

// ---- Kommunikation ----

function sendState(connId) {
  const playerId = connToPlayer.get(connId);
  if (!playerId) return;
  net.send(connId, protocol.state(viewFor(playerId)));
}

// Spelvyn för en spelare, med tiden kvar tills nästa låt startar av sig själv.
function viewFor(playerId) {
  const view = game.playerView(state, playerId, Date.now());
  const left = autoNextLeft();
  if (view.round && left !== null) Object.assign(view.round, { nextInMs: left, nextTotalMs: AUTO_NEXT_MS });
  // Vinnarlåten är ett Deezer-klipp. Då står Deezer på vinnarkortet.
  view.winnerClip = prefs.extraSounds();
  // Spelarna vänder fram vinnaren när spelledaren gör det, det vill säga när vinnarlåten hörs.
  view.winnerDrum = Boolean(gameView && gameView.winnerDrum());
  view.winnerShown = Boolean(gameView && gameView.winnerShown());
  view.lobbyPlaying = sound.lobbyWanted();
  if (introLeft() > 0) Object.assign(view, { introMs: introLeft(), introTotalMs: INTRO_MS });
  const url = quizClip.urlForPlayers();
  if (url) view.clipUrl = url;
  const music = sound.forPlayers();
  if (music) view.music = music;
  // Låten står på raden längst ner även i mobilerna, också när den bara spelas hos spelledaren.
  const playing = sound.currentMusic();
  if (playing) view.nowMusic = playing;
  // Ändringar under en låt syns för spelarna direkt, fast de gäller först från nästa låt.
  if (pending) {
    view.upcoming = {
      categoryName: pending.category ? pending.category.name : view.categoryName,
      settings: { ...view.settings, ...pending.settings },
    };
  }
  return view;
}

function broadcast() {
  for (const connId of connToPlayer.keys()) sendState(connId);
}

// Ändringar som görs medan spelet pågår. De gäller när nästa låt startar, eller direkt om
// ingen låt har spelats än.
let pending = null;

function changed() {
  if (pending && !state.round) applyPending();
  save();
  broadcast();
  render();
}

// Meddelanden från spelarna kontrolleras och städas i protocol.js först.
function onMessage(connId, raw) {
  const msg = protocol.fromPlayer(raw);
  if (!msg) return;
  if (msg.type === protocol.MSG.hello) {
    const { name, playerId } = msg;
    if (game.nameTaken(state, { id: playerId, name })) {
      net.send(connId, protocol.nameTaken(name));
      return;
    }
    // Samma spelare på en ny anslutning: släpp den gamla.
    for (const [otherConn, otherId] of connToPlayer) {
      if (otherId === playerId && otherConn !== connId) {
        connToPlayer.delete(otherConn);
        net.drop(otherConn);
      }
    }
    connToPlayer.set(connId, playerId);
    const isNew = !state.players[playerId];
    game.addPlayer(state, { id: playerId, name });
    changed();
    // Alla utom den nya spelaren får veta det. Den som ansluter igen är inte ny.
    if (isNew) {
      showJoined(name);
      for (const otherConn of connToPlayer.keys()) {
        if (otherConn !== connId) net.send(otherConn, protocol.joined(name));
      }
    }
  } else if (msg.type === protocol.MSG.answer) {
    const playerId = connToPlayer.get(connId);
    if (!playerId) return;
    game.submitAnswer(state, playerId, msg.field, msg.value, Date.now());
    changed();
  } else if (msg.type === protocol.MSG.leave) {
    // Spelaren valde Lämna spelet. Den räknas som frånkopplad och får tillbaka poängen om den går med igen.
    const playerId = connToPlayer.get(connId);
    if (!playerId || !state.players[playerId]) return;
    const { name } = state.players[playerId];
    net.drop(connId);
    showLeft(name);
    for (const otherConn of connToPlayer.keys()) net.send(otherConn, protocol.left(name));
  }
}

function onDisconnect(connId) {
  const playerId = connToPlayer.get(connId);
  connToPlayer.delete(connId);
  if (!playerId || [...connToPlayer.values()].includes(playerId)) return;
  game.setConnected(state, playerId, false);
  changed();
}

// Kontakten med förmedlingsservern bryts oftast när spelledaren har lämnat webbläsaren, till
// exempel för en annan app i mobilen. Meddelandet är därför allmänt, som hos spelarna.
const NET_MESSAGES = {
  relay: { kind: 'busy', title: 'Anslutningen bröts', text: 'Försöker ansluta igen…' },
  'unavailable-id': { kind: 'busy', title: 'Väntar på koden…', text: 'Spelet startar strax.' },
  network: { kind: 'busy', title: 'Ingen anslutning', text: 'Försöker ansluta igen…' },
};
let netTrouble = false;

function startNetwork() {
  net = createHost(state.code, {
    onReady: () => {
      if (netTrouble) showMessage({ key: 'net', kind: 'ok', title: 'Välkommen tillbaka!', text: 'Du är med i spelet igen.' });
      netTrouble = false;
    },
    onMessage,
    onDisconnect,
    onError: (type) => {
      netTrouble = true;
      showMessage({ key: 'net', ...(NET_MESSAGES[type] || { kind: 'problem', title: 'Anslutningsfel', text: type }) });
    },
  });
  ticker = startTicker(tick, 250);
}

// Webbläsare bromsar timers i flikar som inte syns, till exempel när spelledaren
// har bytt till en annan flik, ibland till en gång i minuten. En timer i en worker
// bromsas inte lika hårt, så svaret visas i tid ändå.
function startTicker(fn, ms) {
  try {
    const code = `setInterval(() => postMessage(0), ${ms});`;
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.onmessage = fn;
    return { stop: () => worker.terminate() };
  } catch {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}

function tick() {
  checkAutoNext();
  if (!state.round || state.round.phase !== 'playing') return;
  if (game.shouldReveal(state, Date.now())) {
    // Klippet är längre än tiden per låt när spelledaren har valt en kortare tid.
    quizClip.stop();
    game.reveal(state);
    changed();
  }
}

// Spelledarens eget svar, som om det kom från en spelare.
function hostAnswer(field, value) {
  if (!state) return;
  game.submitAnswer(state, state.hostId, field, protocol.cleanAnswer(value), Date.now());
  changed();
}

// ---- Spelets steg ----

function hostNameTaken(name) {
  return game.nameTaken(state, { id: state.hostId, name: game.cleanHostName(name) });
}

// Utan att delta behövs inget namn på startsidan, och spelledaren kan varken svara eller få poäng.
function setHostPlays(plays) {
  hostPlays = plays;
  $('#host-name-row').hidden = !plays;
  $('#host-name').required = plays;
  renderSettingsSummary();
}

// Raden Inställningar på Starta nytt spel visar vad som gäller. Ändra öppnar samma ruta som i menyn.
function renderSettingsSummary() {
  const s = prefs.lastSettings();
  // Samma ordning som i rutan Inställningar.
  const parts = [`${s.roundMs / 1000} s per låt`, s.bonusMs ? `Bonus inom ${s.bonusMs / 1000} s` : 'Ingen bonus', `Först till ${s.winScore} poäng`,
    ...(prefs.clipAll() ? ['Ljud på alla enheter'] : []), ...(prefs.extraSounds() ? [] : ['Inga extraljud']),
    ...(prefs.audioDelay() ? [`Ljudsynk ${delayShort(prefs.audioDelay())}`] : []),
    ...(hostPlays ? [] : ['Jag deltar inte'])];
  // Raden bryts bara mellan delarna, inte mitt i till exempel Bonus inom 15 sekunder.
  $('#settings-text').textContent = parts.map((p) => p.replaceAll(' ', '\u00a0')).join(' · ');
}

async function startGame(categoryId, resumeState, name, plays = true) {
  await scriptsLoaded;
  const categories = await loadCategories();
  category = categories.find((c) => c.id === categoryId) || visibleCategories(categories)[0];
  songs = await loadSongs(category);
  if (resumeState) {
    state = resumeState;
    // Alla räknas som frånkopplade tills de hör av sig igen.
    for (const player of Object.values(state.players)) player.connected = false;
  } else {
    state = game.createGame({
      code: newCode(), categoryId: category.id, categoryName: category.name, labels: category.labels,
      settings: prefs.lastSettings(),
    });
    state.hostPlays = plays;
    state.clipAll = prefs.clipAll();
  }
  // Ett äldre sparat spel kan ha valt Spotify, som inte finns längre.
  delete state.music;
  state.clipAll = state.clipAll === true;
  // Spelledaren är en spelare som alltid är ansluten, om spelledaren deltar. Ett äldre sparat spel får spelledaren nu.
  if (!state.hostId) state.hostId = newId('spelledare-');
  game.setHostPlaying(state, state.hostPlays !== false,
    game.cleanHostName(name || state.players[state.hostId]?.name || prefs.hostName()));
  // Även ett återupptaget spel från innan namnet sparades ska visa kategorin.
  state.categoryName = category.name;
  save();
  $('#setup').hidden = true;
  $('#game').hidden = false;
  // Går spelledaren tillbaka till ett spel har spelarna redan gått med, så QR-koden är stängd.
  showJoinInfo({ qrOpen: !resumeState });
  gameView = createGameView({ onAnswer: hostAnswer, onError: showError, onWinnerDrum: sound.winnerDrum, onWinnerDrumShown: winnerShown, onWinnerShown: winnerShown, host: true });
  startNetwork();
  render();
}

// Bara låtar med Deezer-ID kan spelas, och inte de som är markerade som okända.
function playableSongs() {
  return withoutUnknown(prefs.unknownSongs(), category.id, songs).filter((song) => song.deezerId);
}

function nextSong() {
  if (state.round && state.round.phase === 'playing') return;
  // Sparade inställningar gäller från och med den här låten. Inget väntas in här, eftersom
  // quizClip.play måste anropas direkt från trycket på Starta spelet.
  if (pending && (!state.round || state.round.phase === 'revealed')) applyPending();
  // Spelade låtar gäller bara det här spelet. Tar de slut börjar listan om.
  const playable = playableSongs();
  if (game.unplayedSongs(state, playable).length === 0) state.playedIds = [];
  const song = game.nextSong(state, playable);
  if (!song) return;
  changed();
  quizClip.play(state.round.number);
}

// ---- Quizklippet ----

const quizClip = createQuizClip({
  state: () => state,
  playableSongs,
  ready: async () => { await sound.lobbyMusic.silent(); await introDone(); },
  otherMusic: [sound.winnerSong, sound.lobbyMusic],
  render: () => render(),
  save: () => save(),
  broadcast: () => broadcast(),
  started: () => changed(),
});

// Meddelandet visas när klippets läge ändras, inte vid varje render, så att det inte tar över
// ett nyare meddelande om anslutningen.
let clipShown = null;
function updateClipMessage(round) {
  const msg = quizClip.message(round);
  const id = msg ? msg.title : null;
  if (id === clipShown) return;
  clipShown = id;
  if (msg) showMessage({ key: 'clip', ...msg });
  else hideMessage('clip');
}

// Strömbrytaren Denna låt är okänd i Inställningar.
function currentUnknown() {
  const song = state.round && state.round.song;
  return Boolean(song) && isUnknown(prefs.unknownSongs(), category.id, song.id);
}

function toggleCurrentUnknown() {
  const song = state.round && state.round.song;
  if (song) prefs.setUnknownSongs(toggleUnknown(prefs.unknownSongs(), category.id, song));
}

// Spelarna får veta att en ny match har börjat. Spelledaren har själv valt det.
function restart() {
  quizClip.stop();
  // Vinnarlåten tystnar när en ny match börjar, och bara då. Pausas ljud vid varje omritning
  // kan quizlåten hacka till i iPhone när spelledaren trycker, se stop i vinnarlat.js.
  sound.winnerSong.stop();
  game.restart(state);
  changed();
  for (const connId of connToPlayer.keys()) net.send(connId, protocol.newMatch());
}

// Pausen stoppar timern, klippet och nedräkningen till nästa låt.
function pauseGame() {
  if (!game.pause(state, Date.now())) return;
  quizClip.stop();
  changed();
}

function resumeGame() {
  if (!state.pausedAt) return;
  autoNext.at += game.resume(state, Date.now());
  quizClip.resume();
  changed();
}

async function endGame() {
  const ok = await showConfirm('Poängen försvinner och spelarna kopplas bort.', {
    title: 'Avsluta spelet?', okText: 'Avsluta', danger: true, icon: MENU_ICONS.leave,
  });
  if (!ok) return;
  leaving = true;
  remove(KEYS.hostGame);
  quizClip.stop();
  sound.winnerSong.stop();
  sound.lobbyMusic.stop();
  // Spelarna får veta att spelet är slut, så att de inte tror att anslutningen bara bröts.
  // En kort stund behövs för att meddelandet ska hinna fram innan anslutningarna stängs.
  if (net) {
    for (const connId of connToPlayer.keys()) net.send(connId, protocol.ended());
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    net.destroy();
  }
  if (ticker) ticker.stop();
  // Tillbaka till startsidan, med eventuella testparametrar.
  location.href = 'index.html' + location.search;
}

// Strömbrytaren Jag deltar i spelet står i Inställningar, både före och under spelet.
function currentHost() {
  if (!state) return { plays: hostPlays };
  if (pending && pending.host) return pending.host;
  return { plays: state.hostPlays !== false };
}

// Namnet som spelledaren redan har angett, i spelet eller i ett tidigare spel. Spelledare räknas inte.
function knownHostName() {
  const player = state && (state.players[state.hostId] || state.benchedHost);
  if (player && player.name && player.name !== game.DEFAULT_HOST_NAME) return player.name;
  if (pending && pending.host && pending.host.name !== game.DEFAULT_HOST_NAME) return pending.host.name;
  return prefs.hostName();
}

// Under spelet sparas ändringarna och gäller från nästa låt.
async function editSettings() {
  const all = await loadCategories();
  const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
  const current = pending ? pending.settings : state ? game.cleanSettings(state) : prefs.lastSettings();
  const currentCategory = pending && pending.category ? pending.category.id : category && category.id;
  const categories = state ? visibleCategories(all, { keep: currentCategory }) : null;
  const clipAll = pending ? pending.clipAll : state ? state.clipAll : prefs.clipAll();
  const knownName = knownHostName();
  const chosen = await showSettings(current, {
    categories, categoryId: currentCategory, names, clipAll, extraSounds: prefs.extraSounds(), audioDelay: prefs.audioDelay(),
    host: { plays: currentHost().plays, knownName, askName: Boolean(state) && !knownName, isTaken: hostNameTaken },
    unknown: {
      show: showUnknown,
      songPlaying: Boolean(state && state.round && state.round.song),
      isCurrent: currentUnknown,
      toggleCurrent: toggleCurrentUnknown,
    },
  });
  if (!chosen) return;
  const { categoryId, host, clipAll: chosenClipAll, extraSounds: chosenExtraSounds, audioDelay, ...settings } = chosen;
  // Ljudfördröjningen gäller enheten, från nästa gång ett ljud börjar.
  prefs.setAudioDelay(audioDelay);
  // Extraljuden gäller enheten direkt. Vinnarlåten tystnar om de stängs av, och väntemusiken
  // börjar eller tystnar direkt medan spelarna går med.
  prefs.setExtraSounds(chosenExtraSounds);
  if (!chosenExtraSounds) sound.winnerSong.stop();
  prefs.setLastSettings(settings);
  prefs.setClipAll(chosenClipAll);
  if (!state) {
    setHostPlays(host.plays);
    return;
  }
  if (host.plays && host.name !== game.DEFAULT_HOST_NAME) prefs.setHostName(host.name);
  const picked = categoryId && categoryId !== category.id ? categories.find((c) => c.id === categoryId) : null;
  // Låtarna laddas redan nu, så att kategorin kan bytas utan väntan när nästa låt startar.
  const pickedSongs = picked ? await loadSongs(picked) : null;
  pending = { settings, category: picked, songs: pickedSongs, host, clipAll: chosenClipAll };
  // Har ingen låt spelats än gäller ändringen direkt. Det avgör changed().
  changed();
  // Gäller ändringen först från nästa låt får spelledaren veta det, men bara om något ändrades.
  // Ett fel eller något som pågår får stå kvar.
  const shown = currentMessage();
  if (shown && (shown.kind === 'problem' || shown.kind === 'busy')) return;
  if (pending && pendingDiffers()) {
    showMessage({ key: 'settings', kind: 'info', title: 'Spelet ändrades', text: 'Ändringarna gäller från nästa låt.', ms: INFO_MS });
  }
}


// Skiljer sig de sparade ändringarna från det som gäller nu?
function pendingDiffers() {
  const { settings, category: picked, host, clipAll } = pending;
  const now = game.cleanSettings(state);
  if (Object.keys(now).some((key) => now[key] !== settings[key])) return true;
  if (picked || clipAll !== state.clipAll) return true;
  if (!host) return false;
  if (host.plays !== (state.hostPlays !== false)) return true;
  const me = state.players[state.hostId];
  return Boolean(host.plays && me && me.name !== host.name);
}

function applyPending() {
  const { settings, category: picked, songs: pickedSongs, host, clipAll } = pending;
  pending = null;
  game.applySettings(state, settings);
  state.clipAll = clipAll;
  // En spelare kan ha tagit namnet medan låten pågick. Då heter spelledaren Spelledare.
  if (host) game.setHostPlaying(state, host.plays, hostNameTaken(host.name) ? game.DEFAULT_HOST_NAME : host.name);
  // Poängen och spelade låtar finns kvar.
  if (picked && game.changeCategory(state, { categoryId: picked.id, categoryName: picked.name, labels: picked.labels })) {
    quizClip.stop();
    category = picked;
    songs = pickedSongs;
  }
}

// ---- Visning ----

function showJoinInfo({ qrOpen = true } = {}) {
  $('#code').textContent = state.code;
  setQrVisible(qrOpen);
  renderJoinInfo(joinUrl());
}

$('#copy-link').addEventListener('click', () => copyJoinLink(joinUrl()));

// QR-koden kan stängas när alla har gått med. Den visas alltid i ett nytt spel, men inte när
// spelledaren går tillbaka till ett spel.
function setQrVisible(visible) {
  $('#join-info').hidden = !visible;
  $('#game').classList.toggle('qr-hidden', !visible);
}

// QR-koden visas överst, och sidan rullar upp så att den syns.
function showQr() {
  setQrVisible(true);
  scrollToTop();
}

// Pausa spelet och Starta spelet delar rad i menyn. Raden finns från första låten tills någon har
// vunnit. Starta spelet fortsätter efter en paus, eller försöker igen när klippet inte startade.
// Medan spelarna går med står Starta spelet här, som knappen i vyn.
function pauseItem() {
  const round = state.round;
  if (!round && !state.winners) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: startClicked }];
  if (!round || state.winners) return [];
  if (state.pausedAt) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: resumeGame }];
  if (quizClip.stuck(round)) return [{ label: 'Starta spelet', icon: MENU_ICONS.play, action: quizClip.retry }];
  return [{ label: 'Pausa spelet', icon: MENU_ICONS.pause, action: pauseGame }];
}

// I spelet finns Pausa spelet, QR-koden, inställningarna och Avsluta spelet i menyn. Före spelet
// samma rader som på startsidan.
function menuGroups() {
  const settings = { label: 'Inställningar', icon: MENU_ICONS.settings, action: editSettings };
  if (!state) return [startItems(), [settings], commonItems()];
  return [
    [...pauseItem(), { label: 'Visa QR-kod', icon: MENU_ICONS.qr, action: showQr, disabled: joinInfoShown() }, settings],
    commonItems(),
    [{ label: 'Avsluta spelet', icon: MENU_ICONS.leave, action: endGame }],
  ];
}

// Nästa låt startar av sig själv en stund efter att svaret visats.
const AUTO_NEXT_MS = 10000;
let autoNext = { round: 0, at: 0 };

function autoNextLeft() {
  const round = state.round;
  if (!round || round.phase !== 'revealed' || state.winners) return null;
  if (autoNext.round !== round.number) autoNext = { round: round.number, at: Date.now() + AUTO_NEXT_MS };
  // Under en paus står nedräkningen still.
  return Math.max(0, autoNext.at - (state.pausedAt || Date.now()));
}

// Anropas av tickern. Nästa låt startar även om en ruta som Inställningar är öppen, eftersom
// spelarna ser nedräkningen. Ändringar i rutan gäller då från låten efter.
function checkAutoNext() {
  const left = autoNextLeft();
  if (left === null || state.pausedAt) return;
  if (left > 0) return;
  nextSong();
}

// Starta spelet i vyn startar första låten. QR-koden behövs inte längre när spelet har startat.
// Den kan visas igen i menyn.
function startClicked() {
  if (!state || state.round) return;
  setQrVisible(false);
  startIntro();
  nextSong();
  // Spelledaren kan ha scrollat ner till knappen i rutan. Låten ska synas överst.
  scrollToTop();
}


// "Vi har en vinnare!" eller vinnarvyn har tagit över, så att Spela igen visas när vinnaren
// gör det. Spelarna får veta det direkt.
function winnerShown() {
  render();
  broadcast();
}

// Samma vy som spelarna ser, med Starta spelet och Spela igen för spelledaren.
function render() {
  $('#category').textContent = category.name;
  $('#lobby-note').hidden = !sound.updateLobby();
  showNowMusic($('#now-music'), sound.currentMusic());
  gameView.update(viewFor(state.hostId), state.hostId);
  const round = state.round;
  $('#start-game').hidden = Boolean(round);
  // Spela igen går att starta först när vinnarvyn har tagit över efter sista låten.
  $('#new-match').hidden = !(state.winners && gameView.winnerShown());
  updateClipMessage(round);
  // Första låten kan starta medan Inställningar är öppen. Denna låt är okänd gäller då den låt
  // som spelas nu.
  const mark = document.querySelector('dialog[open] #mark-unknown');
  if (mark) mark.setAttribute('aria-checked', String(currentUnknown()));
}

function showError(err) {
  showMessage({ key: 'error', kind: 'problem', title: 'Något gick fel', text: err.message });
}

// ---- Start ----

// Vinnarlåten spelas utan tryck när vinnaren visas. Ljudmotorn får det bara om den har startats
// av ett tryck tidigare, så varje tryck hos spelledaren startar den.
// iPhone räknar ibland bara touchend och click som tryck, så alla fyra lyssnas på.
// Medan låten spelas görs det inte. Då är spelledarens tryck och tangenter nästan bara svar i
// fälten, och ljudmotorn och ljudläget som startades om vid varje tryck kunde få klippet att
// hacka till på iPhone. Trycken mellan låtarna räcker för att hålla ljudet upplåst.
function unlockSound() {
  if (quizClip.sounding()) return;
  quizClip.unlock(sound.lobbyMusic.playing());
  sound.unlock();
}

for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(type, unlockSound, true);

document.addEventListener('click', (e) => {
  const id = e.target.closest('[id]')?.id;
  // Knapparna i vyn försvinner när de har tryckts, så fokus flyttas vidare. Spelvyn rullar upp
  // till väntetexten och Starta spelet efter Spela igen, både hos spelledaren och spelarna.
  if (id === 'start-game') { startClicked(); $('#game .menu-button').focus({ preventScroll: true }); }
  else if (id === 'new-match') { restart(); $('#start-game').focus({ preventScroll: true }); }
  else if (id === 'settings') editSettings();
  else if (id === 'hide-qr') setQrVisible(false);
});

// Safari på iPhone visar bara :active-läget när sidan lyssnar på touchstart.
document.addEventListener('touchstart', () => {}, { passive: true });

// Enter trycker på vyns huvudknapp, så att spelledaren slipper musen.
const ENTER_TARGETS = ['#create', '#start-game', '#new-match'];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (document.querySelector('dialog[open]')) return; // modalen sköter sig själv
  if (e.target.closest('button, a, input, textarea')) return; // fokuserade knappar och länkar trycks redan
  const target = ENTER_TARGETS.map((sel) => $(sel)).find((el) => el && el.offsetParent && !el.disabled);
  if (!target) return;
  e.preventDefault();
  target.click();
});

// Varnar om fliken stängs av misstag mitt i ett spel, men inte när
// spelledaren själv har avslutat det.
let leaving = false;

// Fliken stängs eller sidan laddas om. Spelet kan återupptas, så spelarna får veta att
// spelledaren har lämnat och kanske kommer tillbaka. Meddelandet hinner inte alltid fram.
window.addEventListener('pagehide', () => {
  if (leaving || !net) return;
  for (const connId of connToPlayer.keys()) net.send(connId, protocol.leaving());
});

window.addEventListener('beforeunload', (e) => {
  if (leaving) return;
  if (state) e.preventDefault();
});

// Kategorierna står redan i host.html, så att sidan inte blinkar till.
// Här uppdateras de från listan och det val som redan är gjort behålls. Säsongskategorier,
// som Halloween, står inte i host.html och kommer bara med när det är säsong för dem.
// PeerJS och QR-koden laddas efter den här modulen, så att startsidan visas utan
// att vänta på dem. Ett snabbt klick väntar in dem innan spelet startar.
const scriptsLoaded = new Promise((resolve) => {
  if (document.readyState === 'complete') resolve();
  else document.addEventListener('DOMContentLoaded', resolve, { once: true });
});

async function init() {
  mountMenu($('#setup'), menuGroups);
  mountMenu($('#game'), menuGroups);
  renderSettingsSummary();
  $('#host-name').value = prefs.hostName();
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#host-name').value.trim().slice(0, game.MAX_NAME);
    if (hostPlays && !name) return;
    if (hostPlays) prefs.setHostName(name);
    startGame(chosenCategory(), null, hostPlays ? name : '', hostPlays);
  });
  mountCategoryPicker();
  const saved = loadSaved();
  if (saved) {
    const resume = $('#resume');
    resume.hidden = false;
    resume.querySelector('button').textContent = `Tillbaka till ${saved.code}`;
    resume.querySelector('button').addEventListener('click', () => startGame(saved.categoryId, saved));
  }
  renderCategories(visibleCategories(await loadCategories()));
}

init().catch(showError);
