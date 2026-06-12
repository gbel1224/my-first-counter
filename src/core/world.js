/* Arena layout + analytic collision/LOS. Pure math — no three.js, no DOM —
   so the same world runs in the browser and in the headless node sim. */
import { CONFIG } from '../config.js';

/* Cover block footprints: x, z, rotated(0|1), height. ~14 faceted blocks, 3 lanes. */
export const COVER_SPOTS = [
  [-9, -10, 0, 1.8], [9, -10, 1, 2.2], [-15, 0, 1, 2.5], [15, 0, 1, 2.5],
  [-9, 10, 0, 1.8], [9, 10, 1, 2.2], [0, -16, 0, 1.6], [0, 16, 0, 1.6],
  [-20, -14, 1, 2.0], [20, -14, 0, 2.0], [-20, 14, 1, 2.0], [20, 14, 0, 2.0],
  [-4, 2, 0, 1.5], [4, -2, 0, 1.5],
];
const BLOCK_W = 2.4, BLOCK_D = 1.4;

export function buildWorld() {
  const half = CONFIG.arenaSize / 2;
  const solids = []; // AABBs: {minx,maxx,miny,maxy,minz,maxz}

  for (const [x, z, rot, h] of COVER_SPOTS) {
    const w = rot ? BLOCK_D : BLOCK_W, d = rot ? BLOCK_W : BLOCK_D;
    solids.push({ minx: x - w / 2, maxx: x + w / 2, miny: 0, maxy: h, minz: z - d / 2, maxz: z + d / 2 });
  }
  for (const [bx, by, bz, bw, bd] of CONFIG.balconies) {
    solids.push({ minx: bx - bw / 2, maxx: bx + bw / 2, miny: by - 0.4, maxy: by, minz: bz - bd / 2, maxz: bz + bd / 2 });
  }

  /* Patrol waypoint graph along the three lanes + perimeter. */
  const wp = [
    [-24, -24], [0, -24], [24, -24],          // 0 1 2  south row
    [-24, 0], [24, 0],                        // 3 4    side mids
    [-24, 24], [0, 24], [24, 24],             // 5 6 7  north row
    [-9, -5], [9, -5], [-9, 5], [9, 5],       // 8 9 10 11  inner ring
    [0, -9], [0, 9], [0, 0],                  // 12 13 14   mid lane + power pad
    [-15, -12], [15, -12], [-15, 12], [15, 12], // 15-18 lane mouths
  ];
  const wpAdj = [
    [1, 3, 15], [0, 2, 12], [1, 4, 16],
    [0, 5, 15, 17], [2, 7, 16, 18],
    [3, 6, 17], [5, 7, 13], [4, 6, 18],
    [9, 10, 12, 15], [8, 11, 12, 16], [8, 11, 13, 17], [9, 10, 13, 18],
    [1, 8, 9, 14], [6, 10, 11, 14], [12, 13, 8, 9, 10, 11],
    [0, 3, 8], [2, 4, 9], [3, 5, 10], [4, 7, 11],
  ];

  /* Cover hide-points: one point off each face of every block (for RETREAT). */
  const hidePoints = [];
  for (const [x, z, rot] of COVER_SPOTS) {
    const w = (rot ? BLOCK_D : BLOCK_W) / 2 + 0.9, d = (rot ? BLOCK_W : BLOCK_D) / 2 + 0.9;
    hidePoints.push([x + w, z], [x - w, z], [x, z + d], [x, z - d]);
  }

  return { half, solids, wp, wpAdj, hidePoints };
}

const EPS = 1e-4;

export function groundHeight(world, px, pz, py, radius) {
  let g = 0;
  for (const s of world.solids) {
    if (px > s.minx - radius && px < s.maxx + radius && pz > s.minz - radius && pz < s.maxz + radius) {
      if (s.maxy <= py + CONFIG.stepHeight + EPS && s.maxy > g) g = s.maxy;
    }
  }
  return g;
}

/* Move a capsule-ish body (point + radius, height) through the world. Mutates e {pos, vel, onGround}. */
export function moveBody(world, e, dt) {
  const r = CONFIG.bodyRadius, h = CONFIG.bodyHeight;
  const bound = world.half - CONFIG.wallThickness / 2 - r;
  const p = e.pos, v = e.vel;

  // horizontal, axis-separated push-out
  for (const axis of ['x', 'z']) {
    p[axis] += v[axis] * dt;
    p.x = Math.max(-bound, Math.min(bound, p.x));
    p.z = Math.max(-bound, Math.min(bound, p.z));
    for (const s of world.solids) {
      if (p.y >= s.maxy - EPS || p.y + h <= s.miny + EPS) continue; // above (standing) or below
      if (p.x > s.minx - r && p.x < s.maxx + r && p.z > s.minz - r && p.z < s.maxz + r) {
        if (axis === 'x') p.x = v.x > 0 ? s.minx - r : s.maxx + r;
        else p.z = v.z > 0 ? s.minz - r : s.maxz + r;
      }
    }
  }

  // vertical
  const prevY = p.y;
  v.y -= CONFIG.gravity * dt;
  p.y += v.y * dt;
  e.onGround = false;
  const g = groundHeight(world, p.x, p.z, prevY, r);
  if (v.y <= 0 && p.y <= g + EPS) { p.y = g; v.y = 0; e.onGround = true; }
  else if (v.y > 0) {
    for (const s of world.solids) { // head bump on undersides (balconies)
      if (p.x > s.minx - r && p.x < s.maxx + r && p.z > s.minz - r && p.z < s.maxz + r
          && prevY + h <= s.miny + EPS && p.y + h > s.miny) { p.y = s.miny - h; v.y = 0; }
    }
  }
}

/* Ray vs single AABB (slab method) → t or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.minx, b.maxx], [oy, dy, b.miny, b.maxy], [oz, dz, b.minz, b.maxz]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/* Nearest world-geometry hit (cover, balconies, perimeter walls, floor) → distance. */
export function raycastWorld(world, o, d, maxDist) {
  let best = maxDist;
  for (const s of world.solids) {
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, s);
    if (t < best) best = t;
  }
  const wallIn = world.half - CONFIG.wallThickness / 2;
  for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const da = d[axis];
    if (sign * da > 1e-9) {
      const t = (sign * wallIn - o[axis]) / da;
      if (t > 0 && t < best) best = t;
    }
  }
  if (d.y < -1e-9) { const t = -o.y / d.y; if (t > 0 && t < best) best = t; }
  return best;
}

/* Ray vs a combatant (AABB around body center, scaled by hitbox forgiveness). */
export function raycastBody(o, d, slot, scale, maxDist) {
  const r = CONFIG.bodyRadius * scale, h = CONFIG.bodyHeight * scale;
  const yPad = (CONFIG.bodyHeight - h) / 2;
  const b = {
    minx: slot.pos.x - r, maxx: slot.pos.x + r,
    miny: slot.pos.y + yPad, maxy: slot.pos.y + yPad + h,
    minz: slot.pos.z - r, maxz: slot.pos.z + r,
  };
  const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b);
  return t < maxDist ? t : Infinity;
}

/* Line of sight between two eye points (world geometry only). */
export function hasLOS(world, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const d = { x: dx / len, y: dy / len, z: dz / len };
  return raycastWorld(world, a, d, len) >= len - 0.05;
}
