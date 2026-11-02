// @ts-check
// Loggen som syns med ?debug=1. Alla loggar på sidan skriver i samma lilla ruta längst ner,
// som bara visar de senaste raderna. Rutan ligger fast ovanpå sidan, tar inte emot tryck och
// påverkar varken layouten eller vilket fält som har fokus, så att det går att svara som vanligt.
// När tangentbordet är öppet flyttas den upp till nederkanten av det som syns.

// Så många rader text som syns i rutan.
const VISIBLE_ROWS = 3;
// Så många poster som sparas, mest för att texten inte ska växa utan gräns.
const KEPT_ENTRIES = 20;

let box = null;
const entries = [];

// Sant om sidan öppnades med ?debug=1, se början av varje sida.
export const debugging = () => 'debug' in document.documentElement.dataset;

function followViewport() {
  const vv = window.visualViewport;
  if (!vv || !box) return;
  const hidden = document.documentElement.clientHeight - (vv.offsetTop + vv.height);
  box.style.transform = hidden > 0 ? `translateY(${-Math.round(hidden)}px)` : '';
}

function createBox() {
  box = document.createElement('pre');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;margin:0;padding:2px 6px;'
    + `max-height:calc(${VISIBLE_ROWS} * 1.3em + 4px);overflow:hidden;box-sizing:border-box;`
    + 'font:10px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.75);color:#fff;'
    + 'pointer-events:none;user-select:none;white-space:pre-wrap;overflow-wrap:anywhere';
  document.body.append(box);
  const vv = window.visualViewport;
  if (vv) for (const type of ['resize', 'scroll']) vv.addEventListener(type, followViewport);
}

// Skriver en rad i loggen, med sekunder sedan sidan öppnades först. Gör inget utan ?debug=1.
export function debugLine(text) {
  if (!debugging()) return;
  if (!box) createBox();
  entries.push(`${(performance.now() / 1000).toFixed(2)} ${text}`);
  if (entries.length > KEPT_ENTRIES) entries.shift();
  box.textContent = entries.join('\n');
  box.scrollTop = box.scrollHeight;
}
