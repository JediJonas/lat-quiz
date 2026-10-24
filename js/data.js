// Läser låtlistor och förslagslista från data-mappen.

import { normalize } from './text.js';

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Kunde inte läsa ' + path);
  return res.json();
}

export function loadCategories() {
  return getJson('data/categories.json');
}

export async function loadSongs(category) {
  return getJson('data/' + category.file);
}

// Fälten heter olika i olika kategorier, och varje sorts fält får förslag ur en egen lista,
// så att man bara ser länder när man gissar på land och bara filmer när man gissar på film.
// Fält som heter något annat, som Artist, Titel och Låt, får artister och låtar.
const KINDS = {
  artist: { Land: 'countries', Kompositör: 'composers' },
  title: { Film: 'films', Verk: 'works' },
};

export function suggestionKind(field, label) {
  return KINDS[field][label] || (field === 'artist' ? 'artists' : 'titles');
}

// Förslagen är lockbetena plus alla quizlåtar, så att rätt svar alltid finns med.
export async function loadSuggestions() {
  const [decoys, categories] = await Promise.all([getJson('data/forslag.json'), loadCategories()]);
  const lists = await Promise.all(categories.map(loadSongs));
  return mergeSuggestions(decoys, categories.map((c, i) => ({ labels: c.labels, songs: lists[i] })));
}

// categories: [{ labels, songs }]. Varje quizlåts svar hamnar i listan för fältets sort i kategorin.
// Varje svar visas en gång, även om det stavas olika, som "Carpe Diem" och "Carpe diem".
// Rättningen bortser ändå från sådana skillnader. Quizlåtarnas stavning går före lockbetenas.
export function mergeSuggestions(decoys, categories) {
  const collator = new Intl.Collator('sv');
  const unique = (items) => {
    const seen = new Map();
    for (const item of items) if (!seen.has(normalize(item))) seen.set(normalize(item), item);
    return [...seen.values()].sort(collator.compare);
  };
  const answers = {};
  for (const { labels = {}, songs } of categories) {
    for (const field of ['artist', 'title']) {
      const kind = suggestionKind(field, labels[field]);
      (answers[kind] ||= []).push(...songs.map((s) => s[field]));
    }
  }
  const kinds = [...Object.values(KINDS).flatMap(Object.values), 'artists', 'titles'];
  return Object.fromEntries(kinds.map((kind) => [kind, unique([...(answers[kind] || []), ...(decoys[kind] || [])])]));
}
