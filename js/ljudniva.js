// Ljudnivån i väntemusiken och vinnarlåten. Klippen kommer från olika skivor och är olika starkt
// mixade, så de mäts när de har laddats till ljudmotorn och skruvas upp eller ner mot en gemensam nivå.
// Nivån är medelstyrkan i klippet, där tysta partier inte räknas, så att en lugn början eller en
// paus inte gör att hela låten skruvas upp.

const BLOCK_S = 0.4;
const SILENT_DB = -50; // svagare block räknas som tystnad
const MIN_GAIN = 0.3;
const MAX_GAIN = 2.5;

const toDb = (power) => 10 * Math.log10(Math.max(power, 1e-12));

// Klippets nivå i dB under full styrka, och dess starkaste sampel.
// buffer är ett AudioBuffer från ljudmotorn, eller något med samma delar.
export function measureLevel(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const size = Math.max(1, Math.round(buffer.sampleRate * BLOCK_S));
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let start = 0; start < buffer.length; start += size) {
    const end = Math.min(buffer.length, start + size);
    let power = 0;
    for (const data of channels) {
      for (let i = start; i < end; i += 1) {
        const v = data[i];
        power += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
    power /= (end - start) * channels.length;
    if (toDb(power) > SILENT_DB) { sum += power; count += 1; }
  }
  return { db: count ? toDb(sum / count) : -Infinity, peak };
}

// Hur mycket klippet ska skruvas upp eller ner för att hamna på targetDb. Det skruvas aldrig upp så
// mycket att det starkaste stället slår i taket, och helt tysta klipp lämnas som de är.
export function levelGain(buffer, targetDb) {
  const { db, peak } = measureLevel(buffer);
  if (!Number.isFinite(db) || !peak) return 1;
  const gain = 10 ** ((targetDb - db) / 20);
  return Math.min(Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain)), Math.max(1, 1 / peak));
}
