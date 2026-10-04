// Palm City — the clutter that makes a city look lived in: air-con units hung under windows,
// balconies, shop awnings, fire escapes on the brick blocks, traffic signals on mast arms,
// wooden utility poles with sagging wires, hydrants, bins, newspaper boxes, street signs.
// Everything is instanced or merged into a handful of draw calls.
import * as THREE from "../vendor/three.module.js";
import { N, ROAD, CELL, BLOCK, WALK, HALF, CURB, STYLE, roadC, blockMin, district, mulberry32 } from "./world.js";
import { paint, place, merge, vcMaterial, tileInstances } from "./geo.js";
import { BLADE_COUNT } from "./signs.js";

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
  const ac = [], bal = [], awn = [], awnC = [], fe = [], blades = [];
  const br = mulberry32(0xB1ADE);
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
      // a projecting neon sign between some of the shops, above the awnings
      if (shopFloor && b.h > 7) {
        const sb = Math.floor(width / 5.5);
        for (let k = 1; k < sb; k++) if (br() < 0.13) {
          const [x, z] = along(k * 5.5);
          blades.push([x, b.y + 5.7, z, rot, (br() * BLADE_COUNT) | 0, br()]);
        }
      }
      // shop awnings on the ground floor
      if (shopFloor) {
        const sb = Math.floor(width / 5.5);
        for (let k = 0; k < sb; k++) if (r() < 0.45) {
          const [x, z] = along((k + 0.5) * 5.5);
          awn.push([x + nx * 0.02, b.y + 3.08, z + nz * 0.02, rot]); awnC.push(AWN[(r() * AWN.length) | 0]);
        }
      }
      for (let fl = 0; fl < floors; fl++) {
        const fy = b.y + G.vo + fl * G.fh;
        if (shopFloor && fy + G.wy0 * G.fh < b.y + 4.4) continue;     // ground floor is shops
        for (let k = 0; k < bays; k++) {
          const [x, z] = along((k + 0.5) * G.bay);
          if (b.style !== STYLE.CONCRETE && r() < (b.style === STYLE.BRICK ? 0.22 : b.style === STYLE.HOUSE ? 0 : 0.14)) ac.push([x, fy + G.wy0 * G.fh - 0.42, z, rot]);
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
  return { blades, counts: { ac: ac.length, bal: bal.length, awn: awn.length, fe: fe.length, blades: blades.length } };
}

// ============================================================================================
// streets
// ============================================================================================
export function buildStreetDetail(scene, plan) {
  const r = mulberry32(0x57EE7);
  const kerb = ROAD / 2;
  // ---- traffic signals: one mast arm per approach, on the far-right corner, with walk / don't-walk
  // heads on the same pole for the two crosswalks that start at that corner ----
  const poles = [], heads = [], peds = [];
  const lampList = [], lampMeta = [];      // every signal lens, and the junction / axis / colour it shows
  const pedList = [], pedMeta = [];        // every walk-signal panel (hand above, walking figure below)
  const cabs = [];
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const cx = roadC(i), cz = roadC(j);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rx = -dz, rz = dx;                               // right-hand side of travel
      const px = cx + dx * (kerb + 1.2) + rx * (kerb + 0.9), pz = cz + dz * (kerb + 1.2) + rz * (kerb + 0.9);
      const hx = cx + dx * (kerb + 1.2) + rx * 3.6, hz = cz + dz * (kerb + 1.2) + rz * 3.6;
      const face = Math.atan2(-dx, -dz);                    // head faces the oncoming traffic
      poles.push([px, 0, pz, Math.atan2(hx - px, hz - pz)]);
      const axis = dz ? "z" : "x";
      // two heads over the lanes: one over the inside lane at the arm's tip, one over the outside lane
      for (const off of [3.6, 6.6]) {
        const ax = cx + dx * (kerb + 1.2) + rx * off, az = cz + dz * (kerb + 1.2) + rz * off;
        heads.push([ax, 5.6, az, face]);
        for (let k = 0; k < 3; k++) {
          lampList.push([ax + Math.sin(face) * 0.17, 5.92 - k * 0.32, az + Math.cos(face) * 0.17, face]);
          lampMeta.push([i, j, axis, k]);
        }
      }
      if (dx === 1) cabs.push([px + 1.6, CURB, pz + 1.6, Math.PI / 4]);   // one signal controller per junction
      // walk signals on this corner's pole: one looking across each road, at the far kerb
      const sx = Math.sign(px - cx), sz = Math.sign(pz - cz);
      for (const [road, fa] of [["z", Math.atan2(-sx, 0)], ["x", Math.atan2(0, -sz)]]) {
        const ox = px + Math.sin(fa) * 0.2, oz = pz + Math.cos(fa) * 0.2;
        peds.push([ox, 2.9, oz, fa]);
        for (let k = 0; k < 2; k++) {
          pedList.push([ox + Math.sin(fa) * 0.11, 3.06 - k * 0.3, oz + Math.cos(fa) * 0.11, fa]);
          pedMeta.push([i, j, road, k]);
        }
      }
    }
  }
  const dark = vcMaterial({ roughness: 0.55, metalness: 0.5 });
  {
    const P = 0x55585c, tie = Math.hypot(4.4, 1.3);
    const g = merge([
      place(paint(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), 0x8a8780), 0, 0.06, 0),                    // concrete footing
      place(paint(new THREE.CylinderGeometry(0.2, 0.27, 0.45, 8, 1, true), P), 0, 0.34, 0),                              // flared base
      place(paint(new THREE.CylinderGeometry(0.12, 0.17, 6.2, 8, 1, true), P), 0, 3.1, 0),
      place(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 8, 1, true), P), 0, 6.0, 0),                                // arm clamp
      place(paint(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 8), 0x3a3d40), 0, 6.28, 0),                        // pole cap
      place(paint(new THREE.CylinderGeometry(0.06, 0.1, 5.4, 6, 1, true), P), 0, 6.0, 2.6, Math.PI / 2, 0, 0),             // tapered mast arm
      place(paint(new THREE.CylinderGeometry(0.018, 0.018, tie, 4, 1, true), P), 0, 6.65, 2.2, Math.PI / 2 + Math.atan2(1.3, 4.4), 0, 0),   // tie rod
      place(paint(new THREE.BoxGeometry(0.06, 0.08, 0.06), P), 0, 7.3, 0.02),
      // street-name sign hung under the arm: green with a white border
      place(paint(new THREE.BoxGeometry(0.04, 0.42, 1.5), 0xf2f2ee), 0, 5.62, 1.15),
      place(paint(new THREE.BoxGeometry(0.05, 0.36, 1.44), 0x1f6a3a), 0, 5.62, 1.15),
      ...[0.62, 1.68].map(z => place(paint(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 4), P), 0, 5.95, z)),
      // push-button with its instruction plate, on the pole
      place(paint(new THREE.BoxGeometry(0.16, 0.24, 0.12), 0xd8b020), 0.17, 1.1, 0),
      place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), 0x2a2a2a), 0.25, 1.1, 0, 0, 0, Math.PI / 2),
      place(paint(new THREE.BoxGeometry(0.02, 0.3, 0.22), 0xf2f2ee), 0.13, 1.42, 0),
    ]);
    inst(scene, g, dark, poles);
    const hp = [place(paint(new THREE.BoxGeometry(0.42, 1.15, 0.32), 0x222326), 0, 0, 0),
      place(paint(new THREE.BoxGeometry(0.62, 1.35, 0.03), 0x151516), 0, 0, -0.17),       // backplate
      // its retro-reflective yellow border
      place(paint(new THREE.BoxGeometry(0.62, 0.06, 0.035), 0xe8c018), 0, 0.645, -0.165), place(paint(new THREE.BoxGeometry(0.62, 0.06, 0.035), 0xe8c018), 0, -0.645, -0.165),
      place(paint(new THREE.BoxGeometry(0.06, 1.35, 0.035), 0xe8c018), 0.28, 0, -0.165), place(paint(new THREE.BoxGeometry(0.06, 1.35, 0.035), 0xe8c018), -0.28, 0, -0.165),
      // the bracket hanging it from the arm
      place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), 0x2a2b2e), 0, 0.78, 0),
      place(paint(new THREE.BoxGeometry(0.16, 0.08, 0.16), 0x2a2b2e), 0, 0.6, 0)];
    for (let k = 0; k < 3; k++) hp.push(place(paint(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 6, 1, true, Math.PI / 2, Math.PI), 0x1a1a1c), 0, 0.32 - k * 0.32, 0.27, Math.PI / 2, 0, 0));   // visors
    inst(scene, merge(hp), dark, heads);
    // signal controller cabinets: grey steel, vents, a sticker or two
    inst(scene, merge([
      place(paint(new THREE.BoxGeometry(1.0, 0.25, 0.65), 0x8a8780), 0, 0.12, 0),
      place(paint(new THREE.BoxGeometry(0.9, 1.45, 0.55), 0x9a9c98), 0, 0.97, 0),
      place(paint(new THREE.BoxGeometry(0.96, 0.05, 0.6), 0x8a8c88), 0, 1.71, 0),
      place(paint(new THREE.BoxGeometry(0.6, 0.18, 0.01), 0x5a5c58), 0, 1.4, 0.28),
      place(paint(new THREE.BoxGeometry(0.02, 0.12, 0.02), 0x3a3a3a), 0.38, 1.0, 0.28),
      place(paint(new THREE.BoxGeometry(0.18, 0.12, 0.01), 0xd8d0b0), -0.2, 0.75, 0.28),
    ]), dark, cabs);
    inst(scene, merge([place(paint(new THREE.BoxGeometry(0.4, 0.66, 0.2), 0x2a2b2e), 0, 0, 0),
      place(paint(new THREE.BoxGeometry(0.12, 0.08, 0.2), 0x2a2b2e), 0, 0, -0.14)]), dark, peds);
  }
  // the lenses: one mesh, coloured per lens each frame (see updateSignals)
  const lampGeo = new THREE.CircleGeometry(0.14, 16);
  const lampMesh = inst(scene, lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lampList, lampList.map(() => 0x000000), false, false);
  // walk panels: a raised hand over a walking figure, drawn once onto a little texture
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
  const x = cv.getContext("2d");
  x.fillStyle = "#050505"; x.fillRect(0, 0, 128, 64);
  x.fillStyle = "#fff";
  // hand (left half)
  x.beginPath(); x.ellipse(32, 40, 13, 15, 0, 0, Math.PI * 2); x.fill();
  for (let f = 0; f < 4; f++) { x.beginPath(); x.roundRect(20 + f * 6.5, 10 + Math.abs(f - 1.5) * 3, 5, 26, 2.5); x.fill(); }
  x.beginPath(); x.roundRect(40, 30, 14, 5, 2.5); x.fill();
  // walking figure (right half)
  x.beginPath(); x.arc(96, 12, 5.5, 0, Math.PI * 2); x.fill();
  x.lineCap = "round"; x.strokeStyle = "#fff"; x.lineWidth = 6;
  x.beginPath(); x.moveTo(95, 20); x.lineTo(93, 38); x.moveTo(93, 38); x.lineTo(84, 56); x.moveTo(93, 38); x.lineTo(103, 56);
  x.moveTo(95, 22); x.lineTo(86, 32); x.moveTo(95, 22); x.lineTo(104, 30); x.stroke();
  const icon = new THREE.CanvasTexture(cv); icon.colorSpace = THREE.SRGBColorSpace;
  const pedGeo = new THREE.PlaneGeometry(0.3, 0.27);
  const uv = pedGeo.attributes.uv;   // each panel picks its half of the texture by its row (k): 0 hand, 1 walk
  const pedGeoHand = pedGeo.clone(), pedGeoWalk = pedGeo.clone();
  for (let v = 0; v < uv.count; v++) { pedGeoHand.attributes.uv.setX(v, uv.getX(v) * 0.5); pedGeoWalk.attributes.uv.setX(v, 0.5 + uv.getX(v) * 0.5); }
  const pedMat = new THREE.MeshBasicMaterial({ map: icon, toneMapped: false });
  const handIdx = [], walkIdx = [];
  pedMeta.forEach((m, n) => (m[3] === 0 ? handIdx : walkIdx).push(n));
  const handMesh = inst(scene, pedGeoHand, pedMat, handIdx.map(n => pedList[n]), handIdx.map(() => 0), false, false);
  const walkMesh = inst(scene, pedGeoWalk, pedMat, walkIdx.map(n => pedList[n]), walkIdx.map(() => 0), false, false);
  // a soft glow round each lit lens, so you can read the lights from down the street
  const gc = document.createElement("canvas"); gc.width = gc.height = 64;
  const gx = gc.getContext("2d"), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,255,255,0.55)"); gr.addColorStop(0.5, "rgba(255,255,255,0.12)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampList.flatMap(([x, y, z, f]) => [x + Math.sin(f) * 0.05, y, z + Math.cos(f) * 0.05]), 3));
  glowGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(lampList.length * 3), 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ size: 1.6, map: new THREE.CanvasTexture(gc), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.frustumCulled = false; scene.add(glow);
  const signals = { glow, lampList, lampMesh, lampMeta, handMesh, walkMesh, handMeta: handIdx.map(n => pedMeta[n]), walkMeta: walkIdx.map(n => pedMeta[n]) };

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
  // the scanned clutter (realprops.js): trash bags piled against the shop walls, boxes and crates
  // put out back, and here and there a run of concrete barriers fencing off kerb works
  const clutter = { trashbag: [], box: [], crate: [], barrier: [] }, solids = [];
  const cr = mulberry32(0xC1077E);
  for (const b of plan.blocks) {
    if (b.kind === "plaza") continue;
    const town = b.kind !== "park" && b.kind !== "suburb";
    const walls = town ? plan.buildings.filter(w => (w.y || 0) < 1 && w.x + w.w / 2 > b.x0 && w.x - w.w / 2 < b.x1 && w.z + w.d / 2 > b.z0 && w.z - w.d / 2 < b.z1)
      .map(w => ({ x0: w.x - w.w / 2, x1: w.x + w.w / 2, z0: w.z - w.d / 2, z1: w.z + w.d / 2 })) : [];
    for (let side = 0; side < 4; side++) {
      const [nx, nz] = [[0, -1], [0, 1], [-1, 0], [1, 0]][side];
      // a point t metres along this side, `inset` metres in from the kerb
      const at = (t, inset = 1.0) => nx ? [nx < 0 ? b.x0 + inset : b.x1 - inset, b.z0 + t] : [b.x0 + t, nz < 0 ? b.z0 + inset : b.z1 - inset];
      const along = t => at(t);
      // how far in from the kerb the first building wall is at t (null: open ground, no wall near)
      const wallAt = t => { for (let d = WALK - 0.6; d < WALK + 12; d += 0.25) { const [x, z] = at(t, d); if (walls.some(w => x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1)) return d; } return null; };
      const rot = Math.atan2(nx, nz);
      const works = town && cr() < 0.07;
      if (r() < 0.7) { const [x, z] = along(8 + r() * 10); hyd.push([x, CURB, z, rot]); }
      if (r() < 0.8 && !works) { const [x, z] = along(20 + r() * 20); bin.push([x, CURB, z, rot]); }
      if (r() < 0.35) { const [x, z] = along(14 + r() * 30); news.push([x, CURB, z, rot + Math.PI]); }
      if (!town) continue;
      // kerb works: three barriers end to end along the kerb, solid to anything driving
      if (works) {
        const t0 = 24 + cr() * 8;
        for (let k = 0; k < 3; k++) {
          const [x, z] = at(t0 + k * 2.05, 0.5);
          clutter.barrier.push([x, CURB, z, rot + (cr() - 0.5) * 0.05]);
          solids.push(nx ? { x0: x - 0.32, x1: x + 0.32, z0: z - 1.0, z1: z + 1.0, h: CURB + 0.8 } : { x0: x - 1.0, x1: x + 1.0, z0: z - 0.32, z1: z + 0.32, h: CURB + 0.8 });
        }
        if (cr() < 0.6) { const [x, z] = at(t0 + 6.6, 0.55); clutter.crate.push([x, CURB, z, rot + cr() * 0.4]); }
      }
      // trash out against the wall: a heap of bags, maybe a box or two thrown on
      if (cr() < 0.38) {
        const t = 6 + cr() * 46, n = 2 + Math.floor(cr() * 3), w = wallAt(t);
        if (w !== null) {
          for (let k = 0; k < n; k++) {
            const [x, z] = at(t + (cr() - 0.5) * 1.6, w - 0.3 - cr() * 0.35);
            clutter.trashbag.push([x, CURB - 0.02, z, cr() * 6.28, (cr() - 0.5) * 0.25, 0.85 + cr() * 0.35]);
          }
          if (cr() < 0.35) { const [x, z] = at(t + 1.2 + cr(), w - 0.35); clutter.box.push([x, CURB, z, cr() * 6.28, 0, 0.9 + cr() * 0.25]); }
        }
      }
      if (cr() < 0.12) {
        const t = 6 + cr() * 46, w = wallAt(t);
        if (w !== null) {
          const [x, z] = at(t, w - 0.3);
          clutter.crate.push([x, CURB, z, rot + (cr() - 0.5) * 0.3]);
          if (cr() < 0.5) clutter.crate.push([x, CURB + 0.34, z, rot + (cr() - 0.5) * 0.5]);
          if (cr() < 0.5) { const [x2, z2] = at(t + 0.9, w - 0.35); clutter.box.push([x2, CURB, z2, cr() * 6.28, 0, 1]); }
        }
      }
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
  return { signals, props: [["hydrant", hydM, hyd], ["bin", binM, bin], ["news", newsM, news]], clutter, solids };
}

// light every signal for this moment: each junction's own phase (see signalState / walkState)
const LENS = [[1.0, 0.08, 0.04], [1.0, 0.5, 0.0], [0.1, 1.0, 0.5]];   // red, amber, green
export function updateSignals(S, t, signalState, walkState, cam, night = 0) {
  const lc = S.lampMesh.instanceColor.array, D = 0.035;
  S.lampMeta.forEach(([i, j, axis, k], n) => {
    const st = signalState(i, j, axis, t), lit = st === 2 ? 2 : st === 1 ? 1 : 0;   // GRN -> green lens (row 2)
    const on = (k === 0 && lit === 0) || (k === 1 && lit === 1) || (k === 2 && lit === 2);
    const c = LENS[k], s = on ? 5 : D;
    lc[n * 3] = c[0] * s; lc[n * 3 + 1] = c[1] * s; lc[n * 3 + 2] = c[2] * s;
  });
  S.lampMesh.instanceColor.needsUpdate = true;
  // glows: only the lit lens, only from in front, stronger after dark
  if (cam) {
    const gcol = S.glow.geometry.attributes.color.array, g = 0.12 + 0.5 * night;
    S.lampList.forEach(([x, y, z, f], n) => {
      const dx = cam.x - x, dz = cam.z - z, d = Math.hypot(dx, dz) || 1, front = Math.max(0, (Math.sin(f) * dx + Math.cos(f) * dz) / d);
      const k = lc[n * 3] + lc[n * 3 + 1] + lc[n * 3 + 2] > 1 ? g * front * front : 0;
      gcol[n * 3] = lc[n * 3] * k; gcol[n * 3 + 1] = lc[n * 3 + 1] * k; gcol[n * 3 + 2] = lc[n * 3 + 2] * k;
    });
    S.glow.geometry.attributes.color.needsUpdate = true;
  }
  const blink = (t % 1) < 0.5;
  const hc = S.handMesh.instanceColor.array, wc = S.walkMesh.instanceColor.array;
  S.handMeta.forEach(([i, j, road], n) => {
    const w = walkState(i, j, road, t), on = w === 0 || (w === 1 && blink);
    hc[n * 3] = on ? 3.2 : 0.06; hc[n * 3 + 1] = on ? 1.5 : 0.03; hc[n * 3 + 2] = on ? 0.3 : 0.01;
  });
  S.walkMeta.forEach(([i, j, road], n) => {
    const on = walkState(i, j, road, t) === 2;
    wc[n * 3] = on ? 2.6 : 0.05; wc[n * 3 + 1] = on ? 2.9 : 0.05; wc[n * 3 + 2] = on ? 3.0 : 0.05;
  });
  S.handMesh.instanceColor.needsUpdate = true; S.walkMesh.instanceColor.needsUpdate = true;
}
