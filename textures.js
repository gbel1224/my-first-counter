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
// seeded stream, and that headroom is where the richer "AA" look comes from.
import * as THREE from "./vendor/three.module.js";
import { rng, rr, pick } from "./util.js";

let MAXANISO = 1;   // set from the renderer before any texture is created
export function setAnisotropy(v) { MAXANISO = v; }

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
// a fine per-pixel-ish grain field of tiny dots
function grain(ctx, s, n, colA, colB, r0, r1) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = R() < 0.5 ? colA : colB; ctx.beginPath(); ctx.arc(R() * s, R() * s, r0 + R() * (r1 - r0), 0, 7); ctx.fill(); }
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

export function buildWorldTextures() {
  // ===================== ROAD ASPHALT =====================
  const texAsphalt = canvasTex(512, (ctx, s) => {
    // deep charcoal base with a faint cool cast + broad tonal blotches so it never reads as flat grey
    ctx.fillStyle = "#3c454c"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 12; i++) blob(ctx, R() * s, R() * s, 40 + R() * 90, 34 + R() * 80, R() * 3, R() < 0.5 ? "rgba(70,80,88,.16)" : "rgba(26,30,34,.20)");
    speckle(ctx, s, 260, ["#525e66", "#454f57", "#5a6770", "#3c454c", "#616e77"], 1, 3);   // aggregate (seeded — count pinned)
    grain(ctx, s, 900, "#6b7880", "#333b41", 0.4, 1.3);                                     // fine chip grain (unseeded)
    // lane wear: two darker, polished wheel paths flanking a lighter crown
    const lane = s / 2;
    for (const wx of [lane - s * 0.17, lane + s * 0.17]) { const g = ctx.createLinearGradient(wx - 24, 0, wx + 24, 0); g.addColorStop(0, "rgba(18,22,26,0)"); g.addColorStop(0.5, "rgba(18,22,26,.34)"); g.addColorStop(1, "rgba(18,22,26,0)"); ctx.fillStyle = g; ctx.fillRect(wx - 24, 0, 48, s); }
    // tar-seam patches
    for (let i = 0; i < 7; i++) { ctx.fillStyle = "rgba(24,28,32,.34)"; const x = R() * s, y = R() * s, w = 24 + R() * 60, h = 16 + R() * 40; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "rgba(12,14,17,.5)"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
    for (let i = 0; i < 6; i++) blob(ctx, R() * s, R() * s, 10 + R() * 18, 6 + R() * 11, R() * 3, "rgba(10,11,14,.5)");   // oil stains
    ctx.strokeStyle = "rgba(18,22,25,.55)"; ctx.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) crack(ctx, s, 6, 42);                                       // cracks
    ctx.fillStyle = "#333c42"; ctx.fillRect(0, 0, 18, s); ctx.fillRect(s - 18, 0, 18, s);   // gutter margins
    // worn double-yellow centre line (128 divides 512 → seamless dashes)
    for (let y = 0; y < s; y += 128) { for (const off of [-7, 7]) { ctx.fillStyle = "#e6bf49"; ctx.fillRect(s / 2 + off - 3, y, 6, 64); ctx.fillStyle = "rgba(60,68,74,.35)"; for (let k = 0; k < 5; k++) if (R() < 0.4) ctx.fillRect(s / 2 + off - 3, y + k * 13, 6, 3); } }  // paint wear
  }, 1, 30);
  // asphalt relief: pebble grain + recessed cracks, gutter grooves, tar-seam ridges
  const texAsphaltNormal = canvasNormalTex(384, (ctx, s) => {
    for (let i = 0; i < 520; i++) { ctx.fillStyle = R() < 0.5 ? "#9a9a9a" : "#6a6a6a"; ctx.beginPath(); ctx.arc(R() * s, R() * s, 1 + R() * 2.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#666"; ctx.fillRect(0, 0, 18, s); ctx.fillRect(s - 18, 0, 18, s);      // gutter grooves
    ctx.strokeStyle = "#565656"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) crack(ctx, s, 6, 42);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = "#6d6d6d"; ctx.fillRect(R() * s, R() * s, 24 + R() * 60, 16 + R() * 40); }  // sunk tar patches
  }, 1, 30, 1.3);
  // asphalt roughness: dry aggregate is matte (bright), wheel paths & oil are polished (dark)
  const texAsphaltRough = dataTex(256, (ctx, s) => {
    ctx.fillStyle = "#c8c8c8"; ctx.fillRect(0, 0, s, s);                                    // dry, matte
    grain(ctx, s, 700, "#e2e2e2", "#a6a6a6", 0.5, 1.6);
    const lane = s / 2;
    for (const wx of [lane - s * 0.17, lane + s * 0.17]) { const g = ctx.createLinearGradient(wx - 14, 0, wx + 14, 0); g.addColorStop(0, "rgba(60,60,60,0)"); g.addColorStop(0.5, "rgba(60,60,60,.75)"); g.addColorStop(1, "rgba(60,60,60,0)"); ctx.fillStyle = g; ctx.fillRect(wx - 14, 0, 28, s); }  // polished ruts
    for (let i = 0; i < 8; i++) blob(ctx, R() * s, R() * s, 8 + R() * 16, 5 + R() * 10, R() * 3, "rgba(30,30,30,.85)");   // glossy oil
  }, 1, 30);

  // ===================== SIDEWALK =====================
  const texSidewalk = canvasTex(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, "#d3c9b2"); g.addColorStop(1, "#c4b99f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 200, ["#dbd2bd", "#cabfa8", "#d0c5af", "#bfb298"], 1, 2.6);   // aggregate (seeded — pinned)
    grain(ctx, s, 520, "#e5ddc9", "#b3a88f", 0.4, 1.2);
    for (let i = 0; i < 5; i++) blob(ctx, R() * s, R() * s, 12 + R() * 22, 9 + R() * 16, R() * 3, "rgba(150,138,116,.16)");   // stains
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "rgba(70,64,54,.5)"; ctx.beginPath(); ctx.arc(R() * s, R() * s, 2 + R() * 3, 0, 7); ctx.fill(); }   // gum / spots
    ctx.strokeStyle = "rgba(120,110,92,.4)"; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) crack(ctx, s, 4, 30);
    // 4×4 paver grid with a light bevel highlight + recessed shadowed joint (baked AO)
    const step = s / 4;
    for (let i = 0; i <= 4; i++) {
      const p = step * i;
      ctx.strokeStyle = "rgba(96,88,72,.55)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
      ctx.strokeStyle = "rgba(240,234,216,.5)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p + 2, 0); ctx.lineTo(p + 2, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p + 2); ctx.lineTo(s, p + 2); ctx.stroke();
    }
  }, 16, 16);
  // sidewalk relief: faint grain + recessed expansion joints between the paving slabs
  const texSidewalkNormal = canvasNormalTex(384, (ctx, s) => {
    for (let i = 0; i < 280; i++) { ctx.fillStyle = R() < 0.5 ? "#8f8f8f" : "#727272"; ctx.beginPath(); ctx.arc(R() * s, R() * s, 1 + R() * 1.8, 0, 7); ctx.fill(); }
    const step = s / 4;
    ctx.strokeStyle = "#535353"; ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke(); }
    ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 1.4;                                        // bevel highlight ridge
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p + 2, 0); ctx.lineTo(p + 2, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p + 2); ctx.lineTo(s, p + 2); ctx.stroke(); }
  }, 16, 16, 1.1);
  // sidewalk roughness: slab faces matte, joints & stains a touch smoother
  const texSidewalkRough = dataTex(256, (ctx, s) => {
    ctx.fillStyle = "#d0d0d0"; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 400, "#e6e6e6", "#b4b4b4", 0.5, 1.4);
    const step = s / 4; ctx.strokeStyle = "#8c8c8c"; ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) { const p = step * i; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke(); }
    for (let i = 0; i < 6; i++) blob(ctx, R() * s, R() * s, 10 + R() * 18, 8 + R() * 12, R() * 3, "rgba(120,120,120,.6)");
  }, 16, 16);

  // ===================== GRASS =====================
  const texGrass = canvasTex(384, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s); g.addColorStop(0, "#82b56b"); g.addColorStop(1, "#71a15c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) blob(ctx, R() * s, R() * s, 30 + R() * 70, 26 + R() * 60, R() * 3, R() < 0.5 ? "rgba(150,196,118,.22)" : "rgba(78,120,64,.24)");   // sun/shade patches
    speckle(ctx, s, 240, ["#8dc077", "#76a861", "#95c982", "#6c9a57", "#a3d18c"], 2, 6);    // clumps (seeded — pinned)
    // blade streaks
    ctx.lineWidth = 1;
    for (let i = 0; i < 700; i++) { const x = R() * s, y = R() * s, len = 3 + R() * 6, a = -1.4 + R() * 0.5; ctx.strokeStyle = R() < 0.5 ? "rgba(140,190,110,.5)" : "rgba(70,110,58,.5)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); }
    for (let i = 0; i < 14; i++) { ctx.fillStyle = ["#f4e26a", "#f0f0f0", "#e88fb0"][(R() * 3) | 0]; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(R() * s, R() * s, 1.4 + R() * 1.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }   // tiny wildflowers
  }, 12, 12);

  // leafy mottle for tree/palm canopies (tinted green per-instance) — light & dark leaf clusters
  const texLeaf = canvasTex(96, (ctx, s) => {
    ctx.fillStyle = "#eef3df"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 240; i++) { const t = R(); ctx.fillStyle = t < 0.4 ? "rgba(58,80,40,.5)" : t < 0.7 ? "rgba(96,132,66,.45)" : "rgba(255,255,255,.42)"; ctx.beginPath(); ctx.arc(R() * s, R() * s, 1.5 + R() * 4, 0, 7); ctx.fill(); }
  }, 3, 3);
  // zebra crosswalk (white bars on transparent), 1:1 (no tiling)
  const texCrosswalk = canvasTex(64, (ctx, s) => { ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#eef0ee"; const bars = 5, bw = s / (bars * 2 - 1); for (let i = 0; i < bars; i++) ctx.fillRect(i * bw * 2, 0, bw, s); }, 1, 1);
  // lane turn-arrow (points toward +Z = away from viewer / toward the intersection), white on transparent
  const texArrow = canvasTex(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#e7ebe4"; const cx = s / 2;
    ctx.fillRect(cx - s * 0.07, s * 0.34, s * 0.14, s * 0.5);    // shaft
    ctx.beginPath(); ctx.moveTo(cx, s * 0.12); ctx.lineTo(cx - s * 0.22, s * 0.42); ctx.lineTo(cx + s * 0.22, s * 0.42); ctx.closePath(); ctx.fill();  // head
  }, 1, 1);

  // ===================== MID-RISE FACADE =====================
  const texFacade = canvasTex(512, (ctx, s) => {
    const band = 88;                                       // street-level storefront band
    // wall: warm-to-cool vertical gradient + fine concrete speckle (deterministic — no seeded draw)
    const wg = ctx.createLinearGradient(0, 0, 0, s); wg.addColorStop(0, "#f5eedf"); wg.addColorStop(0.6, "#e7dcc8"); wg.addColorStop(1, "#d8ccb6");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) { const x = (i * 113) % s, y = (i * 197) % s; ctx.fillStyle = (i & 1) ? "rgba(255,255,255,.05)" : "rgba(86,74,58,.055)"; ctx.fillRect(x, y, 2, 2); }
    edgeAO(ctx, s, 26, 0.22);                               // baked corner occlusion so buildings read solid
    // storefront: recessed band, lintel shadow, awning stripes, big windows, door
    ctx.fillStyle = "#cabda4"; ctx.fillRect(0, s - band, s, band);
    ctx.fillStyle = "rgba(60,50,38,.4)"; ctx.fillRect(0, s - band, s, 6);                    // lintel shadow
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? "#c65b52" : "#efe7d6"; ctx.fillRect(k * s / 8, s - band + 6, s / 8, 12); }   // striped awning
    const bays = 4, bw = (s - 32) / bays;
    for (let k = 0; k < bays; k++) { const gx = 16 + k * bw + 6; const gg = ctx.createLinearGradient(gx, s - band + 26, gx, s - 14); gg.addColorStop(0, "#9fb6c6"); gg.addColorStop(1, "#5f7c92"); ctx.fillStyle = gg; ctx.fillRect(gx, s - band + 26, bw - 12, band - 40); ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.moveTo(gx, s - band + 26); ctx.lineTo(gx + (bw - 12) * 0.5, s - band + 26); ctx.lineTo(gx, s - band + 26 + (band - 40) * 0.5); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "#6b5a44"; ctx.fillRect(s / 2 - 26, s - band + 16, 52, band - 24);       // door
    const cols = 6, rows = 7, ww = 44, wh = 36;
    for (let cy = 0; cy < rows; cy++) { const y = 24 + cy * ((s - band - 48) / rows); ctx.fillStyle = "rgba(120,106,84,.3)"; ctx.fillRect(0, y + wh + 6, s, 3); ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(0, y + wh + 9, s, 1); }   // floor ledges + highlight
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = 28 + cx * ((s - 56) / cols) + 8, y = 24 + cy * ((s - band - 48) / rows);
      ctx.fillStyle = "rgba(40,32,22,.28)"; ctx.fillRect(x - 4, y + wh, ww + 8, 5);          // sill drop-shadow
      ctx.fillStyle = "#c3b89f"; ctx.fillRect(x - 4, y - 4, ww + 8, wh + 8);                 // window frame (raised)
      ctx.fillStyle = "#a89d84"; ctx.fillRect(x - 4, y - 4, ww + 8, 3);                      // frame top light
      if (rng() < 0.3) {                                                                     // warm lit pane (seeded — one draw per cell)
        const lg = ctx.createLinearGradient(x, y, x, y + wh); lg.addColorStop(0, "#fff0c8"); lg.addColorStop(1, "#ffcf86"); ctx.fillStyle = lg; ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = "rgba(180,120,40,.25)"; ctx.fillRect(x + ww * 0.5 - 1, y, 2, wh);    // mullion
      } else {                                                                               // cool sky-reflecting glass
        const gg = ctx.createLinearGradient(x, y, x, y + wh); gg.addColorStop(0, "#aecadd"); gg.addColorStop(0.5, "#7b98ac"); gg.addColorStop(1, "#63808f"); ctx.fillStyle = gg; ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ww * 0.6, y); ctx.lineTo(x, y + wh * 0.6); ctx.closePath(); ctx.fill();   // corner reflection
        ctx.strokeStyle = "rgba(30,44,56,.25)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, wh - 1);
      }
    }
  });
  // night windows: black facade with a random subset of windows lit (used as an emissive map after dark)
  const texWindows = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const band = 88, cols = 6, rows = 7, ww = 44, wh = 36;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      if (Math.random() < 0.5) continue;
      const x = 28 + cx * ((s - 56) / cols) + 8, y = 24 + cy * ((s - band - 48) / rows);
      const lg = ctx.createLinearGradient(x, y, x, y + wh); const warm = Math.random() < 0.5;
      lg.addColorStop(0, warm ? "#ffe7b3" : "#fff2cf"); lg.addColorStop(1, warm ? "#ffcf7d" : "#ffe09a");
      ctx.fillStyle = lg; ctx.fillRect(x, y, ww, wh);
    }
  });
  // facade relief: raised mullion frames around recessed window glass + a sunk storefront band
  const texFacadeNormal = canvasNormalTex(384, (ctx, s) => {
    const band = 66, cols = 6, rows = 7, ww = 33, wh = 27;
    ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#767676"; ctx.fillRect(0, s - band, s, band);                          // storefront recessed
    for (let cy = 0; cy < rows; cy++) { const y = 18 + cy * ((s - band - 36) / rows); ctx.fillStyle = "#7c7c7c"; ctx.fillRect(0, y + wh + 4, s, 3); }   // ledge grooves
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = 21 + cx * ((s - 42) / cols) + 6, y = 18 + cy * ((s - band - 36) / rows);
      ctx.fillStyle = "#c4c4c4"; ctx.fillRect(x - 3, y - 3, ww + 6, wh + 6);                 // raised frame
      ctx.fillStyle = "#565656"; ctx.fillRect(x, y, ww, wh);                                // recessed glass
    }
  }, 1, 1, 1.15);

  // ===================== GLASS TOWER =====================
  // brushed-steel curtain wall that tiles seamlessly up tall skyscrapers
  const texTower = canvasTex(256, (ctx, s) => {
    const fg = ctx.createLinearGradient(0, 0, s, 0); fg.addColorStop(0, "#7f97aa"); fg.addColorStop(0.5, "#9cb2c2"); fg.addColorStop(1, "#7a92a5");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, s, s);
    const R4 = 4, cell = s / R4, p = cell * 0.12;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      const x = cx * cell + p, y = cy * cell + p, w = cell - 2 * p, hh = cell - 2 * p;
      let top, bot;
      if (rng() < 0.2) { top = "#fff2cc"; bot = "#ffd98a"; }            // lit interior (seeded branch — pinned)
      else if (rng() < 0.5) { top = "#8fb0cf"; bot = "#48627d"; }       // cool blue glass
      else { top = "#9ec1d2"; bot = "#567f92"; }                        // teal glass
      const g = ctx.createLinearGradient(x, y, x, y + hh); g.addColorStop(0, top); g.addColorStop(0.5, bot); g.addColorStop(1, top);   // sky-then-ground double reflection
      ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.42, y); ctx.lineTo(x, y + hh * 0.42); ctx.closePath(); ctx.fill();   // diagonal sky glint
      ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(x, y, w, 2);          // glint along the top
      ctx.fillStyle = "rgba(16,26,36,.22)"; ctx.fillRect(x, y + hh - 2, w, 2);    // shadow at the bottom
    }
    // spandrel mullion grid over the glass for crisp curtain-wall structure
    ctx.strokeStyle = "rgba(52,66,78,.55)"; ctx.lineWidth = 2;
    for (let i = 0; i <= R4; i++) { const q = cell * i; ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, q); ctx.lineTo(s, q); ctx.stroke(); }
  }, 2, 7);
  // night version: a random subset of tower windows lit (emissive map after dark)
  const texTowerWin = canvasTex(256, (ctx, s) => {
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
  // tower roughness: glass panes near-mirror (dark), mullions & spandrels less glossy (lighter)
  const texTowerRough = dataTex(256, (ctx, s) => {
    ctx.fillStyle = "#5a5a5a"; ctx.fillRect(0, 0, s, s);                                     // mullion base
    const R4 = 4, cell = s / R4, p = cell * 0.12;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) { ctx.fillStyle = "#242424"; ctx.fillRect(cx * cell + p, cy * cell + p, cell - 2 * p, cell - 2 * p); }   // glossy glass
  }, 2, 7);

  // ===================== RUN-DOWN APARTMENT =====================
  const texGhetto = canvasTex(256, (ctx, s) => {
    const wg = ctx.createLinearGradient(0, 0, 0, s); wg.addColorStop(0, "#a2947f"); wg.addColorStop(1, "#8b8070");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 460, "#8a7e6c", "#a89c88", 1, 3.2);
    for (let i = 0; i < 10; i++) blob(ctx, R() * s, R() * s, 22 + R() * 44, 20 + R() * 40, R() * 3, R() < 0.5 ? "rgba(60,52,40,.22)" : "rgba(120,108,90,.2)");
    // rust/water streaks bleeding downward
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) { ctx.strokeStyle = R() < 0.5 ? "rgba(90,60,36,.3)" : "rgba(50,42,32,.28)"; const x = R() * s; ctx.beginPath(); ctx.moveTo(x, R() * s * 0.4); ctx.lineTo(x + (R() - 0.5) * 8, s * (0.5 + R() * 0.5)); ctx.stroke(); }
    edgeAO(ctx, s, 18, 0.24);
    const R4 = 4, cell = s / R4, p = cell * 0.2;
    for (let cy = 0; cy < R4; cy++) for (let cx = 0; cx < R4; cx++) {
      const wx = cx * cell + p, wy = cy * cell + p, ww = cell - 2 * p, wh = cell - 2 * p;
      ctx.fillStyle = "rgba(40,32,22,.3)"; ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);     // grimy reveal
      if (Math.random() < 0.35) { ctx.fillStyle = "#6b5236"; ctx.fillRect(wx, wy, ww, wh); ctx.strokeStyle = "#4a3724"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy + wh); ctx.moveTo(wx + ww, wy); ctx.lineTo(wx, wy + wh); ctx.stroke(); }   // boarded up
      else { const gg = ctx.createLinearGradient(wx, wy, wx, wy + wh); gg.addColorStop(0, "#454b52"); gg.addColorStop(1, "#2f343b"); ctx.fillStyle = gg; ctx.fillRect(wx, wy, ww, wh); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(wx, wy, ww, 3); }
    }
    ctx.strokeStyle = "rgba(40,32,24,.5)"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) crack(ctx, s, 5, 24, 8);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = ["#c0476b", "#3fa0d0", "#e0b020", "#5fb060"][(R() * 4) | 0]; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(R() * s, R() * s, 5 + R() * 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }   // graffiti
  }, 2, 3);
  const texGhettoWin = canvasTex(256, (ctx, s) => {
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
