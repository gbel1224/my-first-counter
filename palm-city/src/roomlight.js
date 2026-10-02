// Palm City — interior lighting. Every room is lit by its own fixtures (ceiling lights, lamps,
// pendants, fires, screens, windows), evaluated in the material shaders with each light confined to
// its room — or to a group of rooms joined by an open plan — so light never leaks through a wall.
// Each room also has a soft ambient term. Reflections come from the room's own probe, box-projected
// onto the room so a polished floor mirrors the actual walls instead of a smear at infinity.
import * as THREE from "../vendor/three.module.js";

export const MAX_LIGHTS = 32, MAX_ROOMS = 12;
export const RL = {
  uRLOn: { value: 0 },
  uRLN: { value: 0 },
  uRLRooms: { value: 0 },
  uRLPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },   // xyz, range
  uRLCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },   // rgb, group
  uRoomBox: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4()) },  // x0, z0, x1, z1 (world)
  uRoomAmb: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4()) },  // ambient rgb, group
  uProbePos: { value: new THREE.Vector3() },
  uProbeMin: { value: new THREE.Vector3() },
  uProbeMax: { value: new THREE.Vector3() },
  uIblDiffuse: { value: 0.3 },
};

const PARS = `
varying vec3 vRLPos;
uniform float uRLOn; uniform int uRLN; uniform int uRLRooms;
uniform vec4 uRLPos[${MAX_LIGHTS}]; uniform vec4 uRLCol[${MAX_LIGHTS}];
uniform vec4 uRoomBox[${MAX_ROOMS}]; uniform vec4 uRoomAmb[${MAX_ROOMS}];
uniform vec3 uProbePos; uniform vec3 uProbeMin; uniform vec3 uProbeMax; uniform float uIblDiffuse;
`;
const LIGHTING = `
if (uRLOn > 0.5) {
  vec3 wp = vRLPos;
  vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  int room = -1;
  for (int i = 0; i < ${MAX_ROOMS}; i++) {
    if (i >= uRLRooms) break;
    vec4 b = uRoomBox[i];
    if (wp.x > b.x - 0.05 && wp.x < b.z + 0.05 && wp.z > b.y - 0.05 && wp.z < b.w + 0.05) { room = i; break; }
  }
  if (room >= 0) {
    vec4 ra = uRoomAmb[room];
    vec3 diff = ra.rgb * (0.78 + 0.22 * wn.y);
    vec3 spec = vec3(0.0);
    vec3 V = normalize(cameraPosition - wp);
    float rg = max(material.roughness, 0.05);
    float sh = clamp(2.0 / (rg * rg * rg * rg) - 2.0, 1.0, 2048.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uRLN) break;
      vec4 c = uRLCol[i];
      if (abs(c.w - ra.w) > 0.5) continue;
      vec4 p = uRLPos[i];
      vec3 L = p.xyz - wp; float d2 = max(dot(L, L), 1e-4); float d = sqrt(d2); L /= d;
      float win = clamp(1.0 - pow(d / p.w, 4.0), 0.0, 1.0); win *= win;
      float att = win / (1.0 + d2);
      float ndl = dot(wn, L);
      diff += c.rgb * att * max(ndl * 0.85 + 0.15, 0.0);
      vec3 Hh = normalize(L + V);
      spec += c.rgb * att * max(ndl, 0.0) * pow(max(dot(wn, Hh), 0.0), sh) * (sh + 2.0) / 8.0;
    }
    reflectedLight.indirectDiffuse += diff * BRDF_Lambert(material.diffuseColor);
    reflectedLight.directSpecular += spec * material.specularColor * RECIPROCAL_PI;
  }
}
`;
const BOXPROJ = `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
  if (uRLOn > 0.5) {
    vec3 rmax = (uProbeMax - vRLPos) / reflectVec, rmin = (uProbeMin - vRLPos) / reflectVec;
    vec3 rr = max(rmax, rmin); float tt = min(min(rr.x, rr.y), rr.z);
    reflectVec = normalize(vRLPos + reflectVec * tt - uProbePos);
  }`;

// patch a MeshStandardMaterial (keeps any existing onBeforeCompile) to take the room lighting
export function roomLit(m) {
  if (!m || m.userData.roomLit || !m.isMeshStandardMaterial) return m;
  m.userData.roomLit = true;
  const prev = m.onBeforeCompile, key = (m.customProgramCacheKey ? m.customProgramCacheKey.call(m) : "") + "|RL";
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, RL);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vRLPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRLPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PARS)
      .replace("reflectVec = inverseTransformDirection( reflectVec, viewMatrix );", BOXPROJ)
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\nif (uRLOn > 0.5) iblIrradiance *= uIblDiffuse;")
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + LIGHTING);
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}
