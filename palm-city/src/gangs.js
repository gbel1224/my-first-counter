// Palm City — gangs and the nemesis. Three crews hold turf; walk onto it and they come for you.
// Wipe a crew out and the turf is yours for good. Meanwhile Vic "The Shark" Moreno takes every
// crime you commit personally: taunts, then hit squads, then a showdown at his yard.
// Gang members live inside the crowd (same instanced renderer) with their own brain attached.
import { randomLook, finishLook } from "./people.js";
import { blockC, blockMin, clamp, HALF, BLOCK, groundY } from "./world.js";

export const GANGS = [
  { id: "kings", name: "Crimson Kings", i: 11, j: 11, r: 70, look: { shirt: 0x7a1c1c, pants: 0x1a1a1f }, need: 8 },
  { id: "mob", name: "Azure Mob", i: 11, j: 2, r: 70, look: { shirt: 0x1f3a7a, pants: 0x16181d }, need: 8 },
  { id: "cartel", name: "Verde Cartel", i: 1, j: 9, r: 70, look: { shirt: 0x1f5a34, pants: 0x16181d }, need: 8 },
].map(G => ({ ...G, x: blockC(G.i), z: blockC(G.j) }));
const TAUNTS = ["You're starting to annoy me.", "Boys — go remind him whose town this is.", "Still breathing? Won't last.", "I'll bury you myself.", "ENOUGH. Come find me at the marina yard — let's END this."];
export const NEM_NAME = 'Vic "The Shark" Moreno';

export function makeGangs(g) {
  // g: { crowd, crime, fx, sound, toast, banner, earn, st, player(), boss(show, name, frac) }
  const r = Math.random;
  const st = g.st;
  if (!st.turf) st.turf = {};
  if (!st.nem) st.nem = { grudge: 0, tier: 0, intro: false, defeated: 0 };
  const N = st.nem;
  const members = [];
  const make = (look, x, z, extra) => {
    const p = { beach: false, gang: true, x, z, yaw: r() * 6.28, speed: 1.2, look: finishLook(look), phase: r() * 6, style: { stride: 1, arm: 0.8 },
      pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 60, shootCD: 1 + r(), home: { x, z }, ...extra };
    p.ai = ai;
    g.crowd.people.push(p); members.push(p);
    return p;
  };
  // crews
  for (const G of GANGS) {
    G.kills = 0; G.members = [];
    for (let k = 0; k < G.need; k++) {
      const look = Object.assign(randomLook(r), G.look, { sleeveless: r() < 0.3, shorts: false, bald: r() < 0.3 });
      // hang out on the block's sidewalks (the middle of a block is buildings)
      const x0 = blockMin(G.i) + 2.4, z0 = blockMin(G.j) + 2.4, L = BLOCK - 4.8, t = r() * 4, side = Math.floor(t), f = t - side;
      const hx = side === 0 ? x0 + f * L : side === 1 ? x0 + L : side === 2 ? x0 + L - f * L : x0;
      const hz = side === 0 ? z0 : side === 1 ? z0 + f * L : side === 2 ? z0 + L : z0 + L - f * L;
      const p = make(look, hx, hz, { G });
      p.onDeath = () => { if (!st.turf[G.id]) { G.kills++; if (G.kills >= G.need) capture(G); } };
      p.onRespawn = p2 => { if (st.turf[G.id]) { p2.hidden = true; p2.x = 99999; } else { p2.hp = 60; p2.x = p2.home.x; p2.z = p2.home.z; } };
      if (st.turf[G.id]) { p.hidden = true; p.x = 99999; }
      G.members.push(p);
    }
  }
  function capture(G) {
    st.turf[G.id] = true;
    const paid = g.earn(3000);
    g.banner("TURF CAPTURED", G.name + " are finished · +$" + paid.toLocaleString());
    g.sound("jingle", 1);
    grudge(12);
  }
  // Moreno's people: dark suits; the boss in cream
  const goons = [], suit = { shirt: 0x17181c, pants: 0x0d0e11, skin: 0xcf9a72, hair: 0x0c0a08, sleeveless: false, shorts: false, bald: false, long: false, h: 1.02, bulk: 1.05 };
  for (let k = 0; k < 6; k++) { const p = make({ ...suit }, 99999, 0, { goon: true, hidden: true, hp: 80 }); goons.push(p); }
  const boss = make({ ...suit, shirt: 0xe6dcb6, pants: 0x1a1c22, skin: 0xd99c6e, h: 1.1, bulk: 1.2 }, 99999, 0, { goon: true, boss: true, hidden: true, hp: 520 });
  // pick-up crews for street shootouts
  const crewPool = [];
  for (let k = 0; k < 6; k++) {
    const look = Object.assign(randomLook(r), { shirt: [0x3a2a1a, 0x4a1a3a, 0x2a2a2a][k % 3], shorts: false });
    const p = make(look, 99999, 0, { crew: true, hidden: true, hp: 60 });
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    crewPool.push(p);
  }
  function crew(x, z, n) {
    const out = [];
    for (const p of crewPool) {
      if (out.length >= n) break;
      if (!p.hidden) continue;
      const a = r() * 6.28; placeGoon(p, x + Math.cos(a) * 5, z + Math.sin(a) * 5, 60); p.home = { x, z };
      out.push(p);
    }
    return out;
  }
  function dismiss(list) { for (const p of list) { p.hidden = true; p.x = 99999; p.knocked = 0; p.dead = false; } }
  const YARD = { x: blockC(3), z: HALF + 20 };   // on the sand below the promenade
  let squadCD = 40, showdown = false;

  function grudge(n) {
    if (showdown || st.mi < 6) return;
    N.grudge = Math.min(100, N.grudge + n);
    if (!N.intro && N.grudge >= 6) { N.intro = true; g.toast("📱 " + NEM_NAME + ': "New hustler in MY city? Watch yourself."', 4); g.sound("blip", 0.5); }
    const t = Math.floor(N.grudge / 20);
    if (t > N.tier) {
      N.tier = t; g.toast("📱 " + NEM_NAME + ': "' + TAUNTS[Math.min(4, t - 1)] + '"', 4); g.sound("blip", 0.5);
      if (t >= 5) startShowdown();
    }
  }
  function placeGoon(p, x, z, hp) { p.hidden = false; p.dead = false; p.knocked = 0; p.x = x; p.z = z; p.hp = hp; p.y = 0; p.shootCD = 1.5 + r(); }
  function spawnSquad() {
    const P = g.player(), n = Math.min(2 + N.tier, 6);
    for (let k = 0; k < n; k++) {
      const a = r() * 6.28;
      placeGoon(goons[k], clamp(P.x + Math.cos(a) * 45, -HALF + 5, HALF - 5), clamp(P.z + Math.sin(a) * 45, -HALF + 5, HALF + 30), 80);
    }
    g.toast("📱 " + NEM_NAME + ': "Found you."', 3); g.sound("blip", 0.6);
  }
  function startShowdown() {
    showdown = true;
    placeGoon(boss, YARD.x, YARD.z, 520 + N.defeated * 120);
    for (let k = 0; k < 4; k++) placeGoon(goons[k], YARD.x + (k - 1.5) * 4, YARD.z + 3, 90);
    g.banner("SHOWDOWN", NEM_NAME + " is waiting at the marina yard", "NEMESIS", 4);
  }
  boss.onDeath = () => {
    showdown = false; N.defeated++; N.grudge = 0; N.tier = 0;
    for (const p of goons) p.hidden = true;
    const paid = g.earn(10000);
    g.banner("THE SHARK IS DOWN", "+$" + paid.toLocaleString() + " · Palm City breathes easier… for now", "NEMESIS DEFEATED", 4.5);
    g.sound("jingle", 1); g.boss(false);
  };
  for (const p of goons) p.onDeath = () => {};
  for (const p of [...goons, boss]) p.onRespawn = p2 => { p2.hidden = true; p2.x = 99999; };

  // the brain every gang member / goon runs
  function ai(p, dt) {
    if (p.hidden) return;
    const P = g.player(), dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz) || 1;
    const turfHostile = p.G && !st.turf[p.G.id] && ((P.x - p.G.x) ** 2 + (P.z - p.G.z) ** 2 < p.G.r * p.G.r || d < 26);
    const aggro = !g.paused() && (p.goon || turfHostile || (p.crew && d < 70));
    if (p.goon && !p.boss && !showdown && d > 170) { p.hidden = true; p.x = 99999; return; }   // lost the squad
    if (aggro && d < 110) {
      p.yaw = Math.atan2(dx, dz);
      const keep = p.boss ? 12 : 8;
      if (d > keep) { const sp = p.boss ? 2.6 : 3.6; p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; p.amt = 1.4; const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z; }
      else p.amt = 0;
      p.shootCD -= dt;
      if (p.shotT > 0) p.shotT -= dt;
      p.aimT = d < 45 ? 0.5 : Math.max(0, (p.aimT || 0) - dt);   // gun out when you're close
      if (p.boss) p.weapon = "smg";
      if (p.shootCD <= 0 && d < 38 && g.crime.los(p.x, p.z, P.x, P.z)) {
        p.shootCD = (p.boss ? 0.5 : 1.1) + r() * 0.8; p.shotT = 0.12;
        g.fx.muzzle(p.x + dx / d * 0.6, 1.35, p.z + dz / d * 0.6, dx / d, dz / d);
        g.fx.tracer(p.x, 1.35, p.z, P.x + (r() - 0.5) * 2, 1.1, P.z + (r() - 0.5) * 2);
        g.sound("gun", 0.35);
        const fast = P.speed > 6;
        if (r() < clamp((p.boss ? 0.62 : 0.45) - d * 0.008 - (fast ? 0.15 : 0), 0.05, 0.6)) g.crime.hurt(Math.round((p.boss ? 11 : 7) * (P.car ? 0.6 : 1)));
      }
    } else {
      // loiter near home
      p.amt = 0.6; p.aimT = 0;
      const hx = p.home.x - p.x, hz = p.home.z - p.z;
      if (hx * hx + hz * hz > 400) p.yaw = Math.atan2(hx, hz);
      else if (r() < dt * 0.3) p.yaw += (r() - 0.5) * 2;
      if (r() < 0.5) { p.x += Math.sin(p.yaw) * 0.7 * dt; p.z += Math.cos(p.yaw) * 0.7 * dt; const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z; }
    }
    p.phase += dt * 2.6 * (p.amt || 0.5);
  }

  function update(dt) {
    if (g.paused()) return;
    // hit squads once the grudge is high enough
    if (!showdown && st.mi >= 6 && N.tier >= 2) {
      squadCD -= dt;
      if (squadCD <= 0 && !goons.some(p => !p.hidden && p.knocked <= 0)) { squadCD = 70 + r() * 40; spawnSquad(); }
    }
    if (showdown) g.boss(true, NEM_NAME, Math.max(0, boss.hp) / (520 + N.defeated * 120));
  }
  return { update, grudge, GANGS, boss, goons, YARD, showdown: () => showdown, members, crew, dismiss };
}
