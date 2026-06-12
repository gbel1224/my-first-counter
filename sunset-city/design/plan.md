# Sunset City — design plan

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
