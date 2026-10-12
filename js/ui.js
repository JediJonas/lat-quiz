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

// Kort sammanfattning av inställningarna, t.ex. "Tid 60 s · Bonus 20 s · Först till 10".
// Varje del hålls ihop på en rad med hårda mellanslag, så att raden bara bryts vid punkterna.
export function settingsSummary(s) {
  return [`Tid ${s.roundMs / 1000} s`, s.bonusMs ? `Bonus ${s.bonusMs / 1000} s` : 'Ingen bonus',
    `Först till ${s.winScore}`].map((part) => part.replaceAll(' ', '\u00a0')).join(' · ');
}
