import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchIndex, findSuggestions, findWhole } from '../js/text.js';

const artists = searchIndex([
  'ABBA', 'Abba Teens', 'Beyoncé', 'Britney Spears', 'Dr. Alban', 'George Michael', 'Kent',
  'Madonna', 'Michael Jackson', 'Mikael Wiehe', 'The Beatles', 'The Rolling Stones', 'Zara Larsson',
]);
const titles = searchIndex([
  'A Different Kind of Love', 'Bohemian Rhapsody', 'Dancing Queen', 'Love Me Do', 'Lovely Day', 'Take On Me',
]);

const suggest = (index, text) => findSuggestions(index, text);

test('det som innehåller texten kommer först, sedan det som liknar den', () => {
  assert.deepEqual(suggest(artists, 'abb'), { exact: ['ABBA', 'Abba Teens'], close: [] });
  assert.deepEqual(suggest(artists, 'aba'), { exact: [], close: ['ABBA', 'Abba Teens', 'Dr. Alban'] });
});

test('stavfel förlåts i förslagen', () => {
  assert.deepEqual(suggest(artists, 'micael').close, ['George Michael', 'Michael Jackson', 'Mikael Wiehe']);
  assert.deepEqual(suggest(artists, 'micael jakson').close, ['Michael Jackson']);
  assert.deepEqual(suggest(artists, 'beyonse').close, ['Beyoncé']);
  assert.deepEqual(suggest(artists, 'madona').close, ['Madonna']);
  assert.deepEqual(suggest(artists, 'brittney').close, ['Britney Spears']);
  assert.deepEqual(suggest(artists, 'the beatels').close, ['The Beatles']);
  assert.deepEqual(suggest(artists, 'rolling stons').close, ['The Rolling Stones']);
  assert.deepEqual(suggest(artists, 'zara larson').close, ['Zara Larsson']);
  assert.deepEqual(suggest(titles, 'dancing quen').close, ['Dancing Queen']);
  assert.deepEqual(suggest(titles, 'tak on me').close, ['Take On Me']);
  assert.deepEqual(suggest(titles, 'boheiman').close, ['Bohemian Rhapsody']);
});

test('det man skrivit får sluta mitt i ett ord', () => {
  assert.deepEqual(suggest(artists, 'micael jack').close, ['Michael Jackson']);
  assert.deepEqual(suggest(artists, 'micae').close, ['George Michael', 'Michael Jackson', 'Mikael Wiehe']);
});

test('korta texter förlåter bara en bokstav som saknas eller två som bytt plats', () => {
  assert.deepEqual(suggest(artists, 'abab').close, ['ABBA', 'Abba Teens']);
  // Utbytt eller extra bokstav ger inga förslag med 3–4 tecken.
  assert.deepEqual(suggest(artists, 'kemt').close, []);
  assert.deepEqual(suggest(artists, 'kant').close, []);
});

test('förslag som inte liknar det man skrivit visas inte', () => {
  // Stavfel räknas bara från början av ett ord, inte mitt i det.
  assert.deepEqual(suggest(artists, 'ichael').exact, ['George Michael', 'Michael Jackson']);
  assert.deepEqual(suggest(artists, 'ickael').close, []);
  // Den sista bokstaven måste stämma, annars blir det för många förslag medan man skriver.
  assert.deepEqual(suggest(titles, 'lovex').close, []);
  // För många stavfel.
  assert.deepEqual(suggest(artists, 'rolin stons').close, []);
  assert.deepEqual(suggest(artists, 'medanna').close, []);
});

test('färre än 3 tecken ger inga stavfelsförslag', () => {
  assert.deepEqual(suggest(artists, 'ab').close, []);
});

test('korta namn föreslås när hela namnet är skrivet', () => {
  const short = searchIndex(['OK', 'T.I.', 'U2', 'U2 & Green Day', 'X']);
  assert.deepEqual(findWhole(short, 'u2'), ['U2']);
  assert.deepEqual(findWhole(short, 'U 2'), ['U2']);
  assert.deepEqual(findWhole(short, 'ti'), ['T.I.']);
  assert.deepEqual(findWhole(short, 'x'), ['X']);
  assert.deepEqual(findWhole(short, 'u'), []);
  assert.deepEqual(findWhole(short, ''), []);
});

test('hela namnet först, sedan ord som börjar med texten, sedan resten', () => {
  const songs = searchIndex(['Bitter Sweet Symphony', 'Ken Thorne', 'Kent', 'Pastoral Symphony', 'Rolfe Kent', 'Symphony', 'Symphony No. 5']);
  assert.deepEqual(suggest(songs, 'symphony').exact, ['Symphony', 'Bitter Sweet Symphony', 'Pastoral Symphony', 'Symphony No. 5']);
  assert.deepEqual(suggest(songs, 'kent').exact, ['Kent', 'Rolfe Kent', 'Ken Thorne']);
});

test('ord som börjar med det man skrivit räknas även över mellanslag', () => {
  const names = searchIndex(['Broken Thorne', 'Ken Thorne']);
  assert.deepEqual(suggest(names, 'ken th').exact, ['Ken Thorne', 'Broken Thorne']);
});
