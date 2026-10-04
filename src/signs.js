// Palm City — shop signs and neon. One atlas holds every storefront's sign (31 shops, each with its
// own name, lettering and style — lightbox, channel letters, neon tubes, hand-painted) plus a neon
// OPEN sign for shop windows; a second greyscale atlas says which parts of each sign glow after
// dark. A third atlas holds the projecting neon blade signs (BAR, HOTEL, TATTOO…) that hang off the
// fronts of the busier streets and buzz and flicker at night. The facade shader picks a sign for
// every shopfront and fits the shop's interior to it (see room() in city.js): shelves for the
// markets, mannequins for the clothes shops, tables for the cafes, counters for the services.
import * as THREE from "../vendor/three.module.js";

// [name, tagline, style, background, ink, font] — style: box (lightbox), letters (channel letters
// on a raceway), neon, painted. The order matters: 0-7 food, 8-13 clothing, 14-19 market, 20-30 services
export const SHOPS = [
  ["JOE'S PIZZA", "SLICES · PIES · CALZONES", "box", "#b3201b", "#fff3d6", 0],
  ["Café Cubano", "cafecito · pastelitos", "painted", "#1f3b2c", "#f2d28a", 1],
  ["TACO LOCO", "", "neon", "#120c0a", "#ff6a2a", 0],
  ["Sunrise Bakery", "FRESH DAILY", "painted", "#f6e2c0", "#8a3a1a", 1],
  ["DONUT KING", "HOT & FRESH", "box", "#ff8ab0", "#4a1a2a", 2],
  ["SUSHI BAY", "", "neon", "#0a1014", "#4ae0ff", 2],
  ["BURGER SHACK", "SINCE 1971", "box", "#f2c230", "#b01e1e", 0],
  ["Ocean Grill", "SEAFOOD · BAR", "letters", "#183048", "#f4f4f4", 1],
  ["Palm Threads", "boutique", "painted", "#e8dccb", "#2a5a4a", 4],
  ["SURF & SAND", "BOARDS · WAX · RENTALS", "box", "#1a6aa0", "#ffffff", 0],
  ["KICKS", "SNEAKERS", "neon", "#0c0a10", "#ff3ad0", 0],
  ["Vintage Vibes", "", "letters", "#2a1e18", "#f2b84a", 4],
  ["LOLA", "BOUTIQUE", "letters", "#1a1a1c", "#f8f4ee", 1],
  ["BAY DENIM", "", "box", "#1c2a44", "#e8e8e8", 3],
  ["BODEGA 24", "GROCERY · DELI · ATM", "box", "#f4f4f0", "#c0201e", 0],
  ["PALM PHARMACY", "", "box", "#ffffff", "#1a7a3a", 2],
  ["LIQUOR & LOTTO", "", "neon", "#100808", "#ff2a2a", 0],
  ["FRESH MARKET", "PRODUCE · MEAT · DELI", "box", "#2a7a2a", "#ffffff", 2],
  ["DOLLAR PLUS", "", "box", "#ffe23a", "#1a3aa0", 0],
  ["SMOKE & VAPE", "", "neon", "#0c0810", "#b05aff", 2],
  ["FADE MASTERS", "BARBER", "neon", "#080c12", "#3ab0ff", 0],
  ["Nail Spa", "MANI · PEDI", "painted", "#f6d2de", "#a02a5a", 4],
  ["SUDS", "LAUNDROMAT", "box", "#3aa0d8", "#ffffff", 0],
  ["FIX-IT PHONES", "REPAIR · UNLOCK", "letters", "#141414", "#3aff6a", 3],
  ["INK CITY", "TATTOO", "neon", "#100808", "#ff3a3a", 0],
  ["Coastal Bank", "", "letters", "#1a2a3a", "#d8c890", 1],
  ["PAWN & GOLD", "WE BUY GOLD", "box", "#f2c230", "#1a1a1a", 0],
  ["Island Travel", "CRUISES · FLIGHTS", "painted", "#2ab0b0", "#ffffff", 1],
  ["GYM 305", "OPEN 24 HRS", "letters", "#1a1a1a", "#ff6a1a", 0],
  ["Dr. Smile", "FAMILY DENTAL", "box", "#ffffff", "#2a6ab0", 1],
  ["Books & Beans", "", "painted", "#3a2a1e", "#f2e2c0", 1],
];
const FONTS = [
  w => `900 ${w}px Impact, "Arial Black", "Arial Narrow", sans-serif`,
  w => `italic bold ${w}px Georgia, "Times New Roman", serif`,
  w => `bold ${w}px "Trebuchet MS", Verdana, sans-serif`,
  w => `bold ${w}px "Courier New", Courier, monospace`,
  w => `italic ${w}px "Brush Script MT", "Segoe Script", cursive`,
];
const CW = 512, CH = 128, COLS = 4, ROWS = 8;

let ATLAS = null;
export function signAtlas() {
  if (ATLAS) return ATLAS;
  const mk = () => { const c = document.createElement("canvas"); c.width = CW * COLS; c.height = CH * ROWS; return c; };
  const cc = mk(), gc = mk(), x = cc.getContext("2d"), g = gc.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, gc.width, gc.height);
  const fit = (ctx, text, fontFn, maxW, size) => { let s = size; do { ctx.font = fontFn(s); s -= 2; } while (ctx.measureText(text).width > maxW && s > 16); return s + 2; };
  const cells = [...SHOPS, ["OPEN", "", "neon", "#05070c", "#ff3040", 0]];
  cells.forEach(([name, tag, style, bg, ink, font], i) => {
    const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH, cx = ox + CW / 2;
    x.save(); g.save();
    x.beginPath(); x.rect(ox, oy, CW, CH); x.clip(); g.beginPath(); g.rect(ox, oy, CW, CH); g.clip();
    const ff = FONTS[font], hasTag = !!tag, ty = oy + (hasTag ? 66 : 76);
    // background
    x.fillStyle = bg; x.fillRect(ox, oy, CW, CH);
    if (style === "box") {
      const gr = x.createLinearGradient(0, oy, 0, oy + CH); gr.addColorStop(0, "rgba(255,255,255,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0.18)");
      x.fillStyle = gr; x.fillRect(ox, oy, CW, CH);
      x.strokeStyle = "rgba(0,0,0,0.5)"; x.lineWidth = 8; x.strokeRect(ox + 4, oy + 4, CW - 8, CH - 8);
      x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 2; x.strokeRect(ox + 12, oy + 12, CW - 24, CH - 24);
      g.fillStyle = "#9a9a9a"; g.fillRect(ox + 8, oy + 8, CW - 16, CH - 16);                     // the whole box glows
    } else if (style === "letters") {
      x.fillStyle = "rgba(255,255,255,0.05)"; x.fillRect(ox, oy + CH * 0.42, CW, 10);                   // raceway
    } else if (style === "painted") {
      x.strokeStyle = ink; x.lineWidth = 4; x.strokeRect(ox + 10, oy + 10, CW - 20, CH - 20);
      for (let k = 0; k < 30; k++) { x.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`; x.fillRect(ox + Math.random() * CW, oy + Math.random() * CH, 20 + Math.random() * 60, 2); }   // wood grain
      g.fillStyle = "#3a3a3a"; g.fillRect(ox, oy, CW, CH);                                           // lit by gooseneck lamps
    }
    // the name
    const size = fit(x, name, ff, CW - 60, hasTag ? 70 : 84);
    x.font = ff(size); g.font = ff(size); x.textAlign = g.textAlign = "center"; x.textBaseline = g.textBaseline = "middle";
    if (style === "neon") {
      x.lineJoin = "round";
      for (const [w, a] of [[16, 0.15], [9, 0.35], [4, 1]]) { x.strokeStyle = ink; x.globalAlpha = a; x.lineWidth = w; x.shadowColor = ink; x.shadowBlur = 18; x.strokeText(name, cx, ty); }
      x.globalAlpha = 1; x.shadowBlur = 0; x.strokeStyle = "#fff8f0"; x.lineWidth = 1.5; x.strokeText(name, cx, ty);
      g.strokeStyle = "#fff"; g.lineWidth = 6; g.shadowColor = "#fff"; g.shadowBlur = 14; g.strokeText(name, cx, ty);
    } else {
      if (style === "letters") { x.fillStyle = "rgba(0,0,0,0.5)"; x.fillText(name, cx + 3, ty + 4); }                // letters stand off the wall
      x.fillStyle = ink; x.fillText(name, cx, ty);
      g.fillStyle = style === "letters" ? "#fff" : style === "box" ? "#ffffff" : "#777"; g.fillText(name, cx, ty);
    }
    if (hasTag) {
      const ts = fit(x, tag, FONTS[font === 4 ? 1 : 2], CW - 120, 24);
      x.font = FONTS[font === 4 ? 1 : 2](ts); g.font = x.font;
      x.fillStyle = style === "neon" ? ink : ink; x.globalAlpha = 0.9; x.fillText(tag, cx, oy + 106); x.globalAlpha = 1;
      g.fillStyle = style === "neon" || style === "letters" ? "#ccc" : "#888"; g.fillText(tag, cx, oy + 106);
    }
    x.restore(); g.restore();
  });
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return (ATLAS = { color: tex(cc, true), glow: tex(gc, false), count: SHOPS.length });
}

// ---- projecting neon blade signs ----
const BLADES = [["BAR", "#ff3a5a"], ["HOTEL", "#4ad0ff"], ["TATTOO", "#ff4a2a"], ["PIZZA", "#ffb02a"], ["OPEN", "#ff3040"], ["LIQUOR", "#40ff8a"], ["CLUB", "#c45aff"], ["CAFE", "#ffd060"]];
let BLADE = null;
function bladeAtlas() {
  if (BLADE) return BLADE;
  const W = 128, H = 512, c = document.createElement("canvas"); c.width = W * BLADES.length; c.height = H;
  const x = c.getContext("2d");
  BLADES.forEach(([word, col], i) => {
    const ox = i * W;
    x.fillStyle = "#0b0b0d"; x.fillRect(ox, 0, W, H);
    x.strokeStyle = "#2a2a2e"; x.lineWidth = 6; x.strokeRect(ox + 4, 4, W - 8, H - 8);
    // a neon border, then the letters stacked top to bottom
    const tube = (draw) => { for (const [w, a] of [[14, 0.18], [7, 0.45], [3, 1]]) { x.globalAlpha = a; x.lineWidth = w; x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 16; draw(); } x.globalAlpha = 1; x.shadowBlur = 0; x.lineWidth = 1.2; x.strokeStyle = "#fffaf0"; draw(); };
    tube(() => { x.beginPath(); x.roundRect(ox + 14, 14, W - 28, H - 28, 16); x.stroke(); });
    const n = word.length, step = Math.min(84, (H - 70) / n);
    x.font = `bold ${Math.round(step * 0.85)}px "Arial Black", Impact, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let k = 0; k < n; k++) { const y = 35 + step * (k + 0.5) + (H - 70 - step * n) / 2; tube(() => x.strokeText(word[k], ox + W / 2, y)); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (BLADE = t);
}
// list: [x, y, z, rotY, cell, phase]; rotY turns the sign's local +z out of the wall
export function buildBladeSigns(scene, list, U) {
  if (!list.length) return null;
  const t = bladeAtlas();
  // two faces (one each way along the street) on a thin dark frame, sticking out of the wall
  const face = new THREE.PlaneGeometry(0.72, 2.6);
  const a = face.clone(); a.rotateY(Math.PI / 2); a.translate(0.035, 0, 0.9);
  const b = face.clone(); b.rotateY(-Math.PI / 2); b.translate(-0.035, 0, 0.9);
  const geo = new THREE.BufferGeometry();
  for (const nm of ["position", "normal", "uv"]) {
    const ga = a.toNonIndexed().attributes[nm], gb = b.toNonIndexed().attributes[nm];
    const arr = new Float32Array(ga.array.length + gb.array.length); arr.set(ga.array); arr.set(gb.array, ga.array.length);
    geo.setAttribute(nm, new THREE.BufferAttribute(arr, ga.itemSize));
  }
  const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCell; uniform float uTime, uNight; varying float vGlow;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>
        vMapUv.x = (vMapUv.x + aCell.x) / ${BLADES.length.toFixed(1)}; vEmissiveMapUv = vMapUv;
        // neon at night; a few tubes on their way out stutter
        float fl = aCell.y > 0.8 ? step(0.25, fract(sin(floor(uTime * 9.0 + aCell.y * 40.0) * 12.9898) * 43758.5453)) : 1.0;
        vGlow = (0.25 + uNight * 3.6) * mix(1.0, fl, uNight);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;");
  };
  const frame = new THREE.BoxGeometry(0.06, 2.72, 0.82); frame.translate(0, 0, 0.9);
  const arm = new THREE.BoxGeometry(0.05, 0.05, 0.5); arm.translate(0, 1.15, 0.25);
  const arm2 = arm.clone(); arm2.translate(0, -2.3, 0);
  const cell = new Float32Array(list.length * 2);
  list.forEach((it, i) => { cell[i * 2] = it[4]; cell[i * 2 + 1] = it[5]; });
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
  const signs = new THREE.InstancedMesh(geo, mat, list.length);
  const frames = new THREE.InstancedMesh(mergeBoxes([frame, arm, arm2]), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.4 }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  list.forEach((it, i) => { m.compose(p.set(it[0], it[1], it[2]), q.setFromEuler(e.set(0, it[3], 0)), s); signs.setMatrixAt(i, m); frames.setMatrixAt(i, m); });
  for (const o of [signs, frames]) { o.frustumCulled = false; o.castShadow = o === frames; scene.add(o); }
  return { signs, frames, count: BLADES.length };
}
function mergeBoxes(list) {
  const geos = list.map(g => g.toNonIndexed()), out = new THREE.BufferGeometry();
  for (const nm of ["position", "normal", "uv"]) {
    let n = 0; for (const g of geos) n += g.attributes[nm].array.length;
    const arr = new Float32Array(n); let off = 0;
    for (const g of geos) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, geos[0].attributes[nm].itemSize));
  }
  return out;
}
export const BLADE_COUNT = BLADES.length;
