// Palm City — the player: walking, sprinting, jumping, getting in and out of cars, driving
// physics, and the camera that follows it all.
import * as THREE from "../vendor/three.module.js";
import { clamp, lerp, lerpAngle, groundY, HALF, SHORE } from "./world.js";
import { makeCharacter } from "./people.js";
import { makeCar, carSpec } from "./cars.js";
import { buildCraft, CRAFT_SPEC } from "./craft.js";

// ============================================================================================
// driving: a light bicycle-ish model. Grip bleeds sideways velocity (less with the handbrake,
// which is what lets the back step out), steering authority fades in with speed and softens at
// the top end, and building hits bounce you off with a thump.
// ============================================================================================
// extra drivable surfaces on top of the ground (stunt ramps): fn(x, z) -> height
let surfaceFn = null;
export function setSurface(fn) { surfaceFn = fn; }
// how wet the roads are (0..1, set from the weather): less grip, longer stops
let roadWet = 0;
export function setRoadWet(k) { roadWet = k; }
// each type's character: what drives the wheels, how it leans, how hard it stops
const CHAR = {
  compact: { drive: "fwd", roll: 1.0, brake: 1.0 }, sedan: { drive: "fwd", roll: 1.0, brake: 1.0 },
  sports: { drive: "rwd", roll: 0.55, brake: 1.25 }, coupe: { drive: "rwd", roll: 0.7, brake: 1.15 },
  suv: { drive: "awd", roll: 1.6, brake: 0.95 }, pickup: { drive: "rwd", roll: 1.5, brake: 0.9 },
  van: { drive: "rwd", roll: 1.7, brake: 0.85 }, bus: { drive: "rwd", roll: 1.3, brake: 0.7 },
  truck: { drive: "rwd", roll: 1.5, brake: 0.7 }, firetruck: { drive: "rwd", roll: 1.4, brake: 0.75 },
  taxi: { drive: "fwd", roll: 1.0, brake: 1.0 }, ambulance: { drive: "rwd", roll: 1.6, brake: 0.9 },
};
export function driveStep(v, inp, dt, collider) {
  const S = v.spec;
  const fx = Math.sin(v.h), fz = Math.cos(v.h);
  const rx = Math.cos(v.h), rz = -Math.sin(v.h);
  let lon = v.vx * fx + v.vz * fz, lat = v.vx * rx + v.vz * rz;
  const thr = clamp(inp.mz, -1, 1);
  const boost = inp.sprintHeld && thr > 0;
  const fl = v.flat || 0;                                           // shredded tyres (spike strip): slow, slithery, wandering
  const K = CHAR[v.type] || CHAR.sedan, mass = S.mass || 1;
  // the surface: wet tarmac, the kerb and paving, the beach
  const gy0 = groundY(v.x, v.z), sand = v.z > HALF + 2, off = !sand && gy0 > 0.1;
  const surf = (sand ? 0.62 : off ? 0.88 : 1) * (1 - roadWet * 0.2);
  const top = S.top * (boost ? 1.22 : 1) * (v.limp || 1) * (1 - fl * 0.12) * (sand ? 0.7 : 1);          // a bent car won't do its top speed
  if (thr > 0.02) {
    if (lon < -0.5) lon += 30 * thr * dt;                            // braking out of reverse
    else lon += S.accel * (boost ? 1.5 : 1) * thr * Math.max(0, 1 - (lon / top) ** 2) * dt;
  } else if (thr < -0.02) {
    if (lon > 0.5) lon -= 32 * -thr * dt * K.brake * (S.brakeMod || 1) * (1 - roadWet * 0.25) / Math.sqrt(mass);   // brakes: heavy things stop late
    else lon = Math.max(-11, lon - 9 * -thr * dt);                   // reverse
  } else lon -= Math.sign(lon) * Math.min(Math.abs(lon), (1.2 + Math.abs(lon) * 0.05) * dt);   // coasting
  if (inp.handbrakeHeld) lon -= Math.sign(lon) * Math.min(Math.abs(lon), 6 * dt);
  let grip = (inp.handbrakeHeld ? 1.3 : S.grip * (1 - clamp(Math.abs(lat) / 22, 0, 0.5))) * (1 - fl * 0.09) * surf;
  // rear-wheel drive: floor it mid-corner and the tail steps out (all-wheel drive barely does)
  const powerSlide = K.drive === "rwd" && thr > 0.5 && Math.abs(lon) > 8 && Math.abs(inp.mx) > 0.3;
  if (powerSlide && !inp.handbrakeHeld) grip *= 1 - 0.38 * thr * Math.abs(inp.mx) * (mass > 1.5 ? 0.4 : 1);
  lat *= Math.exp(-grip * dt);
  // steering
  const wob = fl ? Math.sin(v.wobT = (v.wobT || 0) + dt * (2.3 + Math.abs(lon) * 0.25)) * 0.05 * fl * clamp(Math.abs(lon) / 6, 0, 1) : 0;
  v.steer = lerp(v.steer || 0, clamp(inp.mx + wob + (v.pull || 0) * clamp(Math.abs(lon) / 8, 0, 1), -1, 1), 1 - Math.exp(-10 * dt));   // ...and pulls to one side
  const sp = Math.abs(lon);
  const auth = clamp(sp / 7, 0, 1) * (1 - 0.5 * clamp(sp / S.top, 0, 1));
  const yawT = -v.steer * S.turn * auth * Math.sign(lon || 1) * (inp.handbrakeHeld ? 1.45 : 1);
  v.yawRate = lerp(v.yawRate || 0, yawT, 1 - Math.exp(-8 / Math.sqrt(mass) * dt));   // heavy things are slow to turn in
  v.h += v.yawRate * dt;
  // oversteer: when sliding, some of the yaw feeds lateral velocity (keeps drifts alive)
  if (inp.handbrakeHeld) lat += v.yawRate * lon * 0.05 * dt * 10;
  else if (powerSlide) lat += v.yawRate * lon * 0.022 * dt * 10;
  const nfx = Math.sin(v.h), nfz = Math.cos(v.h), nrx = Math.cos(v.h), nrz = -Math.sin(v.h);
  v.vx = nfx * lon + nrx * lat; v.vz = nfz * lon + nrz * lat;
  v.x += v.vx * dt; v.z += v.vz * dt;
  v.x = clamp(v.x, -HALF - 420, HALF + 420); v.z = clamp(v.z, -HALF - 300, SHORE - 6);
  // collision: two circles along the body
  let impact = 0; v.hit = null;
  const half = S.len * 0.3, rad = S.wid * 0.55;
  for (const o of [half, -half]) {
    const cx = v.x + nfx * o, cz = v.z + nfz * o;
    const res = collider.resolve(cx, cz, rad);
    if (res.hit) {
      v.x += res.x - cx; v.z += res.z - cz;
      const vn = v.vx * res.nx + v.vz * res.nz;
      if (vn < 0) {
        if (-vn > impact) v.hit = { x: cx - res.nx * rad, z: cz - res.nz * rad, nx: res.nx, nz: res.nz };
        impact = Math.max(impact, -vn);
        v.vx -= res.nx * vn * 1.35; v.vz -= res.nz * vn * 1.35;   // bounce off
        v.vx *= 0.8; v.vz *= 0.8;
      }
    }
  }
  v.speed = Math.hypot(v.vx, v.vz);
  v.lon = lon; v.lat = lat; v.drift = Math.abs(lat);
  // body motion for visuals: dive under braking, squat under power, lean in corners
  const accelVis = (thr > 0 ? -0.025 : (thr < 0 && lon > 1 ? 0.05 : 0)) * Math.sqrt(K.roll);
  v.pitch = lerp(v.pitch || 0, accelVis, 1 - Math.exp(-6 * dt));
  v.roll = lerp(v.roll || 0, clamp(-v.yawRate * lon * 0.006 * K.roll * (S.rollMod || 1), -0.13, 0.13), 1 - Math.exp(-6 * dt));
  // vertical: follow the ground (kerbs, ramps); leave a ramp lip fast enough and you fly
  const gy = groundY(v.x, v.z) + (surfaceFn ? surfaceFn(v.x, v.z) : 0);
  const prevY = v.y || 0;
  v.landed = 0;
  if (v.air) {
    v.vy -= 24 * dt; v.y = prevY + v.vy * dt; v.airT += dt;
    if (v.y <= gy) { v.y = gy; v.air = false; v.landed = v.airT; v.airT = 0; v.vy = 0; }
  } else if (gy < prevY - 0.35 && v.speed > 7 && (v.climb || 0) > 1) {
    v.air = true; v.vy = v.climb * 0.9; v.airT = 0; v.y = prevY + v.vy * dt;
  } else {
    v.climb = clamp((gy - prevY) / dt, -20, 20);
    v.y = gy > prevY ? gy : lerp(prevY, gy, 1 - Math.exp(-18 * dt));
  }
  if (v.air) v.pitch = clamp(-v.vy * 0.025, -0.35, 0.35);
  else if (v.climb > 1) v.pitch = -Math.atan2(v.climb, Math.max(4, v.speed)) ;
  return impact;
}

// ============================================================================================
// the player
// ============================================================================================
export function createPlayer(scene, look) {
  const ch = makeCharacter(look);
  scene.add(ch.group);
  const P = {
    x: 0, z: 0, y: 0, vy: 0, yaw: 0, speed: 0, phase: 0, amt: 0, grounded: true,
    car: null, enter: null, ch,
  };
  return P;
}

export function updatePlayerOnFoot(P, inp, dt, camYaw, collider) {
  // camera-relative movement
  const m = Math.min(1, Math.hypot(inp.mx, inp.mz));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  let dx = fx * inp.mz + rx * inp.mx, dz = fz * inp.mz + rz * inp.mx;
  const dl = Math.hypot(dx, dz);
  const sprint = inp.sprintHeld && m > 0.3;
  let target = m < 0.05 ? 0 : (sprint ? 7.2 : 1.6 + m * 2.2);
  if (dl > 0.01) {
    dx /= dl; dz /= dl;
    // a sharp change of direction is a pivot on the spot, not a wide arc: turn faster, and
    // carry less speed through it
    let diff = Math.atan2(dx, dz) - P.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    const ad = Math.abs(diff);
    if (ad > 0.9) target *= clamp(1.25 - ad * 0.45, 0.15, 1);
    P.yaw = lerpAngle(P.yaw, Math.atan2(dx, dz), 1 - Math.exp(-(ad > 1.6 ? 22 : 13) * dt));
  }
  P.speed = lerp(P.speed, target, 1 - Math.exp(-(target > P.speed ? 6 : 10) * dt));
  const vx = Math.sin(P.yaw) * P.speed, vz = Math.cos(P.yaw) * P.speed;
  const x0 = P.x, z0 = P.z;
  P.x += vx * dt; P.z += vz * dt;
  const res = collider.resolve(P.x, P.z, 0.38);
  P.x = res.x; P.z = res.z;
  P.x = clamp(P.x, -HALF - 420, HALF + 420); P.z = clamp(P.z, -HALF - 280, HALF + 600);
  // how fast you REALLY went (a wall in the way stops you): the legs follow that, so pushing into a
  // wall doesn't run on the spot, and sliding along one walks
  const real = dt > 0 ? Math.hypot(P.x - x0, P.z - z0) / dt : 0;
  if (res.hit && real < P.speed * 0.85) P.speed = lerp(P.speed, Math.max(real, 0), 1 - Math.exp(-10 * dt));
  // jumping / kerbs
  const gy = groundY(P.x, P.z);
  if (inp.jump && P.grounded) { P.vy = 5.4; P.grounded = false; }
  P.vy -= 17 * dt; P.y += P.vy * dt;
  if (P.y <= gy) { P.y = lerp(P.y, gy, P.vy < -2 ? 1 : 0.5); if (P.y - gy < 0.02) P.y = gy; P.vy = 0; P.grounded = true; }
  // the legs: driven by the real ground speed, eased so a kerb or a corner doesn't stutter them
  P.gait = lerp(P.gait || 0, Math.min(real, 8), 1 - Math.exp(-14 * dt));
  const gs = P.gait < 0.12 ? 0 : P.gait;
  P.amt = gs < 0.15 ? 0 : gs < 3.6 ? gs / 3.6 : 1 + (gs - 3.6) / 3.6;
  P.phase += gs * dt * (P.amt > 1 ? 1.55 : 2.25);
  P.vx = (P.x - x0) / (dt || 1); P.vz = (P.z - z0) / (dt || 1);
}

export function poseOnFoot(P, time, over) {
  let extra = !P.grounded ? { override: { thighL: -0.7, thighR: 0.3, kneeL: 1.1, kneeR: 0.4, armL: -0.9, armR: 0.6 } } : null;
  if (over) { extra = { override: Object.assign({}, extra ? extra.override : {}, over) }; if (over.tilt !== undefined) extra.tilt = over.tilt; }
  // idle: breathe and shift weight
  const amt = P.amt;
  const phase = amt < 0.05 ? time * 0.9 : P.phase;
  P.ch.pose(P.x, P.y, P.z, P.yaw, phase, amt < 0.05 ? 0.04 : amt, extra);
}

// a player-owned / taken car
export function spawnCar(scene, type, color, x, z, h) {
  if (type === "motorbike") {                    // a traffic motorbike becomes a rideable bike
    const C = buildCraft("bike", color); scene.add(C.group);
    const v = { ...C, kind: "bike", type, color, x, z, h, vx: 0, vz: 0, y: groundY(x, z), steer: 0, yawRate: 0, speed: 0, spec: { ...CRAFT_SPEC.bike, cabin: [[0, 1], [0, 1.2], [0, 1.2], [0, 1]] } };
    syncCar(v); return v;
  }
  const C = makeCar(type, color);
  scene.add(C.group);
  const v = { ...C, x, z, h, vx: 0, vz: 0, y: groundY(x, z), steer: 0, yawRate: 0, speed: 0, spec: carSpec(type) };
  syncCar(v);
  return v;
}
export function syncCar(v) {
  v.group.position.set(v.x, v.y || 0, v.z);
  v.group.rotation.set(0, v.h, 0);
  v.chassis.rotation.set(v.pitch || 0, 0, v.roll || 0);
  if (v.flat || v.lowered) v.chassis.position.y = -0.028 * (v.flat || 0) - 0.035 * (v.lowered || 0);   // on its rims / slammed
}

// ============================================================================================
// camera: orbit around the target, drag to look, eases back behind the car when driving, never
// clips through a building
// ============================================================================================
export function createCamRig(camera) {
  return { yaw: Math.PI, pitch: 0.28, dist: 5.6, idle: 0, fov: 58, shake: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, camera };
}
export function updateCam(C, dt, target, inp, collider, driving, time) {
  const cam = C.camera;
  const looked = Math.abs(inp.lookX) + Math.abs(inp.lookY) > 0.5;
  C.yaw -= inp.lookX * 0.0055; C.pitch = clamp(C.pitch + inp.lookY * 0.004, -0.15, 1.0);
  inp.lookX = 0; inp.lookY = 0;
  C.idle = looked ? 0 : C.idle + dt;
  if (driving) {
    // swing round behind the car once the player stops steering the camera
    const behind = target.h + Math.PI;
    const k = C.idle > 1.2 ? 1 - Math.exp(-2.6 * dt * clamp(target.speed / 6, 0.2, 1.5)) : 0;
    C.yaw = lerpAngle(C.yaw, behind + Math.PI, k) ;
    C.pitch = lerp(C.pitch, 0.2, C.idle > 1.2 ? 1 - Math.exp(-2 * dt) : 0);
  }
  const sp = driving ? target.speed : 0;
  const wantDist = driving ? 7.8 + sp * 0.07 : 5.6;
  C.dist = lerp(C.dist, wantDist, 1 - Math.exp(-3 * dt));
  const baseFov = cam.aspect < 1 ? 68 : 58;           // portrait phones need more vertical view
  C.fov = lerp(C.fov, baseFov + (driving ? clamp(sp * 0.35, 0, 14) : 0), 1 - Math.exp(-3 * dt));
  const ty = (target.y || 0) + (driving ? 1.5 : 1.55);
  // orbit: yaw is the direction the camera LOOKS; it sits opposite
  const cx = target.x - Math.sin(C.yaw) * Math.cos(C.pitch) * C.dist;
  const cz = target.z - Math.cos(C.yaw) * Math.cos(C.pitch) * C.dist;
  let cy = ty + Math.sin(C.pitch) * C.dist + (driving ? 0.6 : 0.2);
  // pull in if a building is between the target and the camera
  // (fine steps so it doesn't come in notches; in at once so it never sees through a wall, back out
  // gently so walking past a corner doesn't make it pump in and out)
  const t = Math.max(0.15, collider.segmentHit(target.x, target.z, cx, cz, cy, 0.35) - 0.05);
  C.occ = C.occ === undefined || t < C.occ ? t : lerp(C.occ, t, 1 - Math.exp(-3.5 * dt));
  const px = lerp(target.x, cx, C.occ), pz = lerp(target.z, cz, C.occ);
  cy = Math.max(cy, groundY(px, pz) + 0.5);
  const want = new THREE.Vector3(px, cy, pz);
  if (!C.init) { C.pos.copy(want); C.init = true; }
  C.pos.lerp(want, 1 - Math.exp(-(driving ? 9 : 14) * dt));
  cam.position.copy(C.pos);
  if (C.shake > 0) {
    C.shake = Math.max(0, C.shake - dt * 2.5);
    cam.position.x += Math.sin(time * 71) * C.shake * 0.25; cam.position.y += Math.sin(time * 53) * C.shake * 0.2;
  }
  // look slightly ahead of a moving car
  const ahead = driving ? clamp(sp * 0.12, 0, 5) : 0;
  C.look.set(target.x + Math.sin(target.h || 0) * ahead, ty, target.z + Math.cos(target.h || 0) * ahead);
  cam.lookAt(C.look);
  if (Math.abs(cam.fov - C.fov) > 0.05) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
}
