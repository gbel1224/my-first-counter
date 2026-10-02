// Palm City — fighting. Punches (jab, jab, kick combo), guns with auto-aim tuned for thumbs,
// tracers, car damage (smoke → fire → explosion), chain explosions, and burnt-out wrecks.
import * as THREE from "../vendor/three.module.js";
import { clamp } from "./world.js";
import { makeCar } from "./cars.js";

export const WEAPONS = [
  { id: "fists", name: "Fists", cost: 0, dmg: 0, rate: 0.42, range: 1.6, spread: 0, pellets: 0, ammo: 0 },
  { id: "pistol", name: "Pistol", cost: 600, dmg: 34, rate: 0.32, range: 55, spread: 0.02, pellets: 1, ammo: 48, ammoCost: 60 },
  { id: "smg", name: "Micro SMG", cost: 2200, dmg: 20, rate: 0.085, range: 45, spread: 0.06, pellets: 1, ammo: 150, ammoCost: 120 },
  { id: "shotgun", name: "Shotgun", cost: 3500, dmg: 22, rate: 0.85, range: 22, spread: 0.14, pellets: 7, ammo: 24, ammoCost: 150 },
  { id: "rifle", name: "Assault Rifle", cost: 6000, dmg: 30, rate: 0.12, range: 75, spread: 0.025, pellets: 1, ammo: 120, ammoCost: 200 },
  { id: "sniper", name: "Sniper Rifle", cost: 9000, dmg: 150, rate: 1.2, range: 160, spread: 0.002, pellets: 1, ammo: 20, ammoCost: 250 },
  { id: "minigun", name: "Minigun", cost: 25000, dmg: 18, rate: 0.045, range: 55, spread: 0.07, pellets: 1, ammo: 500, ammoCost: 400 },
  { id: "gl", name: "Grenade Launcher", cost: 18000, dmg: 0, rate: 1.0, range: 45, spread: 0, pellets: 0, ammo: 12, ammoCost: 350, proj: "grenade" },
  { id: "rpg", name: "RPG", cost: 30000, dmg: 0, rate: 1.6, range: 120, spread: 0, pellets: 0, ammo: 6, ammoCost: 500, proj: "rocket" },
];

export function makeCombat(scene, g) {
  // g: { crowd, traffic, parked, crime, fx, sound, shake, st, player(), camYaw(), earnCombo }
  const wrecks = [];
  const charMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1, metalness: 0.1 });
  const S = { punchT: 0, combo: 0, comboT: 0, cd: 0, weapon: 0, shotT: 0, fistT: 0 };
  if (!g.st.weapons) g.st.weapons = { fists: true };
  if (!g.st.ammo) g.st.ammo = {};

  const own = w => !!g.st.weapons[w.id];
  // damage the police do themselves (tank shells, crushed cars) earns you nothing and adds no heat
  let copsDid = false;
  const asCops = fn => { copsDid = true; try { fn(); } finally { copsDid = false; } };
  // ---- rockets & grenades: real projectiles that fly to where you aimed, then go off ----
  const projs = [];
  const projMat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.6, metalness: 0.4 });
  function launch(kind, x, y, z, dx, dz, T, owner) {
    const m = new THREE.Mesh(kind === "rocket" ? new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8) : new THREE.SphereGeometry(0.11, 10, 8), projMat);
    if (kind === "rocket") m.rotation.set(Math.PI / 2, Math.atan2(dx, dz), 0, "YXZ");
    scene.add(m);
    const sp = kind === "rocket" ? 55 : 22;
    const dist = T ? T.d : (kind === "rocket" ? 120 : 30);
    if (kind === "rocket") {                             // straight line in 3D at the target point (or level)
      const rise = T ? (T.y || 1.1) - y : 0, D = Math.hypot(dist, rise), k = dist / D;
      projs.push({ kind, m, x, y, z, owner, vx: dx * sp * k, vy: sp * rise / D, vz: dz * sp * k, t: 0, fuse: 4, tgt: T && T.kind === "heli" ? T.o : null });
    } else projs.push({ kind, m, x, y, z, owner, vx: dx * sp, vy: 6 + dist * 0.12, vz: dz * sp, t: 0, fuse: 2.4 });
  }
  function stepProjs(dt) {
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      p.t += dt;
      if (p.kind === "grenade") p.vy -= 18 * dt;
      else if (p.tgt && p.tgt.active && !p.tgt.fall) {     // lock-on: bend toward the chopper
        const sp = Math.hypot(p.vx, p.vy, p.vz), tx = p.tgt.x - p.x, ty = p.tgt.y + 1.5 - p.y, tz = p.tgt.z - p.z, td = Math.hypot(tx, ty, tz) || 1, k = Math.min(1, dt * 4);
        p.vx += (tx / td * sp - p.vx) * k; p.vy += (ty / td * sp - p.vy) * k; p.vz += (tz / td * sp - p.vz) * k;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.m.position.set(p.x, p.y, p.z);
      if (p.kind === "rocket" && Math.random() < 0.8) g.fx.smoke(p.x, p.y, p.z, 0.6);
      let boom = p.t > p.fuse;
      if (p.y < 0.12) { if (p.kind === "grenade") { p.y = 0.12; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } else boom = true; }
      if (!boom && p.kind === "rocket") {
        if (g.collider.segmentHit(p.x - p.vx * dt, p.z - p.vz * dt, p.x, p.z, p.y) < 1) boom = true;
        const low = p.y < 3;                              // cars only stop a rocket that's down at car height
        if (low) for (const c of g.traffic.cars) if (c.alive && (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 6) { boom = true; p.hit = [c, "traffic"]; }
        if (low) for (const u of g.crime.units) if (u.active && u !== p.owner && (u.x - p.x) ** 2 + (u.z - p.z) ** 2 < 6) { boom = true; p.hit = [u, "cop"]; }
        const H = g.crime.heli;
        if (H.active && !H.fall && (H.x - p.x) ** 2 + (H.y + 1.5 - p.y) ** 2 + (H.z - p.z) ** 2 < 16) { boom = true; p.hit = [H, "heli"]; }
        if (p.owner) { const P = g.player(); if ((P.x - p.x) ** 2 + (P.z - p.z) ** 2 < 5 && p.y < 3) boom = true; }
      }
      if (boom) {
        scene.remove(p.m); projs.splice(i, 1);
        g.fx.explosion(p.x, Math.max(0.6, p.y), p.z, 1.1); g.sound("boom", 1); g.shake(0.5);
        const go = () => {
          if (p.hit && p.hit[1] === "heli") { if (g.crime.hitHeli(400)) mayhem(5); }
          else if (p.hit) damageCar(p.hit[0], 400, p.hit[1]);   // a direct hit always wrecks
          if (p.y < 6) blast(p.x, p.z, p.owner ? 6 : 8, 135, p.owner || null);
        };
        if (p.owner) asCops(go); else go();
        if (!p.owner) g.crime.addCrime(1);
      }
    }
  }
  // ---- rampage combo: chain mayhem fast and every payout from it multiplies ----
  S.ramp = 0; S.rampX = 1; S.rampT = 0;
  function mayhem(pts) {
    S.rampT = 5; S.ramp += pts; S.rampX = Math.min(8, 1 + Math.floor(S.ramp / 3));
    if (g.earn) g.earn(Math.round(pts * 15 * S.rampX));
    if (g.onCombo) g.onCombo(S.rampX, S.ramp);
  }
  function current() { return WEAPONS[S.weapon]; }
  function cycle() {
    for (let k = 1; k <= WEAPONS.length; k++) {
      const i = (S.weapon + k) % WEAPONS.length;
      if (own(WEAPONS[i])) { S.weapon = i; return WEAPONS[i]; }
    }
    return current();
  }
  function buy(w) {
    if (!own(w)) {
      if (g.st.money < w.cost) return "You need $" + Math.ceil(w.cost - g.st.money).toLocaleString() + " more";
      g.st.money -= w.cost; g.st.weapons[w.id] = true; g.st.ammo[w.id] = (g.st.ammo[w.id] || 0) + w.ammo;
      S.weapon = WEAPONS.indexOf(w); return null;
    }
    if (g.st.money < w.ammoCost) return "You need $" + Math.ceil(w.ammoCost - g.st.money) + " more";
    g.st.money -= w.ammoCost; g.st.ammo[w.id] = (g.st.ammo[w.id] || 0) + w.ammo; return null;
  }

  // ---- damage to vehicles ----
  function damageCar(c, n, kind) {
    c.hp = (c.hp === undefined ? 100 : c.hp) - n;
    if (c.hp <= 0 && !c.boom) explodeCar(c, kind);
  }
  function explodeCar(c, kind) {
    c.boom = true;
    if (kind !== "player" && !copsDid) { S.wrecked = (S.wrecked || 0) + 1; mayhem(kind === "cop" ? 3 : 2); }
    if (g.onExplode) g.onExplode(c.x, c.z);
    const x = c.x, z = c.z;
    g.fx.explosion(x, 1, z, 1.2); g.sound("boom", 1); g.shake(Math.max(0.2, 1 - Math.hypot(x - g.player().x, z - g.player().z) / 60));
    // leave a burnt shell (traffic / parked / cop) — the player's own car burns where it stands
    if (kind !== "player") {
      if (kind === "cop") { c.active = false; c.group.visible = false; }
      else c.alive = false;
      const W = makeCar(c.type || "sedan", 0x1a1816);
      W.group.traverse(o => { if (o.isMesh) o.material = charMat; });
      W.group.position.set(x, 0, z); W.group.rotation.y = c.h || 0; W.chassis.rotation.z = (Math.random() - 0.5) * 0.12;
      scene.add(W.group);
      wrecks.push({ g: W.group, x, z, t: 0 });
      if (wrecks.length > 14) { const w = wrecks.shift(); scene.remove(w.g); }
    }
    blast(x, z, 7, 70, c);
    if (!copsDid) g.crime.addCrime(kind === "cop" ? 2 : 1);
  }
  // radial blast: knocks people flat, wrecks cars close in, hurts you
  function blast(x, z, r, dmg, source) {
    g.crowd.scare(x, z, 45, 8);
    if (g.propsBlast) g.propsBlast(x, z, r + 2);
    for (const p of g.crowd.people) {
      if (p.knocked > 0) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (p.hidden) continue;
      if (d < r) { const f = (1 - d / r) * 11 + 3; if (p.hp !== undefined) p.hp -= (1 - d / r) * 160; g.crowd.knock(p, dx / (d || 1) * f, 4 + f * 0.5, dz / (d || 1) * f, p.hp !== undefined ? p.hp <= 0 : d < r * 0.6); }
    }
    for (const c of g.traffic.cars) if (c.alive && c !== source && (c.x - x) ** 2 + (c.z - z) ** 2 < r * r) damageCar(c, dmg * 0.8, "traffic");
    for (const c of g.parked.around(x, z)) if (c !== source && (c.x - x) ** 2 + (c.z - z) ** 2 < r * r) damageCar(c, dmg * 0.8, "parked");
    for (const u of g.crime.units) if (u.active && u !== source && (u.x - x) ** 2 + (u.z - z) ** 2 < r * r) damageCar(u, dmg, "cop");
    const P = g.player(), pd = Math.hypot(P.x - x, P.z - z);
    if (pd < r * 1.2) g.crime.hurt((1 - pd / (r * 1.2)) * (P.car ? 30 : 60));
    if (P.car && P.car !== source && pd < r) damageCar(P.car, dmg * 0.6, "player");
  }

  // ---- targeting: whatever is nearest the aim line, inside the weapon's range ----
  const tmp = { x: 0, z: 0 };
  function findTarget(x, z, dirX, dirZ, range, cone, preferAir) {
    let best = null, bs = Infinity;
    const consider = (o, tx, tz, kind, w = 1) => {
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.3) return;
      const dot = (dx * dirX + dz * dirZ) / d;
      if (dot < cone) return;
      const score = d * (2 - dot) * w;                   // armed hostiles win ties over bystanders
      if (score < bs && g.crime.los(x, z, tx, tz)) { bs = score; best = { o, x: tx, z: tz, kind, d }; }
    };
    for (const u of g.crime.units) if (u.active) consider(u, u.x, u.z, "cop");
    for (const p of g.crowd.people) if (!p.hidden && p.knocked <= 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < range * range) consider(p, p.x, p.z, "ped", p.gang ? 0.4 : 1);
    for (const c of g.traffic.cars) if (c.alive && (c.x - x) ** 2 + (c.z - z) ** 2 < range * range) consider(c, c.x, c.z, "traffic");
    if (g.extraTargets) for (const t of g.extraTargets()) consider(t, t.x, t.z, t.kind);
    // the chopper: up above the rooftops, so no wall gets in the way — it wins over street targets when aimed near
    const H = g.crime.heli;
    if (H.active && !H.fall) {
      const hx = H.x - x, hz = H.z - z, d = Math.hypot(hx, hz);
      if (d < range && d > 1 && (hx * dirX + hz * dirZ) / d > cone - 0.15 && (!best || preferAir || d * 0.5 < bs)) best = { o: H, x: H.x, z: H.z, y: H.y + 1.5, kind: "heli", d };
    }
    return best;
  }

  function punch() {
    if (S.cd > 0) return false;
    const P = g.player();
    S.combo = S.comboT > 0 ? (S.combo + 1) % 3 : 0; S.comboT = 0.7;
    const kick = S.combo === 2;
    S.punchT = kick ? 0.38 : 0.26; S.cd = kick ? 0.5 : 0.28; S.fistT = 2.5;   // fists stay balled a while after a swing
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const reach = kick ? 1.9 : 1.5;
    const t = g.crowd.nearest(P.x + fx * 0.9, P.z + fz * 0.9, reach, null);
    const ex = g.extraTargets ? g.extraTargets().find(o => o.alive && (o.x - P.x - fx) ** 2 + (o.z - P.z - fz) ** 2 < reach * reach) : null;
    if (t) {
      const f = kick ? 7 : 4;
      let dead = false;
      if (t.hp !== undefined) { t.hp -= kick ? 30 : 18; dead = t.hp <= 0; }
      if (t.hp === undefined || dead || kick) g.crowd.knock(t, fx * f, 2.5, fz * f, dead);
      else { t.x += fx * 0.4; t.z += fz * 0.4; }
      g.sound("door", 0.5, 1.6); g.shake(0.15); g.fx.dust(t.x, 0.3, t.z, 4);
      g.crowd.scare(P.x, P.z, 14, 4);
      g.crime.addCrime(1);
      return true;
    }
    if (ex && ex.hit) { ex.hit(kick ? 35 : 20, fx, fz); g.sound("door", 0.5, 1.6); g.shake(0.15); return true; }
    g.sound("blip", 0.2, 0.6);
    return true;
  }

  function fire(aimYaw) {
    const w = current();
    if (w.id === "fists") return punch();
    if (S.cd > 0) return false;
    if ((g.st.ammo[w.id] || 0) <= 0) { S.cd = 0.4; g.sound("blip", 0.3, 0.5); g.toast && g.toast("Out of ammo — buy more at the gun shop"); return false; }
    S.cd = w.rate; g.st.ammo[w.id]--; S.shotT = Math.min(0.12, w.rate * 0.7);   // the trigger finger pulls
    const P = g.player();
    if (w.proj) {
      let dx = Math.sin(aimYaw), dz = Math.cos(aimYaw);
      const T = findTarget(P.x, P.z, dx, dz, w.range, 0.9, w.proj === "rocket");
      if (T) { dx = (T.x - P.x) / T.d; dz = (T.z - P.z) / T.d; P.yaw = Math.atan2(dx, dz); }
      launch(w.proj, P.x + dx * 0.8, (P.y || 0) + 1.5, P.z + dz * 0.8, dx, dz, T);
      g.sound(w.proj === "rocket" ? "boom" : "gun", 0.4); g.shake(0.2); g.crowd.scare(P.x, P.z, 40, 8);
      return true;
    }
    const ox = P.x, oz = P.z, oy = (P.y || 0) + 1.35;
    let dx = Math.sin(aimYaw), dz = Math.cos(aimYaw);
    const T = findTarget(ox, oz, dx, dz, w.range, 0.82);
    if (T) { const d = Math.hypot(T.x - ox, T.z - oz); dx = (T.x - ox) / d; dz = (T.z - oz) / d; P.yaw = Math.atan2(dx, dz); }
    g.fx.muzzle(ox + dx * 0.6, oy, oz + dz * 0.6, dx, dz);
    g.sound("gun", w.id === "shotgun" ? 1 : 0.6);
    g.shake(w.id === "shotgun" ? 0.25 : 0.08);
    g.crowd.scare(ox, oz, 40, 8);
    g.crime.addCrime(1);
    for (let k = 0; k < w.pellets; k++) {
      const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * w.spread * 2;
      const sx = Math.sin(a), sz = Math.cos(a);
      // hit test: the targeted thing if the pellet stays on it, else fly to the first wall
      let hitD = T && T.kind === "heli" ? w.range : w.range * g.collider.segmentHit(ox, oz, ox + sx * w.range, oz + sz * w.range, oy);
      let hit = null;
      if (T && T.d < hitD) {
        const lat = Math.abs((T.x - ox) * sz - (T.z - oz) * sx);
        if (lat < (T.kind === "ped" ? 0.7 : 1.4) && Math.random() < clamp(1.05 - T.d / w.range * 0.5, 0.3, 1)) { hit = T; hitD = T.d; }
      }
      const hx = ox + sx * hitD, hz = oz + sz * hitD;
      g.fx.tracer(ox + sx * 0.8, oy, oz + sz * 0.8, hx, hit ? hit.y || 1.1 : oy - 0.1, hz);
      if (!hit) { g.fx.sparks(hx, oy - 0.2, hz, 4); continue; }
      if (hit.kind === "ped") {
        const o = hit.o;
        if (o.hp !== undefined) { o.hp -= w.dmg; if (o.hp > 0) { o.x += sx * 0.3; o.z += sz * 0.3; g.fx.sparks(hit.x, 1.2, hit.z, 2); continue; } }
        g.crowd.knock(o, sx * 3, 1.5, sz * 3, true); g.fx.sparks(hit.x, 1.2, hit.z, 2); if (o.gang) mayhem(1);
      }
      else if (hit.kind === "heli") { if (g.crime.hitHeli(w.dmg * 0.6)) mayhem(5); }
      else if (hit.kind === "cop") { damageCar(hit.o, w.dmg * 0.9, "cop"); g.fx.sparks(hit.x, 1, hit.z, 6); }
      else if (hit.kind === "traffic") { damageCar(hit.o, w.dmg * 0.9, "traffic"); hit.o.stun = 3; g.fx.sparks(hit.x, 1, hit.z, 6); }
      else if (hit.o.hit) hit.o.hit(w.dmg, sx, sz);
    }
    return true;
  }

  function update(dt, time) {
    stepProjs(dt);
    if (S.rampT > 0) { S.rampT -= dt; if (S.rampT <= 0) { if (S.ramp >= 6 && g.onComboEnd) g.onComboEnd(S.ramp, S.rampX); S.ramp = 0; S.rampX = 1; } }
    if (S.cd > 0) S.cd -= dt;
    if (S.comboT > 0) S.comboT -= dt;
    if (S.punchT > 0) S.punchT -= dt;
    if (S.shotT > 0) S.shotT -= dt;
    if (S.fistT > 0) S.fistT -= dt;
    const P = g.player();
    // damaged cars smoke, then burn, then go up
    const burn = c => {
      if (c.hp === undefined || c.hp >= 45 || c.boom) return;
      if (Math.random() < dt * (c.hp < 20 ? 14 : 6)) g.fx.smoke(c.x, 1.2, c.z, c.hp < 20 ? 0.12 : 0.35);
      if (c.hp < 20) { if (Math.random() < dt * 20) g.fx.fire(c.x + Math.sin(c.h) * 1.5, 0.9, c.z + Math.cos(c.h) * 1.5); c.hp -= dt * 3; if (c.hp <= 0) explodeCar(c, c === P.car ? "player" : c.active !== undefined ? "cop" : "traffic"); }
    };
    if (P.car) burn(P.car);
    for (const u of g.crime.units) if (u.active) burn(u);
    for (const c of g.traffic.cars) if (c.alive) burn(c);
    for (const w of wrecks) { w.t += dt; if (w.t < 10 && Math.random() < dt * 10) g.fx.fire(w.x, 0.8, w.z); if (w.t < 25 && Math.random() < dt * 5) g.fx.smoke(w.x, 1.4, w.z, 0.12); }
  }
  // the hands: fists when fighting, a grip and a trigger finger with a gun out
  function hands() {
    const w = current();
    if (w.id === "fists") return S.fistT > 0 ? { gripL: 1, gripR: 1 } : null;
    const two = w.id !== "pistol";
    return { gun: w.id, gripR: 0.95, indexR: S.shotT > 0 ? 1 : 0.3, gripL: two ? 0.75 : 0.5 };
  }
  // pose override for the attack animation
  function pose() {
    if (S.punchT <= 0) return null;
    const kick = S.combo === 2;
    const t = S.punchT / (kick ? 0.38 : 0.26);
    const ext = Math.sin(t * Math.PI);
    if (kick) return { thighR: -1.35 * ext, kneeR: 0.3 * (1 - ext), armL: -0.6, armR: 0.5, elbowL: -1.4, elbowR: -1.4, lean: -0.15 * ext };
    const right = S.combo === 0;
    return right ? { armR: -1.55 * ext, elbowR: -0.2 - (1 - ext) * 1.2, armL: -0.5, elbowL: -1.8, twist: -0.25 * ext }
                 : { armL: -1.55 * ext, elbowL: -0.2 - (1 - ext) * 1.2, armR: -0.5, elbowR: -1.8, twist: 0.25 * ext };
  }
  return { S, WEAPONS, current, cycle, buy, own, fire, punch, update, pose, hands, damageCar, explodeCar, blast, wrecks, launch, asCops, projs };
}
