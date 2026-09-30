// Palm City 2 — geometry helpers: paint a geometry with a vertex colour, transform it, and merge
// many pieces into one buffer (one draw call per model, however many parts it's built from).
import * as THREE from "../vendor/three.module.js";

const _c = new THREE.Color();
export function paint(geo, hex, emissive = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), em = new Float32Array(n);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; em[i] = emissive; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.BufferAttribute(em, 1));
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}
// merge painted (non-indexed) geometries: position, normal, uv, color, aEmit
export function merge(list) {
  const names = ["position", "normal", "uv", "color", "aEmit"];
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const size = list[0].attributes[nm].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
// a MeshStandardMaterial that reads vertex colours plus a per-vertex emissive weight — so a whole
// model (paint, trim, glowing lamps) is ONE material and ONE draw call
export function vcMaterial(opts = {}) {
  const { emitMul = 1, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.6, metalness: 0.0 }, rest));
  m.userData.emit = { value: emitMul };
  m.onBeforeCompile = sh => {
    sh.uniforms.uEmitMul = m.userData.emit;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aEmit; varying float vEmit;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEmit = aEmit;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vEmit; uniform float uEmitMul;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit * uEmitMul;");
  };
  return m;
}
// rounded rectangle Shape, for extruded bodies
export function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// a box with softly rounded edges (extruded rounded rect with a bevel) — the "toy" look
export function softBox(w, h, d, r = 0.08) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = new THREE.ExtrudeGeometry(roundRect(w - r * 2, h - r * 2, Math.max(0.001, r * 0.6)), {
    depth: Math.max(0.001, d - r * 2), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4,
  });
  g.translate(0, 0, -(d - r * 2) / 2);
  g.computeVertexNormals();
  return g;
}
// capsule hanging DOWN from its pivot: radius r0 at the top (y=0), r1 at the bottom (y=-len)
export function limb(r0, r1, len, seg = 10) {
  const pts = [];
  const N = 5;
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
  return new THREE.LatheGeometry(pts, seg);
}
