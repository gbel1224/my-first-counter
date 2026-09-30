# Palm City

GTA-style open-world beach city, mobile-first. A ground-up rebuild of the original (now in `../palm-city-v1/`,
playable at `/v1/` on the site) with a new engine and a gritty realistic look.

Play: https://gbel1224.github.io/my-first-counter/

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
