// @ts-check
// Inställningar hos spelledaren: raden Inställningar på Starta nytt spel, rutan Inställningar
// och ändringarna som görs medan spelet pågår. De gäller när nästa låt startar, eller direkt om
// ingen låt har spelats än. Spelläget och kategorin ägs av host.js.
import * as game from './game.js';
import { t } from './shared/lang.js';
import { loadCategories, loadSongs, visibleCategories } from './data.js';
import { INFO_MS, currentMessage, showMessage } from './meddelande.js';
import { delayShort } from './ljudfordrojning.js';
import { isUnknown, toggleUnknown } from './okanda.js';
import { showSettings } from './settings-dialog.js';
import { $ } from './shared/dom.js';
import * as prefs from './shared/preferences.js';

/**
 * Raden Inställningar på Starta nytt spel, i samma ordning som i rutan Inställningar.
 * @param {any} s roundMs, bonusMs och winScore
 * @param {{ clipAll: boolean, extraSounds: boolean, audioDelay: number, hostPlays: boolean }} device
 */
export function summaryParts(s, { clipAll, extraSounds, audioDelay, hostPlays }) {
  return [t('rules.roundTime', { s: s.roundMs / 1000 }), s.bonusMs ? t('rules.bonus', { s: s.bonusMs / 1000 }) : t('settings.bonusMs.none'),
    t('summary.winScore', { score: s.winScore }),
    ...(clipAll ? [t('summary.clipAll')] : []), ...(extraSounds ? [] : [t('summary.noExtraSounds')]),
    ...(audioDelay ? [t('summary.audioDelay', { delay: delayShort(audioDelay) })] : []),
    ...(hostPlays ? [] : [t('summary.hostNotPlaying')])];
}

/**
 * Skiljer sig de sparade ändringarna från det som gäller nu?
 * @param {any} pending settings, category, host och clipAll
 * @param {any} state
 */
export function pendingDiffers({ settings, category, host, clipAll }, state) {
  const now = game.cleanSettings(state);
  if (Object.keys(now).some((key) => now[key] !== settings[key])) return true;
  if (category || clipAll !== state.clipAll) return true;
  if (!host) return false;
  if (host.plays !== (state.hostPlays !== false)) return true;
  const me = state.players[state.hostId];
  return Boolean(host.plays && me && me.name !== host.name);
}

/**
 * @param {{
 *   state: () => any,
 *   category: () => any,
 *   categoryChanged: (category: any, songs: any[]) => void,
 *   stopClip: () => void,
 *   stopWinnerSong: () => void,
 *   changed: () => void,
 *   showUnknown: boolean,
 * }} options
 * state och category: spelläget och kategorin som spelas. categoryChanged: en annan kategori
 * gäller från och med nu. changed: spelläget har ändrats. showUnknown: ?okanda=1.
 */
export function createHostSettings({ state, category, categoryChanged, stopClip, stopWinnerSong, changed, showUnknown }) {
  let pending = null;
  // Strömbrytaren Jag deltar i spelet, innan spelet startar. Spelledaren deltar om inget annat väljs.
  let hostPlays = true;

  function hostNameTaken(name) {
    const s = state();
    return game.nameTaken(s, { id: s.hostId, name: game.cleanHostName(name) });
  }

  // Raden Inställningar på Starta nytt spel visar vad som gäller. Ändra öppnar samma ruta som i menyn.
  function renderSummary() {
    const parts = summaryParts(prefs.lastSettings(),
      { clipAll: prefs.clipAll(), extraSounds: prefs.extraSounds(), audioDelay: prefs.audioDelay(), hostPlays });
    // Raden bryts bara mellan delarna, inte mitt i till exempel Bonus inom 15 sekunder.
    $('#settings-text').textContent = parts.map((p) => p.replaceAll(' ', ' ')).join(' · ');
  }

  // Utan att delta behövs inget namn på startsidan, och spelledaren kan varken svara eller få poäng.
  function setHostPlays(plays) {
    hostPlays = plays;
    $('#host-name-row').hidden = !plays;
    $('#host-name').required = plays;
    renderSummary();
  }

  // Strömbrytaren Denna låt är okänd i Inställningar.
  function currentUnknown() {
    const s = state();
    const song = s && s.round && s.round.song;
    return Boolean(song) && isUnknown(prefs.unknownSongs(), category().id, song.id);
  }

  function toggleCurrentUnknown() {
    const s = state();
    const song = s && s.round && s.round.song;
    if (song) prefs.setUnknownSongs(toggleUnknown(prefs.unknownSongs(), category().id, song));
  }

  // Strömbrytaren Jag deltar i spelet står i Inställningar, både före och under spelet.
  function currentHost() {
    const s = state();
    if (!s) return { plays: hostPlays };
    if (pending && pending.host) return pending.host;
    return { plays: s.hostPlays !== false };
  }

  // Namnet som spelledaren redan har angett, i spelet eller i ett tidigare spel. Spelledare räknas inte.
  function knownHostName() {
    const s = state();
    const player = s && (s.players[s.hostId] || s.benchedHost);
    if (player && player.name && player.name !== game.DEFAULT_HOST_NAME) return player.name;
    if (pending && pending.host && pending.host.name !== game.DEFAULT_HOST_NAME) return pending.host.name;
    return prefs.hostName();
  }

  // Under spelet sparas ändringarna och gäller från nästa låt.
  async function edit() {
    const s = state();
    const all = await loadCategories();
    const names = Object.fromEntries(all.map((c) => [c.id, c.name]));
    const current = pending ? pending.settings : s ? game.cleanSettings(s) : prefs.lastSettings();
    const currentCategory = pending && pending.category ? pending.category.id : category() && category().id;
    const categories = s ? visibleCategories(all, { keep: currentCategory }) : null;
    const clipAll = pending ? pending.clipAll : s ? s.clipAll : prefs.clipAll();
    const knownName = knownHostName();
    const chosen = await showSettings(current, {
      categories, categoryId: currentCategory, names, clipAll, extraSounds: prefs.extraSounds(), audioDelay: prefs.audioDelay(),
      host: { plays: currentHost().plays, knownName, askName: Boolean(s) && !knownName, isTaken: hostNameTaken },
      unknown: {
        show: showUnknown,
        songPlaying: Boolean(s && s.round && s.round.song),
        isCurrent: currentUnknown,
        toggleCurrent: toggleCurrentUnknown,
      },
    });
    if (!chosen) return;
    // Spelet kan ha startat medan rutan var öppen.
    const now = state();
    const { categoryId, host, clipAll: chosenClipAll, extraSounds: chosenExtraSounds, audioDelay, ...settings } = chosen;
    // Ljudfördröjningen gäller enheten, från nästa gång ett ljud börjar.
    prefs.setAudioDelay(audioDelay);
    // Extraljuden gäller enheten direkt. Vinnarlåten tystnar om de stängs av, och väntemusiken
    // börjar eller tystnar direkt medan spelarna går med.
    prefs.setExtraSounds(chosenExtraSounds);
    if (!chosenExtraSounds) stopWinnerSong();
    prefs.setLastSettings(settings);
    prefs.setClipAll(chosenClipAll);
    if (!now) {
      setHostPlays(host.plays);
      return;
    }
    if (host.plays && host.name !== game.DEFAULT_HOST_NAME) prefs.setHostName(host.name);
    const picked = categoryId && categoryId !== category().id ? categories.find((c) => c.id === categoryId) : null;
    // Låtarna laddas redan nu, så att kategorin kan bytas utan väntan när nästa låt startar.
    const pickedSongs = picked ? await loadSongs(picked) : null;
    pending = { settings, category: picked, songs: pickedSongs, host, clipAll: chosenClipAll };
    // Har ingen låt spelats än gäller ändringen direkt. Det avgör changed() i host.js.
    changed();
    // Gäller ändringen först från nästa låt får spelledaren veta det, men bara om något ändrades.
    // Ett fel eller något som pågår får stå kvar.
    const shown = currentMessage();
    if (shown && (shown.kind === 'problem' || shown.kind === 'busy')) return;
    if (pending && pendingDiffers(pending, now)) {
      showMessage({ key: 'settings', kind: 'info', title: t('changed.title'), text: t('changed.text'), ms: INFO_MS });
    }
  }

  /** De sparade ändringarna gäller från och med nu. */
  function apply() {
    const s = state();
    const { settings, category: picked, songs: pickedSongs, host, clipAll } = pending;
    pending = null;
    game.applySettings(s, settings);
    s.clipAll = clipAll;
    // En spelare kan ha tagit namnet medan låten pågick. Då heter spelledaren Spelledare.
    if (host) game.setHostPlaying(s, host.plays, hostNameTaken(host.name) ? game.DEFAULT_HOST_NAME : host.name);
    // Poängen och spelade låtar finns kvar.
    if (picked && game.changeCategory(s, { categoryId: picked.id, categoryName: picked.name, labels: picked.labels })) {
      stopClip();
      categoryChanged(picked, pickedSongs);
    }
  }

  /** Ändringar under en låt syns för spelarna direkt, fast de gäller först från nästa låt. */
  function upcoming(view) {
    if (!pending) return null;
    return {
      categoryName: pending.category ? pending.category.name : view.categoryName,
      settings: { ...view.settings, ...pending.settings },
    };
  }

  return {
    edit, apply, upcoming, renderSummary, currentUnknown,
    hasPending: () => Boolean(pending),
    hostPlays: () => hostPlays,
  };
}
