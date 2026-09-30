// Palm City — geometry helpers: merged vertex-coloured primitives (=> 1 draw call per model)
// and the canvas-backed text sprite. Split out of game.js; depends only on Three.js.
import * as THREE from "./vendor/three.module.js";

const _col = new THREE.Color();
export function boxGeoC(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  _col.set(color);
  for (let i = 0; i < n; i++) { cols[i * 3] = _col.r; cols[i * 3 + 1] = _col.g; cols[i * 3 + 2] = _col.b; }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}
// rounded vertex-coloured primitives (smooth normals) for nicer characters — still merged to 1 mesh
export function colorize(g, color) {
  const n = g.attributes.position.count, cols = new Float32Array(n * 3);
  _col.set(color);
  for (let i = 0; i < n; i++) { cols[i * 3] = _col.r; cols[i * 3 + 1] = _col.g; cols[i * 3 + 2] = _col.b; }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}
export function cylC(rT, rB, h, x, y, z, color) {
  const g = new THREE.CylinderGeometry(rT, rB, h, 16, 1);
  g.translate(x, y, z); return colorize(g, color);
}
export function sphC(r, x, y, z, color, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 18, 14);
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  g.translate(x, y, z); return colorize(g, color);
}
// a rounded, bevelled box (soft edges on all sides) — for smooth AA-style car bodies instead of hard
// cubes. Built from an extruded rounded-rectangle profile; a sequential index is attached so it drops
// straight into mergeGeos alongside the box/cyl/sph primitives.
export function roundedBoxC(w, h, d, r, x, y, z, color, bevel = 0.08) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  bevel = Math.min(bevel, d / 2 - 0.01, r);
  const hw = w / 2, hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const depth = Math.max(0.01, d - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);          // centre the extrusion on Z
  g.translate(x, y, z);
  g.computeVertexNormals();
  if (!g.index) { const c = g.attributes.position.count, ix = new Uint32Array(c); for (let i = 0; i < c; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (g.attributes.uv) g.deleteAttribute("uv");   // vertex-coloured only; keep attribute set uniform for mergeGeos
  return colorize(g, color);
}
export function mergeGeos(geos) {
  const pos = [], norm = [], col = [], uv = [], idx = [];
  let off = 0;
  const hasUv = !!geos[0].attributes.uv, hasCol = !!geos[0].attributes.color;
  for (const g of geos) {
    const p = g.attributes.position, nr = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(nr.getX(i), nr.getY(i), nr.getZ(i));
      if (hasCol) { const c = g.attributes.color; col.push(c.getX(i), c.getY(i), c.getZ(i)); }
      if (hasUv) { const u = g.attributes.uv; uv.push(u.getX(i), u.getY(i)); }
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  if (hasCol) out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  if (hasUv) out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
export function textSprite(text, fg, bg, w, h, y) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(6, 14, 500, 100, 28); ctx.fill(); }
  else ctx.fillRect(6, 14, 500, 100);
  ctx.fillStyle = fg; ctx.font = "800 52px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  sp.scale.set(w, h, 1); sp.position.y = y;
  return sp;
}
