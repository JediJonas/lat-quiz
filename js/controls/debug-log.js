// @ts-check
// Loggen som syns med ?debug=1. Alla loggar på sidan skriver i samma ruta längst ner, som
// bara visar de senaste raderna. Knappen i hörnet fäller ut rutan till helskärm och tillbaka.
// Hopfälld ligger rutan under meddelanderutorna, tar inte emot tryck och påverkar varken
// layouten eller vilket fält som har fokus, så att det går att svara som vanligt. Knappen tar
// inte heller fokus, så att tangentbordet inte stängs av ett tryck på den.
// När tangentbordet är öppet flyttas rutan och knappen upp till nederkanten av det som syns.

// Så många rader text som syns i den hopfällda rutan.
const VISIBLE_ROWS = 3;
// Så många poster som sparas, så att det finns något att läsa i helskärm.
const KEPT_ENTRIES = 200;
// Hopfälld under meddelanderutorna (z-index 50 i style.css), utfälld över allt.
const Z_COLLAPSED = 40;
const Z_EXPANDED = 1000;

let box = null;
let button = null;
let expanded = false;
const entries = [];

// Sant om sidan öppnades med ?debug=1, se början av varje sida.
export const debugging = () => 'debug' in document.documentElement.dataset;

const BOX_STYLE = 'position:fixed;left:0;right:0;bottom:0;margin:0;box-sizing:border-box;'
  + 'font:10px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.8);color:#fff;'
  + 'white-space:pre-wrap;overflow-wrap:anywhere;user-select:none;';
const COLLAPSED_STYLE = `z-index:${Z_COLLAPSED};padding:2px 40px 2px 6px;`
  + `max-height:calc(${VISIBLE_ROWS} * 1.3em + 4px);overflow:hidden;pointer-events:none;`;
const EXPANDED_STYLE = `z-index:${Z_EXPANDED};top:0;padding:calc(env(safe-area-inset-top) + 6px) 6px 44px;`
  + 'overflow:auto;overscroll-behavior:contain;pointer-events:auto;user-select:text;';
const BUTTON_STYLE = `position:fixed;right:4px;bottom:4px;z-index:${Z_EXPANDED + 1};width:32px;height:28px;`
  + 'padding:0;border:1px solid rgba(255,255,255,.5);border-radius:8px;background:rgba(0,0,0,.85);'
  + 'color:#fff;font:14px/1 system-ui,sans-serif;touch-action:manipulation;';

function followViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const hidden = document.documentElement.clientHeight - (vv.offsetTop + vv.height);
  const shift = hidden > 0 && !expanded ? `translateY(${-Math.round(hidden)}px)` : '';
  box.style.transform = shift;
  button.style.transform = hidden > 0 ? `translateY(${-Math.round(hidden)}px)` : '';
}

function showEntries() {
  box.textContent = entries.join('\n');
  if (!expanded) box.scrollTop = box.scrollHeight;
}

function setExpanded(on) {
  expanded = on;
  box.style.cssText = BOX_STYLE + (on ? EXPANDED_STYLE : COLLAPSED_STYLE);
  button.textContent = on ? '▾' : '▴';
  button.setAttribute('aria-label', on ? 'Fäll ihop loggen' : 'Visa hela loggen');
  showEntries();
  if (on) box.scrollTop = box.scrollHeight;
  followViewport();
}

function createBox() {
  box = document.createElement('pre');
  box.setAttribute('aria-hidden', 'true');
  button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.style.cssText = BUTTON_STYLE;
  // Knappen tar inte fokus från fältet man skriver i.
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', () => setExpanded(!expanded));
  document.body.append(box, button);
  const vv = window.visualViewport;
  if (vv) for (const type of ['resize', 'scroll']) vv.addEventListener(type, followViewport);
  setExpanded(false);
}

// Skriver en rad i loggen, med sekunder sedan sidan öppnades först. Gör inget utan ?debug=1.
export function debugLine(text) {
  if (!debugging()) return;
  if (!box) createBox();
  entries.push(`${(performance.now() / 1000).toFixed(2)} ${text}`);
  if (entries.length > KEPT_ENTRIES) entries.shift();
  // Utfälld rullar rutan bara med om man redan står längst ner, så att man kan läsa i lugn och ro.
  const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
  showEntries();
  if (expanded && atEnd) box.scrollTop = box.scrollHeight;
}
