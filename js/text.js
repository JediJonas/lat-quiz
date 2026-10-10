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

// Utan mellanslag, så att "ac dc" hittar "AC/DC" och "jay z" hittar "Jay-Z".
export function compact(text) {
  return normalize(text).replace(/ /g, '');
}
