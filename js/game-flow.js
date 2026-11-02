// @ts-check
// Spelets nedräkningar hos spelledaren: "Nu börjar det!" före första låten och "Nästa låt om
// 10 s" efter rätt svar, och vad tickern ska göra härnäst. Modulen rör varken sidan, nätet
// eller ljudet, och tiden kommer från now, så att den går att testa med en falsk klocka.
import { shouldReveal } from './game.js';

// Nästa låt startar av sig själv så här länge efter att svaret visats.
export const AUTO_NEXT_MS = 10000;
// Nedräkningen före första låten är lika lång som den mellan låtarna (24 oktober 2026, PR 349).
export const INTRO_MS = AUTO_NEXT_MS;

/** @param {{ now?: () => number }} [options] */
export function createGameFlow({ now = Date.now } = {}) {
  let introEnds = 0;
  // Nedräkningen till nästa låt hör till en viss låt. Den börjar när låtens svar först visas.
  let autoNext = { round: 0, at: 0 };

  // Spelledaren har tryckt på Starta spelet. Klippet laddas under nedräkningen.
  function startIntro() {
    introEnds = now() + INTRO_MS;
  }

  const introLeft = () => Math.max(0, introEnds - now());

  // Tid kvar tills nästa låt startar av sig själv, eller null när ingen nedräkning pågår:
  // innan svaret visas och när någon har vunnit. Under en paus står nedräkningen still.
  function nextLeft(state) {
    const round = state.round;
    if (!round || round.phase !== 'revealed' || state.winners) return null;
    if (autoNext.round !== round.number) autoNext = { round: round.number, at: now() + AUTO_NEXT_MS };
    return Math.max(0, autoNext.at - (state.pausedAt || now()));
  }

  // Pausen varade pausedMs. Nedräkningen fortsätter där den stod.
  function resumed(pausedMs) {
    autoNext.at += pausedMs;
  }

  // Spela igen. Låtarna numreras om från 1, så en gammal nedräkning får inte gälla den nya
  // första låten. (Rättat 2 november 2026: förut kunde nästa låt starta direkt efter rätt svar
  // på första låten, om förra spelets nedräkning hörde till en låt med samma nummer.)
  function restarted() {
    autoNext = { round: 0, at: 0 };
    introEnds = 0;
  }

  /**
   * Vad tickern ska göra nu: 'reveal' när tiden för låten är slut, 'next' när nästa låt ska
   * starta, annars null. Nästa låt startar även om en ruta som Inställningar är öppen, eftersom
   * spelarna ser nedräkningen.
   */
  function nextAction(state) {
    if (!state.round) return null;
    if (state.round.phase === 'playing') return shouldReveal(state, now()) ? 'reveal' : null;
    const left = nextLeft(state);
    if (left === null || state.pausedAt) return null;
    return left > 0 ? null : 'next';
  }

  return { startIntro, introLeft, nextLeft, resumed, restarted, nextAction };
}
