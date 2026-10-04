// Real people: rigged, textured human models (glTF), posed by the same joint angles as the rest of
// the game. The game's poses (walk, run, sit, punch, aim, lie...) are angles in the simple rig; here
// they're turned into rotations of the model's real skeleton, so everything already animated in the
// game animates these models too. Distant crowds stay instanced; the nearest people and the player
// are these.
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { clone as skClone } from "../vendor/SkeletonUtils.js";
import { paint, place, merge } from "./geo.js";

const HIP_Y = 0.97;
const HEAD_OFF = 0.1;                     // the rig's head joint sits this far below the model's head bone                       // the rig's hip height (people.js RIG.hipY)
const BASE = {};                          // model -> { scene, limb alignments, scale }
// the people: photo-made avatars (Avaturn, Avatar SDK), a MakeHuman woman (MPFB) and a Ready Player Me
// man. Each is posed, tinted (skin, clothes, hair) and sized per person, so the same few models make a
// varied crowd.
export const MODELS = ["avatarsdk", "avaturn", "mpfb", "man"];
let loading = null;
export function humansReady() { return MODELS.every(k => BASE[k]); }
export function loadHumans(base = "", names = MODELS) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  return (loading = Promise.all(names.map(async kind => {
    try { const g = await loader.loadAsync(base + "assets/humans/" + kind + ".glb"); BASE[kind] = prepare(kind, g.scene); }
    catch (e) { console.warn("human model failed", kind, e); }
  })).then(() => humansReady()));
}
// which model suits a look
export function modelFor(look) {
  const hs = look.hs || 0.5;
  if (look.long) return hs < 0.72 ? "avaturn" : "mpfb";
  return look.bald || look.beard === "full" || look.beard === "goatee" ? "man" : "avatarsdk";
}

const nameOf = b => b.name.replace(/^mixamorig:?/, "");
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

// measure the model at rest: bone orientations in model space, limb directions, hip height
function prepare(kind, scene) {
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse(o => { if (o.isBone) bones[nameOf(o)] = o; });
  const box = new THREE.Box3();
  scene.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); } });
  box.setFromObject(scene, true);
  const hips = bones.Hips.getWorldPosition(new THREE.Vector3());
  const hipH = hips.y - box.min.y;
  const scale = HIP_Y / hipH;
  // alignment from each limb's rest direction to how the simple rig hangs it
  const dir = (a, b) => bones[b].getWorldPosition(_v2).sub(bones[a].getWorldPosition(_v)).normalize().clone();
  const C = {};
  for (const s of ["Left", "Right"]) {
    const sx = Math.sign(bones[s + "Arm"].getWorldPosition(_v).x - hips.x);
    const hang = new THREE.Vector3(sx * Math.sin(0.13), -Math.cos(0.13), 0.02).normalize();
    C[s + "Arm"] = new THREE.Quaternion().setFromUnitVectors(dir(s + "Arm", s + "ForeArm"), hang);
    const hang2 = new THREE.Vector3(sx * Math.sin(0.07), -Math.cos(0.07), 0.04).normalize();
    C[s + "ForeArm"] = new THREE.Quaternion().setFromUnitVectors(dir(s + "ForeArm", s + "Hand"), hang2);
    const legDown = new THREE.Vector3(sx * 0.03, -1, 0).normalize();
    C[s + "UpLeg"] = new THREE.Quaternion().setFromUnitVectors(dir(s + "UpLeg", s + "Leg"), legDown);
    C[s + "Leg"] = new THREE.Quaternion().setFromUnitVectors(dir(s + "Leg", s + "Foot"), new THREE.Vector3(0, -1, 0));
    C["side" + s] = sx;
  }
  // fingers: each one curls toward the palm. The palm's facing comes from the hand's own bones
  // (wrist, index and pinky knuckles), so it works whatever pose the model was made in
  const wp = n => bones[n] ? bones[n].getWorldPosition(new THREE.Vector3()) : null;
  const F = {};
  for (const sd of ["Left", "Right"]) {
    const h = wp(sd + "Hand"), i1 = wp(sd + "HandIndex1"), p1 = wp(sd + "HandPinky1") || wp(sd + "HandRing1");
    if (!h || !i1 || !p1) continue;
    const sx = C["side" + sd];
    const palm = new THREE.Vector3().crossVectors(i1.clone().sub(h), p1.clone().sub(h)).multiplyScalar(-sx).normalize();
    const fingersDir = i1.clone().add(p1).multiplyScalar(0.5).sub(h).normalize();
    F[sd] = { palm, across: i1.clone().sub(p1).normalize(), fingers: fingersDir };   // for holding things
    for (const f of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
      const a = wp(sd + "Hand" + f + "1"), b = wp(sd + "Hand" + f + "2");
      if (!a || !b) continue;
      const d = b.clone().sub(a).normalize();
      const curlAxis = new THREE.Vector3().crossVectors(d, palm).normalize();
      F[sd + f] = f === "Thumb" ? { curl: curlAxis, swing: new THREE.Vector3().crossVectors(d, fingersDir).normalize() } : { curl: curlAxis };
    }
  }
  C.F = F;
  // the arms at rest, for reaching (two-bone IK): upper arm and forearm directions, and the elbow's
  // hinge axis (the rig bends elbows about x in the hanging frame, so it's C^-1 applied to x)
  C.arm = {};
  for (const sd of ["Left", "Right"]) C.arm[sd] = { upper: dir(sd + "Arm", sd + "ForeArm"), fore: dir(sd + "ForeArm", sd + "Hand"), hinge: new THREE.Vector3(1, 0, 0).applyQuaternion(C[sd + "Arm"].clone().invert()) };
  const footY = bones.LeftFoot.getWorldPosition(new THREE.Vector3()).y - box.min.y;
  // shadows only from the big pieces (eyes, teeth, lashes and brows don't need a shadow pass), and a
  // generous bound so people off screen aren't drawn at all
  scene.traverse(o => {
    if (!o.isMesh) return;
    const n = (o.name + " " + (o.material.name || "")).toLowerCase();
    o.castShadow = !/eye|teeth|tongue|lash|brow|ao/.test(n); o.receiveShadow = true;
    if (o.isSkinnedMesh) {
      o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere.clone(); bs.radius = Math.max(bs.radius * 1.6, 1.4 / (o.matrixWorld.getMaxScaleOnAxis() || 1));
      o.boundingSphere = bs;
    }
    o.frustumCulled = true;
  });
  return { kind, scene, C, scale, height: (box.max.y - box.min.y) * scale, footY };
}

// which rig side each model side is: the rig's "L" limbs sit on -x, the model's anatomical left on +x
function sideMap(C) { return C.sideLeft < 0 ? { L: "Left", R: "Right" } : { L: "Right", R: "Left" }; }

// guns, in the hand's frame: the grip at the origin, barrel forward along -y, sights up along +z
const _gs = new THREE.Vector3(), _gm = new THREE.Matrix4(), _gv1 = new THREE.Vector3(), _gv2 = new THREE.Vector3(), _gv3 = new THREE.Vector3(), _gv4 = new THREE.Vector3();
const GUNGEO = {};
let GUNMAT = null;
function gunMaterial() { return GUNMAT || (GUNMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 })); }
// guns built from parts: grip at the origin, barrel forward along -y, top along +z
function gunGeometry(id) {
  if (GUNGEO[id]) return GUNGEO[id];
  const p = [];
  const box = (w, l, hgt, y, z, col, rx = 0, x = 0) => p.push(place(paint(new THREE.BoxGeometry(w, l, hgt), col), x, y, z, rx));
  const cyl = (r, l, y, z, col, seg = 12, x = 0) => p.push(place(paint(new THREE.CylinderGeometry(r, r, l, seg), col), x, y, z));
  const cone = (r0, r1, l, y, z, col) => p.push(place(paint(new THREE.CylinderGeometry(r0, r1, l, 12), col), 0, y, z));
  const guard = (y, z, r = 0.017) => p.push(place(paint(new THREE.TorusGeometry(r, 0.0035, 4, 12, Math.PI), 0x18191b), 0, y, z, 0, Math.PI / 2, Math.PI / 2));
  const POLY = 0x26282b, STEEL = 0x45484d, DARK = 0x0c0c0d, WOOD = 0x6a3f22, WOOD2 = 0x55321b, OLIVE = 0x4c5638, TAN = 0x8a7a58, GLASS = 0x2a4a6a;
  if (id === "pistol") {
    box(0.03, 0.19, 0.032, -0.06, 0.052, STEEL);                   // slide
    for (let k = 0; k < 5; k++) box(0.031, 0.003, 0.024, 0.02 - k * 0.007, 0.054, DARK);   // rear serrations
    box(0.008, 0.035, 0.014, -0.075, 0.069, DARK, 0, 0.0155);      // ejection port
    box(0.028, 0.17, 0.02, -0.05, 0.027, POLY);                    // frame + dust cover
    box(0.029, 0.05, 0.115, 0.014, -0.026, POLY, 0.32);            // grip, raked back
    box(0.03, 0.045, 0.006, 0.028, -0.085, DARK, 0.32);            // magazine base
    guard(-0.03, 0.012); box(0.005, 0.006, 0.02, -0.028, 0.006, DARK);   // trigger guard + trigger
    box(0.012, 0.006, 0.008, -0.145, 0.072, DARK); box(0.02, 0.006, 0.008, 0.025, 0.072, DARK);   // sights
    cyl(0.006, 0.01, -0.156, 0.052, DARK, 8);                      // muzzle
  } else if (id === "smg") {
    box(0.042, 0.24, 0.058, -0.06, 0.05, POLY); box(0.044, 0.06, 0.02, -0.12, 0.085, STEEL);
    box(0.03, 0.05, 0.1, 0.0, -0.015, POLY, 0.2); box(0.026, 0.035, 0.16, -0.075, -0.05, STEEL, 0.08);   // grip, magazine
    guard(-0.035, 0.014); cyl(0.011, 0.07, -0.215, 0.05, DARK, 10); cyl(0.016, 0.03, -0.25, 0.05, STEEL, 10);
    box(0.012, 0.012, 0.016, -0.17, 0.09, DARK); box(0.03, 0.012, 0.016, 0.03, 0.09, DARK);
    box(0.012, 0.16, 0.012, 0.13, 0.03, STEEL, 0, 0.018); box(0.012, 0.16, 0.012, 0.13, 0.03, STEEL, 0, -0.018); box(0.04, 0.012, 0.05, 0.21, 0.03, POLY);   // folding stock
  } else if (id === "shotgun") {
    cyl(0.013, 0.58, -0.36, 0.055, STEEL); cyl(0.011, 0.48, -0.31, 0.03, STEEL);                  // barrel + tube magazine
    box(0.042, 0.16, 0.05, -0.04, 0.045, STEEL);                                                 // receiver
    for (let k = 0; k < 6; k++) cyl(0.021, 0.012, -0.22 - k * 0.018, 0.03, WOOD2);               // ribbed pump
    cyl(0.019, 0.1, -0.265, 0.03, WOOD);
    guard(0.0, 0.016); box(0.034, 0.05, 0.075, 0.035, 0.0, WOOD, 0.45);                           // trigger guard, wrist
    box(0.036, 0.26, 0.055, 0.19, 0.015, WOOD, -0.1); box(0.04, 0.02, 0.085, 0.325, 0.0, DARK, -0.1);   // stock + recoil pad
    cyl(0.003, 0.006, -0.645, 0.072, 0xd8c070, 6);                                             // bead sight
  } else if (id === "rifle" || id === "gl") {
    box(0.04, 0.2, 0.055, -0.04, 0.05, POLY);                                                    // receiver
    box(0.022, 0.2, 0.008, -0.05, 0.083, DARK);                                                  // top rail
    cyl(0.022, 0.2, -0.24, 0.05, POLY, 8);                                                       // handguard
    for (let k = 0; k < 5; k++) box(0.046, 0.012, 0.012, -0.17 - k * 0.032, 0.05, DARK);        // vents
    cyl(0.008, 0.2, -0.43, 0.05, STEEL, 10); cyl(0.012, 0.035, -0.54, 0.05, DARK, 8);           // barrel, muzzle brake
    box(0.008, 0.02, 0.04, -0.33, 0.085, DARK);                                                  // front sight post
    box(0.024, 0.04, 0.03, 0.02, 0.1, DARK);                                                     // rear sight
    box(0.03, 0.045, 0.1, 0.012, -0.015, POLY, 0.28);                                            // pistol grip
    guard(-0.03, 0.018); box(0.026, 0.045, 0.085, -0.09, -0.01, STEEL, -0.18); box(0.026, 0.04, 0.07, -0.105, -0.075, STEEL, -0.38);   // curved magazine
    box(0.012, 0.13, 0.018, 0.12, 0.05, STEEL);                                                  // buffer tube
    box(0.036, 0.13, 0.055, 0.22, 0.04, POLY); box(0.038, 0.012, 0.075, 0.285, 0.03, DARK);      // stock + butt pad
    if (id === "gl") cyl(0.025, 0.16, -0.26, 0.0, OLIVE, 12);                                    // underslung launcher
  } else if (id === "sniper") {
    box(0.04, 0.24, 0.05, -0.03, 0.045, OLIVE); cyl(0.011, 0.6, -0.45, 0.05, STEEL, 10); cyl(0.016, 0.05, -0.76, 0.05, DARK, 8);
    cyl(0.021, 0.2, -0.04, 0.115, DARK, 14); cyl(0.027, 0.045, -0.15, 0.115, DARK, 14); cyl(0.024, 0.035, 0.07, 0.115, DARK, 14);   // scope body + bells
    cyl(0.022, 0.002, -0.173, 0.115, GLASS, 14); box(0.012, 0.02, 0.03, -0.04, 0.09, DARK); box(0.012, 0.02, 0.03, 0.04, 0.09, DARK);   // lens, rings
    p.push(place(paint(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), STEEL), -0.03, 0.04, 0.06, 0, 0, Math.PI / 2)); cyl(0.009, 0.012, 0.04, 0.075, STEEL, 8);   // bolt
    box(0.03, 0.045, 0.1, 0.012, -0.015, OLIVE, 0.28); guard(-0.03, 0.018); box(0.026, 0.06, 0.05, -0.08, 0.0, DARK);
    box(0.04, 0.27, 0.06, 0.2, 0.025, OLIVE, -0.06); box(0.03, 0.12, 0.025, 0.17, 0.075, OLIVE);   // stock + cheek rest
    box(0.006, 0.18, 0.006, -0.3, 0.015, DARK, 0, 0.015); box(0.006, 0.18, 0.006, -0.3, 0.015, DARK, 0, -0.015);   // folded bipod
  } else if (id === "minigun") {
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cyl(0.01, 0.62, -0.42, 0.05 + Math.sin(a) * 0.032, STEEL, 6, Math.cos(a) * 0.032); }
    cyl(0.05, 0.03, -0.2, 0.05, DARK, 14); cyl(0.05, 0.03, -0.6, 0.05, DARK, 14);                  // barrel clamps
    box(0.12, 0.24, 0.13, 0.0, 0.05, POLY); box(0.08, 0.1, 0.1, 0.0, -0.06, OLIVE);                // housing, ammo box
    box(0.02, 0.02, 0.1, -0.05, 0.16, DARK); box(0.11, 0.02, 0.02, -0.05, 0.21, DARK);           // carry handle
    box(0.03, 0.045, 0.09, 0.08, -0.01, POLY, 0.25);
  } else if (id === "rpg") {
    cyl(0.04, 0.95, -0.12, 0.1, OLIVE, 14); cyl(0.046, 0.06, 0.32, 0.1, DARK, 14);               // tube, rear flare
    cone(0.02, 0.06, 0.16, -0.68, 0.1, OLIVE); cone(0.0, 0.02, 0.1, -0.81, 0.1, DARK);            // warhead
    box(0.03, 0.045, 0.1, 0.0, 0.02, DARK, 0.2); box(0.03, 0.045, 0.1, -0.24, 0.02, DARK, 0.2);   // grips
    box(0.02, 0.07, 0.05, -0.1, 0.155, DARK);                                                     // optic
    for (let k = 0; k < 3; k++) cyl(0.042, 0.012, -0.3 + k * 0.25, 0.1, TAN, 14);                 // bands
  } else return gunGeometry("pistol");
  return (GUNGEO[id] = merge(p));
}

// real guns (photo-scanned models), baked into the same frame as the built ones: grip at the origin,
// barrel along -y, top along +z. Until they've loaded (or if they don't), the built guns stand in.
const REAL = {}; let GUNVER = 0;
const REAL_SRC = {
  pistol: { file: "pistol", grip: [-0.015, 0.0, 0] },       // the service pistol: muzzle along +x, top +y
  sniper: { file: "rifle", grip: [-0.33, -0.035, 0] },      // the scoped bolt-action
  bat: { file: "bat", grip: [0, -0.17, 0], axis: true },    // along +y, knob at the bottom
  grenade: { file: "grenade", grip: [0, -0.06, 0], axis: true },
};
// a fresh copy of a real model, in its held frame (for a thrown grenade in flight, etc.)
export function weaponModel(id) { return REAL[id] ? REAL[id].clone() : null; }
export function loadWeapons(base = "") {
  const loader = new GLTFLoader();
  // model space -> gun frame: +x (muzzle) to -y, +y (top) to +z
  const R = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  return Promise.all(Object.entries(REAL_SRC).map(async ([id, s]) => {
    try {
      const g = await loader.loadAsync(base + "assets/weapons/" + s.file + ".glb");
      g.scene.updateMatrixWorld(true);
      const M = new THREE.Matrix4().copy(R).multiply(new THREE.Matrix4().makeTranslation(-s.grip[0], -s.grip[1], -s.grip[2]));
      // long things held by one end (a bat, a stick grenade): their +y becomes the frame's forward (-y)
      const MA = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)).multiply(new THREE.Matrix4().makeTranslation(-s.grip[0], -s.grip[1], -s.grip[2]));
      const grp = new THREE.Group();
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(s.axis ? MA : M);
        const m = new THREE.Mesh(geo, o.material); m.castShadow = true; grp.add(m);
      });
      REAL[id] = grp; GUNVER++;
    } catch (e) { console.warn("weapon model failed", id, e); }
  }));
}
// how each gun is held. at: "shoulder" (stock in the shoulder; butt = metres from grip to butt),
// "front" (out in both hands, the left cupping the right), "hip", "tube" (on the shoulder).
// fore: [forward, up] from the grip to where the left hand holds. twist: blade the body.
const HOLD = {
  pistol: { at: "front", reach: 0.46, lift: -0.02, fore: [0, 0], support: 0.85, twist: 0.05 },
  smg: { at: "front", reach: 0.4, lift: -0.06, fore: [0.14, -0.01], support: 0.8, twist: 0.12 },
  shotgun: { at: "shoulder", butt: 0.33, fore: [0.22, 0.0], support: 0.8, twist: 0.42 },
  rifle: { at: "shoulder", butt: 0.3, fore: [0.17, 0.0], support: 0.8, twist: 0.42 },
  sniper: { at: "shoulder", butt: 0.3, fore: [0.2, 0.0], support: 0.75, twist: 0.42 },
  gl: { at: "shoulder", butt: 0.3, fore: [0.2, 0.0], support: 0.8, twist: 0.4 },
  minigun: { at: "hip", fore: [0.05, 0.12], support: 0.9, twist: 0.25 },
  rpg: { at: "tube", fore: [0.25, 0.0], support: 0.8, twist: 0.3 },
  bat: { at: "swing", fore: [-0.09, 0.0], support: 0.9, twist: 0.15 },
  grenade: { at: "throw", fore: [0, 0], support: 0, twist: 0.1 },
};
const _k = {}; for (const n of ["f", "u", "r", "sR", "sL", "G", "b", "x", "fp", "rf", "rp", "lf", "lp", "la", "pr", "pl"]) _k[n] = new THREE.Vector3();
// two-bone IK: put the wrist at `wrist` (world), the elbow toward `pole`, the hand turned to the
// given knuckle direction and palm facing. Writes the applied rotations (model space) into A.
const _ik = { m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), q: new THREE.Quaternion(), y: new THREE.Quaternion(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), e: new THREE.Vector3() };
function frameQ(dir, ax, out) {   // a rotation whose x = dir, y = ax (made perpendicular), z = x × y
  const x = _ik.a.copy(dir).normalize(), y = _ik.b.copy(ax).addScaledVector(x, -ax.dot(x)).normalize(), z = _ik.c.crossVectors(x, y);
  return out.setFromRotationMatrix(_ik.m1.makeBasis(x, y, z));
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function mapQ(fromDir, fromAx, toDir, toAx) {   // the rotation taking (fromDir, fromAx) onto (toDir, toAx)
  frameQ(fromDir, fromAx, _qa); frameQ(toDir, toAx, _qb);
  return _qb.clone().multiply(_qa.invert());
}
function reach(human, A, sd, wrist, pole, fing, palm, yaw) {
  const B = BASE[human.kind], R = B.C.arm[sd], F = B.C.F[sd], bn = human.bones;
  const S = bn[sd + "Arm"].getWorldPosition(new THREE.Vector3()), E0 = bn[sd + "ForeArm"].getWorldPosition(new THREE.Vector3()), W0 = bn[sd + "Hand"].getWorldPosition(new THREE.Vector3());
  const L1 = S.distanceTo(E0), L2 = E0.distanceTo(W0);
  const to = wrist.clone().sub(S); let d = to.length();
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), (L1 + L2) * 0.995); to.setLength(d);
  const n = to.clone().normalize(), a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const perp = pole.clone().addScaledVector(n, -pole.dot(n)).normalize();
  const E = S.clone().addScaledVector(n, a).addScaledVector(perp, hh), Wt = S.clone().add(to);
  // into model space (undo the body's turn)
  const yq = _ik.y.setFromAxisAngle(_ik.e.set(0, 1, 0), -yaw);
  const up = E.clone().sub(S).applyQuaternion(yq).normalize(), lo = Wt.clone().sub(E).applyQuaternion(yq).normalize();
  let hinge = new THREE.Vector3().crossVectors(up, lo).negate();
  if (hinge.lengthSq() < 1e-6) hinge = perp.clone().applyQuaternion(yq).cross(up).normalize(); else hinge.normalize();
  A[sd + "Arm"] = mapQ(R.upper, R.hinge, up, hinge);
  A[sd + "ForeArm"] = mapQ(R.fore, R.hinge, lo, hinge);
  A[sd + "Hand"] = mapQ(F.fingers, F.palm, fing.clone().applyQuaternion(yq), palm.clone().applyQuaternion(yq));
}

// a finger joint's bend: curled about its own axis toward the palm (see prepare); the thumb also
// swings in across the palm
const FINGER = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/;
const CURL = [0, 1.3, 1.6, 1.0];                    // per joint, for a full fist
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion();
function fingerBend(F, h, sd, finger, j) {
  const ax = F[sd + finger];
  if (!ax) return _fq.identity();
  if (finger === "Thumb") {
    const c = h.grip;
    _fq.setFromAxisAngle(ax.curl, c * (j === 1 ? 0.35 : 0.55) + 0.05);
    if (j === 1) _fq.premultiply(_fq2.setFromAxisAngle(ax.swing, c * 0.6));
    return _fq;
  }
  let c = finger === "Index" ? h.index : h.grip;
  if (finger === "Pinky") c = Math.min(1, c * 1.08 + 0.03);
  return _fq.setFromAxisAngle(ax.curl, c * CURL[j]);
}
const rq = (x, y, z) => new THREE.Quaternion().setFromEuler(_e.set(x, y, z, "YXZ"));
// each model's own skin tone in its texture, so a look's skin colour can be reached by multiplying
export const SKIN_REF = { man: new THREE.Color(0xd2a084), avatarsdk: new THREE.Color(0xc8946e), avaturn: new THREE.Color(0xf0c8b0), mpfb: new THREE.Color(0xf0c8b4) };

// one person: a skinned clone with its own materials (clothes and skin tinted to their look)
export function makeHuman(look, kind = modelFor(look)) {
  const B = BASE[kind];
  const root = skClone(B.scene);
  const bones = {}, rest = [];
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isBone) bones[nameOf(o)] = o; });
  // rest pose in model space (relative to root)
  const rootInv = new THREE.Quaternion();
  for (const n in bones) {
    const b = bones[n];
    const wq = b.getWorldQuaternion(new THREE.Quaternion());
    const parentRest = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    rest.push({ n, b, wq, pq: parentRest, pn: b.parent && b.parent.isBone ? nameOf(b.parent) : null, lq: b.quaternion.clone() });
  }
  const order = rest;   // traverse order is parent before child
  const S = sideMap(B.C);
  const mats = [], meshes = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    meshes[o.name] = o;
    o.material = o.material.clone(); mats.push(o.material);
  });
  const human = { kind, root, bones, meshes, mats, look, S };
  tint(human);
  // per-frame: the applied rotation (model space) of each driven bone
  const A = {};
  human.drive = (x, y, z, yaw, g, extra, face) => {
    const L = human.look, h = L.h || 1, bulk = L.bulk || 1, s = B.scale * h;
    root.position.set(x, y + (g.bob || 0) * h, z);
    root.rotation.set(0, yaw, 0);
    root.scale.set(s * bulk, s, s * bulk);
    const H = rq(0, 0, g.roll || 0);
    if (extra && extra.tilt) H.multiply(rq(extra.tilt, 0, 0));
    const gun = g.gun && g.gun !== "fists" ? g.gun : null, kindG = gun ? HOLD[gun] || HOLD.pistol : null;
    const lean = g.lean || 0, tw = (g.twist || 0) + (kindG ? kindG.twist * -B.C.sideLeft : 0);   // long guns: blade the body, left shoulder forward
    const T = H.clone().multiply(rq(lean, tw, 0));
    const hp = -lean * 0.6 + (extra && extra.headPitch || 0);
    A.Hips = H;
    A.Spine = H.clone().multiply(rq(lean * 0.35, tw * 0.35, 0));
    A.Spine1 = H.clone().multiply(rq(lean * 0.7, tw * 0.7, 0));
    A.Spine2 = T;
    // the head: the rig's tilt plus where they're looking
    const look2 = face && face.look ? face.look : null;
    let hy = -tw + (look2 ? look2.x * 0.9 : 0), hx = hp - (look2 ? look2.y * 0.6 : 0);
    // shouldering a long gun: the cheek drops onto the stock, eye down the sights
    if (kindG && (kindG.at === "shoulder" || kindG.at === "tube")) { hx += 0.16; hy += 0.12 * B.C.sideRight; }
    A.Neck = T.clone().multiply(rq(hx * 0.4, hy * 0.4, 0));
    A.Head = T.clone().multiply(rq(hx, hy, 0));
    for (const side of ["L", "R"]) {
      const m = S[side];
      const arm = T.clone().multiply(rq(g["arm" + side] || 0, 0, 0));
      A[m + "Arm"] = arm.clone().multiply(B.C[m + "Arm"]);
      const fore = arm.multiply(rq(g["elbow" + side] || 0, 0, 0));
      A[m + "ForeArm"] = fore.clone().multiply(B.C[m + "ForeArm"]);
      A[m + "Hand"] = A[m + "ForeArm"];
      const th = g["thigh" + side] || 0, kn = g["knee" + side] || 0;
      const thigh = H.clone().multiply(rq(th, 0, 0));
      A[m + "UpLeg"] = thigh.clone().multiply(B.C[m + "UpLeg"]);
      const shin = thigh.multiply(rq(kn, 0, 0));
      A[m + "Leg"] = shin.clone().multiply(B.C[m + "Leg"]);
      // feet stay nearer flat than the shin: the ankle takes back some of the swing
      A[m + "Foot"] = H.clone().multiply(rq((th + kn) * 0.35 - 0.05, 0, 0)).multiply(B.C[m + "Leg"]);
    }
    // world (model-space) orientation of each bone = applied rotation * rest orientation; children
    // without their own rotation inherit the parent's; fingers curl a little, like a relaxed hand
    const W = human._W || (human._W = {}), AP = human._AP || (human._AP = {});
    // fingers: how closed each hand is (0 open, 1 a fist), the index finger on its own for a trigger
    const rigOf = human._rigOf || (human._rigOf = { [S.L]: "L", [S.R]: "R" });
    const hand = {};
    for (const m of ["Left", "Right"]) {
      const rs = rigOf[m], grip = g["grip" + rs] ?? 0.22;
      hand[m] = { grip, index: g["index" + rs] ?? grip, sx: B.C["side" + m] };
    }
    if (kindG) {   // shooting hand (right) round the grip with a finger on the trigger; the other hand supports
      hand.Right = { grip: 0.95, index: g.indexR ?? 0.3, sx: B.C.sideRight };
      hand.Left = { grip: kindG.support, index: kindG.support, sx: B.C.sideLeft };
    }
    const fk = () => { for (const r of order) {
      let a = A[r.n];
      if (!a) {
        a = r.pn ? AP[r.pn] : null;
        const fm = a && FINGER.exec(r.n);
        if (fm) a = a.clone().multiply(fingerBend(B.C.F, hand[fm[1]], fm[1], fm[2], +fm[3]));
      }
      AP[r.n] = a || null;
      const w = W[r.n] || (W[r.n] = new THREE.Quaternion());
      if (a) w.copy(a).multiply(r.wq); else w.copy(r.wq);
      // local = parentWorld^-1 * world
      const pw = r.pn ? W[r.pn] : r.pq;
      r.b.quaternion.copy(_q.copy(pw).invert().multiply(w));
    } };
    fk();
    // a gun: placed against the body (stock in the shoulder, or out in front in both hands), then
    // both arms reach for it — the right hand round the grip, the left under the barrel or cupping
    // the right — by two-bone IK, and the skeleton is posed again
    const gid = gun;
    if (gid !== human._gunId || human._gunVer !== GUNVER) {
      if (human._gun) { root.remove(human._gun); human._gun = null; }
      human._gunId = gid; human._gunVer = GUNVER;
      if (gid && REAL[gid]) { human._gun = REAL[gid].clone(); human._gun.matrixAutoUpdate = false; root.add(human._gun); }
      else if (gid) { human._gun = new THREE.Mesh(gunGeometry(gid), gunMaterial()); human._gun.matrixAutoUpdate = false; human._gun.castShadow = true; root.add(human._gun); }
    }
    if (kindG && bones.RightArm && bones.LeftArm && B.C.F.Right && B.C.F.Left) {
      root.updateMatrixWorld(true);
      const hs = h, fwd = _k.f.set(Math.sin(yaw), 0, Math.cos(yaw)), up = _k.u.set(0, 1, 0);
      const right = _k.r.set(-Math.cos(yaw), 0, Math.sin(yaw));                     // the body's right
      const sR = bones.RightArm.getWorldPosition(_k.sR), sL = bones.LeftArm.getWorldPosition(_k.sL);
      const G = _k.G;
      if (kindG.at === "shoulder") G.copy(sR).addScaledVector(right, -0.075 * hs).addScaledVector(fwd, (kindG.butt + 0.03) * hs).addScaledVector(up, -0.035 * hs);
      else if (kindG.at === "hip") G.copy(sR).addScaledVector(fwd, 0.28 * hs).addScaledVector(up, -0.42 * hs).addScaledVector(right, -0.02 * hs);
      else if (kindG.at === "tube") G.copy(sR).addScaledVector(fwd, 0.16 * hs).addScaledVector(up, -0.06 * hs).addScaledVector(right, -0.05 * hs);
      else if (kindG.at === "swing") {
        // a bat: cocked up over the right shoulder, then (g.swing 0 -> 1) brought round in front and across
        const s = g.swing || 0, e = s * s * (3 - 2 * s);
        G.copy(sR).add(sL).multiplyScalar(0.5).addScaledVector(fwd, (0.22 + 0.22 * Math.sin(e * Math.PI)) * hs).addScaledVector(right, (0.16 - 0.4 * e) * hs).addScaledVector(up, (-0.12 - 0.12 * e) * hs);
      }
      else if (kindG.at === "throw") {
        // a grenade: held low in the right hand, wound back over the shoulder as it's thrown (g.swing)
        const s = g.swing || 0, back = Math.sin(Math.min(1, s * 1.6) * Math.PI);
        G.copy(sR).addScaledVector(fwd, (0.12 - 0.3 * back) * hs).addScaledVector(up, (-0.38 + 0.55 * back) * hs).addScaledVector(right, -0.05 * hs);
      }
      else G.copy(sR).add(sL).multiplyScalar(0.5).addScaledVector(fwd, kindG.reach * hs).addScaledVector(up, kindG.lift * hs).addScaledVector(right, 0.02 * hs);
      // the gun's frame: barrel along fwd, sights up (a bat or grenade: its length along `aim`)
      let aim = fwd;
      if (kindG.at === "swing") { const e = (g.swing || 0); aim = _k.x.copy(up).multiplyScalar(1 - e).addScaledVector(fwd, 0.25 + e * 0.6).addScaledVector(right, (-0.3 + e * 1.4) * 0.6).addScaledVector(fwd, 0).normalize().clone(); }
      else if (kindG.at === "throw") aim = _k.x.copy(up).addScaledVector(fwd, 0.3).normalize().clone();
      const back = _k.b.copy(aim).negate(), sideV = new THREE.Vector3().crossVectors(back, up);
      if (sideV.lengthSq() < 1e-4) sideV.copy(right);
      sideV.normalize();
      const upV = new THREE.Vector3().crossVectors(sideV, back).normalize();
      const gx = _k.x.copy(sideV);
      _gm.makeBasis(gx, back, upV).setPosition(G);
      _gm.scale(_gs.set(hs, hs, hs));
      human._gun.matrix.copy(root.matrixWorld).invert().multiply(_gm);
      // where each hand goes, and how it's turned (knuckles' direction, palm's facing)
      const fore = _k.fp.copy(G).addScaledVector(kindG.at === "swing" ? aim : fwd, kindG.fore[0] * hs).addScaledVector(up, kindG.fore[1] * hs);   // (a bat: the left hand just below the right, on the handle)
      const rFing = _k.rf.copy(fwd).addScaledVector(up, -0.45).normalize(), rPalm = _k.rp.copy(right).negate();
      let lFing, lPalm, lAt;
      if (kindG.at === "front") { lFing = _k.lf.copy(fwd).addScaledVector(up, -0.6).normalize(); lPalm = _k.lp.copy(right); lAt = _k.la.copy(G).addScaledVector(right, -0.035 * hs).addScaledVector(up, -0.02 * hs); }
      else { lFing = _k.lf.copy(right).multiplyScalar(0.75).addScaledVector(fwd, 0.65).normalize(); lPalm = _k.lp.copy(up); lAt = _k.la.copy(fore).addScaledVector(up, -0.02 * hs); }
      const wristFor = (at, f, pa) => at.clone().addScaledVector(f, -0.075 * hs).addScaledVector(pa, -0.035 * hs);
      reach(human, A, "Right", wristFor(G, rFing, rPalm), _k.pr.copy(right).multiplyScalar(0.6).addScaledVector(up, -1), rFing, rPalm, yaw);
      if (kindG.support > 0) reach(human, A, "Left", wristFor(lAt, lFing, lPalm), _k.pl.copy(right).multiplyScalar(-0.6).addScaledVector(up, -1), lFing, lPalm, yaw);
      fk();
    }
    // the eyes follow their gaze
    if (face && bones.LeftEye) {
      const ey = rq(-(face.gy || 0) * 0.8, (face.gx || 0) * 1.1, 0);
      for (const r of human._eyes || (human._eyes = order.filter(r => r.n === "LeftEye" || r.n === "RightEye"))) r.b.quaternion.copy(r.lq).premultiply(ey);
    }
    // mouth: talking / expressions drive the morph targets the model has
    if (face) setMorph(human, face);
    human._yaw = yaw; human._A = A.Head;
  };
  // the head's frame in the simple rig's terms (for hats and glasses)
  human.headMatrix = out => {
    root.updateMatrixWorld(true);
    const p = bones.Head.getWorldPosition(_v), h = human.look.h || 1;
    _q.setFromAxisAngle(_v2.set(0, 1, 0), human._yaw || 0).multiply(human._A || _q2.identity());
    const off = _v2.set(0, -HEAD_OFF, 0).multiplyScalar(h).applyQuaternion(_q);
    return out.compose(p.clone().add(off), _q, new THREE.Vector3(h, h, h));
  };
  return human;
}

// the face: the game's expression state (face.js) as ARKit-style blendshapes
const SH = {};
function setMorph(h, f) {
  const c = f.cur || {}, cl = x => Math.max(0, Math.min(1, x));
  const tilt = c.tilt || 0, raise = (c.raise || 0) + (f.raise - (c.raise || 0)), curve = c.curve || 0, sneer = c.sneer || 0, lower = c.lower || 0;
  const smirk = c.smirk || 0, open = f.open || 0, wide = f.wide || 1, eyeW = Math.max(0, (c.eye || 1) - 1);
  SH.browInnerUp = cl(-tilt * 1.3 + Math.max(0, raise) * 110);
  SH.browDownLeft = SH.browDownRight = cl(tilt * 1.4 - Math.min(0, raise) * 160);
  SH.browOuterUpLeft = SH.browOuterUpRight = cl(Math.max(0, raise) * 120 - tilt * 0.3);
  SH.eyeBlinkLeft = cl(1 - f.eyeR); SH.eyeBlinkRight = cl(1 - f.eyeL);
  SH.eyesClosed = 0;
  SH.eyeWideLeft = SH.eyeWideRight = cl(eyeW * 2.4);
  SH.eyeSquintLeft = SH.eyeSquintRight = cl(lower * 0.55);
  SH.cheekSquintLeft = SH.cheekSquintRight = cl(Math.max(0, curve) * lower * 0.8);
  SH.mouthSmileLeft = cl(curve * (1 - smirk * 0.7)); SH.mouthSmileRight = cl(curve + smirk * 0.25);
  SH.mouthSmile = cl(curve);
  SH.mouthFrownLeft = SH.mouthFrownRight = cl(-curve * 0.9);
  SH.mouthStretchLeft = SH.mouthStretchRight = cl((wide - 1) * 3 + Math.max(0, -curve) * open * 0.6);
  SH.mouthPucker = cl((1 - wide) * 4);
  SH.noseSneerLeft = SH.noseSneerRight = cl(sneer * 0.7);
  SH.mouthUpperUpLeft = SH.mouthUpperUpRight = cl(sneer * 0.35 + open * 0.15);
  SH.mouthLowerDownLeft = SH.mouthLowerDownRight = cl(open * 0.35);
  SH.jawOpen = cl(open * 0.55);
  SH.mouthOpen = cl(open * 0.8);
  SH.mouthClose = 0;
  SH.viseme_aa = f.talk > 0 ? cl(open * 0.5) : 0;
  SH.viseme_O = f.talk > 0 ? cl((1 - wide) * 3) : 0;
  // eyes: where they're looking
  const gx = f.gx || 0, gy = f.gy || 0;
  SH.eyeLookOutLeft = cl(gx * 2.2); SH.eyeLookInRight = cl(gx * 2.2);
  SH.eyeLookInLeft = cl(-gx * 2.2); SH.eyeLookOutRight = cl(-gx * 2.2);
  SH.eyeLookUpLeft = SH.eyeLookUpRight = cl(gy * 3);
  SH.eyeLookDownLeft = SH.eyeLookDownRight = cl(-gy * 3);
  for (const k in h.meshes) {
    const m = h.meshes[k], d = m.morphTargetDictionary;
    if (!d) continue;
    const inf = m.morphTargetInfluences;
    for (const n in d) { const v = SH[n]; if (v !== undefined) inf[d[n]] = v; }
  }
}

// colour each person: skin tone, clothes, hair. Skin multiplies the texture (each model's base tone
// to the look's); clothes and hair are re-dyed: the texture's shading kept, its colour replaced.
const _c = new THREE.Color();
export function tint(h) {
  const L = h.look;
  const skin = _c.set(L.skin || 0xc99a7c), ref = SKIN_REF[h.kind] || SKIN_REF.man;
  const sk = new THREE.Color(Math.min(1.2, skin.r / ref.r), Math.min(1.2, skin.g / ref.g), Math.min(1.2, skin.b / ref.b));
  for (const k in h.meshes) {
    const m = h.meshes[k], mat = m.material, n = (mat.name || "").toLowerCase();
    if (/(skin|body|head)$/.test(n) && !/eye|teeth/.test(n)) mat.color.copy(sk);
    else if (/casualsuit/.test(n)) dye(mat, L.shirt, 1, L.pants, 0.43, L.pat || 0);   // top and jeans share one texture: split by its layout
    else if (/outfit_top/.test(n)) dye(mat, L.shirt, 1, undefined, 0, L.pat || 0);
    else if (/avaturn_look/.test(n)) dye(mat, L.shirt, 1, suitOf(L), -1);   // a suit over a light shirt: dyed by brightness
    else if (/outfit_bottom/.test(n)) dye(mat, L.pants, 1);
    else if (/hair|ponytail|brow/.test(n)) dye(mat, L.hair, 0.85);
    else if (/beard/.test(n)) { m.visible = L.beard === "full" || L.beard === "goatee"; mat.color.set(L.hair || 0x222222).multiplyScalar(2.2); }
    else if (/headwear/.test(n)) m.visible = !!L.hat;
    else if (/glasses/.test(n)) m.visible = false;
  }
}
// what suit someone wears (the women's suit model): its own palette, picked from their clothes
const SUIT = [0x2a3550, 0x7a7a7e, 0xc0ae8a, 0x6a2a30, 0x55603e, 0xe2dccf, 0x1e1e22, 0x9a724a, 0x3a5a6a, 0xb86a5a];
export function suitOf(L) {
  let h = Math.imul((L.shirt || 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((L.pants || 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((L.hair || 0) + 7, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
  return SUIT[(h >>> 0) % SUIT.length];
}
// re-dye a texture: keep its light and shade, swap its colour for `col`
function dye(mat, col, amt, col2, split = 0, pat = 0) {
  const u = mat.userData.dye || (mat.userData.dye = { col: { value: new THREE.Color() }, col2: { value: new THREE.Color() }, amt: { value: 0 }, split: { value: 0 }, pat: { value: 0 } });
  u.col.value.set(col ?? 0x808080); u.col2.value.set(col2 ?? col ?? 0x808080); u.amt.value = amt; u.split.value = split; u.pat.value = pat;
  if (mat.userData.dyed) return;
  mat.userData.dyed = true;
  mat.onBeforeCompile = s => {
    s.uniforms.uDye = u.col; s.uniforms.uDye2 = u.col2; s.uniforms.uDyeAmt = u.amt; s.uniforms.uSplit = u.split; s.uniforms.uPat = u.pat;
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uDye, uDye2; uniform float uDyeAmt, uSplit, uPat;")
      .replace("#include <map_fragment>", `#include <map_fragment>
      { float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 dc = uDye;
        #ifdef USE_MAP
          if (uSplit > 0.0 && vMapUv.y > uSplit) dc = uDye2;
          // a print on the top: stripes, camo, a check, or a loud Hawaiian
          else if (uPat > 0.5) {
            vec2 q = vMapUv * 34.0; float pm = 0.0;
            if (uPat < 1.5) pm = step(0.55, fract(q.y));
            else if (uPat < 2.5) { float n = sin(q.x * 0.9 + sin(q.y * 0.7) * 2.0) * sin(q.y * 1.1 + sin(q.x * 0.5) * 2.0); pm = n > 0.25 ? 1.0 : n < -0.35 ? 2.0 : 0.0; }
            else if (uPat < 3.5) pm = mod(floor(q.x * 0.5) + floor(q.y * 0.5), 2.0);
            else { vec2 f = fract(q * 0.33) - 0.5; float r = length(f), a = atan(f.y, f.x); pm = r < 0.12 + 0.1 * abs(sin(a * 2.5)) ? 1.0 : r < 0.26 && fract((q.x + q.y) * 0.13) > 0.6 ? 2.0 : 0.0; }
            dc = pm > 1.5 ? (uPat > 3.5 ? vec3(0.18, 0.5, 0.25) : dc * 0.38) : pm > 0.5 ? (uPat < 1.5 || uPat > 3.5 ? mix(dc, vec3(0.95, 0.9, 0.82), 0.8) : dc * 0.55) : dc;
          }
        #endif
        vec3 dyed = dc * smoothstep(0.0, 0.55, lum) * 1.7;
        if (uSplit < 0.0) {
          // suit (dark) in the second colour keeping its shading, shirt (light) washed with the first
          float lightPart = smoothstep(0.12, 0.3, lum);                 // (linear light: the suit is ~0.045, the shirt ~0.6)
          dyed = mix(uDye2 * clamp(lum / 0.045, 0.0, 1.6) * 0.9, mix(vec3(lum), uDye * lum * 1.25, 0.35), lightPart);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, dyed, uDyeAmt); }`);
  };
  mat.customProgramCacheKey = () => "dye";
  mat.needsUpdate = true;
}

// a pool of people for the crowd: the nearest pedestrians borrow one each
export class HumanPool {
  constructor(scene, n) { this.scene = scene; this.n = n; this.slots = []; this.assigned = new Map(); }
  // give each person in `list` (nearest first) a model; returns the map person -> model
  assign(list) {
    const want = new Set(list.slice(0, this.n));
    for (const [p, h] of this.assigned) if (!want.has(p)) { h.root.visible = false; this.assigned.delete(p); h.owner = null; }
    for (const p of want) {
      if (this.assigned.has(p)) continue;
      const kind = modelFor(p.look);
      let h = this.slots.find(s => !s.owner && s.kind === kind);
      if (!h) {
        if (this.slots.length >= this.n + 6) { const spare = this.slots.find(s => !s.owner); if (!spare) continue; this.scene.remove(spare.root); this.slots.splice(this.slots.indexOf(spare), 1); }
        h = makeHuman(p.look, kind); this.scene.add(h.root); this.slots.push(h);
      }
      h.look = p.look; tint(h); h.owner = p; h.root.visible = true; this.assigned.set(p, h);
    }
    return this.assigned;
  }
  release() { for (const [p, h] of this.assigned) { h.root.visible = false; h.owner = null; } this.assigned.clear(); }
}
