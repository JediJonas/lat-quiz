// Gemensamma visningsdelar för spelledare och spelare.

const RING_R = 54;
const RING_LEN = 2 * Math.PI * RING_R;

// Rund nedräkning: siffran i mitten och en vit ring som töms medurs.
export function renderRing(el, ms, totalMs, bonus) {
  if (!el.querySelector('svg')) {
    el.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="${RING_R}"/>
        <circle class="ring-bar" cx="60" cy="60" r="${RING_R}" stroke-dasharray="${RING_LEN}"/>
      </svg><span class="ring-num"></span>`;
  }
  const part = totalMs ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  // Positiv förskjutning fungerar i alla webbläsare (Safari på iPhone ritade den
  // negativa fel). Ringen är spegelvänd i CSS så att det tomma partiet växer medurs.
  el.querySelector('.ring-bar').style.strokeDashoffset = `${RING_LEN * (1 - part)}px`;
  el.querySelector('.ring-num').textContent = Math.ceil(ms / 1000);
  el.classList.toggle('bonus', bonus);
}

// Liten grå ring som töms medurs, som ringen vid gissningen. Mitt i står sekunderna som är kvar.
const PIE_R = 12;
const PIE_LEN = 2 * Math.PI * PIE_R;
export function renderPie(el, ms, totalMs) {
  if (!el.querySelector('svg')) {
    el.innerHTML = `<svg viewBox="0 0 28 28" aria-hidden="true">
        <circle class="pie-track" cx="14" cy="14" r="${PIE_R}"/>
        <circle class="pie-bar" cx="14" cy="14" r="${PIE_R}" stroke-dasharray="${PIE_LEN}"/>
      </svg><span class="pie-num" aria-hidden="true"></span>`;
  }
  el.querySelector('.pie-num').textContent = Math.ceil(ms / 1000);
  const part = totalMs ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  el.querySelector('.pie-bar').style.strokeDashoffset = `${PIE_LEN * (1 - part)}px`;
}

// Etiketter för en spelares läge i omgången, samma för spelledare och spelare.
// progress: { artist, title } medan låten spelas. result: rättning när svaret visas.
export function statusTags({ phase, progress, result, labels, esc, points = true }) {
  const tag = (cls, label) => `<span class="tag ${cls}">${esc(label)}</span>`;
  if (phase === 'playing' && progress) {
    return tag(progress.artist ? 'answered' : '', labels.artist) + tag(progress.title ? 'answered' : '', labels.title);
  }
  if (phase === 'revealed' && result) {
    // Grått för fält som inte besvarades, rött bara för fel svar.
    // Poängen för låten står sist som en egen etikett: gul med bonus, grön med poäng.
    const graded = (field) => (result[field] ? 'good' : progress && !progress[field] ? '' : 'bad');
    const pointsClass = result.bonus ? 'bonus' : result.points > 0 ? 'good' : '';
    return tag(`field ${graded('artist')}`, labels.artist) + tag(`field ${graded('title')}`, labels.title)
      + (points ? tag(`gain ${pointsClass}`, `+${result.points}`) : '');
  }
  return '';
}

// Håller reda på poängen sedan förra visningen. Ger den förra poängen om den har ändrats, annars null.
export function scoreTracker() {
  const last = new Map();
  return (id, score) => {
    const before = last.has(id) && last.get(id) !== score ? last.get(id) : null;
    last.set(id, score);
    return before;
  };
}

// Räknar upp en poäng från det förra värdet, som en mätare. Utan rörelse visas det nya värdet direkt.
export function countUp(el, from, to, ms = 700) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = from;
  requestAnimationFrame(step);
}

// Läser upp en kort händelse för skärmläsare via den dolda statusraden #announce.
// Samma text två gånger i rad läses inte upp igen.
let lastAnnounced = '';
export function announce(text) {
  const el = document.getElementById('announce');
  if (!el || text === lastAnnounced) return;
  lastAnnounced = text;
  el.textContent = text;
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// Rullar till toppen. När tangentbordet stängs i iPhone kan Safari avbryta den mjuka
// scrollningen, så sidan hoppar upp om den ändå inte har kommit hela vägen. Har man
// hunnit gå till nästa fält får det stå kvar där.
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: smooth() });
  setTimeout(() => {
    if (window.scrollY > 0 && !document.activeElement?.matches('input')) window.scrollTo({ top: 0 });
  }, 800);
}

// Rullar så att fältets rad står överst, så att förslagslistan under fältet får plats.
// I mobilen hamnar raden strax under den lilla raden som ligger fast överst, så att den
// inte skymmer fältet. Allt räknas i den synliga ytan: med tangentbordet uppe har Safari i
// iPhone ofta flyttat den ner en bit på sidan, och den fasta raden följer med (pinTopBar).
// Med mus står sidan still om minst fyra förslag får plats under fältet. Hoppet sker direkt vid
// fokus, innan tangentbordet öppnas. När tangentbordet har öppnats och sidan har stannat rättas
// läget en gång, åt det håll som behövs. Fler rättningar fick sidan att hoppa i iPhone.
const GAP = 8;
function barHeight() {
  const bar = document.querySelector('.compact-bar');
  return bar && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
}
// Hur långt ner på sidan den fasta raden har flyttats med den synliga ytan (pinTopBar).
let pinnedTop = 0;
const visibleTop = (el) => el.getBoundingClientRect().top - pinnedTop;

export function scrollFieldToTop(input, row) {
  const ROOM = 240; // fyra förslag med listans marginaler
  const goal = barHeight() + GAP;
  const rowTop = visibleTop(row);
  if (!matchMedia('(pointer: coarse)').matches) {
    const room = window.innerHeight - input.getBoundingClientRect().bottom;
    if (rowTop < goal || room >= Math.min(ROOM, window.innerHeight * 0.45)) return;
  }
  if (Math.abs(rowTop - goal) > 4) window.scrollTo({ top: window.scrollY + rowTop - goal, behavior: 'auto' });
  settle(input, row, goal);
}

// När tangentbordet har öppnats och den synliga ytan har stannat flyttas raden till rätt
// ställe. Bara en gång per fokus och inom en och en halv sekund, och inte alls om man har
// börjat rulla själv.
function settle(input, row, goal) {
  const vv = window.visualViewport;
  if (!vv) return;
  let wait;
  const stop = () => {
    vv.removeEventListener('resize', later);
    vv.removeEventListener('scroll', later);
    window.removeEventListener('touchmove', stop);
    input.removeEventListener('blur', stop);
    clearTimeout(wait);
    clearTimeout(timer);
  };
  const check = () => {
    stop();
    const off = visibleTop(row) - goal;
    if (Math.abs(off) > 4) window.scrollTo({ top: window.scrollY + off, behavior: 'auto' });
  };
  const later = () => { clearTimeout(wait); wait = setTimeout(check, 150); };
  const timer = setTimeout(stop, 1500);
  vv.addEventListener('resize', later);
  vv.addEventListener('scroll', later);
  window.addEventListener('touchmove', stop, { passive: true });
  input.addEventListener('blur', stop);
}

// Det som ligger fast överst sitter i sidfönstret. I Safari på iPhone flyttar tangentbordet den
// synliga ytan ner på sidan, och då hamnade raden ovanför det som syns. Här flyttas raden med,
// genom --vv-top i css/style.css, men bara medan man skriver i ett fält. Annars fjädrar den
// synliga ytan också när man drar förbi sidans slut, och raden skulle glida ner från
// överkanten. Vid inzoomning står den kvar. Raden visas så fort loggan har rullat ut ovanför
// det som syns.
export function pinTopBar(logo) {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const update = () => {
    const typing = document.activeElement?.matches('input, textarea');
    const top = vv && typing && Math.abs(vv.scale - 1) < 0.01 ? Math.max(0, Math.round(vv.offsetTop)) : 0;
    if (top !== pinnedTop) {
      pinnedTop = top;
      root.style.setProperty('--vv-top', `${top}px`);
    }
    const { bottom, height } = logo.getBoundingClientRect();
    document.body.classList.toggle('compact', height > 0 && bottom <= top);
  };
  if (vv) {
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => setTimeout(update, 0));
  update();
}
