// Palm City — roadblocks. At three stars and up, dispatch stops chasing you and starts getting ahead
// of you: a block down the road you're driving, two cruisers slewed across the lanes with their bars
// flashing, a pair of officers crouched behind them with guns out, and a spike strip laid across the
// road in front. Run the strip and your tyres go — the car slumps, wanders, sparks off its rims and
// loses half its speed. The gap between the cruisers is a trap; the pavement is the way round.
import * as THREE from "../vendor/three.module.js";
import { makeCruiser } from "./crime.js";
import { randomLook } from "./people.js";
import { clamp, HALF, N, ROAD, CELL, BLOCK, roadC, blockC, nearestRoad, groundY } from "./world.js";
import { syncCar } from "./play.js";
import { inView } from "./cull.js";
import { paint, place, merge, vcMaterial } from "./geo.js";

// the strip: a folding steel lattice with two rows of hollow spikes, ROAD long, along local x
function stripGeometry() {
  const parts = [];
  const L = ROAD - 0.4;
  parts.push(paint(place(new THREE.BoxGeometry(L, 0.035, 0.34).toNonIndexed(), 0, 0.02, 0), 0x2a2b2d));
  for (let x = -L / 2 + 0.2; x < L / 2; x += 0.62) parts.push(paint(place(new THREE.BoxGeometry(0.05, 0.05, 0.44).toNonIndexed(), x, 0.03, 0, 0, 0.5, 0), 0x3a3b3e));
  for (let x = -L / 2 + 0.1; x < L / 2; x += 0.2)
    for (const z of [-0.09, 0.09]) parts.push(paint(place(new THREE.ConeGeometry(0.018, 0.075, 4).toNonIndexed(), x + (z > 0 ? 0.1 : 0), 0.075, z), 0x9a9ea4));
  // orange end caps so you can see it coming (just)
  for (const x of [-L / 2, L / 2]) parts.push(paint(place(new THREE.BoxGeometry(0.22, 0.07, 0.42).toNonIndexed(), x, 0.035, 0), 0xd2601a));
  return merge(parts);
}
// a striped sawhorse barrier
function barrierGeometry() {
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push(paint(place(new THREE.BoxGeometry(0.33, 0.22, 0.04).toNonIndexed(), -0.825 + k * 0.33, 0.95, 0), k % 2 ? 0xe8e8e4 : 0xd23a1e));
  for (const x of [-0.8, 0.8]) for (const s of [-1, 1]) parts.push(paint(place(new THREE.BoxGeometry(0.05, 1.05, 0.05).toNonIndexed(), x, 0.5, s * 0.18, s * 0.33, 0, 0), 0x2a2a2c));
  return merge(parts);
}

export function makeRoadblocks(scene, g) {
  // g: { crime, crowd, traffic, focus(), fx, sound, toast, shake(k), paused(), damage }
  const cars = [makeCruiser(scene), makeCruiser(scene)];
  for (const c of cars) c.parkedBlock = true;
  const mat = vcMaterial({ roughness: 0.55, metalness: 0.4 });
  const strip = new THREE.Mesh(stripGeometry(), mat); strip.receiveShadow = true; strip.visible = false; scene.add(strip);
  const bgeo = barrierGeometry();
  const barriers = [0, 1].map(() => { const m = new THREE.Mesh(bgeo, vcMaterial({ roughness: 0.6 })); m.castShadow = true; m.visible = false; scene.add(m); return m; });
  // officers: crowd people with their own brain (the crowd draws them like everyone else)
  const officers = [];
  const r = Math.random;
  for (let k = 0; k < 2; k++) {
    const look = Object.assign(randomLook(r), { shirt: 0x1c2a4a, pants: 0x161a26, sleeveless: false, shorts: false, long: false });
    const p = { beach: false, gang: true, cop: true, x: 99999, z: 0, yaw: 0, speed: 0, look, phase: 0, style: { stride: 1, arm: 0.8 },
      pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 70, shootCD: 1.5, hidden: true, home: { x: 0, z: 0 }, weapon: "pistol" };
    p.ai = officerAI;
    p.onDeath = () => { g.crime.addCrime(1); };
    p.onRespawn = q => { q.hidden = true; q.x = 99999; };
    g.crowd.people.push(p); officers.push(p);
  }
  const B = { active: false, x: 0, z: 0, ax: 0, az: 0, dir: 1, sx: 0, sz: 0, t: 0, cd: 25, hits: 0 };

  function officerAI(p, dt) {
    if (p.hidden) return;
    const F = g.focus(), dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1;
    p.amt = 0; p.phase += dt;
    if (g.crime.S.wanted <= 0 || g.paused()) { p.aimT = 0; return; }
    p.yaw = Math.atan2(dx, dz);
    p.aimT = d < 60 ? 0.5 : 0;
    if (p.shotT > 0) p.shotT -= dt;
    p.shootCD -= dt;
    if (p.shootCD <= 0 && d < 42 && g.crime.los(p.x, p.z, F.x, F.z)) {
      p.shootCD = 0.8 + r() * 0.9; p.shotT = 0.12;
      g.fx.muzzle(p.x + dx / d * 0.6, 1.3, p.z + dz / d * 0.6, dx / d, dz / d);
      g.fx.tracer(p.x, 1.3, p.z, F.x + (r() - 0.5) * 2, 1.1, F.z + (r() - 0.5) * 2);
      g.sound("gun", 0.4);
      if (r() < clamp(0.42 - d * 0.008 - (F.speed > 8 ? 0.18 : 0), 0.05, 0.45)) g.crime.hurt(F.car ? 4 : 8, p.x, p.z);
    }
  }

  // set one up on the road you're driving, a block or so ahead (never in a junction)
  function spawn(c) {
    const alongX = Math.abs(c.vx) > Math.abs(c.vz);
    const dir = Math.sign(alongX ? c.vx : c.vz) || 1;
    const along = alongX ? c.x : c.z, cross = alongX ? c.z : c.x;
    const ri = nearestRoad(cross), rc = roadC(ri);
    if (Math.abs(cross - rc) > ROAD / 2) return false;            // not on a road
    let bi = Math.round((along + dir * 95 + HALF - ROAD - BLOCK / 2) / CELL);
    if ((blockC(bi) - along) * dir < 60) bi += dir;
    if (bi < 0 || bi >= N) return false;                          // you're about to leave the grid
    const bc = blockC(bi);
    B.active = true; B.dir = dir; B.alongX = alongX; B.t = 0; B.hits = 0;
    B.x = alongX ? bc : rc; B.z = alongX ? rc : bc;
    const ax = alongX ? dir : 0, az = alongX ? 0 : dir;            // the way you're coming
    const px = alongX ? 0 : 1, pz = alongX ? 1 : 0;                // across the road
    B.ax = ax; B.az = az; B.px = px; B.pz = pz;
    // cruisers slewed across the lanes, noses almost touching, a gap between them
    const roadH = Math.atan2(ax, az);
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1, u = cars[k];
      u.x = B.x + px * s * 3.4 + ax * (k ? 0.9 : -0.9); u.z = B.z + pz * s * 3.4 + az * (k ? 0.9 : -0.9);
      u.h = roadH + Math.PI / 2 * s + 0.35 * s; u.vx = u.vz = 0; u.speed = 0; u.y = 0; u.pitch = 0; u.roll = 0;
      u.hp = 100; u.boom = false; u.charred = false; u.dmg = null;
      u.group.visible = true; syncCar(u);
    }
    // the strip across the whole road, 9 m in front of them
    B.sx = B.x - ax * 9; B.sz = B.z - az * 9;
    strip.position.set(B.sx, 0, B.sz); strip.rotation.y = alongX ? Math.PI / 2 : 0; strip.visible = true;
    // barriers out at the kerbs behind the cars
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      barriers[k].position.set(B.x + px * s * 6.6 + ax * 2.5, 0, B.z + pz * s * 6.6 + az * 2.5);
      barriers[k].rotation.y = alongX ? 0 : Math.PI / 2; barriers[k].visible = true;
    }
    // officers crouched behind the cruisers
    for (let k = 0; k < 2; k++) {
      const p = officers[k], s = k ? 1 : -1;
      p.hidden = false; p.dead = false; p.knocked = 0; p.hp = 70; p.y = 0; p.shootCD = 1.5 + r();
      p.x = B.x + px * s * 2.2 + ax * 3.6; p.z = B.z + pz * s * 2.2 + az * 3.6; p.home = { x: p.x, z: p.z };
    }
    // nobody's car is parked inside it
    if (g.traffic) for (const t of g.traffic.cars) if (t.alive && (t.x - B.x) ** 2 + (t.z - B.z) ** 2 < 30 * 30) g.traffic.respawnNear(t, c.x, c.z, 180);
    return true;
  }
  function clear() {
    B.active = false; strip.visible = false;
    for (const u of cars) u.group.visible = false;
    for (const b of barriers) b.visible = false;
    for (const p of officers) { p.hidden = true; p.x = 99999; p.aimT = 0; }
  }

  // run over the strip: each axle that crosses it loses its tyres
  function spikes(c) {
    if (!B.active || !c || c.kind || c.air) return;
    const L = (c.spec && c.spec.len) || 4.6, fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const [axle, o] of [["fr", L * 0.32], ["rr", -L * 0.32]]) {
      if (c.flatSet && c.flatSet[axle]) continue;
      const wx = c.x + fx * o, wz = c.z + fz * o;
      const da = (wx - B.sx) * B.ax + (wz - B.sz) * B.az, dc = (wx - B.sx) * B.px + (wz - B.sz) * B.pz;
      if (Math.abs(da) < 0.35 + Math.abs(c.speed) * 0.012 && Math.abs(dc) < ROAD / 2 - 0.2) {
        (c.flatSet || (c.flatSet = {}))[axle] = true;
        c.flat = (c.flat || 0) + 2;
        g.sound("pop", 1); setTimeout(() => g.sound("pop", 0.8), 70);
        g.fx.sparks(wx, 0.3, wz, 10); g.shake(0.35);
        if (c.flat === 2) g.toast("💥 Spike strip! Your tyres are shredded", 3);
      }
    }
  }
  // a car running into the cruisers: shove, bounce, and the dent (two circles along each car)
  function collide(v) {
    let impact = 0; B.lastHit = null;
    if (!B.active) return 0;
    for (const u of cars) {
      const fx = Math.sin(u.h), fz = Math.cos(u.h);
      for (const o of [-1.2, 1.2]) {
        const cx = u.x + fx * o, cz = u.z + fz * o;
        const dx = v.x - cx, dz = v.z - cz, d2 = dx * dx + dz * dz, R = 2.05;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, vn = v.vx * nx + v.vz * nz;
        v.x += nx * (R - d) * 0.75; v.z += nz * (R - d) * 0.75;
        u.x -= nx * (R - d) * 0.25; u.z -= nz * (R - d) * 0.25;
        if (vn < 0 && -vn > impact) B.lastHit = { car: u, x: cx + nx, z: cz + nz, nx, nz };
        if (vn < 0) { impact = Math.max(impact, -vn); v.vx -= nx * vn * 1.3; v.vz -= nz * vn * 1.3; v.vx *= 0.8; v.vz *= 0.8; u.h += (Math.random() - 0.5) * Math.min(0.5, -vn * 0.025); }
      }
    }
    if (impact > 0) for (const u of cars) syncCar(u);
    return impact;
  }

  function update(dt, time) {
    const S = g.crime.S, F = g.focus(), c = F.car;
    B.cd -= dt;
    if (!B.active) {
      if (B.cd <= 0 && S.wanted >= 3 && !g.paused() && c && !c.kind && Math.abs(c.speed) > 10) { if (!spawn(c)) B.cd = 4; else { B.cd = 40 + r() * 25; g.toast("📻 Dispatch: \"Roadblock up ahead — box him in!\"", 3); } }
      return;
    }
    B.t += dt;
    const d2 = (F.x - B.x) ** 2 + (F.z - B.z) ** 2;
    const passed = ((F.x - B.x) * B.ax + (F.z - B.z) * B.az) > 60;
    if (d2 > 260 * 260 || passed && d2 > 90 * 90 || (S.wanted === 0 && d2 > 60 * 60) || (B.t > 120 && d2 > 120 * 120)) { clear(); return; }
    const blink = Math.floor(time * 7 + 0.5) % 2;
    for (const u of cars) { if (u.boom) continue; u.barMatR.color.setRGB(blink ? 6 : 0.4, 0.1, 0.1); u.barMatB.color.setRGB(0.1, 0.2, blink ? 0.4 : 7); }
    // traffic queues up behind it rather than driving through
    // (one that's already nosed right into it, out of your sight, is quietly sent elsewhere)
    if (g.traffic) for (const t of g.traffic.cars) {
      if (!t.alive) continue;
      const e2 = (t.x - B.x) ** 2 + (t.z - B.z) ** 2;
      if (e2 < 11 * 11 && !inView(t.x, t.z, 0)) g.traffic.respawnNear(t, F.x, F.z, 180);
      else if (e2 < 30 * 30) t.stun = Math.max(t.stun, 0.6);
    }
    spikes(c);
  }
  return { update, collide, spikes, clear, B, cars, officers, strip, get lastHit() { return B.lastHit; }, debugSpawn: c => { B.cd = 0; return spawn(c); } };
}
