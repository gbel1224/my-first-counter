// MiamiCharacter.js
// Drop-in three.js loader + locomotion controller for the Miami character.
// Loads the rigged base mesh ONCE, then pulls the idle/walk/run animation
// clips out of the other GLBs (same skeleton) and blends them by movement speed.
//
// Requires three.js + GLTFLoader. Example imports (adjust to your setup):
//   import * as THREE from 'three';
//   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
//
// Usage:
//   const char = new MiamiCharacter();
//   await char.load();
//   scene.add(char.root);
//   // each frame:
//   char.setSpeed(currentSpeed / maxSpeed); // 0 = idle, ~0.5 = walk, 1 = run
//   char.update(delta);

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Asset paths ───────────────────────────────────────────────────────────
// Set USE_REMOTE = true to load straight from Higgsfield URLs (quick test),
// or false to load downloaded local files (recommended for production).
const USE_REMOTE = false;

const LOCAL = {
  base: '/models/miami/miami_base.glb',
  idle: '/models/miami/miami_idle.glb',
  walk: '/models/miami/miami_walk.glb',
  run:  '/models/miami/miami_run.glb',
};

const REMOTE = {
  base: 'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/0e89b673-ca73-41f2-831c-e9d3808d006a.glb',
  idle: 'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/1f20600a-ebe3-4bbb-8458-7325957837dd.glb',
  walk: 'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/e8a5f194-600f-46d2-b609-5b6c029cdf44.glb',
  run:  'https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/00d40329-89e3-4ca1-9e48-73f5712e845d.glb',
};

const PATHS = USE_REMOTE ? REMOTE : LOCAL;

export class MiamiCharacter {
  constructor() {
    this.root = new THREE.Group();
    this.mixer = null;
    this.actions = {};      // { idle, walk, run } -> THREE.AnimationAction
    this._speed = 0;        // smoothed 0..1
    this._targetSpeed = 0;
    this.loaded = false;
  }

  async load() {
    const loader = new GLTFLoader();
    const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

    // 1) Base mesh (the only mesh we keep)
    const base = await load(PATHS.base);
    this.model = base.scene;
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);

    // 2) Pull just the AnimationClip out of each locomotion GLB and bind it to the base.
    //    (All four share the same skeleton, so the tracks apply directly.)
    const [idleGltf, walkGltf, runGltf] = await Promise.all([
      load(PATHS.idle), load(PATHS.walk), load(PATHS.run),
    ]);

    this.actions.idle = this._addClip(idleGltf.animations[0]);
    this.actions.walk = this._addClip(walkGltf.animations[0]);
    this.actions.run  = this._addClip(runGltf.animations[0]);

    // Start all three playing at weight 0, then let setSpeed/update mix them.
    Object.values(this.actions).forEach((a) => { a.play(); a.setEffectiveWeight(0); });
    this.actions.idle.setEffectiveWeight(1);

    this.loaded = true;
    return this;
  }

  _addClip(clip) {
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat);
    action.enabled = true;
    return action;
  }

  // Normalized movement speed: 0 = standing, ~0.5 = walking, 1 = full run.
  setSpeed(s) {
    this._targetSpeed = THREE.MathUtils.clamp(s, 0, 1);
  }

  update(delta) {
    if (!this.loaded) return;

    // Smooth the speed so transitions don't pop.
    this._speed = THREE.MathUtils.damp(this._speed, this._targetSpeed, 8, delta);

    // Crossfade weights across idle(0) -> walk(0.5) -> run(1).
    const s = this._speed;
    let wIdle, wWalk, wRun;
    if (s < 0.5) {
      const t = s / 0.5;          // 0..1 between idle and walk
      wIdle = 1 - t; wWalk = t; wRun = 0;
    } else {
      const t = (s - 0.5) / 0.5;  // 0..1 between walk and run
      wIdle = 0; wWalk = 1 - t; wRun = t;
    }
    this.actions.idle.setEffectiveWeight(wIdle);
    this.actions.walk.setEffectiveWeight(wWalk);
    this.actions.run.setEffectiveWeight(wRun);

    this.mixer.update(delta);
  }

  // Optional: hard switch to a single clip (e.g. for cutscenes/debug).
  play(name) {
    Object.entries(this.actions).forEach(([k, a]) =>
      a.setEffectiveWeight(k === name ? 1 : 0));
  }
}

export default MiamiCharacter;
