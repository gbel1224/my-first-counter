import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type()+': '+m.text().slice(0,200)); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0,300)));
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 6000));
await page.screenshot({ path: '/tmp/menu.png' });
console.log('errors:', errors.length ? errors.slice(0,10).join('\n') : 'none');
const info = await page.evaluate(() => ({
  screens: [...document.querySelectorAll('.screen')].map(s => s.id),
  active: document.querySelector('.screen.active')?.id,
  hasCanvas: !!document.querySelector('#arena3d canvas'),
}));
console.log(JSON.stringify(info));
await browser.close();
