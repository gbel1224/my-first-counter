// Palm City — traffic. Cars drive real lanes (right-hand traffic, two lanes each way), turn at
// intersections along smooth curves, stop for red lights, queue behind whoever is in front, and
// brake for you. All of it is instanced: four draw calls per car type for the whole city.
import * as THREE from "../vendor/three.module.js";
import { inView } from "./cull.js";
import { N, ROAD, CELL, HALF, roadC, clamp, lerp, mulberry32 } from "./world.js";
import { CAR_TYPES, carGeometries, carSpec, MAT, PAINTS, REAL_PAINTS, lampGeometry, plateGeometry } from "./cars.js";

// the mix on the road: mostly everyday cars, some pickups, vans and taxis, a few trucks and buses
const MIX = { sedan: 22, compact: 16, suv: 14, pickup: 10, van: 7, taxi: 8, coupe: 5, sports: 5, truck: 4, bus: 3, motorbike: 6, ambulance: 2, firetruck: 1.2 };
const NO_PARK = ["bus", "truck", "firetruck", "motorbike"];
function pickType(r, parked) {
  const keys = Object.keys(MIX).filter(k => !(parked && NO_PARK.includes(k)));
  let t = r() * keys.reduce((a, k) => a + MIX[k], 0);
  for (const k of keys) { t -= MIX[k]; if (t <= 0) return k; }
  return keys[0];
}
// a vehicle's paint: real-world colours; taxis yellow; buses in the city's livery
const BUS_PAINT = [0xe8e6dc, 0x1f5a8a, 0xc8302a];
function pickPaint(r, type) {
  if (carSpec(type).paint) return carSpec(type).paint;   // taxis, ambulances, fire engines
  if (type === "bus") return BUS_PAINT[(r() * BUS_PAINT.length) | 0];
  return REAL_PAINTS[(r() * REAL_PAINTS.length) | 0];
}
const LOD_D = 45;   // past this, cars are drawn from the lighter far geometry
// one instanced mesh per car part (paint / glass / trim / lights) per type
function carMeshes(scene, max, far) {
  const out = {};
  for (const t of CAR_TYPES) {
    const G = carGeometries(t, far);
    const mk = (geo, mat, shadow) => { const m = new THREE.InstancedMesh(geo, mat, max); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
    const paintM = mk(G.paint, MAT.paint, true);
    paintM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    const lightsM = mk(lampGeometry(G.lights, max), MAT.lights, false);          // per-car lamp state in aLamp
    out[t] = { paint: paintM, glass: mk(G.glass, far ? MAT.glassFar : MAT.glass, false), trim: mk(G.trim, MAT.trim, !far), lights: lightsM };
    // up close: textured tyres and each car's own number plate
    if (!far && G.tyres && G.tyres.attributes.position.count) out[t].tyres = mk(G.tyres, MAT.tyre, true);
    if (!far && G.plates && G.plates.attributes.position.count) out[t].plates = mk(plateGeometry(G.plates, max), MAT.plate, false);
  }
  return out;
}

// lane offset from the road centre line for a travel direction. Axis "z" = N-S road.
// Right-hand traffic: heading +z (south) keeps to -x; heading +x (east) keeps to +z.
export function laneOffset(axis, dir, lane) {
  const o = lane === 0 ? 1.8 : 4.9;          // two 3 m lanes each way, then the parking strip at 6.95
  return axis === "z" ? -dir * o : dir * o;
}
// signals: every junction runs its own cycle, offset from its neighbours — N-S green, amber, a
// moment of all-red to clear the box, then the cross street's turn. Pedestrians get a WALK at the
// start of the green that runs alongside their crossing, then a flashing hand, then the hand.
export const SIGNAL = { t: 0 };
export const CYCLE = 33;
const GREEN = 12, AMBER = 3;
export const RED = 0, AMB = 1, GRN = 2;
export function sigOffset(i, j) { return ((i * 7 + j * 13) % 11) / 11 * CYCLE; }
function cycleAt(i, j, axis, t) {
  const u = ((t + sigOffset(i, j)) % CYCLE + CYCLE) % CYCLE;
  return axis === "z" ? u : (u + CYCLE / 2) % CYCLE;     // the cross street runs half a cycle later
}
// the lights facing traffic travelling along `axis` at junction (i, j): GRN, AMB or RED
export function signalState(i, j, axis, t = SIGNAL.t) {
  const v = cycleAt(i, j, axis, t);
  return v < GREEN ? GRN : v < GREEN + AMBER ? AMB : RED;
}
// the walk signal for crossing the road that runs along `roadAxis`: 2 WALK, 1 flashing hand, 0 hand
export function walkState(i, j, roadAxis, t = SIGNAL.t) {
  const v = cycleAt(i, j, roadAxis === "z" ? "x" : "z", t);
  return v < 7 ? 2 : v < GREEN ? 1 : 0;
}
// the junction (i, j) a car on `axis`/`road` reaches at index k along it
const jIJ = (axis, road, k) => axis === "z" ? [road, k] : [k, road];

const MAXI = 160;   // max instances drawn per type
export class Traffic {
  constructor(scene, count = 150) {
    const r = this.r = mulberry32(0x7EA771C);
    this.cars = [];
    for (let k = 0; k < count; k++) {
      const axis = r() < 0.5 ? "x" : "z", dir = r() < 0.5 ? 1 : -1;
      const road = 1 + ((r() * (N - 1)) | 0);
      const lane = r() < 0.5 ? 0 : 1;
      const type = pickType(r, false);
      const c = {
        type, color: pickPaint(r, type), axis, dir, road, lane, len: carSpec(type).len, wid: carSpec(type).wid, siren: !!carSpec(type).emergency && r() < 0.55,
        s: -HALF + 30 + r() * (HALF * 2 - 60), speed: 0, vmax: (carSpec(type).big ? 8 : 10) + r() * 5, brake: false,
        turn: null, x: 0, z: 0, h: 0, stun: 0, alive: true, honk: 0,
      };
      this.syncPos(c);
      this.cars.push(c);
    }
    this.grid = new Map();
    // instanced meshes: detailed cars up close, a lighter version of each further out
    this.mesh = carMeshes(scene, MAXI, false); this.meshFar = carMeshes(scene, MAXI, true);
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._y = new THREE.Vector3(0, 1, 0);
  }
  syncPos(c) {
    const off = laneOffset(c.axis, c.dir, c.lane), cl = roadC(c.road) + off;
    if (c.axis === "z") { c.x = cl; c.z = c.s; c.h = c.dir > 0 ? 0 : Math.PI; }
    else { c.x = c.s; c.z = cl; c.h = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  }
  // next intersection centre ahead of a car (along its axis), or null past the edge
  nextJunction(c) {
    const s = c.s;
    for (let k = 0; k <= N; k++) {
      const jc = roadC(c.dir > 0 ? k : N - k);
      if (c.dir > 0 ? jc > s + 0.5 : jc < s - 0.5) return { k: c.dir > 0 ? k : N - k, at: jc };
    }
    return null;
  }
  // choose a turn at junction k and build the bezier through it
  planTurn(c, j) {
    const r = this.r;
    let choice = r();
    const out = { axis: c.axis, dir: c.dir, road: c.road, lane: c.lane };
    // turning: left from the inner lane, right from the outer lane, else straight
    if (choice < 0.22 && c.lane === 1) {         // right turn
      out.axis = c.axis === "z" ? "x" : "z"; out.road = j.k;
      out.dir = c.axis === "z" ? -c.dir : c.dir;   // right of heading +z is -x; right of +x is +z
    } else if (choice < 0.36 && c.lane === 0) {   // left turn
      out.axis = c.axis === "z" ? "x" : "z"; out.road = j.k;
      out.dir = c.axis === "z" ? c.dir : -c.dir;
    } else return null;
    // don't turn off the edge of the map
    if (out.road <= 0 || out.road >= N) return null;
    const newRoadAt = roadC(c.road);   // our current road becomes the cross coordinate
    const e = ROAD / 2 + 1;
    // entry: on our lane, at the near edge of the junction
    const offIn = laneOffset(c.axis, c.dir, c.lane), offOut = laneOffset(out.axis, out.dir, out.lane);
    let p0, p1, pc;
    if (c.axis === "z") {
      const lx = roadC(c.road) + offIn, ez = j.at - c.dir * e;
      const oz = roadC(out.road) + offOut, ex = newRoadAt + out.dir * e;
      p0 = [lx, ez]; p1 = [ex, oz]; pc = [lx, oz];
    } else {
      const lz = roadC(c.road) + offIn, ex = j.at - c.dir * e;
      const ox = roadC(out.road) + offOut, ez = newRoadAt + out.dir * e;
      p0 = [ex, lz]; p1 = [ox, ez]; pc = [ox, lz];
    }
    const len = Math.hypot(pc[0] - p0[0], pc[1] - p0[1]) + Math.hypot(p1[0] - pc[0], p1[1] - pc[1]);
    return { p0, p1, pc, len: len * 0.85, t: 0, out, startS: j.at - c.dir * e, left: c.lane === 0, jat: j.at };
  }
  update(dt, time, player) {
    SIGNAL.t = time;
    const walkers = this.walkers ? this.walkers() : [];
    // spatial hash for following
    const grid = this.grid; grid.clear();
    for (const c of this.cars) {
      if (!c.alive) continue;
      const k = ((c.x / 12) | 0) + "," + ((c.z / 12) | 0);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
    }
    for (const c of this.cars) {
      if (!c.alive) continue;
      const fdx = c.x - player[0].x, fdz = c.z - player[0].z;
      if (fdx * fdx + fdz * fdz > 400 * 400) { this.respawnNear(c, player[0].x, player[0].z); continue; }
      if (c.stun > 0) { c.stun -= dt; c.speed *= Math.exp(-3 * dt); }
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      // what's ahead: other cars, the player
      let gap = 99;
      const gx = (c.x / 12) | 0, gz = (c.z / 12) | 0;
      for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
        const a = grid.get((gx + ax) + "," + (gz + az)); if (!a) continue;
        for (const o of a) {
          if (o === c) continue;
          const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          const eff = ahead - ((o.len || 4.6) + (c.len || 4.6)) / 2 + 4.6;   // bumper to bumper, as if both were cars
          if (ahead > 0 && eff < gap && side < 2.2) gap = eff;
        }
      }
      let byYou = false;
      for (const p of player) {
        const dx = p.x - c.x, dz = p.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < gap && side < (p.car ? 2.4 : 1.6)) { gap = ahead; byYou = ahead < 12; }
      }
      for (const p of walkers) {                       // people on the crosswalk: wait for them
        const dx = p.x - c.x, dz = p.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < gap && side < 2.4) gap = ahead;
      }
      let target = c.vmax;
      if (gap < 18) target = Math.min(target, Math.max(0, (gap - 5.5) * 1.3));
      if (!c.turn) {
        const j = this.nextJunction(c);
        if (!j) {                                   // reached the edge: U-turn into the other direction
          c.dir = -c.dir; c.lane = 1; this.syncPos(c);
        } else {
          const stopAt = j.at - c.dir * (ROAD / 2 + 4.8);
          const dStop = (stopAt - c.s) * c.dir;
          const [ji, jj] = jIJ(c.axis, c.road, j.k), st = signalState(ji, jj, c.axis, time);
          // red: stop at the line. Amber: stop if there's room to, otherwise carry on through
          if (st !== GRN && dStop > -0.5 && dStop < 30) {
            if (st === RED || c.amberStop || dStop > c.speed * c.speed / 9 + 1.5) { c.amberStop = st === AMB; target = Math.min(target, Math.max(0, dStop * 0.8)); }
          } else c.amberStop = false;
          c.atRed = st === RED && dStop > -0.5 && dStop < 8;
          const entry = j.at - c.dir * (ROAD / 2 + 1);
          if ((entry - c.s) * c.dir < 0.4 && !c.planned) {
            c.planned = true;
            c.turn = this.planTurn(c, j);
          }
        }
      }
      // turning left across the oncoming lanes: pull into the box and wait for a gap
      if (c.turn && c.turn.left && c.turn.t < 0.34 && this.oncoming(c)) target = Math.min(target, Math.max(0, (0.3 - c.turn.t) * c.turn.len * 0.9));
      // stuck behind something that isn't moving (a wreck, a double-parked van): change lanes
      if (!c.turn && c.speed < 0.5 && gap < 9 && !c.atRed) {
        c.stuckT = (c.stuckT || 0) + dt;
        if (c.stuckT > 2.5 && this.laneFree(c, 1 - c.lane)) { c.lane = 1 - c.lane; c.stuckT = 0; c.planned = false; this.syncPos(c); }
      } else c.stuckT = 0;
      // and lean on the horn if it's you in the way on a green
      c.honk = Math.max(0, (c.honk || 0) - dt);
      c.waitYou = byYou && c.speed < 0.8 && !c.atRed ? (c.waitYou || 0) + dt : 0;
      if (c.waitYou > 2.2 && c.honk <= 0) { c.honk = 3 + this.r() * 3; if (this.onHonk) this.onHonk(c); }
      c.speed += clamp(target - c.speed, -14 * dt, 5 * dt);
      c.brake = target < c.speed - 0.5 || c.speed < 0.3;
      if (c.turn) {
        const T = c.turn;
        T.t = Math.min(1, T.t + c.speed * dt / T.len);
        const u = T.t, iu = 1 - u;
        const x = iu * iu * T.p0[0] + 2 * iu * u * T.pc[0] + u * u * T.p1[0];
        const z = iu * iu * T.p0[1] + 2 * iu * u * T.pc[1] + u * u * T.p1[1];
        const dx = 2 * iu * (T.pc[0] - T.p0[0]) + 2 * u * (T.p1[0] - T.pc[0]);
        const dz = 2 * iu * (T.pc[1] - T.p0[1]) + 2 * u * (T.p1[1] - T.pc[1]);
        c.x = x; c.z = z; c.h = Math.atan2(dx, dz);
        if (T.t >= 1) {
          Object.assign(c, T.out); c.turn = null; c.planned = false;
          c.s = c.axis === "z" ? c.z : c.x; this.syncPos(c);
        }
      } else {
        c.s += c.dir * c.speed * dt;
        this.syncPos(c);
        if (c.planned && this.nextJunctionPassed(c)) c.planned = false;
      }
    }
  }
  // is anyone coming the other way through this car's junction (for a left turn)?
  oncoming(c) {
    const at = c.turn.jat;
    for (const o of this.cars) {
      if (o === c || !o.alive || o.axis !== c.axis || o.road !== c.road || o.dir !== -c.dir || (o.turn && o.turn.left)) continue;
      const d = (at - o.s) * o.dir;                     // how far short of the junction centre they are
      if (d > -ROAD / 2 && d < 34 && (o.speed > 1.5 || d < ROAD / 2 + 1)) return true;
    }
    return false;
  }
  // room to slot into the other lane alongside?
  laneFree(c, lane) {
    for (const o of this.cars) {
      if (o === c || !o.alive || o.axis !== c.axis || o.road !== c.road || o.dir !== c.dir || o.lane !== lane) continue;
      if (Math.abs(o.s - c.s) < 11) return false;
    }
    return true;
  }
  // drop a far-away car back into a lane minD-330 m from the player (by default out of the immediate view)
  respawnNear(c, fx, fz, minD = 180) {
    const r = this.r;
    for (let tries = 0; tries < 8; tries++) {
      c.axis = r() < 0.5 ? "x" : "z"; c.dir = r() < 0.5 ? 1 : -1; c.lane = r() < 0.5 ? 0 : 1;
      const cross = c.axis === "z" ? fx : fz, along = c.axis === "z" ? fz : fx;
      const k = Math.round((cross + HALF - ROAD / 2) / CELL) + ((r() * 9) | 0) - 4;
      if (k < 1 || k > N - 1) continue;
      c.road = k; c.s = clamp(along + (r() - 0.5) * 640, -HALF + 20, HALF - 20);
      c.turn = null; c.planned = false; c.speed = c.vmax * 0.6; c.stun = 0;
      this.syncPos(c);
      const d2 = (c.x - fx) ** 2 + (c.z - fz) ** 2;
      if (d2 > minD * minD && d2 < 330 * 330) return;
    }
  }
  nextJunctionPassed(c) {
    // once past the junction centre, allow planning the next one
    const k = Math.round((c.s + HALF - ROAD / 2) / CELL);
    return (c.s - roadC(k)) * c.dir > ROAD / 2 + 1.5;
  }
  render(fx, fz, night) {
    const counts = {};
    for (const t of CAR_TYPES) counts[t] = 0;
    const m = this._m, q = this._q, v = this._v, col = this._c;
    for (const c of this.cars) {
      if (!c.alive) continue;
      const dx = c.x - fx, dz = c.z - fz;
      if (dx * dx + dz * dz > 280 * 280 || !inView(c.x, c.z)) continue;
      const far = dx * dx + dz * dz > LOD_D * LOD_D, key = far ? c.type + "_f" : c.type;
      const M = (far ? this.meshFar : this.mesh)[c.type], i = counts[key] || 0;
      if (i >= MAXI) continue;
      counts[key] = i + 1;
      q.setFromAxisAngle(this._y, c.h);
      m.compose(v.set(c.x, 0, c.z), q, this._s);
      for (const k in M) M[k].setMatrixAt(i, m);
      if (M.plates) { M.plates.geometry.attributes.aPlate.setX(i, c.plate ?? (c.plate = (Math.random() * 16) | 0)); M.plates.geometry.attributes.aPlate.needsUpdate = true; }
      col.set(c.color); M.paint.setColorAt(i, col);
      // lamps: brake lights when slowing or stopped, headlights after dark, indicators through a turn
      let ind = 0;
      if (c.turn) { const T = c.turn, ex = T.p1[0] - T.pc[0], ez = T.p1[1] - T.pc[1], nx = T.pc[0] - T.p0[0], nz = T.pc[1] - T.p0[1], cr = nx * ez - nz * ex; ind = Math.abs(cr) < 1e-3 ? 0 : cr < 0 ? 1 : 2; }
      M.lights.geometry.attributes.aLamp.setXYZW(i, c.brake ? 1 : 0, night > 0.3 ? 1 : 0, c.siren ? 4 : ind, 0);
    }
    for (const t of CAR_TYPES) for (const far of [false, true]) {
      const M = (far ? this.meshFar : this.mesh)[t], n = counts[far ? t + "_f" : t] || 0;
      for (const k in M) { M[k].count = n; M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
      M.lights.geometry.attributes.aLamp.needsUpdate = true;
    }
  }
  // remove a car from the traffic (the player took it)
  take(c) { c.alive = false; }
  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.cars) { if (!c.alive) continue; const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  }
}

// ============================================================================================
// parked cars: every kerb has a parking strip; thousands of slots, the nearest ~140 are drawn.
// Any of them can be broken into (the player gets a real car) or shunted by a hit.
// ============================================================================================
const PMAX = 150;
export class Parked {
  constructor(scene, districtOf) {
    const r = mulberry32(0x9A2CED);
    this.cars = [];
    for (let i = 0; i <= N; i++) for (const axis of ["x", "z"]) for (const side of [-1, 1]) {
      if ((i === 0 && side < 0) || (i === N && side > 0)) continue;      // no kerb outside the city
      for (let run = 0; run < N; run++) {
        const kind = districtOf(axis === "z" ? i - (side < 0 ? 1 : 0) : run, axis === "z" ? run : i - (side < 0 ? 1 : 0));
        if (kind === "plaza") continue;
        const fill = kind === "downtown" ? 0.62 : kind === "suburb" ? 0.3 : kind === "park" ? 0.25 : 0.5;
        const s0 = roadC(run) + ROAD / 2 + 7.5, s1 = roadC(run + 1) - ROAD / 2 - 7.5;
        for (let s = s0; s < s1; s += 6.4) {
          if (r() > fill) continue;
          const off = side * 6.95, cl = roadC(i) + off;
          const type = pickType(r, true);
          const jitter = (r() - 0.5) * 0.6;
          const c = { type, color: pickPaint(r, type), alive: true };
          if (axis === "z") { c.x = cl + (r() - 0.5) * 0.15; c.z = s + jitter; c.h = side < 0 ? 0 : Math.PI; }
          else { c.x = s + jitter; c.z = cl + (r() - 0.5) * 0.15; c.h = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
          c.h += (r() - 0.5) * 0.04;
          this.cars.push(c);
        }
      }
    }
    // static grid for collisions / lookups
    this.grid = new Map();
    for (const c of this.cars) this.gridAdd(c);
    this.mesh = carMeshes(scene, PMAX, false); this.meshFar = carMeshes(scene, PMAX, true);
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._y = new THREE.Vector3(0, 1, 0);
    this.near = [];
  }
  key(x, z) { return ((x / 20) | 0) + "," + ((z / 20) | 0); }
  gridAdd(c) { const k = this.key(c.x, c.z); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(c); c._k = k; }
  around(x, z) {
    const gx = (x / 20) | 0, gz = (z / 20) | 0, out = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = this.grid.get((gx + a) + "," + (gz + b)); if (l) for (const c of l) if (c.alive) out.push(c); }
    return out;
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.around(x, z)) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  take(c) { c.alive = false; }
  // a moving car (player) hitting parked ones: shove them and bounce the car; returns impact speed
  collide(v) {
    let impact = 0;
    for (const c of this.around(v.x, v.z)) {
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const hl = carSpec(c.type).len / 2 - 1.2;      // circles along the parked car's length
      for (const o of [-hl, hl]) {
        const cx = c.x + fx * o, cz = c.z + fz * o;
        const dx = v.x - cx, dz = v.z - cz, d2 = dx * dx + dz * dz, R = 2.05;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, vn = v.vx * nx + v.vz * nz;
        v.x += nx * (R - d) * 0.6; v.z += nz * (R - d) * 0.6;
        c.x -= nx * (R - d) * 0.4; c.z -= nz * (R - d) * 0.4;
        if (vn < 0) { impact = Math.max(impact, -vn); v.vx -= nx * vn * 1.3; v.vz -= nz * vn * 1.3; v.vx *= 0.85; v.vz *= 0.85; c.h += (Math.random() - 0.5) * Math.min(0.4, -vn * 0.02); }
      }
    }
    return impact;
  }
  render(fx, fz) {
    const near = this.near; near.length = 0;
    for (const c of this.cars) { if (!c.alive) continue; const d = (c.x - fx) ** 2 + (c.z - fz) ** 2; if (d < 200 * 200 && inView(c.x, c.z)) { c._d = d; near.push(c); } }
    if (near.length > PMAX) { near.sort((a, b) => a._d - b._d); near.length = PMAX; }
    const counts = {};
    for (const c of near) {
      const far = c._d > LOD_D * LOD_D, key = far ? c.type + "_f" : c.type;
      const M = (far ? this.meshFar : this.mesh)[c.type], i = counts[key] = (counts[key] || 0) + 1, ii = i - 1;
      if (ii >= PMAX) continue;
      this._q.setFromAxisAngle(this._y, c.h);
      this._m.compose(this._v.set(c.x, 0, c.z), this._q, this._s);
      for (const k in M) M[k].setMatrixAt(ii, this._m);
      if (M.plates) { M.plates.geometry.attributes.aPlate.setX(ii, c.plate ?? (c.plate = (Math.random() * 16) | 0)); M.plates.geometry.attributes.aPlate.needsUpdate = true; }
      this._c.set(c.color); M.paint.setColorAt(ii, this._c);
      M.lights.geometry.attributes.aLamp.setXYZW(ii, 0, 0, 0, 0);     // engine off: lamps dark
    }
    for (const t of CAR_TYPES) for (const far of [false, true]) { const M = (far ? this.meshFar : this.mesh)[t]; for (const k in M) { M[k].count = Math.min(PMAX, counts[far ? t + "_f" : t] || 0); M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; } M.lights.geometry.attributes.aLamp.needsUpdate = true; }
  }
}
