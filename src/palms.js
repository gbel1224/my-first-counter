// Palm City — palm trees. Four real species, each built the way game foliage is: a solid trunk
// with bark, and a crown of fronds that are bent ribbons carrying a cut-out leaf texture (every
// leaflet drawn into the texture, so a frond is a few triangles but looks like hundreds of leaves).
//   royal:        tall, smooth grey ringed trunk, a green crown shaft, arching feathery fronds
//   coconut:      a curving, leaning trunk, coconuts under a spreading drooping crown
//   washingtonia: the Mexican fan palm of the boulevards: very tall and slender, a small head of
//                 fan leaves over a shaggy brown skirt of dead ones
//   canary:       the date palm of parks and squares: a thick trunk patterned with diamond leaf
//                 scars, a huge dense round crown
// Each species has two shapes (so a row of them isn't clones) and a near and far version: the far
// one has fewer fronds and sections and takes over past ~90 m.
import * as THREE from "../vendor/three.module.js";
import { merge, place } from "./geo.js";

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---- textures ----
// the leaf atlas (2048 x 1024): [0, .5) a green feather frond, [.5, .75) a dead brown one,
// [.75, 1) x [0, .5) a fan leaf, [.75, 1) x [.5, 1) the shaggy skirt of dead fan leaves.
// Fronds lie along u (base at the left), across v (rib at the middle).
const AT = { green: [0, 0.5, 0, 1], dead: [0.5, 0.75, 0, 1], fan: [0.75, 1, 0, 0.5], skirt: [0.75, 1, 0.5, 1] };
let LEAF = null, BARK = null, DIAMOND = null;
function leafAtlas() {
  if (LEAF) return LEAF;
  const W = 2048, H = 1024, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), r = mulberry(7);
  const frond = (x0, w, h, cols, dead) => {
    const mid = h / 2;
    // leaflets, back to front: each a slim curved blade from the rib, swept toward the tip
    const n = 95;
    for (let side of [-1, 1]) for (let i = 0; i < n; i++) {
      const t = (i + r() * 0.6) / n;
      if (t > 0.97 || (!dead && r() < 0.04)) continue;                   // the odd missing leaflet
      const L = (0.18 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.82) * mid * (dead ? 0.85 : 0.97) * (0.85 + r() * 0.2);
      const bx = x0 + t * w, by = mid;
      const ang = (dead ? 1.25 : 0.9) + r() * 0.15;                       // swept forward
      const ex = bx + Math.cos(ang) * L * 0.55, ey = by + side * Math.sin(ang) * L;
      const wid = (dead ? 4 : 9) * (1 - t * 0.4);
      const g = x.createLinearGradient(bx, by, ex, ey);
      const [c0, c1, c2] = cols();
      g.addColorStop(0, c0); g.addColorStop(0.6, c1); g.addColorStop(1, c2);
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(bx - wid, by);
      x.quadraticCurveTo(bx + (ex - bx) * 0.5 - side * 3, by + (ey - by) * 0.5, ex, ey);
      x.quadraticCurveTo(bx + (ex - bx) * 0.5 + side * 3 + wid, by + (ey - by) * 0.5, bx + wid, by);
      x.closePath(); x.fill();
      // the leaflet's midrib, a faint lighter line
      x.strokeStyle = dead ? "rgba(190,160,110,0.5)" : "rgba(200,210,120,0.35)"; x.lineWidth = 1;
      x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + (ex - bx) * 0.5, by + (ey - by) * 0.5, ex, ey); x.stroke();
    }
    // the rib, tapering toward the tip
    for (let i = 0; i < 60; i++) {
      const t = i / 60, w2 = 9 * (1 - t) + 2;
      x.fillStyle = dead ? "#8a6a42" : "#9aa05a"; x.fillRect(x0 + t * w, mid - w2 / 2, w / 60 + 1, w2);
    }
  };
  // green fronds: deep green to sunlit yellow-green, the tips a little scorched
  frond(0, W * 0.5, H, () => {
    const k = r(), base = k < 0.5 ? "#2f4a1c" : "#3a5622";
    return [base, k < 0.3 ? "#55702c" : "#4c6828", r() < 0.12 ? "#8a7a3a" : "#6e8434"];
  }, false);
  frond(W * 0.5, W * 0.25, H, () => [r() < 0.5 ? "#6a4e2c" : "#7a5c34", "#9a7a4a", "#b89a62"], true);
  // fan leaf: stiff pleated segments radiating from the stem, split at the ends with hanging threads
  {
    const cx = W * 0.875, cy = H * 0.5 * 0.92, R = H * 0.5 * 0.88;
    const seg = 46;
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI + (i / seg) * Math.PI, a1 = Math.PI + ((i + 1) / seg) * Math.PI, am = (a0 + a1) / 2;
      const rr = R * (0.88 + r() * 0.12);
      const g = x.createLinearGradient(cx, cy, cx + Math.cos(am) * rr, cy + Math.sin(am) * rr);
      g.addColorStop(0, "#5a7030"); g.addColorStop(0.55, i % 2 ? "#4f6a2a" : "#5f7a34"); g.addColorStop(1, "#7a8a40");
      x.fillStyle = g;
      x.beginPath(); x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a0) * rr * 0.98, cy + Math.sin(a0) * rr * 0.98);
      x.lineTo(cx + Math.cos(am) * rr * 0.86, cy + Math.sin(am) * rr * 0.86);              // split tip
      x.lineTo(cx + Math.cos(a1) * rr * 0.98, cy + Math.sin(a1) * rr * 0.98);
      x.closePath(); x.fill();
      x.strokeStyle = "rgba(30,40,15,0.5)"; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a0) * rr * 0.98, cy + Math.sin(a0) * rr * 0.98); x.stroke();
      if (r() < 0.5) { x.strokeStyle = "rgba(200,190,150,0.6)"; x.lineWidth = 1; x.beginPath(); x.moveTo(cx + Math.cos(am) * rr * 0.86, cy + Math.sin(am) * rr * 0.86); x.lineTo(cx + Math.cos(am) * rr * 0.86 + (r() - 0.5) * 8, cy + Math.sin(am) * rr * 0.86 + 18 + r() * 20); x.stroke(); }
    }
  }
  // the skirt: dead fan leaves hanging straight down, ragged at the bottom
  {
    const x0 = W * 0.75, y0 = H * 0.5, w = W * 0.25, h = H * 0.5;
    for (let i = 0; i < 260; i++) {
      const sx = x0 + r() * w, len = h * (0.55 + r() * 0.45), sw = 3 + r() * 7;
      x.fillStyle = ["#6e5536", "#7c6240", "#5e4830", "#8a7048", "#4e3c28"][(r() * 5) | 0];
      x.beginPath(); x.moveTo(sx - sw, y0); x.lineTo(sx + sw, y0); x.lineTo(sx + sw * 0.3 + (r() - 0.5) * 6, y0 + len); x.lineTo(sx - sw * 0.3, y0 + len * 0.96); x.closePath(); x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return (LEAF = t);
}
// bark: ringed (royal, coconut, washingtonia) — horizontal leaf-scar rings over vertical fibres
function barkTexture(diamond) {
  if (diamond ? DIAMOND : BARK) return diamond ? DIAMOND : BARK;
  const S = 512, c = document.createElement("canvas"); c.width = S; c.height = S;
  const x = c.getContext("2d"), r = mulberry(diamond ? 31 : 17);
  x.fillStyle = diamond ? "#7e684c" : "#b4ab9a"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${diamond ? "40,30,20" : "60,55,48"},${0.05 + r() * 0.12})`; x.fillRect(r() * S, r() * S, 1 + r() * 2, 8 + r() * 40); }
  if (diamond) {
    // the canary palm's diamond pattern of old leaf bases
    const n = 8, h = S / 8;
    for (let row = 0; row < 9; row++) for (let k = 0; k <= n; k++) {
      const cx = (k + (row % 2) * 0.5) * S / n, cy = row * h;
      const g = x.createRadialGradient(cx, cy, 2, cx, cy, S / n * 0.6);
      g.addColorStop(0, "#8a7354"); g.addColorStop(0.7, "#6e5a40"); g.addColorStop(1, "#3e3024");
      x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - h * 0.55); x.lineTo(cx + S / n * 0.5, cy); x.lineTo(cx, cy + h * 0.55); x.lineTo(cx - S / n * 0.5, cy); x.closePath(); x.fill();
      x.strokeStyle = "rgba(30,22,15,0.7)"; x.lineWidth = 2; x.stroke();
    }
  } else {
    // ring scars every few centimetres, slightly irregular
    for (let y = 0; y < S; y += 14 + r() * 10) {
      x.fillStyle = "rgba(55,50,44,0.55)"; x.fillRect(0, y, S, 2 + r() * 2);
      x.fillStyle = "rgba(170,160,145,0.35)"; x.fillRect(0, y + 3, S, 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (diamond) DIAMOND = t; else BARK = t;
  return t;
}

// ---- materials: both sway with the wind; the fronds flutter more toward their tips ----
const SWAY = `
  {
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float ph = ip.x * 0.13 + ip.z * 0.17;
    float hgt = max(position.y, 0.0);
    float bend = hgt * hgt * 0.0013;
    transformed.x += sin(uTime * 1.1 + ph) * bend + sin(uTime * 2.7 + ph * 1.7) * bend * 0.25;
    transformed.z += cos(uTime * 0.9 + ph) * bend * 0.6;
    #ifdef FROND
      float tip = aTip;
      transformed.y += sin(uTime * 3.1 + ph * 3.0 + position.x * 1.7 + position.z * 1.3) * 0.11 * tip * tip;
      transformed.x += sin(uTime * 2.3 + ph * 2.0 + position.z) * 0.06 * tip;
    #endif
  }`;
function palmMaterial(U, kind) {
  const frond = kind === "leaf";
  const m = new THREE.MeshStandardMaterial(frond
    ? { map: leafAtlas(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 }
    : { map: barkTexture(kind === "diamond"), vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = (frond ? "#define FROND\n" : "") + sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;" + (frond ? "\nattribute float aTip;" : ""))
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + SWAY);
    // leaves let some light through: the underside glows a little when the sun is behind them
    if (frond) sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.12;");
  };
  m.customProgramCacheKey = () => "palm-" + kind;
  return m;
}

// ---- geometry ----
// a geometry from raw arrays; tip = how far along its frond each vertex is (for the flutter)
function geo(P, N, UV, C, TIP) {
  const g = new THREE.BufferGeometry(), n = P.length / 3;
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (N) g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute("aTip", new THREE.Float32BufferAttribute(TIP || new Float32Array(n), 1));
  if (!N) g.computeVertexNormals();
  return g;
}
const reg = (R, u, v) => [R[0] + (R[1] - R[0]) * u, R[2] + (R[3] - R[2]) * v];

// one feather frond: a ribbon along an arching, drooping rib, folded into a V along the rib (as
// real fronds are), twisting a little toward the tip. Base at the origin, pointing along +x.
function frondGeo(o) {
  const { L, rise, droop, width, fold, seg, twist, region, tint } = o;
  const P = [], UV = [], C = [], TIP = [];
  const rib = t => [t * L * (1 - droop * 0.25 * t), Math.sin(t * Math.PI * 0.55) * rise - t * t * L * droop];
  const tc = new THREE.Color(tint);
  const row = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, [x, y] = rib(t);
    const w = width * (0.25 + Math.sin(Math.min(1, t * 1.1) * Math.PI) * 0.75) * (1 - t * 0.25);
    const tw = twist * t * t, f = fold * (1 - t * 0.4);
    const left = [x, y - w * Math.sin(f) * Math.cos(tw), -w * Math.cos(f)], right = [x, y - w * Math.sin(f) * Math.cos(-tw), w * Math.cos(f)];
    left[1] += w * Math.sin(tw) * 0.5; right[1] -= w * Math.sin(tw) * 0.5;
    row.push({ t, l: left, m: [x, y, 0], r: right });
  }
  const push = (p, u, v, t) => { P.push(...p); const q = reg(region, u, v); UV.push(q[0], 1 - q[1]); C.push(tc.r, tc.g, tc.b); TIP.push(t); };
  for (let i = 0; i < seg; i++) {
    const a = row[i], b = row[i + 1];
    for (const [s0, s1, v0, v1] of [["l", "m", 0, 0.5], ["m", "r", 0.5, 1]]) {
      push(a[s0], a.t, v0, a.t); push(b[s0], b.t, v0, b.t); push(b[s1], b.t, v1, b.t);
      push(a[s0], a.t, v0, a.t); push(b[s1], b.t, v1, b.t); push(a[s1], a.t, v1, a.t);
    }
  }
  return geo(P, null, UV, C, TIP);
}
// one fan leaf on its stalk: a cupped half-disc. Base at the origin, the stalk along +x.
function fanGeo(o) {
  const { stalk, R, tilt, seg, tint } = o;
  const P = [], UV = [], C = [], TIP = [], tc = new THREE.Color(tint);
  // the stalk: two thin crossed strips in skirt colour, texture-free (brown bark-ish via the skirt region)
  const at = (u, v) => {                              // u, v in [0,1] over the fan texture square
    const fx = (u - 0.5) * 2 * R, fy = (0.92 - v) * 2 * R * 0.5 / 0.92 * 0.92;   // fan plane coords (fy up from the stem)
    const cup = (fx * fx) / (R * R) * 0.35 * R;      // the fan cups upward at its sides
    const x = stalk + fy * Math.cos(tilt) - cup * Math.sin(tilt), y = fy * Math.sin(tilt) + cup * Math.cos(tilt);
    return [x, y, fx];
  };
  const push = (p, u, v) => { P.push(...p); const q = reg(AT.fan, u, v); UV.push(q[0], 1 - q[1]); C.push(tc.r, tc.g, tc.b); TIP.push(Math.min(1, Math.hypot(u - 0.5, 0.92 - v) * 2)); };
  for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
    const u0 = i / seg, u1 = (i + 1) / seg, v0 = j / seg * 0.95, v1 = (j + 1) / seg * 0.95;
    const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1);
    push(a, u0, v0); push(b, u1, v0); push(c, u1, v1); push(a, u0, v0); push(c, u1, v1); push(d, u0, v1);
  }
  // the stalk from the trunk to the fan
  for (const s of [-1, 1]) {
    const q = [[0, 0, s * 0.03], [stalk, 0, s * 0.02], [stalk, 0.06, 0], [0, 0.07, 0]];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...q[k]); const uv = reg(AT.dead, 0.02 + k * 0.01, 0.5); UV.push(uv[0], 1 - uv[1]); C.push(0.8, 0.8, 0.75); TIP.push(0); }
  }
  return geo(P, null, UV, C, TIP);
}
// a trunk: a tube along a curve, bark texture wrapping round and repeating up it
function trunkGeo(o) {
  const { H, lean, curve, rad, sides, segs, tint, swell } = o;
  const path = t => [Math.sin(t * curve) * lean, t * H];
  const P = [], N = [], UV = [], C = [], tc = new THREE.Color(tint);
  const ringAt = i => {
    const t = i / segs, [x, y] = path(t), [x2, y2] = path(Math.min(1, t + 0.01)), [x1, y1] = path(Math.max(0, t - 0.01));
    const tan = new THREE.Vector2(x2 - x1, y2 - y1).normalize();
    const r = rad(t) * (1 + (swell ? swell(t) : 0));
    const pts = [];
    for (let k = 0; k <= sides; k++) {
      const a = k / sides * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const nx = cs * tan.y, ny = -cs * tan.x;                 // the ring is square to the trunk's slope
      pts.push({ p: [x + nx * r, y + ny * r, sn * r], n: [nx, ny, sn], u: k / sides * 2, v: y / 1.6 });
    }
    return pts;
  };
  const rings = []; for (let i = 0; i <= segs; i++) rings.push(ringAt(i));
  for (let i = 0; i < segs; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k + 1], d = rings[i + 1][k];
    for (const q of [a, c, b, a, d, c]) { P.push(...q.p); N.push(...q.n); UV.push(q.u, q.v); const sh = 0.92 + 0.16 * Math.sin(q.v * 1.7 + k); C.push(tc.r * sh, tc.g * sh, tc.b * sh); }
  }
  const top = path(1);
  return { g: geo(P, N, UV, C), top };
}

// a frond's colour: each one a little different (sun, age), around white so the texture shows true
function tintOf(r, warm = 0) { const k = 0.86 + r() * 0.22; return new THREE.Color(k * (1 + warm), k, k * (1 - warm * 1.5)).getHex(); }
// a whole palm: { trunk, crown } geometries
function build(species, variant, far) {
  const r = mulberry(species.length * 97 + variant * 13 + 5);
  const trunks = [], crowns = [];
  const crown = (top, count, frond, opts = {}) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r() * 0.35;
      const g = frond(k);
      // pitch: young fronds point up, older ones arch out, the oldest hang
      const pitch = opts.pitch ? opts.pitch(k, r) : (r() - 0.35) * 0.6;
      place(g, top[0], top[1], 0, 0, a, pitch);
      crowns.push(g);
    }
  };
  const fseg = far ? 4 : 9;
  if (species === "royal") {
    const H = 12 + variant * 2.5, { g, top } = trunkGeo({ H, lean: 0.35 + variant * 0.25, curve: 1.2, rad: t => 0.27 - t * 0.08, swell: t => Math.exp(-t * 10) * 0.35 + Math.exp(-(((t - 0.55) * 4) ** 2)) * 0.08, sides: far ? 6 : 10, segs: far ? 4 : 10, tint: 0xf2eee6 });
    trunks.push(g);
    // the smooth green crown shaft
    const cs = trunkGeo({ H: 1.9, lean: 0, curve: 0, rad: t => 0.21 - t * 0.04, sides: far ? 6 : 10, segs: 2, tint: 0xa8d070 });
    cs.g.translate(top[0], top[1], 0); trunks.push(cs.g);
    crown([top[0], top[1] + 1.8], far ? 12 : 22, k => frondGeo({ L: 3.6 + r() * 1.0, rise: 0.9, droop: 0.35 + r() * 0.35, width: 1.4, fold: 0.6, seg: fseg, twist: 0.6, region: k % 9 === 8 ? AT.dead : AT.green, tint: tintOf(r) }),
      { pitch: (k, rr) => k % 9 === 8 ? -1.0 : (rr() - 0.3) * 0.7 });
  } else if (species === "coconut") {
    const H = 8.5 + variant * 2, { g, top } = trunkGeo({ H, lean: 1.6 + variant * 0.9, curve: 1.6, rad: t => 0.2 - t * 0.04, swell: t => Math.exp(-t * 8) * 0.5, sides: far ? 6 : 9, segs: far ? 4 : 10, tint: 0xd8ccb4 });
    trunks.push(g);
    if (!far) for (let k = 0; k < 7; k++) {          // coconuts, clustered under the crown
      const a = r() * Math.PI * 2, n = new THREE.SphereGeometry(0.16, 8, 6);
      const col = r() < 0.4 ? 0x6a8a30 : 0x8a6a3a, cc = new THREE.Color(col), cn = n.attributes.position.count;
      n.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: cn }, () => [cc.r, cc.g, cc.b]).flat(), 3));
      n.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(cn), 1));
      n.setAttribute("aTip", new THREE.Float32BufferAttribute(new Float32Array(cn), 1));
      const uvs = n.attributes.uv.array; for (let i = 0; i < uvs.length; i++) uvs[i] = 0.02;
      trunks.push(place(n.toNonIndexed(), top[0] + Math.cos(a) * 0.28, top[1] - 0.25 - r() * 0.2, Math.sin(a) * 0.28));
    }
    crown([top[0], top[1]], far ? 10 : 20, k => frondGeo({ L: 3.8 + r() * 1.1, rise: 0.6, droop: 0.55 + r() * 0.35, width: 1.35, fold: 0.75, seg: fseg, twist: 0.9, region: k % 7 === 6 ? AT.dead : AT.green, tint: tintOf(r, 0.06) }),
      { pitch: (k, rr) => k % 7 === 6 ? -1.1 : (rr() - 0.35) * 0.7 });
  } else if (species === "washingtonia") {
    const H = 15 + variant * 3, { g, top } = trunkGeo({ H, lean: 0.25 + variant * 0.3, curve: 1.1, rad: t => 0.26 - t * 0.1, swell: t => Math.exp(-t * 12) * 0.5, sides: far ? 6 : 8, segs: far ? 4 : 10, tint: 0xc8b8a0 });
    trunks.push(g);
    // the skirt of dead leaves hanging below the head: a ragged cone
    {
      const P = [], UV = [], C = [], n = far ? 8 : 16, h = 2.8 + variant * 0.9, r0 = 0.32, r1 = 0.62;
      for (let k = 0; k < n; k++) {
        const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
        const q = [[Math.cos(a0) * r0, 0, Math.sin(a0) * r0, 0, 0], [Math.cos(a1) * r0, 0, Math.sin(a1) * r0, 1, 0], [Math.cos(a1) * r1, -h, Math.sin(a1) * r1, 1, 1], [Math.cos(a0) * r1, -h, Math.sin(a0) * r1, 0, 1]];
        for (const i of [0, 1, 2, 0, 2, 3]) { P.push(top[0] + q[i][0], top[1] + 0.45 + q[i][1], q[i][2]); const uv = reg(AT.skirt, (q[i][3] + k * 0.37) % 1, q[i][4]); UV.push(uv[0], 1 - uv[1]); C.push(1, 1, 1); }
      }
      crowns.push(geo(P, null, UV, C));
    }
    // fans face outward all round the head, on stiff stalks angled up; the lowest droop
    crown([top[0], top[1] + 0.55], far ? 10 : 16, k => fanGeo({ stalk: 1.1 + r() * 0.6, R: 1.0 + r() * 0.25, tilt: 1.45 + r() * 0.25, seg: far ? 2 : 4, tint: tintOf(r, -0.05) }),
      { pitch: (k, rr) => (k % 3 === 0 ? 0.65 : k % 3 === 1 ? 0.3 : -0.15) + (rr() - 0.5) * 0.2 });
  } else {
    // canary date palm: short thick diamond-patterned trunk, a big round crown
    const H = 5 + variant * 2, { g, top } = trunkGeo({ H, lean: 0.15, curve: 1, rad: t => 0.55 - t * 0.05, swell: t => Math.exp(-t * 6) * 0.25 + t * t * 0.15, sides: far ? 7 : 12, segs: far ? 3 : 7, tint: 0xffffff });
    trunks.push(g);
    crown([top[0], top[1] + 0.2], far ? 16 : 34, k => frondGeo({ L: 4.4 + r() * 1.2, rise: 1.4, droop: 0.25 + r() * 0.3, width: 1.3, fold: 0.5, seg: fseg, twist: 0.4, region: k % 11 === 10 ? AT.dead : AT.green, tint: tintOf(r, -0.04) }),
      { pitch: (k, rr) => (k % 3 === 0 ? -0.7 : k % 3 === 1 ? -0.25 : 0.25) + (rr() - 0.5) * 0.3 });
  }
  return { trunk: mergeAll(trunks.map(fix)), crown: mergeAll(crowns.map(fix)), diamond: species === "canary" };
}
// merge() wants the same attributes everywhere (aTip included)
function fix(g) {
  if (g.index) g = g.toNonIndexed();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.aTip) g.setAttribute("aTip", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}
function mergeAll(list) {
  const out = merge(list);
  let total = 0; for (const g of list) total += g.attributes.position.count;
  const tip = new Float32Array(total); let o = 0;
  for (const g of list) { tip.set(g.attributes.aTip.array, o); o += g.attributes.aTip.count; }
  out.setAttribute("aTip", new THREE.BufferAttribute(tip, 1));
  return out;
}

// all the palms in the city: list = [[x, z, yaw, scale, species]]. instanced(geo, mat, items, near?)
// places them (the caller's instancing, tiling and draw distance).
export const SPECIES = ["royal", "coconut", "washingtonia", "canary"];
export function buildPalms(U, list, instanced) {
  const leaf = palmMaterial(U, "leaf"), bark = palmMaterial(U, "bark"), diamond = palmMaterial(U, "diamond");
  for (const sp of SPECIES) for (let variant = 0; variant < 2; variant++) for (const far of [false, true]) {
    // far away one shape per species is plenty (half the draw calls)
    if (far && variant) continue;
    const items = list.filter(it => it[4] === sp && (far || (it[5] || 0) === variant));
    if (!items.length) continue;
    const b = build(sp, variant, far);
    instanced(b.trunk, b.diamond ? diamond : bark, items, far);
    instanced(b.crown, leaf, items, far);
  }
}
