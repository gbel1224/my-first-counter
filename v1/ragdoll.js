// Palm City — spring/tumble ragdoll physics. Split out of game.js; the scene and the
// ground-height function are injected once via initRagdolls() (they live in game.js).
import { mulberry32, clamp } from "./util.js";

let scene = null, groundY = null;
export function initRagdolls(sceneRef, groundYFn) { scene = sceneRef; groundY = groundYFn; }

// lightweight spring/tumble ragdoll (no physics engine, no rigid-body constraints): the character's
// root free-falls under gravity and bounces/settles on the ground, while every limb joint gets its own
// damped spring pulling it toward a relaxed pose. Cheap enough to run several at once, and reads as
// "a body actually falling" for deaths, car hits, explosions and punch knockdowns. Reuses the SAME
// mesh/rig the character was already using (no cloning, except the player who needs their real rig
// free to respawn immediately). Own PRNG so combat variety never touches the seeded city/economy stream.
export const ragRng = mulberry32(0xBA6D011E);
export const rrand = (a, b) => a + ragRng() * (b - a);
export const ragdolls = [];
export const RAG_G = 22;                                    // gravity (u/s^2) — a bit punchier than real-world, reads better at speed
export const RAG_REST = { legL: 0.35, legR: 0.35, armL: -0.55, armR: -0.55, kneeL: 0.7, kneeR: 0.7 };   // relaxed "sprawled" pose
export const RAG_LIMBS = ["legL", "legR", "armL", "armR", "kneeL", "kneeR"];
export function spawnRagdoll(parts, x, y, z, heading, impulse, kind, opts) {
  opts = opts || {};
  const r = {
    group: parts.group, legL: parts.legL, legR: parts.legR, armL: parts.armL, armR: parts.armR, kneeL: parts.kneeL, kneeR: parts.kneeR,
    x, y: y + 0.02, z,
    vx: impulse.vx || 0, vy: impulse.vy || 0, vz: impulse.vz || 0,
    rx: 0, ry: heading || 0, rz: 0,
    wx: rrand(-2.6, 2.6), wy: rrand(-1.6, 1.6), wz: rrand(-2.6, 2.6),
    limbW: { legL: rrand(-4, 4), legR: rrand(-4, 4), armL: rrand(-5, 5), armR: rrand(-5, 5), kneeL: rrand(-3, 3), kneeR: rrand(-3, 3) },
    t: 0, settleT: 0, mode: "tumble", fadeT: 0, getupT: 0, kind: kind, npc: opts.npc || null,
  };
  const kick = clamp(Math.hypot(r.vx, r.vy, r.vz) * 0.35, 0.4, 3.2);   // harder hits flail harder
  r.wx *= kick; r.wy *= kick; r.wz *= kick;
  for (const k of RAG_LIMBS) r.limbW[k] *= kick;
  ragdolls.push(r);
  return r;
}
export function updateRagdolls(dt) {
  for (let i = ragdolls.length - 1; i >= 0; i--) {
    const r = ragdolls[i];
    r.t += dt;
    if (r.mode === "tumble" || r.mode === "settled") {
      r.vy -= RAG_G * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      const gy = groundY(r.x, r.z) + 0.06;
      let grounded = false;
      if (r.y <= gy) {
        r.y = gy; grounded = true;
        r.vy = r.vy < -0.6 ? -r.vy * 0.26 : 0;                 // small bounce, dies out fast
        const fr = Math.exp(-7 * dt);
        r.vx *= fr; r.vz *= fr;
        r.wx *= Math.exp(-6 * dt); r.wy *= Math.exp(-6 * dt); r.wz *= Math.exp(-6 * dt);
      } else {
        r.vx *= Math.exp(-0.25 * dt); r.vz *= Math.exp(-0.25 * dt);   // light air drag
      }
      r.rx += r.wx * dt; r.ry += r.wy * dt; r.rz += r.wz * dt;
      r.wx *= Math.exp(-1.4 * dt); r.wy *= Math.exp(-1.4 * dt); r.wz *= Math.exp(-1.4 * dt);
      for (const k of RAG_LIMBS) {
        const part = r[k], rest = RAG_REST[k];
        const spring = -(part.rotation.x - rest) * 10;
        r.limbW[k] = (r.limbW[k] + spring * dt) * Math.exp(-3.4 * dt);
        part.rotation.x = clamp(part.rotation.x + r.limbW[k] * dt, -2.2, 2.2);
      }
      r.group.position.set(r.x, r.y, r.z);
      r.group.rotation.set(r.rx, r.ry, r.rz);
      const slow = r.vx * r.vx + r.vy * r.vy + r.vz * r.vz < 0.04 && r.wx * r.wx + r.wy * r.wy + r.wz * r.wz < 0.3;
      r.settleT = (grounded && slow) ? r.settleT + dt : 0;
      if (r.mode === "tumble" && r.settleT > 0.18) r.mode = "settled";
      if (r.mode === "settled") {
        if (r.kind === "stagger") { if (r.settleT > 0.85) { r.mode = "getup"; r.getupT = 0; } }
        else if (r.t > 3.2) { r.mode = "fade"; r.fadeT = 0; }
      }
    } else if (r.mode === "getup") {                            // punch knockdown: climb back to your feet
      r.getupT += dt;
      const T = 0.55, k = clamp(r.getupT / T, 0, 1), ease = 1 - Math.pow(1 - k, 2);
      r.rx *= (1 - ease); r.rz *= (1 - ease);
      const gy = groundY(r.x, r.z);
      r.y = gy + (r.y - gy) * (1 - ease);
      r.group.position.set(r.x, gy, r.z);
      r.group.rotation.set(r.rx, r.ry, r.rz);
      for (const k of RAG_LIMBS) r[k].rotation.x *= (1 - ease);
      if (k >= 1) {
        r.group.rotation.set(0, r.ry, 0);
        for (const k of RAG_LIMBS) r[k].rotation.x = 0;
        if (r.npc) {
          r.npc.ragdoll = null; r.npc.x = r.x; r.npc.z = r.z; r.npc.h = r.ry;
          if (r.npc.postFight === "fight") { r.npc.fighting = true; r.npc.flee = 0; r.npc.fightCD = 0.35; }
          else { r.npc.fighting = false; r.npc.flee = rrand(3, 5); r.npc.timer = 0.6; }
        }
        ragdolls.splice(i, 1);
      }
    } else if (r.mode === "fade") {                              // corpse: settle a beat, then sink away
      r.fadeT += dt;
      const T = 0.9, k = clamp(1 - r.fadeT / T, 0.001, 1);
      r.group.scale.setScalar(k);
      r.group.position.y = r.y - (1 - k) * 0.5;
      if (r.fadeT >= T) { scene.remove(r.group); ragdolls.splice(i, 1); }
    }
  }
}

