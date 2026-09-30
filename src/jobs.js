// Palm City — on-demand jobs from the phone, and hired muscle.
//   rampage  wreck 5 cars in 60 s
//   courier  a timed cross-town delivery
//   bounty   a marked car somewhere in traffic — destroy it
//   turf     head to the nearest gang turf and take it
//   muscle   $1500: an armed ally who follows you and shoots anyone hostile
import { randomLook } from "./people.js";
import { clamp, HALF, roadC, nearestRoad, mulberry32 } from "./world.js";

export const JOBS = [
  { id: "rampage", label: "💥 Rampage", desc: "Wreck 5 cars in 60 seconds" },
  { id: "courier", label: "📦 Courier", desc: "Cross-town delivery against the clock" },
  { id: "bounty", label: "🎯 Bounty", desc: "A marked car is in traffic — destroy it" },
  { id: "turf", label: "🚩 Turf Takeover", desc: "Hit the nearest gang turf and take it" },
];

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
    } else if (id === "turf") {
      const G = g.gangs.GANGS.filter(G => !g.st.turf[G.id]).sort((a, b) => ((a.x - F.x) ** 2 + (a.z - F.z) ** 2) - ((b.x - F.x) ** 2 + (b.z - F.z) ** 2))[0];
      if (!G) { g.toast("Every turf in the city is already yours"); return false; }
      job = { id, G, t: 9999 }; g.banner("TURF TAKEOVER", "Wipe out the " + G.name, "JOB", 2.4);
    }
    g.sound("blip", 0.8);
    return true;
  }
  function done(msg, pay) {
    if (job && job.car) job.car.marked = false;
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
    }
  }
  function objective() {
    if (!job) return null;
    const s = Math.max(0, Math.ceil(job.t));
    if (job.id === "rampage") return { title: "JOB · Rampage", text: "Wrecked " + job.n + "/5 · " + s + "s" };
    if (job.id === "courier") return { title: "JOB · Courier", text: "Deliver the package · " + s + "s", x: job.x, z: job.z, r: 6, event: true };
    if (job.id === "bounty") return { title: "JOB · Bounty", text: "Destroy the marked car · " + s + "s", x: job.car.x, z: job.car.z, r: 3, event: true };
    if (job.id === "turf") return { title: "JOB · Turf Takeover", text: "Wipe out the " + job.G.name + " (" + job.G.kills + "/" + job.G.need + ")", x: job.G.x, z: job.G.z, r: 8, event: true };
    return null;
  }
  return { start, update, objective, hire, active: () => !!job, allies, JOBS, cancel: () => { if (job) done("Job cancelled", 0); } };
}
