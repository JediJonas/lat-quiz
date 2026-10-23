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
  const categories = read('data/categories.json').map(({ id, name, songs }) => ({ id, name, songs }));
  assert.deepEqual(options, categories, 'Uppdatera listan i host.html');
  assert.match(html, new RegExp(`${categories.length} kategorier`));
});

test('antalet låtar i categories.json stämmer med kategorins fil', () => {
  for (const category of read('data/categories.json')) {
    assert.equal(category.songs, read('data/' + category.file).length, `Uppdatera songs för ${category.id} i categories.json`);
  }
});

test('förslagslistan har inga lockbeten som kan förväxlas med rätt svar', async () => {
  const { cleanDecoys } = await import('../verktyg/lockbeten.mjs');
  const forslag = read('data/forslag.json');
  const categories = read('data/categories.json').map((c) => ({ id: c.id, songs: read('data/' + c.file) }));
  const clean = cleanDecoys(forslag, categories);
  for (const key of ['artists', 'titles']) {
    const kept = new Set(clean[key]);
    const bad = forslag[key].filter((x) => !kept.has(x));
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
    artists: ['Azerbajdzjans bidrag i Eurovision Song Contest', 'E-Type feat. Na Na', 'ABBA & Abba', 'Eric Saade & Dev'],
    titles: ['Thor: En mörk värld', 'Välkommen hem / Välkommen hem (singback)', 'Carina (karaokeversion)',
      'Light Me Up (Gromee song)', 'Denmark in the Eurovision Song Contest 1957',
      "Hey Mr. DJ (Won't You Play Another Love Song)", 'Thorns'],
  }, categories);
  assert.deepEqual(result.artists, ['ABBA', 'Eric Saade & Dev']);
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

test('förslagen visar varje svar en gång, med quizlåtens stavning', async () => {
  const { mergeSuggestions } = await import('../js/data.js');
  const songs = [
    { artist: 'Fröken Snusk', title: 'Carpe diem' },
    { artist: 'FRÖKEN SNUSK', title: 'Unga & fria' },
  ];
  const result = mergeSuggestions({ artists: ['Fröken snusk', 'ABBA'], titles: ['Carpe Diem'] }, songs);
  assert.deepEqual(result, { artists: ['ABBA', 'Fröken Snusk'], titles: ['Carpe diem', 'Unga & fria'] });
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
