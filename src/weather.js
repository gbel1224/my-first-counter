// Palm City — weather. Tropical showers and thunderstorms roll in off the sea: the sky closes over grey
// and the light goes flat (sky.js), rain falls around the camera on the wind, slanted and heavier in a
// storm, bouncing up in little splashes off the street; the roads, the sand and the cars go dark and
// glossy. In a storm, lightning: a jagged bolt (with its branches) cracks down somewhere out across the
// city or the bay, the whole sky and street flash, and the thunder arrives after it — a sharp crack
// close by, a long low roll from far away.
import * as THREE from "../vendor/three.module.js";
import { AudioSys } from "./audio.js";

export function createWeather(scene, sky, city) {
  const N = 3600;
  const pos = new Float32Array(N * 6), vel = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x8a96a4, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; scene.add(lines);
  for (let i = 0; i < N; i++) { vel[i] = 22 + Math.random() * 10; pos[i * 6] = pos[i * 6 + 3] = (Math.random() - 0.5) * 80; pos[i * 6 + 1] = Math.random() * 40; pos[i * 6 + 2] = pos[i * 6 + 5] = (Math.random() - 0.5) * 80; }
  // splashes: tiny crowns of droplets where the rain hits the ground near you
  const NS = 500, spos = new Float32Array(NS * 3), slife = new Float32Array(NS);
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  const smat = new THREE.PointsMaterial({ color: 0xc8d4e0, size: 0.07, transparent: true, opacity: 0, depthWrite: false });
  const splashes = new THREE.Points(sgeo, smat); splashes.frustumCulled = false; scene.add(splashes);
  let sNext = 0;
  // lightning: a bolt of jagged segments, flashed for a fraction of a second
  const bgeo = new THREE.BufferGeometry(); const bpos = new Float32Array(400 * 6); bgeo.setAttribute("position", new THREE.BufferAttribute(bpos, 3));
  const bmat = new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0, fog: false, toneMapped: false });
  const bolt = new THREE.LineSegments(bgeo, bmat); bolt.frustumCulled = false; scene.add(bolt);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), glowMat); glow.frustumCulled = false; scene.add(glow);
  const W = { mode: 0, rain: 0, target: 0, t: 90, storm: 0, wind: 0.3 };   // mode 0 auto · 1 rain · 2 clear · 3 storm
  const L = { t: 12, flick: [], strike: null };
  function makeBolt(x0, z0, x1, z1) {
    let n = 0;
    const seg = (ax, ay, az, bx, by, bz, depth) => {
      const steps = depth ? 6 : 22;
      let px = ax, py = ay, pz = az;
      for (let k = 1; k <= steps && n < 399; k++) {
        const t = k / steps;
        const jx = (Math.random() - 0.5) * (depth ? 10 : 18) * (1 - t * 0.5), jz = (Math.random() - 0.5) * (depth ? 10 : 18) * (1 - t * 0.5);
        const nx = ax + (bx - ax) * t + (k < steps ? jx : 0), ny = ay + (by - ay) * t, nz = az + (bz - az) * t + (k < steps ? jz : 0);
        bpos.set([px, py, pz, nx, ny, nz], n * 6); n++;
        if (!depth && k > 2 && k < steps - 3 && Math.random() < 0.28) seg(nx, ny, nz, nx + (Math.random() - 0.5) * 90, ny - 30 - Math.random() * 50, nz + (Math.random() - 0.5) * 90, 1);
        px = nx; py = ny; pz = nz;
      }
    };
    seg(x0, 260, z0, x1, 0, z1, 0);
    for (let k = n; k < 400; k++) bpos.fill(0, k * 6, k * 6 + 6);
    bgeo.attributes.position.needsUpdate = true; bgeo.setDrawRange(0, n * 2);
  }
  // thunder: a crack (close) and a long low roll, both made of filtered noise
  function thunder(dist) {
    const ctx = AudioSys.ctx; if (!ctx || AudioSys.muted || !AudioSys.noise) return;
    const t = ctx.currentTime + 0.02, near = Math.max(0, 1 - dist / 1500), vol = 0.25 + near * 0.75;
    const mk = (type, f, q, a, len, v, t0) => {
      const s = ctx.createBufferSource(); s.buffer = AudioSys.noise; s.loop = true;
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      s.connect(b); b.connect(g); g.connect(AudioSys.out); s.start(t0, Math.random() * 0.5); s.stop(t0 + len + 0.1);
    };
    if (near > 0.5) mk("highpass", 1200, 0.5, 0.005, 0.5, 0.7 * near, t);                       // the crack
    for (let k = 0; k < 4; k++) mk("lowpass", 120 + Math.random() * 160, 0.9, 0.15 + k * 0.2, 2.5 + Math.random() * 2.5 + (1 - near) * 2, vol * (0.9 - k * 0.15), t + k * (0.4 + Math.random() * 0.6));   // the roll
  }
  function update(dt, cam, indoors) {
    if (W.mode === 1) W.target = 0.75; else if (W.mode === 2) W.target = 0; else if (W.mode === 3) W.target = 1;
    else { W.t -= dt; if (W.t <= 0) { W.target = W.target > 0.3 ? 0 : (Math.random() < 0.35 ? (Math.random() < 0.4 ? 1 : 0.7) : 0); W.t = W.target ? 60 + Math.random() * 90 : 120 + Math.random() * 180; } }
    W.rain += (W.target - W.rain) * Math.min(1, dt * 0.25);
    const r = W.rain;
    W.storm = Math.max(0, (r - 0.72) / 0.28);                 // past this it's a thunderstorm
    W.wind = 0.3 + r * 0.9;
    sky.uniforms.uCloud.value = 0.5 + r * 1.6;
    city.U.uWet.value = indoors ? 0 : Math.min(1, r * 1.3);   // (no wet sheen on your floor)
    sky.weatherDim = Math.min(1, r * 1.15);
    // ---- lightning ----
    let flash = 0;
    if (W.storm > 0.2 && !W.noBolt) {
      L.t -= dt;
      if (L.t <= 0) {
        L.t = 6 + Math.random() * 16 / W.storm;
        const a = Math.random() * 6.28, d = 250 + Math.random() * 900;
        const x = cam.position.x + Math.cos(a) * d, z = cam.position.z + Math.sin(a) * d;
        makeBolt(x + (Math.random() - 0.5) * 60, z + (Math.random() - 0.5) * 60, x, z);
        L.flick = [[0, 0.06], [0.1, 0.05], [0.22, 0.09]].slice(0, 1 + ((Math.random() * 3) | 0));
        L.age = 0; L.dist = d;
        glow.position.set(x, 230, z); glow.scale.setScalar(120 + Math.random() * 80);
        L.thunderAt = d / 343;                                 // sound is slow
      }
    }
    if (L.age !== undefined) {
      L.age += dt;
      for (const [t0, len] of L.flick) if (L.age >= t0 && L.age < t0 + len) flash = 1;
      if (L.thunderAt !== undefined && L.age >= L.thunderAt) { if (!indoors) thunder(L.dist); else thunder(L.dist * 2); L.thunderAt = undefined; }
      if (L.age > 0.4 && L.thunderAt === undefined) L.age = undefined;
    }
    const fade = flash ? 1 : 0;
    bmat.opacity = fade; glowMat.opacity = fade * 0.25 * W.storm;
    bolt.visible = glow.visible = !!fade && !indoors;
    sky.flash = indoors ? flash * 0.15 : flash * Math.max(0.3, 1 - (L.dist || 0) / 1500);
    // ---- rain ----
    mat.opacity = Math.min(0.5, r * 0.5);
    lines.visible = r > 0.02 && !indoors;
    if (!lines.visible) { splashes.visible = false; return; }
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const n = Math.floor(N * Math.min(1, r * 1.1));
    const wx = W.wind * 0.35, wz = W.wind * 0.12, len = 1.2 + W.storm * 0.8;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      if (i >= n) { pos[o + 1] = pos[o + 4] = -999; continue; }
      const v = vel[i] * (1 + W.storm * 0.3);
      let y = pos[o + 1] - v * dt;
      let x = pos[o] + wx * v * dt, z = pos[o + 2] + wz * v * dt;
      if (y < cy - 12 || Math.abs(x - cx) > 40 || Math.abs(z - cz) > 40 || y < -1) {
        // a drop that's reached the ground near you splashes
        if (y < 0.6 && Math.abs(x - cx) < 14 && Math.abs(z - cz) < 14 && Math.random() < 0.5) { const k = sNext++ % NS; spos[k * 3] = x; spos[k * 3 + 1] = Math.max(0.05, groundAt(x, z) + 0.05); spos[k * 3 + 2] = z; slife[k] = 0.18; }
        x = cx + (Math.random() - 0.5) * 80; z = cz + (Math.random() - 0.5) * 80; y = cy + 8 + Math.random() * 28;
      }
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x - wx * len; pos[o + 4] = y + len; pos[o + 5] = z - wz * len;
    }
    geo.attributes.position.needsUpdate = true;
    for (let k = 0; k < NS; k++) if (slife[k] > 0) { slife[k] -= dt; spos[k * 3 + 1] += dt * 0.8; if (slife[k] <= 0) spos[k * 3 + 1] = -999; }
    sgeo.attributes.position.needsUpdate = true;
    splashes.visible = true; smat.opacity = Math.min(0.8, r);
  }
  let groundAt = () => 0;
  return { update, W, setGround(f) { groundAt = f; } };
}
