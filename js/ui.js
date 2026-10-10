// Gemensamma visningsdelar för spelledare och spelare.

const RING_R = 54;
const RING_LEN = 2 * Math.PI * RING_R;

// Rund nedräkning: siffran i mitten och en ring som krymper.
export function renderRing(el, ms, totalMs, bonus) {
  if (!el.querySelector('svg')) {
    el.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="${RING_R}"/>
        <circle class="ring-bar" cx="60" cy="60" r="${RING_R}" stroke-dasharray="${RING_LEN}"/>
      </svg><span class="ring-num"></span>`;
  }
  const part = totalMs ? Math.max(0, Math.min(1, ms / totalMs)) : 0;
  el.querySelector('.ring-bar').style.strokeDashoffset = RING_LEN * (1 - part);
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
