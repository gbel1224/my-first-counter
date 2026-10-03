// Palm City — heat. Wanted stars, a police force that hunts a BELIEF about where you are (not
// your coordinates), real line of sight against the buildings, a search that widens the longer
// they've lost you, busted and wasted. Ported from the original's investigation AI; the cruisers
// are now real cars driving the road grid with the same physics as yours.
import * as THREE from "../vendor/three.module.js";
import { clamp, lerpAngle, HALF, N, CELL, ROAD, roadC, nearestRoad, groundY } from "./world.js";
import { makeCar, carSpec, driveLamps } from "./cars.js";
import { driveStep, syncCar } from "./play.js";
import { buildCraft } from "./craft.js";

export const COP_SIGHT = 90;
const MAX_UNITS = 6;

function makeCruiser(scene) {
  const C = makeCar("sedan", 0xf2f2f0);
  // black-and-white livery: dark lower body under the beltline
  // (on top of the paint's own wear shader: the livery goes on first, the road grime over it)
  const wear = C.body.material.onBeforeCompile, bm = C.body.material;
  bm.onBeforeCompile = (sh, r) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vLy;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLy = position.y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vLy;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nif (vLy < 0.78) diffuseColor.rgb = vec3(0.03, 0.03, 0.035);");
    wear(sh, r);
  };
  bm.customProgramCacheKey = () => "carpaint-police";
  const barMatR = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  const barMatB = new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.34), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), barMatR), b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.3), barMatB);
  const top = C.spec.cabin[1][1] + C.spec.ride - 0.18 + 0.05;
  base.position.set(0, top, -0.2); r.position.set(-0.3, top + 0.1, -0.2); b.position.set(0.3, top + 0.1, -0.2);
  C.chassis.add(base, r, b);
  C.group.visible = false;
  scene.add(C.group);
  return { ...C, x: 0, z: 0, h: 0, vx: 0, vz: 0, y: 0, steer: 0, yawRate: 0, speed: 0, spec: { ...carSpec("sedan"), top: 46, accel: 19, grip: 8.4 },
    active: false, sees: false, losCD: 0, barMatR, barMatB, hp: 100, shootCD: 1 };
}

// 5★: an armoured SWAT tank — slow, near-unstoppable, and its cannon shells blow up whatever you're in
function makeTank(scene) {
  const group = new THREE.Group(), chassis = new THREE.Group(); group.add(chassis);
  const armor = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.75, metalness: 0.35 });
  const tread = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.95 });
  const M = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; chassis.add(m); return m; };
  M(new THREE.BoxGeometry(2.9, 0.9, 5.8), armor, 0, 1.05, 0);
  M(new THREE.BoxGeometry(2.6, 0.5, 1.2), armor, 0, 0.95, 3.2).rotation.x = -0.45;
  for (const x of [-1.55, 1.55]) M(new THREE.BoxGeometry(0.7, 0.95, 6.1), tread, x, 0.5, 0);
  const turret = new THREE.Group(); turret.position.set(0, 1.75, -0.3); chassis.add(turret);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.75, 14), armor); tm.castShadow = true; turret.add(tm);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 3.6, 10), armor); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.1, 2.3); turret.add(barrel);
  const barMatR = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }), barMatB = new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false });
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.3), barMatR), b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.3), barMatB);
  r.position.set(-0.35, 0.45, -0.3); b.position.set(0.35, 0.45, -0.3); turret.add(r, b);
  group.visible = false; scene.add(group);
  return { group, chassis, body: tm, turret, tank: true, type: "suv", x: 0, z: 0, h: 0, vx: 0, vz: 0, y: 0, steer: 0, yawRate: 0, speed: 0,
    spec: { ...carSpec("suv"), top: 26, accel: 9, grip: 12, turn: 1.6, len: 6, wid: 3 }, active: false, sees: false, losCD: 0, barMatR, barMatB, hp: 700, shootCD: 3 };
}

// 4★: the police helicopter. It sees you from above — buildings don't hide you, only cover does —
// sweeps a searchlight, and a marksman leans out the door. Outrun it or shoot it down.
function makeHeli(scene) {
  const C = buildCraft("heli", 0x16233c);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 0.25, 1, 20, 1, true), coneMat);
  cone.geometry.translate(0, 0.5, 0); cone.geometry.rotateX(-Math.PI / 2);   // apex at origin, opens along -Z… then aimed with lookAt
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), spotMat); spot.rotation.x = -Math.PI / 2;
  scene.add(C.group, cone, spot); C.group.visible = cone.visible = spot.visible = false;
  return { ...C, cone, coneMat, spot, spotMat, active: false, x: 0, y: 40, z: 0, h: 0, hp: 260, shootCD: 2, orbit: Math.random() * 6, lx: 0, lz: 0, fall: 0, cool: 0, sees: false };
}

export function makeCrime(scene, g) {
  // g: { collider, focus() -> {x,z,car}, fx, sound, toast, banner, onBust(fine), onWasted(fine), inside(), paused(), fxParticles }
  const S = { wanted: 0, wantedCD: 0, crimeCD: 0, searching: false, searchT: 0, onYou: false, health: 100, hurtCD: 0, bustT: 0, flash: 0 };
  const belief = { x: 0, z: 0 };
  const units = [];
  for (let i = 0; i < MAX_UNITS; i++) units.push(makeCruiser(scene));
  units.push(makeTank(scene));                         // the last slot is the tank — only rolls out at 5★
  const heli = makeHeli(scene);

  function los(x, z, tx, tz, max) {
    const d = Math.hypot(tx - x, tz - z);
    if (d > max) return false;
    return g.collider.segmentHit(x, z, tx, tz, 2.0) >= 0.999;
  }
  function addCrime(n = 1) {
    if (g.noHeat && g.noHeat()) return;
    S.wantedCD = 14;
    if (S.crimeCD > 0 && n <= 1) return;
    S.crimeCD = 1.5;
    const before = S.wanted;
    S.wanted = Math.min(5, S.wanted + n);
    if (S.wanted > before) { g.toast("Wanted " + "★".repeat(S.wanted)); g.sound("blip", 0.8); if (before === 0) { const f = g.focus(); belief.x = f.x; belief.z = f.z; } }
  }
  function hurt(n) {
    if (S.health <= 0) return;
    S.health = Math.max(0, S.health - n); S.hurtCD = 4; S.flash = Math.min(1, S.flash + n / 40);
    if (S.health <= 0) wasted();
  }
  function reset() {
    S.wanted = 0; S.wantedCD = 0; S.crimeCD = 0; S.searching = false; S.searchT = 0; S.onYou = false; S.bustT = 0;
    for (const u of units) { u.active = false; u.group.visible = false; }
    heliOff();
  }
  function heliOff() { heli.active = false; heli.fall = 0; heli.group.visible = heli.cone.visible = heli.spot.visible = false; }
  // shots / blasts at the chopper; returns true when it goes down
  function hitHeli(n) {
    if (!heli.active || heli.fall) return false;
    heli.hp -= n; g.fxParticles.sparks(heli.x, heli.y + 1.5, heli.z, 4);
    if (heli.hp <= 0) { heli.fall = 1; heli.vy = 0; g.fxParticles.explosion(heli.x, heli.y + 1.5, heli.z, 0.8); g.sound("boom", 0.8); addCrime(1); g.toast("🚁 Chopper down!"); return true; }
    return false;
  }
  function updateHeli(dt, time, px, pz, heat, seenByCars) {
    const H = heli;
    if (H.cool > 0) H.cool -= dt;
    if (H.fall) {                                        // spinning down, trailing smoke, then it's a fireball
      H.vy -= 14 * dt; H.y += H.vy * dt; H.h += dt * 5; H.x += Math.sin(H.h) * dt * 6;
      g.fxParticles.smoke(H.x, H.y + 1.5, H.z, 1.4); if (Math.random() < 0.5) g.fxParticles.fire(H.x, H.y + 1.6, H.z);
      H.group.position.set(H.x, H.y, H.z); H.group.rotation.set(0.3, H.h, 0.4); H.cone.visible = H.spot.visible = false;
      if (H.y <= groundY(H.x, H.z)) {
        g.fxParticles.explosion(H.x, 1.5, H.z, 1.6); g.sound("boom", 1); g.shake(0.8);
        if (g.onHeliCrash) g.onHeliCrash(H.x, H.z);
        heliOff(); H.cool = 40;
      }
      return false;
    }
    const want = heat >= 4 && H.cool <= 0;
    if (want && !H.active) {                             // clatters in from out of view
      const a = Math.random() * Math.PI * 2;
      H.x = clamp(belief.x + Math.cos(a) * 160, -HALF, HALF); H.z = clamp(belief.z + Math.sin(a) * 160, -HALF, HALF + 300);
      H.y = 42; H.hp = 260; H.active = true; H.lx = belief.x; H.lz = belief.z; H.group.visible = H.cone.visible = H.spot.visible = true;
      g.toast("🚁 Police chopper overhead!");
    } else if (!want && H.active) { heliOff(); return false; }
    if (!H.active) return false;
    // sight: from up here only real cover hides you (a tunnel, a garage, indoors)
    const dH = Math.hypot(px - H.x, pz - H.z);
    const covered = g.inside && g.inside();
    H.sees = !covered && dH < 75;
    const tx = H.sees || seenByCars ? px : belief.x, tz = H.sees || seenByCars ? pz : belief.z;
    // orbit the target at a stand-off radius, a lazy circle when searching
    H.orbit += dt * 0.35;
    const R = H.sees ? 20 : 34;
    const gx = tx + Math.cos(H.orbit) * R, gz = tz + Math.sin(H.orbit) * R;
    const dx = gx - H.x, dz = gz - H.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(30, d * 0.9);
    H.x += dx / d * sp * dt; H.z += dz / d * sp * dt; H.y += (36 + Math.sin(time * 0.7) * 2 - H.y) * Math.min(1, dt);
    H.h = lerpAngle(H.h, Math.atan2(tx - H.x, tz - H.z), Math.min(1, dt * 1.5));
    H.group.position.set(H.x, H.y, H.z); H.group.rotation.set(Math.min(0.25, sp / 120), H.h, 0);
    H.parts.rotor.rotation.y += dt * 38; H.parts.tailRotor.rotation.x += dt * 50;
    // searchlight: lags onto you, sweeps when it's lost you
    const sx = H.sees ? px : tx + Math.sin(time * 0.9) * 14, sz = H.sees ? pz : tz + Math.cos(time * 0.6) * 14;
    H.lx += (sx - H.lx) * Math.min(1, dt * 2.5); H.lz += (sz - H.lz) * Math.min(1, dt * 2.5);
    const gy = groundY(H.lx, H.lz) + 0.08;
    const len = Math.hypot(H.lx - H.x, gy - H.y + 0.6, H.lz - H.z);
    H.cone.position.set(H.x, H.y + 0.6, H.z); H.cone.scale.set(1, 1, len); H.cone.lookAt(H.lx, gy, H.lz); H.cone.rotateY(Math.PI);
    H.spot.position.set(H.lx, gy, H.lz);
    const night = g.night ? g.night() : 0;
    H.coneMat.opacity = 0.04 + night * 0.14; H.spotMat.opacity = 0.12 + night * 0.35;
    // the door gunner
    if (!g.paused() && H.sees && dH < 60) {
      H.shootCD -= dt;
      if (H.shootCD <= 0) {
        H.shootCD = 1.4 + Math.random();
        g.fxParticles.tracer(H.x, H.y + 1.2, H.z, px + (Math.random() - 0.5) * 3, 1.1, pz + (Math.random() - 0.5) * 3);
        g.sound("gun", 0.35);
        const f = g.focus();
        if (Math.random() < (f.speed > 8 ? 0.15 : 0.32)) hurt(f.car ? 5 : 8);
      }
    }
    return H.sees;
  }
  function busted() {
    const fine = 100 + 80 * S.wanted;
    reset(); g.onBust(fine);
  }
  function wasted() {
    const fine = 100 + 60 * S.wanted;
    reset(); S.health = 100; g.onWasted(fine);
  }
  // route along the road grid: head down your road to the cross street nearest the target, then turn
  function routeTarget(u, tx, tz) {
    const d = Math.hypot(tx - u.x, tz - u.z);
    if (d < 34) return [tx, tz];
    const ri = nearestRoad(u.x), rj = nearestRoad(u.z);
    const onNS = Math.abs(u.x - roadC(ri)) < ROAD * 0.6, onEW = Math.abs(u.z - roadC(rj)) < ROAD * 0.6;
    const ti = nearestRoad(tx), tj = nearestRoad(tz);
    if (onNS && onEW) {                                // in a junction: pick the axis with more to go
      return Math.abs(tx - u.x) > Math.abs(tz - u.z) ? [roadC(ti), roadC(rj)] : [roadC(ri), roadC(tj)];
    }
    if (onNS) return [roadC(ri), ri === ti ? tz : roadC(tj)];
    if (onEW) return [rj === tj ? tx : roadC(ti), roadC(rj)];
    return [roadC(ri), roadC(rj)];                     // off the grid: get back onto the nearest junction
  }
  const aiInp = { mx: 0, mz: 0, sprintHeld: false, handbrakeHeld: false };

  function update(dt, time) {
    if (S.crimeCD > 0) S.crimeCD -= dt;
    S.flash = Math.max(0, S.flash - dt * 1.5);
    if (S.hurtCD > 0) S.hurtCD -= dt; else if (S.health < 100) S.health = Math.min(100, S.health + dt * 4);   // patch up out of danger
    const F = g.focus(), px = F.x, pz = F.z;
    const heat = S.wanted;
    // ---- sight: resolved before anyone moves ----
    let seen = false;
    if (heat > 0 && !(g.inside && g.inside())) {
      for (const u of units) {
        if (!u.active) continue;
        if ((u.x - px) ** 2 + (u.z - pz) ** 2 > COP_SIGHT * COP_SIGHT) { u.sees = false; u.losCD = 0; continue; }
        u.losCD -= dt;
        if (u.losCD <= 0) { u.losCD = 0.13 + Math.random() * 0.12; u.sees = los(u.x, u.z, px, pz, COP_SIGHT); }
        if (u.sees) seen = true;
      }
    }
    if (updateHeli(dt, time, px, pz, heat, seen)) seen = true;
    if (seen) { belief.x = px; belief.z = pz; S.searchT = 0; } else S.searchT += dt;
    S.searching = heat > 0 && !seen && S.searchT > 1.3;
    let grabbing = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const want = u.tank ? heat >= 5 : i < Math.min(MAX_UNITS, heat + (heat >= 3 ? 1 : 0));
      if (want && !u.active) {
        // new units roll in toward where dispatch THINKS you are, from out of sight, on a road
        const a = Math.random() * Math.PI * 2;
        const bx = seen ? px : belief.x, bz = seen ? pz : belief.z;
        const sx = clamp(bx + Math.cos(a) * 110, -HALF + 10, HALF - 10), sz = clamp(bz + Math.sin(a) * 110, -HALF + 10, HALF - 10);
        if (Math.random() < 0.5) { u.x = roadC(nearestRoad(sx)); u.z = sz; } else { u.x = sx; u.z = roadC(nearestRoad(sz)); }
        u.h = Math.atan2(bx - u.x, bz - u.z); u.vx = u.vz = 0; u.speed = 0; u.active = true; u.reverseT = 0; u.stuckT = 0; u.boom = false; u.charred = false; u.sees = false; u.sx = undefined; u.hp = u.tank ? 700 : 100;
        if (u.tank) g.toast("⚠️ SWAT tank deployed!");
        u.group.visible = true;
      } else if (!want && u.active) { u.active = false; u.group.visible = false; }
      if (!u.active) continue;
      // where to go: you (if seen), your last known position, or a sweep point around it
      let tx = belief.x, tz = belief.z;
      if (S.searching) {
        const ring = Math.min(80, 12 + S.searchT * 5.5);
        if (u.sx === undefined || (u.x - u.sx) ** 2 + (u.z - u.sz) ** 2 < 100) {
          const a = Math.random() * Math.PI * 2, r = ring * (0.3 + Math.random() * 0.7);
          u.sx = clamp(belief.x + Math.cos(a) * r, -HALF + 8, HALF - 8); u.sz = clamp(belief.z + Math.sin(a) * r, -HALF + 8, HALF - 8);
        }
        tx = u.sx; tz = u.sz;
      } else u.sx = undefined;
      const [rx, rz] = routeTarget(u, tx, tz);
      const want_h = Math.atan2(rx - u.x, rz - u.z);
      let dh = want_h - u.h; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const d = Math.hypot(px - u.x, pz - u.z);
      aiInp.mx = clamp(-dh * 2.2, -1, 1);
      const cruise = g.paused() ? 0 : S.searching ? 0.55 : 1;
      aiInp.mz = Math.abs(dh) > 1.8 ? -0.4 : cruise * (d < 8 && !F.car ? 0.2 : 1);
      aiInp.handbrakeHeld = Math.abs(dh) > 0.9 && u.speed > 12;
      // wedged against a wall or a car: back out, swinging the nose the other way, then try again
      if (u.reverseT > 0) { u.reverseT -= dt; aiInp.mz = -1; aiInp.mx = -aiInp.mx; aiInp.handbrakeHeld = false; }
      else if (aiInp.mz > 0.3 && u.speed < 1.5 && d > 6) { u.stuckT = (u.stuckT || 0) + dt; if (u.stuckT > 1.2) { u.stuckT = 0; u.reverseT = 1.1; } }
      else u.stuckT = 0;
      driveStep(u, aiInp, dt, g.collider); driveLamps(u, aiInp, dt);
      syncCar(u);
      const blink = Math.floor(time * 7) % 2;
      u.barMatR.color.setRGB(blink ? 6 : 0.4, 0.1, 0.1); u.barMatB.color.setRGB(0.1, 0.2, blink ? 0.4 : 7);
      // PIT: a cruiser hitting your car hurts
      if (F.car && d < 3.4 && u.speed > 5 && !u.pitCD) { u.pitCD = 1; hurt(18); g.shake(0.6); g.sound("door", 0.9, 0.5); }
      if (u.pitCD) u.pitCD = Math.max(0, u.pitCD - dt);
      if (!F.car && d < 4.5 && !S.searching && u.speed < 6) grabbing = true;
      if (u.tank) {                                     // the turret tracks you; the cannon fires shells
        u.turret.rotation.y = lerpAngle(u.turret.rotation.y, Math.atan2(px - u.x, pz - u.z) - u.h, Math.min(1, dt * 2));
        u.shootCD -= dt;
        if (!g.paused() && u.sees && d > 10 && d < 70 && u.shootCD <= 0 && g.shell) {
          u.shootCD = 3.2 + Math.random() * 1.5;
          const a = u.h + u.turret.rotation.y, mx = u.x + Math.sin(a) * 4.4, mz = u.z + Math.cos(a) * 4.4;
          g.fxParticles.muzzle(mx, 1.9, mz, Math.sin(a), Math.cos(a)); g.shake(0.25);
          g.shell(mx, mz, px + (Math.random() - 0.5) * 4, pz + (Math.random() - 0.5) * 4, u);
        }
        // it doesn't stop for traffic — it rolls over it
        if (g.crush) g.crush(u);
      }
      // from 3 stars they shoot — only with their own line of sight
      else if (!g.paused() && heat >= 3 && u.sees && d > 5 && d < 45) {
        u.shootCD -= dt;
        if (u.shootCD <= 0) {
          u.shootCD = 0.9 + Math.random() * 0.8;
          g.fxParticles.muzzle(u.x + Math.sin(u.h) * 1.2, 1.4, u.z + Math.cos(u.h) * 1.2, Math.sin(u.h), Math.cos(u.h));
          g.fxParticles.tracer(u.x, 1.4, u.z, px + (Math.random() - 0.5) * 2, 1.2, pz + (Math.random() - 0.5) * 2);
          g.sound("gun", 0.5);
          const fast = F.speed > 6;
          if (Math.random() < clamp(0.5 - d * 0.009 - (fast ? 0.2 : 0), 0.05, 0.5)) hurt(F.car ? 5 : 9);
        }
      }
    }
    // on foot, cornered by a stopped cruiser for a moment: BUSTED
    if (grabbing) { S.bustT += dt; if (S.bustT > 1.4) { busted(); return; } } else S.bustT = Math.max(0, S.bustT - dt * 2);
    // heat only cools while they've genuinely lost you
    if (S.wanted > 0) {
      if (!S.searching) { S.wantedCD = Math.max(S.wantedCD, 6); S.onYou = true; }
      else {
        if (S.onYou) { S.onYou = false; g.toast("🔍 Out of sight — they're sweeping the area. Stay hidden!"); }
        S.wantedCD -= dt * (g.heatMult ? g.heatMult() : 1);
        if (S.wantedCD <= 0) { S.wanted = Math.max(0, S.wanted - 1); S.wantedCD = 8; if (S.wanted === 0) { g.toast("You lost the cops"); g.sound("jingle", 0.5); } }
      }
    } else S.searching = false;
  }
  return { S, units, heli, hitHeli, belief, addCrime, hurt, reset, update, los: (x, z, tx, tz) => los(x, z, tx, tz, COP_SIGHT), busted, wasted };
}
