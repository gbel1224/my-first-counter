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
export const STYLE = { GLASS: 0, PASTEL: 1, BRICK: 2, HOUSE: 3, CONCRETE: 4, GARAGE: 5, LANDMARK: 6 };

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

  const homeLots = [];    // suburban lots (see the suburb blocks)
  const sk = mulberry32(seed ^ 0x5C71);   // the skyline's own stream (tiers, crowns)
  const parks = [];       // the parks' layout (paths, features, who's sitting on the benches)
  const lr = mulberry32(seed ^ 0x10755);   // own stream: the lots don't reshuffle the rest of the city
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
      // and one near each end of the side, so every corner and crosswalk is lit
      for (const e of [4.5, BLOCK - 4.5]) {
        const ex = ax === 0 ? x0 + e : (ax < 0 ? x0 + 1.1 : x1 - 1.1);
        const ez = az === 0 ? z0 + e : (az < 0 ? z0 + 1.1 : z1 - 1.1);
        lamps.push([ex, ez, rot]);
      }
    }

    if (kind === "plaza") {
      // the hub: open paving, a fountain in the middle, a ring of palms, benches facing in
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        palms.push([blockC(i) + Math.cos(a) * 17, blockC(j) + Math.sin(a) * 17, 1.05 + r() * 0.2]);
        if (k % 3 === 0) benches.push([blockC(i) + Math.cos(a + 0.26) * 12, blockC(j) + Math.sin(a + 0.26) * 12, -a - Math.PI / 2]);
      }
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; lamps.push([blockC(i) + Math.cos(a) * 21, blockC(j) + Math.sin(a) * 21, Math.PI / 2 - a]); }   // round the plaza
      continue;
    }
    if (kind === "park") {
      // a gravel loop with paths in from every side to a paved round in the middle; a fountain, a
      // gazebo or a statue there, and two of playground / half court / picnic area in the quarters
      const cx = blockC(i), cz = blockC(j), pk = parks.length;
      const park = { i, j, cx, cz, centre: ["fountain", "gazebo", "statue"][pk % 3], quads: [[1, -1, ["playground", "court", "playground"][pk % 3]], [-1, 1, ["picnic", "picnic", "court"][pk % 3]]], sitters: [] };
      parks.push(park);
      const feat = (x, z) => park.quads.some(([a, b]) => Math.abs(x - (cx + a * 9)) < 4.8 && Math.abs(z - (cz + b * 9)) < 4.8);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lamps.push([cx + a * 17.4, cz + b * 17.4, Math.atan2(a, b)]);                       // round the loop
        lamps.push([cx + a * 5.2, cz + b * 5.2, Math.atan2(a, b) + Math.PI]);                 // round the middle
      }
      for (let k = 0; k < 26; k++) {
        const x = ix0 + 3 + r() * (iw - 6), z = iz0 + 3 + r() * (iw - 6), sc = 0.8 + r() * 0.6;
        if (parkPathD(x - cx, z - cz) > 2.2 && !feat(x, z)) trees.push([x, z, sc]);
      }
      // benches along the loop, facing the path, and round the middle facing in
      const pr = mulberry32(seed ^ (0x9A2C + pk));
      const bench = (x, z, fx, fz) => { const a = Math.atan2(-fx, -fz); benches.push([x, z, a]); if (pr() < 0.45) park.sitters.push([x - fx * 0.05, z - fz * 0.05, Math.atan2(fx, fz)]); if (pr() < 0.4) park.bins = (park.bins || []).concat([[x + fz * 1.4, z - fx * 1.4]]); };
      for (const [sa, sb] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const along of [-7.5, 7.5]) {
        const x = cx + (sa ? sa * 17.0 : along), z = cz + (sb ? sb * 17.0 : along);
        bench(x, z, -sa, -sb);
      }
      for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * Math.PI * 2; if (Math.abs(Math.sin(a * 2)) < 0.35) continue; bench(cx + Math.cos(a) * 5.4, cz + Math.sin(a) * 5.4, -Math.cos(a), -Math.sin(a)); }
      continue;
    }
    if (kind === "suburb") {
      // four lots, each a detached house facing its street (north or south) with an attached
      // garage on the inside, a driveway out to the kerb, a path to the front door, a palm in the
      // front yard and a fenced back yard (often with a pool)
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const qx = ix0 + iw * (0.25 + a * 0.5);
        const w = 9.5 + r() * 2.5, d = 8.5 + r() * 3, two = r() < 0.5, h = two ? 6.6 : 3.6;
        const fz = b ? 1 : -1, sx = a ? -1 : 1;                  // facing, and which side the garage is on
        const zE = b ? iz0 + iw : iz0, zB = iz0 + iw / 2;       // the lot's front and back lines
        const gw = 6.2, gd = 6.8, W = w + gw;
        const zf = zE - fz * 6.5, hz = zf - fz * d / 2, hx = qx - sx * gw / 2, gx = qx + sx * w / 2, gz = zf - fz * gd / 2;
        const color = pick(HOUSE);
        add(hx, hz, w, d, h, STYLE.HOUSE, color);
        const house = buildings[buildings.length - 1];
        buildings.push({ x: gx, z: gz, w: gw, d: gd, h: 3.1, y: 0, style: STYLE.GARAGE, color, seed: lr(), roof: 10 + (fz > 0 ? 0 : 1) });
        const garage = buildings[buildings.length - 1];
        // the front door sits between two window bays, as near the middle as the bays allow
        const bays = Math.max(1, Math.round(w / 2 / 4.2));
        const doorX = hx - w / 2 + Math.min(bays, Math.floor((w - 1.2) / 4.2)) * 4.2;
        const roofKind = lr() < 0.45 ? 0 : lr() < 0.75 ? 1 : 2;   // barrel tile, shingle, standing-seam metal
        const lot = {
          qx, zE, zB, fz, sx, house, garage, doorX, two, roofKind, hip: lr() < 0.7,
          trim: lr() < 0.75 ? 0xf2f0ea : [0x3a4a5a, 0x5a3a2a, 0x2a4a3a][(lr() * 3) | 0],
          drive: [gx - 2.9, Math.min(zf, zE), gx + 2.9, Math.max(zf, zE)],
          path: [doorX - 0.65, Math.min(zf + fz * 1.6, zE), doorX + 0.65, Math.max(zf + fz * 1.6, zE)],
          porch: [doorX - 1.3, Math.min(zf, zf + fz * 1.6), doorX + 1.3, Math.max(zf, zf + fz * 1.6)],
          front: lr(),                                            // picket fence / hedge / open lawn
          chimney: two && lr() < 0.3, solar: lr() < 0.25, car: lr() < 0.6,
        };
        // a pool in the back yard when there's room for one
        const backD = Math.abs(zB - (hz - fz * d / 2));
        if (backD > 6.3 && lr() < 0.65) {
          const pz = (hz - fz * d / 2) - fz * (backD / 2 + 0.2), px = qx + (lr() - 0.5) * 3;
          lot.pool = [px - 3.3, pz - 1.6, px + 3.3, pz + 1.6];
          lot.deck = [px - 4.6, pz - 2.7, px + 4.6, pz + 2.7];
        }
        homeLots.push(lot);
        trees.push([qx - sx * (W / 2 - 1.2), zE - fz * 3.0, 0.8 + r() * 0.4]);
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
        // what the skyline sees: setback tiers on some towers, and a crown on top of each one
        const tower = buildings[buildings.length - 1], v = sk();
        tower.crown = v < 0.16 ? "spire" : v < 0.32 ? "pyramid" : v < 0.46 ? "helipad" : v < 0.6 ? "fins" : "flat";
        if (th > 60 && sk() < 0.45) {
          let bw = tw, bd = td, by = ph + th;
          const n = sk() < 0.5 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            bw *= 0.7 + sk() * 0.08; bd *= 0.7 + sk() * 0.08;
            const h2 = th * (0.1 + sk() * 0.12);
            buildings.push({ x: tower.x, z: tower.z, w: bw, d: bd, h: h2, y: by, style: STYLE.GLASS, color: tower.color, seed: sk(), roof: sk(), crown: k === n - 1 ? tower.crown : "flat" });
            by += h2;
          }
          tower.crown = "flat";
        }
      } else if (kind === "rough") {
        add(cx, cz, w, d, 9 + r() * 14, STYLE.BRICK, pick(BRICK));
      } else {
        const h = 10 + r() * 26;
        add(cx, cz, w, d, h, r() < 0.2 ? STYLE.CONCRETE : STYLE.PASTEL, r() < 0.2 ? pick(CONC) : pick(PASTELS));
      }
    }
  }

  // two landmarks downtown: Palm Tower, a round glass tower with a spire just north of the plaza,
  // and the Coral Building, an art-deco stepped tower in stone with a lit crown
  const landmarks = [];
  const clearBlock = (i, j) => { const x0 = blockMin(i), z0 = blockMin(j); for (let k = buildings.length - 1; k >= 0; k--) { const b = buildings[k]; if (b.x > x0 && b.x < x0 + BLOCK && b.z > z0 && b.z < z0 + BLOCK) buildings.splice(k, 1); } };
  {
    const i = 6, j = 8, cx = blockC(i), cz = blockC(j);
    clearBlock(i, j);
    buildings.push({ x: cx, z: cz, w: BLOCK - WALK * 2 - 2.4, d: BLOCK - WALK * 2 - 2.4, h: 12, y: 0, style: STYLE.CONCRETE, color: 0xc8c2b6, seed: 0.37, roof: 0.5 });
    buildings.push({ x: cx, z: cz, w: 30, d: 30, h: 232, y: 12, style: STYLE.LANDMARK, color: 0x4a6878, seed: 0.71, roof: 0.2 });
    landmarks.push({ kind: "palm", x: cx, z: cz, r: 15, y: 12, h: 232 });
  }
  {
    const i = 8, j = 4, cx = blockC(i), cz = blockC(j);
    clearBlock(i, j);
    buildings.push({ x: cx, z: cz, w: BLOCK - WALK * 2 - 2.4, d: BLOCK - WALK * 2 - 2.4, h: 14, y: 0, style: STYLE.CONCRETE, color: 0xd8ccb4, seed: 0.13, roof: 0.4 });
    let w = 32, y = 14;
    for (const [hh, s] of [[96, 1], [26, 0.8], [18, 0.64], [12, 0.5]]) {
      buildings.push({ x: cx, z: cz, w: w * s, d: w * s, h: hh, y, style: STYLE.CONCRETE, color: 0xe2d6bc, seed: 0.2 + s * 0.3, roof: 0.3, crown: "flat" });
      y += hh;
    }
    landmarks.push({ kind: "deco", x: cx, z: cz, w: w * 0.5, y });
  }

  // street food: carts on the plaza, along the promenade, at the park gates and on downtown corners
  const carts = [], cr = mulberry32(seed ^ 0xCA27);
  const KINDS = ["icecream", "fruit", "taco", "coconut", "pretzel"];
  { const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4 + 0.2; carts.push({ x: px + Math.cos(a) * 21, z: pz + Math.sin(a) * 21, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), kind: KINDS[k % 3] }); } }
  for (let k = 0; k < 3; k++) carts.push({ x: -HALF + 160 + k * 300 + cr() * 40, z: HALF + 12.6, yaw: Math.PI, kind: k === 1 ? "icecream" : "coconut" });
  for (const pk of parks) carts.push({ x: pk.cx + 3.6, z: pk.cz + 19.5, yaw: -Math.PI / 2, kind: cr() < 0.5 ? "icecream" : "pretzel" });
  for (const b of blocks) if (b.kind === "downtown" && cr() < 0.35) carts.push({ x: b.x0 + 9 + cr() * 30, z: b.z0 + 2.6, yaw: 0, kind: KINDS[(cr() * KINDS.length) | 0] });

  // the promenade: a row of palms along the sand, benches looking at the sea
  for (let x = -HALF + 8; x < HALF; x += 16) {
    palms.push([x + r() * 4, HALF + 14 + r() * 3, 1.0 + r() * 0.35]);
    if (r() < 0.35) benches.push([x + 8, HALF + 10, 0]);
  }
  for (let x = -HALF + 12; x < HALF; x += 24) lamps.push([x, HALF + 7.5, Math.PI]);   // promenade lamps

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
  // nothing grows on the driveway, the path, the porch or the pool deck
  const hard = [];
  for (const L of homeLots) { hard.push(L.drive, L.path, L.porch); if (L.deck) hard.push(L.deck); }
  const clear = ([x, z]) => !hard.some(([a0, b0, a1, b1]) => x > a0 - 0.8 && x < a1 + 0.8 && z > b0 - 0.8 && z < b1 + 0.8);
  for (let k = shrubs.length - 1; k >= 0; k--) if (!clear(shrubs[k])) shrubs.splice(k, 1);
  // a clipped hedge along the front of some lots
  for (const L of homeLots) if (L.front > 0.38 && L.front < 0.72) {
    const x0 = L.qx - BLOCK / 4 + WALK / 2 + 0.6, x1 = L.qx + BLOCK / 4 - WALK / 2 - 0.6, z = L.zE - L.fz * 0.7;
    for (let x = x0; x < x1; x += 1.5) if (clear([x, z])) shrubs.push([x, z, 0.75 + sr() * 0.15, "small"]);
  }
  // nothing grows on the park paths or the play areas
  for (const pk of parks) for (let k = shrubs.length - 1; k >= 0; k--) {
    const [x, z] = shrubs[k], lx = x - pk.cx, lz = z - pk.cz;
    if (Math.abs(lx) < BLOCK / 2 && Math.abs(lz) < BLOCK / 2 && (parkPathD(lx, lz) < 1.6 || pk.quads.some(([a, b]) => Math.abs(lx - a * 9) < 5.4 && Math.abs(lz - b * 9) < 5.4))) shrubs.splice(k, 1);
  }
  for (const bl of blocks) if (bl.kind === "park") {
    const pk = parks.find(q => q.i === bl.i && q.j === bl.j);
    for (let k = 0; k < 30; k++) {
      const x = bl.x0 + WALK + 2 + sr() * (BLOCK - WALK * 2 - 4), z = bl.z0 + WALK + 2 + sr() * (BLOCK - WALK * 2 - 4), sc = 0.8 + sr() * 0.8;
      const lx = x - pk.cx, lz = z - pk.cz;
      if (parkPathD(lx, lz) > 1.6 && !pk.quads.some(([a, b]) => Math.abs(lx - a * 9) < 5.4 && Math.abs(lz - b * 9) < 5.4)) shrubs.push([x, z, sc]);
    }
  }
  return { buildings, blocks, palms, trees, lamps, benches, shrubs, lots: homeLots, parks, landmarks, carts };
}

// the park paths: signed distance (m, negative on the path) from a point given relative to the park's
// centre — a gravel loop round a rounded square 15 m out, cross paths along both axes, a paved round
// of 6.5 m in the middle. The block shader draws the same shape.
export function parkPathD(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  const qx = ax - 12, qz = az - 12;
  const box = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 3;
  return Math.min(Math.abs(box) - 1.4, Math.min(ax, az) - 1.2, Math.hypot(x, z) - 6.5);
}

// ---------------------------------------------------------------------------------------------
// Collision: a uniform grid of building boxes. Circle-vs-box push-out is all the game needs.
export class Collider {
  constructor(buildings) {
    this.cell = 40;
    this.map = new Map();
    this.boxes = [];
    for (const b of buildings) this.add({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, h: b.y + b.h });
  }
  // another solid box (street furniture that stops cars: barriers)
  add(bx) {
    this.boxes.push(bx);
    for (let gx = Math.floor(bx.x0 / this.cell); gx <= Math.floor(bx.x1 / this.cell); gx++)
      for (let gz = Math.floor(bx.z0 / this.cell); gz <= Math.floor(bx.z1 / this.cell); gz++) {
        const k = gx + "," + gz; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(bx);
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
  // same, but only against buildings taller than height y (for things that fly)
  resolveY(x, z, rad, y) {
    const saved = this.near;
    const all = this.near(x, z).filter(b => b.h > y);
    this.near = () => all;
    const r = this.resolve(x, z, rad);
    this.near = saved;
    return r;
  }
  // does the segment (ax,az)->(bx,bz) at height y pass through a building? (camera + line of sight)
  segmentHit(ax, az, bx, bz, y, step = 1.5) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
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
