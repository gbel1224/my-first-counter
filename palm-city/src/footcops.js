// Palm City — officers on foot. When you're running and a cruiser can't get to you (parked cars along
// the kerb, you've gone up the sidewalk or into the park), it stops and an officer gets out after you:
// faster than a jog, cuffs you if he catches you at low heat, stops and shoots from three stars. Get
// into a car or far enough away and they run back to their cruisers. They're eyes for the search too —
// with the same cones as the cars once they've lost you.
import { clamp } from "./world.js";
import { randomLook } from "./people.js";
import { CONE_R, CONE_HALF, CONE_NEAR } from "./crime.js";

const MAX = 4, RUN = 7.4, CATCH = 1.6;           // (a touch quicker than your sprint: out-running them takes corners and cover)

export function makeFootCops(g) {
  // g: { crowd, crime, collider, focus(), fx, sound, paused(), inView(x, z), tackle(officer) }
  const r = Math.random;
  const officers = [];
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (let k = 0; k < MAX; k++) {
    const look = Object.assign(randomLook(r), { shirt: 0x1c2a4a, pants: 0x161a26, sleeveless: false, shorts: false, long: false, hat: false });
    const p = { beach: false, gang: true, cop: true, foot: true, x: 99999, z: 0, yaw: 0, speed: 0, look, phase: 0, style: { stride: 1.1, arm: 1 },
      pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 70, shootCD: 1.5, hidden: true, home: { x: 0, z: 0 }, weapon: "pistol",
      car: null, mode: "off", sees: false, losCD: 0 };
    p.ai = (q, dt) => brain(q, dt);
    p.onDeath = () => { g.crime.addCrime(1); q0(p); };
    p.onRespawn = q => q0(q);
    g.crowd.people.push(p); officers.push(p);
  }
  function q0(p) { p.hidden = true; p.x = 99999; p.mode = "off"; p.car = null; p.aimT = 0; p.amt = 0; p.sees = false; }

  // one gets out of cruiser u, door side, and comes after you
  function deploy(u) {
    const p = officers.find(o => o.mode === "off" && !o.dead); if (!p) return;
    const rx = Math.cos(u.h), rz = -Math.sin(u.h);
    let x = u.x - rx * 1.6, z = u.z - rz * 1.6;
    const q = g.collider.resolve(x, z, 0.45); x = q.x; z = q.z;
    Object.assign(p, { x, z, y: 0, hidden: false, dead: false, knocked: 0, hp: 70, mode: "chase", car: u, shootCD: 1.2 + r(), losCD: 0, sees: false, giveT: 0, lsx: undefined, lsz: undefined, outT: 0, tackleCD: 0 });
    p.yaw = Math.atan2(g.focus().x - x, g.focus().z - z);
    u.dropped = (u.dropped || 0) + 1; u.dropT = 0;
    g.sound("door", 0.5);
  }

  function brain(p, dt) {
    if (p.mode === "off" || p.hidden) return;
    const F = g.focus(), S = g.crime.S;
    const dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1;
    p.phase += dt * 3.2; p.amt = 0;
    if (p.shotT > 0) p.shotT -= dt;
    // done: you're in a car, gone, or clean — back to the cruiser (and gone once nobody's watching)
    if (p.mode === "chase" && (F.car || S.wanted <= 0 || d > 75 || (S.searching && S.searchT > 8))) p.mode = "back";
    if (p.mode === "back") {
      const c = p.car && p.car.active ? p.car : null;
      const tx = c ? c.x : p.x, tz = c ? c.z : p.z, bd = Math.hypot(tx - p.x, tz - p.z);
      if (!c || bd < 2.2 || !g.inView(p.x, p.z)) { q0(p); return; }
      p.yaw = Math.atan2(tx - p.x, tz - p.z); step(p, RUN * 0.8, dt); p.aimT = 0;
      if (S.wanted > 0 && !F.car && d < 40 && !S.searching) p.mode = "chase";   // you came back round
      return;
    }
    if (g.paused()) return;
    // sight, like the cars: all round in a chase, a cone once they've lost you
    p.losCD -= dt;
    if (p.losCD <= 0) {
      p.losCD = 0.15 + r() * 0.1;
      let can = d < 70;
      if (can && S.searching) can = d < CONE_NEAR || (d < CONE_R * 0.8 && Math.abs(wrap(Math.atan2(dx, dz) - p.yaw)) < CONE_HALF);
      p.sees = can && g.crime.los(p.x, p.z, F.x, F.z);
    }
    const heat = S.wanted;
    if (S.searching && !p.sees) {
      // looking for you: jog toward where you were last seen, sweeping the head about
      const b = g.crime.belief, bx = b.x - p.x, bz = b.z - p.z, bd = Math.hypot(bx, bz);
      p.yaw = bd > 3 ? Math.atan2(bx, bz) + Math.sin(p.phase * 0.4) * 0.5 : p.yaw + dt * 0.6;
      if (bd > 3) step(p, 3.2, dt);
      p.aimT = 0; return;
    }
    // lost sight round a corner: run to where you were last seen, not into the wall between you
    if (p.sees) { p.lsx = F.x; p.lsz = F.z; }
    else if (p.lsx !== undefined) {
      const lx = p.lsx - p.x, lz = p.lsz - p.z, ld = Math.hypot(lx, lz);
      if (ld > 1.2) { p.yaw = Math.atan2(lx, lz); step(p, RUN, dt); p.aimT = 0; return; }
      p.lsx = undefined;
    }
    p.yaw = Math.atan2(dx, dz);
    if (heat >= 3 && p.sees && d < 34 && d > 3) {
      // stop and shoot
      p.aimT = 0.5; p.shootCD -= dt;
      if (p.shootCD <= 0) {
        p.shootCD = 0.9 + r() * 0.9; p.shotT = 0.12;
        g.fx.muzzle(p.x + dx / d * 0.6, 1.3, p.z + dz / d * 0.6, dx / d, dz / d);
        g.fx.tracer(p.x, 1.3, p.z, F.x + (r() - 0.5) * 2, 1.1, F.z + (r() - 0.5) * 2);
        g.sound("gun", 0.4);
        if (r() < clamp(0.4 - d * 0.008 - (F.speed > 5 ? 0.15 : 0), 0.05, 0.42)) g.crime.hurt(8, p.x, p.z);
      }
      if (d > 14) step(p, RUN * 0.55, dt);             // close the range between shots
      return;
    }
    p.aimT = heat >= 3 ? 0.5 : 0;
    // caught you: at low heat, a flying tackle — you go down and he cuffs you
    p.outT = (p.outT || 0) + dt;
    if (d < 1.4 && heat < 3 && p.sees && g.tackle && !(p.tackleCD > 0) && p.outT > 1) { p.tackleCD = 4; g.tackle(p); }
    if (p.tackleCD > 0) p.tackleCD -= dt;
    if (d > CATCH * 0.8) step(p, d < 3 ? Math.max((F.speed || 0) + 1, 3) : RUN, dt);
  }
  function step(p, sp, dt) {
    p.x += Math.sin(p.yaw) * sp * dt; p.z += Math.cos(p.yaw) * sp * dt;
    const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z;
    p.amt = sp > 4.5 ? 2 : 1;
  }

  // per frame: which cruisers let someone out
  function update(dt) {
    const F = g.focus(), S = g.crime.S;
    if (S.wanted <= 0 || F.car || g.paused()) return;
    for (const u of g.crime.units) {
      if (!u.active || u.tank) continue;
      u.dropT = (u.dropT || 0) + dt;
      const d = Math.hypot(u.x - F.x, u.z - F.z);
      // not gaining on you (parked cars along the kerb, you're up on the pavement): pull over and get out
      u.gainT = (u.gainT || 0) + dt;
      if (u.gainT > 1.5) { u.noGain = d < 30 && u.lastD !== undefined && d > u.lastD - 2; u.lastD = d; u.gainT = 0; if (u.noGain && !S.searching) u.hold = 2.5; }
      const out = officers.some(o => o.car === u && o.mode !== "off");
      // stopped near you (or held up trying to reach you), and nobody of theirs is already out
      if (d < 32 && d > 6 && Math.abs(u.speed) < 2.5 && !S.searching && u.dropT > 1.2 && !out) deploy(u);
      if (out) u.hold = Math.max(u.hold || 0, 0.5);       // the car waits while its officer's out
    }
  }
  // an officer within reach of you, on foot, with you in sight: hands on you
  const grabbing = () => { const F = g.focus(); if (F.car) return false; return officers.some(o => o.mode === "chase" && !o.knocked && !o.dead && o.sees && Math.hypot(o.x - F.x, o.z - F.z) < CATCH && g.crime.S.wanted < 3); };
  const sees = () => officers.some(o => o.mode === "chase" && o.sees && !o.knocked && !o.dead);
  const reset = () => { for (const o of officers) q0(o); };
  return { update, grabbing, sees, reset, officers };
}
