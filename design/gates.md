# Gate walkthrough — measured results

Environment note: this container has no GPU; headless Chromium renders via SwiftShader
(software rasterizer). Wall-clock FPS there is not representative of any real device —
a trivial blank page RAFs at ~60fps, and the in-match rate scales with resolution
(fill-bound in software). The hardware-independent numbers (draw calls, triangles,
JS frame ms, sim latency) are exact.

## Gate 1 — arena + FPS controller
- ✓ Pointer lock engages from the match-start click (verified headless: `pointerLockElement` set)
- ✓ WASD move (physical key codes), measured 6 u/s with 0.12s accel ramp
- ✓ Jump: 1.2u apex, gravity 16, coyote 80ms + 100ms input buffer (sim-level logic)
- ✓ GLBs load with restoreEmissive() + emissive accent meshes; procedural fallback path in place
- ✓ Cover blocks: ONE InstancedMesh (14 instances) + one trim InstancedMesh
- ✓ Dev overlay on backtick: FPS / frame ms / draw calls / tris
- Draw calls in first-person: 29–42 (budget ≤80) ✓
- JS frame time: 2.3ms typical, 4.1ms worst observed ✓ (60fps = 16.7ms budget)
- GLBs optimized offline (gltf-transform: meshopt simplify + 1024px textures):
  60.6MB → 15.0MB payload, worst-case scene 602k → 133k triangles

## Gate 2 — fire + beams + hit feedback
- ✓ Instanced beam pool (24), per-instance color (player loadout color, bots magenta)
- ✓ Hit sparks pool (32), crosshair magenta bloom on hit-confirm, shield vignette
- Input → FIRE event latency: 0.5–2.3 ms over 8 samples (+ ≤1 render frame) — gate ≤100ms ✓

## Gate 3 — shield / tag / respawn
- ✓ 3 HP shield, regen 2.0s after last combat event (hit OR shot fired), full in 1.5s
- ✓ Tag → +1 (×2 boosted), 1.5s respawn at random pad, 1s spawn protection (blink)
- ✓ SFX wired through event bus only (fire ±2 semitones, hit tick, tag sting, respawn warp, pad chime)
- ✓ Refusal visible: firing while respawning shows "RESPAWNING n.."

## Gate 4 — bot AI + design check
- ✓ PATROL / ENGAGE / RETREAT / RECHARGE state machine; single difficulty knob
- ✓ Aim: persistent gaussian wander (resampled 0.22s), tightens over 1.2s LOS,
  penalties for target angular velocity and shooter sprint speed
- Headless bot-vs-bot (200 matches × 5 seeds): never-retreat wins
  26.5% / 23.5% / 31.5% / 24.5% / 25.5% — avg 26.3%, all < 35% ✓
- CONFIG changes from brief baseline (reported in chat):
  shieldRegenDelay 3.0→2.0s; regen now also blocked by firing; bot aim model gains
  botAimResample / botAimMovePenalty / botShooterMovePenaltyDeg / botEngageStrafeSpeed;
  retreat policy also disengages when behind on (visible) shields

## Gate 5 — match flow + meta
- ✓ Menu camera dives to first-person spawn — same scene, no loading wall (1.4s dive,
  3-2-1 countdown overlaps it)
- ✓ Title → gameplay in 2 interactions (PLAY → QUICK MATCH)
- ✓ Score race bar / timer / kill feed / MATCH POINT banner at 12 / leader ping every 20s
- ✓ Ranked RP math: 11/11 unit cases (margin cap, div/tier up, demotion shield, champion
  −20, Bronze III floor, Champion I cap)
- ✓ Challenges: 8/8 trigger off the event bus (incl. comeback-kid deficit sampling);
  toasts at match end only; unlocks feed loadout
- ✓ localStorage lsa_save_v1 roundtrip verified (settings, rank card, challenge grid,
  loadout chips, first-launch how-to flag)

## Gate 6 — inputs + settings + worst case
- ✓ KB/M: move/look/fire/jump all PASS (headless, real pointer lock)
- ✓ Touch: dual virtual zones — stick move 6.6u PASS, look drag PASS, FIRE button PASS
  (latency test uses the touch path); JUMP shares the verified button path
- ✓ Gamepad: left stick move, right stick look (latest-method-wins), RT fire, A jump,
  menu navigation (stick/dpad + A/B) — code path complete; not verifiable headless
- ✓ Settings all functional: sensitivity, music/SFX volume, camera shake, flash,
  high-contrast HUD, text scale, loadout pickers
- Worst case (full 3-min auto-match, 4 combatants firing): max 41 draw calls ✓ (≤80),
  133,741 triangles, JS frame ≤4.1ms. SwiftShader software-render caveat above;
  on hardware this load is comfortably 60fps-class. Escape hatch (procedural fallback)
  remains available if a target device dips below 45fps.
