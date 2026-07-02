// Palm City — procedural textures (seamless by construction; style formula palette).
// Split out of game.js. World textures are built via buildWorldTextures(), called from
// game.js at the exact point the old inline constants sat, so the seeded-RNG stream is
// consumed in the same order and the deterministic world stays byte-identical.
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
// derive a tangent-space normal map from a grayscale height field (dark = recessed, light = raised),
// so flat textured surfaces gain real relief under the sun. degrades to a flat normal when the test
// harness has no readable 2D context (getImageData unavailable).
export function canvasNormalTex(size, drawHeight, repX = 1, repY = 1) {
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
      const dx = H(x - 1, y) - H(x + 1, y), dy = H(x, y - 1) - H(x, y + 1);
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
// speckle that wraps across edges so the tile stays seamless
export function speckle(ctx, s, n, colors, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = rng() * s, y = rng() * s, r = rr(r0, r1);
    ctx.fillStyle = pick(colors);
    for (const ox of [0, -s, s]) for (const oz of [0, -s, s]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oz, r, 0, 7); ctx.fill();
    }
  }
}

export function buildWorldTextures() {
  const texAsphalt = canvasTex(384, (ctx, s) => {
    ctx.fillStyle = "#46525a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 260, ["#4d5a62", "#3f4a52", "#525e66"], 1, 3);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "rgba(28,34,38,.28)"; ctx.fillRect(Math.random() * s, Math.random() * s, 18 + Math.random() * 36, 12 + Math.random() * 26); }  // tar patches
    for (let i = 0; i < 4; i++) { ctx.fillStyle = "rgba(16,18,22,.3)"; ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 7 + Math.random() * 12, 4 + Math.random() * 7, Math.random() * 3, 0, 7); ctx.fill(); }  // oil stains
    ctx.strokeStyle = "rgba(24,28,32,.5)"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 36; y += (Math.random() - 0.5) * 36; ctx.lineTo(x, y); } ctx.stroke(); }  // cracks
    ctx.fillStyle = "#3a444b"; ctx.fillRect(0, 0, 14, s); ctx.fillRect(s - 14, 0, 14, s); // gutters
    ctx.fillStyle = "#e8c35a";                                  // center dashes (64 divides 256 => seamless)
    for (let y = 0; y < s; y += 64) ctx.fillRect(s / 2 - 3, y, 6, 32);
  }, 1, 30);
  // asphalt relief: pebble grain + recessed cracks and gutter grooves
  const texAsphaltNormal = canvasNormalTex(256, (ctx, s) => {
    for (let i = 0; i < 220; i++) { ctx.fillStyle = Math.random() < 0.5 ? "#8e8e8e" : "#727272"; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#6a6a6a"; ctx.fillRect(0, 0, 14, s); ctx.fillRect(s - 14, 0, 14, s);   // gutter grooves
    ctx.strokeStyle = "#5a5a5a"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 36; y += (Math.random() - 0.5) * 36; ctx.lineTo(x, y); } ctx.stroke(); }
  }, 1, 30);
  const texSidewalk = canvasTex(384, (ctx, s) => {
    ctx.fillStyle = "#cfc5ae"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 200, ["#d6cdb8", "#c6bca4", "#cabfa9"], 1, 2.5);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = "rgba(150,138,116,.18)"; ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 16, 8 + Math.random() * 12, 0, 0, 7); ctx.fill(); }  // stains
    ctx.strokeStyle = "rgba(120,110,92,.45)"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 28; y += (Math.random() - 0.5) * 28; ctx.lineTo(x, y); } ctx.stroke(); }  // cracks
    ctx.strokeStyle = "#b7ad96"; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const p = (s / 4) * i;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
    }
  }, 16, 16);
  // sidewalk relief: faint grain + recessed expansion joints between the paving slabs
  const texSidewalkNormal = canvasNormalTex(256, (ctx, s) => {
    for (let i = 0; i < 160; i++) { ctx.fillStyle = Math.random() < 0.5 ? "#8c8c8c" : "#767676"; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 1.6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#5e5e5e"; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const p = (s / 4) * i;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
    }
  }, 16, 16);
  const texGrass = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = "#7fb069"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 240, ["#8abc73", "#74a45f", "#90c47c", "#6d9b58"], 2, 6);
  }, 12, 12);
  // leafy mottle for tree/palm canopies (tinted green per-instance) — light & dark leaf clusters
  const texLeaf = canvasTex(64, (ctx, s) => {
    ctx.fillStyle = "#eef3df"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 150; i++) { ctx.fillStyle = Math.random() < 0.5 ? "rgba(64,86,46,.45)" : "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 3.5, 0, 7); ctx.fill(); }
  }, 3, 3);
  // zebra crosswalk (white bars on transparent), 1:1 (no tiling)
  const texCrosswalk = canvasTex(64, (ctx, s) => { ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#eef0ee"; const bars = 5, bw = s / (bars * 2 - 1); for (let i = 0; i < bars; i++) ctx.fillRect(i * bw * 2, 0, bw, s); }, 1, 1);
  // lane turn-arrow (points toward +Z = away from viewer / toward the intersection), white on transparent
  const texArrow = canvasTex(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#e7ebe4"; const cx = s / 2;
    ctx.fillRect(cx - s * 0.07, s * 0.34, s * 0.14, s * 0.5);    // shaft
    ctx.beginPath(); ctx.moveTo(cx, s * 0.12); ctx.lineTo(cx - s * 0.22, s * 0.42); ctx.lineTo(cx + s * 0.22, s * 0.42); ctx.closePath(); ctx.fill();  // head
  }, 1, 1);
  const texFacade = canvasTex(256, (ctx, s) => {
    const band = 44;                                       // street-level storefront band
    // wall: soft vertical gradient + fine concrete speckle (deterministic — no rng consumed)
    const wg = ctx.createLinearGradient(0, 0, 0, s); wg.addColorStop(0, "#f3ecdd"); wg.addColorStop(1, "#dcd0bb");
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 520; i++) { const x = (i * 113) % s, y = (i * 197) % s; ctx.fillStyle = (i & 1) ? "rgba(255,255,255,.045)" : "rgba(86,74,58,.05)"; ctx.fillRect(x, y, 2, 2); }
    // storefront band with a lintel + big shop windows + a door
    ctx.fillStyle = "#d2c6af"; ctx.fillRect(0, s - band, s, band);
    ctx.fillStyle = "#b7aa90"; ctx.fillRect(0, s - band, s, 3);
    for (let k = 0; k < 4; k++) { const bw = (s - 16) / 4; ctx.fillStyle = "#7e96a8"; ctx.fillRect(8 + k * bw + 3, s - band + 9, bw - 6, band - 20); }
    ctx.fillStyle = "#6b5a44"; ctx.fillRect(s / 2 - 14, s - band + 8, 28, band - 12);
    const cols = 6, rows = 7, ww = 22, wh = 18;
    for (let cy = 0; cy < rows; cy++) { const y = 12 + cy * ((s - band - 24) / rows); ctx.fillStyle = "rgba(120,106,84,.32)"; ctx.fillRect(0, y + wh + 3, s, 2); }   // floor ledges
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = 14 + cx * ((s - 28) / cols) + 4, y = 12 + cy * ((s - band - 24) / rows);
      ctx.fillStyle = "#bdb39c"; ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);                          // window frame
      if (rng() < 0.3) { const lg = ctx.createLinearGradient(x, y, x, y + wh); lg.addColorStop(0, "#ffe6ad"); lg.addColorStop(1, "#ffcf86"); ctx.fillStyle = lg; ctx.fillRect(x, y, ww, wh); }   // warm lit pane
      else { const gg = ctx.createLinearGradient(x, y, x, y + wh); gg.addColorStop(0, "#9ab6cb"); gg.addColorStop(0.55, "#5f7c92"); gg.addColorStop(1, "#6f8a9f"); ctx.fillStyle = gg; ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ww * 0.55, y); ctx.lineTo(x, y + wh * 0.55); ctx.closePath(); ctx.fill(); }   // glass + corner reflection
    }
  });
  // night windows: black facade with a random subset of windows lit (used as an emissive map after dark)
  const texWindows = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const band = 44, cols = 6, rows = 7, ww = 22, wh = 18;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      if (Math.random() < 0.5) continue;
      const x = 14 + cx * ((s - 28) / cols) + 4, y = 12 + cy * ((s - band - 24) / rows);
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd98a" : "#ffe7b3";
      ctx.fillRect(x, y, ww, wh);
    }
  });
  // facade relief: raised mullion frames around recessed window glass + a sunk storefront band
  const texFacadeNormal = canvasNormalTex(256, (ctx, s) => {
    const band = 44, cols = 6, rows = 7, ww = 22, wh = 18;
    ctx.fillStyle = "#8c8c8c"; ctx.fillRect(0, 0, s, s);                 // wall plane
    ctx.fillStyle = "#787878"; ctx.fillRect(0, s - band, s, band);      // storefront recessed
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = 14 + cx * ((s - 28) / cols) + 4, y = 12 + cy * ((s - band - 24) / rows);
      ctx.fillStyle = "#bcbcbc"; ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);   // raised frame
      ctx.fillStyle = "#5a5a5a"; ctx.fillRect(x, y, ww, wh);                   // recessed glass
    }
  });
  // glass-tower facade — a uniform window grid that tiles seamlessly so it can repeat up tall skyscrapers
  const texTower = canvasTex(128, (ctx, s) => {
    // brushed-steel curtain wall with a subtle vertical sheen behind the glass mullions
    const fg = ctx.createLinearGradient(0, 0, s, 0); fg.addColorStop(0, "#8aa1b3"); fg.addColorStop(0.5, "#9cb2c2"); fg.addColorStop(1, "#859caf");
    ctx.fillStyle = fg; ctx.fillRect(0, 0, s, s);
    const R = 4, cell = s / R, p = cell * 0.14;
    for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < R; cx++) {
      const x = cx * cell + p, y = cy * cell + p, w = cell - 2 * p, hh = cell - 2 * p;
      let top, bot;
      if (rng() < 0.2) { top = "#fff0c8"; bot = "#ffd98a"; }            // lit interior
      else if (rng() < 0.5) { top = "#86a3bf"; bot = "#4f6b84"; }       // cool blue glass
      else { top = "#93b6c6"; bot = "#5d8092"; }                        // teal glass
      const g = ctx.createLinearGradient(x, y, x, y + hh); g.addColorStop(0, top); g.addColorStop(1, bot);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
      ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(x, y, w, 2);          // glint along the top of each pane
      ctx.fillStyle = "rgba(20,30,40,.18)"; ctx.fillRect(x, y + hh - 2, w, 2);    // shadow line at the bottom
    }
  }, 2, 7);
  // night version: a random subset of tower windows lit (emissive map after dark)
  const texTowerWin = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const R = 4, cell = s / R, p = cell * 0.16;
    for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < R; cx++) {
      if (Math.random() < 0.55) continue;
      ctx.fillStyle = Math.random() < 0.5 ? "#ffe7b3" : "#cfe3ff";
      ctx.fillRect(cx * cell + p, cy * cell + p, cell - 2 * p, cell - 2 * p);
    }
  }, 2, 7);
  // run-down apartment facade: grimy stucco, some boarded windows, cracks + graffiti
  const texGhetto = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = "#9a8e7c"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = ["#8a7e6c", "#857a68", "#a89c88", "#6f6555"][i & 3]; const r = 1 + Math.random() * 3; ctx.fillRect(Math.random() * s, Math.random() * s, r, r); }
    const R = 4, cell = s / R, p = cell * 0.2;
    for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < R; cx++) {
      const wx = cx * cell + p, wy = cy * cell + p, ww = cell - 2 * p, wh = cell - 2 * p;
      if (Math.random() < 0.35) { ctx.fillStyle = "#6b5236"; ctx.fillRect(wx, wy, ww, wh); ctx.strokeStyle = "#4a3724"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy + wh); ctx.moveTo(wx + ww, wy); ctx.lineTo(wx, wy + wh); ctx.stroke(); }
      else { ctx.fillStyle = Math.random() < 0.5 ? "#3a4048" : "#4a4438"; ctx.fillRect(wx, wy, ww, wh); }
    }
    ctx.strokeStyle = "rgba(40,32,24,.5)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 26; y += 6 + Math.random() * 14; ctx.lineTo(x, y); } ctx.stroke(); }
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ["#c0476b", "#3fa0d0", "#e0b020", "#5fb060"][(Math.random() * 4) | 0]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }, 2, 3);
  const texGhettoWin = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s, s);
    const R = 4, cell = s / R, p = cell * 0.2;
    for (let cy = 0; cy < R; cy++) for (let cx = 0; cx < R; cx++) {
      if (Math.random() < 0.78) continue;                  // few lights on in the rough part of town
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd98a" : "#d9c089";
      ctx.fillRect(cx * cell + p, cy * cell + p, cell - 2 * p, cell - 2 * p);
    }
  }, 2, 3);
  return { texAsphalt, texAsphaltNormal, texSidewalk, texSidewalkNormal, texGrass, texLeaf, texCrosswalk, texArrow, texFacade, texWindows, texFacadeNormal, texTower, texTowerWin, texGhetto, texGhettoWin };
}
