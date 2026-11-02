// Röktest: spelar ett helt spel från start till vinnare med en spelledare och en spelare,
// och kontrollerar att rätt svar, poäng, vinnaren och Spela igen fungerar. Det är
// skyddsnätet när koden byggs om, eftersom host.js och play.js inte har egna tester.
// Kräver att sidorna serveras på BASE och att en PeerJS-server kör på 127.0.0.1:9000.
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:8080/';
const PEER = '?peerHost=127.0.0.1&peerPort=9000';

const browser = await chromium.launch({
  // Utan mDNS-namn kan två flikar i samma webbläsare ansluta direkt till varandra.
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const problems = [];
const step = (text) => console.log('✓ ' + text);

const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const player = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
for (const page of [host, player]) page.on('pageerror', (e) => problems.push('Skriptfel: ' + e.message));

// Deezer nås inte här. Varje låt besvaras med ett klipp som är en kort tystnad.
const PREVIEW = 'https://cdnt-preview.dzcdn.net/test.wav';
const silence = Buffer.alloc(44 + 8000, 128);
silence.write('RIFF', 0); silence.writeUInt32LE(36 + 8000, 4); silence.write('WAVEfmt ', 8);
silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22);
silence.writeUInt32LE(8000, 24); silence.writeUInt32LE(8000, 28); silence.writeUInt16LE(1, 32);
silence.writeUInt16LE(8, 34); silence.write('data', 36); silence.writeUInt32LE(8000, 40);
for (const page of [host, player]) {
  await page.route('https://api.deezer.com/**', (route) => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    route.fulfill({ contentType: 'application/javascript', body: `${callback}(${JSON.stringify({ id: 1, preview: PREVIEW })})` });
  });
  await page.route('https://cdnt-preview.dzcdn.net/**', (route) => route.fulfill({ contentType: 'audio/wav', body: silence }));
}

// Kort spel: 10 sekunder per låt, bonus inom 5 sekunder och först till 3 poäng. Utan
// extraljud spelas ingen väntemusik, trumvirvel eller vinnarlåt.
await host.goto(BASE + 'host.html' + PEER);
await host.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('latquiz-settings', JSON.stringify({ roundMs: 10000, bonusMs: 5000, winScore: 3 }));
  localStorage.setItem('latquiz-extraljud', '0');
});
await host.reload();
await host.waitForSelector('#create:not([disabled])');
await host.fill('#host-name', 'Värd');
await host.click('#category-select-knapp');
await host.click('.rullista-lista li[data-value="80-tal"]');
await host.click('#create');
await host.waitForSelector('#code:not(:empty)');
const code = await host.textContent('#code');
step(`Spelledaren startade ett nytt spel med koden ${code}`);

await player.goto(BASE + 'play.html' + PEER);
await player.waitForSelector('#join:not([hidden])');
await player.fill('#name-input', 'Test');
await player.fill('#code-input', code);
await player.click('#join-form button');
await player.waitForSelector('#lobby:not([hidden])', { timeout: 20000 });
step('Spelaren gick med i spelet');

// Låten som spelas står i spelledarens sparade spel. Spelaren svarar rätt på den.
const currentSong = () => host.evaluate(() => JSON.parse(localStorage.getItem('latquiz-host')).state.round.song);

// Skriver hela svaret och väljer förslaget som är exakt samma text.
async function choose(page, field, text) {
  await page.fill(`#${field}`, '');
  await page.focus(`#${field}`);
  await page.keyboard.type(text);
  const option = page.locator(`#${field}-suggestions [role=option]`).filter({ hasText: text }).first();
  await option.waitFor({ timeout: 5000 });
  await option.dispatchEvent('pointerdown');
  if (!(await page.$eval(`#${field}`, (el) => el.classList.contains('chosen')))) {
    problems.push(`${field}: förslaget "${text}" gick inte att välja`);
  }
}

await host.click('#start-game');
await host.waitForSelector('#guess:not([hidden]) #guess-hint:has-text("Lyssna och gissa")', { timeout: 30000 });
await player.waitForSelector('#guess:not([hidden])', { timeout: 10000 });
step('Första låten startade efter nedräkningen');

const song = await currentSong();
await choose(player, 'artist', song.artist);
await choose(player, 'title', song.title);
step(`Spelaren svarade ${song.artist} – ${song.title}`);

// Rätt svar visas när tiden är slut. Rätt artist, rätt titel och bonus ger 3 poäng och vinsten.
await player.waitForSelector('#result:not([hidden])', { timeout: 20000 });
await host.waitForSelector('.answer', { timeout: 5000 });
const answer = await player.textContent('#result');
if (!answer.includes(song.title)) problems.push(`Rätt svar: "${song.title}" syns inte hos spelaren`);
step('Rätt svar visades hos båda');

// Vinnarvyn tar över efter en stund, och då kan spelledaren spela igen.
await player.waitForSelector('.win-title:has-text("Test vinner!")', { timeout: 30000 });
await host.waitForSelector('.win-title:has-text("Test vinner!")', { timeout: 10000 });
const score = await host.textContent('#standings');
if (!score.includes('3')) problems.push('Poänglistan: Test har inte 3 poäng');
step('Vinnaren visades med 3 poäng');

await host.waitForSelector('#new-match:not([hidden])', { timeout: 10000 });
await host.click('#new-match');
await player.waitForSelector('#lobby:not([hidden]), .message:has-text("Vi kör igen!")', { timeout: 10000 });
step('Spela igen startade om spelet');

await browser.close();
if (problems.length) {
  console.error('\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nHela spelet fungerade.');
