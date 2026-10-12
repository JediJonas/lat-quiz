import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));

test('alla JSON-filer i data går att läsa', () => {
  for (const dir of ['data', 'data/kandidater']) {
    for (const file of readdirSync(new URL('../' + dir, import.meta.url))) {
      if (file.endsWith('.json')) assert.doesNotThrow(() => read(`${dir}/${file}`), `${dir}/${file}`);
    }
  }
});

test('varje quizlåt har ett unikt id och ett giltigt Spotify-ID', () => {
  for (const category of read('data/categories.json')) {
    const ids = new Set();
    for (const song of read('data/' + category.file)) {
      assert.ok(song.artist && song.title, `${category.file}: ${song.id} saknar artist eller titel`);
      assert.ok(!ids.has(song.id), `${category.file}: ${song.id} finns två gånger`);
      ids.add(song.id);
      assert.match(song.spotifyId, /^[A-Za-z0-9]{22}$/, `${category.file}: ${song.id}`);
      if ('deezerId' in song) assert.match(String(song.deezerId), /^\d+$/, `${category.file}: ${song.id} har ogiltigt Deezer-ID`);
    }
  }
});

test('kategorierna i host.html är desamma som i categories.json', () => {
  const html = readFileSync(new URL('../host.html', import.meta.url), 'utf8');
  const select = html.match(/<select id="category-select">([\s\S]*?)<\/select>/)[1];
  const options = [...select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(([, id, name]) => ({ id, name }));
  const categories = read('data/categories.json').map(({ id, name }) => ({ id, name }));
  assert.deepEqual(options, categories, 'Uppdatera listan i host.html');
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

test('varje filmmusiklåt har ledmotivets spårnamn', () => {
  for (const song of read('data/filmmusik.json')) {
    assert.ok(typeof song.track === 'string' && song.track.trim(), `filmmusik.json: ${song.id} saknar track`);
  }
});
