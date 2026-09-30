// Palm City — the city plan. Pure data, no three.js: every other system (rendering, traffic,
// crowd, collision, minimap) reads the same layout from here, so they can never disagree about
// where a road or a wall is.
//
// Axes: +x east, +z SOUTH (the sea is along the south edge), y up. One unit ≈ one metre.

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const N = 14;                 // blocks per side
export const ROAD = 16;              // road width, kerb to kerb (two lanes each way)
export const BLOCK = 58;             // block width including its sidewalk ring
export const WALK = 4.5;             // sidewalk width
export const CURB = 0.22;            // sidewalk height above the road
export const CELL = BLOCK + ROAD;
export const SIZE = N * CELL + ROAD; // edge road to edge road
export const HALF = SIZE / 2;
export const SHORE = HALF + 64;      // where the sand meets the water
export const LANE = ROAD / 4;        // 4 m lanes

// centre line of road i (0..N) — roads run along both axes at the same offsets
export const roadC = i => -HALF + ROAD / 2 + i * CELL;
// block j (0..N-1) spans [blockMin(j), blockMin(j)+BLOCK]
export const blockMin = j => -HALF + ROAD + j * CELL;
export const blockC = j => blockMin(j) + BLOCK / 2;
// which road index is nearest to a coordinate, and how far from its centre line
export const nearestRoad = v => clamp(Math.round((v + HALF - ROAD / 2) / CELL), 0, N);

// ---------------------------------------------------------------------------------------------
// Districts. The plaza sits just south of centre; downtown towers north of it; the rough quarter
// in the north-east; leafy suburbs in the west; pastel mid-rise everywhere else; the beach strip
// takes the whole southern row.
export const PLAZA = { i: 6, j: 9 };
export function district(i, j) {
  if (i === PLAZA.i && j === PLAZA.j) return "plaza";
  if ((i === 3 && j === 5) || (i === 10 && j === 10) || (i === 7 && j === 2)) return "park";
  if (j === N - 1) return "beachfront";
  const dx = i - 6.5, dz = j - 5.5;
  if (dx * dx + dz * dz < 9) return "downtown";
  if (i >= 10 && j <= 4) return "rough";
  if (i <= 2) return "suburb";
  return "midtown";
}

// ---------------------------------------------------------------------------------------------
// Lots & buildings. Each block is split into lots; each lot gets a building (or a pair: a podium
// with a tower set back on top). Everything is an axis-aligned box so collision stays exact.
export const STYLE = { GLASS: 0, PASTEL: 1, BRICK: 2, HOUSE: 3, CONCRETE: 4 };

// sun-bleached stucco: off-whites, sand, faded salmon / mint / butter / sky — nothing candy-bright
const PASTELS = [0xe4ddcf, 0xd8cbb4, 0xcfb9a4, 0xd9b3a0, 0xb9c9bb, 0xd8cb9c, 0xa9b8c2, 0xe6e0d6, 0xc7b8a6, 0xbfa58c, 0xd3c4b0];
const GLASS = [0x4a6272, 0x55707c, 0x3e5664, 0x6b6456, 0x5a6a70, 0x7c7462];   // tinted blue-green and bronze
const BRICK = [0x7e4a3a, 0x6e4638, 0x8a5c46, 0x5e4a42, 0x74503e];
const HOUSE = [0xe8e2d6, 0xdccdb6, 0xc8d0cc, 0xe0d4ac, 0xd4c0b4, 0xc2ccba];
const CONC = [0xb4ada2, 0xa49d92, 0xbfb8ac];

export function buildCity(seed = 0x9A1C17) {
  const r = mulberry32(seed);
  const pick = a => a[(r() * a.length) | 0];
  const buildings = [];   // { x, z, w, d, h, y, style, color, seed, roof }
  const blocks = [];      // { i, j, x0, z0, x1, z1, kind }
  const palms = [];       // [x, z, scale]
  const trees = [];       // [x, z, scale]
  const lamps = [];       // [x, z, rotY]
  const benches = [];     // [x, z, rotY]

  const add = (x, z, w, d, h, style, color, y = 0) => {
    buildings.push({ x, z, w, d, h, y, style, color, seed: r(), roof: r() });
  };

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const kind = district(i, j);
    const x0 = blockMin(i), z0 = blockMin(j), x1 = x0 + BLOCK, z1 = z0 + BLOCK;
    blocks.push({ i, j, x0, z0, x1, z1, kind });
    const ix0 = x0 + WALK, iz0 = z0 + WALK, iw = BLOCK - WALK * 2;   // buildable interior

    // street furniture on every sidewalk: lamps at the corners' thirds, palms between them
    for (const [ax, az, rot] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
      for (let k = 0; k < 3; k++) {
        const t = (k + 0.5) / 3;
        const px = ax === 0 ? lerp(x0 + 6, x1 - 6, t) : (ax < 0 ? x0 + 1.1 : x1 - 1.1);
        const pz = az === 0 ? lerp(z0 + 6, z1 - 6, t) : (az < 0 ? z0 + 1.1 : z1 - 1.1);
        if (k === 1) lamps.push([px, pz, rot]);
        else if (kind !== "rough" && kind !== "downtown") palms.push([px, pz, 0.85 + r() * 0.35]);
        else if (kind === "downtown" && r() < 0.5) trees.push([px, pz, 0.8 + r() * 0.3]);
      }
    }

    if (kind === "plaza") {
      // the hub: open paving, a fountain in the middle, a ring of palms, benches facing in
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        palms.push([blockC(i) + Math.cos(a) * 17, blockC(j) + Math.sin(a) * 17, 1.05 + r() * 0.2]);
        if (k % 3 === 0) benches.push([blockC(i) + Math.cos(a + 0.26) * 12, blockC(j) + Math.sin(a + 0.26) * 12, -a - Math.PI / 2]);
      }
      continue;
    }
    if (kind === "park") {
      for (let k = 0; k < 26; k++) trees.push([ix0 + 3 + r() * (iw - 6), iz0 + 3 + r() * (iw - 6), 0.8 + r() * 0.6]);
      for (let k = 0; k < 4; k++) benches.push([blockC(i) + (k - 1.5) * 8, blockC(j) + 4, 0]);
      continue;
    }
    if (kind === "suburb") {
      // a 2x2 of detached houses on lawns with a tree each
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const cx = ix0 + iw * (0.25 + a * 0.5), cz = iz0 + iw * (0.25 + b * 0.5);
        const w = 11 + r() * 4, d = 9 + r() * 4;
        add(cx, cz, w, d, 5.5 + r() * 3.5, STYLE.HOUSE, pick(HOUSE));
        trees.push([cx + (a ? 8 : -8), cz + (b ? 7 : -7), 0.8 + r() * 0.4]);
      }
      continue;
    }
    if (kind === "beachfront") {
      // low pastel hotels facing the sea, gaps between them for palms
      const n = 3;
      for (let k = 0; k < n; k++) {
        const w = iw / n - 3;
        const cx = ix0 + (k + 0.5) * iw / n, cz = iz0 + iw * 0.42;
        add(cx, cz, w, iw * 0.7, 12 + r() * 16, STYLE.PASTEL, pick(PASTELS));
      }
      continue;
    }

    // city blocks: split into 1-4 lots
    const split = kind === "downtown" ? (r() < 0.5 ? 1 : 2) : (r() < 0.3 ? 2 : 4);
    const lots = [];
    if (split === 1) lots.push([ix0, iz0, iw, iw]);
    else if (split === 2) {
      if (r() < 0.5) { lots.push([ix0, iz0, iw / 2, iw], [ix0 + iw / 2, iz0, iw / 2, iw]); }
      else { lots.push([ix0, iz0, iw, iw / 2], [ix0, iz0 + iw / 2, iw, iw / 2]); }
    } else {
      const h = iw / 2;
      lots.push([ix0, iz0, h, h], [ix0 + h, iz0, h, h], [ix0, iz0 + h, h, h], [ix0 + h, iz0 + h, h, h]);
    }
    for (const [lx, lz, lw, ld] of lots) {
      const gap = 1.2;
      const w = lw - gap * 2, d = ld - gap * 2, cx = lx + lw / 2, cz = lz + ld / 2;
      if (kind === "downtown") {
        // podium + setback tower: the silhouette that makes a skyline read as a skyline
        const ph = 9 + r() * 6;
        add(cx, cz, w, d, ph, STYLE.CONCRETE, pick(CONC));
        const tw = w * (0.55 + r() * 0.25), td = d * (0.55 + r() * 0.25);
        const th = 45 + r() * 110 * (split === 1 ? 1 : 0.7);
        add(cx + (r() - 0.5) * (w - tw) * 0.6, cz + (r() - 0.5) * (d - td) * 0.6, tw, td, th, STYLE.GLASS, pick(GLASS), ph);
      } else if (kind === "rough") {
        add(cx, cz, w, d, 9 + r() * 14, STYLE.BRICK, pick(BRICK));
      } else {
        const h = 10 + r() * 26;
        add(cx, cz, w, d, h, r() < 0.2 ? STYLE.CONCRETE : STYLE.PASTEL, r() < 0.2 ? pick(CONC) : pick(PASTELS));
      }
    }
  }

  // the promenade: a row of palms along the sand, benches looking at the sea
  for (let x = -HALF + 8; x < HALF; x += 16) {
    palms.push([x + r() * 4, HALF + 14 + r() * 3, 1.0 + r() * 0.35]);
    if (r() < 0.35) benches.push([x + 8, HALF + 10, 0]);
  }

  // shrubs hug the base of buildings, fill front gardens and clump in parks (own stream: adding
  // them doesn't reshuffle the rest of the city)
  const sr = mulberry32(seed ^ 0x5A5A);
  const shrubs = [];
  for (const b of buildings) {
    if (b.y > 0.5 || b.style === STYLE.GLASS) continue;
    const many = b.style === STYLE.HOUSE ? 0.8 : 0.3;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (sr() > many) continue;
      const len = nx ? b.d : b.w, n = 2 + ((sr() * len / 4) | 0);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5 + (sr() - 0.5) * 0.1;
        const x = b.x + (nx ? nx * (b.w / 2 + 0.9) : t * (b.w - 2)), z = b.z + (nz ? nz * (b.d / 2 + 0.9) : t * (b.d - 2));
        shrubs.push([x, z, 0.7 + sr() * 0.6]);
      }
    }
  }
  for (const bl of blocks) if (bl.kind === "park") {
    for (let k = 0; k < 30; k++) shrubs.push([bl.x0 + WALK + 2 + sr() * (BLOCK - WALK * 2 - 4), bl.z0 + WALK + 2 + sr() * (BLOCK - WALK * 2 - 4), 0.8 + sr() * 0.8]);
  }
  return { buildings, blocks, palms, trees, lamps, benches, shrubs };
}

// ---------------------------------------------------------------------------------------------
// Collision: a uniform grid of building boxes. Circle-vs-box push-out is all the game needs.
export class Collider {
  constructor(buildings) {
    this.cell = 40;
    this.map = new Map();
    this.boxes = buildings.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: b.y + b.h }));
    for (const bx of this.boxes) {
      for (let gx = Math.floor(bx.x0 / this.cell); gx <= Math.floor(bx.x1 / this.cell); gx++)
        for (let gz = Math.floor(bx.z0 / this.cell); gz <= Math.floor(bx.z1 / this.cell); gz++) {
          const k = gx + "," + gz; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(bx);
        }
    }
  }
  near(x, z) { return this.map.get(Math.floor(x / this.cell) + "," + Math.floor(z / this.cell)) || []; }
  // push a circle (x,z,r) out of any building; returns {x, z, hit, nx, nz}
  resolve(x, z, rad) {
    let hit = false, nx = 0, nz = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.near(x, z)) {
        const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = rad - d;
          x += dx / d * push; z += dz / d * push; nx = dx / d; nz = dz / d;
        } else {   // centre inside the box: leave by the nearest face
          const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bb = b.z1 - z, m = Math.min(l, rr, t, bb);
          if (m === l) { x = b.x0 - rad; nx = -1; nz = 0; } else if (m === rr) { x = b.x1 + rad; nx = 1; nz = 0; }
          else if (m === t) { z = b.z0 - rad; nx = 0; nz = -1; } else { z = b.z1 + rad; nx = 0; nz = 1; }
        }
      }
    }
    return { x, z, hit, nx, nz };
  }
  // does the segment (ax,az)->(bx,bz) at height y pass through a building? (camera + line of sight)
  segmentHit(ax, az, bx, bz, y) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const b of this.near(x, z)) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h) return t;
    }
    return 1;
  }
}

// ground height: sidewalks and block interiors sit on the kerb, roads at 0, the beach slopes to the sea
export function groundY(x, z) {
  if (z > HALF) return Math.max(-1.2, -(z - HALF - 30) * 0.035) * (z > HALF + 30 ? 1 : 0);
  if (Math.abs(x) > HALF || z < -HALF) return 0;
  const lx = ((x + HALF) % CELL + CELL) % CELL, lz = ((z + HALF) % CELL + CELL) % CELL;
  return (lx > ROAD && lz > ROAD) ? CURB : 0;
}
