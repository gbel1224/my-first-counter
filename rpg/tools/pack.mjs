import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, mergeDocuments, unpartition } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const A = process.argv[2];            // downloaded assets dir
const OUT = process.argv[3];          // repo rpg/assets dir
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const HERO_CLIPS = ['Idle', 'Running_A', 'Running_B', 'Walking_A', '1H_Melee_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Spin',
  'Dodge_Forward', 'Dodge_Backward', 'Blocking', 'Block_Hit', 'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose',
  'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Use_Item', 'Cheer', 'Interact', 'Spellcasting', 'Sit_Floor_Idle',
  'Spellcast_Shoot', 'Spellcast_Raise', 'PickUp'];
const BONE_CLIPS = ['Idle', 'Idle_Combat', 'Walking_D_Skeletons', 'Running_A', 'Running_C', '1H_Melee_Attack_Chop',
  '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Jump_Chop', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin',
  '2H_Melee_Attack_Slice', 'Hit_A', 'Hit_B', 'Death_C_Skeletons', 'Death_C_Pose', 'Skeletons_Awaken_Floor',
  'Skeletons_Inactive_Floor_Pose', 'Spawn_Ground', 'Taunt', 'Spellcast_Shoot', 'Spellcasting', 'Spellcast_Summon',
  'Block', 'Blocking', 'Cheer', 'Dodge_Backward'];

function dropOrphans(doc) {
  // Disposing animations leaves their keyframe accessors attached only to Root.
  for (const a of doc.getRoot().listAccessors()) {
    if (a.listParents().every(p => p.propertyType === 'Root')) a.dispose();
  }
}

async function character(name, keep, out) {
  const doc = await io.read(path.join(A, 'chars', name + '.glb'));
  for (const anim of doc.getRoot().listAnimations()) {
    if (keep.includes(anim.getName())) continue;
    anim.listChannels().forEach(c => c.dispose());
    anim.listSamplers().forEach(s => s.dispose());
    anim.dispose();
  }
  dropOrphans(doc);
  await doc.transform(resample(), prune(), dedup(), quantize({ quantizeNormal: 10, quantizePosition: 14 }));
  dropOrphans(doc);
  await io.write(path.join(OUT, out), doc);
}

async function bundle(files, out) {
  // Merge many small models into one GLB; each model becomes a named root node.
  const target = new (await import('@gltf-transform/core')).Document();
  target.createBuffer();
  const scene = target.createScene('Props');
  for (const [label, file] of files) {
    const src = await io.read(file);
    const map = mergeDocuments(target, src);
    const holder = target.createNode(label);
    for (const s of src.getRoot().listScenes()) {
      const merged = map.get(s);
      for (const child of merged.listChildren()) holder.addChild(child);
      merged.dispose();
    }
    scene.addChild(holder);
  }
  target.getRoot().setDefaultScene(scene);
  await target.transform(unpartition(), dedup(), prune({ keepLeaves: true }),
    quantize({ quantizeNormal: 10, quantizePosition: 14 }));
  await io.write(path.join(OUT, out), target);
}

await character('Knight', HERO_CLIPS, 'knight.glb');
for (const n of ['Mage', 'Barbarian', 'Rogue_Hooded']) await character(n, [], n.toLowerCase() + '.glb');
await character('Skeleton_Minion', BONE_CLIPS, 'skeleton_minion.glb');
for (const n of ['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue']) await character(n, [], n.toLowerCase() + '.glb');

const hex = fs.readdirSync(path.join(A, 'hex')).filter(f => f.endsWith('.gltf'))
  .map(f => [f.replace('.gltf', ''), path.join(A, 'hex', f)]);
const dungeon = fs.readdirSync(path.join(A, 'dungeon')).filter(f => f.endsWith('.glb'))
  .map(f => ['d_' + f.replace('.glb', ''), path.join(A, 'dungeon', f)]);
const weapons = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A']
  .map(n => [n, path.join(A, 'weapons', n + '.gltf')]);
await bundle(hex, 'village.glb');
await bundle([...dungeon, ...weapons], 'ruins.glb');
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB');
