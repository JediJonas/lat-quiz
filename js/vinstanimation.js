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
// käglorna korsar varandra blandas färgerna. Två av käglorna, ur olika par, lutar också lite mot och
// från kameran i takt med svepet: närmast kameran i ena änden och längst bort i den andra, som en
// lampa som vinklas på sitt stativ. Käglorna vrids och skalas med transform i css/style.css, så att
// mobilen bara behöver flytta färdiga lager.
function spotlights(box) {
  // Var lampan står (andel av bredden), om den lyser uppifrån eller nerifrån, färgen och åt vilket
  // håll den börjar svepa.
  const beams = [[0.1, 'top', '#ff5fb0', 1], [0.45, 'top', '#4fd8ff', -1], [0.88, 'top', '#ffd166', -1],
    [0.2, 'bottom', '#a98bff', -1], [0.62, 'bottom', '#7cf0b0', 1], [0.95, 'bottom', '#ff8a5c', 1]];
  // Två lampor ur olika par lutar, så att de inte står bredvid varandra.
  const pairs = spotlightPairs(beams.map(([x]) => x));
  const tilting = [...pairs].sort(() => Math.random() - 0.5).slice(0, 2).map((pair) => pick(pair));
  box.innerHTML = beams.map(([x, side, c, dir], i) => {
    const angle = side === 'top' ? (x - 0.5) * 50 : 180 + (0.5 - x) * 50;
    return `<div class="spot-beam ${side}${tilting.includes(i) ? ' tilt' : ''}" style="left:${x * 100}%;--c:${c};--a:${angle}deg;`
      + `--sw:${(dir * rand(22, 32)).toFixed(0)}deg;--t:${rand(2.2, 3.4).toFixed(2)}s;--in:${(0.25 + i * 0.12).toFixed(2)}s">`
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

// En stor fullmåne med ett varmt sken runt sig, som fladdermössen och tomtens släde flyger framför.
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

// Ett runt och gulligt spöke, s högt, med stort huvud, små armar och droppande fåll. Den ena armen
// vinkar. wave böljar fållen och armen, och blink stänger ögonen.
function drawGhost(ctx, s, wave, blink) {
  const u = s;
  const wag = Math.sin(wave * 0.7) * 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.3 * u, 0.4 * u);
  // Vänster sida med en liten arm som pekar ut och ner.
  ctx.bezierCurveTo(-0.32 * u, 0.3 * u, -0.33 * u, 0.22 * u, -0.35 * u, 0.16 * u);
  ctx.bezierCurveTo(-0.44 * u, 0.2 * u, -0.53 * u, 0.17 * u, -0.5 * u, 0.1 * u);
  ctx.bezierCurveTo(-0.47 * u, 0.04 * u, -0.4 * u, 0.03 * u, -0.37 * u, 0.0 * u);
  // Det runda huvudet.
  ctx.bezierCurveTo(-0.42 * u, -0.25 * u, -0.27 * u, -0.5 * u, 0, -0.5 * u);
  ctx.bezierCurveTo(0.27 * u, -0.5 * u, 0.4 * u, -0.28 * u, 0.37 * u, -0.1 * u);
  // Höger arm vinkar uppåt.
  ctx.bezierCurveTo(0.42 * u, -0.16 * u, 0.48 * u, (-0.26 + wag) * u, 0.53 * u, (-0.22 + wag) * u);
  ctx.bezierCurveTo(0.58 * u, (-0.17 + wag) * u, 0.5 * u, 0.0 * u, 0.36 * u, 0.08 * u);
  ctx.bezierCurveTo(0.34 * u, 0.2 * u, 0.33 * u, 0.3 * u, 0.32 * u, 0.4 * u);
  // Fållen droppar i fyra rundade flikar.
  for (let i = 0; i < 4; i += 1) {
    const x0 = 0.32 - i * 0.155;
    const x1 = x0 - 0.155;
    const drop = 0.13 + 0.03 * Math.sin(wave + i * 1.7) + (i % 2 ? 0.02 : 0);
    ctx.bezierCurveTo((x0 + 0.01) * u, (0.4 + drop) * u, (x1 - 0.01) * u, (0.4 + drop) * u, x1 * u, 0.4 * u);
  }
  ctx.closePath();
  ctx.fillStyle = '#f6f3f8';
  ctx.fill();
  // Ögon, öppen glad mun och rosa kinder.
  ctx.fillStyle = '#1d0f2b';
  ctx.beginPath();
  ctx.ellipse(-0.13 * u, -0.17 * u, 0.045 * u, 0.062 * u * blink, 0, 0, Math.PI * 2);
  ctx.ellipse(0.11 * u, -0.2 * u, 0.045 * u, 0.062 * u * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.09 * u, -0.06 * u);
  ctx.quadraticCurveTo(0, -0.1 * u, 0.08 * u, -0.09 * u);
  ctx.bezierCurveTo(0.09 * u, 0.02 * u, -0.08 * u, 0.04 * u, -0.09 * u, -0.06 * u);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,140,160,0.45)';
  ctx.beginPath();
  ctx.ellipse(-0.22 * u, -0.08 * u, 0.045 * u, 0.026 * u, 0, 0, Math.PI * 2);
  ctx.ellipse(0.2 * u, -0.11 * u, 0.045 * u, 0.026 * u, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Spöken: 36 runda och gulliga spöken, ungefär tolv åt gången, stiger snabbt från omslagets nederkant
// medan de vaggar, böljar med fållen och blinkar. Där nere, bakom texten, är de nästan genomskinliga,
// och de blir tydligare ju högre de kommer. Små spöken är längre bort, svävar lite långsammare och
// syns svagare. Sex av dem svävar dessutom mot kameran medan de stiger, växer allt snabbare och
// susar förbi över överkanten.
function ghosts(box) {
  const dur = 12.8;
  // Sex av spökena, jämnt utspridda i tiden, svävar mot kameran medan de stiger.
  const toward = new Set([3, 9, 15, 21, 27, 33]);
  const crowd = Array.from({ length: 36 }, (_, i) => {
    const near = Math.random();
    const g = {
      // Spökena sprids jämnt i sidled, i blandad ordning, så att de inte klumpar ihop sig.
      d: 0.1 + (i / 36) * 9 + rand(0, 0.3), x: ((i * 0.618) % 1) * 0.84 + 0.08, s: 24 + near * 34,
      rise: 4.2 - near * 1.3, alpha: 0.6 + near * 0.25, sway: rand(8, 16), swayHz: rand(0.12, 0.22), ph: rand(0, 6.3),
      blinkPh: rand(0, 4), flip: Math.random() < 0.5 ? -1 : 1,
    };
    // Det börjar litet och långt bort vid nederkanten och glider utåt åt sitt håll. Det hinner
    // susa förbi innan effekten är slut.
    if (toward.has(i)) {
      Object.assign(g, { toward: true, d: Math.min(g.d, 7), life: rand(4.7, 6), out: Math.cos(rand(0, 6.3)) * rand(0.06, 0.16), s: 14, alpha: 0.85 });
    }
    return g;
  });
  let t = 0;
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const list = [];
    for (const g of crowd) {
      const age = t - g.d;
      if (age < 0) continue;
      const phase = age * g.swayHz * 6.283 + g.ph;
      if (g.toward) {
        const p = age / g.life;
        if (p >= 1) continue;
        // Perspektiv: avståndet till kameran krymper, så att spöket växer allt snabbare. Det stiger
        // från nederkanten och susar sista biten upp över överkanten.
        const k = 1 / (1 - 0.93 * p);
        // Tonar in som de andra och tonar bort när det susar förbi kameran.
        const a = Math.min(0.12 + p * 2.5, 1, (1 - p) / 0.22) * fade(t, dur) * g.alpha;
        if (a > 0) {
          list.push({ g, age, phase, a, s: g.s * k, x: w * (0.5 + g.out * k) + g.sway * 0.4 * Math.sin(phase) * k,
            y: h * (0.45 + (0.5 - 0.7 * p) * k) });
        }
        continue;
      }
      const from = h + g.s * 0.6;
      const p = age / g.rise;
      const y = from - (from + g.s) * p;
      if (y < -g.s) continue;
      // Spöket börjar nästan genomskinligt vid nederkanten, blir tydligare när det stiger och tonar
      // bort mot överkanten.
      const a = Math.min(0.12 + p * 1.8, 1, (y + g.s) / (h * 0.25)) * fade(t, dur) * g.alpha;
      if (a > 0) list.push({ g, age, phase, a, s: g.s, x: g.x * w + g.sway * Math.sin(phase), y });
    }
    // De närmaste ritas sist, så att de hamnar framför.
    list.sort((p, q) => p.s - q.s);
    for (const { g, age, phase, a, s, x, y } of list) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.cos(phase) * 0.12);
      // Hälften är spegelvända, så att de vinkar åt olika håll.
      ctx.scale(g.flip, 1);
      ctx.globalAlpha = a;
      // Ögonen sluts en kort stund ungefär var tredje sekund.
      const blink = (age + g.blinkPh) % 3 < 0.14 ? 0.15 : 1;
      drawGhost(ctx, s, age * 4 + g.ph, blink);
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

// Siluetten av tomten i släden och fyra renar, vänd åt höger, 2601 × 734 enheter. Den kommer från
// "Santa's sleigh and reindeer silhouette" på freesvg.org (public domain, CC0), med koordinaterna
// avrundade till heltal. Path2D skapas först när den behövs.
const SLEIGH_PATH = 'M2394 38c4-5 9-13 16-11c0 4-1 9-2 13c-20 27-18 61-2 77c-2-8-6-15-6-23c6-25 21-25 49-36c15-6 14-7 22-6c0 1 0 3 0 4c-18 20-40 11-51 27c-8 11-2 24 0 36c3-7 4-16 9-22c8-6 26-9 36-13c3-3 6-7 9-10c2-1 5-2 8-2c1 8-3 16-10 20c4 1 12 5 8 10c-12-1-16-11-39-1c-9 5-9 17-11 25c10-10 19-25 23-12c-8 4-14 12-15 21c3 6 11 7 18 9c13 4 12 2 19 16c9 1 19-2 28-5c9-1 17 7 26 4c12-4 26-21 24 4c-1 7 3 12 4 19c-5 3-11 4-17 4c-18 16-18 11-16 19c2 7 8 17 16 26c9 11 14 11 15 41c-2-3-4-7-6-10c1 11 2 23-3 33c-1-3-2-5-3-8c-1 16-5 23-7 26c0-2-1-6-1-8c-5 11-10 24-23 28c1-3 3-6 5-9c-2 2-4 3-6 5c2 10 9 17 14 25c12 4 13 4 23 6c23 4 11 15 34 45c0 2 0 4 0 6c-9 11-15 8-23 15c-9 23 1 23-19 36c-18 11-21 30-62 47c2-9 1-17 1-26c0-7 8-8 13-9c6-2 14 2 19-4c36-32 26-20 32-36c-11 6-21 12-32 17c-10 7-23 19-40 18c4-10 4-21 6-32c1-2 3-4 6-4c34 3 27 3 43-5c7-4 13-7 19-12c2-7-3-6-31-40c-90-5-82 0-82-20c-88 15-107-22-125-25c-10 4-16 15-25 20c-29 15-67-9-90 19c-28 32-61 38-54 49c3 7 8 12 13 18c3 4 3 9 4 13c-9 3-19 4-29 4c-17-38-17-34-10-59c4 1 8 3 12 3c4-2 7-4 10-6c10-6 17-6 26-23c11-22 12-39 15-49c43 1 52-14 59-32c-95 9-106 43-239 156c-5 3-6 7-6 12c-1-2-3-4-4-5c1 9 0 17-1 26c-1-3-2-6-3-9c-2 12-4 25-15 32c1-3 2-7 2-10c-2 2-4 5-6 7c5 8 12 14 19 20c10 5 34-4 41 7c9 15 22 27 27 33c-1 11-12 16-20 23c-1 8 0 17-1 25c-2 9-10 14-15 21c-20 30-14 30-45 54c0-21-9-29-2-33c6-4 13-8 21-7c11-11 18-24 28-36c0-4 0-7 0-11c-9 8-17 15-26 23c-11 11-20 25-36 27c1-9 0-18-1-27c1-14 0-8 34-15c10-8 20-16 29-25c-1-3-3-7-6-8c-12-7-22-16-34-23c0 0-32 6-77 12c-7-1-7-9-8-14c-18 8-37 12-56 15c-42 6-66-19-75-9c-7 9-12 20-22 26c-28 16-64 4-81 37c-21 37-40 39-41 54c4 8 12 12 18 17c4 3 5 8 6 12c-8 5-18 8-27 10c-18-22-27-31-23-55c4 0 8 1 12 0c5-4 10-10 15-14c7-5 11-13 13-21c10-35-1-52 8-53c62-16 41-43 51-80c-29-8 20 7-126-65c13 31 25 24-9 42c-2 8-4 16-6 23c-3 7-11 10-16 15c-24 20-16 23-55 42c4-21-2-27 4-31c7-3 15-4 22-3c5-2 31-26 32-27c2-3 2-7 2-10c-10 6-20 11-30 17c-11 8-23 18-38 17c6-16 3-34 11-33c9 1 19 1 28 2c11-5 22-11 32-18c-1-3-1-6-3-8c-10-9-18-20-27-30c-25 1-49-2-74-4c-5-3-3-10-3-14c-28 4-63 5-89-8c-18-9-27-20-34-14c-8 6-9 11-22 18c-28 12-55-8-81 14c-1 1-20 22-39 32c-6 4-13 7-16 14c1 9 9 15 14 22c2 7 2 6 2 11c-6 2-13 3-27 4c-17-33-16-37-10-56c3 1 7 2 10 3c7-4 13-8 20-11c14-7 23-32 26-47c1-6 1-17 7-17c15 0 30-2 42-11c-103 4-140 33-212 69c-7 4-7 4-10 5c-4 6-3 7-11 13c1-3 1-6 2-9c-2 2-4 4-5 6c4 7 11 13 17 19c5 5 28 1 39 4c6 6 14 22 30 36c1 11-8 15-17 23l-1 2c-3 12 3 26-7 36c-22 19-13 33-55 64c-2-24-7-26-3-32c5-4 11-6 16-8c2 0 4 0 6 0c6-5 15-20 26-32c4-4 2-9 3-14c-10 8-20 16-29 25c-11 11-18 22-33 24c1-11-1-21-1-32c0-10 29-4 37-12c9-7 18-15 26-23c-5-10 3 0-40-32c-24 5-60 10-79 12c-4-4-5-9-5-15c-17 8-43 13-61 15c-42 4-62-21-71-9c-18 22-9 28-64 37c-36 5-33 26-62 56c-7 6-15 13-19 22c4 8 11 13 18 18c5 3 6 8 8 13c-8 5-18 8-27 11c-19-25-26-29-22-56c13 2 10 2 18-6c9-10 29-12 26-78c0-5 6-4 10-6c51-12 40-49 43-70c-58-24-115-51-174-73c-19-7-39-12-58-20c-66-23-117-52-156-18c4 3 7 6 10 10c-9 12-5 7-20 9c-3 9-3 18-3 28c0 25 13 37 22 46c4 4-3 10-7 7c-27-21-25-53-25-68c-8 3-16 1-24 4c-8 3-16 6-24 9c0 4-2 11 4 12c7 0 13-7 21-4c4 0 4 5 4 8c8 2 19 4 20 14c1 12-5 23-7 35c-3 16-4 32-5 49c59-13 42-69 75-104c11-12 30-15 45-7c26 14 19 56-5 58c-16 1-18-31 2-21c-2-4-2-9-7-10c-17 1-26 16 0 46c16 19 6 63-25 76c1 3 3 5 3 8c-2 9-15 12-20 5c-3-3 0-6 1-9c-5-3-10-2-13 2c7 15 14 31 27 43c8 10 47 14 58-6c6-10-4-23-15-21c-3 1-6 3-6 7c3 2 8 3 10 7c0 4-4 6-7 8c-4-2-7-4-10-7c-7-8 1-22 10-24c10 0 20 6 26 15c4 8 1 17-1 25c63-34 60-93 32-107c2 10 3 23-5 31c-9 9-23 10-34 5c-23-11-23-49 0-60c19-8 43 0 55 17c19 25 19 72-9 101c-44 45-108 38-125 39c-282-6-288 12-311-27c-14-24-1-42 16-42c29 0 26 51-9 29c18 32 25 27 43 28c-19-16-15-44 11-47c6 0 10 6 13 11c6 12-17 24-17 9c2-3 6-4 9-5c-1-2-2-4-4-5c-10-4-21 9-15 18c4 7 14 14 22 11c16-12 24-30 33-48c-2-1-4-3-6-4c-2 1-4 2-5 2c1 3 3 5 1 8c-5 7-18 2-18-6c0-4 3-6 6-8c-32 1-64-1-78-30c-16-35-13-70 18-95c19-15 13-58-9-60c-9-1-18 2-23 10c-4 6-2 14-1 20c2-5 3-11 6-15c8-9 31-9 32 10c0 18-12 38-37 30c-40-12-36-86 13-92c-2-5-3-12-9-13c1-1 2-2 3-3c-3-1-6-3-9-4c8-7 19-5 29-8c-1-2-1-3-2-5c7-2 14 0 21-2c6-7 16-3 22 2c-4 1-8 3-12 6c1 0 4 1 5 2c0 1 0 4 0 5c37 18 49 32 41 83c9 11 19 22 28 33c25-27 9-60 14-85c-9 3-16-4-18-12c5-1 7 3 11 5c3 0 5-3 6-6c-2-5-6-10-6-16c-11 1-6 0-11-6c1-1 3-3 4-4c0-3 0-5 0-8c-6 10-15 19-25 25c0 4 1 9-3 11c-10 4-22-9-15-19c4-6 11-3 15 0c23-42 20-68 71-59c8 2 9 11 12 18c3-1 5-2 8-2c5 4 9 10 8 16c-1 4-4 7-7 10c3 1 5 3 8 4c-1 3-2 5-3 8c12 5 10 2 16 16c3 6 7 12 7 20c1 5 0 10 2 14c4 4 10 1 13-3c3-4-2-8-4-11c3 1 6 2 9 5c0 1-1 4-1 5c0 1 1 2 1 2c5-3 9 0 14 2c12-11 14-10 30-7c46-47 120-1 193 21c24 7 56 18 192 78c0-2 0-4 0-7c2 1 5 3 7 4c-4-7-5-15-3-22c2 4 4 7 7 11c-1-7-4-16 4-20c0 2 0 6 0 8c4-4 7-10 13-12c1 8-7 11-7 19c-1 7-2 15 4 21c7-1 12-6 18-9c15-8 46-15 77-6c11 3 49 7 65 0c17-7 18-10 24-14c12-7 26 1 29-55c-31-13-32-18-38-33c-30 12-25 13-37 13c16-27 25-23 41-22c-2-3-3-9-8-9c-46-3-47 1-66-13c-12-15-43-13-47-33c-2-10-4-20-1-30c7 7 4 18 9 26c4 9 16 10 24 14c-9-28-12-64 10-81c7 8 0 19-3 27c-5 22 0 49 20 63c-3-7-8-13-10-21c-1-27 18-31 42-48c5-4 11-7 17-10c1 1 3 2 3 3c-1 6-8 12-14 17c-10 7-25 9-30 21c-6 12 3 25 7 36c3-26-3-23 31-41c11-5 9-18 19-18c2 8 0 16-6 21c4 1 10 1 11 6c1 5-11 1-16 0c-33 4-28 23-28 36c13-21 11-24 20-17c-8 5-10 15-11 24c8 7 20 5 30 6c6 2 9 7 13 11c6-2 10-3 17-6c3-2 6-4 10-5c7-1 13 2 20 1c11-3 16-14 23-16c3 2 4 5 6 8c-1 7 3 13 7 18c0 8-10 8-15 10c-4 4-8 10-12 14c-9 8 32 38 33 39c4 5 7 11 13 28c-3-3-6-5-8-8c5 16 6 14 5 32c-2-2-4-4-6-7c1 6 1 12 1 19c-1 1-2 2-4 3l-1-3c0 1-1 4-1 6c0 0 66-33 66-33c51-25 104-37 160-37c9-17 2-12 16-42c-5-1-6-1-11-5c-2-4-2-8-1-12c2 2 5 4 7 5c-3-7-2-14 1-21c1 4 3 7 5 11c1-6 0-16 8-18c-1 3-1 6-2 8c4-3 7-6 11-9l4 0c-1 2-2 5-4 7c-8 6-10 17-8 27c2 3 6 1 9 0c23-10 54-6 73 1c15 9 32 14 49 17c15 4 31 1 45-6c20-8 21 9 39-46c-24-18-25-19-28-38c-35 7-28 7-37 3c20-18 23-17 43-11c-2-3-2-9-7-10c-41-12-48-9-63-32c-10-10-27-14-32-29c-1-11-1-23 5-32c5 8 0 17 3 26c2 10 13 12 19 19c-2-16-2-32 5-47c4-10 10-22 21-26c5 10-5 18-9 26c-8 19-9 45 6 60c-5-20-10-20 2-37c7-10 19-11 29-15c11-3 20-10 32-10c0 2-1 4-1 6c-7 6-15 11-25 13c-34 7-27 24-23 46c2-7 3-15 8-22c9-5 20-8 30-10c8-2 14-17 20-12c1 7-3 14-9 18c4 2 10 4 8 9c-6 2-11-4-17-4c-28-2-29 12-31 27c5-6 10-12 16-17c2 2 4 4 6 6c-8 4-12 12-16 20c6 7 16 8 25 11c6 2 8 8 11 14c8 0 16-2 24-4c8-2 14 4 22 4c11 0 21-13 26-8c4 6-1 14 3 20c1 3 3 6 1 9c-4 4-10 3-15 4c-5 4-10 9-16 13c6 27 24 34 27 46c2 8 3 16 4 23c-2-3-4-6-6-9c2 11 2 22-2 32c-1-3-2-5-3-8c0 9-3 17-6 25c0-3-1-5-1-8c-5 11-10 22-21 27c1-2 3-7 4-9c-1 1-4 4-5 5c0 7 5 12 9 17c111 55-75-43 158 80c0-5-1-10 0-15c2 3 5 6 7 10c-1-7-4-16 4-21c0 3 0 6 1 9c4-5 7-10 12-13c1 6-3 10-6 14c-2 9-3 19 3 26c7-4 37-27 85-19c18 6 37 6 56 6c24 0 40-19 48-20c6-2 13-5 16-12c5-11 6-29 7-41c-25-9-32-16-38-32c-32 14-27 14-37 12c17-23 18-23 41-22c-2-3-3-6-5-9c-15 0-29-2-44-2c-10 0-20-5-27-12c-17-19-54-5-48-61c2 2 5 3 5 6c7 34 11 23 29 34c-14-42-2-80 11-80c5 11-5 21-5 33c-3 20 3 45 22 56c-4-9-14-18-11-29c2-8 5-17 13-22c46-29 38-27 47-28c0 3 0 6-2 8c-22 29-61 15-34 69c1-8 0-16 3-23c9-9 21-13 32-20c5-5 6-14 14-16c3 8 1 17-5 23c3 1 7 1 10 3c1 2 0 4 1 6c-7-1-26-8-41 9c-4 7-3 16-3 24c13-19 10-24 19-18c0 3-3 5-5 7c-3 5-5 12-5 18c9 8 22 4 32 7c4 2 7 7 10 10c8-2 16-5 23-10c8-5 17 1 25-1c8-3 13-11 21-15c4 2 3 1 5 2c2 5 2 10 4 16c5 9 9 9 2 15c-16 6-7-2-25 21c7 13 17 23 29 31c12 7 15 21 19 33c-3-3-5-5-8-8c1 4 3 9 4 13c125-106 146-150 248-158c3-10 5-15 10-24c-17-6-14-11-14-17c1 0 2 0 3 1c1 1 3 3 5 4c-5-12 0-20 1-22c1 4 2 7 4 11c1-4 1-8 2-12c1-2 2-4 3-5c1 0 3-1 4-1c-1 3-1 6-1 8c4-3 8-6 12-10c1 0 2 1 3 1c-4 9-7 7-11 14c-2 8-6 16-1 24c9-3 19-7 29-8c23-2 48 1 68 13c45 19 69 15 86 6c7-4 15-1 22-6c10-7 15-24 21-42c-26-20-27-21-30-40c-32 5-29 8-39 4c21-19 24-18 46-12c-4-9 5-9-45-20c-20-4-26-23-33-27c-28-19-34-18-27-56c1-2 2-3 4-4c4 9-1 19 3 28c2 9 13 11 19 18C2379 78 2380 60 2394 38M286 316c-1 9-10 16-19 13c1 1 1 3 2 4c6-2 13-5 19-8C288 322 287 319 286 316M213 428c19 17 38 34 62 45c0-17 2-34 4-51C257 423 235 432 213 428z';
let sleighShape = null;
const sleighSilhouette = () => (sleighShape ||= new Path2D(SLEIGH_PATH));

// Tomtens släde: en svart siluett av släden och fyra renar flyger två gånger över omslaget, först
// stor och rakt framför en fullmåne och sedan mindre och högre upp åt andra hållet. Släden lämnar
// ett spår av glittrande stjärnstoft som långsamt faller och slocknar, och små stjärnor tindrar på
// himlen hela tiden.
function sleigh(box) {
  const dur = 12.8;
  // När passagen börjar, hur länge den tar, åt vilket håll, på vilken höjd och hur bred den är.
  const passes = [[0.3, 5, 1, 0.32, 0.95], [6.2, 4.6, -1, 0.25, 0.55]];
  const stars = Array.from({ length: 18 }, () => ({ x: rand(0.04, 0.96), y: rand(0.05, 0.55), r: rand(0.6, 1.4), hz: rand(0.4, 1.1), ph: rand(0, 6.3) }));
  const dust = [];
  let t = 0;
  let lastEmit = 0;
  // Siluetten ritas en gång för varje passage, i rätt storlek och riktning, så att mobilen bara
  // behöver kopiera en bild i varje bildruta.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const sprites = new Map();
  const sprite = ({ dir, k }) => {
    const key = `${dir}|${k}`;
    if (!sprites.has(key)) {
      const img = document.createElement('canvas');
      img.width = Math.ceil(2700 * k * dpr);
      img.height = Math.ceil(1000 * k * dpr);
      const c = img.getContext('2d');
      c.translate(img.width / 2, img.height / 2);
      c.scale(dir * k * dpr, k * dpr);
      c.rotate(-0.05);
      c.translate(-1300, -367);
      c.fillStyle = '#120a14';
      c.fill(sleighSilhouette());
      sprites.set(key, img);
    }
    return sprites.get(key);
  };
  // Var siluettens mitt är t sekunder in och hur mycket den skalas, eller null mellan passagerna.
  const where = (time) => {
    const { w, h } = area;
    for (const [start, len, dir, level, width] of passes) {
      const p = (time - start) / len;
      if (p < 0 || p > 1) continue;
      const k = (w * width) / 2601;
      const half = 1300 * k;
      const x = dir > 0 ? -half + (w + 2 * half) * p : w + half - (w + 2 * half) * p;
      // Släden stiger lite under passagen och gungar sakta.
      const y = h * (level + (0.5 - p) * 0.08) + Math.sin(time * 3) * 2;
      return { x, y, dir, k };
    }
    return null;
  };
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const a = Math.min(1, t / 1.2) * fade(t, dur);
    drawMoon(ctx, w * 0.62, h * 0.33, Math.min(w, h) * 0.2, a);
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
      ctx.globalAlpha = fade(t, dur);
      const img = sprite(sled);
      ctx.drawImage(img, sled.x - img.width / dpr / 2, sled.y - img.height / dpr / 2, img.width / dpr, img.height / dpr);
    }
    ctx.globalAlpha = 1;
  };
  const step = (dt) => {
    const sled = where(t);
    // Släden släpper stoft bakom medarnas bakände, ungefär 80 korn i sekunden.
    if (sled) {
      const u = sled.k * 9;
      while (lastEmit < t) {
        lastEmit += 1 / 80;
        dust.push({ x: sled.x - sled.dir * 1260 * sled.k + rand(-4, 4), y: sled.y + 200 * sled.k + rand(-4, 8) * u,
          vx: -sled.dir * rand(4, 26), vy: rand(6, 30), age: 0, life: rand(1.6, 3), r: rand(0.8, 2.2) * Math.max(1, u),
          ph: rand(0, 6.3), c: Math.random() < 0.6 ? '#ffd166' : '#ffffff' });
      }
    } else lastEmit = t;
    for (const d of dust) { d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    for (let i = dust.length - 1; i >= 0; i -= 1) if (dust[i].age >= dust[i].life) dust.splice(i, 1);
  };
  const area = canvasIn(box, draw);
  if (still()) {
    // Med minskad rörelse står släden still framför månen, med stoftet bakom sig.
    area.start();
    for (t = 0; t < 3.2; t += 1 / 30) step(1 / 30);
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
