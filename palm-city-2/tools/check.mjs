// Palm City 2 — browser check: boots the game headless and exercises the core loop.
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
      localStorage.removeItem("palmcity2_save");
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
      out.saved = !!localStorage.getItem("palmcity2_save");
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
    ok("no page errors", errs.length === 0, errs.slice(0, 3));
    await pg.close();
  }
} finally { await b.close(); srv.kill(); }
console.log((fail ? "CHECK FAIL" : "CHECK PASS") + " — " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
