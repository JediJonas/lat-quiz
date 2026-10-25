// Ljudsynk: med en blåtandshögtalare hörs ljudet en stund efter att webbläsaren har börjat
// spela det. Låtkortet och timern, trumvirvelns rubrik, vinnarkortet och raden längst ner väntar då
// så här mycket längre, och vinnarkortet ännu lite till, se host.js. Valet gäller spelledarens
// enhet, eftersom det beror på högtalaren, och spelarnas mobiler följer spelledaren.

export const DELAY_CHOICES = [0, 200, 400, 600, 800];

// Ett sparat värde som inte finns bland valen, till exempel 0,5 s från när stegen var 0,25 s, blir
// närmaste val, och vid lika långt det lägre. Det som inte är ett tal blir ingen fördröjning.
export function cleanDelay(value) {
  const ms = value === null || value === '' ? NaN : Number(value);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return DELAY_CHOICES.reduce((best, v) => (Math.abs(v - ms) < Math.abs(best - ms) ? v : best));
}

// Till exempel "0,4 s", med decimalkomma.
export const delayShort = (ms) => (ms ? `${String(ms / 1000).replace('.', ',')} s` : 'Ingen');
export const delayText = (ms) => (ms ? `${String(ms / 1000).replace('.', ',')} sekunder` : 'Ingen fördröjning');

// Ett löfte som uppfylls ms millisekunder efter att promise har uppfyllts, eller avvisats.
export function after(promise, ms) {
  const wait = () => new Promise((resolve) => setTimeout(resolve, ms));
  return ms ? promise.then(wait, wait) : promise;
}
