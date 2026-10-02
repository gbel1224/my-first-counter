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
export const HAIRSTYLES = ["crop", "side", "buzz", "afro", "long", "bob", "bun", "pony"];
const NOSE_ROOT = { y: 0.19, z: 0.104 };

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
    // ears: a curled helix rim round a hollow bowl, a soft lobe at the bottom
    const ear = side => {
      const e = new THREE.SphereGeometry(1, 28, 22), ep = e.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        v.fromBufferAttribute(ep, i);
        const yy = v.y, zz = v.z, rad = Math.hypot(yy, zz), out = v.x > 0 ? 1 : -1;
        let w = 0.0045 * Math.abs(v.x);
        if (out > 0) w += 0.0045 * sst(0.72, 0.95, rad) - 0.003 * (1 - sst(0.25, 0.7, rad)) * sst(-0.6, 0.2, yy);     // rim raised, bowl hollow
        const lobe = yy < -0.55 ? 1 + 0.25 * sst(-0.55, -1, yy) : 1;
        ep.setXYZ(i, out * Math.max(0.0012, w), yy * 0.031 * lobe - (yy < 0 ? 0.002 : 0), zz * 0.019 * (yy > 0 ? 1.05 : 0.85 + 0.15 * (1 + yy)));
      }
      e.computeVertexNormals(); if (side < 0) e.scale(-1, 1, 1);
      if (side < 0) { const ix = e.index.array; for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; } e.computeVertexNormals(); }
      e.scale(0.75, 0.86, 0.86); e.rotateY(side * 0.1); e.rotateZ(side * -0.06); e.translate(side * 0.0935, 0.188, -0.008);
      return paintFn(e, (x, y, z, c) => { const k = 0.93 + 0.05 * sst(0.0, 0.004, Math.abs(Math.abs(x) - 0.0935)); c[0] = k; c[1] = k * 0.9; c[2] = k * 0.9; });
    };
    const neck = new THREE.CylinderGeometry(0.046, 0.055, 0.15, 24, 1, true); neck.translate(0, 0.048, -0.004);
    F.headHi = merge([head, ear(-1), ear(1), paintFn(neck, flat(0xf2f2f2))]);
    F.nose = merge([nose]);
    // the apples of the cheeks: soft pads that ride up and out when someone smiles
    const ck = side => { const g = new THREE.SphereGeometry(0.019, 18, 14); g.scale(1.15, 0.8, 0.62); g.translate(side * 0.045, 0.171, 0.0865); g.computeVertexNormals(); return paintFn(g, (x, y, z, c) => { c[0] = 1; c[1] = 0.955; c[2] = 0.95; }); };
    F.cheeks = merge([ck(-1), ck(1)]);
  }
  // ---- hair: an under-layer shell over the scalp, then hundreds of strand cards combed over it ----
  const noise3 = (x, y, z) => Math.sin(x * 1.7 + Math.sin(y * 2.3)) * Math.sin(y * 1.9 + Math.sin(z * 2.9)) * Math.sin(z * 2.1 + Math.sin(x * 3.1));
  // where the hair sits over a point of the scalp (direction d), and how much hair is there (m)
  const shellAt = (d, style, out = new THREE.Vector3()) => {
    skin(d, true, out);
    const ph = Math.atan2(d.x, d.z), a = Math.abs(ph) / Math.PI;
    let H = 0.263 - 0.07 * sst(0.1, 0.48, a) - 0.08 * sst(0.55, 1.0, a) + 0.003 * Math.sin(ph * 9);
    let full = 0.0045 + 0.006 * sst(0.235, 0.315, out.y) + 0.003 * sst(0.6, 1, a);
    if (style === "side") { H += 0.006 * Math.sin(ph) * sst(0.4, 0, a); full += 0.004 * sst(0.2, 0.32, out.y) * (0.6 + 0.4 * Math.sin(ph + 0.6)); }
    if (style === "buzz") { H += 0.004; full = 0.0016; }
    if (style === "afro") { H -= 0.004; full = (0.016 + 0.013 * sst(0.2, 0.31, out.y)) * (1 + 0.12 * noise3(d.x * 30, d.y * 30, d.z * 30)); }
    if (style === "long" || style === "bob") H -= 0.05 * sst(0.45, 0.9, a);
    if (style === "bob") full += 0.003 * sst(0.3, 0.6, a);
    if (style === "bun" || style === "pony") { H += 0.004; full = 0.0028 + 0.002 * sst(0.25, 0.31, out.y); }
    const m = sst(H - 0.02, H + 0.012, out.y);
    const th = -0.0045 + (0.0045 + full) * sst(0, 1, m);
    out.x += d.x * th; out.y += d.y * th * 0.9; out.z += d.z * th;
    return { q: out, m, a, ph, H };
  };
  const dirOf = (p, out = new THREE.Vector3()) => out.set(p.x / HR.x, (p.y - HC.y) / HR.y, (p.z - HC.z) / HR.z).normalize();
  const normOf = (d, out = new THREE.Vector3()) => out.set(d.x / HR.x, d.y / HR.y, d.z / HR.z).normalize();
  const hairShell = style => {
    const s = new THREE.SphereGeometry(1, 72, 54), p = s.attributes.position, d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(p, i); const r = shellAt(d, style, q); p.setXYZ(i, r.q.x, r.q.y, r.q.z); }
    s.computeVertexNormals();
    // the under-layer is darker: it's the dense hair the strands lie on top of
    const out = [paintFn(s, (x, y, z, c) => { const k = style === "buzz" ? 0.72 : style === "afro" ? 0.8 : 0.58; c[0] = c[1] = c[2] = k; })];
    if (style === "bun") { const b = new THREE.SphereGeometry(0.034, 20, 16), bp = b.attributes.position; for (let i = 0; i < bp.count; i++) { v.fromBufferAttribute(bp, i); const k = 1 + 0.08 * Math.sin(Math.atan2(v.x, v.z) * 7 + v.y * 90); bp.setXYZ(i, v.x * k, v.y * 0.85, v.z * k); } b.translate(0, 0.292, -0.078); b.computeVertexNormals(); out.push(paintFn(b, flat(0x8a8a8a))); }
    if (style === "pony") { const tie = new THREE.TorusGeometry(0.013, 0.0035, 8, 18); tie.rotateX(0.9); tie.translate(0, 0.258, -0.104); out.push(paintFn(tie, flat(0x303030))); }
    return merge(out);
  };
  for (const st of HAIRSTYLES) F["hair_" + st] = hairShell(st);

  // strand cards: thin strips with a strand texture (see-through between the hairs), laid along the
  // way the hair is combed; each vertex knows how far it is from the root, so the tips can blow in the wind
  const cardSet = () => ({ pos: [], nrm: [], uv: [], col: [], dir: [] });
  const strip = (S, pts, nrms, dirs, width, u0, shade) => {
    const n = pts.length, side = new THREE.Vector3(), P = [], Q = [];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), w = width * (1 - 0.45 * t);
      side.crossVectors(dirs[k], nrms[k]).normalize().multiplyScalar(w / 2);
      P.push(pts[k].clone().sub(side)); Q.push(pts[k].clone().add(side));
    }
    for (let k = 0; k < n - 1; k++) {
      const t0 = k / (n - 1), t1 = (k + 1) / (n - 1);
      const quad = [[P[k], 0, t0, k], [Q[k], 1, t0, k], [Q[k + 1], 1, t1, k + 1], [P[k], 0, t0, k], [Q[k + 1], 1, t1, k + 1], [P[k + 1], 0, t1, k + 1]];
      for (const [pt, uu, vv, kk] of quad) {
        S.pos.push(pt.x, pt.y, pt.z); S.nrm.push(nrms[kk].x, nrms[kk].y, nrms[kk].z); S.uv.push(u0 + uu * 0.24, vv);
        S.col.push(shade, shade, shade); S.dir.push(dirs[kk].x, dirs[kk].y, dirs[kk].z);
      }
    }
  };
  const cardGeo = S => {
    const g = new THREE.BufferGeometry(), n = S.pos.length / 3;
    g.setAttribute("position", new THREE.Float32BufferAttribute(S.pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(S.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(S.uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(S.col, 3));
    g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(n), 1)); g.setAttribute("aDir", new THREE.Float32BufferAttribute(S.dir, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  let seed = 9871; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fib = (n, k) => { const y = 1 - (k + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = k * 2.399963; return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r); };
  const crown = new THREE.Vector3(0, 0.31, -0.03), DOWN = new THREE.Vector3(0, -1, 0);
  // which way the hair is combed at a point, for each style
  const flow = (style, q, n, a, ph, out) => {
    const v = out;
    if (style === "crop" || style === "afro" || style === "buzz") { v.copy(q).sub(crown).normalize(); v.lerp(DOWN, sst(0.3, 0.75, a) * 0.6); }
    else if (style === "side") { const sg = ph > -0.45 ? 1 : -1; v.set(sg, -0.15, -0.3).normalize().lerp(DOWN, sst(0.3, 0.7, a) * 0.7); }
    else if (style === "long" || style === "bob") { v.set(Math.sign(q.x || 1) * 0.55, -1, -0.12).normalize(); }
    else { const B = style === "bun" ? [0, 0.285, -0.085] : [0, 0.262, -0.1]; v.set(B[0] - q.x, B[1] - q.y, B[2] - q.z).normalize(); }
    return v.sub(n.clone().multiplyScalar(v.dot(n))).normalize();
  };
  const STYLE_CARDS = {
    crop: { n: 460, len: [0.026, 0.044], seg: 5, w: [0.008, 0.012], lift: 0.0022 }, side: { n: 460, len: [0.036, 0.062], seg: 6, w: [0.009, 0.013], lift: 0.0026 },
    afro: { n: 520, len: [0.009, 0.015], seg: 3, w: [0.008, 0.012], lift: 0.0025, curly: true }, long: { n: 300, len: [0.07, 0.11], seg: 7, w: [0.012, 0.018], lift: 0.0026 },
    bob: { n: 300, len: [0.07, 0.1], seg: 7, w: [0.012, 0.018], lift: 0.0026 }, bun: { n: 320, len: [0.06, 0.1], seg: 6, w: [0.008, 0.012], lift: 0.0015 },
    pony: { n: 320, len: [0.06, 0.1], seg: 6, w: [0.008, 0.012], lift: 0.0015 },
  };
  const hairCards = style => {
    const cfg = STYLE_CARDS[style]; if (!cfg) return null;
    const S = cardSet(), d = new THREE.Vector3(), nn = new THREE.Vector3(), T = new THREE.Vector3(), tmp = new THREE.Vector3();
    const total = 2400; let made = 0;
    for (let k = 0; k < total && made < cfg.n; k++) {
      d.copy(fib(total, (k * 7 + 3) % total));
      const r0 = shellAt(d, style); if (r0.m < 0.75 || rnd() < 0.15) continue;
      const len = cfg.len[0] + rnd() * (cfg.len[1] - cfg.len[0]) * (style === "crop" && r0.q.y > 0.27 ? 1.2 : 1), seg = cfg.seg;
      const pts = [], nrms = [], dirs = [];
      let p = r0.q.clone(), dd = d.clone();
      for (let s = 0; s <= seg; s++) {
        const t = s / seg, r = shellAt(dd, style);
        normOf(dd, nn);
        if (cfg.curly) { T.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5); T.sub(nn.clone().multiplyScalar(T.dot(nn))).normalize(); }
        else flow(style, r.q, nn, r.a, r.ph, T);
        const lift = 0.0012 + cfg.lift * t;
        pts.push(r.q.clone().addScaledVector(nn, lift)); nrms.push(nn.clone()); dirs.push(T.clone());
        // step along the comb direction, then drop back onto the scalp
        tmp.copy(r.q).addScaledVector(T, len / seg); dirOf(tmp, dd);
        if (r.a < 0.3 && r.q.y < r.H - 0.012 && style !== "long" && style !== "bob") break;      // fringes stop at the brow
      }
      if (pts.length < 3) continue;
      strip(S, pts, nrms, dirs, cfg.w[0] + rnd() * (cfg.w[1] - cfg.w[0]), Math.floor(rnd() * 4) * 0.25, 0.9 + rnd() * 0.18);
      made++;
    }
    // long hair and bobs: layers of strands falling from the crown down past the shoulders
    if (style === "long" || style === "bob") {
      const bottom = style === "long" ? 0.0 : 0.105, flare = style === "long" ? 0.006 : 0.012, drop = style === "long" ? 0.03 : 0.004;
      for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 46; i++) {
        const th = 1.45 + (i + rnd() * 0.8) / 46 * (Math.PI * 2 - 2.9), pts = [], nrms = [], dirs = [];
        const seg = 9, out = 0.004 + layer * 0.004;
        for (let s = 0; s <= seg; s++) {
          const t = 1 - s / seg, wave = 0.004 * Math.sin(th * 11 + t * 6 + layer) * (1 - t);
          // the strands come out from under the hair on the crown, curve over the head and fall
          const top = sst(0.75, 1, t), rx = lerp(0.112 + flare, 0.105, t) * (1 - top * 0.12) + wave + out, rz = lerp(0.09 + flare * 0.6, 0.118, t) * (1 - top * 0.12) + wave + out;
          pts.push(new THREE.Vector3(Math.sin(th) * rx, lerp(bottom - rnd() * 0.012, 0.262, t), Math.cos(th) * rz - 0.004 - (1 - t) * drop));
          nrms.push(new THREE.Vector3(Math.sin(th), 0, Math.cos(th))); dirs.push(new THREE.Vector3(0, -1, 0));
        }
        strip(S, pts, nrms, dirs, 0.02 + rnd() * 0.012, Math.floor(rnd() * 4) * 0.25, 0.86 + rnd() * 0.18);
      }
    }
    // the ponytail: a sheaf of strands from the tie, swinging down the back
    if (style === "pony") for (let i = 0; i < 26; i++) {
      const a0 = rnd() * Math.PI * 2, r0 = 0.004 + rnd() * 0.008, pts = [], nrms = [], dirs = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8, x = Math.cos(a0) * r0 * (1 + t) + 0.004 * t, y = lerp(0.258, 0.12, t), z = lerp(-0.105, -0.14, Math.sin(t * Math.PI / 2)) + Math.sin(a0) * r0 * (1 + t);
        pts.push(new THREE.Vector3(x, y, z)); nrms.push(new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0) - 0.6).normalize()); dirs.push(new THREE.Vector3(0, -1, -0.3 * (1 - t)).normalize());
      }
      strip(S, pts, nrms, dirs, 0.012 + rnd() * 0.006, Math.floor(rnd() * 4) * 0.25, 0.8 + rnd() * 0.3);
    }
    if (style === "bun") for (let i = 0; i < 40; i++) {
      const a0 = rnd() * Math.PI * 2, pts = [], nrms = [], dirs = [];
      for (let s = 0; s <= 5; s++) { const t = s / 5, ang = a0 + t * 2.4, y = 0.292 + (rnd() - 0.5) * 0.01; const r = 0.036; pts.push(new THREE.Vector3(Math.cos(ang) * r, y + Math.sin(t * 3) * 0.01, -0.078 + Math.sin(ang) * r)); nrms.push(new THREE.Vector3(Math.cos(ang), 0.2, Math.sin(ang)).normalize()); dirs.push(new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang))); }
      strip(S, pts, nrms, dirs, 0.012, Math.floor(rnd() * 4) * 0.25, 0.85 + rnd() * 0.25);
    }
    return cardGeo(S);
  };
  for (const st of HAIRSTYLES) { const g = hairCards(st); if (g) F["hairc_" + st] = g; }

  // ---- beards: a shell on the sculpted jaw, then short strand cards growing down over it ----
  const beardAt = (d, mask, thick, out = new THREE.Vector3()) => {
    skin(d, true, out);
    const m = mask(out.x, out.y, out.z, d);
    const clump = 1 + (thick > 0.003 ? 0.22 * Math.sin(d.x * 61 + Math.sin(d.y * 47)) * Math.sin(d.y * 53 + Math.sin(d.z * 37)) : 0);
    const th = -0.003 + (0.003 + thick * clump) * sst(0, 1, m);
    out.x += d.x * th; out.y += d.y * th * 0.6; out.z += d.z * th;
    return { q: out, m };
  };
  const beard = (mask, thick) => {
    const s = new THREE.SphereGeometry(1, 96, 76), p = s.attributes.position, d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(p, i); const r = beardAt(d, mask, thick, q); p.setXYZ(i, r.q.x, r.q.y, r.q.z); }
    s.computeVertexNormals();
    return merge([paintFn(s, (x, y, z, c) => { const k = thick > 0.003 ? 0.62 : 0.85 + 0.12 * Math.sin(x * 900 + y * 300) * Math.sin(y * 700); c[0] = c[1] = c[2] = k; })]);
  };
  const beardCards = (mask, thick, count, len, mus) => {
    const S = cardSet(), d = new THREE.Vector3(), nn = new THREE.Vector3(), T = new THREE.Vector3(), tmp = new THREE.Vector3();
    const total = 9000; let made = 0;
    for (let k = 0; k < total && made < count; k++) {
      d.copy(fib(total, (k * 13 + 5) % total)); if (d.z < -0.2) continue;
      const r0 = beardAt(d, mask, thick); if (r0.m < 0.6) continue;
      const pts = [], nrms = [], dirs = []; let dd = d.clone(); const L = len * (0.7 + rnd() * 0.6);
      for (let s = 0; s <= 3; s++) {
        const t = s / 3, r = beardAt(dd, mask, thick); normOf(dd, nn);
        const inStache = mus(r.q.x, r.q.y) > 0.5;
        T.set(inStache ? Math.sign(r.q.x || 1) * 0.55 : -Math.sign(r.q.x) * 0.18, -1, inStache ? 0.25 : 0.12);
        T.sub(nn.clone().multiplyScalar(T.dot(nn))).normalize();
        pts.push(r.q.clone().addScaledVector(nn, 0.0008 + 0.0025 * t)); nrms.push(nn.clone()); dirs.push(T.clone());
        tmp.copy(r.q).addScaledVector(T, L / 3); dirOf(tmp, dd);
      }
      strip(S, pts, nrms, dirs, 0.006 + rnd() * 0.004, Math.floor(rnd() * 4) * 0.25, 0.8 + rnd() * 0.35);
      made++;
    }
    return cardGeo(S);
  };
  // the mouth stays clear, but a full beard runs unbroken: sideburns to jaw to chin, round the corners of
  // the mouth into the mustache, and under the lower lip
  const mouthHole = (x, y) => sst(1.0, 1.3, (x / 0.0262) ** 2 + ((y - MOUTH.y + 0.0005) / 0.0082) ** 2);
  const stache = (x, y) => sst(0.033, 0.026, Math.abs(x)) * sst(MOUTH.y + 0.0025, MOUTH.y + 0.0065, y) * sst(MOUTH.y + 0.0175, MOUTH.y + 0.0135, y);
  const corners = (x, y) => sst(0.022, 0.027, Math.abs(x)) * sst(0.042, 0.034, Math.abs(x)) * sst(MOUTH.y + 0.016, MOUTH.y + 0.011, y);
  const jawMask = (x, y, z, d) => {
    const a = Math.abs(Math.atan2(d.x, d.z)) / Math.PI;
    const top = lerp(0.152, 0.205, sst(0.22, 0.44, a));
    return sst(top + 0.01, top - 0.018, y) * sst(0.74, 0.54, a) * sst(0.04, 0.075, y);
  };
  const fullMask = (x, y, z, d) => Math.max(jawMask(x, y, z, d) * mouthHole(x, y), stache(x, y), corners(x, y) * mouthHole(x, y) * sst(0.2, 0.5, d.z));
  const goateeMask = (x, y, z, d) => { const g = G2(x, y, 0, 0.12, 0.016, 0.018); return Math.max(sst(0.35, 0.65, g) * mouthHole(x, y) * sst(0.2, 0.5, d.z), stache(x, y), corners(x, y) * mouthHole(x, y) * sst(0.115, 0.13, y) * sst(0.2, 0.5, d.z)); };
  const musMask = (x, y, z, d) => stache(x, y) * sst(0.3, 0.5, d.z);
  F.beardFull = beard(fullMask, 0.0075);
  F.beardStubble = beard(fullMask, 0.0011);
  F.beardGoatee = beard(goateeMask, 0.0042);
  F.beardMus = beard(musMask, 0.0048);
  F.beardcFull = beardCards(fullMask, 0.0075, 520, 0.016, stache);
  F.beardcGoatee = beardCards(goateeMask, 0.0042, 170, 0.012, stache);
  F.beardcMus = beardCards(musMask, 0.0048, 90, 0.01, stache);
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
    // the lashes: a fringe of fine dark spikes along the front of the rim, curling up at the tips
    const lp = [], R = EYE.r * 1.1, N = 26;
    for (let k = 0; k < N; k++) {
      const p0 = -1.25 + (k / (N - 1)) * 2.5, p1 = p0 + 2.5 / (N - 1) * 0.55, pm = (p0 + p1) / 2, len = 0.0034 * (1 - 0.45 * Math.abs(pm) / 1.25);
      const at = ph => [Math.sin(ph) * R, 0, Math.cos(ph) * R];
      const a0 = at(p0), a1 = at(p1), dir = [Math.sin(pm) * 0.75, -0.45, Math.cos(pm) * 0.75], tip = [a0[0] / 2 + a1[0] / 2 + dir[0] * len, dir[1] * len + 0.0012, a0[2] / 2 + a1[2] / 2 + dir[2] * len];
      lp.push(...a0, ...a1, ...tip, ...a1, ...a0, ...tip);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3)); lg.computeVertexNormals();
    F.lid = merge([paintFn(ul, (x, y, z, c) => { const rim = sst(EYE.r * 0.22, 0, y) * sst(-0.2, 0.3, z / EYE.r); const crease = 0.12 * Math.exp(-((((y / EYE.r) - 0.55) / 0.12) ** 2)) * sst(0, 0.5, z / EYE.r); const k = lerp(1, 0.12, rim) * (1 - crease); c[0] = k; c[1] = k * (1 - rim * 0.05); c[2] = k * (1 - rim * 0.03); }), paintFn(lg, flat(0x101010))]);
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
export const FACE_COLOR = { headHi: "skin", nose: "skin", cheeks: "skin", eyeW: 0xf4f0ea, iris: "iris", glint: 0xffffff, lid: "skin", lidLow: "skin", browR: "browCol", browL: "browCol",
  lipUR: "lipCol", lipUL: "lipCol", lipLR: "lipCol", lipLL: "lipCol", mouth: 0xffffff, teethU: 0xffffff, teethL: 0xffffff,
  beardFull: "beardTint", beardGoatee: "beardTint", beardMus: "beardTint", beardStubble: "beardTint" };
// how each part is shaded
export const FACE_MAT = { headHi: "skin", nose: "skin", cheeks: "skin", lid: "skin", lidLow: "skin", browR: "hair", browL: "hair", beardFull: "hair", beardGoatee: "hair", beardMus: "hair", beardStubble: "hair",
  eyeW: "eye", iris: "eye", glint: "glint", lipUR: "lip", lipUL: "lip", lipLR: "lip", lipLL: "lip", mouth: "wet", teethU: "wet", teethL: "wet" };
for (const st of HAIRSTYLES) { FACE_COLOR["hair_" + st] = "hair"; FACE_MAT["hair_" + st] = "hair"; FACE_COLOR["hairc_" + st] = "hair"; FACE_MAT["hairc_" + st] = st === "afro" ? "curl" : "card"; }
for (const k of ["beardcFull", "beardcGoatee", "beardcMus"]) { FACE_COLOR[k] = "beardTint"; FACE_MAT[k] = "card"; }
export const BEARD_CARDS = { full: "beardcFull", goatee: "beardcGoatee", mustache: "beardcMus" };

// the wind the hair moves in (world-space, metres per second-ish) and the clock it sways to
export const HAIR_U = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(0.5, 0, 0.25) } };
// a strand texture, built pixel by pixel: dozens of fine hairs, tapering to wispy tips, gaps between them
function strandTexture(curly) {
  const W = 128, H = 256, A = new Float32Array(W * H), B = new Float32Array(W * H);
  let sd = curly ? 77 : 33; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const N = curly ? 40 : 46;
  for (let s = 0; s < N; s++) {
    const x0 = rnd() * W, amp = curly ? 2.5 + rnd() * 4 : 0.5 + rnd() * 1.4, fr = curly ? 0.1 + rnd() * 0.08 : 0.012 + rnd() * 0.02, ph = rnd() * 6.28;
    const drift = (rnd() - 0.5) * (curly ? 6 : 12), reach = 0.55 + rnd() * 0.45, wid = 0.45 + rnd() * 0.7, br = 0.62 + rnd() * 0.38;
    for (let y = 0; y < H * reach; y++) {
      const t = y / H, taper = 1 - sst(reach * 0.6, reach, t), xc = x0 + Math.sin(y * fr + ph) * amp + drift * t * t, w = wid * taper + 0.35;
      for (let px = Math.floor(xc - 2.5); px <= Math.ceil(xc + 2.5); px++) {
        const a = Math.max(0, 1 - Math.abs(px - xc) / w) * (0.35 + 0.65 * taper), i = y * W + ((px % W) + W) % W;
        if (a > A[i]) { A[i] = a; B[i] = br * (0.9 + 0.1 * Math.sin(y * 0.3 + s)); }
      }
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { const y = Math.floor(i / W), root = 0; const a = Math.min(1, Math.max(A[i], root)); const b = A[i] > 0.05 ? B[i] : 0.55; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(b * 255); data[i * 4 + 3] = Math.round(a * 255); }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
let STRAND = null, CURL = null;
// the strand-card shading: lit along the hair (two-tone sheen), roots darker, see-through between strands, blowing in the wind
function cardMaterial(curly) {
  if (!STRAND) { STRAND = strandTexture(false); CURL = strandTexture(true); }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: curly ? CURL : STRAND, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 0.75 });
  m.alphaToCoverage = true;
  m.userData.uMove = { value: new THREE.Vector3() };
  const key = "|Fcard" + (curly ? "c" : "");
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = HAIR_U.uTime; sh.uniforms.uWind = HAIR_U.uWind; sh.uniforms.uMove = m.userData.uMove;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aDir; varying vec3 vDirV; varying float vTip; uniform float uTime; uniform vec3 uWind; uniform vec3 uMove;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vTip = uv.y;
        vec3 dd = aDir;
        #ifdef USE_INSTANCING
          dd = mat3(instanceMatrix) * dd;
        #endif
        vDirV = normalize((modelViewMatrix * vec4(dd, 0.0)).xyz);`)
      .replace("#include <project_vertex>", `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wp = modelMatrix * mvPosition;
        float tip = pow(uv.y, 1.5);
        float ph = uTime * 2.4 + wp.x * 3.1 + wp.z * 2.7 + wp.y * 6.0;
        float gust = 0.55 + 0.45 * sin(uTime * 0.7 + wp.x * 0.05) * sin(uTime * 1.3 + wp.z * 0.04);
        vec3 wind = uWind * gust * (0.6 + 0.4 * sin(ph)) + vec3(sin(ph * 1.7), 0.35 * sin(ph * 2.3), cos(ph * 1.3)) * 0.22 * length(uWind);
        wp.xyz += (wind + uMove) * tip * 0.028;
        mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vDirV; varying float vTip;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.08, smoothstep(0.0, 0.45, vTip));
        float lu = fract(vMapUv.x * 4.0 + 0.001) / 0.96;
        diffuseColor.a *= smoothstep(0.0, 0.28, lu) * smoothstep(1.0, 0.72, lu) * smoothstep(0.0, 0.12, vTip);`)
      .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
        void RE_Direct_Card(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          float ndl = dot(geometryNormal, directLight.direction);
          float wrap = max(0.0, (ndl + 0.5) / 1.5);
          reflectedLight.directDiffuse += directLight.color * wrap * BRDF_Lambert(material.diffuseColor);
          vec3 T = normalize(vDirV), H = normalize(directLight.direction + geometryViewDir);
          vec3 T2 = normalize(T + geometryNormal * 0.35);
          float a = dot(T, H), b = dot(T2, H);
          float s1 = pow(sqrt(max(0.0, 1.0 - a * a)), 140.0), s2 = pow(sqrt(max(0.0, 1.0 - b * b)), 36.0);
          reflectedLight.directSpecular += directLight.color * wrap * (s1 * 0.09 + s2 * 0.14 * min(vec3(1.0), material.diffuseColor * 2.5));
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Card`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
export { cardMaterial };
// a hairstyle for someone who doesn't have one yet: longer styles for long-haired looks
export const LONG_STYLES = ["long", "bob", "bun", "pony"];
export function pickStyle(look, hs) {
  if (look.bald) return null;
  const list = look.long ? ["long", "long", "bob", "bun", "pony", "afro", "long"] : ["crop", "crop", "side", "buzz", "afro", "side", "crop", "buzz"];
  return list[Math.floor(hs * 4567) % list.length];
}

// ---- shading: skin that light soaks into, hair with strands and a two-tone sheen ----
const NOISE = `
varying vec3 vFLocal;
float strand = 1.0;
float fhash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fnoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fhash(i), fhash(i + vec3(1,0,0)), f.x), mix(fhash(i + vec3(0,1,0)), fhash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fhash(i + vec3(0,0,1)), fhash(i + vec3(1,0,1)), f.x), mix(fhash(i + vec3(0,1,1)), fhash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
export function patch(m, kind) {
  if (m.userData.facePatched === kind && m.onBeforeCompile && m.onBeforeCompile.facePatch) return m;
  m.userData.facePatched = kind;
  const prev = m.onBeforeCompile, key = (m.customProgramCacheKey ? m.customProgramCacheKey.call(m) : "") + "|F" + kind;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFLocal = position;");
    let f = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + NOISE);
    if (kind === "skin") {
      // mottling and pores in the colour and the shine; light that wraps round and glows warm at the edges
      f = f.replace("#include <color_fragment>", `#include <color_fragment>
        float pn = fnoise(vFLocal * 420.0) * 0.55 + fnoise(vFLocal * 170.0) * 0.45;
        diffuseColor.rgb *= 0.955 + 0.075 * pn;
        diffuseColor.rgb *= vec3(1.0 + 0.05 * (fnoise(vFLocal * 55.0) - 0.5), 1.0, 1.0);`)
       .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (fnoise(vFLocal * 900.0) - 0.5) * 0.12, 0.36, 1.0);`)
       .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
        void RE_Direct_Skin(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          float ndl = dot(geometryNormal, directLight.direction);
          float sss = max(0.0, (ndl + 0.6) / 1.6) - max(0.0, ndl);
          reflectedLight.directDiffuse += directLight.color * sss * vec3(1.0, 0.4, 0.3) * BRDF_Lambert(material.diffuseColor) * 1.05;
          float back = pow(1.0 - max(0.0, dot(geometryNormal, geometryViewDir)), 3.0) * max(0.0, dot(-geometryViewDir, directLight.direction) * 0.6 + 0.4);
          reflectedLight.directDiffuse += directLight.color * back * vec3(1.0, 0.42, 0.3) * material.diffuseColor * 0.18;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Skin`);
    } else if (kind === "hair") {
      // strands in the colour, and Kajiya-Kay highlights: a white one and a coloured one shifted down the strand
      f = f.replace("#include <color_fragment>", `#include <color_fragment>
        float ang = atan(vFLocal.x, vFLocal.z);
        strand = fnoise(vec3(ang * 70.0, vFLocal.y * 9.0, vFLocal.x * 3.0)) * 0.6 + fnoise(vec3(ang * 190.0, vFLocal.y * 22.0, 1.0)) * 0.4;
        diffuseColor.rgb *= 0.74 + 0.4 * strand;`)
       .replace("#include <lights_physical_pars_fragment>", `#include <lights_physical_pars_fragment>
        void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
          vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 T = normalize(up - geometryNormal * dot(up, geometryNormal) + 1e-4);
          vec3 H = normalize(directLight.direction + geometryViewDir);
          float ndl = max(0.0, dot(geometryNormal, directLight.direction));
          vec3 T2 = normalize(T + geometryNormal * 0.3);
          float a = dot(T, H), b = dot(T2, H);
          float s1 = pow(sqrt(max(0.0, 1.0 - a * a)), 160.0), s2 = pow(sqrt(max(0.0, 1.0 - b * b)), 40.0);
          reflectedLight.directSpecular += directLight.color * ndl * (s1 * 0.07 + s2 * 0.1 * min(vec3(1.0), material.diffuseColor * 2.5)) * (0.6 + 0.4 * strand);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Hair`);
    }
    sh.fragmentShader = f;
  };
  m.onBeforeCompile.facePatch = true;
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}
export function faceMaterials() {
  return {
    skin: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), "skin"),
    hair: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), "hair"),
    eye: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, envMapIntensity: 1.4 }),
    glint: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    lip: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32 }),
    card: cardMaterial(false), curl: cardMaterial(true),
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
  laugh:     { tilt: -0.1, raise: 0.0025, eye: 0.3, lower: 0.55, curve: 1, open: 0.85, wide: 1.16, sneer: 0.4 },
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
const DEFAULT_FV = { jaw: 1, len: 1, nose: 1, noseW: 1, eye: 1, brow: 1, lips: 1, mouthW: 1 };
// a face's own proportions from a stable per-person number
export function faceVariation(hs, feminine) {
  const r = k => ((Math.sin(hs * 9137.13 * (k + 1) + k * 1.7) * 43758.5453) % 1 + 1) % 1;
  return { jaw: (feminine ? 0.95 : 1.0) + r(1) * 0.08 - 0.03, len: 0.97 + r(2) * 0.07, nose: (feminine ? 0.86 : 0.95) + r(3) * 0.3, noseW: 0.88 + r(4) * 0.3,
    eye: (feminine ? 1.03 : 0.96) + r(5) * 0.1, brow: (feminine ? 0.75 : 0.95) + r(6) * 0.45, lips: (feminine ? 1.08 : 0.9) + r(7) * 0.22, mouthW: 0.93 + r(8) * 0.14 };
}
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function local(x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) { return _b.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz)); }
const _h = new THREE.Matrix4(), _n = new THREE.Matrix4();
export function faceMatrices(head0, f, opts, emit) {
  const c = f.cur, v = opts.fv || DEFAULT_FV;
  // their own proportions: a wider or narrower face, a longer or shorter head
  const head = _h.copy(head0).multiply(local(0, 0, 0, 0, 0, 0, v.jaw, v.len, 1));
  if (opts.head) emit("headHi", head, 0);
  if (opts.hair) { emit(opts.hair, head, 0); const c2 = "hairc_" + opts.hair.slice(5); if (FACE[c2]) emit(c2, head, 0); }
  emit("nose", _n.copy(head).multiply(local(0, NOSE_ROOT.y, NOSE_ROOT.z, 0, 0, 0, v.noseW, v.nose, v.nose)).multiply(local(0, -NOSE_ROOT.y, -NOSE_ROOT.z, 0, 0, 0)), 0);
  // cheeks lift and fill out with a smile, and with a squint

  for (const side of [-1, 1]) {
    const L = side < 0, open = L ? f.eyeL : f.eyeR, slot = L ? 0 : 1;
    const ex = side * EYE.x, yaw = side * 0.06;
    const es = v.eye;
    emit("eyeW", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, 0, yaw, 0, 1.2 * es, es, es)), slot);
    emit("iris", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, -f.gy, yaw + f.gx, 0, es, es, es)), slot);
    emit("glint", _a.copy(head).multiply(local(ex, EYE.y, EYE.z, 0, yaw, 0, es, es, es)), slot);
    // upper lid: tucked back when wide, over the top of the iris when relaxed, right down for a blink
    const lidA = open >= 1 ? lerp(-0.42, -0.85, Math.min(1, (open - 1) / 0.4)) : lerp(1.58, -0.42, open);
    emit("lid", _a.copy(head).multiply(local(ex, EYE.y + 0.0004, EYE.z - 0.0004, lidA, yaw + f.gx * 0.25, side * -0.04, 1.2 * es, es, es)), slot);
    const low = c.lower + (f.blink > 0 ? 0.3 : 0);
    emit("lidLow", _a.copy(head).multiply(local(ex, EYE.y - 0.0003, EYE.z - 0.0003, -(0.08 + low * 0.55), yaw, 0, 1.2 * es, es, es)), slot);
    // brows: inner ends knit down for anger, lift for worry; a smirk or a wink cocks one
    const br = f.raise + (L ? 0 : c.smirk * 0.0035) - (L ? c.wink * 0.0015 : 0) + Math.max(0, open - 1) * 0.004;
    emit(L ? "browL" : "browR", _a.copy(head).multiply(local(side * BROW.x, BROW.y + br, BROW.z + Math.max(0, c.tilt) * 0.0012, 0, side * 0.12, (L ? -1 : 1) * (c.tilt * 0.7) + (L ? 0.03 : -0.03), 1, v.brow, v.brow)), 0);
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
    emit(L ? "lipUL" : "lipUR", _a.copy(head).multiply(local(0, upY, MOUTH.z, -open * 0.1, 0, a, wide * v.mouthW, (1 - open * 0.15) * v.lips, v.lips)), 0);
    emit(L ? "lipLL" : "lipLR", _a.copy(head).multiply(local(0, MOUTH.y - drop - Math.max(0, cv) * 0.0006, MOUTH.z - drop * 0.4, open * 0.25, 0, a * 0.85, wide * v.mouthW, (1 - open * 0.1) * v.lips * 1.04, v.lips)), 0);
  }
  if (opts.beard) emit(opts.beard, head, 0);
  if (opts.beardCards) emit(opts.beardCards, head, 0);
}
