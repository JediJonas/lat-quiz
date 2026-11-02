// Bygger lyssningssidan, en sida där alla låtar som appen spelar går att höra: väntelåtarna, säsongskategoriernas
// väntelåtar, vinnarlåtarna och quizlåtarna i varje kategori. Låtarna läses från samma filer som appen använder,
// så att sidan alltid stämmer med appen. Sidan ligger i projektfilerna, inte i repot.
//
//   node tools/listen.mjs [utfil]
//
// Utan utfil skrivs sidan till lyssna-latarna-i-appen.html i den aktuella mappen.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const { default: LOBBY_SONGS, ...SEASON_LOBBY_SONGS } = json('data/music.json').lobby;
const WINNER_SONGS = json('data/music.json').winner.default;

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const formatDay = (mmdd) => { const [m, d] = mmdd.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const row = (s, year) => [s.artist, s.title, s.deezerId, ...(year && s.year ? [s.year] : [])];
// Låtarna står i bokstavsordning efter artist och sedan titel, med svensk sortering så att å, ä och ö kommer sist.
const sv = new Intl.Collator('sv', { numeric: true });
const sorted = (songs, year) => songs.map((s) => row(s, year)).sort((a, b) => sv.compare(a[0], b[0]) || sv.compare(a[1], b[1]));

export function collectSections() {
  const categories = json('data/categories.json');
  const name = (id) => categories.find((c) => c.id === id).name;
  const list = [
    {
      id: 'lobby-songs', heading: `De ${LOBBY_SONGS.length} väntelåtarna`,
      intro: 'Loopar i lobbyn medan spelarna går med. I appen tonar klippet in under 2 sekunder och ut under 3, och spelas svagare än vinnarlåten.',
      songs: sorted(LOBBY_SONGS),
    },
    // Säsongskategorierna står i samma ordning som i appen.
    ...categories.filter((c) => SEASON_LOBBY_SONGS[c.id]).map(({ id }) => ({
      id: 'lobby-songs-' + id, heading: `Väntelåtarna i ${name(id)}`,
      intro: `Spelas i lobbyn i stället för jazzen när spelet har kategorin ${name(id)}. De tonar in och ut på samma sätt.`,
      songs: sorted(SEASON_LOBBY_SONGS[id]),
    })),
    {
      id: 'winner-songs', heading: `De ${WINNER_SONGS.length} vinnarlåtarna`,
      intro: 'Spelas när vinnaren visas. I appen spelas hela klippet från full volym, och de sista fem sekunderna tonar ut.',
      songs: sorted(WINNER_SONGS),
    },
  ];
  for (const c of categories) {
    const songs = json('data/' + c.file);
    const parts = [`${songs.length} låtar.`];
    if (c.season) parts.push(`Säsongskategori som syns ${formatDay(c.season.from)}–${formatDay(c.season.to)}.`);
    if (c.labels) parts.push(`Fälten heter ${c.labels.artist} och ${c.labels.title}.`);
    list.push({ id: 'category-' + c.id, heading: c.name, intro: parts.join(' '), songs: sorted(songs, true), isCategory: true });
  }
  return list;
}

export function buildListenPage(list = collectSections()) {
  const count = list.filter((s) => s.isCategory).reduce((n, s) => n + s.songs.length, 0);
  const link = (s) => `<a href="#${s.id}">${s.heading}</a>`;
  // Varje avsnitt är hopfällt från början och fälls ut med ett tryck på rubriken.
  const renderSection = (s) => `  <details id="${s.id}">\n    <summary><h2><span>${s.heading}</span><span class="count">${s.songs.length}</span></h2></summary>\n    <p class="intro">${s.intro}</p>\n    <ol data-section="${s.id}"></ol>\n  </details>`;
  return TEMPLATE
    .replace('%SONG_COUNT%', count)
    .replace('%CATEGORY_COUNT%', list.filter((s) => s.isCategory).length)
    .replace('%MENU_SOUNDS%', list.filter((s) => !s.isCategory).map(link).join(' · '))
    .replace('%MENU_CATEGORIES%', list.filter((s) => s.isCategory).map(link).join(' · '))
    .replace('%SECTIONS%', list.map(renderSection).join('\n'))
    .replace('%DATA%', () => JSON.stringify(Object.fromEntries(list.map((s) => [s.id, s.songs]))).replace(/</g, '\\u003c'));
}

const TEMPLATE = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Låtarna i appen</title>
<style>
  :root { --bg: #f2f2f7; --card: #fff; --text: #1c1c1e; --muted: #6e6e73; --line: #e5e5ea; --accent: #e5484d; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #000; --card: #1c1c1e; --text: #f2f2f7; --muted: #98989f; --line: #2c2c2e; --accent: #ff6369; }
  }
  * { box-sizing: border-box; }
  html { scroll-padding-top: 12px; }
  body { margin: 0; font: 16px/1.4 -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .intro { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
  nav { font-size: 14px; line-height: 1.8; margin: 0 0 8px; }
  nav p { margin: 0 0 8px; }
  nav b { color: var(--muted); font-weight: 600; }
  a { color: var(--accent); text-decoration: none; }
  .all { display: flex; gap: 16px; margin: 0 0 8px; }
  .all button { width: auto; height: auto; border-radius: 0; background: none; color: var(--accent); font-size: 14px; padding: 4px 0; }
  details { background: var(--card); border-radius: 12px; margin: 10px 0 0; }
  summary { display: flex; align-items: center; gap: 10px; padding: 14px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: ''; flex: none; width: 8px; height: 8px; border: solid var(--muted); border-width: 0 2px 2px 0; transform: rotate(-45deg); transition: transform .15s; margin-right: 2px; }
  details[open] > summary::before { transform: rotate(45deg); }
  h2 { flex: 1; display: flex; align-items: baseline; gap: 10px; font-size: 18px; margin: 0; }
  h2 > span:first-child { flex: 1; }
  .count { flex: none; font-size: 13px; font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
  details > .intro { margin: -6px 14px 10px; }
  details > ol { border-top: 1px solid var(--line); border-radius: 0 0 12px 12px; }
  ol { list-style: none; margin: 0; padding: 0; background: var(--card); border-radius: 12px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  button { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--accent); color: #fff; font-size: 16px; cursor: pointer; }
  button:disabled { opacity: .35; cursor: default; }
  .info { flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .year { font-weight: 400; color: var(--muted); }
  .meta { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta.error { color: var(--accent); white-space: normal; }
  .bar { height: 3px; background: var(--line); border-radius: 2px; margin-top: 6px; overflow: hidden; visibility: hidden; }
  .bar span { display: block; height: 100%; width: 0; background: var(--accent); }
  li.playing .bar { visibility: visible; }
  .time { flex: none; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; width: 40px; text-align: right; }
</style>
</head>
<body>
<main>
  <h1>Låtarna i appen</h1>
  <p class="intro">Alla låtar som Låtquiz spelar: väntelåtarna, säsongskategoriernas väntelåtar, vinnarlåtarna och de %SONG_COUNT% quizlåtarna i %CATEGORY_COUNT% kategorier. Kategorierna står i samma ordning som i appen och låtarna i bokstavsordning efter artist. Tryck på en låt för att höra Deezer-klippet på 30 sekunder. Tryck på en rubrik för att fälla ut eller ihop den. Under varje låt står inspelningen som Deezer-ID:t pekar på, och den hämtas när raden syns. Klipplänken hämtas när du trycker, eftersom Deezers länkar går ut efter en stund.</p>
  <nav>
    <p><b>Extraljud:</b> %MENU_SOUNDS%</p>
    <p><b>Kategorier:</b> %MENU_CATEGORIES%</p>
  </nav>
  <div class="all"><button type="button" data-all="1">Fäll ut alla</button><button type="button" data-all="">Fäll ihop alla</button></div>
%SECTIONS%
</main>
<script>
const SONGS = %DATA%;

const audio = new Audio();
let active = null; // raden som spelar
let n = 0;

// Deezers API saknar CORS, så den nås med JSONP, som i appen.
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const name = 'dz' + (++n);
    const s = document.createElement('script');
    const done = () => { delete window[name]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); reject(new Error('Deezer svarade inte')); }, 8000);
    window[name] = (data) => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error('Kunde inte nå Deezer')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + name;
    document.head.append(s);
  });
}

// Deezer tillåter ungefär 50 anrop på 5 sekunder, så inspelningarna hämtas i kö när raderna syns.
const queue = [];
let running = 0;
function runQueue() {
  while (running < 4 && queue.length) {
    const job = queue.shift();
    running++;
    job().finally(() => setTimeout(() => { running--; runQueue(); }, 400));
  }
}

const formatTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function stop() {
  audio.pause();
  if (active) { active.li.classList.remove('playing'); active.button.textContent = '▶'; active.time.textContent = ''; }
  active = null;
}

// Visar vilken inspelning ID:t pekar på, så att det går att se att det är originalet.
function showRecording(row) {
  return jsonp('https://api.deezer.com/track/' + row.id).then((t) => {
    if (!t || t.error) throw new Error(t && t.error ? t.error.message : 'Okänt svar');
    row.meta.textContent = t.artist.name + ' – ' + t.title + ' · ' + t.album.title + ' · ' + formatTime(t.duration) + (t.preview ? '' : ' · inget klipp');
    if (!t.preview) row.meta.classList.add('error');
  }).catch((e) => { row.meta.textContent = 'Fel: ' + e.message; row.meta.classList.add('error'); });
}

const rows = new Map();
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    const row = rows.get(entry.target);
    queue.push(() => showRecording(row));
  }
  runQueue();
}, { rootMargin: '300px 0px' });

function renderSongs(songs, list) { songs.forEach(([artist, title, id, year]) => {
  const li = document.createElement('li');
  li.innerHTML = '<button aria-label="Spela">▶</button><div class="info"><div class="title"></div><div class="meta">Hämtar från Deezer…</div><div class="bar"><span></span></div></div><div class="time"></div>';
  const titleLine = li.querySelector('.title');
  titleLine.textContent = artist + ' – ' + title;
  if (year) { const s = document.createElement('span'); s.className = 'year'; s.textContent = ' (' + year + ')'; titleLine.append(s); }
  const row = { id, li, button: li.querySelector('button'), meta: li.querySelector('.meta'), bar: li.querySelector('.bar span'), time: li.querySelector('.time') };
  row.button.setAttribute('aria-label', 'Spela ' + artist + ' – ' + title);
  list.append(li);
  rows.set(li, row);
  observer.observe(li);

  row.button.addEventListener('click', async () => {
    if (active === row) { stop(); return; }
    stop();
    active = row;
    li.classList.add('playing');
    row.button.textContent = '■';
    // En färsk klipplänk varje gång.
    try {
      const t = await jsonp('https://api.deezer.com/track/' + id);
      if (active !== row) return;
      if (!t.preview) throw new Error('Deezer har inget klipp');
      audio.src = t.preview;
      await audio.play();
    } catch (e) {
      row.meta.textContent = 'Fel: ' + e.message; row.meta.classList.add('error');
      stop();
    }
  });
}); }

for (const list of document.querySelectorAll('ol[data-section]')) renderSongs(SONGS[list.dataset.section], list);

// En länk i menyn fäller ut sitt avsnitt, så att låtarna syns när sidan har skrollat dit.
function openSection(id) { const d = document.getElementById(id); if (d && d.tagName === 'DETAILS') d.open = true; }
document.querySelector('nav').addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) openSection(a.hash.slice(1)); });
if (location.hash) openSection(location.hash.slice(1));
for (const button of document.querySelectorAll('[data-all]')) {
  button.addEventListener('click', () => { for (const d of document.querySelectorAll('details')) d.open = Boolean(button.dataset.all); });
}

audio.addEventListener('timeupdate', () => {
  if (!active || !audio.duration) return;
  active.bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
  active.time.textContent = formatTime(audio.currentTime);
});
audio.addEventListener('ended', stop);
</script>
</body>
</html>
`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outFile = process.argv[2] || 'lyssna-latarna-i-appen.html';
  writeFileSync(outFile, buildListenPage());
  console.log('Skrev ' + outFile);
}
