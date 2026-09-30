// Palm City 2 — cars. Bodies are real silhouettes: a side profile drawn with curves, extruded to
// the car's width with a generous bevel so every edge is rounded, then a separate glasshouse on
// top. Paint is a clear-coated physical material, so the sky reflects across the bonnet.
// Each type is split into four geometries (paint / glass / trim+wheels / lights) so the traffic
// can draw every car of a type with four instanced draw calls.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge } from "./geo.js";

// profile points: [x along the car (+ = front), y height]; smooth curves between them
const TYPES = {
  compact: {
    len: 3.9, wid: 1.78, wheelR: 0.33, wb: 2.45, ride: 0.18, mass: 1,
    body: [[-1.95, 0.32], [-1.98, 0.7], [-1.8, 0.95], [-0.9, 1.02], [0.9, 0.98], [1.7, 0.86], [1.95, 0.62], [1.95, 0.32]],
    cabin: [[-1.72, 0.94], [-1.45, 1.52], [0.2, 1.56], [0.95, 1.0]],
    accel: 15, top: 44, grip: 7.5, turn: 2.5,
  },
  sedan: {
    len: 4.6, wid: 1.85, wheelR: 0.34, wb: 2.8, ride: 0.18, mass: 1.15,
    body: [[-2.3, 0.34], [-2.32, 0.7], [-2.15, 0.9], [-1.4, 0.96], [0.9, 0.95], [1.9, 0.83], [2.3, 0.62], [2.3, 0.34]],
    cabin: [[-1.45, 0.94], [-0.95, 1.42], [0.45, 1.44], [1.15, 0.94]],
    accel: 16, top: 50, grip: 7.8, turn: 2.35,
  },
  sports: {
    len: 4.4, wid: 1.95, wheelR: 0.35, wb: 2.6, ride: 0.12, mass: 1.05,
    body: [[-2.2, 0.3], [-2.22, 0.66], [-2.05, 0.82], [-1.2, 0.86], [0.8, 0.8], [1.7, 0.66], [2.2, 0.48], [2.2, 0.3]],
    cabin: [[-1.3, 0.84], [-0.7, 1.2], [0.25, 1.22], [1.05, 0.8]],
    accel: 24, top: 66, grip: 9.0, turn: 2.6,
  },
  suv: {
    len: 4.8, wid: 2.0, wheelR: 0.42, wb: 2.9, ride: 0.3, mass: 1.4,
    body: [[-2.4, 0.42], [-2.42, 1.0], [-2.3, 1.18], [-1.2, 1.22], [1.2, 1.2], [2.1, 1.08], [2.4, 0.78], [2.4, 0.42]],
    cabin: [[-2.2, 1.16], [-2.05, 1.86], [0.7, 1.9], [1.4, 1.18]],
    accel: 14, top: 46, grip: 7.0, turn: 2.2,
  },
};
export const CAR_TYPES = Object.keys(TYPES);
export const carSpec = t => TYPES[t];

function profileShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i], [px, py] = pts[i - 1];
    // curve through the midpoint for smooth transitions
    s.quadraticCurveTo(px + (x - px) * 0.15, py + (y - py) * 0.85, x, y);
  }
  s.lineTo(pts[0][0], pts[0][1]);
  return s;
}
function extrudeProfile(pts, width, bevel) {
  const g = new THREE.ExtrudeGeometry(profileShape(pts), {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 10,
  });
  // extrude runs along +z; we want the length along +z and width along x: rotate so profile x → z
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
// real cars aren't extruded slabs: the flanks lean in toward the roof (tumblehome) and the corners
// round off in plan. Warp every vertex of the painted body + glass by the same rule.
function shapeCar(g, T) {
  const p = g.attributes.position, halfL = T.len / 2, shoulder = T.ride + 0.55;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const tumble = 1 - Math.min(1, Math.max(0, (y - shoulder) / 0.9)) * 0.2;
    const plan = 1 - Math.pow(Math.min(1, Math.abs(z) / halfL), 5) * 0.12;
    const belly = 1 - Math.max(0, (T.ride + 0.3 - y)) * 0.12;       // tuck the sills under
    p.setX(i, x * tumble * plan * belly);
  }
  // keep the extrusion's smooth normals (recomputing on merged, non-indexed data would facet it)
  return g;
}
const cache = {};
export function carGeometries(type) {
  if (cache[type]) return cache[type];
  const T = TYPES[type];
  const bodyPts = T.body.map(([x, y]) => [x, y + T.ride - 0.18]);
  const cabPts = [[T.cabin[0][0], T.cabin[0][1] - 0.02], ...T.cabin.slice(1)].map(([x, y]) => [x, y + T.ride - 0.18]);
  // paint: the lower body shell, plus a thin painted ROOF slab and pillars over a glass greenhouse
  const body = paint(extrudeProfile(bodyPts, T.wid, 0.12), 0xffffff);
  const glassG = extrudeProfile(cabPts, T.wid * 0.84, 0.1);
  const [c0, c1, c2, c3] = cabPts;
  const roofT = 0.07;
  const roofPts = [[c1[0] - 0.04, c1[1] - roofT], [c1[0] - 0.02, c1[1] + 0.03], [c2[0] + 0.02, c2[1] + 0.03], [c2[0] + 0.04, c2[1] - roofT]];
  const roof = paint(extrudeProfile(roofPts, T.wid * 0.87, 0.05), 0xffffff);
  const pillars = [];
  // A-pillar (front, along the windscreen edge) and C-pillar (rear), both sides; a B-pillar mid-door
  const pil = (x0, y0, x1, y1, w) => {
    const len = Math.hypot(x1 - x0, y1 - y0), g = new THREE.BoxGeometry(0.1, len, w);
    return place(paint(g, 0xffffff), 0, (y0 + y1) / 2, (x0 + x1) / 2, Math.atan2(x1 - x0, y1 - y0), 0, 0);
  };
  for (const sx of [-1, 1]) {
    const zx = sx * T.wid * 0.425;
    pillars.push(place(pil(c3[0], c3[1], c2[0], c2[1], 0.09), zx, 0, 0));
    pillars.push(place(pil(c0[0], c0[1], c1[0], c1[1], 0.14), zx, 0, 0));
    const mx = (c1[0] + c2[0]) / 2 - 0.1;
    pillars.push(place(pil(mx, c0[1], mx, c1[1], 0.08), zx, 0, 0));
  }
  const paintGeo = shapeCar(merge([body, roof, ...pillars]), T);
  const glass = shapeCar(merge([paint(glassG, 0xffffff)]), T);
  // trim: tyres, rims, bumpers, grille, mirrors, arch shadows
  const trim = [];
  const wx = T.wid / 2 - 0.06, fz = T.wb / 2, R = T.wheelR;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tyre = new THREE.CylinderGeometry(R, R, 0.26, 20); tyre.rotateZ(Math.PI / 2);
    trim.push(place(paint(tyre, 0x1b1b1d), sx * wx, R, sz * fz));
    const rim = new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.27, 12); rim.rotateZ(Math.PI / 2);
    trim.push(place(paint(rim, 0xc9ccd2), sx * (wx + 0.005), R, sz * fz));
    const hub = new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.28, 8); hub.rotateZ(Math.PI / 2);
    trim.push(place(paint(hub, 0x55585e), sx * (wx + 0.01), R, sz * fz));
    // wheel-arch lip: a dark half ring on the flank so the wheel sits IN the body, not under it
    const arch = new THREE.TorusGeometry(R + 0.06, 0.05, 6, 16, Math.PI); arch.rotateY(Math.PI / 2);
    trim.push(place(paint(arch, 0x121214), sx * (T.wid / 2 + 0.01), R + 0.02, sz * fz));
  }
  const bz = T.len / 2;
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.96, 0.22, 0.18), 0x2a2b2e), 0, T.ride + 0.22, bz - 0.02));
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.96, 0.22, 0.18), 0x2a2b2e), 0, T.ride + 0.22, -bz + 0.02));
  trim.push(place(paint(new THREE.BoxGeometry(T.wid * 0.5, 0.16, 0.06), 0x151516), 0, T.ride + 0.48, bz + 0.03));   // grille
  for (const sx of [-1, 1]) trim.push(place(paint(new THREE.BoxGeometry(0.2, 0.1, 0.12), 0x222222), sx * (T.wid / 2 + 0.06), T.cabin[0][1] + T.ride - 0.1, T.cabin[3][0] - 0.25));
  const trimGeo = merge(trim);
  // lights: head (white-ish) and tail (red), plus a thin light bar at the back
  const L = [];
  for (const sx of [-1, 1]) {
    L.push(place(paint(new THREE.BoxGeometry(0.42, 0.14, 0.08), 0xfff6e0), sx * (T.wid / 2 - 0.32), T.ride + 0.52, bz + 0.0));
    L.push(place(paint(new THREE.BoxGeometry(0.4, 0.12, 0.08), 0xff2a2a), sx * (T.wid / 2 - 0.3), T.ride + 0.56, -bz - 0.0));
  }
  const lights = merge(L);
  return (cache[type] = { paint: paintGeo, glass, trim: trimGeo, lights, spec: T });
}

// shared materials
export const MAT = {
  paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.08 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2430, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 }),
  trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }),
  lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

// real-world paint mix: mostly silver, white, black and grey, a few colours
export const REAL_PAINTS = [0xb8bcc0, 0xc6c9cc, 0xe8e8e6, 0xf2f2f0, 0x1a1b1d, 0x222428, 0x5a5e62, 0x6b6f73, 0x1f2d4a, 0x2a3a5c, 0x5a1a1e, 0x7a1c20, 0xb9a98c, 0x2a3a2e, 0x8a2a1c, 0x3a4c6a, 0x9aa0a4, 0x2c2c2e];
export const PAINTS = [0xd7263d, 0x1b998b, 0xf46036, 0x2e294e, 0xe8e8e8, 0x111111, 0x3a86ff, 0xffbe0b, 0x8338ec, 0x6c757d, 0x2ec4b6, 0xa7c957, 0xf7f7ff, 0x9d0208];

// a single drivable car as a scene-graph Group (player cars): wheels are separate so they spin and steer
export function makeCar(type, color) {
  const G = carGeometries(type), T = G.spec;
  const group = new THREE.Group();
  const pm = MAT.paint.clone(); pm.vertexColors = false; pm.color.set(color);
  const body = new THREE.Mesh(G.paint, pm);
  const glass = new THREE.Mesh(G.glass, MAT.glass);
  // trim without the wheels, wheels as their own meshes
  const trim = new THREE.Mesh(G.trim, MAT.trim);
  const lightMat = MAT.lights.clone();
  const lights = new THREE.Mesh(G.lights, lightMat);
  const chassis = new THREE.Group();
  chassis.add(body, glass, trim, lights);
  group.add(chassis);
  for (const m of [body, glass, trim]) { m.castShadow = true; m.receiveShadow = true; }
  return { group, chassis, spec: T, type, color, lightMat, body };
}
