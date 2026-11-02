// @ts-check
// En av vinstanimationens effekter, se js/winner-animation/winner-animation.js.
import { randomBetween, prefersReducedMotion } from '../shared/motion.js';
import { canvasIn } from './canvas.js';

// Konfetti som papper: varje bit faller på sitt eget sätt. Ungefär var tredje dalar långsamt och
// pendlar i sidled med lutningen åt det håll den glider, andra flippar runt och faller fortare, och
// några snurrar som propellrar. När en bit vänder baksidan till blir den smalare och mörkare, som
// papper i ljus. Bitarna släpps i omgångar, så att det regnar i ungefär tio sekunder.
export function confetti(box) {
  const colors = ['#ffd166', '#ffffff', '#7cf0b0', '#ff9ecb'];
  const pieces = Array.from({ length: 110 }, (_, i) => {
    const kind = Math.random() < 0.3 ? 'dala' : Math.random() < 0.67 ? 'flippa' : 'snurra';
    const dala = kind === 'dala';
    return {
      kind, x: randomBetween(-0.02, 1.02), y: -randomBetween(20, 60), c: colors[i % colors.length],
      // De första bitarna släpps genast, så att det börjar regna direkt.
      d: i < 24 ? randomBetween(-0.8, 0.4) : randomBetween(0, dala ? 6.5 : 7.8),
      w: randomBetween(8, 11), h: kind === 'snurra' ? randomBetween(8, 10) : randomBetween(13, 18),
      fall: dala ? randomBetween(46, 70) : kind === 'flippa' ? randomBetween(85, 135) : randomBetween(70, 100),
      drift: randomBetween(-14, 14),
      sway: dala ? randomBetween(13, 27) : randomBetween(2.5, 7.5), swayHz: dala ? randomBetween(0.55, 0.95) : randomBetween(0.7, 1.4), swayPh: randomBetween(0, 6.3),
      flipHz: dala ? randomBetween(0.35, 0.75) : kind === 'flippa' ? randomBetween(1.7, 2.8) : randomBetween(0.8, 1.5), flipPh: randomBetween(0, 6.3),
      spin: kind === 'snurra' ? randomBetween(4, 7.5) * (Math.random() < 0.5 ? -1 : 1) : randomBetween(-2, 2), rot: randomBetween(0, 6.3),
    };
  });
  let t = 0;
  // Ritar läget t sekunder in och returnerar hur många bitar som ännu inte har fallit ut.
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    let left = 0;
    for (const p of pieces) {
      const age = t - p.d;
      if (age < 0) { left += 1; continue; }
      // Biten tar fart den första halvsekunden och faller sedan i jämn takt, som papper i luft.
      const y = p.y + p.fall * (age - (1 - Math.exp(-3 * age)) / 3);
      if (y > h + 30) continue;
      left += 1;
      const phase = p.swayPh + age * p.swayHz * 6.283;
      const x = p.x * w + p.drift * age + p.sway * Math.sin(phase);
      // Den som dalar lutar åt det håll den glider, som ett löv.
      const tilt = p.kind === 'dala' ? Math.cos(phase) * 0.58 : 0;
      const flip = Math.cos(p.flipPh + age * p.flipHz * 6.283);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.spin * age + tilt);
      ctx.scale(1, Math.max(Math.abs(flip), 0.08));
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
      ctx.fill();
      const shade = (flip < 0 ? 0.28 : 0) + (1 - Math.abs(flip)) * 0.25;
      if (shade > 0.02) { ctx.globalAlpha = shade; ctx.fillStyle = '#1a0830'; ctx.fill(); }
      ctx.restore();
    }
    return left;
  };
  const area = canvasIn(box, draw);
  if (prefersReducedMotion()) {
    // Med minskad rörelse står en glesare konfetti still över hela omslaget, som på ett foto mitt i regnet.
    pieces.length = 45;
    area.start();
    for (const p of pieces) p.d = -((randomBetween(0, area.h) - p.y) / p.fall + 1 / 3);
    draw();
    return;
  }
  area.start();
  const start = performance.now();
  const frame = (now) => {
    t = (now - start) / 1000;
    if (box.isConnected && draw() > 0) requestAnimationFrame(frame);
    else area.stop();
  };
  requestAnimationFrame(frame);
}
