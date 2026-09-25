# Cinderhold

A third-person action RPG vertical slice that runs in the browser. There's nothing to install.

The Bone King has stolen the Ember Shard, and the dead are waking in the Hollow Ruins.
Talk to the village elder, fight through the ruins, break the ward on the shrine road,
beat Morgrath the Bone King in a two-phase boss fight, and bring the shard home.
A full run takes about 10–15 minutes.

## What's in the slice

- **Combat:** a three-hit sword combo with a heavy finisher and soft lock-on, dodge rolls
  with invulnerability frames, blocking with stamina, and timed parries that stagger enemies.
  Hits charge an **Ember Burst** area attack. Hitstop, screen shake, sparks, slash trails and
  damage numbers make every hit land.
- **Enemies:** skeleton minions, shield-carrying wardens that block, and fireball-casting
  Bone Callers. They rise out of the ground when you come near and take turns attacking so
  fights stay readable.
- **Boss:** Morgrath has telegraphed cleaves, ground slams, a spin, and a leap attack that
  targets where you stand. At half health he summons minions and leaves burning ground.
- **RPG systems:** XP and levels, gold and loot, potions, a blacksmith upgrade, a potion
  shop, a quest chain, NPC dialogue with choices, and death with respawn.
- **World:** a valley with a village, forest, lake, ruins and a mountaintop shrine. It has
  wind-blown grass (up to 130k blades), swaying trees, lake water with shoreline foam,
  golden-hour sky lighting, soft shadows, fireflies, bloom and color grading.
- **Presentation:** a title flyover, HUD, rotating minimap with an objective marker, boss
  bar, zone title cards, and sound and music synthesized live with WebAudio (no audio files).
- **Runs anywhere:** Low/Medium/High graphics settings, an automatic quality drop on slow
  machines, and touch controls on phones.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| Mouse | Look (click to capture the cursor) |
| Left click | Attack; keep clicking to combo |
| Right click | Block; tap just as a blow lands to parry |
| Space | Dodge roll |
| E | Ember Burst (when the orange bar is full) |
| Q | Drink a potion |
| F | Talk / pick up |
| Esc | Pause and settings |

## Run it locally

Browsers won't load ES modules from `file://`, so serve the folder:

```sh
npx serve rpg          # or: python3 -m http.server --directory rpg 8000
```

Then open the printed URL. three.js loads from the jsDelivr CDN.

## How it's built

| File | What it does |
| --- | --- |
| `src/main.js` | Boot, game loop, third-person camera, quests, NPC conversations, boss flow, quality settings |
| `src/terrain.js` | One height function shared by the terrain mesh, the grass and water shaders, and character feet |
| `src/world.js` | Sky, sun and shadows, water, GPU grass, instanced forests, the village, ruins and shrine, colliders |
| `src/player.js` | Knight controller: combo, dodge, block/parry, Ember Burst, potions, leveling |
| `src/enemies.js` | Skeleton AI and the Bone King |
| `src/fx.js` | Particles, slash trails, shockwaves, ground telegraphs, damage numbers, loot |
| `src/ui.js` | HUD, minimap, dialogue, menus |
| `src/audio.js` | Synthesized sound effects and adaptive music |
| `tools/pack.mjs` | Asset pipeline: strips unused animations, shares clips across rigs, quantizes meshes (33 MB of source down to 5 MB) |

## Credits

Characters, props and environment models are by **Kay Lousberg** ([KayKit](https://kaylousberg.com)),
released under CC0. The packs used were Adventurers, Skeletons, Medieval Hexagon and Dungeon
Remastered; their license files are in `assets/licenses/`. Rendering is by [three.js](https://threejs.org).
