// @ts-check
// Ljudsynk: med en blåtandshögtalare hörs ljudet en stund efter att webbläsaren har börjat
// spela det. Låtkortet och timern, trumvirvelns rubrik, vinnarkortet och raden längst ner väntar då
// så här mycket längre, och vinnarkortet ännu lite till, se host.js. Valet gäller spelledarens
// enhet, eftersom det beror på högtalaren, och spelarnas mobiler följer spelledaren.
import { wait } from './shared/wait.js';
import { t } from './shared/lang.js';

export const DELAY_CHOICES = [0, 200, 400, 600, 800];

// Ett sparat värde som inte finns bland valen, till exempel 0,5 s från när stegen var 0,25 s, blir
// närmaste val, och vid lika långt det lägre. Det som inte är ett tal blir ingen fördröjning.
export function cleanDelay(value) {
  const ms = value === null || value === '' ? NaN : Number(value);
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return DELAY_CHOICES.reduce((best, v) => (Math.abs(v - ms) < Math.abs(best - ms) ? v : best));
}

// Till exempel "0,4 s", med decimalkomma.
export const delayShort = (ms) => (ms ? t('unit.seconds', { s: String(ms / 1000).replace('.', ',') }) : t('audioDelay.none'));
export const delayText = (ms) => (ms ? t('audioDelay.long', { s: String(ms / 1000).replace('.', ',') }) : t('audioDelay.noneLong'));

// Ett löfte som uppfylls ms millisekunder efter att promise har uppfyllts, eller avvisats.
export function delayAfter(promise, ms) {
  const waitMs = () => wait(ms);
  return ms ? promise.then(waitMs, waitMs) : promise;
}
