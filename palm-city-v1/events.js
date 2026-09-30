// Palm City — dynamic street events: the world spontaneously offers something to do as you roam
// freeplay, so it never feels empty. A manager spawns one random event near the player every so
// often, announces it, drops a beacon you can follow via the normal objective marker + minimap, and
// pays out on completion. Self-contained: own PRNG (never the seeded world stream), own meshes,
// imports only from the shared low-level modules.
//
// Event menu:
//   cash     — a cash drop to grab
//   delivery — a timed pickup → drop-off run
//   bounty   — a fleeing target to catch on foot or by car
//   heist    — an armored-truck heist in progress: chase down the truck and crack it for big loot
//   gang     — a gang shootout to join: reach the firefight to muscle in on the score
//   chase    — a police chase you can help or hijack: intercept the fleeing runner
//   race     — a street race flashing "JOIN NOW": reach the start line before it rolls out
import * as THREE from "./vendor/three.module.js";
import { mulberry32, clamp, dist2, roadC, N, CELL, ROAD, HALF } from "./util.js";
import { makeWalker, npcWalkerGeos } from "./characters.js";
import { AudioSys } from "./audio.js";

const evrng = mulberry32(0x0FF1CE99);
const evr = (a, b) => a + evrng() * (b - a);

let scene = null, deps = null;   // deps: { focus(), groundY, toast, earn, save, buzz, addShake, burst, canStart() }
let ev = null;                   // the active event, or null
let idleCD = 22;                 // seconds until the first event can appear
let thug = null;                 // reused bounty-target rig
let truck = null;                // reused armored-truck rig (heist)
let chaseCar = null;             // reused runner-car rig (police chase)
let gangRigs = [];               // reused gangster rigs (gang shootout)

// a tall translucent light column so the objective reads at a glance from across the city
function makeBeacon(color) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 20, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  col.position.y = 10; g.add(col);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  g.userData = { col, ring, color };
  g.visible = false; scene.add(g);
  return g;
}
let beaconA = null, beaconB = null;

// a boxy armored cash truck — cheap merged primitives, built once and reused
function makeTruck() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 6.6), new THREE.MeshLambertMaterial({ color: 0x8b9099 }));
  box.position.y = 1.9; g.add(box);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 2.2), new THREE.MeshLambertMaterial({ color: 0x60656c }));
  cab.position.set(0, 1.4, 3.4); g.add(cab);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.5, 6.64), new THREE.MeshLambertMaterial({ color: 0xffcf3a }));
  stripe.position.y = 1.9; g.add(stripe);
  const wg = new THREE.CylinderGeometry(0.72, 0.72, 0.5, 10), wm = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [sx, sz] of [[-1.6, 2.5], [1.6, 2.5], [-1.6, -2.5], [1.6, -2.5]]) {
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.72, sz); g.add(w);
  }
  g.visible = false; scene.add(g);
  return { group: g };
}

// a low runner car — for the police-chase intercept
function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 4.7), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.9; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 2.3), new THREE.MeshLambertMaterial({ color: 0x222831 }));
  cab.position.set(0, 1.55, -0.2); g.add(cab);
  const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), wm = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [sx, sz] of [[-1.15, 1.5], [1.15, 1.5], [-1.15, -1.5], [1.15, -1.5]]) {
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.5, sz); g.add(w);
  }
  g.visible = false; scene.add(g);
  return { group: g };
}

function ensureGang(n) {
  while (gangRigs.length < n) {
    const w = makeWalker(npcWalkerGeos[(evrng() * npcWalkerGeos.length) | 0]);
    w.group.visible = false; scene.add(w.group); gangRigs.push(w);
  }
  return gangRigs;
}

function snapX(x) { return roadC(clamp(Math.round((x + HALF - ROAD / 2) / CELL), 0, N)); }
function snapZ(z) { return roadC(clamp(Math.round((z + HALF - ROAD / 2) / CELL), 0, N)); }
// a point out on a road, minD..maxD from the player, biased to stay inside the city grid
function roadSpotNear(px, pz, minD, maxD) {
  for (let tries = 0; tries < 12; tries++) {
    const ang = evrng() * Math.PI * 2, d = minD + evrng() * (maxD - minD);
    let tx = px + Math.cos(ang) * d, tz = pz + Math.sin(ang) * d;
    if (evrng() < 0.5) tx = snapX(tx); else tz = snapZ(tz);
    if (Math.abs(tx) < HALF - 20 && Math.abs(tz) < HALF - 20) return [tx, tz];
  }
  return [snapX(px), snapZ(pz + maxD)];
}

function placeBeacon(b, x, z) { b.visible = true; b.position.set(x, 0, z); }
function hideBeacon(b) { if (b) b.visible = false; }

// flee straight away from the player with a little sinusoidal weave, clamped inside the city.
// mutates ev.x / ev.z / ev.h; caller positions its own mesh from those.
function fleeStep(F, sp, dt) {
  const dx = ev.x - F.x, dz = ev.z - F.z, d = Math.hypot(dx, dz) || 1;
  ev.phase += dt * 3;
  const hx = dx / d, hz = dz / d, wob = Math.sin(ev.phase) * 0.5;
  const mx = hx - hz * wob, mz = hz + hx * wob, ml = Math.hypot(mx, mz) || 1;
  ev.x = clamp(ev.x + mx / ml * sp * dt, -HALF + 12, HALF - 12);
  ev.z = clamp(ev.z + mz / ml * sp * dt, -HALF + 12, HALF - 12);
  ev.h = Math.atan2(mx, mz);
}

function animRun(rig, phase) {
  rig.legL.rotation.x = Math.sin(phase * 2) * 0.6; rig.legR.rotation.x = -Math.sin(phase * 2) * 0.6;
  rig.armL.rotation.x = -Math.sin(phase * 2) * 0.5; rig.armR.rotation.x = Math.sin(phase * 2) * 0.5;
}

const TYPES = ["cash", "delivery", "bounty", "heist", "gang", "chase", "race"];
function spawnEvent() {
  const F = deps.focus();
  const type = TYPES[(evrng() * TYPES.length) | 0];
  if (type === "cash") {
    const [x, z] = roadSpotNear(F.x, F.z, 90, 200);
    ev = { type, stage: "go", x, z, t: 40, reward: 250 + ((evrng() * 250) | 0) };
    placeBeacon(beaconA, x, z);
    deps.toast("💰 Cash drop spotted — grab it!");
  } else if (type === "delivery") {
    const [x, z] = roadSpotNear(F.x, F.z, 80, 160);
    ev = { type, stage: "pickup", x, z, t: 35, reward: 600 + ((evrng() * 400) | 0) };
    placeBeacon(beaconA, x, z);
    deps.toast("📦 Rush delivery — grab the parcel!");
  } else if (type === "bounty") {
    const [x, z] = roadSpotNear(F.x, F.z, 70, 150);
    if (!thug) { thug = makeWalker(npcWalkerGeos[(evrng() * npcWalkerGeos.length) | 0]); scene.add(thug.group); }
    thug.group.visible = true;
    ev = { type, stage: "chase", x, z, h: evrng() * 6.28, t: 32, reward: 400 + ((evrng() * 350) | 0), phase: 0 };
    placeBeacon(beaconA, x, z);
    deps.toast("🎯 Bounty target on the run — take them down!");
  } else if (type === "heist") {
    const [x, z] = roadSpotNear(F.x, F.z, 80, 170);
    if (!truck) truck = makeTruck();
    truck.group.visible = true;
    ev = { type, stage: "run", x, z, h: evrng() * 6.28, t: 42, reward: 1500 + ((evrng() * 1200) | 0), phase: 0 };
    placeBeacon(beaconA, x, z);
    deps.toast("🚚 Armored heist in progress — chase down the truck!");
  } else if (type === "gang") {
    const [x, z] = roadSpotNear(F.x, F.z, 70, 150);
    ensureGang(3);
    ev = { type, stage: "join", x, z, t: 38, reward: 500 + ((evrng() * 600) | 0), phase: 0, fireCD: 0, gang: [] };
    for (let i = 0; i < 3; i++) {
      const gx = x + evr(-4, 4), gz = z + evr(-4, 4), gh = evrng() * 6.28;
      ev.gang.push({ x: gx, z: gz, h: gh });
      const r = gangRigs[i]; r.group.visible = true;
      r.group.position.set(gx, deps.groundY(gx, gz), gz); r.group.rotation.y = gh;
    }
    placeBeacon(beaconA, x, z);
    deps.toast("🔫 Gang shootout — muscle in on the score!");
  } else if (type === "chase") {
    const [x, z] = roadSpotNear(F.x, F.z, 80, 170);
    if (!chaseCar) chaseCar = makeCar(0x30507a);
    chaseCar.group.visible = true;
    ev = { type, stage: "intercept", x, z, h: evrng() * 6.28, t: 36, reward: 700 + ((evrng() * 800) | 0), phase: 0 };
    placeBeacon(beaconA, x, z);
    deps.toast("🚔 Police chase — help or hijack the runner!");
  } else {                                     // race
    const [x, z] = roadSpotNear(F.x, F.z, 70, 150);
    ev = { type, stage: "join", x, z, t: 24, reward: 400 + ((evrng() * 500) | 0) };
    placeBeacon(beaconA, x, z);
    deps.toast("🏁 Street race starting — JOIN NOW!");
  }
  AudioSys.play("blip", 0.7); deps.buzz([0, 30, 30, 60]); deps.addShake(0.12);
}

function win(msg) {
  const got = deps.earn(ev.reward);
  deps.toast(msg + "  +$" + got);
  AudioSys.play("cash", 0.8); deps.buzz([0, 40, 30, 90]); deps.addShake(0.2);
  deps.burst(ev.x, 0.5, ev.z, 18, 1.8, 2.2, 0.7, 1.0, 0.85, 0.3);
  deps.save();
  endEvent(rewardNextCD());
}
function fizzle(msg) { if (msg) deps.toast(msg); endEvent(rewardNextCD()); }
function rewardNextCD() { return evr(45, 90); }
function endEvent(cd) {
  hideBeacon(beaconA); hideBeacon(beaconB);
  if (thug) thug.group.visible = false;
  if (truck) truck.group.visible = false;
  if (chaseCar) chaseCar.group.visible = false;
  for (const r of gangRigs) r.group.visible = false;
  ev = null; idleCD = cd;
}

export function initEvents(sceneRef, d) {
  scene = sceneRef; deps = d;
  beaconA = makeBeacon(0xffd24a);   // gold — the primary objective
  beaconB = makeBeacon(0x5fe08a);   // green — a delivery drop-off
}

export function updateEvents(dt, simTime) {
  // pulse whatever beacons are live
  for (const b of [beaconA, beaconB]) {
    if (!b || !b.visible) continue;
    const p = 0.5 + Math.sin(simTime * 4) * 0.5;
    b.userData.col.material.opacity = 0.22 + p * 0.2;
    b.userData.ring.scale.setScalar(1 + p * 0.4);
    b.userData.ring.material.opacity = 0.7 - p * 0.4;
  }
  if (!ev) {
    idleCD -= dt;
    if (idleCD <= 0 && deps.canStart()) spawnEvent();
    return;
  }
  const F = deps.focus();
  ev.t -= dt;
  const nearFoot = ev.type === "bounty" ? 12 : 16, nearDrive = ev.type === "bounty" ? 34 : 44;
  const near = F.driving ? nearDrive : nearFoot;   // squared reach

  if (ev.type === "cash") {
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("💰 Cash grabbed!");
    if (ev.t <= 0) fizzle("💨 The cash drop was cleared out.");
  } else if (ev.type === "delivery") {
    if (ev.stage === "pickup") {
      if (dist2(F.x, F.z, ev.x, ev.z) < near) {
        const [x, z] = roadSpotNear(F.x, F.z, 120, 240);
        ev.stage = "drop"; ev.x = x; ev.z = z; ev.t = 30;
        hideBeacon(beaconA); placeBeacon(beaconB, x, z);
        deps.toast("📦 Parcel grabbed — deliver it, fast!"); AudioSys.play("blip", 0.6); deps.buzz(20);
      } else if (ev.t <= 0) fizzle("💨 The delivery job expired.");
    } else {                                   // drop
      if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("📦 Delivered on time!");
      if (ev.t <= 0) fizzle("⏱️ Too slow — delivery failed.");
    }
  } else if (ev.type === "bounty") {            // the thug flees; catch it before it gets away
    fleeStep(F, 4.6, dt);
    thug.group.position.set(ev.x, deps.groundY(ev.x, ev.z), ev.z);
    thug.group.rotation.y = ev.h; animRun(thug, ev.phase);
    beaconA.position.set(ev.x, 0, ev.z);
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("🎯 Bounty collected!");
    if (ev.t <= 0) fizzle("💨 The bounty got away.");
  } else if (ev.type === "heist") {             // armored truck flees fast; run it down
    fleeStep(F, 7.4, dt);
    truck.group.position.set(ev.x, deps.groundY(ev.x, ev.z), ev.z);
    truck.group.rotation.y = ev.h;
    beaconA.position.set(ev.x, 0, ev.z);
    if (dist2(F.x, F.z, ev.x, ev.z) < near) {
      deps.burst(ev.x, 1.4, ev.z, 30, 3.0, 3.6, 0.9, 1.0, 0.55, 0.14);   // crack it open
      return win("🚚 Truck cracked — big score!");
    }
    if (ev.t <= 0) fizzle("💨 The armored truck got away.");
  } else if (ev.type === "gang") {              // a firefight to reach; puffs of gunfire sell it
    ev.phase += dt; ev.fireCD -= dt;
    for (let i = 0; i < ev.gang.length; i++) {
      const g = ev.gang[i], r = gangRigs[i];
      r.group.rotation.y = g.h + Math.sin(ev.phase * 2 + i) * 0.25;   // twitchy aiming sway
    }
    if (ev.fireCD <= 0) {
      const g = ev.gang[(evrng() * ev.gang.length) | 0];
      deps.burst(g.x, 1.3, g.z, 4, 0.7, 1.0, 0.35, 1.0, 0.72, 0.2);   // muzzle spit
      ev.fireCD = 0.18 + evrng() * 0.34;
    }
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("🔫 Shootout won — score's yours!");
    if (ev.t <= 0) fizzle("💨 The shootout scattered before you arrived.");
  } else if (ev.type === "chase") {             // runner car flees; intercept it
    fleeStep(F, 8.6, dt);
    chaseCar.group.position.set(ev.x, deps.groundY(ev.x, ev.z), ev.z);
    chaseCar.group.rotation.y = ev.h;
    beaconA.position.set(ev.x, 0, ev.z);
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("🚔 Runner intercepted!");
    if (ev.t <= 0) fizzle("💨 The runner lost the chase.");
  } else {                                      // race — reach the start line before it rolls out
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("🏁 Made the grid — race on!");
    if (ev.t <= 0) fizzle("🏁 The race rolled out without you.");
  }
}

// fold the active event into the game's objective marker / minimap / HUD text
export function eventObjective() {
  if (!ev) return null;
  const secs = Math.max(0, Math.ceil(ev.t));
  switch (ev.type) {
    case "cash": return { title: "🎲 EVENT · Cash Drop", text: "Grab the cash · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "delivery": return ev.stage === "pickup"
      ? { title: "🎲 EVENT · Rush Delivery", text: "Grab the parcel · " + secs + "s", x: ev.x, z: ev.z }
      : { title: "🎲 EVENT · Rush Delivery", text: "Deliver now! · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "bounty": return { title: "🎲 EVENT · Bounty", text: "Catch the target · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "heist": return { title: "🎲 EVENT · Armored Heist", text: "Run down the truck · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "gang": return { title: "🎲 EVENT · Gang Shootout", text: "Reach the firefight · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "chase": return { title: "🎲 EVENT · Police Chase", text: "Intercept the runner · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
    case "race": return { title: "🎲 EVENT · Street Race", text: "🏁 JOIN NOW · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
  }
  return null;
}
export function eventActive() { return !!ev; }
export const _debug = {
  spawn: () => { if (!ev) spawnEvent(); },
  get: () => ev,
  forceIdle: v => { idleCD = v; },
  types: () => TYPES.slice(),
};
