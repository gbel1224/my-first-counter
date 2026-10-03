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
let LEAF = null;
// height canvas -> tangent-space normal map (Sobel), strength in "pixels of slope"
function normalFromHeight(hc, strength, wrap) {
  const W = hc.width, H = hc.height, src = hc.getContext("2d").getImageData(0, 0, W, H).data;
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const ox = out.getContext("2d"), img = ox.createImageData(W, H), d = img.data;
  const h = (x, y) => { if (wrap) { x = (x + W) % W; y = (y + H) % H; } else { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); } return src[(y * W + x) * 4] / 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
    const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * W + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}
const tex = (c, srgb, wrap) => {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
};
let LEAFN = null;
// the leaf atlas, drawn twice with the same random sequence: once in colour, once as height (each
// leaflet a ridge along its midrib with a fold either side, the rib a raised spine), which becomes
// the normal map that makes every leaflet catch the light on its own
function leafAtlas() {
  if (LEAF) return LEAF;
  const W = 2048, H = 1024;
  const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const cc = mk(), hc = mk();
  const draw = (x, HEIGHT) => {
    const r = mulberry(7);
    if (HEIGHT) { x.fillStyle = "#000"; x.fillRect(0, 0, W, H); }
    const frond = (x0, w, h, cols, dead) => {
      const mid = h / 2, n = 95;
      for (let side of [-1, 1]) for (let i = 0; i < n; i++) {
        const t = (i + r() * 0.6) / n;
        if (t > 0.97 || t < 0.1 || (!dead && r() < 0.04)) continue;     // a bare stalk first; the odd leaflet missing
        const L = (0.18 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.82) * mid * (dead ? 0.85 : 0.97) * (0.85 + r() * 0.2);
        const bx = x0 + t * w, by = mid;
        const ang = (dead ? 1.25 : 0.9) + r() * 0.15;
        const ex = bx + Math.cos(ang) * L * 0.55, ey = by + side * Math.sin(ang) * L;
        const wid = (dead ? 4 : 9) * (1 - t * 0.4);
        const [c0, c1, c2] = cols(t);
        const torn = r() < (dead ? 0.35 : 0.08);                         // a split or torn end
        const ex2 = torn ? bx + (ex - bx) * 0.82 : ex, ey2 = torn ? by + (ey - by) * 0.82 : ey;
        const blade = () => {
          x.beginPath(); x.moveTo(bx - wid, by);
          x.quadraticCurveTo(bx + (ex2 - bx) * 0.5 - side * 3, by + (ey2 - by) * 0.5, ex2, ey2);
          x.quadraticCurveTo(bx + (ex2 - bx) * 0.5 + side * 3 + wid, by + (ey2 - by) * 0.5, bx + wid, by);
          x.closePath();
        };
        const sp = (k, a) => bx + (ex2 - bx) * k + a, spy = k => by + (ey2 - by) * k;
        if (HEIGHT) {
          x.fillStyle = "#5a5a5a"; blade(); x.fill();
          // the midrib ridge, softened either side
          x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = Math.max(2, wid * 0.55);
          x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo((bx + ex2) / 2, (by + ey2) / 2, ex2, ey2); x.stroke();
          x.strokeStyle = "#fff"; x.lineWidth = 1.2; x.stroke();
          continue;
        }
        const g = x.createLinearGradient(bx, by, ex2, ey2);
        g.addColorStop(0, c0); g.addColorStop(0.6, c1); g.addColorStop(1, c2);
        x.fillStyle = g; blade(); x.fill();
        // one half of the blade a shade lighter: the fold toward the light
        x.save(); blade(); x.clip();
        x.fillStyle = "rgba(255,255,220,0.07)";
        x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo((bx + ex2) / 2 + side * 6, (by + ey2) / 2, ex2, ey2); x.lineTo(bx + wid, by); x.fill();
        // spots and blemishes
        if (r() < 0.3) { x.fillStyle = dead ? "rgba(60,40,20,0.5)" : "rgba(120,100,40,0.45)"; x.beginPath(); x.arc(sp(0.4 + r() * 0.4, 0), spy(0.4 + r() * 0.4), 1.5 + r() * 2.5, 0, 7); x.fill(); }
        x.restore();
        x.strokeStyle = dead ? "rgba(200,170,120,0.55)" : "rgba(210,215,130,0.4)"; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo((bx + ex2) / 2, (by + ey2) / 2, ex2, ey2); x.stroke();
      }
      // the rib: a tapering spine, lighter on top
      for (let i = 0; i < 60; i++) {
        const t = i / 60, w2 = 10 * (1 - t) + 2;
        if (HEIGHT) {
          const g = x.createLinearGradient(0, mid - w2 / 2, 0, mid + w2 / 2); g.addColorStop(0, "#606060"); g.addColorStop(0.5, "#ffffff"); g.addColorStop(1, "#606060");
          x.fillStyle = g;
        } else {
          const g = x.createLinearGradient(0, mid - w2 / 2, 0, mid + w2 / 2);
          g.addColorStop(0, dead ? "#6a5032" : "#7a8a44"); g.addColorStop(0.5, dead ? "#a88a5a" : "#c0c47a"); g.addColorStop(1, dead ? "#6a5032" : "#6a7a3a");
          x.fillStyle = g;
        }
        x.fillRect(x0 + t * w, mid - w2 / 2, w / 60 + 1, w2);
      }
    };
    // green fronds: the base of each leaflet deep green, sunlit yellow-green toward the middle,
    // the tips a little paler and here and there scorched brown; older leaflets further out yellow
    frond(0, W * 0.5, H, t => {
      const k = r(), base = k < 0.5 ? "#2c4a1a" : "#365820";
      const midc = k < 0.25 ? "#5c7a2e" : k < 0.7 ? "#4e6c28" : "#456424";
      const tip = r() < 0.14 ? "#9a7e42" : r() < 0.2 + t * 0.2 ? "#8a9444" : "#6a8236";
      return [base, midc, tip];
    }, false);
    frond(W * 0.5, W * 0.25, H, () => [r() < 0.5 ? "#5e4428" : "#74583a", r() < 0.5 ? "#9a7a4a" : "#8a6a40", r() < 0.5 ? "#c0a06a" : "#a88a58"], true);
    // fan leaf: stiff pleats radiating from the stem (ridges and valleys), split ends with threads
    {
      const cx = W * 0.875, cy = H * 0.5 * 0.92, R = H * 0.5 * 0.88, seg = 46;
      for (let i = 0; i < seg; i++) {
        const a0 = Math.PI + (i / seg) * Math.PI, a1 = Math.PI + ((i + 1) / seg) * Math.PI, am = (a0 + a1) / 2;
        const rr = R * (0.88 + r() * 0.12);
        const pt = (a, k) => [cx + Math.cos(a) * rr * k, cy + Math.sin(a) * rr * k];
        if (HEIGHT) {
          // each pleat: a ridge down its middle
          const g = x.createLinearGradient(...pt(a0, 0.6), ...pt(a1, 0.6));
          g.addColorStop(0, "#303030"); g.addColorStop(0.5, "#e0e0e0"); g.addColorStop(1, "#303030");
          x.fillStyle = g;
        } else {
          const g = x.createLinearGradient(cx, cy, ...pt(am, 1));
          g.addColorStop(0, "#5a7030"); g.addColorStop(0.55, i % 2 ? "#4f6a2a" : "#62803a"); g.addColorStop(1, r() < 0.2 ? "#9a8a4a" : "#7a8c42");
          x.fillStyle = g;
        }
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(...pt(a0, 0.98)); x.lineTo(...pt(am, 0.86)); x.lineTo(...pt(a1, 0.98)); x.closePath(); x.fill();
        if (!HEIGHT) {
          x.strokeStyle = "rgba(30,40,15,0.45)"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx, cy); x.lineTo(...pt(a0, 0.98)); x.stroke();
          if (r() < 0.5) { x.strokeStyle = "rgba(210,200,160,0.7)"; x.lineWidth = 1; const [tx, ty] = pt(am, 0.86); x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + (r() - 0.5) * 8, ty + 18 + r() * 20); x.stroke(); }
        } else r();
      }
    }
    // the skirt: dead fan leaves hanging down, each strand a ridge, ragged at the bottom
    {
      const x0 = W * 0.75, y0 = H * 0.5, w = W * 0.25, h = H * 0.5;
      for (let i = 0; i < 300; i++) {
        const sx = x0 + r() * w, len = h * (0.55 + r() * 0.45), sw = 3 + r() * 7, col = ["#6e5536", "#7c6240", "#5e4830", "#8a7048", "#4e3c28", "#9a8058"][(r() * 6) | 0];
        if (HEIGHT) { const g = x.createLinearGradient(sx - sw, 0, sx + sw, 0); g.addColorStop(0, "#202020"); g.addColorStop(0.5, "#d0d0d0"); g.addColorStop(1, "#202020"); x.fillStyle = g; }
        else x.fillStyle = col;
        x.beginPath(); x.moveTo(sx - sw, y0); x.lineTo(sx + sw, y0); x.lineTo(sx + sw * 0.3 + (r() - 0.5) * 6, y0 + len); x.lineTo(sx - sw * 0.3, y0 + len * 0.96); x.closePath(); x.fill();
      }
    }
  };
  draw(cc.getContext("2d"), false);
  draw(hc.getContext("2d"), true);
  LEAFN = tex(normalFromHeight(hc, 2.2, false), false, false);
  return (LEAF = tex(cc, true, false));
}

// ---- bark, painted pixel by pixel from noise: colour and height (-> normal map) together ----
function vnoise(seed) {
  const P = new Float32Array(256 * 256); const r = mulberry(seed); for (let i = 0; i < P.length; i++) P[i] = r();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy; };
  return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += n(x * f, y * f) * a; f *= 2.02; a *= 0.5; } return s / (1 - Math.pow(0.5, oct)); };
}
const BARKS = {};
// kind: "smooth" (royal: pale grey, shallow ring scars, lichen), "rough" (coconut, fan palm:
// grey-brown, deep irregular rings, vertical fissures, fibres), "scales" (canary: overlapping
// leaf-base knuckles in a diamond lattice, fibrous brown)
function barkTexture(kind) {
  if (BARKS[kind]) return BARKS[kind];
  const W = 512, H = 1024;                                // u: once round the trunk; v: 1.6 m up it
  const cc = document.createElement("canvas"), hc = document.createElement("canvas");
  cc.width = hc.width = W; cc.height = hc.height = H;
  const ci = cc.getContext("2d").createImageData(W, H), hi = hc.getContext("2d").createImageData(W, H);
  const N = vnoise(kind === "smooth" ? 3 : kind === "rough" ? 5 : 9), r = mulberry(kind.length * 11);
  // tileable noise: sample on a torus-ish wrap by blending
  const tn = (u, v, su, sv, oct) => N(u * su, v * sv, oct);
  // ring positions (smooth/rough): irregular spacing, each ring wavy
  const rings = []; for (let v = 0; v < H;) { rings.push({ v, depth: 0.5 + r() * 0.5, amp: 2 + r() * 4, ph: r() * 6 }); v += (kind === "smooth" ? 34 : 26) + r() * 26; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const big = tn(u, v, 6, 12, 4), fine = tn(u, v, 60, 30, 3), fib = tn(u, v, 140, 6, 2);
    let h = 0.5, R, G, B;
    if (kind === "scales") {
      // diamond lattice of leaf bases: each a rounded knuckle, its upper edge a cut, fibrous rim
      const cols = 5, rows = 6, cu = u * cols, cv = v * rows + (Math.floor(cu) % 2) * 0.5;
      const fu = cu - Math.floor(cu) - 0.5, fv = cv - Math.floor(cv) - 0.5;
      const dd = Math.abs(fu) * 1.15 + Math.abs(fv);                       // diamond distance
      const dome = Math.max(0, 1 - dd * 1.9), edge = Math.max(0, 1 - Math.abs(dd - 0.52) * 9);
      const cut = fv > 0.05 ? Math.max(0, 1 - Math.abs(fv - 0.32) * 9) * (Math.abs(fu) < 0.4 ? 1 : 0) : 0;   // the stub's sawn top
      h = 0.25 + dome * 0.55 - edge * 0.2 + fib * 0.12 + fine * 0.08;
      const k = 0.78 + dome * 0.35 + (fine - 0.5) * 0.25;
      R = 150 * k + cut * 40; G = 120 * k + cut * 28; B = 84 * k + cut * 14;
      R -= edge * 30; G -= edge * 24; B -= edge * 16;
      // dried fibres in the crevices
      if (dd > 0.45) { const f = fib * 0.6; R = R * (1 - f) + 140 * f; G = G * (1 - f) + 112 * f; B = B * (1 - f) + 74 * f; }
    } else {
      // vertical fissures and fibres
      const fis = Math.pow(Math.max(0, 1 - Math.abs(tn(u, v, 24, 3, 3) - 0.5) * (kind === "rough" ? 9 : 14)), 2);
      h = 0.55 + (big - 0.5) * 0.3 + (fine - 0.5) * 0.15 - fis * (kind === "rough" ? 0.45 : 0.2) + (fib - 0.5) * (kind === "rough" ? 0.15 : 0.05);
      let ring = 0;
      for (const g of rings) { const d = Math.abs(y - (g.v + Math.sin(u * 6.283 * 2 + g.ph) * g.amp)); if (d < 6) ring = Math.max(ring, (1 - d / 6) * g.depth); }
      h -= ring * (kind === "rough" ? 0.5 : 0.35);
      if (kind === "smooth") {
        const k = 0.86 + (big - 0.5) * 0.3 + (fine - 0.5) * 0.12;
        R = 190 * k; G = 184 * k; B = 172 * k;
      } else {
        const k = 0.8 + (big - 0.5) * 0.35 + (fine - 0.5) * 0.2;
        R = 184 * k; G = 168 * k; B = 146 * k;
      }
      R -= ring * 50 + fis * 55; G -= ring * 46 + fis * 50; B -= ring * 42 + fis * 44;
      // lichen: pale grey-green patches on the smooth trunks, a few on the rough ones
      const li = tn(u, v, 10, 20, 3);
      const lich = Math.max(0, (li - (kind === "smooth" ? 0.62 : 0.7)) * 6) * (0.6 + fine * 0.4);
      if (lich > 0) { const f = Math.min(0.55, lich); R = R * (1 - f) + 176 * f; G = G * (1 - f) + 186 * f; B = B * (1 - f) + 156 * f; h += f * 0.08; }
      // weathering streaks running down
      const st = tn(u, v, 40, 1.5, 2); R *= 0.9 + st * 0.15; G *= 0.9 + st * 0.15; B *= 0.9 + st * 0.15;
    }
    ci.data[i] = Math.max(0, Math.min(255, R)); ci.data[i + 1] = Math.max(0, Math.min(255, G)); ci.data[i + 2] = Math.max(0, Math.min(255, B)); ci.data[i + 3] = 255;
    const hv = Math.max(0, Math.min(255, h * 255)); hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = hv; hi.data[i + 3] = 255;
  }
  cc.getContext("2d").putImageData(ci, 0, 0); hc.getContext("2d").putImageData(hi, 0, 0);
  return (BARKS[kind] = { map: tex(cc, true, true), normal: tex(normalFromHeight(hc, kind === "smooth" ? 2.5 : 4.5, true), false, true) });
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
  const bk = !frond && barkTexture(kind);
  const m = new THREE.MeshStandardMaterial(frond
    ? { map: leafAtlas(), normalMap: LEAFN, normalScale: new THREE.Vector2(1, 1), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0 }
    : { map: bk.map, normalMap: bk.normal, normalScale: new THREE.Vector2(1, 1), vertexColors: true, roughness: kind === "smooth" ? 0.78 : 0.92, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = (frond ? "#define FROND\n" : "") + sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;" + (frond ? "\nattribute float aTip;" : ""))
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + SWAY);
    // leaves let some light through: the underside glows a little when the sun is behind them
    if (frond) sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.16, 0.2, 0.08);");
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
    const H = 12 + variant * 2.5, { g, top } = trunkGeo({ H, lean: 0.35 + variant * 0.25, curve: 1.2, rad: t => 0.27 - t * 0.08, swell: t => Math.exp(-t * 10) * 0.35 + Math.exp(-(((t - 0.55) * 4) ** 2)) * 0.08, sides: far ? 6 : 10, segs: far ? 4 : 10, tint: 0xffffff });
    trunks.push(g);
    // the smooth green crown shaft
    const cs = trunkGeo({ H: 1.9, lean: 0, curve: 0, rad: t => 0.21 - t * 0.04, sides: far ? 6 : 10, segs: 2, tint: 0xa8d070 });
    cs.g.translate(top[0], top[1], 0); trunks.push(cs.g);
    crown([top[0], top[1] + 1.8], far ? 12 : 22, k => frondGeo({ L: 3.6 + r() * 1.0, rise: 0.9, droop: 0.35 + r() * 0.35, width: 1.4, fold: 0.6, seg: fseg, twist: 0.6, region: k % 9 === 8 ? AT.dead : AT.green, tint: tintOf(r) }),
      { pitch: (k, rr) => k % 9 === 8 ? -1.0 : (rr() - 0.3) * 0.7 });
  } else if (species === "coconut") {
    const H = 8.5 + variant * 2, { g, top } = trunkGeo({ H, lean: 1.6 + variant * 0.9, curve: 1.6, rad: t => 0.2 - t * 0.04, swell: t => Math.exp(-t * 8) * 0.5, sides: far ? 6 : 9, segs: far ? 4 : 10, tint: 0xf2ece4 });
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
    const H = 15 + variant * 3, { g, top } = trunkGeo({ H, lean: 0.25 + variant * 0.3, curve: 1.1, rad: t => 0.26 - t * 0.1, swell: t => Math.exp(-t * 12) * 0.5, sides: far ? 6 : 8, segs: far ? 4 : 10, tint: 0xf0e8dc });
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
  return { trunk: mergeAll(trunks.map(fix)), crown: mergeAll(crowns.map(fix)), barkKind: species === "canary" ? "scales" : species === "royal" ? "smooth" : "rough" };
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
  const leaf = palmMaterial(U, "leaf"), barks = { smooth: palmMaterial(U, "smooth"), rough: palmMaterial(U, "rough"), scales: palmMaterial(U, "scales") };
  for (const sp of SPECIES) for (let variant = 0; variant < 2; variant++) for (const far of [false, true]) {
    // far away one shape per species is plenty (half the draw calls)
    if (far && variant) continue;
    const items = list.filter(it => it[4] === sp && (far || (it[5] || 0) === variant));
    if (!items.length) continue;
    const b = build(sp, variant, far);
    instanced(b.trunk, barks[b.barkKind], items, far);
    instanced(b.crown, leaf, items, far);
  }
}
