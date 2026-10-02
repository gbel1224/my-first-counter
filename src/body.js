// Palm City — bodies. The detailed figures for everyone near you: a torso shaped by shoulders, chest,
// waist and back (a man's and a woman's), a pelvis with the belt line and pockets, arms with the swell of
// the shoulder and biceps, forearms tapering to the wrist, hands with a palm, four jointed fingers and a
// thumb, thighs and calves with their muscle, and sneakers. Clothes are part of the shapes: a T-shirt with
// its collar and sleeves (or long sleeves, or none), jeans with seams, a fly, pockets and a belt.
// Every piece hangs off the same rig joints as the simple crowd figures (people.js), so it drops in.
import * as THREE from "../vendor/three.module.js";

const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const G = (x, s) => Math.exp(-((x / s) ** 2));
const R = { hipY: 0.97, hipW: 0.1, shoulderY: 0.53, shoulderW: 0.2, thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.27 };

// paint per vertex (colour multiplies the person's colour), ready for merging
function paintFn(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), c = [1, 1, 1];
  for (let i = 0; i < n; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; c[0] = c[1] = c[2] = 1; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function merge(list) {
  const out = new THREE.BufferGeometry(), total = list.reduce((s, g) => s + g.attributes.position.count, 0);
  for (const nm of ["position", "normal", "uv", "color", "aEmit"]) {
    const size = list[0].attributes[nm].itemSize, arr = new Float32Array(total * size);
    let off = 0; for (const g of list) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
function mirrorX(src) {
  const g = src.clone(), p = g.attributes.position, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); nr.setX(i, -nr.getX(i)); }
  for (const nm of ["position", "normal", "uv", "color", "aEmit"]) {
    const a = g.attributes[nm], s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
  }
  return g;
}
const flat = k => (x, y, z, c) => { c[0] = c[1] = c[2] = k; };

// a surface swept over rows (y) and around (angle): shape(t, a) → [x, y, z]; closed round, open at the ends
function sweep(rows, cols, shape, uvScale = [1, 1]) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const t = i / rows, a = j / cols * Math.PI * 2;
    pos.push(...shape(t, a)); uv.push(j / cols * uvScale[0], t * uvScale[1]);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // the seam where the angle wraps: average its normals so it doesn't show
  const n = g.attributes.normal;
  for (let i = 0; i <= rows; i++) { const a = i * (cols + 1), b = a + cols; const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2, l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
// a superellipse cross-section: boxier than a circle, like real bodies are
const se = (a, n) => { const s = Math.sin(a), c = Math.cos(a); return [Math.sign(s) * Math.abs(s) ** (2 / n), Math.sign(c) * Math.abs(c) ** (2 / n)]; };

// a limb: a radius profile down its length, a muscle bulge front/back, flattened a little side to side
function limb(len, prof, opts = {}) {
  const { front = () => 0, back = () => 0, flatX = 1, rows = 14, cols = 16, ext = 0, top = 0, caps = true, capTop = true, capTopY = 0.6 } = opts;
  const body = sweep(rows, cols, (t, a) => {
    const r = prof(t) + ext, [sx, cz] = se(a, 2.2);
    const bulge = cz > 0 ? front(t) * cz : back(t) * -cz;
    return [sx * r * flatX, top - t * len, cz * (r + bulge)];
  });
  if (!caps) return body;
  const capAt = (t, up) => { const r = prof(t) + ext, c = new THREE.SphereGeometry(r, cols, 5, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2); c.scale(flatX, up ? capTopY : 0.6, 1); c.translate(0, top - t * len, 0); return c; };
  return capTop ? [body, capAt(0, true), capAt(1, false)] : [body, capAt(1, false)];
}
const many = (g, fn) => (Array.isArray(g) ? g : [g]).map(x => paintFn(x, fn));

function build() {
  const B = {};
  // ---- the torso: shirt over chest, waist and back; a man's and a woman's ----
  const torso = fem => {
    const W = fem ? [[0.0, 0.152], [0.1, 0.138], [0.22, 0.145], [0.34, 0.16], [0.44, 0.174], [0.5, 0.178], [0.535, 0.16], [0.56, 0.1], [0.585, 0.058]]
                  : [[0.0, 0.162], [0.1, 0.158], [0.22, 0.17], [0.34, 0.188], [0.44, 0.205], [0.5, 0.212], [0.535, 0.188], [0.56, 0.11], [0.585, 0.06]];
    const D = [[0.0, 0.11], [0.1, 0.104], [0.22, 0.11], [0.34, 0.122], [0.44, 0.124], [0.5, 0.104], [0.54, 0.078], [0.585, 0.056]];
    const prof = (P, y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const [y0, v0] = P[i - 1], [y1, v1] = P[i]; return lerp(v0, v1, sst(0, 1, (y - y0) / (y1 - y0))); } return P[P.length - 1][1]; };
    const g = sweep(30, 34, (t, a) => {
      const y = t * 0.585, [sx, cz] = se(a, 2.6), w = prof(W, y), d = prof(D, y);
      let x = sx * w, z = cz * d;
      const ax = Math.abs(x);
      // chest: pecs for him, a bust for her; shoulder blades at the back; the shoulders slope to the neck
      if (cz > 0) z += fem ? 0.046 * G(ax - 0.055, 0.042) * G(y - 0.37, 0.05) * cz : 0.012 * G(ax - 0.06, 0.05) * G(y - 0.39, 0.045) * cz;
      else z -= 0.008 * G(ax - 0.07, 0.04) * G(y - 0.42, 0.06) * -cz;
      const yy = y - 0.03 * sst(0.06, 0.19, ax) * sst(0.47, 0.56, y);
      return [x, yy, z];
    });
    return merge([paintFn(g, (x, y, z, c) => {
      // the T-shirt: a ribbed collar, the hem, side seams, soft folds at the waist
      let k = 1 - 0.18 * sst(0.548, 0.562, y) * sst(0.58, 0.57, y) - 0.12 * sst(0.018, 0.0, y);
      k *= 1 - 0.06 * G(Math.abs(Math.atan2(x, z)) - Math.PI / 2, 0.05);
      k *= 1 - 0.05 * Math.max(0, Math.sin(y * 90 + Math.sin(x * 40) * 2)) * sst(0.2, 0.05, y);
      c[0] = c[1] = c[2] = k;
    })]);
  };
  B.torsoM = torso(false); B.torsoF = torso(true);
  // ---- the pelvis: jeans, belt, fly, back pockets ----
  const hips = fem => {
    const g = sweep(16, 34, (t, a) => {
      const y = 0.05 - t * 0.2, [sx, cz] = se(a, 2.4);
      const w = lerp(fem ? 0.156 : 0.164, fem ? 0.182 : 0.17, sst(0, 0.5, t)) * lerp(1, 0.86, sst(0.6, 1, t));
      let d = lerp(0.11, 0.114, sst(0, 0.6, t)) * lerp(1, 0.8, sst(0.75, 1, t));
      if (cz < 0) d += (fem ? 0.026 : 0.018) * G(t - 0.55, 0.3);                // seat
      const y2 = y - 0.03 * sst(0.7, 1, t) * (1 - G(sx, 0.35));                  // the legs part at the crotch
      return [sx * w, y2, cz * d];
    });
    return merge([paintFn(g, (x, y, z, c) => {
      let k = 1;
      if (y > 0.018 && y < 0.05) k = 0.42 + (Math.abs(x) < 0.018 && z > 0 ? 0.4 : 0);                                     // belt and buckle
      if (z > 0.06 && Math.abs(x) < 0.006 && y < 0.018 && y > -0.1) k *= 0.82;                                            // the fly
      if (z < -0.05 && Math.abs(Math.abs(x) - 0.065) < 0.034 && y < -0.01 && y > -0.08) k *= Math.abs(Math.abs(x) - 0.065) > 0.03 || y > -0.015 || y < -0.075 ? 0.8 : 0.96;  // pockets
      c[0] = c[1] = c[2] = k;
    })]);
  };
  B.hipsM = hips(false); B.hipsF = hips(true);
  // ---- arms ----
  const upperProf = t => lerp(0.066, 0.045, sst(0, 1, t)) + 0.007 * G(t - 0.15, 0.2);
  const upperOpts = { front: t => 0.007 * G(t - 0.45, 0.22), back: t => 0.004 * G(t - 0.4, 0.3), flatX: 0.9, top: 0.0, capTopY: 0.35 };
  B.upperSkin = merge(many(limb(R.upper + 0.04, upperProf, upperOpts), flat(1)));
  B.upperCloth = merge(many(limb(R.upper + 0.04, upperProf, { ...upperOpts, ext: 0.007 }), (x, y, z, c) => { c[0] = c[1] = c[2] = 1 - 0.05 * Math.max(0, Math.sin(y * 120)); }));
  // a T-shirt sleeve: a flared band over the top of the arm with a hemmed edge
  B.sleeve = merge(many(limb(0.12, t => upperProf(t * 0.4) + 0.006 + t * 0.003, { ...upperOpts, rows: 8, caps: false }), (x, y, z, c) => { c[0] = c[1] = c[2] = y < -0.098 ? 0.84 : 1; }));
  const foreProf = t => lerp(0.048, 0.031, sst(0.1, 1, t)) + 0.007 * G(t - 0.2, 0.18);
  B.foreSkin = merge(many(limb(R.fore + 0.01, foreProf, { flatX: 0.92, front: t => 0.003 * G(t - 0.25, 0.2), top: 0.01 }), flat(1)));
  B.foreCloth = merge(many(limb(R.fore - 0.01, t => foreProf(t) + 0.007, { flatX: 0.92, top: 0.01 }), (x, y, z, c) => { c[0] = c[1] = c[2] = y < -R.fore + 0.03 ? 0.85 : 1; }));
  // ---- hands: a palm, four fingers with three joints each, a thumb; palm toward the body ----
  const hand = () => {
    const parts = [], wy = -R.fore;
    const palm = new THREE.SphereGeometry(1, 14, 10), pp = palm.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i); pp.setXYZ(i, x * 0.015 * (1 - 0.15 * y), y * 0.045, z * 0.038 * (1 + 0.1 * y)); }
    palm.translate(0, wy - 0.045, 0.002); palm.computeVertexNormals(); parts.push(paintFn(palm, flat(1)));
    // fingers: index to little, slightly fanned, curling in at each knuckle
    const fingers = [[0.022, 0.044, 0.0085], [0.0075, 0.048, 0.0088], [-0.0075, 0.045, 0.0084], [-0.021, 0.037, 0.0075]];
    for (const [fz, len, r] of fingers) {
      let p = new THREE.Vector3(-0.002, wy - 0.088, fz), dir = new THREE.Vector3(-0.12, -1, fz * 1.2).normalize();
      const seg = [0.42, 0.33, 0.25];
      for (let s = 0; s < 3; s++) {
        const L = len * seg[s], cap = new THREE.CapsuleGeometry(r * (1 - s * 0.1), L, 2, 7);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        cap.applyQuaternion(q); const mid = p.clone().addScaledVector(dir, L / 2); cap.translate(mid.x, mid.y, mid.z);
        parts.push(paintFn(cap, (x, y, z, c) => { const k = s === 2 && x < -0.004 ? 1.06 : 1; c[0] = k; c[1] = k * 0.98; c[2] = k * 0.98; }));
        p.addScaledVector(dir, L);
        dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.28 - s * 0.08).normalize();     // curl toward the palm
      }
    }
    // thumb: from the base of the palm, across and forward
    let p = new THREE.Vector3(-0.012, wy - 0.03, 0.03), dir = new THREE.Vector3(-0.45, -0.6, 0.66).normalize();
    for (let s = 0; s < 2; s++) {
      const L = s ? 0.024 : 0.03, cap = new THREE.CapsuleGeometry(0.0098 - s * 0.001, L, 2, 7);
      cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
      const mid = p.clone().addScaledVector(dir, L / 2); cap.translate(mid.x, mid.y, mid.z);
      parts.push(paintFn(cap, flat(1))); p.addScaledVector(dir, L); dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
    }
    return merge(parts);
  };
  B.handR = hand(); B.handL = mirrorX(B.handR);
  // ---- legs ----
  const thighProf = t => lerp(0.1, 0.06, sst(0, 1, t));
  B.thigh = merge(many(limb(R.thigh + 0.03, thighProf, { front: t => 0.01 * G(t - 0.35, 0.3), back: t => 0.006 * G(t - 0.3, 0.3), flatX: 0.95, top: 0.03, ext: 0.006, capTop: false }), (x, y, z, c) => {
    // jeans: an outer seam, a little bunching at the knee
    let k = 1 - 0.1 * G(Math.abs(Math.atan2(x, z)) - Math.PI / 2, 0.06);
    k *= 1 - 0.06 * Math.max(0, Math.sin(y * 140)) * G(y + R.thigh, 0.06);
    c[0] = c[1] = c[2] = k;
  }));
  const shinProf = t => lerp(0.058, 0.036, sst(0.15, 1, t));
  const calf = t => 0.016 * G(t - 0.28, 0.2);
  B.shinSkin = merge(many(limb(R.shin + 0.02, shinProf, { back: calf, front: t => 0.003 * G(t - 0.1, 0.2), flatX: 0.92, top: 0.02, capTopY: 0.4 }), flat(1)));
  B.shinCloth = merge(many(limb(R.shin - 0.03, t => Math.max(shinProf(t) + 0.009, 0.05 - t * 0.004), { back: t => calf(t) * 0.6, flatX: 0.95, top: 0.02 }), (x, y, z, c) => {
    let k = 1 - 0.1 * G(Math.abs(Math.atan2(x, z)) - Math.PI / 2, 0.06);
    if (y < -R.shin + 0.06) k *= 0.88;                                                                                    // the hem
    c[0] = c[1] = c[2] = k;
  }));
  // ---- sneakers: the upper (the person's shoe colour) with a toe cap and laces, then the white sole ----
  {
    const fy = -R.shin - 0.035;
    const up = new THREE.SphereGeometry(1, 22, 14), pp = up.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      let x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      const toe = sst(0.0, 1, z);
      x *= 0.052 * (1 - 0.18 * toe); y = (y > 0 ? y * lerp(0.085, 0.042, sst(-0.4, 0.9, z)) : y * 0.02); z = z * 0.14;
      pp.setXYZ(i, x, y + fy + 0.02, z + 0.05);
    }
    up.computeVertexNormals();
    const upper = paintFn(up, (x, y, z, c) => {
      let k = 1;
      if (Math.abs(x) < 0.016 && z > 0.0 && z < 0.12 && y > fy + 0.045) k = 0.7 + 0.3 * (Math.sin(z * 260) > 0 ? 1 : 0.6);     // laces
      if (z > 0.13) k *= 0.9;                                                                                                // toe cap
      if (y < fy + 0.028) k *= 0.85;
      c[0] = c[1] = c[2] = k;
    });
    B.shoe = merge([upper]);
    const so = new THREE.CylinderGeometry(1, 1, 1, 28, 1), sp = so.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i); sp.setXYZ(i, x * 0.056 * (1 - 0.16 * sst(0, 1, z)), y * 0.026, z * 0.154); }
    so.translate(0, fy + 0.008, 0.05); so.computeVertexNormals();
    B.sole = merge([paintFn(so, (x, y, z, c) => { const k = y < fy + 0.0 ? 0.7 : 1; c[0] = c[1] = c[2] = k; })]);
  }
  return B;
}
export const BODY = build();

// which detailed pieces dress a rig part, given the look
export function bodyPieces(part, look) {
  const fem = !!look.long;
  switch (part) {
    case "torso": return [fem ? "torsoF" : "torsoM"];
    case "hips": return [fem ? "hipsF" : "hipsM"];
    case "upperL": case "upperR": return look.sleeves === "long" ? ["upperCloth"] : look.sleeves === "none" ? ["upperSkin"] : ["upperSkin", "sleeve"];
    case "foreL": case "foreR": return [look.sleeves === "long" ? "foreCloth" : null, "foreSkin", part === "foreL" ? "handL" : "handR"].filter(Boolean);
    case "thighL": case "thighR": return ["thigh"];
    case "shinL": case "shinR": return [look.shorts ? "shinSkin" : "shinCloth", "shoe", "sole"];
  }
  return [];
}
// the colour (a look key, or a fixed colour) and the shading for each piece
export const BODY_COLOR = { torsoM: "shirt", torsoF: "shirt", hipsM: "pants", hipsF: "pants", upperSkin: "skin", upperCloth: "shirt", sleeve: "shirt", foreSkin: "skin", foreCloth: "shirt", handL: "skin", handR: "skin",
  thigh: "pants", shinSkin: "skin", shinCloth: "pants", shoe: "shoeCol", sole: 0xeeece6 };
export const BODY_MAT = { torsoM: "cloth", torsoF: "cloth", hipsM: "denim", hipsF: "denim", upperSkin: "skin", upperCloth: "cloth", sleeve: "cloth", foreSkin: "skin", foreCloth: "cloth", handL: "skin", handR: "skin",
  thigh: "denim", shinSkin: "skin", shinCloth: "denim", shoe: "cloth", sole: "rubber" };
// how many of each piece one person can need at once (left + right)
export const BODY_SLOTS = { torsoM: 1, torsoF: 1, hipsM: 1, hipsF: 1, upperSkin: 2, upperCloth: 2, sleeve: 2, foreSkin: 2, foreCloth: 2, handL: 1, handR: 1, thigh: 2, shinSkin: 2, shinCloth: 2, shoe: 2, sole: 2 };

// fabric: a fine weave in the colour and the bump, a soft sheen at grazing angles (denim gets a twill)
export function clothMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === "rubber" ? 0.6 : 0.88 });
  if (kind === "rubber") return m;
  const denim = kind === "denim";
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBLocal = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vBLocal;
      float bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float bn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(bh(i), bh(i + vec3(1,0,0)), f.x), mix(bh(i + vec3(0,1,0)), bh(i + vec3(1,1,0)), f.x), f.y), mix(mix(bh(i + vec3(0,0,1)), bh(i + vec3(1,0,1)), f.x), mix(bh(i + vec3(0,1,1)), bh(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float weave(vec3 p) { ${denim ? "return 0.5 + 0.5 * sin((p.x + p.z) * 1600.0 + p.y * 1600.0);" : "return 0.5 + 0.25 * sin(p.x * 2400.0) * sin(p.y * 2400.0) + 0.25 * sin(p.z * 2400.0) * sin(p.y * 2400.0);"} }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float wv = weave(vBLocal);
        diffuseColor.rgb *= 0.92 + 0.1 * wv + 0.06 * (bn(vBLocal * 60.0) - 0.5) ${denim ? "+ 0.1 * (bn(vBLocal * vec3(8.0, 90.0, 8.0)) - 0.5)" : ""};`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { float h = (weave(vBLocal) * 0.6 + bn(vBLocal * 140.0) * 0.4) * 0.0006;
          vec2 dh = vec2(dFdx(h), dFdy(h)); vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2)); }`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        { float fr = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition) * -1.0)), 3.0); reflectedLight.indirectDiffuse += fr * 0.25 * diffuseColor.rgb; }`);
  };
  m.customProgramCacheKey = () => "|cloth" + kind;
  return m;
}
export const SHOES = [0xf2f2f0, 0x1a1a1c, 0x5a5e62, 0x1f2d4a, 0x8a2a2a, 0xb89a72, 0xe8e4dc, 0x2a2a2e];
