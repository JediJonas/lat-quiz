// Läser låtlistor och förslagslista från data-mappen.

import { answerKey } from './text.js';

// Ett enstaka fel, som när GitHub Pages just har publicerat en ny version eller mobilnätet
// hackar till, ska inte stoppa spelet. Därför försöker sidan igen två gånger innan den ger upp.
const RETRY_MS = [500, 1500];

export async function getJson(path, { retries = RETRY_MS } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Inget svar');
      return await res.json();
    } catch {
      if (attempt >= retries.length) throw new Error('Kunde inte läsa ' + path);
      await new Promise((resolve) => { setTimeout(resolve, retries[attempt]); });
    }
  }
}

export function loadCategories() {
  return getJson('data/categories.json');
}

// Säsongskategorier, som Halloween, syns bara mellan två datum varje år. Datumen står som
// "MM-DD" i categories.json, till exempel { "from": "10-15", "to": "11-05" }, och båda dagarna
// räknas med. Ett fönster över nyår, som "12-01" till "01-06", går också.
export function inSeason(category, date = new Date()) {
  const { season } = category;
  if (!season) return true;
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return season.from <= season.to
    ? today >= season.from && today <= season.to
    : today >= season.from || today <= season.to;
}

// En kategori med "active": false i categories.json är avstängd och syns inte alls, inte ens
// under sin säsong. Utan active är kategorin på.
export const isActive = (category) => category.active !== false;

// Kategorierna som går att välja. keep är en kategori som redan spelas och får stå kvar
// i Inställningar även när säsongen har tagit slut eller kategorin har stängts av.
export function visibleCategories(categories, { date = new Date(), keep = null } = {}) {
  return categories.filter((c) => c.id === keep || (isActive(c) && inSeason(c, date)));
}

export async function loadSongs(category) {
  return getJson('data/' + category.file);
}

// Fälten heter olika i olika kategorier, och varje sorts fält får förslag ur en egen lista,
// så att man bara ser länder när man gissar på land och bara filmer när man gissar på film.
// Fält som heter något annat, som Artist, Titel och Låt, får artister och låtar.
// Serier delar lista med filmerna.
const KINDS = {
  artist: { Land: 'countries', Kompositör: 'composers' },
  title: { Film: 'films', Serie: 'films', Verk: 'works' },
};

// I blandade kategorier som Halloween kan en låt ha egna fältnamn, som Kompositör och Film
// för ett ledmotiv, och de går före kategorins.
export function songLabels(song, labels) {
  return (song && song.labels) || labels;
}

export function suggestionKind(field, label) {
  return KINDS[field][label] || (field === 'artist' ? 'artists' : 'titles');
}

// Nyckeln som avgör om två förslag av samma sort är samma svar, se answerKey i js/text.js.
// Namn på artister, kompositörer och länder får tappa ett inledande "The", titlar inte.
export function suggestionKey(item, kind) {
  return answerKey(item, { article: !['titles', 'films', 'works'].includes(kind) });
}

// Förslagen är lockbetena plus alla quizlåtar, så att rätt svar alltid finns med.
export async function loadSuggestions() {
  const [decoys, categories] = await Promise.all([getJson('data/forslag.json'), loadCategories()]);
  const lists = await Promise.all(categories.map(loadSongs));
  return mergeSuggestions(decoys, categories.map((c, i) => ({ labels: c.labels, songs: lists[i] })));
}

// categories: [{ labels, songs }]. Varje quizlåts svar hamnar i listan för fältets sort i kategorin.
// Varje svar visas en gång, även om det stavas olika, som "Carpe Diem" och "Carpe diem"
// eller "Florence + the Machine" och "Florence and the Machine".
// Rättningen bortser ändå från sådana skillnader. Quizlåtarnas stavning går före lockbetenas.
export function mergeSuggestions(decoys, categories) {
  const collator = new Intl.Collator('sv');
  const unique = (items, kind) => {
    const seen = new Map();
    for (const item of items) if (!seen.has(suggestionKey(item, kind))) seen.set(suggestionKey(item, kind), item);
    return [...seen.values()].sort(collator.compare);
  };
  const answers = {};
  for (const { labels = {}, songs } of categories) {
    for (const song of songs) {
      for (const field of ['artist', 'title']) {
        const kind = suggestionKind(field, songLabels(song, labels)[field]);
        (answers[kind] ||= []).push(song[field]);
      }
    }
  }
  const kinds = [...Object.values(KINDS).flatMap(Object.values), 'artists', 'titles'];
  return Object.fromEntries(kinds.map((kind) => [kind, unique([...(answers[kind] || []), ...(decoys[kind] || [])], kind)]));
}
