// Palm City — gangs and the nemesis. Three crews hold turf; walk onto it and they come for you.
// Wipe a crew out and the turf is yours for good. Meanwhile Vic "The Shark" Moreno takes every
// crime you commit personally: taunts, then hit squads, then a showdown at his yard.
// Gang members live inside the crowd (same instanced renderer) with their own brain attached.
import { randomLook, finishLook } from "./people.js";
import * as THREE from "../vendor/three.module.js";
import { blockC, blockMin, clamp, HALF, BLOCK, WALK, CURB, groundY } from "./world.js";

export const GANGS = [
  { id: "kings", name: "Crimson Kings", i: 11, j: 11, r: 70, look: { shirt: 0x7a1c1c, pants: 0x1a1a1f }, need: 8 },
  { id: "mob", name: "Azure Mob", i: 11, j: 2, r: 70, look: { shirt: 0x1f3a7a, pants: 0x16181d }, need: 8 },
  { id: "cartel", name: "Verde Cartel", i: 1, j: 9, r: 70, look: { shirt: 0x1f5a34, pants: 0x16181d }, need: 8 },
].map(G => ({ ...G, x: blockC(G.i), z: blockC(G.j) }));
const TAUNTS = ["You're starting to annoy me.", "Boys — go remind him whose town this is.", "Still breathing? Won't last.", "I'll bury you myself.", "ENOUGH. Come find me at the marina yard — let's END this."];
export const NEM_NAME = 'Vic "The Shark" Moreno';
export const TURF_INCOME = 250;          // $/min for each block you hold
const CREW_LOOK = { shirt: 0xd8a62a, pants: 0x1a1a1f };   // your people: gold

// spray-painted tags: a crew's name scrawled in its colour, drippy, on the walls round its block
const TAGS = { kings: ["KINGS", "CK 13", "CRIMSON"], mob: ["AZURE", "MOB", "AZ 7"], cartel: ["VERDE", "CARTEL", "VC"], mine: ["PALM", "OURS", "PC"] };
const TAG_COL = { kings: "#c42222", mob: "#2a58d8", cartel: "#1f9a48", mine: "#e0aa20" };
function tagTexture(text, col, seed) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const x = c.getContext("2d");
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  x.translate(128, 66); x.rotate((r() - 0.5) * 0.25);
  x.font = `italic 900 ${text.length > 5 ? 50 : 66}px Impact, "Arial Black", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineJoin = "round";
  x.strokeStyle = "rgba(10,10,10,.85)"; x.lineWidth = 10; x.strokeText(text, 0, 0);       // the black outline
  x.fillStyle = col; x.fillText(text, 0, 0);
  x.fillStyle = "rgba(255,255,255,.35)"; x.fillText(text, -2, -3);                       // a quick highlight pass
  x.fillStyle = col;
  x.setTransform(1, 0, 0, 1, 0, 0);
  for (let k = 0; k < 7; k++) { const dx = 40 + r() * 176, len = 8 + r() * 26; x.fillRect(dx, 78 + r() * 8, 2.5, len); x.beginPath(); x.arc(dx + 1.2, 80 + r() * 8 + len, 2.2, 0, 6.3); x.fill(); }   // drips
  // overspray haze
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

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
      p.onRespawn = p2 => { p2.hp = 60; p2.x = p2.home.x; p2.z = p2.home.z; dress(p2, G); };
      G.members.push(p);
    }
  }
  // ---- the walls: each crew's tags round its block; yours once it's taken ----
  const tagMats = {};
  const tagMat = (id, k) => tagMats[id + k] || (tagMats[id + k] = (() => { const t = tagTexture(TAGS[id][k % TAGS[id].length], TAG_COL[id], k + 3); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.12, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); })());
  const tagGeo = new THREE.PlaneGeometry(2.6, 1.3);
  for (const G of GANGS) {
    G.tags = [];
    const x0 = blockMin(G.i), z0 = blockMin(G.j), wall = WALK + 1.25 - 0.03;
    let k = 0;
    for (const side of ["N", "S", "E", "W"]) for (const off of [-16, 3, 18]) {
      const m = new THREE.Mesh(tagGeo, tagMat(G.id, k));
      const y = CURB + 1.15 + ((k * 37) % 5) * 0.12;
      if (side === "N") { m.position.set(x0 + BLOCK / 2 + off, y, z0 + wall); m.rotation.y = Math.PI; }
      if (side === "S") { m.position.set(x0 + BLOCK / 2 + off, y, z0 + BLOCK - wall); m.rotation.y = 0; }
      if (side === "W") { m.position.set(x0 + wall, y, z0 + BLOCK / 2 + off); m.rotation.y = -Math.PI / 2; }
      if (side === "E") { m.position.set(x0 + BLOCK - wall, y, z0 + BLOCK / 2 + off); m.rotation.y = Math.PI / 2; }
      // only on a real wall: there has to be a building right behind it
      const nx = Math.sin(m.rotation.y), nz = Math.cos(m.rotation.y);
      let wallAt = null;
      for (let back = 0.02; back < 6 && wallAt === null; back += 0.04) {
        const bx = m.position.x - nx * back, bz = m.position.z - nz * back;
        if (g.collider.near(bx, bz).some(b => bx > b.x0 && bx < b.x1 && bz > b.z0 && bz < b.z1 && b.h > 2.5)) wallAt = back;
      }
      if (wallAt === null) continue;
      m.position.x -= nx * (wallAt - 0.1); m.position.z -= nz * (wallAt - 0.1);
      m.userData.k = k; m.receiveShadow = true;
      g.scene.add(m);
      G.tags.push(m); k++;
    }
  }
  function paintTurf(G) {
    const mine = !!st.turf[G.id];
    for (const m of G.tags) m.material = tagMat(mine ? "mine" : G.id, m.userData.k);
  }
  // a crew member's colours: their gang's, or yours once the block is yours
  function dress(p, G) {
    const base = p.baseLook || (p.baseLook = p.look);
    p.look = st.turf[G.id] ? finishLook(Object.assign({}, base, CREW_LOOK)) : base;
  }
  function capture(G) {
    st.turf[G.id] = true;
    const paid = g.earn(3000);
    g.banner("TURF CAPTURED", G.name + " are finished · the block is yours · +$" + TURF_INCOME + "/min", "TURF", 3.4);
    g.toast("💰 +$" + paid.toLocaleString() + " · your crew moves in", 3);
    g.sound("jingle", 1);
    paintTurf(G);
    for (const p of G.members) if (!p.dead) dress(p, G);
    grudge(12);
  }
  for (const G of GANGS) { paintTurf(G); for (const p of G.members) dress(p, G); }
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
        if (r() < clamp((p.boss ? 0.62 : 0.45) - d * 0.008 - (fast ? 0.15 : 0), 0.05, 0.6)) g.crime.hurt(Math.round((p.boss ? 11 : 7) * (P.car ? 0.6 : 1)), p.x, p.z);
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

  // ---- turf wars: now and then a crew comes to take back a block you hold. Get there and put
  // them down before the clock runs out, or the block's theirs again ----
  let war = null, warCD = 240 + r() * 120, inTurf = null;
  function startWar() {
    const mine = GANGS.filter(G => st.turf[G.id]);
    if (!mine.length) return false;
    const G = mine[(r() * mine.length) | 0];
    const rivals = GANGS.filter(R => !st.turf[R.id]);
    const R = rivals.length ? rivals[(r() * rivals.length) | 0] : G;
    const name = rivals.length ? R.name : "What's left of the " + G.name;
    const list = crew(G.x, G.z, 4 + Math.min(2, mine.length));
    if (!list.length) return false;
    for (const p of list) {
      p.look = finishLook(Object.assign(randomLook(r), R.look, { shorts: false }));
      const h = G.members[(r() * G.members.length) | 0].home;      // they come up the sidewalks, not through the buildings
      p.x = h.x + (r() - 0.5) * 6; p.z = h.z + (r() - 0.5) * 6; p.home = { x: h.x, z: h.z };
      const q = g.collider.resolve(p.x, p.z, 0.4); p.x = q.x; p.z = q.z;
    }
    war = { G, name, list, t: 150, seen: false };
    g.banner("TURF WAR", name + " are moving on your block — get over there and hold it", "TURF", 3.6);
    g.sound("blip", 0.8);
    return true;
  }
  function endWar(won) {
    const W = war; war = null; warCD = 300 + r() * 240;
    if (won) { const paid = g.earn(1500); g.banner("TURF HELD", "The block stays yours · +$" + paid.toLocaleString(), "TURF", 3); g.sound("jingle", 0.9); }
    else {
      dismiss(W.list);
      st.turf[W.G.id] = false; W.G.kills = 0; paintTurf(W.G);
      for (const p of W.G.members) { dress(p, W.G); if (!p.dead) { p.hp = 60; } }
      g.banner("TURF LOST", W.name + " took the block back", "TURF", 3.4); g.sound("door", 0.6);
    }
    g.save && g.save();
  }
  function warUpdate(dt) {
    if (!war) {
      warCD -= dt;
      if (warCD <= 0) { if (g.busy && g.busy()) warCD = 30; else if (!startWar()) warCD = 120; }
      return;
    }
    war.t -= dt;
    const P = g.player();
    if ((P.x - war.G.x) ** 2 + (P.z - war.G.z) ** 2 < war.G.r * war.G.r) war.seen = true;
    if (war.list.every(p => p.hidden || p.dead)) endWar(true);
    else if (war.t <= 0) endWar(false);
  }
  // crossing into someone's turf (or back onto your own)
  function turfWatch() {
    const P = g.player();
    let now = null;
    for (const G of GANGS) if ((P.x - G.x) ** 2 + (P.z - G.z) ** 2 < G.r * G.r) now = G;
    if (now !== inTurf) {
      if (now) g.toast(st.turf[now.id] ? "🟨 Your turf — your crew's got the corners" : "⚠️ " + now.name + " turf — they'll shoot on sight", 3);
      inTurf = now;
    }
  }
  function objective() {
    if (!war) return null;
    const m = Math.floor(war.t / 60), sec = Math.floor(war.t % 60);
    const left = war.list.filter(p => !(p.hidden || p.dead)).length;
    return { title: "Turf war", text: "Defend your block · " + left + " left · ⏱ " + m + ":" + String(sec).padStart(2, "0"), x: war.G.x, z: war.G.z, r: 8, side: true };
  }
  function update(dt) {
    if (g.paused()) return;
    warUpdate(dt); turfWatch();
    // hit squads once the grudge is high enough
    if (!showdown && st.mi >= 6 && N.tier >= 2) {
      squadCD -= dt;
      if (squadCD <= 0 && !goons.some(p => !p.hidden && p.knocked <= 0)) { squadCD = 70 + r() * 40; spawnSquad(); }
    }
    if (showdown) g.boss(true, NEM_NAME, Math.max(0, boss.hp) / (520 + N.defeated * 120));
  }
  return { update, grudge, GANGS, boss, goons, YARD, showdown: () => showdown, members, crew, dismiss, objective, war: () => war, startWar, endWar, startShowdown };
}
