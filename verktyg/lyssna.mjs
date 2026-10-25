// Bygger lyssningssidan, en sida där alla låtar som appen spelar går att höra: väntelåtarna, säsongskategoriernas
// väntelåtar, vinnarlåtarna och quizlåtarna i varje kategori. Låtarna läses från samma filer som appen använder,
// så att sidan alltid stämmer med appen. Sidan ligger i projektfilerna, inte i repot.
//
//   node verktyg/lyssna.mjs [utfil]
//
// Utan utfil skrivs sidan till lyssna-latarna-i-appen.html i den aktuella mappen.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LOBBY_SONGS, SEASON_LOBBY_SONGS } from '../js/vantemusik.js';
import { WINNER_SONGS } from '../js/vinnarlat.js';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const day = (mmdd) => { const [m, d] = mmdd.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const row = (s, year) => [s.artist, s.title, s.deezerId, ...(year && s.year ? [s.year] : [])];

export function sections() {
  const categories = json('data/categories.json');
  const name = (id) => categories.find((c) => c.id === id).name;
  const list = [
    {
      id: 'vantelatar', rubrik: `De ${LOBBY_SONGS.length} väntelåtarna`,
      intro: 'Loopar i lobbyn medan spelarna går med. I appen tonar klippet in under 2 sekunder och ut under 3, och spelas svagare än vinnarlåten.',
      latar: LOBBY_SONGS.map((s) => row(s)),
    },
    ...Object.entries(SEASON_LOBBY_SONGS).map(([id, songs]) => ({
      id: 'vantelatar-' + id, rubrik: `Väntelåtarna i ${name(id)}`,
      intro: `Spelas i lobbyn i stället för jazzen när spelet har kategorin ${name(id)}. De tonar in och ut på samma sätt.`,
      latar: songs.map((s) => row(s)),
    })),
    {
      id: 'vinnarlatar', rubrik: `De ${WINNER_SONGS.length} vinnarlåtarna`,
      intro: 'Spelas när vinnaren visas. I appen spelas hela klippet från full volym, och de sista fem sekunderna tonar ut.',
      latar: WINNER_SONGS.map((s) => row(s)),
    },
  ];
  for (const c of categories) {
    const songs = json('data/' + c.file);
    const delar = [`${songs.length} låtar.`];
    if (c.season) delar.push(`Säsongskategori som syns ${day(c.season.from)}–${day(c.season.to)}.`);
    if (c.labels) delar.push(`Fälten heter ${c.labels.artist} och ${c.labels.title}.`);
    list.push({ id: 'kategori-' + c.id, rubrik: c.name, intro: delar.join(' '), latar: songs.map((s) => row(s, true)), kategori: true });
  }
  return list;
}

export function page(list = sections()) {
  const antal = list.filter((s) => s.kategori).reduce((n, s) => n + s.latar.length, 0);
  const lank = (s) => `<a href="#${s.id}">${s.rubrik}</a>`;
  // Varje avsnitt är hopfällt från början och fälls ut med ett tryck på rubriken.
  const avsnitt = (s) => `  <details id="${s.id}">\n    <summary><h2><span>${s.rubrik}</span><span class="antal">${s.latar.length}</span></h2></summary>\n    <p class="intro">${s.intro}</p>\n    <ol data-avsnitt="${s.id}"></ol>\n  </details>`;
  return TEMPLATE
    .replace('%ANTAL%', antal)
    .replace('%KATEGORIER%', list.filter((s) => s.kategori).length)
    .replace('%MENY_LJUD%', list.filter((s) => !s.kategori).map(lank).join(' · '))
    .replace('%MENY_KATEGORIER%', list.filter((s) => s.kategori).map(lank).join(' · '))
    .replace('%AVSNITT%', list.map(avsnitt).join('\n'))
    .replace('%DATA%', () => JSON.stringify(Object.fromEntries(list.map((s) => [s.id, s.latar]))).replace(/</g, '\\u003c'));
}

const TEMPLATE = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Låtarna i appen</title>
<style>
  :root { --bg: #f2f2f7; --kort: #fff; --text: #1c1c1e; --svag: #6e6e73; --linje: #e5e5ea; --accent: #e5484d; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #000; --kort: #1c1c1e; --text: #f2f2f7; --svag: #98989f; --linje: #2c2c2e; --accent: #ff6369; }
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 12px; }
  body { margin: 0; font: 16px/1.4 -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .intro { color: var(--svag); font-size: 14px; margin: 0 0 20px; }
  nav { font-size: 14px; line-height: 1.8; margin: 0 0 8px; }
  nav p { margin: 0 0 8px; }
  nav b { color: var(--svag); font-weight: 600; }
  a { color: var(--accent); text-decoration: none; }
  .alla { display: flex; gap: 16px; margin: 0 0 8px; }
  .alla button { width: auto; height: auto; border-radius: 0; background: none; color: var(--accent); font-size: 14px; padding: 4px 0; }
  details { background: var(--kort); border-radius: 12px; margin: 10px 0 0; }
  summary { display: flex; align-items: center; gap: 10px; padding: 14px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: ''; flex: none; width: 8px; height: 8px; border: solid var(--svag); border-width: 0 2px 2px 0; transform: rotate(-45deg); transition: transform .15s; margin-right: 2px; }
  details[open] > summary::before { transform: rotate(45deg); }
  h2 { flex: 1; display: flex; align-items: baseline; gap: 10px; font-size: 18px; margin: 0; }
  h2 > span:first-child { flex: 1; }
  .antal { flex: none; font-size: 13px; font-weight: 400; color: var(--svag); font-variant-numeric: tabular-nums; }
  details > .intro { margin: -6px 14px 10px; }
  details > ol { border-top: 1px solid var(--linje); border-radius: 0 0 12px 12px; }
  ol { list-style: none; margin: 0; padding: 0; background: var(--kort); border-radius: 12px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--linje); }
  li:first-child { border-top: 0; }
  button { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--accent); color: #fff; font-size: 16px; cursor: pointer; }
  button:disabled { opacity: .35; cursor: default; }
  .info { flex: 1; min-width: 0; }
  .titel { font-weight: 600; }
  .ar { font-weight: 400; color: var(--svag); }
  .meta { font-size: 13px; color: var(--svag); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta.fel { color: var(--accent); white-space: normal; }
  .bar { height: 3px; background: var(--linje); border-radius: 2px; margin-top: 6px; overflow: hidden; visibility: hidden; }
  .bar span { display: block; height: 100%; width: 0; background: var(--accent); }
  li.spelar .bar { visibility: visible; }
  .tid { flex: none; font-size: 13px; color: var(--svag); font-variant-numeric: tabular-nums; width: 40px; text-align: right; }
</style>
</head>
<body>
<main>
  <h1>Låtarna i appen</h1>
  <p class="intro">Alla låtar som Låtquiz spelar: väntelåtarna, säsongskategoriernas väntelåtar, vinnarlåtarna och de %ANTAL% quizlåtarna i %KATEGORIER% kategorier. Tryck på en låt för att höra Deezer-klippet på 30 sekunder. Tryck på en rubrik för att fälla ut eller ihop den. Under varje låt står inspelningen som Deezer-ID:t pekar på, och den hämtas när raden syns. Klipplänken hämtas när du trycker, eftersom Deezers länkar går ut efter en stund.</p>
  <nav>
    <p><b>Extraljud:</b> %MENY_LJUD%</p>
    <p><b>Kategorier:</b> %MENY_KATEGORIER%</p>
  </nav>
  <div class="alla"><button type="button" data-alla="1">Fäll ut alla</button><button type="button" data-alla="">Fäll ihop alla</button></div>
%AVSNITT%
</main>
<script>
const LATAR = %DATA%;

const audio = new Audio();
let aktiv = null; // raden som spelar
let n = 0;

// Deezers API saknar CORS, så den nås med JSONP, som i appen.
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const name = 'dz' + (++n);
    const s = document.createElement('script');
    const klar = () => { delete window[name]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { klar(); reject(new Error('Deezer svarade inte')); }, 8000);
    window[name] = (data) => { klar(); resolve(data); };
    s.onerror = () => { klar(); reject(new Error('Kunde inte nå Deezer')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + name;
    document.head.append(s);
  });
}

// Deezer tillåter ungefär 50 anrop på 5 sekunder, så inspelningarna hämtas i kö när raderna syns.
const ko = [];
let igang = 0;
function kora() {
  while (igang < 4 && ko.length) {
    const jobb = ko.shift();
    igang++;
    jobb().finally(() => setTimeout(() => { igang--; kora(); }, 400));
  }
}

const tid = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function stoppa() {
  audio.pause();
  if (aktiv) { aktiv.li.classList.remove('spelar'); aktiv.knapp.textContent = '▶'; aktiv.tid.textContent = ''; }
  aktiv = null;
}

// Visar vilken inspelning ID:t pekar på, så att det går att se att det är originalet.
function hamtaInfo(rad) {
  return jsonp('https://api.deezer.com/track/' + rad.id).then((t) => {
    if (!t || t.error) throw new Error(t && t.error ? t.error.message : 'Okänt svar');
    rad.meta.textContent = t.artist.name + ' – ' + t.title + ' · ' + t.album.title + ' · ' + tid(t.duration) + (t.preview ? '' : ' · inget klipp');
    if (!t.preview) rad.meta.classList.add('fel');
  }).catch((e) => { rad.meta.textContent = 'Fel: ' + e.message; rad.meta.classList.add('fel'); });
}

const rader = new Map();
const syns = new IntersectionObserver((poster) => {
  for (const p of poster) {
    if (!p.isIntersecting) continue;
    syns.unobserve(p.target);
    const rad = rader.get(p.target);
    ko.push(() => hamtaInfo(rad));
  }
  kora();
}, { rootMargin: '300px 0px' });

function visa(latar, lista) { latar.forEach(([artist, titel, id, ar]) => {
  const li = document.createElement('li');
  li.innerHTML = '<button aria-label="Spela">▶</button><div class="info"><div class="titel"></div><div class="meta">Hämtar från Deezer…</div><div class="bar"><span></span></div></div><div class="tid"></div>';
  const rubrik = li.querySelector('.titel');
  rubrik.textContent = artist + ' – ' + titel;
  if (ar) { const s = document.createElement('span'); s.className = 'ar'; s.textContent = ' (' + ar + ')'; rubrik.append(s); }
  const rad = { id, li, knapp: li.querySelector('button'), meta: li.querySelector('.meta'), bar: li.querySelector('.bar span'), tid: li.querySelector('.tid') };
  rad.knapp.setAttribute('aria-label', 'Spela ' + artist + ' – ' + titel);
  lista.append(li);
  rader.set(li, rad);
  syns.observe(li);

  rad.knapp.addEventListener('click', async () => {
    if (aktiv === rad) { stoppa(); return; }
    stoppa();
    aktiv = rad;
    li.classList.add('spelar');
    rad.knapp.textContent = '■';
    // En färsk klipplänk varje gång.
    try {
      const t = await jsonp('https://api.deezer.com/track/' + id);
      if (aktiv !== rad) return;
      if (!t.preview) throw new Error('Deezer har inget klipp');
      audio.src = t.preview;
      await audio.play();
    } catch (e) {
      rad.meta.textContent = 'Fel: ' + e.message; rad.meta.classList.add('fel');
      stoppa();
    }
  });
}); }

for (const lista of document.querySelectorAll('ol[data-avsnitt]')) visa(LATAR[lista.dataset.avsnitt], lista);

// En länk i menyn fäller ut sitt avsnitt, så att låtarna syns när sidan har skrollat dit.
function oppna(id) { const d = document.getElementById(id); if (d && d.tagName === 'DETAILS') d.open = true; }
document.querySelector('nav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) oppna(a.hash.slice(1)); });
if (location.hash) oppna(location.hash.slice(1));
for (const knapp of document.querySelectorAll('[data-alla]')) {
  knapp.addEventListener('click', () => { for (const d of document.querySelectorAll('details')) d.open = Boolean(knapp.dataset.alla); });
}

audio.addEventListener('timeupdate', () => {
  if (!aktiv || !audio.duration) return;
  aktiv.bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
  aktiv.tid.textContent = tid(audio.currentTime);
});
audio.addEventListener('ended', stoppa);
</script>
</body>
</html>
`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ut = process.argv[2] || 'lyssna-latarna-i-appen.html';
  writeFileSync(ut, page());
  console.log('Skrev ' + ut);
}
