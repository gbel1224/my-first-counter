// Palm City — the furniture and equipment for the extra rooms: a gaming study and walk-in closet,
// a home gym and cinema, a garage with a real car and a kids' room, a restaurant storeroom, a club
// green room and keg store, an art restoration studio and vault, an operating theatre and MRI suite,
// a police armory and evidence room, a conference room and server room, and a loading bay with a
// box truck. Everything is modelled from its parts through the furniture kit.
import * as THREE from "../vendor/three.module.js";
import { C } from "./furniture.js";

const TAU = Math.PI * 2, rnd = Math.random;
const pick = a => a[Math.floor(rnd() * a.length)];
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

// ============================== study / gaming ==============================
export function gamingDesk(K) {
  // an L of dark desk, a glass-sided PC tower with RGB, two monitors, keyboard, mouse, headset stand, speakers
  K.box("wood", 1.8, 0.04, 0.8, 0, 0.745, 0, 0x1a1a1e, { r: 0.008 });
  for (const x of [-0.85, 0.85]) { K.box("metal", 0.06, 0.72, 0.7, x, 0.36, 0, C.black); K.box("glow", 0.01, 0.6, 0.02, x + (x > 0 ? -0.035 : 0.035), 0.38, 0.33, 0xb44bff, { em: 2 }); }
  K.box("glow", 1.7, 0.01, 0.01, 0, 0.72, 0.4, 0x3bd0ff, { em: 2.5 });
  // tower
  K.push(0.62, -0.1, 0, 0.765);
  K.box("metal", 0.22, 0.48, 0.46, 0, 0.24, 0, 0x111114, { r: 0.008 });
  K.box("glass", 0.005, 0.42, 0.4, -0.112, 0.24, 0, 0x2a2a3a);
  for (let i = 0; i < 3; i++) { K.torus("glow", 0.055, 0.008, -0.05, 0.13 + i * 0.13, 0.17, [0xff3b8b, 0x3bd0ff, 0xb44bff][i], { rx: 0, ry: Math.PI / 2, em: 3, ts: 20 }); K.cyl("metal", 0.05, 0.05, 0.02, -0.05, 0.13 + i * 0.13, 0.17, 0x222226, { rz: Math.PI / 2, seg: 12 }); }
  K.box("glow", 0.12, 0.12, 0.08, -0.04, 0.33, -0.08, 0x60ff90, { em: 1.2 });          // GPU light bar
  K.pop();
  // monitors on arms
  for (const [x, a] of [[-0.36, 0.25], [0.18, -0.15]]) {
    K.push(x, -0.22, a, 0.765);
    K.cyl("metal", 0.1, 0.1, 0.012, 0, 0.006, 0, C.black, { seg: 14 });
    K.box("metal", 0.035, 0.32, 0.035, 0, 0.17, -0.02, C.black);
    K.box("gloss", 0.62, 0.36, 0.035, 0, 0.42, 0.02, C.black, { r: 0.006 });
    K.box("screen", 0.59, 0.33, 0.004, 0, 0.42, 0.04, 0xffffff);
    K.pop();
  }
  K.box("gloss", 0.46, 0.025, 0.15, -0.12, 0.775, 0.17, 0x1a1a1e, { r: 0.008 });
  for (let r = 0; r < 4; r++) K.box("glow", 0.42, 0.004, 0.024, -0.12, 0.79, 0.12 + r * 0.03, [0xff3b8b, 0xb44bff, 0x3bd0ff, 0x60ff90][r], { em: 0.8 });
  K.box("matte", 0.36, 0.004, 0.3, 0.28, 0.768, 0.18, 0x222226);                           // mouse mat
  K.sph("gloss", 0.035, 0.28, 0.78, 0.18, C.black, { sx: 0.8, sy: 0.5, sz: 1.3, seg: 10 });
  K.cyl("metal", 0.06, 0.07, 0.01, -0.75, 0.77, 0.15, C.black, { seg: 12 }); K.cyl("metal", 0.01, 0.01, 0.26, -0.75, 0.9, 0.15, C.black, { seg: 6 });
  K.torus("leather", 0.09, 0.02, -0.75, 1.0, 0.15, 0x1a1a1e, { rx: 0, arc: Math.PI, ts: 12 });       // headphones on their stand
  for (const s of [-1, 1]) K.sph("leather", 0.04, -0.75 + s * 0.09, 0.98, 0.15, 0x2a2a2e, { sx: 0.6, seg: 10 });
  K.block(-0.9, -0.4, 0.9, 0.4);
}
export function gamingChair(K, col = 0xc82a3a) {
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; K.box("metal", 0.05, 0.04, 0.32, Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.16, C.black, { ry: a }); K.sph("gloss", 0.035, Math.sin(a) * 0.3, 0.035, Math.cos(a) * 0.3, C.black, { seg: 8 }); }
  K.cyl("chrome", 0.028, 0.028, 0.34, 0, 0.27, 0, C.chrome, { seg: 10 });
  K.box("leather", 0.54, 0.1, 0.52, 0, 0.48, 0, 0x1a1a1e, { r: 0.04 });
  for (const s of [-1, 1]) K.box("leather", 0.08, 0.1, 0.5, s * 0.25, 0.55, 0, col, { r: 0.03 });   // seat bolsters
  K.box("leather", 0.5, 0.82, 0.1, 0, 0.98, -0.27, 0x1a1a1e, { r: 0.05, rx: -0.12 });
  for (const s of [-1, 1]) K.box("leather", 0.09, 0.78, 0.12, s * 0.23, 0.97, -0.25, col, { r: 0.04, rx: -0.12 });
  K.box("leather", 0.24, 0.12, 0.08, 0, 1.3, -0.3, col, { r: 0.04, rx: -0.12 });             // head pillow
  for (const s of [-1, 1]) { K.box("metal", 0.04, 0.2, 0.04, s * 0.3, 0.62, 0, C.black); K.box("leather", 0.08, 0.035, 0.26, s * 0.3, 0.73, 0, C.black, { r: 0.015 }); }
  K.block(-0.32, -0.34, 0.32, 0.32);
}
export function guitarStand(K, col = 0xc8501e) {
  K.box("metal", 0.03, 0.02, 0.4, -0.12, 0.02, 0, C.black, { ry: 0.5 }); K.box("metal", 0.03, 0.02, 0.4, 0.12, 0.02, 0, C.black, { ry: -0.5 });
  K.box("metal", 0.02, 0.75, 0.02, 0, 0.4, -0.08, C.black, { rx: -0.12 });
  K.push(0, 0.02, 0, 0.12);
  // body: two lobes and a waist, a sound hole, neck, headstock, tuning pegs, strings
  K.sph("gloss", 0.2, 0, 0.22, 0.04, col, { sx: 1, sy: 1.05, sz: 0.24, seg: 18 });
  K.sph("gloss", 0.15, 0, 0.5, 0.04, col, { sx: 1, sy: 1, sz: 0.3, seg: 18 });
  K.cyl("matte", 0.055, 0.055, 0.01, 0, 0.42, 0.09, 0x1a120a, { rx: Math.PI / 2, seg: 16 });
  K.box("wood", 0.05, 0.62, 0.025, 0, 0.92, 0.06, C.walnut);
  K.box("wood", 0.08, 0.16, 0.025, 0, 1.3, 0.055, 0x2a1a10, { r: 0.006 });
  for (let i = 0; i < 6; i++) K.cyl("chrome", 0.006, 0.006, 0.03, (i % 2 ? 1 : -1) * 0.05, 1.25 + Math.floor(i / 2) * 0.045, 0.055, C.chrome, { rz: Math.PI / 2, seg: 5 });
  for (let i = 0; i < 6; i++) K.box("chrome", 0.002, 1.0, 0.002, -0.0125 + i * 0.005, 0.75, 0.077, 0xe0e0d0);
  K.box("wood", 0.12, 0.02, 0.025, 0, 0.18, 0.09, 0x2a1a10);                            // bridge
  K.pop();
  K.block(-0.22, -0.2, 0.22, 0.2);
}
export function poster(K, x, y, z, ry, w, h, c1, c2) {
  K.push(x, z, ry, y);
  K.box("matte", w, h, 0.005, 0, 0, 0.003, c1);
  K.box("matte", w * 0.8, h * 0.45, 0.002, 0, h * 0.12, 0.007, c2);
  for (let i = 0; i < 3; i++) K.box("matte", w * (0.7 - i * 0.15), 0.025, 0.002, 0, -h * 0.25 - i * 0.05, 0.007, 0xf0f0f0);
  K.pop();
}

// ============================== closet ==============================
const CLOTH = [0x2a3a5a, 0xc8b8a0, 0x8a2a2a, 0xe8e4dc, 0x3a5a3a, 0x1a1a1e, 0xd8a020, 0x6a4a7a, 0x5a6a7a, 0xf0d0d8];
export function clothesRail(K, len) {
  for (const s of [-1, 1]) { K.box("chrome", 0.03, 1.75, 0.03, s * len / 2, 0.875, 0, C.chrome); K.box("chrome", 0.03, 0.03, 0.45, s * len / 2, 0.02, 0, C.chrome); }
  K.cyl("chrome", 0.014, 0.014, len, 0, 1.72, 0, C.chrome, { rz: Math.PI / 2, seg: 8 });
  let x = -len / 2 + 0.1;
  while (x < len / 2 - 0.08) {
    const c = pick(CLOTH), kind = rnd();
    K.torus("chrome", 0.025, 0.004, x, 1.74, 0, C.chrome, { rx: 0, ry: Math.PI / 2, arc: Math.PI * 1.4, ts: 8 });
    K.box("wood", 0.012, 0.03, 0.4, x, 1.66, 0, C.pine, { rx: 0 });                        // hanger bar
    if (kind < 0.45) {                                                                     // a shirt: shoulders, body, sleeves
      K.box("fabric", 0.02, 0.62, 0.42, x, 1.33, 0, c, { r: 0.005 });
      for (const s of [-1, 1]) K.box("fabric", 0.02, 0.4, 0.09, x, 1.45, s * 0.24, c, { rx: s * 0.25 });
      K.box("fabric", 0.024, 0.06, 0.12, x, 1.62, 0, shade(c, 0.85));
    } else if (kind < 0.75) {                                                              // a jacket: longer, lapels
      K.box("fabric", 0.04, 0.8, 0.46, x, 1.25, 0, c, { r: 0.01 });
      for (const s of [-1, 1]) K.box("fabric", 0.045, 0.3, 0.06, x + 0.005, 1.48, s * 0.07, shade(c, 0.8), { rx: s * 0.3 });
      for (let b = 0; b < 3; b++) K.sph("gloss", 0.008, x + 0.025, 1.3 - b * 0.1, 0.02, C.black, { seg: 6, hseg: 4 });
    } else {                                                                               // a dress: fitted top, flared skirt
      K.box("fabric", 0.02, 0.36, 0.3, x, 1.45, 0, c);
      K.cyl("fabric", 0.08, 0.24, 0.6, x, 0.98, 0, c, { seg: 12, sx: 0.2 });
    }
    x += 0.07 + rnd() * 0.05;
  }
  K.block(-len / 2, -0.26, len / 2, 0.26);
}
export function shoeRack(K, w = 1.0) {
  for (let r = 0; r < 4; r++) {
    K.box("wood", w, 0.02, 0.32, 0, 0.08 + r * 0.22, 0, C.white);
    for (let i = 0; i < Math.floor(w / 0.26); i++) {
      const x = -w / 2 + 0.14 + i * 0.26, c = pick([0x1a1a1e, 0xe8e4dc, 0x8a2a2a, 0x5a3a24, 0x2a3a5a, 0xd8a020]), heel = rnd() < 0.3;
      for (const s of [-0.055, 0.055]) {
        K.box("leather", 0.085, 0.07, 0.24, x + s, 0.13 + r * 0.22, 0, c, { r: 0.03 });
        K.box("matte", 0.088, 0.015, 0.25, x + s, 0.098 + r * 0.22, 0, heel ? c : 0xf0f0f0, { r: 0.005 });
        if (heel) K.box("leather", 0.02, 0.08, 0.02, x + s, 0.13 + r * 0.22, -0.1, c);
      }
    }
  }
  for (const s of [-1, 1]) K.box("wood", 0.02, 0.9, 0.32, s * w / 2, 0.45, 0, C.white);
  K.block(-w / 2, -0.17, w / 2, 0.17);
}
export function foldedShelves(K, w = 1.2) {
  K.box("wood", w, 2.0, 0.42, 0, 1.0, 0, C.offwhite);
  K.box("wood", w - 0.04, 1.94, 0.01, 0, 1.0, -0.2, shade(C.offwhite, 0.9));
  for (let r = 0; r < 5; r++) {
    const y = 0.12 + r * 0.38;
    K.box("wood", w - 0.04, 0.02, 0.4, 0, y, 0.01, C.offwhite);
    for (let x = -w / 2 + 0.16; x < w / 2 - 0.12; x += 0.3) for (let k = 0; k < 4; k++) K.box("fabric", 0.26, 0.05, 0.3, x, y + 0.035 + k * 0.052, 0.02, pick(CLOTH), { r: 0.015 });
  }
  K.block(-w / 2, -0.21, w / 2, 0.22);
}
export function ottoman(K, col = 0x8a6a5a) {
  K.box("fabric", 0.8, 0.38, 0.8, 0, 0.23, 0, col, { r: 0.08 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K.sph("fabric", 0.012, -0.27 + i * 0.18, 0.42, -0.27 + j * 0.18, shade(col, 0.7), { seg: 6, hseg: 4 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("wood", 0.025, 0.018, 0.05, x * 0.33, 0.025, z * 0.33, C.walnut, { seg: 8 });
  K.block(-0.4, -0.4, 0.4, 0.4);
}

// ============================== home gym ==============================
export function treadmill(K) {
  K.box("metal", 0.82, 0.14, 1.9, 0, 0.12, 0, 0x2a2a2e, { r: 0.02 });
  K.box("matte", 0.6, 0.015, 1.6, 0, 0.195, -0.05, 0x111112);                              // belt
  for (const s of [-1, 1]) K.box("gloss", 0.1, 0.03, 1.7, s * 0.36, 0.2, -0.05, 0x3a3a3e);
  K.box("gloss", 0.82, 0.16, 0.25, 0, 0.12, 0.92, 0x3a3a3e, { r: 0.04 });                   // motor hood
  for (const s of [-1, 1]) K.box("metal", 0.05, 1.15, 0.06, s * 0.36, 0.72, 0.85, 0x8a8e94, { rx: 0.1 });
  for (const s of [-1, 1]) K.cyl("gloss", 0.02, 0.02, 0.5, s * 0.36, 1.12, 0.62, C.black, { rx: Math.PI / 2, seg: 8 });
  K.box("gloss", 0.78, 0.32, 0.12, 0, 1.3, 0.9, 0x1a1a1e, { r: 0.03, rx: -0.5 });
  K.box("glow", 0.36, 0.14, 0.005, 0, 1.31, 0.83, 0x3bd0ff, { rx: -0.5, em: 1.4 });
  for (let i = 0; i < 6; i++) K.box("glow", 0.04, 0.03, 0.005, -0.28 + (i % 3) * 0.08 + (i > 2 ? 0.4 : 0), 1.22, 0.85, 0xff8a3a, { rx: -0.5, em: 1.2 });
  K.block(-0.45, -1.0, 0.45, 1.05);
}
export function weightBench(K) {
  K.box("leather", 0.3, 0.08, 1.2, 0, 0.45, 0, 0x1a1a1e, { r: 0.03 });
  K.box("metal", 0.08, 0.38, 0.08, 0, 0.21, 0.45, 0x8a8e94); K.box("metal", 0.08, 0.38, 0.08, 0, 0.21, -0.45, 0x8a8e94);
  K.box("metal", 0.5, 0.05, 0.06, 0, 0.03, 0.5, 0x8a8e94); K.box("metal", 0.5, 0.05, 0.06, 0, 0.03, -0.5, 0x8a8e94);
  for (const s of [-1, 1]) { K.box("metal", 0.06, 1.15, 0.06, s * 0.55, 0.58, -0.5, 0x2a2a2e); K.box("metal", 0.12, 0.05, 0.08, s * 0.55, 1.05, -0.47, 0x2a2a2e); }
  // barbell racked with plates
  K.cyl("chrome", 0.016, 0.016, 2.0, 0, 1.1, -0.47, C.chrome, { rz: Math.PI / 2, seg: 8 });
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) K.cyl("metal", 0.22 - i * 0.04, 0.22 - i * 0.04, 0.04, s * (0.72 + i * 0.05), 1.1, -0.47, [0xc82a2a, 0x2a5aa8][i], { rz: Math.PI / 2, seg: 18 });
  K.block(-0.95, -0.65, 0.95, 0.65);
}
export function dumbbellRack(K) {
  K.box("metal", 1.4, 0.04, 0.4, 0, 0.5, 0, 0x2a2a2e); K.box("metal", 1.4, 0.04, 0.4, 0, 0.85, -0.05, 0x2a2a2e, { rx: 0.3 });
  for (const s of [-1, 1]) K.box("metal", 0.05, 0.9, 0.4, s * 0.68, 0.45, 0, 0x2a2a2e);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
    const x = -0.56 + i * 0.28, y = r ? 0.92 : 0.57, rr = 0.045 + i * 0.008;
    K.cyl("chrome", 0.014, 0.014, 0.22, x, y, -r * 0.03, C.chrome, { rz: Math.PI / 2, seg: 6 });
    for (const s of [-1, 1]) K.cyl("matte", rr, rr, 0.05, x + s * 0.09, y, -r * 0.03, 0x1a1a1e, { rz: Math.PI / 2, seg: 6 });
  }
  K.block(-0.72, -0.22, 0.72, 0.22);
}
export function punchingBag(K) {
  K.box("metal", 0.06, 0.06, 0.6, 0, 2.45, 0.25, C.black);
  for (let i = 0; i < 3; i++) K.cyl("chrome", 0.004, 0.004, 0.35, Math.cos(i * 2.1) * 0.06, 2.25, Math.sin(i * 2.1) * 0.06, C.chrome, { seg: 4 });
  K.cyl("leather", 0.18, 0.18, 1.05, 0, 1.55, 0, 0xa82a2a, { seg: 18 });
  K.sph("leather", 0.18, 0, 2.07, 0, 0xa82a2a, { half: true, seg: 18 }); K.sph("leather", 0.18, 0, 1.03, 0, 0xa82a2a, { half: true, rx: Math.PI, seg: 18 });
  for (const y of [1.3, 1.8]) K.torus("leather", 0.182, 0.008, 0, y, 0, 0x1a1a1e, { ts: 24 });
  K.block(-0.2, -0.2, 0.2, 0.2);
}
export function yogaMat(K, col = 0x3a8a8a) { K.box("fabric", 0.62, 0.012, 1.8, 0, 0.046, 0, col, { r: 0.004 }); K.cyl("fabric", 0.06, 0.06, 0.62, 0.0, 0.1, 0.95, shade(col, 0.85), { rz: Math.PI / 2, seg: 12 }); }

// ============================== home cinema ==============================
export function cinemaScreen(K, w) {
  K.box("metal", w + 0.2, 0.12, 0.12, 0, 2.62, 0, 0x1a1a1e);
  K.box("matte", w, w * 0.45, 0.02, 0, 2.62 - w * 0.225 - 0.06, 0.03, 0xf4f4f0);
  K.box("matte", w + 0.06, 0.04, 0.03, 0, 2.62 - w * 0.45 - 0.08, 0.03, 0x1a1a1e);
}
export function recliner(K, col = 0x3a2a2a) {
  K.box("leather", 0.86, 0.42, 0.9, 0, 0.26, 0, col, { r: 0.06 });
  K.box("leather", 0.86, 0.7, 0.22, 0, 0.7, -0.38, col, { r: 0.08, rx: -0.15 });
  for (const s of [-1, 1]) { K.box("leather", 0.16, 0.26, 0.85, s * 0.43, 0.55, 0, col, { r: 0.06 }); K.cyl("gloss", 0.04, 0.04, 0.08, s * 0.43, 0.7, 0.25, C.black, { seg: 12 }); }    // cup holders
  K.box("leather", 0.6, 0.16, 0.7, 0, 0.5, 0.05, shade(col, 1.15), { r: 0.06 });
  K.box("leather", 0.6, 0.1, 0.3, 0, 0.32, 0.55, col, { r: 0.04, rx: 0.4 });                // footrest
  K.block(-0.52, -0.5, 0.52, 0.62);
}
export function popcornMachine(K) {
  K.box("gloss", 0.62, 0.6, 0.45, 0, 0.3, 0, 0xc81e1e, { r: 0.02 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("gloss", 0.03, 0.04, 0.3, x * 0.26, -0.0 + 0.0, z * 0.18, 0xc8a24a, { seg: 8 });
  K.box("glass", 0.56, 0.55, 0.4, 0, 0.88, 0, 0xfff4d8);
  K.box("gloss", 0.62, 0.08, 0.45, 0, 1.19, 0, 0xc81e1e, { r: 0.02 });
  for (let i = 0; i < 60; i++) K.sph("matte", 0.018, -0.24 + rnd() * 0.48, 0.64 + rnd() * rnd() * 0.25, -0.16 + rnd() * 0.32, 0xfff0b0, { seg: 5, hseg: 4 });
  K.cyl("metal", 0.1, 0.08, 0.1, 0.05, 1.04, 0, 0x8a8e94, { seg: 12 });
  K.box("glow", 0.5, 0.1, 0.01, 0, 1.19, 0.231, 0xffe080, { em: 1.6 });
  K.block(-0.33, -0.25, 0.33, 0.25);
}
export function projector(K, x, z, H) {
  K.cyl("metal", 0.02, 0.02, 0.4, x, H - 0.2, z, C.black, { seg: 6 });
  K.box("gloss", 0.36, 0.12, 0.3, x, H - 0.46, z, 0xe8e8e4, { r: 0.02 });
  K.cyl("glass", 0.045, 0.05, 0.03, x, H - 0.46, z + 0.16, 0x2a3a5a, { rx: Math.PI / 2, seg: 14 });
  K.cyl("glow", 0.035, 0.035, 0.005, x, H - 0.46, z + 0.177, 0xe8f0ff, { rx: Math.PI / 2, em: 3, seg: 12 });
}

// ============================== garage ==============================
export function workbench(K, len = 2.2) {
  K.box("wood", len, 0.06, 0.7, 0, 0.9, 0, 0xa8784a);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("metal", 0.06, 0.88, 0.06, x * (len / 2 - 0.06), 0.44, z * 0.3, 0x3a3a3e);
  K.box("wood", len - 0.1, 0.03, 0.6, 0, 0.25, 0, 0xa8784a);
  // pegboard with tools on the wall behind
  K.box("matte", len, 1.0, 0.02, 0, 1.6, -0.34, 0xc8a878);
  for (let i = 0; i < 70; i++) K.cyl("matte", 0.006, 0.006, 0.005, -len / 2 + 0.05 + (i % 14) * (len / 14), 1.15 + Math.floor(i / 14) * 0.2, -0.328, 0x6a5a40, { rx: Math.PI / 2, seg: 4 });
  const tools = [
    () => { K.box("metal", 0.04, 0.22, 0.02, 0, 0, 0, 0x8a8e94); K.box("gloss", 0.05, 0.1, 0.03, 0, -0.14, 0, 0xc82a2a); },                       // screwdriver
    () => { K.box("metal", 0.13, 0.035, 0.02, 0, 0.08, 0, 0x5a5e62); K.box("wood", 0.03, 0.26, 0.025, 0, -0.04, 0, 0xa8784a); },                // hammer
    () => { K.box("chrome", 0.025, 0.28, 0.01, 0, 0, 0, C.chrome); K.torus("chrome", 0.025, 0.008, 0, 0.15, 0, C.chrome, { rx: 0, ts: 10 }); },  // spanner
    () => { K.box("metal", 0.3, 0.1, 0.004, 0, 0, 0, 0xc8c8c8); K.box("gloss", 0.06, 0.1, 0.03, 0.17, 0, 0, 0x2a5aa8); },                       // saw
    () => { K.box("gloss", 0.08, 0.16, 0.06, 0, 0, 0, 0xe8a020, { r: 0.015 }); K.cyl("metal", 0.015, 0.015, 0.08, 0, 0.1, 0.04, C.black, { rx: Math.PI / 2, seg: 6 }); },   // drill
  ];
  for (let i = 0; i < 9; i++) { K.push(-len / 2 + 0.2 + i * (len - 0.4) / 8, -0.31, 0, 1.55 + (i % 2) * 0.2); tools[i % tools.length](); K.pop(); }
  // vice, toolbox, a jar of screws
  K.box("metal", 0.14, 0.1, 0.16, len / 2 - 0.2, 0.98, 0.3, 0x2a5aa8); K.box("metal", 0.14, 0.07, 0.04, len / 2 - 0.2, 0.98, 0.42, 0x2a5aa8);
  K.box("metal", 0.55, 0.3, 0.3, -len / 2 + 0.4, 1.08, 0.05, 0xc82a2a, { r: 0.01 }); K.box("chrome", 0.3, 0.02, 0.03, -len / 2 + 0.4, 1.25, 0.05, C.chrome);
  K.lathe("glass", [[0.001, 0], [0.05, 0], [0.05, 0.12], [0.04, 0.13]], 0.2, 0.93, 0.2, 0xd8d0c0);
  K.block(-len / 2, -0.36, len / 2, 0.36);
}
export function toolChest(K) {
  K.box("metal", 0.75, 1.0, 0.48, 0, 0.55, 0, 0xc82a2a, { r: 0.015 });
  for (let i = 0; i < 6; i++) { K.box("metal", 0.7, 0.13, 0.01, 0, 0.17 + i * 0.155, 0.245, shade(0xc82a2a, 1.1)); K.box("chrome", 0.5, 0.015, 0.02, 0, 0.2 + i * 0.155, 0.255, C.chrome); }
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("gloss", 0.03, 0.03, 0.04, x * 0.3, 0.03, z * 0.18, C.black, { rz: Math.PI / 2, seg: 10 });
  K.block(-0.38, -0.24, 0.38, 0.26);
}
export function bicycle(K, col = 0x2a8a5a) {
  for (const z of [-0.52, 0.52]) { K.torus("matte", 0.33, 0.025, 0, 0.36, z, C.black, { rx: 0, ry: Math.PI / 2, ts: 28 }); K.torus("chrome", 0.3, 0.008, 0, 0.36, z, C.chrome, { rx: 0, ry: Math.PI / 2, ts: 24 }); for (let i = 0; i < 8; i++) K.box("chrome", 0.003, 0.6, 0.003, 0, 0.36, z, C.chrome, { rx: i * Math.PI / 8 }); }
  K.box("gloss", 0.03, 0.03, 0.62, 0, 0.62, 0.0, col, { rx: 0.05 });
  K.box("gloss", 0.03, 0.55, 0.03, 0, 0.55, -0.18, col, { rx: 0.35 });
  K.box("gloss", 0.03, 0.5, 0.03, 0, 0.5, 0.25, col, { rx: -0.6 });
  K.box("gloss", 0.025, 0.03, 0.4, 0, 0.36, -0.36, col);
  K.box("leather", 0.1, 0.04, 0.24, 0, 0.88, -0.26, C.black, { r: 0.015 });
  K.box("chrome", 0.5, 0.025, 0.025, 0, 0.92, 0.4, C.black); K.box("chrome", 0.025, 0.4, 0.025, 0, 0.72, 0.42, C.chrome, { rx: -0.25 });
  K.cyl("chrome", 0.06, 0.06, 0.02, 0.05, 0.36, -0.05, C.chrome, { rz: Math.PI / 2, seg: 14 });
  K.block(-0.15, -0.9, 0.15, 0.9);
}
export function garageDoor(K, w, H) {
  K.box("metal", w, H - 0.4, 0.06, 0, (H - 0.4) / 2, 0, 0xd8d8d4);
  for (let i = 0; i < 6; i++) K.box("metal", w, 0.03, 0.08, 0, 0.3 + i * (H - 0.6) / 6, 0.01, 0xb8b8b4);
  K.box("chrome", 0.3, 0.04, 0.05, 0, 0.9, 0.05, C.chrome);
  K.box("metal", 0.08, 0.1, 2.2, -w / 2 + 0.1, H - 0.3, -1.1, 0x5a5e62); K.box("metal", 0.08, 0.1, 2.2, w / 2 - 0.1, H - 0.3, -1.1, 0x5a5e62);
  K.box("gloss", 0.4, 0.2, 0.6, 0, H - 0.25, -2.0, 0xe8e8e4);                                // opener motor
}

// ============================== kids' room ==============================
export function bunkBed(K, col = 0x3a7ab8, col2 = 0xe86a3a) {
  const W = 1.0, L = 2.0;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.07, 1.75, 0.07, x * (W / 2 + 0.02), 0.875, z * (L / 2 + 0.02), C.white);
  for (const y of [0.3, 1.25]) {
    K.box("wood", W + 0.1, 0.1, L + 0.1, 0, y, 0, C.white);
    K.box("fabric", W - 0.04, 0.16, L - 0.06, 0, y + 0.13, 0, C.white, { r: 0.04 });
    K.box("fabric", W, 0.06, L * 0.62, 0, y + 0.22, L * 0.17, y < 1 ? col : col2, { r: 0.025 });
    K.box("fabric", 0.5, 0.1, 0.3, 0, y + 0.25, -L / 2 + 0.25, 0xf4f4f0, { r: 0.04, rx: -0.3 });
  }
  for (const z of [-0.5, 0.5]) K.box("wood", 0.04, 0.04, 0.9, W / 2 + 0.06, 1.62, z * 0.9, C.white);             // safety rail
  K.box("wood", 0.04, 0.04, L, -W / 2 - 0.06, 1.62, 0, C.white);
  for (let i = 0; i < 4; i++) K.box("wood", 0.04, 0.04, 0.36, W / 2 + 0.24, 0.4 + i * 0.32, L / 2 - 0.2, C.white);   // ladder rungs
  for (const z of [L / 2 - 0.02, L / 2 - 0.38]) K.box("wood", 0.05, 1.6, 0.05, W / 2 + 0.24, 0.8, z, C.white);
  K.block(-W / 2 - 0.08, -L / 2 - 0.08, W / 2 + 0.3, L / 2 + 0.08);
}
export function toyChest(K) {
  K.box("wood", 0.8, 0.45, 0.45, 0, 0.23, 0, 0xe8c040, { r: 0.02 });
  K.box("wood", 0.82, 0.06, 0.47, 0, 0.62, -0.18, 0xe85a3a, { rx: -1.1 });                 // lid, open
  for (let i = 0; i < 6; i++) K.sph("gloss", 0.06, -0.25 + i * 0.1, 0.48 + (i % 2) * 0.04, (rnd() - 0.5) * 0.2, pick([0xe83a3a, 0x3a8ae8, 0x3ae86a, 0xe8d03a]), { seg: 10 });
  K.box("gloss", 0.15, 0.15, 0.15, 0.25, 0.53, 0.05, 0x3a8ae8, { ry: 0.4 });
  K.block(-0.42, -0.25, 0.42, 0.25);
}
export function teddy(K, x, y, z, ry = 0) {
  K.push(x, z, ry, y);
  K.sph("fabric", 0.12, 0, 0.13, 0, 0x8a5a3a, { sy: 1.15, seg: 12 }); K.sph("fabric", 0.09, 0, 0.32, 0.01, 0x8a5a3a, { seg: 12 });
  for (const s of [-1, 1]) { K.sph("fabric", 0.035, s * 0.07, 0.4, 0, 0x8a5a3a, { seg: 8 }); K.sph("fabric", 0.045, s * 0.1, 0.1, 0.06, 0x8a5a3a, { seg: 8 }); K.sph("fabric", 0.04, s * 0.12, 0.2, 0.02, 0x8a5a3a, { seg: 8 }); K.sph("gloss", 0.01, s * 0.03, 0.34, 0.08, C.black, { seg: 6 }); }
  K.sph("fabric", 0.035, 0, 0.31, 0.08, 0xd8b090, { seg: 8 });
  K.pop();
}
export function rocketLamp(K, x, z) {
  K.cyl("gloss", 0.06, 0.08, 0.35, x, 0.95, z, C.white, { seg: 12 });
  K.lathe("gloss", [[0.06, 0], [0.04, 0.1], [0.001, 0.18]], x, 1.12, z, 0xe83a3a, { seg: 12 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; K.box("gloss", 0.01, 0.12, 0.08, x + Math.sin(a) * 0.08, 0.84, z + Math.cos(a) * 0.08, 0xe83a3a, { ry: a }); }
  K.cyl("glow", 0.025, 0.025, 0.004, x, 1.0, z + 0.06, 0xbfe0ff, { rx: Math.PI / 2, em: 2, seg: 10 });
}

// ============================== restaurant storeroom ==============================
export function sack(K, x, y, z, ry = 0, col = 0xe8dcc0) {
  K.push(x, z, ry, y);
  K.box("fabric", 0.45, 0.22, 0.7, 0, 0.11, 0, col, { r: 0.09 });
  K.box("fabric", 0.4, 0.12, 0.1, 0, 0.12, 0.38, shade(col, 0.95), { r: 0.04 });
  K.box("matte", 0.2, 0.004, 0.2, 0, 0.222, 0.05, 0x2a5aa8);
  K.pop();
}
export function produceCrate(K, x, y, z, fruit = 0xd83a2a) {
  K.push(x, z, 0, y);
  for (const s of [-1, 1]) { K.box("wood", 0.5, 0.2, 0.02, 0, 0.1, s * 0.17, C.pine); K.box("wood", 0.02, 0.2, 0.36, s * 0.24, 0.1, 0, C.pine); }
  K.box("wood", 0.5, 0.01, 0.36, 0, 0.005, 0, C.pine);
  for (let i = 0; i < 12; i++) K.sph("gloss", 0.045, -0.18 + (i % 4) * 0.12, 0.2, -0.1 + Math.floor(i / 4) * 0.1, fruit, { seg: 8, hseg: 6 });
  K.pop();
}
export function canRow(K, x, y, z, n = 8, col = 0xc82a2a) {
  for (let i = 0; i < n; i++) { K.cyl("metal", 0.05, 0.05, 0.13, x + i * 0.105, y + 0.065, z, C.steel, { seg: 10 }); K.cyl("matte", 0.051, 0.051, 0.08, x + i * 0.105, y + 0.065, z, col, { seg: 10 }); }
}
export function mopBucket(K) {
  K.cyl("gloss", 0.2, 0.17, 0.3, 0, 0.2, 0, 0xe8c020, { seg: 14 });
  K.box("gloss", 0.3, 0.12, 0.2, 0, 0.42, 0.06, 0x5a5a5a);
  for (const [x, z] of [[0.15, 0.12], [-0.15, 0.12], [0.15, -0.12], [-0.15, -0.12]]) K.sph("gloss", 0.03, x, 0.03, z, C.black, { seg: 6 });
  K.cyl("wood", 0.013, 0.013, 1.4, 0.05, 0.75, -0.05, C.pine, { rz: 0.15, seg: 6 });
  K.cyl("fabric", 0.08, 0.1, 0.2, 0.0, 0.25, -0.05, 0xe8e4dc, { seg: 10 });
  K.block(-0.22, -0.22, 0.22, 0.22);
}

// ============================== club green room / keg store ==============================
export function dressingTable(K, w = 1.4) {
  K.box("wood", w, 0.05, 0.5, 0, 0.75, 0, 0xf4f0e8, { r: 0.008 });
  for (const s of [-1, 1]) K.box("wood", 0.4, 0.72, 0.48, s * (w / 2 - 0.2), 0.36, 0, 0xf4f0e8);
  K.box("wood", w, 0.9, 0.05, 0, 1.3, -0.23, 0x1a1a1e);
  K.box("mirror", w - 0.16, 0.74, 0.01, 0, 1.3, -0.2, 0xe8eef2);
  for (let i = 0; i < 6; i++) { const x = -w / 2 + 0.08 + i * (w - 0.16) / 5; K.sph("glow", 0.035, x, 1.72, -0.19, 0xfff0c8, { em: 3, seg: 8 }); }   // the bulbs round the mirror
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) K.sph("glow", 0.035, s * (w / 2 - 0.04), 0.98 + i * 0.2, -0.19, 0xfff0c8, { em: 3, seg: 8 });
  for (let i = 0; i < 6; i++) K.cyl("gloss", 0.02, 0.02, 0.06 + rnd() * 0.08, -0.4 + i * 0.08, 0.81, 0.05, pick([0xd82a6a, 0x1a1a1e, 0xc8a24a, 0xe8e4dc]), { seg: 8 });
  K.block(-w / 2, -0.25, w / 2, 0.26);
}
export function guitarCase(K, x, z, ry) { K.push(x, z, ry, 0); K.box("leather", 0.38, 1.05, 0.12, 0, 0.53, 0, 0x1a1a1e, { r: 0.05, rx: -0.15 }); K.box("chrome", 0.08, 0.02, 0.03, 0, 0.6, 0.07, C.chrome, { rx: -0.15 }); K.pop(); }
export function keg(K, x, z, y = 0) {
  K.cyl("metal", 0.2, 0.2, 0.58, x, y + 0.29, z, C.steel, { seg: 18 });
  for (const yy of [0.06, 0.29, 0.52]) K.torus("metal", 0.205, 0.015, x, y + yy, z, 0x9aa0a6, { ts: 22 });
  K.cyl("metal", 0.2, 0.2, 0.1, x, y + 0.63, z, C.steel, { seg: 18, open: true });                   // the top skirt, with its handle cut-outs
  for (const a of [0, Math.PI]) K.box("matte", 0.12, 0.04, 0.03, x + Math.sin(a) * 0.19, y + 0.645, z + Math.cos(a) * 0.19, 0x1a1a1a, { ry: a });
  K.cyl("gloss", 0.045, 0.045, 0.04, x, y + 0.6, z, pick([0xd82a2a, 0x2a9a4a, 0x2a5aa8]), { seg: 12 });     // the spear cap
  K.block(x - 0.21, z - 0.21, x + 0.21, z + 0.21);
}
export function bottleCrate(K, x, y, z, ry = 0, col = 0x2a6a3a) {
  K.push(x, z, ry, y);
  K.box("gloss", 0.42, 0.28, 0.3, 0, 0.14, 0, 0xd8a020);
  for (let i = 0; i < 12; i++) K.lathe("glass", [[0.001, 0], [0.03, 0], [0.03, 0.18], [0.012, 0.26], [0.013, 0.28]], -0.15 + (i % 4) * 0.1, 0.06, -0.1 + Math.floor(i / 4) * 0.1, col, { seg: 8 });
  K.pop();
}
export function iceMachine(K) {
  K.box("metal", 0.75, 1.4, 0.65, 0, 0.7, 0, C.steel, { r: 0.015 });
  K.box("metal", 0.6, 0.5, 0.02, 0, 0.55, 0.33, 0x9aa0a6, { rx: -0.05 }); K.box("chrome", 0.4, 0.03, 0.04, 0, 0.82, 0.35, C.chrome);
  K.box("glow", 0.08, 0.04, 0.005, 0.25, 1.25, 0.327, 0x60c0ff, { em: 1.5 });
  for (let i = 0; i < 8; i++) K.box("matte", 0.6, 0.01, 0.005, 0, 1.0 + i * 0.04, 0.327, 0x5a5e62);
  K.block(-0.38, -0.33, 0.38, 0.35);
}

// ============================== restoration studio / vault ==============================
export function easel(K, art) {
  K.box("wood", 0.04, 1.75, 0.04, -0.3, 0.86, 0.1, C.pine, { rz: 0.12 }); K.box("wood", 0.04, 1.75, 0.04, 0.3, 0.86, 0.1, C.pine, { rz: -0.12 });
  K.box("wood", 0.04, 1.6, 0.04, 0, 0.78, -0.35, C.pine, { rx: -0.35 });
  K.box("wood", 0.7, 0.04, 0.08, 0, 0.75, 0.13, C.pine);
  K.box("wood", 0.08, 0.06, 0.06, 0, 1.6, 0.11, C.pine);
  K.box("matte", 0.7, 0.85, 0.025, 0, 1.2, 0.1, 0xf4f0e8);                       // canvas (the painting goes on it)
  K.block(-0.4, -0.45, 0.4, 0.2);
  return { y: 1.2, z: 0.115, w: 0.66, h: 0.8 };
}
export function paintTable(K) {
  K.box("wood", 1.3, 0.04, 0.7, 0, 0.82, 0, 0xc8b8a0);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.box("wood", 0.05, 0.8, 0.05, x * 0.6, 0.4, z * 0.3, 0x8a6a4a);
  for (let i = 0; i < 40; i++) K.cyl("matte", 0.02 + rnd() * 0.04, 0.02 + rnd() * 0.04, 0.003, -0.55 + rnd() * 1.1, 0.842, -0.3 + rnd() * 0.6, pick([0xd82a2a, 0x2a6ad8, 0xe8c020, 0x2a9a4a, 0xf0f0f0, 0x6a2a8a]), { seg: 8 });   // paint splats
  K.box("wood", 0.4, 0.01, 0.28, -0.3, 0.85, 0.1, 0xb89060, { ry: 0.3 });                   // palette
  for (let i = 0; i < 6; i++) K.sph("gloss", 0.025, -0.4 + i * 0.05, 0.86, 0.06 + (i % 2) * 0.05, pick([0xd82a2a, 0x2a6ad8, 0xe8c020, 0x2a9a4a, 0xf0f0f0, 0x6a2a8a]), { seg: 6, sy: 0.4 });
  for (const x of [0.3, 0.45]) { K.cyl("glass", 0.045, 0.045, 0.14, x, 0.91, -0.15, 0xc8d8e0, { seg: 12 }); for (let b = 0; b < 4; b++) K.cyl("wood", 0.005, 0.004, 0.26, x + (b - 1.5) * 0.012, 1.0, -0.15, pick([C.pine, 0xd82a2a, C.black]), { rz: (b - 1.5) * 0.12, seg: 4 }); }
  for (let i = 0; i < 5; i++) K.cyl("metal", 0.012, 0.012, 0.09, 0.0 + i * 0.03, 0.85, 0.2, pick([0xd82a2a, 0x2a6ad8, 0xe8c020, 0x2a9a4a]), { rz: Math.PI / 2, seg: 6 });   // paint tubes
  K.block(-0.65, -0.35, 0.65, 0.35);
}
export function vaultDoor(K) {
  K.box("metal", 2.4, 2.6, 0.3, 0, 1.3, 0, 0x5a5e62);
  K.cyl("metal", 1.0, 1.0, 0.25, 0, 1.3, 0.15, 0x8a8e94, { rx: Math.PI / 2, seg: 32 });
  K.torus("chrome", 0.95, 0.04, 0, 1.3, 0.28, 0x9aa0a6, { rx: 0, ts: 40 });
  K.cyl("chrome", 0.2, 0.2, 0.08, 0, 1.3, 0.32, C.chrome, { rx: Math.PI / 2, seg: 20 });
  for (let i = 0; i < 3; i++) K.box("chrome", 0.06, 0.8, 0.05, 0, 1.3, 0.38, C.chrome, { rz: i * Math.PI / 3 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; K.cyl("chrome", 0.035, 0.035, 0.06, Math.cos(a) * 0.82, 1.3 + Math.sin(a) * 0.82, 0.29, C.chrome, { rx: Math.PI / 2, seg: 8 }); }
  K.box("glow", 0.12, 0.06, 0.02, 0.85, 2.3, 0.16, 0x40ff80, { em: 2 });
}
export function artRack(K, w = 2.0) {
  K.box("metal", w, 0.06, 1.0, 0, 0.03, 0, 0x3a3a3e);
  for (let i = 0; i <= 8; i++) K.box("metal", 0.025, 1.6, 0.025, -w / 2 + i * w / 8, 0.83, 0.48, 0x5a5e62);
  K.box("metal", w, 0.04, 0.04, 0, 1.62, 0.48, 0x5a5e62);
  for (let i = 0; i < 8; i++) { const h = 0.7 + rnd() * 0.7; K.box("wood", 0.04, h, 0.8, -w / 2 + 0.12 + i * w / 8, 0.06 + h / 2, 0, 0x1e1a14); K.box("matte", 0.045, h - 0.08, 0.72, -w / 2 + 0.12 + i * w / 8 + 0.004, 0.06 + h / 2, 0, pick([0x8a3a2a, 0x2a5a8a, 0xc8a24a, 0x3a6a3a, 0x6a2a6a, 0xd8d0c0])); }
  K.block(-w / 2, -0.5, w / 2, 0.52);
}

// ============================== operating theatre / imaging ==============================
export function operatingTable(K) {
  K.cyl("metal", 0.3, 0.35, 0.06, 0, 0.03, 0, 0x8a8e94, { seg: 20 });
  K.cyl("chrome", 0.1, 0.12, 0.75, 0, 0.42, 0, C.chrome, { seg: 14 });
  K.box("metal", 0.6, 0.08, 2.0, 0, 0.82, 0, 0x5a5e62);
  K.box("leather", 0.56, 0.08, 1.95, 0, 0.9, 0, 0x2a5a6a, { r: 0.03 });
  K.box("leather", 0.3, 0.06, 0.25, 0, 0.95, -0.85, 0x2a5a6a, { r: 0.03 });
  for (const s of [-1, 1]) K.box("leather", 0.12, 0.05, 0.6, s * 0.5, 0.88, -0.1, 0x2a5a6a, { r: 0.02, ry: s * 0.4 });     // arm boards
  K.box("fabric", 0.58, 0.02, 1.2, 0, 0.95, 0.3, 0x6ab8a8, { r: 0.008 });                   // sterile drape
  K.block(-0.65, -1.0, 0.65, 1.0);
}
export function surgicalLamp(K, x, z, H) {
  K.cyl("metal", 0.12, 0.12, 0.05, x, H - 0.03, z, C.white, { seg: 14 });
  K.cyl("chrome", 0.025, 0.025, 0.5, x, H - 0.3, z, C.chrome, { seg: 8 });
  for (const [dx, dz, a] of [[-0.45, 0.1, 0.5], [0.45, -0.1, -0.5]]) {
    K.box("chrome", 0.9, 0.04, 0.04, x + dx / 2, H - 0.55, z + dz / 2, C.chrome, { ry: Math.atan2(dz, dx) });
    K.push(x + dx, z + dz, 0, H - 0.8);
    K.sph("gloss", 0.3, 0, 0, 0, C.white, { half: true, seg: 22, sy: 0.4 });
    for (let i = 0; i < 7; i++) { const aa = i / 6 * TAU, rr = i ? 0.17 : 0; K.cyl("glow", 0.055, 0.055, 0.01, Math.cos(aa) * rr, -0.005, Math.sin(aa) * rr, 0xf4f8ff, { em: 3, seg: 12 }); }
    K.cyl("chrome", 0.03, 0.03, 0.12, 0, -0.07, 0, C.chrome, { seg: 8 });
    K.pop();
  }
}
export function anesthesiaMachine(K) {
  K.box("metal", 0.7, 0.9, 0.6, 0, 0.55, 0, 0xe8ecef, { r: 0.02 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) K.cyl("gloss", 0.04, 0.04, 0.04, x * 0.3, 0.04, z * 0.25, C.black, { rz: Math.PI / 2, seg: 10 });
  K.box("metal", 0.7, 0.05, 0.62, 0, 1.03, 0, 0xb8c0c8);
  K.box("gloss", 0.5, 0.36, 0.06, 0, 1.45, -0.22, C.black, { r: 0.01 }); K.box("vitals", 0.45, 0.3, 0.005, 0, 1.45, -0.187, 0xffffff);
  for (let i = 0; i < 3; i++) { K.cyl("glass", 0.03, 0.03, 0.16, -0.25 + i * 0.07, 1.15, 0.2, 0xd8f0ff, { seg: 8 }); K.sph("gloss", 0.02, -0.25 + i * 0.07, 1.13, 0.2, [0x40c040, 0x2a6ad8, 0xe8e8e8][i], { seg: 6 }); }
  K.lathe("matte", [[0.001, 0], [0.06, 0.01], [0.09, 0.2], [0.03, 0.3]], 0.25, 1.06, 0.15, 0x2a2a2e);   // bellows
  K.torus("gloss", 0.15, 0.015, 0.15, 0.9, 0.35, 0x6ab0d8, { rx: 0.3, ts: 16 });                   // breathing circuit
  K.block(-0.36, -0.32, 0.36, 0.32);
}
export function instrumentTrolley(K) {
  K.box("chrome", 0.7, 0.02, 0.45, 0, 0.92, 0, C.steel); K.box("chrome", 0.7, 0.02, 0.45, 0, 0.35, 0, C.steel);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { K.cyl("chrome", 0.012, 0.012, 0.92, x * 0.33, 0.47, z * 0.2, C.chrome, { seg: 6 }); K.sph("gloss", 0.025, x * 0.33, 0.025, z * 0.2, C.black, { seg: 6 }); }
  K.box("fabric", 0.6, 0.005, 0.38, 0, 0.935, 0, 0x6ab8a8);
  for (let i = 0; i < 8; i++) K.box("chrome", 0.012, 0.004, 0.14 + (i % 3) * 0.03, -0.24 + i * 0.065, 0.94, 0, C.chrome);
  K.box("chrome", 0.2, 0.03, 0.12, 0.2, 0.95, 0.12, C.chrome);
  K.block(-0.36, -0.24, 0.36, 0.24);
}
export function scrubSink(K, w = 1.6) {
  K.box("chrome", w, 0.3, 0.55, 0, 0.85, 0, C.steel); K.box("chrome", w - 0.1, 0.22, 0.45, 0, 0.9, 0.02, 0x8a8e94);
  K.box("metal", w, 0.7, 0.5, 0, 0.35, -0.02, C.steel);
  for (let i = 0; i < 2; i++) { const x = -w / 4 + i * w / 2; K.cyl("chrome", 0.015, 0.015, 0.4, x, 1.2, -0.22, C.chrome, { seg: 8 }); K.torus("chrome", 0.1, 0.015, x, 1.4, -0.12, C.chrome, { arc: Math.PI, rx: 0, ry: Math.PI / 2 }); K.box("chrome", 0.03, 0.18, 0.03, x + 0.1, 1.1, -0.22, C.chrome, { rz: 0.8 }); }
  K.block(-w / 2, -0.28, w / 2, 0.28);
}
export function mriScanner(K) {
  // the gantry: a big rounded block with the bore through it, the patient couch sliding in
  K.box("gloss", 2.2, 2.1, 1.3, 0, 1.05, 0, 0xeef2f4, { r: 0.18 });
  K.cyl("gloss", 0.38, 0.38, 1.32, 0, 1.0, 0, 0x1a1e24, { rx: Math.PI / 2, seg: 32, open: true });
  K.torus("gloss", 0.42, 0.05, 0, 1.0, 0.66, 0xdde4ea, { rx: 0, ts: 32 });
  K.torus("glow", 0.44, 0.01, 0, 1.0, 0.7, 0x60c8ff, { rx: 0, ts: 32, em: 2.5 });
  K.box("gloss", 0.9, 0.12, 0.5, 0, 1.95, 0.66, 0x2a8ac8, { r: 0.04 });
  K.box("glow", 0.3, 0.06, 0.01, 0, 1.95, 0.915, 0xe8f4ff, { em: 1.5 });
  // couch
  K.box("gloss", 0.6, 0.65, 1.6, 0, 0.33, 1.5, 0xdde4ea, { r: 0.05 });
  K.box("leather", 0.5, 0.08, 2.4, 0, 0.7, 1.1, 0x2a5a6a, { r: 0.03 });
  K.box("leather", 0.3, 0.06, 0.2, 0, 0.76, 2.1, 0xe8e8e8, { r: 0.03 });
  K.block(-1.1, -0.65, 1.1, 2.3);
}
export function lightbox(K, w = 1.6) {
  K.box("metal", w, 0.62, 0.08, 0, 1.6, 0.04, 0xe8ecef);
  K.box("glow", w - 0.1, 0.52, 0.01, 0, 1.6, 0.085, 0xf0f6ff, { em: 1.2 });
  for (let i = 0; i < 3; i++) {                                                             // x-ray films: ribs, a skull, a hand
    const x = -w / 2 + 0.3 + i * (w - 0.3) / 3;
    K.box("matte", 0.4, 0.48, 0.003, x, 1.6, 0.093, 0x1a2228);
    if (i === 0) for (let r = 0; r < 6; r++) K.torus("glow", 0.12, 0.006, x, 1.48 + r * 0.045, 0.096, 0xc8d4dc, { rx: 0, sy: 0.25, arc: Math.PI, em: 0.9, ts: 14 });
    if (i === 1) { K.sph("glow", 0.11, x, 1.64, 0.096, 0xc8d4dc, { sz: 0.02, em: 0.8, seg: 14 }); K.sph("matte", 0.03, x - 0.04, 1.65, 0.1, 0x1a2228, { sz: 0.1, seg: 8 }); K.sph("matte", 0.03, x + 0.04, 1.65, 0.1, 0x1a2228, { sz: 0.1, seg: 8 }); }
    if (i === 2) for (let f = 0; f < 5; f++) K.box("glow", 0.018, 0.16 - (f === 0 ? 0.05 : 0), 0.002, x - 0.08 + f * 0.04, 1.7 - (f === 0 ? 0.06 : 0), 0.096, 0xc8d4dc, { em: 0.9, rz: (f - 2) * 0.12 });
  }
}
export function leadAprons(K) {
  K.box("metal", 0.9, 0.05, 0.08, 0, 1.75, 0.04, 0x8a8e94);
  for (let i = 0; i < 3; i++) K.box("fabric", 0.4, 0.9, 0.05, -0.3 + i * 0.3, 1.28, 0.1 + i * 0.03, [0x2a5aa8, 0xc82a5a, 0x2a8a5a][i], { r: 0.03 });
}

// ============================== police armory / evidence ==============================
export function gunRack(K, w = 2.0) {
  K.box("wood", w, 1.8, 0.1, 0, 1.1, 0, 0x6a7064);
  for (let i = 0; i < 40; i++) K.cyl("matte", 0.008, 0.008, 0.005, -w / 2 + 0.05 + (i % 20) * (w - 0.1) / 19, 1.75 + Math.floor(i / 20) * 0.1 - 1.7, 0.052, 0x3a3e36, { rx: Math.PI / 2, seg: 4 });
  K.box("metal", w, 0.08, 0.2, 0, 0.35, 0.08, 0x3a3e42);
  const n = Math.floor(w / 0.22);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.15 + i * (w - 0.3) / (n - 1), kind = i % 3;
    K.push(x, 0.1, 0, 0.42);
    K.box("matte", 0.05, 0.25, 0.05, 0, 0.13, 0, 0x1a1a1c);                                 // stock
    K.box("metal", 0.04, 0.32, 0.06, 0, 0.42, 0.01, 0x2a2a2e);                               // receiver
    K.box("metal", 0.025, 0.08, 0.1, 0, 0.36, 0.05, 0x1a1a1c);                               // grip
    if (kind !== 2) K.box("metal", 0.04, 0.12, 0.05, 0, 0.5, 0.05, 0x1a1a1c);                // magazine
    K.cyl("metal", 0.012, 0.012, kind === 1 ? 0.55 : 0.4, 0, kind === 1 ? 0.85 : 0.78, 0.0, 0x1a1a1c, { seg: 6 });   // barrel
    if (kind === 0) K.box("metal", 0.03, 0.1, 0.07, 0, 0.62, -0.01, 0x3a3a3e);              // optic
    K.pop();
  }
  K.box("metal", w, 0.04, 0.1, 0, 1.55, 0.08, 0x3a3e42);
  K.block(-w / 2, -0.06, w / 2, 0.22);
}
export function ammoCrates(K, x, z) {
  for (let i = 0; i < 3; i++) {
    const y = i * 0.26;
    K.push(x + (i % 2) * 0.04, z, (i % 2) * 0.1, y);
    K.box("metal", 0.6, 0.25, 0.32, 0, 0.125, 0, 0x4a5a3a, { r: 0.01 });
    K.box("chrome", 0.1, 0.03, 0.04, 0, 0.255, 0, 0x2a2e2a);
    K.box("matte", 0.3, 0.06, 0.004, 0, 0.13, 0.162, 0xe8d020);
    K.pop();
  }
  K.block(x - 0.32, z - 0.18, x + 0.36, z + 0.18);
}
export function vestRack(K) {
  K.box("metal", 1.2, 0.04, 0.04, 0, 1.75, 0, 0x5a5e62);
  for (const s of [-1, 1]) K.box("metal", 0.04, 1.75, 0.04, s * 0.6, 0.875, 0, 0x5a5e62);
  for (let i = 0; i < 4; i++) {
    const x = -0.42 + i * 0.28;
    K.box("fabric", 0.08, 0.6, 0.42, x, 1.3, 0, 0x1a1e24, { r: 0.04 });
    K.box("matte", 0.01, 0.1, 0.3, x + 0.045, 1.38, 0, 0xe8e8e8);                            // POLICE patch
  }
  K.block(-0.62, -0.25, 0.62, 0.25);
}
export function riotShields(K) {
  for (let i = 0; i < 4; i++) { K.box("glass", 0.55, 1.1, 0.02, -0.4 + i * 0.27, 0.6, 0.05 + i * 0.03, 0x9ab0c8, { rx: -0.12 }); K.box("matte", 0.4, 0.08, 0.005, -0.4 + i * 0.27, 0.95, 0.07 + i * 0.03, 0xf0f0f0, { rx: -0.12 }); }
}
export function evidenceShelf(K, w = 2.0) {
  for (const s of [-1, 1]) for (const z of [-1, 1]) K.box("metal", 0.04, 2.1, 0.04, s * (w / 2 - 0.02), 1.05, z * 0.25, 0x8a8e94);
  for (let r = 0; r < 5; r++) {
    const y = 0.1 + r * 0.45;
    K.box("metal", w, 0.025, 0.52, 0, y, 0, 0x8a8e94);
    for (let x = -w / 2 + 0.22; x < w / 2 - 0.15; x += 0.42) {
      K.box("matte", 0.38, 0.28, 0.42, x, y + 0.155, 0, 0xc8a878);
      K.box("matte", 0.18, 0.08, 0.004, x, y + 0.2, 0.212, 0xf8f8f0);
      K.box("matte", 0.1, 0.012, 0.005, x, y + 0.21, 0.215, 0x2a2a2a);
      K.box("matte", 0.38, 0.02, 0.43, x, y + 0.29, 0, 0xd82a2a);                          // red evidence tape
    }
  }
  K.block(-w / 2, -0.27, w / 2, 0.27);
}
export function wireCage(K, w, H) {
  for (let i = 0; i <= Math.round(w / 0.12); i++) K.box("metal", 0.012, H - 0.1, 0.012, -w / 2 + i * 0.12, (H - 0.1) / 2, 0, 0x6a6e72);
  for (let y = 0.1; y < H - 0.1; y += 0.12) K.box("metal", w, 0.012, 0.012, 0, y, 0, 0x6a6e72);
  K.box("metal", w, 0.05, 0.05, 0, H - 0.08, 0, 0x4a4e52);
}

// ============================== offices ==============================
export function conferenceTable(K, L = 3.6) {
  K.box("wood", L, 0.06, 1.2, 0, 0.75, 0, 0x3a2618, { r: 0.04 });
  K.box("gloss", L - 0.3, 0.005, 0.5, 0, 0.785, 0, 0x2a1a10);
  for (const x of [-L / 3, L / 3]) { K.box("metal", 0.12, 0.7, 0.7, x, 0.37, 0, 0x2a2a2e, { r: 0.02 }); K.box("metal", 0.5, 0.04, 0.9, x, 0.02, 0, 0x2a2a2e); }
  // speakerphone, water carafe and glasses, notepads
  K.cyl("gloss", 0.14, 0.16, 0.04, 0, 0.8, 0, C.black, { seg: 3 });
  K.lathe("glass", [[0.001, 0], [0.07, 0], [0.08, 0.15], [0.04, 0.25], [0.045, 0.28]], -0.6, 0.78, 0.1, 0xdde8ee);
  for (let i = 0; i < 4; i++) K.lathe("glass", [[0.001, 0], [0.035, 0], [0.04, 0.1]], -0.4 + i * 0.12, 0.78, -0.15, 0xdde8ee);
  for (let i = 0; i < 6; i++) K.box("matte", 0.21, 0.006, 0.29, -L / 2 + 0.45 + (i % 3) * (L - 0.9) / 2, 0.784, (i < 3 ? 1 : -1) * 0.38, 0xf8f6ee, { ry: (rnd() - 0.5) * 0.3 });
  K.block(-L / 2, -0.6, L / 2, 0.6);
}
export function serverRack(K) {
  K.box("metal", 0.6, 2.0, 1.0, 0, 1.0, 0, 0x1a1a1e, { r: 0.01 });
  K.box("glass", 0.56, 1.9, 0.01, 0, 1.0, 0.505, 0x1a2228);
  for (let u = 0; u < 14; u++) {
    const y = 0.15 + u * 0.13;
    K.box("metal", 0.54, 0.11, 0.02, 0, y, 0.49, u % 4 === 3 ? 0x3a3a3e : 0x2a2a2e);
    for (let l = 0; l < 4; l++) K.box("glow", 0.012, 0.012, 0.004, -0.22 + l * 0.03, y + 0.02, 0.5, pick([0x40ff60, 0x40ff60, 0x40ff60, 0xffb020, 0x40a0ff]), { em: 3 });
    for (let d = 0; d < 6; d++) K.box("matte", 0.05, 0.08, 0.004, -0.05 + d * 0.055, y, 0.5, 0x4a4a4e);
  }
  K.block(-0.3, -0.5, 0.3, 0.52);
}
export function acUnit(K) {
  K.box("gloss", 0.9, 1.8, 0.6, 0, 0.9, 0, 0xe8e8e4, { r: 0.02 });
  for (let i = 0; i < 16; i++) K.box("matte", 0.7, 0.012, 0.005, 0, 1.2 + i * 0.03, 0.302, 0x9a9a96);
  K.box("glow", 0.15, 0.06, 0.005, 0, 0.9, 0.302, 0x40c0ff, { em: 1.6 });
  K.block(-0.45, -0.3, 0.45, 0.32);
}
export function cableTray(K, x0, x1, z, H) { K.box("metal", x1 - x0, 0.06, 0.3, (x0 + x1) / 2, H - 0.25, z, 0x8a8e94); for (let i = 0; i < 6; i++) K.cyl("matte", 0.015, 0.015, x1 - x0, (x0 + x1) / 2, H - 0.2, z - 0.1 + i * 0.04, [0x2a5aa8, 0xe8c020, 0xd82a2a, 0x2a2a2e, 0x2a9a4a, 0x2a5aa8][i], { rz: Math.PI / 2, seg: 5 }); }

// ============================== loading bay ==============================
export function boxTruck(K) {
  // a white box truck backed in: cab with windows and lights, chassis, wheels, the cargo box with its roller door up
  const B = 0xf2f2ee, cab = 0x2a5aa8;
  for (const [z, x] of [[2.3, 1], [2.3, -1], [-1.0, 1], [-1.0, -1], [-1.95, 1], [-1.95, -1]]) {
    K.cyl("matte", 0.48, 0.48, 0.32, x * 1.0, 0.48, z, 0x111112, { rz: Math.PI / 2, seg: 20 });
    K.cyl("metal", 0.28, 0.28, 0.33, x * 1.0, 0.48, z, 0xb8bcc0, { rz: Math.PI / 2, seg: 14 });
  }
  K.box("metal", 1.7, 0.25, 6.6, 0, 0.75, 0.2, 0x2a2a2e);
  // cab
  K.box("gloss", 2.3, 1.5, 1.8, 0, 1.75, 2.75, cab, { r: 0.1 });
  K.box("gloss", 2.3, 0.6, 0.5, 0, 1.0, 3.55, cab, { r: 0.06 });
  K.box("glass", 2.0, 0.75, 0.02, 0, 2.1, 3.62, 0x1b2430, { rx: -0.2 });
  for (const s of [-1, 1]) { K.box("glass", 0.02, 0.6, 1.0, s * 1.15, 2.1, 2.9, 0x1b2430); K.box("chrome", 0.06, 0.3, 0.12, s * 1.25, 2.0, 3.4, C.black); K.box("glow", 0.3, 0.16, 0.03, s * 0.8, 1.05, 3.81, 0xfff4e0, { em: 1.5 }); }
  K.box("chrome", 1.2, 0.25, 0.04, 0, 1.05, 3.81, 0x3a3a3e);
  K.box("gloss", 2.4, 0.2, 0.3, 0, 0.6, 3.75, 0x2a2a2e);
  // cargo box
  K.box("gloss", 2.5, 2.6, 4.9, 0, 2.2, -0.5, B, { r: 0.04 });
  K.box("matte", 2.52, 0.6, 3.0, 0, 2.6, -0.5, 0xd82a2a);                                  // livery stripe
  K.box("matte", 2.3, 2.2, 0.05, 0, 2.15, -2.96, 0x1a1a1c);                                // open back
  K.box("metal", 2.3, 0.4, 0.06, 0, 3.3, -2.95, 0xd8d8d4);                                 // rolled-up door
  for (const s of [-1, 1]) K.box("glow", 0.12, 0.2, 0.04, s * 1.1, 1.0, -2.98, 0xff2020, { em: 2 });
  // cargo inside: wrapped pallets
  for (let i = 0; i < 2; i++) { K.box("matte", 1.0, 1.2, 1.0, (i - 0.5) * 1.05, 1.5, -2.2, 0xc8b088); K.box("glass", 1.04, 1.24, 1.04, (i - 0.5) * 1.05, 1.5, -2.2, 0xe8f0f4); }
  K.block(-1.3, -3.0, 1.3, 3.9);
}
export function dockLeveler(K, w = 2.6) {
  K.box("metal", w, 0.06, 1.8, 0, 0.06, 0, 0x5a5e62);
  for (let i = 0; i < 12; i++) K.box("metal", w, 0.012, 0.02, 0, 0.095, -0.85 + i * 0.15, 0x7a7e82);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) K.box("matte", 0.12, 0.12, 0.3, s * (w / 2 + 0.1), 0.06, -0.75 + i * 0.3, i % 2 ? 0x1a1a1a : 0xe8c020);
  for (const sd of [-1, 1]) K.box("matte", 0.3, 0.5, 0.16, sd * (w / 2 + 0.25), 0.55, -0.82, 0x1a1a1e, { r: 0.03 });   // rubber bumpers on the wall
}
export function wrappedPallet(K, x, z, ry = 0) {
  K.push(x, z, ry, 0);
  for (let i = 0; i < 3; i++) K.box("wood", 0.1, 0.1, 1.2, -0.45 + i * 0.45, 0.06, 0, 0xb89868);
  for (let i = 0; i < 7; i++) K.box("wood", 1.0, 0.02, 0.12, 0, 0.125, -0.54 + i * 0.18, 0xc8a878);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) K.box("matte", 0.48, 0.32, 0.56, -0.25 + (c % 2) * 0.5, 0.3 + r * 0.33, -0.29 + Math.floor(c / 2) * 0.58, pick([0xb89868, 0xc8a878, 0xa88858]));
  K.box("glass", 1.04, 1.02, 1.22, 0, 0.66, 0, 0xe8f0f4);
  K.pop();
  K.block(x - 0.55, z - 0.62, x + 0.55, z + 0.62);
}
export function palletJack(K) {
  for (const s of [-1, 1]) K.box("metal", 0.16, 0.07, 1.15, s * 0.27, 0.06, 0.2, 0xc82a2a);
  K.box("metal", 0.7, 0.3, 0.25, 0, 0.2, -0.45, 0xc82a2a, { r: 0.03 });
  K.cyl("matte", 0.1, 0.1, 0.12, 0, 0.1, -0.5, C.black, { rz: Math.PI / 2, seg: 12 });
  K.box("metal", 0.05, 1.1, 0.05, 0, 0.75, -0.6, 0xc82a2a, { rx: -0.3 });
  K.box("metal", 0.3, 0.05, 0.08, 0, 1.25, -0.77, C.black);
  K.block(-0.36, -0.7, 0.36, 0.8);
}
