// @ts-check
// Val som gäller den här enheten och sparas mellan spelen: Spela extraljud, Spela ljud på
// alla enheter, Ljudsynk, spelledarens namn, de senaste inställningarna och avdelningen
// Okända låtar. Spelets eget läge sparas av host.js och play.js.
import { KEYS, readJson, readText, remove, writeJson, writeText } from './storage.js';
import { cleanSettings } from '../game/game.js';
import { cleanDelay } from '../sound/audio-delay.js';
import { cleanUnknown } from '../host/unknown-songs.js';

/** Extraljuden (väntemusik, trumvirvel och vinnarlåt) är på om inget annat har valts. */
export function extraSounds() {
  return readText(KEYS.extraSounds) !== '0';
}

/** @param {boolean} on */
export function setExtraSounds(on) {
  writeText(KEYS.extraSounds, on ? null : '0');
}

/** Spela ljud på alla enheter är av om inget annat har valts. Senaste valet gäller nästa spel. */
export function clipAll() {
  return readText(KEYS.clipAll) === '1';
}

/** @param {boolean} on */
export function setClipAll(on) {
  writeText(KEYS.clipAll, on ? '1' : null);
}

/** Ljudsynk i millisekunder, se audio-delay.js. 0 betyder Ingen. */
export function audioDelay() {
  return cleanDelay(readText(KEYS.audioDelay) ?? 0);
}

/** @param {number} ms */
export function setAudioDelay(ms) {
  writeText(KEYS.audioDelay, ms ? String(ms) : null);
}

/** Senast valda Tid per låt, bonus och poänggräns, som gäller när nästa spel skapas. */
export function lastSettings() {
  return cleanSettings(readJson(KEYS.settings, {}));
}

/** @param {object} settings */
export function setLastSettings(settings) {
  writeJson(KEYS.settings, settings);
}

/** Spelledarens namn, eller namnet från spelarsidan om spelledaren inte har något eget. */
export function hostName() {
  return readText(KEYS.hostName) || readJson(KEYS.player, { name: '' }).name || '';
}

/** @param {string} name */
export function setHostName(name) {
  writeText(KEYS.hostName, name);
}

/**
 * Avdelningen Okända låtar syns bara för den som har slagit på den med ?okanda=1 i
 * adressen. Valet sparas på enheten tills ?okanda=0 används.
 * @param {string} search adressens frågedel, location.search
 */
export function showUnknown(search) {
  const param = new URLSearchParams(search).get('okanda');
  if (param === '1') writeText(KEYS.showUnknown, '1');
  if (param === '0') remove(KEYS.showUnknown);
  return readText(KEYS.showUnknown) === '1';
}

/** Okända låtar, som sparas på den här enheten och hoppas över i kommande spel. Se unknown-songs.js. */
export function unknownSongs() {
  return cleanUnknown(readJson(KEYS.unknown, {}));
}

/** @param {object} list */
export function setUnknownSongs(list) {
  writeJson(KEYS.unknown, list);
}
