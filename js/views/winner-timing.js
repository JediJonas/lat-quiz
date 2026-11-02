// @ts-check
// När vinnaren visas. När matchen avgörs visas sista låten först som vanligt. Efter WIN_DELAY_MS
// står "Vi har en vinnare!" medan spelledaren spelar en trumvirvel, och sedan visas namnet.
//
// Hos spelledaren visas namnet när vinnarlåten börjar höras, efter trumvirveln, eller efter DRUM_MS
// om ingen låt spelas. Spelarna spelar inget ljud: de vänder när spelledaren säger till, och visar
// namnet ändå efter DRUM_MAX_MS om det dröjer.

/** @typedef {import('../shared/protocol.js').View} View */

export const WIN_DELAY_MS = 4000;
export const DRUM_MS = 4000;
export const DRUM_MAX_MS = 8000;
export const DRUM_WAIT_MS = 2000; // längsta väntan på att trumvirveln hörs

/**
 * @param {object} deps
 * @param {() => View} deps.view vyn som visas just nu
 * @param {boolean} deps.host spelledaren, som spelar trumvirveln och vinnarlåten
 * @param {() => ({ drum: Promise<unknown>, song: Promise<unknown> } | null | void)} deps.onWinnerDrum
 *   trumvirveln ska börja. Ger två löften som uppfylls när virveln och vinnarlåten hörs, eller null
 *   utan vinnarlåt. "Vi har en vinnare!" visas när virveln hörs, men senast efter DRUM_WAIT_MS.
 *   Namnet visas när låten hörs, men senast efter DRUM_MAX_MS. Utan vinnarlåt visas texten direkt
 *   och namnet efter DRUM_MS.
 * @param {() => void} deps.onWinnerDrumShown "Vi har en vinnare!" har just visats
 * @param {() => void} deps.onWinnerShown vinnarvyn har just tagit över
 * @param {() => void} deps.render ritar om vyn
 */
export function createWinnerTiming({ view, host, onWinnerDrum, onWinnerDrumShown, onWinnerShown, render }) {
  let winRound = null; // låten som avgjorde matchen
  let winDrum = false; // texten innan namnet visas, till exempel Vi har en vinnare!
  let winShown = false; // vinnarvyn har tagit över
  let winTimer = null;
  let winTurn = 0; // ökar för varje vinnare, så att ett sent löfte inte visar fel vinnare

  // Följer en ny vy: startar väntan när matchen just har avgjorts, och nollställer när ett nytt spel börjar.
  function followView() {
    const v = view();
    const round = v.round;
    const phase = round ? round.phase : 'waiting';
    if (v.winners && phase === 'revealed' && winRound !== round.number) {
      winRound = round.number;
      winDrum = false;
      winShown = false;
      clearTimeout(winTimer);
      const turn = ++winTurn;
      winTimer = setTimeout(() => {
        if (!view().winners) return;
        // Spelarna spelar inget ljud. De vänder när spelledaren gör det, och väntar bara en stund.
        const sound = host ? onWinnerDrum() : null;
        const showWinner = () => {
          if (turn !== winTurn || winShown) return;
          clearTimeout(winTimer);
          winDrum = true;
          winShown = true;
          if (view().winners) { render(); onWinnerShown(); }
        };
        const flip = () => {
          if (turn !== winTurn || winDrum) return;
          clearTimeout(winTimer);
          winDrum = true;
          if (!view().winners) return;
          render();
          onWinnerDrumShown();
          winTimer = setTimeout(showWinner, sound || !host ? DRUM_MAX_MS : DRUM_MS);
        };
        if (sound) {
          sound.drum.then(flip, flip);
          sound.song.then(showWinner, showWinner);
        }
        if (host && !sound) flip();
        else winTimer = setTimeout(flip, DRUM_WAIT_MS);
      }, WIN_DELAY_MS);
    } else if (!v.winners) {
      winRound = null;
      winDrum = false;
      winShown = false;
      clearTimeout(winTimer);
      winTurn += 1;
    }
    // Spelarna vänder fram "Vi har en vinnare!" och vinnaren samtidigt som spelledaren.
    if (!host && v.winners && v.winnerShown && !winShown) {
      clearTimeout(winTimer);
      winTurn += 1;
      winDrum = true;
      winShown = true;
    } else if (!host && v.winners && v.winnerDrum && !winDrum && phase === 'revealed') {
      clearTimeout(winTimer);
      winDrum = true;
      const turn = winTurn;
      winTimer = setTimeout(() => {
        if (turn !== winTurn || winShown) return;
        winShown = true;
        if (view().winners) render();
      }, DRUM_MAX_MS);
    }
  }

  const revealedWin = () => {
    const v = view();
    return Boolean(v && v.winners && v.round && v.round.phase === 'revealed');
  };

  return {
    followView,
    // Vinnarvyn visas, efter att sista låten har visats en stund.
    winner: () => revealedWin() && winShown,
    // "Vi har en vinnare!" eller vinnaren visas.
    drum: () => revealedWin() && winDrum,
  };
}
