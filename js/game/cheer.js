// @ts-check
// Korta, glada kommentarer: under poängen efter varje låt och på vinnarsidan.
// Valet beror bara på spelets läge, inte på slumpen, så att alla enheter visar samma
// kommentar och den inte byts när vyn ritas om.
import { tList } from '../shared/lang.js';

// Ett litet tal från texten, för att välja bland kommentarerna.
function hash(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

// Så många poäng före tvåan som räknas som en stor seger.
const BIG_LEAD = 5;

const pick = (list, seed) => list[hash(seed) % list.length];

// Kommentaren efter en låt. result: { artist, title, points } för den som tittar.
// fields: hur många fält som gissas, 1 i en kategori som bara har titelfältet.
export function roundCheer(result, roundNumber, fields = 2) {
  const right = Number(Boolean(result.artist)) + Number(Boolean(result.title));
  const list = right === fields ? tList('cheer.all') : right > 0 ? tList('cheer.half') : tList('cheer.none');
  return pick(list, `${roundNumber}`);
}

// Kommentaren på vinnarsidan, efter hur matchen gick.
// standings: alla spelare med poäng. songs: antal spelade låtar i matchen.
export function winComment({ winners, standings, songs, winScore }) {
  const seed = `${winners.join()}${songs}`;
  if (winners.length > 1) return pick(tList('win.shared'), seed);
  if (standings.length === 1) return pick(tList('win.alone'), seed);
  const scores = standings.map((p) => p.score).sort((a, b) => b - a);
  const lead = scores[0] - scores[1];
  if (lead <= 1) return pick(tList('win.close'), seed);
  if (songs <= Math.ceil(winScore / 2)) return pick(tList('win.fast'), seed);
  if (lead >= BIG_LEAD) return pick(tList('win.big'), seed);
  if (songs >= winScore * 1.5) return pick(tList('win.long'), seed);
  return pick(tList('win.general'), seed);
}

// Texten en kort stund innan vinnaren visas, samma rubrik på alla enheter.
export function winIntro({ winners, songs }) {
  return pick(tList('win.intro'), `${winners.join()}${songs}intro`);
}
