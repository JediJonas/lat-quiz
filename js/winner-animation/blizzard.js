// @ts-check
// En av vinstanimationens effekter, i Jul. Se js/winner-animation/winner-animation.js.
import { randomBetween, prefersReducedMotion } from '../shared/motion.js';
import { canvasIn, fade, play } from './canvas.js';

// En rund snöflinga med mjuk kant, ritad en gång och sedan kopierad i olika storlekar.
function softFlake() {
  const img = document.createElement('canvas');
  img.width = img.height = 32;
  const ctx = img.getContext('2d');
  const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.45, 'rgba(255, 255, 255, 0.9)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 32, 32);
  return img;
}

// Snöstorm: runda snöflingor med mjuka kanter, som snön i säsongslagret, yr snabbt i vinden, som
// blåser i byar fram och tillbaka, och virvlar medan de faller. Stora flingor är närmare och faller
// fortare, och bakom texten syns de svagare. Längs omslagets nederkant växer en snödriva upp till
// den nedersta texten, och den ligger kvar när det har slutat snöa.
export function blizzard(box) {
  const dur = 13;
  const img = softFlake();
  const flakes = Array.from({ length: 1200 }, (_, i) => {
    const s = 3 + Math.random() ** 1.8 * 7;
    const fall = 70 + s * 12;
    return {
      // De första flingorna finns redan på omslaget när det vänds fram, utspridda över hela höjden.
      d: i < 280 ? -randomBetween(0, 3.2) : randomBetween(0, 9.5), x0: Math.random(), s, fall,
      alpha: 0.55 + (s / 9.5) * 0.4, r: randomBetween(6, 22), hz: randomBetween(0.3, 0.8), ph: randomBetween(0, 6.3),
    };
  });
  // Vinden blåser åt höger i byar som ibland vänder. wind är hur långt den har blåst en flinga.
  const wind = (time) => 60 * time - (100 / 0.9) * Math.cos(0.9 * time);
  // Drivan når upp till mitten av den nedersta texten, hur hög den än står på omslaget.
  const sub = box.parentElement && box.parentElement.querySelector('.win-sub');
  let t = 0;
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const out = fade(t, dur);
    for (const f of flakes) {
      const age = t - f.d;
      if (age < 0) continue;
      const y = -10 + f.fall * age;
      if (y > h + 10) continue;
      const span = w + 20;
      const x = ((((f.x0 * w + wind(t) - wind(f.d) + f.r * Math.sin(age * f.hz * 6.283 + f.ph)) % span) + span) % span) - 10;
      // Nertill, där namnet står, syns flingorna svagare, så att den vita texten går att läsa.
      ctx.globalAlpha = f.alpha * out * (1 - 0.6 * Math.min(1, Math.max(0, (y - h * 0.5) / (h * 0.15))));
      ctx.drawImage(img, x - f.s / 2, y - f.s / 2, f.s, f.s);
    }
    // Drivan växer under nio sekunder och är ojämn, med kullar och svackor.
    const deepest = sub ? Math.max(20, h - sub.offsetTop - sub.offsetHeight * 0.5) : 30;
    const top = deepest * Math.min(1, Math.max(0, (t - 0.5) / 8.5));
    if (top > 0.5) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 6; x += 6) ctx.lineTo(x, h - top * (0.7 + 0.2 * Math.sin(x * 0.018 + 1.3) + 0.1 * Math.sin(x * 0.051)));
      ctx.lineTo(w, h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const area = canvasIn(box, draw);
  if (prefersReducedMotion()) {
    // Med minskad rörelse hänger en glesare yra still över omslaget, med drivan färdig.
    flakes.length = 440;
    area.start();
    t = 10;
    for (const f of flakes) f.d = t - (randomBetween(0, area.h) + 10) / f.fall;
    draw();
    return;
  }
  // När snöyran är slut ritas bara drivan.
  play(box, area, { dur, step: (now) => { t = now; draw(); }, end: () => { flakes.length = 0; draw(); } });
}
