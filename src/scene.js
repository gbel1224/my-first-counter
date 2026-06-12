/* The one 3D scene: menu background AND gameplay arena (no loading wall).
   Performance law: no shadows, instanced cover/beams/sparks, pooled everything. */
import * as THREE from 'three';
import { CONFIG, COL, BEAM_COLORS } from './config.js';
import { COVER_SPOTS } from './core/world.js';
import {
  loadTexture, loadModel, firstMesh,
  buildDroneFallback, buildRifleFallback, buildCoverFallback, buildPadFallback,
} from './assets.js';
import { mulberry32 } from './core/rng.js';

export async function createScene(mount) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 120);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.AmbientLight(0x2a3850, 1.6));
  scene.add(new THREE.HemisphereLight(0x2e4060, 0x10141f, 1.1));
  const keyLight = new THREE.PointLight(COL.cyan, 1.3, 80, 0.9);
  keyLight.position.set(0, 10, 0); scene.add(keyLight);

  const S = CONFIG.arenaSize, H = CONFIG.wallHeight;

  /* floor: tiled texture plane + cyan grid */
  const floorTex = loadTexture('floor_tile.png', S / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0xd8e0f0, roughness: .85, metalness: .2 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(S, 30, COL.cyan, 0x123040);
  grid.material.transparent = true; grid.material.opacity = .35; grid.position.y = .01; scene.add(grid);

  /* perimeter walls (one merged geometry per pair would save calls; 4+4 is within budget) */
  const wallTex = loadTexture('wall_tile.png', 1);
  wallTex.repeat.set(10, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xb8c0d0, roughness: .8, metalness: .3 });
  const plainMat = new THREE.MeshStandardMaterial({ color: COL.panel2, roughness: .8, metalness: .3 });
  const trimMat = new THREE.MeshBasicMaterial({ color: COL.cyan });
  [[0, -S / 2], [0, S / 2]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(S, H, CONFIG.wallThickness), wallMat); w.position.set(x, H / 2, z); scene.add(w);
    const t = new THREE.Mesh(new THREE.BoxGeometry(S, .12, CONFIG.wallThickness + .04), trimMat); t.position.set(x, H - 1.4, z); scene.add(t);
  });
  [[-S / 2, 0], [S / 2, 0]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.wallThickness, H, S), wallMat); w.position.set(x, H / 2, z); scene.add(w);
    const t = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.wallThickness + .04, .12, S), trimMat); t.position.set(x, H - 1.4, z); scene.add(t);
  });

  /* ---------- GLB props (procedural fallback per brief §11) ---------- */
  const [droneSrc, rifleSrc, coverSrc, powerPadSrc, jumpPadSrc] = await Promise.all([
    loadModel('drone.glb', buildDroneFallback),
    loadModel('rifle.glb', buildRifleFallback),
    loadModel('cover_block.glb', () => { const g = new THREE.Group(); g.add(buildCoverFallback()); return g; }),
    loadModel('power_pad.glb', () => { const g = new THREE.Group(); g.add(buildPadFallback(COL.green)); return g; }),
    loadModel('jump_pad.glb', () => { const g = new THREE.Group(); g.add(buildPadFallback(COL.cyan)); return g; }),
  ]);

  /* cover blocks — ONE InstancedMesh (performance law) + glow trim instances */
  const coverMesh = firstMesh(coverSrc);
  const coverGeo = coverMesh ? coverMesh.geometry : new THREE.BoxGeometry(1.91, 1.61, 1.05);
  const coverMat = coverMesh ? coverMesh.material : plainMat;
  coverGeo.computeBoundingBox();
  const cb = coverGeo.boundingBox, cSize = new THREE.Vector3(); cb.getSize(cSize);
  const blocks = new THREE.InstancedMesh(coverGeo, coverMat, COVER_SPOTS.length);
  const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(2.46, .07, 1.46), trimMat, COVER_SPOTS.length);
  const dummy = new THREE.Object3D();
  COVER_SPOTS.forEach(([x, z, rot, h], i) => {
    // scale GLB bounds to the sim's collision box (2.4 × h × 1.4), rotated 90° when flagged
    dummy.position.set(x - (cb.min.x + cSize.x / 2) * 0, 0, z);
    dummy.position.y = -cb.min.y * (h / cSize.y);
    dummy.scale.set(2.4 / cSize.x, h / cSize.y, 1.4 / cSize.z);
    dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    blocks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, h + .03, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    trims.setMatrixAt(i, dummy.matrix);
  });
  scene.add(blocks); scene.add(trims);

  /* balconies (high lanes) */
  for (const [bx, by, bz, bw, bd] of CONFIG.balconies) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, .4, bd), plainMat);
    slab.position.set(bx, by - .2, bz); scene.add(slab);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(bw + .06, .08, bd + .06), trimMat);
    tr.position.set(bx, by + .01, bz); scene.add(tr);
  }

  /* pads: GLB bases + animated emissive rings (ring = state channel) */
  const padRings = [];
  function placePad(src, x, z, color, diameter) {
    const base = src.clone();
    const box = new THREE.Box3().setFromObject(base);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const k = diameter / Math.max(sz.x, sz.z);
    base.scale.setScalar(k);
    base.position.set(x, -box.min.y * k, z);
    scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(diameter * .42, .06, 8, 6),
      new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, .26, z); scene.add(ring);
    padRings.push(ring);
    return ring;
  }
  const powerRing = placePad(powerPadSrc, CONFIG.powerPadPos[0], CONFIG.powerPadPos[1], COL.green, 2.8);
  for (const [jx, jz] of CONFIG.jumpPads) placePad(jumpPadSrc, jx, jz, COL.cyan, 2.6);
  for (const [sx, sz] of CONFIG.spawnPads) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, .16, 6), plainMat);
    base.position.set(sx, .08, sz); scene.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, .05, 8, 6), trimMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(sx, .2, sz); scene.add(ring);
    padRings.push(ring);
  }

  /* ---------- drones (one GLB, cloned — shared geometry/materials) ---------- */
  const drones = [];
  {
    const box = new THREE.Box3().setFromObject(droneSrc);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const k = 1.7 / Math.max(sz.x, sz.y, sz.z);  // ~1.7u silhouette ≈ body height
    for (let i = 0; i < CONFIG.botCount; i++) {
      const g = new THREE.Group();
      const m = droneSrc.clone();
      m.scale.setScalar(k);
      const c = new THREE.Vector3(); box.getCenter(c);
      m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
      g.add(m);
      // emissive accents on top of the baked GLB (brief §11 note): core + eye strip
      const eye = new THREE.Mesh(new THREE.BoxGeometry(.5, .09, .07),
        new THREE.MeshBasicMaterial({ color: COL.magenta }));
      eye.position.set(0, sz.y * k * .62, sz.z * k * .42);
      g.add(eye);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0),
        new THREE.MeshBasicMaterial({ color: COL.magenta }));
      core.position.set(0, sz.y * k * .35, 0);
      g.add(core);
      scene.add(g);
      drones.push(g);
    }
  }

  /* ---------- rifle viewmodel (player) ---------- */
  const rifle = new THREE.Group();
  {
    const box = new THREE.Box3().setFromObject(rifleSrc);
    const sz = new THREE.Vector3(); box.getSize(sz);
    const k = .85 / Math.max(sz.x, sz.y, sz.z);
    const m = rifleSrc.clone();
    m.scale.setScalar(k);
    const c = new THREE.Vector3(); box.getCenter(c);
    m.position.set(-c.x * k, -c.y * k, -c.z * k);
    m.rotation.y = Math.PI / 2; // GLB is modeled side-on; point it down -z
    rifle.add(m);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.02, .015, .4),
      new THREE.MeshBasicMaterial({ color: COL.cyan }));
    strip.position.set(0, .05, -.1);
    rifle.add(strip);
    rifle.position.set(.34, -.26, -.55);
    rifle.rotation.y = .06;
    rifle.visible = false;
    camera.add(rifle);
  }
  scene.add(camera);

  /* ---------- beam pool: single InstancedMesh, max CONFIG.beamPoolSize ---------- */
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  beamGeo.rotateX(Math.PI / 2); // align length to +z so lookAt works
  const beamMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, CONFIG.beamPoolSize);
  beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beams.count = CONFIG.beamPoolSize;
  beams.frustumCulled = false;
  const beamLife = new Float32Array(CONFIG.beamPoolSize);
  const beamSeg = []; // [{start,end}]
  for (let i = 0; i < CONFIG.beamPoolSize; i++) {
    beams.setColorAt(i, new THREE.Color(0)); beamSeg.push({ s: new THREE.Vector3(), e: new THREE.Vector3() });
  }
  scene.add(beams);
  let beamCursor = 0;
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _sc = new THREE.Vector3();
  const _col = new THREE.Color();

  function spawnBeam(start, end, color) {
    const i = beamCursor; beamCursor = (beamCursor + 1) % CONFIG.beamPoolSize;
    beamLife[i] = CONFIG.beamFade;
    beamSeg[i].s.copy(start); beamSeg[i].e.copy(end);
    beams.setColorAt(i, _col.set(color));
    beams.instanceColor.needsUpdate = true;
  }

  function updateBeams(dt) {
    for (let i = 0; i < CONFIG.beamPoolSize; i++) {
      if (beamLife[i] <= 0) { _m.makeScale(0, 0, 0); beams.setMatrixAt(i, _m); continue; }
      beamLife[i] -= dt;
      const k = Math.max(beamLife[i] / CONFIG.beamFade, 0);
      const seg = beamSeg[i];
      const len = seg.s.distanceTo(seg.e);
      _v.addVectors(seg.s, seg.e).multiplyScalar(.5);
      _m.lookAt(seg.s, seg.e, camera.up);
      _q.setFromRotationMatrix(_m);
      _sc.set(CONFIG.beamRadius * k, CONFIG.beamRadius * k, len);
      _m.compose(_v, _q, _sc);
      beams.setMatrixAt(i, _m);
    }
    beams.instanceMatrix.needsUpdate = true;
  }

  /* ---------- hit sparks: one InstancedMesh pool ---------- */
  const vfxRng = mulberry32(0xF5A3 ^ 12345); // VFX seed — separate from logic RNG
  const sparkGeo = new THREE.OctahedronGeometry(.07, 0);
  const sparks = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), CONFIG.sparkPoolSize);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  const sparkState = Array.from({ length: CONFIG.sparkPoolSize }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  for (let i = 0; i < CONFIG.sparkPoolSize; i++) sparks.setColorAt(i, new THREE.Color(0));
  scene.add(sparks);
  let sparkCursor = 0;

  function spawnSparks(point, color, n = 5) {
    for (let k = 0; k < n; k++) {
      const i = sparkCursor; sparkCursor = (sparkCursor + 1) % CONFIG.sparkPoolSize;
      const st = sparkState[i];
      st.life = CONFIG.sparkLife;
      st.p.set(point.x, point.y, point.z);
      st.v.set(vfxRng.range(-3, 3), vfxRng.range(1, 5), vfxRng.range(-3, 3));
      sparks.setColorAt(i, _col.set(color));
    }
    sparks.instanceColor.needsUpdate = true;
  }

  function updateSparks(dt) {
    for (let i = 0; i < CONFIG.sparkPoolSize; i++) {
      const st = sparkState[i];
      if (st.life <= 0) { _m.makeScale(0, 0, 0); sparks.setMatrixAt(i, _m); continue; }
      st.life -= dt;
      st.v.y -= 12 * dt;
      st.p.addScaledVector(st.v, dt);
      const k = Math.max(st.life / CONFIG.sparkLife, 0);
      _m.makeScale(k, k, k).setPosition(st.p);
      sparks.setMatrixAt(i, _m);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }

  /* ---------- menu idle animation (the live menu background) ---------- */
  const menuRng = mulberry32(0xAB12);
  const idleBeamT = [2, 3.5, 5];
  function updateMenuIdle(t, dt) {
    const r = 24 + Math.sin(t * .07) * 4;
    camera.position.set(Math.cos(t * .05) * r, 6 + Math.sin(t * .11) * 1.6, Math.sin(t * .05) * r);
    camera.lookAt(0, 1.4, 0);
    drones.forEach((d, i) => {
      d.visible = true;
      const ph = i * 2.1;
      d.position.set(
        Math.sin(t * .4 + ph) * (7 + i * 3),
        2.4 + i * .8 + Math.sin(t * 1.3 + ph) * .35,
        -4 + Math.cos(t * .3 + ph) * (6 + i * 2));
      d.rotation.y = t * .5 + ph;
    });
    for (let i = 0; i < idleBeamT.length; i++) {
      idleBeamT[i] -= dt;
      if (idleBeamT[i] <= 0) {
        idleBeamT[i] = 2 + menuRng() * 3;
        const a = new THREE.Vector3(menuRng.range(-22, 22), .8 + menuRng() * 2.2, menuRng.range(-22, 22));
        const b = new THREE.Vector3(menuRng.range(-22, 22), .8 + menuRng() * 2.2, menuRng.range(-22, 22));
        spawnBeam(a, b, i % 2 ? COL.magenta : COL.cyan);
      }
    }
  }

  function updateRings(t, powerLive) {
    padRings.forEach((rg, i) => {
      rg.rotation.z = t * (.4 + i * .13);
      rg.scale.setScalar(1 + Math.sin(t * 2 + i) * .06);
    });
    powerRing.visible = powerLive;
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return {
    renderer, scene, camera, drones, rifle,
    spawnBeam, updateBeams, spawnSparks, updateSparks,
    updateMenuIdle, updateRings,
    beamColorFor(loadoutBeam, t) {
      if (loadoutBeam === 'rainbow') return _col.setHSL((t * .5) % 1, 1, .6).getHex();
      return BEAM_COLORS[loadoutBeam] ?? BEAM_COLORS.cyan;
    },
  };
}
