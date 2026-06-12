import puppeteer from 'puppeteer';
const W = +(process.env.W ?? 960), H = +(process.env.H ?? 540), SPEED = process.env.SPEED ?? '4';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,200)));
await page.goto(`http://localhost:5180/?smoke=1&speed=${SPEED}`, { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
let result = null;
while (Date.now() - t0 < 240000) {
  result = await page.evaluate(() => window.__smokeResult ?? null);
  if (result) break;
  await new Promise(r => setTimeout(r, 4000));
}
console.log(`viewport ${W}x${H} speed ${SPEED} →`, JSON.stringify(result));
await page.screenshot({ path: '/tmp/results.png' });
await browser.close();
