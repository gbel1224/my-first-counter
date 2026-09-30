// Palm City — shared pure helpers: the seeded RNG and the city-grid constants.
// First slice of splitting game.js into modules: everything here is dependency-free,
// so any future module can import it without pulling in the rest of the game.

// ---------- seeded RNG (world gen is deterministic) ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32(20260612);
export const rr = (a, b) => a + rng() * (b - a);
export const pick = arr => arr[(rng() * arr.length) | 0];

// ---------- city constants ----------
export const N = 40, CELL = 88, ROAD = 18, BLOCK = 70;   // 40x40 city (chunked rendering + frustum culling keep it fast)
export const HALF = (N * CELL + ROAD) / 2;
export const roadC = k => -HALF + ROAD / 2 + k * CELL;
export const blockMin = i => roadC(i) + ROAD / 2;
export const bc = i => blockMin(i) + BLOCK / 2;
// the original districts live in a centred 6x6 region; O recentres them so every
// landmark/mission keeps its exact world position while the grid grows around it.
export const O = (N - 6) / 2;
export const Rc = i => roadC(i + O);
export const Bm = i => blockMin(i + O);
export const Bc = i => bc(i + O);
export const CURB = 0.22;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
