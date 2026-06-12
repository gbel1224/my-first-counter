import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540, hasTouch: true, isMobile: true });
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
await page.evaluate(() => { // skip how-to if shown
  document.querySelector('#how .btn.back')?.click();
  document.querySelector('[data-go="single"]').click();
});
await new Promise(r => setTimeout(r, 300));
await page.tap('[data-action="quick"]');
await page.waitForFunction(() => window.__match?.phase === 'play' && window.__match.sim.state.countdown <= 0, { timeout: 25000 });
const before = await page.evaluate(() => ({ ...window.__match.sim.state.slots[0].pos }));
// drag left stick forward (up) and hold; also drag look zone to turn
const t = await page.touchscreen;
await page.touchscreen.touchStart(200, 400);
await page.touchscreen.touchMove(200, 330);
await new Promise(r => setTimeout(r, 2000));
await page.touchscreen.touchEnd();
const after = await page.evaluate(() => ({ ...window.__match.sim.state.slots[0].pos }));
const dist = Math.hypot(after.x - before.x, after.z - before.z);
console.log('touch stick moved player:', dist.toFixed(1), 'units', dist > 3 ? 'PASS' : 'FAIL');
// look drag
const yaw0 = await page.evaluate(() => window.__match.sim.state.slots[0].yaw);
await page.touchscreen.touchStart(700, 300);
for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(700 + i*15, 300); await new Promise(r=>setTimeout(r,30)); }
await page.touchscreen.touchEnd();
await new Promise(r => setTimeout(r, 300));
const yaw1 = await page.evaluate(() => window.__match.sim.state.slots[0].yaw);
console.log('look drag yaw delta:', (yaw1-yaw0).toFixed(3), Math.abs(yaw1-yaw0) > 0.05 ? 'PASS' : 'FAIL');
await page.screenshot({ path: '/tmp/touch.png' });
await browser.close();
