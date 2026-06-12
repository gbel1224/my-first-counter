/* Asset loading: textures, GLBs (with restoreEmissive + procedural fallback), audio buffers. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { COL } from './config.js';

const BASE = import.meta.env.BASE_URL;

export function loadTexture(name, repeat = 1) {
  const tex = new THREE.TextureLoader().load(BASE + name);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* GLB first, procedural fallback (brief §11). */
export async function loadModel(url, buildFallback) {
  try {
    const gltf = await new GLTFLoader().loadAsync(BASE + url);
    const m = gltf.scene;
    restoreEmissive(m);          // image-to-3D bakes color, not glow
    return m;
  } catch (e) {
    console.warn('GLB fallback for', url, e?.message ?? e);
    return buildFallback();
  }
}

/* Re-light the neon: any material whose baked color is near magenta/cyan/green glows. */
export function restoreEmissive(root) {
  const SIGNALS = [
    { c: new THREE.Color('#ff2d78'), t: 0.35 },  // enemy magenta
    { c: new THREE.Color('#00e5ff'), t: 0.35 },  // player cyan
    { c: new THREE.Color('#aaff00'), t: 0.35 },  // pickup green
  ];
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat.color) continue;
      for (const s of SIGNALS) {
        const d = Math.abs(mat.color.r - s.c.r) + Math.abs(mat.color.g - s.c.g) + Math.abs(mat.color.b - s.c.b);
        if (d < s.t) { mat.emissive = s.c.clone(); mat.emissiveIntensity = 2.0; }
      }
    }
  });
}

/* First mesh geometry+material out of a GLB scene (our GLBs are single-mesh). */
export function firstMesh(root) {
  let found = null;
  root.traverse(o => { if (!found && o.isMesh) found = o; });
  return found;
}

/* ---------- procedural fallbacks (palette-faithful, brief §11) ---------- */

export function buildDroneFallback() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(.85, 0),
    new THREE.MeshStandardMaterial({ color: COL.panel2, roughness: .45, metalness: .6, flatShading: true }));
  body.scale.set(1, .72, 1.25); g.add(body);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.3, 0),
    new THREE.MeshBasicMaterial({ color: COL.magenta }));
  g.add(core);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.55, .1, .08),
    new THREE.MeshBasicMaterial({ color: COL.magenta }));
  eye.position.set(0, .12, .95); g.add(eye);
  return g;
}

export function buildRifleFallback() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: COL.panel2, roughness: .5, metalness: .55, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.09, .14, .85), mat); g.add(body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(.05, .06, .5), mat);
  barrel.position.set(0, .03, -.6); g.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.07, .2, .1), mat);
  grip.position.set(0, -.15, .18); grip.rotation.x = .3; g.add(grip);
  return g;
}

export function buildCoverFallback() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1.91, 1.61, 1.05), // same bounds as cover_block.glb
    new THREE.MeshStandardMaterial({ color: COL.panel2, roughness: .7, metalness: .35 }));
}

export function buildPadFallback(color) {
  return new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.05, .18, 6),
    new THREE.MeshStandardMaterial({ color: COL.panel2, roughness: .8, metalness: .3 }));
}

/* ---------- audio buffers ---------- */
export async function loadAudioBuffers(ctx, names) {
  const out = {};
  await Promise.all(names.map(async name => {
    try {
      const res = await fetch(BASE + name);
      const buf = await res.arrayBuffer();
      out[name] = await ctx.decodeAudioData(buf);
    } catch (e) { console.warn('audio load failed', name); out[name] = null; }
  }));
  return out;
}
