// Palm City — dynamic street events: the world spontaneously offers something to do as you roam
// freeplay, so it never feels empty. A manager spawns one random event near the player every so
// often (cash drop / rush delivery / bounty chase), announces it, drops a beacon you can follow via
// the normal objective marker + minimap, and pays out on completion. Self-contained: own PRNG (never
// the seeded world stream), own meshes, imports only from the shared low-level modules.
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

const TYPES = ["cash", "delivery", "bounty"];
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
  } else {
    const [x, z] = roadSpotNear(F.x, F.z, 70, 150);
    if (!thug) { const w = makeWalker(npcWalkerGeos[(evrng() * npcWalkerGeos.length) | 0]); thug = w; scene.add(w.group); }
    thug.group.visible = true;
    ev = { type, stage: "chase", x, z, h: evrng() * 6.28, t: 32, reward: 400 + ((evrng() * 350) | 0), phase: 0 };
    placeBeacon(beaconA, x, z);
    deps.toast("🎯 Bounty target on the run — take them down!");
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
  const near = ev.type === "bounty" ? (F.driving ? 34 : 12) : (F.driving ? 40 : 16);   // squared reach

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
  } else {                                      // bounty — the thug flees; catch it before it gets away
    // flee directly away from the player, with a little weave, clamped to the city
    const dx = ev.x - F.x, dz = ev.z - F.z, d = Math.hypot(dx, dz) || 1;
    ev.phase += dt * 3;
    let hx = dx / d, hz = dz / d;
    const wob = Math.sin(ev.phase) * 0.5;
    const mx = hx - hz * wob, mz = hz + hx * wob, ml = Math.hypot(mx, mz) || 1;
    const sp = 4.6;
    ev.x = clamp(ev.x + mx / ml * sp * dt, -HALF + 12, HALF - 12);
    ev.z = clamp(ev.z + mz / ml * sp * dt, -HALF + 12, HALF - 12);
    ev.h = Math.atan2(mx, mz);
    const gy = deps.groundY(ev.x, ev.z);
    thug.group.position.set(ev.x, gy, ev.z);
    thug.group.rotation.y = ev.h;
    // simple run cycle
    thug.legL.rotation.x = Math.sin(ev.phase * 2) * 0.6; thug.legR.rotation.x = -Math.sin(ev.phase * 2) * 0.6;
    thug.armL.rotation.x = -Math.sin(ev.phase * 2) * 0.5; thug.armR.rotation.x = Math.sin(ev.phase * 2) * 0.5;
    beaconA.position.set(ev.x, 0, ev.z);
    if (dist2(F.x, F.z, ev.x, ev.z) < near) return win("🎯 Bounty collected!");
    if (ev.t <= 0) fizzle("💨 The bounty got away.");
  }
}

// fold the active event into the game's objective marker / minimap / HUD text
export function eventObjective() {
  if (!ev) return null;
  const secs = Math.max(0, Math.ceil(ev.t));
  if (ev.type === "cash") return { title: "🎲 EVENT · Cash Drop", text: "Grab the cash · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
  if (ev.type === "delivery") return ev.stage === "pickup"
    ? { title: "🎲 EVENT · Rush Delivery", text: "Grab the parcel · " + secs + "s", x: ev.x, z: ev.z }
    : { title: "🎲 EVENT · Rush Delivery", text: "Deliver now! · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
  return { title: "🎲 EVENT · Bounty", text: "Catch the target · " + secs + "s · +$" + ev.reward, x: ev.x, z: ev.z };
}
export function eventActive() { return !!ev; }
export const _debug = { spawn: () => { if (!ev) spawnEvent(); }, get: () => ev, forceIdle: v => { idleCD = v; } };
