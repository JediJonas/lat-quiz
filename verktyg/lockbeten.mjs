// Städar lockbetena i data/forslag.json. Wikidata-etiketter är ibland inte låtens
// namn utan en artikelrubrik, en singel med b-sida eller en annan version, och då
// dyker de upp i förslagen precis när någon skriver rätt svar.

import { normalize } from '../js/text.js';
import { suggestionKind, suggestionKey, songLabels } from '../js/data.js';

const VERSION = /\s*\([^()]*(karaoke|instrumental|singback|sjung själv|maxi|unplugged|version|live|mix|edit|radio|censur)[^()]*\)$/i;
// Förtydliganden från engelska Wikipedia, som "Light Me Up (Gromee song)". Gemen "song" med flit,
// så att "(Won't You Play Another Love Song)" får vara kvar.
const DISAMBIGUATION = /\s*\((?:[^()]*\s)?song\)$/;
// Uppföljare och delar av en filmserie, som "Thor: En mörk värld" när svaret är "Thor".
const SEQUEL = /^(:|\s+och\s|\s+[-–]\s|\s+\d)/;
const SUBTITLE = /\s+\([^()]+\)$/;

const JUNK = [/in the Eurovision Song Contest/i, /s bidrag i Eurovision/i, /landslag/i, /^AIK Fotboll$/, /Dilshadilu07/];

export function cleanTitle(title) {
  let t = title.split(/\s+[/;]\s+/)[0].trim();
  let prev;
  do { prev = t; t = t.replace(VERSION, '').replace(DISAMBIGUATION, '').trim(); } while (t !== prev);
  return t;
}

export function cleanArtist(artist) {
  const parts = artist.replace(/\s+feat\.?\s.*$/i, '').split(' & ').map((p) => p.trim());
  // "ABBA & Abba" blir "ABBA". Ett namn som "Years & Years", där delarna stavas exakt lika, får vara kvar.
  if (parts.every((p) => p === parts[0])) return parts.join(' & ');
  return parts.filter((p, i) => parts.findIndex((q) => normalize(q) === normalize(p)) === i).join(' & ');
}

// categories: [{ id, labels, songs }] med alla quizlåtar. Lockbeten som är samma som ett rätt svar
// tas bort, eftersom rätt svar ändå läggs till i förslagen när spelet laddar. Det gäller bara listan
// som svaret hamnar i, så att Jerry Goldsmith finns kvar bland kompositörerna i Filmmusik även när
// han är ett rätt svar som artist i Halloween.
export function cleanDecoys(forslag, categories) {
  const answers = { artists: new Set(), titles: new Set() };
  const same = {};
  const films = [];
  for (const { id, labels = {}, songs } of categories) {
    for (const song of songs) {
      answers.artists.add(normalize(song.artist));
      answers.titles.add(normalize(song.title));
      for (const field of ['artist', 'title']) {
        const kind = suggestionKind(field, songLabels(song, labels)[field]);
        (same[kind] ||= new Set()).add(suggestionKey(song[field], kind));
      }
      // Ledmotiv har spårets namn i track, även i Halloween, där titeln är filmen eller serien.
      if (id === 'filmmusik' || song.track) films.push(song.title);
    }
  }
  const isSequel = (title) => films.some((film) => title.startsWith(film) && SEQUEL.test(title.slice(film.length)));
  // Samma låt med undertitel, som "Sweet Dreams (Are Made of This)" när svaret är "Sweet Dreams".
  const isSubtitled = (title) => SUBTITLE.test(title) && answers.titles.has(normalize(title.replace(SUBTITLE, '')));
  // Hela namnet på en artist som svaret anger med ett ord, som "Darin Zanyar" när svaret är "Darin".
  const isFullName = (artist) => !/\s[&+]\s/.test(artist)
    && [...answers.artists].some((a) => !a.includes(' ') && normalize(artist).startsWith(a + ' '));
  // Samarbeten där någon är ett rätt svar, som "Eminem & Dr. Dre" när svaret är "Eminem", eller
  // har ett rätt svars fullständiga namn, som "Darin Zanyar & Kat DeLuna". Samarbeten
  // som är rätt svar finns ändå med, eftersom alla quizlåtars artister läggs till i förslagen.
  const hasAnswer = (artist) => artist.split(/\s+[&+]\s+/)
    .some((p) => answers.artists.has(normalize(p)) || isFullName(p));
  const isConfusable = (artist) => isFullName(artist) || (/\s[&+]\s/.test(artist) && hasAnswer(artist));
  const clean = (items, fix, kind, extra) => {
    const wanted = same[kind] || new Set();
    // En stavning per lockbete, så att "15 Minuter" och "15 minuter" inte båda visas. Samma namn
    // med "and" i stället för "&" räknas också som rätt svar, som "Nick Cave and the Bad Seeds"
    // när svaret är "Nick Cave & The Bad Seeds", se suggestionKey i js/data.js.
    const key = (x) => suggestionKey(x, kind);
    const seen = new Map();
    const kept = items.map(fix).sort()
      .filter((x) => x && !wanted.has(key(x)) && !JUNK.some((re) => re.test(x)) && !extra(x));
    for (const x of kept) if (!seen.has(key(x))) seen.set(key(x), x);
    return [...seen.values()];
  };
  return {
    artists: clean(forslag.artists, cleanArtist, 'artists', isConfusable),
    titles: clean(forslag.titles, cleanTitle, 'titles', (t) => isSequel(t) || isSubtitled(t)),
    // Lockbeten för fält som heter Land, Kompositör, Film och Verk, se suggestionKind i js/data.js.
    countries: clean(forslag.countries || [], (c) => c.trim(), 'countries', () => false),
    composers: clean(forslag.composers || [], cleanArtist, 'composers', isConfusable),
    films: clean(forslag.films || [], cleanTitle, 'films', (t) => isSequel(t) || isSubtitled(t)),
    works: clean(forslag.works || [], cleanTitle, 'works', isSubtitled),
  };
}

export function formatForslag(forslag) {
  const lines = (items) => items.map((t) => JSON.stringify(t)).join(',\n');
  const keys = Object.keys(forslag).filter((key) => forslag[key].length);
  return `{\n${keys.map((key) => `"${key}": [\n${lines(forslag[key])}\n]`).join(',\n')}\n}\n`;
}
