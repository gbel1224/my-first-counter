// Palm City — faces. A sculpted head (eye sockets, brow ridge, cheekbones, a real nose with nostrils,
// a mouth recess, chin), eyeballs with a ringed iris, a pupil and a catchlight, lids with a lash line
// that blink and squint, brows that knit and lift, shaped lips with a cupid's bow that smile, frown
// and part to show two rows of teeth, gums and a tongue — plus hair and beards that follow the scalp
// with soft edges. Every moving part is its own small mesh placed on the head each frame, so the same
// code drives the player, shop staff and (instanced) the crowd.
import * as THREE from "../vendor/three.module.js";

// ---------------------------------------------------------------------------------------------
// the head's frame (metres, head-local): an egg centred here, front surface around z = 0.11
const HC = { y: 0.19, z: 0.005 }, HR = { x: 0.0986, y: 0.1277, z: 0.112 };
export const EYE = { x: 0.0355, y: 0.205, z: 0.0915, r: 0.0128 };
export const MOUTH = { y: 0.1405, z: 0.1088 };
const BROW = { x: 0.037, y: 0.2265, z: 0.1045 };

const G2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// the sculpted surface: a point on the unit sphere → the head's skin there (with or without the face)
function skin(d, face = true, out = new THREE.Vector3()) {
  let x = d.x * HR.x, y = HC.y + d.y * HR.y, z = HC.z + d.z * HR.z;
  // the jaw narrows to the chin, the back of the jaw tucks in toward the neck
  const t = sst(0.178, 0.085, y);
  x *= 1 - 0.16 * t;
  if (d.z < 0) z = HC.z + (z - HC.z) * (1 - 0.3 * t);
  // the cranium is a touch fuller at the back
  if (d.z < 0) z -= 0.006 * sst(0.16, 0.26, y) * -d.z;
  if (face) {
    const w = sst(0.05, 0.5, d.z), ax = Math.abs(x);
    let dz = 0;
    dz -= 0.0085 * G2(ax, y, EYE.x, EYE.y, 0.021, 0.0125);        // eye sockets
    dz += 0.0034 * G2(ax, y, 0.035, 0.2245, 0.024, 0.0065);       // brow ridge
    dz += 0.0028 * G2(x, y, 0, 0.221, 0.011, 0.012);              // between the brows
    dz += 0.0046 * G2(ax, y, 0.047, 0.176, 0.017, 0.015);         // cheekbones
    dz += 0.0062 * G2(x, y, 0, 0.145, 0.029, 0.021);              // the muzzle around the mouth
    dz -= 0.0022 * G2(ax, y, 0.031, 0.152, 0.0055, 0.018);        // smile lines
    dz -= 0.0085 * G2(x, y, 0, 0.1365, 0.0225, 0.0105);           // the mouth recess the lips sit in
    dz -= 0.0016 * G2(x, y, 0, 0.1535, 0.0035, 0.0055);           // philtrum
    dz -= 0.0022 * G2(x, y, 0, 0.12, 0.016, 0.0045);              // the dip under the lower lip
    dz += 0.0058 * G2(x, y, 0, 0.104, 0.019, 0.0135);             // chin
    z += dz * w;
    x -= 0.0028 * G2(ax, y, 0.084, 0.215, 0.02, 0.03) * Math.sign(x);   // temples
  }
  return out.set(x, y, z);
}

// paint a geometry with a per-vertex colour function → the attributes the merge expects
function paintFn(geo, fn, emit = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), em = new Float32Array(n), c = [1, 1, 1];
  for (let i = 0; i < n; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c, i); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; em[i] = emit; c[0] = c[1] = c[2] = 1; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.BufferAttribute(em, 1));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const flat = hex => { const k = new THREE.Color(hex); return (x, y, z, c) => { c[0] = k.r; c[1] = k.g; c[2] = k.b; }; };
function merge(list) {
  const names = ["position", "normal", "uv", "color", "aEmit"];
  const out = new THREE.BufferGeometry();
  const total = list.reduce((s, g) => s + g.attributes.position.count, 0);
  for (const nm of names) {
    const size = list[0].attributes[nm].itemSize, arr = new Float32Array(total * size);
    let off = 0; for (const g of list) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
// mirror a painted, non-indexed geometry left↔right (and keep its triangles facing out)
function mirrorX(src) {
  const g = src.clone(), p = g.attributes.position, nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); nr.setX(i, -nr.getX(i)); }
  for (const nm of ["position", "normal", "uv", "color", "aEmit"]) {
    const a = g.attributes[nm], s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v; }
  }
  return g;
}
// a tube along points, its radius following rad(u), flattened front-to-back by fz, with rounded ends
function tube(pts, rad, fz = 1, seg = 24, rs = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, rs, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg; curve.getPointAt(u, c); const r = rad(u);
    for (let j = 0; j <= rs; j++) { const k = i * (rs + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r); v.z *= fz; p.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z); }
  }
  g.computeVertexNormals();
  const caps = [0, 1].map(u => { const q = curve.getPointAt(u); const s = new THREE.SphereGeometry(rad(u), 10, 8); s.scale(1, 1, fz); s.translate(q.x, q.y, q.z); return s; });
  return [g, ...caps];
}

function build() {
  const F = {}, v = new THREE.Vector3(), q = new THREE.Vector3();
  // ---- the head: one smooth sculpted surface, plus nose, ears and neck ----
  {
    const s = new THREE.SphereGeometry(1, 64, 52), p = s.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); skin(v, true, q); p.setXYZ(i, q.x, q.y, q.z); }
    s.computeVertexNormals();
    const head = paintFn(s, (x, y, z, c) => {
      const ax = Math.abs(x);
      const k = 1 - 0.1 * G2(ax, y, EYE.x, EYE.y + 0.002, 0.02, 0.014);                                 // shadowed sockets
      const blush = 0.55 * G2(ax, y, 0.05, 0.165, 0.02, 0.018), lips = 0.45 * G2(x, y, 0, MOUTH.y, 0.024, 0.012);
      const under = 1 - sst(0.09, 0.06, y) * 0.12;
      c[0] = k * under; c[1] = k * under * (1 - blush * 0.07 - lips * 0.12); c[2] = k * under * (1 - blush * 0.08 - lips * 0.12);
    });
    // the nose: one deformed ellipsoid — narrow bridge, rounded tip, flared wings, nostrils underneath
    const n = new THREE.SphereGeometry(1, 28, 22), np = n.attributes.position;
    for (let i = 0; i < np.count; i++) {
      v.fromBufferAttribute(np, i);
      const low = sst(0.35, -0.85, v.y);
      const wf = lerp(0.62, 1.7, low) * (1 + 0.25 * Math.exp(-(((v.y + 0.62) / 0.22) ** 2)));
      const x = v.x * 0.0108 * wf; let y = v.y * 0.03; let z = v.z * 0.0165 * lerp(0.6, 1.2, low);
      z += 0.006 * Math.exp(-(((v.y + 0.6) / 0.26) ** 2)) * Math.max(0, v.z) * (1 - Math.abs(v.x) * 0.6);   // the tip
      if (v.y < -0.72) y = -0.03 * 0.72 - (-v.y - 0.72) * 0.03 * 0.45;                                  // flat underside
      np.setXYZ(i, x, y + 0.181, z + 0.1035);
    }
    n.computeVertexNormals();
    const nose = paintFn(n, (x, y, z, c) => {
      const nx = x / 0.0138, ny = (y - 0.181) / 0.03;
      const nost = Math.exp(-(((Math.abs(nx) - 0.55) / 0.3) ** 2) - (((ny + 0.86) / 0.1) ** 2)) * sst(0.1, 0.122, z);
      const k = 1 - 0.62 * Math.min(1, nost * 1.4);
      const tip = 0.5 * Math.exp(-(((ny + 0.55) / 0.3) ** 2));
      c[0] = k; c[1] = k * (1 - tip * 0.06); c[2] = k * (1 - tip * 0.07);
    });
    // ears: a rim and a hollow
    const ear = side => {
      const e = new THREE.SphereGeometry(0.027, 18, 14), ep = e.attributes.position;
      for (let i = 0; i < ep.count; i++) { v.fromBufferAttribute(ep, i); const rim = Math.hypot(v.y / 0.027, v.z / 0.027); ep.setXYZ(i, v.x * 0.32 * (0.55 + 0.45 * rim), v.y * 1.05, v.z * 0.62); }
      e.rotateY(side * 0.25); e.translate(side * 0.0965, 0.191, -0.004); e.computeVertexNormals();
      return paintFn(e, (x, y, z, c) => { c[0] = 0.96; c[1] = 0.92; c[2] = 0.92; });
    };
    const neck = new THREE.CylinderGeometry(0.046, 0.055, 0.15, 24, 1, true); neck.translate(0, 0.048, -0.004);
    F.headHi = merge([head, nose, ear(-1), ear(1), paintFn(neck, flat(0xf2f2f2))]);
  }
  // ---- hair: a shell over the scalp with a soft hairline, fuller on top, strands in the colour ----
  const hairShell = long => {
    const s = new THREE.SphereGeometry(1, 72, 52), p = s.attributes.position, d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i); skin(d, true, q);
      const ph = Math.atan2(d.x, d.z), a = Math.abs(ph) / Math.PI;
      let H = 0.263 - 0.07 * sst(0.1, 0.48, a) - 0.08 * sst(0.55, 1.0, a) + 0.003 * Math.sin(ph * 9);
      if (long) H -= 0.05 * sst(0.45, 0.9, a);
      const m = sst(H - 0.02, H + 0.012, q.y);
      const full = 0.0055 + 0.0075 * sst(0.235, 0.315, q.y) + 0.003 * sst(0.6, 1, a);
      const th = -0.0045 + (0.0045 + full) * sst(0, 1, m);
      q.x += d.x * th; q.y += d.y * th * 0.9; q.z += d.z * th;
      p.setXYZ(i, q.x, q.y, q.z);
    }
    s.computeVertexNormals();
    const out = [paintFn(s, (x, y, z, c) => { const ph = Math.atan2(x, z); const k = 0.86 + 0.1 * Math.sin(ph * 70 + y * 40) * Math.sin(ph * 23) + 0.06 * sst(0.2, 0.3, y); c[0] = c[1] = c[2] = k; })];
    if (long) {
      // the fall down the back: a curtain of hair to the shoulders, with an inner face
      const f = new THREE.CylinderGeometry(1, 1, 1, 48, 16, true, 1.05, Math.PI * 2 - 2.1), fp = f.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        v.fromBufferAttribute(fp, i); const t = v.y + 0.5;
        const rx = lerp(0.112, 0.105, t) + 0.006 * Math.sin(v.x * 9) * (1 - t), rz = lerp(0.09, 0.118, t);
        fp.setXYZ(i, v.x * rx, lerp(0.02, 0.21, t), v.z * rz - 0.004 - (1 - t) * 0.03);
      }
      f.computeVertexNormals();
      out.push(paintFn(f, (x, y, z, c) => { const k = 0.82 + 0.07 * Math.sin(Math.atan2(x, z) * 60); c[0] = c[1] = c[2] = k; }));
      const fi = f.clone(); fi.scale(0.97, 1, 0.97);
      const a = fi.index.array; for (let t = 0; t < a.length; t += 3) { const tmp = a[t + 1]; a[t + 1] = a[t + 2]; a[t + 2] = tmp; }
      fi.computeVertexNormals();
      out.push(paintFn(fi, flat(0x6a6a6a)));
    }
    return merge(out);
  };
  F.hairHi = hairShell(false);
  F.hairLHi = hairShell(true);
  // ---- beards: shells on the sculpted jaw, each style its own mask ----
  const beard = (mask, thick) => {
    const s = new THREE.SphereGeometry(1, 64, 52), p = s.attributes.position, d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i); skin(d, true, q);
      const m = mask(q.x, q.y, q.z, d);
      const th = -0.003 + (0.003 + thick) * sst(0, 1, m);
      q.x += d.x * th; q.y += d.y * th * 0.6; q.z += d.z * th;
      p.setXYZ(i, q.x, q.y, q.z);
    }
    s.computeVertexNormals();
    return merge([paintFn(s, (x, y, z, c) => { const k = 0.85 + 0.12 * Math.sin(x * 900 + y * 300) * Math.sin(y * 700); c[0] = c[1] = c[2] = k; })]);
  };
  const mouthHole = (x, y) => sst(1.0, 1.35, (x / 0.0275) ** 2 + ((y - MOUTH.y + 0.001) / 0.0105) ** 2);
  const stache = (x, y) => sst(0.03, 0.024, Math.abs(x)) * sst(MOUTH.y + 0.003, MOUTH.y + 0.007, y) * sst(MOUTH.y + 0.0175, MOUTH.y + 0.0135, y);
  const jawMask = (x, y, z, d) => {
    const a = Math.abs(Math.atan2(d.x, d.z)) / Math.PI;
    const top = lerp(0.151, 0.19, sst(0.22, 0.42, a));
    return sst(top + 0.01, top - 0.02, y) * sst(0.72, 0.52, a) * sst(0.04, 0.075, y);
  };
  F.beardFull = beard((x, y, z, d) => Math.max(jawMask(x, y, z, d) * mouthHole(x, y), stache(x, y)), 0.0085);
  F.beardStubble = beard((x, y, z, d) => Math.max(jawMask(x, y, z, d) * mouthHole(x, y), stache(x, y)), 0.0011);
  F.beardGoatee = beard((x, y, z, d) => { const g = G2(x, y, 0, 0.117, 0.015, 0.016); return Math.max(sst(0.35, 0.65, g) * mouthHole(x, y) * sst(0.2, 0.5, d.z), stache(x, y)); }, 0.0045);
  F.beardMus = beard((x, y, z, d) => stache(x, y) * sst(0.3, 0.5, d.z), 0.0062);
  // ---- eyes: eyeball, a ringed iris with its pupil, a catchlight, an upper lid with lashes, a lower lid ----
  F.eyeW = merge([paintFn(new THREE.SphereGeometry(EYE.r, 28, 20), (x, y, z, c) => { const e = sst(0.2, 0.9, z / EYE.r); c[0] = lerp(0.82, 1, e); c[1] = lerp(0.72, 0.98, e); c[2] = lerp(0.72, 0.96, e); })]);
  {
    const IR = 0.0051, th = Math.asin(IR / 0.0129);
    const s = new THREE.SphereGeometry(0.01295, 32, 10, 0, Math.PI * 2, 0, th); s.rotateX(Math.PI / 2);
    F.iris = merge([paintFn(s, (x, y, z, c) => {
      const r = Math.hypot(x, y) / IR;
      if (r < 0.36) { c[0] = c[1] = c[2] = 0.03; return; }                   // pupil
      const k = r > 0.86 ? lerp(1.0, 0.25, sst(0.86, 1, r)) : lerp(1.35, 0.95, sst(0.36, 0.8, r));
      const fleck = 1 + 0.12 * Math.sin(Math.atan2(y, x) * 26) * sst(0.4, 0.8, r);
      c[0] = c[1] = c[2] = k * fleck;
    })]);
    const gl = new THREE.CircleGeometry(0.0013, 10); gl.translate(0.0024, 0.003, EYE.r + 0.0006);
    const gl2 = new THREE.CircleGeometry(0.0006, 8); gl2.translate(-0.002, -0.0022, EYE.r + 0.0006);
    F.glint = merge([paintFn(gl, flat(0xffffff)), paintFn(gl2, flat(0xbfc8d0))]);
    // upper lid: a skin shell hugging the eyeball, its rim darkened into a lash line
    const ul = new THREE.SphereGeometry(EYE.r * 1.1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    F.lid = merge([paintFn(ul, (x, y, z, c) => { const rim = sst(EYE.r * 0.22, 0, y) * sst(-0.2, 0.3, z / EYE.r); const k = lerp(1, 0.12, rim); c[0] = k; c[1] = k * (1 - rim * 0.05); c[2] = k * (1 - rim * 0.03); })]);
    const ll = new THREE.SphereGeometry(EYE.r * 1.08, 32, 6, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32);
    F.lidLow = merge([paintFn(ll, (x, y, z, c) => { const rim = sst(-EYE.r * 0.95, -EYE.r * 0.55, y); const k = lerp(1, 0.8, rim * 0.6 * sst(0, 0.5, z / EYE.r)); c[0] = k; c[1] = k * 0.96; c[2] = k * 0.95; })]);
  }
  // ---- brows: a tapered, arched band of hair (right; the left is its mirror) ----
  {
    const parts = tube([[-0.0185, -0.0012, 0.0016], [-0.0085, 0.0018, 0.0022], [0.003, 0.0032, 0.0012], [0.012, 0.0024, -0.0008], [0.0205, -0.0018, -0.0045]], u => lerp(0.0036, 0.0013, u) * (1 + 0.25 * Math.sin(u * Math.PI)), 0.42, 20, 8);
    F.browR = merge(parts.map(g => paintFn(g, (x, y, z, c) => { const k = 0.85 + 0.15 * Math.sin(x * 2200); c[0] = c[1] = c[2] = k; })));
    F.browL = mirrorX(F.browR);
  }
  // ---- lips: upper with a cupid's bow, fuller lower, each half from the middle out to the corner ----
  {
    const up = tube([[-0.0012, 0.0034, 0.0016], [0.0035, 0.0047, 0.0014], [0.0065, 0.0043, 0.0006], [0.012, 0.0031, -0.0008], [0.0185, 0.0013, -0.0026], [0.0236, -0.0002, -0.0044]], u => lerp(0.0029, 0.001, sst(0.05, 1, u)) * (u < 0.12 ? 0.9 : 1), 0.7, 26, 12);
    const lo = tube([[-0.0012, -0.0039, 0.0021], [0.006, -0.0042, 0.0015], [0.0125, -0.0035, 0.0], [0.0185, -0.0019, -0.0022], [0.0236, -0.0003, -0.0044]], u => lerp(0.0039, 0.001, sst(0.05, 1, u)), 0.72, 26, 12);
    const lipCol = (x, y, z, c) => { const k = (0.92 + sst(0.0, 0.0035, z) * 0.12) * lerp(1, 0.62, sst(0.014, 0.024, Math.abs(x))); c[0] = k; c[1] = k * 0.97; c[2] = k * 0.97; };
    F.lipUR = merge(up.map(g => paintFn(g, lipCol))); F.lipUL = mirrorX(F.lipUR);
    F.lipLR = merge(lo.map(g => paintFn(g, lipCol))); F.lipLL = mirrorX(F.lipLR);
  }
  // ---- inside the mouth: the dark cavity, upper teeth with their gum, lower teeth with the tongue ----
  {
    const cav = new THREE.SphereGeometry(0.021, 28, 16); cav.scale(1.12, 0.62, 0.22); cav.translate(0, 0, -0.0085);
    F.mouth = merge([paintFn(cav, (x, y, z, c) => { const k = sst(-0.014, -0.0065, z); c[0] = lerp(0.07, 0.32, k); c[1] = lerp(0.015, 0.08, k); c[2] = lerp(0.02, 0.09, k); })]);
    const row = upper => {
      const out = [], R = 0.026, n = 10;
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2, a = k * 0.155, ak = Math.abs(k);
        const w = ak < 1 ? 0.0052 : ak < 2 ? 0.0043 : ak < 3 ? 0.0041 : 0.0042, h = upper ? (ak < 1 ? 0.0074 : ak < 2 ? 0.0064 : ak < 3 ? 0.0068 : 0.006) : (ak < 2 ? 0.0056 : 0.0052);
        const t = new THREE.CapsuleGeometry(w * 0.48, Math.max(0.0005, h - w * 0.9), 4, 10); t.scale(1, 1, 0.55);
        if (ak >= 2 && ak < 3) { const tp = t.attributes.position; for (let j = 0; j < tp.count; j++) { const yy = tp.getY(j) * (upper ? -1 : 1); if (yy > 0) tp.setX(j, tp.getX(j) * (1 - yy / h * 0.9)); } }   // canines come to a point
        t.translate(0, upper ? -h / 2 : h / 2, 0); t.rotateY(a); t.translate(Math.sin(a) * R, upper ? 0.0083 : -0.0081, Math.cos(a) * R - R - 0.0034);
        t.computeVertexNormals();
        out.push(paintFn(t, (x, y, z, c) => { const kk = lerp(0.97, 0.78, Math.min(1, ak / 4.5)); c[0] = kk; c[1] = kk * 0.985; c[2] = kk * 0.93; }));
      }
      const gum = []; for (let i = 0; i <= 10; i++) { const a = (i / 10 - 0.5) * 1.6; gum.push([Math.sin(a) * R, upper ? 0.0088 : -0.0086, Math.cos(a) * R - R - 0.0042]); }
      for (const g of tube(gum, () => 0.0026, 0.8, 24, 8)) out.push(paintFn(g, flat(0xd8737c)));
      return out;
    };
    F.teethU = merge(row(true));
    const tg = new THREE.SphereGeometry(0.0148, 28, 16), tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) { v.fromBufferAttribute(tp, i); v.y *= 0.4; if (v.y > 0) v.y -= 0.0018 * Math.exp(-((v.x / 0.004) ** 2)); tp.setXYZ(i, v.x * 1.05, v.y, v.z * 1.15); }
    tg.scale(0.9, 0.85, 0.9); tg.translate(0, -0.0105, -0.021); tg.computeVertexNormals();
    F.teethL = merge([...row(false), paintFn(tg, (x, y, z, c) => { const groove = Math.exp(-((x / 0.003) ** 2)) * 0.15; const tip = sst(-0.01, 0.0, z) * 0.12; c[0] = 0.66 - groove + tip; c[1] = 0.24 - groove * 0.5 + tip * 0.2; c[2] = 0.27 - groove * 0.5 + tip * 0.2; })]);
  }
  return F;
}
export const FACE = build();
export const BEARD_KIND = { full: "beardFull", goatee: "beardGoatee", mustache: "beardMus", stubble: "beardStubble" };
// which colour each face part takes from the person (a key into the look, or a fixed colour)
export const FACE_COLOR = { headHi: "skin", hairHi: "hair", hairLHi: "hair", eyeW: 0xf4f0ea, iris: "iris", glint: 0xffffff, lid: "skin", lidLow: "skin", browR: "browCol", browL: "browCol",
  lipUR: "lipCol", lipUL: "lipCol", lipLR: "lipCol", lipLL: "lipCol", mouth: 0xffffff, teethU: 0xffffff, teethL: 0xffffff,
  beardFull: "beardTint", beardGoatee: "beardTint", beardMus: "beardTint", beardStubble: "beardTint" };
// how each part is shaded
export const FACE_MAT = { headHi: "skin", lid: "skin", lidLow: "skin", hairHi: "hair", hairLHi: "hair", browR: "hair", browL: "hair", beardFull: "hair", beardGoatee: "hair", beardMus: "hair", beardStubble: "hair",
  eyeW: "eye", iris: "eye", glint: "glint", lipUR: "lip", lipUL: "lip", lipLR: "lip", lipLL: "lip", mouth: "wet", teethU: "wet", teethL: "wet" };
export function faceMaterials() {
  return {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52 }),
    hair: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }),
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, envMapIntensity: 1.4 }),
    glint: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    lip: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32 }),
    wet: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24 }),
  };
}

// ---------------------------------------------------------------------------------------------
// expressions: brow tilt (+ knits the inner ends down: anger; − lifts them: worry), brow raise,
// upper lid opening (1 normal, <1 squint, >1 wide), lower lid lift (the cheeks pushing up in a smile),
// mouth curve (+ smile, − frown), mouth open, mouth width, sneer (the upper lip lifting)
export const EXPR = {
  neutral:   { tilt: 0.02, raise: 0, eye: 1, lower: 0.1, curve: 0.06, open: 0, wide: 1, sneer: 0 },
  happy:     { tilt: -0.06, raise: 0.0012, eye: 0.82, lower: 0.65, curve: 0.85, open: 0.22, wide: 1.1, sneer: 0.25 },
  laugh:     { tilt: -0.1, raise: 0.0025, eye: 0.42, lower: 1, curve: 1, open: 0.85, wide: 1.16, sneer: 0.4 },
  sad:       { tilt: -0.55, raise: 0.0015, eye: 0.7, lower: 0.15, curve: -0.75, open: 0, wide: 0.94, sneer: 0 },
  mad:       { tilt: 0.55, raise: -0.0035, eye: 0.82, lower: 0.45, curve: -0.45, open: 0.32, wide: 1.06, sneer: 0.75 },
  annoyed:   { tilt: 0.24, raise: -0.0018, eye: 0.62, lower: 0.25, curve: -0.3, open: 0, wide: 0.96, sneer: 0.15 },
  surprised: { tilt: -0.14, raise: 0.0075, eye: 1.28, lower: 0, curve: 0.08, open: 0.55, wide: 0.88, sneer: 0 },
  shocked:   { tilt: -0.28, raise: 0.0095, eye: 1.4, lower: 0, curve: -0.25, open: 1, wide: 0.92, sneer: 0.2 },
  scared:    { tilt: -0.6, raise: 0.0065, eye: 1.32, lower: 0.1, curve: -0.6, open: 0.6, wide: 1.12, sneer: 0.3 },
  flirty:    { tilt: 0.0, raise: 0.0015, eye: 0.74, lower: 0.5, curve: 0.6, open: 0.04, wide: 1.0, sneer: 0, wink: 1 },
  smug:      { tilt: 0.12, raise: 0.0008, eye: 0.72, lower: 0.35, curve: 0.4, open: 0, wide: 1.0, sneer: 0, smirk: 1 },
  disgusted: { tilt: 0.38, raise: -0.002, eye: 0.62, lower: 0.6, curve: -0.6, open: 0.12, wide: 1.0, sneer: 1 },
  pain:      { tilt: 0.5, raise: -0.003, eye: 0.15, lower: 0.8, curve: -0.55, open: 0.42, wide: 1.15, sneer: 0.8 },
  out:       { tilt: 0, raise: 0, eye: 0.04, lower: 0.2, curve: -0.1, open: 0.28, wide: 1, sneer: 0 },
};
export const IRIS = [0x4a2c16, 0x5a3a1e, 0x3a2412, 0x3a6a92, 0x4f7a3e, 0x6a5428, 0x2e2420, 0x6a8eaa, 0x7a5a30];
const KEYS = ["tilt", "raise", "eye", "lower", "curve", "open", "wide", "sneer"];

// a face's live state, eased toward its expression; talk makes the jaw and lips work through syllables
export function newFace(seed = Math.random()) {
  return { expr: "neutral", base: "neutral", hold: 0, talk: 0, blinkT: 1 + seed * 4, blink: 0, seed, gx: 0, gy: 0, tgx: 0, tgy: 0, sacT: 0, look: null,
    open: 0, wide: 1, raise: 0, eyeL: 1, eyeR: 1, cur: { ...EXPR.neutral, wink: 0, smirk: 0 } };
}
export function setExpr(f, name, secs = 3) { if (!EXPR[name]) return; f.expr = name; f.hold = secs; }
export function tickFace(f, dt, t) {
  if (f.hold > 0) f.hold -= dt; else f.expr = f.base;
  if (f.talk > 0) f.talk = Math.max(0, f.talk - dt);
  const tg = EXPR[f.expr] || EXPR.neutral, c = f.cur, k = 1 - Math.exp(-dt * 10);
  for (const key of KEYS) c[key] += ((tg[key] ?? EXPR.neutral[key]) - c[key]) * k;
  c.wink += ((tg.wink || 0) - c.wink) * k; c.smirk += ((tg.smirk || 0) - c.smirk) * k;
  // blinks every few seconds (more when scared), now and then a double blink
  f.blinkT -= dt;
  if (f.blinkT <= 0) { f.blink = 0.15; const rr = ((f.seed * 997 + t * 13.37) % 1); f.blinkT = rr < 0.15 ? 0.25 : (f.expr === "scared" ? 1.0 : 2.4) + rr * 3.5; }
  if (f.blink > 0) f.blink -= dt;
  const bl = f.blink > 0 ? Math.sin(Math.min(1, (0.15 - f.blink) / 0.15) * Math.PI) : 0;
  // the eyes dart about a little, or hold on whoever they're looking at
  f.sacT -= dt;
  if (f.look) { f.tgx = f.look.x; f.tgy = f.look.y; }
  else if (f.sacT <= 0) { const rr = ((f.seed * 7919 + t * 3.1) % 1); f.sacT = 0.5 + rr * 2.2; f.tgx = (rr - 0.5) * 0.32; f.tgy = (((rr * 37) % 1) - 0.45) * 0.14; }
  const gk = 1 - Math.exp(-dt * 22); f.gx += (f.tgx - f.gx) * gk; f.gy += (f.tgy - f.gy) * gk;
  // speech: syllables open the jaw, vowels change the width, the brows flick on stressed words
  let chat = 0, vw = 0, flick = 0;
  if (f.talk > 0) {
    const s = t * 13 + f.seed * 9, env = 0.55 + 0.45 * Math.sin(t * 2.3 + f.seed) ** 2;
    chat = Math.max(0, Math.sin(s) * 0.6 + Math.sin(s * 1.73 + 1) * 0.4) * env * Math.min(1, f.talk * 3);
    vw = Math.sin(s * 0.61 + 2) * 0.12;
    flick = Math.max(0, Math.sin(t * 1.7 + f.seed * 5)) ** 6;
  }
  f.open = Math.min(1, c.open + chat * 0.62);
  f.wide = c.wide + vw;
  f.raise = c.raise + flick * 0.0022;
  f.eyeL = Math.max(0.03, c.eye * (1 - c.wink * 0.94) * (1 - bl));
  f.eyeR = Math.max(0.03, c.eye * (1 - bl));
  return f;
}

// write every face part's world matrix for one head: emit(part, matrix, slot) — slot 0/1 = left/right
// opts: { head: draw the sculpted head too, hair: "hairHi" | "hairLHi" | null, beard: part or null }
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function local(x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) { return _b.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz)); }
export function faceMatrices(head, f, opts, emit) {
  const c = f.cur;
  if (opts.head) emit("headHi", head, 0);
  if (opts.hair) emit(opts.hair, head, 0);
  for (const side of [-1, 1]) {
    const L = side < 0, open = L ? f.eyeL : f.eyeR, slot = L ? 0 : 1;
    const ex = side * EYE.x, yaw = side * 0.06;
    emit("eyeW", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, 0, yaw, 0, 1.2, 1, 1)), slot);
    emit("iris", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, -f.gy, yaw + f.gx, 0)), slot);
    emit("glint", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, 0, yaw, 0)), slot);
    // upper lid: tucked back when wide, over the top of the iris when relaxed, right down for a blink
    const lidA = open >= 1 ? lerp(-0.42, -0.85, Math.min(1, (open - 1) / 0.4)) : lerp(1.58, -0.42, open);
    emit("lid", _a.copy(head).multiply(local(ex, EYE.y + 0.0004, EYE.z - 0.0004, lidA, yaw + f.gx * 0.25, side * -0.04, 1.2, 1, 1)), slot);
    const low = c.lower + (f.blink > 0 ? 0.3 : 0);
    emit("lidLow", _a.copy(head).multiply(local(ex, EYE.y - 0.0003, EYE.z - 0.0003, -(0.08 + low * 0.55), yaw, 0, 1.2, 1, 1)), slot);
    // brows: inner ends knit down for anger, lift for worry; a smirk or a wink cocks one
    const br = f.raise + (L ? 0 : c.smirk * 0.0035) - (L ? c.wink * 0.0015 : 0) + Math.max(0, open - 1) * 0.004;
    emit(L ? "browL" : "browR", _a.copy(head).multiply(local(side * BROW.x, BROW.y + br, BROW.z + Math.max(0, c.tilt) * 0.0012, 0, side * 0.12, (L ? -1 : 1) * (c.tilt * 0.7) + (L ? 0.03 : -0.03))), 0);
  }
  // mouth: the jaw drops (lower lip, lower teeth, tongue), the corners lift or fall, the upper lip sneers
  const open = f.open, drop = open * 0.0165, wide = f.wide, curve = c.curve, sneer = c.sneer;
  emit("mouth", _a.copy(head).multiply(local(0, MOUTH.y - drop * 0.45, MOUTH.z, 0, 0, 0, wide * (1 + open * 0.08), 0.06 + open * 1.08, 1)), 0);
  emit("teethU", _a.copy(head).multiply(local(0, MOUTH.y, MOUTH.z, 0, 0, 0, 0.96 + (wide - 1) * 0.3, 1, 1)), 0);
  emit("teethL", _a.copy(head).multiply(local(0, MOUTH.y - drop, MOUTH.z - drop * 0.25, -open * 0.12, 0, 0, 0.96 + (wide - 1) * 0.3, 1, 1)), 0);
  for (const side of [-1, 1]) {
    const L = side < 0, cv = curve + (L ? 0 : c.smirk * 0.7);
    const a = cv * 0.34 * (L ? -1 : 1);
    const upY = MOUTH.y + open * 0.0016 + sneer * 0.0018 * (0.5 + (L ? 0 : c.smirk * 0.5)) + Math.max(0, cv) * 0.0006;
    emit(L ? "lipUL" : "lipUR", _a.copy(head).multiply(local(0, upY, MOUTH.z, -open * 0.1, 0, a, wide, 1 - open * 0.15, 1)), 0);
    emit(L ? "lipLL" : "lipLR", _a.copy(head).multiply(local(0, MOUTH.y - drop - Math.max(0, cv) * 0.0006, MOUTH.z - drop * 0.4, open * 0.25, 0, a * 0.85, wide, 1 - open * 0.1, 1)), 0);
  }
  if (opts.beard) emit(opts.beard, head, 0);
}
