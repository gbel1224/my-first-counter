import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const warns = [];
page.on('console', m => { const t = m.text(); if (t.includes('audio') || t.includes('decode')) warns.push(t); });
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => document.querySelector('.screen.active .btn').click()); // gesture → audio.ensure
await new Promise(r => setTimeout(r, 5000));
console.log('audio warnings:', warns.length ? warns.join('\n') : 'none — all buffers decoded');
await browser.close();
