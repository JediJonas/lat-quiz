// Förhandsklipp från Deezer. Varje quizlåt har helst ett fast Deezer-ID,
// hämtat med verktyg/deezer-id.mjs, så att rätt inspelning spelas.
// Deezers API saknar CORS, så sökningen görs med JSONP. Klipplänkarna går ut
// efter en stund och hämtas därför precis innan låten spelas.

// En kort tystnad som spelas direkt i ett klick eller tryck. Då räknas ljudet som startat av
// användaren, och klippet får spela fast det hämtas först efteråt (Safari).
export const SILENCE = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

const API = 'https://api.deezer.com/search';
const API_TRACK = 'https://api.deezer.com/track';
const TIMEOUT_MS = 8000;
let counter = 0;

const normalize = (text) => String(text).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Väljer en träff av rätt artist med klipp, helst utan live- eller karaokeversion.
export function pickTrack(results, song) {
  const artist = normalize(song.artist);
  const title = normalize(song.title);
  const withPreview = (results || []).filter((t) => t && t.preview);
  const sameArtist = withPreview.filter((t) => t.artist && normalize(t.artist.name) === artist);
  const unwanted = /\b(live|karaoke|instrumental|cover|remix)\b/;
  const ranked = sameArtist.filter((t) => !unwanted.test(normalize(t.title)));
  return ranked.find((t) => normalize(t.title) === title)
    || ranked.find((t) => normalize(t.title).startsWith(title))
    || ranked[0] || sameArtist[0] || null;
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const name = 'deezerSvar' + (++counter);
    const script = document.createElement('script');
    const done = () => { delete window[name]; script.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error('Deezer svarade inte.')); }, TIMEOUT_MS);
    window[name] = (data) => { done(); resolve(data); };
    script.onerror = () => { done(); reject(new Error('Kunde inte nå Deezer.')); };
    script.src = url + '&output=jsonp&callback=' + name;
    document.head.append(script);
  });
}

// Returnerar en färsk klipplänk för låten, eller null om Deezer inte har den.
// Med ett sparat Deezer-ID hämtas just den inspelningen. Saknas ID, eller har
// inspelningen försvunnit från Deezer, görs en sökning.
export async function findPreview(song) {
  if (song.deezerId) {
    const track = await jsonp(`${API_TRACK}/${encodeURIComponent(song.deezerId)}?`);
    if (track && track.preview) return track.preview;
  }
  const q = encodeURIComponent(song.artist + ' ' + song.title);
  const data = await jsonp(`${API}?q=${q}&limit=10`);
  const track = pickTrack(data && data.data, song);
  return track ? track.preview : null;
}
