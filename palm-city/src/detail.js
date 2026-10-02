// Palm City — the clutter that makes a city look lived in: air-con units hung under windows,
// balconies, shop awnings, fire escapes on the brick blocks, traffic signals on mast arms,
// wooden utility poles with sagging wires, hydrants, bins, newspaper boxes, street signs.
// Everything is instanced or merged into a handful of draw calls.
import * as THREE from "../vendor/three.module.js";
import { N, ROAD, CELL, BLOCK, WALK, HALF, CURB, STYLE, roadC, blockMin, district, mulberry32 } from "./world.js";
import { paint, place, merge, vcMaterial, tileInstances } from "./geo.js";

// the facade window grid, mirrored from the facade shader so props land exactly under real windows
const GRID = {
  [STYLE.PASTEL]: { fh: 3.3, bay: 3.2, wx0: 0.25, wy0: 0.27, vo: 0 },
  [STYLE.BRICK]: { fh: 3.3, bay: 2.8, wx0: 0.25, wy0: 0.27, vo: 0 },
  [STYLE.HOUSE]: { fh: 3.0, bay: 4.2, wx0: 0.3, wy0: 0.27, vo: 0.6 },
  [STYLE.CONCRETE]: { fh: 3.6, bay: 1.7, wx0: 0.04, wy0: 0.36, vo: 0 },
};
const FACES = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];   // [nx, nz, rotY] local +z = outward

// ---- prop geometries (local: x along the wall, y up, +z out of the wall) ----
function acGeo() {
  return merge([
    place(paint(new THREE.BoxGeometry(0.76, 0.48, 0.52), 0xb9b4a8), 0, 0, 0.26),
    place(paint(new THREE.BoxGeometry(0.6, 0.34, 0.02), 0x3a3a3a), 0.02, 0, 0.53),            // grille
    place(paint(new THREE.BoxGeometry(0.06, 0.06, 0.5), 0x6a665e), -0.3, -0.27, 0.25),        // brackets
    place(paint(new THREE.BoxGeometry(0.06, 0.06, 0.5), 0x6a665e), 0.3, -0.27, 0.25),
  ]);
}
function balconyGeo() {
  const p = [place(paint(new THREE.BoxGeometry(2.4, 0.14, 1.15), 0xcfc8bb), 0, 0, 0.58)];
  p.push(place(paint(new THREE.BoxGeometry(2.4, 0.05, 0.05), 0x2c2c2e), 0, 1.0, 1.12));
  for (const x of [-1.18, 1.18]) p.push(place(paint(new THREE.BoxGeometry(0.05, 0.05, 1.1), 0x2c2c2e), x, 1.0, 0.58));
  for (let k = 0; k <= 12; k++) p.push(place(paint(new THREE.BoxGeometry(0.025, 0.95, 0.025), 0x2c2c2e), -1.18 + k * (2.36 / 12), 0.52, 1.12));
  return merge(p);
}
function awningGeo() {
  // sloped canvas + a hanging valance; painted white so the instance colour tints it
  const canvas = paint(new THREE.BoxGeometry(4.6, 0.05, 1.6), 0xffffff); canvas.rotateX(0.38); canvas.translate(0, 0, 0.74);
  const val = place(paint(new THREE.BoxGeometry(4.6, 0.32, 0.03), 0xe6e6e6), 0, -0.44, 1.5);
  const arms = [-2.1, 2.1].map(x => place(paint(new THREE.BoxGeometry(0.04, 0.04, 1.5), 0x333333), x, -0.25, 0.75, 0.38, 0, 0));
  return merge([canvas, val, ...arms]);
}
function fireEscapeGeo(fh) {
  const I = 0x2a2624, p = [];
  p.push(place(paint(new THREE.BoxGeometry(3.4, 0.07, 1.2), I), 0, 0, 0.62));                 // grating platform
  p.push(place(paint(new THREE.BoxGeometry(3.4, 0.05, 0.05), I), 0, 0.95, 1.2));              // rails
  for (const x of [-1.7, 1.7]) p.push(place(paint(new THREE.BoxGeometry(0.05, 0.05, 1.2), I), x, 0.95, 0.62));
  for (let k = 0; k <= 10; k++) p.push(place(paint(new THREE.BoxGeometry(0.03, 0.95, 0.03), I), -1.7 + k * 0.34, 0.47, 1.2));
  // the stair down to the platform below, diagonal along the wall
  const len = Math.hypot(2.4, fh);
  p.push(place(paint(new THREE.BoxGeometry(len, 0.06, 0.55), I), 0.1, -fh / 2, 0.5, 0, 0, Math.atan2(fh, 2.4)));
  p.push(place(paint(new THREE.BoxGeometry(len, 0.04, 0.04), I), 0.1, -fh / 2 + 0.9, 0.78, 0, 0, Math.atan2(fh, 2.4)));
  return merge(p);
}

function inst(scene, geo, mat, list, colors, cast = true, tile = true) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  list.forEach((it, i) => {
    m.compose(p.set(it[0], it[1], it[2]), q.setFromEuler(e.set(it[4] || 0, it[3], 0)), s.setScalar(it[5] || 1));
    mesh.setMatrixAt(i, m);
  });
  if (colors) {
    const c = new THREE.Color();
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    colors.forEach((hex, i) => { c.set(hex); mesh.setColorAt(i, c); });
  }
  mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  if (tile) tileInstances(scene, mesh, 110, 210);   // static: split into tiles the renderer can skip; small details fade out past ~300 m
  return mesh;
}

export function buildFacadeDetail(scene, plan) {
  const r = mulberry32(0xFACADE);
  const ac = [], bal = [], awn = [], awnC = [], fe = [];
  const AWN = [0x2f4a3a, 0x6a2a2a, 0x23344e, 0x8a7a5a, 0x3a3a3a, 0x7a4a2a, 0x2a5a5a, 0x5a2a4a];
  for (const b of plan.buildings) {
    const G = GRID[b.style];
    if (!G) continue;
    const hasBalc = b.style === STYLE.PASTEL && r() < 0.45;
    const feFace = b.style === STYLE.BRICK ? (r() * 4) | 0 : -1;
    for (let f = 0; f < 4; f++) {
      const [nx, nz, rot] = FACES[f];
      const width = nx ? b.d : b.w;
      const x0 = nx ? b.x + nx * b.w / 2 : b.x - b.w / 2, z0 = nz ? b.z + nz * b.d / 2 : b.z - b.d / 2;
      const along = (u) => nx ? [x0, z0 + u] : [x0 + u, z0];   // world point at distance u along the face
      const bays = Math.floor(width / G.bay);
      const floors = Math.floor((b.h - G.vo - 0.6) / G.fh);
      const shopFloor = b.style !== STYLE.HOUSE && b.y < 0.5;
      // shop awnings on the ground floor
      if (shopFloor) {
        const sb = Math.floor(width / 5.5);
        for (let k = 0; k < sb; k++) if (r() < 0.45) {
          const [x, z] = along((k + 0.5) * 5.5);
          awn.push([x + nx * 0.02, b.y + 3.3, z + nz * 0.02, rot]); awnC.push(AWN[(r() * AWN.length) | 0]);
        }
      }
      for (let fl = 0; fl < floors; fl++) {
        const fy = b.y + G.vo + fl * G.fh;
        if (shopFloor && fy + G.wy0 * G.fh < b.y + 4.4) continue;     // ground floor is shops
        for (let k = 0; k < bays; k++) {
          const [x, z] = along((k + 0.5) * G.bay);
          if (b.style !== STYLE.CONCRETE && r() < (b.style === STYLE.BRICK ? 0.22 : 0.14)) ac.push([x, fy + G.wy0 * G.fh - 0.42, z, rot]);
          if (hasBalc && fl >= 1 && k % 2 === 0 && r() < 0.8) bal.push([x, fy + 0.05, z, rot]);
        }
        if (f === feFace && fl >= 1 && width > 12) {
          const [x, z] = along(width * 0.5);
          fe.push([x, fy + 0.02, z, rot]);
        }
      }
    }
  }
  const mat = vcMaterial({ roughness: 0.75, metalness: 0.1 });
  inst(scene, acGeo(), mat, ac);
  inst(scene, balconyGeo(), mat, bal);
  inst(scene, fireEscapeGeo(3.3), vcMaterial({ roughness: 0.6, metalness: 0.5 }), fe);
  inst(scene, awningGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), awn, awnC);
  return { counts: { ac: ac.length, bal: bal.length, awn: awn.length, fe: fe.length } };
}

// ============================================================================================
// streets
// ============================================================================================
export function buildStreetDetail(scene, plan) {
  const r = mulberry32(0x57EE7);
  const kerb = ROAD / 2;
  // ---- traffic signals: one mast arm per approach, on the far-right corner ----
  const poles = [], heads = [];
  const lamps = { z: [[], [], []], x: [[], [], []] };       // [red, amber, green] instances per axis
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const cx = roadC(i), cz = roadC(j);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rx = -dz, rz = dx;                               // right-hand side of travel
      const px = cx + dx * (kerb + 1.2) + rx * (kerb + 0.9), pz = cz + dz * (kerb + 1.2) + rz * (kerb + 0.9);
      const hx = cx + dx * (kerb + 1.2) + rx * 3.6, hz = cz + dz * (kerb + 1.2) + rz * 3.6;
      const face = Math.atan2(-dx, -dz);                    // head faces the oncoming traffic
      poles.push([px, 0, pz, Math.atan2(hx - px, hz - pz)]);
      heads.push([hx, 5.6, hz, face]);
      const axis = dz ? "z" : "x";
      for (let k = 0; k < 3; k++) {
        const up = 0.32 - k * 0.32;
        lamps[axis][k].push([hx, 5.6 + up, hz, face]);
      }
    }
  }
  const dark = vcMaterial({ roughness: 0.55, metalness: 0.5 });
  {
    const g = merge([
      place(paint(new THREE.CylinderGeometry(0.13, 0.17, 6.2, 8), 0x55585c), 0, 3.1, 0),
      place(paint(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), 0x55585c), 0, 6.0, 2.5, Math.PI / 2, 0, 0),
      place(paint(new THREE.BoxGeometry(0.5, 0.35, 0.1), 0x2a5a3a), 0, 6.45, 1.2),        // street-name blade
    ]);
    inst(scene, g, dark, poles);
    inst(scene, merge([place(paint(new THREE.BoxGeometry(0.42, 1.15, 0.32), 0x222326), 0, 0, 0),
      place(paint(new THREE.BoxGeometry(0.62, 1.35, 0.03), 0x151516), 0, 0, -0.17)]), dark, heads);
  }
  const lampGeo = new THREE.CircleGeometry(0.12, 12); lampGeo.translate(0, 0, 0.17);
  const COL = [0xff2a1a, 0xffa000, 0x2aff7a];
  const lampMats = { z: [], x: [] };
  for (const axis of ["z", "x"]) for (let k = 0; k < 3; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: COL[k], toneMapped: false });
    lampMats[axis].push(mat);
    inst(scene, lampGeo, mat, lamps[axis][k], null, false);
  }

  // ---- utility poles + sagging wires, along one side of the streets outside downtown ----
  const up = [], wires = [];
  for (let i = 0; i <= N; i++) {
    for (const axis of ["x", "z"]) {
      const c = roadC(i) + (axis === "x" ? -1 : 1) * (kerb + 0.7);   // on the kerb line
      let prev = null;
      for (let s = -HALF + 6; s < HALF - 6; s += CELL / 2) {
        const bj = Math.min(N - 1, Math.max(0, Math.floor((s + HALF - ROAD) / CELL)));
        const bi = Math.min(N - 1, Math.max(0, i - (axis === "x" ? 1 : 0)));
        const kind = axis === "x" ? district(bj, Math.max(0, i - 1)) : district(Math.max(0, i - 1), bj);
        const ok = kind !== "downtown" && kind !== "plaza" && kind !== "park" && (i % 2 === 0);
        const l = ((s + HALF) % CELL + CELL) % CELL;
        if (!ok || l < ROAD + 3) { prev = null; continue; }
        const x = axis === "x" ? s : c, z = axis === "x" ? c : s;
        up.push([x, 0, z, axis === "x" ? 0 : Math.PI / 2]);
        const top = 8.6;
        if (prev) {
          for (const off of [-0.9, 0, 0.9]) {
            const ax = prev[0] + (axis === "z" ? off : 0), az = prev[1] + (axis === "x" ? off : 0);
            const bx = x + (axis === "z" ? off : 0), bz = z + (axis === "x" ? off : 0);
            const segs = 10, sag = 0.9;
            for (let k = 0; k < segs; k++) {
              const t0 = k / segs, t1 = (k + 1) / segs;
              wires.push(ax + (bx - ax) * t0, top - Math.sin(t0 * Math.PI) * sag, az + (bz - az) * t0,
                         ax + (bx - ax) * t1, top - Math.sin(t1 * Math.PI) * sag, az + (bz - az) * t1);
            }
          }
        }
        prev = [x, z];
      }
    }
  }
  {
    const wood = 0x5e4a36;
    const g = merge([
      place(paint(new THREE.CylinderGeometry(0.13, 0.17, 9.2, 7), wood), 0, 4.6, 0),
      place(paint(new THREE.BoxGeometry(0.12, 0.14, 2.3), wood), 0, 8.6, 0),
      place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), 0xd8d8d0), 0, 8.75, -0.9),
      place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), 0xd8d8d0), 0, 8.75, 0),
      place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5), 0xd8d8d0), 0, 8.75, 0.9),
      place(paint(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10), 0x7a7d7a), 0.32, 7.4, 0),   // transformer can
    ]);
    inst(scene, g, vcMaterial({ roughness: 0.9 }), up);
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }));
    wl.frustumCulled = false; scene.add(wl);
  }

  // ---- sidewalk furniture ----
  const hyd = [], bin = [], news = [], sign = [];
  for (const b of plan.blocks) {
    if (b.kind === "plaza") continue;
    for (let side = 0; side < 4; side++) {
      const [nx, nz] = [[0, -1], [0, 1], [-1, 0], [1, 0]][side];
      const along = t => nx ? [nx < 0 ? b.x0 + 1.0 : b.x1 - 1.0, b.z0 + t] : [b.x0 + t, nz < 0 ? b.z0 + 1.0 : b.z1 - 1.0];
      const rot = Math.atan2(nx, nz);
      if (r() < 0.7) { const [x, z] = along(8 + r() * 10); hyd.push([x, CURB, z, rot]); }
      if (r() < 0.8) { const [x, z] = along(20 + r() * 20); bin.push([x, CURB, z, rot]); }
      if (r() < 0.35) { const [x, z] = along(14 + r() * 30); news.push([x, CURB, z, rot + Math.PI]); }
    }
    // a street-name sign on each corner
    sign.push([b.x0 + 1.2, CURB, b.z0 + 1.2, r() * 6.28]);
  }
  const hydM = inst(scene, merge([
    place(paint(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 10), 0xc8a21e), 0, 0.31, 0),
    place(paint(new THREE.SphereGeometry(0.17, 10, 6, 0, 6.3, 0, 1.6), 0xc8a21e), 0, 0.62, 0),
    place(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.48, 6), 0xb0901a), 0, 0.42, 0, 0, 0, Math.PI / 2),
  ]), vcMaterial({ roughness: 0.6, metalness: 0.2 }), hyd, null, true, false);
  const binM = inst(scene, merge([
    place(paint(new THREE.CylinderGeometry(0.3, 0.27, 0.95, 12), 0x2f4538), 0, 0.48, 0),
    place(paint(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), 0x243428), 0, 0.97, 0),
  ]), vcMaterial({ roughness: 0.7, metalness: 0.3 }), bin, null, true, false);
  const newsM = inst(scene, merge([
    place(paint(new THREE.BoxGeometry(0.5, 0.95, 0.45), 0x2250a0), 0, 0.62, 0),
    place(paint(new THREE.BoxGeometry(0.4, 0.3, 0.02), 0xd8dde0), 0, 0.85, 0.23),
    place(paint(new THREE.BoxGeometry(0.06, 0.2, 0.06), 0x333333), -0.18, 0.1, 0), place(paint(new THREE.BoxGeometry(0.06, 0.2, 0.06), 0x333333), 0.18, 0.1, 0),
  ]), vcMaterial({ roughness: 0.5, metalness: 0.2 }), news, null, true, false);
  inst(scene, merge([
    place(paint(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 6), 0x777a7c), 0, 1.5, 0),
    place(paint(new THREE.BoxGeometry(0.9, 0.2, 0.02), 0x1f6a3a), 0, 2.95, 0),
    place(paint(new THREE.BoxGeometry(0.02, 0.2, 0.9), 0x1f6a3a), 0, 2.72, 0),
  ]), vcMaterial({ roughness: 0.5, metalness: 0.4 }), sign);

  // the loose stuff a car can send flying (see props.js)
  return { lampMats, props: [["hydrant", hydM, hyd], ["bin", binM, bin], ["news", newsM, news]] };
}

// light the signal lamps for the current phase (0 NS green, 1 NS amber, 2 EW green, 3 EW amber)
export function updateSignals(lampMats, phase) {
  const on = (axis, k) => {
    const ph = axis === "z" ? phase : (phase + 2) % 4;       // the cross street is offset by half a cycle
    const lit = ph === 0 ? 2 : ph === 1 ? 1 : 0;
    return k === lit;
  };
  const BASE = [[1, 0.1, 0.05], [1, 0.55, 0], [0.1, 1, 0.45]];
  for (const axis of ["z", "x"]) for (let k = 0; k < 3; k++) {
    const m = lampMats[axis][k], b = BASE[k], s = on(axis, k) ? 4 : 0.06;
    m.color.setRGB(b[0] * s, b[1] * s, b[2] * s);
  }
}
