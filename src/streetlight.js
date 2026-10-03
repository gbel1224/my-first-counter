// Palm City — street lighting. Hundreds of street lamps can't each be a real light, so their light
// is baked once into a map over the whole city: how much lamplight falls on each square metre of
// ground, and from which way it comes. Every lit material in the game reads that map after dark
// (patched into three's own lighting chunks), so the road, the pavements, the walls, the cars and
// the people all stand in warm pools of lamplight, with highlights on anything shiny.
import * as THREE from "../vendor/three.module.js";

const RES = 1024;
const H = 6.3;          // lamp head above the ground
const REACH = 28;       // how far a lamp's pool spreads (m)
const DIR = 20;         // range of the stored lamp offset (m)
const data = new Uint8Array(RES * RES * 4);
const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
tex.needsUpdate = true;

const P = { k: 0, ox: 0, oz: 0, inv: 0 };
// the uniform value is a plain object, not a THREE.Vector4: materials copy their uniforms when
// they compile, but this they share by reference, so turning the lamps up reaches all of them
const PARAM = { get x() { return P.k; }, get y() { return P.ox; }, get z() { return P.oz; }, get w() { return P.inv; } };

THREE.ShaderChunk.lights_pars_begin += `
uniform sampler2D uSLMap; uniform vec4 uSLParam;
`;
THREE.ShaderChunk.lights_fragment_end = `
#if defined( RE_Direct )
if ( uSLParam.x > 0.001 ) {
  vec3 slW = ( - vViewPosition ) * mat3( viewMatrix ) + cameraPosition;
  vec2 slUV = ( slW.xz - uSLParam.yz ) * uSLParam.w;
  if ( slW.y < 16.0 && slUV.x > 0.0 && slUV.y > 0.0 && slUV.x < 1.0 && slUV.y < 1.0 ) {
    vec4 slS = texture2D( uSLMap, slUV );
    if ( slS.r > 0.004 ) {
      vec2 slOff = ( slS.gb * 2.0 - 1.0 ) * ${DIR.toFixed(1)};
      float slR2 = dot( slOff, slOff );
      float slH = max( ${H.toFixed(2)} - slW.y, 0.35 );
      vec3 slL = normalize( vec3( slOff.x, slH, slOff.y ) );
      // the map holds light on the ground; nearer the lamp head it's brighter, and a wall or a face
      // turned to the lamp catches more than the flat ground did
      float slNear = clamp( ( ${(H * H).toFixed(2)} + slR2 ) / ( slH * slH + slR2 ), 0.0, 3.5 );
      float slCos = ${H.toFixed(2)} * inversesqrt( ${(H * H).toFixed(2)} + slR2 );
      float slFade = 1.0 - smoothstep( 8.0, 15.0, slW.y );
      IncidentLight slLight;
      slLight.color = vec3( 1.0, 0.76, 0.48 ) * ( slS.r * slS.r * 2.0 * uSLParam.x * slNear * slFade / max( slCos, 0.3 ) );
      slLight.direction = normalize( mat3( viewMatrix ) * slL );
      slLight.visible = true;
      RE_Direct( slLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    }
  }
}
#endif
` + THREE.ShaderChunk.lights_fragment_end;
for (const k of ["lambert", "phong", "standard", "physical", "toon"]) {
  const u = THREE.ShaderLib[k] && THREE.ShaderLib[k].uniforms;
  if (u) { u.uSLMap = { value: tex }; u.uSLParam = { value: PARAM }; }
}

// bake the lamps (heads as [x, y, z]) into the map; must run before the first frame is drawn
export function bakeStreetLights(heads, half) {
  const ext = half + 40, mpp = (ext * 2) / RES;
  P.ox = -ext; P.oz = -ext; P.inv = 1 / (ext * 2);
  const E = new Float32Array(RES * RES), VX = new Float32Array(RES * RES), VZ = new Float32Array(RES * RES);
  const rp = Math.ceil(REACH / mpp);
  for (const [lx, ly, lz] of heads) {
    const h = Math.max(3, ly), ci = Math.round((lx + ext) / mpp), cj = Math.round((lz + ext) / mpp);
    for (let j = Math.max(0, cj - rp); j <= Math.min(RES - 1, cj + rp); j++) {
      const wz = -ext + (j + 0.5) * mpp, dz = lz - wz;
      for (let i = Math.max(0, ci - rp); i <= Math.min(RES - 1, ci + rp); i++) {
        const wx = -ext + (i + 0.5) * mpp, dx = lx - wx, r2 = dx * dx + dz * dz;
        if (r2 > REACH * REACH) continue;
        const d2 = r2 + h * h, cut = 1 - r2 / (REACH * REACH);
        // ground irradiance from a point light: cos / d^2; the lens throws light down and out
        const e = (h / (d2 * Math.sqrt(d2))) * cut * cut * H * H;
        const k = j * RES + i;
        E[k] += e; VX[k] += e * dx; VZ[k] += e * dz;
      }
    }
  }
  for (let k = 0; k < RES * RES; k++) {
    const e = E[k];
    // stored as sqrt so the dim edges of a pool keep their precision
    data[k * 4] = Math.min(255, Math.sqrt(Math.min(e, 2) / 2) * 255);
    const ox = e > 0 ? VX[k] / e : 0, oz = e > 0 ? VZ[k] / e : 0;
    data[k * 4 + 1] = Math.round(127.5 + Math.max(-1, Math.min(1, ox / DIR)) * 127.5);
    data[k * 4 + 2] = Math.round(127.5 + Math.max(-1, Math.min(1, oz / DIR)) * 127.5);
    data[k * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
}

// how bright the lamps are now (0 by day)
export function setStreetLights(k) { P.k = k; }
