// Palm City — the sea. A dense grid displaced by a few crossing swells in the vertex shader;
// the fragment adds fine ripple normals, reflects the actual sky colours (Fresnel), throws a sun
// glitter path, shades shallow turquoise → deep blue with distance from the beach, and draws a
// breaking foam line where the swell meets the sand.
import * as THREE from "../vendor/three.module.js";
import { HALF } from "./world.js";

export const SEA_Y = -0.55;

export function createOcean(scene, sky) {
  const U = {
    uTime: { value: 0 }, uZen: sky.uniforms.uZen, uHor: sky.uniforms.uHor, uSunCol: sky.uniforms.uSunCol, uSunDir: sky.uniforms.uSunDir,
    uNight: sky.uniforms.uNight, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.002 },
    uShore: { value: HALF + 44 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: false,
    vertexShader: `
      uniform float uTime; varying vec3 vWP; varying float vH;
      float wave(vec2 p, vec2 d, float f, float s){ return sin(dot(p, d) * f + uTime * s); }
      void main(){
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        float h = wave(p.xz, normalize(vec2(0.2, 1.0)), 0.07, 1.1) * 0.45
                + wave(p.xz, normalize(vec2(-0.6, 1.0)), 0.13, 1.7) * 0.22
                + wave(p.xz, normalize(vec2(0.9, 0.4)), 0.21, 2.3) * 0.1;
        h *= smoothstep(0.0, 40.0, p.z - ${HALF.toFixed(1)} - 38.0) * 0.8 + 0.2;   // calmer at the shore
        p.y += h; vH = h; vWP = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uNight, uFogD, uShore; uniform vec3 uZen, uHor, uSunCol, uSunDir, uFogCol;
      varying vec3 vWP; varying float vH;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
      float hgt(vec2 p){
        return vn(p * 0.35 + vec2(uTime * 0.25, uTime * 0.12)) * 0.6 + vn(p * 0.9 - vec2(uTime * 0.3, -uTime * 0.2)) * 0.3
             + vn(p * 2.3 + vec2(uTime * 0.6, uTime * 0.4)) * 0.1;
      }
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        // ripple normal from the height field (central differences) + the swell's slope
        float e = 0.25;
        vec2 p = vWP.xz;
        float dx = hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0));
        float dz = hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e));
        vec3 Nn = normalize(vec3(-dx * 0.9 - dFdx(vH) * 0.0, 1.0, -dz * 0.9));
        vec3 Ng = normalize(cross(dFdy(vWP), dFdx(vWP)));
        if (Ng.y < 0.0) Ng = -Ng;
        vec3 N = normalize(Ng + (Nn - vec3(0.0, 1.0, 0.0)));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 skyR = mix(uHor, uZen, pow(clamp(R.y, 0.0, 1.0), 0.45));
        float depth = clamp((vWP.z - uShore) / 160.0, 0.0, 1.0);
        vec3 shallow = vec3(0.10, 0.52, 0.55), deep = vec3(0.02, 0.14, 0.26);
        vec3 body = mix(shallow, deep, sqrt(depth)) * (0.35 + 0.65 * max(uSunDir.y, 0.1)) * (1.0 - uNight * 0.8);
        // subsurface-ish glow through wave crests facing the sun
        body += shallow * max(vH, 0.0) * 0.25 * max(dot(-V.xz, uSunDir.xz), 0.0);
        vec3 col = mix(body, skyR, fres);
        // sun glitter
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 420.0) * 60.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.6;
        col += uSunCol * spec * (1.0 - uNight) * step(0.0, uSunDir.y);
        // foam: the break line at the beach + sparse whitecaps on crests
        float sh = vWP.z - uShore;
        float surge = sin(uTime * 0.8) * 1.5;
        float foamLine = smoothstep(6.0 + surge, 0.0 + surge, sh) * smoothstep(-3.0, 1.0 + surge, sh);
        float foamN = vn(p * 1.4 + uTime * 0.3) * vn(p * 3.1 - uTime * 0.2);
        float foam = clamp(foamLine * (0.5 + foamN * 1.4), 0.0, 1.0) + smoothstep(0.62, 0.9, vH + foamN * 0.5) * 0.35 * depth;
        col = mix(col, vec3(0.95, 0.97, 0.98) * (0.4 + 0.6 * max(uSunDir.y, 0.15)), clamp(foam, 0.0, 1.0));
        // fog to the horizon
        float d = length(cameraPosition - vWP);
        col = mix(col, uFogCol, 1.0 - exp(-uFogD * uFogD * d * d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const W = HALF * 2 + 1600;
  const geo = new THREE.PlaneGeometry(W, 700, 220, 110);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, SEA_Y, HALF + 30 + 350);
  mesh.frustumCulled = false;
  scene.add(mesh);
  function update(time, fog) {
    U.uTime.value = time;
    U.uFogCol.value.copy(fog.color); U.uFogD.value = fog.density;
  }
  return { update, mesh };
}
