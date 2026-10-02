// Palm City — the small stuff that makes a room feel lived in, and the pieces that move: ceiling
// fans, a fireplace, an aquarium full of fish, a pool table, a jukebox. Static parts go through the
// furniture kit (merged); moving parts are their own little groups with an update(t, dt).
import * as THREE from "../vendor/three.module.js";
import { C } from "./furniture.js";
import { paint, place, merge, vcMaterial } from "./geo.js";

const TAU = Math.PI * 2, rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];

// ------------------------------- kitchen & table -------------------------------
export function microwave(K) {
  K.box("gloss", 0.5, 0.3, 0.38, 0, 0.15, 0, C.black, { r: 0.015 });
  K.box("glass", 0.32, 0.2, 0.01, -0.05, 0.15, 0.191, 0x101418);
  K.box("glow", 0.08, 0.03, 0.005, 0.18, 0.24, 0.192, 0x60ff90, { em: 1.2 });
  for (let i = 0; i < 6; i++) K.box("gloss", 0.02, 0.012, 0.005, 0.16 + (i % 2) * 0.04, 0.2 - Math.floor(i / 2) * 0.03, 0.192, 0x8a8a8a);
}
export function toaster(K) {
  K.box("chrome", 0.28, 0.2, 0.16, 0, 0.1, 0, C.chrome, { r: 0.04 });
  for (const x of [-0.05, 0.05]) K.box("matte", 0.03, 0.01, 0.12, x, 0.2, 0, 0x1a1a1a);
  K.box("gloss", 0.02, 0.05, 0.03, 0.15, 0.12, 0, C.black);
}
export function stockPot(K, x, y, z, col = C.steel) {
  K.cyl("metal", 0.13, 0.12, 0.2, x, y + 0.1, z, col, { seg: 16 });
  K.cyl("metal", 0.135, 0.135, 0.015, x, y + 0.21, z, col, { seg: 16 });
  K.sph("gloss", 0.02, x, y + 0.225, z, C.black, { seg: 8 });
  for (const s of [-1, 1]) K.box("metal", 0.05, 0.015, 0.03, x + s * 0.15, y + 0.17, z, col);
}
export function fruitBowl(K, x, y, z) {
  K.lathe("gloss", [[0.001, 0], [0.1, 0.01], [0.15, 0.07], [0.145, 0.08]], x, y, z, 0xe8e0d0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; K.sph("gloss", 0.04, x + Math.cos(a) * 0.06, y + 0.07 + (i % 2) * 0.03, z + Math.sin(a) * 0.06, pick([0xd83a2a, 0xe8a020, 0x7ab83a, 0xe8d040]), { seg: 8, hseg: 6 }); }
}
export function placeSetting(K, x, y, z, ry = 0) {
  K.push(x, z, ry, y);
  K.cyl("gloss", 0.13, 0.12, 0.012, 0, 0.006, 0, C.white, { seg: 20 });
  K.box("chrome", 0.012, 0.004, 0.18, -0.17, 0.004, 0, C.chrome); K.box("chrome", 0.016, 0.004, 0.19, 0.17, 0.004, 0, C.chrome);
  K.lathe("glass", [[0.001, 0], [0.03, 0], [0.004, 0.01], [0.004, 0.08], [0.035, 0.11], [0.04, 0.18]], 0.12, 0, -0.16, 0xe8f0f4);
  K.box("fabric", 0.12, 0.004, 0.16, -0.26, 0.004, 0, 0xc8b8a0);
  K.pop();
}
export function wineRack(K, w = 0.8) {
  K.box("wood", w, 1.0, 0.3, 0, 0.5, 0, C.walnut);
  for (let r = 0; r < 4; r++) for (let c = 0; c < Math.floor(w / 0.18); c++) K.cyl("glass", 0.035, 0.035, 0.28, -w / 2 + 0.1 + c * 0.18, 0.15 + r * 0.22, 0.02, pick([0x3a0a14, 0x2a3a14, 0x5a1a1a]), { rx: Math.PI / 2, seg: 8 });
  K.block(-w / 2, -0.15, w / 2, 0.15);
}

// ------------------------------- living -------------------------------
export function fireplace(K, w = 1.8) {
  // stone surround, a mantel shelf with bits on it, a sooty firebox with logs on a grate
  K.box("matte", w, 1.15, 0.5, 0, 0.575, 0, 0xd8d0c0);
  for (let i = 0; i < 18; i++) K.box("matte", 0.18 + rnd() * 0.16, 0.12 + rnd() * 0.08, 0.012, -w / 2 + 0.15 + rnd() * (w - 0.3), 0.1 + rnd() * 1.0, 0.252, pick([0xc8c0b0, 0xe0d8c8, 0xb8b0a0]));
  K.box("wood", w + 0.2, 0.08, 0.6, 0, 1.19, 0.02, C.walnut, { r: 0.01 });
  K.box("matte", w * 0.55, 0.62, 0.35, 0, 0.4, 0.09, 0x141210);
  K.box("matte", w * 0.66, 0.05, 0.4, 0, 0.03, 0.4, 0x3a3632);                             // hearth
  for (let i = 0; i < 4; i++) K.box("metal", 0.02, 0.02, 0.3, -0.24 + i * 0.16, 0.12, 0.1, C.black);
  K.cyl("wood", 0.06, 0.06, 0.62, 0, 0.19, 0.08, 0x5a3a24, { rz: Math.PI / 2, ry: 0.2, seg: 8 });
  K.cyl("wood", 0.055, 0.055, 0.55, 0.05, 0.28, 0.12, 0x4a2e1c, { rz: Math.PI / 2, ry: -0.3, seg: 8 });
  K.box("glow", w * 0.5, 0.06, 0.25, 0, 0.14, 0.1, 0xff6a1a, { em: 2.5 });                 // embers
  // on the mantel: a clock, candles, a framed photo
  K.box("wood", 0.22, 0.28, 0.08, -w * 0.3, 1.37, 0.0, C.walnut, { r: 0.02 });
  K.cyl("gloss", 0.07, 0.07, 0.012, -w * 0.3, 1.39, 0.045, C.white, { rx: Math.PI / 2, seg: 16 });
  for (const [x, h] of [[w * 0.28, 0.2], [w * 0.34, 0.14], [w * 0.4, 0.24]]) { K.cyl("gloss", 0.025, 0.025, h, x, 1.23 + h / 2, 0, 0xf4ecd8, { seg: 10 }); K.sph("glow", 0.012, x, 1.24 + h + 0.015, 0, 0xffc060, { em: 4, seg: 6, hseg: 4 }); }
  photoFrame(K, 0.05, 1.23, -0.02, 0.1);
  K.block(-w / 2, -0.25, w / 2, 0.6);
  return { x: 0, y: 0.22, z: 0.12 };                     // where the flames go
}
export function photoFrame(K, x, y, z, ry = 0) {
  K.push(x, z, ry, y);
  K.box("wood", 0.16, 0.2, 0.02, 0, 0.1, 0, pick([C.walnut, C.black, 0xc8a24a]), { rx: -0.15 });
  K.box("matte", 0.12, 0.15, 0.004, 0, 0.1, 0.012, pick([0x6a8aa8, 0xa88a6a, 0x8aa86a]), { rx: -0.15 });
  K.pop();
}
export function poolTable(K) {
  const L = 2.5, W = 1.4;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.14, 0.72, 0.14, x * (W / 2 - 0.1), 0.36, z * (L / 2 - 0.12), C.walnut);
  K.box("wood", W, 0.18, L, 0, 0.72, 0, C.walnut);
  K.box("fabric", W - 0.14, 0.02, L - 0.14, 0, 0.815, 0, 0x1a6a3a);
  for (const s of [-1, 1]) { K.box("wood", 0.08, 0.06, L, s * (W / 2 - 0.04), 0.84, 0, 0x4a2e1c); K.box("wood", W, 0.06, 0.08, 0, 0.84, s * (L / 2 - 0.04), 0x4a2e1c); }
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0]]) K.cyl("matte", 0.05, 0.05, 0.02, x * (W / 2 - 0.08), 0.83, z * (L / 2 - 0.08), C.black, { seg: 10 });
  // a racked triangle and the cue ball
  const cols = [0xe8c020, 0x2040c0, 0xc82020, 0x6a2a8a, 0xe87a20, 0x207a3a, 0x7a1a1a, 0x111111, 0xe8c020, 0x2040c0, 0xc82020, 0x6a2a8a, 0xe87a20, 0x207a3a, 0x7a1a1a];
  let k = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) K.sph("gloss", 0.028, (c - r / 2) * 0.058, 0.855, -0.5 - r * 0.05, cols[k++ % 15], { seg: 10, hseg: 8 });
  K.sph("gloss", 0.028, 0, 0.855, 0.6, C.white, { seg: 10, hseg: 8 });
  K.cyl("wood", 0.008, 0.014, 1.45, W / 2 - 0.25, 0.87, 0.2, C.pine, { rx: Math.PI / 2, rz: 0.1, seg: 6 });
  K.block(-W / 2, -L / 2, W / 2, L / 2);
}
export function coatRack(K) {
  K.cyl("metal", 0.2, 0.22, 0.03, 0, 0.015, 0, C.black, { seg: 14 });
  K.cyl("metal", 0.02, 0.02, 1.75, 0, 0.9, 0, C.black, { seg: 8 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; K.cyl("metal", 0.01, 0.01, 0.18, Math.sin(a) * 0.07, 1.72, Math.cos(a) * 0.07, C.black, { rx: Math.cos(a) * 0.8, rz: -Math.sin(a) * 0.8, seg: 5 }); }
  K.box("fabric", 0.36, 0.8, 0.14, 0.08, 1.32, 0.06, 0x3a4a5a, { r: 0.05, rz: 0.08 });
  K.box("fabric", 0.3, 0.6, 0.12, -0.08, 1.42, -0.05, 0x8a3a2a, { r: 0.05, rz: -0.1 });
  K.block(-0.2, -0.2, 0.2, 0.2);
}
export function fullMirror(K) {
  K.box("wood", 0.62, 1.72, 0.04, 0, 0.92, 0, 0xc8a24a, { rx: -0.08 });
  K.box("mirror", 0.54, 1.62, 0.01, 0, 0.92, 0.025, 0xe8eef2, { rx: -0.08 });
}
export function jukebox(K) {
  K.box("wood", 0.9, 1.1, 0.6, 0, 0.55, 0, 0x6a1a1a, { r: 0.04 });
  K.cyl("wood", 0.45, 0.45, 0.6, 0, 1.1, 0, 0x6a1a1a, { rx: Math.PI / 2, seg: 20 });
  K.cyl("glow", 0.4, 0.4, 0.62, 0, 1.1, 0.0, 0xffa040, { rx: Math.PI / 2, seg: 20, em: 1.2 });
  K.box("glass", 0.6, 0.35, 0.01, 0, 0.8, 0.305, 0x1a1418);
  for (let i = 0; i < 5; i++) K.box("glow", 0.04, 0.9, 0.02, -0.36 + i * 0.18, 0.55, 0.31, [0xff3b8b, 0x3bd0ff, 0xffd23b, 0x60ff90, 0xb44bff][i], { em: 2.2 });
  K.box("chrome", 0.7, 0.05, 0.05, 0, 0.3, 0.31, C.chrome);
  K.block(-0.45, -0.3, 0.45, 0.32);
}

// ------------------------------- building services -------------------------------
export function radiator(K, w = 0.9) {
  const n = Math.round(w / 0.07);
  for (let i = 0; i < n; i++) K.box("metal", 0.05, 0.55, 0.08, -w / 2 + (i + 0.5) * w / n, 0.42, 0.06, 0xe8e8e4, { r: 0.02 });
  K.box("metal", w, 0.03, 0.04, 0, 0.15, 0.06, 0xe8e8e4); K.cyl("chrome", 0.012, 0.012, 0.12, w / 2 + 0.04, 0.2, 0.06, C.chrome, { seg: 6 });
}
export function extinguisher(K) {
  K.cyl("gloss", 0.075, 0.075, 0.45, 0, 0.52, 0.09, 0xc81e1e, { seg: 12 });
  K.sph("gloss", 0.075, 0, 0.745, 0.09, 0xc81e1e, { half: true, seg: 12 });
  K.box("metal", 0.1, 0.06, 0.04, 0, 0.8, 0.09, C.black); K.cyl("matte", 0.012, 0.012, 0.3, 0.07, 0.62, 0.12, C.black, { rz: 0.3, seg: 6 });
  K.box("metal", 0.2, 0.04, 0.12, 0, 0.3, 0.07, C.charcoal);
}
export function trashBin(K) {
  K.cyl("metal", 0.17, 0.14, 0.5, 0, 0.25, 0, 0x5a5e62, { seg: 14 });
  K.cyl("metal", 0.18, 0.18, 0.04, 0, 0.52, 0, 0x4a4e52, { seg: 14 });
  K.block(-0.18, -0.18, 0.18, 0.18);
}
export function noticeBoard(K, w = 1.2) {
  K.box("wood", w + 0.06, 0.86, 0.03, 0, 1.55, 0.015, C.walnut);
  K.box("matte", w, 0.8, 0.02, 0, 1.55, 0.03, 0xb8905a);
  for (let i = 0; i < 9; i++) { const x = -w / 2 + 0.15 + rnd() * (w - 0.3), y = 1.25 + rnd() * 0.6; K.box("matte", 0.16 + rnd() * 0.08, 0.2 + rnd() * 0.06, 0.004, x, y, 0.043, pick([0xf8f6ee, 0xf8e880, 0xa8e0f8, 0xf8c0d0]), { rz: (rnd() - 0.5) * 0.2 }); K.sph("gloss", 0.01, x, y + 0.1, 0.05, pick([0xd82a2a, 0x2a6ad8, 0x2ab83a]), { seg: 6, hseg: 4 }); }
}
export function switchPlate(K) { K.box("gloss", 0.08, 0.12, 0.012, 0, 1.2, 0.006, 0xf4f4f0); K.box("gloss", 0.025, 0.04, 0.012, 0, 1.2, 0.014, 0xe8e8e4); }
export function smokeDetector(K, x, z, H) { K.cyl("gloss", 0.07, 0.075, 0.035, x, H - 0.018, z, C.white, { seg: 14 }); K.sph("glow", 0.008, x + 0.03, H - 0.038, z, 0xff2020, { em: 3, seg: 5, hseg: 4 }); }
export function vent(K, x, z, H) { K.box("metal", 0.5, 0.02, 0.5, x, H - 0.01, z, 0xe0e0dc); for (let i = 0; i < 6; i++) K.box("metal", 0.44, 0.02, 0.02, x, H - 0.025, z - 0.2 + i * 0.08, 0xb8b8b4); }

// ------------------------------- moving parts -------------------------------
const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.9 });
// a ceiling fan with a light bowl: the blades turn. Housing and rotor are one mesh each.
let fanMat = null;
export function ceilingFan(x, z, H, wood = C.walnut) {
  fanMat = fanMat || (() => { const m = vcMaterial({ roughness: 0.45, metalness: 0.3 }); m.envMapIntensity = 0.9; return m; })();
  const g = new THREE.Group(); g.position.set(x, H, z);
  const brass = 0xc8a24a;
  const body = merge([
    place(paint(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), brass), 0, -0.03, 0),
    place(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), brass), 0, -0.2, 0),
    place(paint(new THREE.CylinderGeometry(0.11, 0.09, 0.14, 16), brass), 0, -0.4, 0),
  ]);
  const hm = new THREE.Mesh(body, fanMat); hm.castShadow = true; g.add(hm);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.6) })); bowl.position.y = -0.47; g.add(bowl);
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    const b = paint(new THREE.BoxGeometry(0.13, 0.012, 0.55), wood); b.rotateX(0.12); b.translate(0, 0, 0.42); b.rotateY(a); parts.push(b);
    const k = paint(new THREE.BoxGeometry(0.03, 0.02, 0.16), brass); k.translate(0, 0, 0.13); k.rotateY(a); parts.push(k);
  }
  const rotor = new THREE.Mesh(merge(parts), fanMat); rotor.position.y = -0.36; rotor.castShadow = true; g.add(rotor);
  return { group: g, update: (t, dt) => { rotor.rotation.y += dt * 4.2; } };
}
// an aquarium on its stand: fish cruising back and forth, bubbles rising from the air stone
export function aquarium(K, w = 1.4, h = 0.7, d = 0.5, o = {}) {
  // stand
  K.box("wood", w + 0.04, 0.8, d + 0.04, 0, 0.4, 0, o.wood ?? C.black, { r: 0.01 });
  for (const s of [-1, 1]) K.box("wood", w / 2 - 0.03, 0.66, 0.012, s * w / 4, 0.4, d / 2 + 0.02, 0x2a2a2e);
  const y0 = 0.82;
  // glass box, sand, rocks, weed, the lid with its light
  K.box("glass", w, h, 0.012, 0, y0 + h / 2, d / 2, 0xdff0f8); K.box("glass", w, h, 0.012, 0, y0 + h / 2, -d / 2, 0xdff0f8);
  K.box("glass", 0.012, h, d, w / 2, y0 + h / 2, 0, 0xdff0f8); K.box("glass", 0.012, h, d, -w / 2, y0 + h / 2, 0, 0xdff0f8);
  K.box("matte", w - 0.02, 0.07, d - 0.02, 0, y0 + 0.035, 0, 0xe0c898);
  for (let i = 0; i < 5; i++) K.sph("matte", 0.05 + rnd() * 0.05, -w / 2 + 0.15 + rnd() * (w - 0.3), y0 + 0.07, (rnd() - 0.5) * (d - 0.15), pick([0x6a6a70, 0x8a7a6a, 0x5a5a5a]), { seg: 8, hseg: 6, sy: 0.7 });
  for (let i = 0; i < 9; i++) { const x = -w / 2 + 0.1 + rnd() * (w - 0.2), z = (rnd() - 0.5) * (d - 0.12), hh = 0.2 + rnd() * 0.35; K.box("matte", 0.03, hh, 0.006, x, y0 + 0.07 + hh / 2, z, pick([0x2a8a3a, 0x3aa84a, 0x5ab83a]), { ry: rnd() * 3, rz: (rnd() - 0.5) * 0.3 }); }
  K.box("gloss", w + 0.04, 0.05, d + 0.04, 0, y0 + h + 0.025, 0, C.black);
  K.box("glow", w - 0.1, 0.01, 0.08, 0, y0 + h - 0.005, 0, 0xc8f0ff, { em: 2.5 });
  K.block(-w / 2 - 0.02, -d / 2 - 0.02, w / 2 + 0.02, d / 2 + 0.04);
  // the water and the fish live in their own group
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, h - 0.08, d - 0.03), new THREE.MeshStandardMaterial({ color: 0x3aa8d8, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, envMapIntensity: 1.2 }));
  water.position.y = y0 + (h - 0.08) / 2 + 0.01; g.add(water);
  const fish = [];
  const cols = [0xff7a1a, 0x1ab8ff, 0xffd020, 0xff3a6a, 0x9a5aff, 0xffffff, 0x20e080];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Group(), col = cols[i % cols.length], m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, emissive: col, emissiveIntensity: 0.25 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m); body.scale.set(0.45, 0.8, 1.2); f.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.05, 4), m); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.055; tail.scale.set(0.3, 1, 1); f.add(tail);
    g.add(f);
    fish.push({ f, tail, ph: rnd() * TAU, sp: 0.35 + rnd() * 0.3, yy: y0 + 0.15 + rnd() * (h - 0.3), zz: (rnd() - 0.5) * (d - 0.15), s: 0.8 + rnd() * 0.5 });
    f.scale.setScalar(fish[i].s);
  }
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.6, roughness: 0.05 }), 14);
  const bs = Array.from({ length: 14 }, () => ({ y: rnd() * h, x: w * 0.35 + (rnd() - 0.5) * 0.05, z: (rnd() - 0.5) * 0.05 }));
  g.add(bub);
  const M4 = new THREE.Matrix4();
  return {
    group: g,
    update(t, dt) {
      for (const q of fish) {
        const a = t * q.sp + q.ph, x = Math.sin(a) * (w / 2 - 0.12), vx = Math.cos(a);
        q.f.position.set(x, q.yy + Math.sin(a * 2.3) * 0.04, q.zz + Math.sin(a * 1.7) * 0.05);
        q.f.rotation.y = vx > 0 ? Math.PI / 2 : -Math.PI / 2;
        q.tail.rotation.y = Math.sin(t * 12 + q.ph) * 0.5;
      }
      bs.forEach((b, i) => { b.y += dt * 0.25; if (b.y > h - 0.1) b.y = 0.08; M4.makeTranslation(b.x + Math.sin(t * 3 + i) * 0.01, y0 + b.y, b.z); bub.setMatrixAt(i, M4); });
      bub.instanceMatrix.needsUpdate = true;
    },
  };
}
