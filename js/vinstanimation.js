// Vinstanimationen på vinnarkortet: konfetti, fyrverkeri eller strålkastare, och i
// säsongskategorierna en fladdermussvärm eller godisregn i Halloween och tomtens släde eller
// snöstorm i Jul.
// Den ligger bakom texten på omslaget och håller på i ungefär 13 sekunder. Med minskad rörelse
// står den still, som ett foto. Valet slumpas per match men blir detsamma på alla enheter
// (pickWinEffect).

import { drawBat } from './sasong.js';

export const WIN_EFFECTS = ['konfetti', 'fyrverkeri', 'stralkastare'];
// Säsongskategorierna har egna effekter i stället för de vanliga.
export const SEASON_WIN_EFFECTS = { halloween: ['fladdermoss', 'godis'], jul: ['slade', 'snoyra'] };

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
  else if (effect === 'godis') confetti(box, candy());
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
// Med sprites faller i stället färdigritade bilder, till exempel godis och pumpor (candy), som
// tumlar men aldrig blir helt platta.
function confetti(box, sprites) {
  const colors = ['#ffd166', '#ffffff', '#7cf0b0', '#ff9ecb'];
  const pieces = Array.from({ length: sprites ? 80 : 110 }, (_, i) => {
    const kind = Math.random() < 0.3 ? 'dala' : Math.random() < 0.67 ? 'flippa' : 'snurra';
    const dala = kind === 'dala';
    return {
      kind, i, x: rand(-0.02, 1.02), y: -rand(20, 60), c: colors[i % colors.length],
      // De första bitarna släpps genast, så att det börjar regna direkt.
      d: i < 24 ? rand(-0.8, 0.4) : rand(0, dala ? 6.5 : 7.8),
      w: sprites ? rand(24, 34) : rand(8, 11), h: kind === 'snurra' ? rand(8, 10) : rand(13, 18),
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
      if (sprites) {
        ctx.scale(1, Math.max(Math.abs(flip), 0.35));
        ctx.globalAlpha = flip < 0 ? 0.8 : 0.95;
        const img = sprites[p.i % sprites.length];
        ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
        ctx.restore();
        continue;
      }
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

// Godiset i Halloween: pumpor med ansikte, inslagna karameller och candy corn, ritade en gång
// och sedan kopierade.
function candy() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const sprite = (paint) => {
    const img = document.createElement('canvas');
    img.width = img.height = Math.ceil(32 * dpr);
    const ctx = img.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.translate(16, 16);
    paint(ctx);
    return img;
  };
  const pumpkin = (ctx) => {
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    for (const [x, rx] of [[-6, 8], [6, 8], [0, 8]]) ctx.ellipse(x, 3, rx, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c24d00';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 3, 5, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#3f7a2a';
    ctx.fillRect(-1.5, -12, 3, 5);
    ctx.fillStyle = '#3a1500';
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-3, 0); ctx.lineTo(-5.5, -4);
    ctx.moveTo(8, 0); ctx.lineTo(3, 0); ctx.lineTo(5.5, -4);
    ctx.moveTo(-8, 5); ctx.quadraticCurveTo(0, 12, 8, 5); ctx.quadraticCurveTo(0, 8, -8, 5);
    ctx.fill();
  };
  const wrapped = (color) => (ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(-15, -6); ctx.lineTo(-15, 6);
    ctx.moveTo(7, 0); ctx.lineTo(15, -6); ctx.lineTo(15, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -5.5); ctx.lineTo(1, 5.5);
    ctx.stroke();
  };
  const corn = (ctx) => {
    const band = (y0, y1, color) => {
      const half = (y) => 10 * (1 - (y + 12) / 26);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-half(y0), y0); ctx.lineTo(half(y0), y0); ctx.lineTo(half(y1), y1); ctx.lineTo(-half(y1), y1);
      ctx.fill();
    };
    band(-12, -4, '#ffd23f');
    band(-4, 5, '#ff8a1a');
    band(5, 14, '#fff6e0');
  };
  return [pumpkin, wrapped('#9b4dff'), corn, pumpkin, wrapped('#3fcf7f'), corn, wrapped('#ff5fb0')].map(sprite);
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
// käglorna korsar varandra blandas färgerna. Käglorna vrids med transform i css/style.css, så att
// mobilen bara behöver vrida färdiga lager.
function spotlights(box) {
  // Var lampan står (andel av bredden), om den lyser uppifrån eller nerifrån, färgen och åt vilket
  // håll den börjar svepa.
  const beams = [[0.1, 'top', '#ff5fb0', 1], [0.45, 'top', '#4fd8ff', -1], [0.88, 'top', '#ffd166', -1],
    [0.2, 'bottom', '#a98bff', -1], [0.62, 'bottom', '#7cf0b0', 1], [0.95, 'bottom', '#ff8a5c', 1]];
  box.innerHTML = beams.map(([x, side, c, dir], i) => {
    const angle = side === 'top' ? (x - 0.5) * 50 : 180 + (0.5 - x) * 50;
    return `<div class="spot-beam ${side}" style="left:${x * 100}%;--c:${c};--a:${angle}deg;`
      + `--sw:${(dir * rand(22, 32)).toFixed(0)}deg;--t:${rand(2.2, 3.4).toFixed(2)}s;--in:${(0.25 + i * 0.12).toFixed(2)}s"><span></span></div>`;
  }).join('');
  // Käglorna är lite längre än omslagets diagonal, så att de alltid når över hela omslaget.
  const size = () => box.style.setProperty('--len', `${Math.round(Math.hypot(box.offsetWidth, box.offsetHeight) * 1.1)}px`);
  size();
  const observer = new ResizeObserver(size);
  observer.observe(box);
  // Efter elva sekunder slocknar ljuset långsamt, så att det är slut efter ungefär 13 sekunder.
  setTimeout(() => {
    observer.disconnect();
    if (!still()) box.classList.add('done');
  }, 11000);
}

// Andelen synligt när en effekt tonar bort de sista 1,5 sekunderna före dur.
const fade = (t, dur) => Math.min(1, Math.max(0, (dur - t) / 1.5));

// Kör en canvas-effekt i dur sekunder. step(t, dt) flyttar och ritar. Två sekunder före slutet får
// rutan klassen done, så att ett mörkare omslag ljusnar igen samtidigt som effekten tonar bort.
function play(box, area, dur, step) {
  area.start();
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const t = (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (t > dur - 2) box.classList.add('done');
    if (box.isConnected && t < dur) { step(t, dt); requestAnimationFrame(frame); }
    else area.stop();
  };
  requestAnimationFrame(frame);
}

// Fladdermusen i åtta lägen av vingslaget, ritad en gång och sedan kopierad, så att mobilen orkar
// med en hel svärm. Samma fladdermus som flyger förbi i säsongslagret (js/sasong.js).
function batFrames() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  return Array.from({ length: 8 }, (_, i) => {
    const img = document.createElement('canvas');
    img.width = img.height = Math.ceil(64 * dpr);
    const ctx = img.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#170a22';
    drawBat(ctx, 32, 34, 30, Math.sin((i / 8) * Math.PI * 2));
    return img;
  });
}

// Fladdermöss: en svärm på 300 fladdermöss väller upp ur omslagets nederkant, som ur en grotta,
// framför en stor fullmåne. Strömmen slingrar sig fram och tillbaka medan den stiger, och svärmen
// är tätast de första sekunderna. Små fladdermöss är längre bort och syns svagare, och några stora
// susar förbi nära.
function bats(box) {
  const dur = 12.8;
  const frames = batFrames();
  // Strömmens riktning och var den väller upp, t sekunder in.
  const heading = (time) => -Math.PI / 2 + 0.5 * Math.sin(time * 1.6);
  const origin = (time) => 0.5 + 0.3 * Math.sin(time * 0.9 + 0.6);
  const swarm = Array.from({ length: 300 }, (_, i) => {
    // Över hälften släpps de första tre sekunderna, resten glesare fram till nio sekunder.
    const d = i < 170 ? rand(0, 3) : rand(3, 9);
    const close = i % 50 === 0;
    const near = close ? 1.6 : Math.random();
    return {
      d, x0: origin(d) + rand(-0.06, 0.06), a: heading(d) + rand(-0.25, 0.25), s: 5 + near * 14,
      speed: close ? 280 : 100 + near * 110, turn: rand(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1),
      turnHz: rand(0.3, 0.7), ph: rand(0, 6.3), flapHz: rand(7, 10) + (1 - Math.min(near, 1)) * 3,
      alpha: Math.min(0.95, 0.45 + near * 0.5),
    };
  }).sort((a, b) => a.s - b.s);
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
    for (const b of swarm) {
      if (b.x === undefined || b.out) continue;
      ctx.globalAlpha = b.alpha * out;
      const frame = frames[Math.floor(((((t - b.d) * b.flapHz + b.ph) % 1) + 1) % 1 * 8)];
      ctx.drawImage(frame, b.x - b.s * (32 / 30), b.y - b.s * (34 / 30), b.s * (64 / 30), b.s * (64 / 30));
    }
    ctx.globalAlpha = 1;
  };
  // Varje fladdermus svänger lite fram och tillbaka, så att svärmen ser levande ut.
  const step = (dt) => {
    const { w, h } = area;
    for (const b of swarm) {
      const age = t - b.d;
      if (age < 0 || b.out) continue;
      if (b.x === undefined) { b.x = b.x0 * w; b.y = h + b.s; }
      const a = b.a + b.turn * Math.sin(age * b.turnHz * 6.283 + b.ph);
      b.x += Math.cos(a) * b.speed * dt;
      b.y += Math.sin(a) * b.speed * dt;
      if (b.y < -40 || b.x < -40 || b.x > w + 40) b.out = true;
    }
  };
  const area = canvasIn(box, draw);
  if (still()) {
    // Med minskad rörelse står månen och svärmen still, mitt i flykten.
    area.start();
    for (t = 0; t < 2.2; t += 1 / 30) step(1 / 30);
    draw();
    return;
  }
  play(box, area, dur, (now, dt) => { t = now; step(dt); draw(); });
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
    // Släden släpper stoft bakom sig, ungefär 45 korn i sekunden.
    if (sled) {
      while (lastEmit < t) {
        lastEmit += 1 / 45;
        dust.push({ x: sled.x - sled.dir * 48 * sled.u + rand(-4, 4), y: sled.y + rand(-6, 10) * sled.u,
          vx: -sled.dir * rand(4, 22), vy: rand(6, 26), age: 0, life: rand(1.4, 2.6), r: rand(0.9, 2) * sled.u,
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

// Snöstorm: samma runda snö som i säsongslagret bakom sidan, men i en storm som virvlar i byar
// över omslaget och sedan avtar, tills det bara snöar stilla och glest. När det blåser hårt dras
// flingorna ut till korta streck. Längs nederkanten växer en låg snödriva, som håller sig under texten.
function blizzard(box) {
  const dur = 13;
  // Tre lager: små flingor långt bort, mellanstora och stora nära. Varje lager ritas i ett svep.
  const layers = [[0.8, 0.45], [1.3, 0.65], [1.9, 0.85]];
  const flakes = Array.from({ length: 240 }, (_, i) => ({
    layer: i % 3, x: Math.random(), y: Math.random(), fall: rand(30, 60) * (1 + (i % 3) * 0.3), ph: rand(0, 6.3),
  }));
  // Vindens styrka: en kraftig storm i början som mojnar under åtta sekunder.
  const strength = (time) => 20 + 300 * Math.exp(-time / 2.6);
  // Hur stor del av flingorna som är kvar: stormen glesnar till en tredjedel.
  const share = (time) => Math.max(0.3, 1 - Math.max(0, time - 2.5) / 7);
  let t = 0;
  let vx = 0;
  let vy = 0;
  const wind = (f, w, h) => {
    const W = strength(t);
    // Virvlar som vandrar över omslaget, så att snön slingrar sig i stället för att blåsa rakt.
    vx = W * (0.8 + 0.7 * Math.sin((f.y * h) * 0.022 + t * 1.3 + f.ph * 0.2));
    vy = f.fall + W * 0.55 * Math.cos((f.x * w) * 0.019 - t * 1.1);
  };
  const draw = () => {
    const { ctx, w, h } = area;
    ctx.clearRect(0, 0, w, h);
    const out = fade(t, dur);
    const shown = Math.round(flakes.length * share(t));
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    layers.forEach(([r, alpha], layer) => {
      ctx.globalAlpha = alpha * out;
      ctx.lineWidth = r * 2;
      ctx.beginPath();
      for (let i = layer; i < shown; i += 3) {
        const f = flakes[i];
        wind(f, w, h);
        const x = f.x * w;
        const y = f.y * h;
        // Strecket bakåt längs farten blir längre ju hårdare det blåser.
        ctx.moveTo(x - vx * 0.02, y - vy * 0.02);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    // Drivan växer under nio sekunder till högst 14 pixlar, så att den stannar under texten.
    const top = 14 * Math.min(1, Math.max(0, (t - 1) / 9));
    if (top > 0.5) {
      ctx.globalAlpha = 0.9 * out;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, h - top * (0.72 + 0.2 * Math.sin(x * 0.021 + 1.3) + 0.08 * Math.sin(x * 0.057)));
      ctx.lineTo(w, h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const step = (dt) => {
    const { w, h } = area;
    for (const f of flakes) {
      wind(f, w, h);
      f.x += (vx * dt) / w;
      f.y += (vy * dt) / h;
      // Flingor som blåser ut kommer in igen på andra sidan, så att stormen håller i sig.
      if (f.x > 1.03) f.x -= 1.06;
      if (f.x < -0.03) f.x += 1.06;
      if (f.y > 1.03) { f.y = -0.03; f.x = Math.random(); }
      if (f.y < -0.03) f.y += 1.06;
    }
  };
  const area = canvasIn(box, draw);
  if (still()) {
    // Med minskad rörelse står stormen still när den har mojnat lite, med drivan färdig.
    area.start();
    t = 10;
    for (const f of flakes) f.fall = 0;
    draw();
    return;
  }
  play(box, area, dur, (now, dt) => { t = now; step(dt); draw(); });
}
