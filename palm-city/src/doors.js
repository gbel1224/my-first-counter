// Palm City — getting in and out. The driver's door swings open on its front hinge, you duck in
// (or step out) and it thumps shut. Purely cosmetic: control is instant, the animation plays on
// top. The driver's side is the car's local +x, the side exitCar() puts you out on. Cars built by
// makeCar have real doors cut from the body; anything else gets a stand-in panel.
import * as THREE from "../vendor/three.module.js";
import { MAT } from "./cars.js";

const OPEN = 1.1;
export function makeDoors() {
  const anims = [];
  function doorFor(c) {
    if (c.door) return c.door;
    // cars with real doors: the driver's (front, +x side) swings on its own hinge
    if (c.doors && c.doors.FL) return (c.door = { pivot: c.doors.FL, len: 1, real: true });
    const S = c.spec, ride = S.ride || 0.18, top = S.cabin ? S.cabin[1][1] : 1.45;
    const hingeZ = S.cabin ? S.cabin[3][0] - 0.05 : 1.0, len = Math.min(1.25, hingeZ + 0.35);
    const pivot = new THREE.Group(); pivot.position.set((S.wid || 1.8) / 2 + 0.005, ride, hingeZ);
    const skin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, len), c.body.material); skin.position.set(0, 0.64, -len / 2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, top - 0.98, len * 0.86), MAT.glass); frame.position.set(-0.02, 0.94 + (top - 0.98) / 2, -len * 0.5);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 })); handle.position.set(0.04, 0.82, -len * 0.82);
    for (const m of [skin, frame]) m.castShadow = true;
    pivot.add(skin, frame, handle); pivot.visible = false;
    c.chassis.add(pivot);
    c.door = { pivot, len };
    return c.door;
  }
  // kind: "in" (you climb in, it shuts behind you) or "out"
  function play(c, kind) {
    if (!c || c.kind || !c.body) return;                // bikes, boats and aircraft have no doors
    const d = doorFor(c);
    for (const a of anims) if (a.c === c) a.t = 99;      // cut any animation already on this car
    anims.push({ c, d, kind, t: 0 });
  }
  function update(dt) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]; a.t += dt;
      const T = 0.75, t = a.t;
      // swing: open fast, hold while you get through, then close with a little overshoot
      let ang = t < 0.22 ? OPEN * Math.sin(t / 0.22 * Math.PI / 2) : t < 0.42 ? OPEN : t < 0.62 ? OPEN * (1 - (t - 0.42) / 0.2) ** 2 : Math.max(0, -0.04 * Math.sin((t - 0.62) * 40));
      a.d.pivot.rotation.y = -ang;
      if (!a.d.real) a.d.pivot.visible = t < T;
      if (t >= T) { if (!a.d.real) a.d.pivot.visible = false; a.d.pivot.rotation.y = 0; anims.splice(i, 1); }
    }
  }
  // where to draw the player while they climb in: null when they're already inside
  function climber(c) {
    const a = anims.find(a => a.c === c && a.kind === "in");
    if (!a || a.t > 0.5) return null;
    const S = c.spec, f = Math.min(1, a.t / 0.5), e = f * f * (3 - 2 * f);
    const lx = ((S.wid || 1.8) / 2 + 0.55) * (1 - e) + 0.35 * e, lz = 0.25 - e * 0.25;
    const cs = Math.cos(c.h), sn = Math.sin(c.h);
    return { x: c.x + lx * cs + lz * sn, z: c.z - lx * sn + lz * cs, y: (c.y || 0) - e * 0.35, yaw: c.h - Math.PI / 2 * (1 - e * 0.6), duck: e };
  }
  return { play, update, climber };
}
