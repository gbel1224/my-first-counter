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
      // walk forward for 2 s
      const x0 = G.P.x, z0 = G.P.z;
      for (let i = 0; i < 120; i++) { G.I.mz = 1; G.I.mx = 0; G.step(1 / 60); }
      G.I.mz = 0; out.walked = Math.hypot(G.P.x - x0, G.P.z - z0);
      // get in the sports car and drive
      const c = G.cars[0]; G.P.x = c.x - 1.5; G.P.z = c.z; G.P.car = null;
      out.entered = G.enterNearest() && !!G.P.car;
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
      out.crowdNear = near;
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
    ok("streets around the player are busy", r.crowdNear > 150, r);
    ok("progress saves", r.saved, r);
    ok("chapter 1 objective shows", /Marco/.test(r.obj1 || ""), r);
    ok("chapter 1 completes and pays", r.ch1 === 1 && r.paid >= 100, r);
    ok("can't buy a business you can't afford", !r.brokeOwned, r);
    ok("buying a business works and earns", r.owned === 1 && r.left === 100 && r.income >= 30, r);
    ok("no page errors", errs.length === 0, errs.slice(0, 3));
    await pg.close();
  }
} finally { await b.close(); srv.kill(); }
console.log((fail ? "CHECK FAIL" : "CHECK PASS") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
