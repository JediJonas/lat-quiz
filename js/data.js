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

// Förslagen är lockbetena plus alla quizlåtar, så att rätt svar alltid finns med.
export async function loadSuggestions() {
  const [decoys, categories] = await Promise.all([getJson('data/forslag.json'), loadCategories()]);
  const lists = await Promise.all(categories.map(loadSongs));
  return mergeSuggestions(decoys, lists.flat());
}

// Varje svar visas en gång, även om det stavas olika, som "Carpe Diem" och "Carpe diem".
// Rättningen bortser ändå från sådana skillnader. Quizlåtarnas stavning går före lockbetenas.
export function mergeSuggestions(decoys, songs) {
  const collator = new Intl.Collator('sv');
  const unique = (items) => {
    const seen = new Map();
    for (const item of items) if (!seen.has(normalize(item))) seen.set(normalize(item), item);
    return [...seen.values()].sort(collator.compare);
  };
  return {
    artists: unique([...songs.map((s) => s.artist), ...decoys.artists]),
    titles: unique([...songs.map((s) => s.title), ...decoys.titles]),
  };
}

// Öppnar låten direkt i Spotify-appen. Kräver att appen är installerad. Utan autoplay
// byter appen på datorn inte låt om en annan redan spelar.
export function spotifyAppUrl(song) {
  return song.spotifyId ? 'spotify:track:' + song.spotifyId + '?autoplay=true' : null;
}

// Utan Spotify-ID öppnas en sökning, där spelledaren väljer översta träffen.
export function spotifyUrl(song) {
  if (song.spotifyId) return 'https://open.spotify.com/track/' + song.spotifyId;
  return 'https://open.spotify.com/search/' + encodeURIComponent(song.artist + ' ' + song.title);
}
