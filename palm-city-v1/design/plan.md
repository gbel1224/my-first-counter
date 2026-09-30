# Palm City — design plan

**Experience formula:** The player feels like a rising hometown hustler because the game
constantly turns small street jobs into visible ownership of the city.

## Profile
- Time: real-time · Space: continuous 3D city · Agency: one hero · Conflict: vs system (economy/story), no fail states (casual life-sim tone per the Sunday City reference)
- Content: authored mission chain over a seeded procedural city · Outcome: story completion + endless freeplay
- Players: solo · Session: 5–20 min · Engagement: story + accumulation
- Delivery: mobile browser touch-first, desktop keyboard (physical key codes), gamepad via Gamepad API

## Verbs
walk/run · drive (enter/exit cars) · interact (missions, passengers) · buy/own (businesses, passive income)

## Story mode (one new pattern at a time, exam after each)
1. **Fresh Off the Bus** — walk to cousin Marco at the plaza (teaches movement + markers)
2. **Pizza Run** — pick up & deliver on foot (teaches multi-step objectives)
3. **Learner Plates** — enter a car, drive to the depot (teaches driving)
4. **Rosa's Ride** — taxi job: pick up Rosa, drive her across town (driving exam)
5. **Courier King** — 3-stop delivery chain by car (navigation exam)
6. **Open for Business** — buy the hot dog cart (teaches ownership/income)
7. **Suds & Money** — save $2,000, buy the car wash (economy loop exam)
8. **City Tycoon** — own all four businesses (finale), then freeplay + repeatable depot side jobs

## Economy
- Sources: mission rewards, repeatable depot deliveries ($75), business income/min
- Sinks: businesses on a rising cost curve — $500 cart → $2,000 car wash → $5,000 burger joint → $10,000 nightclub (each step costs more than the last reward returned)
- Income rates: $30 / $90 / $220 / $500 per minute respectively

## Information map
Current goal + next step always on HUD; minimap shows roads, player heading, objective and businesses; prices visible before buying; refusals explain themselves ("need $X more").

## Known limits (stated honestly)
- Characters/props are stylized primitives (no mesh-generation pass) — the approved bright low-poly formula is chosen to make that a feature, not a compromise.
- No audio in v1. Binding remap UI not shipped; WASD + arrows + gamepad all bound by default.
- Perceived feel (camera, handling) tuned by reasoning + budgets; needs human hands on a phone for final polish.

## Act 2 (added in v2)
9. **An Offer You Can Refuse** — rival Vince Sterling demands a buyout; you refuse
10. **Hostile Takeover** — income halved until you rally all four crews; permanent +10% loyalty bonus after
11. **Rosa's Big Break** — 4-stop drive; Rosa becomes club manager (+25% club income)
12. **The Palm City Grand Race** — timed 6-point checkpoint race (100s, reset on timeout); finale

## v2 economy
- Business levels 1-3: upgrade costs base×level, income = rate×level
- Tip jars: owned businesses accrue 10% of their rate; collect in person (capped)
- New properties: Palm Taxi Co. $3,500/$150·min, Bayside Marina $15,000/$700·min
- Audio mix: music 0.16, SFX 0.6, engine 0.22 gain (quiet music under effects, no clipping)
- World: 4-minute day/night cycle; NPCs flee close fast cars and horns; arcade drift via lateral momentum

## v3 (open-world systems)
- **Wanted system**: hitting pedestrians with a fast car raises a 0-3 star wanted level; up to 3 police cars spawn and chase. Contact = busted (fine scales with stars, wanted clears). Stars decay over time if you escape. Suppressed during the timed race so it stays fair.
- **Golden Palms**: 12 hidden glowing collectibles across the map ($150 each, $2,000 bonus for all 12). Shown on the minimap; persisted in the save.
- HUD: palm counter in the money box, wanted stars top-center.

## v4 (stunt driving)
- **Stunt ramps**: 5 wedge ramps on long roads; hitting one fast launches the car with real vertical physics (gravity, airborne pitch, landing). Air time over 0.35s pays a bonus that scales with hang time; best jump is tracked in the save.

## v5 (City Garage)
- **Personal cars**: a Garage building (cell 3,2, east of the plaza) sells 3 cars on a rising price curve — Coral Cruiser $1,500, Azure Sport $4,000, Sterling GT $12,000 — each with distinct accel / top speed / turn. Reuses the business "for sale" → owned sprite pattern; locked cars can't be driven (excluded from `nearestCar`). A money sink and progression that complements the business income loop.
- **Showroom panel**: pressing the action button by a personal car opens a panel (input gated like dialogue) showing stat bars (top speed / accel / handling) and the car's perk. Locked → BUY button; owned → 10-colour repaint palette. Paint applies live and persists.
- **Per-car perks** (each car plays differently, not just faster): Coral Cruiser *Showtime* — +50% stunt-jump cash (`jumpMult`); Azure Sport *Slippery* — wanted stars cool ~2× faster while driving it (`heatMult`); Sterling GT *Connected* — bust fines halved (`fineMult`).
- **Save**: `state.cars` maps each owned car's id to its chosen paint colour. Minimap shows the garage (cyan square) and owned cars (cyan dots).

## v6 (Street Races)
- **Freeplay street race**: a checkered start gate at the (-88, 88) intersection. Roll through it in a car (freeplay only) to start a timed 4-checkpoint circuit around the central ring roads (52s limit). Built as a standalone system (`updateRace`) separate from the story mission/race logic so the two never interfere.
- **Rewards & replay**: $500 per win, +$300 bonus for a new best lap. Best lap time persists (`state.bestRace`) as an endless personal challenge — and a showcase for the garage's faster cars/perks.
- **Re-arm**: after a win or timeout you must leave the gate and roll back through to start again (no instant re-trigger). The active checkpoint drives the existing mission marker + minimap blip; the side-job marker is suppressed while racing. Start gate shown on the minimap (white square) in freeplay.

## v7 (Progress & Achievements)
- **Progress panel**: a 🏆 HUD button opens a pause panel (input gated like dialogue) with a stat dashboard — cash, businesses x/6, personal cars x/3, Golden Palms x/12, best stunt jump, best lap — plus a New Game reset folded in (settings/pause gap from the known-limits list, now closed).
- **8 achievements**, all derived from existing state (`ACH` list): First Wheels, Car Collector, Property Mogul, Palm Hunter, Daredevil (1.0s+ jump), Speed Demon (win a race), Palm City Tycoon ($50k high-water via `state.maxMoney`), King of the City (finish the story). Unlocked ids persist in `state.ach`.
- **Live unlocks**: `refreshAch` runs once a second; newly-earned achievements toast + jingle and save immediately. On load, earned achievements are seeded silently so old saves don't re-announce.

## v8 (Multiple race circuits)
- **Three circuits** (`CIRCUITS`), each with its own checkered start gate, checkpoint loop, time limit and reward: Downtown Loop (central, 52s, $500), Outer Ring (full-city loop, 72s, $800), Harbor Dash (east side, 42s, $400). `updateRace` checks all gates; rolling through any one in freeplay starts that circuit.
- **Per-circuit best laps**: `state.races` maps circuit id → best lap (single-circuit `bestRace` saves migrate to `{downtown: …}` on load). The progress panel lists each circuit's best lap and a Circuits-won count; all gates show on the minimap.
- **New achievement**: Triple Crown — set a best lap on all three circuits. Speed Demon now keys off `state.races` (won any circuit).

## v9 (AAA mobile, phase 1 — game feel & juice)
Goal: make Palm City *feel* premium on a phone without breaking the budget (still 1 extra draw call, zero frame allocations).
- **Particles**: one `THREE.Points` pool (160, additive, soft arc-built sprite) recycled for tyre smoke while drifting, landing dust off ramps, gold sparkles on Golden Palms, collision debris, and checkpoint/finish bursts.
- **Camera**: speed-based FOV (64→77 with car speed) for a sense of velocity; positional screen shake on ramp launches, landings (scales with air time), wall hits, busts, and race wins.
- **Haptics**: `navigator.vibrate` (guarded) on collisions, jumps, busts, palm pickups, race start/checkpoints/wins — distinct patterns per event.
- **Screen flash**: `#flash` overlay (screen blend) pulses gold on a finish / all-12 palms and red on a bust.
- All hooks default to no-op off-car / unsupported, so the headless smoke and non-haptic devices are unaffected.

## v10 (AAA mobile, phase 2 — visual polish)
Goal: a premium *look* with no post-processing pipeline (keeps mobile perf). +2 draw calls (sky dome + sun sprite), no shaders compiled in the headless smoke (FakeRenderer never renders).
- **Filmic tone mapping**: `ACESFilmicToneMapping`, exposure 1.2 — cinematic highlight roll-off and contrast over the old flat output.
- **Gradient sky dome**: a `ShaderMaterial` BackSide sphere (zenith→horizon) recoloured every frame by the day/night cycle; `ENV_KEYS` gains a `top` zenith colour and a `night` factor.
- **Sun / moon disc**: an additive sprite aligned with the key light, shifting warm-sun → pale-moon and shrinking at night.
- **Night neon**: Golden Palm `emissiveIntensity` ramps up with the night factor so collectibles glow after dark.
- **Vignette**: a CSS `#vignette` overlay (multiply blend) darkens the corners for cinematic framing — zero GPU cost, HUD stays crisp above it.

## v11 (AAA mobile, phase 3 — mobile controls & HUD)
- **Speedometer / gear dial**: a canvas `#speedo` (arc gauge + needle + KM/H readout + R/N/1/2/3 gear) drawn only while driving, top-right under the minimap.
- **Dedicated brake**: a `#brake` button (and Space on keyboard) that decelerates then reverses, so you can brake *while* steering with the stick. Throttle stays on the joystick; brake button only shows while driving.
- **Onboarding legend**: the intro now lists the core controls (move/steer, accelerate, enter car, brake) and the START button gently pulses.
- **UI motion**: garage/stats cards `pop` in (scale+fade) when opened; pure CSS, no JS or perf cost.
- Drawing/handlers are render-loop only and no-op under the headless smoke (which never drives the rAF frame).

## v12 (AAA mobile, phase 4 — audio depth)
- **Master compressor**: all buses (music/sfx/engine/skid) route through a `DynamicsCompressor` for glue and no clipping.
- **RPM engine**: a lowpass filter that opens with speed plus gain that rises with revs, on top of the existing pitch-by-speed — a fuller, more responsive engine.
- **Dynamic music**: `AudioSys.intensity(x)` lifts music volume, brightness (lowpass cutoff) and tempo as on-screen intensity rises; the game feeds it `wanted/3` + a race bump, so the track swells during chases and races.
- **Tyre skid**: a synthesized white-noise→bandpass layer (`AudioSys.skid`) whose gain tracks drift `lat`, so hard cornering screeches.
- **SFX variety**: cash pickups get a small random pitch so repeats don't feel robotic.
- All additions fail silent without WebAudio, so the headless smoke (no `AudioContext`) is unaffected.

## v13 (AAA mobile, phase 5 — performance guardrails)
- **Adaptive resolution**: the render loop measures fps over 1s windows and nudges the renderer pixel ratio between `PR_FLOOR` (0.75) and `PR_CAP` (`min(devicePixelRatio, 1.5)`) — drop 0.15 when fps < 50, recover 0.1 when fps > 58 — so all the v9–v12 effects hold ~60fps on mid-range phones without ever getting blurrier than the floor.
- **Hysteresis + warmup**: separate up/down thresholds avoid oscillation, and the first few windows are skipped so load jank doesn't trigger a downscale. `onResize` only calls `setSize`, so the adaptive ratio persists across rotations.
- **Dev HUD**: `?dev=1` now also shows the live pixel-ratio multiplier next to fps / draw calls / triangles.

This completes the 5-phase "AAA for mobile" pass (juice → visuals → controls/HUD → audio → performance).

## v14 (visual pass 2 — glow & gloss)
- **Vignette fix**: the v10 vignette used `mix-blend-mode:multiply`, but the canvas sits outside the `#ui` stacking context so iOS Safari painted its white center as an opaque wash over the game. Replaced with a normal transparent-centre / dark-edge radial gradient (no blend mode); same fix applied to `#flash`.
- **Neon glow cloud (fake bloom)**: one additive `THREE.Points` cloud at landmark/sign positions (each business sign with a themed colour, the club magenta, plaza, garage, race gates) whose brightness is driven by the night factor — signs bloom after dark, fully off by day. 1 draw call, smoke-safe (no post-processing composer, which would risk a black screen on a blind deploy).
- **Glossy cars**: car paint switched from Lambert to `MeshPhongMaterial` (shininess 55) so highlights track the sun/moon — a premium daytime read. Repaint still drives `material.color`.
- Deliberately avoided a real UnrealBloom composer here to stay robust/60fps and un-black-screenable; it remains an opt-in follow-up.

## v15 (real bloom — beta toggle, default OFF)
- **Self-contained post-processing bloom** (no vendored addons): render scene → linear `rtScene`, bright-pass (luma threshold), two separable Gaussian blur iterations at half-res (ping-pong `rtB1`/`rtB2`), then a composite quad that adds the blurred bloom to the scene and manually sRGB-encodes for the canvas (color-managed in linear space to match the ACES look).
- **Safety**: OFF by default; toggled in the progress panel ("✨ Bloom") and persisted (`palm_city_bloom`). The whole path is wrapped in try/catch — any failure sets `bloomFailed` and falls back to the plain `renderer.render`, so it can never black-screen the default experience. Built lazily on first enable, so the headless smoke (FakeRenderer) never touches it.
- **Perf**: bloom render targets follow the adaptive pixel ratio (resized from the drawing-buffer size each frame), so it scales down with the existing 60fps guardrail.

## v16 (race medals + hold-to-build sprint)
- **Medal targets**: each circuit has bronze/silver/gold thresholds (`medalFor` at 0.82/0.65/0.5 × the time limit). Finishing under a tier the first time pays a cash bonus (`MEDAL_BONUS` 200/500/1000) and stores the best tier in `state.medals`. The race HUD shows the gold target time; the progress panel shows the earned medal (🥉🥈🥇) by each circuit's best lap. New achievement **Gold Rush** = gold on all three.
- **Hold-to-build sprint**: on foot, a sprint charge ramps 0→1 over ~2.5s while held+moving, lifting the run multiplier from 1.32× to ~1.95×, decaying faster on release.

## v17 (sky detail + roadside ramps)
- **Sky detail**: drifting cloud puffs and a starfield (night) on the upper dome, opacity-driven by the night factor via `setSky`. Separate **sun** (warm additive disc, bright by day) and **moon** (pale cratered sprite, night) that **arc across the sky on opposite sides** with the cycle, cross-fading at dawn/dusk.
- **Roadside ramps**: stunt ramps offset to the curb side of their road.

## v18 (richer sky + dynamic lighting + night windows)
- **Denser sky**: starfield 440→950, clouds rebuilt as **clustered puffs** (26 clouds × 6 overlapping soft puffs) for fluffier shapes; bigger moon.
- **Sun-driven lighting**: the directional key light now **follows the sun/moon arc** (direction swings east→overhead→west) and **tints with time of day** — warm white midday, orange near the horizon (`C_HORIZON`), cool blue moonlight at night (`C_MOON`) — so shading shifts realistically through the cycle.
- **Lit windows**: buildings get an emissive window map (`texWindows`, built with `Math.random` so the seeded world layout is untouched) that ramps up with the night factor, so windows glow after dark.

## v19 (street lamps)
- **Street lamps** at every block corner (`N×N`, two InstancedMeshes — poles + heads, +2 draw calls). The lamp heads use an emissive material that ramps up with the night factor, and each head is added to the neon glow cloud so it casts a warm bloom halo after dark.
- **Roadside ramps**: the five stunt ramps are offset ~5.5u perpendicular to their travel so they hug the curb instead of the road centre, for realism (still on the asphalt).

## v20 (batch 1 of GTA-style expansion — nitro + weather)
- **Nitro boost**: a BOOST button (and Shift while driving) gives a surge of acceleration and ~1.5× top speed while a meter lasts, with exhaust-flame particles and rumble; the meter depletes while boosting and recharges otherwise, shown as a bar on the speedometer.
- **Weather**: a player-following rain system (`LineSegments` streaks) on a slow auto-cycle (~40% chance of rain every 45–95s); rain greys the fog and dims the sun/hemi lights for a moodier look. Radio stations intentionally deferred per request.

## v21 (batch 2a — motorbike + weather toggle)
- **Motorbike**: a new drivable vehicle (`bikeGeo` + `makeBike`) added to the `cars` array, so it reuses the entire driving/headlight/shadow system. Nimble stats (accel 21, top 30, turn 2.7), leans into turns (`rotation.z` from lateral momentum). Two parked around town, free to ride.
- **Manual weather toggle**: a settings-panel button cycling AUTO / RAIN / CLEAR (`weatherMode`) so rain can be forced for testing instead of waiting on the auto-cycle.

## v22 (batch 2b — car mods)
- **Garage upgrades**: each owned personal car can buy Engine / Turbo / Tyres upgrades (3 levels each) in the showroom. Engine raises top speed (+12%/lvl), Turbo raises accel (+12%/lvl), Tyres raise handling (+7%/lvl). Base stats stored on the car; `applyMods` recomputes effective stats on buy and on load. Levels persist in `state.mods` (pid -> [eng,turbo,tyres]); cost = $800×(level+1). Stat bars in the showroom reflect the upgraded values.

## v23 (batch 3 — vigilante + 6-star wanted)
- **Vigilante crook chase**: in freeplay, while driving, a fleeing crook car periodically spawns (`updateVigilante`) with a flashing red marker (3D + minimap). It flees from the player; ram it to bust for escalating cash (400 + 50×busts). Times out / escapes if not caught. Busts persist in `state.busts`; new **Street Justice** achievement at 5 busts.
- **6-star wanted**: max wanted raised 3→5 with `POLICE_N` 3→5; police chase faster at higher stars (`tgt = 19 + heat·1.2`).

## v24 (batch 4 — apartment + photo mode)
- **Apartment**: a buyable Home building (cell 2,3, north of the plaza, $6,000). On foot near it: BUY HOME when unowned, REST when owned. Resting advances `simTime` by half a cycle (flips day↔night) — a cozy life-sim touch. Ownership persists (`state.home`); new **Homeowner** achievement. Sign flips FOR SALE → HOME on purchase.
- **Photo Mode**: a 📷 HUD button hides all UI via a `body.photo` class (and suppresses 3D markers) for a clean screenshot; you can still drive/walk to frame the shot, and a ✕ Photo button exits. Guarded so the headless smoke (no `document.body.classList`) is unaffected.

## v25 (batch 5 — paramedic side hustle)
- **Paramedic**: in freeplay while driving, an emergency patient periodically spawns (cyan marker on world + minimap). Reach them to pick up, then rush to the new Hospital building (cell 3,4) within ~38s to deliver for escalating cash (350 + 45×rescues). Times out if too slow. `state.rescues` persists; new **First Responder** achievement at 5. Built as `updateParamedic`, gated so it won't overlap a race or crook chase.

## v26 (QA pass — bug/glitch fixes)
- Audited that every `dom(id)` reference exists in index.html (no load-time crash) and that `SHADOW_N` accounts for the added motorbikes (no instanced-buffer overflow).
- Fixes: locked/unowned showroom cars no longer glow headlights at night; the vigilante crook and paramedic call can no longer trigger simultaneously (crook gated on `medic.stage === "idle"`); the paramedic patient now shows a visible person figure at the pickup instead of a bare marker.
- Smoke test extended to exercise the nitro/boost path.

## v27 (character glow-up)
- Rebuilt all people from boxes into smooth, proportioned stylised characters using new rounded vertex-coloured helpers (`cylC`/`sphC`): tapered legs, hips, wider-shouldered torso, arms with hands, neck, a rounded head with a face (eyes), hair cap, and shoes. Applied to pedestrians, story characters and the player (player keeps articulated cylinder limbs + child shoes/hands so the walk animation still works). Pedestrians still share 5 merged geometries → still ~1 draw call each. Not rigged/photoreal (no asset pipeline) but a large perceived-quality jump from the blocky look.

## v28 (crowd diversity)
- Pedestrians now vary: 8 NPC palettes with mixed skin tones / shirt colours, some wearing **hats** (brim+crown), plus **bun** and **long** hair styles; each pedestrian also gets a random height/build scale. Picked randomly per spawn for a more lifelike crowd. Still merged geometry (shared across peds).

## v29 (combat pillar — health, damage, fight-back, wasted/respawn)
- **Health** (0–100, runtime): a top-centre bar shows when hurt; regenerates after a 3s out-of-combat delay. `hurt(n)` flashes/shakes/buzzes.
- **Damage**: police now *ram and drain health* (26/hit on a cooldown) instead of an instant bust; hard car crashes can also hurt. At 0 HP → **Wasted**: respawn at your apartment (if owned) else the plaza, fine scaled by wanted, wanted cleared, health restored — a real fight-or-flight survival loop (and the checkpoint/respawn system).
- **Melee punch** (👊 button on foot / F key): quick jab that knocks back pedestrians and **takes down a fleeing crook on foot** (ties combat into the vigilante hustle). Animated on the hero's right arm.
- Controls hint/legend updated. Smoke covers wasted+respawn, regen, and a punch KO.

## v30 (vehicle fuel + local leaderboard + tutorial)
- **Fuel**: a tank that burns while driving (faster with nitro), shown as a blue bar on the speedometer. A roadside **gas station** (pump + canopy, west-central) refuels when you're near. Empty = limp speed only (never hard-strands); low-fuel warning. Refills on respawn.
- **Local leaderboard**: the progress panel now ranks your best lap per circuit against preset rivals (Vince/Rosa/Marco/Tony) with YOU highlighted — a replay/competition hook (no server; multiplayer intentionally not attempted).
- **Tutorial**: a one-time "How to Play" overlay on first launch (controls + goals), input-gated, dismissed with a button and remembered via localStorage.

## v31 (player level / XP progression — "get past level 1")
- **Player level**: a single XP spine the whole economy feeds. Every payout — missions, side jobs, races (incl. best-lap & medal bonuses), Golden Palms, crook busts, paramedic rescues, stunt-jump bonuses — now routes through a central `earn(base)` that banks the cash *and* grants XP (`base/8`).
- **Level curve**: `xpNeed(l) = 80 + (l-1)·70`, capped at `LVL_MAX` 30. Each level-up pays a cash reward (`level·150`) and toasts/jingles/flashes/buzzes; achievements re-check and save on every level-up.
- **Earnings multiplier**: each level adds +3% to all earnings via `lvlMult` (folded into `incomeRate()` so passive business income, the HUD rate, and every `earn()` payout all scale together). Shown in the progress panel as "(+N% earnings)".
- **HUD**: a LV badge + XP progress bar in the money box (cached writes, no per-frame churn). Progress panel adds a Player-level row (LV · XP/next · earnings bonus).
- **Achievements**: two new milestones — Rising Star (level 10) and City Legend (level 25).
- **Save/smoke**: `xp`/`lvl` persist (default to 0/1 for old saves, so existing progress is untouched); smoke test exercises the level-up loop, the multiplier bump and the milestone achievements.
