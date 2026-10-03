// Palm City — cars. Bodies are real silhouettes: a side profile drawn with curves, extruded to
// the car's width with a generous bevel so every edge is rounded, then a separate glasshouse on
// top. Paint is a clear-coated physical material, so the sky reflects across the bonnet.
// Each type is split into four geometries (paint / glass / trim+wheels / lights) so the traffic
// can draw every car of a type with four instanced draw calls.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge } from "./geo.js";
import { reflective } from "./reflect.js";

// Each type: overall size and handling, then its shape as height curves along the length
// (z, + = front): `roof` the roofline over bonnet, glass and boot; `belt` the shoulder line where
// the side glass starts; `zones` where the windscreen, roof and rear glass are.
const TYPES = {
  compact: {
    len: 3.9, wid: 1.78, wheelR: 0.33, wb: 2.45, ride: 0.16, mass: 1,
    roof: [[-1.95, 0.9], [-1.9, 1.05], [-1.8, 1.36], [-1.6, 1.5], [0.05, 1.53], [0.78, 1.0], [1.55, 0.86], [1.95, 0.72]],
    belt: [[-1.95, 0.88], [-1.75, 0.98], [0.78, 0.95], [1.55, 0.84], [1.95, 0.7]],
    zones: { rear: [-1.85, -1.6], ws: [0.05, 0.78], b: -0.55 },
    accel: 15, top: 44, grip: 7.5, turn: 2.5,
  },
  sedan: {
    len: 4.6, wid: 1.85, wheelR: 0.34, wb: 2.8, ride: 0.17, mass: 1.15,
    roof: [[-2.3, 0.86], [-2.24, 1.0], [-1.95, 1.04], [-1.45, 1.06], [-0.95, 1.43], [0.45, 1.46], [1.22, 0.98], [1.95, 0.86], [2.3, 0.68]],
    belt: [[-2.3, 0.84], [-2.1, 0.99], [-1.45, 1.0], [1.22, 0.96], [1.95, 0.84], [2.3, 0.66]],
    zones: { rear: [-1.45, -0.95], ws: [0.45, 1.22], b: -0.2 },
    accel: 16, top: 50, grip: 7.8, turn: 2.35,
  },
  sports: {
    len: 4.4, wid: 1.95, wheelR: 0.35, wb: 2.6, ride: 0.11, mass: 1.05,
    roof: [[-2.2, 0.8], [-2.12, 0.92], [-1.75, 0.94], [-1.3, 0.97], [-0.55, 1.2], [0.2, 1.22], [1.0, 0.82], [1.8, 0.68], [2.2, 0.52]],
    belt: [[-2.2, 0.78], [-1.9, 0.9], [-1.3, 0.9], [1.0, 0.8], [1.8, 0.66], [2.2, 0.5]],
    zones: { rear: [-1.3, -0.55], ws: [0.2, 1.0], b: 99 },
    accel: 24, top: 66, grip: 9.0, turn: 2.6,
  },
  suv: {
    len: 4.8, wid: 2.0, wheelR: 0.42, wb: 2.9, ride: 0.3, mass: 1.4,
    roof: [[-2.4, 1.12], [-2.37, 1.3], [-2.26, 1.78], [-2.05, 1.9], [0.6, 1.93], [1.45, 1.26], [2.1, 1.14], [2.4, 0.96]],
    belt: [[-2.4, 1.1], [-2.25, 1.26], [1.45, 1.24], [2.1, 1.12], [2.4, 0.94]],
    zones: { rear: [-2.26, -2.05], ws: [0.6, 1.45], b: -0.35 },
    accel: 14, top: 46, grip: 7.0, turn: 2.2,
  },
  // a muscle car: long bonnet, short deck, fastback glass
  coupe: {
    len: 4.75, wid: 1.92, wheelR: 0.36, wb: 2.8, ride: 0.13, mass: 1.2,
    roof: [[-2.37, 0.84], [-2.28, 0.99], [-1.75, 1.01], [-1.2, 1.04], [-0.45, 1.3], [0.3, 1.32], [1.05, 0.94], [1.95, 0.9], [2.37, 0.72]],
    belt: [[-2.37, 0.82], [-2.1, 0.97], [-1.2, 0.99], [1.05, 0.92], [1.95, 0.88], [2.37, 0.7]],
    zones: { rear: [-1.2, -0.45], ws: [0.3, 1.05], b: 99 },
    accel: 22, top: 60, grip: 8.2, turn: 2.35,
  },
  // a crew-cab pickup: the cab, then a covered bed behind it
  pickup: {
    len: 5.3, wid: 2.0, wheelR: 0.42, wb: 3.3, ride: 0.32, mass: 1.6, bed: [-2.65, -0.78],
    roof: [[-2.65, 1.28], [-0.82, 1.3], [-0.74, 1.86], [-0.55, 1.95], [0.45, 1.97], [1.15, 1.32], [2.2, 1.22], [2.65, 1.0]],
    belt: [[-2.65, 1.26], [-0.82, 1.28], [1.15, 1.27], [2.2, 1.2], [2.65, 0.98]],
    zones: { rear: [-0.74, -0.6], ws: [0.45, 1.15], b: 0.22 },
    accel: 15, top: 46, grip: 7.2, turn: 2.1,
  },
  // a people-carrier van: tall, glass all down the side
  van: {
    len: 5.2, wid: 2.0, wheelR: 0.38, wb: 3.3, ride: 0.2, mass: 1.6,
    roof: [[-2.6, 1.9], [-2.56, 2.2], [-2.45, 2.28], [1.15, 2.3], [1.9, 1.38], [2.4, 1.15], [2.6, 0.95]],
    belt: [[-2.6, 1.28], [-2.45, 1.32], [1.9, 1.3], [2.4, 1.12], [2.6, 0.93]],
    zones: { rear: [-2.56, -2.45], ws: [1.15, 1.9], b: 0.55 },
    accel: 12, top: 40, grip: 6.6, turn: 2.0,
  },
  // a city bus: long, flat-roofed, a raked glass front and a row of window pillars
  bus: {
    len: 11, wid: 2.5, wheelR: 0.5, wb: 6.3, ride: 0.3, mass: 3.5, pillarPitch: 1.3, big: true, floor: 0.55,
    doors: [{ k: "D", z0: 3.62, z1: 4.66, sides: [-1] }], busDoor: true,
    roof: [[-5.5, 2.6], [-5.32, 3.02], [4.75, 3.05], [5.5, 1.35]],
    belt: [[-5.5, 1.3], [-5.32, 1.35], [4.75, 1.3], [5.5, 1.25]],
    zones: { rear: [-5.32, -5.31], ws: [4.75, 5.48], b: 99 },
    accel: 7, top: 28, grip: 6, turn: 1.3,
  },
  // a box truck: a cab up front, a cargo box on the back
  truck: {
    len: 7.4, wid: 2.4, wheelR: 0.48, wb: 4.4, ride: 0.36, mass: 3, big: true, box: [-3.65, 0.85, 3.45], floor: 1.12,
    doors: [{ k: "F", z0: 1.06, z1: 2.5, rowMin: 3.4 }],
    roof: [[-3.7, 1.22], [0.88, 1.24], [1.0, 2.55], [1.15, 2.72], [2.55, 2.78], [3.35, 1.92], [3.7, 1.38]],
    belt: [[-3.7, 1.2], [0.88, 1.22], [3.35, 1.58], [3.7, 1.36]],
    zones: { rear: [1.0, 1.15], ws: [2.55, 3.35], b: 99 },
    accel: 8, top: 32, grip: 6.4, turn: 1.5,
  },
  // a fire engine: crew cab, red equipment lockers, a ladder on top, light bars
  firetruck: {
    len: 9.2, wid: 2.5, wheelR: 0.5, wb: 5.4, ride: 0.38, mass: 4, big: true, floor: 1.15, paint: 0xb8141a, emergency: true,
    box: [-4.55, 1.55, 3.0], boxCol: 0xb8141a, lockers: true, ladder: true, lightbar: true,
    roof: [[-4.6, 1.26], [1.5, 1.28], [1.62, 2.72], [1.8, 2.88], [3.7, 2.9], [4.3, 2.0], [4.6, 1.42]],
    belt: [[-4.6, 1.24], [1.5, 1.26], [4.3, 1.62], [4.6, 1.4]],
    zones: { rear: [1.62, 1.8], ws: [3.7, 4.3], b: 2.62 },
    doors: [{ k: "F", z0: 2.66, z1: 3.62, rowMin: 3.4 }, { k: "R", z0: 1.66, z1: 2.58, rowMin: 3.4 }],
    accel: 9, top: 38, grip: 6.6, turn: 1.4,
  },
  // a motorbike: built from parts, not lofted (see bikeGeometries); traffic bikes carry a rider
  motorbike: {
    len: 2.15, wid: 0.8, wheelR: 0.32, wb: 1.42, ride: 0.2, mass: 0.4, bike: true,
    roof: [[-1, 1], [1, 1]], belt: [[-1, 0.9], [1, 0.9]], zones: { rear: [-1, -0.9], ws: [0.5, 0.6], b: 99 },
    accel: 20, top: 52, grip: 8, turn: 3,
  },
};
// a taxi is a sedan with a roof sign and yellow paint
TYPES.taxi = { ...TYPES.sedan, sign: true, paint: 0xf2c200 };
// an ambulance is a van in white with red bands and a light bar
TYPES.ambulance = { ...TYPES.van, paint: 0xf4f4f2, stripe: 0xc8202a, lightbar: true, emergency: true };
// the roof's height (police light bars sit on it); `cabin` keeps the old shape for older callers
for (const T of Object.values(TYPES)) {
  T.roofY = Math.max(...T.roof.map(p => p[1]));
  const r = y => y - T.ride + 0.18, bl = T.belt.reduce((a, p) => Math.max(a, p[1]), 0);
  T.cabin = [[T.zones.rear[0], r(bl)], [T.zones.rear[1], r(T.roofY)], [T.zones.ws[0], r(T.roofY)], [T.zones.ws[1], r(bl)]];   // rear glass base, roof ends, windscreen base
}
export const CAR_TYPES = Object.keys(TYPES);
export const carSpec = t => TYPES[t];

// smooth curve through key points (monotone cubic: no overshoot), sampled at z
function curve(pts) {
  const n = pts.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  // Fritsch-Carlson: keep each piece's tangents in check so the curve never bulges past its points
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return z => {
    if (z <= pts[0][0]) return pts[0][1];
    if (z >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (z > pts[i + 1][0]) i++;
    const h = pts[i + 1][0] - pts[i][0], t = (z - pts[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a painted geometry from raw triangles: positions, normals, per-vertex shade
function triGeo(pos, nor, col) {
  const g = new THREE.BufferGeometry(), n = pos.length / 3;
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  // texture coordinates wrapped round the body (for the paint's metal flake): along the length, up the side
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = pos[i * 3 + 2] * 2.5; uv[i * 2 + 1] = (pos[i * 3 + 1] + Math.abs(pos[i * 3]) * 0.6) * 2.5; }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// The body: one smooth lofted skin. Every cross-section runs from the belly, round the sill, up
// the flank to the shoulder, in over the glass (tumblehome) and across the roof. Sections are
// rounded off at both ends into bumpers, the flanks bulge over the wheels and the arches are cut.
// Triangles are then sorted into paint and glass (side windows, windscreen, rear window), leaving
// painted pillars between; door shut-lines and the plastic sills are shaded into the paint.
function lofted(T, lod = 0) {
  const L = T.len, HW = T.wid / 2, top = curve(T.roof), belt = curve(T.belt), Z = T.zones;
  const wheelY = T.wheelR, fz = T.wb / 2, Ra = T.wheelR + 0.075;
  const bot = z => T.ride + 0.06 + smooth(L / 2 - 0.75, L / 2, Math.abs(z)) * 0.16;
  // plan view: full width through the middle, rounding in at the corners
  const plan = z => { const e = smooth(L / 2 - 0.55, L / 2, Math.abs(z)); return HW * (1 - 0.13 * e * e); };
  const fender = z => 1 + 0.022 * (Math.exp(-(((z - fz) / 0.5) ** 2)) + Math.exp(-(((z + fz) / 0.5) ** 2)));
  // rings along the length: denser at the rounded ends and at the door shut-lines
  const seams = T.doors ? [...new Set(T.doors.flatMap(d => [d.z1, d.z0]))].sort((a, b) => b - a)
    : Z.b < 50 ? [fz - Ra - 0.06, Z.b, -fz + Ra + 0.05] : [fz - Ra - 0.06, -fz + Ra + 0.12];
  const zs = [];
  const NR = lod ? 20 : 64;
  for (let i = 0; i <= NR; i++) { const t = i / NR; zs.push(-L / 2 + L * (0.5 - 0.5 * Math.cos(Math.PI * t))); }
  if (!lod) for (const zz of seams) zs.push(zz - 0.03, zz - 0.008, zz + 0.008, zz + 0.03);
  const side0 = Z.rear[0] + (Z.rear[1] - Z.rear[0]) * (T.len > 4.7 ? 0.15 : 0.5), side1 = Z.ws[1] - 0.12;
  for (const zz of [Z.ws[0], Z.ws[1], Z.rear[0], Z.rear[1], side0, side1, Z.b - 0.06, Z.b + 0.06]) if (Math.abs(zz) < L / 2) zs.push(zz);
  if (T.pillarPitch && !lod) for (let zz = side0; zz < side1; zz += T.pillarPitch) zs.push(zz + 0.0005, zz + 0.0895);   // window pillar edges
  zs.sort((a, b) => a - b);
  const isSeam = z => !lod && seams.some(zz => Math.abs(z - zz) < 0.0085);
  // control points of a half section (x >= 0), row index 0..9
  const half = z => {
    const tp = Math.max(top(z), belt(z) + 0.004), bl = belt(z), bt = bot(z), hw = plan(z) * fender(z);
    const c = smooth(0.06, 0.3, tp - bl);                                         // how much greenhouse here
    const wTop = hw * (0.9 - 0.18 * c), crown = 0.03 + 0.02 * (1 - c);
    return [[0, bt - 0.02], [hw * 0.82, bt], [hw * 0.975, bt + 0.07], [hw, bt + 0.38 * (bl - bt)], [hw * 1.012, bt + 0.78 * (bl - bt)],
      [hw * 0.965, bl], [hw * (0.95 - 0.1 * c), bl + 0.42 * (tp - bl)], [hw * (0.93 - 0.17 * c), bl + 0.86 * (tp - bl)], [wTop, tp], [0, tp + crown]];
  };
  // subdivide the section with a Catmull-Rom pass; remember each point's row
  const SUB = lod ? 1 : 3;
  const section = z => {
    const c = half(z), out = [];
    for (let i = 0; i < c.length - 1; i++) {
      const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB, t2 = t * t, t3 = t2 * t;
        const f = (a, b, cc, d) => 0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), i + t]);
      }
    }
    out.push([c[c.length - 1][0], c[c.length - 1][1], c.length - 1]);
    return out;
  };
  const H = section(0).length;                   // points per half
  const M = 2 * H - 2;                          // points per full ring (both halves, centre points shared)
  const P = [], ROW = [], ZV = [], ARC = [];
  for (const z of zs) {
    const h = section(z);
    // round the ends: the last 0.24 m pull in toward the section's middle
    const e = smooth(L / 2 - 0.24, L / 2, Math.abs(z)), k = Math.sqrt(Math.max(0, 1 - e * e));
    const midY = (h[0][1] + h[H - 1][1]) / 2;
    const ring = [];
    for (let j = 0; j < H; j++) ring.push([h[j][0], h[j][1], h[j][2]]);
    for (let j = H - 2; j >= 1; j--) ring.push([-h[j][0], h[j][1], h[j][2]]);
    for (const [x, y, row] of ring) {
      let xx = x * (0.62 + 0.38 * k), yy = midY + (y - midY) * (0.8 + 0.2 * k);
      // the wheel arches: lift the lower flank clear of each wheel
      let arc = 0;
      if (row <= 4.5) for (const wz of [fz, -fz]) {
        const dz = z - wz;
        if (Math.abs(dz) < Ra) { const archTop = wheelY + Math.sqrt(Ra * Ra - dz * dz); if (yy < archTop + 0.01) { yy = Math.max(yy, archTop); arc = 1; } }
      }
      P.push(xx, yy, z); ROW.push(row); ZV.push(z); ARC.push(arc);
    }
  }
  const NZ = zs.length;
  // smooth normals over the indexed skin
  const idx = [];
  for (let i = 0; i < NZ - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
    idx.push(a, b, c, b, d, c);
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); skin.setIndex(idx); skin.computeVertexNormals();
  const N = skin.attributes.normal.array;
  // which material each triangle gets
  const glassAt = (z, row) => {
    if (row >= 8) return (z > Z.ws[0] && z < Z.ws[1]) || (z > Z.rear[0] && z < Z.rear[1]);   // windscreen, rear window
    if (row >= 5.25 && row <= 7.75) {
      if (z < side0 || z > side1) return false;                                 // side glass: rear pillar to A-pillar
      if (Math.abs(z - Z.b) < 0.06) return false;                               // B-pillar
      if (T.pillarPitch && ((z - side0) % T.pillarPitch) < 0.09) return false;    // a bus's row of window pillars
      const tp = top(z), bl = belt(z); return tp - bl > 0.16;
    }
    return false;
  };
  const shade = (z, row) => {
    if (row <= 1.2) return 0.16;                                                 // plastic sills / belly
    // road grime: a little darker low down and round the wheel arches
    let g2 = 1;
    if (row < 2.8) g2 = 0.9 + 0.1 * (row - 1.2) / 1.6;
    if (row <= 4.6) for (const wz of [fz, -fz]) { const d = Math.abs(z - wz) - Ra; if (d < 0.15) g2 = Math.min(g2, 0.86 + Math.max(0, d) * 0.9); }
    if (row <= 4.6 && isSeam(z)) return 0.22;                                    // door shut-lines
    if (T.bed && z > T.bed[0] && z < T.bed[1] && row >= 7.9) return 0.16;         // pickup bed cover
    return g2;
  };
  const out = { paint: [[], [], []], glass: [[], [], []] };
  // the doors: panels between the shut-lines, from the sill up to the window frame, each side.
  // Front doors hinge at their front edge; two-door cars have one long door a side.
  const zF = seams[0], zR = seams[seams.length - 1], twoDoor = Z.b >= 50;
  // (trucks and the bus list their doors: a cab door above the wheel, the bus's folding door on the kerb side)
  const doorDefs = lod || T.noDoors ? [] : T.doors ? T.doors : [
    { k: "F", z0: twoDoor ? zR : Z.b, z1: zF },
    ...(twoDoor ? [] : [{ k: "R", z0: zR, z1: Z.b }]),
  ];
  const doors = {};
  for (const d of doorDefs) for (const sd of d.sides || [1, -1]) doors[d.k + (sd > 0 ? "L" : "R")] = { paint: [[], [], []], glass: [[], [], []], z0: d.z0, z1: d.z1, side: sd };
  const doorOf = (zc, rc, xc) => {
    if (rc > 7.95) return null;
    for (const d of doorDefs) {
      if (rc < (d.rowMin || 1.34) || zc < d.z0 + 0.0085 || zc > d.z1 - 0.0085) continue;
      if (!T.doors && rc >= 5.25 && Math.abs(zc - Z.b) < 0.06 && !twoDoor) return null;     // the B-pillar stays with the body
      const k = d.k + (xc > 0 ? "L" : "R");
      if (doors[k]) return doors[k];
    }
    return null;
  };
  const push = (tgt, vs) => { for (const v of vs) { tgt[0].push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); tgt[1].push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); const s = ARC[v] ? 0.1 : shade(ZV[v], ROW[v]); tgt[2].push(s, s, s); } };   // the arch's inner lip: dark, like the well behind it
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    const zc = (ZV[vs[0]] + ZV[vs[1]] + ZV[vs[2]]) / 3, rc = (ROW[vs[0]] + ROW[vs[1]] + ROW[vs[2]]) / 3, xc = (P[vs[0] * 3] + P[vs[1] * 3] + P[vs[2] * 3]) / 3;
    const g = glassAt(zc, rc), d = doorOf(zc, rc, xc);
    push(d ? (g ? d.glass : d.paint) : (g ? out.glass : out.paint), vs);
  }
  // end caps: a fan over the rounded nose and tail
  for (const [i, dir] of [[0, -1], [NZ - 1, 1]]) {
    let cx = 0, cy = 0; for (let j = 0; j < M; j++) { cy += P[(i * M + j) * 3 + 1]; } cy /= M;
    const zc = zs[i];
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M;
      const t = out.paint;
      for (const tri of [[a, b], [b, a]]) {          // both windings: the cap shows whichever way it's built
        for (const v of tri) { t[0].push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); t[1].push(0, 0, dir); const s = ROW[v] <= 1.2 ? 0.16 : 1; t[2].push(s, s, s); }
        t[0].push(cx, cy, zc); t[1].push(0, 0, dir); t[2].push(1, 1, 1);
      }
    }
  }
  // the glass sits a touch inboard of the paint, so the pillars and roof frame it
  const g = out.glass[0]; for (let i = 0; i < g.length; i += 3) { g[i] *= 0.992; g[i + 1] -= 0.004; }
  for (const d of Object.values(doors)) { const g2 = d.glass[0]; for (let i = 0; i < g2.length; i += 3) { g2[i] *= 0.992; g2[i + 1] -= 0.004; } }
  const geo = a => triGeo(a[0], a[1], a[2]);
  const doorGeos = {};
  for (const [k, d] of Object.entries(doors)) doorGeos[k] = { paint: geo(d.paint), glass: geo(d.glass), z0: d.z0, z1: d.z1, side: d.side };
  return { paint: geo(out.paint), glass: geo(out.glass), doors: doorGeos, top, belt, plan, bot };
}

// a wheel: tyre with rounded shoulders and sidewall, a five-spoke rim with a lip, a brake disc
// a wheel. The tyre (rounded shoulders, a sidewall with room for lettering) goes to `tyres` (it has
// its own textured material); the rim, disc and nuts go to the returned parts. Rim styles:
// five (broad spokes), multi (ten thin), split (seven doubled), six (chunky off-road), steel
// (a dished truck wheel with holes and a big hub), cap (a full hubcap with slots)
function wheelParts(R, w, sx, x, y, z, rimCol, rimMetal = 0.65, style = "five", tyres = null) {
  const parts = [];
  const r0 = R * 0.66, hw = w / 2 - 0.02, side = R - 0.035;
  const prof = [];
  for (let j = 0; j < 5; j++) prof.push(new THREE.Vector2(r0 + (side - r0) * j / 5, -hw));                  // inner... sidewall (lettered)
  for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI; prof.push(new THREE.Vector2(side + Math.cos(a) * 0.035, Math.sin(a) * hw)); }   // tread
  for (let j = 1; j <= 5; j++) prof.push(new THREE.Vector2(side + (r0 - side) * j / 5, hw));
  const tyre = new THREE.LatheGeometry(prof, 22); tyre.rotateZ(Math.PI / 2);
  if (sx < 0) tyre.rotateY(Math.PI);                       // the lettered sidewall always faces out
  (tyres || parts).push(place(paint(tyre, tyres ? 0xffffff : 0x18181a), x, y, z));
  const face = sx * (w / 2 - 0.035);
  const disc = new THREE.CylinderGeometry(R * 0.52, R * 0.52, 0.025, 20); disc.rotateZ(Math.PI / 2);
  parts.push(place(paint(disc, 0x5a5b5e, 0.55), x - sx * 0.035, y, z));
  const caliper = new THREE.BoxGeometry(0.05, 0.12, 0.09); parts.push(place(paint(caliper, style === "split" ? 0xc81e1e : 0x2a2b2e, 0.3), x - sx * 0.02, y + R * 0.38, z - 0.06));
  const lip = new THREE.TorusGeometry(r0 - 0.012, 0.016, 6, 28); lip.rotateY(Math.PI / 2);
  parts.push(place(paint(lip, rimCol, rimMetal + 0.15), x + face, y, z));
  const barrel = new THREE.CylinderGeometry(r0 - 0.01, r0 - 0.01, w - 0.06, 22, 1, true); barrel.rotateZ(Math.PI / 2);
  parts.push(place(paint(barrel, 0x55585c, 0.5), x, y, z));
  const spoke = (ang, wid, len, thick, inset = 0.012) => {
    const sp = new THREE.BoxGeometry(thick, len, wid); sp.translate(0, r0 * 0.18 + len / 2, 0); sp.rotateX(ang);
    parts.push(place(paint(sp, rimCol, rimMetal), x + face - sx * inset, y, z));
  };
  const L = r0 * 0.78;
  if (style === "five") for (let k = 0; k < 5; k++) spoke(k / 5 * Math.PI * 2, 0.06, L, 0.03);
  else if (style === "multi") for (let k = 0; k < 10; k++) spoke(k / 10 * Math.PI * 2, 0.022, L, 0.024);
  else if (style === "split") for (let k = 0; k < 7; k++) for (const d of [-0.09, 0.09]) spoke(k / 7 * Math.PI * 2 + d, 0.022, L, 0.026);
  else if (style === "six") for (let k = 0; k < 6; k++) spoke(k / 6 * Math.PI * 2, 0.085, L, 0.04, 0.02);
  else {
    // steel or hubcap: a dished face
    const dish = new THREE.CylinderGeometry(r0 - 0.02, r0 * 0.6, 0.03, 26); dish.rotateZ(Math.PI / 2);
    parts.push(place(paint(dish, rimCol, style === "cap" ? 0.75 : 0.45), x + face - sx * 0.02, y, z));
    const n = style === "cap" ? 12 : 8, rr = style === "cap" ? r0 * 0.72 : r0 * 0.62;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, hole = style === "cap" ? new THREE.BoxGeometry(0.01, 0.07, 0.02) : new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10);
      if (style !== "cap") hole.rotateZ(Math.PI / 2); else hole.rotateX(a);
      parts.push(place(paint(hole, 0x0e0e10), x + face + sx * 0.001, y + Math.cos(a) * rr, z + Math.sin(a) * rr));
    }
  }
  const hub = new THREE.CylinderGeometry(R * (style === "steel" ? 0.24 : 0.15), R * (style === "steel" ? 0.27 : 0.17), style === "steel" ? 0.09 : 0.05, 12); hub.rotateZ(Math.PI / 2);
  parts.push(place(paint(hub, style === "steel" ? 0xb8bcc2 : rimCol, style === "steel" ? 0.9 : rimMetal), x + face - sx * (style === "steel" ? -0.02 : 0.01), y, z));
  // wheel nuts round the hub
  if (style !== "cap") for (let k = 0; k < (style === "steel" ? 8 : 5); k++) {
    const a = k / (style === "steel" ? 8 : 5) * Math.PI * 2, nr = R * (style === "steel" ? 0.3 : 0.2);
    const nut = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 6); nut.rotateZ(Math.PI / 2);
    parts.push(place(paint(nut, 0xd0d4da, 1), x + face + sx * 0.005, y + Math.cos(a) * nr, z + Math.sin(a) * nr));
  }
  return parts;
}
// which wheel each kind of vehicle wears
const WHEEL_STYLE = { compact: "cap", sedan: "multi", taxi: "cap", sports: "split", coupe: "five", suv: "six", pickup: "six", van: "cap", ambulance: "steel", bus: "steel", truck: "steel", firetruck: "steel" };

// textures: the tyre (tread blocks and raised sidewall lettering) and a sheet of number plates
let TYRE_TEX = null, PLATE_TEX = null;
function tyreTexture() {
  if (TYRE_TEX || typeof document === "undefined") return TYRE_TEX;
  const W = 2048, H = 256, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#1e1e20"; x.fillRect(0, 0, W, H);
  // tread (v 0.25..0.75): blocks between grooves, with angled sipes
  const t0 = H * 0.25, t1 = H * 0.75;
  x.fillStyle = "#26262a"; x.fillRect(0, t0, W, t1 - t0);
  x.fillStyle = "#0b0b0c";
  for (const f of [0.36, 0.47, 0.53, 0.64]) x.fillRect(0, H * f - 4, W, 8);
  for (let u = 0; u < W; u += 22) { x.save(); x.translate(u, 0); x.fillRect(0, t0, 4, H * 0.1); x.fillRect(8, H * 0.39, 3, H * 0.07); x.fillRect(4, H * 0.56, 3, H * 0.07); x.fillRect(0, t1 - H * 0.1, 4, H * 0.1); x.restore(); }
  // sidewall (canvas bottom = v 0..0.2): rim ridge, a pinstripe, the maker and size in raised rubber
  const sw0 = H * 0.8;
  x.fillStyle = "#2a2a2e"; x.fillRect(0, H - 10, W, 6); x.fillRect(0, sw0 + 4, W, 3);
  x.fillStyle = "#58585c"; x.font = "bold 30px Arial, sans-serif"; x.textBaseline = "middle";
  for (let k = 0; k < 2; k++) {
    x.fillText("PALMSTONE  ·  ROAD GRIP", k * W / 2 + 60, H * 0.905);
    x.font = "bold 20px Arial, sans-serif"; x.fillText("225/45 R18  94W  M+S", k * W / 2 + 620, H * 0.905); x.font = "bold 30px Arial, sans-serif";
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
  return (TYRE_TEX = t);
}
function plateTexture() {
  if (PLATE_TEX || typeof document === "undefined") return PLATE_TEX;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const x = c.getContext("2d"), L = "ABCDEFGHJKLMNPRSTVWXYZ";
  let s = 777; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) {
    const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 128;
    const g = x.createLinearGradient(0, cy, 0, cy + 128); g.addColorStop(0, "#fbfaf4"); g.addColorStop(1, "#e6e2d4");
    x.fillStyle = g; x.fillRect(cx + 4, cy + 4, 248, 120);
    x.strokeStyle = "#1c2c5a"; x.lineWidth = 5; x.strokeRect(cx + 9, cy + 9, 238, 110);
    x.fillStyle = "#b8202a"; x.font = "italic bold 22px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("Palm City", cx + 128, cy + 30);
    const num = (1 + ((rnd() * 9) | 0)) + L[(rnd() * L.length) | 0] + L[(rnd() * L.length) | 0] + L[(rnd() * L.length) | 0] + ((rnd() * 900 + 100) | 0);
    x.fillStyle = "#1c2c5a"; x.font = "bold 54px 'Arial Narrow', Arial, sans-serif"; x.fillText(num, cx + 128, cy + 78);
    x.font = "bold 11px Arial, sans-serif"; x.fillText("SUNSHINE COAST", cx + 128, cy + 110);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (PLATE_TEX = t);
}
// a copy of the plates geometry with a per-instance plate number (0..15)
export function plateGeometry(geo, count) {
  const g = geo.clone();
  const a = new Float32Array(count); for (let i = 0; i < count; i++) a[i] = (i * 7) % 16;
  g.setAttribute("aPlate", new THREE.InstancedBufferAttribute(a, 1));
  return g;
}

function cargoBox(T) {
  const [b0, b1, bh] = T.box, bl = b1 - b0, y0 = T.ride + 0.88, out = [], col = T.boxCol || 0xe6e6e2;
  out.push(place(paint(new THREE.BoxGeometry(T.wid, bh - y0, bl), col, 0.25), 0, (bh + y0) / 2, (b0 + b1) / 2));
  out.push(place(paint(new THREE.BoxGeometry(T.wid + 0.02, 0.07, bl + 0.02), 0x9a9a96, 0.7), 0, bh, (b0 + b1) / 2));
  for (const sx of [-1, 1]) out.push(place(paint(new THREE.BoxGeometry(0.03, bh - y0, 0.06), 0x9a9a96, 0.7), sx * T.wid / 2, (bh + y0) / 2, b0 + 0.03));
  if (T.lockers) {
    // equipment lockers: roller shutters with polished frames down both sides
    const n = 4, w = bl / n;
    for (const sx of [-1, 1]) for (let k = 0; k < n; k++) {
      const zc = b0 + w * (k + 0.5);
      for (let r = 0; r < 9; r++) out.push(place(paint(new THREE.BoxGeometry(0.012, 0.012, w - 0.12), 0x8a0e12, 0.35), sx * (T.wid / 2 + 0.004), y0 + 0.2 + r * (bh - y0 - 0.4) / 8, zc));
      out.push(place(paint(new THREE.BoxGeometry(0.02, bh - y0 - 0.1, 0.04), 0xd8dce2, 1), sx * (T.wid / 2 + 0.006), (bh + y0) / 2, b0 + w * k + 0.02));
    }
    for (const sx of [-1, 1]) out.push(place(paint(new THREE.BoxGeometry(0.03, 0.06, bl), 0xd8dce2, 1), sx * (T.wid / 2 + 0.01), y0 + 0.05, (b0 + b1) / 2));
  } else for (let k = 0; k < 7; k++) out.push(place(paint(new THREE.BoxGeometry(T.wid * 0.92, 0.018, 0.012), 0xb4b4b0, 0.3), 0, y0 + 0.12 + k * (bh - y0 - 0.2) / 6, b0 - 0.007));
  if (T.ladder) {
    // the aerial ladder, folded along the top on its turntable
    const lz0 = b0 + 0.2, lz1 = T.zones.rear[1] + 0.9, ly = bh + 0.32, ll = lz1 - lz0;
    out.push(place(paint(new THREE.CylinderGeometry(0.42, 0.48, 0.22, 16), 0x2a2b2e, 0.6), 0, bh + 0.11, b0 + 0.9));
    for (const sx of [-1, 1]) out.push(place(paint(new THREE.BoxGeometry(0.05, 0.12, ll), 0xd8dce2, 1), sx * 0.32, ly, (lz0 + lz1) / 2));
    for (let z = lz0 + 0.15; z < lz1; z += 0.3) out.push(place(paint(new THREE.CylinderGeometry(0.018, 0.018, 0.64, 6), 0xc4c8ce, 1), 0, ly, z, 0, 0, Math.PI / 2));
    out.push(place(paint(new THREE.BoxGeometry(0.1, 0.24, 0.1), 0xd8dce2, 1), 0, bh + 0.15, lz1 - 0.1));
  }
  return out;
}
// bands, light bars and beacons on emergency vehicles
function emergencyTrim(T, body) {
  const out = [];
  if (T.stripe) for (const sx of [-1, 1]) for (const [yo, h] of [[0.32, 0.12], [0.13, 0.04]]) {
    const z0 = -T.len / 2 + 0.25, z1 = T.zones.ws[1] - 0.25, zc = (z0 + z1) / 2;
    out.push(place(paint(new THREE.BoxGeometry(0.012, h, z1 - z0), T.stripe, 0.3), sx * (body.plan(zc) + 0.003), body.belt(zc) - yo, zc));
  }
  if (T.lightbar) out.push(place(paint(new THREE.BoxGeometry(T.wid * 0.62, 0.06, 0.3), 0x111112, 0.3), 0, T.roofY + 0.03, T.zones.ws[0] - 0.25));
  return out;
}
function emergencyLamps(T) {
  const out = [];
  if (!T.lightbar) return out;
  const z = T.zones.ws[0] - 0.25, y = T.roofY + 0.11, w = T.wid * 0.62;
  for (let k = 0; k < 4; k++) out.push(place(paint(new THREE.BoxGeometry(w / 4 - 0.02, 0.1, 0.26), k < 2 ? 0xff2a2a : 0x2a5cff, k < 2 ? 8 : 9), -w / 2 + w / 8 + k * w / 4, y, z));
  // corner beacons at the back
  for (const sx of [-1, 1]) out.push(place(paint(new THREE.BoxGeometry(0.12, 0.1, 0.12), sx > 0 ? 0xff2a2a : 0x2a5cff, sx > 0 ? 8 : 9), sx * (T.wid / 2 - 0.12), T.box ? T.box[2] + 0.08 : T.roofY + 0.05, -T.len / 2 + 0.2));
  return out;
}
// a motorbike, from parts: wheels with spoked alloys and discs, forks, a tank and fairing in the
// paint colour, seat, engine, exhaust, bars; traffic bikes carry a rider in jacket and helmet
function bikeGeometries(type) {
  const T = TYPES[type], R = T.wheelR, fz = T.wb / 2, P = [], tr = [], Lg = [], gl = [];
  const MET = 0xc8ccd2, DARK = 0x18181a;
  for (const z of [fz, -fz]) {
    const tyre = new THREE.TorusGeometry(R - 0.05, 0.055, 8, 22); tyre.rotateY(Math.PI / 2);
    tr.push(place(paint(tyre, 0x161618), 0, R, z));
    const rim = new THREE.TorusGeometry(R - 0.1, 0.012, 5, 20); rim.rotateY(Math.PI / 2);
    tr.push(place(paint(rim, 0x2a2b2e, 0.6), 0, R, z));
    for (let k = 0; k < 6; k++) { const sp = new THREE.BoxGeometry(0.012, R - 0.1, 0.02); sp.translate(0, (R - 0.1) / 2, 0); sp.rotateX(k / 6 * Math.PI * 2); tr.push(place(paint(sp, 0x2a2b2e, 0.6), 0, R, z)); }
    const disc = new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.008, 18); disc.rotateZ(Math.PI / 2);
    tr.push(place(paint(disc, 0x9a9da2, 0.8), 0.05, R, z));
  }
  // forks to the bars, swingarm to the rear axle
  for (const sx of [-1, 1]) {
    const f = new THREE.CylinderGeometry(0.022, 0.022, 0.75, 8); f.rotateX(-0.42);
    tr.push(place(paint(f, MET, 1), sx * 0.09, R + 0.33, fz - 0.15));
    const sw = new THREE.BoxGeometry(0.03, 0.05, 0.62); tr.push(place(paint(sw, DARK, 0.4), sx * 0.08, R + 0.06, -fz + 0.32, -0.12, 0, 0));
  }
  tr.push(place(paint(new THREE.CylinderGeometry(0.015, 0.015, 0.68, 8), DARK, 0.4), 0, 1.05, fz - 0.33, 0, 0, Math.PI / 2));   // handlebar
  for (const sx of [-1, 1]) tr.push(place(paint(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), 0x111112), sx * 0.34, 1.05, fz - 0.33, 0, 0, Math.PI / 2));   // grips
  tr.push(place(paint(new THREE.BoxGeometry(0.28, 0.28, 0.4), 0x2e2f33, 0.55), 0, 0.5, 0.05));                                   // engine
  tr.push(place(paint(new THREE.BoxGeometry(0.22, 0.12, 0.3), 0x46484c, 0.7), 0, 0.42, 0.25));
  const ex = new THREE.CylinderGeometry(0.035, 0.045, 0.75, 10); ex.rotateX(Math.PI / 2 - 0.15);
  tr.push(place(paint(ex, MET, 1), -0.16, 0.42, -0.45));
  tr.push(place(paint(new THREE.BoxGeometry(0.24, 0.07, 0.55), 0x121214, 0.15), 0, 0.88, -0.28, -0.06, 0, 0));                  // seat
  tr.push(place(paint(new THREE.BoxGeometry(0.16, 0.03, 0.14), 0xe8e6dc), 0, 0.62, -T.len / 2 + 0.12, 0.5, 0, 0));               // plate
  // paint: tank, fairing, tail
  const tank = new THREE.SphereGeometry(0.2, 14, 10); tank.scale(0.85, 0.6, 1.25);
  P.push(place(paint(tank, 0xffffff), 0, 0.9, 0.18));
  const fair = new THREE.SphereGeometry(0.22, 14, 10); fair.scale(0.9, 0.95, 0.75);
  P.push(place(paint(fair, 0xffffff), 0, 0.98, fz - 0.24));
  const tail = new THREE.ConeGeometry(0.12, 0.5, 10); tail.rotateX(-Math.PI / 2 - 0.15); tail.scale(1, 0.6, 1);
  P.push(place(paint(tail, 0xffffff), 0, 0.88, -0.66));
  const fender = new THREE.TorusGeometry(R + 0.02, 0.04, 5, 14, Math.PI * 0.6); fender.rotateY(Math.PI / 2); fender.rotateX(-0.2);
  P.push(place(paint(fender, 0xffffff), 0, R, fz));
  // windscreen
  gl.push(place(paint(new THREE.BoxGeometry(0.3, 0.2, 0.01), 0xffffff), 0, 1.18, fz - 0.16, -0.5, 0, 0));
  // lamps
  Lg.push(place(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14), 0xfff4e2, 1), 0, 0.98, fz - 0.02, Math.PI / 2, 0, 0));
  Lg.push(place(paint(new THREE.BoxGeometry(0.14, 0.05, 0.03), 0xff1e1e, 2), 0, 0.84, -T.len / 2 + 0.2));
  for (const sx of [-1, 1]) {
    Lg.push(place(paint(new THREE.BoxGeometry(0.05, 0.03, 0.04), 0xffa31a, sx > 0 ? 3 : 4), sx * 0.15, 0.95, fz - 0.15));
    Lg.push(place(paint(new THREE.BoxGeometry(0.05, 0.03, 0.04), 0xffa31a, sx > 0 ? 3 : 4), sx * 0.14, 0.82, -T.len / 2 + 0.24));
  }
  // the rider: jacket, jeans, helmet with a dark visor, hands on the bars
  const rider = [];
  const torso = new THREE.CapsuleGeometry(0.17, 0.32, 4, 10); torso.scale(1.1, 1, 0.75);
  rider.push(place(paint(torso, 0x1d2026, 0.05), 0, 1.25, -0.12, 0.55, 0, 0));
  const helm = new THREE.SphereGeometry(0.15, 14, 10); helm.scale(1, 1.05, 1.15);
  rider.push(place(paint(helm, 0x22242a, 0.4), 0, 1.66, 0.12));
  rider.push(place(paint(new THREE.BoxGeometry(0.2, 0.08, 0.06), 0x0a0c10, 0.6), 0, 1.66, 0.28));
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.05, 0.42, 3, 8); rider.push(place(paint(arm, 0x1d2026), sx * 0.24, 1.3, 0.2, 1.05, 0, -sx * 0.25));
    const thigh = new THREE.CapsuleGeometry(0.07, 0.36, 3, 8); rider.push(place(paint(thigh, 0x2a3446), sx * 0.16, 0.93, -0.08, 1.35, 0, 0));
    const shin = new THREE.CapsuleGeometry(0.055, 0.36, 3, 8); rider.push(place(paint(shin, 0x2a3446), sx * 0.2, 0.68, 0.13, -0.35, 0, 0));
    rider.push(place(paint(new THREE.BoxGeometry(0.1, 0.08, 0.22), 0x141414), sx * 0.2, 0.47, 0.2));
  }
  const paintG = merge(P), glassG = merge(gl), lights = merge(Lg);
  return { paint: paintG, glass: glassG, trim: merge([...tr, ...rider]), lights, spec: T, split: { paint: paintG, glass: glassG, trim: merge(tr), doors: {} } };
}
// ---- surface-fitted parts ----
// a depth map of the body: "front" (furthest +z over x,y), "rear" (furthest -z), "side" (furthest
// +x over z,y). surf(u, v) gives the surface there; normals come from its slope.
function depthMap(geos, kind, T) {
  const R = 0.01, side = kind === "side", sgn = kind === "rear" ? -1 : 1;
  const u0 = side ? -T.len / 2 - 0.1 : -T.wid / 2 - 0.15, u1 = -u0, v0 = 0, v1 = T.roofY + 0.4;
  const NU = Math.ceil((u1 - u0) / R) + 1, NV = Math.ceil((v1 - v0) / R) + 1, D = new Float32Array(NU * NV).fill(-1e9);
  const map = (x, y, z) => side ? [z, y, x] : [x, y, z * sgn];
  for (const g of geos) {
    const p = g.attributes.position.array;
    for (let t = 0; t < p.length; t += 9) {
      const A = map(p[t], p[t + 1], p[t + 2]), B = map(p[t + 3], p[t + 4], p[t + 5]), C = map(p[t + 6], p[t + 7], p[t + 8]);
      const iu0 = Math.max(0, Math.floor((Math.min(A[0], B[0], C[0]) - u0) / R)), iu1 = Math.min(NU - 1, Math.ceil((Math.max(A[0], B[0], C[0]) - u0) / R));
      const iv0 = Math.max(0, Math.floor((Math.min(A[1], B[1], C[1]) - v0) / R)), iv1 = Math.min(NV - 1, Math.ceil((Math.max(A[1], B[1], C[1]) - v0) / R));
      const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      if (Math.abs(den) < 1e-12) continue;
      for (let iu = iu0; iu <= iu1; iu++) for (let iv = iv0; iv <= iv1; iv++) {
        const u = u0 + iu * R, v = v0 + iv * R;
        const w0 = ((B[1] - C[1]) * (u - C[0]) + (C[0] - B[0]) * (v - C[1])) / den, w1 = ((C[1] - A[1]) * (u - C[0]) + (A[0] - C[0]) * (v - C[1])) / den, w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const d = w0 * A[2] + w1 * B[2] + w2 * C[2], k = iu * NV + iv;
        if (d > D[k]) D[k] = d;
      }
    }
  }
  const cell = (iu, iv) => D[Math.max(0, Math.min(NU - 1, iu)) * NV + Math.max(0, Math.min(NV - 1, iv))];
  const surf = (u, v) => {
    const fu = (u - u0) / R, fv = (v - v0) / R, iu = Math.floor(fu), iv = Math.floor(fv), a = fu - iu, b = fv - iv;
    const c00 = cell(iu, iv), c10 = cell(iu + 1, iv), c01 = cell(iu, iv + 1), c11 = cell(iu + 1, iv + 1);
    const vals = [c00, c10, c01, c11].filter(c => c > -1e8);
    if (vals.length < 4) return vals.length ? Math.max(...vals) : 0;
    return (c00 * (1 - a) + c10 * a) * (1 - b) + (c01 * (1 - a) + c11 * a) * b;
  };
  // the highest point of the surface around (u, v): a part laid on this never dips into a curve
  const surfN = (u, v, r = 0.022) => { let m = -1e9; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) m = Math.max(m, surf(u + i * r, v + j * r)); return m; };
  return { kind, sgn, side, surf, surfN };
}
// lay a flat shape onto a depth map: rings from its centre out to its outline, every point dropped
// onto the surface and lifted `off` off it. Painted like paint(); uv (0..1 over the shape) if asked.
// sx: for the side map, which side of the car (+1/-1)
function decal(M, shape, off, col, fin, wantUV, sx = 1, flat = false) {
  const { pts, cx, cy } = shape, n = pts.length, rings = [0, 0.3, 0.55, 0.75, 0.9, 0.97, 1];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  // flat parts (plates) stand on a plane at the outermost point of the surface under them
  let flatD = null;
  if (flat) { flatD = -1e9; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) flatD = Math.max(flatD, M.surf(bx0 + (bx1 - bx0) * i / 6, by0 + (by1 - by0) * j / 4)); }
  const to3 = (u, v) => { const d = (flat ? flatD : M.surfN(u, v)) + off; return M.side ? [sx * d, v, u] : [u, v, d * M.sgn]; };
  // seen from behind (or from the left), left and right swap: so text reads the right way round
  const flipU = M.side ? sx < 0 : M.sgn < 0;
  const out = new THREE.Vector3(...(M.side ? [sx, 0, 0] : [0, 0, M.sgn]));
  const P = [], N = [], C = [], UV = [], c = new THREE.Color(col);
  const vtx = (u, v) => {
    const p = to3(u, v), e = 0.012, pu = to3(u + e, v), pv = to3(u, v + e);
    const nn = new THREE.Vector3(pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]).cross(new THREE.Vector3(pv[0] - p[0], pv[1] - p[1], pv[2] - p[2])).normalize();
    if (nn.dot(out) < 0) nn.negate();
    const fu = (u - bx0) / (bx1 - bx0 || 1);
    return { p, n: nn, uv: [flipU ? 1 - fu : fu, (v - by0) / (by1 - by0 || 1)] };
  };
  const ringPt = (ri, j) => { const r = rings[ri], q = pts[j % n]; return vtx(cx + (q[0] - cx) * r, cy + (q[1] - cy) * r); };
  const tri = (a, b, d) => {
    const ab = new THREE.Vector3(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]), ad = new THREE.Vector3(d.p[0] - a.p[0], d.p[1] - a.p[1], d.p[2] - a.p[2]);
    const list = ab.cross(ad).dot(out) >= 0 ? [a, b, d] : [a, d, b];
    for (const q of list) { P.push(...q.p); N.push(q.n.x, q.n.y, q.n.z); C.push(c.r, c.g, c.b); UV.push(...q.uv); }
  };
  const grid = rings.map((r, ri) => ri === 0 ? [ringPt(0, 0)] : pts.map((_, j) => ringPt(ri, j)));
  for (let j = 0; j < n; j++) tri(grid[0][0], grid[1][j], grid[1][(j + 1) % n]);
  for (let ri = 1; ri < rings.length - 1; ri++) for (let j = 0; j < n; j++) {
    const a = grid[ri][j], b = grid[ri][(j + 1) % n], d = grid[ri + 1][j], e = grid[ri + 1][(j + 1) % n];
    tri(a, d, b); tri(b, d, e);
  }
  const g = new THREE.BufferGeometry(), cnt = P.length / 3;
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(cnt).fill(fin || 0), 1));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(wantUV ? UV : new Float32Array(cnt * 2), 2));
  return [g];
}
// outlines: a rounded rectangle, an ellipse, and a lamp swept up toward the car's corner
function rrect(cx, cy, w, h, r, n = 28) {
  const pts = [], a = w / 2, b = h / 2, rr = Math.min(r, a, b);
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    const qx = Math.sign(ct) * (a - rr), qy = Math.sign(st) * (b - rr);
    pts.push([cx + qx + ct * rr, cy + qy + st * rr]);
  }
  return { pts, cx, cy };
}
function ellipse(cx, cy, a, b, n = 20) { const pts = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push([cx + Math.cos(t) * a, cy + Math.sin(t) * b]); } return { pts, cx, cy }; }
function swept(cx, cy, w, h, sx, n = 32) {
  const pts = [], a = w / 2, b = h / 2;
  for (let i = 0; i < n; i++) {
    const t = i / n * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), 0.45) * a, y = Math.sign(st) * Math.pow(Math.abs(st), 0.45) * b;
    const outer = (x * sx / a + 1) / 2;                                // 0 at the inner end, 1 at the outer
    pts.push([cx + x, cy + y * (1 - 0.35 * outer) + outer * h * 0.25]);
  }
  return { pts, cx, cy };
}
// a far-away car: the same shape from fewer sections, plain wheels, no small parts
function farGeometries(type) {
  const T = TYPES[type], body = lofted(T, 1), fz = T.wb / 2, R = T.wheelR, bz = T.len / 2;
  const trim = [];
  const tw = type === "suv" ? 0.27 : 0.24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const ty = new THREE.CylinderGeometry(R, R, tw, 12); ty.rotateZ(Math.PI / 2);
    trim.push(place(paint(ty, 0x18181a), sx * (T.wid / 2 - tw / 2 - 0.02), R, sz * fz));
    const rim = new THREE.CylinderGeometry(R * 0.62, R * 0.62, tw + 0.01, 8); rim.rotateZ(Math.PI / 2);
    trim.push(place(paint(rim, type === "sports" ? 0x2a2b2e : 0xb0b4ba), sx * (T.wid / 2 - tw / 2 - 0.02), R, sz * fz));
  }
  const yf = body.belt(bz - 0.15);
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.5, 0.16, 0.05), 0x101011), 0, yf - 0.2, bz - 0.008));
  if (T.box) trim.push(...cargoBox(T));
  trim.push(...emergencyTrim(T, body));
  const Lg = [];
  for (const sx of [-1, 1]) {
    Lg.push(place(paint(new THREE.BoxGeometry(0.36, 0.1, 0.05), 0xfff4e2, 1), sx * (body.plan(bz - 0.1) - 0.27), yf - 0.08, bz - 0.03, 0, sx * 0.3, 0));
    Lg.push(place(paint(new THREE.BoxGeometry(0.4, 0.1, 0.05), 0xff1e1e, 2), sx * (body.plan(-bz + 0.1) - 0.27), body.belt(-bz + 0.15) - 0.07, -bz + 0.03, 0, -sx * 0.25, 0));
    Lg.push(place(paint(new THREE.BoxGeometry(0.08, 0.05, 0.05), 0xffa31a, sx > 0 ? 3 : 4), sx * (body.plan(-bz + 0.1) - 0.1), body.belt(-bz + 0.15) - 0.15, -bz + 0.03));
  }
  if (T.sign) Lg.push(place(paint(new THREE.BoxGeometry(0.5, 0.13, 0.16), 0xffd23a, 6), 0, T.roofY + 0.14, (T.zones.ws[0] + T.zones.rear[1]) / 2));
  Lg.push(...emergencyLamps(T));
  return { paint: body.paint, glass: body.glass, trim: merge(trim), lights: merge(Lg), spec: T };
}
const cache = {}, farCache = {};
export function carGeometries(type, far = false) {
  if (TYPES[type].bike) return cache[type] || (cache[type] = bikeGeometries(type));
  if (far) return farCache[type] || (farCache[type] = farGeometries(type));
  if (cache[type]) return cache[type];
  const T = TYPES[type];
  const body = lofted(T), L = T.len, bz = L / 2, Z = T.zones;
  const fz = T.wb / 2, R = T.wheelR;
  // painted extras: door mirrors (caps on stalks)
  const extraPaint = [];
  for (const sx of [-1, 1]) {
    const zm = Z.ws[1] - 0.18, yb = body.belt(zm), hw = body.plan(zm);
    const cap = new THREE.SphereGeometry(0.1, 12, 8); cap.scale(0.75, 0.55, 1.1);
    extraPaint.push(place(paint(cap, 0xffffff), sx * (hw + 0.13), yb + 0.1, zm - 0.02));
  }
  const doorList = Object.values(body.doors);
  const bodyPaint = merge([body.paint, ...extraPaint]);
  const paintGeo = merge([bodyPaint, ...doorList.map(d => d.paint)]);
  const glass = merge([body.glass, ...doorList.map(d => d.glass)]);
  // trim: wheels, arch liners, grille, bumpers' black parts, plates, handles, mirror stalks, exhaust
  const trim = [], tyres = [], plates = [];
  const wst = WHEEL_STYLE[type] || "five";
  const rimCol = type === "sports" ? 0x2a2b2e : wst === "steel" ? 0xd8dadc : wst === "six" ? 0x5a5e64 : 0xc4c8cd;
  const tw = T.big ? 0.32 : type === "suv" || type === "pickup" ? 0.27 : 0.24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    trim.push(...wheelParts(R, tw, sx, sx * (T.wid / 2 - tw / 2 - 0.02), R, sz * fz, rimCol, type === "sports" ? 0.4 : 0.7, wst, tyres));
    // the dark wheel-well lining: squashed to stay under this car's own fender line, so it never
    // shows through the paint on low cars
    let low = 9; for (let k = -4; k <= 4; k++) low = Math.min(low, body.belt(sz * fz + k * R / 4));
    const ly = Math.max(0.35, Math.min(1, (low - 0.08 - R) / (R + 0.06)));
    const liner = new THREE.CylinderGeometry(R + 0.06, R + 0.06, tw + 0.02, 18, 1, true, 0, Math.PI); liner.rotateZ(Math.PI / 2); liner.scale(1, ly, 1);
    trim.push(place(paint(liner, 0x0b0b0c), sx * (T.wid / 2 - tw / 2 - 0.06), R, sz * fz));
  }
  // the front and back faces as depth maps, so lamps, grille and plates can be laid onto the real
  // curved surface (flush, like the real things) instead of stuck on as blocks
  const allPaint = [body.paint, ...doorList.map(d => d.paint)];
  const FM = depthMap(allPaint, "front", T), RM = depthMap(allPaint, "rear", T), SM = depthMap(allPaint, "side", T);
  const front = (shape, off, col, fin, uv, flat) => decal(FM, shape, off, col, fin, uv, 1, flat);
  const rear = (shape, off, col, fin, uv, flat) => decal(RM, shape, off, col, fin, uv, 1, flat);
  // grille: a dark mesh in a chrome surround, with chrome bars
  const yf = body.belt(bz - 0.15), hwF = body.plan(bz - 0.05) * 0.62;
  const gW = type === "suv" || T.big ? hwF * 1.15 : hwF * 0.95, gH = type === "suv" || T.big ? 0.3 : type === "sports" ? 0.1 : 0.17;
  const gy = yf - 0.12 - gH / 2;
  trim.push(...front(rrect(0, gy, gW + 0.05, gH + 0.04, 0.03), 0.003, 0xd8dce2, 1));
  trim.push(...front(rrect(0, gy, gW, gH, 0.022), 0.006, 0x0e0e10, 0.3));
  for (let k = 1; k < 4; k++) trim.push(...front(rrect(0, gy - gH / 2 + gH * k / 4, gW * 0.94, 0.01, 0.004), 0.009, 0x9a9ea4, 0.9));
  // number plates (a textured sheet: each car shows its own), in a dark surround, under the grille
  const py = Math.min(T.ride + 0.33, gy - gH / 2 - 0.1);
  trim.push(...front(rrect(0, py, 0.56, 0.135, 0.012), 0.004, 0x141416, 0.3, false, true));
  plates.push(...front(rrect(0, py, 0.52, 0.11, 0.008), 0.009, 0xffffff, 0, true, true));
  const ry = T.ride + 0.33;
  trim.push(...rear(rrect(0, ry, 0.56, 0.135, 0.012), 0.004, 0x141416, 0.3, false, true));
  plates.push(...rear(rrect(0, ry, 0.52, 0.11, 0.008), 0.009, 0xffffff, 0, true, true));
  // badges: a chrome emblem on the grille and the boot
  const badge = new THREE.SphereGeometry(0.05, 14, 8); badge.scale(1.4, 0.8, 0.25);
  trim.push(place(paint(badge.clone(), 0xe8ecf2, 1), 0, gy, FM.surf(0, gy) + 0.012));
  trim.push(place(paint(badge, 0xe8ecf2, 1), 0, T.ride + 0.52, -RM.surf(0, T.ride + 0.52) - 0.008));
  // fog lamp surrounds (the lamps themselves glow, with the lights)
  for (const sx of [-1, 1]) trim.push(...front(ellipse(sx * body.plan(bz - 0.1) * 0.62, Math.min(T.ride + 0.3, py + 0.02), 0.07, 0.05), 0.004, 0x111112, 0.3));
  // headlamps: a chrome bezel round each lens
  const lampW = type === "suv" || T.big ? 0.34 : 0.38, lampH = type === "sports" ? 0.075 : 0.11;
  const hy = body.belt(bz - 0.12) - 0.08, hw = body.plan(bz - 0.1);
  for (const sx of [-1, 1]) trim.push(...front(swept(sx * (hw - 0.25), hy, lampW + 0.03, lampH + 0.025, sx), 0.004, 0xa8acb2, 0.9));
  // rear: diffuser and exhaust tips
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.6, 0.07, 0.05), 0x0d0d0e), 0, T.ride + 0.17, -bz + 0.2));
  for (const sx of type === "sports" ? [-1, 1] : [1]) {
    const ex = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10); ex.rotateX(Math.PI / 2);
    trim.push(place(paint(ex, 0xc0c4c8, 1), sx * T.wid * 0.28, T.ride + 0.13, -bz + 0.2));
  }
  // door handles (they ride on the doors), mirror stalks, roof rails (SUV), a chrome window line (sedan)
  const handles = {};
  for (const sx of [-1, 1]) {
    const zh = [Z.ws[1] - 0.75, Z.b < 50 ? Z.b - 0.35 : null].filter(v => v !== null);
    if (Z.b < 50) zh[1] = Z.b - 0.35, zh[0] = Z.b + 0.55;
    for (const z of zh) {
      const yb = body.belt(z) - 0.1, hw = body.plan(z), hg = place(paint(new THREE.BoxGeometry(0.02, 0.03, 0.17), 0xd8dce2, 1), sx * (hw + 0.012), yb, z);
      const dk = Object.keys(body.doors).find(k => body.doors[k].side === sx && z > body.doors[k].z0 && z < body.doors[k].z1);
      if (dk) (handles[dk] || (handles[dk] = [])).push(hg); else trim.push(hg);
    }
    const zm = Z.ws[1] - 0.18; trim.push(place(paint(new THREE.BoxGeometry(0.12, 0.04, 0.05), 0x111112), sx * (body.plan(zm) + 0.05), body.belt(zm) + 0.07, zm));
    if (type === "suv") trim.push(place(paint(new THREE.BoxGeometry(0.04, 0.04, (Z.ws[0] - Z.rear[1]) * 0.92), 0x1a1a1c), sx * T.wid * 0.33, T.roofY + 0.06, (Z.ws[0] + Z.rear[1]) / 2));
    if (type === "sedan") {
      const z0 = Z.rear[0] + 0.25, z1 = Z.ws[1] - 0.12, zc = (z0 + z1) / 2;
      trim.push(place(paint(new THREE.BoxGeometry(0.015, 0.012, z1 - z0), 0xe0e4ea, 1), sx * (body.plan(zc) * 0.965 + 0.004), body.belt(zc) + 0.005, zc));
    }
  }
  // wipers at the foot of the windscreen, a shark-fin aerial, a rear wiper on hatchbacks and the SUV,
  // fog lamp housings in the front bumper
  {
    const zw = Z.ws[1] - 0.06, yw = body.top(zw) + 0.012;
    for (const sx of [-1, 1]) {
      const wl = T.wid * 0.36, w = new THREE.BoxGeometry(wl, 0.012, 0.02);
      trim.push(place(paint(w, 0x0c0c0d, 0.3), sx * T.wid * 0.17, yw, zw - 0.03, 0.55, sx * 0.22, 0));
    }
    const zf = Z.rear[1] - 0.25;
    if (zf > Z.rear[0]) { const fin = new THREE.CylinderGeometry(0.0, 0.035, 0.07, 4, 1); fin.scale(0.5, 1, 2.2); trim.push(place(paint(fin, 0x0c0c0d, 0.3), 0, body.top(zf) + 0.035, zf)); }
    if (type === "compact" || type === "suv") trim.push(place(paint(new THREE.BoxGeometry(0.34, 0.012, 0.018), 0x0c0c0d, 0.3), 0, (body.top(Z.rear[0]) + body.top(Z.rear[1])) / 2 - 0.12, (Z.rear[0] + Z.rear[1]) / 2 + 0.02, -0.6, 0, 0));
  }
  // a box truck's cargo box (with a roller door's ribs at the back); a taxi's roof sign base
  if (T.box) trim.push(...cargoBox(T));
  trim.push(...emergencyTrim(T, body));
  if (T.sign) trim.push(place(paint(new THREE.BoxGeometry(0.62, 0.05, 0.24), 0x111112, 0.3), 0, T.roofY + 0.05, (Z.ws[0] + Z.rear[1]) / 2));
  // the cabin, seen through the glass and the open door: floor, inner sides, dash, wheel, seats,
  // all fitted under this car's own roofline
  const cab = [];
  const IN = 0x1d1d1f, SEAT = type === "sports" ? 0x3a1a16 : (type === "suv" ? 0x2e2a26 : 0x262628);
  const fourDoor = Z.b < 50, z1 = Z.ws[1] - 0.08, fl = T.floor ?? T.ride + 0.22;
  const zfs = fourDoor ? Z.b + 0.28 : Z.ws[1] - 1.05;                          // front seats (their cushion's middle)
  const zrs = fourDoor ? Z.b - 0.62 : null;                                    // rear bench
  const z0 = type === "bus" ? -L / 2 + 0.4 : Math.max(-L / 2 + 0.45, (fourDoor ? zrs : zfs) - 0.5);   // the back of the cabin
  const zc = (z0 + z1) / 2, cl = z1 - z0, iw = Math.min(body.plan(zc), body.plan(z1)) * 1.8;
  const head = z => body.top(z) - 0.1 - fl;                                     // headroom above the floor here
  cab.push(place(paint(new THREE.BoxGeometry(iw, 0.04, cl), IN), 0, fl, zc));
  for (const sx of [-1, 1]) cab.push(place(paint(new THREE.BoxGeometry(0.02, body.belt(zc) - fl - 0.02, cl), 0x2a2a2c), sx * (iw / 2 - 0.02), (fl + body.belt(zc) - 0.02) / 2, zc));
  cab.push(place(paint(new THREE.BoxGeometry(iw, body.belt(z1) - fl, 0.04), IN), 0, (fl + body.belt(z1)) / 2, z1));             // firewall
  const yd = body.belt(z1 - 0.25);
  cab.push(place(paint(new THREE.BoxGeometry(iw - 0.04, 0.14, 0.4), 0x18181a), 0, yd - 0.05, z1 - 0.22));                            // dashboard
  cab.push(place(paint(new THREE.BoxGeometry(0.26, 0.06, 0.02), 0x0a0a0c), iw * 0.22, yd + 0.03, z1 - 0.42, -0.4, 0, 0));             // instrument hood
  const wheel = new THREE.TorusGeometry(0.16, 0.017, 6, 18); wheel.rotateX(-0.45);
  cab.push(place(paint(wheel, 0x111113, 0.3), iw * 0.22, yd - 0.04, z1 - 0.55));
  // the wheel's hub and three spokes, air vents, a gear lever
  {
    const sw = [];
    const hubG = new THREE.CylinderGeometry(0.045, 0.05, 0.04, 12); hubG.rotateX(Math.PI / 2); sw.push(paint(hubG, 0x18181a, 0.3));
    for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) { const sp = new THREE.BoxGeometry(0.11, 0.025, 0.012); sp.translate(0.08, 0, 0); sp.rotateZ(a); sw.push(paint(sp, 0x222224, 0.4)); }
    sw.push(paint(new THREE.SphereGeometry(0.014, 8, 6), 0xd8dce2, 1));
    const swG = merge(sw); swG.rotateX(-0.45);
    cab.push(place(swG, iw * 0.22, yd - 0.04, z1 - 0.55));
    for (const vx of [-0.33, -0.08, 0.08, 0.33]) for (let k = 0; k < 3; k++) cab.push(place(paint(new THREE.BoxGeometry(0.1, 0.006, 0.01), 0x9a9ea4, 0.85), vx * iw, yd + 0.005 - k * 0.018, z1 - 0.42));
    cab.push(place(paint(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 8), 0x2a2a2c, 0.5), 0, fl + 0.3, z1 - 0.75, 0.25, 0, 0));
    cab.push(place(paint(new THREE.SphereGeometry(0.028, 10, 8), 0x1a1a1c, 0.6), 0, fl + 0.38, z1 - 0.73));
  }
  cab.push(place(paint(new THREE.BoxGeometry(0.15, 0.22, Math.max(0.3, z1 - 0.5 - zfs)), 0x202022), 0, fl + 0.12, (z1 - 0.5 + zfs) / 2));   // centre console
  // seats sit low, as in real cars: the cushion just off the floor, the back reclined
  const cushion = hh => Math.min(0.2, hh * 0.18);
  // padded seats: a rolled cushion, a reclined back with side bolsters, a rounded head rest
  const seat = (x, z, w) => {
    const hh = Math.min(head(z - 0.25), 1.0), cy = fl + cushion(hh);
    const cu = new THREE.CapsuleGeometry(0.065, w - 0.13, 4, 10); cu.rotateZ(Math.PI / 2); cu.scale(1, 1, 3.4);
    cab.push(place(paint(cu, SEAT), x, cy, z));
    cab.push(place(paint(new THREE.BoxGeometry(w - 0.06, hh * 0.6, 0.1), SEAT), x, cy + hh * 0.33, z - 0.28, -0.2, 0, 0));
    for (const bx of [-1, 1]) { const bo = new THREE.CapsuleGeometry(0.045, hh * 0.5, 4, 8); cab.push(place(paint(bo, SEAT), x + bx * (w / 2 - 0.04), cy + hh * 0.33, z - 0.24, -0.2, 0, 0)); }
    const hr = new THREE.CapsuleGeometry(0.06, w * 0.35, 4, 10); hr.rotateZ(Math.PI / 2); hr.scale(1, 1, 0.8);
    cab.push(place(paint(hr, SEAT), x, cy + hh * 0.72, z - 0.38, -0.2, 0, 0));
    for (const bx of [-0.06, 0.06]) cab.push(place(paint(new THREE.CylinderGeometry(0.007, 0.007, 0.08, 6), 0xb8bcc2, 1), x + bx, cy + hh * 0.66, z - 0.36, -0.2, 0, 0));   // head-rest posts
  };
  seat(iw * 0.23, zfs, 0.46); if (!T.busDoor) seat(-iw * 0.23, zfs, 0.46);
  // where the driver sits (local: +x is the driver's side), for the player in the seat
  { const hh = Math.min(head(zfs - 0.25), 1.0); T.seat = { x: iw * 0.23, y: fl + cushion(hh) + 0.1, z: zfs - 0.05, wheelZ: z1 - 0.55, wheelY: yd - 0.04 }; }
  if (fourDoor) {
    const hh = Math.min(head(zrs - 0.25), 1.0);
    const cy = fl + cushion(hh);
    cab.push(place(paint(new THREE.BoxGeometry(iw * 0.86, 0.13, 0.48), SEAT), 0, cy, zrs));
    cab.push(place(paint(new THREE.BoxGeometry(iw * 0.86, hh * 0.6, 0.11), SEAT), 0, cy + hh * 0.32, zrs - 0.28, -0.16, 0, 0));
  }
  cab.push(place(paint(new THREE.BoxGeometry(iw, Math.max(0.1, body.belt(z0) - fl - 0.06), 0.04), IN), 0, (fl + body.belt(z0) - 0.06) / 2, z0));   // behind the seats
  if (type === "bus") for (let z = zfs - 1.4; z > -L / 2 + 0.9; z -= 0.92) for (const sx of [-1, 1]) {   // rows of passenger seats
    cab.push(place(paint(new THREE.BoxGeometry(0.85, 0.12, 0.44), 0x2a3a5a), sx * iw * 0.27, fl + 0.42, z));
    cab.push(place(paint(new THREE.BoxGeometry(0.85, 0.55, 0.08), 0x2a3a5a), sx * iw * 0.27, fl + 0.72, z - 0.24, -0.12, 0, 0));
  }
  const trimGeo = merge([...trim, ...cab, ...Object.values(handles).flat()]);
  const trimBody = merge([...trim, ...cab]);
  // lights, laid flush on the body: headlamps swept round the front corners with a running-light
  // strip, fog lamps, indicators; tail lamps wrapping onto the flanks, reversing lamps; a high stop lamp
  const Lg = [];
  const ty = body.belt(-bz + 0.15) - 0.13, hwr = body.plan(-bz + 0.1), tall = type === "suv" || T.big;
  for (const sx of [-1, 1]) {
    const ind = sx > 0 ? 3 : 4;
    Lg.push(...front(swept(sx * (hw - 0.25), hy, lampW, lampH, sx), 0.008, 0xfff4e2, 1));
    Lg.push(...front(swept(sx * (hw - 0.27), hy - lampH / 2 - 0.022, lampW * 0.8, 0.018, sx), 0.007, 0xeaf4ff, 6));          // running light
    Lg.push(...front(rrect(sx * (hw - 0.25 + lampW / 2 - 0.05), hy + 0.004, 0.07, lampH * 0.55, 0.015), 0.011, 0xffa31a, ind));   // front indicator
    Lg.push(...front(ellipse(sx * body.plan(bz - 0.1) * 0.62, Math.min(T.ride + 0.3, py + 0.02), 0.045, 0.032), 0.008, 0xfff6e8, 1));   // fog lamp
    const tw2 = tall ? 0.17 : 0.42, th2 = tall ? 0.34 : 0.1, tx = sx * (hwr - (tall ? 0.13 : 0.27)), tyy = tall ? ty - 0.1 : ty;
    Lg.push(...rear(rrect(tx, tyy, tw2, th2, 0.03, 36), 0.008, 0xff1e1e, 2));
    Lg.push(...rear(rrect(tx, tyy, tw2 * 0.62, th2 * 0.28, 0.01), 0.012, 0xff6a5a, 2));                                    // the lamp's inner light bar
    Lg.push(...rear(rrect(tx, tyy - th2 / 2 - 0.035, Math.min(0.11, tw2 * 0.6), 0.035, 0.01), 0.008, 0xffa31a, ind));         // rear indicator
    Lg.push(...rear(rrect(sx * (hwr - (tall ? 0.32 : 0.52)), tyy, 0.1, 0.04, 0.01), 0.008, 0xf4f4f4, 5));                     // reversing lamp
    // the tail lamp wraps onto the flank, and a side repeater ahead of the door
    Lg.push(...decal(SM, rrect(-bz + 0.17, tyy, 0.16, Math.min(th2, 0.09), 0.02), 0.008, 0xff1e1e, 2, false, sx));
    const zr = fz + T.wheelR + 0.22;
    Lg.push(...decal(SM, rrect(zr, body.belt(zr) - 0.12, 0.08, 0.025, 0.01), 0.008, 0xffa31a, ind, false, sx));
  }
  Lg.push(place(paint(new THREE.BoxGeometry(0.3, 0.025, 0.02), 0xff1e1e, 7), 0, body.top(Z.rear[0] + 0.03) - 0.03, Z.rear[0] + 0.02));
  // the cabin's glow: the centre screen and the dials behind the wheel
  if (T.seat) {
    const z1 = Z.ws[1] - 0.08, yd = T.seat.wheelY + 0.04;
    Lg.push(place(paint(new THREE.BoxGeometry(0.22, 0.13, 0.008), 0x0c2038, 6), 0, yd + 0.02, z1 - 0.43, -0.35, 0, 0));
    for (const dx of [-0.05, 0.05]) { const dial = new THREE.TorusGeometry(0.03, 0.004, 4, 16); Lg.push(place(paint(dial, 0x4a2a0c, 6), T.seat.x + dx, yd + 0.0, z1 - 0.44, -0.4, 0, 0)); }
  }
  if (T.sign) Lg.push(place(paint(new THREE.BoxGeometry(0.5, 0.13, 0.16), 0xffd23a, 6), 0, T.roofY + 0.14, (Z.ws[0] + Z.rear[1]) / 2));
  Lg.push(...emergencyLamps(T));
  const lights = merge(Lg);
  // for a single car (the player's): the body without its doors, and each door on its own
  const split = { paint: bodyPaint, glass: body.glass, trim: trimBody, doors: {}, tyres: merge(tyres), plates: merge(plates) };
  for (const [k, d] of Object.entries(body.doors)) split.doors[k] = { ...d, trim: handles[k] ? merge(handles[k]) : null, hingeX: d.side * body.plan(d.z1) * 0.975 };
  return (cache[type] = { paint: paintGeo, glass, trim: trimGeo, lights, spec: T, split, tyres: split.tyres, plates: split.plates });
}

// shared materials
// lamps: each lamp's kind rides in the geometry (1 head, 2 tail, 3/4 indicators on the +x/-x side,
// 5 reversing, 6 running light, 7 high stop) and each car's state in a per-instance vec4 aLamp:
// (brake 0/1, headlights 0..1, indicators 0 off / 1 +x / 2 -x / 3 hazards, reversing 0/1)
export const LAMP_U = { uTime: { value: 0 }, night: 0 };   // night: how dark it is (main sets it each frame)
function lampMaterial() {
  // laid on the body like a decal: biased toward the camera in depth so the paint never shows through
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = LAMP_U.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aEmit; attribute vec4 aLamp; varying float vKind; varying vec4 vLamp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKind = aEmit; vLamp = aLamp;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime; varying float vKind; varying vec4 vLamp;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      { float k = floor(vKind + 0.5), brake = vLamp.x, head = vLamp.y, ind = vLamp.z, rev = vLamp.w;
        float blink = step(0.5, fract(uTime * 1.5)), m = 1.0;
        bool plusX = (ind > 0.5 && ind < 1.5) || (ind > 2.5 && ind < 3.5), minusX = ind > 1.5 && ind < 3.5;
        if (k == 1.0) m = 0.8 + head * 4.0;            // clear lenses by day, bright at night
        else if (k == 2.0) m = 0.5 + head * 0.9 + brake * 4.0;
        else if (k == 3.0) m = 0.14 + (plusX ? blink * 5.5 : 0.0);
        else if (k == 4.0) m = 0.14 + (minusX ? blink * 5.5 : 0.0);
        else if (k == 5.0) m = 0.12 + rev * 3.5;
        else if (k == 6.0) m = 0.4 + 2.0 * step(0.01, head + brake + ind + rev + 0.02);
        else if (k == 7.0) m = 0.1 + brake * 4.2;
        else if (k == 8.0 || k == 9.0) { float ph = fract(uTime * 2.2 + (k == 9.0 ? 0.5 : 0.0)); m = 0.35 + (ind > 3.5 ? step(0.5, ph) * (0.6 + 0.4 * step(0.75, fract(uTime * 9.0))) * 7.0 : 0.0); }
        diffuseColor.rgb *= m; }`);
  };
  m.customProgramCacheKey = () => "carlamp";
  return m;
}
// a copy of a lights geometry with its own per-instance lamp state
export function lampGeometry(geo, count) {
  const g = geo.clone();
  g.setAttribute("aLamp", new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  return g;
}
// metal flake for the paint: a tile of tiny randomly tilted facets under the clear coat, so the
// base coat glitters where the light catches it while the lacquer on top stays mirror smooth
function flakeTexture() {
  const N = 256, d = new Uint8Array(N * N * 4);
  let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * N; i++) { const a = rnd() * 6.283, r = Math.pow(rnd(), 2) * 0.9; d[i * 4] = 128 + Math.cos(a) * r * 127; d[i * 4 + 1] = 128 + Math.sin(a) * r * 127; d[i * 4 + 2] = 255; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.needsUpdate = true;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const FLAKE = typeof document !== "undefined" ? flakeTexture() : null;
// trim: one material, but chrome, alloy, gloss plastic and rubber each finish differently. A part's
// finish rides in the geometry (the emissive slot of paint(): 0 rubber/matte, ~0.3 gloss black,
// ~0.6 alloy, 1 chrome)
function trimMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aEmit; varying float vFin;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFin = aEmit;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFin;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 0.06, smoothstep(0.0, 1.0, vFin));")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = smoothstep(0.45, 0.95, vFin);");
  };
  m.customProgramCacheKey = () => "cartrim";
  return m;
}
// tyres: rubber with the tread and lettering in a texture; plates: the number-plate sheet, each
// instance picking its own plate (aPlate)
function tyreMaterial() { const t = tyreTexture(); return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.5, roughness: 0.9, metalness: 0 }); }
function plateMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.45, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aPlate;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + vec2(mod(aPlate, 4.0), 3.0 - floor(aPlate / 4.0))) / 4.0;\n#endif");
  };
  m.customProgramCacheKey = () => "plate";
  return m;
}
export const MAT = {
  paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.45, clearcoat: 1.0, clearcoatRoughness: 0.02, normalMap: FLAKE, normalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: 1.5 }),
  // close up the glass is tinted, not black: you see the cabin through it
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1e2832, roughness: 0.015, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.9, transparent: true, opacity: 0.6 }),
  glassFar: new THREE.MeshPhysicalMaterial({ color: 0x1b2430, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 }),
  trim: trimMaterial(),
  lights: lampMaterial(),
  tyre: typeof document !== "undefined" ? tyreMaterial() : null,
  plate: typeof document !== "undefined" ? plateMaterial() : null,
};
for (const k of ["paint", "glass", "glassFar", "trim"]) reflective(MAT[k]);

// real-world paint mix: mostly silver, white, black and grey, a few colours
export const REAL_PAINTS = [0xb8bcc0, 0xc6c9cc, 0xe8e8e6, 0xf2f2f0, 0x1a1b1d, 0x222428, 0x5a5e62, 0x6b6f73, 0x1f2d4a, 0x2a3a5c, 0x5a1a1e, 0x7a1c20, 0xb9a98c, 0x2a3a2e, 0x8a2a1c, 0x3a4c6a, 0x9aa0a4, 0x2c2c2e];
export const PAINTS = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xe8e8e8, 0x111111, 0x3a86ff, 0xffbe0b, 0x8338ec, 0x6c757d, 0x2ec4b6, 0xa7c957, 0xf7f7ff, 0x9d0208];

// the bus's door: two glass-and-frame leaves that fold in on hinges at the door's outer edges
// (doors.BA / doors.BB; openDoor("BA"|"BB", angle) folds each)
function pickTris(g, keep) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array, p = [], n = [], c = [];
  for (let t = 0; t < P.length; t += 9) {
    if (!keep((P[t + 2] + P[t + 5] + P[t + 8]) / 3)) continue;
    for (let i = 0; i < 9; i++) { p.push(P[t + i]); n.push(N[t + i]); c.push(C[t + i]); }
  }
  return triGeo(p, n, c);
}
function busLeaves(chassis, doors, d, pm) {
  const zm = (d.z0 + d.z1) / 2;
  for (const [k, hz, keep, sd] of [["BA", d.z0, z => z < zm, -1], ["BB", d.z1, z => z >= zm, 1]]) {
    const pivot = new THREE.Group(); pivot.position.set(d.hingeX, 0, hz);
    const off = g => { const c = g.clone(); c.translate(-d.hingeX, 0, -hz); return c; };
    // a bus door is mostly glass: the leaf's lower panel in paint, the rest glazed
    const pg = off(pickTris(d.paint, keep)), gg = off(pickTris(d.glass, keep));
    pivot.add(new THREE.Mesh(pg, pm), new THREE.Mesh(gg, MAT.glass), new THREE.Mesh(innerPanel(pg), MAT.trim));
    pivot.userData.side = sd;
    chassis.add(pivot); doors[k] = pivot;
  }
}
// the inside of a door: its outer skin pushed in and turned to face the cabin, in dark trim
function innerPanel(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, P2 = [], N2 = [], C2 = [];
  for (let t = 0; t < p.length; t += 9) for (const v of [0, 2, 1]) {
    const i = t + v * 3;
    P2.push(p[i] - n[i] * 0.05, p[i + 1] - n[i + 1] * 0.05, p[i + 2] - n[i + 2] * 0.05);
    N2.push(-n[i], -n[i + 1], -n[i + 2]); C2.push(0.2, 0.2, 0.21);
  }
  return triGeo(P2, N2, C2);
}

// a single car as a scene-graph Group (the player's, police, wrecks): the body, its doors on their
// hinges, the cabin, and lamps that brake, indicate, reverse and light up at night (setLamps)
export function makeCar(type, color) {
  const G = carGeometries(type), T = G.spec, S = G.split;
  const group = new THREE.Group(), chassis = new THREE.Group();
  group.add(chassis);
  const pm = reflective(MAT.paint.clone()); pm.color.set(color);   // vertex colours carry the shut-lines and sills
  const body = new THREE.Mesh(S.paint, pm), glass = new THREE.Mesh(S.glass, MAT.glass), trim = new THREE.Mesh(S.trim, MAT.trim);
  const lampGeo = lampGeometry(G.lights, 1);
  const lights = new THREE.InstancedMesh(lampGeo, MAT.lights, 1);
  lights.setMatrixAt(0, new THREE.Matrix4()); lights.frustumCulled = false;
  chassis.add(body, glass, trim, lights);
  for (const m of [body, trim]) { m.castShadow = true; m.receiveShadow = true; }
  if (S.tyres && S.tyres.attributes.position.count) { const ty = new THREE.Mesh(S.tyres, MAT.tyre); ty.castShadow = true; chassis.add(ty); }
  if (S.plates && S.plates.attributes.position.count) {
    const pg = plateGeometry(S.plates, 1); pg.attributes.aPlate.setX(0, (Math.random() * 16) | 0);
    const pm2 = new THREE.InstancedMesh(pg, MAT.plate, 1); pm2.setMatrixAt(0, new THREE.Matrix4()); pm2.frustumCulled = false; chassis.add(pm2);
  }
  // the doors: each on a pivot at its front edge (rotate the pivot about y to swing it open)
  const doors = {};
  for (const [k, d] of Object.entries(S.doors)) {
    if (T.busDoor) { busLeaves(chassis, doors, d, pm); continue; }
    const pivot = new THREE.Group(); pivot.position.set(d.hingeX, 0, d.z1);
    const off = g => { const c = g.clone(); c.translate(-d.hingeX, 0, -d.z1); return c; };
    const outer = new THREE.Mesh(off(d.paint), pm), win = new THREE.Mesh(off(d.glass), MAT.glass), inner = new THREE.Mesh(innerPanel(off(d.paint)), MAT.trim);
    outer.castShadow = true; outer.receiveShadow = true;
    pivot.add(outer, win, inner);
    if (d.trim) pivot.add(new THREE.Mesh(off(d.trim), MAT.trim));
    pivot.userData.side = d.side;
    chassis.add(pivot); doors[k] = pivot;
  }
  const lamp = lampGeo.attributes.aLamp;
  const setLamps = (brake, head, ind, rev) => { lamp.setXYZW(0, brake ? 1 : 0, head, ind, rev ? 1 : 0); lamp.needsUpdate = true; };
  // open a door by an angle (radians; 0 shut). Doors swing outward on whichever side they're on
  const openDoor = (k, ang) => { const d = doors[k]; if (d) d.rotation.y = -ang * d.userData.side; };
  return { group, chassis, spec: T, type, color, body, doors, lights, setLamps, openDoor };
}

// what a driven car's lamps show, from how it's being driven (the player's car, police cars):
// brake lights when slowing or stopped with the brake on, reversing lamps going backwards,
// indicators while turning at low speed, hazards when it's badly damaged, headlights after dark
export function driveLamps(c, inp, dt, night = LAMP_U.night) {
  if (!c.setLamps) return;
  const sp = c.speed || 0, thr = inp ? -(inp.mz || 0) : 0, steer = inp ? (inp.mx || 0) : 0;
  const prev = c._lsp ?? sp; c._lsp = sp;
  const decel = (Math.abs(prev) - Math.abs(sp)) / Math.max(dt, 1e-3);
  const braking = (sp > 0.4 && thr > 0.15) || (sp < -0.4 && thr < -0.15) || (inp && inp.handbrakeHeld) || decel > 4 || Math.abs(sp) < 0.4;
  c._brakeT = braking ? 0.25 : Math.max(0, (c._brakeT || 0) - dt);
  if (Math.abs(steer) > 0.45 && Math.abs(sp) > 1 && Math.abs(sp) < 16) c._indT = 1.2, c._ind = steer < 0 ? 1 : 2;
  else c._indT = Math.max(0, (c._indT || 0) - dt);
  const ind = c.hp !== undefined && c.hp < 35 ? 3 : c._indT > 0 ? c._ind : 0;
  c.setLamps(c._brakeT > 0, night > 0.3 ? 1 : 0, ind, sp < -0.3);
}
