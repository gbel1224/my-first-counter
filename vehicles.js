// Palm City — vehicle factories: the merged-geometry car/bike bodies and the grouped
// heli/boat/plane builders. Split out of game.js; the scene is injected once via
// initVehicles() (it lives in game.js), same pattern as ragdoll.js.
import * as THREE from "./vendor/three.module.js";
import { boxGeoC, colorize, mergeGeos } from "./geometry.js";

let scene = null;
export function initVehicles(sceneRef) { scene = sceneRef; }

// round vertex-coloured wheel (axle along X so it lies flat on its side)
export function wheelGeo(r, w, x, y, z, color) {
  const g = new THREE.CylinderGeometry(r, r, w, 14, 1);
  g.rotateZ(Math.PI / 2); g.translate(x, y, z); return colorize(g, color);
}
export const carGeo = mergeGeos([
  boxGeoC(2.0, 0.55, 4.6, 0, 0.72, 0, 0xffffff),          // lower body (white => tintable)
  boxGeoC(1.9, 0.22, 4.2, 0, 1.0, 0, 0xffffff),           // upper body shoulder (tintable, slimmer)
  boxGeoC(1.7, 0.6, 2.3, 0, 1.32, -0.2, 0x131c27),        // glass cabin (deep tint, reads as glass with the glossy paint)
  wheelGeo(0.44, 0.34, 0.92, 0.42, 1.5, 0x1b1d22),        // round tyres
  wheelGeo(0.44, 0.34, -0.92, 0.42, 1.5, 0x1b1d22),
  wheelGeo(0.44, 0.34, 0.92, 0.42, -1.5, 0x1b1d22),
  wheelGeo(0.44, 0.34, -0.92, 0.42, -1.5, 0x1b1d22),
  wheelGeo(0.18, 0.36, 0.93, 0.42, 1.5, 0xc2c6cc),        // chrome hubcaps
  wheelGeo(0.18, 0.36, -0.93, 0.42, 1.5, 0xc2c6cc),
  wheelGeo(0.18, 0.36, 0.93, 0.42, -1.5, 0xc2c6cc),
  wheelGeo(0.18, 0.36, -0.93, 0.42, -1.5, 0xc2c6cc),
  boxGeoC(0.34, 0.18, 0.1, 0.55, 0.85, 2.31, 0xfff4c4),   // headlights
  boxGeoC(0.34, 0.18, 0.1, -0.55, 0.85, 2.31, 0xfff4c4),
  boxGeoC(0.34, 0.18, 0.1, 0.55, 0.85, -2.31, 0xc8403a),  // taillights
  boxGeoC(0.34, 0.18, 0.1, -0.55, 0.85, -2.31, 0xc8403a),
]);
export const CAR_COLORS = [0xe8543f, 0x3f7fe8, 0xf0c040, 0x58b368, 0xc25cd6, 0xe8e4da, 0xff8c42];
export function makeCar(color) {
  const mesh = new THREE.Mesh(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color, metalness: 0.6, roughness: 0.22, envMapIntensity: 1.5 }));   // glossy reflective PBR paint + glassy cabin
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
// motorbike — a nimble vehicle that reuses the whole car driving system
export const bikeGeo = mergeGeos([                              // low, realistic scale (shorter than the rider)
  boxGeoC(0.4, 0.32, 1.4, 0, 0.6, 0, 0xffffff),         // tank/body (tintable)
  boxGeoC(0.42, 0.13, 0.5, 0, 0.66, -0.4, 0x23262b),    // seat
  wheelGeo(0.32, 0.14, 0, 0.32, 0.82, 0x161616),        // front wheel
  wheelGeo(0.32, 0.14, 0, 0.32, -0.82, 0x161616),       // rear wheel
  wheelGeo(0.12, 0.16, 0, 0.32, 0.82, 0xc2c6cc),        // hubcaps
  wheelGeo(0.12, 0.16, 0, 0.32, -0.82, 0xc2c6cc),
  boxGeoC(0.64, 0.08, 0.1, 0, 0.9, 0.6, 0x3a3f47),      // handlebars
  boxGeoC(0.2, 0.14, 0.08, 0, 0.78, 0.78, 0xfff4c4),    // headlight
  // no baked-in rider — the real player model is mounted on top when ridden (see the bike-rider pose)
]);
export function makeBike(color) {
  const mesh = new THREE.Mesh(bikeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, color, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.1 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function makeHeli(x, z) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.9 });
  const dark = mat(0x15171a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 4.0), mat(0x2b6cb0)); body.position.y = 1.1; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), mat(0x1f4e79)); nose.scale.set(0.95, 0.85, 1.35); nose.position.set(0, 1.15, 1.9); g.add(nose);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 10), mat(0x0e1418)); glass.scale.set(0.92, 0.78, 1.05); glass.position.set(0, 1.35, 2.05); g.add(glass);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 3.4), mat(0x2b6cb0)); boom.position.set(0, 1.45, -3.3); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.7), mat(0x1f4e79)); fin.position.set(0, 2.0, -4.7); g.add(fin);
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), dark); skid.position.set(sx, 0.15, 0.1); g.add(skid);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), dark); leg.position.set(sx, 0.5, 0.1); g.add(leg);
  }
  const rotor = new THREE.Group(); rotor.position.set(0, 2.05, 0.1);
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.06, 0.42), dark));
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 9.2), dark));
  g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.33, 2.0, -4.8);
  tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.2), dark));
  g.add(tail);
  g.position.set(x, 0, z); scene.add(g);
  return { x, z, y: 0, h: Math.PI, speed: 0, mesh: g, rotor, tail, heli: true };
}

export function makeBoat(x, z) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.9 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 5.6), mat(0xeceef2)); hull.position.y = 0.5; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.4), mat(0xeceef2)); bow.position.set(0, 0.52, 3.3); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 3.6), mat(0xc2c8d0)); deck.position.set(0, 0.96, -0.4); g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 1.7), mat(0x33536b)); cabin.position.set(0, 1.45, -1.2); g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.1), mat(0x0e1a22)); glass.position.set(0, 1.62, -0.35); g.add(glass);
  g.position.set(x, 0.1, z); scene.add(g);
  return { x, z, h: 0, speed: 0, mesh: g, boat: true };
}

export function makePlane(x, z) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.4, envMapIntensity: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 7, 12), mat(0xe8ecf0)); body.rotation.x = Math.PI / 2; body.position.y = 1.4; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 12), mat(0xdfe4ea)); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 1.4, 3.9); g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.2, 1.7), mat(0xced5dd)); wing.position.set(0, 1.4, 0.2); g.add(wing);
  const tailw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.9), mat(0xced5dd)); tailw.position.set(0, 1.7, -3.1); g.add(tailw);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 1.0), mat(0x33536b)); fin.position.set(0, 2.3, -3.1); g.add(fin);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat(0x0e1a22)); glass.scale.set(0.9, 0.7, 1.4); glass.position.set(0, 1.75, 1.8); g.add(glass);
  const prop = new THREE.Group(); prop.position.set(0, 1.4, 4.7);
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.18), mat(0x15171a)));
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.18), mat(0x15171a)));
  g.add(prop);
  for (const sx of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), mat(0x161616)); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.4, 0.5); g.add(w); }
  g.position.set(x, 0, z); scene.add(g);
  return { x, z, y: 0, h: 0, speed: 0, mesh: g, prop, plane: true };
}
