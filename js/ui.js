// Gemensamma visningsdelar för spelledare och spelare.

const RING_R = 54;
const RING_LEN = 2 * Math.PI * RING_R;

// Färgton efter andel kvarvarande tid: grönt drygt halva tiden, en snabb
// övergång till skarpt orange, och rött den sista tiondelen.
const HUE_STOPS = [[1, 135], [0.45, 135], [0.35, 28], [0.2, 28], [0.1, 0], [0, 0]];

function ringHue(part) {
  for (let i = 1; i < HUE_STOPS.length; i++) {
    const [p1, h1] = HUE_STOPS[i - 1];
    const [p2, h2] = HUE_STOPS[i];
    if (part >= p2) return h2 + (h1 - h2) * ((part - p2) / (p1 - p2));
  }
  return 0;
}

// Rund nedräkning: siffran i mitten och en ring som töms medurs
// och skiftar från grönt via gult till rött.
export function renderRing(el, ms, totalMs, bonus) {
  if (!el.querySelector('svg')) {
    el.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="${RING_R}"/>
        <circle class="ring-bar" cx="60" cy="60" r="${RING_R}" stroke-dasharray="${RING_LEN}"/>
      </svg><span class="ring-num"></span>`;
  }
  const part = totalMs ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  // Negativ förskjutning gör att det tomma partiet växer medurs från klockan tolv.
  el.querySelector('.ring-bar').style.strokeDashoffset = -RING_LEN * (1 - part);
  el.style.setProperty('--ring-hue', Math.round(ringHue(part)));
  el.querySelector('.ring-num').textContent = Math.ceil(ms / 1000);
  el.classList.toggle('bonus', bonus);
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
