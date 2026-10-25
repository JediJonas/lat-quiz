// Vinstanimationen på vinnarkortet: konfetti, fyrverkeri eller strålkastare, och i
// säsongskategorierna en fladdermussvärm eller spöken i Halloween och tomtens släde eller
// snöstorm i Jul.
// Den ligger bakom texten på omslaget och håller på i ungefär 13 sekunder. Med minskad rörelse
// står den still, som ett foto. Valet slumpas per match men blir detsamma på alla enheter
// (pickWinEffect).

import { drawBat } from './sasong.js';

export const WIN_EFFECTS = ['konfetti', 'fyrverkeri', 'stralkastare'];
// Säsongskategorierna har egna effekter i stället för de vanliga.
export const SEASON_WIN_EFFECTS = { halloween: ['fladdermoss', 'spoken'], jul: ['slade', 'snoyra'] };

// Väljer effekt utifrån något som alla enheter känner till om matchen, till exempel sista låten
// och vinnarna, och kategorin. Samma nyckel och kategori ger alltid samma effekt.
export function pickWinEffect(key, category) {
  const effects = SEASON_WIN_EFFECTS[category] || WIN_EFFECTS;
  let hash = 2166136261;
  for (const ch of String(key)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return effects[(hash >>> 0) % effects.length];
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Startar effekten i rutan, som ska täcka omslaget. Den slutar av sig själv, och även om rutan
// tas bort ur sidan.
export function startWinEffect(box, effect) {
  box.className = `win-fx ${effect}`;
  box.replaceChildren();
  if (effect === 'fyrverkeri') fireworks(box);
  else if (effect === 'stralkastare') spotlights(box);
  else if (effect === 'fladdermoss') bats(box);
  else if (effect === 'spoken') ghosts(box);
  else if (effect === 'slade') sleigh(box);
  else if (effect === 'snoyra') blizzard(box);
  else confetti(box);
}

// En canvas som täcker rutan, med högst dubbel upplösning. redraw anropas när storleken ändras.
function canvasIn(box, redraw) {
  const canvas = document.createElement('canvas');
  box.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const area = { ctx, w: 0, h: 0 };
  const size = () => {
    area.w = box.clientWidth;
    area.h = box.clientHeight;
    canvas.width = Math.round(area.w * dpr);
    canvas.height = Math.round(area.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const observer = new ResizeObserver(size);
  area.start = () => { size(); observer.observe(box); };
  area.stop = () => { observer.disconnect(); ctx.clearRect(0, 0, area.w, area.h); };
  return area;
}

// Konfetti som papper: varje bit faller på sitt eget sätt. Ungefär var tredje dalar långsamt och
// pendlar i sidled med lutningen åt det håll den glider, andra flippar runt och faller fortare, och
// några snurrar som propellrar. När en bit vänder baksidan till blir den smalare och mörkare, som
// papper i ljus. Bitarna släpps i omgångar, så att det regnar i ungefär tio sekunder.
function confetti(box) {
  const colors = ['#ffd166', '#ffffff', '#7cf0b0', '#ff9ecb'];
  const pieces = Array.from({ length: 110 }, (_, i) => {
    const kind = Math.random() < 0.3 ? 'dala' : Math.random() < 0.67 ? 'flippa' : 'snurra';
    const dala = kind === 'dala';
    return {
      kind, x: rand(-0.02, 1.02), y: -rand(20, 60), c: colors[i % colors.length],
      // De första bitarna släpps genast, så att det börjar regna direkt.
      d: i < 24 ? rand(-0.8, 0.4) : rand(0, dala ? 6.5 : 7.8),
      w: rand(8, 11), h: kind === 'snurra' ? rand(8, 10) : rand(13, 18),
      fall: dala ? rand(46, 70) : kind === 'flippa' ? rand(85, 135) : rand(70, 100),
      drift: rand(-14, 14),
      sway: dala ? rand(13, 27) : rand(2.5, 7.5), swayHz: dala ? rand(0.55, 0.95) : rand(0.7, 1.4), swayPh: rand(0, 6.3),
      flipHz: dala ? rand(0.35, 0.75) : kind === 'flippa' ? rand(1.7, 2.8) : rand(0.8, 1.5), flipPh: rand(0, 6.3),
      spin: kind === 'snurra' ? rand(4, 7.5) * (Math.random() < 0.5 ? -1 : 1) : rand(-2, 2), rot: rand(0, 6.3),
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
  if (still()) {
    // Med minskad rörelse står en glesare konfetti still över hela omslaget, som på ett foto mitt i regnet.
    pieces.length = 45;
    area.start();
    for (const p of pieces) p.d = -((rand(0, area.h) - p.y) / p.fall + 1 / 3);
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

// Fyrverkeri: femton raketer stiger från nederkanten under drygt nio sekunder och slår ut i bollar,
// ringar och guldregn, med en final på tre samtidigt. Smällarna hålls i omslagets övre del, så att
// namnet längst ner går att läsa.
function fireworks(box) {
  const colors = ['#ffd166', '#ffffff', '#7cf0b0', '#ff9ecb', '#9fd8ff'];
  // När raketerna skjuts upp, i sekunder, och hur högt de slår ut (0 högst upp, 1 längst ner).
  const plan = [[0.15, 0.3], [0.6, 0.72], [1.4, 0.5], [2.4, 0.22], [2.9, 0.8], [3.7, 0.45], [4.7, 0.65],
    [5.1, 0.3], [6.1, 0.55], [7, 0.2], [7.4, 0.78], [8.3, 0.4], [9.1, 0.25], [9.15, 0.55], [9.2, 0.82]];
  const kinds = ['peony', 'ring', 'willow', 'peony', 'peony', 'willow', 'ring'];
  const rockets = [];
  const sparks = [];
  const flashes = [];
  const gravity = 70; // px/s²
  const height = (level) => area.h * (0.2 + level * 0.34);

  const burst = (x, y, kind, scale = 1) => {
    const c1 = pick(colors);
    const c2 = Math.random() < 0.5 ? pick(colors) : c1;
    const willow = kind === 'willow';
    const n = willow ? 50 : kind === 'ring' ? 40 : 64;
    const speed = Math.min(area.w, 420) * (willow ? 0.4 : 0.55) * scale;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08);
      const v = kind === 'ring' ? speed * rand(0.92, 1) : speed * Math.cbrt(rand(0.15, 1));
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0,
        life: willow ? rand(2, 2.6) : rand(1.1, 1.6), drag: willow ? 2.2 : 1.6,
        c: willow ? '#ffd166' : i % 2 ? c1 : c2, r: willow ? 1.3 : 1.7, willow });
    }
    flashes.push({ x, y, age: 0, c: willow ? '#ffd166' : c1 });
  };

  const step = (dt) => {
    for (const r of rockets) {
      r.y -= r.vy * dt;
      r.vy = Math.max(r.vy - r.slow * dt, 60);
      // Raketen lämnar en svans av små gnistor efter sig.
      if (Math.random() < 0.7) sparks.push({ x: r.x + rand(-1, 1), y: r.y + 4, vx: rand(-12, 12), vy: rand(10, 40),
        age: 0, life: rand(0.25, 0.45), drag: 3, c: '#ffe7a3', r: 1, trail: true });
      if (r.y <= r.top) { r.done = true; burst(r.x, r.y, r.kind); }
    }
    const keep = (list, alive) => { for (let i = list.length - 1; i >= 0; i -= 1) if (!alive(list[i])) list.splice(i, 1); };
    keep(rockets, (r) => !r.done);
    for (const s of sparks) {
      s.age += dt;
      const k = Math.exp(-s.drag * dt);
      s.vx *= k;
      s.vy = s.vy * k + gravity * (s.willow ? 0.9 : 1) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    keep(sparks, (s) => s.age < s.life);
    for (const f of flashes) f.age += dt;
    keep(flashes, (f) => f.age <= 0.5);
  };

  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    // Ett kort sken där en raket slår ut.
    for (const f of flashes) {
      const a = 0.28 * (1 - f.age / 0.5);
      const rad = 30 + f.age * 140;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      grad.addColorStop(0, `${f.c}${Math.round(a * 255).toString(16).padStart(2, '0')}`);
      grad.addColorStop(1, `${f.c}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(f.x - rad, f.y - rad, rad * 2, rad * 2);
    }
    ctx.lineCap = 'round';
    for (const s of sparks) {
      const left = 1 - s.age / s.life;
      // Gnistorna blinkar lite när de håller på att slockna.
      let a = Math.min(1, left * 1.6);
      if (!s.trail && left < 0.35 && Math.random() < 0.3) a *= 0.2;
      ctx.strokeStyle = s.c;
      // Strecket bakåt längs farten ger svansen, och ett bredare och svagare streck under ger sken.
      const tail = s.willow ? 0.14 : 0.07;
      ctx.beginPath();
      ctx.moveTo(s.x - s.vx * tail, s.y - s.vy * tail);
      ctx.lineTo(s.x, s.y);
      if (!s.trail) { ctx.globalAlpha = a * 0.25; ctx.lineWidth = s.r * 5; ctx.stroke(); }
      ctx.globalAlpha = a;
      ctx.lineWidth = s.r * 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff6d8';
    for (const r of rockets) { ctx.beginPath(); ctx.arc(r.x, r.y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  };

  const launch = ([, level], i) => {
    const top = height(level);
    const dist = area.h - top;
    // Farten väljs så att raketen bromsar in och når toppen efter 0,9 sekunder.
    rockets.push({ x: area.w * rand(0.15, 0.85), y: area.h, top, vy: (2 * dist) / 0.9, slow: (2 * dist) / 0.81,
      kind: kinds[i % kinds.length] });
  };

  const area = canvasIn(box, draw);
  area.start();
  if (still()) {
    // Med minskad rörelse står två mindre bollar still, som ett foto av fyrverkeriet.
    [[0.3, 0.5, 'peony'], [0.72, 0.4, 'ring']].forEach(([x, level, kind]) => burst(area.w * x, height(level), kind, 0.65));
    for (let t = 0; t < 0.7; t += 1 / 60) step(1 / 60);
    flashes.length = 0;
    for (const s of sparks) s.age = Math.min(s.age, s.life * 0.4);
    draw();
    return;
  }
  const start = performance.now();
  let fired = 0;
  let last = start;
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    const t = (now - start) / 1000;
    while (fired < plan.length && plan[fired][0] <= t) { launch(plan[fired], fired); fired += 1; }
    step(dt);
    draw();
    if (box.isConnected && (fired < plan.length || rockets.length || sparks.length)) requestAnimationFrame(frame);
    else { area.stop(); box.classList.add('done'); }
  };
  requestAnimationFrame(frame);
}

// Strålkastare: sex färgade ljuskäglor från omslagets kanter sveper fram och tillbaka i olika takt,
// som ljusshowen på en konsert. Lamporna står utanför omslaget, så att bara ljuset syns, och där
// käglorna korsar varandra blandas färgerna. Käglorna lutar också lite mot och från kameran, i par
// som speglar varandra: när den ena kommer mot kameran går den andra bort. Käglorna vrids och
// skalas med transform i css/style.css, så att mobilen bara behöver flytta färdiga lager.
function spotlights(box) {
  // Var lampan står (andel av bredden), om den lyser uppifrån eller nerifrån, färgen och åt vilket
  // håll den börjar svepa.
  const beams = [[0.1, 'top', '#ff5fb0', 1], [0.45, 'top', '#4fd8ff', -1], [0.88, 'top', '#ffd166', -1],
    [0.2, 'bottom', '#a98bff', -1], [0.62, 'bottom', '#7cf0b0', 1], [0.95, 'bottom', '#ff8a5c', 1]];
  // Varje par lutar i en gemensam slumpad takt, och den andra lampan i paret åt motsatt håll.
  const pairs = spotlightPairs(beams.map(([x]) => x));
  const tilt = [];
  for (const pair of pairs) {
    const t = rand(2.2, 3);
    const delay = -rand(0, t);
    pair.forEach((j, k) => { tilt[j] = `--zt:${t.toFixed(2)}s;--zd:${delay.toFixed(2)}s;--zdir:${k ? 'alternate-reverse' : 'alternate'}`; });
  }
  box.innerHTML = beams.map(([x, side, c, dir], i) => {
    const angle = side === 'top' ? (x - 0.5) * 50 : 180 + (0.5 - x) * 50;
    return `<div class="spot-beam ${side}" style="left:${x * 100}%;--c:${c};--a:${angle}deg;`
      + `--sw:${(dir * rand(22, 32)).toFixed(0)}deg;--t:${rand(2.2, 3.4).toFixed(2)}s;--in:${(0.25 + i * 0.12).toFixed(2)}s;${tilt[i]}">`
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
    if (still()) return;
    for (const j of pair) lamps[j].classList.add('off');
  }, 11000 + i * 700));
  setTimeout(() => {
    observer.disconnect();
    if (!still()) box.classList.add('done');
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

// Andelen synligt när en effekt tonar bort de sista 1,5 sekunderna före dur.
const fade = (t, dur) => Math.min(1, Math.max(0, (dur - t) / 1.5));

// Kör en canvas-effekt i dur sekunder. step(t, dt) flyttar och ritar. Två sekunder före slutet får
// rutan klassen done, så att ett mörkare omslag ljusnar igen samtidigt som effekten tonar bort.
// end ritar, om den finns, det som ska stå kvar när effekten är slut.
function play(box, area, dur, step, end) {
  area.start();
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const t = (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (t > dur - 2) box.classList.add('done');
    if (box.isConnected && t < dur) { step(t, dt); requestAnimationFrame(frame); }
    else { area.stop(); if (end) end(); }
  };
  requestAnimationFrame(frame);
}

// Fladdermusen i tolv lägen av vingslaget, ritad en gång och sedan kopierad, så att mobilen orkar
// med en hel svärm. zoom ger större bilder, så att fladdermöss som flyger mot kameran blir skarpa.
// Samma fladdermus som flyger förbi i säsongslagret (js/sasong.js).
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

// Fladdermöss: 130 fladdermöss flyger rakt mot kameran från så långt bort att de inte syns, mitt i
// omslaget, framför en stor fullmåne. Först dyker en liten svart klump upp, som växer och glesnar ju
// närmare de kommer, tills de susar förbi kameran och försvinner ut ur bild. De kommer fram vid olika
// tider, de flesta under de första åtta sekunderna.
function bats(box) {
  const dur = 12.8;
  // Små bilder för dem långt bort och stora för dem som kommer nära, eftersom det tar tid att krympa
  // stora bilder.
  const small = batFrames(1);
  const large = batFrames(3);
  const swarm = Array.from({ length: 130 }, () => {
    const r = Math.sqrt(Math.random());
    const a = rand(0, 6.3);
    return {
      // Var i flocken fladdermusen flyger, sett framifrån, och när den passerar kameran.
      ox: Math.cos(a) * r, oy: Math.sin(a) * r * 0.75, at: 2.6 + Math.random() ** 2 * 6, s: rand(9, 18),
      wob: rand(0.05, 0.12), wobHz: rand(0.3, 0.7), ph: rand(0, 6.3), flapHz: rand(3.2, 4.6),
    };
  });
  let t = 0;
  const moon = (a) => {
    const { ctx, w, h } = area;
    const x = w * 0.72;
    const y = h * 0.3;
    const r = Math.min(w, h) * 0.15;
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
  };
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const out = fade(t, dur);
    moon(Math.min(1, t / 1.2) * out);
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
  if (still()) {
    // Med minskad rörelse står månen och flocken still, när de första fladdermössen är nära.
    area.start();
    t = 2.4;
    step();
    draw();
    return;
  }
  play(box, area, dur, (now) => { t = now; step(); draw(); });
}

// Ett smalt lakansspöke med vågig fåll, s högt. wave flyttar fållens vågor och blink stänger ögonen.
function drawGhost(ctx, s, wave, blink) {
  const half = s * 0.3;
  const bottom = s * 0.55;
  ctx.beginPath();
  ctx.moveTo(-half, bottom);
  ctx.lineTo(-half, -s * 0.15);
  ctx.ellipse(0, -s * 0.15, half, s * 0.35, 0, Math.PI, 0);
  ctx.lineTo(half, bottom);
  // Fållen har tre flikar som böljar.
  for (let i = 0; i < 3; i += 1) {
    const x = half - (i + 0.5) * ((2 * half) / 3);
    const lift = s * (0.08 + 0.04 * Math.sin(wave + i * 1.7));
    ctx.quadraticCurveTo(x, bottom - lift * 2, half - (i + 1) * ((2 * half) / 3), bottom);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#1d0f2b';
  ctx.beginPath();
  for (const side of [-1, 1]) ctx.ellipse(side * s * 0.11, -s * 0.2, s * 0.05, s * 0.08 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.02, s * 0.045, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Spöken: 36 smala lakansspöken, ungefär tolv åt gången, stiger snabbt från omslagets nederkant
// medan de vaggar, böljar med fållen och blinkar. Där nere, bakom texten, är de nästan genomskinliga,
// och de blir tydligare ju högre de kommer. Små spöken är längre bort, svävar lite långsammare och
// syns svagare.
function ghosts(box) {
  const dur = 12.8;
  const crowd = Array.from({ length: 36 }, (_, i) => {
    const near = Math.random();
    return {
      // Spökena sprids jämnt i sidled, i blandad ordning, så att de inte klumpar ihop sig.
      d: 0.1 + (i / 36) * 9 + rand(0, 0.3), x: ((i * 0.618) % 1) * 0.84 + 0.08, s: 24 + near * 34,
      rise: 4.2 - near * 1.3, alpha: 0.6 + near * 0.25, sway: rand(8, 16), swayHz: rand(0.12, 0.22), ph: rand(0, 6.3),
      blinkPh: rand(0, 4),
    };
  }).sort((a, b) => a.s - b.s);
  let t = 0;
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    for (const g of crowd) {
      const age = t - g.d;
      if (age < 0) continue;
      const from = h + g.s * 0.6;
      const p = age / g.rise;
      const y = from - (from + g.s) * p;
      if (y < -g.s) continue;
      // Spöket börjar nästan genomskinligt vid nederkanten, blir tydligare när det stiger och tonar
      // bort mot överkanten.
      const a = Math.min(0.12 + p * 1.8, 1, (y + g.s) / (h * 0.25)) * fade(t, dur) * g.alpha;
      if (a <= 0) continue;
      const phase = age * g.swayHz * 6.283 + g.ph;
      ctx.save();
      ctx.translate(g.x * w + g.sway * Math.sin(phase), y);
      ctx.rotate(Math.cos(phase) * 0.12);
      ctx.globalAlpha = a;
      // Ögonen sluts en kort stund ungefär var tredje sekund.
      const blink = (age + g.blinkPh) % 3 < 0.14 ? 0.15 : 1;
      drawGhost(ctx, g.s, age * 4 + g.ph, blink);
      ctx.restore();
    }
  };
  const area = canvasIn(box, draw);
  if (still()) {
    // Med minskad rörelse svävar spökena still på olika höjd.
    area.start();
    t = 6;
    draw();
    return;
  }
  play(box, area, dur, (now) => { t = now; draw(); });
}

// Ett ren i galopp, vänd åt höger med hovarna vid y = 9. leg går från -1 till 1.
function drawReindeer(ctx, leg) {
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.ellipse(13, -10, 4, 2.6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  // Hals, horn och ben.
  ctx.moveTo(7, -1); ctx.lineTo(11, -9);
  ctx.moveTo(11, -12); ctx.lineTo(9, -19); ctx.moveTo(10, -16); ctx.lineTo(6, -18); ctx.moveTo(9.5, -15); ctx.lineTo(13, -19);
  ctx.moveTo(-10, -2); ctx.lineTo(-13, -4);
  for (const [x, dir] of [[6, 1], [-7, -1]]) {
    const a = leg * 0.7 * dir;
    ctx.moveTo(x, 2); ctx.lineTo(x + Math.sin(a + 0.5 * dir) * 9, 2 + Math.cos(a + 0.5 * dir) * 9);
    ctx.moveTo(x - 2, 2); ctx.lineTo(x - 2 + Math.sin(-a + 0.2 * dir) * 9, 2 + Math.cos(-a + 0.2 * dir) * 9);
  }
  ctx.stroke();
}

// Släden med tomten och säcken, vänd åt höger med medarna vid y = 10 och fronten vid x = 0.
function drawSled(ctx) {
  ctx.beginPath();
  ctx.moveTo(-50, 8); ctx.quadraticCurveTo(-52, 11, -48, 11); ctx.lineTo(-4, 11); ctx.quadraticCurveTo(3, 11, 2, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-46, -8); ctx.quadraticCurveTo(-50, -12, -45, -13); ctx.lineTo(-42, 6); ctx.lineTo(-10, 6);
  ctx.quadraticCurveTo(-4, 5, -4, -3); ctx.lineTo(-14, -4); ctx.lineTo(-18, -1); ctx.lineTo(-40, -1); ctx.closePath();
  // Säcken, tomten och mössan.
  ctx.moveTo(-36, -4); ctx.arc(-38, -9, 7, 0, Math.PI * 2);
  ctx.moveTo(-17, -6); ctx.arc(-24, -6, 7, 0, Math.PI * 2);
  ctx.moveTo(-19, -16); ctx.arc(-22.5, -16, 3.5, 0, Math.PI * 2);
  ctx.moveTo(-26, -18); ctx.lineTo(-19, -18.5); ctx.lineTo(-16, -25);
  ctx.fill();
}

// Tomtens släde: släden med tre renar flyger två gånger över omslagets övre del, först nära och
// sedan längre bort åt andra hållet, och lämnar ett spår av glittrande stjärnstoft som långsamt
// faller och slocknar. Små stjärnor tindrar på himlen hela tiden.
function sleigh(box) {
  const dur = 12.8;
  // När passagen börjar, hur länge den tar, åt vilket håll, på vilken höjd och hur stor släden är.
  const passes = [[0.3, 4.6, 1, 0.34, 1], [5.9, 4.6, -1, 0.2, 0.7]];
  const stars = Array.from({ length: 18 }, () => ({ x: rand(0.04, 0.96), y: rand(0.05, 0.55), r: rand(0.6, 1.4), hz: rand(0.4, 1.1), ph: rand(0, 6.3) }));
  const dust = [];
  let t = 0;
  let lastEmit = 0;
  // Var släden är t sekunder in, eller null mellan passagerna.
  const where = (time) => {
    const { w, h } = area;
    for (const [start, len, dir, level, scale] of passes) {
      const p = (time - start) / len;
      if (p < 0 || p > 1) continue;
      const u = scale * Math.min(1.4, Math.max(0.9, w / 300));
      const span = w + 260 * u;
      const x = dir > 0 ? -130 * u + span * p : w + 130 * u - span * p;
      // Släden stiger lite under passagen och gungar i takt med renarnas galopp.
      const y = h * (level + (0.5 - p) * 0.1) + Math.sin(time * 6) * 2 * u;
      return { x, y, dir, u };
    }
    return null;
  };
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const a = Math.min(1, t / 1.2) * fade(t, dur);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6d8';
    for (const s of stars) {
      ctx.globalAlpha = a * (0.35 + 0.35 * Math.sin(t * s.hz * 6.283 + s.ph));
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stjärnstoftet: små fyruddiga stjärnor som tindrar medan de slocknar.
    for (const d of dust) {
      const left = 1 - d.age / d.life;
      ctx.globalAlpha = Math.min(1, left * 1.5) * (0.6 + 0.4 * Math.sin(d.age * 18 + d.ph)) * fade(t, dur);
      ctx.fillStyle = d.c;
      const r = d.r;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - r * 2.2); ctx.lineTo(d.x + r * 0.5, d.y - r * 0.5); ctx.lineTo(d.x + r * 2.2, d.y);
      ctx.lineTo(d.x + r * 0.5, d.y + r * 0.5); ctx.lineTo(d.x, d.y + r * 2.2); ctx.lineTo(d.x - r * 0.5, d.y + r * 0.5);
      ctx.lineTo(d.x - r * 2.2, d.y); ctx.lineTo(d.x - r * 0.5, d.y - r * 0.5);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const sled = where(t);
    if (sled) {
      ctx.save();
      ctx.globalAlpha = 0.95 * fade(t, dur);
      ctx.translate(sled.x, sled.y);
      ctx.scale(sled.dir * sled.u, sled.u);
      ctx.rotate(-0.1);
      ctx.fillStyle = '#fff8ea';
      ctx.strokeStyle = '#fff8ea';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      drawSled(ctx);
      // Tömmarna från släden till det främsta renet.
      ctx.beginPath();
      ctx.moveTo(-4, -2); ctx.quadraticCurveTo(40, 4, 76, -4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.lineWidth = 1.8;
      [24, 50, 76].forEach((x, i) => {
        ctx.save();
        ctx.translate(x, -2);
        drawReindeer(ctx, Math.sin(t * 9 + i * 1.2));
        ctx.restore();
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
  const step = (dt) => {
    const sled = where(t);
    // Släden släpper stoft en bit bakom medarnas bakände, ungefär 80 korn i sekunden.
    if (sled) {
      while (lastEmit < t) {
        lastEmit += 1 / 80;
        dust.push({ x: sled.x - sled.dir * 57 * sled.u + rand(-4, 4), y: sled.y + rand(4, 16) * sled.u,
          vx: -sled.dir * rand(4, 26), vy: rand(6, 30), age: 0, life: rand(1.6, 3), r: rand(0.8, 2.2) * sled.u,
          ph: rand(0, 6.3), c: Math.random() < 0.6 ? '#ffd166' : '#ffffff' });
      }
    } else lastEmit = t;
    for (const d of dust) { d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    for (let i = dust.length - 1; i >= 0; i -= 1) if (dust[i].age >= dust[i].life) dust.splice(i, 1);
  };
  const area = canvasIn(box, draw);
  if (still()) {
    // Med minskad rörelse står släden still mitt i den första passagen, med stoftet bakom sig.
    area.start();
    for (t = 0; t < 2.9; t += 1 / 30) step(1 / 30);
    draw();
    return;
  }
  play(box, area, dur, (now, dt) => { t = now; step(dt); draw(); });
}

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
function blizzard(box) {
  const dur = 13;
  const img = softFlake();
  const flakes = Array.from({ length: 1200 }, (_, i) => {
    const s = 3 + Math.random() ** 1.8 * 7;
    const fall = 70 + s * 12;
    return {
      // De första flingorna finns redan på omslaget när det vänds fram, utspridda över hela höjden.
      d: i < 280 ? -rand(0, 3.2) : rand(0, 9.5), x0: Math.random(), s, fall,
      alpha: 0.55 + (s / 9.5) * 0.4, r: rand(6, 22), hz: rand(0.3, 0.8), ph: rand(0, 6.3),
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
  if (still()) {
    // Med minskad rörelse hänger en glesare yra still över omslaget, med drivan färdig.
    flakes.length = 440;
    area.start();
    t = 10;
    for (const f of flakes) f.d = t - (rand(0, area.h) + 10) / f.fall;
    draw();
    return;
  }
  // När snöyran är slut ritas bara drivan.
  play(box, area, dur, (now) => { t = now; draw(); }, () => { flakes.length = 0; draw(); });
}
