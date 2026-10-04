// Palm City — the parks' furniture: in the middle a fountain, a gazebo or a statue; in two of the
// quarters a playground (swings, a slide with its tower and canopy, a spring rider on rubber
// surfacing), a basketball half court with its lines and hoop, or a picnic area with tables and a
// grill; bins by the benches. (The paths are drawn by the block shader, the lamps and benches are
// the city's own, and the people who use the park are in people.js.)
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial } from "./geo.js";
import { CURB } from "./world.js";
import { poolMaterial } from "./houses.js";
import { addTile } from "./cull.js";

const G0 = CURB;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a round bar between two points
function rod(p0, p1, r, hex, seg = 6) {
  const d = p1.clone().sub(p0), L = d.length();
  const g = paint(new THREE.CylinderGeometry(r, r, L, seg), hex);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  g.applyQuaternion(q); g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return g;
}
const box = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => place(paint(new THREE.BoxGeometry(w, h, d), hex), x, y, z, rx, ry, rz);

function fountain(P, W, cx, cz) {
  const stone = 0xe2dccf, dark = 0xbcb4a4;
  P.push(place(paint(new THREE.CylinderGeometry(3.3, 3.45, 0.6, 40, 1, true), stone), cx, G0 + 0.3, cz));
  P.push(place(paint(new THREE.TorusGeometry(3.38, 0.14, 6, 40), stone), cx, G0 + 0.6, cz, Math.PI / 2, 0, 0));   // rounded coping
  P.push(place(paint(new THREE.CylinderGeometry(3.2, 3.2, 0.05, 40), dark), cx, G0 + 0.08, cz));
  P.push(place(paint(new THREE.CylinderGeometry(0.45, 0.6, 1.5, 16), stone), cx, G0 + 0.75, cz));
  P.push(place(paint(new THREE.CylinderGeometry(1.5, 0.35, 0.5, 24, 1, true), stone), cx, G0 + 1.7, cz));            // the bowl
  P.push(place(paint(new THREE.CylinderGeometry(0.2, 0.28, 0.9, 12), stone), cx, G0 + 2.2, cz));
  P.push(place(paint(new THREE.SphereGeometry(0.32, 12, 8), stone), cx, G0 + 2.75, cz));
  // the water: in the basin and in the bowl
  for (const [r, y] of [[3.22, G0 + 0.48], [1.42, G0 + 1.9]]) {
    const g = new THREE.CircleGeometry(r, 36); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, ap = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { ap[i * 2] = uv.getX(i); ap[i * 2 + 1] = uv.getY(i); }
    g.setAttribute("aPool", new THREE.BufferAttribute(ap, 2));
    W.push(paint(place(g, cx, y, cz), 0xffffff));
  }
}
function gazebo(P, cx, cz, roofHex) {
  const white = 0xf2f0ea;
  P.push(place(paint(new THREE.CylinderGeometry(3.6, 3.7, 0.35, 8), 0xb8b0a2), cx, G0 + 0.17, cz, 0, Math.PI / 8, 0));
  P.push(place(paint(new THREE.CylinderGeometry(3.4, 3.4, 0.04, 8), 0x8a6a4a), cx, G0 + 0.36, cz, 0, Math.PI / 8, 0));   // boards
  const post = k => { const a = k / 8 * Math.PI * 2; return [cx + Math.cos(a) * 3.2, cz + Math.sin(a) * 3.2]; };
  for (let k = 0; k < 8; k++) {
    const [x, z] = post(k), [x2, z2] = post(k + 1);
    P.push(place(paint(new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8), white), x, G0 + 0.35 + 1.35, z));
    if (k % 4 === 1) continue;                                               // two entrances
    P.push(rod(V(x, G0 + 1.25, z), V(x2, G0 + 1.25, z2), 0.04, white));     // handrail
    for (let s = 1; s < 8; s++) { const t = s / 8; P.push(rod(V(x + (x2 - x) * t, G0 + 0.4, z + (z2 - z) * t), V(x + (x2 - x) * t, G0 + 1.23, z + (z2 - z) * t), 0.02, white, 4)); }
    P.push(rod(V(x, G0 + 2.95, z), V(x2, G0 + 2.95, z2), 0.08, white));     // ring beam
  }
  P.push(place(paint(new THREE.ConeGeometry(4.1, 1.9, 8, 1, true), roofHex), cx, G0 + 3.05 + 0.95, cz, 0, Math.PI / 8, 0));
  P.push(place(paint(new THREE.CylinderGeometry(4.1, 4.1, 0.2, 8, 1, true), white), cx, G0 + 3.0, cz, 0, Math.PI / 8, 0));
  P.push(place(paint(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 8), white), cx, G0 + 5.0, cz, 0, Math.PI / 8, 0));
  P.push(place(paint(new THREE.ConeGeometry(0.65, 0.7, 8), roofHex), cx, G0 + 5.6, cz, 0, Math.PI / 8, 0));
}
function statue(P, cx, cz) {
  const gran = 0x8a8680, bronze = 0x5a4a30;
  P.push(box(2.4, 0.3, 2.4, gran, cx, G0 + 0.15, cz));
  P.push(box(1.5, 1.8, 1.5, 0x9a9690, cx, G0 + 1.2, cz));
  P.push(box(1.7, 0.18, 1.7, gran, cx, G0 + 2.18, cz));
  P.push(box(0.7, 0.4, 0.03, 0xa08a50, cx, G0 + 1.3, cz + 0.76));          // plaque
  // a founder in a long coat, one arm raised toward the sea
  const y = G0 + 2.27, s = 1.35;
  P.push(place(paint(new THREE.CylinderGeometry(0.2 * s, 0.32 * s, 1.0 * s, 10), bronze), cx, y + 0.5 * s, cz));        // coat skirt
  P.push(place(paint(new THREE.CylinderGeometry(0.22 * s, 0.2 * s, 0.6 * s, 10), bronze), cx, y + 1.3 * s, cz));        // chest
  P.push(place(paint(new THREE.SphereGeometry(0.13 * s, 10, 8), bronze), cx, y + 1.75 * s, cz));
  P.push(rod(V(cx + 0.22 * s, y + 1.52 * s, cz), V(cx + 0.45 * s, y + 2.1 * s, cz + 0.25 * s), 0.055 * s, bronze));
  P.push(rod(V(cx - 0.22 * s, y + 1.52 * s, cz), V(cx - 0.3 * s, y + 0.95 * s, cz + 0.1 * s), 0.055 * s, bronze));
}
function playground(P, cx, cz) {
  P.push(box(9.4, 0.06, 9.4, 0x8a3e2c, cx, G0 + 0.03, cz));                                // poured rubber
  P.push(box(4.4, 0.065, 3.6, 0x2a5a8a, cx + 2.2, G0 + 0.031, cz - 2.4));
  for (const [w, d, x, z] of [[9.8, 0.2, 0, 4.8], [9.8, 0.2, 0, -4.8], [0.2, 9.8, 4.8, 0], [0.2, 9.8, -4.8, 0]]) P.push(box(w, 0.18, d, 0x7a5a3a, cx + x, G0 + 0.09, cz + z));   // timber edging
  // swing set: two A-frames, a top bar, two swings
  const sx = cx - 2.0, sz = cz + 1.6, red = 0xc0302a, steel = 0x6a6e72;
  for (const e of [-2.0, 2.0]) for (const l of [-0.9, 0.9]) P.push(rod(V(sx + e, G0 + 2.5, sz), V(sx + e, G0, sz + l), 0.05, red));
  P.push(rod(V(sx - 2.1, G0 + 2.5, sz), V(sx + 2.1, G0 + 2.5, sz), 0.06, red));
  for (const k of [-0.9, 0.9]) {
    for (const c of [-0.22, 0.22]) P.push(rod(V(sx + k + c, G0 + 2.48, sz), V(sx + k + c, G0 + 0.55, sz), 0.012, steel, 4));
    P.push(box(0.55, 0.04, 0.22, 0x1a1a1a, sx + k, G0 + 0.53, sz));
  }
  // slide tower: posts, deck, canopy, ladder, a yellow chute
  const tx = cx + 2.4, tz = cz - 2.2, blue = 0x2a6ab0;
  for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) P.push(rod(V(tx + a, G0, tz + b), V(tx + a, G0 + 2.9, tz + b), 0.06, blue));
  P.push(box(1.3, 0.08, 1.3, 0x3a8a3a, tx, G0 + 1.5, tz));
  P.push(place(paint(new THREE.ConeGeometry(1.0, 0.7, 4), 0xd8a020), tx, G0 + 3.2, tz, 0, Math.PI / 4, 0));
  for (const c of [-0.25, 0.25]) P.push(rod(V(tx + c, G0, tz + 1.35), V(tx + c, G0 + 1.55, tz + 0.62), 0.03, blue));
  for (let k = 1; k < 6; k++) { const t = k / 6; P.push(rod(V(tx - 0.25, G0 + t * 1.55, tz + 1.35 - t * 0.73), V(tx + 0.25, G0 + t * 1.55, tz + 1.35 - t * 0.73), 0.025, steel, 4)); }
  const chute = paint(new THREE.BoxGeometry(0.6, 0.05, 2.6), 0xf2c230);
  chute.rotateX(-0.55); chute.translate(tx, G0 + 0.8, tz - 1.75); P.push(chute);
  for (const c of [-0.3, 0.3]) { const r = paint(new THREE.BoxGeometry(0.04, 0.22, 2.6), 0xf2c230); r.rotateX(-0.55); r.translate(tx + c, G0 + 0.92, tz - 1.75); P.push(r); }
  // spring rider
  P.push(place(paint(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 8), 0x3a3a3a), cx - 2.6, G0 + 0.25, cz - 2.6));
  P.push(place(paint(new THREE.SphereGeometry(0.35, 10, 8), 0x3ab04a), cx - 2.6, G0 + 0.7, cz - 2.6, 0, 0, 0, 1.4, 0.8, 0.7));
  P.push(place(paint(new THREE.SphereGeometry(0.18, 8, 6), 0x3ab04a), cx - 2.1, G0 + 0.95, cz - 2.6));
}
function court(P, cx, cz, hex) {
  P.push(box(9.6, 0.05, 9.6, 0x3a3e40, cx, G0 + 0.025, cz));
  P.push(box(9.0, 0.052, 9.0, hex, cx, G0 + 0.027, cz));
  const line = (w, d, x, z) => P.push(box(w, 0.056, d, 0xf2f2ee, cx + x, G0 + 0.028, cz + z));
  const bz = -4.5;                                                       // the baseline end (the hoop's side)
  line(9.0, 0.06, 0, bz); line(9.0, 0.06, 0, 4.5); line(0.06, 9.0, -4.5, 0); line(0.06, 9.0, 4.5, 0);
  line(0.06, 4.6, -1.8, bz + 2.3); line(0.06, 4.6, 1.8, bz + 2.3); line(3.66, 0.06, 0, bz + 4.6);   // the key
  const arc = (r, a0, a1, zc, n) => { for (let k = 0; k < n; k++) { const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n; const p0 = V(cx + Math.sin(t0) * r, G0 + 0.03, cz + zc + Math.cos(t0) * r), p1 = V(cx + Math.sin(t1) * r, G0 + 0.03, cz + zc + Math.cos(t1) * r); const g = paint(new THREE.BoxGeometry(p0.distanceTo(p1) + 0.02, 0.056, 0.06), 0xf2f2ee); g.rotateY(-Math.atan2(p1.z - p0.z, p1.x - p0.x)); g.translate((p0.x + p1.x) / 2, p0.y, (p0.z + p1.z) / 2); P.push(g); } };
  arc(1.8, -Math.PI / 2, Math.PI / 2, bz + 4.6, 10);                     // free-throw circle
  arc(4.2, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25, bz + 0.8, 18);         // three-point arc (squeezed into the half court)
  // the hoop: pole behind the baseline, arm, backboard with its square, rim and net
  const hz = cz + bz;
  P.push(rod(V(cx, G0, hz - 0.9), V(cx, G0 + 3.2, hz - 0.9), 0.08, 0x2a2a2a, 8));
  P.push(rod(V(cx, G0 + 3.15, hz - 0.9), V(cx, G0 + 3.15, hz - 0.1), 0.06, 0x2a2a2a, 8));
  P.push(box(1.8, 1.05, 0.05, 0xf2f2f2, cx, G0 + 3.35, hz - 0.08));
  P.push(box(0.6, 0.45, 0.055, 0xc02a2a, cx, G0 + 3.2, hz - 0.075));
  P.push(box(0.54, 0.39, 0.06, 0xf2f2f2, cx, G0 + 3.2, hz - 0.07));
  P.push(place(paint(new THREE.TorusGeometry(0.23, 0.015, 6, 20), 0xe05a1a), cx, G0 + 3.05, hz + 0.25, Math.PI / 2, 0, 0));
  P.push(place(paint(new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true), 0xeeeeee), cx, G0 + 2.85, hz + 0.25));
}
function picnic(P, cx, cz) {
  const wood = 0x9a6a3e;
  for (const [ox, oz, a] of [[-2.4, -1.8, 0.2], [2.2, -2.0, -0.3], [0, 2.4, 0.05]]) {
    const x = cx + ox, z = cz + oz, c = Math.cos(a), s = Math.sin(a);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let [px, pz] = at(0, 0);
    P.push(box(1.9, 0.06, 0.78, wood, px, G0 + 0.76, pz, 0, a, 0));
    for (const side of [-0.62, 0.62]) { [px, pz] = at(0, side); P.push(box(1.9, 0.05, 0.26, wood, px, G0 + 0.45, pz, 0, a, 0)); }
    for (const e of [-0.75, 0.75]) for (const side of [-0.55, 0.55]) {
      const [ax, az] = at(e, side), [bx, bz] = at(e, 0);
      P.push(rod(V(ax, G0, az), V(bx, G0 + 0.75, bz), 0.035, 0x5a5a5a, 5));
    }
  }
  // a charcoal grill on its post
  P.push(rod(V(cx + 3.4, G0, cz + 1.2), V(cx + 3.4, G0 + 0.8, cz + 1.2), 0.05, 0x3a3a3a));
  P.push(box(0.6, 0.25, 0.45, 0x2a2a2a, cx + 3.4, G0 + 0.92, cz + 1.2));
}

export function buildParks(scene, plan, U, glsl) {
  const mat = vcMaterial({ roughness: 0.6, metalness: 0.15 }), water = poolMaterial(U, glsl);
  for (const pk of plan.parks || []) {
    const P = [], W = [];
    const { cx, cz } = pk;
    if (pk.centre === "fountain") fountain(P, W, cx, cz);
    else if (pk.centre === "gazebo") gazebo(P, cx, cz, 0x3a6a4a);
    else statue(P, cx, cz);
    for (const [a, b, kind] of pk.quads) {
      const qx = cx + a * 9, qz = cz + b * 9;
      if (kind === "playground") playground(P, qx, qz);
      else if (kind === "court") court(P, qx, qz, 0x2a6a5a);
      else picnic(P, qx, qz);
    }
    for (const [x, z] of pk.bins || []) {
      P.push(place(paint(new THREE.CylinderGeometry(0.28, 0.25, 0.9, 12), 0x2a4a32), x, G0 + 0.45, z));
      P.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), 0x1e3826), x, G0 + 0.92, z));
    }
    // one mesh per park, skipped when it's off screen or far away
    const m = new THREE.Mesh(merge(P), mat);
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
    m.geometry.computeBoundingSphere(); m.boundingSphere = m.geometry.boundingSphere; addTile(m, 380);
    if (W.length) {
      const g = merge(W);
      let off = 0; const ap = new Float32Array(g.attributes.position.count * 2);
      for (const w of W) { ap.set(w.attributes.aPool.array, off); off += w.attributes.aPool.array.length; }
      g.setAttribute("aPool", new THREE.BufferAttribute(ap, 2));
      const wm = new THREE.Mesh(g, water); scene.add(wm);
      g.computeBoundingSphere(); wm.boundingSphere = g.boundingSphere; addTile(wm, 380);
    }
  }
}
