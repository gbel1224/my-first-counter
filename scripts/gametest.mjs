import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0,300)));
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
// dismiss how-to → title
await page.click('#how .btn.back');
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/title.png' });
// title → single → quick match
await page.click('[data-go="single"]');
await new Promise(r => setTimeout(r, 400));
await page.click('[data-action="quick"]');
await new Promise(r => setTimeout(r, 2500)); // dive + countdown
await page.screenshot({ path: '/tmp/ingame1.png' });
// hold W + fire for a bit
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 2500));
await page.keyboard.up('KeyW');
await page.mouse.down();
await new Promise(r => setTimeout(r, 1500));
await page.mouse.up();
await page.screenshot({ path: '/tmp/ingame2.png' });
const state = await page.evaluate(() => {
  const m = window.__match; return null;
});
// dev overlay numbers
await page.keyboard.press('Backquote');
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/ingame3.png' });
const dev = await page.evaluate(() => document.getElementById('dev').textContent);
console.log('DEV OVERLAY:', dev);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
