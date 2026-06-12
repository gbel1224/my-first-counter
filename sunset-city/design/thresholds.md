# Performance & tuning thresholds (fixed before code)

- Target: 60 fps on a mid-range phone; logic on a fixed 60 Hz timestep, render decoupled
- devicePixelRatio cap: 1.5 · antialias on · shadows OFF (blob shadows only)
- Draw calls < 120 worst case:
  - all buildings = 1 InstancedMesh · trees = 2 InstancedMesh (trunks, canopies)
  - sidewalk/park slabs = instanced · each car = 1 merged vertex-colored mesh
  - NPCs = 1 merged mesh each (waddle anim via transform, no per-limb meshes); player only has articulated limbs
- Entity caps: 14 pedestrians, 10 traffic cars, 4 drivable cars
- Zero allocations in the frame loop (preallocated temp vectors); seeded RNG (mulberry32) for all world gen
- Input tolerance: interact radius 5 u on foot / 7 u in car; joystick dead zone 12%; gamepad dead zone 20%
- World: 6×6 blocks, block 70 u, road 18 u (~530 u square); fog far 420 u
