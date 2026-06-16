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
