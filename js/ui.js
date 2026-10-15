// Gemensamma visningsdelar för spelledare och spelare.

const RING_R = 54;
const RING_LEN = 2 * Math.PI * RING_R;

// Färgton efter andel kvarvarande tid: grönt första fjärdedelen, rött sista
// fjärdedelen och en jämn skala via gult och orange däremellan.
const HUE_STOPS = [[1, 135], [0.75, 135], [0.25, 0], [0, 0]];

function ringHue(part) {
  for (let i = 1; i < HUE_STOPS.length; i++) {
    const [p1, h1] = HUE_STOPS[i - 1];
    const [p2, h2] = HUE_STOPS[i];
    if (part >= p2) return h2 + (h1 - h2) * ((part - p2) / (p1 - p2));
  }
  return 0;
}

// Rund nedräkning: siffran i mitten och en ring som töms medurs
// och glider från grönt via orange till rött.
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
  const hue = Math.round(ringHue(part));
  // Mättnad och ljushet följer med, så att orange och rött lyser starkare än grönt.
  const warm = Math.min(1, Math.max(0, (135 - hue) / 105));
  el.style.setProperty('--ring-color', `hsl(${hue} ${Math.round(80 + 20 * warm)}% ${Math.round(45 + 5 * warm)}%)`);
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
    const graded = (field) => (result[field] ? 'good' : progress && !progress[field] ? '' : 'bad');
    return tag(graded('artist'), labels.artist) + tag(graded('title'), labels.title)
      + (result.bonus ? tag('bonus', 'Bonus') : '') + (points ? ` <strong>+${result.points}</strong>` : '');
  }
  return '';
}

// Markerar rader vars poäng har ändrats sedan förra visningen.
export function scoreTracker() {
  const last = new Map();
  return (id, score) => {
    const changed = last.has(id) && last.get(id) !== score;
    last.set(id, score);
    return changed;
  };
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

// Rullar så att fältet och rubriken över det står överst, så att förslagslistan under
// fältet får plats. I mobilen görs det alltid. Med mus står sidan still om listan redan
// får plats under fältet. I mobilen öppnas tangentbordet strax efter fokus, och Safari
// rullar då själv fram fältet. Läget kontrolleras därför igen när tangentbordet har öppnats
// och en stund efter, och rullningen sker direkt, eftersom Safari avbryter en mjuk rullning.
export function scrollFieldToTop(input, heading) {
  const GAP = 8;
  const touch = matchMedia('(pointer: coarse)').matches;
  const check = () => {
    if (document.activeElement !== input) return;
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewHeight = vv ? vv.height : window.innerHeight;
    const headTop = heading.getBoundingClientRect().top - viewTop;
    const room = viewHeight - (input.getBoundingClientRect().bottom - viewTop);
    if (Math.abs(headTop - GAP) <= 4) return;
    if (!touch && (headTop < GAP || room >= window.innerHeight * 0.45)) return;
    window.scrollBy({ top: headTop - GAP, behavior: 'auto' });
  };
  check();
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(check, 100); };
  const vv = window.visualViewport;
  if (vv) vv.addEventListener('resize', later);
  window.addEventListener('resize', later);
  const checks = [300, 600, 1000].map((ms) => setTimeout(check, ms));
  setTimeout(() => {
    if (vv) vv.removeEventListener('resize', later);
    window.removeEventListener('resize', later);
  }, 1500);
  // Börjar man rulla själv får sidan stå där man lämnar den.
  const stop = () => { checks.forEach(clearTimeout); clearTimeout(timer); };
  window.addEventListener('touchmove', stop, { once: true, passive: true });
  input.addEventListener('blur', stop, { once: true });
}
