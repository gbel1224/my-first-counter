// Palm City — Act Two: "Shark Waters". Once Sterling's gone, Vic "The Shark" Moreno wants the city.
// Eight chapters, each a different kind of job: tail a car without being made, run one down, hold a
// club against waves, creep through a guarded yard, escort a van through ambushes, deliver something
// that mustn't break, get framed and run, and finally go and end it at his yard.
import * as THREE from "../vendor/three.module.js";
import { PLACES } from "./places.js";
import { clamp, HALF, N, roadC, nearestRoad, lerpAngle } from "./world.js";
import { makeRoadDriver } from "./roaddriver.js";
import { buildCraft } from "./craft.js";
import { randomLook, finishLook } from "./people.js";

export const ACT2 = [
  { title: "Tailing the Shark", type: "tail", reward: 2000,
    intro: [["narrator", "Sterling's gone. Something worse is circling."], ["marco", "(phone) Cuz — that black sedan outside the plaza? Moreno's lieutenant. Follow him. Don't get close, don't lose him."]],
    outro: [["marco", "A warehouse by the marina. So that's where the Shark keeps his teeth."]] },
  { title: "Hot Pursuit", type: "chase", reward: 2500,
    intro: [["marco", "(phone) Moreno's courier is running his books across town right now!"], ["marco", "Run him off the road — ram him, shoot him, whatever. Just stop that car."]],
    outro: [["marco", "The ledger! Every crooked cop and every bribe in this city, written down."], ["vic", "(phone) You just made the worst mistake of your little life."]] },
  { title: "Hold the Line", type: "defend", reward: 3000,
    intro: [["rosa", "(phone) They're outside the Neon Palms with guns! Please — get here!"], ["marco", "Hold that club, cuz. Nobody takes what's ours."]],
    outro: [["rosa", "You came. You actually came. The club's still standing — because of you."]] },
  { title: "Quiet Work", type: "stealth", reward: 3000,
    intro: [["marco", "We need ears on Moreno. His boat's tied up at the yard below the promenade."], ["marco", "Plant this bug on it. His guys are watching — stay out of their sight, and don't run near them."]],
    outro: [["marco", "We're in. Every word he says on that boat, we hear."]] },
  { title: "Precious Cargo", type: "escort", reward: 3500,
    intro: [["rosa", "(phone) The gallery wants the whole collection tonight. Moreno knows it's in my van."], ["rosa", "Ride with me? Stay close. If they hit the van, the paintings are gone."]],
    outro: [["rosa", "Not a scratch. Okay — maybe I like having you around."]] },
  { title: "Handle With Care", type: "cargo", reward: 2500,
    intro: [["marco", "That bug picked up a shipment — Moreno's moving something fragile by the marina."], ["marco", "We grabbed it first. Drive it to the marina before his people notice. Gently, cuz. Gently."]],
    outro: [["marco", "Delivered in one piece. Moreno's going to be FURIOUS."]] },
  { title: "Framed", type: "escape", reward: 3000,
    intro: [["ruiz", "(radio) All units: suspect in the Moreno shootings is on foot downtown. Approach with caution."], ["marco", "(phone) He bought the cops, cuz — they think YOU did it! Get to the safehouse and lose them!"]],
    outro: [["ruiz", "(phone) Detective Ruiz. I read the ledger you left on my desk. I know who you are… and who Moreno is."], ["ruiz", "Finish it. I'll make sure nobody's looking at the marina tonight."]] },
  { title: "The Shark's Yard", type: "boss", reward: 10000,
    intro: [["vic", "(phone) Enough. You want my city? Come and take it. The yard. Now."], ["marco", "This is it, cuz. End it."]],
    outro: [["vic", "…This city… eats people like you…"], ["marco", "Not this time. Palm City's ours — for real now."], ["narrator", "Act Two complete. The Shark is gone. The city — every street of it — is yours."]] },
];
export const ACT2_STEPS = {
  tail: "Follow the black sedan — not too close, don't lose him",
  chase: "Stop the courier's car",
  defend: "Defend the Neon Palms",
  stealth: "Plant the bug on Moreno's boat — stay unseen",
  escort: "Escort Rosa's van to the gallery",
  cargo: "Deliver the fragile cargo to the marina",
  escape: "Reach the safehouse and lose the cops",
  boss: "Take down Moreno at the marina yard",
};

export function makeAct2(scene, g) {
  // g: { st, P, crime, combat, gangs, crowd, collider, fx (particles), ui: { toast, banner, sound, save, earn, dialogue, talking, chapter }, busy(), cars, hit(car, impact), boss }
  const st = g.st, ui = g.ui, r = Math.random;
  let S = { state: "wait", t: 25, retry: false };
  const idx = () => st.mi - 12;
  const live = () => st.mi >= 12 && idx() < ACT2.length;
  const focus = () => g.P.car || g.P;
  let M = null;                                        // the running mission's own state

  // ---------------------------------------------------------------- road driving for NPC cars
  const nodeX = i => roadC(i);
  const RD = makeRoadDriver(scene, g.collider, focus);
  function makeDriver(type, color, x, z, h, mode, goal, want) {
    const D = RD.create(type, color, x, z, h, mode, goal, want), c = D.c;
    c.kind = undefined; c.mkind = "mission";
    c.shot = n => hurtCar(c, n * 0.9);          // (not .hit: the driving physics uses that for collisions)
    return D;
  }
  const drive = (D, dt) => RD.drive(D, dt);
  function removeCar(c) { if (!c) return; c.alive = false; scene.remove(c.group); }
  // you ramming a mission car: both bounce, it takes damage
  function collide(v) {
    if (!M || !M.cars) return 0;
    let impact = 0;
    for (const c of M.cars) {
      if (!c.alive || c === v) continue;
      const dx = v.x - c.x, dz = v.z - c.z, d = Math.hypot(dx, dz), R = 3.1;
      if (d > R || d < 1e-3) continue;
      const nx = dx / d, nz = dz / d, rel = (v.vx - c.vx) * nx + (v.vz - c.vz) * nz;
      v.x += nx * (R - d) * 0.5; v.z += nz * (R - d) * 0.5; c.x -= nx * (R - d) * 0.5; c.z -= nz * (R - d) * 0.5;
      if (rel < 0) {
        const k = -rel;
        v.vx += nx * k * 0.8; v.vz += nz * k * 0.8; c.vx -= nx * k * 0.6; c.vz -= nz * k * 0.6;
        impact = Math.max(impact, k);
        if (k > 4) { hurtCar(c, k * 3.2); if (g.crashFx) g.crashFx(v, c, (v.x + c.x) / 2, (v.z + c.z) / 2, nx, nz, k); }
      }
    }
    return impact;
  }
  function hurtCar(c, n) {
    if (!c.alive) return;
    c.hp -= n;
    if (c.hp < 60 && r() < 0.3) g.fx.smoke(c.x, 1.2, c.z, 0.3);
    if (c.hp <= 0) { g.combat.explodeCar(c, "traffic"); c.alive = false; setTimeout(() => scene.remove(c.group), 50); }
  }
  // guns: mission cars can be shot (combat asks for extra targets)
  function targets() {
    const out = [];
    if (M && M.cars) for (const c of M.cars) if (c.alive && c.shootable) out.push({ x: c.x, z: c.z, kind: "mcar", alive: true, car: c, hit: n => c.shot(n) });
    return out;
  }

  // ---------------------------------------------------------------- people: shooters, guards
  function shooter(p, dt, acc = 0.4, range = 36) {
    const F = focus(), dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1;
    p.yaw = Math.atan2(dx, dz); p.aimT = 0.5;
    p.shootCD = (p.shootCD || 1) - dt; if (p.shotT > 0) p.shotT -= dt;
    if (p.shootCD <= 0 && d < range && g.crime.los(p.x, p.z, F.x, F.z)) {
      p.shootCD = 0.9 + r() * 0.8; p.shotT = 0.12;
      g.fx.muzzle(p.x + dx / d * 0.6, 1.35, p.z + dz / d * 0.6, dx / d, dz / d);
      g.fx.tracer(p.x, 1.35, p.z, F.x + (r() - 0.5) * 2, 1.1, F.z + (r() - 0.5) * 2); ui.sound("gun", 0.35);
      if (r() < clamp(acc - d * 0.008 - (F.speed > 6 ? 0.15 : 0), 0.05, 0.6)) g.crime.hurt(g.P.car ? 5 : 8, p.x, p.z);
    }
  }
  const guards = [];
  let boat = null, yardLight = null;
  function guard(k) {
    if (guards[k]) return guards[k];
    const look = finishLook(Object.assign(randomLook(r), { shirt: 0x17181c, pants: 0x0d0e11, sleeveless: false, shorts: false, bulk: 1.12 }));
    const p = { gang: true, guard: true, x: 99999, z: 0, yaw: 0, speed: 1.2, look, phase: 0, style: { stride: 1, arm: 0.8 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 80, hidden: true, weapon: "pistol", shootCD: 1 };
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    p.ai = (q, dt) => {
      if (q.hidden || !M) return;
      if (M.alarm) { shooter(q, dt, 0.45); q.amt = 0; q.phase += dt; return; }
      // patrol back and forth between two points
      const [ax, az, bx, bz] = q.route, tx = q.leg ? bx : ax, tz = q.leg ? bz : az, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
      if (q.wait > 0) { q.wait -= dt; q.amt = 0; q.yaw += Math.sin(M.t * 0.7 + k) * dt * 0.8; }
      else if (d < 0.6) { q.leg = !q.leg; q.wait = 2 + r() * 2; }
      else { q.yaw = lerpAngle(q.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4)); q.x += dx / d * 1.25 * dt; q.z += dz / d * 1.25 * dt; q.amt = 0.9; }
      q.phase += dt * 2.4 * (q.amt || 0.2);
    };
    g.crowd.people.push(p); guards[k] = p;
    return p;
  }
  // a guard's eyes: a fan on the ground, yellow while they're calm, red as they notice you
  const coneGeo = new THREE.CircleGeometry(15, 20, -Math.PI / 6 + Math.PI / 2, Math.PI / 3); coneGeo.rotateX(-Math.PI / 2);
  const cones = [];
  function cone(k) {
    if (cones[k]) return cones[k];
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
    m.visible = false; m.renderOrder = 3; scene.add(m); cones[k] = m; return m;
  }

  // ---------------------------------------------------------------- the eight jobs
  const P = () => g.P;
  const near = (x, z, R) => { const F = focus(); return (F.x - x) ** 2 + (F.z - z) ** 2 < R * R; };
  const node = p => [nearestRoad(p.x), nearestRoad(p.z)];
  function setup(type) {
    const F = focus();
    M = { type, t: 0, cars: [], msg: "" };
    if (type === "tail") {
      const n0 = [nearestRoad(F.x), nearestRoad(F.z)], s = [clamp(n0[0] + 2, 0, N), n0[1]];
      const D = makeDriver("sedan", 0x0e0f11, nodeX(s[0]), nodeX(s[1]), 0, "goto", node(PLACES.marina), 11);
      M.D = D; M.cars.push(D.c); M.close = 0; M.lost = 0;
      D.c.tint = true;
    } else if (type === "chase") {
      const a = r() * 6.28, sx = clamp(F.x + Math.cos(a) * 70, -HALF + 30, HALF - 30), sz = clamp(F.z + Math.sin(a) * 70, -HALF + 30, HALF - 30);
      const D = makeDriver("coupe", 0x5a0d12, nodeX(nearestRoad(sx)), nodeX(nearestRoad(sz)), 0, "flee", null, 27);
      D.c.shootable = true; M.D = D; M.cars.push(D.c); M.t0 = 150;
    } else if (type === "defend") {
      const C = PLACES.club; M.cx = C.x + Math.sin(C.face) * 6; M.cz = C.z + Math.cos(C.face) * 6; M.wave = 0; M.list = []; M.away = 0; M.gap = 4;
    } else if (type === "stealth") {
      const Y = g.gangs.YARD; M.bx = Y.x + 18; M.bz = Y.z + 14; M.alarm = false; M.sus = 0; M.plant = 0;
      // his boat, up on a trailer in the yard
      if (!boat) { boat = buildCraft("boat", 0x14161c).group; scene.add(boat); }
      boat.visible = true; boat.position.set(M.bx + 2.2, 0.55, M.bz); boat.rotation.y = 0.4;
      // a work light on a pole over it: you can see the boat (and the guards near it) — and they can see you
      if (!yardLight) {
        yardLight = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 8), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.5 }));
        pole.position.y = 3; pole.castShadow = true;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xfff0c8, emissiveIntensity: 6 }));
        head.position.set(0.3, 6, 0);
        const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 2, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,236,200,1)"); gr.addColorStop(0.5, "rgba(255,226,180,.45)"); gr.addColorStop(1, "rgba(255,220,170,0)"); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2; pool.position.set(1.5, 0.05, 0); pool.renderOrder = 2;
        yardLight.add(pole, head, pool); scene.add(yardLight);
      }
      yardLight.visible = true; yardLight.position.set(M.bx - 3, 0, M.bz - 2);
      const R = [[-14, -4, -14, 14], [0, -8, 22, -8], [28, 26, 34, 2], [-6, 6, 6, 28]];   // (the boat at +18,+14 sits in the gap between their beats)
      R.forEach((q, k) => { const p = guard(k); p.hidden = false; p.dead = false; p.knocked = 0; p.hp = 80; p.route = [Y.x + q[0], Y.z + q[1], Y.x + q[2], Y.z + q[3]]; p.x = p.route[0]; p.z = p.route[1]; p.leg = true; p.wait = 0; p.aimT = 0; });
      if (g.setNight) g.setNight();
    } else if (type === "escort") {
      const S0 = PLACES.studio, G0 = PLACES.gallery;
      const D = makeDriver("van", 0xf4f4f2, nodeX(nearestRoad(S0.x)), nodeX(nearestRoad(S0.z)), 0, "goto", node(G0), 12);
      D.c.hp = 300; M.D = D; M.cars.push(D.c); M.ambush = [0.3, 0.65]; M.sprung = 0; M.list = []; M.dist0 = Math.abs(D.ni - D.goal[0]) + Math.abs(D.nj - D.goal[1]);
    } else if (type === "cargo") {
      M.cargo = 100; M.t0 = 130; const T = PLACES.marina; M.tx = T.x + Math.sin(T.face) * 6; M.tz = T.z + Math.cos(T.face) * 6;
      if (!g.P.car) ui.toast("📦 Get in a car — the cargo's loaded into whatever you drive", 3);
    } else if (type === "escape") {
      g.crime.S.wanted = 4; g.crime.S.wantedCD = 14; g.crime.belief.x = F.x; g.crime.belief.z = F.z; ui.toast("Wanted ★★★★", 2);
      const opts = [PLACES.flat, PLACES.condo, PLACES.apartment, PLACES.bungalow].filter(Boolean);
      let best = opts[0], bd = 0; for (const p of opts) { const d = Math.hypot(p.x - F.x, p.z - F.z); if (d > bd) { bd = d; best = p; } }
      M.sx = best.x; M.sz = best.z; M.hide = 0;
    } else if (type === "boss") {
      M.d0 = (st.nem && st.nem.defeated) || 0; M.started = false;
    }
  }
  // per frame: returns "ok", "fail:<why>", or nothing
  function run(dt) {
    const F = focus(), t = (M.t += dt);
    if (M.type === "tail") {
      const D = M.D, c = D.c; drive(D, dt);
      const d = Math.hypot(c.x - F.x, c.z - F.z);
      M.close = d < 13 ? M.close + dt * (g.P.car ? 1 : 0.6) : Math.max(0, M.close - dt * 0.5);
      M.lost = d > 95 ? M.lost + dt : 0;
      M.msg = d < 13 ? "⚠️ Too close — back off!" : d > 75 ? "⚠️ You're losing him!" : "Distance " + Math.round(d) + " m — good";
      if (M.close > 3) return "fail:He made you. The lieutenant's gone to ground.";
      if (M.lost > 6) return "fail:You lost him.";
      if (D.arrived && c.speed < 1) return "ok";
    } else if (M.type === "chase") {
      const D = M.D, c = D.c; drive(D, dt);
      M.t0 -= dt;
      M.msg = "Courier's car " + Math.max(0, Math.round(c.hp / 1.8)) + "% · ⏱ " + Math.ceil(M.t0) + "s";
      if (!c.alive) { if (!M.drop) { M.drop = { x: c.x, z: c.z }; ui.toast("📒 The ledger's in the wreck — grab it!", 3); } }
      if (M.drop && near(M.drop.x, M.drop.z, 4)) return "ok";
      if (!M.drop && Math.hypot(c.x - F.x, c.z - F.z) > 260) return "fail:The courier got away.";
      if (M.t0 <= 0 && !M.drop) return "fail:Too slow — the books are gone.";
    } else if (M.type === "defend") {
      const alive = M.list.filter(p => !(p.hidden || p.dead));
      if (!alive.length) {
        if (M.wave >= 3) return "ok";
        M.gap -= dt;
        if (M.gap <= 0) {
          M.wave++; M.gap = 5;
          M.list = g.gangs.crew(M.cx + (r() - 0.5) * 30, M.cz + (r() < 0.5 ? -1 : 1) * 25, 3 + M.wave);
          for (const p of M.list) { p.look = finishLook(Object.assign(randomLook(r), { shirt: 0x17181c, pants: 0x0d0e11, shorts: false })); p.home = { x: M.cx, z: M.cz }; }
          ui.toast("🔫 Wave " + M.wave + " of 3 — here they come", 2.2); ui.sound("blip", 0.7);
        }
      }
      const far = !near(M.cx, M.cz, 40); M.away = far ? M.away + dt : 0;
      M.msg = (alive.length ? "Wave " + M.wave + "/3 · " + alive.length + " left" : M.wave >= 3 ? "Clear!" : "Next wave incoming…") + (far ? " · ⚠️ Get back to the club!" : "");
      if (M.away > 10) return "fail:You left the club undefended.";
    } else if (M.type === "stealth") {
      // the guards look: in their fan, in the open (line of sight), and closer or running is worse
      let seen = 0;
      guards.slice(0, 4).forEach((p, k) => {
        const cn = cone(k); cn.visible = !M.alarm && !p.hidden; cn.position.set(p.x, 0.06, p.z); cn.rotation.y = p.yaw;
        const dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1, ang = Math.acos(clamp((dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / d, -1, 1));
        const range = 15 * (g.P.speed > 4 || g.P.car ? 1.35 : 1);
        let s = 0;
        if (!p.hidden && !(p.knocked > 0) && d < range && ang < Math.PI / 6 && g.crime.los(p.x, p.z, F.x, F.z)) s = (1.4 - d / range) * (g.P.car ? 2 : 1);
        if (!p.hidden && d < 2.6) s = Math.max(s, 0.6);                // right behind them: they hear you
        seen = Math.max(seen, s);
        cn.material.color.setRGB(1, 0.82 - Math.min(1, M.sus) * 0.7, 0.25 - Math.min(1, M.sus) * 0.2); cn.material.opacity = 0.14 + Math.min(1, M.sus) * 0.2;
      });
      M.sus = seen > 0 ? M.sus + seen * dt * 0.55 : Math.max(0, M.sus - dt * 0.3);   // a couple of seconds in plain view before they're sure
      if (!M.alarm && M.sus >= 1) { M.alarm = true; ui.toast("🚨 They've spotted you!", 2.5); ui.sound("blip", 0.9); for (const c of cones) if (c) c.visible = false; return "fail:Spotted — the guards raise the alarm."; }
      const atBoat = near(M.bx, M.bz, 3);
      M.plant = atBoat ? M.plant + dt : 0;
      M.msg = atBoat ? "Planting the bug… " + Math.min(100, Math.round(M.plant / 2.5 * 100)) + "%" : M.sus > 0.05 ? "👁 Suspicion " + Math.round(M.sus * 100) + "%" : "Stay out of the yellow — walk, don't run";
      if (M.plant > 2.5) return "ok";
    } else if (M.type === "escort") {
      const D = M.D, c = D.c, d = Math.hypot(c.x - F.x, c.z - F.z);
      D.hold = d > 70;
      drive(D, dt);
      const left = Math.abs(D.ni - D.goal[0]) + Math.abs(D.nj - D.goal[1]), prog = 1 - left / Math.max(1, M.dist0);
      if (M.sprung < M.ambush.length && prog >= M.ambush[M.sprung]) {
        M.sprung++;
        const a = c.h + (r() < 0.5 ? 1 : -1) * 0.6;
        M.list = g.gangs.crew(c.x + Math.sin(a) * 30, c.z + Math.cos(a) * 30, 4);
        ui.toast("🔫 Ambush! Protect the van!", 2.5); ui.sound("blip", 0.8);
      }
      for (const p of M.list) if (!(p.hidden || p.dead) && Math.hypot(p.x - c.x, p.z - c.z) < 38) c.hp -= dt * 3.2;
      M.msg = "Van " + Math.max(0, Math.round(c.hp / 3)) + "%" + (D.hold ? " · ⚠️ Rosa's waiting for you!" : "");
      if (c.hp <= 0) return "fail:The van's wrecked — the paintings are gone.";
      if (D.arrived && c.speed < 1) return "ok";
    } else if (M.type === "cargo") {
      M.t0 -= dt;
      M.msg = "Cargo " + Math.max(0, Math.round(M.cargo)) + "% · ⏱ " + Math.ceil(M.t0) + "s" + (g.P.car ? "" : " · get in a car");
      if (M.cargo <= 0) return "fail:Smashed. The cargo's ruined.";
      if (M.t0 <= 0) return "fail:Too slow — Moreno's people got there first.";
      if (g.P.car && near(M.tx, M.tz, 9) && Math.abs(g.P.car.speed) < 2) return "ok";
    } else if (M.type === "escape") {
      const at = near(M.sx, M.sz, 9), W = g.crime.S.wanted;
      M.hide = at && (W === 0 || g.crime.S.searching) ? M.hide + dt : 0;
      M.msg = at ? (W > 0 && !g.crime.S.searching ? "⚠️ They're right on you — lose them first" : "Lying low… " + Math.min(100, Math.round(M.hide / 4 * 100)) + "%") : W > 0 ? "★".repeat(W) + " · get to the safehouse" : "Get to the safehouse";
      if (M.hide > 4) { g.crime.reset(); return "ok"; }
    } else if (M.type === "boss") {
      const Y = g.gangs.YARD;
      if (!M.started && near(Y.x, Y.z, 70)) { M.started = true; g.gangs.startShowdown(); }
      M.msg = M.started ? "Take down Moreno" : "Get to the marina yard";
      if (((st.nem && st.nem.defeated) || 0) > M.d0) return "ok";
    }
    return null;
  }
  function cleanup() {
    if (!M) return;
    for (const c of M.cars) if (c.alive || c.group.parent) removeCar(c);
    if (M.list) g.gangs.dismiss(M.list);
    for (const p of guards) { p.hidden = true; p.x = 99999; p.aimT = 0; }
    for (const c of cones) if (c) c.visible = false;
    if (boat) boat.visible = false;
    if (yardLight) yardLight.visible = false;
    M = null;
  }

  // ---------------------------------------------------------------- the chapter flow
  function begin() {
    const ch = ACT2[idx()];
    S.state = "intro";
    ui.chapter(13 + idx(), ch.title);
    const go = () => { if (g.onStart) g.onStart(); setup(ch.type); S.state = "active"; };
    if (S.retry) { ui.toast("🔁 " + ch.title + " — again", 2); go(); }
    else ui.dialogue(ch.intro, go);
  }
  function complete() {
    const ch = ACT2[idx()];
    cleanup();
    const paid = ui.earn(ch.reward);
    ui.banner("MISSION PASSED", ch.title + "  ·  +$" + paid.toLocaleString());
    ui.sound("jingle", 1);
    S.state = "outro"; S.retry = false;
    ui.dialogue(ch.outro, () => { st.mi++; ui.save(); S.state = "wait"; S.t = 20; if (!live()) { S.state = "done"; ui.banner("PALM CITY IS YOURS", "Act Two complete — freeplay, forever", "THE END", 5); } });
  }
  function fail(why) {
    cleanup();
    ui.banner("MISSION FAILED", why, "", 3.2, "bad"); ui.sound("door", 0.6);
    S.state = "wait"; S.t = 5; S.retry = true;
  }
  function update(dt) {
    if (!live()) { if (M) cleanup(); return; }
    if (ui.talking()) return;
    if (S.state === "wait") {
      S.t -= dt;
      if (S.t <= 0) { if (g.busy && g.busy()) S.t = 3; else begin(); }
    } else if (S.state === "active" && M) {
      const res = run(dt);
      if (res === "ok") complete();
      else if (res && res.startsWith("fail:")) fail(res.slice(5));
    }
  }
  function objective() {
    if (!live() || !M || S.state !== "active") return null;
    const ch = ACT2[idx()], title = "Chapter " + (13 + idx()) + " · " + ch.title, base = ACT2_STEPS[ch.type];
    let x, z, rr = 6;
    if (M.type === "tail" || M.type === "escort") { x = M.D.c.x; z = M.D.c.z; rr = 4; }
    if (M.type === "chase") { if (M.drop) { x = M.drop.x; z = M.drop.z; } else { x = M.D.c.x; z = M.D.c.z; } rr = 4; }
    if (M.type === "defend") { x = M.cx; z = M.cz; rr = 10; }
    if (M.type === "stealth") { x = M.bx; z = M.bz; rr = 3; }
    if (M.type === "cargo") { x = M.tx; z = M.tz; }
    if (M.type === "escape") { x = M.sx; z = M.sz; rr = 8; }
    if (M.type === "boss") { x = g.gangs.YARD.x; z = g.gangs.YARD.z; rr = 10; }
    return { title, text: base + (M.msg ? " · " + M.msg : ""), x, z, r: rr, main: true };
  }
  return {
    update, objective, collide, targets, active: () => !!M,
    // the player's car hit something: fragile cargo feels it
    impact(n) { if (M && M.type === "cargo" && g.P.car && n > 2.5) { M.cargo -= (n - 2) * 3.2; ui.toast("📦 Cargo " + Math.max(0, Math.round(M.cargo)) + "%", 1); } },
    cars: () => (M ? M.cars : []),
    debugSkip: () => { if (S.state === "active") complete(); },
    debugStart: i => { cleanup(); st.mi = 12 + i; S.state = "wait"; S.t = 0; S.retry = true; },
    state: () => ({ ...S, type: M && M.type, msg: M && M.msg }),
    M: () => M,
  };
}
