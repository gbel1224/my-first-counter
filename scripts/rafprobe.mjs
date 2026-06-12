import puppeteer from 'puppeteer';
for (const flags of [[], ['--disable-frame-rate-limit', '--disable-gpu-vsync']]) {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', ...flags] });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  // trivial RAF page (no WebGL) → measures the harness's frame cadence ceiling
  await page.setContent('<html><body></body></html>');
  const trivial = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res((n / 2).toFixed(0)); };
    requestAnimationFrame(loop);
  }));
  // game page
  await page.goto('http://localhost:5180/?smoke=1', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 9000));
  const game = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res((n / 3).toFixed(0)); };
    requestAnimationFrame(loop);
  }));
  console.log(`flags=[${flags.join(' ')}] trivial-page RAF: ${trivial}fps | in-match RAF: ${game}fps`);
  await browser.close();
}
