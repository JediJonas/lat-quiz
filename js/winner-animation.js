// @ts-check
// Vinstanimationen på vinnarkortet: konfetti, fyrverkeri eller strålkastare, och i
// säsongskategorierna en fladdermussvärm i Halloween och snöstorm i Jul.
// Den ligger bakom texten på omslaget och håller på i ungefär 13 sekunder. Med minskad rörelse
// står den still, som ett foto. Valet slumpas per match men blir detsamma på alla enheter
// (pickWinEffect).

import { confetti } from './winner-animation/confetti.js';
import { fireworks } from './winner-animation/fireworks.js';
import { spotlights } from './winner-animation/spotlights.js';
import { bats } from './winner-animation/bats.js';
import { blizzard } from './winner-animation/blizzard.js';

// Så länge effekterna håller på, med lite marginal. Säsongens löv och snö bakom sidan pausas så länge.
export const WIN_EFFECT_MS = 13500;

export const WIN_EFFECTS = ['confetti', 'fireworks', 'spotlights'];
// Säsongskategorierna har egna effekter i stället för de vanliga.
export const SEASON_WIN_EFFECTS = { halloween: ['bats'], jul: ['blizzard'] };

// Väljer effekt utifrån något som alla enheter känner till om matchen, till exempel sista låten
// och vinnarna, och kategorin. Samma nyckel och kategori ger alltid samma effekt.
export function pickWinEffect(key, category) {
  const effects = SEASON_WIN_EFFECTS[category] || WIN_EFFECTS;
  let hash = 2166136261;
  for (const ch of String(key)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return effects[(hash >>> 0) % effects.length];
}

// Startar effekten i rutan, som ska täcka omslaget. Den slutar av sig själv, och även om rutan
// tas bort ur sidan.
export function startWinEffect(box, effect) {
  box.className = `win-fx ${effect}`;
  box.replaceChildren();
  if (effect === 'fireworks') fireworks(box);
  else if (effect === 'spotlights') spotlights(box);
  else if (effect === 'bats') bats(box);
  else if (effect === 'blizzard') blizzard(box);
  else confetti(box);
}
