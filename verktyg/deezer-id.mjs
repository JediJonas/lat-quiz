// Hämtar fasta Deezer-ID för en eller flera kategorier. Körs med Node av Claude:
//
//   node verktyg/deezer-id.mjs 80-tal 90-tal
//   node verktyg/deezer-id.mjs --igen 80-tal    (hämtar om även låtar med ID)
//
// Låten söks på Deezer. Rätt artist och titel krävs, och live, remix, cover,
// nyinspelningar och liknande sorteras bort. Bland det som återstår väljs den
// mest spelade nära låtens år, vilket nästan alltid är originalet.
// Fram till 23 oktober 2026 gav låtens Spotify-ID först en ISRC via Wikidata, och
// då hämtades exakt den inspelningen. Spotify-ID:na togs bort, se spotify-lardomar.md.
//
// Låtar med ett deezerId sedan tidigare rörs inte, utom med --igen. Rapporten med osäkra
// träffar skrivs till verktyg/.deezer-rapport.json. Granskade val står i
// verktyg/deezer-val.json och går före sökningen.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { norm, baseTitle, titleMatches } from '../js/lookup.js';

const UA = 'lat-quiz/0.1 (https://github.com/JediJonas/lat-quiz)';
// Parallella körningar behöver var sin cache, till exempel CACHE=/tmp/c1.json.
const CACHE = process.env.CACHE || new URL('./.cache.json', import.meta.url);
const REPORT = new URL('./.deezer-rapport.json', import.meta.url);
// Claudes egna val efter granskning: ett Deezer-ID, eller null när Deezer
// saknar originalet och appen hellre ska söka själv.
const CHOICES = JSON.parse(readFileSync(new URL('./deezer-val.json', import.meta.url), 'utf8'));
const PERFORMERS = JSON.parse(readFileSync(new URL('./eurovision-artister.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

let unsaved = 0;
function saveCache() {
  writeFileSync(CACHE, JSON.stringify(cache));
  unsaved = 0;
}

async function getJson(url, options = {}) {
  const key = options.body ? url + '#' + options.body : url;
  if (cache[key]) return cache[key];
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(url, { ...options, headers: { 'User-Agent': UA, Accept: 'application/json, application/sparql-results+json', ...options.headers } });
    if (res.ok) {
      const data = await res.json();
      // Deezer svarar 200 med ett fel när gränsen på 50 anrop per 5 sekunder nås.
      if (data && data.error && data.error.code === 4) { await sleep(5000); continue; }
      if (!(data && data.error)) { cache[key] = data; unsaved += 1; if (unsaved >= 200) saveCache(); }
      return data;
    }
    if (res.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  throw new Error('Inget svar från ' + url);
}

// Artisten måste stå som egna ord, ensam eller ihop med någon annan via "&",
// "feat." eller "with". Då räknas inte "The Sounds Of Led Zeppelin",
// "Made famous by Lady Gaga" eller "Theo" för Theoz.
const CONNECTOR = new Set(['and', 'feat', 'featuring', 'ft', 'with', 'x', 'med', 'och']);
const words = (name) => norm(name).replace(/^the /, '').split(' ').filter(Boolean);
function within(outer, inner, prefixOk) {
  for (let i = 0; i + inner.length <= outer.length; i += 1) {
    if (!inner.every((w, j) => outer[i + j] === w)) continue;
    const before = outer.slice(0, i).filter((w) => w !== 'the');
    const after = outer[i + inner.length];
    if (prefixOk && i === 0) return true;
    if ((!before.length || CONNECTOR.has(before[before.length - 1])) && (after === undefined || CONNECTOR.has(after))) return true;
  }
  return false;
}
export function artistMatches(wanted, found) {
  const a = words(wanted);
  const b = words(found);
  if (!a.length || !b.length) return false;
  return a.join(' ') === b.join(' ') || within(b, a, false) || within(a, b, true);
}

const deezer = async (path) => {
  const url = 'https://api.deezer.com/' + path;
  const cached = Boolean(cache[url]);
  const data = await getJson(url);
  if (!cached) await sleep(120);
  return data && data.error ? null : data;
};

const UNWANTED = /\b(live|karaoke|instrumental|cover|covers|remix|remixes|remixed|mix|vs|acoustic|akustisk|unplugged|demo|re ?recorded|rerecorded|re ?record|new recording|nyinspelning|sped up|slowed|tribute|in the style of|originally performed|made famous|medley|megamix|orchestral|symphonic|lullaby|8 bit|piano version|extended|club mix|rehearsal|alternate|alternative|outtake|early take|session|sessions|commentary|interview|a cappella|acapella)\b/;
// Ord som finns i låtens egen titel, som "live" i "Live and Let Die", räknas inte.
function unwanted(t, title) {
  const own = new Set(norm(title).split(' '));
  const text = norm([t.title, t.title_version, t.album && t.album.title].filter(Boolean).join(' '));
  return UNWANTED.test(text.split(' ').filter((w) => !own.has(w)).join(' '));
}

// Ett tillägg som "(Radio Edit)" gör en träff sämre, "(Remastered 2009)" gör det inte.
const versionOf = (t) => t.title_version || (t.title_short && t.title.startsWith(t.title_short) ? t.title.slice(t.title_short.length) : '');
const versioned = (t) => /\S/.test(versionOf(t).replace(/[^)]*\b(remaster(ed)?|mono|stereo|from|feat)\b[^)]*\)?/gi, '').replace(/[()[\]\s-]/g, ''));

// ISRC innehåller året då inspelningen registrerades. Originalet har oftast det
// tidigaste året, medan nyutgåvor och nyinspelningar har senare år.
function isrcYear(isrc) {
  const yy = Number(String(isrc || '').slice(5, 7));
  if (!Number.isFinite(yy)) return null;
  return yy > 40 ? 1900 + yy : 2000 + yy;
}

// Måste gå att spela i Sverige. Den här datorn ser Deezers amerikanska katalog.
const inSweden = (t) => t && t.preview && t.readable !== false
  && (!t.available_countries || !t.available_countries.length || t.available_countries.includes('SE'));

// Går igenom träffarna i ordning, först de utan tillägg i titeln, och tar
// den som ligger närmast låtens år bland dem som går att spela i Sverige.
async function bestOf(candidates, year) {
  const distance = (t) => {
    const y = isrcYear(t.isrc);
    return y && year ? Math.max(0, y - year) : 50;
  };
  for (const group of [candidates.filter((c) => !versioned(c)), candidates.filter(versioned)]) {
    const details = [];
    for (const c of group.slice(0, 6)) {
      const t = await deezer('track/' + c.id);
      if (inSweden(t)) details.push(t);
    }
    // Stabil sortering: närmast låtens år först, annars den mest spelade.
    if (details.length) return details.sort((a, b) => distance(a) - distance(b))[0];
  }
  return null;
}

async function rank(candidates, artists, title, year) {
  const ok = candidates.filter((t) => t && t.preview && t.artist
    && artists.some((a) => artistMatches(a, t.artist.name))
    && !unwanted(t, title));
  const order = (list) => [...list].sort((a, b) => (versioned(a) - versioned(b)) || ((b.rank || 0) - (a.rank || 0)));
  const exact = order(ok.filter((t) => baseTitle(t.title_short || t.title) === baseTitle(title)));
  const close = order(ok.filter((t) => titleMatches(title, t.title_short || t.title) || titleMatches(title, t.title)));
  let track = exact.length && await bestOf(exact, year);
  if (track) return { track, status: 'trolig' };
  track = close.length && await bestOf(close, year);
  if (track) return { track, status: 'osäker', why: 'titeln stämmer inte exakt' };
  return null;
}

const classical = (category) => Boolean(category.labels && /verk/i.test(category.labels.title));
const film = (category) => category.id === 'filmmusik';
const countries = (category) => Boolean(category.labels && /land/i.test(category.labels.artist));

async function search(q) {
  const data = await deezer('search?' + new URLSearchParams({ q, limit: '25' }));
  return (data && data.data) || [];
}

async function topTracks(name) {
  const found = await deezer('search/artist?' + new URLSearchParams({ q: name, limit: '5' }));
  const artist = ((found && found.data) || []).find((a) => norm(a.name) === norm(name));
  if (!artist) return [];
  const top = await deezer(`artist/${artist.id}/top?limit=100`);
  return (top && top.data) || [];
}

export async function find(song, category) {
  const title = film(category) ? song.track : song.title;
  // I Eurovision är "artist" landet. Artisten står i verktyg/eurovision-artister.json.
  const artists = countries(category) ? [PERFORMERS[song.id]].filter(Boolean) : [song.artist];

  if (classical(category)) {
    // Verket söks utan krav på artist, eftersom Deezer oftast anger orkestern.
    const words = norm(song.title).split(' ').filter((w) => w.length > 2);
    const surname = norm(song.artist).split(' ').pop();
    const hits = (await search(`${surname} ${song.title}`))
      .filter((t) => t.preview && !unwanted(t, song.title)
        && words.every((w) => norm(t.title + ' ' + (t.album ? t.album.title : '')).includes(w)));
    hits.sort((a, b) => (b.rank || 0) - (a.rank || 0));
    const track = await bestOf(hits, null);
    return track ? { track, status: 'osäker', why: 'klassiskt verk, kontrollera inspelningen' } : null;
  }

  let best = null;
  if (artists.length) {
    // Sökningen visar ibland bara live- och remixversioner. Artistens 100 mest
    // spelade låtar brukar innehålla originalet.
    const candidates = [
      ...await search(`artist:"${artists[0]}" track:"${title}"`),
      ...await search(`${artists[0]} ${title}`),
      ...await topTracks(artists[0]),
    ];
    best = await rank(candidates, artists, title, song.year);
  }
  if (!best && (countries(category) || film(category))) {
    // Utan känd artist: den mest spelade inspelningen med exakt titel.
    const extra = countries(category) ? 'eurovision' : 'soundtrack';
    for (const q of [`track:"${title}"`, `${title} ${extra}`]) {
      const hits = (await search(q)).filter((t) => t.preview && !unwanted(t, title)
        && baseTitle(t.title_short || t.title) === baseTitle(title));
      hits.sort((a, b) => (b.rank || 0) - (a.rank || 0));
      const track = await bestOf(hits, song.year);
      if (track) { best = { track, status: 'osäker', why: 'artisten okänd, vald efter titel' }; break; }
    }
  }
  return best;
}

const again = process.argv.includes('--igen');
const ids = process.argv.slice(2).filter((a) => a !== '--igen');
const categories = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8'));
const report = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {};

for (const id of ids) {
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Error('Okänd kategori ' + id);
  const path = new URL(`../data/${category.file}`, import.meta.url);
  const songs = JSON.parse(readFileSync(path, 'utf8'));
  const rows = [];
  for (const song of songs) {
    if (song.deezerId && !again) continue;
    delete song.deezerId;
    const choice = (CHOICES[id] || {})[song.id];
    if (choice !== undefined) {
      if (choice) song.deezerId = choice;
      continue;
    }
    const hit = await find(song, category);
    const row = { id: song.id, artist: song.artist, title: film(category) ? `${song.title} (${song.track})` : song.title, year: song.year };
    if (hit) {
      song.deezerId = hit.track.id;
      Object.assign(row, {
        status: hit.status, why: hit.why, deezerId: hit.track.id,
        found: `${hit.track.artist.name} – ${hit.track.title} [${hit.track.album ? hit.track.album.title : ''}]`,
      });
    } else {
      row.status = 'saknas';
    }
    rows.push(row);
    console.log(`${row.status.padEnd(7)} ${row.artist} – ${row.title}${row.found ? '  →  ' + row.found : ''}`);
  }
  writeFileSync(path, JSON.stringify(songs, null, 1) + '\n');
  report[id] = rows;
  writeFileSync(REPORT, JSON.stringify(report, null, 1) + '\n');
  const count = (s) => rows.filter((r) => r.status === s).length;
  console.log(`\n${category.name}: ${count('trolig')} troliga, ${count('osäker')} osäkra, ${count('saknas')} saknas.\n`);
}
saveCache();
