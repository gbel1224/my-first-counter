# Palm City 🌇

A 3D open-world story game for mobile browsers — GTA-style cruising with a sunny
life-sim heart (inspired by Sunday City and GTA San Andreas).

**Play it live:** https://soft-nest-342.higgsfield.gg/

## The game
You arrive in Palm City broke. Your cousin Marco gets you hustling: pizza runs,
taxi rides, courier chains — then you start **buying the city**: a hot dog cart,
a car wash, a burger joint, the Neon Palms nightclub, a taxi company and the
marina. Businesses earn income every minute, can be upgraded to Lv3, and fill
tip jars you collect in person. **Twelve story chapters**: act 2 brings rival
Vince Sterling, a hostile takeover, Rosa's mission line, and a timed grand race
finale — then endless freeplay with repeatable depot delivery jobs. Music and
SFX included (mute button on the HUD), a 4-minute day/night cycle, arcade drift,
and pedestrians who dive away from your horn. A **wanted system** brings police chases when you drive recklessly, and **12 hidden Golden Palms** are scattered across the city to hunt down. Hit the **stunt ramps** at speed for big air and jump bonuses. Progress auto-saves in your browser.

## Controls
- **Phone:** left side of the screen = floating joystick; yellow button = enter/exit
  cars; green button = buy/upgrade, sprint (hold) on foot, horn while driving.
  Tap dialogue to advance.
- **Keyboard:** WASD / arrows to move, `Shift` sprint, `E` car, `B` buy/horn,
  `Enter` to advance dialogue.
- **Gamepad:** left stick to move, `A` act/talk, `X` buy.

## Run it locally
```bash
cd palm-city
python3 -m http.server 8000
# open http://localhost:8000  (phone: use your computer's LAN IP)
```
Add `?dev=1` to the URL for the FPS / draw-call overlay.

## Tech
- Three.js r160 (vendored in `vendor/`), no build step — plain ES modules
- Fully procedural city, characters, cars and textures (seeded RNG — same city every time)
- Performance-tuned for phones: instanced buildings/trees/shadows, merged
  vertex-colored meshes, fixed 60 Hz simulation, DPR cap 1.5
- All player-visible text lives in `strings.js` (easy to translate)
- `design/` holds the design plan, asset manifest and performance budgets
- `tools/smoke.mjs` runs the whole story route headlessly: `node tools/smoke.mjs`

## Updating the deployed game
The live deployment's game id is `de757767-8cc3-46e3-aa58-a96c40db2278`
(zip `index.html` + `logic.js` + modules at the archive root and redeploy with
that id to keep the same URL).
