// Lighthouse i mobilläge för de tre sidorna. Misslyckas om något betyg är under gränsen.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8080/';
const MIN = { performance: 0.8, accessibility: 1, 'best-practices': 0.9, seo: 0.9 };
const NAMES = { performance: 'Prestanda', accessibility: 'Tillgänglighet', 'best-practices': 'Bästa praxis', seo: 'SEO' };
let failed = false;

for (const page of ['index.html', 'host.html', 'play.html']) {
  const out = join(tmpdir(), `lighthouse-${page}.json`);
  execFileSync('node_modules/.bin/lighthouse', [BASE + page, '--form-factor=mobile', '--quiet',
    '--only-categories=' + Object.keys(MIN).join(','), '--chrome-flags=--headless=new --no-sandbox',
    '--output=json', '--output-path=' + out], { stdio: 'inherit' });
  const { categories } = JSON.parse(readFileSync(out));
  const scores = Object.keys(MIN).map((id) => {
    const score = categories[id].score;
    const ok = score >= MIN[id];
    if (!ok) failed = true;
    return `${NAMES[id]} ${Math.round(score * 100)}${ok ? '' : ' ✗'}`;
  });
  console.log(`${page}: ${scores.join(', ')}`);
}
process.exit(failed ? 1 : 0);
