// Palm City — cars. Bodies are real silhouettes: a side profile drawn with curves, extruded to
// the car's width with a generous bevel so every edge is rounded, then a separate glasshouse on
// top. Paint is a clear-coated physical material, so the sky reflects across the bonnet.
// Each type is split into four geometries (paint / glass / trim+wheels / lights) so the traffic
// can draw every car of a type with four instanced draw calls.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge } from "./geo.js";

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
};
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
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
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
  const seams = Z.b < 50 ? [fz - Ra - 0.06, Z.b, -fz + Ra + 0.05] : [fz - Ra - 0.06, -fz + Ra + 0.12];
  const zs = [];
  const NR = lod ? 20 : 50;
  for (let i = 0; i <= NR; i++) { const t = i / NR; zs.push(-L / 2 + L * (0.5 - 0.5 * Math.cos(Math.PI * t))); }
  if (!lod) for (const zz of seams) zs.push(zz - 0.03, zz - 0.008, zz + 0.008, zz + 0.03);
  const side0 = Z.rear[0] + (Z.rear[1] - Z.rear[0]) * (T.len > 4.7 ? 0.15 : 0.5), side1 = Z.ws[1] - 0.12;
  for (const zz of [Z.ws[0], Z.ws[1], Z.rear[0], Z.rear[1], side0, side1, Z.b - 0.06, Z.b + 0.06]) if (Math.abs(zz) < L / 2) zs.push(zz);
  zs.sort((a, b) => a - b);
  const isSeam = z => !lod && seams.some(zz => Math.abs(z - zz) < 0.0085);
  // control points of a half section (x >= 0), row index 0..9
  const half = z => {
    const tp = Math.max(top(z), belt(z) + 0.004), bl = belt(z), bt = bot(z), hw = plan(z) * fender(z);
    const c = smooth(0.06, 0.3, tp - bl);                                         // how much greenhouse here
    const wTop = hw * (0.9 - 0.18 * c), crown = 0.03 + 0.02 * (1 - c);
    return [[0, bt - 0.02], [hw * 0.82, bt], [hw * 0.975, bt + 0.07], [hw, bt + 0.38 * (bl - bt)], [hw * 0.995, bt + 0.78 * (bl - bt)],
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
  const P = [], ROW = [], ZV = [];
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
      if (row <= 4.5) for (const wz of [fz, -fz]) {
        const dz = z - wz;
        if (Math.abs(dz) < Ra) { const archTop = wheelY + Math.sqrt(Ra * Ra - dz * dz); if (yy < archTop) yy = archTop; }
      }
      P.push(xx, yy, z); ROW.push(row); ZV.push(z);
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
      const tp = top(z), bl = belt(z); return tp - bl > 0.16;
    }
    return false;
  };
  const shade = (z, row) => {
    if (row <= 1.2) return 0.16;                                                 // plastic sills / belly
    if (row <= 4.6 && isSeam(z)) return 0.22;                                    // door shut-lines
    if (Math.abs(z) > L / 2 - 0.1 && row <= 3.5) return 0.2;                      // bumper lower lips
    return 1;
  };
  const out = { paint: [[], [], []], glass: [[], [], []] };
  const push = (tgt, vs) => { for (const v of vs) { tgt[0].push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); tgt[1].push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); const s = shade(ZV[v], ROW[v]); tgt[2].push(s, s, s); } };
  for (let t = 0; t < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    const zc = (ZV[vs[0]] + ZV[vs[1]] + ZV[vs[2]]) / 3, rc = (ROW[vs[0]] + ROW[vs[1]] + ROW[vs[2]]) / 3;
    push(glassAt(zc, rc) ? out.glass : out.paint, vs);
  }
  // end caps: a fan over the rounded nose and tail
  for (const [i, dir] of [[0, -1], [NZ - 1, 1]]) {
    let cx = 0, cy = 0; for (let j = 0; j < M; j++) { cy += P[(i * M + j) * 3 + 1]; } cy /= M;
    const zc = zs[i];
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + (j + 1) % M;
      const t = out.paint;
      for (const tri of [[a, b], [b, a]]) {          // both windings: the cap shows whichever way it's built
        for (const v of tri) { t[0].push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); t[1].push(0, 0, dir); const s = ROW[v] <= 3.5 ? 0.2 : 1; t[2].push(s, s, s); }
        t[0].push(cx, cy, zc); t[1].push(0, 0, dir); t[2].push(0.6, 0.6, 0.6);
      }
    }
  }
  // the glass sits a touch inboard of the paint, so the pillars and roof frame it
  const g = out.glass[0]; for (let i = 0; i < g.length; i += 3) { g[i] *= 0.992; g[i + 1] -= 0.004; }
  return { paint: triGeo(out.paint[0], out.paint[1], out.paint[2]), glass: triGeo(out.glass[0], out.glass[1], out.glass[2]), top, belt, plan, bot };
}

// a wheel: tyre with rounded shoulders and sidewall, a five-spoke rim with a lip, a brake disc
function wheelParts(R, w, sx, x, y, z, rimCol) {
  const parts = [];
  const prof = [];
  const r0 = R * 0.66;
  for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI; prof.push(new THREE.Vector2(R - 0.035 + Math.cos(a) * 0.035, Math.sin(a) * (w / 2 - 0.02) * 1.0)); }
  prof.unshift(new THREE.Vector2(r0, -w / 2 + 0.02)); prof.push(new THREE.Vector2(r0, w / 2 - 0.02));
  const tyre = new THREE.LatheGeometry(prof, 20); tyre.rotateZ(Math.PI / 2);
  parts.push(place(paint(tyre, 0x18181a), x, y, z));
  const face = sx * (w / 2 - 0.035);
  const disc = new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.03, 18); disc.rotateZ(Math.PI / 2);
  parts.push(place(paint(disc, 0x4a4b4e), x - sx * 0.04, y, z));
  const lip = new THREE.TorusGeometry(r0 - 0.012, 0.016, 6, 24); lip.rotateY(Math.PI / 2);
  parts.push(place(paint(lip, rimCol), x + face, y, z));
  const barrel = new THREE.CylinderGeometry(r0 - 0.01, r0 - 0.01, w - 0.06, 20, 1, true); barrel.rotateZ(Math.PI / 2);
  parts.push(place(paint(barrel, 0x55585c), x, y, z));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    const sp = new THREE.BoxGeometry(0.03, r0 * 0.92, 0.055);
    sp.translate(0, r0 * 0.46, 0); sp.rotateX(a);
    parts.push(place(paint(sp, rimCol), x + face - sx * 0.012, y, z));
  }
  const hub = new THREE.CylinderGeometry(R * 0.16, R * 0.18, 0.05, 10); hub.rotateZ(Math.PI / 2);
  parts.push(place(paint(hub, rimCol), x + face - sx * 0.01, y, z));
  return parts;
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
  const Lg = [];
  for (const sx of [-1, 1]) {
    Lg.push(place(paint(new THREE.BoxGeometry(0.36, 0.1, 0.05), 0xfff4e2), sx * (body.plan(bz - 0.1) - 0.27), yf - 0.08, bz - 0.03, 0, sx * 0.3, 0));
    Lg.push(place(paint(new THREE.BoxGeometry(0.4, 0.1, 0.05), 0xff1e1e), sx * (body.plan(-bz + 0.1) - 0.27), body.belt(-bz + 0.15) - 0.07, -bz + 0.03, 0, -sx * 0.25, 0));
  }
  return { paint: body.paint, glass: body.glass, trim: merge(trim), lights: merge(Lg), spec: T };
}
const cache = {}, farCache = {};
export function carGeometries(type, far = false) {
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
  const paintGeo = merge([body.paint, ...extraPaint]);
  const glass = body.glass;
  // trim: wheels, arch liners, grille, bumpers' black parts, plates, handles, mirror stalks, exhaust
  const trim = [];
  const rimCol = type === "sports" ? 0x2a2b2e : type === "suv" ? 0x8c9096 : 0xc4c8cd;
  const tw = type === "suv" ? 0.27 : 0.24;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    trim.push(...wheelParts(R, tw, sx, sx * (T.wid / 2 - tw / 2 - 0.02), R, sz * fz, rimCol));
    const liner = new THREE.CylinderGeometry(R + 0.07, R + 0.07, tw + 0.08, 18, 1, true, 0, Math.PI); liner.rotateZ(Math.PI / 2);
    trim.push(place(paint(liner, 0x0b0b0c), sx * (T.wid / 2 - tw / 2 - 0.05), R, sz * fz));
  }
  // front: grille in a chrome frame, lower intake, plate
  const yf = body.belt(bz - 0.15), hwF = body.plan(bz - 0.05) * 0.62;
  const gW = type === "suv" ? hwF * 1.15 : hwF * 0.95, gH = type === "suv" ? 0.3 : type === "sports" ? 0.1 : 0.17;
  trim.push(place(paint(new THREE.BoxGeometry(gW, gH, 0.05), 0x101011), 0, yf - 0.12 - gH / 2, bz - 0.008));
  trim.push(place(paint(new THREE.BoxGeometry(gW + 0.04, 0.02, 0.055), 0xb8bcc2), 0, yf - 0.12, bz - 0.004));
  for (let k = 1; k < 4; k++) trim.push(place(paint(new THREE.BoxGeometry(gW - 0.02, 0.008, 0.055), 0x3a3b3e), 0, yf - 0.12 - gH * k / 4, bz - 0.004));
  trim.push(place(paint(new THREE.BoxGeometry(gW * 1.2, 0.08, 0.05), 0x0d0d0e), 0, T.ride + 0.2, bz - 0.012));
  const plate = (zz, sgn) => {
    trim.push(place(paint(new THREE.BoxGeometry(0.52, 0.12, 0.012), 0xe8e6dc), 0, T.ride + 0.33, zz + sgn * 0.006));
    trim.push(place(paint(new THREE.BoxGeometry(0.42, 0.05, 0.004), 0x22314a), 0, T.ride + 0.33, zz + sgn * 0.013));
  };
  plate(bz + 0.004, 1); plate(-bz - 0.004, -1);
  // rear: diffuser and exhaust tips
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.6, 0.07, 0.05), 0x0d0d0e), 0, T.ride + 0.17, -bz + 0.2));
  for (const sx of type === "sports" ? [-1, 1] : [1]) {
    const ex = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10); ex.rotateX(Math.PI / 2);
    trim.push(place(paint(ex, 0x9a9da2), sx * T.wid * 0.28, T.ride + 0.13, -bz + 0.2));
  }
  // door handles, mirror stalks, roof rails (SUV), a chrome window line (sedan)
  for (const sx of [-1, 1]) {
    const zh = [Z.ws[1] - 0.75, Z.b < 50 ? Z.b - 0.35 : null].filter(v => v !== null);
    if (Z.b < 50) zh[1] = Z.b - 0.35, zh[0] = Z.b + 0.55;
    for (const z of zh) { const yb = body.belt(z) - 0.1, hw = body.plan(z); trim.push(place(paint(new THREE.BoxGeometry(0.02, 0.03, 0.17), 0xb8bcc2), sx * (hw + 0.012), yb, z)); }
    const zm = Z.ws[1] - 0.18; trim.push(place(paint(new THREE.BoxGeometry(0.12, 0.04, 0.05), 0x111112), sx * (body.plan(zm) + 0.05), body.belt(zm) + 0.07, zm));
    if (type === "suv") trim.push(place(paint(new THREE.BoxGeometry(0.04, 0.04, (Z.ws[0] - Z.rear[1]) * 0.92), 0x1a1a1c), sx * T.wid * 0.33, T.roofY + 0.06, (Z.ws[0] + Z.rear[1]) / 2));
    if (type === "sedan") {
      const z0 = Z.rear[0] + 0.25, z1 = Z.ws[1] - 0.12, zc = (z0 + z1) / 2;
      trim.push(place(paint(new THREE.BoxGeometry(0.015, 0.012, z1 - z0), 0xc8ccd2), sx * (body.plan(zc) * 0.965 + 0.004), body.belt(zc) + 0.005, zc));
    }
  }
  const trimGeo = merge(trim);
  // lights: headlamps swept round the front corners, tail lamps wrapping onto the flanks, a high stop lamp
  const Lg = [];
  const hy = body.belt(bz - 0.12) - 0.08;
  for (const sx of [-1, 1]) {
    const hw = body.plan(bz - 0.1);
    const head = new THREE.CapsuleGeometry(0.06, type === "suv" ? 0.28 : 0.3, 4, 10); head.rotateZ(Math.PI / 2); head.scale(1, type === "sports" ? 0.7 : 1, 0.6);
    Lg.push(place(paint(head, 0xfff4e2), sx * (hw - 0.27), hy, bz - 0.06, 0, sx * 0.32, 0));
    Lg.push(place(paint(new THREE.BoxGeometry(0.26, 0.018, 0.02), 0xeaf4ff), sx * (hw - 0.3), hy - 0.065, bz - 0.04, 0, sx * 0.3, 0));   // daytime running strip
    const ty = body.belt(-bz + 0.15) - 0.07, hwr = body.plan(-bz + 0.1);
    const tl = new THREE.BoxGeometry(type === "suv" ? 0.16 : 0.42, type === "suv" ? 0.34 : 0.1, 0.04);
    Lg.push(place(paint(tl, 0xff1e1e), sx * (hwr - (type === "suv" ? 0.12 : 0.27)), type === "suv" ? ty - 0.1 : ty, -bz + 0.035, 0, -sx * 0.25, 0));
    Lg.push(place(paint(new THREE.BoxGeometry(0.04, type === "suv" ? 0.3 : 0.08, 0.16), 0xff1e1e), sx * (hwr + 0.005), type === "suv" ? ty - 0.1 : ty, -bz + 0.2));
    Lg.push(place(paint(new THREE.BoxGeometry(0.1, 0.035, 0.03), 0xffa31a), sx * (hw - 0.06), hy - 0.03, bz - 0.12, 0, sx * 0.6, 0));   // indicators
  }
  Lg.push(place(paint(new THREE.BoxGeometry(0.3, 0.025, 0.02), 0xff1e1e), 0, body.top(Z.rear[0] + 0.03) - 0.03, Z.rear[0] + 0.02));
  const lights = merge(Lg);
  return (cache[type] = { paint: paintGeo, glass, trim: trimGeo, lights, spec: T });
}

// shared materials
export const MAT = {
  paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2430, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 }),
  trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }),
  lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

// real-world paint mix: mostly silver, white, black and grey, a few colours
export const REAL_PAINTS = [0xb8bcc0, 0xc6c9cc, 0xe8e8e6, 0xf2f2f0, 0x1a1b1d, 0x222428, 0x5a5e62, 0x6b6f73, 0x1f2d4a, 0x2a3a5c, 0x5a1a1e, 0x7a1c20, 0xb9a98c, 0x2a3a2e, 0x8a2a1c, 0x3a4c6a, 0x9aa0a4, 0x2c2c2e];
export const PAINTS = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xe8e8e8, 0x111111, 0x3a86ff, 0xffbe0b, 0x8338ec, 0x6c757d, 0x2ec4b6, 0xa7c957, 0xf7f7ff, 0x9d0208];

// a single drivable car as a scene-graph Group (player cars): wheels are separate so they spin and steer
export function makeCar(type, color) {
  const G = carGeometries(type), T = G.spec;
  const group = new THREE.Group();
  const pm = MAT.paint.clone(); pm.color.set(color);   // vertex colours carry the shut-lines and sills
  const body = new THREE.Mesh(G.paint, pm);
  const glass = new THREE.Mesh(G.glass, MAT.glass);
  // trim without the wheels, wheels as their own meshes
  const trim = new THREE.Mesh(G.trim, MAT.trim);
  const lightMat = MAT.lights.clone();
  const lights = new THREE.Mesh(G.lights, lightMat);
  const chassis = new THREE.Group();
  chassis.add(body, glass, trim, lights);
  group.add(chassis);
  for (const m of [body, glass, trim]) { m.castShadow = true; m.receiveShadow = true; }
  return { group, chassis, spec: T, type, color, lightMat, body };
}
