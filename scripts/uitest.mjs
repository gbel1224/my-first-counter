// Gate 5/6 checks: settings persistence, hc/text-scale application, challenges
// grid state, ranked card refresh, save roundtrip, loadout chips.
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700 });
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,200)));
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));
// seed a save with progress to render
await page.evaluate(() => {
  localStorage.setItem('lsa_save_v1', JSON.stringify({
    rank: { tier: 2, div: 1, rp: 64, shielded: false },
    challenges: { firstBlood: true, airborne: true },
    unlocks: { beam: ['cyan','green'], crosshair: ['default','dot'] },
    loadout: { beam: 'green', crosshair: 'dot' },
    settings: { sens: 7, music: 4, sfx: 9, shake: false, flash: true, hc: true, tscale: 12 },
    firstLaunch: false,
  }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));
const checks = await page.evaluate(() => {
  const out = {};
  out.activeIsTitle = document.querySelector('.screen.active')?.id === 'title'; // not how (firstLaunch false)
  out.hcApplied = document.body.classList.contains('hc');
  out.uiscale = getComputedStyle(document.documentElement).getPropertyValue('--uiscale').trim();
  out.sens = document.getElementById('set-sens').value;
  out.shakeOff = !document.getElementById('set-shake').classList.contains('on');
  return out;
});
// ranked screen
await page.evaluate(sel => document.querySelector(sel).click(), '[data-go="single"]'); await new Promise(r=>setTimeout(r,300));
await page.evaluate(sel => document.querySelector(sel).click(), '[data-go="ranked"]'); await new Promise(r=>setTimeout(r,300));
const ranked = await page.evaluate(() => ({
  name: document.getElementById('rk-name').textContent,
  bar: document.getElementById('rk-bar').style.width,
  now: document.querySelector('#rk-ladder span.now')?.dataset.tier,
}));
await page.screenshot({ path: '/tmp/ranked.png' });
// challenges screen
await page.evaluate(sel => document.querySelector(sel).click(), '.btn.back'); await new Promise(r=>setTimeout(r,300));
await page.evaluate(sel => document.querySelector(sel).click(), '[data-go="challenges"]'); await new Promise(r=>setTimeout(r,300));
const ch = await page.evaluate(() => ({
  done: [...document.querySelectorAll('.ch.done')].map(e=>e.dataset.ch),
}));
await page.screenshot({ path: '/tmp/challenges.png' });
// settings loadout chips
await page.evaluate(() => document.querySelector('.screen.active .btn.back')?.click()); await new Promise(r=>setTimeout(r,300));


await page.evaluate(sel => document.querySelector(sel).click(), '[data-go="settings"]'); await new Promise(r=>setTimeout(r,300));
const lo = await page.evaluate(() => ({
  beams: [...document.querySelectorAll('#lo-beam button')].map(b=>b.textContent+(b.classList.contains('now')?'*':b.classList.contains('lock')?'!':'')),
  cross: [...document.querySelectorAll('#lo-cross button')].map(b=>b.textContent+(b.classList.contains('now')?'*':b.classList.contains('lock')?'!':'')),
}));
await page.screenshot({ path: '/tmp/settings.png' });
console.log(JSON.stringify({ checks, ranked, ch, lo }, null, 1));
await browser.close();
