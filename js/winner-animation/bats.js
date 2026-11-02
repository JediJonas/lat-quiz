// @ts-check
// En av vinstanimationens effekter, i Halloween. Se js/winner-animation.js.
import { randomBetween, prefersReducedMotion } from '../shared/motion.js';
import { drawBat } from '../season.js';
import { canvasIn, fade, play } from './canvas.js';

// Fladdermusen i tolv lägen av vingslaget, ritad en gång och sedan kopierad, så att mobilen orkar
// med en hel svärm. zoom ger större bilder, så att fladdermöss som flyger mot kameran blir skarpa.
// Samma fladdermus som flyger förbi i säsongslagret (js/season.js).
function batFrames(zoom) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  return Array.from({ length: 12 }, (_, i) => {
    const img = document.createElement('canvas');
    img.width = img.height = Math.ceil(64 * zoom * dpr);
    const ctx = img.getContext('2d');
    ctx.scale(dpr * zoom, dpr * zoom);
    ctx.fillStyle = '#170a22';
    drawBat(ctx, 32, 34, 30, Math.sin((i / 12) * Math.PI * 2));
    return img;
  });
}

// En stor fullmåne med ett varmt sken runt sig, som fladdermössen flyger framför.
function drawMoon(ctx, x, y, r, a) {
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.6);
  glow.addColorStop(0, `rgba(255, 236, 170, ${0.35 * a})`);
  glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  ctx.globalAlpha = 0.92 * a;
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Fladdermöss: 130 fladdermöss flyger rakt mot kameran från så långt bort att de inte syns, mitt i
// omslaget, framför en stor fullmåne. Först dyker en liten svart klump upp, som växer och glesnar ju
// närmare de kommer, tills de susar förbi kameran och försvinner ut ur bild. De kommer fram vid olika
// tider, de flesta under de första åtta sekunderna.
export function bats(box) {
  const dur = 12.8;
  // Små bilder för dem långt bort och stora för dem som kommer nära, eftersom det tar tid att krympa
  // stora bilder.
  const small = batFrames(1);
  const large = batFrames(3);
  // x, y och size räknas ut medan flocken flyger, och out sätts när fladdermusen har passerat.
  /** @type {{ ox: number, oy: number, at: number, s: number, wob: number, wobHz: number, ph: number, flapHz: number, x?: number, y?: number, size?: number, out?: boolean }[]} */
  const swarm = Array.from({ length: 130 }, () => {
    const r = Math.sqrt(Math.random());
    const a = randomBetween(0, 6.3);
    return {
      // Var i flocken fladdermusen flyger, sett framifrån, och när den passerar kameran.
      ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.75, at: 2.6 + Math.random() ** 2 * 6, s: randomBetween(9, 18),
      wob: randomBetween(0.05, 0.12), wobHz: randomBetween(0.3, 0.7), ph: randomBetween(0, 6.3), flapHz: randomBetween(3.2, 4.6),
    };
  });
  let t = 0;
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const out = fade(t, dur);
    drawMoon(ctx, w * 0.72, h * 0.3, Math.min(w, h) * 0.15, Math.min(1, t / 1.2) * out);
    // De som är närmast kameran ritas sist, så att de hamnar framför de andra.
    const shown = swarm.filter((b) => b.x !== undefined && !b.out).sort((a, b) => a.size - b.size);
    for (const b of shown) {
      // Fladdermössen tonar fram medan de är pyttesmå och är sedan helt mörka, så att de syns tydligt
      // framför månen. De som är nästan förbi kameran tonar bort, så att de inte skymmer namnet länge.
      const passing = Math.min(1, (h * 0.5 - b.size) / (h * 0.2), Math.max(0, b.size - 1));
      ctx.globalAlpha = 0.95 * out * passing;
      const frames = b.size > 36 ? large : small;
      const frame = frames[Math.floor(((((t * b.flapHz + b.ph) % 1) + 1) % 1) * frames.length)];
      const k = b.size / 30;
      ctx.drawImage(frame, b.x - 32 * k, b.y - 34 * k, 64 * k, 64 * k);
    }
    ctx.globalAlpha = 1;
  };
  const step = () => {
    const { w, h } = area;
    // Flocken är ungefär så bred som omslaget när den är framme vid det.
    const spread = Math.min(w, h) * 0.55;
    for (const b of swarm) {
      if (b.out) continue;
      // Avståndet: z är 1 nära omslaget och 0 vid kameran. Långt bort närmar sig fladdermusen
      // snabbare, så att den kommer från långt håll men susar förbi i jämn fart.
      const left = b.at - t;
      const z = 0.9 * left + 0.6 * left * left;
      if (left <= 0.04) { b.out = true; continue; }
      // Varje fladdermus slingrar sig lite i flocken.
      const ox = b.ox + b.wob * Math.sin(t * b.wobHz * 6.283 + b.ph);
      const oy = b.oy + b.wob * Math.cos(t * b.wobHz * 5.1 + b.ph);
      b.x = w * 0.5 + (ox * spread) / z;
      b.y = h * 0.42 + (oy * spread) / z;
      b.size = b.s / z;
      if (b.size > h * 0.5 || b.x < -b.size * 1.2 || b.x > w + b.size * 1.2 || b.y < -b.size || b.y > h + b.size) b.out = true;
    }
  };
  const area = canvasIn(box, draw);
  if (prefersReducedMotion()) {
    // Med minskad rörelse står månen och flocken still, när de första fladdermössen är nära.
    area.start();
    t = 2.4;
    step();
    draw();
    return;
  }
  play(box, area, dur, (now) => { t = now; step(); draw(); });
}
