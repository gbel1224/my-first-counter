# PALM CITY — Game Design Brief

A complete description of the game, written so it can be handed to a new developer (or AI chat) to rebuild it from scratch in Unity with upgraded graphics. This describes WHAT the game is — the original web version was built in Three.js/JavaScript, but nothing below depends on that.

## High concept

**Palm City** is a GTA-style open-world crime sandbox set in a sunny, pastel beach city — think Vice City meets a stylized low-poly look. Third-person ground-level play: walk, fight, shoot, jack cars, fly helicopters and planes, drive boats, buy businesses and properties, run missions for money, build a criminal empire, and cause as much (or as little) chaos as you want. Designed mobile-first (touch controls) but fully playable with keyboard.

## The world

- A large grid city: 40×40 blocks of streets with working traffic lights, crosswalks, sidewalks, street lamps (glow at night), palm trees, benches, trash cans, hydrants, planters, ATMs, stunt ramps.
- **Districts:** a downtown core of glassy towers, pastel mid-rise blocks, a leafy suburb of small houses, a run-down "rough quarter" with grimy buildings, green parks, and a central plaza (the story's hub).
- **The beach** along the whole south edge: sand, umbrellas, beach palms, a boardwalk crowd, a playable basketball court with two hoops, and the open ocean with boats.
- **An airport** to the west: runway, terminal, control tower, parked planes and a helicopter.
- **A harbor/marina** with drivable boats.
- Full **day/night cycle** (street lamps and building windows light up at night, cars get headlight beams) and **weather**: rain that rolls in, grays out the sky, and makes the roads dark, wet and reflective. Player can lock weather to clear/rain/auto and lock time-of-day in settings.
- Landmark buildings you can walk into (interiors): your home/apartment/house (decoratable), a bowling alley with arcade cabinets, clothing shops, barbershops, a gun store/ammo shop, a hospital, a garage dealership, businesses.

## The player

- Third-person articulated character (swinging arms/legs, knee joints, walk/run gait, idle poses).
- **Customization:** wardrobe outfits (clothing shops), haircuts (barbershop), plus accessories: jackets, hats, glasses, beards. All persist in the save.
- **Health** regenerates slowly after a few seconds out of danger. Death ("WASTED") = ragdoll corpse, a cash fine scaled by wanted level, respawn at your owned property (or the plaza).
- **Fuel** for vehicles, refill at the gas station. 

## Movement & vehicles

- On foot: walk/run, enter any unlocked vehicle.
- **Cars**: free city cars + jackable traffic. 3 buyable personal cars at the garage dealership (Coral $1.5k / Azure $4k / Sterling $12k) with distinct accel/top-speed/turn stats, perks (jump boost, heat magnet, fine discount), engine/turbo/tyre upgrades, and repainting. Personal cars persist.
- **Motorbikes** (nimble, lean into turns, rider visibly mounts), **helicopters** (vertical lift, hover), **planes** (build speed on the runway, take off, fly), **boats** (harbor + open sea), and a hidden **jetpack** pickup (hold boost to fly on foot).
- Vehicle feel: weight transfer (pitch/roll under braking/acceleration), skid marks, stunt ramps with air-time jump scoring ("best jump" record), horn, brake lights.
- Hitting pedestrians hard sends them ragdolling; car collisions knock over street props (trash cans, hydrants tumble with physics).

## Combat

- **Melee:** 3-hit combo — jab, jab, finishing kick (bigger reach/knockback). Input buffering so fast presses chain smoothly. The player takes a fists-up fighting stance automatically when hostiles are near.
- **Punched NPCs** ragdoll to the ground, then either get up and FIGHT BACK or flee — odds depend on their mood/anger. Every fighting NPC has a unique persistent fighting style: different reach, swing speed, timing, accuracy, side-to-side weave, guard height — and some are kickers with their own kick animation.
- **Weapons** (bought at the Ammo Shop, switched via a weapon wheel): Pistol, Micro SMG, SMG, Shotgun, Combat Shotgun, Rifle, Sniper Rifle, Minigun, Grenade Launcher, RPG. Per-weapon fire rate, range, spread, pellet count, ammo economy.
- **Real projectiles:** visible bullet tracers; rockets and grenades physically fly to the target and only detonate on arrival. Muzzle flashes, arm recoil, camera kick. A dedicated FIRE button appears when armed.
- **Explosions** are chained: exploding cars damage nearby cars (chain reactions), fling ragdolls and loose props with a radial shockwave, and scale with your rampage multiplier.
- **Rampage combo system:** continuous destruction builds a combo multiplier (up to 8x) that scales cash from mayhem; banked rampage score is a chase-the-record stat.
- **Ragdoll physics** everywhere: deaths, car hits, explosions, knockdowns — bodies tumble with limb springs, settle, and (if alive) get back up.

## Crime & police

- **Wanted level (1–5 stars):** crimes raise heat; police cars chase and PIT-ram you. At 4 stars a police helicopter joins; at 5 stars an army tank. Evade until the heat decays, or die/get busted (fine).
- **Crime activities:** rob ATMs, hold up stores (timed getaway), crack open rare armored cash trucks for big loot, mug/fight pedestrians.
- **Gang turf wars:** 3 hostile gangs each hold a district (red/blue/green tinted turf on the map). Enter their turf and they attack; wipe out a turf's gang to capture it permanently.
- **Nemesis system:** a rival crime boss — Vic "The Shark" Moreno — holds a grudge that grows as you succeed. He sends escalating hit squads, taunts you, and eventually calls a boss showdown (big health bar, armed goons, an armored boss car). Beat him and he returns stronger (NG+ tiers). Boss wins are tracked.

## Story & missions

- A **12-chapter story** told through dialogue (portrait-style dialogue boxes, tap-to-advance): a newcomer arrives in Palm City with $25, meets Marco who lends him a hatchback, and climbs from odd jobs to owning the city — deliveries, races against a rival, business deals, betrayals, a mid-story "everything taken away" twist (chapter 10 halves your income), and a final showdown that hands over the keys to the city.
- Mission structure: go-to markers, timed race legs, condition steps. Freeplay unlocks fully after the story.
- **Phone (on-demand jobs):** Rampage (wreck 5 cars in 60s), Courier (timed delivery), Bounty (destroy a marked car), Turf Takeover, and Hire Muscle ($1500 for an armed ally who follows you and guns down gangsters).
- **Side gigs (freeplay):** Vigilante (chase down fleeing crooks, on foot or by car, escalating rewards), Paramedic (rush patients to the hospital), Taxi-style side job after chapter 5.

## Economy & progression

- **Money** is the spine: earned from missions, jobs, crimes, races, sports, minigames.
- **Businesses to buy** (passive income, upgradeable levels): Hot-dog stand $500, Car Wash $2k, Taxi Co. $3.5k, Burger joint $5k, Nightclub $10k, Marina $15k. Income accrues and is collected on visit (tips).
- **Properties:** Apartment $2.5k (rough quarter), Condo $6k (central), House $12k (suburbs). Owning one = respawn point + rest-to-pass-time + a decoratable interior (furniture, colors, rugs, TV, art...).
- **XP & levels:** every payout grants XP; each level permanently boosts all earnings. 
- **Collectibles:** 12 Golden Palms hidden across the city (bonus for all 12).
- **Street races:** multiple circuits with checkpoint gates, time limits, best-lap records, and bronze/silver/gold medals with bonuses.
- **Achievements** panel + stats screen (busts, rescues, best jump, best rampage, max money, boss wins...).
- **Autosave** every few seconds; everything persists (money, cars, mods, outfits, weapons, ammo, properties, decor, palms, races, medals, achievements, level).

## Minigames & activities

- **Bowling alley:** roll the ball down the lane, pin physics, strikes pay big.
- **Arcade cabinets** (inside the bowling alley): Bug Smash (tap bugs, timed), Lucky Spin (slot machine, $25/spin), Quick Reflex (reaction timer).
- **Beach basketball:** walk to a hoop, the action button becomes SHOOT; ball arcs to the rim, accuracy scales with distance, makes pay cash, makes/attempts streak on a scoreboard. Idle dribble + jump-shot animations.
- **Stunt jumps:** ramps everywhere; air time + distance scored.

## NPCs & city life

- 1,000+ pedestrians with distinct looks (varied outfits, hairstyles, hats, skin tones) walking sidewalks, crossing at crosswalks, gathering at the beach/plaza.
- **Talk system:** walk up and talk to anyone — moods (friendly/neutral/grumpy), GTA-style one-liner banter, be nice or rude, anger them enough and they may swing at you.
- NPCs react: flee from gunfire/explosions/cars, scatter screaming, fight back.
- ~250 traffic cars that obey signals, queue behind each other, honk when stuck, panic and floor it when you're rampaging nearby.

## HUD & UI

- **Google-Maps-style minimap** (top corner): player-centered, zoomed local streets, white roads on light land, sand/water bands, POI markers (businesses gold/green, garage blue, police red, gang turf tinted circles, objective flash, altitude ring when flying).
- **Full-screen city map** with district colors and all POIs.
- Touch controls: floating left joystick, action buttons (A/B context actions, PUNCH/SHOOT, dedicated FIRE when armed, brake/boost driving, climb/dive flying), weapon wheel, phone, ☰ menu (map/stats/photo mode/settings). Keyboard equivalents on desktop.
- Toasts for events, chapter title banner, cash/XP popups, boss health bar, wanted stars, health/fuel bars, dialogue boxes.
- **Photo mode**, screen shake, hit-stop freeze frames, haptic vibration, particle bursts, additive muzzle flashes/explosions.
- Settings: graphics quality (adaptive resolution), bloom, SSAO, day/night lock, weather lock, mute.

## Art & audio direction (original)

- Stylized low-poly: merged vertex-colored primitives for characters/vehicles, procedural textures (asphalt, facades with lit windows, sand), pastel palette, golden-hour lighting with an image-based sky, soft shadows, bloom. In Unity this is the area to upgrade most: real models, PBR materials, post-processing.
- Audio: procedural SFX (gunshots, explosions, horns, cash, jingles, door thuds) + engine hum; no licensed music.

## Suggested Unity notes

- Deterministic procedural city gen is optional in Unity — a hand-built or generated static city scene works; keep the district structure and POI layout.
- Keep the LOD philosophy: only simulate NPCs/traffic near the player (the web version proved this pattern).
- Mobile-first performance target; touch + gamepad + keyboard input.
- Reference playable of the original web version: https://gbel1224.github.io/my-first-counter/
