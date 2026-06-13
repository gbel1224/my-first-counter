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
