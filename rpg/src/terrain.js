// The valley of Cinderhold: one height function shared by the mesh, the grass shader,
// the water shader and every character's feet.
import * as THREE from 'three';
import { fbm, simplex2, smoothstep, lerp, clamp } from './noise.js';

export const WORLD = 360;           // terrain spans -180..180 on X and Z
export const SEGMENTS = 240;        // grid resolution (1.5 units per cell)
export const PLAY_RADIUS = 121;     // invisible wall before the mountains
export const WATER_LEVEL = 0.0;

export const ZONES = {
  village: { name: 'Cinderhold', x: 0, z: 52, r: 27, fall: 14, h: 3.2 },
  ruins: { name: 'The Hollow Ruins', x: 0, z: -28, r: 25, fall: 14, h: 4.2 },
  shrine: { name: 'Ember Shrine', x: 0, z: -94, r: 21, fall: 10, h: 8.6 },
  lake: { name: 'Stillwater', x: -74, z: 12, r: 30 },
};

// Dirt roads (waypoint polylines). Heights along them are smoothed.
export const PATHS = [
  [[0, 96], [0, 76], [0, 60], [0, 44], [-7, 26], [-4, 10], [4, -6], [0, -20], [0, -38], [0, -54], [0, -70], [0, -80]],
  [[-4, 52], [-24, 48], [-44, 38], [-56, 26]],
  [[6, 50], [22, 44], [34, 36]],
  [[0, 58], [18, 66], [30, 74]],
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return [Math.hypot(px - cx, pz - cz), t];
}

export function pathDistance(x, z) {
  let best = 1e9;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [d] = segDist(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = 2.6 + fbm(x * 0.011, z * 0.011, 4) * 9 + fbm(x * 0.05 + 10, z * 0.05 - 3, 2) * 1.3;
  // Mountains rise all around the valley.
  const rim = smoothstep(116, 172, r);
  h += Math.pow(rim, 1.35) * (36 + fbm(x * 0.02, z * 0.02, 3) * 18);
  // Stillwater lake basin.
  const lake = ZONES.lake;
  const dl = Math.hypot(x - lake.x, z - lake.z) + simplex2(x * 0.05, z * 0.05) * 4;
  h = lerp(h, -3.2, 1 - smoothstep(lake.r * 0.45, lake.r * 1.15, dl));
  return h;
}

function zonedHeight(x, z) {
  let h = rawHeight(x, z);
  for (const key of ['village', 'ruins', 'shrine']) {
    const zn = ZONES[key];
    const d = Math.hypot(x - zn.x, z - zn.z);
    h = lerp(h, zn.h, 1 - smoothstep(zn.r, zn.r + zn.fall, d));
  }
  return h;
}

// Precompute waypoint heights so roads run smoothly between them.
const PATH_H = PATHS.map((path) => path.map(([x, z]) => zonedHeight(x, z)));
PATH_H[0][PATH_H[0].length - 1] = ZONES.shrine.h;
PATH_H[0][PATH_H[0].length - 2] = lerp(ZONES.ruins.h, ZONES.shrine.h, 0.72);
PATH_H[0][PATH_H[0].length - 3] = lerp(ZONES.ruins.h, ZONES.shrine.h, 0.3);

export function computeHeight(x, z) {
  let h = zonedHeight(x, z);
  PATHS.forEach((path, p) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [d, t] = segDist(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
      if (d < 12) {
        const target = lerp(PATH_H[p][i], PATH_H[p][i + 1], t);
        h = lerp(h, target, (1 - smoothstep(3, 12, d)) * 0.85);
      }
    }
  });
  return h;
}

// ---------------------------------------------------------------------------
// Baked grid + fast lookups
// ---------------------------------------------------------------------------
const N = SEGMENTS + 1;
const CELL = WORLD / SEGMENTS;
export const heights = new Float32Array(N * N);
export const grassMask = new Uint8Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const x = -WORLD / 2 + i * CELL;
    const z = -WORLD / 2 + j * CELL;
    heights[j * N + i] = computeHeight(x, z);
  }
}

export function heightAt(x, z) {
  const fx = clamp((x + WORLD / 2) / CELL, 0, SEGMENTS - 0.001);
  const fz = clamp((z + WORLD / 2) / CELL, 0, SEGMENTS - 0.001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = heights[j * N + i];
  const b = heights[j * N + i + 1];
  const c = heights[(j + 1) * N + i];
  const d = heights[(j + 1) * N + i + 1];
  // Match the triangle split PlaneGeometry uses so feet sit exactly on the mesh.
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}

export function normalAt(x, z, target = new THREE.Vector3()) {
  const e = 0.6;
  return target.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

export function zoneAt(x, z) {
  for (const key of ['village', 'ruins', 'shrine', 'lake']) {
    const zn = ZONES[key];
    if (Math.hypot(x - zn.x, z - zn.z) < zn.r + 6) return key;
  }
  return 'wilds';
}

// ---------------------------------------------------------------------------
// Terrain mesh with painted vertex colors
// ---------------------------------------------------------------------------
const C = (hex) => new THREE.Color(hex);
const PAL = {
  grassA: C('#4c7a2e'), grassB: C('#86a43f'), dry: C('#a79a52'), dirt: C('#8a6644'),
  cobble: C('#877b6c'), stone: C('#6f6760'), rock: C('#5a4a44'), rockB: C('#7d6655'), rockHi: C('#8e857c'),
  snow: C('#e9edf2'), sand: C('#c9b47c'), bed: C('#34503f'),
};

function paint(x, z, h, slope, out) {
  const n1 = fbm(x * 0.06, z * 0.06, 3) * 0.5 + 0.5;
  const n2 = fbm(x * 0.013 + 40, z * 0.013, 3) * 0.5 + 0.5;
  out.copy(PAL.grassA).lerp(PAL.grassB, n1);
  out.lerp(PAL.dry, smoothstep(0.58, 0.85, n2) * 0.7);
  let grass = 1;

  const pd = pathDistance(x, z) + simplex2(x * 0.3, z * 0.3) * 0.7;
  const road = 1 - smoothstep(1.6, 3.0, pd);
  out.lerp(PAL.dirt, road);
  grass *= smoothstep(1.4, 3.6, pd);

  const v = ZONES.village;
  const dv = Math.hypot(x - v.x, z - v.z);
  const plaza = 1 - smoothstep(8, 11, dv + simplex2(x * 0.2, z * 0.2) * 1.5);
  out.lerp(PAL.cobble, plaza);
  grass *= 1 - plaza;

  const r = ZONES.ruins;
  const dr = Math.hypot(x - r.x, z - r.z);
  const ruinFloor = (1 - smoothstep(14, 24, dr)) * smoothstep(0.35, 0.65, n1 + simplex2(x * 0.15, z * 0.15) * 0.3);
  out.lerp(PAL.stone, ruinFloor * 0.8);
  grass *= 1 - ruinFloor * 0.9;

  const s = ZONES.shrine;
  const ds = Math.hypot(x - s.x, z - s.z);
  const arena = 1 - smoothstep(16, 22, ds);
  out.lerp(PAL.stone, arena);
  grass *= 1 - arena;

  const rocky = smoothstep(0.45, 0.75, slope);
  // Banded sandstone-and-slate cliffs instead of flat gray.
  const strata = 0.5 + 0.5 * Math.sin(h * 0.55 + fbm(x * 0.03, z * 0.03, 2) * 4);
  const cliff = PAL.rock.clone().lerp(PAL.rockB, strata * 0.8).lerp(PAL.rockHi, smoothstep(24, 36, h) * 0.6);
  out.lerp(cliff, rocky);
  grass *= 1 - rocky;
  out.lerp(PAL.snow, smoothstep(30, 40, h + n1 * 8) * (1 - rocky * 0.6));
  grass *= 1 - smoothstep(20, 30, h);

  const shore = 1 - smoothstep(0.2, 1.3, h);
  out.lerp(PAL.sand, shore);
  out.lerp(PAL.bed, 1 - smoothstep(-1.6, -0.2, h));
  grass *= smoothstep(0.9, 1.6, h);
  return clamp(grass * (0.55 + 0.45 * n1), 0, 1);
}

function detailTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 22, y / 22, 4) * 0.5 + 0.5;
      const speck = Math.random() * 0.12;
      const v = Math.round(255 * clamp(0.78 + n * 0.22 - speck, 0, 1));
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WORLD / 5, WORLD / 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const nrm = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const i = Math.round((x + WORLD / 2) / CELL);
    const j = Math.round((z + WORLD / 2) / CELL);
    const h = heights[j * N + i];
    pos.setY(k, h);
    normalAt(x, z, nrm);
    const g = paint(x, z, h, (1 - nrm.y) * 2.2, col);
    grassMask[j * N + i] = Math.round(g * 255);
    colors[k * 3] = col.r;
    colors[k * 3 + 1] = col.g;
    colors[k * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detailTexture() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'Terrain';
  return mesh;
}

// Height + grass masks as textures for the GPU (grass and water shaders).
export function terrainTextures() {
  const hTex = new THREE.DataTexture(heights, N, N, THREE.RedFormat, THREE.FloatType);
  hTex.minFilter = hTex.magFilter = THREE.NearestFilter;
  hTex.needsUpdate = true;
  const gTex = new THREE.DataTexture(grassMask, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  gTex.minFilter = gTex.magFilter = THREE.LinearFilter;
  gTex.needsUpdate = true;
  return { hTex, gTex, size: N, world: WORLD };
}
