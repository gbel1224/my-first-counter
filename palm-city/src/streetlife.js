// Palm City — street food carts: ice cream, fruit, tacos, coconuts, pretzels. Each with its wheels,
// its wares and a striped umbrella; the vendors who stand behind them are people (people.js).
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge, vcMaterial } from "./geo.js";
import { groundY } from "./world.js";

const STYLE = {
  icecream: { body: 0xf4f4f0, panel: 0x3a8ad8, umb: [0x3a8ad8, 0xf4f4f0] },
  fruit: { body: 0x8a6038, panel: 0x6a4428, umb: [0xd83a2a, 0xf2d040] },
  taco: { body: 0xd8402a, panel: 0x2a8a3a, umb: [0x2a8a3a, 0xf4f0e0] },
  coconut: { body: 0x9a7a4a, panel: 0x2aa0a0, umb: [0xf08a2a, 0xf4f0e0] },
  pretzel: { body: 0x3a3a3c, panel: 0xc8902a, umb: [0xc8302a, 0xf4f0e0] },
};
// a striped umbrella: a cone whose segments alternate colours
function umbrella(a, b) {
  const g = new THREE.ConeGeometry(1.25, 0.45, 12, 1, true).toNonIndexed();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let t = 0; t < n / 3; t++) { const c = (Math.floor(t / 2) % 2) ? ca : cb; for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t * 3 + k) * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aEmit", new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}
function cart(kind) {
  const S = STYLE[kind], P = [];
  P.push(place(paint(new THREE.BoxGeometry(1.5, 0.75, 0.75), S.body), 0, 0.72, 0));
  P.push(place(paint(new THREE.BoxGeometry(1.52, 0.32, 0.77), S.panel), 0, 0.55, 0));                  // the painted panel
  P.push(place(paint(new THREE.BoxGeometry(1.6, 0.05, 0.85), 0xb8bcc0), 0, 1.11, 0));                   // counter top
  for (const s of [-1, 1]) P.push(place(paint(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), 0x1a1a1a), s * 0.5, 0.22, 0.42, 0, 0, Math.PI / 2));   // wheels
  P.push(place(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), 0x3a3a3a), 0.7, 0.18, -0.3));         // the stand leg
  P.push(place(paint(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 6), 0xd8d8d8), 0, 1.8, -0.2));           // umbrella pole
  const u = umbrella(S.umb[0], S.umb[1]); u.translate(0, 2.55, -0.2); P.push(u);
  P.push(place(paint(new THREE.BoxGeometry(0.03, 0.4, 0.9), 0x9a9a9a), -0.85, 1.05, 0));                 // push handle
  // the wares
  if (kind === "icecream") { P.push(place(paint(new THREE.BoxGeometry(1.0, 0.18, 0.55), 0xe8f0f4), 0, 1.22, 0)); for (let k = 0; k < 4; k++) P.push(place(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), [0xf4c0c8, 0x8a5a3a, 0xf8f0d8, 0x9ad8a0][k]), -0.36 + k * 0.24, 1.32, 0)); }
  if (kind === "fruit") for (let k = 0; k < 18; k++) P.push(place(paint(new THREE.SphereGeometry(0.07, 8, 6), [0xe83a2a, 0xf2a020, 0x9ad84a, 0xf2d040, 0xc82a6a][k % 5]), -0.55 + (k % 6) * 0.22, 1.2 + Math.floor(k / 6) * 0.05, -0.2 + Math.floor(k / 6) * 0.2));
  if (kind === "taco") { P.push(place(paint(new THREE.BoxGeometry(1.3, 0.55, 0.6), 0xf2ecd8), 0, 1.42, -0.05)); P.push(place(paint(new THREE.BoxGeometry(0.9, 0.3, 0.02), 0x1a1a1a), 0, 1.5, 0.26)); }
  if (kind === "coconut") for (let k = 0; k < 10; k++) P.push(place(paint(new THREE.SphereGeometry(0.11, 8, 6), 0x6a4a2a), -0.5 + (k % 5) * 0.25, 1.24, -0.15 + Math.floor(k / 5) * 0.28));
  if (kind === "pretzel") { P.push(place(paint(new THREE.BoxGeometry(1.0, 0.5, 0.5), 0xd8e0e4), 0, 1.38, 0)); for (let k = 0; k < 6; k++) P.push(place(paint(new THREE.TorusGeometry(0.07, 0.025, 5, 10), 0xb8742a), -0.3 + (k % 3) * 0.3, 1.3 + Math.floor(k / 3) * 0.18, 0.2, 0, 0, 0)); }
  return merge(P);
}
export function buildCarts(scene, plan) {
  const parts = [];
  for (const c of plan.carts || []) {
    const g = cart(c.kind), m = new THREE.Matrix4().makeRotationY(c.yaw);   // local +z (the counter side) faces the customers
    m.setPosition(c.x, groundY(c.x, c.z), c.z); g.applyMatrix4(m); parts.push(g);
  }
  if (!parts.length) return;
  const mesh = new THREE.Mesh(merge(parts), vcMaterial({ roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
}
