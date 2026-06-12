import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('console', m => logs.push(m.text().slice(0,200)));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0,300)));
await page.goto('http://localhost:5180/?smoke=1', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 8000));
await page.keyboard.press('Backquote');
// sample mid-match screenshots
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 12000));
  await page.screenshot({ path: `/tmp/smoke${i}.png` });
}
const dev = await page.evaluate(() => document.getElementById('dev').textContent);
const rep = await page.evaluate(() => window.__perfNow = undefined);
console.log('DEV:', dev);
// wait for match end (up to 3.5 min total)
const t0 = Date.now();
let result = null;
while (Date.now() - t0 < 200000) {
  result = await page.evaluate(() => window.__smokeResult ?? null);
  if (result) break;
  await new Promise(r => setTimeout(r, 5000));
}
console.log('SMOKE:', JSON.stringify(result));
console.log('LOGS:', logs.filter(l=>l.includes('ERROR')||l.includes('SMOKE')).join('\n'));
await page.screenshot({ path: '/tmp/results.png' });
await browser.close();
