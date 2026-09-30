// Palm City — everything that isn't a car: the speedboat, jet skis, motorbikes, the police-blue
// helicopter and a light plane. Each has a model built from primitives in the same paint /
// glass / trim style as the cars, and its own physics step.
import * as THREE from "../vendor/three.module.js";
import { MAT } from "./cars.js";
import { clamp, lerp, groundY, HALF } from "./world.js";
import { SEA_Y } from "./ocean.js";

const M = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; return m; };
const paintMat = c => { const m = MAT.paint.clone(); m.vertexColors = false; m.color.set(c); return m; };
const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.3 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.25, metalness: 0.9 });
const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 });

function hullShape(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(-wid / 2, -len / 2); s.lineTo(wid / 2, -len / 2); s.lineTo(wid / 2, len * 0.15);
  s.quadraticCurveTo(wid / 2, len * 0.42, 0, len / 2); s.quadraticCurveTo(-wid / 2, len * 0.42, -wid / 2, len * 0.15); s.closePath();
  return s;
}
function hull(len, wid, h, mat) {
  const g = new THREE.ExtrudeGeometry(hullShape(len, wid), { depth: h, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3 });
  g.rotateX(Math.PI / 2); g.translate(0, h, 0);
  // taper the keel: vertices near the bottom pull inward so it sits in the water like a V hull
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < h * 0.5) p.setX(i, p.getX(i) * (0.55 + y / h * 0.9)); }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export function buildCraft(kind, color) {
  const group = new THREE.Group(), chassis = new THREE.Group(); group.add(chassis);
  const body = paintMat(color);
  const parts = {};
  if (kind === "boat") {
    const h = hull(7.2, 2.6, 1.0, body); h.castShadow = true; chassis.add(h);
    chassis.add(M(new THREE.BoxGeometry(2.3, 0.1, 4.6), white, 0, 1.08, -0.9));                 // deck
    chassis.add(M(new THREE.BoxGeometry(1.9, 0.9, 0.08), MAT.glass, 0, 1.55, 0.8, -0.5));      // windscreen
    chassis.add(M(new THREE.BoxGeometry(0.9, 0.7, 0.9), white, -0.5, 1.45, -0.4));             // helm seat
    chassis.add(M(new THREE.BoxGeometry(0.5, 0.9, 0.5), dark, 0, 0.8, -3.7));                   // outboard
  } else if (kind === "jetski") {
    const h = hull(3.0, 1.1, 0.55, body); chassis.add(h);
    chassis.add(M(new THREE.BoxGeometry(0.5, 0.25, 1.2), dark, 0, 0.72, -0.3));                // saddle
    chassis.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), chrome, 0, 0.95, 0.55, 0, 0, Math.PI / 2));   // bars
    chassis.add(M(new THREE.BoxGeometry(0.7, 0.35, 0.5), white, 0, 0.75, 0.75, -0.3));
  } else if (kind === "bike") {
    const wheel = r => { const g = new THREE.Group(); g.add(M(new THREE.TorusGeometry(r, 0.09, 8, 18), dark, 0, 0, 0, 0, Math.PI / 2)); g.add(M(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.08, 12), chrome, 0, 0, 0, 0, 0, Math.PI / 2)); return g; };
    const wf = wheel(0.34), wr = wheel(0.36); wf.position.set(0, 0.36, 0.72); wr.position.set(0, 0.36, -0.7); chassis.add(wf, wr);
    chassis.add(M(new THREE.CapsuleGeometry(0.2, 0.6, 4, 10), body, 0, 0.78, 0.18, Math.PI / 2 - 0.25));   // tank
    chassis.add(M(new THREE.BoxGeometry(0.3, 0.12, 0.7), dark, 0, 0.86, -0.35));                            // seat
    chassis.add(M(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), chrome, 0, 0.62, 0.55, 0.5));              // forks
    chassis.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), chrome, 0, 1.05, 0.6, 0, 0, Math.PI / 2)); // bars
    chassis.add(M(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), chrome, 0.16, 0.42, -0.4, Math.PI / 2 - 0.2)); // exhaust
    parts.wheels = [wf, wr];
  } else if (kind === "heli") {
    chassis.add(M(new THREE.SphereGeometry(1.25, 18, 12), body, 0, 1.6, 0.4, 0, 0, 0)).scale.set(1, 0.95, 1.5);
    chassis.add(M(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass, 0, 1.75, 1.3, -0.6)).scale.set(1, 0.8, 1);
    chassis.add(M(new THREE.CylinderGeometry(0.22, 0.4, 4.6, 10), body, 0, 1.95, -2.6, Math.PI / 2 - 0.08));   // tail boom
    chassis.add(M(new THREE.BoxGeometry(0.1, 1.1, 0.7), body, 0.05, 2.5, -4.8));                                 // fin
    for (const x of [-0.8, 0.8]) chassis.add(M(new THREE.BoxGeometry(0.1, 0.1, 3.2), chrome, x, 0.12, 0.2));      // skids
    for (const x of [-0.8, 0.8]) for (const z of [-0.6, 1.0]) chassis.add(M(new THREE.BoxGeometry(0.06, 0.6, 0.06), chrome, x, 0.45, z));
    const rotor = new THREE.Group(); rotor.position.set(0, 3.0, 0.2);
    for (let k = 0; k < 4; k++) rotor.add(M(new THREE.BoxGeometry(0.28, 0.04, 5.6), dark, 0, 0, 0, 0, k * Math.PI / 2));
    rotor.add(M(new THREE.CylinderGeometry(0.2, 0.25, 0.35, 10), dark));
    const tail = new THREE.Group(); tail.position.set(0.18, 2.4, -4.8);
    for (let k = 0; k < 2; k++) tail.add(M(new THREE.BoxGeometry(0.03, 1.1, 0.14), dark, 0, 0, 0, k * Math.PI / 2));
    chassis.add(rotor, tail); parts.rotor = rotor; parts.tailRotor = tail;
  } else if (kind === "plane") {
    chassis.add(M(new THREE.CapsuleGeometry(0.75, 5.5, 6, 14), body, 0, 1.6, 0, Math.PI / 2));                  // fuselage
    chassis.add(M(new THREE.SphereGeometry(0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass, 0, 2.05, 1.0, -0.35)).scale.set(0.9, 0.7, 1.6);
    chassis.add(M(new THREE.BoxGeometry(10.5, 0.14, 1.6), white, 0, 2.0, 0.6));                                  // wing
    chassis.add(M(new THREE.BoxGeometry(3.4, 0.1, 0.9), white, 0, 1.9, -3.1));                                    // tailplane
    chassis.add(M(new THREE.BoxGeometry(0.1, 1.3, 1.0), body, 0, 2.5, -3.2));                                     // fin
    const prop = new THREE.Group(); prop.position.set(0, 1.6, 3.55);
    for (let k = 0; k < 2; k++) prop.add(M(new THREE.BoxGeometry(0.16, 2.0, 0.05), dark, 0, 0, 0, 0, 0, k * Math.PI / 2));
    chassis.add(prop); parts.prop = prop;
    for (const x of [-1.1, 1.1]) chassis.add(M(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12), dark, x, 0.3, 0.9, 0, 0, Math.PI / 2));
    chassis.add(M(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10), dark, 0, 0.25, -2.7, 0, 0, Math.PI / 2));
    for (const x of [-1.1, 1.1]) chassis.add(M(new THREE.BoxGeometry(0.06, 1.2, 0.06), chrome, x, 0.9, 0.9));
  }
  return { group, chassis, body, parts };
}

export const CRAFT_SPEC = {
  boat: { top: 28, accel: 12, turn: 1.2, len: 7.2, wid: 2.6 },
  jetski: { top: 30, accel: 11, turn: 2.0, len: 3, wid: 1.1 },
  bike: { top: 58, accel: 22, grip: 9.5, turn: 3.0, len: 2.1, wid: 0.9, wheelR: 0.36, wb: 1.4, ride: 0.2, cabin: [[0, 1], [0, 1.2], [0, 1.2], [0, 1]] },
  heli: { top: 42, accel: 12, turn: 1.4, len: 9, wid: 3 },
  plane: { top: 70, accel: 10, turn: 0.9, len: 7, wid: 10, stall: 24 },
};

export const inWater = (x, z) => z > HALF + 50 && groundY(x, z) < SEA_Y - 0.25;

// boats and jet skis: momentum on water, a wake of foam, a bow that rises with speed
export function waterStep(v, inp, dt, time, fx) {
  const S = v.spec, f = Math.sin(v.h), c = Math.cos(v.h);
  let lon = v.vx * f + v.vz * c, lat = v.vx * c - v.vz * f;
  const thr = clamp(inp.mz, -1, 1), boost = inp.sprintHeld && thr > 0;
  lon += (thr > 0 ? S.accel * (boost ? 1.4 : 1) * thr * Math.max(0, 1 - (lon / (S.top * (boost ? 1.2 : 1))) ** 2) : thr * S.accel * 0.7) * dt;
  lon *= Math.exp(-0.25 * dt); lat *= Math.exp(-(v.kind === "jetski" ? 2.4 : 1.4) * dt);
  lon = Math.max(-6, lon);
  v.steer = lerp(v.steer || 0, clamp(inp.mx, -1, 1), 1 - Math.exp(-6 * dt));
  v.h -= v.steer * S.turn * clamp(Math.abs(lon) / 6, 0.2, 1) * dt * Math.sign(lon || 1);
  const nf = Math.sin(v.h), nc = Math.cos(v.h);
  v.vx = nf * lon + nc * lat; v.vz = nc * lon - nf * lat;
  v.x += v.vx * dt; v.z += v.vz * dt;
  // can't drive up the beach
  if (!inWater(v.x, v.z)) { v.x -= v.vx * dt; v.z -= v.vz * dt; v.vx *= -0.3; v.vz *= -0.3; }
  v.x = clamp(v.x, -HALF - 500, HALF + 500); v.z = clamp(v.z, HALF + 40, HALF + 600);
  v.speed = Math.hypot(v.vx, v.vz);
  const swell = Math.sin(v.x * 0.07 + time * 1.1) * 0.35 + Math.sin(v.z * 0.13 + time * 1.7) * 0.18;
  v.y = SEA_Y + swell * 0.8 - (v.kind === "jetski" ? 0.25 : 0.55);
  v.pitch = -clamp(lon / S.top, 0, 1) * 0.16 + Math.sin(time * 2.2 + v.x) * 0.03;
  v.roll = clamp(v.steer * lon * 0.012, -0.3, 0.3) + Math.sin(time * 1.7 + v.z) * 0.03;
  if (v.speed > 4 && Math.random() < dt * 30) fx.dust(v.x - nf * S.len * 0.45, SEA_Y + 0.2, v.z - nc * S.len * 0.45, 1);
}

// helicopter: hover by default, joystick flies you forward/sideways relative to the nose, ▲/▼ for height
export function heliStep(v, inp, dt, time, collider) {
  const S = v.spec;
  const up = (inp.sprintHeld ? 1 : 0) - (inp.handbrakeHeld ? 1 : 0);
  v.rotor = Math.min(1, (v.rotor || 0) + dt * 0.8);
  const lift = v.rotor >= 1 ? up : -0.2;
  v.vy = lerp(v.vy || 0, lift * 9, 1 - Math.exp(-2 * dt));
  const f = Math.sin(v.h), c = Math.cos(v.h);
  const fwd = clamp(inp.mz, -1, 1), side = clamp(inp.mx, -1, 1);
  const air = v.y > groundY(v.x, v.z) + 0.6;
  if (air) v.h -= side * S.turn * dt;
  const tx = f * fwd * S.top, tz = c * fwd * S.top;
  const k = air ? 1 - Math.exp(-0.9 * dt) : 1;
  v.vx = lerp(v.vx, air ? tx : 0, k); v.vz = lerp(v.vz, air ? tz : 0, k);
  v.x += v.vx * dt; v.z += v.vz * dt; v.y += v.vy * dt;
  const g = Math.max(groundY(v.x, v.z), 0);
  if (v.y < g) { v.y = g; v.vy = Math.max(0, v.vy); }
  v.y = Math.min(v.y, 260);
  // buildings are solid below their roofs
  const res = collider.resolveY(v.x, v.z, 3.5, v.y + 0.5);
  if (res.hit) { v.x = res.x; v.z = res.z; v.vx *= -0.3; v.vz *= -0.3; }
  v.speed = Math.hypot(v.vx, v.vz);
  v.pitch = clamp(fwd * 0.22 * (air ? 1 : 0), -0.25, 0.25); v.roll = air ? -side * 0.2 : 0;
  if (v.parts.rotor) { v.parts.rotor.rotation.y += dt * 30 * v.rotor; v.parts.tailRotor.rotation.x += dt * 40 * v.rotor; }
}

// plane: throttle builds speed on the runway; above take-off speed, pull up to climb; bank to turn;
// too slow in the air and it stalls and drops
export function planeStep(v, inp, dt, time, collider) {
  const S = v.spec;
  v.throttle = clamp((v.throttle || 0) + (inp.sprintHeld || inp.mz > 0.2 ? 0.5 : inp.mz < -0.2 ? -0.6 : 0) * dt, 0, 1);
  const g = Math.max(groundY(v.x, v.z), 0);
  const air = v.y > g + 0.3;
  v.spd = v.spd || 0;
  v.spd += (v.throttle * S.accel - (air ? 2 : 4) * (v.spd / S.top) * S.accel * 0.6 - (inp.handbrakeHeld && !air ? 12 : 0)) * dt;
  v.spd = clamp(v.spd, 0, S.top);
  const canFly = v.spd > S.stall;
  if (!air) { v.climb = canFly && inp.sprintHeld ? 6 : 0; v.h -= clamp(inp.mx, -1, 1) * 0.6 * dt * Math.min(1, v.spd / 8); }
  else {
    v.bank = lerp(v.bank || 0, clamp(inp.mx, -1, 1) * 0.7, 1 - Math.exp(-3 * dt));
    v.h -= v.bank * S.turn * dt;
    v.climb = lerp(v.climb || 0, canFly ? (inp.handbrakeHeld ? -10 : inp.sprintHeld ? 9 : 0) : -12, 1 - Math.exp(-1.5 * dt));
  }
  v.vx = Math.sin(v.h) * v.spd; v.vz = Math.cos(v.h) * v.spd;
  v.x += v.vx * dt; v.z += v.vz * dt; v.y += v.climb * dt;
  const hitG = v.y <= g;
  if (hitG) { v.y = g; if (air && v.climb < -8) v.crash = true; v.climb = Math.max(0, v.climb); v.bank = 0; }
  const res = collider.resolveY(v.x, v.z, 3, v.y + 1);
  if (res.hit) { v.crash = true; v.x = res.x; v.z = res.z; v.spd = 0; }
  v.y = Math.min(v.y, 300);
  v.speed = v.spd;
  v.pitch = air ? -clamp(v.climb * 0.03, -0.35, 0.35) : 0; v.roll = air ? -(v.bank || 0) * 0.9 : 0;
  if (v.parts.prop) v.parts.prop.rotation.z += dt * (8 + v.throttle * 60);
}
