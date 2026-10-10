// Matchning för uppslagningsverktyget (verktyg/spotify-id.html).
// Funktionerna här gör inga anrop, så de kan testas utan nätverk.

const UNWANTED = /\b(live|karaoke|instrumental|remix|mix|cover|tribute|acoustic|akustisk|demo|re-?recorded|sped up|slowed|made famous|in the style)\b/i;

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

// Väljer bästa träffen från iTunes: rätt artist och titel, inga live- eller
// karaokeversioner, och den äldsta utgåvan, som oftast är originalet.
export function pickItunesTrack(song, results) {
  const candidates = results.filter((r) => r.kind === 'song'
    && artistMatches(song.artist, r.artistName)
    && titleMatches(song.title, r.trackName)
    && !UNWANTED.test(r.trackName.replace(song.title, ''))
    && !UNWANTED.test(r.collectionName || ''));
  candidates.sort((a, b) => {
    const exactA = baseTitle(a.trackName) === baseTitle(song.title) ? 0 : 1;
    const exactB = baseTitle(b.trackName) === baseTitle(song.title) ? 0 : 1;
    return exactA - exactB || String(a.releaseDate).localeCompare(String(b.releaseDate));
  });
  return candidates[0] || null;
}

// Plockar ut Spotify-låten ur ett svar från Odesli och kontrollerar att den stämmer.
export function spotifyFromOdesli(song, data) {
  const link = data && data.linksByPlatform && data.linksByPlatform.spotify;
  if (!link) return { status: 'saknas' };
  const entity = data.entitiesByUniqueId[link.entityUniqueId];
  const id = entity ? entity.id : link.url.split('/track/')[1];
  if (!entity) return { status: 'osäker', id, note: 'Ingen titel att jämföra med' };
  const ok = artistMatches(song.artist, entity.artistName) && titleMatches(song.title, entity.title);
  return {
    status: ok ? 'ok' : 'osäker',
    id,
    note: `${entity.artistName} – ${entity.title}`,
  };
}
