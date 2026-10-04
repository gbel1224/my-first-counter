// Palm City — the crowd, made of the same real people as the close-ups. Each of the four rigged,
// textured models is simplified twice (a mid-distance and a far version, by meshoptimizer, which keeps
// UV seams and silhouettes), then posed through every movement the game uses (a walk cycle, a run
// cycle, standing, sitting, talking with their hands, arms folded, a vendor at a counter, on the phone,
// fighting, aiming, lying flat...) by the very same skeleton driver as the close-up people. Each pose is
// skinned on the CPU once and stored in a pair of half-float textures (positions and normals, one
// texel per vertex per frame). On the GPU every instance reads its own two frames and blends them, so
// hundreds of people walk the streets as real textured models, each in their own skin tone, clothes
// and hair colour, for a handful of draw calls.
import * as THREE from "../vendor/three.module.js";
import { MeshoptSimplifier } from "../vendor/meshopt_simplifier.module.js";
import { MODELS, makeHuman, SKIN_REF, suitOf } from "./human.js";

const SKIP = /lash|brow|teeth|tongue|eyeao|glasses|headwear/;
// what tint a mesh takes (mirrors human.js tint): 1 skin, 2 top, 3 bottom, 4 top+bottom in one
// texture, 5 hair, 6 beard, 0 as it is
function roleOf(o) {
  const n = (o.material.name || "").toLowerCase();
  if (/(skin|body|head)$/.test(n) && !/eye|teeth/.test(n)) return 1;
  if (/casualsuit/.test(n)) return 4;
  if (/outfit_top/.test(n)) return 2;
  if (/avaturn_look/.test(n)) return 7;
  if (/outfit_bottom/.test(n)) return 3;
  if (/hair|ponytail/.test(n)) return 5;
  if (/beard/.test(n)) return 6;
  return 0;
}
const TRIS = { mid: 7000, far: 1300 };      // per person, all parts together
export const MID_D = 36;                    // past this, the far version
const TEXW = 1024;

// ---- the movements, as the simple rig's joint angles (gait() from people.js does the walking) ----
const SIT = { thighL: -1.45, thighR: -1.45, kneeL: 1.45, kneeR: 1.45, armL: -0.42, armR: -0.38, elbowL: -1.05, elbowR: -1.0, lean: -0.08, bob: 0, twist: 0, roll: 0 };
export const CLIPS = {};                    // name -> { start, n, loop }
function buildPoses(gait) {
  const P = [], st = { stride: 1, arm: 1 };
  const clip = (name, list, loop = false) => { CLIPS[name] = { start: P.length, n: list.length, loop }; P.push(...list); };
  const base = (amt, ph = 0) => gait(ph, amt, {}, st);
  clip("walk", Array.from({ length: 16 }, (_, k) => ({ g: base(1, k / 16 * Math.PI * 2) })), true);
  clip("run", Array.from({ length: 12 }, (_, k) => ({ g: base(2, k / 12 * Math.PI * 2) })), true);
  clip("idle", [{ g: base(0) }, { g: Object.assign(base(0), { lean: 0.03, armL: 0.04, armR: -0.03 }) }], true);
  clip("sit", [{ g: Object.assign(base(0), SIT), y: 0.5 - 0.97 }]);
  clip("talk", Array.from({ length: 8 }, (_, k) => { const t = k / 8 * Math.PI * 2; return { g: Object.assign(base(0), { armR: -0.55 + Math.sin(t) * 0.25, elbowR: -1.2 + Math.sin(t * 2) * 0.3, armL: -0.25 + Math.sin(t) * 0.12, elbowL: -0.7, twist: Math.sin(t) * 0.06 }) }; }), true);
  clip("folded", [{ g: Object.assign(base(0), { armL: -0.55, armR: -0.55, elbowL: -1.9, elbowR: -1.9 }) }]);
  clip("pockets", [{ g: Object.assign(base(0), { armL: 0.12, armR: 0.12, elbowL: -0.35, elbowR: -0.35 }) }]);
  clip("vendor", [{ g: Object.assign(base(0), { armL: -0.75, armR: -0.7, elbowL: -0.9, elbowR: -1.0, lean: 0.12 }) }]);
  clip("phone", [{ g: Object.assign(base(0), { armR: -2.6, elbowR: -2.3, armL: -0.2 }) }]);
  clip("work", [-1, 1].map(s => ({ g: Object.assign(base(0), { armL: -0.9 + s * 0.15, armR: -1.0, elbowL: -0.8, elbowR: -0.7, lean: 0.25 }) })), true);
  clip("fight", [0, 0.5, 1, 0.5].map(e => ({ g: Object.assign(base(0), { armL: -0.9, elbowL: -1.9, armR: -0.85 - 0.7 * e, elbowR: -2.0 + 1.8 * e, twist: -0.25 * e, gripL: 1, gripR: 1 }) })), true);
  clip("aim", [{ g: Object.assign(base(0), { armR: -1.45, elbowR: -0.1, armL: -1.2, elbowL: -0.5, gripR: 0.95, indexR: 0.3, gripL: 0.6 }) }]);
  clip("sunback", [{ g: Object.assign(base(0), { thighL: 0.05, thighR: -0.05, kneeL: 0.25, kneeR: 0.05, armL: -2.9, armR: -2.7, elbowL: -1.5, elbowR: -0.2, bob: 0 }), extra: { tilt: -1.5 } }]);
  clip("sunfront", [{ g: Object.assign(base(0), { thighL: 0.05, thighR: -0.05, kneeL: 0.05, kneeR: 0.05, armL: -0.2, armR: -0.25, elbowL: -0.2, elbowR: -0.2, bob: 0 }), extra: { tilt: 1.5 } }]);
  clip("sitsand", [{ g: Object.assign(base(0), { thighL: -1.35, thighR: -1.2, kneeL: 1.8, kneeR: 1.5, armL: 0.6, armR: 0.6, elbowL: -0.1, elbowR: -0.1, lean: -0.35, bob: 0 }) }]);
  clip("swim", Array.from({ length: 8 }, (_, k) => { const s = k / 8 * Math.PI * 2; return { g: Object.assign(base(0), { armL: -3.1 * (0.5 + 0.5 * Math.sin(s)), armR: -3.1 * (0.5 + 0.5 * Math.sin(s + Math.PI)), elbowL: -0.3, elbowR: -0.3, thighL: Math.sin(s * 3) * 0.25, thighR: -Math.sin(s * 3) * 0.25, kneeL: 0.2, kneeR: 0.2, twist: Math.sin(s) * 0.25, bob: 0 }), extra: { tilt: 1.35, headPitch: -0.9 } }; }), true);
  clip("ready", [{ g: Object.assign(base(0), { armL: -0.6, armR: -0.6, elbowL: -0.6, elbowR: -0.6, lean: 0.3, kneeL: 0.6, kneeR: 0.6, thighL: -0.4, thighR: -0.4 }) }]);
  clip("fish", [{ g: Object.assign(base(0), { armR: -1.3, armL: -1.0, elbowR: -0.6, elbowL: -0.9, gripL: 1, gripR: 1, lean: 0.05 }) }]);
  clip("lying", [{ g: Object.assign(base(0), { thighL: 0.3, thighR: -0.2, kneeL: 0.4, kneeR: 0.2, armL: -2.4, armR: 2.2, elbowL: -0.3, elbowR: -0.3, lean: 0, bob: -0.72 }), extra: { tilt: -1.45 } }]);
  return P;
}

// ---- bake one model ----
const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
function bakeKind(kind, poses) {
  const h = makeHuman({ h: 1, bulk: 1, skin: 0xc99a7c, shirt: 0x808080, pants: 0x404040, hair: 0x222222, beard: "full" }, kind);
  const root = h.root;
  const parts = [];
  root.traverse(o => { if (o.isSkinnedMesh && !SKIP.test((o.name + " " + (o.material.name || "")).toLowerCase())) parts.push(o); });
  // simplify: each part keeps its share of the triangle budget
  let total = 0; for (const o of parts) total += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
  const lod = { mid: [], far: [] };
  for (const o of parts) {
    const g = o.geometry, pos = g.attributes.position;
    const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    const P = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i); }
    for (const L of ["mid", "far"]) {
      const want = Math.max(12, Math.round(idx.length / 3 * Math.min(1, TRIS[L] / total))) * 3;
      const [out] = want >= idx.length ? [idx] : MeshoptSimplifier.simplify(idx, P, 3, want, L === "mid" ? 0.03 : 0.12, []);
      lod[L].push(out);
    }
  }
  // compact: only the vertices either version uses
  const remap = parts.map(o => new Int32Array(o.geometry.attributes.position.count).fill(-1));
  const verts = [];   // [part, original index]
  parts.forEach((o, pi) => { for (const L of ["mid", "far"]) for (const i of lod[L][pi]) if (remap[pi][i] < 0) { remap[pi][i] = verts.length; verts.push([pi, i]); } });
  const V = verts.length, F = poses.length, H = Math.ceil(V * F / TEXW);
  const PD = new Uint16Array(TEXW * H * 4), ND = new Uint16Array(TEXW * H * 4);
  const half = THREE.DataUtils.toHalfFloat;
  // pose and skin every frame
  const bm = parts.map(o => o.skeleton.bones.map(() => new THREE.Matrix4()));
  poses.forEach((pz, f) => {
    h.drive(0, pz.y || 0, 0, 0, Object.assign({ bob: 0 }, pz.g), pz.extra || null, null);
    root.updateMatrixWorld(true);
    parts.forEach((o, pi) => {
      o.skeleton.update();
      const bmats = o.skeleton.boneMatrices;
      // per bone: world * bindInverse * bone * bind
      for (let j = 0; j < bm[pi].length; j++) {
        _b.fromArray(bmats, j * 16);
        bm[pi][j].copy(o.matrixWorld).multiply(o.bindMatrixInverse).multiply(_b).multiply(o.bindMatrix);
      }
    });
    for (let vi = 0; vi < V; vi++) {
      const [pi, i] = verts[vi], o = parts[pi], g = o.geometry;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const m = _m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), e = m.elements;
      const W4 = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], I4 = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      for (let k = 0; k < 4; k++) {
        const w = W4[k]; if (!w) continue;
        const be = bm[pi][I4[k]].elements;
        for (let q = 0; q < 16; q++) e[q] += be[q] * w;
      }
      _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(m);
      _n.fromBufferAttribute(g.attributes.normal, i).transformDirection(m);
      const t = (f * V + vi) * 4;
      PD[t] = half(_v.x); PD[t + 1] = half(_v.y); PD[t + 2] = half(_v.z); PD[t + 3] = half(1);
      ND[t] = half(_n.x); ND[t + 1] = half(_n.y); ND[t + 2] = half(_n.z); ND[t + 3] = half(0);
    }
  });
  const tex = d => { const t = new THREE.DataTexture(d, TEXW, H, THREE.RGBAFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const tP = tex(PD), tN = tex(ND);
  // a geometry per part per version: uv, the vertex id, and the standing pose for bounds
  const idle = CLIPS.idle.start;
  const geos = { mid: [], far: [] };
  parts.forEach((o, pi) => {
    for (const L of ["mid", "far"]) {
      const src = lod[L][pi]; if (!src.length) { geos[L].push(null); continue; }
      const used = [...new Set(src)], local = new Map(used.map((oi, k) => [oi, k]));
      const g = new THREE.BufferGeometry(), n = used.length;
      const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), vid = new Float32Array(n);
      const ouv = o.geometry.attributes.uv;
      used.forEach((oi, k) => {
        const vi = remap[pi][oi], t = (idle * V + vi) * 4;
        pos[k * 3] = THREE.DataUtils.fromHalfFloat(PD[t]); pos[k * 3 + 1] = THREE.DataUtils.fromHalfFloat(PD[t + 1]); pos[k * 3 + 2] = THREE.DataUtils.fromHalfFloat(PD[t + 2]);
        if (ouv) { uv[k * 2] = ouv.getX(oi); uv[k * 2 + 1] = ouv.getY(oi); }
        vid[k] = vi;
      });
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setAttribute("aVid", new THREE.BufferAttribute(vid, 1));
      g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src, oi => local.get(oi)), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2);
      geos[L].push(g);
    }
  });
  return { kind, parts: parts.map(o => ({ mat: o.material, role: roleOf(o) })), geos, tP, tN, V };
}

// ---- materials: the model's own, with the vertices read from the textures and the person's colours ----
const VAT_VERT = `
  uniform highp sampler2D uVatP, uVatN; uniform int uVerts;
  attribute float aVid; attribute vec3 aAnim; attribute vec3 aSkinC, aTop, aBot, aHairC; attribute float aMask;
  varying vec3 vSkinC, vTop, vBot, vHairC;
  vec4 vat(highp sampler2D t, float f) { int i = int(f + 0.5) * uVerts + int(aVid + 0.5); return texelFetch(t, ivec2(i % ${TEXW}, i / ${TEXW}), 0); }`;
function vatMaterial(src, role, B) {
  const m = src.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.uVatP = { value: B.tP }; sh.uniforms.uVatN = { value: B.tN }; sh.uniforms.uVerts = { value: B.V };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n" + VAT_VERT)
      .replace("#include <beginnormal_vertex>", `vec3 objectNormal = normalize(mix(vat(uVatN, aAnim.x).xyz, vat(uVatN, aAnim.y).xyz, aAnim.z));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace("#include <begin_vertex>", `vec3 transformed = mix(vat(uVatP, aAnim.x).xyz, vat(uVatP, aAnim.y).xyz, aAnim.z);
        ${role === 6 ? "if (aMask < 0.5) transformed = vec3(0.0);" : ""}
        vSkinC = aSkinC; vTop = aTop; vBot = aBot; vHairC = aHairC;`);
    const dye = (col, amt) => `{ float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, ${col} * smoothstep(0.0, 0.55, lum) * 1.7, ${amt}); }`;
    const tintCode = role === 1 ? "diffuseColor.rgb *= vSkinC;"
      : role === 2 ? dye("vTop", "1.0") : role === 3 ? dye("vBot", "1.0")
      : role === 4 ? `{ vec3 dc = vTop;
          #ifdef USE_MAP
            if (vMapUv.y > 0.43) dc = vBot;
          #endif
          ${dye("dc", "1.0")} }`
      : role === 5 ? dye("vHairC", "0.85") : role === 6 ? "diffuseColor.rgb *= vHairC * 2.2;"
      : role === 7 ? `{ float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); float lp = smoothstep(0.12, 0.3, lum);
          diffuseColor.rgb = mix(vBot * clamp(lum / 0.045, 0.0, 1.6) * 0.9, mix(vec3(lum), vTop * lum * 1.25, 0.35), lp); }` : "";
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSkinC, vTop, vBot, vHairC;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + tintCode);
  };
  m.customProgramCacheKey = () => "vat-" + role + "-" + (src.customProgramCacheKey ? "" : "") + (src.map ? "m" : "") + (src.alphaTest > 0 ? "a" : "") + (src.transparent ? "t" : "");
  if (role === 1 || role === 6) m.color = new THREE.Color(1, 1, 1);
  return m;
}
function vatDepth(B, role) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    sh.uniforms.uVatP = { value: B.tP }; sh.uniforms.uVatN = { value: B.tN }; sh.uniforms.uVerts = { value: B.V };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VAT_VERT)
      .replace("#include <begin_vertex>", `vec3 transformed = mix(vat(uVatP, aAnim.x).xyz, vat(uVatP, aAnim.y).xyz, aAnim.z);${role === 6 ? " if (aMask < 0.5) transformed = vec3(0.0);" : ""}`);
  };
  m.customProgramCacheKey = () => "vatdepth-" + role;
  return m;
}

// ---- the crowd: per model and version, one instanced mesh per part sharing the instance data ----
export function makeVatCrowd(scene, gait, { mid = 140, far = 420 } = {}) {
  const poses = buildPoses(gait);
  const groups = [];
  const bakes = {};
  for (const kind of MODELS) {
    const B = bakes[kind] = bakeKind(kind, poses);
    for (const L of ["mid", "far"]) {
      const max = L === "mid" ? mid : far;
      const inst = {
        matrix: new THREE.InstancedBufferAttribute(new Float32Array(max * 16), 16),
        anim: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
        skin: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), top: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
        bot: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), hair: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
        mask: new THREE.InstancedBufferAttribute(new Float32Array(max), 1),
      };
      for (const a of Object.values(inst)) a.setUsage(THREE.DynamicDrawUsage);
      const meshes = [];
      B.parts.forEach((pt, pi) => {
        const g = B.geos[L][pi]; if (!g) return;
        g.setAttribute("aAnim", inst.anim); g.setAttribute("aSkinC", inst.skin); g.setAttribute("aTop", inst.top); g.setAttribute("aBot", inst.bot); g.setAttribute("aHairC", inst.hair); g.setAttribute("aMask", inst.mask);
        const mesh = new THREE.InstancedMesh(g, vatMaterial(pt.mat, pt.role, B), max);
        mesh.instanceMatrix = inst.matrix; mesh.count = 0; mesh.frustumCulled = false;
        mesh.castShadow = L === "mid"; mesh.receiveShadow = true;
        if (mesh.castShadow) mesh.customDepthMaterial = vatDepth(B, pt.role);
        mesh.name = "vat_" + kind + "_" + L;
        scene.add(mesh); meshes.push(mesh);
      });
      groups.push({ kind, L, max, inst, meshes, n: 0 });
    }
  }
  const G = {}; for (const gr of groups) G[gr.kind + "_" + gr.L] = gr;
  const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  // a person's colours, worked out once
  function colours(p, kind) {
    if (p._vc && p._vc.kind === kind && p._vc.look === p.look) return p._vc;
    const L = p.look, ref = SKIN_REF[kind] || SKIN_REF.man, s = _c.set(L.skin || 0xc99a7c);
    const vc = { kind, look: L, skin: [Math.min(1.2, s.r / ref.r), Math.min(1.2, s.g / ref.g), Math.min(1.2, s.b / ref.b)] };
    for (const [k, hex] of [["top", L.shirt], ["bot", kind === "avaturn" ? suitOf(L) : L.pants], ["hair", L.hair]]) { _c.set(hex ?? 0x808080); vc[k] = [_c.r, _c.g, _c.b]; }
    vc.beard = L.beard === "full" || L.beard === "goatee" ? 1 : 0;
    return (p._vc = vc);
  }
  return {
    begin() { for (const g of groups) g.n = 0; },
    // one person: kind, distance, position, heading, scale (height, bulk), clip name, frame position, tilt
    add(p, kind, d2, x, y, z, yaw, clip, t, tilt = 0) {
      const gr = G[kind + "_" + (d2 < MID_D * MID_D ? "mid" : "far")];
      if (!gr || gr.n >= gr.max) return false;
      const i = gr.n++, C = CLIPS[clip] || CLIPS.idle, L = p.look;
      let fa, fb, bl;
      if (C.n === 1) { fa = fb = C.start; bl = 0; }
      else { const u = (C.loop ? ((t % C.n) + C.n) % C.n : Math.min(C.n - 1, Math.max(0, t))); const k = Math.floor(u); fa = C.start + k; fb = C.start + (C.loop ? (k + 1) % C.n : Math.min(C.n - 1, k + 1)); bl = u - k; }
      _mat.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(tilt, yaw, 0, "YXZ")), _s.set((L.h || 1) * (L.bulk || 1), L.h || 1, (L.h || 1) * (L.bulk || 1)));
      _mat.toArray(gr.inst.matrix.array, i * 16);
      gr.inst.anim.setXYZ(i, fa, fb, bl);
      const vc = colours(p, kind);
      gr.inst.skin.setXYZ(i, ...vc.skin); gr.inst.top.setXYZ(i, ...vc.top); gr.inst.bot.setXYZ(i, ...vc.bot); gr.inst.hair.setXYZ(i, ...vc.hair); gr.inst.mask.setX(i, vc.beard);
      return true;
    },
    end() {
      for (const g of groups) {
        for (const m of g.meshes) m.count = g.n;
        if (g.n) for (const a of Object.values(g.inst)) { a.needsUpdate = true; a.addUpdateRange ? (a.clearUpdateRanges(), a.addUpdateRange(0, g.n * a.itemSize)) : 0; }
      }
    },
    stats: () => Object.fromEntries(Object.entries(bakes).map(([k, b]) => [k, { verts: b.V, mid: b.geos.mid.reduce((s, g) => s + (g ? g.index.count / 3 : 0), 0), far: b.geos.far.reduce((s, g) => s + (g ? g.index.count / 3 : 0), 0) }])),
    groups,
  };
}
export const vatReady = () => MeshoptSimplifier.ready;
