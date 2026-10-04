// Palm City — a driver for story and service vehicles: junction to junction along the road grid,
// keeping to the right-hand lane, slowing for corners, backing out when wedged. Modes: "goto" a
// junction, "flee" from someone, or "wander".
import { clamp, N, roadC, nearestRoad } from "./world.js";
import { driveStep, syncCar, spawnCar } from "./play.js";
import { driveLamps } from "./cars.js";

export function makeRoadDriver(scene, collider, focus, gapAhead) {
  const r = Math.random;
  function create(type, color, x, z, h, mode, goal, want) {
    const c = spawnCar(scene, type, color, x, z, h);
    c.npc = true; c.hp = 180; c.alive = true;
    const D = { c, mode, goal, want, ni: nearestRoad(x), nj: nearestRoad(z), pi: -1, pj: -1, stuckT: 0, revT: 0, inp: { mx: 0, mz: 0, handbrakeHeld: false, sprintHeld: false } };
    pickNext(D);
    return D;
  }
  function pickNext(D) {
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [D.ni + a, D.nj + b]).filter(([i, j]) => i >= 0 && j >= 0 && i <= N && j <= N);
    let pool = opts.filter(([i, j]) => !(i === D.pi && j === D.pj));
    if (!pool.length) pool = opts;
    const F = focus();
    let best = null, bs = -Infinity;
    for (const [i, j] of pool) {
      let s = r() * 0.5;
      if (D.mode === "goto" && D.goal) s -= Math.abs(i - D.goal[0]) + Math.abs(j - D.goal[1]);
      else if (D.mode === "flee") s += Math.hypot(roadC(i) - F.x, roadC(j) - F.z) / 40 + r() * 1.2 - ((i === 0 || i === N || j === 0) ? 1 : 0);
      else s += r() * 3;
      if (s > bs) { bs = s; best = [i, j]; }
    }
    D.pi = D.ni; D.pj = D.nj; D.ni = best[0]; D.nj = best[1];
  }
  // send a driver somewhere new (a junction [i, j])
  function retarget(D, goal, mode = "goto") { D.goal = goal; D.mode = mode; D.arrived = false; }
  function drive(D, dt, lamps) {
    const c = D.c; if (!c.alive) return;
    let tx = roadC(D.ni), tz = roadC(D.nj);
    const ux = Math.sign(tx - roadC(D.pi < 0 ? D.ni : D.pi)), uz = Math.sign(tz - roadC(D.pj < 0 ? D.nj : D.pj));
    tx -= uz * 1.8; tz += ux * 1.8;                      // keep right: the inside lane of our side (traffic's lane 0)
    const d = Math.hypot(tx - c.x, tz - c.z);
    if (d < 8) {
      if (D.mode === "goto" && D.goal && D.ni === D.goal[0] && D.nj === D.goal[1]) D.arrived = true;
      else pickNext(D);
    }
    // the last stretch: pull up at an exact spot (beside the incident) instead of the junction
    if (D.arrived && D.spot) { tx = D.spot.x; tz = D.spot.z; }
    let dh = Math.atan2(tx - c.x, tz - c.z) - c.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    const dSpot = D.arrived && D.spot ? Math.hypot(D.spot.x - c.x, D.spot.z - c.z) : 99;
    let want = D.hold ? 0 : D.arrived ? (D.spot && dSpot > 3 ? Math.min(8, dSpot * 0.6) : 0) : (d < 22 ? Math.min(D.want, 12) : D.want);
    // something in the lane ahead (traffic): hang back behind it
    if (gapAhead && want > 0) { const gp = gapAhead(c); if (gp < 30) want = Math.min(want, Math.max(0, (gp - 6) * 1.2)); }
    D.inp.mx = clamp(-dh * 2.4, -1, 1);
    const lon = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
    D.inp.mz = Math.abs(dh) > 1.9 && want > 0 ? -0.5 : lon < want - 1 ? 1 : lon > want + 2 ? -0.7 : 0.15;
    if (want === 0) D.inp.mz = lon > 0.5 ? -1 : 0;
    D.inp.handbrakeHeld = Math.abs(dh) > 1.0 && lon > 14;
    if (D.revT > 0) { D.revT -= dt; D.inp.mz = -1; D.inp.mx = -D.inp.mx; }
    else if (want > 0 && D.inp.mz > 0.3 && Math.abs(c.speed) < 1.2) { D.stuckT += dt; if (D.stuckT > 1.1) { D.stuckT = 0; D.revT = 1.0; } }
    else D.stuckT = 0;
    driveStep(c, D.inp, dt, collider); driveLamps(c, D.inp, dt); syncCar(c);
    if (lamps) lamps(c);
  }
  return { create, drive, pickNext, retarget };
}
