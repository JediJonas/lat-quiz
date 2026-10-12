// Förhandsklipp från Deezer, på prov i kategorin Deezer-test.
// Deezers API saknar CORS, så sökningen görs med JSONP. Klipplänkarna går ut
// efter en stund och hämtas därför precis innan låten spelas.

const API = 'https://api.deezer.com/search';
const TIMEOUT_MS = 8000;
let counter = 0;

const normalize = (text) => String(text).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
export async function findPreview(song) {
  const q = encodeURIComponent(song.artist + ' ' + song.title);
  const data = await jsonp(`${API}?q=${q}&limit=10`);
  const track = pickTrack(data && data.data, song);
  return track ? track.preview : null;
}
