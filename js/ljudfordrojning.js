// Ljud-/bildfördröjning: med en blåtandshögtalare hörs ljudet en stund efter att webbläsaren har börjat
// spela det. Trumvirvelns rubrik, vinnarkortet och raden längst ner väntar då så här mycket längre.
// Quizlåtarna påverkas inte, eftersom fördröjningen inte märktes där. Valet gäller spelledarens
// enhet, eftersom det beror på högtalaren, och spelarnas mobiler följer spelledaren.

export const DELAY_CHOICES = [0, 250, 500, 750, 1000];

// Ett sparat värde som inte finns bland valen blir ingen fördröjning.
export function cleanDelay(value) {
  const ms = Number(value);
  return DELAY_CHOICES.includes(ms) ? ms : 0;
}

// Till exempel "0,25 s", med decimalkomma.
export const delayShort = (ms) => (ms ? `${String(ms / 1000).replace('.', ',')} s` : 'Ingen');
export const delayText = (ms) => (ms ? `${String(ms / 1000).replace('.', ',')} sekunder` : 'Ingen fördröjning');

// Ett löfte som uppfylls ms millisekunder efter att promise har uppfyllts, eller avvisats.
export function after(promise, ms) {
  const wait = () => new Promise((resolve) => setTimeout(resolve, ms));
  return ms ? promise.then(wait, wait) : promise;
}
