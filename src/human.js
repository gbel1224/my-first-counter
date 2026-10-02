// Real people: rigged, textured human models (glTF), posed by the same joint angles as the rest of
// the game. The game's poses (walk, run, sit, punch, aim, lie...) are angles in the simple rig; here
// they're turned into rotations of the model's real skeleton, so everything already animated in the
// game animates these models too. Distant crowds stay instanced; the nearest people and the player
// are these.
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { clone as skClone } from "../vendor/SkeletonUtils.js";

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

const rq = (x, y, z) => new THREE.Quaternion().setFromEuler(_e.set(x, y, z, "YXZ"));
// each model's own skin tone in its texture, so a look's skin colour can be reached by multiplying
const SKIN_REF = { man: new THREE.Color(0xd2a084), avatarsdk: new THREE.Color(0xc8946e), avaturn: new THREE.Color(0xf0c8b0), mpfb: new THREE.Color(0xf0c8b4) };

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
    const lean = g.lean || 0, tw = g.twist || 0;
    const T = H.clone().multiply(rq(lean, tw, 0));
    const hp = -lean * 0.6 + (extra && extra.headPitch || 0);
    A.Hips = H;
    A.Spine = H.clone().multiply(rq(lean * 0.35, tw * 0.35, 0));
    A.Spine1 = H.clone().multiply(rq(lean * 0.7, tw * 0.7, 0));
    A.Spine2 = T;
    // the head: the rig's tilt plus where they're looking
    const look2 = face && face.look ? face.look : null;
    const hy = -tw + (look2 ? look2.x * 0.9 : 0), hx = hp - (look2 ? look2.y * 0.6 : 0);
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
    const curl = human._curl || (human._curl = { Left: rq(0, 0, -0.32 * B.C.sideLeft), Right: rq(0, 0, -0.32 * B.C.sideRight) });
    for (const r of order) {
      let a = A[r.n];
      if (!a) {
        a = r.pn ? AP[r.pn] : null;
        if (a && /Hand(Index|Middle|Ring|Pinky)/.test(r.n)) { const sd = r.n.startsWith("Left") ? "Left" : "Right"; a = a.clone().multiply(curl[sd]); }
      }
      AP[r.n] = a || null;
      const w = W[r.n] || (W[r.n] = new THREE.Quaternion());
      if (a) w.copy(a).multiply(r.wq); else w.copy(r.wq);
      // local = parentWorld^-1 * world
      const pw = r.pn ? W[r.pn] : r.pq;
      r.b.quaternion.copy(_q.copy(pw).invert().multiply(w));
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
    else if (/casualsuit/.test(n)) dye(mat, L.shirt, 1, L.pants, 0.43);   // top and jeans share one texture: split by its layout
    else if (/outfit_top/.test(n)) dye(mat, L.shirt, 1);
    else if (/outfit_bottom/.test(n)) dye(mat, L.pants, 1);
    else if (/hair|ponytail|brow/.test(n)) dye(mat, L.hair, 0.85);
    else if (/beard/.test(n)) { m.visible = L.beard === "full" || L.beard === "goatee"; mat.color.set(L.hair || 0x222222).multiplyScalar(2.2); }
    else if (/headwear/.test(n)) m.visible = !!L.hat;
    else if (/glasses/.test(n)) m.visible = false;
  }
}
// re-dye a texture: keep its light and shade, swap its colour for `col`
function dye(mat, col, amt, col2, split = 0) {
  const u = mat.userData.dye || (mat.userData.dye = { col: { value: new THREE.Color() }, col2: { value: new THREE.Color() }, amt: { value: 0 }, split: { value: 0 } });
  u.col.value.set(col ?? 0x808080); u.col2.value.set(col2 ?? col ?? 0x808080); u.amt.value = amt; u.split.value = split;
  if (mat.userData.dyed) return;
  mat.userData.dyed = true;
  mat.onBeforeCompile = s => {
    s.uniforms.uDye = u.col; s.uniforms.uDye2 = u.col2; s.uniforms.uDyeAmt = u.amt; s.uniforms.uSplit = u.split;
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uDye, uDye2; uniform float uDyeAmt, uSplit;")
      .replace("#include <map_fragment>", `#include <map_fragment>
      { float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 dc = uDye;
        #ifdef USE_MAP
          if (uSplit > 0.0 && vMapUv.y > uSplit) dc = uDye2;
        #endif
        vec3 dyed = dc * smoothstep(0.0, 0.55, lum) * 1.7;
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
