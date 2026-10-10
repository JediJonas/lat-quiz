// Läser låtlistor och förslagslista från data-mappen.

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
  const artists = new Set(decoys.artists);
  const titles = new Set(decoys.titles);
  for (const song of lists.flat()) {
    artists.add(song.artist);
    titles.add(song.title);
  }
  const collator = new Intl.Collator('sv');
  return {
    artists: [...artists].sort(collator.compare),
    titles: [...titles].sort(collator.compare),
  };
}

// Utan Spotify-ID öppnas en sökning, där spelledaren väljer översta träffen.
export function spotifyUrl(song) {
  if (song.spotifyId) return 'https://open.spotify.com/track/' + song.spotifyId;
  return 'https://open.spotify.com/search/' + encodeURIComponent(song.artist + ' ' + song.title);
}
