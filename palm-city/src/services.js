// Palm City — the emergency services. Somebody goes down in the street, an ambulance comes: siren
// on, traffic pulling over, two paramedics out of the back to work on them. A car burns, a fire
// engine comes and the crew put it out with the hose. Then they pack up and drive off.
// Meanwhile, once the danger's passed, people drift over to look — and film it on their phones.
import * as THREE from "../vendor/three.module.js";
import { clamp, HALF, N, roadC, nearestRoad, lerpAngle } from "./world.js";
import { makeRoadDriver } from "./roaddriver.js";
import { carSpec } from "./cars.js";
import { randomLook, finishLook } from "./people.js";

const CREW_LOOK = {
  medical: { shirt: 0x2a6a4a, pants: 0x1e2a24 },
  fire: { shirt: 0x5a4a2a, pants: 0x3a3424 },
};
export function makeServices(scene, g) {
  // g: { crowd, combat, traffic, fx, collider, focus(), night(), siren(level, kind), gapAhead(c), inView(x, z) }
  const r = Math.random;
  const RD = makeRoadDriver(scene, g.collider, g.focus, g.gapAhead);
  const incidents = [], units = [];
  // ---- the crews: crowd people with a job to do ----
  const crewPool = [];
  function crewMember(kind) {
    let p = crewPool.find(q => q.hidden && !q.busy);
    if (!p) {
      p = { gang: true, svc: true, x: 99999, z: 0, yaw: 0, speed: 2, look: null, phase: 0, style: { stride: 1, arm: 0.8 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hidden: true };
      p.ai = crewAI; p.onRespawn = q => { q.hidden = true; q.x = 99999; q.busy = false; };
      g.crowd.people.push(p); crewPool.push(p);
    }
    p.look = finishLook(Object.assign(randomLook(r), CREW_LOOK[kind], { sleeveless: false, shorts: false }));
    p.busy = true; p.hidden = false; p.dead = false; p.knocked = 0; p.workT = 0; p.y = 0; p.fear = 0;
    return p;
  }
  function crewAI(p, dt) {
    if (p.hidden || !p.goal) return;
    const dx = p.goal.x - p.x, dz = p.goal.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.35) {
      p.yaw = lerpAngle(p.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
      const sp = p.goal.run ? 3.4 : 1.6;
      p.x += dx / d * Math.min(d, sp * dt); p.z += dz / d * Math.min(d, sp * dt);
      const q = g.collider.resolve(p.x, p.z, 0.35); p.x = q.x; p.z = q.z;
      p.amt = p.goal.run ? 1.6 : 0.9; p.workT = 0;
    } else {
      p.amt = 0;
      if (p.lookAt) p.yaw = lerpAngle(p.yaw, Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z), Math.min(1, dt * 6));
      if (p.goal.work) p.workT = (p.workT || 0) + dt;
    }
    p.phase += dt * 2.6 * (p.amt || 0.2);
  }

  // ---- incidents ----
  function report(kind, x, z, info = {}) {
    if (!isFinite(x)) return;
    let inc = incidents.find(i => i.kind === kind && !i.done && (i.x - x) ** 2 + (i.z - z) ** 2 < 25 * 25);
    if (!inc) { inc = { kind, x, z, t: 0, bodies: [], wrecks: [], unit: null, done: false, gawk: 0 }; incidents.push(inc); }
    if (info.body && !inc.bodies.includes(info.body)) inc.bodies.push(info.body);
    if (info.wreck && !inc.wrecks.includes(info.wreck)) inc.wrecks.push(info.wreck);
  }
  // a spot on the road beside the incident, and the junction the vehicle aims for first
  function curbSpot(x, z) {
    const ri = nearestRoad(x), rj = nearestRoad(z), ax = roadC(ri), az = roadC(rj);
    return Math.abs(x - ax) < Math.abs(z - az) ? { x: ax + Math.sign(x - ax || 1) * 4.6, z, node: [ri, nearestRoad(z)] } : { x, z: az + Math.sign(z - az || 1) * 4.6, node: [nearestRoad(x), rj] };
  }
  function dispatch(inc) {
    const spot = curbSpot(inc.x, inc.z), F = g.focus();
    // they come from somewhere out of sight, a few blocks off
    let best = null;
    for (let k = 0; k < 12; k++) {
      const i = clamp(spot.node[0] + ((r() * 7) | 0) - 3, 0, N), j = clamp(spot.node[1] + ((r() * 7) | 0) - 3, 0, N - 1);
      const x = roadC(i), z = roadC(j), d = Math.hypot(x - inc.x, z - inc.z);
      if (d < 120 || d > 260) continue;
      if (g.inView && g.inView(x, z) && Math.hypot(x - F.x, z - F.z) < 180) continue;
      best = [x, z]; break;
    }
    if (!best) { const a = r() * 6.28; best = [roadC(nearestRoad(clamp(inc.x + Math.cos(a) * 180, -HALF + 20, HALF - 20))), roadC(nearestRoad(clamp(inc.z + Math.sin(a) * 180, -HALF + 20, HALF - 20)))]; }
    const type = inc.kind === "fire" ? "firetruck" : "ambulance";
    const D = RD.create(type, carSpec(type).paint, best[0], best[1], Math.atan2(inc.x - best[0], inc.z - best[1]), "goto", spot.node, 21);
    D.spot = { x: spot.x, z: spot.z }; D.c.siren = true; D.c.svc = true;
    const U = { D, inc, kind: inc.kind, stage: "drive", t: 0, crew: [] };
    inc.unit = U; units.push(U);
  }
  function lamps(U) { return c => c.setLamps(false, g.night() > 0.3 ? 1 : 0, U.stage === "leave" ? 0 : 4, false); }
  function finish(U) {
    const inc = U.inc;
    if (inc.kind === "medical") for (const b of inc.bodies) { if (b.knocked > 0) b.knocked = Math.min(b.knocked, 0.05); b.treated = true; }   // taken away / back on their feet
    else for (const w of g.combat.wrecks) if ((w.x - inc.x) ** 2 + (w.z - inc.z) ** 2 < 15 * 15) w.out = true;
    inc.done = true;
  }
  function updateUnit(U, dt) {
    const D = U.D, c = D.c; U.t += dt;
    if (U.stage === "drive") {
      RD.drive(D, dt, lamps(U));
      const dSpot = Math.hypot(D.spot.x - c.x, D.spot.z - c.z);
      // stuck somewhere out of sight for too long: it gets there anyway
      if (U.t > 70 && !(g.inView && g.inView(c.x, c.z))) { c.x = D.spot.x; c.z = D.spot.z; c.vx = c.vz = 0; D.arrived = true; }
      if (D.arrived && dSpot < 4.5 && Math.abs(c.speed) < 1.2) {
        U.stage = "work"; U.t = 0;
        const inc = U.inc, rx = Math.cos(c.h), rz = -Math.sin(c.h), bx = -Math.sin(c.h), bz = -Math.cos(c.h);
        for (let k = 0; k < 2; k++) {
          const p = crewMember(U.kind); p.x = c.x + bx * (c.spec.len / 2 + 0.6) + rx * (k ? 0.6 : -0.6); p.z = c.z + bz * (c.spec.len / 2 + 0.6) + rz * (k ? 0.6 : -0.6);
          const tgt = U.kind === "medical" ? (inc.bodies[k % Math.max(1, inc.bodies.length)] || inc) : (inc.wrecks[0] || inc);
          const a = r() * 6.28, R = U.kind === "medical" ? 0.9 : 6.5;
          p.goal = { x: tgt.x + Math.cos(a + k * 2.4) * R, z: tgt.z + Math.sin(a + k * 2.4) * R, run: true, work: U.kind === "medical" };
          p.lookAt = { x: tgt.x, z: tgt.z };
          U.crew.push(p);
        }
      }
    } else if (U.stage === "work") {
      RD.drive(D, dt, lamps(U));                         // parked, lights still going
      const there = U.crew.filter(p => !p.hidden && Math.hypot(p.goal.x - p.x, p.goal.z - p.z) < 0.6);
      if (U.kind === "fire") for (const p of there) {        // the hose: a jet of spray onto the burning wreck
        const tx = p.lookAt.x, tz = p.lookAt.z, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
        if (r() < dt * 30 && g.fx.hose) g.fx.hose(p.x + dx / d * 0.6, 1.1, p.z + dz / d * 0.6, dx / d, dz / d, d);
      }
      if (there.length) U.workT = (U.workT || 0) + dt;
      if ((U.workT || 0) > (U.kind === "fire" ? 7 : 8) || U.t > 45) {
        finish(U); U.stage = "pack"; U.t = 0;
        for (const p of U.crew) { p.goal = { x: c.x - Math.sin(c.h) * (c.spec.len / 2 + 0.6), z: c.z - Math.cos(c.h) * (c.spec.len / 2 + 0.6), run: false }; p.workT = 0; }
      }
    } else if (U.stage === "pack") {
      RD.drive(D, dt, lamps(U));
      const back = U.crew.every(p => p.hidden || Math.hypot(p.goal.x - p.x, p.goal.z - p.z) < 0.8);
      if (back || U.t > 25) {
        for (const p of U.crew) { p.hidden = true; p.x = 99999; p.busy = false; p.goal = null; }
        U.crew = []; U.stage = "leave"; U.t = 0; c.siren = false; D.spot = null; RD.retarget(D, null, "wander"); D.want = 13;
      }
    } else if (U.stage === "leave") {
      RD.drive(D, dt, lamps(U));
      const F = g.focus();
      if (U.t > 60 || Math.hypot(c.x - F.x, c.z - F.z) > 260) { scene.remove(c.group); c.alive = false; U.gone = true; }
    }
  }

  // ---- onlookers: when it's calm, people come and look (and film) ----
  function gawkers(inc, dt) {
    if (inc.gawk > 0 || inc.t < 6 || inc.t > 50) return;
    const F = g.focus();
    if ((F.x - inc.x) ** 2 + (F.z - inc.z) ** 2 > 90 * 90) return;
    inc.gawk = 1;
    let n = 0;
    for (const p of g.crowd.people) {
      if (n >= 6) break;
      if (p.hidden || p.gang || p.beach || p.park || p.fixed || p.ai || p.knocked > 0 || p.fear > 0 || p.sit) continue;
      const d2 = (p.x - inc.x) ** 2 + (p.z - inc.z) ** 2;
      if (d2 > 40 * 40 || d2 < 4) continue;
      const a = Math.atan2(p.x - inc.x, p.z - inc.z) + (r() - 0.5) * 0.6, R = inc.kind === "fire" ? 9 + r() * 3 : 3.2 + r() * 2;
      p.gawk = { x: inc.x + Math.sin(a) * R, z: inc.z + Math.cos(a) * R, fx: inc.x, fz: inc.z, t: 14 + r() * 14, film: r() < 0.65 };
      p.ai = gawkAI; n++;
    }
  }
  function gawkAI(p, dt) {
    const G = p.gawk;
    if (!G || p.fear > 0 || (G.t -= dt) <= 0) { p.ai = null; p.gawk = null; p.phoneT = 0; g.crowd.release(p); return; }
    const dx = G.x - p.x, dz = G.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.4) {
      p.yaw = lerpAngle(p.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
      p.x += dx / d * Math.min(d, 1.4 * dt); p.z += dz / d * Math.min(d, 1.4 * dt);
      const q = g.collider.resolve(p.x, p.z, 0.35); p.x = q.x; p.z = q.z;
      p.amt = 0.85;
    } else {
      p.amt = 0; p.yaw = lerpAngle(p.yaw, Math.atan2(G.fx - p.x, G.fz - p.z), Math.min(1, dt * 4));
      if (G.film) p.phoneT = 1;                         // phone up, recording
    }
    p.phase += dt * 2.4 * (p.amt || 0.2);
  }

  function update(dt) {
    const F = g.focus();
    for (const inc of incidents) {
      inc.t += dt;
      // the injured and the dead stay where they fell until somebody comes for them
      if (inc.kind === "medical" && !inc.done) for (const b of inc.bodies) if (b.knocked > 0 && b.knocked < 3 && b.dead && inc.t < 90) b.knocked = 3;
      if (!inc.unit && !inc.done && inc.t > (inc.kind === "fire" ? 5 : 7) && units.filter(u => !u.gone && u.kind === inc.kind).length < 2 && Math.hypot(F.x - inc.x, F.z - inc.z) < 220) dispatch(inc);
      gawkers(inc, dt);
      if (inc.t > 120 || (!inc.unit && Math.hypot(F.x - inc.x, F.z - inc.z) > 320)) inc.done = true;
    }
    for (let i = incidents.length - 1; i >= 0; i--) if (incidents[i].done && (!incidents[i].unit || incidents[i].unit.gone || incidents[i].unit.stage === "leave")) incidents.splice(i, 1);
    for (const U of units) if (!U.gone) updateUnit(U, dt);
    for (let i = units.length - 1; i >= 0; i--) if (units[i].gone) units.splice(i, 1);
    // the siren you can hear: the nearest one still on its way
    let lvl = 0;
    for (const U of units) if (U.stage === "drive") { const d = Math.hypot(U.D.c.x - F.x, U.D.c.z - F.z); lvl = Math.max(lvl, 1 - d / 220); }
    sirenLvl = lvl;
  }
  let sirenLvl = 0;
  return {
    report, update,
    // what traffic should pull over for: vehicles running with sirens (position + heading)
    sirens: () => units.filter(U => U.stage === "drive" && U.D.c.alive).map(U => U.D.c),
    vehicles: () => units.filter(U => !U.gone && U.D.c.alive).map(U => U.D.c),
    units, incidents, sirenLevel: () => sirenLvl,
  };
}
