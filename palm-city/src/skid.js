// Palm City — skid marks. Slide a car and the rear tyres lay rubber on the asphalt: short dark
// quads stitched between successive wheel positions, in one instanced ring buffer that slowly
// overwrites the oldest marks.
import * as THREE from "../vendor/three.module.js";

const N = 1400;
export function makeSkids(scene) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.95, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 1;
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  let next = 0;
  const last = new WeakMap();
  // call every frame for a car; `on` says whether it's sliding right now
  function track(c, on, y = 0.02) {
    const S = c.spec, fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    const back = -(S.wb || 2.6) / 2, half = (S.wid || 1.8) * 0.42;
    const pts = [-1, 1].map(sd => [c.x + fx * back + rx * half * sd, c.z + fz * back + rz * half * sd]);
    const prev = last.get(c);
    if (!on) { last.delete(c); return; }
    if (prev) {
      for (let w = 0; w < 2; w++) {
        const [x0, z0] = prev[w], [x1, z1] = pts[w], d = Math.hypot(x1 - x0, z1 - z0);
        if (d < 0.35) return;                               // wait until there's enough to draw
        if (d > 4) continue;                                // teleported: don't streak across town
        q.setFromAxisAngle(up, Math.atan2(x1 - x0, z1 - z0));
        m.compose(p.set((x0 + x1) / 2, y, (z0 + z1) / 2), q, s.set(0.24, 1, d + 0.05));
        mesh.setMatrixAt(next, m); next = (next + 1) % N; mesh.count = Math.max(mesh.count, next === 0 ? N : next);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    last.set(c, pts);
  }
  return { track, mesh };
}
