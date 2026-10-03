// Palm City — getting in and out, choreographed. Each kind of vehicle has its own routine:
//   car:   reach for the handle, the door swings open, turn and duck in leg first, drop into
//          the seat, pull the door shut
//   truck: grab the handle up high, climb the step and haul yourself up into the cab, sit
//   bus:   the folding doors open, up the two steps, along to the driver's seat, doors fold shut
//   bike:  hands on the bars, swing a leg over, settle onto the seat
// Each routine is a timeline of keys (where you stand in the vehicle's own frame, how high your
// hips are, which way you face, what your limbs do) blended smoothly, with the door angles keyed
// to the same clock. Getting out plays the same timeline backwards. Control waits until you're
// in the seat. The driver's side is the vehicle's local +x; the bus is boarded from its -x side.
import * as THREE from "../vendor/three.module.js";
import { MAT } from "./cars.js";

const ease = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const SIT = { thighL: -1.45, thighR: -1.45, kneeL: 1.45, kneeR: 1.45 };
const HANDS_ON_WHEEL = { armL: -1.12, armR: -1.12, elbowL: -0.62, elbowR: -0.62, gripL: 0.9, gripR: 0.9 };

// the routines. lx/lz: position in the vehicle frame; rise: how far the hips are above standing
// height (seat: dropped to the seat); yaw: facing in the vehicle frame (0 = forward, -PI/2 = facing
// the car from its +x side); walk: stepping; o: limb overrides
function routine(style, c) {
  const S = c.spec, W = (S.wid || 1.8) / 2, seat = S.seat || { x: 0.45, y: 0.7, z: 0.4 };
  if (style === "car") {
    const d = c.doors && c.doors.FL, dz = d ? d.position.z - 0.45 : seat.z + 0.3;
    return { dur: 1.3, door: [0.06, 0.36, 0.84, 1.1], keys: [
      { t: 0, lx: W + 0.62, lz: dz, rise: 0, yaw: -Math.PI / 2, o: {} },
      { t: 0.3, lx: W + 0.55, lz: dz - 0.1, rise: 0, yaw: -Math.PI / 2, o: { armR: -1.0, elbowR: -0.5, gripR: 0.8, lean: 0.08 } },
      { t: 0.62, lx: W + 0.12, lz: seat.z + 0.15, rise: -0.22, yaw: -0.25, walk: 1, o: { thighL: -1.25, kneeL: 1.3, lean: 0.5, armL: -0.6, elbowL: -0.8 }, head: 0.3 },
      { t: 0.92, lx: seat.x + 0.05, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, lean: 0.1, armR: -0.6, elbowR: -0.9 }, head: 0.1 },
      { t: 1.15, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, armR: -1.4, elbowR: -0.2, armL: -1.12, elbowL: -0.62, gripR: 0.9, lean: -0.05 } },
      { t: 1.3, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, ...HANDS_ON_WHEEL, lean: -0.05 } },
    ] };
  }
  if (style === "truck") {
    const d = c.doors && c.doors.FL, dz = d ? d.position.z - 0.55 : seat.z + 0.3, step = 0.48, floor = (S.floor || 1.1) - 0.08;
    return { dur: 1.75, door: [0.08, 0.4, 1.3, 1.6], keys: [
      { t: 0, lx: W + 0.75, lz: dz, rise: 0, yaw: -Math.PI / 2, o: {} },
      { t: 0.32, lx: W + 0.62, lz: dz, rise: 0, yaw: -Math.PI / 2, o: { armR: -2.1, elbowR: -0.3, gripR: 0.9, armL: -0.4 } },
      { t: 0.68, lx: W + 0.32, lz: dz, rise: step, yaw: -Math.PI / 2, o: { thighR: -1.5, kneeR: 1.55, armR: -2.5, elbowR: -0.6, armL: -2.3, elbowL: -0.5, gripL: 0.95, gripR: 0.95, lean: 0.2 } },
      { t: 1.0, lx: W - 0.1, lz: seat.z + 0.2, rise: floor, yaw: -0.6, o: { thighL: -0.9, kneeL: 1.0, armL: -1.6, elbowL: -0.8, lean: 0.35 }, head: 0.2 },
      { t: 1.32, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, armR: -0.6, elbowR: -0.9, lean: 0.05 } },
      { t: 1.55, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, armR: -1.3, elbowR: -0.3, armL: -1.12, elbowL: -0.62, gripR: 0.9 } },
      { t: 1.75, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, ...HANDS_ON_WHEEL } },
    ] };
  }
  if (style === "bus") {
    const zd = c.doors && c.doors.BA ? (c.doors.BA.position.z + c.doors.BB.position.z) / 2 : seat.z, floor = (S.floor || 0.55) - 0.05;
    return { dur: 2.2, fold: [0.04, 0.4, 1.7, 2.05], keys: [
      { t: 0, lx: -W - 0.8, lz: zd, rise: 0, yaw: Math.PI / 2, o: {} },
      { t: 0.42, lx: -W - 0.55, lz: zd, rise: 0, yaw: Math.PI / 2, walk: 1, o: {} },
      { t: 0.75, lx: -W + 0.15, lz: zd, rise: floor * 0.45, yaw: Math.PI / 2, walk: 1, o: { thighR: -1.1, kneeR: 1.2, armL: -1.0, elbowL: -0.4, gripL: 0.9 } },
      { t: 1.05, lx: -W + 0.6, lz: zd, rise: floor, yaw: Math.PI / 2, walk: 1, o: { thighL: -1.1, kneeL: 1.2 } },
      { t: 1.45, lx: seat.x - 0.1, lz: seat.z - 0.45, rise: floor, yaw: 0.3, walk: 1, o: {} },
      { t: 1.8, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, lean: 0.08 } },
      { t: 2.2, lx: seat.x, lz: seat.z, rise: "seat", yaw: 0, o: { ...SIT, ...HANDS_ON_WHEEL } },
    ] };
  }
  if (style === "bike") {
    return { dur: 1.0, keys: [
      { t: 0, lx: 0.62, lz: -0.05, rise: 0, yaw: 0, o: {} },
      { t: 0.25, lx: 0.5, lz: -0.05, rise: 0, yaw: 0, o: { armL: -1.0, armR: -1.0, elbowL: -0.3, elbowR: -0.3, gripL: 0.8, gripR: 0.8, lean: 0.25 } },
      { t: 0.55, lx: 0.25, lz: -0.2, rise: 0.04, yaw: 0, o: { thighR: -1.8, kneeR: 1.7, armL: -1.1, armR: -1.1, elbowL: -0.3, elbowR: -0.3, gripL: 0.9, gripR: 0.9, lean: 0.45 } },
      { t: 0.8, lx: 0, lz: -0.25, rise: "bike", yaw: 0, o: { thighL: -1.45, thighR: -1.45, kneeL: 1.5, kneeR: 1.5, armL: -1.1, armR: -1.1, elbowL: -0.3, elbowR: -0.3, gripL: 0.9, gripR: 0.9, lean: 0.35 } },
      { t: 1.0, lx: 0, lz: -0.25, rise: "bike", yaw: 0, o: { thighL: -1.45, thighR: -1.45, kneeL: 1.5, kneeR: 1.5, armL: -1.1, armR: -1.1, elbowL: -0.3, elbowR: -0.3, gripL: 0.9, gripR: 0.9, lean: 0.35 } },
    ] };
  }
  return null;
}
export function styleOf(c) {
  if (!c) return null;
  if (c.kind === "bike") return "bike";
  if (c.kind) return null;                           // boats and aircraft: you just hop in
  if (c.spec && c.spec.busDoor) return "bus";
  if (c.spec && c.spec.big) return "truck";
  return "car";
}

export function makeDoors() {
  const anims = [];
  // a stand-in door for anything without real ones
  function standIn(c) {
    if (c.door) return c.door;
    const S = c.spec, ride = S.ride || 0.18, top = S.cabin ? S.cabin[1][1] : 1.45;
    const hingeZ = S.cabin ? S.cabin[3][0] - 0.05 : 1.0, len = Math.min(1.25, hingeZ + 0.35);
    const pivot = new THREE.Group(); pivot.position.set((S.wid || 1.8) / 2 + 0.005, ride, hingeZ);
    const skin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, len), c.body.material); skin.position.set(0, 0.64, -len / 2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, Math.max(0.2, top - 0.98), len * 0.86), MAT.glass); frame.position.set(-0.02, 0.94 + (top - 0.98) / 2, -len * 0.5);
    pivot.add(skin, frame); pivot.visible = false; c.chassis.add(pivot);
    return (c.door = pivot);
  }
  // kind: "in" or "out"
  function play(c, kind, startT = 0) {
    const style = styleOf(c);
    if (!style) return;
    const R = routine(style, c);
    for (const a of anims) if (a.c === c) a.t = 99;
    if (style !== "bike" && !(c.doors && (c.doors.FL || c.doors.BA)) && c.body) R.standIn = standIn(c);
    anims.push({ c, kind, style, R, t: startT });
  }
  const doorAng = (w, t, OPEN) => {                  // open, hold, shut with a little bounce
    const [a, b, c2, d] = w;
    if (t < a) return 0;
    if (t < b) return OPEN * Math.sin((t - a) / (b - a) * Math.PI / 2);
    if (t < c2) return OPEN;
    if (t < d) return OPEN * (1 - ease((t - c2) / (d - c2)));
    return Math.max(0, -0.04 * Math.sin((t - d) * 40)) * (t < d + 0.15 ? 1 : 0);
  };
  function update(dt) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]; a.t += dt;
      const { R, c } = a, T = a.kind === "in" ? a.t : R.dur - a.t;     // getting out runs the clock backwards
      if (R.door) {
        const ang = doorAng(R.door, T, 1.1);
        if (c.doors && c.doors.FL) c.openDoor("FL", ang);
        else if (R.standIn) { R.standIn.rotation.y = -ang; R.standIn.visible = ang > 0.01; }
      }
      if (R.fold && c.doors && c.doors.BA) { const f = doorAng(R.fold, T, 1.35); c.openDoor("BA", f); c.openDoor("BB", f); }
      if (a.t >= R.dur + 0.2) {
        if (c.doors) for (const k in c.doors) c.openDoor(k, 0);
        if (R.standIn) R.standIn.visible = false;
        anims.splice(i, 1);
      }
    }
  }
  // where the player is and what they're doing mid-routine (world space), or null.
  // For getting out, pass null: it finds the routine for the vehicle just left.
  function pose(c, look) {
    const a = anims.find(a => (c ? a.c === c : a.kind === "out") && a.t < a.R.dur);
    if (!a) return null;
    const { R } = a, v = a.c, T = Math.max(0, Math.min(R.dur, a.kind === "in" ? a.t : R.dur - a.t));
    const K = R.keys;
    let i = 0; while (i < K.length - 2 && T > K[i + 1].t) i++;
    const k0 = K[i], k1 = K[i + 1], f = ease(Math.max(0, Math.min(1, (T - k0.t) / (k1.t - k0.t))));
    const h = (look && look.h) || 1, seatY = (v.spec.seat ? v.spec.seat.y : 0.7);
    const riseOf = k => k.rise === "seat" ? seatY - 0.97 * h + 0.02 : k.rise === "bike" ? 0.62 - 0.97 + 0.12 : k.rise;
    const lx = lerp(k0.lx, k1.lx, f), lz = lerp(k0.lz, k1.lz, f), rise = lerp(riseOf(k0), riseOf(k1), f);
    let dy = k1.yaw - k0.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = k0.yaw + dy * f;
    const over = {};
    for (const key of new Set([...Object.keys(k0.o), ...Object.keys(k1.o)])) over[key] = lerp(k0.o[key] ?? (key.startsWith("grip") ? 0.22 : 0), k1.o[key] ?? (key.startsWith("grip") ? 0.22 : 0), f);
    const cs = Math.cos(v.h), sn = Math.sin(v.h);
    return {
      x: v.x + lx * cs + lz * sn, z: v.z - lx * sn + lz * cs, y: (v.y || 0) + rise, yaw: v.h + yaw,
      walk: (k1.walk || 0) * (f > 0 && f < 1 ? 1 : 0), over, headPitch: lerp(k0.head || 0, k1.head || 0, f), t: a.t,
    };
  }
  // the spot beside the vehicle where a routine starts (and getting out ends)
  function exitSpot(c) {
    const R = routine(styleOf(c), c);
    if (!R) return null;
    const k = R.keys[0], cs = Math.cos(c.h), sn = Math.sin(c.h);
    return { x: c.x + k.lx * cs + k.lz * sn, z: c.z - k.lx * sn + k.lz * cs, yaw: c.h + k.yaw };
  }
  // still climbing in: the vehicle shouldn't drive off yet
  const busy = c => anims.some(a => a.c === c && a.kind === "in" && a.t < a.R.dur * 0.85);
  const leaving = () => anims.some(a => a.kind === "out" && a.t < a.R.dur);
  // the old API: the climbing pose while getting in
  const climber = c => { const p = pose(c); return p && p.t < (anims.find(a => a.c === c).R.dur) ? p : null; };
  return { play, update, pose, climber, busy, leaving, exitSpot };
}

// the driver at the wheel, in world space: hips on the seat, hands on the wheel (turned a little
// with the steering), for any vehicle with a seat
export function seatPose(c, look, steer = 0) {
  const s = c.spec.seat;
  if (!s) return null;
  const h = (look && look.h) || 1, cs = Math.cos(c.h), sn = Math.sin(c.h);
  const st = Math.max(-1, Math.min(1, steer));
  return {
    x: c.x + s.x * cs + s.z * sn, z: c.z - s.x * sn + s.z * cs, y: (c.y || 0) + s.y - 0.97 * h + 0.02, yaw: c.h,
    over: { ...SIT, ...HANDS_ON_WHEEL, armL: -1.12 + st * 0.18, armR: -1.12 - st * 0.18, lean: -0.16, roll: c.roll || 0 },
  };
}
