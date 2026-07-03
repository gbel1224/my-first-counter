// Palm City — ocean life: cruising sharks that hunt swimmers, and ambient beachgoers
// bobbing in the shallows. Split module, same injection pattern as ragdoll/vehicles:
// game.js hands over the scene, the particle/feedback hooks and live player state via
// initOcean(). Own PRNG throughout — never the seeded world stream.
import * as THREE from "./vendor/three.module.js";
import { mulberry32, clamp } from "./util.js";
import { boxGeoC, sphC, mergeGeos } from "./geometry.js";
import { makeWalker, npcWalkerGeos, matPerson } from "./characters.js";

const orng = mulberry32(0x5EAF00D1);
const orr = (a, b) => a + orng() * (b - a);

let scene = null, SEA_Z = 0, deps = null;   // deps: { focus(), hurt, toast, addShake, buzz, burst, emit }
export const sharks = [];
export const swimmers = [];

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
}

export function updateOcean(dt, simTime) {
  const F = deps.focus();   // { x, z, swimming, afloat } — afloat = swimming or riding a boat/jet ski
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
