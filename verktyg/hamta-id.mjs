// Hämtar Spotify-ID för en kandidatlista från Wikidata och MusicBrainz.
// Körs med Node av Claude, så att ingen behöver köra verktyget i webbläsaren:
//
//   node verktyg/hamta-id.mjs data/kandidater/2010-tal.json [mål]
//
// Skriver kategorifilen i data/ med bara låtar som har ID, och lägger
// kandidater som söktes utan träff som lockbeten i data/forslag.json.
// Svaren sparas i verktyg/.cache.json så att en ny körning går snabbt.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pickWikidataTrack, artistMatches, titleMatches } from '../js/lookup.js';

const UA = 'lat-quiz/0.1 (https://github.com/JediJonas/lat-quiz)';
const CACHE = new URL('./.cache.json', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

async function getJson(url, tries = 6) {
  if (cache[url]) return cache[url];
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, application/sparql-results+json' } });
    if (res.ok) {
      const data = await res.json();
      cache[url] = data;
      writeFileSync(CACHE, JSON.stringify(cache));
      return data;
    }
    if (res.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  throw new Error('Inget svar från ' + url);
}

// Samma fråga som verktyg/spotify-id.html: titeln söks, artist (P175) eller kompositör (P86).
async function wikidata(title) {
  const query = `SELECT ?itemLabel ?spotify ?performerLabel WHERE {
    SERVICE wikibase:mwapi {
      bd:serviceParam wikibase:endpoint "www.wikidata.org";
                      wikibase:api "EntitySearch";
                      mwapi:search ${JSON.stringify(title)};
                      mwapi:language "en";
                      mwapi:limit "50".
      ?item wikibase:apiOutputItem mwapi:item.
    }
    ?item wdt:P2207 ?spotify.
    OPTIONAL { ?item wdt:P175|wdt:P86 ?performer. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,sv,mul". }
  }`;
  const data = await getJson('https://query.wikidata.org/sparql?' + new URLSearchParams({ query, format: 'json' }));
  await sleep(1000);
  return data.results.bindings.map((b) => ({
    title: b.itemLabel ? b.itemLabel.value : '',
    performer: b.performerLabel ? b.performerLabel.value : '',
    spotify: b.spotify.value,
  }));
}

const quote = (t) => '"' + t.replace(/["\\]/g, ' ') + '"';
const LIVE = /\b(live|karaoke|instrumental|acoustic|remix|mix|demo|cover|atmos|sessions?)\b/i;

// Söker inspelningar med rätt artist och titel och tar den första med en Spotify-länk.
async function musicbrainz(song) {
  const mb = 'https://musicbrainz.org/ws/2/';
  const query = `recording:${quote(song.title)} AND artist:${quote(song.artist)}`;
  const found = await getJson(mb + 'recording?' + new URLSearchParams({ query, fmt: 'json', limit: '25' }));
  await sleep(1100);
  const recordings = (found ? found.recordings : [])
    .filter((r) => titleMatches(song.title, r.title)
      && r['artist-credit'].some((c) => artistMatches(song.artist, c.name))
      && !LIVE.test(r.disambiguation || '') && !LIVE.test(r.title));
  for (const r of recordings.slice(0, 10)) {
    const rec = await getJson(mb + `recording/${r.id}?` + new URLSearchParams({ inc: 'url-rels', fmt: 'json' }));
    await sleep(1100);
    const rel = (rec && rec.relations || []).find((x) => /open\.spotify\.com\/track\//.test(x.url && x.url.resource));
    if (rel) return { spotify: rel.url.resource.match(/track\/([A-Za-z0-9]{22})/)[1], title: r.title, performer: r['artist-credit'].map((c) => c.name).join(', ') };
  }
  return null;
}

const [listPath, targetArg] = process.argv.slice(2);
const list = JSON.parse(readFileSync(listPath, 'utf8'));
const target = Number(targetArg) || 100;
const outPath = new URL(`../data/${list.file}`, import.meta.url);
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).filter((s) => s.spotifyId) : [];
const have = new Set(existing.map((s) => s.id));
const usedIds = new Set(existing.map((s) => s.spotifyId));
const added = [];
const missing = [];

for (const song of list.songs.filter((s) => !have.has(s.id))) {
  if (existing.length + added.length >= target) break;
  let hit = pickWikidataTrack(song, await wikidata(song.title));
  let source = 'Wikidata';
  if (!hit) { hit = await musicbrainz(song); source = 'MusicBrainz'; }
  if (hit && !usedIds.has(hit.spotify)) {
    usedIds.add(hit.spotify);
    added.push({ ...song, spotifyId: hit.spotify });
    console.log(`OK   ${song.artist} – ${song.title}  [${source}: ${hit.performer} – ${hit.title}] ${hit.spotify}`);
  } else {
    missing.push(song);
    console.log(`SAKNAS ${song.artist} – ${song.title}`);
  }
}

const songs = [...existing, ...added];
writeFileSync(outPath, JSON.stringify(songs, null, 1) + '\n');

const forslagPath = new URL('../data/forslag.json', import.meta.url);
const forslag = JSON.parse(readFileSync(forslagPath, 'utf8'));
const merge = (old, more) => [...new Set([...old, ...more])].sort();
forslag.artists = merge(forslag.artists, missing.map((s) => s.artist));
forslag.titles = merge(forslag.titles, missing.map((s) => s.title));
const lines = (items) => items.map((t) => JSON.stringify(t)).join(',\n');
writeFileSync(forslagPath, `{\n"artists": [\n${lines(forslag.artists)}\n],\n"titles": [\n${lines(forslag.titles)}\n]\n}\n`);

console.log(`\n${list.name}: ${songs.length} av ${target} låtar har ID. ${missing.length} kandidater utan träff blev lockbeten.`);
