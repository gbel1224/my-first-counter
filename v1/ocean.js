// Palm City — ocean life: cruising sharks that hunt swimmers, and ambient beachgoers
// bobbing in the shallows. Split module, same injection pattern as ragdoll/vehicles:
// game.js hands over the scene, the particle/feedback hooks and live player state via
// initOcean(). Own PRNG throughout — never the seeded world stream.
import * as THREE from "./vendor/three.module.js";
import { mulberry32, clamp } from "./util.js";
import { boxGeoC, sphC, mergeGeos } from "./geometry.js";
import { makeWalker, npcWalkerGeos, matPerson } from "./characters.js";
import { AudioSys } from "./audio.js";

const orng = mulberry32(0x5EAF00D1);
const orr = (a, b) => a + orng() * (b - a);

let scene = null, SEA_Z = 0, deps = null;   // deps: { focus(), hurt, toast, addShake, buzz, burst, emit, earn, save, fishable(), taken(), collectTreasure(i, pay) }
export const sharks = [];
export const swimmers = [];

// ---- fishing (from any boat or jet ski, stopped on the water) ----
export const fishing = { stage: "idle", t: 0 };   // idle | waiting | bite
let bobber = null;
const FISH = [
  { name: "🐟 Mackerel", pay: 18, w: 5 },
  { name: "🐠 Snapper", pay: 40, w: 3 },
  { name: "🐡 Pufferfish", pay: 70, w: 1.5 },
  { name: "🦑 Squid", pay: 110, w: 0.8 },
  { name: "🦈 Baby Shark", pay: 180, w: 0.35 },
  { name: "🌟 Golden Koi", pay: 350, w: 0.15 },
];
export function fishTap() {
  if (!deps.fishable()) return;
  const F = deps.focus();
  if (fishing.stage === "idle") {                       // cast the line out ahead of the boat
    fishing.stage = "waiting"; fishing.t = orr(2.2, 6);
    bobber.position.set(F.x + Math.sin(F.h || 0) * 5 + orr(-1.5, 1.5), 0.16, F.z + Math.cos(F.h || 0) * 5 + orr(-1.5, 1.5));
    bobber.visible = true;
    AudioSys.play("blip", 0.4); deps.buzz(8);
    deps.burst(bobber.position.x, 0.15, bobber.position.z, 4, 0.5, 0.5, 0.3, 0.85, 0.9, 0.98);   // plip
  } else if (fishing.stage === "bite") {                // hooked it!
    const total = FISH.reduce((a, f) => a + f.w, 0);
    let r = orng() * total, fish = FISH[0];
    for (const f of FISH) { r -= f.w; if (r <= 0) { fish = f; break; } }
    const got = deps.earn(fish.pay);
    deps.toast(fish.name + " caught!  +$" + got);
    AudioSys.play("cash", 0.7); deps.buzz(25); deps.save();
    fishing.stage = "idle"; bobber.visible = false;
  } else {                                              // reeled in too early
    fishing.stage = "idle"; bobber.visible = false;
    deps.toast("Reeled in — nothing on the line yet");
  }
}
function updateFishing(dt, simTime) {
  if (fishing.stage !== "idle" && !deps.fishable()) {   // drove off / hopped out mid-cast
    fishing.stage = "idle"; bobber.visible = false; return;
  }
  if (fishing.stage === "waiting") {
    bobber.position.y = 0.16 + Math.sin(simTime * 3) * 0.04;
    fishing.t -= dt;
    if (fishing.t <= 0) {
      fishing.stage = "bite"; fishing.t = 1.0;          // short window to react
      AudioSys.play("blip", 0.9); deps.buzz([0, 30, 30, 30]);
      deps.burst(bobber.position.x, 0.15, bobber.position.z, 8, 0.9, 0.9, 0.35, 0.85, 0.9, 0.98);
      deps.toast("❗ Something's biting — REEL!");
    }
  } else if (fishing.stage === "bite") {
    bobber.position.y = 0.05 + Math.sin(simTime * 16) * 0.08;   // frantic tugging
    fishing.t -= dt;
    if (fishing.t <= 0) { fishing.stage = "idle"; bobber.visible = false; deps.toast("It got away…"); }
  }
}

// ---- hidden treasure dives: shimmering spots out in shark water, dive to collect ----
export const treasures = [];
export const dive = { t: 0, idx: -1 };
export function nearTreasure(x, z) {
  for (let i = 0; i < treasures.length; i++) {
    const t = treasures[i];
    if (!t.taken && (t.x - x) ** 2 + (t.z - z) ** 2 < 36) return i;
  }
  return -1;
}
export function startDive(x, z) {
  const i = nearTreasure(x, z);
  if (i < 0 || dive.t > 0) return false;
  dive.t = 1.6; dive.idx = i;
  AudioSys.play("blip", 0.5); deps.buzz(12);
  return true;
}
export function diveDepth() { return dive.t > 0 ? Math.sin(clamp(dive.t / 1.6, 0, 1) * Math.PI) * 2.1 : 0; }

function makeSharkMesh() {
  const G = 0x5a6672, B = 0x46525e, W = 0xd8dee4;
  const geo = mergeGeos([
    sphC(0.55, 0, 0, 0, G, 1.0, 0.75, 2.6),               // body (long cigar)
    sphC(0.42, 0, -0.06, 1.1, B, 0.85, 0.6, 1.3),          // snout taper
    sphC(0.5, 0, -0.14, 0, W, 0.92, 0.55, 2.2),            // pale belly
    boxGeoC(0.09, 0.75, 0.55, 0, 0.62, -0.1, B),           // dorsal fin (cuts the surface)
    boxGeoC(0.09, 0.6, 0.5, 0, 0.25, -1.55, B),            // tail fin
    boxGeoC(0.5, 0.07, 0.35, 0.45, -0.1, 0.35, B),         // side fins
    boxGeoC(0.5, 0.07, 0.35, -0.45, -0.1, 0.35, B),
  ]);
  const mesh = new THREE.Mesh(geo, matPerson);
  mesh.castShadow = false;
  return mesh;
}

export function initOcean(sceneRef, seaZ, d) {
  scene = sceneRef; SEA_Z = seaZ; deps = d;
  // three sharks patrolling lazy circles out in the deeper water
  for (let i = 0; i < 3; i++) {
    const cx = orr(-260, 260), cz = SEA_Z + orr(90, 220);
    const mesh = makeSharkMesh(); scene.add(mesh);
    sharks.push({ mesh, cx, cz, r: orr(22, 40), ang: orr(0, 6.28), x: cx, z: cz, h: 0,
      mode: "cruise", cd: 0, warned: false });
  }
  // beachgoers bobbing in the shallows along the busy stretch of sand
  for (let i = 0; i < 8; i++) {
    const w = makeWalker(npcWalkerGeos[(orng() * npcWalkerGeos.length) | 0]);
    scene.add(w.group);
    swimmers.push({ ...w, x: orr(-220, 240), z: SEA_Z + orr(8, 30), h: orr(0, 6.28),
      speed: orr(0.5, 0.9), phase: orr(0, 6.28), turnT: orr(2, 6), flee: 0 });
  }
  // fishing bobber (hidden until a line's cast)
  bobber = new THREE.Mesh(mergeGeos([sphC(0.14, 0, 0.08, 0, 0xe8432e), sphC(0.14, 0, -0.06, 0, 0xf2efe6)]), matPerson);
  bobber.visible = false; scene.add(bobber);
  // six treasure spots scattered through the deep water — a golden shimmer marks each on the surface
  for (let i = 0; i < 6; i++) {
    const x = orr(-340, 340), z = SEA_Z + orr(70, 300);
    const glow = new THREE.Mesh(sphC(0.5, 0, 0, 0, 0xffd24a, 1.4, 0.25, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.75 }));
    glow.position.set(x, 0.1, z); scene.add(glow);
    treasures.push({ x, z, glow, taken: false });
  }
}

let treasureSync = false;
export function updateOcean(dt, simTime) {
  const F = deps.focus();   // { x, z, h, swimming }
  if (!treasureSync) {      // apply the save's already-collected treasures once play begins
    treasureSync = true;
    for (const i of deps.taken()) if (treasures[i]) { treasures[i].taken = true; treasures[i].glow.visible = false; }
  }
  updateFishing(dt, simTime);
  // treasure shimmer pulse + an active dive resolving
  for (const t of treasures) if (!t.taken) {
    t.glow.material.opacity = 0.5 + Math.sin(simTime * 2.6 + t.x) * 0.3;
    t.glow.position.y = 0.1 + Math.sin(simTime * 1.8 + t.z) * 0.05;
  }
  if (dive.t > 0) {
    dive.t -= dt;
    if (Math.random() < 0.5) deps.emit(F.x + orr(-0.4, 0.4), 0.1, F.z + orr(-0.4, 0.4), orr(-0.2, 0.2), orr(0.3, 0.8), orr(-0.2, 0.2), 0.5, 0.85, 0.92, 1.0);   // bubbles
    if (dive.t <= 0) {
      const t = treasures[dive.idx];
      if (t && !t.taken) {
        t.taken = true; t.glow.visible = false;
        deps.collectTreasure(dive.idx, 250 + ((orng() * 550) | 0));
        deps.burst(F.x, 0.3, F.z, 16, 1.6, 1.8, 0.6, 1.0, 0.85, 0.3);
        AudioSys.play("jingle", 0.8); deps.buzz([0, 40, 30, 80]); deps.addShake(0.2);
      }
      dive.idx = -1;
    }
  }
  // ---- sharks ----
  for (const s of sharks) {
    const pd2 = (s.x - F.x) ** 2 + (s.z - F.z) ** 2;
    if (pd2 > 260000) { s.mesh.visible = false; continue; }   // nobody around to see it
    s.mesh.visible = true;
    if (s.cd > 0) s.cd -= dt;
    // a swimmer (not a boat) in deep water inside ~55u wakes the hunt
    const preyDeep = F.swimming && F.z > SEA_Z + 30;
    if (s.mode === "cruise") {
      if (preyDeep && pd2 < 3000 && s.cd <= 0) {
        s.mode = "hunt";
        if (!s.warned) { s.warned = true; deps.toast("🦈 SHARK! Swim for the shallows!"); deps.buzz([0, 60, 40, 60]); deps.addShake(0.3); }
      }
      s.ang += 0.28 * dt;
      const tx = s.cx + Math.cos(s.ang) * s.r, tz = s.cz + Math.sin(s.ang) * s.r;
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz) || 1;
      s.h += clamp(Math.atan2(dx, dz) - s.h, -1.4 * dt, 1.4 * dt);
      s.x += Math.sin(s.h) * 3.2 * dt; s.z += Math.cos(s.h) * 3.2 * dt;
    } else if (s.mode === "hunt") {
      if (!preyDeep) { s.mode = "cruise"; s.warned = false; }   // reached the shallows / got out — called off
      else {
        const dx = F.x - s.x, dz = F.z - s.z, d = Math.hypot(dx, dz) || 1;
        const want = Math.atan2(dx, dz);
        let dh = want - s.h; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
        s.h += clamp(dh, -2.4 * dt, 2.4 * dt);
        s.x += Math.sin(s.h) * 7.6 * dt; s.z += Math.cos(s.h) * 7.6 * dt;
        s.z = Math.max(s.z, SEA_Z + 18);                       // sharks won't beach themselves
        if (Math.random() < 0.25) deps.emit(s.x, 0.12, s.z - Math.cos(s.h) * 1.6, orr(-0.3, 0.3), orr(0.05, 0.3), orr(-0.3, 0.3), 0.5, 0.8, 0.88, 0.95);   // fin wake
        if (d < 1.8) {                                          // BITE
          deps.hurt(24);
          deps.burst(F.x, 0.15, F.z, 14, 1.4, 1.2, 0.5, 0.9, 0.25, 0.2);
          deps.toast("🦈 Shark bite! Get out of the deep!"); deps.addShake(0.5); deps.buzz([0, 80, 50, 80]);
          s.mode = "cooldown"; s.cd = 3.5;                      // peels away before circling back
        }
      }
    } else if (s.mode === "cooldown") {
      s.x += Math.sin(s.h + 2.4) * 5 * dt; s.z += Math.cos(s.h + 2.4) * 5 * dt;
      if (s.cd <= 0) { s.mode = "cruise"; s.cx = s.x; s.cz = Math.max(SEA_Z + 60, s.z); s.warned = false; }
    }
    // body rides just under the surface, dorsal fin slicing out; nose-down lunge while hunting
    s.mesh.position.set(s.x, -0.32 + Math.sin(simTime * 1.7 + s.ang) * 0.05, s.z);
    s.mesh.rotation.set(s.mode === "hunt" ? 0.08 : 0, s.h, Math.sin(simTime * 2.2 + s.ang) * 0.06);
  }
  // ---- swimmers (ambient beachgoers in the shallows) ----
  for (const w of swimmers) {
    const pd2 = (w.x - F.x) ** 2 + (w.z - F.z) ** 2;
    if (pd2 > 220000) { w.group.visible = false; continue; }
    w.group.visible = true;
    if (pd2 > 68000) continue;                                 // visible far off, simulated when close
    w.flee = Math.max(0, w.flee - dt);
    // scatter shoreward when a hunting shark prowls near
    for (const s of sharks) if (s.mode !== "cruise" && (s.x - w.x) ** 2 + (s.z - w.z) ** 2 < 625) {
      w.flee = 2.5; w.h = Math.PI + orr(-0.35, 0.35);           // beeline for the beach (-z is shoreward)
    }
    w.turnT -= dt;
    if (w.turnT <= 0 && w.flee <= 0) { w.turnT = orr(2.5, 7); w.h += orr(-1.4, 1.4); }
    const sp = w.flee > 0 ? 2.4 : w.speed;
    w.x = clamp(w.x + Math.sin(w.h) * sp * dt, -320, 320);
    w.z = clamp(w.z + Math.cos(w.h) * sp * dt, SEA_Z + 4, SEA_Z + 46);
    w.phase += dt * (w.flee > 0 ? 7 : 2.6);
    const moving = w.flee > 0 ? 1 : 0.35;
    const tilt = 0.5 + moving * 0.75;
    w.group.position.set(w.x, 0.62 - 1.63 * Math.cos(tilt) + Math.sin(simTime * 2 + w.phase) * 0.06, w.z);
    w.group.rotation.set(tilt, w.h, 0);
    w.armL.rotation.x = -1.4 + Math.sin(w.phase) * (0.6 + moving);        // lazy paddle -> frantic crawl
    w.armR.rotation.x = -1.4 + Math.sin(w.phase + Math.PI) * (0.6 + moving);
    w.legL.rotation.x = Math.sin(w.phase * 2) * 0.35; w.legR.rotation.x = -Math.sin(w.phase * 2) * 0.35;
    w.kneeL.rotation.x = 0.3; w.kneeR.rotation.x = 0.3;
  }
}
