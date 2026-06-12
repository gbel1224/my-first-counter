# LASER STRIKE ARENA — design plan

Source of truth: `CLAUDE_CODE_BRIEF.md` (repo root expects it alongside; spec mirrored here).

## Profile
- Genre: 3D first-person arena laser-tag shooter (Halo-style), solo vs 3 AI drone bots
- Platforms: desktop + mobile browsers; input = KB/mouse, touch (dual zones), gamepad — all first-class
- Session: 3-minute matches, first to 15 tags; menus ≤2 clicks to play
- Strings externalized (STRINGS), tuning centralized (CONFIG), seeded RNG (logic/VFX split)
- Multiplayer-ready: every combatant is a PlayerSlot (commands in → state out), deterministic 60Hz fixed-timestep sim

## Experience formula
Read enemy state → trade shots → disengage at shield deficit → recharge → re-engage with advantage.
"Disengaging is a weapon" — mechanically enforced: firing blocks your own shield regen.

## Verbs
| Verb | KB/M | Touch | Gamepad |
|---|---|---|---|
| Move | WASD | left stick zone | left stick |
| Look | mouse | right drag zone | right stick |
| Fire | LMB | FIRE btn (bottom-right) | RT |
| Jump | Space | JUMP btn (above fire) | A |

## Systems
- Shields: 3 HP, regen 2.0s after last combat event (hit taken OR shot fired), full in 1.5s
- Tag: +1 (×2 with power pad), instant-ish respawn (1.5s), corner pads, 1s spawn protection
- Bots: PATROL/ENGAGE/RETREAT/RECHARGE; one difficulty knob (aim error + reaction multiplier)
- Pads: power pad center (2x/10s, announced), 2 jump pads → balconies (high lanes)
- Comeback: leader ping every 20s; power pad math supports 1/3-deficit comeback
- Ranked: Bronze→Champion, III/II/I divisions, 100 RP each; +20+margin(≤10) / −15 (−20 champ); demotion shield
- Challenges: 8, event-bus driven, cosmetic unlocks (beam colors, crosshairs)

## STYLE FORMULA (byte-identical from the brief, governs all assets incl. procedural)
clean sci-fi low-poly arena rendering with strong emissive neon glow, hard-edged faceted geometry with crisp luminous trim lines, environment in deep charcoal-navy panels with cyan grid accents, player elements in vivid cyan, enemy bots and their beams in hot magenta, pickups marked with acid-green glow, dark moody laser-tag arena atmosphere lit by emissive surfaces with soft fog, high contrast between game elements and backgrounds, clean readable silhouettes, consistent three-quarter isometric view on concept images

Palette: arena #11141f/#1a1f2e · player cyan #00e5ff (#66f0ff UI) · enemy magenta #ff2d78 · pickup green #aaff00 · fog #0a0c14
