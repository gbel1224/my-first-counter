/* Seeded RNG (mulberry32). Separate instances for logic vs VFX — deterministic replays. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = n => Math.floor(f() * n);
  f.gaussian = () => {
    // Box–Muller
    const u = Math.max(f(), 1e-9), v = f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return f;
}
