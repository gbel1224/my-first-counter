// Loads the KayKit models (CC0, Kay Lousberg) and hands out ready-to-use clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const FILES = {
  knight: 'assets/knight.glb',
  mage: 'assets/mage.glb',
  barbarian: 'assets/barbarian.glb',
  rogue: 'assets/rogue_hooded.glb',
  minion: 'assets/skeleton_minion.glb',
  warrior: 'assets/skeleton_warrior.glb',
  skelmage: 'assets/skeleton_mage.glb',
  skelrogue: 'assets/skeleton_rogue.glb',
  village: 'assets/village.glb',
  ruins: 'assets/ruins.glb',
};

// Which accessory nodes each character keeps (everything else in that list is hidden).
const LOADOUT = {
  knight: { keep: ['1H_Sword', 'Round_Shield'], hide: ['2H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield'] },
  mage: { keep: ['2H_Staff'], hide: ['Spellbook', 'Spellbook_open', '1H_Wand'] },
  barbarian: { keep: ['Mug'], hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe'] },
  rogue: { keep: [], hide: ['1H_Crossbow', '2H_Crossbow', 'Knife', 'Knife_Offhand', 'Throwable'] },
};

export class Assets {
  constructor() {
    this.gltf = {};
    this.clips = {};
    this.props = {};
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const keys = Object.keys(FILES);
    let done = 0;
    await Promise.all(keys.map(async (key) => {
      this.gltf[key] = await loader.loadAsync(FILES[key]);
      done++;
      onProgress?.(done / keys.length);
    }));
    this.clips.hero = indexClips(this.gltf.knight.animations);
    this.clips.bones = indexClips(this.gltf.minion.animations);
    for (const pack of ['village', 'ruins']) {
      for (const child of [...this.gltf[pack].scene.children]) this.props[child.name] = child;
    }
    for (const g of Object.values(this.gltf)) {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material?.map) o.material.map.anisotropy = 4;
        }
      });
    }
  }

  character(key) {
    const src = this.gltf[key].scene;
    const root = SkeletonUtils.clone(src);
    const loadout = LOADOUT[key];
    if (loadout) {
      root.traverse((o) => {
        if (loadout.hide.includes(o.name)) o.visible = false;
      });
    }
    root.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;      // skinned bounds are unreliable while animating
        o.material = o.material.clone();
      }
    });
    return root;
  }

  prop(name) {
    const src = this.props[name];
    if (!src) throw new Error(`Missing prop ${name}`);
    return src.clone(true);
  }

  // The first mesh-bearing geometry list of a prop, for instancing.
  propMeshes(name) {
    const src = this.props[name];
    const list = [];
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    src.traverse((o) => {
      if (o.isMesh) list.push({ geometry: o.geometry, material: o.material, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    });
    return list;
  }
}

function indexClips(list) {
  const out = {};
  for (const clip of list) out[clip.name] = clip;
  return out;
}

export function findBone(root, name) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}
