// Matchning för uppslagningsverktyget (verktyg/spotify-id.html).
// Funktionerna här gör inga anrop, så de kan testas utan nätverk.

export function norm(text) {
  return (text || '')
    .toLocaleLowerCase('sv')
    .replace(/&/g, ' and ')
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tar bort tillägg som "(Remastered 2009)" och "- 2011 Remaster".
export function baseTitle(text) {
  return norm((text || '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mono|stereo|single|feat|from|mix|live|deluxe)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mono|stereo|single|live|mix).*$/i, ''));
}

export function artistMatches(wanted, found) {
  const a = norm(wanted);
  const b = norm(found);
  return Boolean(a && b) && (a === b || b.includes(a) || a.includes(b));
}

export function titleMatches(wanted, found) {
  const a = baseTitle(wanted);
  const b = baseTitle(found);
  return Boolean(a && b) && (a === b || b.startsWith(a + ' ') || a.startsWith(b + ' '));
}

// Väljer en träff från Wikidata där både artist och titel stämmer.
// rows: [{ title, performer, spotify }]
export function pickWikidataTrack(song, rows) {
  const hits = rows.filter((r) => artistMatches(song.artist, r.performer) && titleMatches(song.title, r.title));
  hits.sort((a, b) => {
    const exactA = baseTitle(a.title) === baseTitle(song.title) ? 0 : 1;
    const exactB = baseTitle(b.title) === baseTitle(song.title) ? 0 : 1;
    return exactA - exactB;
  });
  return hits[0] || null;
}

// Läser ut ett Spotify-ID ur en länk, en URI eller ett bart ID.
export function parseSpotifyId(text) {
  const match = String(text || '').trim().match(/(?:^|track[/:])([A-Za-z0-9]{22})(?:[?#].*)?$/);
  return match ? match[1] : null;
}
