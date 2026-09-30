// Palm City — procedural textures (seamless by construction; style formula palette).
// Split out of game.js. World textures are built via buildWorldTextures(), called from
// game.js at the exact point the old inline constants sat, so the seeded-RNG stream is
// consumed in the same order and the deterministic world stays byte-identical.
//
// DETERMINISM CONTRACT — the seeded world stream (rng/rr/pick) must be consumed in the
// same order and count as before, or the money:74507 checksum breaks. So the seeded draws
// are pinned: speckle() counts are fixed (asphalt 260 / sidewalk 200 / grass 240), the
// facade window loop spends exactly one rng() per cell (42), and the tower loop keeps its
// exact if(rng()<a) else if(rng()<b) branch shape (16 cells). Everything else — canvas
// resolution, gradients, baked AO/grime, and any Math.random() detail — is free of the
// seeded stream, and that headroom is where the richer look comes from. Canvas SIZE is
// free too: speckle() spends the same draws whatever `s` is.
//
// RESOLUTION — sized by texel density (how many pixels land on a world unit), not by
// picking a big round number. The road is the extreme case: one asphalt tile stretches 18
// units across but 118 along, so it was resolving ~4px per unit lengthwise and looked soft
// no matter what, while the sidewalk was already at ~116px/unit and had nothing to gain.
// Budget goes where the eye actually is. Normal maps stay lower: their per-pixel JS
// derivation is O(size²) and they carry low-frequency relief anyway.
import * as THREE from "./vendor/three.module.js";
import { rng, rr, pick } from "./util.js";

let MAXANISO = 1;   // set from the renderer before any texture is created
export function setAnisotropy(v) { MAXANISO = v; }

// global resolution multiplier — 1 on desktop, halved on phones (memory, not fill rate)
let TEX_SCALE = 1;
export function setTexScale(v) { TEX_SCALE = v; }
const S = base => Math.max(64, Math.round(base * TEX_SCALE));
// Detail counts scale with area so a bigger canvas gets proportionally more grains rather than
// the same few stretched thinner — but CAPPED. Uncapped, a 2048 tile wants 16x the strokes of a
// 512 one, and the canvas work (hundreds of thousands of ellipse fills) pushed cold load past 50
// seconds. Past ~4x the extra grains are under a pixel anyway, so the cap costs nothing visible.
const dens = (s, per512) => Math.round(per512 * Math.min(4, (s / 512) * (s / 512)));

export function canvasTex(size, draw, repX = 1, repY = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXANISO;            // crisp textures at grazing angles (distant roads/facades)
  t.repeat.set(repX, repY);
  return t;
}
// a linear (non-colour) data texture — for roughness maps, where the value IS the material
// parameter (white = rough/matte, black = smooth/glossy) and must not be gamma-decoded.
export function dataTex(size, draw, repX = 1, repY = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAXANISO;
  t.repeat.set(repX, repY);
  return t;
}
// derive a tangent-space normal map from a grayscale height field (dark = recessed, light = raised),
// so flat textured surfaces gain real relief under the sun. degrades to a flat normal when the test
// harness has no readable 2D context (getImageData unavailable).
export function canvasNormalTex(size, drawHeight, repX = 1, repY = 1, strength = 1) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, size, size);
  drawHeight(ctx, size);
  let src = null;
  try { const d = ctx.getImageData(0, 0, size, size); if (d && d.data) src = d.data; } catch (e) {}
  if (src) {
    const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
    const out = ctx.createImageData(size, size), o = out.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      o[i] = (dx * inv * 0.5 + 0.5) * 255;
      o[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      o[i + 2] = (inv * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);             // default (linear) colour space — correct for normal data
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = MAXANISO;
  return t;
}
// speckle that wraps across edges so the tile stays seamless. spends 4 seeded draws per grain
// (x, y, radius, colour) — the count `n` is part of the determinism contract; colours/radii are free.
export function speckle(ctx, s, n, colors, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = rng() * s, y = rng() * s, r = rr(r0, r1);
    ctx.fillStyle = pick(colors);
    for (const ox of [0, -s, s]) for (const oz of [0, -s, s]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oz, r, 0, 7); ctx.fill();
    }
  }
}

// ---- unseeded detail helpers (Math.random only — never touch the world stream) ----
const R = Math.random;
// a soft radial blob (grime, oil, stain), colour as rgba
function blob(ctx, x, y, rx, ry, rot, col, edge) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, col); g.addColorStop(1, edge || "rgba(0,0,0,0)");
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx, ry);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
}
// a jagged crack polyline
function crack(ctx, s, steps, spread, drift) {
  let x = R() * s, y = R() * s; ctx.beginPath(); ctx.moveTo(x, y);
  for (let k = 0; k < steps; k++) { x += (R() - 0.5) * spread; y += (drift || 0) + (R() - 0.5) * spread; ctx.lineTo(x, y); }
  ctx.stroke();
}
// a crack that splits into offshoots — reads as real fracture rather than a scribble
function branchCrack(ctx, s, len, spread, depth) {
  const walk = (x, y, ang, n, w) => {
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
    let cx = x, cy = y, a = ang;
    for (let k = 0; k < n; k++) {
      a += (R() - 0.5) * 0.9;
      cx += Math.cos(a) * spread; cy += Math.sin(a) * spread;
      ctx.lineTo(cx, cy);
      if (depth > 0 && k > 1 && R() < 0.22) walk(cx, cy, a + (R() < 0.5 ? 0.9 : -0.9), Math.max(2, (n - k) >> 1), w * 0.6);
    }
    ctx.stroke();
  };
  walk(R() * s, R() * s, R() * 6.28, len, 1.4);
}
// individual aggregate stones with a lit top and shaded underside — the single biggest
// "is this a photo or a fill colour" cue on asphalt and concrete up close
function aggregate(ctx, s, n, cols, r0, r1, lit, shade) {
  for (let i = 0; i < n; i++) {
    const x = R() * s, y = R() * s, r = r0 + R() * (r1 - r0);
    ctx.fillStyle = cols[(R() * cols.length) | 0];
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.7 + R() * 0.5), R() * 3, 0, 7); ctx.fill();
    ctx.fillStyle = lit; ctx.beginPath(); ctx.ellipse(x - r * 0.22, y - r * 0.28, r * 0.5, r * 0.34, R() * 3, 0, 7); ctx.fill();
    ctx.fillStyle = shade; ctx.beginPath(); ctx.ellipse(x + r * 0.26, y + r * 0.3, r * 0.42, r * 0.3, R() * 3, 0, 7); ctx.fill();
  }
}
// a fine per-pixel-ish grain field. fillRect rather than arc(): at these sizes a grain is a couple
// of pixels and reads identically either way, but the path-free version is several times faster,
// which matters when there are tens of thousands of them across the texture set.
function grain(ctx, s, n, colA, colB, r0, r1) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = R() < 0.5 ? colA : colB;
    const r = r0 + R() * (r1 - r0);
    ctx.fillRect(R() * s, R() * s, r * 2, r * 2);
  }
}
// hairline crazing — the fine web of surface cracks concrete develops with age
function crazing(ctx, s, n, len, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 0.7;
  for (let i = 0; i < n; i++) {
    let x = R() * s, y = R() * s, a = R() * 6.28;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { a += (R() - 0.5) * 1.6; x += Math.cos(a) * len; y += Math.sin(a) * len; ctx.lineTo(x, y); }
    ctx.stroke();
  }
}
// darken the tile's outer frame — cheap baked ambient occlusion at seams/edges
function edgeAO(ctx, s, inset, alpha) {
  const g = ctx.createLinearGradient(0, 0, 0, inset); g.addColorStop(0, "rgba(0,0,0," + alpha + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, inset);
  const g2 = ctx.createLinearGradient(0, s, 0, s - inset); g2.addColorStop(0, "rgba(0,0,0," + alpha + ")"); g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, s - inset, s, inset);
  const g3 = ctx.createLinearGradient(0, 0, inset, 0); g3.addColorStop(0, "rgba(0,0,0," + alpha + ")"); g3.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g3; ctx.fillRect(0, 0, inset, s);
  const g4 = ctx.createLinearGradient(s, 0, s - inset, 0); g4.addColorStop(0, "rgba(0,0,0," + alpha + ")"); g4.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g4; ctx.fillRect(s - inset, 0, inset, s);
}
// weathering that bleeds downward from a point — rain carrying dirt off a sill or ledge
function streaks(ctx, x0, x1, y, len, n, col, w) {
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), l = len * (0.35 + R() * 0.9);
    const g = ctx.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x, y, w * (0.5 + R()), l);
  }
}

export function buildWorldTextures() {
  // ===================== ROAD ASPHALT =====================
  // The lowest texel density in the game by a wide margin, and the surface you spend the whole game
  // looking at. The fix is NOT a huge canvas: one tile stretched 118 world units lengthwise, so the
  // cheap win is halving the tile (repeat 30 -> 60) and halving the dashes per tile with it. That
  // doubles lengthwise density for free, keeps the painted dash spacing on the road identical, and
  // costs a quarter of the memory and canvas work that 2048 @ repeat 30 would have.
  const ASPHALT_REPEAT = 60;
  const AS = S(1024);
  const texAsphalt = canvasTex(AS, (ctx, s) => {
    ctx.fillStyle = "#3c454c"; ctx.fillRect(0, 0, s, s);
    // Broad tonal zones, kept deliberately faint. At repeat 60 this tile lands on the road twice as
    // often as it used to, so any large-scale feature repeats twice as often too — push these and
    // they stop reading as worn asphalt and start reading as a pattern. Detail lives in the grain.
    for (let i = 0; i < 10; i++) blob(ctx, R() * s, R() * s, s * (0.05 + R() * 0.12), s * (0.04 + R() * 0.1), R() * 3, R() < 0.5 ? "rgba(70,80,88,.06)" : "rgba(26,30,34,.08)");
    speckle(ctx, s, 260, ["#525e66", "#454f57", "#5a6770", "#3c454c", "#616e77"], 1, 3);   // seeded — count pinned
    // real aggregate: individual stones, each catching a little light on top and shading beneath.
    // The highlight stays low-contrast — bright enough and a stone field turns into scattered litter.
    aggregate(ctx, s, dens(s, 1100), ["#5c686f", "#515c64", "#66727a", "#4a555d", "#6d7982"],
      s * 0.0009, s * 0.0026, "rgba(140,155,166,.13)", "rgba(14,18,22,.26)");
    grain(ctx, s, dens(s, 4200), "#5d6a72", "#363e44", s * 0.0004, s * 0.0011);   // fine grit carries the close-up detail
    // polished wheel ruts flanking a coarser crown
    const lane = s / 2;
    for (const wx of [lane - s * 0.17, lane + s * 0.17]) {
      const g = ctx.createLinearGradient(wx - s * 0.05, 0, wx + s * 0.05, 0);
      g.addColorStop(0, "rgba(18,22,26,0)"); g.addColorStop(0.5, "rgba(18,22,26,.32)"); g.addColorStop(1, "rgba(18,22,26,0)");
      ctx.fillStyle = g; ctx.fillRect(wx - s * 0.05, 0, s * 0.1, s);
    }
    // patched repairs — a rectangle of slightly different asphalt, sealed at the seam
    for (let i = 0; i < 9; i++) {
      const x = R() * s, y = R() * s, w = s * (0.03 + R() * 0.1), h = s * (0.02 + R() * 0.07);
      ctx.fillStyle = R() < 0.5 ? "rgba(24,28,32,.18)" : "rgba(60,68,74,.11)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(12,14,17,.5)"; ctx.lineWidth = Math.max(1.5, s * 0.0016); ctx.strokeRect(x, y, w, h);
    }
    for (let i = 0; i < 8; i++) blob(ctx, R() * s, R() * s, s * (0.005 + R() * 0.011), s * (0.004 + R() * 0.008), R() * 3, "rgba(10,11,14,.34)");   // oil
    ctx.strokeStyle = "rgba(18,22,25,.5)";
    for (let i = 0; i < 16; i++) branchCrack(ctx, s, 7, s * 0.014, 1);    // branching fractures
    // faint skid marks
    for (let i = 0; i < 4; i++) {
      const x = R() * s, y = R() * s, l = s * (0.05 + R() * 0.12);
      const g = ctx.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, "rgba(16,18,20,0)"); g.addColorStop(0.4, "rgba(16,18,20,.18)"); g.addColorStop(1, "rgba(16,18,20,0)");
      ctx.fillStyle = g; ctx.fillRect(x, y, s * 0.012, l);
    }
    ctx.fillStyle = "#333c42"; ctx.fillRect(0, 0, s * 0.035, s); ctx.fillRect(s - s * 0.035, 0, s * 0.035, s);   // gutter margins
    grain(ctx, s, dens(s, 260), "#2b3238", "#4a545c", s * 0.0008, s * 0.0026);   // debris collecting in the gutters
    // worn double-yellow centre line — chipped, dirt-washed, not a clean vector stripe.
    // 2 dashes per tile at repeat 60 lands the same spacing on the road as 4 did at repeat 30.
    const dash = s / 2, dw = s * 0.012;
    for (let y = 0; y < s; y += dash) for (const off of [-s * 0.014, s * 0.014]) {
      ctx.fillStyle = "#e6bf49"; ctx.fillRect(s / 2 + off - dw / 2, y, dw, dash * 0.5);
      ctx.fillStyle = "rgba(60,68,74,.4)";
      for (let k = 0; k < 22; k++) if (R() < 0.45) ctx.fillRect(s / 2 + off - dw / 2 + R() * dw, y + R() * dash * 0.5, dw * (0.2 + R() * 0.5), s * 0.0015);
    }
  }, 1, ASPHALT_REPEAT);
  // asphalt relief: stone grain + recessed cracks, gutter grooves, tar-seam ridges
  const texAsphaltNormal = canvasNormalTex(S(1024), (ctx, s) => {
    for (let i = 0; i < dens(s, 700); i++) { ctx.fillStyle = R() < 0.5 ? "#9a9a9a" : "#6a6a6a"; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.001 + R() * 0.0028), 0, 7); ctx.fill(); }
    ctx.fillStyle = "#666"; ctx.fillRect(0, 0, s * 0.035, s); ctx.fillRect(s - s * 0.035, 0, s * 0.035, s);
    ctx.strokeStyle = "#565656";
    for (let i = 0; i < 14; i++) branchCrack(ctx, s, 7, s * 0.014, 1);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = "#6d6d6d"; ctx.fillRect(R() * s, R() * s, s * (0.03 + R() * 0.1), s * (0.02 + R() * 0.07)); }
  }, 1, ASPHALT_REPEAT, 1.35);
  // asphalt roughness: dry aggregate is matte (bright), wheel paths & oil are polished (dark)
  const texAsphaltRough = dataTex(S(512), (ctx, s) => {
    ctx.fillStyle = "#c8c8c8"; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, dens(s, 700), "#e2e2e2", "#a6a6a6", s * 0.001, s * 0.0032);
    const lane = s / 2;
    for (const wx of [lane - s * 0.17, lane + s * 0.17]) {
      const g = ctx.createLinearGradient(wx - s * 0.028, 0, wx + s * 0.028, 0);
      g.addColorStop(0, "rgba(60,60,60,0)"); g.addColorStop(0.5, "rgba(60,60,60,.75)"); g.addColorStop(1, "rgba(60,60,60,0)");
      ctx.fillStyle = g; ctx.fillRect(wx - s * 0.028, 0, s * 0.056, s);
    }
    for (let i = 0; i < 10; i++) blob(ctx, R() * s, R() * s, s * (0.016 + R() * 0.03), s * (0.01 + R() * 0.02), R() * 3, "rgba(30,30,30,.85)");
  }, 1, ASPHALT_REPEAT);

  // ===================== SIDEWALK =====================
  // already ~116px per world unit at 512, so this gets a modest bump and spends its budget on
  // detail content (crazing, chips, moss in the joints) rather than raw pixels
  const texSidewalk = canvasTex(S(1024), (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, "#d3c9b2"); g.addColorStop(1, "#c4b99f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const step = s / 4;
    // per-slab tone variation — poured at different times, weathered differently
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = "rgba(" + (R() < 0.5 ? "255,250,235," : "120,112,94,") + (0.03 + R() * 0.07) + ")";
      ctx.fillRect(i * step, j * step, step, step);
    }
    speckle(ctx, s, 200, ["#dbd2bd", "#cabfa8", "#d0c5af", "#bfb298"], 1, 2.6);   // seeded — pinned
    aggregate(ctx, s, dens(s, 520), ["#cfc5ae", "#bdb29a", "#ded5c1", "#b0a48c"],
      s * 0.0011, s * 0.0028, "rgba(255,252,242,.34)", "rgba(90,82,66,.26)");
    grain(ctx, s, dens(s, 1100), "#e5ddc9", "#b3a88f", s * 0.0008, s * 0.0024);
    crazing(ctx, s, dens(s, 26), s * 0.02, "rgba(120,110,92,.24)");             // fine age web
    for (let i = 0; i < 8; i++) blob(ctx, R() * s, R() * s, s * (0.02 + R() * 0.045), s * (0.016 + R() * 0.032), R() * 3, "rgba(150,138,116,.16)");
    for (let i = 0; i < 10; i++) { ctx.fillStyle = "rgba(70,64,54,.45)"; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.002 + R() * 0.004), 0, 7); ctx.fill(); }   // gum
    ctx.strokeStyle = "rgba(120,110,92,.4)"; ctx.lineWidth = Math.max(1, s * 0.001);
    for (let i = 0; i < 7; i++) crack(ctx, s, 4, s * 0.06);
    // paver grid: shadowed recessed joint, moss in the crevice, bevel highlight on the lip
    for (let i = 0; i <= 4; i++) {
      const p = step * i;
      ctx.strokeStyle = "rgba(96,88,72,.55)"; ctx.lineWidth = Math.max(3, s * 0.004);
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
      ctx.strokeStyle = "rgba(104,116,74,.2)"; ctx.lineWidth = Math.max(2, s * 0.0022);   // moss
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
      ctx.strokeStyle = "rgba(240,234,216,.5)"; ctx.lineWidth = Math.max(1.2, s * 0.0014);
      ctx.beginPath(); ctx.moveTo(p + s * 0.002, 0); ctx.lineTo(p + s * 0.002, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p + s * 0.002); ctx.lineTo(s, p + s * 0.002); ctx.stroke();
    }
    // chipped slab corners
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (R() < 0.3) {
      ctx.fillStyle = "rgba(150,140,120,.5)";
      ctx.beginPath(); ctx.arc(step * i, step * j, s * (0.003 + R() * 0.006), 0, 7); ctx.fill();
    }
  }, 16, 16);
  const texSidewalkNormal = canvasNormalTex(S(768), (ctx, s) => {
    for (let i = 0; i < dens(s, 420); i++) { ctx.fillStyle = R() < 0.5 ? "#8f8f8f" : "#727272"; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.0012 + R() * 0.0026), 0, 7); ctx.fill(); }
    const step = s / 4;
    ctx.strokeStyle = "#535353"; ctx.lineWidth = Math.max(3, s * 0.005);
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke(); }
    ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = Math.max(1.2, s * 0.0018);
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p + s * 0.003, 0); ctx.lineTo(p + s * 0.003, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p + s * 0.003); ctx.lineTo(s, p + s * 0.003); ctx.stroke(); }
  }, 16, 16, 1.15);
  const texSidewalkRough = dataTex(S(512), (ctx, s) => {
    ctx.fillStyle = "#d0d0d0"; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, dens(s, 400), "#e6e6e6", "#b4b4b4", s * 0.001, s * 0.0028);
    const step = s / 4; ctx.strokeStyle = "#8c8c8c"; ctx.lineWidth = Math.max(3, s * 0.008);
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke(); }
    for (let i = 0; i < 6; i++) blob(ctx, R() * s, R() * s, s * (0.02 + R() * 0.035), s * (0.016 + R() * 0.024), R() * 3, "rgba(120,120,120,.6)");
  }, 16, 16);

  // ===================== GRASS =====================
  const texGrass = canvasTex(S(768), (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, "#82b56b"); g.addColorStop(1, "#71a15c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) blob(ctx, R() * s, R() * s, s * (0.04 + R() * 0.13), s * (0.035 + R() * 0.11), R() * 3, R() < 0.5 ? "rgba(150,196,118,.2)" : "rgba(78,120,64,.22)");
    for (let i = 0; i < 5; i++) blob(ctx, R() * s, R() * s, s * (0.02 + R() * 0.05), s * (0.018 + R() * 0.04), R() * 3, "rgba(150,132,96,.3)");   // worn dirt patches
    speckle(ctx, s, 240, ["#8dc077", "#76a861", "#95c982", "#6c9a57", "#a3d18c"], 2, 6);   // seeded — pinned
    // individual blades, leaning in clumps rather than uniformly scattered
    ctx.lineWidth = Math.max(1, s * 0.0013);
    for (let c = 0; c < dens(s, 90); c++) {
      const cx = R() * s, cy = R() * s, tilt = -1.4 + (R() - 0.5) * 0.7;
      for (let i = 0; i < 14; i++) {
        const x = cx + (R() - 0.5) * s * 0.03, y = cy + (R() - 0.5) * s * 0.03;
        const len = s * (0.005 + R() * 0.011), a = tilt + (R() - 0.5) * 0.5;
        ctx.strokeStyle = R() < 0.5 ? "rgba(140,190,110,.5)" : "rgba(70,110,58,.5)";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
    }
    for (let i = 0; i < dens(s, 14); i++) { ctx.fillStyle = ["#f4e26a", "#f0f0f0", "#e88fb0"][(R() * 3) | 0]; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.0018 + R() * 0.0018), 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }, 12, 12);

  // leafy mottle for tree/palm canopies (tinted green per-instance) — light & dark leaf clusters
  const texLeaf = canvasTex(S(192), (ctx, s) => {
    ctx.fillStyle = "#eef3df"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < dens(s, 900); i++) { const t = R(); ctx.fillStyle = t < 0.4 ? "rgba(58,80,40,.5)" : t < 0.7 ? "rgba(96,132,66,.45)" : "rgba(255,255,255,.42)"; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.008 + R() * 0.022), 0, 7); ctx.fill(); }
  }, 3, 3);
  // zebra crosswalk (white bars on transparent), 1:1 (no tiling)
  const texCrosswalk = canvasTex(S(128), (ctx, s) => {
    ctx.clearRect(0, 0, s, s); const bars = 5, bw = s / (bars * 2 - 1);
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = "#eef0ee"; ctx.fillRect(i * bw * 2, 0, bw, s);
      ctx.fillStyle = "rgba(70,78,84,.25)";                       // tyre wear scuffing the paint
      for (let k = 0; k < 40; k++) if (R() < 0.5) ctx.fillRect(i * bw * 2 + R() * bw, R() * s, bw * (0.15 + R() * 0.4), s * 0.012);
    }
  }, 1, 1);
  // lane turn-arrow (points toward +Z = away from viewer / toward the intersection), white on transparent
  const texArrow = canvasTex(S(128), (ctx, s) => {
    ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#e7ebe4"; const cx = s / 2;
    ctx.fillRect(cx - s * 0.07, s * 0.34, s * 0.14, s * 0.5);    // shaft
    ctx.beginPath(); ctx.moveTo(cx, s * 0.12); ctx.lineTo(cx - s * 0.22, s * 0.42); ctx.lineTo(cx + s * 0.22, s * 0.42); ctx.closePath(); ctx.fill();  // head
    ctx.fillStyle = "rgba(70,78,84,.22)";
    for (let k = 0; k < 90; k++) if (R() < 0.5) ctx.fillRect(cx - s * 0.24 + R() * s * 0.48, s * 0.1 + R() * s * 0.76, s * 0.02, s * 0.012);
  }, 1, 1);

  // ===================== MID-RISE FACADE =====================
  // repeat(1,1) over a whole building face — the second-lowest density in the game, and it is
  // most of what you see above street level, so it gets the same big canvas as the road.
  const FC = S(1024);   // 2048 was measured at +6.7s cold load for +16MB — the upload and mip chain dominate, not the drawing. 1024 still doubles the original density.
  const texFacade = canvasTex(FC, (ctx, s) => {
    const band = s * 0.172;                                   // street-level storefront band
    const wg = ctx.createLinearGradient(0, 0, 0, s); wg.addColorStop(0, "#f5eedf"); wg.addColorStop(0.6, "#e7dcc8"); wg.addColorStop(1, "#d8ccb6");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s, s);
    // stucco: fine plaster tooth + broad trowel mottle (deterministic index walk, no seeded draw)
    for (let i = 0; i < dens(s, 1600); i++) { const x = (i * 113) % s, y = (i * 197) % s; ctx.fillStyle = (i & 1) ? "rgba(255,255,255,.05)" : "rgba(86,74,58,.055)"; ctx.fillRect(x, y, s * 0.004, s * 0.004); }
    grain(ctx, s, dens(s, 900), "rgba(255,255,255,.05)", "rgba(96,84,66,.06)", s * 0.0009, s * 0.0026);
    for (let i = 0; i < 16; i++) blob(ctx, R() * s, R() * s, s * (0.04 + R() * 0.12), s * (0.03 + R() * 0.1), R() * 3, R() < 0.5 ? "rgba(255,250,238,.07)" : "rgba(104,92,74,.07)");
    edgeAO(ctx, s, s * 0.05, 0.22);                            // corner occlusion so buildings read solid
    // storefront: recessed band, lintel shadow, awning, glazing, door
    ctx.fillStyle = "#cabda4"; ctx.fillRect(0, s - band, s, band);
    ctx.fillStyle = "rgba(60,50,38,.4)"; ctx.fillRect(0, s - band, s, s * 0.012);
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? "#c65b52" : "#efe7d6"; ctx.fillRect(k * s / 8, s - band + s * 0.012, s / 8, s * 0.023); }
    const bays = 4, bw = (s - s * 0.062) / bays;
    for (let k = 0; k < bays; k++) {
      const gx = s * 0.031 + k * bw + s * 0.012, gy0 = s - band + s * 0.05, gh = band - s * 0.078;
      const gg = ctx.createLinearGradient(gx, gy0, gx, gy0 + gh); gg.addColorStop(0, "#9fb6c6"); gg.addColorStop(1, "#5f7c92");
      ctx.fillStyle = gg; ctx.fillRect(gx, gy0, bw - s * 0.023, gh);
      ctx.fillStyle = "rgba(255,255,255,.14)";
      ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx + (bw - s * 0.023) * 0.5, gy0); ctx.lineTo(gx, gy0 + gh * 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#6b5a44"; ctx.fillRect(s / 2 - s * 0.051, s - band + s * 0.031, s * 0.102, band - s * 0.047);
    const cols = 6, rows = 7, ww = s * 0.086, wh = s * 0.07;
    for (let cy = 0; cy < rows; cy++) {
      const y = s * 0.047 + cy * ((s - band - s * 0.094) / rows);
      ctx.fillStyle = "rgba(120,106,84,.3)"; ctx.fillRect(0, y + wh + s * 0.012, s, s * 0.006);
      ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(0, y + wh + s * 0.018, s, s * 0.002);
    }
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = s * 0.055 + cx * ((s - s * 0.11) / cols) + s * 0.016, y = s * 0.047 + cy * ((s - band - s * 0.094) / rows);
      streaks(ctx, x - s * 0.008, x + ww + s * 0.008, y + wh + s * 0.01, s * 0.055, 7, "rgba(104,92,72,.16)", s * 0.004);   // dirt washing off the sill
      ctx.fillStyle = "rgba(40,32,22,.28)"; ctx.fillRect(x - s * 0.008, y + wh, ww + s * 0.016, s * 0.01);
      ctx.fillStyle = "#c3b89f"; ctx.fillRect(x - s * 0.008, y - s * 0.008, ww + s * 0.016, wh + s * 0.016);
      ctx.fillStyle = "#a89d84"; ctx.fillRect(x - s * 0.008, y - s * 0.008, ww + s * 0.016, s * 0.006);
      if (rng() < 0.3) {                                       // seeded — exactly one draw per cell
        const lg = ctx.createLinearGradient(x, y, x, y + wh); lg.addColorStop(0, "#fff0c8"); lg.addColorStop(1, "#ffcf86");
        ctx.fillStyle = lg; ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = "rgba(120,80,30,.3)";                  // a hint of furniture behind the glass
        ctx.fillRect(x + ww * 0.1, y + wh * 0.55, ww * 0.3, wh * 0.45);
        ctx.fillRect(x + ww * 0.6, y + wh * 0.4, ww * 0.25, wh * 0.6);
        ctx.fillStyle = "rgba(180,120,40,.25)"; ctx.fillRect(x + ww * 0.5 - s * 0.001, y, s * 0.002, wh);
      } else {
        const gg = ctx.createLinearGradient(x, y, x, y + wh);
        gg.addColorStop(0, "#aecadd"); gg.addColorStop(0.45, "#8aa6ba"); gg.addColorStop(0.5, "#7b98ac"); gg.addColorStop(1, "#63808f");
        ctx.fillStyle = gg; ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,.2)";                // sky caught in the corner of the pane
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ww * 0.6, y); ctx.lineTo(x, y + wh * 0.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(x, y + wh * 0.62, ww, wh * 0.06);   // horizon line in the reflection
        ctx.strokeStyle = "rgba(30,44,56,.25)"; ctx.lineWidth = Math.max(1, s * 0.0008); ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1);
        ctx.fillStyle = "rgba(30,44,56,.2)"; ctx.fillRect(x + ww * 0.5 - s * 0.0008, y, s * 0.0016, wh);
      }
    }
  });
  // night windows: black facade with a random subset of windows lit (used as an emissive map after dark)
  const texWindows = canvasTex(S(1024), (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const band = s * 0.172, cols = 6, rows = 7, ww = s * 0.086, wh = s * 0.07;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      if (Math.random() < 0.5) continue;
      const x = s * 0.055 + cx * ((s - s * 0.11) / cols) + s * 0.016, y = s * 0.047 + cy * ((s - band - s * 0.094) / rows);
      const lg = ctx.createLinearGradient(x, y, x, y + wh); const warm = Math.random() < 0.5;
      lg.addColorStop(0, warm ? "#ffe7b3" : "#fff2cf"); lg.addColorStop(1, warm ? "#ffcf7d" : "#ffe09a");
      ctx.fillStyle = lg; ctx.fillRect(x, y, ww, wh);
      ctx.fillStyle = "rgba(0,0,0,.35)";                       // silhouettes breaking up the glow
      ctx.fillRect(x + ww * 0.12, y + wh * 0.5, ww * 0.28, wh * 0.5);
    }
  });
  const texFacadeNormal = canvasNormalTex(S(1024), (ctx, s) => {
    const band = s * 0.172, cols = 6, rows = 7, ww = s * 0.086, wh = s * 0.07;
    ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, dens(s, 500), "#949494", "#848484", s * 0.0012, s * 0.003);   // plaster tooth
    ctx.fillStyle = "#767676"; ctx.fillRect(0, s - band, s, band);
    for (let cy = 0; cy < rows; cy++) { const y = s * 0.047 + cy * ((s - band - s * 0.094) / rows); ctx.fillStyle = "#7c7c7c"; ctx.fillRect(0, y + wh + s * 0.012, s, s * 0.006); }
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = s * 0.055 + cx * ((s - s * 0.11) / cols) + s * 0.016, y = s * 0.047 + cy * ((s - band - s * 0.094) / rows);
      ctx.fillStyle = "#c4c4c4"; ctx.fillRect(x - s * 0.008, y - s * 0.008, ww + s * 0.016, wh + s * 0.016);
      ctx.fillStyle = "#565656"; ctx.fillRect(x, y, ww, wh);
    }
  }, 1, 1, 1.2);

  // ===================== GLASS TOWER =====================
  const texTower = canvasTex(S(1024), (ctx, s) => {
    const fg = ctx.createLinearGradient(0, 0, s, 0); fg.addColorStop(0, "#7f97aa"); fg.addColorStop(0.5, "#9cb2c2"); fg.addColorStop(1, "#7a92a5");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, s, s);
    const R4 = 4, cell = s / R4, p = cell * 0.12;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      const x = cx * cell + p, y = cy * cell + p, w = cell - 2 * p, hh = cell - 2 * p;
      let top, bot;
      if (rng() < 0.2) { top = "#fff2cc"; bot = "#ffd98a"; }            // seeded branch shape — pinned
      else if (rng() < 0.5) { top = "#8fb0cf"; bot = "#48627d"; }
      else { top = "#9ec1d2"; bot = "#567f92"; }
      const g = ctx.createLinearGradient(x, y, x, y + hh);
      g.addColorStop(0, top); g.addColorStop(0.5, bot); g.addColorStop(1, top);   // sky over ground, doubled
      ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
      // a soft cloud smear drifting across the pane, and the horizon band
      ctx.fillStyle = "rgba(255,255,255,.1)";
      ctx.beginPath(); ctx.ellipse(x + w * (0.3 + R() * 0.4), y + hh * (0.2 + R() * 0.25), w * 0.34, hh * 0.1, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x, y + hh * 0.48, w, hh * 0.035);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.42, y); ctx.lineTo(x, y + hh * 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(x, y, w, s * 0.0025);
      ctx.fillStyle = "rgba(16,26,36,.22)"; ctx.fillRect(x, y + hh - s * 0.0025, w, s * 0.0025);
    }
    // curtain-wall structure: mullions plus a shadowed spandrel at each floor line
    ctx.strokeStyle = "rgba(52,66,78,.55)"; ctx.lineWidth = Math.max(2, s * 0.0025);
    for (let i = 0; i <= R4; i++) { const q2 = cell * i; ctx.beginPath(); ctx.moveTo(q2, 0); ctx.lineTo(q2, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, q2); ctx.lineTo(s, q2); ctx.stroke(); }
    for (let i = 0; i < R4; i++) { ctx.fillStyle = "rgba(40,52,64,.3)"; ctx.fillRect(0, i * cell + cell - p, s, p); }
  }, 2, 7);
  const texTowerWin = canvasTex(S(512), (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const R4 = 4, cell = s / R4, p = cell * 0.16;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      if (Math.random() < 0.55) continue;
      const x = cx * cell + p, y = cy * cell + p, w = cell - 2 * p, hh = cell - 2 * p;
      const lg = ctx.createLinearGradient(x, y, x, y + hh); const warm = Math.random() < 0.5;
      lg.addColorStop(0, warm ? "#ffe7b3" : "#cfe3ff"); lg.addColorStop(1, warm ? "#ffcf7d" : "#a9c8ff");
      ctx.fillStyle = lg; ctx.fillRect(x, y, w, hh);
    }
  }, 2, 7);
  const texTowerRough = dataTex(S(512), (ctx, s) => {
    ctx.fillStyle = "#5a5a5a"; ctx.fillRect(0, 0, s, s);
    const R4 = 4, cell = s / R4, p = cell * 0.12;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) { ctx.fillStyle = "#242424"; ctx.fillRect(cx * cell + p, cy * cell + p, cell - 2 * p, cell - 2 * p); }
  }, 2, 7);

  // ===================== RUN-DOWN APARTMENT =====================
  const texGhetto = canvasTex(S(1024), (ctx, s) => {
    const wg = ctx.createLinearGradient(0, 0, 0, s); wg.addColorStop(0, "#a2947f"); wg.addColorStop(1, "#8b8070");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, dens(s, 900), "#8a7e6c", "#a89c88", s * 0.0016, s * 0.0055);
    for (let i = 0; i < 16; i++) blob(ctx, R() * s, R() * s, s * (0.05 + R() * 0.14), s * (0.045 + R() * 0.12), R() * 3, R() < 0.5 ? "rgba(60,52,40,.2)" : "rgba(120,108,90,.18)");
    // patches where the stucco has spalled off to the brick underneath
    for (let i = 0; i < 5; i++) {
      const px = R() * s, py = R() * s, pw = s * (0.04 + R() * 0.08), phh = s * (0.03 + R() * 0.06);
      ctx.fillStyle = "rgba(122,74,58,.5)"; ctx.beginPath(); ctx.ellipse(px, py, pw, phh, R() * 3, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(70,50,40,.35)"; ctx.lineWidth = Math.max(1, s * 0.0012);
      for (let b = 0; b < 7; b++) { const by = py - phh + (b / 7) * phh * 2; ctx.beginPath(); ctx.moveTo(px - pw, by); ctx.lineTo(px + pw, by); ctx.stroke(); }
    }
    streaks(ctx, 0, s, 0, s * 0.5, dens(s, 30), "rgba(90,60,36,.22)", s * 0.004);   // rust bleeding down the wall
    edgeAO(ctx, s, s * 0.035, 0.24);
    const R4 = 4, cell = s / R4, p = cell * 0.2;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      const wx = cx * cell + p, wy = cy * cell + p, ww = cell - 2 * p, wh = cell - 2 * p;
      ctx.fillStyle = "rgba(40,32,22,.3)"; ctx.fillRect(wx - s * 0.002, wy - s * 0.002, ww + s * 0.004, wh + s * 0.004);
      if (Math.random() < 0.35) {
        ctx.fillStyle = "#6b5236"; ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = "#4a3724"; ctx.lineWidth = Math.max(2, s * 0.002);
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy + wh); ctx.moveTo(wx + ww, wy); ctx.lineTo(wx, wy + wh); ctx.stroke();
        for (let b = 0; b < 4; b++) { const by = wy + (b / 4) * wh; ctx.strokeStyle = "rgba(58,44,30,.7)"; ctx.beginPath(); ctx.moveTo(wx, by); ctx.lineTo(wx + ww, by); ctx.stroke(); }
      } else {
        const gg = ctx.createLinearGradient(wx, wy, wx, wy + wh); gg.addColorStop(0, "#454b52"); gg.addColorStop(1, "#2f343b");
        ctx.fillStyle = gg; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(wx, wy, ww, s * 0.003);
      }
      streaks(ctx, wx, wx + ww, wy + wh, s * 0.06, 5, "rgba(70,54,38,.2)", s * 0.003);
    }
    ctx.strokeStyle = "rgba(40,32,24,.5)";
    for (let i = 0; i < 9; i++) branchCrack(ctx, s, 6, s * 0.02, 1);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = ["#c0476b", "#3fa0d0", "#e0b020", "#5fb060"][(R() * 4) | 0]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(R() * s, R() * s, s * (0.012 + R() * 0.016), 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }, 2, 3);
  const texGhettoWin = canvasTex(S(512), (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const R4 = 4, cell = s / R4, p = cell * 0.2;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      if (Math.random() < 0.78) continue;                  // few lights on in the rough part of town
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd98a" : "#d9c089";
      ctx.fillRect(cx * cell + p, cy * cell + p, cell - 2 * p, cell - 2 * p);
    }
  }, 2, 3);

  return {
    texAsphalt, texAsphaltNormal, texAsphaltRough,
    texSidewalk, texSidewalkNormal, texSidewalkRough,
    texGrass, texLeaf, texCrosswalk, texArrow,
    texFacade, texWindows, texFacadeNormal,
    texTower, texTowerWin, texTowerRough,
    texGhetto, texGhettoWin,
  };
}
