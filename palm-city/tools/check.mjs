// Palm City — browser check: boots the game headless and exercises the core loop.
//   node tools/check.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT || "/opt/node22/lib/node_modules/playwright/index.mjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8950 + Math.floor(Math.random() * 40);
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 900));
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) pass++; else { fail++; console.log("  ✗ " + n + (info !== undefined ? "  " + JSON.stringify(info) : "")); } };
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const [tag, opts] of [["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }],
    ["desktop", { viewport: { width: 1280, height: 800 } }]]) {
    console.log(tag);
    const pg = await b.newPage({ deviceScaleFactor: 1, ...opts });
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(e.message));
    await pg.goto("http://localhost:" + PORT + "/index.html", { timeout: 240000 });
    await pg.waitForFunction("window.__pc2", { timeout: 240000 });
    const r = await pg.evaluate(() => {
      const G = window.__pc2; G.freeze(true);
      localStorage.removeItem("palmcity_save"); localStorage.setItem("sunset_city_save_v1_imported", "1");
      const out = { phase0: G.state.phase };
      G.start(); out.phase1 = G.state.phase;
      const talk0 = () => { let k = 0; while (G.hud.talking() && k++ < 80) { G.hud.advance(); G.hud.advance(); } };
      for (let i = 0; i < 90; i++) G.step(1 / 60); talk0();
      // walk forward for 2 s
      const x0 = G.P.x, z0 = G.P.z;
      for (let i = 0; i < 120; i++) { G.I.mz = 1; G.I.mx = 0; G.step(1 / 60); }
      G.I.mz = 0; out.walked = Math.hypot(G.P.x - x0, G.P.z - z0);
      // get in the sports car and drive
      const c = G.cars[0]; G.P.x = c.x - 1.5; G.P.z = c.z; G.P.car = null;
      out.entered = G.enterNearest() && !!G.P.car; talk0();
      for (let i = 0; i < 90; i++) { G.I.mz = 1; G.step(1 / 60); }
      out.carSpeed = G.P.car ? G.P.car.speed : 0;
      G.I.mz = 0; for (let i = 0; i < 30; i++) G.step(1 / 60);
      G.exitCar(); out.exited = !G.P.car && G.P.ch.group.visible;
      // 30 s of city
      for (let i = 0; i < 1800; i++) G.step(1 / 60);
      const T = G.traffic.cars.filter(c => c.alive);
      out.trafficBad = T.filter(c => !isFinite(c.x) || !isFinite(c.z)).length;
      out.trafficMoving = T.filter(c => c.speed > 1).length;
      out.crowdBad = G.crowd.people.filter(p => !isFinite(p.x) || !isFinite(p.z)).length;
      const near = G.crowd.people.filter(p => (p.x - G.P.x) ** 2 + (p.z - G.P.z) ** 2 < 150 * 150).length;
      out.crowdNear = near; out.pos = [Math.round(G.P.x), Math.round(G.P.z)];
      G.renderOnce();
      out.saved = !!localStorage.getItem("palmcity_save");
      // story: chapter 1 (walk to Marco) completes and pays
      const talk = () => { let k = 0; while (G.hud.talking() && k++ < 80) { G.hud.advance(); G.hud.advance(); } };
      if (G.P.car) G.exitCar();
      talk(); for (let i = 0; i < 120; i++) G.step(1 / 60); talk(); for (let i = 0; i < 5; i++) G.step(1 / 60);
      const o = G.story.objective(); out.obj1 = o && o.text;
      const m0 = G.st.money;
      G.P.x = G.PLACES.fountain.x; G.P.z = G.PLACES.fountain.z; for (let i = 0; i < 5; i++) G.step(1 / 60); talk(); for (let i = 0; i < 5; i++) G.step(1 / 60);
      out.ch1 = G.st.mi; out.paid = G.st.money - m0;
      // economy: can't buy the hot-dog cart broke; can once you have the cash; income starts
      G.P.x = G.PLACES.dogs.x; G.P.z = G.PLACES.dogs.z; G.st.money = 100;
      G.eco.doAction(G.eco.actionAt(G.P.x, G.P.z), {}); out.brokeOwned = !!G.st.owned.dogs;
      G.st.money = 600; G.eco.doAction(G.eco.actionAt(G.P.x, G.P.z), { dogs: "Sunny Dogs" }); out.owned = G.st.owned.dogs; out.left = Math.round(G.st.money);
      out.income = G.eco.incomeRate();
      // crime: a punch raises heat; police respond; standing still gets you busted (cash fine only)
      G.st.money = 1000; G.st.bank = 500;
      const vic = G.crowd.nearest(G.P.x, G.P.z, 400, p => !p.gang && !p.ally);
      // stage it in the open, on the plaza, where a cruiser on the road can see you
      G.P.x = G.PLACES.fountain.x + 16; G.P.z = G.PLACES.fountain.z; vic.cross = null; vic.pause = 5;
      vic.x = G.P.x + Math.sin(G.P.yaw) * 0.9; vic.z = G.P.z + Math.cos(G.P.yaw) * 0.9;
      G.combat.S.cd = 0; G.combat.punch(); out.wanted = G.crime.S.wanted;
      // a lone 1★ can slip the patrols and fade — re-offend (up to 3 times) until they catch you
      for (let tries = 0; tries < 3; tries++) {
        let k = 0; while (G.crime.S.wanted > 0 && k++ < 3600) { talk(); G.step(1 / 60); }
        if (G.st.money < 1000) break;
        G.P.x = G.PLACES.fountain.x + 16; G.P.z = G.PLACES.fountain.z; G.crime.addCrime(1);
      }
      out.bustedFine = 1000 - Math.round(G.st.money); out.bankKept = G.st.bank;
      // guns: buy a pistol, it fires and spends ammo
      G.st.money = 2000; G.combat.buy(G.combat.WEAPONS[1]); const a0 = G.st.ammo.pistol; G.combat.S.cd = 0; G.combat.fire(0); out.ammoUsed = a0 - G.st.ammo.pistol;
      // phone bank: a deposit you can't afford shows the red error and moves nothing
      G.crime.reset();
      const ph = G.phone(); ph.show(true); ph.setApp("bank");
      G.st.money = 50; const b0 = G.st.bank;
      document.querySelector('#phone [data-dep="1000"]').click();
      out.bankErr = document.querySelector('#phone .nerr').classList.contains("on") && G.st.bank === b0;
      G.st.money = 5000; document.querySelector('#phone [data-dep="1000"]').click(); out.bankDep = G.st.bank - b0;
      ph.show(false);
      // a full quiet heist: case → wheels → grab → escape → paid
      G.st.mi = 12; G.crime.reset();
      const car = G.cars.find(c => !c.boom && !c.locked && c !== G.P.car) || G.P.car; G.P.x = car.x - 1.6; G.P.z = car.z; if (!G.P.car) G.enterNearest();
      out.heistCar = G.P.car ? (G.P.car.kind || "car") : "none:" + JSON.stringify([car && car.kind, car && car.locked, car && Math.round(car.x), Math.round(G.P.x)]);
      if (!G.P.car) return out;
      out.heistStarted = G.startHeist("quiet");
      const H = () => G.heistsDebug.get(), go = (x, z) => { if (!G.P.car) return; G.P.car.x = x; G.P.car.z = z; G.P.car.vx = G.P.car.vz = 0; G.P.car.hp = 100; };
      const stages = [H().stage];
      go(H().tx, H().tz); G.step(1 / 60); stages.push(H().stage);
      go(H().sx, H().sz); G.step(1 / 60); stages.push(H().stage);
      for (let i = 0; i < 60 * 14 && H() && H().stage === "grab"; i++) { go(H().tx, H().tz); G.crime.S.health = 100; G.crime.S.wanted = Math.min(G.crime.S.wanted, 3); G.step(1 / 60); }   // (≤3★: this tests the heist, not the tank)
      stages.push(H() && H().stage);
      const hm = G.st.money; go(H().sx, H().sz); G.step(1 / 60);
      out.heistStages = stages.join(); out.heistPaid = !H() && G.st.money > hm;
      return out;
    });
    ok("starts on the title", r.phase0 === "title", r);
    ok("PLAY starts the game", r.phase1 === "play", r);
    ok("walking moves the player", r.walked > 3, r);
    ok("can get in a car", r.entered, r);
    ok("car accelerates", r.carSpeed > 8, r);
    ok("can get out", r.exited, r);
    ok("traffic positions valid", r.trafficBad === 0, r);
    ok("traffic is flowing", r.trafficMoving > 30, r);
    ok("crowd positions valid", r.crowdBad === 0, r);
    ok("streets around the player are busy", r.crowdNear > 100, r);   // settled density is 200+; right after a fast drive it's still refilling (the old bug was ~25)
    ok("progress saves", r.saved, r);
    ok("chapter 1 objective shows", /Marco/.test(r.obj1 || ""), r);
    ok("chapter 1 completes and pays", r.ch1 === 1 && r.paid >= 100, r);
    ok("can't buy a business you can't afford", !r.brokeOwned, r);
    ok("buying a business works and earns", r.owned === 1 && r.left === 100 && r.income >= 30, r);
    ok("punching someone gets you a star", r.wanted >= 1, r);
    ok("police catch you: busted with a cash fine, bank untouched", r.bustedFine > 0 && Math.floor(r.bankKept) >= 500, r);
    ok("guns fire and use ammo", r.ammoUsed === 1, r);
    ok("phone bank refuses what you can't afford (red error)", r.bankErr, r);
    ok("phone bank deposit works", Math.round(r.bankDep) === 1000, r);
    ok("heist runs case→wheels→grab→escape", r.heistStarted && r.heistStages === "case,wheels,grab,escape", r);
    ok("heist pays at the drop", r.heistPaid, r);
    // the newer systems: heavy weapons, air & armour at high heat, homes, venues, the water race, props
    const r2 = await pg.evaluate(async () => {
      const G = window.__pc2, run = n => { for (let i = 0; i < n; i++) { G.crime.S.health = 100; G.step(1 / 60); G.crime.S.bustT = 0; } }, o = {};
      if (G.P.car) G.exitCar(); G.crime.reset(); G.st.mi = 12; G.st.money = 200000; G.hud.closePanel();
      // RPG: a rocket at a traffic car wrecks it
      const W = id => G.combat.WEAPONS.find(w => w.id === id);
      G.combat.buy(W("rpg")); G.combat.S.weapon = G.combat.WEAPONS.indexOf(W("rpg"));
      const tc = G.traffic.cars.find(c => c.alive);
      // stand 16 m down the car's own road and fire straight at it (a few tries: auto-aim may grab a passer-by)
      for (let k = 0; k < 3 && tc.alive; k++) {
        G.P.x = tc.x + Math.sin(tc.h) * 16; G.P.z = tc.z + Math.cos(tc.h) * 16; tc.speed = 0; tc.stun = 30; G.combat.S.cd = 0;
        G.combat.fire(Math.atan2(tc.x - G.P.x, tc.z - G.P.z)); run(60);
      }
      o.rpgWreck = !tc.alive;
      // 4★ brings the chopper, 5★ the tank
      G.crime.reset(); G.P.x = G.PLACES.fountain.x + 16; G.P.z = G.PLACES.fountain.z;
      G.crime.S.crimeCD = 0; G.crime.addCrime(4); run(5); o.heli = G.crime.heli.active;
      G.crime.S.crimeCD = 0; G.crime.addCrime(1); run(5); o.tank = G.crime.units.some(u => u.tank && u.active);
      G.crime.reset(); run(2); o.cleared = !G.crime.heli.active && !G.crime.units.some(u => u.active);
      // home: enter your condo, buy a sofa, walk out the door
      G.st.home = true; G.P.x = G.PLACES.condo.x; G.P.z = G.PLACES.condo.z; run(1);
      const act = G.eco.actionAt(G.P.x, G.P.z); if (act && act.kind === "rest") G.interior.enter(act.pr, G.P);
      o.home = G.interior.inside;
      G.interior.panel("sofa"); const m0 = G.st.money; [...document.querySelectorAll("#panel .prow button")][3].click(); G.hud.closePanel();
      o.decor = G.st.decor.sofa === 2 && G.st.money < m0;
      G.interior.exit(G.P); o.homeOut = !G.interior.inside;
      // venue: walk into the burger joint, eat at the counter, leave
      G.interior.enterVenue("burger", G.P); const R = G.interior.ROOM, v = G.interior.venue();
      const sp = v.spots.find(s => s.act === "eat"); G.P.x = R.x + sp.x; G.P.z = R.z + sp.z; G.crime.S.health = 30;
      const ea = G.interior.action(G.P); if (ea) ea[2](); o.ate = ea && ea[0] === "EAT" && G.crime.S.health === 100;
      G.interior.exit(G.P); o.venueOut = !G.interior.inside && Math.hypot(G.P.x - G.PLACES.burger.x, G.P.z - G.PLACES.burger.z) < 4;
      // Wake Breaker on a jet ski
      const { CIRCUITS } = await import("/src/extras.js"); const C = CIRCUITS.find(c => c.id === "wake");
      const js = G.cars.find(c => c.kind === "jetski"); G.P.x = js.x - 1.5; G.P.z = js.z; run(1); G.enterNearest();
      const tp = p => { const c = G.P.car; c.x = p.x; c.z = p.z; c.vx = c.vz = 0; };
      G.events.forceIdle(true); G.events.cancel();       // races don't start while a street event is running
      if (G.P.car) { tp(C.start); run(6); for (const cp of C.cps) { tp(cp); run(6); } }
      o.wake = (G.st.medals.wake || 0) > 0; if (G.P.car) G.exitCar();
      // props: a car through a hydrant sends it flying
      const hyd = G.props.items.find(i => i.kind === "hydrant" && !i.loose);
      const car = G.cars.find(c => !c.kind && !c.locked && !c.boom); G.P.x = car.x - 1.6; G.P.z = car.z; run(1); G.enterNearest();
      if (G.P.car) { const c = G.P.car; c.h = 0; c.x = hyd.x0; c.z = hyd.z0 - 6; c.vx = 0; c.vz = 14; c.speed = 14; run(30); G.exitCar(); }
      o.prop = hyd.loose;
      // talk to a stranger: they answer, their mouth moves, and an insult to a tough guy starts a fight
      G.crime.S.wanted = 0;
      const ped = G.crowd.nearest(G.P.x, G.P.z, 300, q => !q.gang && !q.goon && !q.crew && !q.hidden && !(q.knocked > 0));
      if (ped) {
        ped.persona = "tough"; ped.fear = 0; G.P.x = ped.x + 1.2; G.P.z = ped.z; run(2);
        const ta = G.life.action(); if (ta && ta[0] === "TALK") ta[2]();
        o.talkOpen = !!G.life.talkingTo() && ped.face && ped.face.talk > 0;
        G.life.choose("insult"); run(150);
        o.talkFight = ped.fightT > 0 && ped.face.expr === "mad";
      }
      return o;
    });
    ok("RPG rocket wrecks a car", r2.rpgWreck, r2);
    ok("police chopper at 4★, tank at 5★, both stand down on reset", r2.heli && r2.tank && r2.cleared, r2);
    ok("enter your home and decorate it", r2.home && r2.decor && r2.homeOut, r2);
    ok("walk into a venue, eat at the counter, walk out", r2.ate && r2.venueOut, r2);
    ok("Wake Breaker water race pays a medal", r2.wake, r2);
    ok("cars knock street props flying", r2.prop, r2);
    ok("strangers talk back with moving mouths", r2.talkOpen, r2);
    ok("insulting a tough guy starts a fight (and he looks mad)", r2.talkFight, r2);
    ok("no page errors", errs.length === 0, errs.slice(0, 3));
    await pg.close();
  }
} finally { await b.close(); srv.kill(); }
console.log((fail ? "CHECK FAIL" : "CHECK PASS") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
