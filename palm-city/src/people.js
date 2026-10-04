// Palm City — people. One rig with realistic proportions (7.5 heads tall, soft capsule limbs,
// real knees and elbows) shared by the player and the whole crowd. The crowd is drawn with ONE instanced mesh
// per body part, so hundreds of animated pedestrians cost about a dozen draw calls.
import * as THREE from "../vendor/three.module.js";
import { inView } from "./cull.js";
import { limb, paint, merge, place } from "./geo.js";
import { FACE, BEARD_KIND, IRIS, FACE_COLOR, FACE_MAT, HAIRSTYLES, faceMaterials, newFace, tickFace, faceMatrices, pickStyle, faceVariation, patch as patchFace, cardMaterial, BEARD_CARDS } from "./face.js";
import { humansReady, makeHuman, modelFor, tint as tintHuman, HumanPool } from "./human.js";
import { makeVatCrowd, vatReady } from "./crowdvat.js";
import { BODY, BODY_SLOTS, BODY_COLOR, BODY_MAT, bodyPieces, clothMaterial, SHOES } from "./body.js";
const BODY_PARTS = ["torso", "hips", "upperL", "upperR", "foreL", "foreR", "thighL", "thighR", "shinL", "shinR"];
// every detailed piece a rig part might wear, whatever the look
const PIECES_OF = { torso: ["torsoM", "torsoF"], hips: ["hipsM", "hipsF"], upperL: ["upperSkin", "upperCloth", "sleeve"], upperR: ["upperSkin", "upperCloth", "sleeve"],
  foreL: ["foreSkin", "foreCloth", "handL"], foreR: ["foreSkin", "foreCloth", "handR"], thighL: ["thigh"], thighR: ["thigh"], shinL: ["shinSkin", "shinCloth", "shoe", "sole"], shinR: ["shinSkin", "shinCloth", "shoe", "sole"] };
const bodyCol = (k, look) => { const c = BODY_COLOR[k]; return typeof c === "string" ? look[c] : c; };
const FACE_SLOTS = { headHi: 1, nose: 1, eyeW: 2, iris: 2, glint: 2, lid: 2, lidLow: 2, browR: 1, browL: 1, mouth: 1, teethU: 1, teethL: 1, lipUR: 1, lipUL: 1, lipLR: 1, lipLL: 1, beardFull: 1, beardGoatee: 1, beardMus: 1, beardStubble: 1 };
for (const st of HAIRSTYLES) { FACE_SLOTS["hair_" + st] = 1; if (FACE["hairc_" + st]) FACE_SLOTS["hairc_" + st] = 1; }
for (const k of Object.values(BEARD_CARDS)) FACE_SLOTS[k] = 1;
const CARD_PARTS = Object.keys(FACE_SLOTS).filter(k => k.startsWith("hairc_") || k.startsWith("beardc"));
const hairPart = look => look.bald || !look.hairStyle ? null : "hair_" + look.hairStyle;
const faceCol = (k, look) => { const c = FACE_COLOR[k]; return typeof c === "string" ? look[c] : c; };
import { walkState } from "./traffic.js";
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
    const t = new THREE.CapsuleGeometry(0.165, 0.32, 3, 9);
    const tp = t.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) * (1.12 + Math.max(0, y) * 0.35)); tp.setZ(i, tp.getZ(i) * (0.66 + Math.max(0, y) * 0.12)); }
    t.computeVertexNormals(); t.translate(0, 0.29, 0);
    const g = paint(t, 0xffffff);
    const belt = paint(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 9), 0x3a3a3a); belt.scale(1.1, 1, 0.68);
    P.torso = merge([g, belt]);
  }
  P.hips = merge([place(paint(new THREE.SphereGeometry(0.17, 9, 6), 0xffffff), 0, 0, 0, 0, 0, 0, 1.1, 0.62, 0.7)]);
  {
    // head: egg-shaped and life-sized; the eyes, brows and mouth are separate parts (face.js) so they can move
    const head = paint(new THREE.SphereGeometry(0.112, 12, 9), 0xffffff); head.scale(0.88, 1.14, 1.0); head.translate(0, 0.19, 0.005);
    const jaw = place(paint(new THREE.SphereGeometry(0.072, 8, 6), 0xffffff), 0, 0.124, 0.028, 0, 0, 0, 0.98, 0.82, 1.0);
    const neck = paint(new THREE.CylinderGeometry(0.048, 0.056, 0.13, 7), 0xe8e8e8); neck.translate(0, 0.05, 0);
    // the nose: a bridge, a rounded tip, the wings either side and two nostrils
    const bridge = place(paint(new THREE.CylinderGeometry(0.0075, 0.012, 0.04, 4), 0xf4f0f0), 0, 0.186, 0.109, -0.38, 0, 0, 1, 1, 0.8);
    const tip = place(paint(new THREE.SphereGeometry(0.0125, 5, 4), 0xf6f2f2), 0, 0.168, 0.12, 0, 0, 0, 1.05, 0.9, 0.95);
    const wings = [-1, 1].map(s => place(paint(new THREE.SphereGeometry(0.0085, 4, 3), 0xf0eaea), s * 0.0115, 0.165, 0.112, 0, 0, 0, 1, 0.85, 1));
    const nostrils = [-1, 1].map(s => place(paint(new THREE.SphereGeometry(0.0038, 3, 2), 0x4a3030), s * 0.0062, 0.1605, 0.1175, 0, 0, 0, 1.2, 0.6, 1));
    const ears = [-0.1, 0.1].map(x => place(paint(new THREE.SphereGeometry(0.025, 5, 4), 0xf0f0f0), x, 0.19, 0.0, 0, 0, 0, 0.55, 1, 1));
    P.head = merge([head, jaw, neck, bridge, tip, ...wings, ...nostrils, ...ears]);
  }
  {
    // short hair: a close cap over the top and back
    const h = new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
    h.scale(0.92, 1.1, 1.06); h.rotateX(-0.36); h.translate(0, 0.205, -0.012);   // tipped back: the hairline sits above the brows
    P.hair = merge([paint(h, 0xffffff)]);
    // long hair: the cap plus a fall down the back to the shoulders
    const back = new THREE.CapsuleGeometry(0.1, 0.2, 2, 7); back.scale(1.05, 1, 0.55); back.translate(0, 0.1, -0.07);
    P.hairL = merge([paint(h.clone(), 0xffffff), paint(back, 0xffffff)]);
  }
  P.upper = merge([paint(limb(0.06, 0.05, RIG.upper, 7), 0xffffff)]);
  {
    const f = paint(limb(0.048, 0.038, RIG.fore, 7), 0xffffff);
    const hand = place(paint(new THREE.SphereGeometry(0.045, 6, 5), 0xf2f2f2), 0, -RIG.fore - 0.045, 0.0, 0, 0, 0, 0.7, 1.35, 0.95);
    P.fore = merge([f, hand]);
  }
  P.thigh = merge([paint(limb(0.085, 0.062, RIG.thigh, 7), 0xffffff)]);
  {
    const s = paint(limb(0.058, 0.042, RIG.shin, 7), 0xffffff);
    const shoe = new THREE.CapsuleGeometry(0.048, 0.16, 2, 6); shoe.rotateX(Math.PI / 2); shoe.scale(1.05, 0.72, 1);
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
  // the hairstyle has to suit the look (a long-haired look keeps long styles, short keeps short)
  if (look.hairStyle === undefined || (look.hairStyle && !look.bald && (look.long ? !["long", "bob", "bun", "pony", "afro"].includes(look.hairStyle) : ["long", "bob", "bun", "pony"].includes(look.hairStyle)))) look.hairStyle = pickStyle(look, hs);
  if (look.bald) look.hairStyle = null; else if (!look.hairStyle) look.hairStyle = look.long ? "long" : "crop";
  if (!look.fv) look.fv = faceVariation(hs, !!look.long);
  // clothes: T-shirt sleeves (short, long, or none for a tank top), and sneakers
  if (look.sleeves === undefined || (look.sleeveless && look.sleeves !== "none")) look.sleeves = look.sleeveless ? "none" : ((hs * 5113) % 1) < 0.3 ? "long" : "short";
  if (look.shoeCol === undefined) look.shoeCol = SHOES[Math.floor(hs * 8191) % SHOES.length];
  // skin: how weathered, freckled, and (for clean-shaven men) shadowed with stubble
  if (look.age === undefined) look.age = ((hs * 3571) % 1) * 0.9 + 0.05;
  const lightSkin = new THREE.Color(look.skin).getHSL({}).l > 0.6;
  if (look.freckles === undefined) look.freckles = lightSkin && ((hs * 6971) % 1) < 0.35 ? 0.5 + ((hs * 911) % 1) * 0.5 : 0;
  look.stubble = !look.long && !look.beard ? 0.25 + ((hs * 2153) % 1) * 0.75 : 0;
  if (look.mood === undefined) look.mood = ["neutral", "neutral", "happy", "annoyed", "neutral", "sad", "happy", "neutral", "smug"][Math.floor(hs * 7919) % 9];
  _fc.set(look.skin); _fc2.setRGB(_fc.r * 0.86, _fc.g * 0.64, _fc.b * 0.63); look.lipCol = _fc2.getHex();
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
  // the face: the sculpted head, hair, eyes, lids, brows, lips, teeth — each its own mesh, placed every frame
  const FMAT = faceMaterials(), fm = {}, fmats = {}, cardMove = { value: new THREE.Vector3() };
  let skinAttr = null;
  const setSkin = () => { if (skinAttr) { skinAttr.setXYZW(0, look.age || 0.3, look.freckles || 0, look.stubble || 0, (look.hs || 0.5) * 10); skinAttr.needsUpdate = true; } };
  let lastPos = null;
  for (const [k, n] of Object.entries(FACE_SLOTS)) {
    const cat = FACE_MAT[k];
    let mat;
    if (cat === "card" || cat === "curl") { mat = fmats[k] = cardMaterial(cat === "curl"); mat.userData.uMove = cardMove; }
    else { mat = fmats[k] = FMAT[cat].clone(); mat.userData = {}; if (cat === "skin" || cat === "skinD" || cat === "hair" || cat === "shell") patchFace(mat, cat === "shell" ? "hair" : cat); }
    mat.color.set(faceCol(k, look));
    fm[k] = [];
    for (let i = 0; i < n; i++) {
      let m;
      if (k === "headHi") { const g = FACE.headHi.clone(); g.setAttribute("aSkin", new THREE.InstancedBufferAttribute(new Float32Array(4), 4)); m = new THREE.InstancedMesh(g, mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); m.frustumCulled = false; skinAttr = g.attributes.aSkin; }
      else m = new THREE.Mesh(FACE[k], mat); m.matrixAutoUpdate = false; m.castShadow = k === "headHi" || k.startsWith("hair_") || (k.startsWith("beard") && !k.startsWith("beardc")); m.receiveShadow = cat === "skin"; group.add(m); fm[k].push(m); }
  }
  meshes.head.visible = false;
  setSkin();
  const face = newFace(look.hs || Math.random());
  face.base = face.expr = look.mood || "neutral";
  let lastT = performance.now() / 1000;
  const putFace = (k, m, slot) => { const mm = fm[k][slot]; mm.matrix.copy(m); mm.visible = true; };
  // the detailed body: every piece a part might wear, shown or hidden to suit the look
  const bmats = {}, bm = {};
  const bodyMat = k => {
    if (bmats[k]) return bmats[k];
    const cat = BODY_MAT[k];
    const m = cat === "skin" ? patchFace(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), "skin") : clothMaterial(cat);
    m.color.set(bodyCol(k, look)); return (bmats[k] = m);
  };
  for (const part of BODY_PARTS) {
    bm[part] = {};
    for (const k of PIECES_OF[part]) { const m = new THREE.Mesh(BODY[k], bodyMat(k)); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; group.add(m); bm[part][k] = m; }
    meshes[part].visible = false;
  }
  const g = {};
  // accessories ride on the head / torso: hats, glasses, beards, jackets (see setAcc)
  const acc = {}, accOff = new THREE.Matrix4(), headM = new THREE.Matrix4(), tmpM = new THREE.Matrix4();
  // the real person (human.js): once the models have loaded, it takes over from the built-up figure
  let human = null;
  const useHuman = () => {
    if (human || !humansReady()) return human;
    human = makeHuman(look); group.add(human.root);
    const accs = Object.values(acc); for (const ch of group.children) if (ch !== human.root && !accs.includes(ch)) ch.visible = false;
    return human;
  };
  const pose = (x, y, z, yaw, phase, amt, extra) => {
    gait(phase, amt, g, null);
    g.gripL = g.gripR = g.indexL = g.indexR = undefined; g.gun = null;
    if (extra && extra.override) Object.assign(g, extra.override);
    if (useHuman()) {
      const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
      if (extra && extra.expr) { face.expr = extra.expr; face.hold = Math.max(face.hold, 0.1); }
      tickFace(face, dt, now);
      human.drive(x, y, z, yaw, g, extra, face);
      const ks = Object.keys(acc);
      if (ks.length) { human.headMatrix(headM); for (const k of ks) acc[k].matrix.copy(headM); }
      return;
    }
    poseMatrices(x, y, z, yaw, look, g, (k, m) => {
      meshes[k].matrix.copy(m); if (k === "head") headM.copy(m);
      const pieces = bm[k];
      if (pieces) { const want = bodyPieces(k, look); for (const pk in pieces) { const mm = pieces[pk]; mm.visible = want.includes(pk); if (mm.visible) mm.matrix.copy(m); } }
    }, extra);
    for (const part of BODY_PARTS) meshes[part].visible = false;
    for (const k in acc) if (acc[k].visible) acc[k].matrix.copy(headM);
    meshes.hair.visible = false; meshes.hairL.visible = false; meshes.head.visible = false;
    const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
    if (extra && extra.expr) { face.expr = extra.expr; face.hold = Math.max(face.hold, 0.1); }
    tickFace(face, dt, now);
    const bk = look.beard ? BEARD_KIND[look.beard] : null;
    for (const k of [...HAIRSTYLES.map(h => "hair_" + h), ...Object.values(BEARD_KIND), ...CARD_PARTS]) fm[k][0].visible = false;
    // hair streams back as you move: the strand tips trail behind
    if (lastPos && dt > 0) { const vx = (x - lastPos.x) / dt, vz = (z - lastPos.z) / dt, sp = Math.hypot(vx, vz); const k = sp > 30 ? 0 : Math.min(1, sp / 8); cardMove.value.x += (-vx * 0.12 * k - cardMove.value.x) * Math.min(1, dt * 6); cardMove.value.z += (-vz * 0.12 * k - cardMove.value.z) * Math.min(1, dt * 6); cardMove.value.y = -Math.min(0.3, sp * 0.02) * k; }
    lastPos = lastPos || {}; lastPos.x = x; lastPos.z = z;
    faceMatrices(headM, face, { head: true, hair: hairPart(look), beard: bk, beardCards: look.beard ? BEARD_CARDS[look.beard] : null, fv: look.fv }, putFace);
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
      const a = new THREE.BoxGeometry(0.05, 0.03, 0.006); a.translate(-0.036, 0.204, 0.117); const b = a.clone(); b.translate(0.072, 0, 0);
      const br = new THREE.BoxGeometry(0.2, 0.006, 0.006); br.translate(0, 0.214, 0.112);
      geo = merge([paint(a, 0xffffff), paint(b, 0xffffff), paint(br, 0x333333)]);
    }
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.castShadow = true;
    group.add(m); acc[kind] = m;
  }
  function recolor() {
    finishLook(look);
    if (human) {
      // a new look may need a different person (long hair, a beard): swap the model
      if (modelFor(look) !== human.kind) { group.remove(human.root); human = null; useHuman(); }
      else tintHuman(human);
    }
    for (const k in bmats) bmats[k].color.set(bodyCol(k, look));
    for (const k of Object.keys(PART_OF)) meshes[k].material.color.set(look[COLOR_OF[k]]);
    for (const k in fmats) fmats[k].color.set(faceCol(k, look));
    setSkin();
  }
  return { group, pose, look, mats, setAcc, recolor, face, get human() { return human; } };
}

// ---------------------------------------------------------------------------------------------
// the crowd: pedestrians walking the sidewalk ring of their block, now and then crossing to the
// next block at a crosswalk. Simulation is trivially cheap, so everyone moves all the time;
// only the nearest MAX are drawn.
const MAX = 420, FMAX = 40;
export class Crowd {
  constructor(scene, plan, count = 700) {
    this._scene = scene;
    vatReady().then(() => { this._simpOK = true; });
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
    // the beach: sunbathers on towels (lying on their backs or fronts, some sitting up), swimmers out
    // past the break, people wading in the shallows, a volleyball game, people fishing off the pier
    {
      const rb = mulberry32(0xBEAC);
      const add = (o) => { const look = randomLook(rb); look.shorts = true; if (rb() < 0.6) look.sleeveless = true;
        const p = Object.assign({ beach: true, fixed: true, look, phase: rb() * 6.28, style: { stride: 0.9, arm: 0.8 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, speed: 1, yaw: rb() * 6.28 }, o);
        this.people.push(p); return p; };
      for (let k = 0; k < 46; k++) { const x = -HALF + 30 + rb() * (HALF * 2 - 60), z = HALF + 21 + rb() * 15; add({ x, z, lie: rb() < 0.7 ? (rb() < 0.6 ? "back" : "front") : "situp", yaw: Math.PI + (rb() - 0.5) * 0.6, towel: [0xd83a3a, 0x2a8ac8, 0xf2c230, 0x3ac87a, 0xf27aa8, 0xf2f0ea][(rb() * 6) | 0] }); }
      for (let k = 0; k < 18; k++) add({ swim: { x0: -380 + rb() * 760, z0: HALF + 66 + rb() * 18, r: 4 + rb() * 6, w: (0.1 + rb() * 0.15) * (rb() < 0.5 ? 1 : -1), a: rb() * 6.28 } });
      for (let k = 0; k < 14; k++) add({ wade: { x0: -400 + rb() * 800, z0: HALF + 46 + rb() * 6 } });
      for (const cx of [-80, 300]) for (let k = 0; k < 4; k++) add({ volley: { x: cx + (k % 2 ? 1.8 : -1.8), z: HALF + 26 + (k < 2 ? -3.2 : 3.2), side: k < 2 ? -1 : 1, k } });
      for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1; add({ fish: { x: -150 + s * 2.9, z: HALF + 50 + k * 14, s }, yaw: s * Math.PI / 2 }); }
    }
    // street life (its own random stream, so the walkers above stay where they were): vendors at
    // their carts, people stopped to chat in twos and threes, people on the city's benches, joggers
    const r2 = mulberry32(0x57EE7);
    const stand = (x, z, yaw, extra) => {
      const look = randomLook(r2);
      const p = Object.assign({ x, z, yaw, look, phase: r2() * 6.28, style: { stride: 0.8 + r2() * 0.4, arm: 0.6 + r2() * 0.8 }, pause: 0, cross: null, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0,
        speed: 1.05 + r2() * 0.5, dir: r2() < 0.5 ? 1 : -1, t: 0, inset: 2.5, bi: 0, bj: 0, fixed: true }, extra);
      this.people.push(p); return p;
    };
    for (const c of plan.carts || []) stand(c.x - Math.sin(c.yaw) * 0.95, c.z - Math.cos(c.yaw) * 0.95, c.yaw, { vendor: true });
    const walkBlocks = plan.blocks.filter(b => b.kind !== "suburb" && b.kind !== "park");
    for (let g = 0; g < 38; g++) {
      const b = walkBlocks[(r2() * walkBlocks.length) | 0], tmp = { bi: b.i, bj: b.j, inset: 2.0 + r2() * 1.2 };
      const [cx, cz] = this.ringPos(tmp, r2() * 4), n = r2() < 0.6 ? 2 : 3, a0 = r2() * 6.28;
      for (let k = 0; k < n; k++) {
        const a = a0 + k / n * Math.PI * 2, x = cx + Math.cos(a) * 0.55, z = cz + Math.sin(a) * 0.55;
        stand(x, z, Math.atan2(cx - x, cz - z), { chat: { k, n, g } });
      }
    }
    const inPark = (x, z) => (plan.parks || []).some(pk => Math.abs(x - pk.cx) < BLOCK / 2 && Math.abs(z - pk.cz) < BLOCK / 2);
    for (const [x, z, a] of plan.benches || []) {
      if (inPark(x, z) || r2() > 0.45) continue;
      const fx = -Math.sin(a), fz = -Math.cos(a);                       // a bench faces its local -z
      stand(x - fx * 0.05, z - fz * 0.05, Math.atan2(fx, fz), { sit: { x: x - fx * 0.05, z: z - fz * 0.05, yaw: Math.atan2(fx, fz) } });
    }
    for (const p of this.people) if (!p.beach && !p.fixed && r2() < 0.05) { p.jog = true; p.speed = 2.6 + r2() * 0.6; }

    // the parks: people walking and jogging the loop path, and people sitting on the benches
    for (const pk of plan.parks || []) {
      const mk = (extra) => {
        const look = randomLook(r);
        return Object.assign({ bi: pk.i, bj: pk.j, inset: BLOCK / 2 - 15 + (r() - 0.5) * 1.2, t: r() * 4, dir: r() < 0.5 ? 1 : -1, speed: 0.9 + r() * 0.4, look,
          phase: r() * 6.28, x: 0, z: 0, yaw: 0, style: { stride: 0.8 + r() * 0.4, arm: 0.6 + r() * 0.8 }, pause: 0, cross: null, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, park: true }, extra);
      };
      for (let k = 0; k < 12; k++) { const p = mk(k < 4 ? { jog: true, speed: 2.6 + r() * 0.6 } : {}); this.place(p); this.people.push(p); }
      for (const [x, z, yaw] of pk.sitters) { const p = mk({ sit: { x, z, yaw } }); p.x = x; p.z = z; p.yaw = yaw; this.people.push(p); }
    }
    // instanced meshes, one per part
    this.meshes = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    for (const k of Object.keys(PART_OF)) {
      const m = new THREE.InstancedMesh(PARTS[PART_OF[k]], mat, MAX);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      m.name = "low_" + k; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      scene.add(m); this.meshes[k] = m;
    }
    this._g = {}; this._c = new THREE.Color(); this.near = [];
    // faces for the people close enough to see them: a sculpted head and every face part, instanced
    const FMAT = faceMaterials();
    this.fm = {};
    for (const [k, n] of Object.entries(FACE_SLOTS)) {
      let geo = FACE[k];
      if (k === "headHi") { geo = FACE.headHi.clone(); geo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(new Float32Array(FMAX * 4), 4)); }
      const m = new THREE.InstancedMesh(geo, FMAT[FACE_MAT[k]], FMAX * n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FMAX * n * 3), 3);
      m.name = "face_" + k; m.frustumCulled = false; m.count = 0; m.castShadow = k === "headHi" || k.startsWith("hair_") || (k.startsWith("beard") && !k.startsWith("beardc")); m.receiveShadow = FACE_MAT[k] === "skin"; scene.add(m); this.fm[k] = m;
    }
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // detailed bodies for the same people
    const BM = { skin: patchFace(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), "skin"), cloth: clothMaterial("cloth"), denim: clothMaterial("denim"), rubber: clothMaterial("rubber") };
    this.bm = {};
    for (const [k, n] of Object.entries(BODY_SLOTS)) {
      const m = new THREE.InstancedMesh(BODY[k], BM[BODY_MAT[k]], FMAX * n);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FMAX * n * 3), 3);
      m.name = "body_" + k; m.frustumCulled = false; m.count = 0; m.castShadow = true; m.receiveShadow = true; scene.add(m); this.bm[k] = m;
    }
    this._pm = {}; for (const k of BODY_PARTS) this._pm[k] = Array.from({ length: MAX }, () => new THREE.Matrix4());
    this._heads = Array.from({ length: MAX }, () => new THREE.Matrix4());
    this._ft = performance.now() / 1000;
    // the nearest people are real models (human.js); fewer on phones
    const mobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
    this.pool = new HumanPool(scene, mobile ? 4 : 8);
    this._hg = {};
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
      if (!p.beach && !p.gang && !p.park && !p.fixed && (p.x - fx) ** 2 + (p.z - fz) ** 2 > 200 * 200) { this.respawnNear(p, fx, fz); continue; }
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
      // on a park bench: stay put, unless something gives them a fright — then up and off round the path
      if (p.sit) { if (!(p.fear > 0)) { p.amt = 0; p.x = p.sit.x; p.z = p.sit.z; p.yaw = p.sit.yaw; continue; } p.sit = null; if (p.park) p.t = r() * 4; else this.release(p); }
      // stopped at a cart or chatting: stay put (turning to face whoever's talking) unless spooked
      if (p.vendor || p.chat) { if (!(p.fear > 0)) { p.amt = 0; continue; } p.vendor = false; p.chat = null; this.release(p); }
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
      const sp = p.speed * (fleeing ? (p.jog ? 1.2 : 2.4) : 1);
      p.amt = fleeing ? 2 : p.jog ? 1.75 : 1;
      if (p.beach && p.fixed) {
        // beach people stay at what they're doing unless something sends them running up the sand
        if (p.fear > 0) { p.fixed = false; p.lie = p.swim = p.wade = p.volley = p.fish = null; p.yaw = 0; p.y = 0; p.z = Math.min(p.z, HALF + 36); continue; }
        p.amt = 0;
        const now = time;
        if (p.swim) { const S = p.swim; S.a += S.w * dt; p.x = S.x0 + Math.cos(S.a) * S.r; p.z = S.z0 + Math.sin(S.a) * S.r; p.yaw = Math.atan2(-Math.sin(S.a) * Math.sign(S.w), Math.cos(S.a) * Math.sign(S.w)); p.phase += dt * 3.5; }
        else if (p.wade) { const W = p.wade; W.t = (W.t || r() * 20) + dt; p.x = W.x0 + Math.sin(W.t * 0.07) * 6; p.z = W.z0 + Math.sin(W.t * 0.11) * 2; p.yaw = Math.atan2(Math.cos(W.t * 0.07) * 0.42, Math.cos(W.t * 0.11) * 0.22); p.amt = 0.55; p.phase += dt * 2.2; }
        else if (p.volley) { const V = p.volley, ph = now * 1.1 + V.k * 1.6; p.x = V.x + Math.sin(ph * 0.7) * 1.2; p.z = V.z + Math.sin(ph * 0.5) * 1.0 * V.side * 0.5; p.yaw = V.side > 0 ? Math.PI : 0; p.amt = Math.abs(Math.cos(ph * 0.7)) > 0.6 ? 1.2 : 0.2; p.phase += dt * 3; }
        else if (p.fish) { p.x = p.fish.x; p.z = p.fish.z; }
        continue;
      }
      if (p.beach) {
        p.yaw += (r() - 0.5) * dt * 0.8;
        p.x += Math.sin(p.yaw) * sp * dt; p.z += Math.cos(p.yaw) * sp * dt;
        if (p.z < HALF + 6 || p.z > HALF + 38) p.yaw = p.z < HALF + 6 ? 0 : Math.PI;
        if (Math.abs(p.x) > HALF - 5) p.yaw = p.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (r() < dt * 0.05) p.pause = 2 + r() * 5;
      } else if (p.cross) {
        // walking across the road to the next block
        const c = p.cross;
        // at the kerb: wait for the little white man (unless something's chasing them)
        if (c.wait) {
          c.waitT += dt;
          p.yaw = lerpAngle(p.yaw, Math.atan2(c.x1 - c.x0, c.z1 - c.z0), Math.min(1, dt * 6));
          if (walkState(c.si, c.sj, c.road) === 2 || fleeing || c.waitT > 40) c.wait = false;
          else { p.amt = 0; p.phase = 0; continue; }
        }
        c.t += sp * dt / c.len;
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
        if (Math.floor(pt) !== Math.floor(p.t) && r() < 0.35 && !p.park) this.startCross(p);
        else if (r() < dt * 0.02) p.pause = 1 + r() * 4;
      }
      p.phase += sp * dt * (p.amt > 1.5 ? 3.2 : 2.6) / Math.max(0.9, p.look.h);
    }
  }
  // someone who was standing or sitting about (fixed in place) joins the walkers on the nearest block ring
  release(p) {
    p.fixed = false;
    p.bi = clamp(Math.floor((p.x + HALF - ROAD) / CELL), 0, N - 1); p.bj = clamp(Math.floor((p.z + HALF - ROAD) / CELL), 0, N - 1);
    this.snapToRing(p);
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
    // the junction whose crosswalk this is, and the road being crossed
    const si = cx ? p.bi + 1 : p.bi, sj = cz ? p.bj + 1 : p.bj, road = ew ? "z" : "x";
    p.cross = { x0, z0, x1, z1, len: Math.hypot(x1 - x0, z1 - z0), t: 0, bi: ni, bj: nj, tt: nc + 0.001, si, sj, road, wait: walkState(si, sj, road) !== 2, waitT: 0 };
  }
  // a person's joint angles this frame
  poseOf(p, g) {
    gait(p.phase, p.pause > 0 || p.knocked > 0 || (p.cross && p.cross.wait) ? 0 : (p.amt || 1), g, p.style);
    g.gripL = g.gripR = g.indexL = g.indexR = undefined; g.gun = null;
    const y = groundY(p.x, p.z) + (p.y || 0);
    let extra = null;
    if (p.knocked <= 0) {
      if (p.fightT > 0) {
        // squared up: fists raised, a jab when they swing
        const t = Math.max(0, p.punchT || 0) / 0.26, ext = Math.sin(t * Math.PI);
        Object.assign(g, { armL: -0.9, elbowL: -1.9, armR: -0.85 - 0.7 * ext, elbowR: -2.0 + 1.8 * ext, twist: -0.25 * ext, gripL: 1, gripR: 1 });
      } else if (p.aimT > 0) {
        // shooting: gun arm out, the trigger finger pulls on each shot
        Object.assign(g, { armR: -1.45, elbowR: -0.1, armL: -1.2, elbowL: -0.5, gun: p.weapon || "pistol", gripR: 0.95, indexR: p.shotT > 0 ? 1 : 0.3, gripL: 0.6 });
      } else if (p.fear > 0 && p.amt > 1.5) { g.gripL = g.gripR = 0.6; }
      else if (p.phoneT > 0) Object.assign(g, { armR: -2.6, elbowR: -2.3, armL: -0.2 });                  // on the phone
      else if (p.workT > 0) Object.assign(g, { armL: -0.9 + Math.sin(p.workT * 2) * 0.15, armR: -1.0, elbowL: -0.8, elbowR: -0.7, lean: 0.25 });   // busy at the back of the van
    }
    if (p.beach && p.fixed && p.knocked <= 0) {
      const t = performance.now() / 1000, gy = groundY(p.x, p.z);
      if (p.lie) {
        if (p.lie === "situp") { Object.assign(g, { thighL: -1.35, thighR: -1.2, kneeL: 1.8, kneeR: 1.5, armL: 0.6, armR: 0.6, elbowL: -0.1, elbowR: -0.1, lean: -0.35, bob: 0, twist: 0, roll: 0 }); return { g, extra: null, y: gy + 0.03 - (RIG.hipY - 0.12) * p.look.h }; }
        Object.assign(g, { thighL: 0.05, thighR: -0.05, kneeL: p.lie === "back" ? 0.25 : 0.05, kneeR: 0.05, armL: p.lie === "back" ? -2.9 : -0.2, armR: p.lie === "back" ? -2.7 : -0.25, elbowL: p.lie === "back" ? -1.5 : -0.2, elbowR: -0.2, lean: 0, bob: 0, twist: 0, roll: 0 });
        return { g, extra: { tilt: p.lie === "back" ? -1.5 : 1.5 }, y: gy + 0.11 - RIG.hipY * p.look.h };
      }
      if (p.swim) {
        // freestyle: flat in the water, arms windmilling, a flutter kick; only head and shoulders show
        const s = p.phase;
        Object.assign(g, { armL: -3.1 * (0.5 + 0.5 * Math.sin(s)), armR: -3.1 * (0.5 + 0.5 * Math.sin(s + Math.PI)), elbowL: -0.3, elbowR: -0.3, thighL: Math.sin(s * 3) * 0.25, thighR: -Math.sin(s * 3) * 0.25, kneeL: 0.2, kneeR: 0.2, lean: 0, bob: 0, twist: Math.sin(s) * 0.25, roll: 0 });
        return { g, extra: { tilt: 1.35, headPitch: -0.9 }, y: -0.46 + 0.04 * Math.sin(t * 1.3 + p.phase) - RIG.hipY * p.look.h };
      }
      if (p.wade) return { g, extra: null, y: Math.max(gy, -0.45) };
      if (p.volley) { if (p.amt > 1 && Math.sin(t * 1.1 + p.volley.k * 1.6) > 0.8) Object.assign(g, { armL: -2.6, armR: -2.8, elbowL: -0.2, elbowR: -0.1 }); else Object.assign(g, { armL: -0.6, armR: -0.6, elbowL: -0.6, elbowR: -0.6, lean: 0.3, kneeL: 0.6, kneeR: 0.6, thighL: -0.4, thighR: -0.4 }); return { g, extra: null, y: gy }; }
      if (p.fish) { Object.assign(g, { armR: -1.3, armL: -1.0, elbowR: -0.6, elbowL: -0.9, gripL: 1, gripR: 1, lean: 0.05 }); return { g, extra: null, y: 2.44 }; }
    }
    if ((p.vendor || p.chat) && p.knocked <= 0) {
      const t = performance.now() / 1000;
      if (p.vendor) Object.assign(g, { armL: -0.75, armR: -0.7 + Math.sin(t * 1.3 + p.phase) * 0.1, elbowL: -0.9, elbowR: -1.0, lean: 0.12 });
      else {
        // whoever's turn it is to talk gestures; the others listen, arms folded or hands in pockets
        const speaking = Math.floor(t / 2.6 + p.chat.g * 1.3) % p.chat.n === p.chat.k;
        if (speaking) Object.assign(g, { armR: -0.55 + Math.sin(t * 3.1 + p.phase) * 0.25, elbowR: -1.2 + Math.sin(t * 4.3) * 0.3, armL: -0.25 + Math.sin(t * 2.2) * 0.12, elbowL: -0.7 });
        else if (p.look.hs > 0.5) Object.assign(g, { armL: -0.55, armR: -0.55, elbowL: -1.9, elbowR: -1.9 });
        else Object.assign(g, { armL: 0.12, armR: 0.12, elbowL: -0.35, elbowR: -0.35 });
        g.twist = Math.sin(t * 0.7 + p.phase) * 0.08;
      }
    }
    if (p.sit && p.knocked <= 0) {
      // sitting on a bench: hips on the seat, hands resting in the lap
      Object.assign(g, { thighL: -1.45, thighR: -1.45, kneeL: 1.45, kneeR: 1.45, armL: -0.42, armR: -0.38, elbowL: -1.05, elbowR: -1.0, lean: -0.08, bob: 0, twist: 0, roll: 0 });
      return { g, extra, y: groundY(p.x, p.z) + 0.5 - RIG.hipY * p.look.h };
    }
    if (p.knocked > 0) {
      // tumbling in the air, then flat on the ground
      const lying = p.y <= 0.01;
      extra = { tilt: lying ? -1.45 : p.spin };
      Object.assign(g, { thighL: 0.3, thighR: -0.2, kneeL: 0.4, kneeR: 0.2, armL: -2.4, armR: 2.2, elbowL: -0.3, elbowR: -0.3, lean: 0, bob: lying ? -0.72 : 0 });
    } else g.bob = g.bob || 0;
    return { g, extra, y };
  }
  // fill the instance buffers with the nearest people
  render(fx, fz, camera) {
    const near = this.near; near.length = 0;
    for (const p of this.people) {
      if (p.hidden) continue;
      const dx = p.x - fx, dz = p.z - fz, d2 = dx * dx + dz * dz;
      if (d2 < 120 * 120 && (d2 < 100 || inView(p.x, p.z, 8))) { p._d2 = d2; near.push(p); }
    }
    if (near.length > MAX) { near.sort((a, b) => a._d2 - b._d2); near.length = MAX; }
    // the crowd as real people (crowdvat.js), once the models are in and baked
    if (!this.vat && !this._vatFail && this._simpOK && humansReady()) {
      try { const mobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent); this.vat = makeVatCrowd(this._scene, gait, mobile ? { mid: 70, far: 260 } : { mid: 140, far: 420 }); }
      catch (e) { console.warn("crowd bake failed", e); this._vatFail = true; }
    }
    if (this.vat) { this._cam = camera && camera.position; this.renderVat(near); return; }
    let i = 0;
    const c = this._c, M = this.meshes, g = this._g;
    const heads = this._heads;
    const PM = this._pm;
    const put = (k, m) => { M[k].setMatrixAt(i, m); if (k === "head") heads[i].copy(m); else if (PM[k]) PM[k][i].copy(m); };
    for (const p of near) {
      const { extra, y } = this.poseOf(p, g);
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
    this._cam = camera && camera.position;
    this.renderFaces(near, i);
  }
  // which baked movement someone is doing, and how far through it
  clipOf(p, now) {
    if (p.knocked > 0) return ["lying", 0];
    if (p.beach && p.fixed) {
      if (p.lie) return p.lie === "situp" ? ["sitsand", 0] : [p.lie === "back" ? "sunback" : "sunfront", 0];
      if (p.swim) return ["swim", p.phase / 6.2832 * 8];
      if (p.fish) return ["fish", 0];
      if (p.volley) return [p.amt > 1 ? "run" : "ready", now * 3];
      if (p.wade) return ["walk", ((p.phase % 6.2832) / 6.2832) * 16];
    }
    if (p.vendor) return ["vendor", 0];
    if (p.chat) { const speaking = Math.floor(now / 2.6 + p.chat.g * 1.3) % p.chat.n === p.chat.k; return speaking ? ["talk", now * 3 + p.phase] : [p.look.hs > 0.5 ? "folded" : "pockets", 0]; }
    if (p.sit) return ["sit", 0];
    if (p.fightT > 0) return ["fight", Math.sin(Math.min(1, Math.max(0, p.punchT || 0) / 0.26) * Math.PI) * 2];
    if (p.aimT > 0) return ["aim", 0];
    const moving = !(p.pause > 0 || (p.cross && p.cross.wait)) && (p.amt ?? 1) > 0.05;
    if (p.phoneT > 0 && !moving) return ["phone", 0];
    if (p.workT > 0) return ["work", p.workT * 0.6];
    if (!moving) return ["idle", now * 0.3 + p.phase];
    const ph = (((p.phase % 6.2832) + 6.2832) % 6.2832) / 6.2832;
    return (p.amt ?? 1) > 1.5 ? ["run", ph * 12] : ["walk", ph * 16];
  }
  renderVat(near) {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - this._ft); this._ft = now;
    // the old stand-ins step aside for good
    if (!this._vatOn) { this._vatOn = true; for (const m of [...Object.values(this.meshes), ...Object.values(this.fm), ...Object.values(this.bm)]) { m.count = 0; m.visible = false; } }
    // the very nearest are the full models, with faces and hands
    near.sort((a, b) => a._d2 - b._d2);
    const order = [];
    for (const p of near) { if (p._d2 > 30 * 30) break; order.push(p); }
    const real = this.pool.assign(order);
    const V = this.vat; V.begin();
    for (const p of near) {
      const hu = real.get(p);
      if (hu) {
        const f = this.faceOf(p), L = p.look;
        f.base = L.mood || "neutral";
        const auto = this.exprFor(p);
        if (auto) { f.expr = auto; f.hold = 0.35; }
        if (p.chat && Math.floor(now / 2.6 + p.chat.g * 1.3) % p.chat.n === p.chat.k) f.talk = Math.max(f.talk, 0.3);
        tickFace(f, dt, now);
        const cam = this._cam;
        if (cam && p._d2 < 64) { let a = Math.atan2(cam.x - p.x, cam.z - p.z) - p.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); f.look = Math.abs(a) < 1.2 ? (f._lk || (f._lk = { x: 0, y: 0 }), f._lk.x = Math.max(-0.4, Math.min(0.4, a * 0.7)), f._lk.y = Math.max(-0.2, Math.min(0.2, (cam.y - 1.6) * 0.08)), f._lk) : null; }
        else f.look = null;
        const { g, extra, y } = this.poseOf(p, this._hg);
        hu.drive(p.x, y, p.z, p.yaw, g, extra, f);
        continue;
      }
      const [clip, t] = this.clipOf(p, now);
      const gy = groundY(p.x, p.z);
      let y = p.sit ? gy : gy + (p.y || 0);
      if (p.beach && p.fixed) {                  // the baked poses stand on y = 0: put them on the sand, in the water, on the pier
        if (p.lie) y = gy + (p.lie === "situp" ? 0.03 - (0.97 - 0.12) : 0.11 - 0.97) * (p.look.h || 1) + (p.lie === "situp" ? 0 : 0);
        else if (p.swim) y = -0.46 - 0.97 * (p.look.h || 1);
        else if (p.wade) y = Math.max(gy, -0.45);
        else if (p.fish) y = 2.44;
      }
      const tilt = p.knocked > 0 && p.y > 0.01 ? (p.spin || 0) + 1.45 : 0;
      const cm = this._cam, dc2 = cm ? (p.x - cm.x) ** 2 + (p.z - cm.z) ** 2 : p._d2;     // detail follows the camera
      V.add(p, modelFor(p.look), dc2, p.x, y, p.z, p.yaw, clip, t, tilt);
    }
    V.end();
  }
  renderFaces(near, n) {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - this._ft); this._ft = now;
    const FM = this.fm, cnt = {}, c = this._c, bcnt = {};
    for (const k in FM) cnt[k] = 0;
    for (const k in this.bm) bcnt[k] = 0;
    // the nearest few dozen people within talking distance get a face
    const idx = [];
    for (let j = 0; j < n; j++) if (near[j]._d2 < 26 * 26) idx.push(j);
    if (idx.length > FMAX) { idx.sort((a, b) => near[a]._d2 - near[b]._d2); idx.length = FMAX; }
    // the very nearest are real people: their stand-in parts step aside entirely
    let real = null;
    if (humansReady()) {
      const order = idx.slice().sort((a, b) => near[a]._d2 - near[b]._d2).map(j => near[j]);
      real = this.pool.assign(order);
    }
    for (const j of idx) {
      const p = near[j], L = p.look, f = this.faceOf(p);
      const hu = real && real.get(p);
      if (hu) {
        f.base = L.mood || "neutral";
        const auto = this.exprFor(p);
        if (auto) { f.expr = auto; f.hold = 0.35; }
        if (p.chat && Math.floor(now / 2.6 + p.chat.g * 1.3) % p.chat.n === p.chat.k) f.talk = Math.max(f.talk, 0.3);
        tickFace(f, dt, now);
        const cam = this._cam;
        if (cam && p._d2 < 64) { let a = Math.atan2(cam.x - p.x, cam.z - p.z) - p.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); f.look = Math.abs(a) < 1.2 ? (f._lk || (f._lk = { x: 0, y: 0 }), f._lk.x = Math.max(-0.4, Math.min(0.4, a * 0.7)), f._lk.y = Math.max(-0.2, Math.min(0.2, (cam.y - 1.6) * 0.08)), f._lk) : null; }
        else f.look = null;
        for (const k in this.meshes) this.meshes[k].setMatrixAt(j, this._zero);
        const { g, extra, y } = this.poseOf(p, this._hg);
        hu.drive(p.x, y, p.z, p.yaw, g, extra, f);
        continue;
      }
      f.base = L.mood || "neutral";
      const auto = this.exprFor(p);
      if (auto) { f.expr = auto; f.hold = 0.35; }
      if (p.chat && Math.floor(now / 2.6 + p.chat.g * 1.3) % p.chat.n === p.chat.k) f.talk = Math.max(f.talk, 0.3);
      tickFace(f, dt, now);
      const bk = L.beard ? BEARD_KIND[L.beard] : null;
      // the low-detail head and hair step aside for the sculpted ones
      this.meshes.head.setMatrixAt(j, this._zero); this.meshes.hair.setMatrixAt(j, this._zero); this.meshes.hairL.setMatrixAt(j, this._zero);
      // and the body: the simple parts step aside for the detailed ones
      for (const part of BODY_PARTS) {
        this.meshes[part].setMatrixAt(j, this._zero);
        for (const pk of bodyPieces(part, L)) { const mesh = this.bm[pk], at = bcnt[pk]++; mesh.setMatrixAt(at, this._pm[part][j]); c.set(bodyCol(pk, L)); mesh.setColorAt(at, c); }
      }
      // they look at you when you're close and facing them
      const cam = this._cam;
      if (cam && near[j]._d2 < 64) { let a = Math.atan2(cam.x - p.x, cam.z - p.z) - p.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); f.look = Math.abs(a) < 1.2 ? (f._lk || (f._lk = { x: 0, y: 0 }), f._lk.x = Math.max(-0.4, Math.min(0.4, a * 0.7)), f._lk.y = Math.max(-0.2, Math.min(0.2, (cam.y - 1.6) * 0.08)), f._lk) : null; }
      else f.look = null;
      faceMatrices(this._heads[j], f, { head: true, hair: hairPart(L), beard: bk, beardCards: L.beard ? BEARD_CARDS[L.beard] : null, fv: L.fv }, (k, m) => {
        const mesh = FM[k], at = cnt[k]++;
        mesh.setMatrixAt(at, m);
        c.set(faceCol(k, L));
        mesh.setColorAt(at, c);
        if (k === "headHi") { const sa = mesh.geometry.attributes.aSkin; sa.setXYZW(at, L.age || 0.3, L.freckles || 0, L.stubble || 0, (L.hs || 0.5) * 10); }
      });
    }
    for (const k in FM) { FM[k].count = cnt[k]; FM[k].instanceMatrix.needsUpdate = true; FM[k].instanceColor.needsUpdate = true; }
    FM.headHi.geometry.attributes.aSkin.needsUpdate = true;
    for (const k in this.bm) { const m = this.bm[k]; m.count = bcnt[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
}
