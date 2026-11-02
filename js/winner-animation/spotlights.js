// @ts-check
// En av vinstanimationens effekter, se js/winner-animation.js.
import { randomBetween, pickRandom, prefersReducedMotion } from '../shared/motion.js';

// Strålkastare: sex färgade ljuskäglor från omslagets kanter sveper fram och tillbaka i olika takt,
// som ljusshowen på en konsert. Lamporna står utanför omslaget, så att bara ljuset syns, och där
// käglorna korsar varandra blandas färgerna. Två av käglorna, ur olika par, lutar också lite mot och
// från kameran i takt med svepet: närmast kameran i ena änden och längst bort i den andra, som en
// lampa som vinklas på sitt stativ. Käglorna vrids och skalas med transform i css/style.css, så att
// mobilen bara behöver flytta färdiga lager.
export function spotlights(box) {
  // Var lampan står (andel av bredden), om den lyser uppifrån eller nerifrån, färgen och åt vilket
  // håll den börjar svepa.
  /** @type {[number, string, string, number][]} */
  const beams = [[0.1, 'top', '#ff5fb0', 1], [0.45, 'top', '#4fd8ff', -1], [0.88, 'top', '#ffd166', -1],
    [0.2, 'bottom', '#a98bff', -1], [0.62, 'bottom', '#7cf0b0', 1], [0.95, 'bottom', '#ff8a5c', 1]];
  // Två lampor ur olika par lutar, så att de inte står bredvid varandra.
  const pairs = spotlightPairs(beams.map(([x]) => x));
  const tilting = [...pairs].sort(() => Math.random() - 0.5).slice(0, 2).map((pair) => pickRandom(pair));
  box.innerHTML = beams.map(([x, side, c, dir], i) => {
    const angle = side === 'top' ? (x - 0.5) * 50 : 180 + (0.5 - x) * 50;
    return `<div class="spot-beam ${side}${tilting.includes(i) ? ' tilt' : ''}" style="left:${x * 100}%;--c:${c};--a:${angle}deg;`
      + `--sw:${(dir * randomBetween(22, 32)).toFixed(0)}deg;--t:${randomBetween(2.2, 3.4).toFixed(2)}s;--in:${(0.25 + i * 0.12).toFixed(2)}s">`
      + '<b class="spot-glow"></b><span><i></i></span></div>';
  }).join('');
  // Käglorna är lite längre än omslagets diagonal, så att de alltid når över hela omslaget.
  const size = () => box.style.setProperty('--len', `${Math.round(Math.hypot(box.offsetWidth, box.offsetHeight) * 1.1)}px`);
  size();
  const observer = new ResizeObserver(size);
  observer.observe(box);
  // Efter elva sekunder släcks lamporna två och två, utifrån och in, med 0,7 sekunder mellan
  // paren. När det sista paret släcks ljusnar omslaget igen, så att det är slut efter ungefär
  // 13 sekunder. Med minskad rörelse lyser de kvar, som på ett foto.
  const lamps = [...box.children];
  pairs.forEach((pair, i) => setTimeout(() => {
    if (prefersReducedMotion()) return;
    for (const j of pair) lamps[j].classList.add('off');
  }, 11000 + i * 700));
  setTimeout(() => {
    observer.disconnect();
    if (!prefersReducedMotion()) box.classList.add('done');
  }, 11000 + (pairs.length - 1) * 700);
}

// Delar upp lamporna i par, utifrån och in: de två som står längst från mitten först. Tar emot
// var lamporna står (andel av bredden) och ger paren som index.
export function spotlightPairs(xs) {
  const order = xs.map((x, i) => i).sort((a, b) => Math.abs(xs[b] - 0.5) - Math.abs(xs[a] - 0.5));
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push(order.slice(i, i + 2));
  return pairs;
}
