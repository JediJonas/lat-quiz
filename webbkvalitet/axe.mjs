// Tillgänglighetskontroll med axe-core (WCAG 2.2 AA) genom ett helt spel:
// startsida, spelledare med inställningar, spelare som går med, gissning
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

await host.goto(BASE + 'index.html' + PEER);
await check(host, 'Startsidan');
await host.goto(BASE + 'verktyg/spotify-id.html');
await check(host, 'Verktyget för Spotify-ID');

await host.goto(BASE + 'host.html' + PEER);
await host.waitForSelector('#create:not([disabled])');
await check(host, 'Spelledare, start');
await host.click('#settings');
await host.waitForSelector('dialog[open]');
await check(host, 'Spelledare, inställningar');
await host.keyboard.press('Escape');
await host.click('#create');
await host.waitForSelector('#code:not(:empty)');
const code = await host.textContent('#code');
await check(host, 'Spelledare, lobby');

await player.goto(BASE + 'play.html' + PEER);
await player.waitForSelector('#join:not([hidden])');
await check(player, 'Spelare, kod');
await player.fill('#name-input', 'Test');
await player.fill('#code-input', code);
await player.click('#join-form button');
await player.waitForSelector('#conn.connected', { timeout: 20000 });
await check(player, 'Spelare, väntar');

// Spotify kan inte öppnas här, så länken till appen stängs av.
await host.evaluate(() => {
  window.open = () => null;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('http')) click.call(this); };
});
await host.click('#next');
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

await host.click('#reveal');
await host.waitForSelector('.answer');
await player.waitForSelector('#result:not([hidden])');
await check(host, 'Spelledare, rätt svar');
await check(player, 'Spelare, rätt svar');

await browser.close();
if (problems.length) {
  console.error('\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nInga brister enligt axe.');
