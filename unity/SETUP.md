# 🌴 Palm City — Unity 3D Setup Guide

A GTA III-style 3D remake of the [web version](https://gbel1224.github.io/my-first-counter/).
Everything — city, cars, pedestrians, cops, UI — is generated **from code and primitives**, so you can press Play with zero art assets and see the whole game running. Swap in real models later, piece by piece.

---

## 1. Which Unity version?

**Install Unity 6 LTS (6000.x)** from Unity Hub — that's the current long-term-support release.

> ⚠️ **Do not use Unity 5.5.** It's from 2016: unsupported, incompatible with modern C#, packages, tutorials, and these scripts. Anything from **2021.3 LTS and newer** works; Unity 6 LTS is the recommended choice.

In Unity Hub: **Installs → Install Editor → Unity 6 LTS**. If you plan to publish to your phone, tick **Android Build Support** (or **iOS Build Support** on a Mac) during install.

## 2. Create the project

1. Unity Hub → **New Project**.
2. Template: **Universal 3D** (URP) — or "3D Core", both work.
3. Name it `PalmCity`, create.

## 3. One required setting

The touch/keyboard input uses Unity's classic input API, so:

- **Edit → Project Settings → Player → Other Settings → Active Input Handling → Both**
- Unity will restart the editor. (If you skip this, on-foot keyboard controls and UI taps won't respond in some templates.)

## 4. Add the scripts

Copy the `Assets/PalmCity` folder from this repo into your project's `Assets/` folder (drag it into the Project window, or copy it in Explorer/Finder while Unity is closed). Wait for the compile spinner to finish — there should be no errors.

## 5. Build the scene (30 seconds)

1. **File → New Scene** (Basic/Empty — either is fine). Delete any default objects except nothing is required; the game creates its own camera, light, and UI. *(If the template scene has a Main Camera or Directional Light, delete them to avoid duplicates.)*
2. Create an empty GameObject: **GameObject → Create Empty**, name it `Game`.
3. **Add Component → Palm City Bootstrap**.
4. Press **Play**. That's the whole setup.

In the Inspector on `PalmCityBootstrap`:
- **Free Roam** — skip the story, start with $5,000 and every weapon.
- **Load Save If Present** — continue from the last auto-save (story mode).

## 6. Controls

| Action | Touch (on-screen) | Editor keyboard |
|---|---|---|
| Move / steer | left joystick | WASD / arrows |
| Enter / exit vehicle | ENTER button | E |
| Fire (hold) | FIRE button | left mouse |
| Melee | HIT button | F |
| Switch weapon | tap the weapon box | Q |
| Brake (driving) | BRAKE button | Space |
| Pause | II button | — |

## 7. Build to your phone

**Android:** File → Build Settings → Android → Switch Platform → connect phone (USB debugging on) → Build and Run.
**iOS:** requires a Mac + Xcode; Build generates an Xcode project you run from there.

Set **Default Orientation → Landscape Left** in Player Settings (the HUD is laid out for landscape).

## 8. How it's organized

```
Assets/PalmCity/Scripts/
├── PalmCityBootstrap.cs   ← the one component you add by hand
├── Core/      GameManager (cash/XP/level/death), SaveSystem (JSON), Mats
├── World/     CityGenerator (roads/buildings/palms/beach), DayNightCycle (+rain)
├── Player/    PlayerController (walk/enter cars), PlayerCamera (chase cam + shake)
├── Combat/    WeaponSystem (7 weapons), Projectile (RPG), Explosion (chains), FX
├── Vehicles/  VehicleController (arcade physics, burn→explode), VehicleAI (traffic/chase)
├── AI/        PedestrianAI, CopAI, WantedSystem (5★ heat), EntityPopulator
├── Gameplay/  MissionManager (12 chapters), Pickup
└── UI/        HUDBuilder (whole HUD from code), VirtualJoystick, HoldButton,
               MinimapCamera, InputHub
```

Save file: `Application.persistentDataPath/palmcity_save.json` (auto-saves every 20 s and on mission complete).

## 9. Where to take it next

- Replace capsule people / box cars with real models: edit the `Build(...)` factory methods in `PedestrianAI`, `CopAI`, `VehicleController`, `PlayerController` — the gameplay logic doesn't care what the visuals are.
- Nicer driving: swap the arcade math in `VehicleController.FixedUpdate` for `WheelCollider`s.
- Smarter pathfinding: add the AI Navigation package and move peds with `NavMeshAgent`.
- Sound: add `AudioSource` calls in `WeaponSystem.TryFire`, `Explosion.Boom`, `VehicleController`.
- More story: add entries to the chapter list in `MissionManager.Chapters()` — each is ~5 lines.
