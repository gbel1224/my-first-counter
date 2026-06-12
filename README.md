# LASER STRIKE ARENA

3D first-person laser tag arena shooter (Halo-style), browser-based. You vs 3 AI drone bots
in a single enclosed neon arena: hitscan laser rifles, recharging shields, instant respawns,
power pad, jump pads, ranked ladder, challenges with cosmetic unlocks.

First to **15 tags** — or top score at **3:00** — wins. Three hits tags you out; break
contact for 2 seconds and your shield fully recharges. Firing keeps you in combat:
**disengaging is a weapon**.

## Run

```bash
npm install
npm run dev        # → http://localhost:5173
npm run build      # production build to dist/
```

## Controls

| Verb | Keyboard/Mouse | Touch | Gamepad |
|---|---|---|---|
| Move | `W A S D` | left stick zone | left stick |
| Look | mouse (pointer lock) | right drag zone | right stick |
| Fire | left click | FIRE button | RT |
| Jump | `Space` | JUMP button | A |

`Esc` pauses (then `Q` quits to menu). Backtick (`` ` ``) toggles the dev overlay
(FPS / draw calls / frame ms). All menus are keyboard, touch, and gamepad navigable.

## Architecture

- **Deterministic core** (`src/core/`): fixed-timestep 60Hz sim, command-driven
  PlayerSlots (local input, bot AI, and future network feed the same interface),
  analytic collision/LOS, seeded RNG (logic and VFX separated), event bus.
- **Render layer** (`src/scene.js`, `src/match.js`): one Three.js scene serves the
  live menu background AND gameplay — the menu camera dives to your spawn, no loading wall.
  Cover blocks are a single InstancedMesh; beams and sparks are pooled InstancedMeshes.
- **Meta** (`src/save.js`, `src/challenges.js`, `src/menu.js`): ranked RP ladder with
  demotion shield, 8 event-bus-driven challenges, loadout unlocks, settings —
  persisted in `localStorage` (`lsa_save_v1`).
- All tuning numbers in `CONFIG`, all player-visible strings in `STRINGS`
  (`src/config.js`); `window.CONFIG` is editable from the dev console.

## Design check (bot-vs-bot sim)

```bash
npm run sim                       # 200 matches, never-retreat vs retreat policy
npm run sim -- matches=500 seed=7
```

A bot that never retreats must lose to one that does (<35% win rate) — this validates
the shield-dance core loop. Current tuning: ~26% over 1000 matches.

## Dev/test scripts

`scripts/*.mjs` are puppeteer-driven checks (smoke auto-match `?smoke=1&speed=4`,
input latency, touch, keyboard/mouse, UI state). They expect `npx vite --port 5180`
running and a local Chromium (`npm i -D puppeteer`).
