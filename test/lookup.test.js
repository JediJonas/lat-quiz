import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseTitle, pickItunesTrack, spotifyFromOdesli } from '../js/lookup.js';

const song = { artist: 'a-ha', title: 'Take On Me' };
const track = (o) => ({ kind: 'song', artistName: 'a-ha', trackName: 'Take On Me', collectionName: 'Hunting High and Low', releaseDate: '1985-06-01', ...o });

test('tillägg som remaster och version tas bort från titeln', () => {
  assert.equal(baseTitle('Take On Me (2015 Remaster)'), 'take on me');
  assert.equal(baseTitle('Take On Me - 2015 Remastered Version'), 'take on me');
  assert.equal(baseTitle("Livin' on a Prayer"), 'livin on a prayer');
});

test('originalet väljs före live, karaoke och senare utgåvor', () => {
  const picked = pickItunesTrack(song, [
    track({ trackName: 'Take On Me (Live)', releaseDate: '1980-01-01' }),
    track({ artistName: 'Karaoke Hits', collectionName: 'Karaoke 80s', releaseDate: '1970-01-01' }),
    track({ trackName: 'Take On Me (2015 Remaster)', collectionName: 'Best Of', releaseDate: '2015-01-01' }),
    track({ trackViewUrl: 'original' }),
    track({ trackName: 'Take On Me', artistName: 'Weezer', releaseDate: '1984-01-01' }),
  ]);
  assert.equal(picked.trackViewUrl, 'original');
});

test('ingen träff när artist eller titel inte stämmer', () => {
  assert.equal(pickItunesTrack(song, [track({ artistName: 'Europe' }), track({ trackName: 'The Sun Always Shines on T.V.' })]), null);
});

test('Spotify-träffen kontrolleras mot artist och titel', () => {
  const data = (artistName, title) => ({
    linksByPlatform: { spotify: { entityUniqueId: 'SPOTIFY_SONG::abc', url: 'https://open.spotify.com/track/abc' } },
    entitiesByUniqueId: { 'SPOTIFY_SONG::abc': { id: 'abc', artistName, title } },
  });
  assert.equal(spotifyFromOdesli(song, data('a-ha', 'Take On Me - 2017 Remaster')).status, 'ok');
  assert.equal(spotifyFromOdesli(song, data('a-ha', 'Take On Me')).id, 'abc');
  assert.equal(spotifyFromOdesli(song, data('Weezer', 'Take On Me')).status, 'osäker');
  assert.equal(spotifyFromOdesli(song, { linksByPlatform: {} }).status, 'saknas');
});
