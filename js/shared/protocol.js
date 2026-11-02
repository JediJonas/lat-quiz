// @ts-check
// Meddelandena mellan spelledaren och spelarna. Det här är hela gränssnittet mot nätet: den som
// byter PeerJS mot till exempel Firebase behöver bara skicka och ta emot de här objekten.
// Ändras ett meddelande eller ett fält i vyn så att en äldre sida inte förstår det, höjs
// PROTOCOL_VERSION.

import { MAX_NAME } from '../game.js';

/** Följer med i hello. Spelledaren kontrollerar den inte än, eftersom alla laddar om ändå (2 november 2026). */
export const PROTOCOL_VERSION = 1;

// Längsta id och svar som tas emot från en spelare.
const MAX_ID = 40;
const MAX_ANSWER = 200;

/** Meddelandetyperna. */
export const MSG = /** @type {const} */ ({
  // Från spelaren till spelledaren
  hello: 'hello', // går med eller ansluter igen: { playerId, name, version }
  answer: 'answer', // svar i ett fält: { field: 'artist' | 'title', value }, tomt värde tar bort svaret
  leave: 'leave', // Lämna spelet
  pong: 'pong', // svar på ping, hanteras i net.js
  // Från spelledaren till spelaren
  state: 'state', // hela vyn för just den spelaren: { view }
  joined: 'joined', // en annan spelare har gått med: { name }
  left: 'left', // en annan spelare har lämnat: { name }
  newMatch: 'new-match', // Spela igen
  nameTaken: 'name-taken', // namnet finns redan: { name }
  ended: 'ended', // spelledaren avslutade spelet
  leaving: 'leaving', // spelledarens sida stängs, spelet kan komma tillbaka
  ping: 'ping', // håller förbindelsen vid liv, hanteras i net.js
});

/**
 * Det spelvyn får, hos spelarna över nätet och hos spelledaren direkt. Grunden kommer från
 * playerView i game.js, och spelledaren lägger till resten i host.js.
 * @typedef {object} View
 * @property {string} code
 * @property {string} categoryId
 * @property {string} categoryName
 * @property {{ id: string, name: string, score: number, connected: boolean }[]} standings
 * @property {string[]} answered spelare som har fyllt i alla fält
 * @property {number} winScore
 * @property {{ roundMs: number, bonusMs: number, winScore: number }} settings
 * @property {string[] | null} winners vinnarnas namn
 * @property {boolean} paused
 * @property {{ artist?: string, title: string }} labels fältens namn, för låten som spelas
 * @property {RoundView | null} round
 * Tillagt av spelledaren:
 * @property {boolean} [winnerClip] vinnarlåten är ett Deezer-klipp
 * @property {boolean} [winnerDrum] rubriken före vinnaren visas
 * @property {boolean} [winnerShown] vinnarkortet har vänts fram
 * @property {boolean} [lobbyPlaying] väntemusiken spelas
 * @property {number} [introMs] tid kvar av "Nu börjar det!"
 * @property {number} [introTotalMs]
 * @property {string} [clipUrl] quizklippet, med Spela ljud på alla enheter
 * @property {Music} [music] väntemusik, trumvirvel eller vinnarlåt, med Spela ljud på alla enheter
 * @property {string} [nowMusic] texten på raden Nu spelas
 * @property {{ categoryName: string, settings: object }} [upcoming] ändringar som gäller från nästa låt
 */

/**
 * @typedef {object} RoundView
 * @property {number} number
 * @property {'ready' | 'playing' | 'revealed'} phase
 * @property {number} remainingMs
 * @property {number} roundMs
 * @property {number} bonusMs
 * @property {object | null} answer spelarens eget svar
 * @property {{ artist: string, title: string, year: number } | null} song bara när svaret visas
 * @property {object | null} result spelarens eget resultat
 * @property {Record<string, { artist: boolean, title: boolean }>} progress vilka fält var och en har fyllt i
 * @property {object | null} results allas resultat när svaret visas
 * @property {number} [nextInMs] tid kvar tills nästa låt, tillagt av spelledaren
 * @property {number} [nextTotalMs]
 */

/**
 * @typedef {object} Music
 * @property {string} url
 * @property {number} posMs hur långt in i klippet spelledaren är
 * @property {number} volume
 * @property {number} fadeInMs
 * @property {number} fadeOutMs
 * @property {boolean} loop
 */

// ---- Meddelanden ----

/** @param {{ playerId: string, name: string }} player */
export const hello = ({ playerId, name }) => ({ type: MSG.hello, playerId, name, version: PROTOCOL_VERSION });
/** @param {string} field @param {string} value */
export const answer = (field, value) => ({ type: MSG.answer, field, value });
export const leave = () => ({ type: MSG.leave });
/** @param {View} view */
export const state = (view) => ({ type: MSG.state, view });
/** @param {string} name */
export const joined = (name) => ({ type: MSG.joined, name });
/** @param {string} name */
export const left = (name) => ({ type: MSG.left, name });
export const newMatch = () => ({ type: MSG.newMatch });
/** @param {string} name */
export const nameTaken = (name) => ({ type: MSG.nameTaken, name });
export const ended = () => ({ type: MSG.ended });
export const leaving = () => ({ type: MSG.leaving });

/**
 * Kontrollerar ett meddelande från en spelare och ger en städad kopia, eller null om det inte
 * går att använda. Spelledaren litar aldrig på det som kommer över nätet: namn och svar
 * kortas, och okända typer och fält släpps.
 * @param {unknown} msg
 * @returns {{ type: 'hello', playerId: string, name: string, version: number }
 *   | { type: 'answer', field: 'artist' | 'title', value: string }
 *   | { type: 'leave' } | null}
 */
export function fromPlayer(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const m = /** @type {Record<string, unknown>} */ (msg);
  if (m.type === MSG.hello) {
    const name = String(m.name || '').trim().slice(0, MAX_NAME);
    const playerId = String(m.playerId || '').slice(0, MAX_ID);
    if (!name || !playerId) return null;
    return { type: MSG.hello, playerId, name, version: Number(m.version) || 0 };
  }
  if (m.type === MSG.answer) {
    if (m.field !== 'artist' && m.field !== 'title') return null;
    return { type: MSG.answer, field: m.field, value: String(m.value || '').slice(0, MAX_ANSWER) };
  }
  if (m.type === MSG.leave) return { type: MSG.leave };
  return null;
}

/** Ett svar som spelledaren själv ger, kortat på samma sätt som spelarnas. @param {string} value */
export const cleanAnswer = (value) => String(value || '').slice(0, MAX_ANSWER);
