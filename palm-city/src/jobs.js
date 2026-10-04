// Palm City — on-demand jobs from the phone, and hired muscle.
//   rampage  wreck 5 cars in 60 s
//   courier  a timed cross-town delivery
//   bounty   a marked car somewhere in traffic — destroy it
//   turf     head to the nearest gang turf and take it
//   muscle   $1500: an armed ally who follows you and shoots anyone hostile
import { randomLook } from "./people.js";
import { clamp, HALF, N, roadC, nearestRoad, mulberry32, blockMin, BLOCK, CELL } from "./world.js";
import { PLACES } from "./places.js";

export const JOBS = [
  { id: "rampage", label: "💥 Rampage", desc: "Wreck 5 cars in 60 seconds" },
  { id: "courier", label: "📦 Courier", desc: "Cross-town delivery against the clock" },
  { id: "bounty", label: "🎯 Bounty", desc: "A marked car is in traffic — destroy it" },
  { id: "turf", label: "🚩 Turf Takeover", desc: "Hit the nearest gang turf and take it" },
  { id: "vigil", label: "🚨 Vigilante", desc: "Run down three crooks — each one pays more" },
  { id: "medic", label: "🚑 Paramedic", desc: "Rush patients to Palm General before it's too late" },
  { id: "getaway", label: "🏎 Getaway Driver", desc: "Pick up a crew mid-robbery, lose the cops, reach the hideout" },
  { id: "hit", label: "🎯 The Hit", desc: "A marked man and his bodyguards — take him out" },
];
const STORES = ["pizza", "burger", "gallery", "prints", "clothes", "barber", "arcade", "club"];

export function makeJobs(g) {
  // g: { focus(), traffic, crowd, gangs, crime, combat, fx, toast, banner, sound, earn, save, collider, st }
  const r = mulberry32(0x70B5);
  let job = null;
  const allies = [];
  function spot(x, z, a0, a1) {
    const a = r() * 6.283, d = a0 + r() * (a1 - a0);
    const px = clamp(x + Math.cos(a) * d, -HALF + 20, HALF - 20), pz = clamp(z + Math.sin(a) * d, -HALF + 20, HALF - 20);
    return r() < 0.5 ? [roadC(nearestRoad(px)), pz] : [px, roadC(nearestRoad(pz))];
  }
  function start(id) {
    if (job) { g.toast("Finish your current job first"); return false; }
    const F = g.focus();
    if (id === "rampage") { job = { id, t: 60, n: 0, goal: 5, w0: g.combat.S.wrecked || 0 }; g.banner("RAMPAGE", "Wreck 5 cars in 60 seconds", "JOB", 2.4); }
    else if (id === "courier") { const [x, z] = spot(F.x, F.z, 220, 380); job = { id, t: 70, x, z }; g.banner("COURIER", "Get the package across town", "JOB", 2.4); }
    else if (id === "bounty") {
      const cands = g.traffic.cars.filter(c => c.alive && (c.x - F.x) ** 2 + (c.z - F.z) ** 2 > 90 * 90 && (c.x - F.x) ** 2 + (c.z - F.z) ** 2 < 300 * 300);
      if (!cands.length) { g.toast("No marks in range right now"); return false; }
      const c = cands[(r() * cands.length) | 0]; c.marked = true; c.hp = 90;
      job = { id, t: 120, car: c }; g.banner("BOUNTY", "Destroy the marked car", "JOB", 2.4);
    } else if (id === "vigil") {
      job = { id, round: 0, t: 60 }; spawnCrook(); g.banner("VIGILANTE", "Crooks on the loose — catch them", "JOB", 2.4);
    } else if (id === "medic") {
      const [x, z] = spot(F.x, F.z, 120, 220); job = { id, stage: 0, x, z, t: 50, saved: 0 }; g.banner("PARAMEDIC", "Pick up the patient, get them to Palm General", "JOB", 2.4);
    } else if (id === "getaway") {
      const k = STORES.filter(k => PLACES[k] && (PLACES[k].x - F.x) ** 2 + (PLACES[k].z - F.z) ** 2 > 80 * 80).sort(() => r() - 0.5)[0] || STORES[0], P0 = PLACES[k];
      // the kerb in front of the store, where a car can pull up
      job = { id, stage: 0, t: 90, x: P0.x + Math.sin(P0.face) * 4.5, z: P0.z + Math.cos(P0.face) * 4.5, store: P0.label || k };
      g.banner("GETAWAY", "The crew's hitting " + job.store + " — be out front to pick them up", "JOB", 2.6);
    } else if (id === "hit") {
      const [x, z] = sidewalk(F.x, F.z, 140, 240);
      job = { id, t: 150, x, z, alarm: false };
      spawnHit(x, z);
      g.banner("THE HIT", "Your mark's walking the city with two bodyguards. He doesn't get home tonight.", "JOB", 2.8);
    } else if (id === "turf") {
      const G = g.gangs.GANGS.filter(G => !g.st.turf[G.id]).sort((a, b) => ((a.x - F.x) ** 2 + (a.z - F.z) ** 2) - ((b.x - F.x) ** 2 + (b.z - F.z) ** 2))[0];
      if (!G) { g.toast("Every turf in the city is already yours"); return false; }
      job = { id, G, t: 9999 }; g.banner("TURF TAKEOVER", "Wipe out the " + G.name, "JOB", 2.4);
    }
    g.sound("blip", 0.8);
    return true;
  }
  // a fleeing crook (a crowd member with a runner brain)
  function spawnCrook() {
    const F = g.focus(), [x, z] = spot(F.x, F.z, 70, 130);
    const look = Object.assign(randomLook(r), { shirt: 0x1a1a1a, pants: 0x1a1a1a });
    const p = { gang: true, x, z, yaw: 0, speed: 5, look, phase: 0, style: { stride: 1.1, arm: 1.2 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 40 };
    p.ai = (q, dt) => {
      const F2 = g.focus(), dx = q.x - F2.x, dz = q.z - F2.z, d = Math.hypot(dx, dz) || 1;
      if (d < 70) { q.yaw = Math.atan2(dx, dz) + Math.sin(q.phase * 0.2) * 0.6; const sp = 5 + job.round * 0.6; q.x += Math.sin(q.yaw) * sp * dt; q.z += Math.cos(q.yaw) * sp * dt; q.amt = 2; }
      else q.amt = 0;
      const res = g.collider.resolve(q.x, q.z, 0.4); q.x = res.x; q.z = res.z;
      q.phase += dt * 3.2;
    };
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    g.crowd.people.push(p); job.crook = p;
  }
  // a spot on a block's sidewalk ring, some way off
  function sidewalk(x, z, a0, a1) {
    for (let k = 0; k < 20; k++) {
      const a = r() * 6.283, d = a0 + r() * (a1 - a0);
      const px = clamp(x + Math.cos(a) * d, -HALF + 30, HALF - 30), pz = clamp(z + Math.sin(a) * d, -HALF + 30, HALF - 30);
      const i = clamp(Math.floor((px + HALF) / CELL), 0, N - 1), j = clamp(Math.floor((pz + HALF) / CELL), 0, N - 2);
      const x0 = blockMin(i) + 2.2, z0 = blockMin(j) + 2.2, L = BLOCK - 4.4, t = r() * 4, side = Math.floor(t), f = t - side;
      const hx = side === 0 ? x0 + f * L : side === 1 ? x0 + L : side === 2 ? x0 + L - f * L : x0;
      const hz = side === 0 ? z0 : side === 1 ? z0 + f * L : side === 2 ? z0 + L : z0 + L - f * L;
      if (!g.collider.resolve(hx, hz, 0.5).hit) return [hx, hz];
    }
    return spot(x, z, a0, a1);
  }
  // the hit: a man in a red shirt strolling his block, two heavies at his shoulders. Get close (or
  // start shooting) and he runs while they open up on you.
  const hitCast = [];
  function hitPerson(k) {
    if (hitCast[k]) return hitCast[k];
    const boss = k === 0;
    const look = Object.assign(randomLook(r), boss ? { shirt: 0xb81e26, pants: 0xe8e0cc, sleeveless: false, shorts: false, bald: false, h: 1.04 }
      : { shirt: 0x141518, pants: 0x101114, sleeveless: false, shorts: false, bald: r() < 0.5, h: 1.05, bulk: 1.18 });
    const p = { gang: true, hitman: true, x: 99999, z: 0, yaw: 0, speed: 1.3, look, phase: 0, style: { stride: 1, arm: 0.8 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 60, hidden: true, shootCD: 1 };
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    p.ai = boss ? markAI : guardAI;
    if (!boss) p.weapon = "pistol";
    g.crowd.people.push(p); hitCast[k] = p;
    return p;
  }
  function spawnHit(x, z) {
    for (let k = 0; k < 3; k++) {
      const p = hitPerson(k);
      p.hidden = false; p.dead = false; p.knocked = 0; p.y = 0; p.hp = k ? 90 : 60; p.x = x + (k ? (k === 1 ? -1.2 : 1.2) : 0); p.z = z - (k ? 1.2 : 0); p.yaw = r() * 6.28; p.shootCD = 1 + r(); p.aimT = 0;
      p.walkT = 0;
    }
  }
  function markAI(p, dt) {
    if (p.hidden || !job || job.id !== "hit") return;
    const F = g.focus(), dx = p.x - F.x, dz = p.z - F.z, d = Math.hypot(dx, dz) || 1;
    if (d < 22 || p.hp < 60) job.alarm = true;
    let sp;
    if (job.alarm) { p.yaw = Math.atan2(dx, dz) + Math.sin(p.phase * 0.25) * 0.5; sp = 4.6; p.amt = 2; }   // run for it
    else {                                                                 // a stroll round the block
      p.walkT -= dt; if (p.walkT <= 0) { p.walkT = 4 + r() * 5; p.yaw += (r() < 0.5 ? 1 : -1) * Math.PI / 2 * (r() < 0.7 ? 1 : 0); }
      sp = 1.25; p.amt = 1;
    }
    const ox = p.x, oz = p.z;
    p.x += Math.sin(p.yaw) * sp * dt; p.z += Math.cos(p.yaw) * sp * dt;
    const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z;
    if (q.hit && !job.alarm) p.yaw += Math.PI / 2;
    if (Math.abs(p.x) > HALF - 10 || Math.abs(p.z) > HALF - 10) { p.x = ox; p.z = oz; p.yaw += Math.PI; }
    p.phase += dt * 2.6 * p.amt;
  }
  function guardAI(p, dt) {
    if (p.hidden || !job || job.id !== "hit") return;
    const M = hitCast[0], F = g.focus(), dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1;
    if (job.alarm && d < 40) {
      p.yaw = Math.atan2(dx, dz); p.aimT = 0.5;
      if (d > 9) { p.x += dx / d * 3.2 * dt; p.z += dz / d * 3.2 * dt; p.amt = 1.4; } else p.amt = 0;
      p.shootCD -= dt; if (p.shotT > 0) p.shotT -= dt;
      if (p.shootCD <= 0 && d < 34 && g.crime.los(p.x, p.z, F.x, F.z)) {
        p.shootCD = 0.9 + r() * 0.8; p.shotT = 0.12;
        g.fx.muzzle(p.x + dx / d * 0.6, 1.35, p.z + dz / d * 0.6, dx / d, dz / d);
        g.fx.tracer(p.x, 1.35, p.z, F.x + (r() - 0.5) * 2, 1.1, F.z + (r() - 0.5) * 2); g.sound("gun", 0.4);
        if (r() < clamp(0.45 - d * 0.009 - (F.speed > 6 ? 0.15 : 0), 0.05, 0.5)) g.crime.hurt(F.car ? 5 : 8);
      }
    } else {
      // at his shoulder
      p.aimT = 0;
      const k = hitCast.indexOf(p) === 1 ? -1 : 1, tx = M.x + Math.cos(M.yaw) * 1.2 * k - Math.sin(M.yaw) * 1.1, tz = M.z - Math.sin(M.yaw) * 1.2 * k - Math.cos(M.yaw) * 1.1;
      const ex = tx - p.x, ez = tz - p.z, e = Math.hypot(ex, ez);
      if (e > 0.3) { const sp = Math.min(e * 2, 5); p.x += ex / e * sp * dt; p.z += ez / e * sp * dt; p.yaw = Math.atan2(ex, ez); p.amt = sp > 2 ? 2 : 1; } else { p.amt = 0; p.yaw = M.yaw; }
    }
    const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z;
    p.phase += dt * 2.6 * (p.amt || 0.3);
  }
  function hitClear() { for (const p of hitCast) { p.hidden = true; p.x = 99999; p.aimT = 0; } }
  function done(msg, pay) {
    if (job && job.car) job.car.marked = false;
    if (job && job.id === "hit") hitClear();
    job = null;
    if (pay) { const got = g.earn(pay); g.banner("JOB DONE", msg + " · +$" + got.toLocaleString(), "", 2.8); g.sound("cash", 1); g.save(); }
    else { g.toast(msg); g.sound("door", 0.4); }
  }
  // hired muscle: a crowd member with a pistol and your back
  function hire() {
    if (g.st.money < 1500) return "You need $" + Math.ceil(1500 - g.st.money).toLocaleString() + " more";
    if (allies.filter(a => !a.hidden && a.knocked <= 0).length >= 2) return "You've already got two guys";
    g.st.money -= 1500;
    const F = g.focus();
    const look = Object.assign(randomLook(r), { shirt: 0x2a2a2c, pants: 0x1e1e22, sleeveless: false, shorts: false });
    const p = { gang: true, ally: true, x: F.x + 2, z: F.z + 2, yaw: 0, speed: 3, look, phase: 0, style: { stride: 1, arm: 0.8 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 150, shootCD: 1 };
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    p.onDeath = () => g.toast("💀 Your muscle went down");
    p.ai = (q, dt) => {
      const Fp = g.focus();
      const dx = Fp.x - q.x, dz = Fp.z - q.z, d = Math.hypot(dx, dz) || 1;
      if (d > 120) { q.x = Fp.x - 3; q.z = Fp.z - 3; }           // catches up when you drive off
      // anyone hostile close by?
      let tgt = null, td = 30 * 30;
      for (const o of g.gangs.members) {
        if (o.hidden || o.knocked > 0 || o.ally) continue;
        const hostile = o.goon || o.crew || (o.G && !g.st.turf[o.G.id]);
        const e = (o.x - q.x) ** 2 + (o.z - q.z) ** 2;
        if (hostile && e < td) { td = e; tgt = o; }
      }
      if (tgt) {
        q.yaw = Math.atan2(tgt.x - q.x, tgt.z - q.z); q.amt = 0;
        q.shootCD -= dt;
        if (q.shootCD <= 0 && g.crime.los(q.x, q.z, tgt.x, tgt.z)) {
          q.shootCD = 0.7 + r() * 0.6;
          g.fx.muzzle(q.x + Math.sin(q.yaw) * 0.6, 1.35, q.z + Math.cos(q.yaw) * 0.6, Math.sin(q.yaw), Math.cos(q.yaw));
          g.fx.tracer(q.x, 1.35, q.z, tgt.x, 1.1, tgt.z); g.sound("gun", 0.35);
          if (r() < 0.55) { tgt.hp -= 30; if (tgt.hp <= 0) g.crowd.knock(tgt, Math.sin(q.yaw) * 3, 1.5, Math.cos(q.yaw) * 3, true); }
        }
      } else if (d > 4) {
        q.yaw = Math.atan2(dx, dz); const sp = d > 12 ? 5.5 : 2.8;
        q.x += Math.sin(q.yaw) * sp * dt; q.z += Math.cos(q.yaw) * sp * dt; q.amt = d > 12 ? 2 : 1;
        const res = g.collider.resolve(q.x, q.z, 0.4); q.x = res.x; q.z = res.z;
      } else q.amt = 0;
      q.phase += dt * 2.8 * (q.amt || 0.2);
    };
    g.crowd.people.push(p); allies.push(p);
    return null;
  }
  function update(dt) {
    if (!job) return;
    const F = g.focus();
    job.t -= dt;
    if (job.id === "rampage") {
      job.n = (g.combat.S.wrecked || 0) - job.w0;
      if (job.n >= job.goal) return done("Rampage complete", 2000);
      if (job.t <= 0) return done("⏱ Rampage over — " + job.n + "/5 wrecked", 0);
    } else if (job.id === "courier") {
      if ((F.x - job.x) ** 2 + (F.z - job.z) ** 2 < 64) return done("Package delivered", 900);
      if (job.t <= 0) return done("⏱ Too slow — the client walked", 0);
    } else if (job.id === "bounty") {
      if (!job.car.alive) return done("Mark destroyed", 1500);
      if (job.t <= 0) return done("💨 The mark got away", 0);
    } else if (job.id === "turf") {
      if (g.st.turf[job.G.id]) return done("Turf taken", 1000);
    } else if (job.id === "vigil") {
      const c = job.crook;
      if (c.knocked > 0 || (F.x - c.x) ** 2 + (F.z - c.z) ** 2 < (F.car ? 9 : 2.5)) {
        if (c.knocked <= 0) g.crowd.knock(c, 0, 2, 0, false);
        c.onRespawn(c); job.round++;
        const got = g.earn(250 * job.round); g.toast("🚨 Crook busted · +$" + got, 1.6); g.sound("cash", 0.7);
        if (job.round >= 3) return done("Streets are safer", 750);
        job.t = 60; spawnCrook();
      } else if (job.t <= 0) { c.onRespawn(c); return done("💨 The crook got away", 0); }
    } else if (job.id === "getaway") {
      const W = g.crime.S.wanted;
      if (job.stage === 0) {
        if (F.car && (F.x - job.x) ** 2 + (F.z - job.z) ** 2 < 10 * 10 && F.car.speed < 3) {
          job.stage = 1; job.t = 200;
          g.crime.addCrime(Math.max(1, 3 - W));
          const [hx, hz] = spot(F.x, F.z, 260, 420); job.hx = hx; job.hz = hz;
          g.banner("GO GO GO!", "The crew's in and the alarm's going — lose the cops", "GETAWAY", 2.4); g.sound("door", 0.9);
        } else if (job.t <= 0) return done("⏱ You left them standing — the crew's furious", 0);
      } else {
        if (!F.car && job.stage >= 1 && !job.warned) { job.warned = true; g.toast("🚗 They need a car — get back behind the wheel", 2.5); }
        if (F.car) job.warned = false;
        if (job.stage === 1 && W === 0) { job.stage = 2; job.x = job.hx; job.z = job.hz; g.toast("🟢 Heat's off — get them to the hideout", 3); g.sound("blip", 0.8); }
        if (job.stage === 2 && W > 0) { job.stage = 1; g.toast("🚨 They're back on you — shake them first", 2.5); }
        if (job.stage === 2 && F.car && (F.x - job.x) ** 2 + (F.z - job.z) ** 2 < 10 * 10) return done("The crew's home free · your cut", 2500);
        if (job.t <= 0) return done("⏱ The crew bailed on foot", 0);
      }
    } else if (job.id === "hit") {
      const M = hitCast[0];
      if (M.dead || (M.knocked > 0 && M.hp <= 0)) { g.crime.addCrime(2); return done("The mark is down", 2200); }
      if (job.t <= 0) return done("💨 The mark made it home", 0);
    } else if (job.id === "medic") {
      if (job.stage === 0 && F.car && (F.x - job.x) ** 2 + (F.z - job.z) ** 2 < 64 && F.car.speed < 4) { job.stage = 1; job.t = 60; const H = g.hospital(); job.x = H.x; job.z = H.z; g.toast("🚑 Patient aboard — rush to Palm General!"); g.sound("blip", 0.8); }
      else if (job.stage === 1 && (F.x - job.x) ** 2 + (F.z - job.z) ** 2 < 100) {
        job.saved++; const got = g.earn(300 + job.saved * 150); g.toast("🚑 Patient saved · +$" + got); g.sound("cash", 0.8);
        if (job.saved >= 3) return done("Three lives saved", 800);
        const [x, z] = spot(F.x, F.z, 120, 220); job.stage = 0; job.x = x; job.z = z; job.t = 50;
      }
      if (job.t <= 0) return done("💀 The patient couldn't wait", 0);
    }
  }
  function objective() {
    if (!job) return null;
    const s = Math.max(0, Math.ceil(job.t));
    if (job.id === "rampage") return { title: "JOB · Rampage", text: "Wrecked " + job.n + "/5 · " + s + "s" };
    if (job.id === "courier") return { title: "JOB · Courier", text: "Deliver the package · " + s + "s", x: job.x, z: job.z, r: 6, event: true };
    if (job.id === "bounty") return { title: "JOB · Bounty", text: "Destroy the marked car · " + s + "s", x: job.car.x, z: job.car.z, r: 3, event: true };
    if (job.id === "vigil") return { title: "JOB · Vigilante", text: "Catch crook " + (job.round + 1) + "/3 · " + s + "s", x: job.crook.x, z: job.crook.z, r: 3, event: true };
    if (job.id === "medic") return { title: "JOB · Paramedic", text: (job.stage ? "Rush the patient to Palm General" : "Pick up the patient (in a car)") + " · " + s + "s · " + job.saved + "/3 saved", x: job.x, z: job.z, r: 6, event: true };
    if (job.id === "getaway") return { title: "JOB · Getaway", text: (job.stage === 0 ? "Pull up outside " + job.store : job.stage === 1 ? "Lose the cops!" : "Get the crew to the hideout") + " · " + s + "s", x: job.stage === 1 ? undefined : job.x, z: job.stage === 1 ? undefined : job.z, r: 6, event: true };
    if (job.id === "hit") { const M = hitCast[0]; return { title: "JOB · The Hit", text: (job.alarm ? "He's running — don't lose him" : "Find the man in the red shirt") + " · " + s + "s", x: M.x, z: M.z, r: 3, event: true }; }
    if (job.id === "turf") return { title: "JOB · Turf Takeover", text: "Wipe out the " + job.G.name + " (" + job.G.kills + "/" + job.G.need + ")", x: job.G.x, z: job.G.z, r: 8, event: true };
    return null;
  }
  return { start, update, objective, hire, active: () => !!job, allies, JOBS, cancel: () => { if (job) done("Job cancelled", 0); } };
}
