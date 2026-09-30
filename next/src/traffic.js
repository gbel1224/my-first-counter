// Palm City 2 — traffic. Cars drive real lanes (right-hand traffic, two lanes each way), turn at
// intersections along smooth curves, stop for red lights, queue behind whoever is in front, and
// brake for you. All of it is instanced: four draw calls per car type for the whole city.
import * as THREE from "../vendor/three.module.js";
import { N, ROAD, CELL, HALF, roadC, clamp, lerp, mulberry32 } from "./world.js";
import { CAR_TYPES, carGeometries, MAT, PAINTS } from "./cars.js";

// lane offset from the road centre line for a travel direction. Axis "z" = N-S road.
// Right-hand traffic: heading +z (south) keeps to -x; heading +x (east) keeps to +z.
export function laneOffset(axis, dir, lane) {
  const o = lane === 0 ? 2 : 6;
  return axis === "z" ? -dir * o : dir * o;
}
// signal phase: 0 = N-S green, 1 = N-S amber, 2 = E-W green, 3 = E-W amber
export const SIGNAL = { phase: 0, t: 0 };
const PHASE_T = [11, 2.5, 11, 2.5];
export function greenFor(axis) {
  return axis === "z" ? SIGNAL.phase === 0 : SIGNAL.phase === 2;
}

const MAXI = 160;   // max instances drawn per type
export class Traffic {
  constructor(scene, count = 150) {
    const r = this.r = mulberry32(0x7EA771C);
    this.cars = [];
    for (let k = 0; k < count; k++) {
      const axis = r() < 0.5 ? "x" : "z", dir = r() < 0.5 ? 1 : -1;
      const road = 1 + ((r() * (N - 1)) | 0);
      const lane = r() < 0.5 ? 0 : 1;
      const type = CAR_TYPES[(r() * CAR_TYPES.length) | 0];
      const c = {
        type, color: PAINTS[(r() * PAINTS.length) | 0], axis, dir, road, lane,
        s: -HALF + 30 + r() * (HALF * 2 - 60), speed: 0, vmax: 10 + r() * 5, brake: false,
        turn: null, x: 0, z: 0, h: 0, stun: 0, alive: true, honk: 0,
      };
      if (type === "sedan" && r() < 0.25) c.color = 0xffc93c;   // taxis
      this.syncPos(c);
      this.cars.push(c);
    }
    this.grid = new Map();
    // instanced meshes
    this.mesh = {};
    for (const t of CAR_TYPES) {
      const G = carGeometries(t);
      const mk = (geo, mat, shadow) => {
        const m = new THREE.InstancedMesh(geo, mat, MAXI);
        m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
        scene.add(m); return m;
      };
      const paintM = mk(G.paint, MAT.paint, true);
      paintM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 3), 3);
      const lightsM = mk(G.lights, MAT.lights, false);
      lightsM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 3), 3);
      this.mesh[t] = { paint: paintM, glass: mk(G.glass, MAT.glass, false), trim: mk(G.trim, MAT.trim, true), lights: lightsM };
    }
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
    return { p0, p1, pc, len: len * 0.85, t: 0, out, startS: j.at - c.dir * e };
  }
  update(dt, time, player) {
    // signals
    SIGNAL.t += dt;
    if (SIGNAL.t > PHASE_T[SIGNAL.phase]) { SIGNAL.t = 0; SIGNAL.phase = (SIGNAL.phase + 1) % 4; }
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
          if (ahead > 0 && ahead < gap && side < 2.2) gap = ahead;
        }
      }
      for (const p of player) {
        const dx = p.x - c.x, dz = p.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < gap && side < (p.car ? 2.4 : 1.6)) gap = ahead;
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
          if (!greenFor(c.axis) && dStop > -0.5 && dStop < 26) target = Math.min(target, Math.max(0, dStop * 0.8));
          const entry = j.at - c.dir * (ROAD / 2 + 1);
          if ((entry - c.s) * c.dir < 0.4 && !c.planned) {
            c.planned = true;
            c.turn = this.planTurn(c, j);
          }
        }
      }
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
      if (dx * dx + dz * dz > 330 * 330) continue;
      const M = this.mesh[c.type], i = counts[c.type];
      if (i >= MAXI) continue;
      counts[c.type] = i + 1;
      q.setFromAxisAngle(this._y, c.h);
      m.compose(v.set(c.x, 0, c.z), q, this._s);
      M.paint.setMatrixAt(i, m); M.glass.setMatrixAt(i, m); M.trim.setMatrixAt(i, m); M.lights.setMatrixAt(i, m);
      col.set(c.color); M.paint.setColorAt(i, col);
      // brake lights flare, headlights come up at night
      const b = c.brake ? 3.2 : 1.0 + night * 1.2;
      col.setRGB(b, b * (c.brake ? 0.9 : 1), b * (c.brake ? 0.9 : 1)); M.lights.setColorAt(i, col);
    }
    for (const t of CAR_TYPES) {
      const M = this.mesh[t], n = counts[t];
      for (const k in M) { M[k].count = n; M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
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
