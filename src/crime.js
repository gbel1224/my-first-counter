// Palm City — heat. Wanted stars, a police force that hunts a BELIEF about where you are (not
// your coordinates), real line of sight against the buildings, a search that widens the longer
// they've lost you, busted and wasted. Ported from the original's investigation AI; the cruisers
// are now real cars driving the road grid with the same physics as yours.
import * as THREE from "../vendor/three.module.js";
import { clamp, lerpAngle, HALF, N, CELL, ROAD, roadC, nearestRoad, groundY } from "./world.js";
import { makeCar, carSpec } from "./cars.js";
import { driveStep, syncCar } from "./play.js";

export const COP_SIGHT = 90;
const MAX_UNITS = 6;

function makeCruiser(scene) {
  const C = makeCar("sedan", 0xf2f2f0);
  // black-and-white livery: dark lower body under the beltline
  C.body.material.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vLy;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLy = position.y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vLy;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nif (vLy < 0.78) diffuseColor.rgb = vec3(0.03, 0.03, 0.035);");
  };
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

export function makeCrime(scene, g) {
  // g: { collider, focus() -> {x,z,car}, fx, sound, toast, banner, onBust(fine), onWasted(fine), inside(), paused(), fxParticles }
  const S = { wanted: 0, wantedCD: 0, crimeCD: 0, searching: false, searchT: 0, onYou: false, health: 100, hurtCD: 0, bustT: 0, flash: 0 };
  const belief = { x: 0, z: 0 };
  const units = [];
  for (let i = 0; i < MAX_UNITS; i++) units.push(makeCruiser(scene));

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
    if (seen) { belief.x = px; belief.z = pz; S.searchT = 0; } else S.searchT += dt;
    S.searching = heat > 0 && !seen && S.searchT > 1.3;
    let grabbing = false;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const want = i < Math.min(MAX_UNITS, heat + (heat >= 3 ? 1 : 0));
      if (want && !u.active) {
        // new units roll in toward where dispatch THINKS you are, from out of sight, on a road
        const a = Math.random() * Math.PI * 2;
        const bx = seen ? px : belief.x, bz = seen ? pz : belief.z;
        const sx = clamp(bx + Math.cos(a) * 110, -HALF + 10, HALF - 10), sz = clamp(bz + Math.sin(a) * 110, -HALF + 10, HALF - 10);
        if (Math.random() < 0.5) { u.x = roadC(nearestRoad(sx)); u.z = sz; } else { u.x = sx; u.z = roadC(nearestRoad(sz)); }
        u.h = Math.atan2(bx - u.x, bz - u.z); u.vx = u.vz = 0; u.speed = 0; u.active = true; u.reverseT = 0; u.stuckT = 0; u.boom = false; u.charred = false; u.sees = false; u.sx = undefined; u.hp = 100;
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
      driveStep(u, aiInp, dt, g.collider);
      syncCar(u);
      const blink = Math.floor(time * 7) % 2;
      u.barMatR.color.setRGB(blink ? 6 : 0.4, 0.1, 0.1); u.barMatB.color.setRGB(0.1, 0.2, blink ? 0.4 : 7);
      // PIT: a cruiser hitting your car hurts
      if (F.car && d < 3.4 && u.speed > 5 && !u.pitCD) { u.pitCD = 1; hurt(18); g.shake(0.6); g.sound("door", 0.9, 0.5); }
      if (u.pitCD) u.pitCD = Math.max(0, u.pitCD - dt);
      if (!F.car && d < 4.5 && !S.searching && u.speed < 6) grabbing = true;
      // from 3 stars they shoot — only with their own line of sight
      if (!g.paused() && heat >= 3 && u.sees && d > 5 && d < 45) {
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
  return { S, units, belief, addCrime, hurt, reset, update, los: (x, z, tx, tz) => los(x, z, tx, tz, COP_SIGHT), busted, wasted };
}
