// Palm City — the beach and the bay. A long wooden fishing pier on its pilings (a bait shack, benches,
// lamps, people fishing off the rail), lifeguard towers on stilts with their ramps, flags and rescue
// buoys, volleyball nets on posts, a line of swim buoys, and boats out on the water (anchored and
// riding the swell, a sailboat tacking slowly across the bay). The people are in people.js: sunbathers
// on towels, swimmers out past the break, waders in the shallows, a volleyball game.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial } from "./geo.js";
import { HALF, groundY, mulberry32 } from "./world.js";
import { SEA_Y } from "./ocean.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rod(p0, p1, r, hex, seg = 6) {
  const d = p1.clone().sub(p0), L = d.length();
  const g = paint(new THREE.CylinderGeometry(r, r, L, seg), hex);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return g;
}
const box = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0, e = 0) => place(paint(new THREE.BoxGeometry(w, h, d), hex, e), x, y, z, rx, ry, rz);

// the swell height at a point (the sea's vertex shader, ocean.js)
export function swellAt(x, z, t) {
  const w = (dx, dz, f, s) => { const l = Math.hypot(dx, dz); return Math.sin((x * dx / l + z * dz / l) * f + t * s); };
  let h = w(0.2, 1.0, 0.07, 1.1) * 0.45 + w(-0.6, 1.0, 0.13, 1.7) * 0.22 + w(0.9, 0.4, 0.21, 2.3) * 0.1;
  h *= Math.min(1, Math.max(0, (z - HALF - 38) / 40)) * 0.8 + 0.2;
  return SEA_Y + h;
}

export const PIER = { x: -150, z0: HALF + 26, z1: HALF + 150, w: 7 };

export function buildBeach(scene) {
  const r = mulberry32(0xBEAC4);
  const P = [], L = [];
  const wood = 0x8a6a4a, wood2 = 0x6e5236, white = 0xf2f0ea;
  // ---- the pier: deck planks, stringers, pilings with cross-bracing, rails, lamps, a shack at the end ----
  const { x: px, z0, z1, w } = PIER;
  for (let z = z0; z < z1; z += 0.32) P.push(box(w, 0.08, 0.28, (Math.floor(z / 0.32) % 7 === 0) ? wood2 : wood, px, 2.4, z + 0.16));
  for (const s of [-1, 1]) P.push(box(0.2, 0.3, z1 - z0, wood2, px + s * (w / 2 - 0.3), 2.21, (z0 + z1) / 2));
  for (let z = z0 + 2; z < z1; z += 6) for (const s of [-1, 1]) {
    const gy = Math.max(groundY(px, z), -6);
    P.push(rod(V(px + s * (w / 2 - 0.3), gy - 2, z), V(px + s * (w / 2 - 0.3), 2.3, z), 0.2, 0x5a4632, 8));
    if (z + 6 < z1) P.push(rod(V(px + s * (w / 2 - 0.3), 0.2, z), V(px + s * (w / 2 - 0.3), 2.0, z + 6), 0.06, 0x5a4632));
  }
  for (let z = z0 + 2; z < z1; z += 6) P.push(rod(V(px - w / 2 + 0.3, 0.4, z), V(px + w / 2 - 0.3, 2.0, z), 0.06, 0x5a4632));
  for (const s of [-1, 1]) {
    P.push(box(0.1, 0.1, z1 - z0, white, px + s * (w / 2 - 0.05), 3.45, (z0 + z1) / 2));
    P.push(box(0.06, 0.06, z1 - z0, white, px + s * (w / 2 - 0.05), 2.95, (z0 + z1) / 2));
    for (let z = z0; z <= z1; z += 2) P.push(box(0.1, 1.0, 0.1, white, px + s * (w / 2 - 0.05), 2.95, z));
  }
  for (let z = z0 + 10; z < z1 - 6; z += 18) for (const s of [-1, 1]) {
    P.push(rod(V(px + s * (w / 2 - 0.2), 2.4, z), V(px + s * (w / 2 - 0.2), 6.2, z), 0.07, 0x2a2e32));
    L.push(place(paint(new THREE.SphereGeometry(0.22, 10, 8), 0xfff2d0, 1), px + s * (w / 2 - 0.2), 6.35, z));
  }
  // benches facing out
  for (let z = z0 + 16; z < z1 - 10; z += 24) for (const s of [-1, 1]) {
    P.push(box(0.5, 0.07, 1.8, wood, px + s * (w / 2 - 1.0), 2.88, z));
    P.push(box(0.07, 0.4, 1.8, wood, px + s * (w / 2 - 0.75), 3.12, z));
  }
  // the bait shack at the end: clapboard, a tin roof, a sign
  const sx = px, sz = z1 - 5;
  P.push(box(5.2, 3.0, 4.2, 0x5a8aa0, sx, 2.4 + 1.5, sz));
  for (let k = 0; k < 10; k++) P.push(box(5.25, 0.04, 4.25, 0x4a7890, sx, 2.6 + k * 0.3, sz));
  P.push(box(6.0, 0.15, 5.0, 0xb8bcc0, sx, 5.5, sz, 0.12, 0, 0));
  P.push(box(3.0, 0.7, 0.06, 0xf2e2b0, sx, 4.4, sz - 2.14));
  P.push(box(1.6, 0.9, 0.05, 0x2a3a48, sx + 1.2, 3.6, sz - 2.12));
  P.push(box(0.9, 2.0, 0.05, 0x6a4a32, sx - 1.4, 3.4, sz - 2.12));
  // ---- lifeguard towers: a hut on stilts, a ramp, a red rescue buoy, a flag ----
  const towers = [];
  for (const x of [-420, -260, 60, 220, 400]) {
    const z = HALF + 32 + r() * 3, gy = groundY(x, z), cols = [0xf2c230, 0x3aa0c8, 0xe86a4a, 0x7ac86a][towers.length % 4];
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(rod(V(x + ox * 1.1, gy, z + oz * 1.1), V(x + ox * 1.0, gy + 2.2, z + oz * 1.0), 0.08, white));
    P.push(rod(V(x - 1.1, gy + 0.5, z - 1.1), V(x + 1.1, gy + 1.9, z + 1.1), 0.04, white));
    P.push(box(2.6, 0.12, 2.6, white, x, gy + 2.25, z));
    P.push(box(2.3, 1.7, 2.1, cols, x, gy + 3.2, z - 0.1));
    P.push(box(1.6, 0.8, 0.06, 0x1a2a3a, x, gy + 3.4, z + 0.96));
    P.push(box(3.0, 0.12, 2.8, white, x, gy + 4.12, z - 0.1, 0.1, 0, 0));
    for (let k = 0; k < 6; k++) P.push(box(1.0, 0.06, 0.4, white, x - 1.9 + 0.0, gy + 0.2 + k * 0.33, z + 1.6 + k * 0.36, -0.75));   // the ramp
    P.push(box(0.5, 0.18, 0.12, 0xd8202a, x + 1.4, gy + 2.5, z + 1.3));
    P.push(rod(V(x + 1.2, gy + 4.1, z - 1.0), V(x + 1.2, gy + 6.3, z - 1.0), 0.03, 0x9a9a9a));
    P.push(box(0.03, 0.5, 0.75, 0xd8302a, x + 1.2, gy + 6.0, z - 0.6));
    towers.push({ x, z });
  }
  // ---- volleyball: posts, net, sand court lines ----
  const courts = [];
  for (const x of [-80, 300]) {
    const z = HALF + 26, gy = groundY(x, z);
    for (const s of [-1, 1]) P.push(rod(V(x + s * 4.6, gy, z), V(x + s * 4.6, gy + 2.5, z), 0.06, 0xd8d8d8));
    P.push(box(9.0, 0.05, 0.02, white, x, gy + 2.43, z));
    for (let k = 0; k < 12; k++) P.push(box(9.0, 0.008, 0.008, 0x1a1a1a, x, gy + 1.5 + k * 0.08, z));
    for (let k = 0; k < 40; k++) P.push(box(0.008, 0.92, 0.008, 0x1a1a1a, x - 4.5 + k * 0.23, gy + 1.96, z));
    for (const [w2, d2, ox, oz] of [[9, 0.05, 0, -4.5], [9, 0.05, 0, 4.5], [0.05, 18, -4.5, 0], [0.05, 18, 4.5, 0]]) P.push(box(w2, 0.01, d2, 0x2a6aa0, x + ox, gy + 0.01, z + oz));
    courts.push({ x, z });
  }
  // ---- boats: a few anchored, riding the swell; a sailboat crossing the bay ----
  const boatMat = vcMaterial({ roughness: 0.4, metalness: 0.1 });
  const boats = [];
  const hull = (len, col) => {
    const g = [];
    const shape = new THREE.Shape(); shape.moveTo(-len / 2, 0); shape.lineTo(len / 2 - 1, 0); shape.quadraticCurveTo(len / 2 + 0.3, 0.3, len / 2 + 0.6, 1.1); shape.lineTo(-len / 2, 1.1); shape.closePath();
    const ex = new THREE.ExtrudeGeometry(shape, { depth: len * 0.32, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 2 });
    ex.translate(0, -0.4, -len * 0.16); ex.rotateY(-Math.PI / 2);
    g.push(paint(ex.toNonIndexed(), col));
    g.push(box(len * 0.34, 0.06, len * 0.9, 0xd8c8a8, 0, 0.72, -0.1));
    g.push(box(len * 0.36, 0.12, len * 0.98, 0x1a3a6a, 0, 0.05, 0));                       // boot stripe
    return g;
  };
  const mkBoat = (kind, x, z, h) => {
    let g;
    if (kind === "sail") {
      g = hull(7, white);
      g.push(rod(V(0, 0.7, 0.6), V(0, 9.5, 0.6), 0.07, 0xd8d8d8));
      const sail = new THREE.BufferGeometry(); sail.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.4, 0.7, 0, 9.2, 0.7, 0, 1.4, -2.6, 0, 1.4, 0.7, 0, 1.4, -2.6, 0, 9.2, 0.7], 3)); sail.computeVertexNormals();
      g.push(paint(sail, 0xf6f4ee));
      const jib = new THREE.BufferGeometry(); jib.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.2, 1.0, 0, 8.4, 0.75, 0, 1.0, 3.3, 0, 1.2, 1.0, 0, 1.0, 3.3, 0, 8.4, 0.75], 3)); jib.computeVertexNormals();
      g.push(paint(jib, 0xeeece4));
    } else if (kind === "fishing") {
      g = hull(9, 0x2a5a8a);
      g.push(box(2.4, 1.8, 2.6, white, 0, 1.6, 0.8)); g.push(box(2.0, 0.6, 0.05, 0x1a2a3a, 0, 2.0, 2.12));
      g.push(rod(V(0, 2.5, 0.2), V(0, 5.6, 0.2), 0.06, 0xd8d8d8)); g.push(rod(V(0, 4.8, 0.2), V(0, 3.2, -3.6), 0.04, 0xd8d8d8));
    } else {
      g = hull(6, [0xf2f2ee, 0xd83a2a, 0x1a1a1a][(r() * 3) | 0]);
      g.push(box(1.6, 0.5, 1.2, white, 0, 1.0, 0.6)); g.push(box(1.5, 0.45, 0.04, 0x2a3a48, 0, 1.4, 1.05, -0.5));
    }
    const geo = merge(g);
    const m = new THREE.Mesh(geo, boatMat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    const b = { m, kind, x, z, h, ph: r() * 6 };
    boats.push(b); return b;
  };
  mkBoat("fishing", -330, HALF + 190, 0.4); mkBoat("speed", 150, HALF + 160, -1.1); mkBoat("speed", 420, HALF + 220, 2.3); mkBoat("fishing", 260, HALF + 300, 1.7);
  const sail = mkBoat("sail", -100, HALF + 260, Math.PI / 2); sail.sailing = true;
  // ---- swim buoys: a line of floats marking the swimming area ----
  const floats = [];
  for (let x = -420; x <= 420; x += 6) if (Math.abs(x - PIER.x) > 8) floats.push({ x, z: HALF + 92 + Math.sin(x * 0.01) * 4 });
  const fl = new THREE.InstancedMesh(paint(new THREE.SphereGeometry(0.3, 8, 6), 0xf2f2ee), vcMaterial({ roughness: 0.4 }), floats.length);
  fl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(floats.length * 3), 3);
  floats.forEach((f, i) => fl.setColorAt(i, new THREE.Color(i % 4 === 0 ? 0xe8402a : 0xf2f0ea)));
  fl.frustumCulled = false; scene.add(fl);
  // ---- merge the statics ----
  const pm = new THREE.Mesh(merge(P), vcMaterial({ roughness: 0.8 })); pm.castShadow = true; pm.receiveShadow = true; scene.add(pm);
  const lampMat = vcMaterial({ roughness: 0.4, emitMul: 0 });
  const lm = new THREE.Mesh(merge(L), lampMat); scene.add(lm);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  return {
    towers, courts, pier: PIER,
    lights: [[px, 6.3, z0 + 10, 0.5, 14], [px, 6.3, z0 + 46, 0.5, 14], [px, 6.3, z0 + 82, 0.5, 14], [px, 6.3, z0 + 118, 0.5, 14]],
    update(t, night) {
      lampMat.userData.emit.value = night * 3;
      for (const b of boats) {
        if (b.sailing) { b.x += Math.sin(b.h) * 1.4 * 0.016; if (b.x > 480) b.h = -Math.PI / 2; if (b.x < -480) b.h = Math.PI / 2; }
        const y = swellAt(b.x, b.z, t), y2 = swellAt(b.x + Math.sin(b.h) * 3, b.z + Math.cos(b.h) * 3, t), y3 = swellAt(b.x + Math.cos(b.h) * 1.5, b.z - Math.sin(b.h) * 1.5, t);
        b.m.position.set(b.x, y + 0.1, b.z);
        b.m.rotation.set(Math.atan2(y - y2, 3) * 0.8, b.h + Math.sin(t * 0.2 + b.ph) * 0.05, Math.atan2(y3 - y, 1.5) * 0.8 + (b.sailing ? 0.12 : 0), "YXZ");
      }
      floats.forEach((f, i) => { _m.compose(_p.set(f.x, swellAt(f.x, f.z, t) + 0.1, f.z), _q, _s); fl.setMatrixAt(i, _m); });
      fl.instanceMatrix.needsUpdate = true;
    },
  };
}
