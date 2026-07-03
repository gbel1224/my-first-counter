# 🌴 Palm City — Unity 3D Setup Guide

A GTA III-style 3D remake of the [web version](https://gbel1224.github.io/my-first-counter/).
Everything — city, cars, pedestrians, cops, UI — is generated **from code and primitives**, so you can press Play with zero art assets and see the whole game running. Swap in real models later, piece by piece.

---

## 1. Which Unity version?

**Install Unity 6 LTS (6000.x)** from Unity Hub — that's the current long-term-support release.

> ⚠️ **Do not use Unity 5.5.** It's from 2016: unsupported, incompatible with modern C#, packages, tutorials, and these scripts. Anything from **2021.3 LTS and newer** works; Unity 6 LTS is the recommended choice.

In Unity Hub: **Installs → Install Editor → Unity 6 LTS**. If you plan to publish to your phone, tick **Android Build Support** (or **iOS Build Support** on a Mac) during install.

## 2. Option A — open this folder directly (fastest)

The `unity/` folder **is** a Unity project. No creating, no copying:

1. Get the repo onto your machine: `git clone https://github.com/gbel1224/my-first-counter.git` (or GitHub → **Code → Download ZIP** and extract).
2. Unity Hub → **Projects → Add → Add project from disk** → select the `my-first-counter/unity` folder.
3. Open it. If Hub warns the exact editor version isn't installed, just pick your Unity 6 install and confirm the upgrade.
4. First open takes a minute while Unity imports. Then open **`Assets/Scenes/Main.unity`** and press **Play**.

That's it — the title screen (**New Game / Continue / Free Roam**) comes up. This project uses the built-in render pipeline and classic input, so no extra settings are needed.

> On Unity **2021/2022 LTS** instead of Unity 6: edit `Packages/manifest.json` and change `"com.unity.ugui": "2.0.0"` to `"1.0.0"` before opening.

## 3. Option B — add to an existing project

If you'd rather bring Palm City into a project you already have:

1. Copy the `Assets/PalmCity` folder into your project's `Assets/`. Wait for the compile spinner — there should be no errors.
2. If your project uses the **Input System** package (URP templates do): **Edit → Project Settings → Player → Other Settings → Active Input Handling → Both**, and let the editor restart.
3. New empty scene (delete any default camera/light — the game spawns its own) → **GameObject → Create Empty** → name it `Game` → **Add Component → Palm City Bootstrap** → **Play**.

In the Inspector on the `Game` object's `PalmCityBootstrap` component (both options):
- **Show Start Menu** — untick to boot straight into gameplay; the two options below then apply:
- **Free Roam** — skip the story, start with $5,000 and every weapon.
- **Load Save If Present** — continue from the last auto-save (story mode).

Sound effects are synthesized at runtime (`Core/Sfx.cs`) — gunshots, explosions, hits and cash chimes work with no audio files.

## 4. Controls

| Action | Touch (on-screen) | Editor keyboard |
|---|---|---|
| Move / steer | left joystick | WASD / arrows |
| Enter / exit vehicle | ENTER button | E |
| Fire (hold) | FIRE button | left mouse |
| Melee | HIT button | F |
| Switch weapon | tap the weapon box | Q |
| Brake (driving) | BRAKE button | Space |
| Pause | II button | — |

## 5. Build to your phone

**Android:** File → Build Settings → Android → Switch Platform → connect phone (USB debugging on) → Build and Run.
**iOS:** requires a Mac + Xcode; Build generates an Xcode project you run from there.

Set **Default Orientation → Landscape Left** in Player Settings (the HUD is laid out for landscape).

## 6. How it's organized

```
Assets/PalmCity/Scripts/
├── PalmCityBootstrap.cs   ← the single entry-point component (pre-placed in Assets/Scenes/Main.unity)
├── Core/      GameManager (cash/XP/level/death), SaveSystem (JSON), Mats,
│              Sfx (procedural sound effects)
├── World/     CityGenerator (roads/buildings/palms/beach), DayNightCycle (+rain)
├── Player/    PlayerController (walk/enter cars), PlayerCamera (chase cam + shake)
├── Combat/    WeaponSystem (7 weapons), Projectile (RPG), Explosion (chains), FX
├── Vehicles/  VehicleController (arcade physics, burn→explode), VehicleAI (traffic/chase)
├── AI/        PedestrianAI, CopAI, WantedSystem (5★ heat), EntityPopulator
├── Gameplay/  MissionManager (12 chapters), Pickup
└── UI/        HUDBuilder (whole HUD from code), StartMenu, VirtualJoystick,
               HoldButton, MinimapCamera, InputHub
```

Save file: `Application.persistentDataPath/palmcity_save.json` (auto-saves every 20 s and on mission complete).

## 7. Make it look real — free Asset Store models

The game has a **Visual Library**: slots for player / pedestrians / cops / cars / buildings / trees. Drop any prefab in a slot and every spawner uses it automatically (auto-scaled, physics untouched). Empty slots keep the primitive look.

**Good free packs (Asset Store, all $0):**

| Slot | Pack to search for | Notes |
|---|---|---|
| Everything at once | **"POLYGON Starter Pack" (Synty Studios)** | character, car, buildings, props in one consistent low-poly style — best first pick |
| Cars | **"ARCADE: FREE Racing Car"** | clean low-poly car |
| People | **"Character Pack: Free Sample" (Supercyan)** | casual characters |
| Trees | search **"free low poly tree"** | lots of options |

**How to wire them up:**

1. In Unity: **Window → Asset Store** (or visit assetstore.unity.com) → find the pack → **Add to My Assets**.
2. **Window → Package Manager → My Assets** → select the pack → **Download → Import**.
3. In your scene, select the **Game** object (the one with `PalmCityBootstrap`).
   *If your scene doesn't have one (auto-boot mode): GameObject → Create Empty → name it `Game` → Add Component → **Palm City Bootstrap**.*
4. **Add Component → Visual Library.**
5. In the imported pack's folders, find the **Prefabs** folder and drag prefabs into the matching slots: a character into **Player Model**, several people into **Pedestrian Models**, cars into **Car Models**, buildings into **Building Models**, trees into **Tree Models**.
6. Press **Play**.

Tips:
- Pick **plain prefabs** (just the model) — avoid ones named "…Controller" or with scripts attached.
- If cars drive **sideways**, set **Vehicle Yaw Offset** on the Visual Library to `90` or `-90`.
- Models are auto-scaled and their colliders stripped — gameplay hitboxes don't change.
- Characters without animations will glide instead of walk; packs whose prefabs include an idle animation look best. (Real walk animations are the next upgrade — ask for it.)

## 8. Where to take it next

- Replace capsule people / box cars with real models: edit the `Build(...)` factory methods in `PedestrianAI`, `CopAI`, `VehicleController`, `PlayerController` — the gameplay logic doesn't care what the visuals are.
- Nicer driving: swap the arcade math in `VehicleController.FixedUpdate` for `WheelCollider`s.
- Smarter pathfinding: add the AI Navigation package and move peds with `NavMeshAgent`.
- Better sound: replace the synthesized clips in `Core/Sfx.cs` with real `AudioClip` assets — the `Sfx.Play("boom")` call sites stay the same.
- More story: add entries to the chapter list in `MissionManager.Chapters()` — each is ~5 lines.
