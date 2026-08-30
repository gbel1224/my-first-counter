// Palm City — heists: the set-piece score, and the one job that puts the new police AI to work.
//
// Everything a heist needs already existed in the game separately — armed robbery, getaway timers,
// wanted escalation, hireable muscle — but nothing ever composed them into a single run with a
// payout riding on it. A heist is that composition: case the place, put a getaway car on the corner,
// crack it while the alarm screams, then disappear. The last stage is the point: you are paid extra
// for arriving at the drop with the police having genuinely LOST you, which only means something now
// that losing them is a skill rather than a stopwatch.
//
// Self-contained in the established module style: own PRNG (never the seeded world stream), own
// meshes, and it imports nothing from game.js — the host injects what it needs via initHeists().
import * as THREE from "./vendor/three.module.js";
import { mulberry32, clamp, dist2, HALF } from "./util.js";
import { AudioSys } from "./audio.js";

const hrng = mulberry32(0x4EA57C0D);
const hr = (a, b) => a + hrng() * (b - a);

let scene = null, deps = null;
let h = null;              // the active heist, or null
let markA = null;          // objective beacon

// approach shapes the whole run: how loud the alarm is, how long the vault takes, what it pays
const APPROACHES = {
  loud:  { label: "Loud",  stars: 4, grabNeed: 7,  base: 9000,  crew: 1800, tag: "🔫" },
  quiet: { label: "Quiet", stars: 2, grabNeed: 12, base: 6000,  crew: 900,  tag: "🤫" },
};

function makeBeacon(color) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  col.position.y = 13; g.add(col);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 3.0, 26),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.14; g.add(ring);
  g.userData = { col, ring };
  g.visible = false; scene.add(g);
  return g;
}
function place(x, z) { markA.visible = true; markA.position.set(x, 0, z); }

// a staging corner / drop-off, out on the streets a fair way from a given point
function spotNear(x, z, minD, maxD) {
  const a = hrng() * Math.PI * 2, d = minD + hrng() * (maxD - minD);
  return [clamp(x + Math.cos(a) * d, -HALF + 30, HALF - 30),
          clamp(z + Math.sin(a) * d, -HALF + 30, HALF - 30)];
}

export function initHeists(sceneRef, d) {
  scene = sceneRef; deps = d;
  markA = makeBeacon(0xff5bd0);
}

export function startHeist(approach) {
  if (h) { deps.toast("You're already on a job — finish this one first"); return false; }
  if (!deps.canStart()) { deps.toast("Not now"); return false; }
  const targets = deps.targets();
  if (!targets || !targets.length) { deps.toast("No scores available right now"); return false; }
  const F = deps.focus();
  // prefer somewhere worth driving to, not whatever you happen to be standing on
  const far = targets.filter(t => dist2(t.x, t.z, F.x, F.z) > 120 * 120);
  const pool = far.length ? far : targets;
  const t = pool[(hrng() * pool.length) | 0];
  const A = APPROACHES[approach] || APPROACHES.loud;
  h = {
    approach, A, name: t.name, tx: t.x, tz: t.z,
    stage: "case", t: 0, loot: 0, alarm: false,
    base: Math.round(A.base * hr(0.85, 1.2)),
  };
  place(t.x, t.z);
  deps.toast(A.tag + " HEIST — case " + t.name + " first");
  AudioSys.play("blip", 0.8); deps.buzz([0, 30, 40, 60]);
  return true;
}

export function abortHeist(msg) {
  if (!h) return;
  if (msg) deps.toast(msg);
  h = null; if (markA) markA.visible = false;
}

function payout() {
  const A = h.A;
  const gross = Math.round(h.base * h.loot);
  // The whole reason the escape stage exists: you are paid for getting CLEAN away, which means
  // arriving with the force having actually lost your trail — not merely having outrun them.
  const clean = deps.wanted() === 0 || deps.copSearching();
  const bonus = clean ? Math.round(gross * 0.45) : 0;
  const crew = Math.min(gross, A.crew);
  const net = Math.max(0, gross + bonus - crew);
  const got = deps.earn(net);
  deps.toast("💰 SCORE — " + h.name + "  +$" + got + (clean ? "  (clean getaway +$" + bonus + ")" : ""));
  if (clean) deps.toast("🕶️ Vanished before they ever found you.");
  AudioSys.play("cash", 1.0); deps.buzz([0, 60, 40, 120]); deps.addShake(0.25);
  deps.burst(h.tx, 0.6, h.tz, 22, 2.0, 2.4, 0.8, 1.0, 0.85, 0.35);
  deps.save();
  h = null; markA.visible = false;
}

export function updateHeists(dt, simTime) {
  if (markA && markA.visible) {                       // pulse the marker
    const p = 0.5 + Math.sin(simTime * 4) * 0.5;
    markA.userData.col.material.opacity = 0.24 + p * 0.2;
    markA.userData.ring.scale.setScalar(1 + p * 0.45);
    markA.userData.ring.material.opacity = 0.7 - p * 0.4;
  }
  if (!h) return;
  const F = deps.focus();
  const near = F.driving ? 46 : 18;                   // squared reach

  if (h.stage === "case") {
    if (dist2(F.x, F.z, h.tx, h.tz) < near) {
      const [sx, sz] = spotNear(h.tx, h.tz, 70, 130);
      h.stage = "wheels"; h.sx = sx; h.sz = sz;
      place(sx, sz);
      deps.toast("🚗 Cased it — now park a getaway car on the corner");
      AudioSys.play("blip", 0.6); deps.buzz(20);
    }
  } else if (h.stage === "wheels") {
    if (dist2(F.x, F.z, h.sx, h.sz) < 46) {
      if (!F.driving) { if (!h.warned) { h.warned = true; deps.toast("🚗 Bring a CAR here — you can't haul a score on foot"); } }
      else {
        h.stage = "grab"; place(h.tx, h.tz);
        deps.toast(h.A.tag + " Wheels staged — go take it");
        AudioSys.play("blip", 0.6); deps.buzz(20);
      }
    }
  } else if (h.stage === "grab") {
    const atVault = dist2(F.x, F.z, h.tx, h.tz) < near;
    if (!h.alarm && atVault) {                        // the moment you're inside, the alarm goes
      h.alarm = true;
      deps.addHeat(h.A.stars);
      deps.toast("🚨 ALARM — grab what you can!");
      AudioSys.play("blip", 1.0); deps.addShake(0.3); deps.buzz([0, 80, 50, 80]);
    }
    if (h.alarm) {
      if (atVault) {
        h.t += dt;
        h.loot = clamp(h.t / h.A.grabNeed, 0, 1);
        if (h.loot >= 1) {
          const [dx2, dz2] = spotNear(h.tx, h.tz, 220, 330);
          h.stage = "escape"; h.sx = dx2; h.sz = dz2; place(dx2, dz2);
          deps.toast("🏃 Bags full — get to the drop and LOSE them");
          AudioSys.play("blip", 0.7); deps.buzz(30);
        }
      } else if (h.loot > 0.12) {                     // walked out early: you keep what you bagged
        const [dx2, dz2] = spotNear(h.tx, h.tz, 220, 330);
        h.stage = "escape"; h.sx = dx2; h.sz = dz2; place(dx2, dz2);
        deps.toast("🏃 Out early with " + Math.round(h.loot * 100) + "% — get to the drop!");
      }
    }
  } else {                                            // escape
    if (dist2(F.x, F.z, h.sx, h.sz) < 60) payout();
  }
}

// fold the run into the game's objective marker / minimap / HUD, same as any mission step
export function heistObjective() {
  if (!h) return null;
  const T = "🏦 HEIST · " + h.name;
  if (h.stage === "case") return { title: T, text: "Case the place · " + h.A.label, x: h.tx, z: h.tz };
  if (h.stage === "wheels") return { title: T, text: "Park a getaway car here", x: h.sx, z: h.sz };
  if (h.stage === "grab") return h.alarm
    ? { title: T, text: "Grabbing… " + Math.round(h.loot * 100) + "%  (stay put)", x: h.tx, z: h.tz }
    : { title: T, text: "Break in and take it", x: h.tx, z: h.tz };
  return { title: T, text: "GET TO THE DROP · " + Math.round(h.loot * 100) + "% bagged", x: h.sx, z: h.sz };
}
export function heistActive() { return !!h; }
export const _debug = {
  get: () => h,
  start: a => startHeist(a),
  approaches: () => Object.keys(APPROACHES),
};
