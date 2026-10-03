// Palm City — shrubs, hedges, flowering bushes, agaves and grass, built the way the palms are: an
// atlas of real-looking foliage painted leaf by leaf onto a canvas (with a height pass that becomes
// a normal map, so every leaf catches the light), laid onto alpha-cut cards arranged round a dark
// core. Lit with soft "volume" normals, so a bush reads as one rounded mass of leaves, and swaying
// in the same wind as the palms.
import * as THREE from "../vendor/three.module.js";

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---- the foliage atlas (1024 x 512), five cells of 256 x 256 (top row) / 256 x 256 (bottom row):
// broad glossy leaves | small hedge leaves | bougainvillea (leaves + magenta bracts) | hibiscus
// (leaves + red flowers) on the top row; grass tuft | wildflower tuft | fern on the bottom row ----
const W = 1024, H = 512, C = 256;
const CELL = { broad: [0, 0], small: [1, 0], bougain: [2, 0], hibiscus: [3, 0], grass: [0, 1], flower: [1, 1], fern: [2, 1], dry: [3, 1] };
// uv rectangle [u0, u1, v0, v1] of a cell (canvas y runs down, uv v runs up)
export function cellUV(k) { const [cx, cy] = CELL[k]; return [cx * C / W, (cx + 1) * C / W, 1 - (cy + 1) * C / H, 1 - cy * C / H]; }

function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext("2d").getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const ox = out.getContext("2d"), img = ox.createImageData(w, h), d = img.data;
  const g = (x, y) => src[(Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = g(x + 1, y) - g(x - 1, y), dy = g(x, y + 1) - g(x, y - 1);
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4; d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}
const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const cc = mk(), hc = mk();
  for (const HEIGHT of [false, true]) {
    const x = (HEIGHT ? hc : cc).getContext("2d");
    const r = mulberry(31);
    if (HEIGHT) { x.fillStyle = "#000"; x.fillRect(0, 0, W, H); }
    // one leaf: an almond shape with a gradient and a midrib, at (px, py), pointing at angle a
    const leaf = (px, py, a, L, wd, col, light) => {
      x.save(); x.translate(px, py); x.rotate(a);
      x.beginPath(); x.moveTo(0, 0);
      x.quadraticCurveTo(L * 0.45, -wd, L, 0); x.quadraticCurveTo(L * 0.45, wd, 0, 0); x.closePath();
      if (HEIGHT) {
        const g = x.createLinearGradient(0, -wd, 0, wd); g.addColorStop(0, "#333"); g.addColorStop(0.5, "#bbb"); g.addColorStop(1, "#333");
        x.fillStyle = g; x.fill();
        x.strokeStyle = "#fff"; x.lineWidth = Math.max(0.8, wd * 0.12); x.beginPath(); x.moveTo(0, 0); x.lineTo(L * 0.92, 0); x.stroke();
      } else {
        const g = x.createLinearGradient(0, 0, L, 0); g.addColorStop(0, col[0]); g.addColorStop(0.7, col[1]); g.addColorStop(1, col[2]);
        x.fillStyle = g; x.fill();
        x.strokeStyle = light; x.lineWidth = Math.max(0.6, wd * 0.1); x.beginPath(); x.moveTo(0, 0); x.lineTo(L * 0.9, 0); x.stroke();
        // side veins on the big leaves
        if (L > 30) { x.lineWidth = 0.5; for (let k = 1; k < 6; k++) { const t = k / 6 * L * 0.85; x.beginPath(); x.moveTo(t, 0); x.lineTo(t + L * 0.1, -wd * 0.6); x.moveTo(t, 0); x.lineTo(t + L * 0.1, wd * 0.6); x.stroke(); } }
      }
      x.restore();
    };
    // a cluster of leaves on short stems spraying up and out from the bottom of a cell
    const cluster = (cx, cy, n, Lr, wr, colOf, extra) => {
      const ox = cx * C, oy = cy * C;
      x.save(); x.beginPath(); x.rect(ox, oy, C, C); x.clip();
      for (let i = 0; i < n; i++) {
        // fill a rounded mass: leaves from the base out to the edges of a dome
        const t = i / n, ang = -Math.PI / 2 + (r() - 0.5) * 2.6;
        const rad = (0.25 + r() * 0.65) * C * 0.42;
        // a rounded clump with a ragged edge, kept clear of the cell's borders (no straight cut edges)
        const px = ox + C / 2 + (r() - 0.5) * C * 0.72, py = oy + C * 0.5 + (r() - 0.5) * C * 0.72;
        const ex = (px - ox - C / 2) / (C * 0.36), ey = (py - oy - C * 0.5) / (C * 0.36);
        if (ex * ex + ey * ey > 0.8 + r() * 0.2) { i--; continue; }
        const L = Lr[0] + r() * (Lr[1] - Lr[0]), wd = L * (wr[0] + r() * (wr[1] - wr[0]));
        const [col, light] = colOf(r);
        if (!HEIGHT && i < n * 0.4) { x.strokeStyle = "#3a3020"; x.lineWidth = 1; x.beginPath(); x.moveTo(ox + C / 2 + (r() - 0.5) * 30, oy + C); x.lineTo(px, py); x.stroke(); }
        leaf(px, py, ang + (r() - 0.5) * 1.2, L, wd, col, light);
        if (extra && r() < extra.p) extra.draw(px + (r() - 0.5) * 20, py + (r() - 0.5) * 20);
      }
      x.restore();
    };
    const greenLeaf = (h0, l0) => r2 => { const h = h0 + (r2() - 0.5) * 16, l = l0 + (r2() - 0.5) * 10; return [[hsl(h, 45, l - 6), hsl(h, 50, l), hsl(h + 6, 45, l + 6)], hsl(h + 10, 40, l + 14)]; };
    // broad glossy leaves (ficus, croton): mostly deep green, a few variegated yellow / red crotons
    cluster(0, 0, 150, [32, 54], [0.28, 0.4], r2 => {
      const k = r2();
      if (k < 0.1) return [["#7a3a18", "#c8641c", "#e2b234"], "#f0d050"];
      if (k < 0.18) return [["#4a5a18", "#a8a428", "#d8c440"], "#f0e070"];
      return greenLeaf(104, 22)(r2);
    });
    // small hedge leaves (boxwood, ixora): many, tight
    cluster(1, 0, 520, [10, 17], [0.35, 0.5], greenLeaf(96, 26));
    // bougainvillea: papery magenta bracts over small leaves
    const bract = (px, py) => {
      if (HEIGHT) { x.fillStyle = "#999"; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); return; }
      const h = 318 + (r() - 0.5) * 24;
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(); x.fillStyle = hsl(h, 70, 46 + r() * 10); x.beginPath(); x.ellipse(px + Math.cos(a) * 4, py + Math.sin(a) * 4, 6, 4, a, 0, 7); x.fill(); }
      x.fillStyle = "#f4f0d0"; x.beginPath(); x.arc(px, py, 1.4, 0, 7); x.fill();
    };
    cluster(2, 0, 300, [14, 22], [0.35, 0.5], greenLeaf(100, 24), { p: 0.45, draw: bract });
    // hibiscus: big serrated leaves and five-petalled red / coral / yellow flowers
    const flower = (px, py) => {
      if (HEIGHT) { x.fillStyle = "#aaa"; x.beginPath(); x.arc(px, py, 11, 0, 7); x.fill(); return; }
      const pal = [["#c81e28", "#7a0a14"], ["#f26a4a", "#a8301e"], ["#f2c230", "#c07a10"], ["#e85a9a", "#9a1e5a"]][(r() * 4) | 0];
      for (let k = 0; k < 5; k++) {
        const a = k * 1.2566 + r() * 0.3, g = x.createRadialGradient(px, py, 0, px, py, 12);
        g.addColorStop(0, pal[1]); g.addColorStop(0.35, pal[0]); g.addColorStop(1, pal[0]);
        x.fillStyle = g; x.beginPath(); x.ellipse(px + Math.cos(a) * 6, py + Math.sin(a) * 6, 7, 5, a, 0, 7); x.fill();
      }
      x.strokeStyle = "#f8e060"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 7, py - 6); x.stroke();
    };
    cluster(3, 0, 130, [28, 42], [0.35, 0.5], greenLeaf(108, 22), { p: 0.22, draw: flower });
    // grass tufts: tapering blades from the root, green with straw tips and a few dead blades
    const tuft = (cx, cy, n, dry, flowers) => {
      const ox = cx * C, oy = cy * C;
      x.save(); x.beginPath(); x.rect(ox, oy, C, C); x.clip();
      for (let i = 0; i < n; i++) {
        const bx = ox + C / 2 + (r() - 0.5) * C * 0.5, by = oy + C;
        const len = C * (0.35 + r() * 0.6), lean = (r() - 0.5) * 1.1, w = 2.2 + r() * 2.8;
        const tx = bx + Math.sin(lean) * len, ty = by - Math.cos(lean) * len * 0.95;
        const mx = bx + Math.sin(lean * 0.4) * len * 0.5, my = by - len * 0.55;
        x.beginPath(); x.moveTo(bx - w, by); x.quadraticCurveTo(mx - w * 0.5, my, tx, ty); x.quadraticCurveTo(mx + w * 0.5, my, bx + w, by); x.closePath();
        if (HEIGHT) { x.fillStyle = "#888"; x.fill(); continue; }
        const dead = r() < (dry ? 0.6 : 0.12);
        const g = x.createLinearGradient(bx, by, tx, ty);
        if (dead) { g.addColorStop(0, "#6a5a32"); g.addColorStop(1, "#c8b47a"); }
        else { const h = 88 + r() * 20; g.addColorStop(0, hsl(h, 42, 20)); g.addColorStop(0.5, hsl(h, 46, 30 + r() * 8)); g.addColorStop(1, hsl(h - 22, 42, 48)); }
        x.fillStyle = g; x.fill();
      }
      if (flowers) for (let i = 0; i < 14; i++) {
        const px = ox + C * (0.25 + r() * 0.5), py = oy + C * (0.2 + r() * 0.45);
        if (HEIGHT) { x.fillStyle = "#aaa"; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); continue; }
        x.strokeStyle = "#3a5a1a"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 10, oy + C); x.stroke();
        const col = ["#f4f2ea", "#f2d22a", "#b07ad8", "#f08a2a"][(r() * 4) | 0];
        for (let k = 0; k < 6; k++) { const a = k * 1.047; x.fillStyle = col; x.beginPath(); x.ellipse(px + Math.cos(a) * 3.5, py + Math.sin(a) * 3.5, 3.2, 1.8, a, 0, 7); x.fill(); }
        x.fillStyle = "#e0a010"; x.beginPath(); x.arc(px, py, 1.8, 0, 7); x.fill();
      }
      x.restore();
    };
    tuft(0, 1, 120, false, false);
    tuft(1, 1, 90, false, true);
    tuft(3, 1, 110, true, false);
    // fern: arching fronds of paired leaflets
    {
      const ox = 2 * C, oy = C;
      x.save(); x.beginPath(); x.rect(ox, oy, C, C); x.clip();
      for (let f = 0; f < 7; f++) {
        const a = -Math.PI / 2 + (f - 3) * 0.33 + (r() - 0.5) * 0.1, L = C * (0.65 + r() * 0.3);
        const pt = t => [ox + C / 2 + Math.cos(a) * L * t + t * t * Math.cos(a) * 18, oy + C - Math.sin(-a) * L * t + t * t * 40];
        for (let k = 2; k < 26; k++) {
          const t = k / 26, [px, py] = pt(t), [qx, qy] = pt(t + 0.02), na = Math.atan2(qy - py, qx - px);
          const ll = (1 - t) * 26 + 4;
          for (const sd of [-1, 1]) leaf(px, py, na + sd * 1.2, ll, ll * 0.22, [hsl(100, 45, 20), hsl(98, 48, 28), hsl(90, 45, 36)], hsl(95, 35, 40));
        }
      }
      x.restore();
    }
  }
  return (ATLAS = { map: tex(cc, true), normal: tex(normalFromHeight(hc, 3.0), false) });
}

// ---- material: alpha-cut cards with the foliage normal map, soft volume normals, wind, and light
// through the leaves ----
function foliageMaterial(U, kind) {
  const A = atlas();
  const m = new THREE.MeshStandardMaterial({ map: A.map, normalMap: A.normal, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: kind === "grass" ? 0.85 : 0.55, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; attribute float aSway;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x * 0.31 + ip.z * 0.27;
          float s = aSway;
          transformed.x += (sin(uTime * 1.7 + ph + position.y * 2.0) * 0.6 + sin(uTime * 4.3 + ph * 2.0 + position.x * 5.0) * 0.25) * s;
          transformed.z += cos(uTime * 1.3 + ph * 1.3 + position.y * 1.5) * 0.45 * s;
        }`);
    // leaves let light through: a little glow from behind, and the darker inner leaves stay dark
    // foliage is lit by its soft volume normals from both sides: never flip them for back faces
    sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "1.0"));
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.12, 0.16, 0.06);");
  };
  m.customProgramCacheKey = () => "foliage-" + kind;
  return m;
}

// ---- geometry ----
function cards(list) {
  // list of { c: centre [x,y,z], n: volume normal, up, right, w, h, uv:[u0,u1,v0,v1], col, sway }
  const P = [], N = [], UV = [], CO = [], SW = [];
  for (const q of list) {
    const { c, n, up, right, w, h, uv, col, sway } = q;
    const corner = (a, b) => [c[0] + right[0] * a * w / 2 + up[0] * b * h, c[1] + right[1] * a * w / 2 + up[1] * b * h, c[2] + right[2] * a * w / 2 + up[2] * b * h];
    const vs = [[-1, 0, uv[0], uv[2], 0], [1, 0, uv[1], uv[2], 0], [1, 1, uv[1], uv[3], 1], [-1, 0, uv[0], uv[2], 0], [1, 1, uv[1], uv[3], 1], [-1, 1, uv[0], uv[3], 1]];
    for (const [a, b, u, v, top] of vs) {
      P.push(...corner(a, b)); N.push(...(q.nOf ? q.nOf(a, b) : n)); UV.push(u, v);
      const k = top ? col[1] : col[0]; CO.push(k[0], k[1], k[2]); SW.push(sway * (top ? 1 : 0.35));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(CO, 3));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(SW, 1));
  return g;
}
const norm = v => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// a bush: cards round a dome, each facing out; normals point out from the dome's centre so the
// whole bush shades as one soft mass; darker toward the bottom and the inside
function bushGeo(kind, seed, { R = 0.85, Hh = 1.0, n = 26, flat = 1 } = {}) {
  const r = mulberry(seed), uv = cellUV(kind), list = [];
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 1.05);          // more cards over the top than low down
    const d = norm([Math.sin(ph) * Math.cos(th), Math.cos(ph) * flat, Math.sin(ph) * Math.sin(th)]);
    const rr = 0.7 + r() * 0.35;
    const c = [d[0] * R * rr, Hh * 0.45 + d[1] * Hh * 0.55 * rr - 0.25, d[2] * R * rr];
    const right = norm(crossV([0, 1, 0], d[1] > 0.95 ? [1, 0, 0.01] : d)), up = norm(crossV(d, right));
    const size = 0.75 + r() * 0.45, ao = 0.55 + 0.45 * (c[1] / Hh);
    const tint = 0.86 + r() * 0.24;
    list.push({ c: [c[0] - up[0] * size * 0.35, c[1] - up[1] * size * 0.35, c[2] - up[2] * size * 0.35], up, right, w: size * R * 1.2, h: size * Hh * 0.95, uv,
      nOf: (a, b) => norm([d[0] + right[0] * a * 0.3 + up[0] * b * 0.3, d[1] + 0.25, d[2] + right[2] * a * 0.3 + up[2] * b * 0.3]),
      col: [[ao * 0.85 * tint, ao * 0.85 * tint, ao * 0.85 * tint], [tint, tint, tint]], sway: 0.025 });
  }
  return cards(list);
}
// grass tuft: three crossed cards, normals mostly up so it blends into the lawn
function tuftGeo(kind, w = 0.6, h = 0.42) {
  const uv = cellUV(kind), list = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, right = [Math.cos(a), 0, Math.sin(a)], d = [-Math.sin(a), 0, Math.cos(a)];
    list.push({ c: [0, 0, 0], up: [0, 1, 0], right, w, h, uv, n: norm([d[0] * 0.25, 1, d[2] * 0.25]), col: [[0.85, 0.85, 0.85], [1.05, 1.05, 1.05]], sway: 0.05 });
  }
  return cards(list);
}
// the dark interior every bush has, so there are no see-through holes in the middle
function coreGeo(R, Hh, col) {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  g.scale(R * 0.55, Hh * 0.36, R * 0.55); g.translate(0, Hh * 0.5, 0);
  const n = g.attributes.position.count, c = new THREE.Color(col);
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(0), 2));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  return g;
}
// agave: a rosette of thick, pointed, blue-grey leaves with darker spines at the tips
function agaveGeo() {
  const r = mulberry(5), P = [], CO = [];
  const leaves = 18;
  for (let i = 0; i < leaves; i++) {
    const a = i * 2.4, ring = i / leaves, L = 0.9 - ring * 0.45, tilt = 0.35 + ring * 0.9;
    const dir = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
    const seg = 5, w0 = 0.12;
    const pt = t => { const out = Math.sin(tilt) * L * t, up = Math.cos(tilt) * L * t - t * t * 0.15 * ring; return [dir[0] * out, up + 0.05, dir[2] * out]; };
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg, t1 = (s + 1) / seg, p0 = pt(t0), p1 = pt(t1), wa = w0 * (1 - t0), wb = w0 * (1 - t1);
      const q = [[p0, -wa], [p1, -wb], [p1, wb], [p0, -wa], [p1, wb], [p0, wa]];
      for (const [p, w] of q) {
        P.push(p[0] + side[0] * w, p[1] + Math.abs(w) * 0.3, p[2] + side[2] * w);
        const t = p === p0 ? t0 : t1, k = 0.8 + r() * 0.05;
        CO.push(...(t > 0.9 ? [0.25, 0.2, 0.15] : [0.33 * k + t * 0.05, 0.45 * k + t * 0.05, 0.4 * k]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(CO, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(new Float32Array(P.length / 3), 1));
  g.computeVertexNormals();
  return g;
}

const SPECIES = {
  broad: { R: 0.9, Hh: 1.15, n: 34, core: 0x2a3e18 },
  small: { R: 0.85, Hh: 0.9, n: 34, core: 0x2e4418, flat: 0.8 },
  bougain: { R: 1.0, Hh: 1.3, n: 34, core: 0x2a3e18 },
  hibiscus: { R: 0.9, Hh: 1.2, n: 34, core: 0x2a3e18 },
  fern: { R: 0.8, Hh: 0.7, n: 18, core: 0x2a3e18 },
};
export function mergeGeos(list) {
  const names = ["position", "normal", "uv", "color", "aSway"], out = new THREE.BufferGeometry();
  let total = 0; for (const g of list) total += g.attributes.position.count;
  for (const nm of names) {
    const size = list[0].attributes[nm].itemSize, arr = new Float32Array(total * size); let off = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// shrubs: list of [x, z, rotY, scale, species]; instanced(geo, mat, items, maxD, minD) places them
export function buildShrubs(U, list, instanced) {
  const leafMat = foliageMaterial(U, "leaf");
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  for (const sp of Object.keys(SPECIES)) {
    const items = list.filter(it => it[4] === sp);
    if (!items.length) continue;
    const S = SPECIES[sp];
    instanced(coreGeo(S.R, S.Hh, S.core), solid, items, 380, -Infinity);
    instanced(bushGeo(sp, sp.length * 7 + 3, S), leafMat, items, 110, -Infinity);
    // further out, fewer cards
    instanced(bushGeo(sp, sp.length * 7 + 5, { ...S, n: Math.ceil(S.n * 0.4) }), leafMat, items, 380, 110);
  }
  const ag = list.filter(it => it[4] === "agave");
  if (ag.length) instanced(agaveGeo(), solid, ag, 260, -Infinity);
}
// grass tufts and wildflowers: list of [x, z, rotY, scale, kind]
export function buildGrass(U, list, instanced, glsl) {
  const mat = foliageMaterial(U, "grass");
  // tint each tuft like the lawn under it: green where it's watered, straw where it isn't (the same
  // noise the lawn shader uses)
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    base(sh);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + glsl.split("float band(")[0] + "\nvarying float vDry;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        { vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]); vDry = smoothstep(0.4, 0.75, vnoise(wp * 0.09 + 17.0)); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vDry;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.5, 0.4, 0.1))) * vec3(1.35, 1.15, 0.6), vDry * 0.75);");
  };
  mat.customProgramCacheKey = () => "foliage-grass-tint";
  for (const kind of ["grass", "flower", "dry"]) {
    const items = list.filter(it => it[4] === kind);
    if (items.length) instanced(tuftGeo(kind, kind === "flower" ? 0.45 : 0.5, kind === "flower" ? 0.34 : 0.28), mat, items, 60, -Infinity);
  }
}
