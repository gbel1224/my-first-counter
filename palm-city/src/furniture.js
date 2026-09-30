// Palm City — the furniture kit. Every object is built from its real parts (a chair has four
// tapered legs, a seat, back posts and slats; a desk has a top, a drawer pedestal with handles and a
// modesty panel; a bed has a frame, legs, headboard, mattress, duvet and pillows...), all painted
// with vertex colours and merged per surface type, so a whole furnished building costs ~10 draw calls.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial, softBox } from "./geo.js";

// surface types: one shared material each
const MATS = {};
function mats() {
  if (MATS.matte) return MATS;
  const v = ({ env, ...o }) => { const m = vcMaterial(o); m.envMapIntensity = env ?? 0.12; return m; };
  MATS.matte = v({ roughness: 0.82 });
  MATS.wood = v({ roughness: 0.5 });
  MATS.fabric = v({ roughness: 0.96 });
  MATS.leather = v({ roughness: 0.42, env: 0.2 });
  MATS.gloss = v({ roughness: 0.16, env: 0.25 });                     // ceramic, lacquer, plastic
  MATS.metal = v({ roughness: 0.34, metalness: 0.75, env: 0.45 });
  MATS.chrome = v({ roughness: 0.12, metalness: 0.95, env: 0.7 });
  MATS.glow = v({ roughness: 0.6, emitMul: 1.0 });
  MATS.glass = v({ roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, env: 0.6 });
  return MATS;
}

const TAU = Math.PI * 2;
export function makeKit() {
  const buckets = {};
  const stack = [new THREE.Matrix4()];
  const blocks = [];
  let M = stack[0];
  const K = {
    blocks,
    // move the origin (and turn) for everything added until pop()
    push(x = 0, z = 0, ry = 0, y = 0) { const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); M = M.clone().multiply(m); stack.push(M); return K; },
    pop() { stack.pop(); M = stack[stack.length - 1]; return K; },
    add(mat, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, em = 0, sx = 1, sy = sx, sz = sx) {
      const g = paint(geo, color, em); place(g, x, y, z, rx, ry, rz, sx, sy, sz); g.applyMatrix4(M);
      (buckets[mat] || (buckets[mat] = [])).push(g); return g;
    },
    box(mat, w, h, d, x, y, z, color, o = {}) {
      const geo = o.r ? softBox(w, h, d, o.r) : new THREE.BoxGeometry(w, h, d);
      return K.add(mat, geo, color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.em || 0);
    },
    cyl(mat, rt, rb, h, x, y, z, color, o = {}) {
      return K.add(mat, new THREE.CylinderGeometry(rt, rb, h, o.seg || 12, 1, !!o.open), color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.em || 0);
    },
    sph(mat, r, x, y, z, color, o = {}) {
      return K.add(mat, new THREE.SphereGeometry(r, o.seg || 12, o.hseg || 8, 0, TAU, 0, o.half ? Math.PI / 2 : Math.PI), color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.em || 0, o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1);
    },
    torus(mat, R, r, x, y, z, color, o = {}) {
      return K.add(mat, new THREE.TorusGeometry(R, r, o.rs || 6, o.ts || 18, o.arc || TAU), color, x, y, z, o.rx ?? Math.PI / 2, o.ry || 0, o.rz || 0, o.em || 0, o.sx || 1, o.sy || o.sx || 1, o.sz || 1);
    },
    lathe(mat, pts, x, y, z, color, o = {}) {
      return K.add(mat, new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), o.seg || 14), color, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.em || 0, o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1);
    },
    // a collision footprint in the current frame (converted to a building-space AABB)
    block(x0, z0, x1, z1) {
      const v = new THREE.Vector3(); let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { v.set(x, 0, z).applyMatrix4(M); a = Math.min(a, v.x); b = Math.max(b, v.x); c = Math.min(c, v.z); d = Math.max(d, v.z); }
      blocks.push([a, b, c, d]); return K;
    },
    // where a local point lands in building space (for spots, NPCs)
    where(x, z) { const v = new THREE.Vector3(x, 0, z).applyMatrix4(M); return { x: v.x, z: v.z }; },
    build() {
      const grp = new THREE.Group(), MT = mats();
      for (const k in buckets) {
        const mesh = new THREE.Mesh(merge(buckets[k]), MT[k]);
        mesh.castShadow = k !== "glass" && k !== "glow"; mesh.receiveShadow = k !== "glass";
        grp.add(mesh);
        for (const g of buckets[k]) g.dispose();
      }
      return grp;
    },
  };
  return K;
}

// ---- colours ----
export const C = {
  oak: 0x9a6c42, walnut: 0x5a3a24, pine: 0xc49a64, ebony: 0x2a2220, white: 0xf2f0ea, offwhite: 0xe6e0d4, black: 0x1a1a1c,
  steel: 0xb8bcc2, chrome: 0xdfe3e8, brass: 0xc8a24a, stone: 0xd8d4cc, marble: 0xeceae4, charcoal: 0x34363a, terracotta: 0xb8643a,
  leaf: 0x2f6e36, leaf2: 0x4a8a3e, soil: 0x3a2a1e, cream: 0xf4ecd8, red: 0xa8322c, navy: 0x2a3a5a, teal: 0x2a6a6a,
};
const rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];

// ============================== seating ==============================
export function chair(K, o = {}) {
  const wd = o.wood ?? C.oak, seat = o.seat;
  for (const [x, z] of [[-0.19, 0.18], [0.19, 0.18], [-0.19, -0.18], [0.19, -0.18]]) K.cyl("wood", 0.02, 0.016, 0.44, x, 0.22, z, wd, { seg: 8 });
  for (const z of [0.18, -0.18]) K.box("wood", 0.36, 0.025, 0.02, 0, 0.12, z, wd);
  K.box("wood", 0.44, 0.045, 0.42, 0, 0.46, 0, wd, { r: 0.012 });
  if (seat !== undefined) K.box("fabric", 0.4, 0.04, 0.38, 0, 0.5, 0.01, seat, { r: 0.018 });
  for (const x of [-0.19, 0.19]) K.cyl("wood", 0.018, 0.02, 0.48, x, 0.7, -0.2, wd, { seg: 8, rx: -0.07 });
  K.box("wood", 0.42, 0.075, 0.025, 0, 0.9, -0.215, wd, { r: 0.01, rx: -0.07 });
  for (const x of [-0.09, 0, 0.09]) K.box("wood", 0.035, 0.3, 0.015, x, 0.69, -0.205, wd, { rx: -0.07 });
  K.block(-0.24, -0.24, 0.24, 0.24);
}
export function officeChair(K, o = {}) {
  const fab = o.color ?? C.charcoal;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    K.box("metal", 0.05, 0.035, 0.3, Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15, C.black, { ry: a });
    K.sph("gloss", 0.035, Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29, C.black, { seg: 8, hseg: 6 });
  }
  K.cyl("chrome", 0.025, 0.025, 0.34, 0, 0.26, 0, C.chrome, { seg: 10 });
  K.box("fabric", 0.5, 0.08, 0.48, 0, 0.47, 0, fab, { r: 0.035 });
  K.box("metal", 0.06, 0.34, 0.03, 0, 0.62, -0.25, C.black);
  K.box("fabric", 0.46, 0.5, 0.07, 0, 0.84, -0.27, fab, { r: 0.03, rx: -0.1 });
  for (const x of [-0.26, 0.26]) { K.box("metal", 0.03, 0.18, 0.03, x, 0.6, 0, C.black); K.box("leather", 0.07, 0.03, 0.26, x, 0.7, 0, C.black, { r: 0.012 }); }
  K.block(-0.3, -0.3, 0.3, 0.3);
}
export function stool(K, o = {}) {
  const top = o.color ?? C.red, h = o.h ?? 0.76;
  K.cyl("chrome", 0.2, 0.22, 0.02, 0, 0.01, 0, C.chrome, { seg: 18 });
  K.cyl("chrome", 0.028, 0.028, h - 0.06, 0, h / 2, 0, C.chrome, { seg: 10 });
  K.torus("chrome", 0.17, 0.012, 0, h * 0.38, 0, C.chrome);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; K.box("chrome", 0.012, 0.012, 0.16, Math.sin(a) * 0.09, h * 0.38, Math.cos(a) * 0.09, C.chrome, { ry: a }); }
  K.cyl("leather", 0.19, 0.18, 0.07, 0, h, 0, top, { seg: 18 });
  K.torus("chrome", 0.185, 0.012, 0, h - 0.03, 0, C.chrome, { ts: 24 });
  K.block(-0.2, -0.2, 0.2, 0.2);
}
export function sofa(K, w, color, o = {}) {
  const legC = o.legs ?? C.walnut, n = w > 1.9 ? 3 : 2, cw = (w - 0.4) / n;
  for (const [x, z] of [[-w / 2 + 0.1, 0.34], [w / 2 - 0.1, 0.34], [-w / 2 + 0.1, -0.34], [w / 2 - 0.1, -0.34]]) K.cyl("wood", 0.025, 0.018, 0.1, x, 0.05, z, legC, { seg: 8 });
  K.box("fabric", w, 0.22, 0.88, 0, 0.21, 0, color, { r: 0.04 });
  K.box("fabric", w, 0.52, 0.2, 0, 0.56, -0.34, color, { r: 0.06 });
  for (const s of [-1, 1]) K.box("fabric", 0.2, 0.36, 0.88, s * (w / 2 - 0.1), 0.46, 0, color, { r: 0.07 });
  const cushion = new THREE.Color(color).multiplyScalar(1.08).getHex();
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + cw * (i + 0.5);
    K.box("fabric", cw - 0.02, 0.15, 0.64, x, 0.39, 0.09, cushion, { r: 0.05 });
    K.box("fabric", cw - 0.03, 0.44, 0.17, x, 0.66, -0.2, cushion, { r: 0.06, rx: -0.14 });
  }
  if (o.pillows !== false) for (const s of [-1, 1]) K.box("fabric", 0.38, 0.36, 0.12, s * (w / 2 - 0.42), 0.62, -0.06, o.accent ?? C.cream, { r: 0.06, rx: -0.3, rz: s * 0.12 });
  K.block(-w / 2, -0.45, w / 2, 0.45);
}
export function armchair(K, color) {
  for (const [x, z] of [[-0.34, 0.3], [0.34, 0.3], [-0.34, -0.3], [0.34, -0.3]]) K.cyl("wood", 0.025, 0.018, 0.12, x, 0.06, z, C.walnut, { seg: 8 });
  K.box("fabric", 0.84, 0.22, 0.82, 0, 0.23, 0, color, { r: 0.05 });
  K.box("fabric", 0.84, 0.56, 0.2, 0, 0.6, -0.32, color, { r: 0.07, rx: -0.08 });
  for (const s of [-1, 1]) K.box("fabric", 0.16, 0.34, 0.8, s * 0.34, 0.48, 0, color, { r: 0.07 });
  K.box("fabric", 0.52, 0.14, 0.6, 0, 0.4, 0.08, new THREE.Color(color).multiplyScalar(1.08).getHex(), { r: 0.05 });
  K.block(-0.44, -0.42, 0.44, 0.42);
}
// restaurant booth: upholstered bench with a tall channel-tufted back
export function booth(K, len, color, o = {}) {
  const wd = o.wood ?? C.walnut;
  K.box("wood", len, 0.4, 0.5, 0, 0.2, 0, wd, { r: 0.01 });
  K.box("leather", len - 0.04, 0.1, 0.5, 0, 0.45, 0.02, color, { r: 0.04 });
  K.box("wood", len, 1.1, 0.12, 0, 0.55, -0.3, wd, { r: 0.01 });
  const n = Math.round(len / 0.22);
  for (let i = 0; i < n; i++) K.box("leather", len / n - 0.015, 0.56, 0.08, -len / 2 + (i + 0.5) * len / n, 0.8, -0.21, color, { r: 0.03 });
  for (const s of [-1, 1]) K.box("wood", 0.05, 1.12, 0.62, s * (len / 2 + 0.02), 0.56, -0.05, wd, { r: 0.01 });
  K.block(-len / 2 - 0.05, -0.38, len / 2 + 0.05, 0.28);
}
export function bench(K, len, o = {}) {
  const wd = o.wood ?? C.oak;
  for (let i = 0; i < 4; i++) K.box("wood", len, 0.035, 0.085, 0, 0.44, -0.15 + i * 0.1, wd, { r: 0.008 });
  for (const s of [-1, 1]) { K.box("metal", 0.05, 0.42, 0.05, s * (len / 2 - 0.15), 0.21, 0.13, C.charcoal); K.box("metal", 0.05, 0.42, 0.05, s * (len / 2 - 0.15), 0.21, -0.13, C.charcoal); K.box("metal", 0.05, 0.04, 0.34, s * (len / 2 - 0.15), 0.41, 0, C.charcoal); }
  K.block(-len / 2, -0.22, len / 2, 0.22);
}
// a row of linked waiting-room seats on a steel beam
export function waitingSeats(K, n, color) {
  const pitch = 0.6, w = n * pitch;
  K.box("metal", w, 0.05, 0.06, 0, 0.36, -0.05, C.steel);
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) { K.box("metal", 0.05, 0.36, 0.05, x, 0.18, -0.05, C.steel); K.box("metal", 0.06, 0.02, 0.5, x, 0.01, -0.05, C.steel); }
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pitch * (i + 0.5);
    K.box("gloss", 0.5, 0.05, 0.45, x, 0.44, 0.02, color, { r: 0.02 });
    K.box("gloss", 0.5, 0.42, 0.04, x, 0.7, -0.21, color, { r: 0.02, rx: -0.12 });
    if (i < n - 1) K.box("metal", 0.04, 0.2, 0.3, x + pitch / 2, 0.55, 0, C.steel);
  }
  K.block(-w / 2, -0.3, w / 2, 0.28);
}

// ============================== tables ==============================
export function diningTable(K, w, d, o = {}) {
  const wd = o.wood ?? C.oak;
  K.box("wood", w, 0.04, d, 0, 0.74, 0, wd, { r: 0.012 });
  K.box("wood", w - 0.16, 0.08, 0.025, 0, 0.68, d / 2 - 0.08, wd); K.box("wood", w - 0.16, 0.08, 0.025, 0, 0.68, -d / 2 + 0.08, wd);
  K.box("wood", 0.025, 0.08, d - 0.16, w / 2 - 0.08, 0.68, 0, wd); K.box("wood", 0.025, 0.08, d - 0.16, -w / 2 + 0.08, 0.68, 0, wd);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.06, 0.72, 0.06, x * (w / 2 - 0.08), 0.36, z * (d / 2 - 0.08), wd);
  K.block(-w / 2, -d / 2, w / 2, d / 2);
}
export function roundTable(K, r, o = {}) {
  const top = o.top ?? C.marble, h = o.h ?? 0.74;
  K.cyl("gloss", r, r, 0.035, 0, h, 0, top, { seg: 24 });
  K.cyl("metal", 0.035, 0.035, h - 0.04, 0, h / 2, 0, o.leg ?? C.charcoal, { seg: 10 });
  K.cyl("metal", 0.22, 0.24, 0.025, 0, 0.012, 0, o.leg ?? C.charcoal, { seg: 20 });
  K.block(-r, -r, r, r);
}
export function coffeeTable(K, w, d, o = {}) {
  const wd = o.wood ?? C.walnut, glass = o.glass;
  if (glass) K.box("glass", w, 0.02, d, 0, 0.42, 0, 0xcfe6ee);
  else K.box("wood", w, 0.04, d, 0, 0.42, 0, wd, { r: 0.012 });
  K.box("wood", w - 0.12, 0.025, d - 0.12, 0, 0.14, 0, wd);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box(glass ? "chrome" : "wood", 0.04, 0.42, 0.04, x * (w / 2 - 0.05), 0.21, z * (d / 2 - 0.05), glass ? C.chrome : wd);
  // a magazine and a bowl
  K.box("matte", 0.22, 0.012, 0.3, -w * 0.2, 0.45, 0.02, 0xd8cfb8, { ry: 0.3 });
  K.lathe("gloss", [[0.001, 0], [0.09, 0.01], [0.12, 0.06], [0.115, 0.065]], w * 0.22, 0.44, 0, 0x2a4a6a);
  K.block(-w / 2, -d / 2, w / 2, d / 2);
}

// ============================== desks & offices ==============================
function monitor(K, x, y, z, ry = 0) {
  K.push(x, z, ry, y);
  K.box("gloss", 0.2, 0.012, 0.14, 0, 0.006, 0, C.black);
  K.box("metal", 0.04, 0.2, 0.025, 0, 0.11, -0.03, C.charcoal);
  K.box("gloss", 0.56, 0.34, 0.03, 0, 0.36, -0.01, C.black, { r: 0.008 });
  K.box("glow", 0.53, 0.31, 0.005, 0, 0.36, 0.007, 0x5a8ad0, { em: 0.9 });
  K.pop();
}
export function desk(K, w, o = {}) {
  const wd = o.wood ?? C.walnut, d = o.d ?? 0.75;
  K.box("wood", w, 0.035, d, 0, 0.745, 0, wd, { r: 0.008 });
  // drawer pedestal on the right, a panel leg on the left, a modesty panel at the back
  const px = w / 2 - 0.23;
  K.box("wood", 0.44, 0.72, d - 0.04, px, 0.36, 0, wd);
  for (let i = 0; i < 3; i++) { K.box("wood", 0.4, 0.205, 0.02, px, 0.14 + i * 0.225, d / 2 - 0.01, new THREE.Color(wd).multiplyScalar(1.12).getHex(), { r: 0.006 }); K.box("chrome", 0.14, 0.018, 0.02, px, 0.19 + i * 0.225, d / 2 + 0.012, C.chrome); }
  K.box("wood", 0.04, 0.72, d - 0.04, -w / 2 + 0.03, 0.36, 0, wd);
  K.box("wood", w - 0.5, 0.4, 0.02, -0.2, 0.52, -d / 2 + 0.04, wd);
  if (o.bare) { K.block(-w / 2, -d / 2, w / 2, d / 2); return; }
  monitor(K, -0.1, 0.765, -0.12);
  K.box("gloss", 0.44, 0.02, 0.14, -0.1, 0.775, 0.16, C.charcoal, { r: 0.006 });
  for (let r = 0; r < 4; r++) K.box("matte", 0.4, 0.004, 0.022, -0.1, 0.787, 0.115 + r * 0.03, 0x4a4c50);
  K.box("gloss", 0.06, 0.02, 0.1, 0.22, 0.775, 0.17, C.charcoal, { r: 0.01 });
  // mug and a stack of papers
  K.cyl("gloss", 0.04, 0.036, 0.1, w / 2 - 0.25, 0.815, 0.05, pick([0xe8e4dc, 0xa83232, 0x2a5a8a]), { seg: 12 });
  K.torus("gloss", 0.03, 0.008, w / 2 - 0.2, 0.815, 0.05, 0xe8e4dc, { rx: 0, ry: 0 });
  for (let i = 0; i < 5; i++) K.box("matte", 0.21, 0.004, 0.297, -w / 2 + 0.3, 0.765 + i * 0.005, 0.1, 0xf6f4ee, { ry: (rnd() - 0.5) * 0.2 });
  K.block(-w / 2, -d / 2, w / 2, d / 2);
}
export function receptionDesk(K, w, o = {}) {
  const front = o.front ?? C.walnut, top = o.top ?? C.marble;
  K.box("wood", w, 1.08, 0.12, 0, 0.54, 0.34, front, { r: 0.01 });
  K.box("gloss", w + 0.06, 0.04, 0.36, 0, 1.1, 0.3, top, { r: 0.01 });
  for (const s of [-1, 1]) K.box("wood", 0.1, 1.08, 0.8, s * (w / 2 - 0.05), 0.54, 0, front);
  K.box("wood", w - 0.2, 0.035, 0.6, 0, 0.75, -0.08, front);
  K.box("glow", w - 0.1, 0.02, 0.01, 0, 1.03, 0.405, 0xfff0c8, { em: 1.2 });            // under-counter light strip
  monitor(K, -w * 0.2, 0.77, -0.15);
  K.box("gloss", 0.44, 0.02, 0.14, -w * 0.2, 0.78, 0.1, C.charcoal);
  K.sph("chrome", 0.045, w * 0.3, 1.12, 0.3, C.chrome, { half: true, seg: 10 });   // service bell
  K.block(-w / 2, -0.4, w / 2, 0.42);
}
export function filingCabinet(K, o = {}) {
  const col = o.color ?? 0x7a8088;
  K.box("metal", 0.46, 1.32, 0.6, 0, 0.66, 0, col, { r: 0.01 });
  for (let i = 0; i < 4; i++) { K.box("metal", 0.42, 0.29, 0.01, 0, 0.2 + i * 0.31, 0.301, new THREE.Color(col).multiplyScalar(1.1).getHex()); K.box("chrome", 0.12, 0.02, 0.025, 0, 0.3 + i * 0.31, 0.31, C.chrome); K.box("matte", 0.07, 0.035, 0.005, 0, 0.26 + i * 0.31, 0.307, 0xf4f0e0); }
  K.block(-0.24, -0.3, 0.24, 0.32);
}
export function waterCooler(K) {
  K.box("gloss", 0.32, 0.95, 0.32, 0, 0.475, 0, C.white, { r: 0.03 });
  K.box("glow", 0.02, 0.02, 0.005, -0.06, 0.8, 0.162, 0xff3030, { em: 1 }); K.box("glow", 0.02, 0.02, 0.005, 0.06, 0.8, 0.162, 0x3070ff, { em: 1 });
  K.box("chrome", 0.2, 0.02, 0.08, 0, 0.62, 0.16, C.chrome);
  K.lathe("glass", [[0.001, 0], [0.13, 0.02], [0.14, 0.1], [0.14, 0.36], [0.12, 0.4], [0.04, 0.44], [0.035, 0.47]], 0, 0.96, 0, 0x7ab8e8);
  K.block(-0.18, -0.18, 0.18, 0.18);
}
export function whiteboard(K, w) {
  K.box("metal", w + 0.04, 1.04, 0.03, 0, 1.5, 0.015, C.steel);
  K.box("gloss", w, 1.0, 0.01, 0, 1.5, 0.035, C.white);
  K.box("metal", w * 0.8, 0.02, 0.06, 0, 0.99, 0.05, C.steel);
  for (let i = 0; i < 5; i++) K.box("matte", 0.2 + rnd() * 0.5, 0.012, 0.004, -w / 2 + 0.3 + rnd() * (w - 0.8), 1.2 + rnd() * 0.55, 0.042, pick([0x2244aa, 0xaa2222, 0x222222, 0x228844]));
  K.cyl("gloss", 0.008, 0.008, 0.12, 0.1, 1.0, 0.05, 0x2244aa, { rz: Math.PI / 2, seg: 6 });
}
export function coffeeMachine(K) {
  K.box("gloss", 0.34, 0.42, 0.36, 0, 0.21, 0, C.black, { r: 0.02 });
  K.box("chrome", 0.3, 0.06, 0.2, 0, 0.1, 0.12, C.chrome);
  K.box("glow", 0.1, 0.04, 0.005, 0.05, 0.34, 0.182, 0x60ff90, { em: 0.9 });
  K.cyl("gloss", 0.035, 0.03, 0.08, -0.05, 0.17, 0.12, C.white, { seg: 10 });
}
export function lockers(K, n, color = 0x4a6a8a) {
  const w = n * 0.4;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + i * 0.4;
    K.box("metal", 0.39, 1.9, 0.5, x, 0.95, 0, color);
    for (let v = 0; v < 4; v++) K.box("matte", 0.22, 0.012, 0.005, x, 1.6 + v * 0.04, 0.252, 0x1a1a1c);
    K.box("chrome", 0.025, 0.12, 0.025, x + 0.13, 1.05, 0.26, C.chrome);
  }
  K.block(-w / 2, -0.25, w / 2, 0.28);
}

// ============================== bedroom ==============================
export function bed(K, w, l, duvet, o = {}) {
  const wd = o.wood ?? C.walnut;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("wood", 0.035, 0.03, 0.14, x * (w / 2 - 0.02), 0.07, z * (l / 2 - 0.02), wd, { seg: 8 });
  K.box("wood", w + 0.08, 0.2, l + 0.04, 0, 0.24, 0, wd, { r: 0.015 });
  K.box("wood", w + 0.12, 1.12, 0.08, 0, 0.56, -l / 2 - 0.02, wd, { r: 0.02 });
  K.box("fabric", w - 0.08, 0.62, 0.06, 0, 0.8, -l / 2 + 0.04, o.head ?? 0xb8ae9c, { r: 0.03 });
  for (let i = 1; i < 4; i++) K.box("fabric", 0.012, 0.58, 0.01, -w / 2 + i * w / 4, 0.8, -l / 2 + 0.075, 0x9a9080);
  K.box("fabric", w, 0.22, l - 0.04, 0, 0.45, 0, C.white, { r: 0.05 });
  K.box("fabric", w + 0.06, 0.07, l * 0.66, 0, 0.585, l * 0.17, duvet, { r: 0.035 });
  K.box("fabric", w + 0.07, 0.09, 0.22, 0, 0.6, -l * 0.17, new THREE.Color(duvet).lerp(new THREE.Color(0xffffff), 0.5).getHex(), { r: 0.04 });
  for (const s of [-1, 1]) K.box("fabric", w / 2 - 0.1, 0.13, 0.34, s * w / 4, 0.62, -l / 2 + 0.28, C.white, { r: 0.06, rx: -0.3 });
  const thr = o.throw ?? new THREE.Color(duvet).multiplyScalar(0.6).getHex();
  K.box("fabric", w + 0.1, 0.03, 0.46, 0, 0.635, l / 2 - 0.3, thr, { r: 0.012 });
  for (const sd of [-1, 1]) K.box("fabric", 0.03, 0.26, 0.46, sd * (w / 2 + 0.05), 0.51, l / 2 - 0.3, thr, { r: 0.01 });
  K.block(-w / 2 - 0.06, -l / 2 - 0.06, w / 2 + 0.06, l / 2);
}
export function nightstand(K, o = {}) {
  const wd = o.wood ?? C.walnut;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.03, 0.12, 0.03, x * 0.2, 0.06, z * 0.17, wd);
  K.box("wood", 0.46, 0.44, 0.4, 0, 0.34, 0, wd, { r: 0.012 });
  K.box("wood", 0.42, 0.16, 0.012, 0, 0.44, 0.2, new THREE.Color(wd).multiplyScalar(1.15).getHex(), { r: 0.005 });
  K.sph("chrome", 0.018, 0, 0.44, 0.215, C.brass, { seg: 8, hseg: 6 });
  tableLamp(K, 0.1, 0.56, -0.02, o.shade ?? 0xf0e6d0);
  K.block(-0.24, -0.21, 0.24, 0.21);
}
export function tableLamp(K, x, y, z, shade = 0xf0e6d0) {
  K.lathe("gloss", [[0.001, 0], [0.07, 0], [0.075, 0.02], [0.05, 0.1], [0.06, 0.2], [0.02, 0.26], [0.012, 0.3]], x, y, z, 0x4a5a6a);
  K.sph("glow", 0.04, x, y + 0.33, z, 0xfff0c0, { em: 2.2, seg: 8, hseg: 6 });
  K.lathe("fabric", [[0.13, 0], [0.085, 0.2]], x, y + 0.24, z, shade, { em: 0.35 });
}
export function floorLamp(K, shade = 0xf0e6d0) {
  K.cyl("metal", 0.16, 0.18, 0.03, 0, 0.015, 0, C.black, { seg: 18 });
  K.cyl("metal", 0.015, 0.015, 1.55, 0, 0.8, 0, C.black, { seg: 8 });
  K.sph("glow", 0.06, 0, 1.6, 0, 0xfff0c0, { em: 2.4, seg: 8, hseg: 6 });
  K.lathe("fabric", [[0.24, 0], [0.16, 0.34]], 0, 1.44, 0, shade, { em: 0.4, seg: 20 });
  K.block(-0.18, -0.18, 0.18, 0.18);
}
export function wardrobe(K, w, o = {}) {
  const wd = o.wood ?? C.offwhite, h = 2.05;
  K.box("wood", w, h, 0.6, 0, h / 2 + 0.04, 0, wd);
  K.box("wood", w - 0.04, 0.04, 0.58, 0, 0.02, 0, C.black);
  const n = w > 1.3 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const dw = w / n, x = -w / 2 + dw * (i + 0.5);
    K.box("wood", dw - 0.012, h - 0.04, 0.02, x, h / 2 + 0.04, 0.305, new THREE.Color(wd).multiplyScalar(1.04).getHex(), { r: 0.005 });
    K.box("chrome", 0.018, 0.34, 0.025, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), 1.05, 0.33, C.chrome);
  }
  K.box("wood", w + 0.04, 0.05, 0.64, 0, h + 0.065, 0.01, wd);
  K.block(-w / 2, -0.3, w / 2, 0.34);
}
export function dresser(K, w) {
  K.box("wood", w, 0.8, 0.46, 0, 0.46, 0, C.walnut, { r: 0.01 });
  for (const x of [-1, 1]) for (let i = 0; i < 3; i++) { K.box("wood", w / 2 - 0.03, 0.22, 0.012, x * w / 4, 0.22 + i * 0.25, 0.232, 0x6a4a30, { r: 0.004 }); K.box("chrome", 0.1, 0.015, 0.02, x * w / 4, 0.26 + i * 0.25, 0.245, C.brass); }
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.035, 0.08, 0.035, x * (w / 2 - 0.03), 0.04, z * 0.2, C.walnut);
  K.box("wood", 0.8, 1.0, 0.03, 0, 1.48, -0.21, C.walnut);
  K.box("glass", 0.72, 0.92, 0.006, 0, 1.48, -0.19, 0xdde6ee);
  K.block(-w / 2, -0.24, w / 2, 0.26);
}

// ============================== living ==============================
export function bookshelf(K, w, h = 2.0, o = {}) {
  const wd = o.wood ?? C.walnut, d = 0.32, n = Math.round(h / 0.38);
  for (const s of [-1, 1]) K.box("wood", 0.03, h, d, s * (w / 2 - 0.015), h / 2, 0, wd);
  K.box("wood", w, 0.03, d, 0, h - 0.015, 0, wd); K.box("wood", w, 0.08, d, 0, 0.04, 0, wd);
  K.box("wood", w - 0.02, h - 0.02, 0.01, 0, h / 2, -d / 2 + 0.005, new THREE.Color(wd).multiplyScalar(0.8).getHex());
  for (let s = 1; s < n; s++) {
    const y = s * h / n;
    K.box("wood", w - 0.06, 0.025, d - 0.02, 0, y, 0.005, wd);
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.1) {
      if (rnd() < 0.12) {                                        // a gap with an ornament
        if (rnd() < 0.5) K.lathe("gloss", [[0.001, 0], [0.04, 0.01], [0.05, 0.08], [0.025, 0.16], [0.03, 0.18]], x + 0.07, y + 0.012, 0, pick([0x2a6a8a, 0xd8d0c0, 0x8a3a2a]));
        x += 0.16; continue;
      }
      const bw = 0.025 + rnd() * 0.035, bh = 0.18 + rnd() * 0.12;
      const lean = x > w / 2 - 0.25 && rnd() < 0.5 ? 0.25 : 0;
      K.box("matte", bw, bh, 0.19 + rnd() * 0.05, x + bw / 2, y + 0.012 + bh / 2, 0.02, pick([0x7a2e2e, 0x2e4a7a, 0xc8b27a, 0x3a5a3a, 0xd8d0c0, 0x5a3a6a, 0x1e1e22, 0xa8642a]), { rz: -lean });
      x += bw + 0.004;
    }
  }
  K.block(-w / 2, -d / 2, w / 2, d / 2 + 0.02);
}
export function tvUnit(K, w, o = {}) {
  const wd = o.wood ?? C.charcoal;
  K.box("wood", w, 0.46, 0.42, 0, 0.29, 0, wd, { r: 0.012 });
  for (let i = 0; i < 3; i++) { K.box("wood", w / 3 - 0.02, 0.36, 0.012, -w / 3 + i * w / 3, 0.29, 0.212, new THREE.Color(wd).multiplyScalar(1.15).getHex(), { r: 0.004 }); K.box("chrome", 0.12, 0.012, 0.015, -w / 3 + i * w / 3, 0.43, 0.225, C.chrome); }
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) K.box("metal", 0.04, 0.06, 0.38, x, 0.03, 0, C.black);
  // the TV itself (screen returned separately so it can flicker)
  const tw = Math.min(1.5, w - 0.2), th = tw * 0.58;
  K.box("gloss", 0.3, 0.015, 0.2, 0, 0.53, -0.02, C.black);
  K.box("gloss", 0.05, 0.12, 0.03, 0, 0.6, -0.05, C.black);
  K.box("gloss", tw, th, 0.05, 0, 0.66 + th / 2, -0.06, C.black, { r: 0.01 });
  // speaker / console on the shelf
  K.box("gloss", 0.34, 0.06, 0.26, w / 2 - 0.3, 0.55, 0, C.black, { r: 0.01 });
  K.lathe("gloss", [[0.001, 0], [0.05, 0.005], [0.06, 0.12], [0.035, 0.22]], -w / 2 + 0.2, 0.52, 0, 0xd8d0c0);
  K.block(-w / 2, -0.22, w / 2, 0.24);
  return { w: tw, h: th, y: 0.66 + th / 2, z: -0.03 };
}
export function plant(K, kind = "palm", o = {}) {
  const s = o.s ?? 1, pot = o.pot ?? pick([C.terracotta, 0xe8e4dc, 0x2a2a2e]);
  K.lathe("gloss", [[0.001, 0], [0.13 * s, 0], [0.16 * s, 0.05 * s], [0.2 * s, 0.4 * s], [0.21 * s, 0.42 * s], [0.18 * s, 0.42 * s]], 0, 0, 0, pot);
  K.cyl("matte", 0.18 * s, 0.18 * s, 0.01, 0, 0.4 * s, 0, C.soil, { seg: 14 });
  if (kind === "palm") {
    K.cyl("wood", 0.025 * s, 0.035 * s, 0.7 * s, 0, 0.75 * s, 0, 0x6a5a3a, { seg: 6 });
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + rnd() * 0.3, tilt = 0.5 + rnd() * 0.5;
      for (let k = 0; k < 4; k++) {                      // a drooping frond: segments that bend further down along its length
        const r = 0.12 * s + k * 0.13 * s, drop = k * k * 0.03 * s;
        K.box("matte", 0.2 * s - k * 0.03 * s, 0.01, 0.14 * s, Math.sin(a) * r, 1.1 * s + 0.1 * s - drop - k * 0.02, Math.cos(a) * r, i % 2 ? C.leaf : C.leaf2, { ry: a + Math.PI / 2, rz: tilt * 0.3 * (k + 1) });
      }
    }
  } else if (kind === "fern") {
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, r = 0.18 * s, t = 0.6 + rnd() * 0.4;
      K.add("matte", new THREE.ConeGeometry(0.06 * s, 0.55 * s, 4), i % 2 ? C.leaf : C.leaf2, Math.sin(a) * r, 0.62 * s, Math.cos(a) * r, Math.cos(a) * t, 0, -Math.sin(a) * t, 0, 0.45, 1, 1);
    }
  } else if (kind === "snake") {
    for (let i = 0; i < 9; i++) { const a = rnd() * TAU, r = rnd() * 0.08 * s, h = (0.5 + rnd() * 0.45) * s; K.box("matte", 0.05 * s, h, 0.012, Math.sin(a) * r, 0.4 * s + h / 2, Math.cos(a) * r, i % 2 ? 0x3a6a3a : 0x5a8a3a, { ry: a, rz: (rnd() - 0.5) * 0.25 }); }
  } else {                                                  // cactus
    K.cyl("matte", 0.08 * s, 0.09 * s, 0.6 * s, 0, 0.7 * s, 0, 0x4a7a3a, { seg: 10 }); K.sph("matte", 0.08 * s, 0, 1.0 * s, 0, 0x4a7a3a, { seg: 10 });
    for (const sd of [-1, 1]) { K.cyl("matte", 0.045 * s, 0.045 * s, 0.14 * s, sd * 0.13 * s, 0.72 * s + sd * 0.06, 0, 0x4a7a3a, { rz: Math.PI / 2, seg: 8 }); K.cyl("matte", 0.045 * s, 0.045 * s, 0.22 * s, sd * 0.2 * s, 0.82 * s + sd * 0.06, 0, 0x4a7a3a, { seg: 8 }); K.sph("matte", 0.045 * s, sd * 0.2 * s, 0.93 * s + sd * 0.06, 0, 0x4a7a3a, { seg: 8 }); }
  }
  K.block(-0.22 * s, -0.22 * s, 0.22 * s, 0.22 * s);
}

// ============================== kitchen ==============================
function cabinetRun(K, len, top, fronts) {
  K.box("matte", len, 0.1, 0.52, 0, 0.05, -0.02, C.black);
  K.box("wood", len, 0.78, 0.58, 0, 0.49, -0.01, fronts);
  const n = Math.max(1, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * len / n;
    K.box("wood", len / n - 0.012, 0.74, 0.02, x, 0.49, 0.29, new THREE.Color(fronts).multiplyScalar(1.06).getHex(), { r: 0.004 });
    K.box("chrome", 0.012, 0.16, 0.022, x + (i % 2 ? -1 : 1) * (len / n / 2 - 0.06), 0.72, 0.31, C.chrome);
  }
  K.box("gloss", len + 0.02, 0.04, 0.64, 0, 0.9, 0.02, top, { r: 0.006 });
}
// a run of base cabinets against a wall with sink, hob and oven, uppers and a hood above
export function kitchenRun(K, len, o = {}) {
  const top = o.top ?? C.stone, fronts = o.fronts ?? 0x3a4a5a;
  cabinetRun(K, len, top, fronts);
  const sx = -len / 2 + 0.7, hx = len / 2 - 0.7;
  // sink: steel basin set into the counter, gooseneck tap
  K.box("chrome", 0.56, 0.012, 0.42, sx, 0.921, 0.02, C.steel);
  K.box("metal", 0.5, 0.01, 0.36, sx, 0.924, 0.02, 0x6a6e74);
  K.cyl("chrome", 0.018, 0.022, 0.3, sx, 1.07, -0.2, C.chrome, { seg: 8 });
  K.torus("chrome", 0.09, 0.014, sx, 1.22, -0.11, C.chrome, { arc: Math.PI, rx: 0, ry: Math.PI / 2 });
  // hob with burner rings, oven door with a window
  K.box("gloss", 0.6, 0.012, 0.52, hx, 0.925, 0.02, 0x101012);
  for (const [bx, bz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.14], [0.14, 0.14]]) K.torus("metal", 0.07, 0.006, hx + bx, 0.934, 0.02 + bz, 0x5a2a20, { em: 0.2 });
  K.box("gloss", 0.58, 0.5, 0.025, hx, 0.5, 0.3, C.black, { r: 0.006 });
  K.box("glass", 0.44, 0.24, 0.01, hx, 0.52, 0.315, 0x202028);
  K.box("chrome", 0.44, 0.02, 0.03, hx, 0.72, 0.33, C.chrome);
  // uppers and a hood
  if (o.uppers !== false) {
    for (const [x0, x1] of [[-len / 2, hx - 0.4], [hx + 0.4, len / 2]]) {
      const w = x1 - x0; if (w < 0.3) continue;
      K.box("wood", w, 0.7, 0.34, (x0 + x1) / 2, 1.85, -0.13, fronts);
      const n = Math.max(1, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * w / n; K.box("wood", w / n - 0.012, 0.66, 0.02, x, 1.85, 0.045, new THREE.Color(fronts).multiplyScalar(1.06).getHex()); K.box("chrome", 0.012, 0.12, 0.02, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.05), 1.58, 0.065, C.chrome); }
    }
    K.cyl("metal", 0.12, 0.42, 0.3, hx, 1.72, -0.08, C.steel, { seg: 4, ry: Math.PI / 4, sx: 1 });
    K.box("metal", 0.2, 0.5, 0.2, hx, 2.12, -0.16, C.steel);
  }
  // clutter: kettle, cutting board, knife block
  K.lathe("gloss", [[0.001, 0], [0.08, 0], [0.09, 0.08], [0.07, 0.17], [0.03, 0.2]], sx + 0.55, 0.92, -0.05, 0xd8d0c0);
  K.box("wood", 0.36, 0.02, 0.24, (sx + hx) / 2, 0.93, 0.02, C.pine, { r: 0.006, ry: 0.2 });
  K.block(-len / 2, -0.32, len / 2, 0.34);
}
export function fridge(K, o = {}) {
  const col = o.color ?? C.steel, w = 0.82, h = 1.9;
  K.box("metal", w, h, 0.7, 0, h / 2, 0, col, { r: 0.02 });
  K.box("metal", w - 0.01, 0.012, 0.01, 0, 1.3, 0.352, 0x55585c);
  K.box("metal", 0.01, 1.3, 0.01, 0, 0.65, 0.352, 0x55585c);
  for (const s of [-1, 1]) K.box("chrome", 0.025, 0.5, 0.04, s * 0.06, 0.9, 0.38, C.chrome, { r: 0.008 });
  K.box("chrome", 0.3, 0.025, 0.04, 0, 1.36, 0.38, C.chrome);
  K.box("glow", 0.12, 0.05, 0.005, -0.22, 1.12, 0.357, 0x80d0ff, { em: 1.2 });
  K.block(-w / 2, -0.35, w / 2, 0.4);
}
export function kitchenIsland(K, len) {
  cabinetRun(K, len, C.marble, 0xe8e4dc);
  K.box("gloss", len + 0.02, 0.04, 0.3, 0, 0.9, -0.44, C.marble);            // breakfast overhang
  K.lathe("gloss", [[0.001, 0], [0.12, 0.01], [0.16, 0.07], [0.155, 0.08]], 0.3, 0.92, 0, 0xf0f0f0);
  for (let i = 0; i < 3; i++) K.sph("matte", 0.04, 0.26 + (i % 2) * 0.07, 0.99, (i - 1) * 0.06, [0xe8a020, 0xd83a2a, 0x7ab83a][i], { seg: 8, hseg: 6 });
  K.block(-len / 2, -0.6, len / 2, 0.34);
}

// ============================== bathroom ==============================
export function toilet(K) {
  K.lathe("gloss", [[0.001, 0], [0.13, 0], [0.12, 0.2], [0.2, 0.36], [0.19, 0.4], [0.001, 0.4]], 0, 0, 0.04, C.white, { sz: 1.3 });
  K.torus("gloss", 0.17, 0.025, 0, 0.42, 0.04, C.white, { sz: 1.25 });
  K.box("gloss", 0.38, 0.03, 0.46, 0, 0.44, 0.03, C.white, { r: 0.01 });
  K.box("gloss", 0.4, 0.4, 0.18, 0, 0.62, -0.27, C.white, { r: 0.03 });
  K.cyl("chrome", 0.025, 0.025, 0.012, 0, 0.83, -0.27, C.chrome, { seg: 10 });
  K.box("gloss", 0.38, 0.4, 0.025, 0, 0.66, -0.16, C.white, { r: 0.012, rx: -0.12 });
  K.block(-0.22, -0.38, 0.22, 0.34);
}
export function vanity(K, w = 0.9, o = {}) {
  const fr = o.fronts ?? C.offwhite;
  K.box("wood", w, 0.78, 0.48, 0, 0.44, 0, fr, { r: 0.01 });
  for (const s of [-1, 1]) { K.box("wood", w / 2 - 0.02, 0.6, 0.012, s * w / 4, 0.42, 0.24, new THREE.Color(fr).multiplyScalar(1.05).getHex()); K.box("chrome", 0.012, 0.14, 0.02, s * 0.06, 0.6, 0.255, C.chrome); }
  K.box("gloss", w + 0.02, 0.04, 0.5, 0, 0.85, 0, C.marble);
  K.lathe("gloss", [[0.001, 0.02], [0.16, 0.02], [0.2, 0.12], [0.205, 0.14]], 0, 0.86, 0.02, C.white, { sz: 0.8 });
  K.cyl("chrome", 0.015, 0.018, 0.22, 0, 1.0, -0.18, C.chrome, { seg: 8 });
  K.box("chrome", 0.025, 0.025, 0.14, 0, 1.1, -0.12, C.chrome);
  K.box("glass", w - 0.1, 0.8, 0.01, 0, 1.55, -0.23, 0xdde8f0);
  K.box("metal", w - 0.04, 0.84, 0.015, 0, 1.55, -0.245, C.steel);
  K.box("glow", w - 0.2, 0.05, 0.05, 0, 2.02, -0.2, 0xfff4e0, { em: 1.6 });
  K.block(-w / 2, -0.25, w / 2, 0.26);
}
export function bathtub(K, l = 1.7) {
  const w = 0.78, h = 0.56, t = 0.07;
  K.box("gloss", l, 0.06, w, 0, 0.03, 0, C.white);
  K.box("gloss", l, h, t, 0, h / 2, w / 2 - t / 2, C.white, { r: 0.02 }); K.box("gloss", l, h, t, 0, h / 2, -w / 2 + t / 2, C.white, { r: 0.02 });
  K.box("gloss", t, h, w, l / 2 - t / 2, h / 2, 0, C.white, { r: 0.02 }); K.box("gloss", t, h, w, -l / 2 + t / 2, h / 2, 0, C.white, { r: 0.02 });
  K.box("gloss", l - t * 2, 0.05, w - t * 2, 0, 0.12, 0, 0xdce8ee);
  K.box("glass", l - t * 2, 0.02, w - t * 2, 0, 0.36, 0, 0x9ad0e8);                      // water
  K.cyl("chrome", 0.02, 0.02, 0.22, -l / 2 + 0.12, 0.66, -w / 2 + 0.05, C.chrome, { seg: 8 });
  K.box("chrome", 0.025, 0.025, 0.14, -l / 2 + 0.12, 0.76, -w / 2 + 0.11, C.chrome);
  // a glass shower screen at the tap end and a rain head on the wall
  K.box("glass", 0.02, 1.35, w * 0.72, -l / 2 + 0.75, 1.24, -0.08, 0xdde8ee);
  K.box("chrome", 0.025, 1.35, 0.025, -l / 2 + 0.75, 1.24, w * 0.28, C.chrome);
  K.box("chrome", 0.025, 0.025, w * 0.72, -l / 2 + 0.75, 1.92, -0.08, C.chrome);
  K.cyl("chrome", 0.012, 0.012, 1.3, -l / 2 + 0.3, 1.35, -w / 2 + 0.03, C.chrome, { seg: 6 });
  K.box("chrome", 0.025, 0.025, 0.28, -l / 2 + 0.3, 2.0, -w / 2 + 0.16, C.chrome);
  K.cyl("chrome", 0.1, 0.1, 0.02, -l / 2 + 0.3, 1.98, -w / 2 + 0.3, C.chrome, { seg: 16 });
  K.block(-l / 2, -w / 2, l / 2, w / 2);
}
export function towelRail(K, colors = [0x3a6a8a, 0xe8e4dc]) {
  K.cyl("chrome", 0.012, 0.012, 0.7, 0, 1.2, 0.08, C.chrome, { rz: Math.PI / 2, seg: 6 });
  colors.forEach((c, i) => K.box("fabric", 0.3, 0.6, 0.04, -0.17 + i * 0.34, 0.95, 0.08, c, { r: 0.015 }));
}

// ============================== food service ==============================
export function serviceCounter(K, len, brand, o = {}) {
  K.box("matte", len, 0.1, 0.62, 0, 0.05, 0.02, C.black);
  K.box("gloss", len, 0.95, 0.66, 0, 0.52, 0, brand, { r: 0.01 });
  for (let i = 0; i < Math.round(len / 0.5); i++) K.box("gloss", 0.02, 0.8, 0.01, -len / 2 + 0.25 + i * 0.5, 0.52, 0.335, new THREE.Color(brand).multiplyScalar(0.8).getHex());
  K.box("gloss", len + 0.1, 0.05, 0.8, 0, 1.02, 0.02, o.top ?? C.stone, { r: 0.01 });
  K.box("glow", len, 0.02, 0.02, 0, 0.99, 0.43, 0xfff0c8, { em: 1.4 });
  // till: base, drawer, tilted screen; a tip jar, napkins
  const tx = len / 2 - 0.5;
  K.box("gloss", 0.4, 0.1, 0.38, tx, 1.1, 0, C.charcoal, { r: 0.01 });
  K.box("metal", 0.05, 0.16, 0.05, tx, 1.23, -0.08, C.charcoal);
  K.box("gloss", 0.34, 0.24, 0.03, tx, 1.38, -0.06, C.black, { rx: -0.35, r: 0.008 });
  K.box("glow", 0.3, 0.2, 0.005, tx, 1.385, -0.04, 0x60b0ff, { rx: -0.35, em: 1 });
  K.lathe("glass", [[0.001, 0], [0.07, 0], [0.075, 0.16], [0.06, 0.18]], tx - 0.45, 1.045, 0.1, 0xdde8ee);
  K.box("chrome", 0.14, 0.12, 0.1, -len / 2 + 0.4, 1.1, 0.1, C.chrome, { r: 0.01 });
  K.block(-len / 2, -0.33, len / 2, 0.42);
}
export function pizzaOven(K) {
  K.box("matte", 1.6, 0.9, 1.4, 0, 0.45, 0, 0x8a4a2e);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) K.box("matte", 0.25, 0.14, 0.012, -0.66 + c * 0.27 + (r % 2) * 0.13, 0.1 + r * 0.17, 0.705, [0x9a5436, 0x7a3e26, 0xa85e3c][(r + c) % 3]);
  K.sph("matte", 0.78, 0, 0.9, 0, 0x9a5436, { half: true, seg: 18, hseg: 8, sy: 0.8 });
  K.box("matte", 0.56, 0.36, 0.2, 0, 1.08, 0.66, 0x7a3e26, { r: 0.02 });
  K.box("glow", 0.46, 0.26, 0.02, 0, 1.06, 0.77, 0xff7a2a, { em: 2.2 });
  K.cyl("metal", 0.1, 0.12, 0.9, 0, 1.9, -0.2, C.charcoal, { seg: 10 });
  K.box("wood", 0.3, 0.02, 0.9, 0.9, 1.0, 0.4, C.pine, { rx: 0, rz: -1.2 });           // peel leaning on it
  K.block(-0.82, -0.72, 0.82, 0.8);
}
export function fryer(K, w = 0.9) {
  K.box("metal", w, 0.9, 0.7, 0, 0.45, 0, C.steel, { r: 0.01 });
  for (const s of [-1, 1]) { K.box("metal", w / 2 - 0.08, 0.02, 0.5, s * w / 4, 0.91, 0, 0x3a3020); K.box("metal", w / 2 - 0.12, 0.14, 0.3, s * w / 4, 1.02, 0.05, C.chrome); K.cyl("chrome", 0.012, 0.012, 0.3, s * w / 4, 1.12, 0.3, C.charcoal, { rx: Math.PI / 2, seg: 6 }); }
  for (let i = 0; i < 3; i++) K.cyl("gloss", 0.022, 0.022, 0.03, -w / 2 + 0.15 + i * 0.12, 0.8, 0.36, C.black, { rx: Math.PI / 2, seg: 10 });
  K.block(-w / 2, -0.35, w / 2, 0.4);
}
export function griddle(K, w = 1.0) {
  K.box("metal", w, 0.9, 0.7, 0, 0.45, 0, C.steel, { r: 0.01 });
  K.box("metal", w - 0.04, 0.03, 0.6, 0, 0.92, 0, 0x2a2826);
  for (let i = 0; i < 4; i++) K.cyl("gloss", 0.05, 0.05, 0.012, -0.3 + i * 0.2, 0.94, (i % 2) * 0.15, 0x6a3a1e, { seg: 12 });   // patties
  K.box("metal", w, 0.2, 0.02, 0, 1.03, -0.34, C.steel);
  K.block(-w / 2, -0.35, w / 2, 0.36);
}
export function prepTable(K, w = 1.4) {
  K.box("chrome", w, 0.03, 0.7, 0, 0.9, 0, C.steel);
  K.box("metal", w - 0.06, 0.02, 0.62, 0, 0.25, 0, C.steel);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("chrome", 0.02, 0.02, 0.9, x * (w / 2 - 0.04), 0.45, z * 0.31, C.steel, { seg: 8 });
  for (let i = 0; i < 3; i++) K.lathe("metal", [[0.001, 0], [0.14, 0], [0.16, 0.12], [0.15, 0.13]], -w / 2 + 0.25 + i * 0.4, 0.915, 0, C.steel);
  K.box("wood", 0.4, 0.03, 0.3, w / 2 - 0.3, 0.93, 0.05, 0xd8c4a0);
  K.block(-w / 2, -0.35, w / 2, 0.35);
}
export function sodaFountain(K) {
  K.box("gloss", 0.9, 0.7, 0.55, 0, 1.28, 0, 0xc82a2a, { r: 0.02 });
  for (let i = 0; i < 4; i++) { K.box("chrome", 0.06, 0.1, 0.06, -0.3 + i * 0.2, 0.9, 0.2, C.chrome); K.box("glow", 0.15, 0.2, 0.005, -0.3 + i * 0.2, 1.35, 0.278, [0xffd040, 0x40a0ff, 0xff5040, 0x60e060][i], { em: 0.8 }); }
  K.box("chrome", 0.9, 0.03, 0.3, 0, 0.93, 0.14, C.steel);
  for (let i = 0; i < 3; i++) K.cyl("gloss", 0.045, 0.035, 0.28, 0.6 + i * 0.1, 1.07, 0.05, C.white, { seg: 10 });
}

// ============================== bar & club ==============================
function bottle(K, x, y, z, col) {
  K.lathe("glass", [[0.001, 0], [0.04, 0], [0.042, 0.02], [0.042, 0.18], [0.02, 0.24], [0.014, 0.3], [0.016, 0.31]], x, y, z, col);
  K.box("matte", 0.05, 0.06, 0.005, x, y + 0.1, z + 0.04, 0xf0e8d0);
}
export function barCounter(K, len, o = {}) {
  const front = o.front ?? 0x241c30, top = o.top ?? 0x0e0e10;
  K.box("wood", len, 1.05, 0.55, 0, 0.525, 0, front, { r: 0.01 });
  const n = Math.round(len / 0.5);
  for (let i = 0; i < n; i++) K.box("leather", len / n - 0.02, 0.8, 0.04, -len / 2 + (i + 0.5) * len / n, 0.55, 0.29, new THREE.Color(front).multiplyScalar(1.3).getHex(), { r: 0.015 });
  K.box("gloss", len + 0.12, 0.05, 0.75, 0, 1.08, 0.05, top, { r: 0.012 });
  K.cyl("chrome", 0.025, 0.025, len, 0, 0.22, 0.38, C.brass, { rz: Math.PI / 2, seg: 8 });                  // foot rail
  for (let i = 0; i < n; i += 2) K.box("chrome", 0.02, 0.2, 0.1, -len / 2 + (i + 0.5) * len / n, 0.14, 0.33, C.brass);
  if (o.glow !== false) K.box("glow", len, 0.025, 0.025, 0, 0.93, 0.32, o.neon ?? 0xff3b8b, { em: 2.5 });
  // beer taps and glasses
  for (let i = 0; i < 4; i++) { K.cyl("chrome", 0.02, 0.02, 0.28, -0.4 + i * 0.16, 1.24, -0.12, C.chrome, { seg: 8 }); K.box("gloss", 0.03, 0.12, 0.03, -0.4 + i * 0.16, 1.42, -0.12, [0xd8a020, 0x2a2a2a, 0xa82a2a, 0x3a7a3a][i]); }
  for (let i = 0; i < 5; i++) K.lathe("glass", [[0.001, 0], [0.035, 0], [0.042, 0.14], [0.04, 0.15]], len / 2 - 0.3 - i * 0.12, 1.105, 0.15, 0xdde8ee);
  K.block(-len / 2 - 0.06, -0.28, len / 2 + 0.06, 0.45);
}
export function backBar(K, len, o = {}) {
  K.box("wood", len, 0.9, 0.45, 0, 0.45, 0, o.wood ?? 0x1e1820);
  K.box("glass", len - 0.1, 1.2, 0.01, 0, 1.6, -0.21, 0x2a2430);                           // mirror
  for (let r = 0; r < 3; r++) {
    const y = 1.05 + r * 0.42;
    K.box("glass", len, 0.02, 0.26, 0, y, -0.08, 0xdde8ee);
    K.box("glow", len, 0.012, 0.012, 0, y - 0.015, 0.05, o.neon ?? 0xffb060, { em: 2.0 });
    for (let x = -len / 2 + 0.12; x < len / 2 - 0.08; x += 0.13 + rnd() * 0.05) bottle(K, x, y + 0.012, -0.08, pick([0x7a3a1a, 0x2a5a2a, 0xc8b060, 0x9ad0e8, 0x5a1a2a, 0xd8d8d8]));
  }
  K.block(-len / 2, -0.23, len / 2, 0.23);
}
export function djBooth(K) {
  K.box("wood", 2.6, 1.05, 0.9, 0, 0.525, 0, 0x16161a, { r: 0.02 });
  K.box("glow", 2.5, 0.05, 0.02, 0, 0.8, 0.46, 0x3bd0ff, { em: 2.5 });
  K.box("glow", 2.5, 0.05, 0.02, 0, 0.35, 0.46, 0xb44bff, { em: 2.5 });
  K.box("gloss", 2.66, 0.04, 0.96, 0, 1.07, 0, C.black);
  for (const x of [-0.75, 0.75]) {                         // turntables
    K.box("gloss", 0.5, 0.08, 0.4, x, 1.13, 0, 0x2a2a2e, { r: 0.01 });
    K.cyl("gloss", 0.16, 0.16, 0.012, x - 0.04, 1.18, 0, C.black, { seg: 24 });
    K.cyl("glow", 0.045, 0.045, 0.014, x - 0.04, 1.182, 0, x < 0 ? 0xff3b8b : 0x3bd0ff, { seg: 12, em: 1 });
    K.box("chrome", 0.012, 0.012, 0.24, x + 0.16, 1.19, -0.02, C.chrome, { ry: 0.4 });
  }
  K.box("gloss", 0.4, 0.07, 0.36, 0, 1.125, 0, 0x2a2a2e, { r: 0.01 });
  for (let i = 0; i < 12; i++) K.cyl("chrome", 0.012, 0.012, 0.025, -0.15 + (i % 4) * 0.1, 1.17, -0.12 + Math.floor(i / 4) * 0.1, C.chrome, { seg: 6 });
  K.block(-1.3, -0.45, 1.3, 0.48);
}
export function speaker(K, h = 1.6) {
  K.box("wood", 0.6, h, 0.55, 0, h / 2, 0, 0x0e0e10, { r: 0.02 });
  const cones = h > 1.2 ? [[0.3, h * 0.3], [0.3, h * 0.62], [0.1, h * 0.86]] : [[0.22, h * 0.4], [0.08, h * 0.8]];
  for (const [r, y] of cones) { K.cyl("matte", r * 0.85, r * 0.85, 0.02, 0, y, 0.28, 0x1a1a1c, { rx: Math.PI / 2, seg: 18 }); K.torus("metal", r * 0.85, 0.012, 0, y, 0.29, 0x3a3a3e, { rx: 0 }); K.sph("gloss", r * 0.25, 0, y, 0.27, 0x2a2a2e, { half: true, rx: Math.PI / 2, seg: 10 }); }
  K.block(-0.3, -0.28, 0.3, 0.3);
}
export function stanchion(K, x, z) {
  K.cyl("chrome", 0.15, 0.16, 0.03, x, 0.015, z, C.brass, { seg: 14 });
  K.cyl("chrome", 0.025, 0.025, 0.9, x, 0.46, z, C.brass, { seg: 8 });
  K.sph("chrome", 0.045, x, 0.93, z, C.brass, { seg: 10 });
}
export function rope(K, x0, z0, x1, z1, col = 0x8a1a2a) {
  const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
  K.torus("fabric", L / 2, 0.022, (x0 + x1) / 2, 0.86, (z0 + z1) / 2, col, { arc: Math.PI, rx: 0, rz: Math.PI, ry: a - Math.PI / 2, sy: 0.35, ts: 14 });
}
export function trussLights(K, w, y, cols) {
  K.box("metal", w, 0.06, 0.06, 0, y, 0, C.charcoal);
  K.box("metal", w, 0.06, 0.06, 0, y - 0.25, 0, C.charcoal);
  for (let x = -w / 2; x <= w / 2; x += 0.35) K.box("metal", 0.02, 0.25, 0.02, x, y - 0.125, 0, C.charcoal, { rz: 0.5 });
  cols.forEach((c, i) => { const x = -w / 2 + (i + 0.5) * w / cols.length; K.cyl("metal", 0.08, 0.1, 0.22, x, y - 0.4, 0.05, C.black, { rx: 0.5, seg: 10 }); K.cyl("glow", 0.075, 0.075, 0.01, x, y - 0.5, 0.11, c, { rx: 0.5, em: 3, seg: 10 }); });
}

// ============================== medical ==============================
export function hospitalBed(K, o = {}) {
  const l = 2.05, w = 0.95;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { K.cyl("gloss", 0.05, 0.05, 0.035, x * 0.4, 0.05, z * 0.9, C.black, { rz: Math.PI / 2, seg: 10 }); K.cyl("chrome", 0.018, 0.018, 0.3, x * 0.4, 0.22, z * 0.9, C.chrome, { seg: 6 }); }
  K.box("metal", w, 0.08, l, 0, 0.42, 0, C.steel);
  K.box("fabric", w - 0.06, 0.14, l * 0.62, 0, 0.53, l * 0.18, 0xe8eef2, { r: 0.04 });
  K.box("fabric", w - 0.06, 0.12, l * 0.4, 0, 0.72, -l * 0.3, 0xe8eef2, { r: 0.04, rx: -0.55 });
  K.box("fabric", w - 0.04, 0.05, l * 0.55, 0, 0.62, l * 0.2, o.blanket ?? 0x8ab4c8, { r: 0.02 });
  K.box("fabric", 0.5, 0.1, 0.3, 0, 0.93, -l * 0.42, C.white, { r: 0.04, rx: -0.55 });
  K.box("gloss", w + 0.04, 0.55, 0.05, 0, 0.72, -l / 2 - 0.02, 0xdfe6ea, { r: 0.02 });
  K.box("gloss", w + 0.04, 0.4, 0.05, 0, 0.64, l / 2 + 0.02, 0xdfe6ea, { r: 0.02 });
  for (const s of [-1, 1]) { K.box("chrome", 0.025, 0.025, l * 0.45, s * (w / 2 + 0.02), 0.78, -l * 0.15, C.chrome); for (let i = 0; i < 3; i++) K.box("chrome", 0.02, 0.2, 0.02, s * (w / 2 + 0.02), 0.68, -l * 0.35 + i * 0.2, C.chrome); }
  K.block(-w / 2 - 0.05, -l / 2 - 0.05, w / 2 + 0.05, l / 2 + 0.05);
}
export function ivStand(K) {
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; K.box("chrome", 0.02, 0.02, 0.26, Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13, C.chrome, { ry: a }); K.sph("gloss", 0.022, Math.sin(a) * 0.25, 0.022, Math.cos(a) * 0.25, C.black, { seg: 6 }); }
  K.cyl("chrome", 0.012, 0.012, 1.9, 0, 0.95, 0, C.chrome, { seg: 6 });
  K.box("chrome", 0.3, 0.012, 0.012, 0, 1.88, 0, C.chrome);
  K.box("glass", 0.1, 0.18, 0.04, 0.12, 1.72, 0, 0xd8f0ff, { r: 0.015 });
  K.cyl("glass", 0.004, 0.004, 0.6, 0.12, 1.33, 0, 0xd8f0ff, { seg: 4 });
}
export function vitalsMonitor(K) {
  K.cyl("chrome", 0.015, 0.015, 1.3, 0, 0.65, 0, C.chrome, { seg: 6 });
  K.cyl("metal", 0.2, 0.22, 0.03, 0, 0.015, 0, C.steel, { seg: 12 });
  K.box("gloss", 0.34, 0.26, 0.1, 0, 1.4, 0, 0xdfe6ea, { r: 0.015 });
  K.box("glow", 0.28, 0.18, 0.005, 0, 1.41, 0.052, 0x0a1a10, { em: 0.4 });
  for (let i = 0; i < 6; i++) K.box("glow", 0.045, 0.006, 0.002, -0.11 + i * 0.045, 1.43 + (i === 2 ? 0.04 : i === 3 ? -0.03 : 0), 0.056, 0x40ff80, { em: 2.5, rz: i === 2 ? 1.1 : i === 3 ? -1.1 : 0 });
}
export function curtain(K, len, col = 0xa8d8d4) {
  K.box("metal", len, 0.03, 0.04, 0, 2.5, 0, C.steel);
  const n = Math.round(len / 0.14);
  for (let i = 0; i < n; i++) K.box("fabric", len / n * 1.05, 2.0, 0.012, -len / 2 + (i + 0.5) * len / n, 1.45, (i % 2) * 0.06, col, { ry: i % 2 ? 0.45 : -0.45 });
  K.block(-len / 2, -0.06, len / 2, 0.1);
}
export function examTable(K) {
  K.box("wood", 0.7, 0.62, 1.8, 0, 0.36, 0, 0xe8e4dc, { r: 0.02 });
  for (let i = 0; i < 2; i++) K.box("wood", 0.3, 0.22, 0.012, -0.16 + i * 0.32, 0.4, 0.906, 0xdcd6ca);
  K.box("leather", 0.72, 0.1, 1.2, 0, 0.72, 0.3, 0x3a7a8a, { r: 0.03 });
  K.box("leather", 0.72, 0.1, 0.6, 0, 0.84, -0.55, 0x3a7a8a, { r: 0.03, rx: -0.4 });
  K.box("matte", 0.6, 0.012, 1.7, 0, 0.78, 0.1, 0xf6f6f2);                          // paper roll sheet
  K.cyl("matte", 0.06, 0.06, 0.6, 0, 0.9, -0.92, 0xf6f6f2, { rz: Math.PI / 2, seg: 10 });
  K.block(-0.38, -0.95, 0.38, 0.95);
}
export function medCabinet(K, w = 1.2) {
  K.box("wood", w, 0.9, 0.45, 0, 0.45, 0, C.white);
  K.box("gloss", w + 0.02, 0.04, 0.48, 0, 0.92, 0, 0x9ab8c4);
  K.box("wood", w, 0.9, 0.3, 0, 1.9, -0.07, C.white);
  for (let i = 0; i < 3; i++) K.box("glass", w / 3 - 0.02, 0.84, 0.01, -w / 3 + i * w / 3, 1.9, 0.085, 0xdde8f0);
  for (let i = 0; i < 12; i++) K.cyl("gloss", 0.03, 0.03, 0.1, -w / 2 + 0.1 + (i % 6) * 0.2, 1.62 + Math.floor(i / 6) * 0.3, -0.05, pick([0xe8e4dc, 0xd8a020, 0x3a7ab8]), { seg: 8 });
  K.box("chrome", 0.5, 0.012, 0.36, w * 0.2, 0.945, 0, C.steel);
  K.block(-w / 2, -0.23, w / 2, 0.25);
}

// ============================== police ==============================
export function cellFront(K, w, o = {}) {
  const bars = 0x55595e;
  K.box("metal", w, 0.08, 0.08, 0, 2.4, 0, bars); K.box("metal", w, 0.06, 0.06, 0, 0.04, 0, bars);
  K.box("metal", w, 0.04, 0.06, 0, 1.1, 0, bars);
  for (let x = -w / 2 + 0.06; x <= w / 2 - 0.05; x += 0.14) K.cyl("metal", 0.016, 0.016, 2.36, x, 1.2, 0, bars, { seg: 6 });
  // door frame and a lock box on it
  const dx = o.door ?? w / 2 - 0.55;
  for (const s of [-0.45, 0.45]) K.box("metal", 0.06, 2.36, 0.07, dx + s, 1.2, 0, 0x3a3e42);
  K.box("metal", 0.14, 0.2, 0.1, dx + 0.36, 1.05, 0.05, 0x2a2c30);
  K.block(-w / 2, -0.05, w / 2, 0.05);
}
export function bunk(K) {
  K.box("metal", 0.8, 0.06, 1.95, 0, 0.45, 0, 0x6a6e72);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("metal", 0.05, 0.45, 0.05, x * 0.37, 0.225, z * 0.93, 0x6a6e72);
  K.box("fabric", 0.72, 0.08, 1.85, 0, 0.52, 0, 0x6a7a5a, { r: 0.03 });
  K.box("fabric", 0.72, 0.04, 0.9, 0, 0.57, 0.4, 0x4a5a6a, { r: 0.015 });
  K.block(-0.42, -0.98, 0.42, 0.98);
}
export function steelToilet(K) {
  K.lathe("chrome", [[0.001, 0], [0.12, 0], [0.12, 0.2], [0.19, 0.38], [0.001, 0.38]], 0, 0, 0.05, C.steel, { sz: 1.3 });
  K.torus("chrome", 0.16, 0.025, 0, 0.39, 0.05, C.steel, { sz: 1.25 });
  K.box("metal", 0.44, 0.5, 0.14, 0, 0.45, -0.25, C.steel);
  K.lathe("chrome", [[0.001, 0.05], [0.14, 0.05], [0.16, 0.12]], 0, 0.72, -0.22, C.steel, { sz: 0.7 });
  K.block(-0.22, -0.32, 0.22, 0.32);
}
export function metalTable(K, w = 1.2, d = 0.8) {
  K.box("metal", w, 0.04, d, 0, 0.74, 0, 0x8a8e94);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("metal", 0.04, 0.72, 0.04, x * (w / 2 - 0.05), 0.36, z * (d / 2 - 0.05), 0x6a6e72);
  K.box("chrome", 0.08, 0.04, 0.04, 0, 0.72, d / 2 - 0.06, C.chrome);                  // cuff bar
  K.block(-w / 2, -d / 2, w / 2, d / 2);
}
export function metalChair(K) {
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("metal", 0.03, 0.45, 0.03, x * 0.19, 0.225, z * 0.19, 0x5a5e62);
  K.box("metal", 0.44, 0.03, 0.42, 0, 0.46, 0, 0x6a6e72);
  K.box("metal", 0.44, 0.34, 0.03, 0, 0.72, -0.2, 0x6a6e72, { rx: -0.08 });
  for (const x of [-0.19, 0.19]) K.box("metal", 0.03, 0.34, 0.03, x, 0.62, -0.2, 0x5a5e62);
  K.block(-0.24, -0.24, 0.24, 0.24);
}
export function pendantLamp(K, x, z, y, h, col = 0xfff0c8, shade = C.black) {
  K.cyl("matte", 0.006, 0.006, h, x, y - h / 2, z, C.black, { seg: 4 });
  K.lathe("metal", [[0.03, 0], [0.22, -0.18], [0.23, -0.2]], x, y - h, z, shade, { seg: 16 });
  K.sph("glow", 0.06, x, y - h - 0.1, z, col, { em: 3, seg: 8, hseg: 6 });
}
export function flag(K, col) {
  K.cyl("chrome", 0.015, 0.015, 2.2, 0, 1.1, 0, C.brass, { seg: 6 });
  K.cyl("chrome", 0.18, 0.2, 0.04, 0, 0.02, 0, C.brass, { seg: 12 });
  K.sph("chrome", 0.04, 0, 2.23, 0, C.brass, { seg: 8 });
  for (let i = 0; i < 6; i++) K.box("fabric", 0.14, 0.8, 0.012, 0.08 + i * 0.12, 1.7, Math.sin(i * 1.3) * 0.04, col, { ry: Math.sin(i * 1.3) * 0.4 });
}

// ============================== warehouse ==============================
export function pallet(K) {
  for (let i = 0; i < 3; i++) K.box("wood", 0.1, 0.1, 1.2, -0.45 + i * 0.45, 0.07, 0, 0xb89868);
  for (let i = 0; i < 7; i++) K.box("wood", 1.0, 0.022, 0.12, 0, 0.135, -0.54 + i * 0.18, [0xc8a878, 0xb89868, 0xd0b080][i % 3]);
  for (let i = 0; i < 3; i++) K.box("wood", 1.0, 0.022, 0.12, 0, 0.011, -0.5 + i * 0.5, 0xb89868);
}
export function crate(K, s = 1, x = 0, y = 0, z = 0, ry = 0) {
  K.push(x, z, ry, y);
  const c = pick([0x9a7a4a, 0x8a6a3a, 0xa8885a]), e = new THREE.Color(c).multiplyScalar(0.78).getHex();
  K.box("wood", s, s, s, 0, s / 2, 0, c);
  const t = 0.05 * s, o = s / 2 + 0.004;
  for (const f of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    K.push(f[0] * o, f[1] * o, Math.atan2(f[0], f[1]));
    K.box("wood", s, t, 0.02, 0, t / 2, 0, e); K.box("wood", s, t, 0.02, 0, s - t / 2, 0, e);
    K.box("wood", t, s, 0.02, -s / 2 + t / 2, s / 2, 0, e); K.box("wood", t, s, 0.02, s / 2 - t / 2, s / 2, 0, e);
    K.box("wood", s * 1.3, t, 0.018, 0, s / 2, 0.004, e, { rz: Math.PI / 4 });
    K.pop();
  }
  K.pop();
}
export function cardboard(K, w, h, d, x, y, z, ry = 0) {
  K.push(x, z, ry, y);
  K.box("matte", w, h, d, 0, h / 2, 0, 0xb89868);
  K.box("matte", w + 0.004, 0.05, d * 0.3, 0, h - 0.02, 0, 0xc8b088);
  K.box("matte", 0.18, 0.12, 0.004, w * 0.2, h * 0.5, d / 2 + 0.003, 0xf0ece0);
  K.pop();
}
export function palletRack(K, len, levels = 3, o = {}) {
  const d = 1.1, h = levels * 1.3 + 0.3, bays = Math.max(1, Math.round(len / 2.7)), bw = len / bays;
  for (let b = 0; b <= bays; b++) for (const z of [-d / 2, d / 2]) {
    const x = -len / 2 + b * bw;
    K.box("metal", 0.08, h, 0.08, x, h / 2, z, 0x2a5aa8);
    for (let y = 0.4; y < h; y += 0.6) K.box("metal", 0.03, 0.03, d, x, y, 0, 0x2a5aa8, { rx: 0 });
  }
  for (let l = 0; l < levels; l++) {
    const y = 0.15 + l * 1.3;
    for (const z of [-d / 2, d / 2]) K.box("metal", len, 0.1, 0.05, 0, y, z, 0xe87a20);
    for (let b = 0; b < bays; b++) {
      const cx = -len / 2 + (b + 0.5) * bw;
      if (l > 0 || o.floorLevel) { K.box("metal", bw - 0.1, 0.02, d, cx, y + 0.06, 0, 0x8a8e94); }
      if (rnd() < 0.85) {
        K.push(cx, 0, 0, y + 0.07); pallet(K); K.pop();
        const k = rnd();
        if (k < 0.4) crate(K, 0.9, cx, y + 0.22, 0, rnd() * 0.2);
        else { const n = 2 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) cardboard(K, 0.45, 0.4, 0.5, cx - 0.25 + (i % 2) * 0.5, y + 0.22 + Math.floor(i / 2) * 0.4, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.15); }
      }
    }
  }
  K.block(-len / 2 - 0.05, -d / 2 - 0.05, len / 2 + 0.05, d / 2 + 0.05);
}
export function barrel(K, x, z, col = 0x2a5aa8) {
  K.cyl("metal", 0.29, 0.29, 0.88, x, 0.44, z, col, { seg: 16 });
  for (const y of [0.1, 0.44, 0.78]) K.torus("metal", 0.292, 0.012, x, y, z, new THREE.Color(col).multiplyScalar(0.7).getHex(), { ts: 20 });
  K.cyl("metal", 0.27, 0.27, 0.01, x, 0.885, z, new THREE.Color(col).multiplyScalar(0.85).getHex(), { seg: 16 });
  K.cyl("metal", 0.035, 0.035, 0.02, x + 0.15, 0.89, z, C.charcoal, { seg: 8 });
  K.block(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
}
export function forklift(K) {
  const Y = 0xe8b020;
  for (const [x, z, r] of [[-0.5, 0.55, 0.28], [0.5, 0.55, 0.28], [-0.5, -0.55, 0.22], [0.5, -0.55, 0.22]]) { K.cyl("matte", r, r, 0.22, x, r, z, C.black, { rz: Math.PI / 2, seg: 14 }); K.cyl("metal", r * 0.55, r * 0.55, 0.23, x, r, z, 0xb8b8b8, { rz: Math.PI / 2, seg: 10 }); }
  K.box("metal", 1.0, 0.55, 1.6, 0, 0.55, -0.05, Y, { r: 0.05 });
  K.box("metal", 1.04, 0.6, 0.45, 0, 0.75, -0.75, 0x3a3a3e, { r: 0.08 });          // counterweight
  K.box("leather", 0.46, 0.1, 0.42, 0, 0.9, -0.3, C.black, { r: 0.03 }); K.box("leather", 0.46, 0.4, 0.1, 0, 1.1, -0.5, C.black, { r: 0.03 });
  K.box("metal", 0.08, 0.35, 0.08, 0, 1.0, 0.25, C.black, { rx: -0.4 }); K.torus("gloss", 0.14, 0.02, 0, 1.18, 0.18, C.black, { rx: -1.1 });
  for (const [x, z] of [[-0.45, 0.45], [0.45, 0.45], [-0.45, -0.55], [0.45, -0.55]]) K.box("metal", 0.06, 1.3, 0.06, x, 1.45, z, C.black);
  K.box("metal", 0.96, 0.05, 1.06, 0, 2.1, -0.05, C.black);
  for (let i = 0; i < 5; i++) K.box("metal", 0.03, 0.03, 1.0, -0.4 + i * 0.2, 2.1, -0.05, C.black);
  for (const x of [-0.35, 0.35]) K.box("metal", 0.1, 2.4, 0.1, x, 1.2, 0.85, 0x3a3a3e);                  // mast
  K.box("metal", 0.8, 0.5, 0.06, 0, 0.45, 0.93, 0x3a3a3e);
  for (const x of [-0.25, 0.25]) K.box("metal", 0.1, 0.05, 1.1, x, 0.1, 1.5, 0x3a3a3e);                   // forks
  K.push(0, 1.5, 0, 0.13); pallet(K); K.pop();
  K.box("glow", 0.12, 0.12, 0.05, 0, 2.18, -0.05, 0xff9020, { em: 2 });
  K.block(-0.62, -1.0, 0.62, 2.05);
}
export function handTruck(K) {
  for (const s of [-1, 1]) { K.box("metal", 0.04, 1.2, 0.04, s * 0.2, 0.65, -0.1, 0xc82a2a, { rx: -0.25 }); K.cyl("matte", 0.1, 0.1, 0.06, s * 0.25, 0.1, -0.08, C.black, { rz: Math.PI / 2, seg: 10 }); }
  K.box("metal", 0.44, 0.02, 0.25, 0, 0.02, 0.08, C.steel);
  for (let i = 0; i < 3; i++) K.box("metal", 0.4, 0.03, 0.03, 0, 0.4 + i * 0.35, -0.1 - (0.4 + i * 0.35) * 0.25, 0xc82a2a);
}

// ============================== gallery & décor ==============================
export function plinth(K, h = 1.0, top = C.white) {
  K.box("gloss", 0.62, h, 0.62, 0, h / 2, 0, top, { r: 0.008 });
  K.box("matte", 0.6, 0.06, 0.6, 0, 0.03, 0, 0x2a2a2e);
  K.block(-0.33, -0.33, 0.33, 0.33);
}
export function sculpture(K, kind, y, col) {
  if (kind === 0) K.add("chrome", new THREE.TorusKnotGeometry(0.2, 0.06, 80, 10), col, 0, y + 0.3, 0);
  else if (kind === 1) { for (let i = 0; i < 4; i++) K.sph("gloss", 0.16 - i * 0.03, (i % 2) * 0.04, y + 0.16 + i * 0.24, 0, col, { seg: 14 }); }
  else if (kind === 2) { K.lathe("gloss", [[0.001, 0], [0.12, 0.01], [0.2, 0.2], [0.1, 0.45], [0.14, 0.55], [0.13, 0.57]], 0, y, 0, col, { seg: 20 }); }
  else { K.box("chrome", 0.08, 0.7, 0.08, 0, y + 0.35, 0, col, { rz: 0.3 }); K.box("chrome", 0.08, 0.5, 0.08, 0.1, y + 0.3, 0, col, { rz: -0.5 }); K.sph("chrome", 0.1, 0.02, y + 0.72, 0, col, { seg: 12 }); }
}
export function trackLights(K, len, y) {
  K.box("metal", len, 0.04, 0.05, 0, y, 0, C.black);
  for (let x = -len / 2 + 0.4; x < len / 2; x += 0.9) { K.box("metal", 0.03, 0.12, 0.03, x, y - 0.07, 0, C.black); K.cyl("metal", 0.05, 0.06, 0.16, x, y - 0.18, 0.05, C.black, { rx: 0.7, seg: 10 }); K.cyl("glow", 0.045, 0.045, 0.01, x, y - 0.24, 0.1, 0xfff4e0, { rx: 0.7, em: 3, seg: 10 }); }
}
export function wallClock(K) {
  K.cyl("gloss", 0.18, 0.18, 0.04, 0, 0, 0, C.black, { rx: Math.PI / 2, seg: 24 });
  K.cyl("gloss", 0.16, 0.16, 0.01, 0, 0, 0.022, C.white, { rx: Math.PI / 2, seg: 24 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; K.box("matte", 0.012, 0.03, 0.004, Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.028, C.black, { rz: -a }); }
  K.box("matte", 0.012, 0.09, 0.004, 0.02, 0.03, 0.03, C.black, { rz: -0.6 }); K.box("matte", 0.008, 0.12, 0.004, -0.03, 0.05, 0.032, C.black, { rz: 0.5 });
}
export function ceilingLight(K, x, z, H, kind = "panel", col = 0xfff4e0) {
  if (kind === "panel") { K.box("metal", 1.2, 0.05, 0.6, x, H - 0.03, z, C.white); K.box("glow", 1.12, 0.01, 0.52, x, H - 0.058, z, col, { em: 2.2 }); }
  else if (kind === "round") { K.cyl("gloss", 0.3, 0.34, 0.08, x, H - 0.04, z, C.white, { seg: 20 }); K.cyl("glow", 0.28, 0.28, 0.01, x, H - 0.085, z, col, { em: 2.4, seg: 20 }); }
  else if (kind === "spot") { for (const dx of [-0.7, 0.7]) for (const dz of [-0.7, 0.7]) { K.cyl("metal", 0.07, 0.07, 0.02, x + dx, H - 0.01, z + dz, C.white, { seg: 10 }); K.cyl("glow", 0.05, 0.05, 0.005, x + dx, H - 0.022, z + dz, col, { em: 2.5, seg: 10 }); } }
  else if (kind === "fluoro") { K.box("metal", 1.3, 0.08, 0.22, x, H - 0.04, z, 0xdcdcdc); K.box("glow", 1.2, 0.02, 0.14, x, H - 0.09, z, col, { em: 2.4 }); }
}

// ============================== extras ==============================
export function washer(K, o = {}) {
  K.box("gloss", 0.6, 0.85, 0.6, 0, 0.425, 0, C.white, { r: 0.02 });
  K.box("gloss", 0.56, 0.1, 0.02, 0, 0.77, 0.3, 0xe0e0e0);
  K.box("glow", 0.1, 0.04, 0.005, 0.15, 0.77, 0.312, 0x60c0ff, { em: 1 });
  K.cyl("chrome", 0.025, 0.025, 0.02, -0.18, 0.77, 0.31, C.chrome, { rx: Math.PI / 2, seg: 10 });
  K.torus("chrome", 0.2, 0.025, 0, 0.4, 0.31, C.chrome, { rx: 0, ts: 24 });
  K.cyl("glass", 0.19, 0.19, 0.02, 0, 0.4, 0.3, o.dryer ? 0x2a2a30 : 0x6a8aa8, { rx: Math.PI / 2, seg: 24 });
  K.block(-0.3, -0.3, 0.3, 0.32);
}
export function vendingMachine(K, col = 0xc82a2a) {
  K.box("gloss", 0.9, 1.85, 0.8, 0, 0.925, 0, col, { r: 0.02 });
  K.box("glass", 0.62, 1.2, 0.01, -0.1, 1.15, 0.405, 0xcfe6ee);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) K.box("glow", 0.08, 0.14, 0.06, -0.34 + c * 0.12, 0.7 + r * 0.22, 0.3, [0xffd040, 0x40a0ff, 0xff5040, 0x60e060, 0xf0f0f0][(r + c) % 5], { em: 0.5 });
  K.box("glow", 0.14, 0.3, 0.01, 0.33, 1.3, 0.405, 0x1a1a1a, { em: 0.2 });
  K.box("gloss", 0.5, 0.14, 0.02, -0.1, 0.3, 0.41, 0x1a1a1a);
  K.block(-0.45, -0.4, 0.45, 0.42);
}
export function safe(K) {
  K.box("metal", 0.6, 0.75, 0.6, 0, 0.375, 0, 0x3a3e42, { r: 0.02 });
  K.box("metal", 0.52, 0.66, 0.02, 0, 0.375, 0.305, 0x4a4e52);
  K.cyl("chrome", 0.06, 0.06, 0.03, 0.05, 0.45, 0.32, C.chrome, { rx: Math.PI / 2, seg: 16 });
  K.box("chrome", 0.02, 0.18, 0.03, -0.15, 0.4, 0.32, C.chrome);
  K.block(-0.3, -0.3, 0.3, 0.32);
}
export function shelfUnit(K, w, o = {}) {
  const h = o.h ?? 1.9, d = 0.45, col = o.color ?? 0xb8bcc2;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("metal", 0.035, h, 0.035, x * (w / 2 - 0.02), h / 2, z * (d / 2 - 0.02), col);
  for (let i = 0; i < 4; i++) {
    const y = 0.12 + i * (h - 0.2) / 3;
    K.box("metal", w, 0.025, d, 0, y, 0, col);
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.15) {
      const k = rnd(), bw = 0.12 + rnd() * 0.2;
      if (k < 0.45) K.box("matte", bw, 0.14 + rnd() * 0.16, d * 0.7, x + bw / 2, y + 0.1, 0, pick([0xb89868, 0xd8d0c0, 0xc8a878]));
      else if (k < 0.8) { for (let j = 0; j < 3; j++) K.cyl("metal", 0.05, 0.05, 0.13, x + 0.06 + j * 0.1, y + 0.08, 0, pick([0xd83a2a, 0x3a7ab8, 0xe8c020, 0xd8d8d8]), { seg: 10 }); }
      else K.lathe("gloss", [[0.001, 0], [0.06, 0], [0.065, 0.2], [0.03, 0.26], [0.03, 0.3]], x + 0.07, y + 0.012, 0, pick([0xf0f0f0, 0x2a6a3a, 0xe87a20]));
      x += bw + 0.03;
    }
  }
  K.block(-w / 2, -d / 2, w / 2, d / 2);
}
export function printer(K) {
  K.box("wood", 0.9, 0.7, 0.6, 0, 0.35, 0, 0x5a5e64);
  K.box("gloss", 0.8, 0.45, 0.58, 0, 0.93, 0, 0xe8e8e4, { r: 0.02 });
  K.box("gloss", 0.6, 0.02, 0.25, 0, 1.17, 0.12, 0xd0d0cc);
  K.box("matte", 0.3, 0.012, 0.28, 0, 1.19, 0.1, 0xfafafa);
  K.box("glow", 0.14, 0.08, 0.005, 0.25, 1.05, 0.292, 0x60b0ff, { em: 0.8 });
  K.block(-0.45, -0.3, 0.45, 0.32);
}
export function mirrorBall(K, x, y, z) {
  K.cyl("matte", 0.006, 0.006, 0.4, x, y + 0.2, z, C.black, { seg: 4 });
  K.add("chrome", new THREE.IcosahedronGeometry(0.28, 2), C.chrome, x, y - 0.1, z);
}
export function arcadeCabinet(K, col = 0x3a1060) {
  K.box("wood", 0.7, 1.8, 0.75, 0, 0.9, 0, col);
  K.box("gloss", 0.62, 0.5, 0.02, 0, 1.35, 0.3, C.black, { rx: -0.25 });
  K.box("glow", 0.56, 0.42, 0.005, 0, 1.35, 0.315, pick([0x50a0ff, 0xff50a0, 0x60ff90]), { rx: -0.25, em: 1.3 });
  K.box("glow", 0.66, 0.18, 0.02, 0, 1.72, 0.37, 0xffd040, { em: 1.8 });
  K.box("wood", 0.7, 0.08, 0.3, 0, 1.0, 0.45, col, { rx: 0.25 });
  K.cyl("gloss", 0.02, 0.02, 0.08, -0.15, 1.08, 0.48, C.black, { seg: 6 }); K.sph("gloss", 0.035, -0.15, 1.13, 0.48, 0xd82a2a, { seg: 8 });
  for (let i = 0; i < 3; i++) K.cyl("gloss", 0.025, 0.025, 0.02, 0.05 + i * 0.08, 1.06, 0.48, [0xffd040, 0x40a0ff, 0x60e060][i], { seg: 10 });
  K.block(-0.35, -0.38, 0.35, 0.5);
}
