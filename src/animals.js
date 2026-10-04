// Palm City — the animals. Pigeons work the plaza, the parks and the busier pavements, pecking and
// shuffling about, and burst into the air when you come running (or a gun goes off), circling off
// over the roofs and drifting back later. Gulls wheel over the beach on their long wings and stand
// about on the sand. Dogs go out with some of the walkers, on a leash, trotting alongside, stopping
// to sniff. Everything is instanced: the wings flap, heads peck, legs trot and tails wag in the
// vertex shader, so a flock of fifty costs one draw call.
import * as THREE from "../vendor/three.module.js";
import { paint, place, merge } from "./geo.js";
import { groundY, HALF, BLOCK, WALK, CURB, PLAZA, blockC, mulberry32 } from "./world.js";

// ---------------------------------------------------------------------------------------------
// geometry: a bird with body, head, beak, tail and two wings (aWing = side, aSpan = 0 at the shoulder
// to 1 at the tip, aHead marks the head); a dog with body, head, ears, four legs (aLeg 1-4, pivot at
// the top) and a tail (aLeg 5)
// ---------------------------------------------------------------------------------------------
function tagged(g, wing, span, head) {
  const n = g.attributes.position.count;
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(new Float32Array(n).fill(wing), 1));
  g.setAttribute("aSpan", new THREE.Float32BufferAttribute(span ? Array.from({ length: n }, (_, i) => span(g, i)) : new Float32Array(n), 1));
  g.setAttribute("aHead", new THREE.Float32BufferAttribute(new Float32Array(n).fill(head), 1));
  return g;
}
function mergeAttrs(list, names) {
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    let total = 0; for (const g of list) total += g.attributes[nm].array.length;
    const arr = new Float32Array(total); let off = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, list[0].attributes[nm].itemSize));
  }
  out.computeBoundingSphere();
  return out;
}
function birdGeometry(c, span, chord) {
  const parts = [];
  parts.push(tagged(place(paint(new THREE.SphereGeometry(1, 8, 5), c.body), 0, 0, 0, 0, 0, 0, 0.11, 0.1, 0.21), 0, 0, 0));
  parts.push(tagged(place(paint(new THREE.SphereGeometry(1, 6, 4), c.belly), 0, -0.03, 0.03, 0, 0, 0, 0.095, 0.075, 0.16), 0, 0, 0));
  parts.push(tagged(place(paint(new THREE.SphereGeometry(0.065, 6, 5), c.head), 0, 0.09, 0.17), 0, 0, 1));
  parts.push(tagged(place(paint(new THREE.SphereGeometry(0.06, 6, 4), c.neck), 0, 0.05, 0.12), 0, 0, 0.5));
  parts.push(tagged(place(paint(new THREE.ConeGeometry(0.018, 0.07, 5), c.beak), 0, 0.085, 0.25, Math.PI / 2, 0, 0), 0, 0, 1));
  for (const s of [-1, 1]) parts.push(tagged(place(paint(new THREE.SphereGeometry(0.012, 4, 3), 0x101010), s * 0.045, 0.1, 0.2), 0, 0, 1));
  parts.push(tagged(place(paint(new THREE.BoxGeometry(0.12, 0.015, 0.14), c.tail), 0, 0.01, -0.24, -0.15, 0, 0), 0, 0, 0));
  for (const s of [-1, 1]) {
    // the wing: an inner panel and a tip, swept back toward the tip
    const g = new THREE.BufferGeometry(), x0 = s * 0.06, P = [], C = [];
    const ci = new THREE.Color(c.wing), ct = new THREE.Color(c.tip);
    const pts = [[x0, 0.07, 0.07], [x0 + s * span * 0.55, 0.075, 0.03], [x0 + s * span * 0.55, 0.075, -chord * 0.85], [x0, 0.07, -chord * 0.6],
                 [x0 + s * span, 0.07, -0.02], [x0 + s * span, 0.07, -chord * 0.55]];
    const tri = (a, b, d, col) => { for (const k of [a, b, d]) { P.push(...pts[k]); C.push(col.r, col.g, col.b); } };
    tri(0, 1, 2, ci); tri(0, 2, 3, ci); tri(1, 4, 5, ct); tri(1, 5, 2, ct);
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
    g.setAttribute("aEmit", new THREE.Float32BufferAttribute(new Float32Array(P.length / 3), 1));
    g.computeVertexNormals();
    parts.push(tagged(g, s, (gg, i) => Math.abs(gg.attributes.position.getX(i) - x0) / span, 0));
  }
  return mergeAttrs(parts, ["position", "normal", "color", "aWing", "aSpan", "aHead"]);
}
function dogGeometry() {
  // a medium dog (a lab / mutt) about 0.6 m at the shoulder before scaling: deep chest, tucked belly,
  // a proper neck and head with a muzzle, floppy ears, jointed legs with paws, a tail carried up
  const parts = [], W = 0xffffff, D = 0x16110d, T = 0xd8c8b8;
  const t = (g, leg, pivotY) => { const n = g.attributes.position.count; g.setAttribute("aLeg", new THREE.Float32BufferAttribute(new Float32Array(n).fill(leg), 1)); g.setAttribute("aPiv", new THREE.Float32BufferAttribute(new Float32Array(n).fill(pivotY), 1)); return g; };
  const sph = (r, x, y, z, sx, sy, sz, c = W, leg = 0, piv = 0, rx = 0) => parts.push(t(place(paint(new THREE.SphereGeometry(1, 10, 7), c), x, y, z, rx, 0, 0, r * sx, r * sy, r * sz), leg, piv));
  sph(1, 0, 0.5, 0.1, 0.15, 0.165, 0.28);                  // chest
  sph(1, 0, 0.53, -0.1, 0.135, 0.135, 0.3);                // loin, tucking up
  sph(1, 0, 0.535, -0.24, 0.14, 0.14, 0.17);               // haunch
  sph(1, 0, 0.66, 0.33, 0.08, 0.11, 0.09, W, 6, 0, -0.6);    // neck
  sph(1, 0, 0.76, 0.42, 0.095, 0.09, 0.11, W, 6);           // skull
  sph(1, 0, 0.72, 0.53, 0.055, 0.05, 0.08, W, 6);           // muzzle
  sph(1, 0, 0.705, 0.6, 0.026, 0.022, 0.02, D, 6);          // nose
  for (const s of [-1, 1]) {
    sph(1, s * 0.05, 0.78, 0.5, 0.014, 0.014, 0.01, D, 6);                                               // eyes
    parts.push(t(place(paint(new THREE.SphereGeometry(1, 8, 6), W), s * 0.085, 0.73, 0.4, 0, 0, s * 0.3, 0.025, 0.075, 0.045), 6, 0));   // floppy ears
  }
  // legs: upper and lower, a paw; fronts straight, hinds angled at the hock
  const legs = [[-0.075, 0.2, 1, 0], [0.075, 0.2, 2, 0], [-0.08, -0.28, 3, 1], [0.08, -0.28, 4, 1]];
  for (const [x, z, k, hind] of legs) {
    parts.push(t(place(paint(new THREE.CylinderGeometry(0.042, 0.032, 0.24, 8), W), x, 0.36, z + (hind ? -0.02 : 0), hind ? 0.25 : 0, 0, 0), k, 0.48));
    parts.push(t(place(paint(new THREE.CylinderGeometry(0.027, 0.022, 0.22, 8), W), x, 0.13, z + (hind ? -0.04 : 0), hind ? -0.2 : 0, 0, 0), k, 0.48));
    parts.push(t(place(paint(new THREE.SphereGeometry(1, 8, 6), W), x, 0.025, z + 0.02, 0, 0, 0, 0.032, 0.022, 0.045), k, 0.48));
  }
  parts.push(t(place(paint(new THREE.CylinderGeometry(0.022, 0.01, 0.3, 6), W), 0, 0.64, -0.44, -0.75, 0, 0), 5, 0));                     // tail
  parts.push(t(place(paint(new THREE.TorusGeometry(0.075, 0.012, 5, 12), 0xc02a2a), 0, 0.66, 0.33, 1.0, 0, 0), 6, 0));                    // collar
  parts.push(t(place(paint(new THREE.SphereGeometry(1, 8, 6), T), 0, 0.42, 0.1, 0, 0, 0, 0.1, 0.06, 0.16), 0, 0));                         // pale belly
  return mergeAttrs(parts, ["position", "normal", "color", "aLeg", "aPiv"]);
}
function birdMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aWing, aSpan, aHead; attribute vec4 aState;")
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        float flapA = aState.x * sin(aState.y) * 1.1 - aState.x * 0.15;
        if (aWing != 0.0) { float a = flapA * aWing; objectNormal = vec3(objectNormal.x * cos(a) - objectNormal.y * sin(a), objectNormal.x * sin(a) + objectNormal.y * cos(a), objectNormal.z); }`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        if (aWing != 0.0) {
          // folded on the ground (aState.z): the wing tucks back along the body
          float x0 = aWing * 0.06, dx = transformed.x - x0;
          dx *= mix(1.0, 0.2, aState.z); transformed.z -= aState.z * aSpan * 0.08;
          float a = flapA * aWing * (1.0 - aState.z);
          transformed.x = x0 + dx * cos(a); transformed.y += dx * sin(a) * aWing;
          transformed.y += sin(a) * 0.0;
        }
        transformed += vec3(0.0, -0.07, 0.04) * aState.w * aHead;      // peck`);
  };
  m.customProgramCacheKey = () => "bird";
  return m;
}
function dogMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aLeg, aPiv; attribute vec3 aDog;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          float ph = aDog.x, amp = aDog.y;
          if (aLeg > 0.5 && aLeg < 4.5) {
            // trot: diagonal pairs together; swing about the hip / shoulder
            float off = (aLeg < 1.5 || aLeg > 3.5) ? 0.0 : 3.14159;
            float a = sin(ph + off) * amp * 0.45, d = aPiv - transformed.y;
            transformed.z += sin(a) * d; transformed.y = aPiv - cos(a) * d;
          } else if (aLeg > 4.5 && aLeg < 5.5) {
            transformed.x += sin(ph * 2.3 + aDog.z) * 0.1 * (0.4 + aDog.z) * clamp(-0.4 - transformed.z, 0.0, 0.4) * 4.0;     // wag (faster when happy)
          } else if (aLeg > 5.5) {
            transformed.y += sin(ph * 2.0) * 0.012 * amp - aDog.z * 0.0;                                          // head bob
          }
          transformed.y += abs(sin(ph)) * 0.025 * amp;
        }`);
  };
  m.customProgramCacheKey = () => "dog";
  return m;
}

const PIGEON = { body: 0x7c8088, belly: 0x8a8e96, head: 0x5a6070, neck: 0x4a7a6a, beak: 0x3a3030, tail: 0x3a3c42, wing: 0x8c9098, tip: 0x2a2c30 };
const GULL = { body: 0xf2f2ee, belly: 0xffffff, head: 0xf8f8f4, neck: 0xf2f2ee, beak: 0xe8b830, tail: 0xf0f0ec, wing: 0xa8b0b8, tip: 0x1a1a1c };
const DOG_COLS = [0xc89a5a, 0x2a2420, 0x8a5a32, 0xe8e0d0, 0x6a6a6a, 0xd8b070, 0x4a3020];

export function makeAnimals(scene, plan, U) {
  const r = mulberry32(0xB1D5);
  // ---- where they live ----
  const pigeonSpots = [];
  const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; pigeonSpots.push([px + Math.cos(a) * 12, pz + Math.sin(a) * 12, 3.5]); }
  for (const pk of plan.parks || []) { pigeonSpots.push([pk.cx + 3, pk.cz - 3, 2.5]); pigeonSpots.push([pk.cx - 16, pk.cz + 2, 2.5]); }
  for (let k = 0; k < 8; k++) { const b = plan.blocks[(r() * plan.blocks.length) | 0]; if (b.kind === "suburb") continue; pigeonSpots.push([b.x0 + 2.4 + r() * (BLOCK - 5), b.z0 + 2.2, 2]); }
  for (let k = 0; k < 3; k++) pigeonSpots.push([-HALF + 100 + r() * (HALF * 2 - 200), HALF + 9, 3]);
  const birds = [];
  const flocks = pigeonSpots.map(([x, z, rad]) => {
    const f = { x, z, rad, kind: "pigeon", cd: 0, members: [] };
    const n = 5 + ((r() * 8) | 0);
    for (let k = 0; k < n; k++) f.members.push(birds[birds.push({ f, kind: "pigeon", x: x + (r() - 0.5) * rad * 2, z: z + (r() - 0.5) * rad * 2, y: 0, yaw: r() * 6.28, st: "ground", t: r() * 3, vx: 0, vy: 0, vz: 0, flap: 0, ph: r() * 6, peck: 0, sc: 0.75 + r() * 0.15 }) - 1]);
    return f;
  });
  // gulls: standing groups on the sand, and wheeling flocks over the beach (and one over the plaza)
  for (let k = 0; k < 4; k++) {
    const x = -HALF + 150 + k * (HALF * 2 - 300) / 3 + (r() - 0.5) * 60, z = HALF + 26 + r() * 12;
    const f = { x, z, rad: 4, kind: "gull", cd: 0, members: [] };
    for (let m = 0; m < 5 + ((r() * 4) | 0); m++) f.members.push(birds[birds.push({ f, kind: "gull", x: x + (r() - 0.5) * 8, z: z + (r() - 0.5) * 8, y: 0, yaw: r() * 6.28, st: "ground", t: r() * 3, vx: 0, vy: 0, vz: 0, flap: 0, ph: r() * 6, peck: 0, sc: 1.45 + r() * 0.2 }) - 1]);
    flocks.push(f);
  }
  const circles = [];
  for (let k = 0; k < 5; k++) {
    const over = k === 4;
    const c = { x: over ? px : -HALF + 120 + r() * (HALF * 2 - 240), z: over ? pz : HALF + 30 + r() * 30, R: 25 + r() * 35, h: over ? 45 : 14 + r() * 18, w: (0.12 + r() * 0.12) * (r() < 0.5 ? 1 : -1) };
    for (let m = 0; m < (over ? 4 : 6 + ((r() * 5) | 0)); m++) birds.push({ circ: c, kind: "gull", a: r() * 6.28, rr: c.R * (0.7 + r() * 0.6), hh: c.h + (r() - 0.5) * 8, st: "circle", x: 0, y: 0, z: 0, yaw: 0, flap: 0, ph: r() * 6, peck: 0, sc: 1.45 + r() * 0.2, burst: 0 });
  }
  // ---- meshes ----
  const MAXB = 360;
  const mk = (geo, mat, max) => {
    const st = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); st.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(mat === dogMat ? "aDog" : "aState", mat === dogMat ? new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3) : st);
    const m = new THREE.InstancedMesh(geo, mat, max); m.frustumCulled = false; m.castShadow = mat === dogMat; m.count = 0;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    scene.add(m); return m;
  };
  const bMat = birdMaterial(U), dogMat = dogMaterial();
  const pigeons = mk(birdGeometry(PIGEON, 0.33, 0.15), bMat, MAXB);
  const gulls = mk(birdGeometry(GULL, 0.48, 0.13), bMat, 160);
  const dogs = mk(dogGeometry(), dogMat, 60);
  const leashGeo = new THREE.BufferGeometry(); leashGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(60 * 6 * 3), 3));
  const leash = new THREE.LineSegments(leashGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a })); leash.frustumCulled = false; scene.add(leash);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const scares = [];
  function scare(x, z, rad) { scares.push([x, z, rad]); }

  function takeOff(f, fx, fz) {
    for (const b of f.members) {
      if (b.st !== "ground") continue;
      let ax = b.x - fx, az = b.z - fz; const d = Math.hypot(ax, az) || 1; ax /= d; az /= d;
      const sp = b.kind === "gull" ? 5 : 6.5;
      b.st = "fly"; b.t = 0; b.vx = (ax + (r() - 0.5) * 0.8) * sp; b.vz = (az + (r() - 0.5) * 0.8) * sp; b.vy = 3 + r() * 2.5; b.flap = 1;
    }
    f.cd = 25 + r() * 25;
    if (api.onTakeOff) api.onTakeOff(f);
  }
  function update(dt, time, ctx) {
    const { px: PX, pz: PZ, pspeed, cars } = ctx;
    // flocks on the ground: who's coming?
    for (const f of flocks) {
      if (f.cd > 0) {
        f.cd -= dt;
        // come back down once things are quiet and you're not standing in the middle of them
        if (f.cd <= 0) { if ((PX - f.x) ** 2 + (PZ - f.z) ** 2 < 25 * 25) f.cd = 5; else for (const b of f.members) if (b.st !== "ground") { b.st = "land"; b.t = 0; } }
        continue;
      }
      const d2 = (PX - f.x) ** 2 + (PZ - f.z) ** 2, lim = f.rad + (pspeed > 3 ? 6 : 2.5);
      let go = d2 < lim * lim && (pspeed > 0.3 || d2 < (f.rad + 1) ** 2);
      for (const c of cars) if (!go && c.speed > 2 && (c.x - f.x) ** 2 + (c.z - f.z) ** 2 < (f.rad + 8) ** 2) go = true;
      for (const [x, z, rad] of scares) if ((x - f.x) ** 2 + (z - f.z) ** 2 < rad * rad) go = true;
      if (go) takeOff(f, PX, PZ);
    }
    scares.length = 0;
    for (const b of birds) {
      b.ph += dt * (b.kind === "gull" ? 7 : 16) * (b.flap > 0.2 ? 1 : 0.2);
      if (b.st === "circle") {
        // wheeling: mostly gliding, now and then a few beats of the wings; banked into the turn
        const c = b.circ;
        b.a += c.w * dt * (c.R / b.rr);
        b.x = c.x + Math.cos(b.a) * b.rr; b.z = c.z + Math.sin(b.a) * b.rr; b.y = b.hh + Math.sin(time * 0.3 + b.rr) * 2;
        b.yaw = Math.atan2(-Math.sin(b.a) * Math.sign(c.w), Math.cos(b.a) * Math.sign(c.w)) ;
        b.burst -= dt; if (b.burst < -3 - r() * 6) b.burst = 1.2;
        b.flap = b.burst > 0 ? 0.9 : 0.08; b.bank = -0.35 * Math.sign(c.w);
        continue;
      }
      const gy = groundY(b.x, b.z);
      if (b.st === "ground") {
        // shuffle about, peck, pause
        b.t -= dt; b.flap = 0;
        if (b.t <= 0) { b.t = 0.6 + r() * 2.5; b.walk = r() < 0.5 ? 0.25 + r() * 0.3 : 0; b.yaw += (r() - 0.5) * 2; }
        if (b.walk) {
          b.x += Math.sin(b.yaw) * b.walk * dt; b.z += Math.cos(b.yaw) * b.walk * dt;
          if ((b.x - b.f.x) ** 2 + (b.z - b.f.z) ** 2 > b.f.rad * b.f.rad) b.yaw = Math.atan2(b.f.x - b.x, b.f.z - b.z);
        }
        b.peck = b.walk ? Math.max(0, Math.sin(time * 9 + b.ph * 3)) * 0.4 : Math.max(0, Math.sin(time * 6 + b.ph)) ** 4;
        b.y = gy;
      } else if (b.st === "fly") {
        // up and away over the roofs, beating hard at first, then gone until things quiet down
        b.t += dt; b.peck = 0;
        b.vy = Math.max(b.vy - dt * 0.6, 1.2);
        b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
        b.yaw = Math.atan2(b.vx, b.vz); b.flap = b.t < 1.5 ? 1 : 0.6;
        if (b.y > gy + 40) b.st = "gone";
      } else if (b.st === "land") {
        // glide back in to the spot, wings out, and settle
        b.t += dt;
        if (b.t < 0.05) { const a = r() * 6.28; b.x = b.f.x + Math.cos(a) * 25; b.z = b.f.z + Math.sin(a) * 25; b.y = groundY(b.f.x, b.f.z) + 12; b.tx = b.f.x + (r() - 0.5) * b.f.rad * 2; b.tz = b.f.z + (r() - 0.5) * b.f.rad * 2; }
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        const sp = Math.min(6, d * 1.2 + 0.5);
        b.x += dx / (d || 1) * sp * dt; b.z += dz / (d || 1) * sp * dt; b.y += (groundY(b.x, b.z) - b.y) * Math.min(1, dt * 1.6);
        b.yaw = Math.atan2(dx, dz); b.flap = d < 2 ? 0.8 : 0.25;
        if (d < 0.15 && b.y - groundY(b.x, b.z) < 0.1) { b.st = "ground"; b.t = r(); b.y = groundY(b.x, b.z); }
      }
    }
    // dogs: trotting along beside their walkers
    for (const p of ctx.people) {
      const D = p.dog; if (!D || p.hidden) continue;
      if (D.x === undefined) { D.x = p.x + 1; D.z = p.z; D.yaw = p.yaw; D.ph = r() * 6; D.sniff = 0; }
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx;
      let tx = p.x + rx * 0.95 - fx * 0.3, tz = p.z + rz * 0.95 - fz * 0.3;
      if (p.sit) { tx = p.x + rx * 0.9 + fx * 0.6; tz = p.z + rz * 0.9 + fz * 0.6; }
      D.sniff -= dt; if (D.sniff < -6 - r() * 8) D.sniff = 1.5 + r() * 2;                // stop to sniff something
      const dx = tx - D.x, dz = tz - D.z, d = Math.hypot(dx, dz);
      const want = D.sniff > 0 && d < 2.2 ? 0 : Math.min(d * 2.2, 3.5 + (p.amt > 1.5 ? 4 : 0));
      D.v = (D.v || 0) + (want - (D.v || 0)) * Math.min(1, dt * 5);
      if (d > 0.05 && D.v > 0.05) { D.x += dx / d * D.v * dt; D.z += dz / d * D.v * dt; D.yaw = Math.atan2(dx, dz); }
      if (d > 6) { D.x = tx; D.z = tz; }
      D.ph += dt * (4 + D.v * 4.5) / D.size;
      D.amp = Math.min(1, D.v / 1.5);
    }
  }
  function render(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    let np = 0, ng = 0;
    const sp = pigeons.geometry.attributes.aState, sg = gulls.geometry.attributes.aState;
    for (const b of birds) {
      if (b.st === "gone") continue;
      if ((b.x - cx) ** 2 + (b.z - cz) ** 2 > 260 * 260) continue;
      const M = b.kind === "gull" ? gulls : pigeons, S = b.kind === "gull" ? sg : sp, i = b.kind === "gull" ? ng++ : np++;
      if (i >= M.instanceMatrix.count) continue;
      const pitch = b.st === "fly" ? -0.35 : b.st === "ground" ? 0 : -0.1;
      _m.compose(_p.set(b.x, b.y + (b.st === "ground" ? 0.13 * b.sc : 0), b.z), _q.setFromEuler(_e.set(pitch, b.yaw, b.bank || 0, "YXZ")), _s.setScalar(b.sc));
      M.setMatrixAt(i, _m);
      S.setXYZW(i, b.flap, b.ph, b.st === "ground" ? 1 : 0, b.peck);
      if (b.kind === "pigeon") { _c.setScalar(b.sc > 0.86 ? 1.2 : b.sc < 0.78 ? 0.75 : 1); M.setColorAt(i, _c); }
    }
    pigeons.count = Math.min(np, MAXB); gulls.count = Math.min(ng, 160);
    for (const M of [pigeons, gulls]) { M.instanceMatrix.needsUpdate = true; M.geometry.attributes.aState.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; }
    // dogs and their leashes
    let nd = 0; const sd = dogs.geometry.attributes.aDog, lp = leashGeo.attributes.position.array; let nl = 0;
    for (const p of ctx2.people) {
      const D = p.dog; if (!D || D.x === undefined || p.hidden) continue;
      if ((D.x - cx) ** 2 + (D.z - cz) ** 2 > 90 * 90 || nd >= 60) continue;
      const y = groundY(D.x, D.z);
      _m.compose(_p.set(D.x, y, D.z), _q.setFromEuler(_e.set(0, D.yaw, 0)), _s.setScalar(D.size));
      dogs.setMatrixAt(nd, _m); _c.set(D.color); dogs.setColorAt(nd, _c);
      sd.setXYZ(nd, D.ph, D.amp, p.sit ? 0.2 : 0.8);
      // the leash: from the walker's hand, sagging, to the collar
      if (!p.sit && nl < 60) {
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), h = p.look.h;
        const ax = p.x + fz * 0.3 + fx * 0.15, ay = groundY(p.x, p.z) + 0.85 * h, az = p.z - fx * 0.3 + fz * 0.15;
        const bx = D.x + Math.sin(D.yaw) * 0.3 * D.size, by = y + 0.64 * D.size, bz = D.z + Math.cos(D.yaw) * 0.3 * D.size;
        const seg = 6, o = nl * seg * 6;
        for (let k = 0; k < seg; k++) for (const [j, t] of [[0, k / seg], [1, (k + 1) / seg]]) {
          const sag = Math.sin(t * Math.PI) * 0.18;
          lp[o + k * 6 + j * 3] = ax + (bx - ax) * t; lp[o + k * 6 + j * 3 + 1] = ay + (by - ay) * t - sag; lp[o + k * 6 + j * 3 + 2] = az + (bz - az) * t;
        }
        nl++;
      }
      nd++;
    }
    dogs.count = nd; dogs.instanceMatrix.needsUpdate = true; sd.needsUpdate = true; dogs.instanceColor.needsUpdate = true;
    leashGeo.setDrawRange(0, nl * 12); leashGeo.attributes.position.needsUpdate = true;
  }
  const ctx2 = { people: [] };
  const api = {
    scare, render,
    update(dt, time, ctx) { ctx2.people = ctx.people; update(dt, time, ctx); },
    giveDog(p, rr = Math.random) { p.dog = { size: [0.55, 0.7, 0.85, 1.0][(rr() * 4) | 0], color: DOG_COLS[(rr() * DOG_COLS.length) | 0] }; },
    counts: () => ({ birds: birds.length, flocks: flocks.length }), flocks,
  };
  return api;
}
