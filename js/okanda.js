// Låtar som spelledaren har markerat som okända. De hoppas över i kommande
// spel och kan kopieras som text, så att de tas bort ur kategorin.
// Modulen gör inga anrop och rör inte sidan, så den kan testas utan webbläsare.
// Listan ser ut så här: { kategori: [{ id, artist, title }] }.

export const UNKNOWN_KEY = 'latquiz-okanda';

export function cleanUnknown(list) {
  if (!list || typeof list !== 'object' || Array.isArray(list)) return {};
  const clean = {};
  for (const [categoryId, songs] of Object.entries(list)) {
    if (!Array.isArray(songs)) continue;
    const valid = songs.filter((s) => s && typeof s.id === 'string');
    if (valid.length) clean[categoryId] = valid.map(({ id, artist = '', title = '' }) => ({ id, artist, title }));
  }
  return clean;
}

export function isUnknown(list, categoryId, songId) {
  return (list[categoryId] || []).some((s) => s.id === songId);
}

// Markerar låten, eller tar bort markeringen om den redan finns. Returnerar en ny lista.
export function toggleUnknown(list, categoryId, song) {
  const songs = list[categoryId] || [];
  const next = { ...list };
  if (songs.some((s) => s.id === song.id)) {
    next[categoryId] = songs.filter((s) => s.id !== song.id);
    if (!next[categoryId].length) delete next[categoryId];
  } else {
    next[categoryId] = [...songs, { id: song.id, artist: song.artist, title: song.title }];
  }
  return next;
}

export function countUnknown(list) {
  return Object.values(list).reduce((sum, songs) => sum + songs.length, 0);
}

// Kategorins låtar utan de okända. Är alla markerade används hela listan,
// så att spelet inte stannar.
export function withoutUnknown(list, categoryId, songs) {
  const left = songs.filter((s) => !isUnknown(list, categoryId, s.id));
  return left.length ? left : songs;
}

// Texten som spelledaren kopierar och skickar vidare, en kategori i taget.
export function formatUnknown(list, names = {}) {
  return Object.entries(list)
    .map(([categoryId, songs]) => [
      `${names[categoryId] || categoryId}:`,
      ...songs.map((s) => `- ${s.artist} – ${s.title} (${s.id})`),
    ].join('\n'))
    .join('\n\n');
}
