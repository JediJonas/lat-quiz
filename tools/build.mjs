// Bygger sidan som den publiceras, i _site/. Körs av publish.yml och quality.yml, och kan köras
// lokalt för att se exakt det som publiceras:
//
//   npm ci
//   npm run build          (eller node tools/build.mjs <mapp>)
//
// - JavaScript bundlas och minifieras med esbuild till en fil per startfil: js/host.js
//   (spelledaren), js/play.js (spelaren) och js/menu.js (menyn på startsidan). Annars laddar
//   spelledarens sida ett 50-tal moduler i 8 led, där varje led väntar på det förra.
// - Varje bundle får en source map bredvid, så att felsökning i Safari och Chrome visar de riktiga
//   filerna och raderna. Kartan hämtas bara när utvecklarverktygen är öppna.
// - css/style.css och vendor/qrcode.js minifieras. vendor/peerjs.min.js är redan minifierad.
// - Versionsnumret är en hash av källfilerna. Det och när sidan publicerades skrivs in i
//   JavaScript-koden som globalThis.LATQUIZ_VERSION, som loggen visar med ?debug=1.
// - Sist får sidorna versionsnumret på CSS och JS, se tools/versions.mjs.
//
// Källfilerna i repot ändras inte, och lokalt körs de som de är.
import { build as esbuild } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contentHash, stampVersions, versionText } from './versions.mjs';

const root = new URL('../', import.meta.url);
const path = (url) => fileURLToPath(url);

// Startfilerna som sidorna laddar. Allt annat i js/ hamnar i någon av dem.
export const ENTRIES = ['js/host.js', 'js/play.js', 'js/menu.js'];
// Äldsta webbläsarna som ska fungera. esbuild säger till vid bygget om koden använder något
// som de inte klarar.
export const TARGET = ['safari15', 'chrome100', 'firefox100', 'edge100'];
// Det som kopieras som det är. js/ byggs i stället, och css/style.css och vendor/qrcode.js
// skrivs över med minifierade versioner.
export const COPY = ['css', 'data', 'icons', 'sounds', 'vendor'];

/** Bygger sidan i outDir (en fil-URL eller sökväg) och returnerar versionsnumret. */
export async function build(outDir = new URL('_site/', root)) {
  const out = outDir instanceof URL ? outDir : pathToFileURL(outDir.endsWith('/') ? outDir : outDir + '/');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const file of readdirSync(root)) {
    if (/\.(html|svg|webmanifest)$/.test(file)) cpSync(new URL(file, root), new URL(file, out));
  }
  for (const dir of COPY) cpSync(new URL(dir, root), new URL(dir, out), { recursive: true });

  const v = contentHash(root);
  const common = { minify: true, target: TARGET, logLevel: 'warning', absWorkingDir: path(root) };
  await esbuild({
    ...common, entryPoints: ENTRIES, bundle: true, format: 'esm', sourcemap: true,
    define: { 'globalThis.LATQUIZ_VERSION': JSON.stringify(versionText(v)) },
    outdir: path(new URL('js/', out)),
  });
  await esbuild({ ...common, entryPoints: ['css/style.css'], outfile: path(new URL('css/style.css', out)), allowOverwrite: true });
  // Ett vanligt skript (inte en modul) som sätter qrcode globalt. Utan format byter esbuild inte
  // namn på det som står överst i filen.
  await esbuild({ ...common, entryPoints: ['vendor/qrcode.js'], outfile: path(new URL('vendor/qrcode.js', out)), allowOverwrite: true });

  stampVersions(out, v);
  return v;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? pathToFileURL(process.argv[2] + '/') : undefined;
  const v = await build(dir);
  console.log(`Byggde ${dir ? process.argv[2] : '_site'} med version ${v}`);
}
