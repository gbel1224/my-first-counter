// Palm City — people. One rig with realistic proportions (7.5 heads tall, soft capsule limbs,
// real knees and elbows) shared by the player and the whole crowd. The crowd is drawn with ONE instanced mesh
// per body part, so hundreds of animated pedestrians cost about a dozen draw calls.
import * as THREE from "../vendor/three.module.js";
import { limb, paint, merge, place } from "./geo.js";
import { FACE, BEARD_KIND, IRIS, newFace, tickFace, faceMatrices } from "./face.js";
import { mulberry32, clamp, lerp, lerpAngle, N, ROAD, BLOCK, WALK, CELL, CURB, HALF, blockMin, roadC, groundY, district } from "./world.js";

// ---------------------------------------------------------------------------------------------
// rig dimensions (metres). Joint pivots are at the TOP of each limb segment.
export const RIG = {
  hipY: 0.97, hipW: 0.1, shoulderY: 0.53, shoulderW: 0.2,   // shoulder height is relative to the hips
  thigh: 0.46, shin: 0.46, upper: 0.3, fore: 0.27,
};
// part geometries, each painted WHITE where the instance colour (shirt / pants / skin / hair)
// should show through, and darker where it's a fixed shade (shoes, belt)
function buildParts() {
  const P = {};
  // torso: a tapered capsule, broader through the chest, flattened front-to-back; belt at the waist
  {
    const t = new THREE.CapsuleGeometry(0.165, 0.32, 4, 12);
    const tp = t.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) * (1.12 + Math.max(0, y) * 0.35)); tp.setZ(i, tp.getZ(i) * (0.66 + Math.max(0, y) * 0.12)); }
    t.computeVertexNormals(); t.translate(0, 0.29, 0);
    const g = paint(t, 0xffffff);
    const belt = paint(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14), 0x3a3a3a); belt.scale(1.1, 1, 0.68);
    P.torso = merge([g, belt]);
  }
  P.hips = merge([place(paint(new THREE.SphereGeometry(0.17, 12, 8), 0xffffff), 0, 0, 0, 0, 0, 0, 1.1, 0.62, 0.7)]);
  {
    // head: egg-shaped and life-sized; the eyes, brows and mouth are separate parts (face.js) so they can move
    const head = paint(new THREE.SphereGeometry(0.112, 22, 16), 0xffffff); head.scale(0.88, 1.14, 1.0); head.translate(0, 0.19, 0.005);
    const jaw = place(paint(new THREE.SphereGeometry(0.075, 16, 12), 0xffffff), 0, 0.122, 0.03, 0, 0, 0, 1.0, 0.8, 1.0);
    const neck = paint(new THREE.CylinderGeometry(0.048, 0.056, 0.13, 10), 0xe8e8e8); neck.translate(0, 0.05, 0);
    // the nose: a bridge, a rounded tip, the wings either side and two nostrils
    const bridge = place(paint(new THREE.CylinderGeometry(0.0075, 0.012, 0.04, 8), 0xf4f0f0), 0, 0.186, 0.109, -0.38, 0, 0, 1, 1, 0.8);
    const tip = place(paint(new THREE.SphereGeometry(0.0125, 10, 8), 0xf6f2f2), 0, 0.168, 0.12, 0, 0, 0, 1.05, 0.9, 0.95);
    const wings = [-1, 1].map(s => place(paint(new THREE.SphereGeometry(0.0085, 8, 6), 0xf0eaea), s * 0.0115, 0.165, 0.112, 0, 0, 0, 1, 0.85, 1));
    const nostrils = [-1, 1].map(s => place(paint(new THREE.SphereGeometry(0.0038, 6, 4), 0x4a3030), s * 0.0062, 0.1605, 0.1175, 0, 0, 0, 1.2, 0.6, 1));
    const ears = [-0.1, 0.1].map(x => place(paint(new THREE.SphereGeometry(0.025, 8, 6), 0xf0f0f0), x, 0.19, 0.0, 0, 0, 0, 0.55, 1, 1));
    P.head = merge([head, jaw, neck, bridge, tip, ...wings, ...nostrils, ...ears]);
  }
  {
    // short hair: a close cap over the top and back
    const h = new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    h.scale(0.92, 1.1, 1.06); h.rotateX(-0.36); h.translate(0, 0.205, -0.012);   // tipped back: the hairline sits above the brows
    P.hair = merge([paint(h, 0xffffff)]);
    // long hair: the cap plus a fall down the back to the shoulders
    const back = new THREE.CapsuleGeometry(0.1, 0.2, 3, 10); back.scale(1.05, 1, 0.55); back.translate(0, 0.1, -0.07);
    P.hairL = merge([paint(h.clone(), 0xffffff), paint(back, 0xffffff)]);
  }
  P.upper = merge([paint(limb(0.06, 0.05, RIG.upper, 10), 0xffffff)]);
  {
    const f = paint(limb(0.048, 0.038, RIG.fore, 10), 0xffffff);
    const hand = place(paint(new THREE.SphereGeometry(0.045, 10, 8), 0xf2f2f2), 0, -RIG.fore - 0.045, 0.0, 0, 0, 0, 0.7, 1.35, 0.95);
    P.fore = merge([f, hand]);
  }
  P.thigh = merge([paint(limb(0.085, 0.062, RIG.thigh, 10), 0xffffff)]);
  {
    const s = paint(limb(0.058, 0.042, RIG.shin, 10), 0xffffff);
    const shoe = new THREE.CapsuleGeometry(0.048, 0.16, 3, 8); shoe.rotateX(Math.PI / 2); shoe.scale(1.05, 0.72, 1);
    P.shin = merge([s, place(paint(shoe, 0x26262a), 0, -RIG.shin - 0.035, 0.05)]);
  }
  return P;
}
export const PARTS = buildParts();

// ---------------------------------------------------------------------------------------------
// looks
const SKIN = [0xe8bf9c, 0xd4a07a, 0xb57a52, 0x8a5a3a, 0x5e3a24, 0xf0d0b4, 0xc88e64, 0x9c6a48];
const HAIR = [0x16100c, 0x2a1c12, 0x4a3220, 0x6a4a2c, 0x9a7a52, 0x1a1a1a, 0x5a3a24, 0xa8a49c];
// real street clothing: lots of white, grey, black, navy, denim, olive, a few faded colours
const SHIRT = [0xe8e6e0, 0xd8d8d4, 0x2a2a2c, 0x1e2a44, 0x5a6a7a, 0x4a5236, 0x6a2a2a, 0xb8a888, 0x8a9aa8, 0xc88a7a, 0x3a5a6a, 0x9a8a6a, 0xf2f0ea, 0x505458];
const PANTS = [0x2a3a52, 0x3a4a66, 0x1e1e22, 0x5a5a5e, 0xa89a7a, 0x4a4a3a, 0x6a7a8a, 0x8a7a62, 0x303848];
export function randomLook(r) {
  const p = a => a[(r() * a.length) | 0];
  const look = { skin: p(SKIN), hair: p(HAIR), shirt: p(SHIRT), pants: p(PANTS), bald: r() < 0.1, long: r() < 0.35,
    sleeveless: r() < 0.18, shorts: r() < 0.3, h: 0.92 + r() * 0.14, bulk: 0.9 + r() * 0.22 };
  return finishLook(look);
}
// derived colours: bare arms for tank tops, bare shins for shorts
const _fc = new THREE.Color(), _fc2 = new THREE.Color();
export function finishLook(look) {
  look.armCol = look.sleeveless ? look.skin : look.shirt;
  look.shinCol = look.shorts ? look.skin : look.pants;
  // the face: a stable per-person hash picks eye colour, beard and everyday mood without disturbing any seeded rolls
  const hs = look.hs ?? (look.hs = Math.abs(Math.sin((look.h || 1) * 127.1 + (look.bulk || 1) * 311.7 + ((look.skin || 0) & 1023) * 0.731 + ((look.shirt || 0) & 511) * 0.193) * 43758.5453) % 1);
  if (look.iris === undefined) look.iris = IRIS[Math.floor(hs * 97) % IRIS.length];
  if (look.beard === undefined) look.beard = !look.long && hs < 0.42 ? ["full", "goatee", "mustache", "stubble", "full", "stubble"][Math.floor(hs * 1000) % 6] : null;
  if (look.mood === undefined) look.mood = ["neutral", "neutral", "happy", "annoyed", "neutral", "sad", "happy", "neutral", "smug"][Math.floor(hs * 7919) % 9];
  _fc.set(look.skin); _fc2.setRGB(_fc.r * 0.82, _fc.g * 0.55, _fc.b * 0.55); look.lipCol = _fc2.getHex();
  _fc2.set(look.hair).multiplyScalar(0.8); look.browCol = _fc2.getHex();
  const bc = look.beardCol ?? look.hair;
  if (look.beard === "stubble") { _fc2.set(bc); _fc2.lerp(_fc, 0.45); look.beardTint = _fc2.getHex(); } else look.beardTint = bc;
  return look;
}

// ---------------------------------------------------------------------------------------------
// gait: joint angles from a walk phase. amt 0 = standing, 1 = walking, 2 = sprinting.
export function gait(phase, amt, out, style) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const run = clamp(amt - 1, 0, 1), walk = clamp(amt, 0, 1);
  const stride = (style ? style.stride : 1) * (0.42 * walk + 0.28 * run);
  out.thighL = s * stride - run * 0.15;
  out.thighR = -s * stride - run * 0.15;
  // knees only ever flex: most bend as the leg swings through, extra on the run
  out.kneeL = (Math.max(0, -c) * (0.75 * walk + 0.7 * run) + 0.06) ;
  out.kneeR = (Math.max(0, c) * (0.75 * walk + 0.7 * run) + 0.06);
  const arm = (style ? style.arm : 1) * (0.38 * walk + 0.5 * run);
  out.armL = -s * arm; out.armR = s * arm;
  out.elbowL = -(0.25 + run * 0.9 + Math.max(0, s) * 0.2 * walk);
  out.elbowR = -(0.25 + run * 0.9 + Math.max(0, -s) * 0.2 * walk);
  out.lean = run * 0.2 + walk * 0.04;
  out.bob = (Math.abs(c) - 0.5) * (0.035 * walk + 0.05 * run);
  out.twist = s * 0.08 * walk;
  out.roll = s * 0.025 * walk;
  return out;
}

// Build a pose's world matrices for every part into `emit(partName, matrix)`.
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _s = new THREE.Matrix4();
const _hip = new THREE.Matrix4(), _torso = new THREE.Matrix4(), _j = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function rot(x, y, z) { return _r.makeRotationFromQuaternion(_q.setFromEuler(_e.set(x, y, z, "YXZ"))); }
export function poseMatrices(x, y, z, yaw, look, g, emit, extra) {
  const sc = look.h;
  // root: position, heading, overall height scale
  _hip.makeTranslation(x, y + (RIG.hipY + g.bob) * sc, z).multiply(rot(0, yaw, g.roll)).multiply(_s.makeScale(sc * look.bulk, sc, sc * look.bulk));
  if (extra && extra.tilt) _hip.multiply(rot(extra.tilt, 0, 0));
  emit("hips", _hip);
  _torso.copy(_hip).multiply(rot(g.lean, g.twist, 0));
  emit("torso", _torso);
  _j.copy(_torso).multiply(_t.makeTranslation(0, RIG.shoulderY + 0.07, 0)).multiply(rot(-g.lean * 0.6 + (extra && extra.headPitch || 0), -g.twist, 0));
  emit("head", _j);
  if (!look.bald) emit(look.long ? "hairL" : "hair", _j);
  for (const side of [-1, 1]) {
    const L = side < 0;
    // arms hang from the shoulders, swing opposite the legs, elbows bend
    _j.copy(_torso).multiply(_t.makeTranslation(side * RIG.shoulderW, RIG.shoulderY, 0)).multiply(rot(L ? g.armL : g.armR, 0, side * -0.09));
    emit(L ? "upperL" : "upperR", _j);
    _m.copy(_j).multiply(_t.makeTranslation(0, -RIG.upper, 0)).multiply(rot(L ? g.elbowL : g.elbowR, 0, 0));
    emit(L ? "foreL" : "foreR", _m);
    // legs
    _j.copy(_hip).multiply(_t.makeTranslation(side * RIG.hipW, -0.02, 0)).multiply(rot(L ? g.thighL : g.thighR, 0, 0));
    emit(L ? "thighL" : "thighR", _j);
    _m.copy(_j).multiply(_t.makeTranslation(0, -RIG.thigh, 0)).multiply(rot(L ? g.kneeL : g.kneeR, 0, 0));
    emit(L ? "shinL" : "shinR", _m);
  }
}
const PART_OF = { hips: "hips", torso: "torso", head: "head", hair: "hair", hairL: "hairL", upperL: "upper", upperR: "upper", foreL: "fore", foreR: "fore", thighL: "thigh", thighR: "thigh", shinL: "shin", shinR: "shin" };
const COLOR_OF = { hips: "pants", torso: "shirt", head: "skin", hair: "hair", hairL: "hair", upperL: "armCol", upperR: "armCol", foreL: "skin", foreR: "skin", thighL: "pants", thighR: "pants", shinL: "shinCol", shinR: "shinCol" };

// ---------------------------------------------------------------------------------------------
// a single character as a scene-graph Group (the player): same parts, own materials
export function makeCharacter(look) {
  finishLook(look);
  const group = new THREE.Group();
  const mats = {};
  const meshes = {};
  for (const k of Object.keys(PART_OF)) {
    const ck = COLOR_OF[k];
    const mat = mats[ck] || (mats[ck] = new THREE.MeshStandardMaterial({ vertexColors: true, color: look[ck], roughness: ck === "skin" ? 0.55 : 0.8 }));
    const m = new THREE.Mesh(PARTS[PART_OF[k]], mat);
    m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
    meshes[k] = m; group.add(m);
  }
  // the face: its own little meshes, placed on the head every frame
  const FMAT = {
    eyeW: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xf2eee6, roughness: 0.25 }),
    iris: new THREE.MeshStandardMaterial({ vertexColors: true, color: look.iris, roughness: 0.15 }),
    lid: mats.skin, mouth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }),
    brow: new THREE.MeshStandardMaterial({ vertexColors: true, color: look.browCol, roughness: 0.9 }),
    lip: new THREE.MeshStandardMaterial({ vertexColors: true, color: look.lipCol, roughness: 0.45 }),
    beard: new THREE.MeshStandardMaterial({ vertexColors: true, color: look.beardTint, roughness: 0.95 }),
  };
  const fm = {};
  const fmesh = (key, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; group.add(m); return m; };
  for (const k of ["eyeW", "iris", "lid", "brow"]) fm[k] = [fmesh(k, FACE[k], FMAT[k]), fmesh(k, FACE[k], FMAT[k])];
  fm.mouth = [fmesh("mouth", FACE.mouth, FMAT.mouth)];
  fm.lip = [0, 1, 2, 3].map(() => fmesh("lip", FACE.lip, FMAT.lip));
  for (const k of Object.values(BEARD_KIND)) { fm[k] = [fmesh(k, FACE[k], FMAT.beard)]; fm[k][0].castShadow = true; }
  const face = newFace(look.hs || Math.random());
  face.base = face.expr = look.mood || "neutral";
  let lastT = performance.now() / 1000;
  const putFace = (k, m, slot) => fm[k][slot].matrix.copy(m);
  const g = {};
  // accessories ride on the head / torso: hats, glasses, beards, jackets (see setAcc)
  const acc = {}, accOff = new THREE.Matrix4(), headM = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
  const pose = (x, y, z, yaw, phase, amt, extra) => {
    gait(phase, amt, g, null);
    if (extra && extra.override) Object.assign(g, extra.override);
    poseMatrices(x, y, z, yaw, look, g, (k, m) => { meshes[k].matrix.copy(m); if (k === "head") headM.copy(m); }, extra);
    for (const k in acc) if (acc[k].visible) acc[k].matrix.copy(headM);
    meshes.hair.visible = !look.bald && !look.long;
    meshes.hairL.visible = !look.bald && !!look.long;
    const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
    if (extra && extra.expr) face.expr = extra.expr;
    tickFace(face, dt, now);
    const bk = look.beard ? BEARD_KIND[look.beard] : null;
    for (const k of Object.values(BEARD_KIND)) fm[k][0].visible = k === bk;
    faceMatrices(headM, face, bk, putFace);
  };
  function setAcc(kind, spec) {
    if (kind === "beard") { look.beard = !spec || spec.none ? null : spec.type; look.beardCol = spec && spec.color; recolor(); return; }
    if (acc[kind]) { group.remove(acc[kind]); delete acc[kind]; }
    if (!spec || spec.none) return;
    const mat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: kind === "glasses" ? 0.15 : 0.7, metalness: kind === "glasses" ? 0.6 : 0 });
    let geo;
    if (kind === "hat") {
      if (spec.type === "cap") { const a = new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); a.translate(0, 0.25, 0); const b = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 16, 1, false, -Math.PI / 2, Math.PI); b.translate(0, 0.255, 0.07); geo = merge([paint(a, 0xffffff), paint(b, 0xffffff)]); }
      else if (spec.type === "beanie") { const a = new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); a.scale(1, 1.15, 1); a.translate(0, 0.22, 0); geo = merge([paint(a, 0xffffff)]); }
      else { const a = new THREE.CylinderGeometry(0.1, 0.11, spec.type === "tophat" ? 0.22 : 0.1, 16); a.translate(0, spec.type === "tophat" ? 0.39 : 0.33, 0); const b = new THREE.CylinderGeometry(0.2, 0.2, 0.015, 20); b.translate(0, 0.285, 0); geo = merge([paint(a, 0xffffff), paint(b, 0xffffff)]); }
    } else if (kind === "glasses") {
      const a = new THREE.BoxGeometry(0.075, 0.04, 0.01); a.translate(-0.042, 0.2, 0.11); const b = a.clone(); b.translate(0.084, 0, 0);
      const br = new THREE.BoxGeometry(0.2, 0.008, 0.008); br.translate(0, 0.21, 0.108);
      geo = merge([paint(a, 0xffffff), paint(b, 0xffffff), paint(br, 0x333333)]);
    }
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.castShadow = true;
    group.add(m); acc[kind] = m;
  }
  function recolor() {
    finishLook(look);
    for (const k of Object.keys(PART_OF)) meshes[k].material.color.set(look[COLOR_OF[k]]);
    FMAT.iris.color.set(look.iris); FMAT.brow.color.set(look.browCol); FMAT.lip.color.set(look.lipCol); FMAT.beard.color.set(look.beardTint);
  }
  return { group, pose, look, mats, setAcc, recolor, face };
}

// ---------------------------------------------------------------------------------------------
// the crowd: pedestrians walking the sidewalk ring of their block, now and then crossing to the
// next block at a crosswalk. Simulation is trivially cheap, so everyone moves all the time;
// only the nearest MAX are drawn.
const MAX = 420, FMAX = 72;
export class Crowd {
  constructor(scene, plan, count = 700) {
    const r = this.r = mulberry32(0xC20D);
    this.people = [];
    const blocks = plan.blocks.filter(b => b.kind !== "park" || r() < 0.5);
    for (let k = 0; k < count; k++) {
      const b = blocks[(r() * blocks.length) | 0];
      const look = randomLook(r);
      const inset = 1.4 + r() * 2.2;   // how far in from the kerb they walk
      const p = {
        bi: b.i, bj: b.j, inset, t: r() * 4, dir: r() < 0.5 ? 1 : -1,
        speed: 1.05 + r() * 0.55, look, phase: r() * 6.28, x: 0, z: 0, yaw: 0,
        style: { stride: 0.8 + r() * 0.4, arm: 0.6 + r() * 0.8 }, pause: 0, cross: null, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0,
      };
      if (b.kind === "plaza") p.plaza = true;
      this.place(p);
      this.people.push(p);
    }
    // beach walkers along the promenade
    for (let k = 0; k < 60; k++) {
      const look = randomLook(r);
      this.people.push({ beach: true, x: -HALF + r() * HALF * 2, z: HALF + 8 + r() * 26, yaw: r() * 6.28, speed: 0.8 + r() * 0.5, look,
        phase: r() * 6, style: { stride: 0.8 + r() * 0.3, arm: 0.6 + r() * 0.6 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0 });
    }
    // instanced meshes, one per part
    this.meshes = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    for (const k of Object.keys(PART_OF)) {
      const m = new THREE.InstancedMesh(PARTS[PART_OF[k]], mat, MAX);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      scene.add(m); this.meshes[k] = m;
    }
    this._g = {}; this._c = new THREE.Color(); this.near = [];
    // faces for the people close enough to see them: instanced too, a slot per eye / brow / lip
    const fmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const SLOTS = { eyeW: 2, iris: 2, lid: 2, brow: 2, mouth: 1, lip: 4 };
    for (const k of Object.values(BEARD_KIND)) SLOTS[k] = 1;
    this.fm = {};
    for (const [k, n] of Object.entries(SLOTS)) {
      const m = new THREE.InstancedMesh(FACE[k], fmat, FMAX * n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FMAX * n * 3), 3);
      m.frustumCulled = false; m.count = 0; m.castShadow = k.startsWith("beard"); scene.add(m); this.fm[k] = m;
    }
    this._heads = Array.from({ length: MAX }, () => new THREE.Matrix4());
    this._ft = performance.now() / 1000;
  }
  // a person's face state (made on first use)
  faceOf(p) {
    if (!p.face) {
      if (p.look.lipCol === undefined || p.look.iris === undefined) finishLook(p.look);
      if (p.gang || p.goon || p.crew) p.look.mood = p.look.hs > 0.5 ? "smug" : "annoyed";   // crews don't smile at strangers
      p.face = newFace(p.look.hs || Math.random()); p.face.base = p.face.expr = p.look.mood || "neutral";
    }
    return p.face;
  }
  // what the situation forces onto someone's face, if anything
  exprFor(p) {
    if (p.knocked > 0) return p.dead ? "out" : "pain";
    if (p.fightT > 0 || p.anger >= 2) return "mad";
    if ((p.gang || p.goon || p.crew) && (p.amt || 0) > 1.2) return "mad";
    if (p.fear > 0) {
      const since = (p.fearMax || 6) - p.fear;
      if (since < 0.9) return p.look.hs > 0.75 ? "surprised" : "shocked";
      return p.persona === "tough" || p.look.hs > 0.92 ? "mad" : "scared";
    }
    return null;
  }
  // position on the block ring: t in [0,4) goes round the four sides
  ringPos(p, t) {
    const x0 = blockMin(p.bi) + p.inset, z0 = blockMin(p.bj) + p.inset, L = BLOCK - p.inset * 2;
    const side = Math.floor(((t % 4) + 4) % 4), f = (((t % 4) + 4) % 4) - side;
    if (side === 0) return [x0 + f * L, z0, 0];
    if (side === 1) return [x0 + L, z0 + f * L, 1];
    if (side === 2) return [x0 + L - f * L, z0 + L, 2];
    return [x0, z0 + L - f * L, 3];
  }
  place(p) { const [x, z] = this.ringPos(p, p.t); p.x = x; p.z = z; }
  // somebody drifted out of range: bring them back on a block 2-3 blocks from the action, so the
  // streets around the player are always busy without simulating a whole city of people
  respawnNear(p, fx, fz) {
    const r = this.r;
    const fi = Math.round((fx + HALF - ROAD - BLOCK / 2) / CELL), fj = Math.round((fz + HALF - ROAD - BLOCK / 2) / CELL);
    for (let tries = 0; tries < 6; tries++) {
      const di = ((r() * 7) | 0) - 3, dj = ((r() * 7) | 0) - 3;
      if (Math.max(Math.abs(di), Math.abs(dj)) < 2) continue;
      const bi = fi + di, bj = fj + dj;
      if (bi < 0 || bj < 0 || bi >= N || bj >= N) continue;
      p.bi = bi; p.bj = bj; p.t = r() * 4; p.cross = null; p.pause = 0; p.knocked = 0; p.y = 0;
      this.place(p); return;
    }
  }
  update(dt, time, fx, fz, hazards) {
    const r = this.r;
    for (const p of this.people) {
      if (p.hidden) continue;
      if (!p.beach && !p.gang && (p.x - fx) ** 2 + (p.z - fz) ** 2 > 200 * 200) { this.respawnNear(p, fx, fz); continue; }
      if (p.knocked > 0) {                        // sent flying by a car: tumble, lie there, get up
        p.knocked -= dt;
        if (p.y > 0 || p.vy > 0) { p.vy -= 22 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.max(0, p.y + p.vy * dt); p.spin += dt * 9; if (p.y === 0) { p.vx *= 0.3; p.vz *= 0.3; } }
        if (p.knocked <= 0) {
          p.y = 0; p.spin = 0;
          if (p.dead) { p.dead = false; if (p.gang) { if (p.onRespawn) p.onRespawn(p); } else if (!p.beach) this.respawnNear(p, fx, fz); }   // the body is gone; someone new walks the city
          else if (!p.beach && !p.gang) this.snapToRing(p);
        }
        continue;
      }
      if (p.ai) { p.ai(p, dt); continue; }
      if (p.pause > 0) { p.pause -= dt; continue; }
      // flee anything fast coming at them
      if (p.fear > 0) p.fear -= dt;
      let fleeing = p.fear > 0;
      for (const h of hazards) {
        const dx = p.x - h.x, dz = p.z - h.z, d2 = dx * dx + dz * dz;
        if (h.speed > 4 && d2 < 2.2) {             // hit!
          const sp = Math.min(h.speed, 30), d = Math.sqrt(d2) || 1;
          p.knocked = 4 + r() * 2; p.vx = (dx / d) * sp * 0.35 + h.vx * 0.5; p.vz = (dz / d) * sp * 0.35 + h.vz * 0.5; p.vy = 3 + sp * 0.18; p.y = 0.01;
          if (h.onHit) h.onHit(p, sp);
          fleeing = true; break;
        }
        if (h.speed > 6 && d2 < 50) { fleeing = true; }
      }
      if (p.knocked > 0) continue;
      const sp = p.speed * (fleeing ? 2.4 : 1);
      p.amt = fleeing ? 2 : 1;
      if (p.beach) {
        p.yaw += (r() - 0.5) * dt * 0.8;
        p.x += Math.sin(p.yaw) * sp * dt; p.z += Math.cos(p.yaw) * sp * dt;
        if (p.z < HALF + 6 || p.z > HALF + 38) p.yaw = p.z < HALF + 6 ? 0 : Math.PI;
        if (Math.abs(p.x) > HALF - 5) p.yaw = p.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (r() < dt * 0.05) p.pause = 2 + r() * 5;
      } else if (p.cross) {
        // walking across the road to the next block
        const c = p.cross; c.t += sp * dt / c.len;
        p.x = lerp(c.x0, c.x1, c.t); p.z = lerp(c.z0, c.z1, c.t);
        p.yaw = Math.atan2(c.x1 - c.x0, c.z1 - c.z0);
        if (c.t >= 1) { p.bi = c.bi; p.bj = c.bj; p.t = c.tt; p.cross = null; this.place(p); }
      } else {
        const L = BLOCK - p.inset * 2;
        const pt = p.t;
        p.t += p.dir * sp * dt / L;
        const [x, z] = this.ringPos(p, p.t);
        const dx = x - p.x, dz = z - p.z;
        if (dx * dx + dz * dz > 1e-6) p.yaw = lerpAngle(p.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
        p.x = x; p.z = z;
        // at a corner, sometimes cross to the neighbouring block
        if (Math.floor(pt) !== Math.floor(p.t) && r() < 0.35) this.startCross(p);
        else if (r() < dt * 0.02) p.pause = 1 + r() * 4;
      }
      p.phase += sp * dt * (p.amt > 1.5 ? 3.2 : 2.6) / Math.max(0.9, p.look.h);
    }
  }
  // knock someone down (a punch, a bullet, a blast). dead: they don't get up
  knock(p, vx, vy, vz, dead) {
    if (dead && !p.dead && p.onDeath) p.onDeath(p);
    p.knocked = dead ? 22 : 3.5 + this.r() * 2; p.dead = !!dead;
    p.vx = vx; p.vy = vy; p.vz = vz; p.y = Math.max(0.01, p.y || 0); p.cross = null; p.pause = 0;
  }
  // gunfire, explosions: everyone nearby bolts
  scare(x, z, r, t = 6) {
    for (const p of this.people) if (!p.gang && p.knocked <= 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) { if (!(p.fear > 0)) p.fearMax = t; p.fear = Math.max(p.fear || 0, t); }
  }
  // the nearest standing person matching a filter
  nearest(x, z, maxD, filter) {
    let best = null, bd = maxD * maxD;
    for (const p of this.people) {
      if (p.knocked > 0 || p.hidden) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd && (!filter || filter(p, d))) { bd = d; best = p; }
    }
    return best;
  }
  snapToRing(p) {
    // after a knock-down, rejoin the nearest point of their ring
    const x0 = blockMin(p.bi), z0 = blockMin(p.bj);
    p.x = clamp(p.x, x0 + 1, x0 + BLOCK - 1); p.z = clamp(p.z, z0 + 1, z0 + BLOCK - 1);
    p.inset = clamp(Math.min(p.x - x0, x0 + BLOCK - p.x, p.z - z0, z0 + BLOCK - p.z), 1.2, 3.8);
    const L = BLOCK - p.inset * 2, lx = p.x - x0 - p.inset, lz = p.z - z0 - p.inset;
    const dT = [Math.abs(lz), Math.abs(lx - L), Math.abs(lz - L), Math.abs(lx)];
    const side = dT.indexOf(Math.min(...dT));
    p.t = side + clamp(side === 0 ? lx / L : side === 1 ? lz / L : side === 2 ? 1 - lx / L : 1 - lz / L, 0, 0.999);
    this.place(p);
  }
  startCross(p) {
    const corner = Math.floor(((p.t % 4) + 4) % 4);   // which corner we're at (side start)
    // corners: 0 = NW, 1 = NE, 2 = SE, 3 = SW  (side k starts at corner k)
    const cx = [0, 1, 1, 0][corner], cz = [0, 0, 1, 1][corner];
    // cross either east/west or north/south from this corner
    const ew = this.r() < 0.5;
    const ni = p.bi + (ew ? (cx ? 1 : -1) : 0), nj = p.bj + (ew ? 0 : (cz ? 1 : -1));
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return;
    const [x0, z0] = this.ringPos(p, corner);
    const x1 = ew ? x0 + (cx ? 1 : -1) * (ROAD + p.inset * 2) : x0;
    const z1 = ew ? z0 : z0 + (cz ? 1 : -1) * (ROAD + p.inset * 2);
    // the matching corner on the new block's ring
    const nc = ew ? [1, 0, 3, 2][corner] : [3, 2, 1, 0][corner];
    p.cross = { x0, z0, x1, z1, len: Math.hypot(x1 - x0, z1 - z0), t: 0, bi: ni, bj: nj, tt: nc + 0.001 };
  }
  // fill the instance buffers with the nearest people
  render(fx, fz, camera) {
    const near = this.near; near.length = 0;
    for (const p of this.people) {
      if (p.hidden) continue;
      const dx = p.x - fx, dz = p.z - fz, d2 = dx * dx + dz * dz;
      if (d2 < 150 * 150) { p._d2 = d2; near.push(p); }
    }
    if (near.length > MAX) { near.sort((a, b) => a._d2 - b._d2); near.length = MAX; }
    let i = 0;
    const c = this._c, M = this.meshes, g = this._g;
    const heads = this._heads;
    const put = (k, m) => { M[k].setMatrixAt(i, m); if (k === "head") heads[i].copy(m); };
    for (const p of near) {
      gait(p.phase, p.pause > 0 || p.knocked > 0 ? 0 : (p.amt || 1), g, p.style);
      const y = groundY(p.x, p.z) + (p.y || 0);
      let extra = null;
      if (p.knocked > 0) {
        // tumbling in the air, then flat on the ground
        const lying = p.y <= 0.01;
        extra = { tilt: lying ? -1.45 : p.spin };
        Object.assign(g, { thighL: 0.3, thighR: -0.2, kneeL: 0.4, kneeR: 0.2, armL: -2.4, armR: 2.2, elbowL: -0.3, elbowR: -0.3, lean: 0, bob: lying ? -0.72 : 0 });
      }
      poseMatrices(p.x, y, p.z, p.yaw, p.look, g, put, extra);
      for (const k in M) {
        const col = p.look[COLOR_OF[k]];
        c.set(col); M[k].setColorAt(i, c);
      }
      _m.makeScale(0, 0, 0);                              // hide whichever hair part this person doesn't wear
      if (p.look.bald || p.look.long) M.hair.setMatrixAt(i, _m);
      if (p.look.bald || !p.look.long) M.hairL.setMatrixAt(i, _m);
      i++;
    }
    for (const k in M) { M[k].count = i; M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
    this.renderFaces(near, i);
  }
  renderFaces(near, n) {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - this._ft); this._ft = now;
    const FM = this.fm, cnt = {}, c = this._c;
    for (const k in FM) cnt[k] = 0;
    // the nearest few dozen people within talking distance get a face
    const idx = [];
    for (let j = 0; j < n; j++) if (near[j]._d2 < 32 * 32) idx.push(j);
    if (idx.length > FMAX) { idx.sort((a, b) => near[a]._d2 - near[b]._d2); idx.length = FMAX; }
    for (const j of idx) {
      const p = near[j], L = p.look, f = this.faceOf(p);
      f.base = L.mood || "neutral";
      const auto = this.exprFor(p);
      if (auto) { f.expr = auto; f.hold = 0.35; }
      tickFace(f, dt, now);
      const bk = L.beard ? BEARD_KIND[L.beard] : null;
      faceMatrices(this._heads[j], f, bk, (k, m) => {
        const mesh = FM[k], at = cnt[k]++;
        mesh.setMatrixAt(at, m);
        c.set(k === "eyeW" ? 0xf2eee6 : k === "iris" ? L.iris : k === "lid" ? L.skin : k === "brow" ? L.browCol : k === "lip" ? L.lipCol : k === "mouth" ? 0xffffff : L.beardTint);
        mesh.setColorAt(at, c);
      });
    }
    for (const k in FM) { FM[k].count = cnt[k]; FM[k].instanceMatrix.needsUpdate = true; FM[k].instanceColor.needsUpdate = true; }
  }
}
