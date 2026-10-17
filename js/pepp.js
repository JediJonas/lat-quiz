// Korta, glada kommentarer: under poängen efter varje låt och på vinnarsidan.
// Valet beror bara på spelets läge, inte på slumpen, så att alla enheter visar samma
// kommentar och den inte byts när vyn ritas om.

// Ett litet tal från texten, för att välja bland kommentarerna.
function hash(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

const pick = (list, seed) => list[hash(seed) % list.length];

const CHEERS = {
  all: ['Klockrent!', 'Snyggt!', 'Vilken koll!', 'Mitt i prick!'],
  half: ['Halvvägs där!', 'Bra, en av två!', 'Nästan hela vägen!'],
  none: ['Nästa tar du!', 'Den var klurig!', 'Ny chans snart!'],
};

// Kommentaren efter en låt. result: { artist, title, points } för den som tittar.
export function roundCheer(result, roundNumber) {
  const right = Number(Boolean(result.artist)) + Number(Boolean(result.title));
  const list = right === 2 ? CHEERS.all : right === 1 ? CHEERS.half : CHEERS.none;
  return pick(list, `${roundNumber}`);
}

const WIN_GENERAL = [
  'Ett öra för musik!',
  'Hela topplistan i huvudet.',
  'Ingen låt för svår.',
  'Dags för ett tacktal!',
  'Vem behöver ens Shazam?',
  'Den här segern ska firas!',
  'Musikkunskap på högsta nivå.',
  'Låtquizets mästare!',
];

// Kommentaren på vinnarsidan, efter hur matchen gick.
// standings: alla spelare med poäng. songs: antal spelade låtar i matchen.
export function winComment({ winners, standings, songs, winScore }) {
  const seed = `${winners.join()}${songs}`;
  if (winners.length > 1) return 'Delad glädje är dubbel glädje!';
  if (standings.length === 1) return 'Seger! Nästa gång tar du med kompisar.';
  const scores = standings.map((p) => p.score).sort((a, b) => b - a);
  const lead = scores[0] - scores[1];
  if (lead <= 1) return pick(['Det var jämnt in i det sista!', 'Med nöd och näppe!'], seed);
  if (songs <= Math.ceil(winScore / 2)) return 'Det gick undan!';
  if (lead >= 5) return pick(['Ingen chans för de andra!', 'Överlägset!'], seed);
  if (songs >= winScore * 1.5) return 'En riktig maratonmatch!';
  return pick(WIN_GENERAL, seed);
}
