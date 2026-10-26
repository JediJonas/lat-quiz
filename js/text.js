// Gör text jämförbar trots stavningsvarianter: "Señorita" blir "senorita"
// och "Don't" blir "dont". Accenter, apostrofer och andra tecken tas bort.

const SPECIAL = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', þ: 'th' };

export function normalize(text) {
  return (text || '')
    .toLocaleLowerCase('sv')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øæœßłđþ]/g, (c) => SPECIAL[c])
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nyckel för att avgöra om två svar är samma namn. Utöver normalize räknas "&", "+", "and"
// och "och" lika, och mellanslag och bindestreck spelar ingen roll, så "Nick Cave & The Bad Seeds"
// och "Nick Cave and the Bad Seeds" blir samma, liksom "Diggi-Loo Diggi-Ley" och "Diggi loo diggi ley".
// Med article räknas också ett inledande "The" bort, för artister som "The Sweet" och "Sweet".
// Det används inte för titlar, där "The Power" och "Power" är olika låtar.
export function answerKey(text, { article = false } = {}) {
  const words = normalize((text || '').replace(/[&+]/g, ' och ')).split(' ')
    .map((word) => (word === 'and' ? 'och' : word));
  if (article && words[0] === 'the' && words.length > 1) words.shift();
  return words.join('');
}

// Utan mellanslag, så att "ac dc" hittar "AC/DC" och "jay z" hittar "Jay-Z".
export function compact(text) {
  return normalize(text).replace(/ /g, '');
}

// Stavfel som förlåts i förslagen, efter hur mycket som skrivits (utan mellanslag).
// Med 3–4 tecken räknas bara en bokstav som saknas ("aba" hittar "ABBA") eller två
// som bytt plats, eftersom ett utbytt eller extra tecken i så korta ord ger
// för många träffar som inte liknar det man menade.
export function allowedTypos(length) {
  if (length < 3) return { max: 0, short: true };
  if (length <= 4) return { max: 1, short: true };
  if (length <= 8) return { max: 1, short: false };
  return { max: 2, short: false };
}

// Förbereder en lista för sökning: texten utan mellanslag och var varje ord börjar i den.
export function searchIndex(items) {
  return items.map((item) => {
    const words = normalize(item).split(' ').filter(Boolean);
    const starts = [];
    let pos = 0;
    for (const word of words) { starts.push(pos); pos += word.length; }
    return { item, key: words.join(''), starts };
  });
}

// Minsta antal stavfel för att query ska stämma med början av något ord i key,
// eller Infinity om det blir fler än max. Stavfel är en bokstav som saknas, en
// för mycket, en utbytt eller två intill varandra som bytt plats. Det man skrivit
// får sluta mitt i ett ord, så "micael jack" hittar "Michael Jackson".
export function typos(query, key, starts, { max, short }) {
  const m = query.length;
  const n = key.length;
  const extra = short ? Infinity : 1; // en bokstav för mycket i det man skrivit
  const changed = short ? Infinity : 1; // en utbytt bokstav
  if (n < m - max) return Infinity;
  const isStart = new Uint8Array(n + 1);
  for (const s of starts) isStart[s] = 1;
  // prev[j] och row[j]: stavfel för det skrivna hittills mot key fram till j, från bästa ordstart
  let prev2 = null;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = isStart[j] ? 0 : Infinity;
  let before = prev; // raden före den sista bokstaven
  let beforeTwo = null; // och raden före den
  for (let i = 1; i <= m; i++) {
    const row = new Array(n + 1);
    row[0] = prev[0] + extra;
    let rowMin = row[0];
    for (let j = 1; j <= n; j++) {
      const same = query[i - 1] === key[j - 1];
      let best = prev[j - 1] + (same ? 0 : changed);
      best = Math.min(best, row[j - 1] + 1, prev[j] + extra);
      if (i > 1 && j > 1 && query[i - 1] === key[j - 2] && query[i - 2] === key[j - 1] && !same) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      row[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max) return Infinity;
    prev2 = prev;
    prev = row;
    if (i === m - 1) { before = prev; beforeTwo = prev2; }
  }
  // Den sista bokstaven måste stämma. Annars hittar till exempel "lovee" och "lovex"
  // allt som innehåller ett ord som börjar på "love".
  let best = Infinity;
  for (let j = 1; j <= n; j++) {
    if (query[m - 1] === key[j - 1]) best = Math.min(best, before[j - 1]);
    else if (m > 1 && j > 1 && query[m - 1] === key[j - 2] && query[m - 2] === key[j - 1]) {
      best = Math.min(best, beforeTwo[j - 2] + 1);
    }
  }
  return best <= max ? best : Infinity;
}

// Hur väl ett namn som innehåller texten stämmer: 0 om hela namnet stämmer,
// 1 om ett ord börjar med texten och 2 om texten finns någon annanstans.
// Ord i namnet får inte börja mitt i det man skrivit utan mellanslag, så "kent"
// räknas inte som ett ord i Ken Thorne. breaks är var mellanslagen stod i texten.
function level(query, breaks, { key, starts }) {
  if (key === query) return 0;
  for (let at = key.indexOf(query); at >= 0; at = key.indexOf(query, at + 1)) {
    if (!starts.includes(at)) continue;
    if (starts.every((s) => s <= at || s >= at + query.length || breaks.includes(s - at))) return 1;
  }
  return 2;
}

// Förslag för det man skrivit: först allt som innehåller texten, sedan det som
// stämmer med början av ett ord trots stavfel. Det som innehåller texten står
// i tre nivåer: hela namnet, ett ord som börjar med texten och resten, så att
// "symphony" visar Symphony först. Inom varje nivå gäller listans ordning.
export function findSuggestions(index, text) {
  const query = compact(text);
  const breaks = searchIndex([text])[0].starts;
  const levels = [[], [], []];
  const close = [];
  const allowed = allowedTypos(query.length);
  for (const entry of index) {
    if (entry.key.includes(query)) levels[level(query, breaks, entry)].push(entry.item);
    else if (allowed.max > 0 && typos(query, entry.key, entry.starts, allowed) <= allowed.max) close.push(entry.item);
  }
  return { exact: levels.flat(), close };
}

// Namn som är kortare än det som krävs för förslag, som U2 och OK, föreslås när
// man har skrivit hela namnet. Annars skulle de aldrig gå att välja.
export function findWhole(index, text) {
  const query = compact(text);
  return query ? index.filter((entry) => entry.key === query).map((entry) => entry.item) : [];
}
