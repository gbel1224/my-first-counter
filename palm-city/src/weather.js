// Palm City — weather. Tropical showers roll in: the sky clouds over and dims, streaks of rain
// fall around the camera, and the roads go dark and glossy (the ground shader's wet term).
import * as THREE from "../vendor/three.module.js";

export function createWeather(scene, sky, city) {
  const N = 2600;
  const pos = new Float32Array(N * 6), vel = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; scene.add(lines);
  for (let i = 0; i < N; i++) { vel[i] = 22 + Math.random() * 10; pos[i * 6] = pos[i * 6 + 3] = (Math.random() - 0.5) * 80; pos[i * 6 + 1] = Math.random() * 40; pos[i * 6 + 2] = pos[i * 6 + 5] = (Math.random() - 0.5) * 80; }
  const W = { mode: 0, rain: 0, target: 0, t: 90 };   // mode 0 auto · 1 rain · 2 clear
  function update(dt, cam) {
    if (W.mode === 1) W.target = 1; else if (W.mode === 2) W.target = 0;
    else { W.t -= dt; if (W.t <= 0) { W.target = W.target > 0.5 ? 0 : (Math.random() < 0.35 ? 1 : 0); W.t = W.target ? 60 + Math.random() * 60 : 120 + Math.random() * 180; } }
    W.rain += (W.target - W.rain) * Math.min(1, dt * 0.25);
    const r = W.rain;
    sky.uniforms.uCloud.value = 0.5 + r * 1.6;
    city.U.uWet.value = Math.min(1, r * 1.3);
    mat.opacity = r * 0.7;
    lines.visible = r > 0.02;
    sky.weatherDim = r;
    if (!lines.visible) return;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const n = Math.floor(N * r);
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      if (i >= n) { pos[o + 1] = pos[o + 4] = -999; continue; }
      let y = pos[o + 1] - vel[i] * dt;
      let x = pos[o], z = pos[o + 2];
      if (y < cy - 12 || Math.abs(x - cx) > 40 || Math.abs(z - cz) > 40 || y < -1) { x = cx + (Math.random() - 0.5) * 80; z = cz + (Math.random() - 0.5) * 80; y = cy + 8 + Math.random() * 28; }
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x + 0.1; pos[o + 4] = y + 1.5; pos[o + 5] = z + 0.06;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { update, W };
}
