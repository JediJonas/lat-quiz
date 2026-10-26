import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normalize } from '../js/text.js';

const read = (path) => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));

test('alla JSON-filer i data går att läsa', () => {
  for (const dir of ['data', 'data/kandidater']) {
    for (const file of readdirSync(new URL('../' + dir, import.meta.url))) {
      if (file.endsWith('.json')) assert.doesNotThrow(() => read(`${dir}/${file}`), `${dir}/${file}`);
    }
  }
});

test('varje quizlåt har ett unikt id och ett giltigt Deezer-ID', () => {
  for (const category of read('data/categories.json')) {
    const ids = new Set();
    for (const song of read('data/' + category.file)) {
      assert.ok(song.artist && song.title, `${category.file}: ${song.id} saknar artist eller titel`);
      assert.ok(!ids.has(song.id), `${category.file}: ${song.id} finns två gånger`);
      ids.add(song.id);
      assert.match(String(song.deezerId), /^\d+$/, `${category.file}: ${song.id} saknar Deezer-ID`);
      assert.ok(!('spotifyId' in song), `${category.file}: ${song.id} har Spotify-ID, som inte används`);
    }
  }
});

test('kategorierna i host.html är desamma som i categories.json', () => {
  const html = readFileSync(new URL('../host.html', import.meta.url), 'utf8');
  const options = [...html.matchAll(/<input type="radio" name="category" value="([^"]+)"[^>]*>.*?<span class="cat-name">([^<]+)<span class="cat-songs">(\d+) låtar<\/span><\/span>/g)]
    .map(([, id, name, songs]) => ({ id, name: name.replaceAll('&shy;', ''), songs: Number(songs) }));
  // Säsongskategorier står inte i host.html. De läggs till när det är säsong för dem.
  const categories = read('data/categories.json').filter((c) => !c.season).map(({ id, name, songs }) => ({ id, name, songs }));
  assert.deepEqual(options, categories, 'Uppdatera listan i host.html');
  assert.match(html, new RegExp(`${categories.length} kategorier`));
});

test('säsongskategorier syns bara mellan sina datum', async () => {
  const { inSeason, visibleCategories } = await import('../js/data.js');
  const halloween = { id: 'halloween', season: { from: '10-15', to: '11-05' } };
  const jul = { id: 'jul', season: { from: '12-01', to: '01-06' } };
  const day = (s) => new Date(s + 'T12:00:00');
  assert.equal(inSeason(halloween, day('2026-10-14')), false);
  assert.equal(inSeason(halloween, day('2026-10-15')), true);
  assert.equal(inSeason(halloween, day('2026-10-31')), true);
  assert.equal(inSeason(halloween, day('2026-11-05')), true);
  assert.equal(inSeason(halloween, day('2026-11-06')), false);
  assert.equal(inSeason(jul, day('2026-12-24')), true);
  assert.equal(inSeason(jul, day('2027-01-06')), true);
  assert.equal(inSeason(jul, day('2027-01-07')), false);
  assert.equal(inSeason({ id: '80-tal' }, day('2026-06-01')), true);
  const all = [{ id: '80-tal' }, halloween];
  assert.deepEqual(visibleCategories(all, { date: day('2026-06-01') }).map((c) => c.id), ['80-tal']);
  assert.deepEqual(visibleCategories(all, { date: day('2026-06-01'), keep: 'halloween' }).map((c) => c.id), ['80-tal', 'halloween']);
});

test('säsongernas datum i categories.json är giltiga', () => {
  for (const { id, season } of read('data/categories.json')) {
    if (!season) continue;
    for (const d of [season.from, season.to]) assert.match(d, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, `${id}: ${d} ska vara MM-DD`);
  }
});

test('antalet låtar i categories.json stämmer med kategorins fil', () => {
  for (const category of read('data/categories.json')) {
    assert.equal(category.songs, read('data/' + category.file).length, `Uppdatera songs för ${category.id} i categories.json`);
  }
});

test('förslagslistan har inga lockbeten som kan förväxlas med rätt svar', async () => {
  const { cleanDecoys } = await import('../verktyg/lockbeten.mjs');
  const forslag = read('data/forslag.json');
  const categories = read('data/categories.json').map((c) => ({ id: c.id, labels: c.labels, songs: read('data/' + c.file) }));
  const clean = cleanDecoys(forslag, categories);
  for (const key of ['artists', 'titles', 'countries', 'composers', 'films', 'works']) {
    const kept = new Set(clean[key]);
    const bad = (forslag[key] || []).filter((x) => !kept.has(x));
    assert.deepEqual(bad, [], `Kör cleanDecoys i verktyg/lockbeten.mjs på data/forslag.json (${key})`);
  }
});

test('lockbeten städas från versioner, b-sidor och uppföljare', async () => {
  const { cleanDecoys } = await import('../verktyg/lockbeten.mjs');
  const categories = [
    { id: 'eurovision', songs: [{ artist: 'Azerbajdzjan', title: 'Drip' }] },
    { id: 'filmmusik', songs: [{ artist: 'Brian Tyler', title: 'Thor' }] },
    { id: 'svenska', songs: [{ artist: 'E-Type', title: 'Välkommen hem' }] },
  ];
  const result = cleanDecoys({
    artists: ['Azerbajdzjans bidrag i Eurovision Song Contest', 'E-Type feat. Na Na', 'ABBA & Abba', 'Eric Saade & Dev', 'Years & Years'],
    titles: ['Thor: En mörk värld', 'Välkommen hem / Välkommen hem (singback)', 'Carina (karaokeversion)',
      'Light Me Up (Gromee song)', 'Denmark in the Eurovision Song Contest 1957',
      "Hey Mr. DJ (Won't You Play Another Love Song)", 'Thorns'],
  }, categories);
  assert.deepEqual(result.artists, ['ABBA', 'Eric Saade & Dev', 'Years & Years']);
  assert.deepEqual(result.titles, ['Carina', "Hey Mr. DJ (Won't You Play Another Love Song)", 'Light Me Up', 'Thorns']);
});

test('lockbeten städas från undertitlar, fullständiga namn, samarbeten med rätt artist och dubbletter', async () => {
  const { cleanDecoys } = await import('../verktyg/lockbeten.mjs');
  const categories = [{ id: 'svenska', songs: [{ artist: 'Darin', title: 'Sweet Dreams' }] }];
  const result = cleanDecoys({
    artists: ['Darin Zanyar', 'Darin & Kat DeLuna', 'Kat DeLuna & Darin', 'Darin Zanyar & Kat DeLuna',
      'Kalle Moraeus & Orsa Spelmän', 'Kalle Moraeus & Orsa spelmän'],
    titles: ['Sweet Dreams (Are Made of This)', 'Sweet Dreams Are Made of This', '15 Minuter', '15 minuter'],
  }, categories);
  assert.deepEqual(result.artists, ['Kalle Moraeus & Orsa Spelmän']);
  assert.deepEqual(result.titles, ['15 Minuter', 'Sweet Dreams Are Made of This']);
});

test('lockbeten som är samma artist eller titel som ett rätt svar med annan stavning tas bort', async () => {
  const { cleanDecoys } = await import('../verktyg/lockbeten.mjs');
  const categories = [{ id: 'halloween', songs: [
    { artist: 'Nick Cave & The Bad Seeds', title: 'Red Right Hand' },
    { artist: 'The Sweet', title: 'Power' },
  ] }];
  const result = cleanDecoys({
    artists: ['Nick Cave and the Bad Seeds', 'Sweet', 'Misfits', 'The Misfits', 'Nick Cave'],
    titles: ['Red right-hand', 'The Power', 'Fast & Furious', 'Fast and Furious'],
  }, categories);
  assert.deepEqual(result.artists, ['Misfits', 'Nick Cave']);
  assert.deepEqual(result.titles, ['Fast & Furious', 'The Power']);
});

test('inget lockbete är samma svar som en quizlåt i samma förslagslista', async () => {
  const { suggestionKind, suggestionKey, songLabels } = await import('../js/data.js');
  const forslag = read('data/forslag.json');
  const answers = {};
  for (const c of read('data/categories.json')) {
    for (const song of read('data/' + c.file)) {
      for (const field of ['artist', 'title']) {
        const kind = suggestionKind(field, songLabels(song, c.labels || {})[field]);
        (answers[kind] ||= new Map()).set(suggestionKey(song[field], kind), song[field]);
      }
    }
  }
  const bad = Object.entries(forslag).flatMap(([kind, items]) => items
    .filter((x) => answers[kind]?.has(suggestionKey(x, kind)))
    .map((x) => `${x} (svaret är ${answers[kind].get(suggestionKey(x, kind))})`));
  assert.deepEqual(bad, [], 'Kör cleanDecoys i verktyg/lockbeten.mjs på data/forslag.json');
});

test('förslagen visar ett svar en gång även med "and" i stället för "&"', async () => {
  const { mergeSuggestions } = await import('../js/data.js');
  const result = mergeSuggestions({ artists: ['Nick Cave and the Bad Seeds', 'Black Eyed Peas'], titles: ['Power'] },
    [{ songs: [{ artist: 'Nick Cave & The Bad Seeds', title: 'The Power' }, { artist: 'The Black Eyed Peas', title: 'Where Is the Love?' }] }]);
  assert.deepEqual(result.artists, ['Nick Cave & The Bad Seeds', 'The Black Eyed Peas']);
  assert.deepEqual(result.titles, ['Power', 'The Power', 'Where Is the Love?']);
});

test('förslagen visar varje svar en gång, med quizlåtens stavning', async () => {
  const { mergeSuggestions } = await import('../js/data.js');
  const songs = [
    { artist: 'Fröken Snusk', title: 'Carpe diem' },
    { artist: 'FRÖKEN SNUSK', title: 'Unga & fria' },
  ];
  const result = mergeSuggestions({ artists: ['Fröken snusk', 'ABBA'], titles: ['Carpe Diem'] }, [{ songs }]);
  assert.deepEqual(result.artists, ['ABBA', 'Fröken Snusk']);
  assert.deepEqual(result.titles, ['Carpe diem', 'Unga & fria']);
});

test('förslagen visar bara svar av samma sort som fältet', async () => {
  const { mergeSuggestions, suggestionKind } = await import('../js/data.js');
  const result = mergeSuggestions({ artists: ['ABBA'], titles: ['Dancing Queen'], countries: ['Island'],
    composers: ['Max Steiner'], films: ['Casablanca'], works: ['Bolero'] }, [
    { songs: [{ artist: 'Loreen', title: 'Tattoo' }] },
    { labels: { artist: 'Land', title: 'Låt' }, songs: [{ artist: 'Sverige', title: 'Euphoria' }] },
    { labels: { artist: 'Kompositör', title: 'Film' }, songs: [{ artist: 'Hans Zimmer', title: 'Interstellar' }] },
    { labels: { artist: 'Kompositör', title: 'Verk' }, songs: [{ artist: 'Edvard Grieg', title: 'Morgonstämning' }] },
  ]);
  const list = (field, label) => result[suggestionKind(field, label)];
  assert.deepEqual(list('artist', 'Artist'), ['ABBA', 'Loreen']);
  assert.deepEqual(list('artist', 'Land'), ['Island', 'Sverige']);
  assert.deepEqual(list('artist', 'Kompositör'), ['Edvard Grieg', 'Hans Zimmer', 'Max Steiner']);
  assert.deepEqual(list('title', 'Titel'), ['Dancing Queen', 'Euphoria', 'Tattoo']);
  assert.deepEqual(list('title', 'Låt'), ['Dancing Queen', 'Euphoria', 'Tattoo']);
  assert.deepEqual(list('title', 'Film'), ['Casablanca', 'Interstellar']);
  assert.deepEqual(list('title', 'Verk'), ['Bolero', 'Morgonstämning']);
});

test('en låts egna rubriker styr vilken förslagslista svaret hamnar i', async () => {
  const { mergeSuggestions } = await import('../js/data.js');
  const result = mergeSuggestions({}, [{ songs: [
    { artist: 'Michael Jackson', title: 'Thriller' },
    { artist: 'John Williams', title: 'Hajen', labels: { artist: 'Kompositör', title: 'Film' } },
    { artist: 'Vic Mizzy', title: 'Familjen Addams', labels: { artist: 'Kompositör', title: 'Serie' } },
    { artist: 'Edvard Grieg', title: 'I bergakungens sal', labels: { artist: 'Kompositör', title: 'Verk' } },
  ] }]);
  assert.deepEqual(result.titles, ['Thriller']);
  assert.deepEqual(result.films, ['Familjen Addams', 'Hajen']);
  assert.deepEqual(result.works, ['I bergakungens sal']);
  assert.deepEqual(result.composers, ['Edvard Grieg', 'John Williams', 'Vic Mizzy']);
});

test('varje fältnamn i categories.json får förslag ur en egen lista', async () => {
  const { suggestionKind } = await import('../js/data.js');
  const known = { artist: ['Artist', 'Land', 'Kompositör'], title: ['Titel', 'Låt', 'Film', 'Serie', 'Verk'] };
  for (const { id, labels = {}, file } of read('data/categories.json')) {
    for (const field of ['artist', 'title']) {
      if (labels[field]) assert.ok(known[field].includes(labels[field]), `${id}: ${labels[field]} saknas i KINDS i js/data.js`);
      for (const song of read('data/' + file)) {
        const label = song.labels && song.labels[field];
        if (song.labels) assert.ok(known[field].includes(label), `${id}/${song.id}: ${label} saknas i KINDS i js/data.js`);
      }
    }
  }
  assert.equal(suggestionKind('artist', 'Land'), 'countries');
});

test('samma artist stavas likadant i alla kategorier', () => {
  const spellings = new Map();
  for (const { file } of read('data/categories.json')) {
    for (const { artist } of read('data/' + file)) {
      const key = normalize(artist);
      spellings.set(key, new Set([...(spellings.get(key) || []), artist]));
    }
  }
  const different = [...spellings.values()].filter((s) => s.size > 1).map((s) => [...s].join(' / '));
  assert.deepEqual(different, []);
});

test('varje filmmusiklåt har ledmotivets spårnamn', () => {
  for (const song of read('data/filmmusik.json')) {
    assert.ok(typeof song.track === 'string' && song.track.trim(), `filmmusik.json: ${song.id} saknar track`);
  }
});
