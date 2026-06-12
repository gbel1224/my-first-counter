import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => { document.querySelector('#how .btn.back')?.click(); document.querySelector('[data-go="single"]').click(); });
await new Promise(r => setTimeout(r, 300));
await page.click('[data-action="quick"]');  // real click = gesture for pointer lock
await page.waitForFunction(() => window.__match?.phase === 'play' && window.__match.sim.state.countdown <= 0, { timeout: 25000 });
const locked = await page.evaluate(() => !!document.pointerLockElement);
// kb move
const p0 = await page.evaluate(() => ({ ...window.__match.sim.state.slots[0].pos }));
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 1500));
await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => ({ ...window.__match.sim.state.slots[0].pos }));
// jump
await page.keyboard.press('Space');
await new Promise(r => setTimeout(r, 250));
const vy = await page.evaluate(() => window.__match.sim.state.slots[0].pos.y);
// mouse look + fire
const yaw0 = await page.evaluate(() => window.__match.sim.state.slots[0].yaw);
await page.mouse.move(480, 270);
await page.mouse.move(580, 270);
const shots0 = await page.evaluate(() => window.__match.sim.state.slots[0].shotsFired);
await page.mouse.down(); await new Promise(r => setTimeout(r, 600)); await page.mouse.up();
const shots1 = await page.evaluate(() => window.__match.sim.state.slots[0].shotsFired);
const yaw1 = await page.evaluate(() => window.__match.sim.state.slots[0].yaw);
console.log('pointer locked:', locked);
console.log('W move:', Math.hypot(p1.x-p0.x, p1.z-p0.z).toFixed(1), 'u', Math.hypot(p1.x-p0.x,p1.z-p0.z) > 4 ? 'PASS' : 'FAIL');
console.log('jump y:', vy.toFixed(2), vy > 0.2 ? 'PASS' : 'FAIL');
console.log('mouse look dyaw:', (yaw1-yaw0).toFixed(3), Math.abs(yaw1-yaw0) > 0.01 ? 'PASS' : 'FAIL');
console.log('mouse fire shots:', shots1 - shots0, shots1 > shots0 ? 'PASS' : 'FAIL');
await browser.close();
