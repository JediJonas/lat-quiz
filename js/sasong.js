// Säsongens stämning bakom sidan: snö som faller i Jul och löv som singlar ner i Halloween. Den
// följer kategorin på html-elementet, så den syns på startsidan när
// kategorin väljs och genom hela spelet, hos spelledaren och spelarna. Lagret ligger bakom allt
// innehåll och tar inte emot tryck. Med minskad rörelse står allt still, som en bild.

export const SEASON_EFFECTS = { jul: 'sno', halloween: 'lov' };

const rand = (min, max) => min + Math.random() * (max - min);
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const LEAF_COLORS = ['#e8730c', '#c9471a', '#f0a32a', '#8f3a12'];

// Medan vinstanimationen spelas tonar lagret bort och står still, så att mobilen inte behöver rita
// två animationer samtidigt. Sedan fortsätter det där det var.
let pausedUntil = 0;
export function pauseSeasonEffect(ms) {
  pausedUntil = performance.now() + ms;
}

// Färgerna står i CSS, så att de följer ljust och mörkt läge.
const color = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

function snow(n) {
  return Array.from({ length: n }, () => ({
    x: Math.random(), y: Math.random(), r: rand(1, 3.2), speed: rand(14, 40), sway: rand(0.4, 1.4), phase: rand(0, 6.3),
  }));
}

function leaves(n) {
  return Array.from({ length: n }, (_, i) => ({
    x: Math.random(), y: Math.random(), size: rand(7, 13), speed: rand(18, 36), sway: rand(0.5, 1.2),
    phase: rand(0, 6.3), spin: rand(-1.5, 1.5), c: LEAF_COLORS[i % LEAF_COLORS.length],
  }));
}

function drawFlake(ctx, f, w, h, t) {
  const x = f.x * w + Math.sin(t * f.sway + f.phase) * 12;
  ctx.beginPath();
  ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawLeaf(ctx, l, w, h, t) {
  ctx.save();
  ctx.translate(l.x * w + Math.sin(t * l.sway + l.phase) * 24, l.y);
  ctx.rotate(t * l.spin + l.phase);
  // Bladet vänder sig när det singlar, som papper i luften.
  ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(t * l.sway + l.phase)));
  ctx.fillStyle = l.c;
  ctx.beginPath();
  ctx.moveTo(0, -l.size);
  ctx.quadraticCurveTo(l.size * 0.8, 0, 0, l.size);
  ctx.quadraticCurveTo(-l.size * 0.8, 0, 0, -l.size);
  ctx.fill();
  ctx.restore();
}

// En fladdermus med vingar som slår. flap går från -1 till 1. Används av vinstanimationen.
export function drawBat(ctx, x, y, s, flap) {
  const lift = flap * s * 0.6;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + side * s * 0.5, y - s * 0.3 - lift, x + side * s, y - lift);
    ctx.quadraticCurveTo(x + side * s * 0.7, y + s * 0.05 - lift * 0.4, x + side * s * 0.55, y + s * 0.15);
    ctx.quadraticCurveTo(x + side * s * 0.3, y + s * 0.05, x, y + s * 0.2);
  }
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + s * 0.05, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function start(layer, effect) {
  const canvas = document.createElement('canvas');
  layer.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  // Färre bitar på en liten skärm, så att det känns lika glest och inte drar batteri i onödan.
  const count = () => Math.round(Math.min(120, Math.max(50, (innerWidth * innerHeight) / 7000)));
  let items = [];
  let last = performance.now();
  let frame = 0;

  // Bitarnas höjd står i pixlar och de skapas bara en gång. I iPhone ändras fönstrets höjd hela
  // tiden när sidan studsar eller verktygsfältet döljs, och om bitarna skapades om eller räknades
  // om efter höjden hoppade de, så att det såg ut som att de föll jättefort.
  const size = () => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!items.length) {
      items = effect === 'sno' ? snow(count()) : leaves(Math.round(count() / 3));
      for (const item of items) item.y *= h;
    }
    if (still()) draw(0);
  };

  const draw = (now) => {
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);
    if (effect === 'sno') {
      ctx.fillStyle = `rgb(${color(layer, '--season-snow')})`;
      for (const f of items) drawFlake(ctx, f, w, h, t);
    } else {
      ctx.globalAlpha = 0.75;
      for (const l of items) drawLeaf(ctx, l, w, h, t);
      ctx.globalAlpha = 1;
    }
  };

  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const paused = now < pausedUntil;
    layer.classList.toggle('paused', paused);
    if (paused) {
      frame = requestAnimationFrame(tick);
      return;
    }
    for (const item of items) {
      item.y += item.speed * dt;
      if (item.y > h + 20) { item.y = -20; item.x = Math.random(); }
    }
    draw(now);
    frame = requestAnimationFrame(tick);
  };

  size();
  addEventListener('resize', size);
  if (still()) draw(0);
  else frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener('resize', size);
    layer.replaceChildren();
  };
}

// Lägger lagret först i body och byter effekt när kategorin byts.
export function mountSeasonEffect() {
  const layer = document.createElement('div');
  layer.className = 'season-fx';
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  let current = null;
  let stop = () => {};
  const update = () => {
    const effect = SEASON_EFFECTS[document.documentElement.dataset.kategori] || null;
    if (effect === current) return;
    stop();
    current = effect;
    stop = effect ? start(layer, effect) : () => {};
  };
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-kategori'] });
  update();
}
