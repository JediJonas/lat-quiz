// Tillgänglighetskontroll med axe-core (WCAG 2.2 AA) genom ett helt spel:
// startsida, spelledare med inställningar, spelare som går med, gissning hos båda
// med förslagslistan och rätt svar. Varje vy kontrolleras i ljust och mörkt läge.
// Kräver att sidorna serveras på BASE och att en PeerJS-server kör på 127.0.0.1:9000.
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE || 'http://localhost:8080/';
const PEER = '?peerHost=127.0.0.1&peerPort=9000';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const browser = await chromium.launch({
  // Utan mDNS-namn kan två flikar i samma webbläsare ansluta direkt till varandra.
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
});
const problems = [];

function describe(node) {
  const c = node.any.find((a) => a.data && a.data.contrastRatio);
  return node.target.join(' ') + (c ? ` (${c.data.contrastRatio}:1, ${c.data.fgColor} på ${c.data.bgColor})` : '');
}

async function check(page, view) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(300);
    // Temabytet tonar knapparnas färg. På en långsam dator kan övergången pågå än, och axe
    // mäter då kontrasten mitt i den. Övergångar som tar slut väntas därför in.
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))));
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const v of violations) {
      problems.push(`${view} (${theme === 'light' ? 'ljust' : 'mörkt'}): ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 3).map(describe).join(' | ')}`);
    }
    console.log(`${violations.length ? '✗' : '✓'} ${view}, ${theme === 'light' ? 'ljust' : 'mörkt'} läge`);
  }
}

const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const player = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
for (const page of [host, player]) page.on('pageerror', (e) => problems.push('Skriptfel: ' + e.message));

// Menyn uppe till höger öppnas med knappen och stängs med Esc. Om spelet är en ruta.
async function openMenu(page) {
  await page.click('main:not([hidden]) .menu-button');
  await page.waitForSelector('main:not([hidden]) .menu-panel:not([hidden])');
}
async function closeMenu(page) {
  await page.keyboard.press('Escape');
  if (await page.$('main:not([hidden]) .menu-panel:not([hidden])')) problems.push('Menyn: Esc stängde inte menyn');
}

await host.goto(BASE + 'index.html' + PEER);
await check(host, 'Startsidan');
await openMenu(host);
await check(host, 'Startsidan, menyn');
await host.click('.menu-item:has-text("Om spelet")');
await host.waitForSelector('dialog.about[open]');
await check(host, 'Om spelet');
await host.keyboard.press('Escape');
await host.goto(BASE + 'verktyg/spotify-id.html');
await check(host, 'Verktyget för Spotify-ID');

await host.goto(BASE + 'host.html' + PEER);
await host.waitForSelector('#create:not([disabled])');
await check(host, 'Spelledare, start');
await host.click('#settings');
await host.waitForSelector('dialog[open]');
await check(host, 'Spelledare, inställningar');
await host.keyboard.press('Escape');
await host.fill('#host-name', 'Värd');
// Alla quizlåtar har ett fast Deezer-ID, och Deezer besvaras nedan, så klippet hittas alltid.
await host.selectOption('#category-select', '80-tal');
await host.click('#create');
await host.waitForSelector('#code:not(:empty)');
const code = await host.textContent('#code');
await check(host, 'Spelledare, lobby');
await openMenu(host);
await check(host, 'Spelledare, menyn');
await closeMenu(host);

await player.goto(BASE + 'play.html' + PEER);
await player.waitForSelector('#join:not([hidden])');
await check(player, 'Spelare, kod');
await player.fill('#name-input', 'Test');
await player.fill('#code-input', code);
await player.click('#join-form button');
await player.waitForSelector('#lobby:not([hidden])', { timeout: 20000 });
await check(player, 'Spelare, väntar');
await openMenu(player);
await check(player, 'Spelare, menyn');
await player.click('.menu-item:has-text("Visa QR-kod")');
await player.waitForSelector('#join-info:not([hidden])');
await check(player, 'Spelare, QR-kod');
await player.click('#hide-qr');

// Deezer nås inte här. Låten besvaras med ett klipp som är en kort tystnad.
const PREVIEW = 'https://cdnt-preview.dzcdn.net/test.wav';
const silence = Buffer.alloc(44 + 8000, 128);
silence.write('RIFF', 0); silence.writeUInt32LE(36 + 8000, 4); silence.write('WAVEfmt ', 8);
silence.writeUInt32LE(16, 16); silence.writeUInt16LE(1, 20); silence.writeUInt16LE(1, 22);
silence.writeUInt32LE(8000, 24); silence.writeUInt32LE(8000, 28); silence.writeUInt16LE(1, 32);
silence.writeUInt16LE(8, 34); silence.write('data', 36); silence.writeUInt32LE(8000, 40);
await host.route('https://api.deezer.com/**', (route) => {
  const callback = new URL(route.request().url()).searchParams.get('callback');
  route.fulfill({ contentType: 'application/javascript', body: `${callback}(${JSON.stringify({ id: 1, preview: PREVIEW })})` });
});
await host.route(PREVIEW, (route) => route.fulfill({ contentType: 'audio/wav', body: silence }));

// Spotify kan inte öppnas här, så länken till appen stängs av.
await host.evaluate(() => {
  window.open = () => null;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('http')) click.call(this); };
});
await host.click('#play');
await host.waitForSelector('#timer');
await check(host, 'Spelledare, låten spelas');
await player.waitForSelector('#guess:not([hidden])');
await check(player, 'Spelare, gissar');

// Förslagslistan med tangentbordet: tre tecken, pil ned och Enter.
await player.focus('#artist');
await player.keyboard.type('the');
await player.waitForSelector('#artist-suggestions [role=option]');
await check(player, 'Spelare, förslagslista');
await player.keyboard.press('ArrowDown');
await player.keyboard.press('Enter');
if (!(await player.$eval('#artist', (el) => el.classList.contains('chosen')))) {
  problems.push('Förslagslistan: Enter valde inget svar');
}
// Krysset rensar det valda svaret och lämnar fokus i fältet.
await player.click('#artist ~ .clear-input');
if (await player.$eval('#artist', (el) => el.value !== '' || el.classList.contains('chosen') || document.activeElement !== el)) {
  problems.push('Krysset: fältet rensades inte eller tappade fokus');
}
await player.keyboard.type('the');
await player.waitForSelector('#artist-suggestions [role=option]');
await player.keyboard.press('ArrowDown');
await player.keyboard.press('Enter');

// Spelledaren gissar i samma fält som spelarna.
await host.focus('#artist');
await host.keyboard.type('the');
await host.waitForSelector('#artist-suggestions [role=option]');
await check(host, 'Spelledare, förslagslista');
await host.keyboard.press('ArrowDown');
await host.keyboard.press('Enter');
if (!(await host.$eval('#artist', (el) => el.classList.contains('chosen')))) {
  problems.push('Spelledarens förslagslista: Enter valde inget svar');
}

await host.click('#next');
await host.waitForSelector('.answer');
await player.waitForSelector('#result:not([hidden])');
await check(host, 'Spelledare, rätt svar');
await check(player, 'Spelare, rätt svar');

// Meddelanderutan längst ner, både ett fel och ett meddelande om vad som händer.
const show = (page, msg) => page.evaluate((m) => import('./js/meddelande.js').then((mod) => mod.showMessage(m)), msg);
await show(host, { key: 'test', kind: 'problem', title: 'Deezer svarade inte', text: 'Spela låten i Spotify i stället.' });
await check(host, 'Spelledare, felmeddelande');
await show(player, { key: 'test', kind: 'busy', title: 'Anslutningen bröts', text: 'Ansluter igen… Dina svar sparas.' });
await check(player, 'Spelare, meddelande');

await browser.close();
if (problems.length) {
  console.error('\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nInga brister enligt axe.');
