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
  // Negativ förskjutning gör att det tomma partiet växer medurs från klockan tolv.
  // Med enhet, eftersom Safari kan strunta i ett unitless värde.
  el.querySelector('.ring-bar').style.strokeDashoffset = `${-RING_LEN * (1 - part)}px`;
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
    return tag(progress.artist ? 'good' : '', labels.artist) + tag(progress.title ? 'good' : '', labels.title);
  }
  if (phase === 'revealed' && result) {
    return tag(result.artist ? 'good' : 'bad', labels.artist) + tag(result.title ? 'good' : 'bad', labels.title)
      + (result.bonus ? tag('bonus', 'Bonus') : '') + (points ? ` <strong>+${result.points}</strong>` : '');
  }
  return '';
}

// Placering med delad plats vid lika poäng. Listan ska vara sorterad.
export function ranks(players) {
  let place = 0;
  return players.map((p, i) => {
    if (i === 0 || p.score !== players[i - 1].score) place = i + 1;
    return place;
  });
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
