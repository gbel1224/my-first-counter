// Palm City — photo-scanned street props (Poly Haven, CC0), decimated to a few hundred triangles
// each for phones; their normal maps carry the fine detail. They load after the city is up:
// hydrants and bins swap into the instanced meshes the simple stand-ins already fill (so props.js
// keeps knocking them about), and the clutter (trash bags, boxes, crates, concrete barriers) appears
// once its model arrives.
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { tileInstances } from "./geo.js";

// s: scale to real size; yaw: turn the model so its long side / front lines up with ours
const SRC = {
  hydrant: { s: 1.0, yaw: 0 },
  bin: { s: 1.05, yaw: 0 },
  barrier: { s: 1.0, yaw: 0 },
  trashbag: { s: 1.0, yaw: 0 },
  crate: { s: 1.0, yaw: 0 },
  box: { s: 1.15, yaw: 0 },
};
const SQUASH = { barrier: [1.3, 1, 1] };    // a 2 m concrete barrier (the scan is a short one), 0.8 m tall

// one geometry + material per model, standing on y = 0, centred in x/z
function bake(gltf, id) {
  const src = SRC[id];
  gltf.scene.updateMatrixWorld(true);
  let geo = null, mat = null;
  gltf.scene.traverse(o => { if (o.isMesh && !geo) { geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); mat = o.material; } });
  if (!geo) return null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -bb.min.y, -c.z);
  const sq = SQUASH[id] || [1, 1, 1];
  geo.scale(src.s * sq[0], src.s * sq[1], src.s * sq[2]);
  if (src.yaw) geo.rotateY(src.yaw);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, mat };
}

// swap: [[id, instancedMesh]] to re-skin; clutter: { id: [[x, y, z, rotY, rotX, scale], ...] } to place
export function loadRealProps(scene, swap, clutter, base = "") {
  const loader = new GLTFLoader();
  const want = new Set([...swap.map(([id]) => id), ...Object.keys(clutter)]);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return Promise.all([...want].map(id => loader.loadAsync(`${base}assets/props/${id}.glb`).then(gltf => {
    const b = bake(gltf, id); if (!b) return;
    for (const [sid, mesh] of swap) if (sid === id && mesh) { mesh.geometry.dispose(); mesh.geometry = b.geo; mesh.material = b.mat; }
    const list = clutter[id];
    if (list && list.length) {
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, list.length);
      list.forEach((it, i) => { m.compose(p.set(it[0], it[1], it[2]), q.setFromEuler(e.set(it[4] || 0, it[3], 0)), s.setScalar(it[5] || 1)); mesh.setMatrixAt(i, m); });
      mesh.castShadow = id === "barrier"; mesh.receiveShadow = true;
      scene.add(mesh);
      tileInstances(scene, mesh, 80, 130);              // static: tiles the renderer can skip, gone past ~130 m
    }
  }).catch(() => {})));                                // a missing model just leaves the stand-in
}
