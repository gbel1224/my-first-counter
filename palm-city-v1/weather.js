// Palm City — weather: rain that follows the player, with a slow auto-cycle and wet-floor
// material response. Split out of game.js. The scene, lights and floor materials are injected
// via initWeather() — which also seeds the rain-streak positions, because that consumes the
// shared seeded RNG stream and must happen at the exact same point in startup as before.
import * as THREE from "./vendor/three.module.js";
import { rr } from "./util.js";

let scene = null, sun = null, hemi = null, roadMat = null, sidewalkMat = null;
const RAIN_N = 360;
const rainPos = new Float32Array(RAIN_N * 2 * 3);   // pairs of verts (streaks)
const rainLocal = new Float32Array(RAIN_N * 3);     // local x,y,z of each streak top, around the player
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rainSeg = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xbcd0ee, transparent: true, opacity: 0, fog: false }));
rainSeg.frustumCulled = false;
const _fogGray = new THREE.Color(0x6b7079);
// mode: 0 auto · 1 rain · 2 clear. Default CLEAR — the auto-cycle's grey-fog rain washing in and out
// reads as the screen "filtering" during play. Re-enable rain/auto from the settings panel.
export let weatherMode = (() => { try { const v = localStorage.getItem("palm_city_weather"); return v == null ? 2 : +v; } catch (e) { return 2; } })();
export function cycleWeatherMode() {
  weatherMode = (weatherMode + 1) % 3;
  try { localStorage.setItem("palm_city_weather", String(weatherMode)); } catch (e) {}
  return weatherMode;
}
let weather = 0, weatherTarget = 0, weatherTimer = 30;
export function initWeather(deps) {
  scene = deps.scene; sun = deps.sun; hemi = deps.hemi; roadMat = deps.roadMat; sidewalkMat = deps.sidewalkMat;
  for (let i = 0; i < RAIN_N; i++) { rainLocal[i * 3] = rr(-45, 45); rainLocal[i * 3 + 1] = rr(0, 46); rainLocal[i * 3 + 2] = rr(-45, 45); }
  scene.add(rainSeg);
}
export function updateWeather(dt, px, pz) {
  if (weatherMode === 1) weatherTarget = 1;
  else if (weatherMode === 2) weatherTarget = 0;
  else { weatherTimer -= dt; if (weatherTimer <= 0) { weatherTarget = Math.random() < 0.4 ? 1 : 0; weatherTimer = rr(45, 95); } }
  weather += (weatherTarget - weather) * Math.min(1, dt * 0.4);
  rainSeg.material.opacity = weather * 0.5;
  if (weather > 0.02) {
    for (let i = 0; i < RAIN_N; i++) {
      let y = rainLocal[i * 3 + 1] - dt * 65;
      if (y < -2) { y += 48; rainLocal[i * 3] = rr(-45, 45); rainLocal[i * 3 + 2] = rr(-45, 45); }
      rainLocal[i * 3 + 1] = y;
      const x = px + rainLocal[i * 3], z = pz + rainLocal[i * 3 + 2];
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y + 2.4; rainPos[i * 6 + 2] = z;       // streak top
      rainPos[i * 6 + 3] = x + 0.3; rainPos[i * 6 + 4] = y; rainPos[i * 6 + 5] = z;   // streak bottom
    }
    rainGeo.attributes.position.needsUpdate = true;
    scene.fog.color.lerp(_fogGray, weather * 0.45);                                   // grey, hazier mood
    sun.intensity *= (1 - weather * 0.35);
    hemi.intensity *= (1 - weather * 0.2);
  }
  // wet flooring: darker + far more reflective as the rain picks up
  if (roadMat) { roadMat.roughness = 0.62 - weather * 0.42; roadMat.envMapIntensity = 0.55 + weather * 0.95; roadMat.color.setScalar(1 - weather * 0.32); }
  if (sidewalkMat) { sidewalkMat.roughness = 0.85 - weather * 0.52; sidewalkMat.envMapIntensity = 0.35 + weather * 0.75; sidewalkMat.color.setScalar(1 - weather * 0.22); }
}
