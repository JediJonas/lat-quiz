// Textmatchning för verktyget som hämtar Deezer-ID (verktyg/deezer-id.mjs).
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

export function titleMatches(wanted, found) {
  const a = baseTitle(wanted);
  const b = baseTitle(found);
  return Boolean(a && b) && (a === b || b.startsWith(a + ' ') || a.startsWith(b + ' '));
}
