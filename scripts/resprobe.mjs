import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
for (const [w,h] of [[1280,720],[640,360],[320,180]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.goto('http://localhost:5180/?smoke=1', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 9000));
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(loop); else res((n / 4).toFixed(1)); };
    requestAnimationFrame(loop);
  }));
  console.log(`${w}x${h}: ${fps} fps (software raster)`);
  await page.close();
}
await browser.close();
