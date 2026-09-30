// Palm City browser regression suite — boots the real game in headless Chromium and checks every
// system that has broken before: title staging, bank popups for every button, typed amounts,
// stocks, cops, heists, animation sanity, and the phone-size HUD.
//
//   node tools/regress.mjs            (starts its own static server on a free port)
//
// Needs Playwright (the cloud image has it at /opt/node22/lib/node_modules/playwright).
// Uses deterministic manual update() steps, so it doesn't depend on how fast the machine is.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PW = process.env.PLAYWRIGHT || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8800 + Math.floor(Math.random() * 150);
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 900));

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else { fail++; console.log("  ✗ " + name + (info !== undefined ? "  " + JSON.stringify(info) : "")); } };

const b = await chromium.launch();
try {
  const pg = await b.newPage({ viewport: { width: 414, height: 860 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());   // sandbox proxy breaks webfonts
  const errs = []; pg.on("pageerror", e => errs.push(e.message));
  await pg.goto("http://localhost:" + PORT + "/index.html", { timeout: 180000 });
  await pg.waitForFunction("window.__palmCity && window.__palmCity.scene", { timeout: 180000 });
  await pg.waitForTimeout(1500);

  // ---------- title ----------
  console.log("title");
  const t = await pg.evaluate(() => {
    const P = window.__palmCity, v = new P.THREE.Vector3();
    const pile = arr => arr.filter(o => o.mesh && o.mesh.visible && (o.mesh.getWorldPosition(v), Math.hypot(v.x, v.z) < 3 && v.y > -100)).length;
    return { phase: P.state.phase, pile: pile(P.traffic) + pile(P.npcs) + pile(P.cars), hudHidden: getComputedStyle(document.getElementById("topbar")).visibility };
  });
  ok("starts on title", t.phase === "intro", t);
  ok("no entities piled at origin", t.pile === 0, t);
  ok("HUD hidden behind title", t.hudHidden === "hidden", t);

  await pg.evaluate(() => {
    const P = window.__palmCity; P.freeze(true); P.beginPlay(); P.closeTut();
    for (let g = 0; P.debugInput().dlgLines && g < 60; g++) P.advanceDialogue();
  });
  const clearDlg = "(() => { const P = window.__palmCity; for (let g = 0; P.debugInput().dlgLines && g < 60; g++) P.advanceDialogue(); })()";

  // ---------- bank: every button, both sides of the line ----------
  console.log("bank");
  const bank = await pg.evaluate(async clr => {
    const P = window.__palmCity, S = P.state; eval(clr);
    const res = [];
    const btn = label => [...document.querySelectorAll("button")].find(x => x.textContent.trim() === label && x.offsetParent);
    const errShown = () => /Can't|nothing|no cash|Type an amount|isn't an amount/.test(document.body.innerText);
    const cases = [["+100", 100, "dep"], ["+1k", 1000, "dep"], ["+10k", 10000, "dep"], ["−100", 100, "wd"], ["−1k", 1000, "wd"], ["−10k", 10000, "wd"]];
    for (const [label, amt, kind] of cases) {
      for (const have of [0, amt - 1, amt, amt * 3]) {
        eval(clr); P.phoneApp("bank"); S.money = kind === "dep" ? have : 0; S.bank = kind === "dep" ? 0 : have; P.openPhone();
        const b = btn(label); if (!b) { res.push({ label, missing: true }); continue; }
        const m0 = S.money, b0 = S.bank; b.click();
        const refused = have < amt;
        const moved = kind === "dep" ? (b0 + amt === Math.round(S.bank) && m0 - amt === Math.round(S.money)) : (b0 - amt === Math.round(S.bank) && m0 + amt === Math.round(S.money));
        const unchanged = S.money === m0 && S.bank === b0;
        res.push({ label, have, good: refused ? (unchanged && errShown()) : (moved && !errShown()) });
      }
    }
    // typed amounts
    const typed = [];
    for (const [txt, money, expectOk] of [["2500", 3000, true], ["2500", 2499, false], ["", 5000, false], ["0", 5000, false], ["12.9", 50, true]]) {
      eval(clr); P.phoneApp("bank"); S.money = money; S.bank = 0; P.openPhone();
      const inp = [...document.querySelectorAll("input")].find(i => i.placeholder === "e.g. 2500");
      inp.value = txt; inp.dispatchEvent(new Event("input"));
      btn("Deposit").click();
      typed.push({ txt, good: expectOk ? S.bank === Math.floor(parseFloat(txt)) : (S.bank === 0 && errShown()) });
    }
    return { res, typed };
  }, clearDlg);
  for (const r of bank.res) ok("bank " + r.label + " with " + r.have, r.good, r);
  for (const r of bank.typed) ok("typed deposit '" + r.txt + "'", r.good, r);

  // ---------- stocks ----------
  console.log("stocks");
  const st = await pg.evaluate(clr => {
    const P = window.__palmCity, S = P.state; eval(clr);
    S.money = 0; const refusedBuy = P.stockOps.buy("BUNS", 5) === 0;
    S.money = 10000; const c = P.stockOps.buy("BUNS", 10); const held = S.shares.BUNS;
    const refusedSell = P.stockOps.sell("BUNS", 999) > 0 ? S.shares.BUNS === 0 : false;   // sell clamps to what you hold
    const cost0 = S.scost.BUNS;
    P.phoneApp("stocks"); P.stockSel(null); P.openPhone();
    const charts = document.querySelectorAll("polyline").length;
    return { refusedBuy, c, held, refusedSell, cost0, charts };
  }, clearDlg);
  ok("can't buy stock with no cash", st.refusedBuy, st);
  ok("buy 10 BUNS", st.c > 0 && st.held === 10, st);
  ok("sell-all clamps to holdings", st.refusedSell, st);
  ok("sparklines render for every ticker", st.charts >= 6, st);

  // ---------- cops ----------
  console.log("cops");
  const cops = await pg.evaluate(clr => {
    const P = window.__palmCity, S = P.state; eval(clr);
    P.setWanted(2); for (let i = 0; i < 300; i++) P.update(1 / 30);
    const active = P.police.filter(p => p.active).length;
    const d = P.copDebug();
    S.money = 5000; S.bank = 7000; P.forceBust();
    return { active, wanted: d.wanted, afterBustWanted: P.copDebug().wanted, money: S.money, bank: S.bank };
  }, clearDlg);
  ok("police respond to 2 stars", cops.active > 0, cops);
  ok("bust clears wanted", cops.afterBustWanted === 0, cops);
  ok("bust fine never touches the bank", cops.bank === 7000 && cops.money < 5000, cops);

  // ---------- heist, start to payout ----------
  console.log("heist");
  const hs = await pg.evaluate(clr => {
    const P = window.__palmCity, S = P.state; eval(clr);
    P.finishStory(); P.setWanted(0);   // heists unlock after the story
    const car = P.cars.find(c => !c.heli && !c.plane && !c.boat && !c.jetski);
    P.forceDrive(car);
    const go = (x, z) => { car.x = x; car.z = z; car.speed = 0; P.player.x = x; P.player.z = z; };
    const stages = [];
    if (!P.startHeist("quiet")) return { started: false };
    const H = () => P.heistsDebug.get();
    stages.push(H().stage);
    go(H().tx, H().tz); P.update(1 / 30); stages.push(H().stage);
    go(H().sx, H().sz); P.update(1 / 30); stages.push(H().stage);
    go(H().tx, H().tz); for (let i = 0; i < 30 * 14 && H() && H().stage === "grab"; i++) { go(H().tx, H().tz); P.update(1 / 30); }
    stages.push(H() && H().stage);
    const m0 = S.money;
    go(H().sx, H().sz); P.update(1 / 30);
    const done = !H();
    P.forceDrive(null);
    return { started: true, stages, done, paid: S.money - m0 };
  }, clearDlg);
  ok("heist runs case→wheels→grab→escape", hs.started && hs.stages.join() === "case,wheels,grab,escape", hs);
  ok("heist pays out at the drop", hs.done && hs.paid > 0, hs);

  // ---------- animation sanity ----------
  console.log("animation");
  const an = await pg.evaluate(clr => {
    const P = window.__palmCity; eval(clr); P.setWanted(0);
    for (let i = 0; i < 150; i++) P.update(1 / 30);
    const bad = [];
    const fin = o => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite);
    for (const n of P.npcs) if (n.mesh && !fin(n.mesh)) bad.push("npc");
    for (const t of P.traffic) if (!fin(t.mesh)) bad.push("traffic");
    if (!fin(P.hero.group)) bad.push("hero");
    const gaits = new Set(P.npcs.filter(n => n.gait).map(n => n.gait.stride.toFixed(3))).size;
    return { bad: bad.slice(0, 5), gaits };
  }, clearDlg);
  ok("no NaN transforms", an.bad.length === 0, an);
  ok("crowd has varied gaits", an.gaits > 20, an);

  // ---------- HUD at phone size ----------
  console.log("hud");
  const hud = await pg.evaluate(clr => {
    eval(clr); window.__palmCity.closePhone();
    const ids = ["moneybox", "missionbox", "minimap", "wanted", "health"];
    const R = ids.map(id => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return r && r.width ? { id, r } : null; }).filter(Boolean);
    const hit = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i].r, c = R[j].r;
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) hit.push(R[i].id + "/" + R[j].id);
    }
    return { hit };
  }, clearDlg);
  ok("HUD pieces don't overlap at 414px", hud.hit.length === 0, hud);

  ok("no page errors", errs.length === 0, errs.slice(0, 4));
} finally {
  await b.close(); srv.kill();
}
console.log((fail ? "REGRESS FAIL" : "REGRESS PASS") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
