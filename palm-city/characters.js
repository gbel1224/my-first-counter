// Palm City — character factories: the merged-geometry pedestrian bodies, the swing-limb
// "walker" rigs the crowd uses, and the fully articulated hero rig. Split out of game.js;
// depends only on Three.js and the shared geometry helpers.
import * as THREE from "./vendor/three.module.js";
import { cylC, sphC, mergeGeos } from "./geometry.js";

// characters get their own PBR material (like the cars) so they catch the sky's image-based lighting
// instead of looking flat — matte skin/cloth (high roughness) with a gentle environment fill
export const matPerson = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.55 });
export function personGeo(p) {
  // clean, simple, fully-clothed figure (~6.5 heads tall)
  const SHOE = 0x2a2620;
  const parts = [
    sphC(0.092, 0.1, 0.05, 0.05, SHOE, 1.0, 0.55, 1.7),      // shoes
    sphC(0.092, -0.1, 0.05, 0.05, SHOE, 1.0, 0.55, 1.7),
    cylC(0.08, 0.06, 0.84, 0.1, 0.46, 0, p.pants),           // legs
    cylC(0.08, 0.06, 0.84, -0.1, 0.46, 0, p.pants),
    cylC(0.145, 0.155, 0.16, 0, 0.88, 0, p.pants),           // hips
    cylC(0.17, 0.13, 0.5, 0, 1.12, 0, p.shirt),              // torso (gentle taper)
    cylC(0.057, 0.045, 0.56, 0.172, 1.09, 0, p.shirt),       // arms (sleeves)
    cylC(0.057, 0.045, 0.56, -0.172, 1.09, 0, p.shirt),
    sphC(0.053, 0.172, 0.79, 0, p.skin),                     // hands
    sphC(0.053, -0.172, 0.79, 0, p.skin),
    cylC(0.056, 0.07, 0.14, 0, 1.46, 0, p.skin),             // neck
    sphC(0.14, 0, 1.63, 0, p.skin, 1, 1.13, 0.95),           // head
    sphC(0.03, 0.055, 1.632, 0.11, 0xf2efe6),                // eye whites
    sphC(0.03, -0.055, 1.632, 0.11, 0xf2efe6),
    sphC(0.016, 0.058, 1.632, 0.132, 0x20242b),              // irises
    sphC(0.016, -0.058, 1.632, 0.132, 0x20242b),
    sphC(0.028, 0.057, 1.672, 0.112, p.hair, 1.3, 0.4, 0.7), // brows (tinted to hair)
    sphC(0.028, -0.057, 1.672, 0.112, p.hair, 1.3, 0.4, 0.7),
    sphC(0.03, 0, 1.6, 0.13, p.skin, 0.9, 1.2, 1.4),         // nose
    sphC(0.038, 0.135, 1.63, 0, p.skin, 0.5, 1, 1),          // ears
    sphC(0.038, -0.135, 1.63, 0, p.skin, 0.5, 1, 1),
  ];
  if (p.hat) {
    parts.push(cylC(0.18, 0.19, 0.05, 0, 1.72, 0, p.hat));
    parts.push(cylC(0.13, 0.14, 0.16, 0, 1.81, 0, p.hat));
  } else {
    parts.push(sphC(0.152, 0, 1.7, -0.035, p.hair, 1.05, 0.82, 1.05));
    if (p.hairStyle === "bun") parts.push(sphC(0.075, 0, 1.78, -0.12, p.hair));
    else if (p.hairStyle === "long") parts.push(sphC(0.13, 0, 1.51, -0.1, p.hair, 1, 1.25, 0.7));
  }
  return mergeGeos(parts);
}
export function articulatedPerson(p) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.55 });   // PBR, matches the crowd + cars
  // shared materials so the wardrobe/barber can recolour the whole outfit/hair in one call
  const shirtMat = mat(p.shirt), pantsMat = mat(p.pants), skinMat = mat(p.skin), hairMat = mat(p.hair), shoeMat = mat(0x2a2620);
  const cyl = (rT, rB, h, m, y) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 16, 1), m); if (y != null) me.position.y = y; return me; };
  const sph = (r, m, sx, sy, sz) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m); if (sx != null) s.scale.set(sx, sy, sz); return s; };
  // leg group (pivots at hip): thigh + a child knee group (shin + shoe) so the lower leg can flex
  const leg = side => {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, 0.88, 0);
    hip.add(cyl(0.08, 0.07, 0.42, pantsMat, -0.21));       // thigh
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0);
    knee.add(cyl(0.07, 0.055, 0.42, pantsMat, -0.21));     // shin
    const shoe = sph(0.092, shoeMat, 1.0, 0.55, 1.7); shoe.position.set(0, -0.40, 0.05); knee.add(shoe);
    hip.add(knee); hip.knee = knee; return hip;
  };
  const legL = leg(1), legR = leg(-1);
  // arm group (pivots at shoulder): clothed arm + hand
  const arm = side => {
    const grp = new THREE.Group(); grp.position.set(0.172 * side, 1.36, 0);
    grp.add(cyl(0.057, 0.045, 0.56, shirtMat, -0.28));
    const hand = sph(0.053, skinMat, 1, 1.1, 0.85); hand.position.y = -0.6; grp.add(hand); return grp;
  };
  const armL = arm(1), armR = arm(-1);
  const hips = cyl(0.145, 0.155, 0.16, pantsMat, 0.88);
  const torso = cyl(0.17, 0.13, 0.5, shirtMat, 1.12);                // torso (gentle taper)
  const neck = cyl(0.056, 0.07, 0.14, skinMat, 1.46);
  const head = sph(0.14, skinMat, 1, 1.13, 0.95); head.position.y = 1.63;
  const hair = sph(0.152, hairMat, 1.05, 0.82, 1.05); hair.position.set(0, 1.7, -0.035);
  const eyeWhiteMat = mat(0xf2efe6), irisMat = mat(0x20242b);
  const eyeW = x => { const s = sph(0.03, eyeWhiteMat); s.position.set(x, 1.632, 0.11); return s; };
  const iris = x => { const s = sph(0.016, irisMat); s.position.set(x, 1.632, 0.132); return s; };
  const brow = x => { const s = sph(0.028, hairMat, 1.3, 0.4, 0.7); s.position.set(x, 1.672, 0.112); return s; };
  const nose = sph(0.03, skinMat, 0.9, 1.2, 1.4); nose.position.set(0, 1.6, 0.13);
  const ear = x => { const s = sph(0.038, skinMat, 0.5, 1, 1); s.position.set(x, 1.63, 0); return s; };
  g.add(legL, legR, hips, torso, armL, armR, neck, head, hair,
    eyeW(0.055), eyeW(-0.055), iris(0.058), iris(-0.058), brow(0.057), brow(-0.057),
    nose, ear(0.135), ear(-0.135));
  const hatHolder = new THREE.Group(), glassHolder = new THREE.Group(), jacketHolder = new THREE.Group(), beardHolder = new THREE.Group();
  g.add(hatHolder, glassHolder, jacketHolder, beardHolder);
  return { group: g, legL, legR, armL, armR, kneeL: legL.knee, kneeR: legR.knee, shirtMat, pantsMat, hairMat, hair, hatHolder, glassHolder, jacketHolder, beardHolder };
}
// top: "tank" (bare arms) | "tee" (short sleeves) | "long" (full sleeves); bottom: "shorts" | "pants"
export const HERO_PAL = { shirt: 0xff7a33, pants: 0x3a4452, skin: 0xe8b08a, hair: 0x3a2c20, top: "tee", bottom: "pants" };
export const NPC_PALS = [
  { shirt: 0x6fb7d9, pants: 0x4a4f59, skin: 0xe8b08a, hair: 0x2c2620, top: "tee", bottom: "pants" },
  { shirt: 0xecd3e2, pants: 0x7a6f5c, skin: 0xc98f6b, hair: 0x1f1a16, hairStyle: "bun", top: "tank", bottom: "shorts" },
  { shirt: 0x9fe6a0, pants: 0x3f4a52, skin: 0xf0c8a0, hair: 0x6b4a2a, hat: 0x394150, top: "long", bottom: "pants" },
  { shirt: 0xf5e8c8, pants: 0x8e5fc9, skin: 0xd9a37a, hair: 0x3a2c20, hairStyle: "long", top: "tee", bottom: "shorts" },
  { shirt: 0xd95f4b, pants: 0xd9e4f0, skin: 0xe8b08a, hair: 0x55524e, top: "tank", bottom: "pants" },
  { shirt: 0x4a6fa5, pants: 0x2c2620, skin: 0x8d5a3b, hair: 0x161210, hat: 0xb23b3b, top: "tee", bottom: "pants" },
  { shirt: 0xf0a93f, pants: 0x3a3f47, skin: 0xf0c8a0, hair: 0x7a5a3a, hairStyle: "bun", top: "long", bottom: "shorts" },
  { shirt: 0x7d6fc9, pants: 0x4a4f59, skin: 0xc98f6b, hair: 0x2c2620, hairStyle: "long", top: "tee", bottom: "pants" },
];
export const npcGeos = NPC_PALS.map(personGeo);
// lightweight articulated walker: a merged upper body + four swinging limbs (legs & arms)
// so the crowd actually strides. geometries are shared per palette; only meshes/groups differ.
export function walkerGeos(p) {
  const SHOE = 0x2a2620;
  const top = p.hat
    ? [cylC(0.18, 0.19, 0.05, 0, 1.72, 0, p.hat), cylC(0.13, 0.14, 0.16, 0, 1.81, 0, p.hat)]
    : [sphC(0.152, 0, 1.7, -0.035, p.hair, 1.05, 0.82, 1.05),
       ...(p.hairStyle === "bun" ? [sphC(0.075, 0, 1.78, -0.12, p.hair)]
         : p.hairStyle === "long" ? [sphC(0.13, 0, 1.51, -0.1, p.hair, 1, 1.25, 0.7)] : [])];
  const body = mergeGeos([
    cylC(0.145, 0.155, 0.16, 0, 0.88, 0, p.pants),          // hips
    cylC(0.17, 0.13, 0.5, 0, 1.12, 0, p.shirt),             // torso
    cylC(0.056, 0.07, 0.14, 0, 1.46, 0, p.skin),            // neck
    sphC(0.14, 0, 1.63, 0, p.skin, 1, 1.13, 0.95),          // head
    sphC(0.03, 0.055, 1.632, 0.11, 0xf2efe6),               // eye whites
    sphC(0.03, -0.055, 1.632, 0.11, 0xf2efe6),
    sphC(0.016, 0.058, 1.632, 0.132, 0x20242b),             // irises
    sphC(0.016, -0.058, 1.632, 0.132, 0x20242b),
    sphC(0.028, 0.057, 1.672, 0.112, p.hair, 1.3, 0.4, 0.7),// brows (tinted to hair)
    sphC(0.028, -0.057, 1.672, 0.112, p.hair, 1.3, 0.4, 0.7),
    sphC(0.03, 0, 1.6, 0.13, p.skin, 0.9, 1.2, 1.4),        // nose
    sphC(0.038, 0.135, 1.63, 0, p.skin, 0.5, 1, 1),         // ears
    sphC(0.038, -0.135, 1.63, 0, p.skin, 0.5, 1, 1),
    ...top,
  ]);
  // limb geometries built around their pivot (origin) so a parent group can swing them.
  // legs split at the knee: thigh hangs from the hip, shin (with the shoe) hangs from the knee.
  const thigh = cylC(0.08, 0.07, 0.42, 0, -0.21, 0, p.pants);
  const shin = mergeGeos([cylC(0.07, 0.055, 0.42, 0, -0.21, 0, p.pants), sphC(0.092, 0, -0.40, 0.05, SHOE, 1.0, 0.55, 1.7)]);
  const arm = mergeGeos([cylC(0.057, 0.045, 0.56, 0, -0.28, 0, p.shirt), sphC(0.053, 0, -0.58, 0, p.skin)]);
  return { body, thigh, shin, arm };
}
export const npcWalkerGeos = NPC_PALS.map(walkerGeos);
export function makeWalker(W) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(W.body, matPerson); body.castShadow = true;
  const limb = (geo, x, y) => { const grp = new THREE.Group(); grp.position.set(x, y, 0); grp.add(new THREE.Mesh(geo, matPerson)); return grp; };   // limbs skip real shadows (blob shadow grounds them)
  const legGrp = x => {                                  // hip group (thigh) with a child knee group (shin)
    const hip = new THREE.Group(); hip.position.set(x, 0.88, 0);
    hip.add(new THREE.Mesh(W.thigh, matPerson));
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0);
    knee.add(new THREE.Mesh(W.shin, matPerson));
    hip.add(knee); hip.knee = knee; return hip;
  };
  const legL = legGrp(0.1), legR = legGrp(-0.1);
  const armL = limb(W.arm, 0.172, 1.36), armR = limb(W.arm, -0.172, 1.36);
  g.add(body, legL, legR, armL, armR);
  return { group: g, legL, legR, armL, armR, kneeL: legL.knee, kneeR: legR.knee };
}

