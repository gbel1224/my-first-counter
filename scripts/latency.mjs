// Gate 2: input-to-beam latency. Uses the real touch input path (no pointer
// lock needed headless): touchstart on FIRE → first FIRE event on the bus.
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540, hasTouch: true });
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
await page.tap('#how .btn.back');
await page.tap('[data-go="single"]');
await new Promise(r => setTimeout(r, 300));
await page.tap('[data-action="quick"]');
// wait for play phase (dive + countdown)
await page.waitForFunction(() => window.__match && window.__match.phase === 'play', { timeout: 20000 });
await new Promise(r => setTimeout(r, 1500));
const samples = await page.evaluate(async () => {
  const out = [];
  const { EV } = await import('/src/core/events.js');
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    let t1 = null;
    const un = window.__match.bus.on(EV.FIRE, e => { if (e.shooter === 0 && t1 === null) t1 = performance.now(); });
    // real input path: touch the FIRE button
    const el = document.getElementById('btnfire');
    const touch = new Touch({ identifier: 99, target: el, clientX: 10, clientY: 10 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], cancelable: true, bubbles: true }));
    un();
    if (t1 !== null) out.push(+(t1 - t0).toFixed(1));
    await new Promise(r => setTimeout(r, 300)); // cooldown reset
  }
  return out;
});
console.log('input→FIRE-event latency ms (8 samples):', samples);
console.log('worst:', Math.max(...samples), '+ ≤1 render frame (16.7ms @60fps) to visible beam');
await browser.close();
