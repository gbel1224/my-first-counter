# Palm City 2

A ground-up rebuild of Palm City: same concept (GTA-style sunny beach city, mobile-first), new engine and look.
The original game lives on untouched in `../palm-city/` and is saved as a playable copy at `/v1/` on the site.

Play: https://gbel1224.github.io/my-first-counter/next/

## Milestones
1. **Engine + look (this build):** HDR renderer with bloom and filmic grade, analytic sky + reflections,
   shader-drawn city (facades, roads, paving: sharp at any resolution), ocean, palms, instanced crowd and
   traffic, on-foot + driving, chase camera, touch/keyboard/gamepad, HUD with minimap, title screen.
2. Economy + story: money, businesses, properties, the 12-chapter story, missions.
3. Crime: wanted levels, police AI with line of sight, combat, weapons, gangs.
4. Phone: Palmgram, bank, stocks, heists, street events.
5. Everything else from v1 (boats, aircraft, minigames, interiors), then v2 replaces v1.

## Layout
- `src/world.js` city plan, collision, ground height (pure data)
- `src/render.js` renderer + post · `src/sky.js` sky/sun/IBL · `src/city.js` city meshes + shaders · `src/ocean.js`
- `src/people.js` rig, gait, instanced crowd · `src/cars.js` car models · `src/traffic.js` lanes/signals/traffic
- `src/play.js` player, driving physics, camera · `src/input.js` · `src/hud.js` · `src/main.js` loop
- `tools/check.mjs` headless browser check (`node tools/check.mjs`)
