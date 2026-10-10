import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseTitle, pickWikidataTrack, parseSpotifyId } from '../js/lookup.js';

const song = { artist: 'a-ha', title: 'Take On Me' };

test('tillägg som remaster och version tas bort från titeln', () => {
  assert.equal(baseTitle('Take On Me (2015 Remaster)'), 'take on me');
  assert.equal(baseTitle('Take On Me - 2015 Remastered Version'), 'take on me');
  assert.equal(baseTitle("Livin' on a Prayer"), 'livin on a prayer');
});

test('träffen från Wikidata måste ha rätt artist och titel', () => {
  const rows = [
    { title: 'Take On Me', performer: 'Weezer', spotify: 'weezer' },
    { title: 'Take Me On', performer: 'a-ha', spotify: 'fel-titel' },
    { title: 'Take On Me', performer: 'a-ha', spotify: 'ratt' },
  ];
  assert.equal(pickWikidataTrack(song, rows).spotify, 'ratt');
  assert.equal(pickWikidataTrack(song, rows.slice(0, 2)), null);
  assert.equal(pickWikidataTrack({ artist: 'Wham!', title: 'Last Christmas' },
    [{ title: 'Last Christmas', performer: 'Wham!', spotify: 'x' }]).spotify, 'x');
});

test('Spotify-ID läses ur länk, URI och bart ID', () => {
  const id = '2WfaOiMkCvy7F5fcp2zZ8L';
  assert.equal(parseSpotifyId(`https://open.spotify.com/track/${id}?si=abc123`), id);
  assert.equal(parseSpotifyId(`https://open.spotify.com/intl-sv/track/${id}`), id);
  assert.equal(parseSpotifyId(`spotify:track:${id}`), id);
  assert.equal(parseSpotifyId(id), id);
  assert.equal(parseSpotifyId('https://open.spotify.com/album/kort'), null);
  assert.equal(parseSpotifyId(''), null);
});
