// Palm City — sky, sun and lighting. One analytic sky shader (gradient + sun disc + halo +
// drifting fbm clouds) is both what you see AND, rendered once into a PMREM cube, the image-based
// light every PBR surface reflects — so car paint and glass towers mirror the actual sky.
import * as THREE from "../vendor/three.module.js";
import { clamp, lerp } from "./world.js";
import { isMobile } from "./render.js";

// Palette keyed by sun elevation (radians). Colours are linear-ish scene values.
const KEYS = [
  { e: -0.30, zen: 0x070b1c, hor: 0x141a30, sun: 0x000000, si: 0.0, hemi: 0.16, sky: 0x2a3560, gnd: 0x100c10, fog: 0x121a2c },
  { e: -0.05, zen: 0x16244e, hor: 0xc86a52, sun: 0xff6a3a, si: 0.3, hemi: 0.22, sky: 0x6a6a9a, gnd: 0x2a1e1c, fog: 0x7a5a5c },
  { e: 0.06, zen: 0x2a58a0, hor: 0xf2a070, sun: 0xff9050, si: 2.6, hemi: 0.26, sky: 0x98a8cc, gnd: 0x5a4030, fog: 0xd8a888 },
  // day: deep saturated blue overhead, a pale humid haze at the horizon, a hot hard sun
  { e: 0.22, zen: 0x1c56b4, hor: 0xe6d6bc, sun: 0xffd6a0, si: 3.6, hemi: 0.42, sky: 0x9ab2d4, gnd: 0x9a7e60, fog: 0xd8d0c0 },
  { e: 0.60, zen: 0x1650b8, hor: 0xd4dcdc, sun: 0xfff0dc, si: 4.0, hemi: 0.45, sky: 0xa0b8dc, gnd: 0xa08466, fog: 0xcfd6d4 },
  { e: 1.40, zen: 0x124cb8, hor: 0xcad8e0, sun: 0xffffff, si: 4.2, hemi: 0.45, sky: 0xa6bee0, gnd: 0xa08a6c, fog: 0xc8d4d8 },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function sample(e, key, out) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  if (e <= a.e) return typeof a[key] === "number" && out ? out.set(a[key]) : a[key];   // deep night: hold the lowest key
  for (let i = 1; i < KEYS.length; i++) if (KEYS[i].e >= e) { a = KEYS[i - 1]; b = KEYS[i]; break; }
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  if (typeof a[key] === "number" && key !== "si" && key !== "hemi" && key !== "e") return out.copy(_c1.set(a[key])).lerp(_c2.set(b[key]), t);
  return lerp(a[key], b[key], t);
}

const SKY_FRAG = `
  uniform vec3 uZen, uHor, uSunCol, uSunDir; uniform float uTime, uNight, uCloud, uEnv;
  varying vec3 vDir;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    float up = pow(clamp(h, 0.0, 1.0), 0.55);
    vec3 col = mix(uHor, uZen, up);
    // below the horizon: haze fading to a darker band (only ever seen over the sea)
    col = mix(col, uHor * 0.72, smoothstep(0.0, -0.25, h));
    float sd = max(dot(d, uSunDir), 0.0);
    // atmospheric glow around the sun, stronger near the horizon (low sun = big warm halo)
    float hz = 1.0 - clamp(uSunDir.y * 2.0, 0.0, 1.0);
    col += uSunCol * (pow(sd, 6.0) * (0.18 + 0.5 * hz) + pow(sd, 48.0) * 0.6) * (1.0 - uEnv * 0.7);
    // clouds: towering humid cumulus banked toward the horizon, bright sunlit tops, blue-grey bases
    if (h > 0.0) {
      vec2 p = d.xz / (h + 0.08) * 1.1 + vec2(uTime * 0.003, uTime * 0.001);
      float n = fbm(p * 1.3) * 0.7 + fbm(p * 4.1) * 0.3;
      float bank = 1.0 - smoothstep(0.05, 0.55, h);            // more cloud near the horizon
      float cov = smoothstep(0.58 - bank * 0.18 - uCloud * 0.1, 0.8, n);
      float top = smoothstep(0.35, 0.9, fbm(p * 1.3 + uSunDir.xz * 0.25 + vec2(0.0, 0.3)));
      vec3 base = mix(uZen * 0.5 + uHor * 0.35, uHor * 0.8, 0.4);
      vec3 cc = mix(base, vec3(1.05, 1.02, 0.98), 0.35 + 0.65 * top) + uSunCol * pow(sd, 4.0) * 0.5;
      cc = mix(cc, uHor * 0.3, uNight * 0.85);
      col = mix(col, cc, cov * smoothstep(0.0, 0.05, h) * 0.95);
    }
    // the sun disc itself — HDR bright so the bloom picks it up
    col += uSunCol * smoothstep(0.99955, 0.99975, sd) * 26.0 * (1.0 - uNight) * (1.0 - uEnv);   // the sun is the key light's job, not the IBL's
    // stars at night
    if (uNight > 0.0 && h > 0.0) {
      vec2 sp = d.xz / (h + 0.3) * 90.0;
      float s = step(0.9985, hash(floor(sp))) * uNight * smoothstep(0.0, 0.3, h);
      col += vec3(s * 1.6);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createSky(scene, renderer) {
  const U = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0.5 }, uEnv: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const SM = isMobile ? 2048 : 4096;
  sun.shadow.mapSize.set(SM, SM);
  const R = isMobile ? 80 : 110;
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 600 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.0021);   // humid air: haze thickens with distance, never a hard wall

  // environment map: the same sky, rendered once into a prefiltered cube for PBR reflections
  const envScene = new THREE.Scene();
  // same shader and SAME uniforms, but a plain projection: the depth-at-far-plane trick the visible
  // dome uses gets clipped inside the cube camera and would leave the reflections black
  const envMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uEnv: { value: 1 } }), side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: SKY_FRAG,
  });
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat);
  envScene.add(envDome);
  // a warm "ground" hemisphere so reflections pick up the city's bounce light, not a black void
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x8a7a66, side: THREE.BackSide });
  const envGround = new THREE.Mesh(new THREE.SphereGeometry(9.5, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2), groundMat);
  envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envAt = -1;

  const sunDir = new THREE.Vector3();
  const base = { si: 3, hemi: 0.4, fog: new THREE.Color() }, grey = new THREE.Color(0x8a9096);
  const out = {};
  const state = { t: 0.63, cycle: false, night: 0, elev: 0, cloud: 0.5 };

  function set(t) {
    state.t = ((t % 1) + 1) % 1;
    const a = (state.t - 0.25) * Math.PI * 2;            // 0.25 sunrise (east), 0.5 noon, 0.75 sunset (west)
    const el = Math.sin(a) * 1.15;                       // peak elevation ~66°
    // rises in the east (+x), sets in the west (-x), arcing over the sea side (south, +z)
    sunDir.set(Math.cos(a) * Math.cos(el), Math.sin(el), 0.45 * Math.cos(el)).normalize();
    state.elev = el;
    state.night = clamp((-el + 0.02) / 0.25, 0, 1);
    sample(el, "zen", U.uZen.value); sample(el, "hor", U.uHor.value); sample(el, "sun", U.uSunCol.value);
    U.uSunDir.value.copy(sunDir); U.uNight.value = state.night;
    sun.color.copy(U.uSunCol.value).lerp(new THREE.Color(0xffffff), 0.1);
    sun.intensity = sample(el, "si");
    sample(el, "sky", hemi.color); sample(el, "gnd", hemi.groundColor);
    hemi.intensity = sample(el, "hemi");
    sample(el, "fog", scene.fog.color);
    base.si = sun.intensity; base.hemi = hemi.intensity; base.fog.copy(scene.fog.color);
    groundMat.color.copy(hemi.groundColor).multiplyScalar(0.8);
    // moonlight: keep a faint cool key light so night isn't pitch black
    if (el < 0) { sun.color.set(0x8fa6e0); sun.intensity = 0.35; sunDir.set(0.3, 0.8, -0.4).normalize(); }
    // re-bake reflections only when the sky has visibly moved
    if (!envRT || Math.abs(state.t - envAt) > 0.006) {
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
      scene.environment = envRT.texture;
      envAt = state.t;
    }
  }
  set(state.t);

  function update(dt, time, focus, camera) {
    U.uTime.value = time;
    if (state.cycle) set(state.t + dt / 960);            // a full day in 16 minutes
    // weather: a shower dims the sun, flattens the light, thickens and greys the haze
    const w = out.weatherDim || 0;
    sun.intensity = base.si * (1 - 0.78 * w); hemi.intensity = base.hemi * (1 + 0.15 * w);
    scene.fog.density = 0.0021 * (1 + w * 1.4); scene.fog.color.copy(base.fog).lerp(grey, w * 0.7);
    dome.position.copy(camera.position);
    // shadow frustum follows the action, snapped to whole texels so edges don't crawl
    const tex = (R * 2) / SM;
    const fx = Math.round(focus.x / tex) * tex, fz = Math.round(focus.z / tex) * tex;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + sunDir.x * 300, Math.max(40, sunDir.y * 300), fz + sunDir.z * 300);
  }

  return Object.assign(out, { set, update, state, sun, hemi, uniforms: U, sunDir, envTex: () => envRT.texture });
}
