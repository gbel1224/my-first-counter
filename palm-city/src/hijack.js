// Palm City — hijacking. Every vehicle on the road near you has somebody at the wheel (a real
// person: commuters, cabbies, couriers, bus drivers, paramedics, firefighters — dressed for it),
// and some parked vans, taxis and pickups have their owner beside them. Take one and you have to
// deal with them: you walk to the driver's door, yank it open, drag them out onto the tarmac, and
// climb in. Then they react the way people do: some run, some come at you, some get straight on
// the phone to 911 (and the cops come). Motorbike riders get shoved off and tumble.
import * as THREE from "../vendor/three.module.js";
import { randomLook, finishLook, makeCharacter, gait } from "./people.js";
import { HumanPool, humansReady } from "./human.js";
import { newFace, tickFace, setExpr } from "./face.js";
import { carSpec } from "./cars.js";
import { seatPose } from "./doors.js";
import { HALF, ROAD, BLOCK, CELL, N, mulberry32 } from "./world.js";

// who drives what, and what they wear
const ROLES = {
  bus: { role: "bus driver", shirt: 0x2a4a7a, pants: 0x1e2533 },
  taxi: { role: "cabbie" },
  truck: { role: "delivery driver", shirt: 0xf2a21e, pants: 0x2a3446 },
  van: { role: "courier", shirt: 0x6a2a2a, pants: 0x2a2a2c, chance: 0.5 },
  ambulance: { role: "paramedic", shirt: 0x2a6a4a, pants: 0x1e2a24 },
  firetruck: { role: "firefighter", shirt: 0x4a4636, pants: 0x3a3628 },
  pickup: { role: "contractor", shirt: 0xe86a1e, pants: 0x3a4a66, chance: 0.35 },
};
// what they shout
const LINES = {
  grab: ["Hey— HEY! What are you doing?!", "No no no no—", "Get OFF me!", "Wh— are you serious?!"],
  flee: ["Take it! Just take it, man!", "Okay! OKAY! It's yours!", "Please don't hurt me!", "I've got kids! Take the car!"],
  fight: ["Get your hands off my car!", "Oh, you picked the WRONG guy!", "You're DEAD, you hear me?!", "Nobody touches my ride!"],
  cops: ["911? Somebody just jacked my car!", "Police! I've been carjacked!", "Yeah, hi, I'd like to report a— a THEFT!", "You're not getting away with this!"],
  owner: ["Hey! Step away from my car.", "Can I help you with something?", "That's mine, buddy. Keep walking.", "Don't even think about it."],
  bike: ["My BIKE!", "Are you KIDDING me?!", "Ow— hey! HEY!"],
  role: {
    "bus driver": "That's a CITY BUS! You can't just—",
    cabbie: "I got a fare waiting, man! Come ON!",
    "delivery driver": "There's forty packages in there!",
    courier: "There's forty packages in there!",
    paramedic: "That's an AMBULANCE! People need that!",
    firefighter: "You're stealing a FIRE TRUCK?! Seriously?!",
    contractor: "My tools are in there!",
  },
};
const pick = (r, a) => a[(r() * a.length) | 0];

export function makeHijack(scene, g) {
  const r = mulberry32(0x41AC);
  const mobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
  const pool = new HumanPool(scene, mobile ? 3 : 5);
  const _g = {};
  let job = null;                    // the hijack in progress
  const owners = [];                 // workers standing by their parked vehicles

  // the person behind the wheel of a traffic vehicle (made the first time anyone looks)
  function driverOf(t) {
    if (t.driver) return t.driver;
    const seed = ((t.x * 7.13 + t.z * 3.31 + (t.color || 0) * 1e-6) * 1000) | 0;
    const rr = mulberry32(seed ^ 0x9e37);
    const look = randomLook(rr);
    const R = ROLES[t.type];
    const worker = R && rr() < (R.chance ?? 1);
    if (worker && R.shirt !== undefined) { look.shirt = R.shirt; look.pants = R.pants; look.sleeves = "short"; }
    look.hat = false; finishLook(look);
    return (t.driver = { look, role: worker ? R.role : null, face: newFace(rr()), mood: rr() });
  }

  // somebody from the crowd to play a part (a driver hauled out, an owner by their van): someone
  // far off-screen, moved here and dressed to match
  function borrowPed(x, z, look) {
    const P = g.player();
    const cands = g.crowd.people.filter(p => !p.hidden && !p.gang && !p.goon && !p.crew && !p.ally && !p.ai && !(p.knocked > 0) && !p.owner && (p.x - P.x) ** 2 + (p.z - P.z) ** 2 > 110 * 110);
    if (!cands.length) return null;
    const p = cands[(r() * cands.length) | 0];
    p.look = { ...look }; finishLook(p.look);
    p.face = null; p.persona = null; p.cross = null; p.pause = 0; p.fear = 0; p.anger = 0; p.phoneT = 0; p.workT = 0; p._called = false;
    p.x = x; p.z = z; p.y = 0; p.vx = p.vy = p.vz = 0; p.spin = 0;
    p.bi = Math.max(0, Math.min(N - 1, Math.round((x + HALF - ROAD - BLOCK / 2) / CELL)));
    p.bj = Math.max(0, Math.min(N - 1, Math.round((z + HALF - ROAD - BLOCK / 2) / CELL)));
    return p;
  }
  // how a victim takes it: run, fight, or call the cops (their personality decides)
  function react(p, role, kind) {
    const persona = g.life.personaOf(p);
    const roll = r();
    const style = persona === "tough" || persona === "rude" ? (roll < 0.7 ? "fight" : "cops")
      : persona === "nervous" || persona === "nice" ? (roll < 0.75 ? "flee" : "cops")
      : roll < 0.4 ? "flee" : roll < 0.7 ? "cops" : "fight";
    const line = role && r() < 0.6 ? LINES.role[role] : pick(r, LINES[style]);
    g.life.shout(p, line, style === "flee" ? "scared" : style === "fight" ? "mad" : "annoyed");
    if (style === "flee") { p.fearMax = 9; p.fear = 9; }
    else if (style === "fight") { p.anger = 2; g.life.fightBack(p); }
    else {
      // on the phone to the police: stands there, hand to ear, then the heat comes
      const T0 = 3.2; let t = 0;
      p.ai = (q, dt) => {
        t += dt; q.amt = 0; q.phoneT = 1;
        q.yaw = Math.atan2(g.player().x - q.x, g.player().z - q.z);
        if (t > T0 && !q._called) { q._called = true; if (!g.player().car || !g.player().car.kind) g.crime.addCrime(1); g.toast("📞 Someone called 911 on you", 2.2); }
        if (t > T0 + 1.5) { q.ai = null; q.phoneT = 0; q.fearMax = 5; q.fear = 5; }
      };
    }
  }

  // ---- the hijack ----
  // t: the traffic vehicle, c: the player's copy of it (already spawned in its place)
  function start(t, c) {
    const d = driverOf(t), spec = carSpec(t.type);
    const emergency = !!spec.emergency;
    if (spec.bike) {
      // shove the rider off: they tumble across the road
      const p = borrowPed(t.x, t.z, d.look);
      if (p) { const s = 4 + r() * 2, a = t.h + Math.PI / 2 * (r() < 0.5 ? 1 : -1); g.crowd.knock(p, Math.sin(a) * s, 3.5, Math.cos(a) * s, false); p.knocked = 2.2; p._react = { role: null, t: 2.4, bike: true }; jobsAfter.push(p); }
      return false;
    }
    job = { c, d, t: 0, emergency, ch: null, ped: null };
    job.ch = makeCharacter({ ...d.look }); scene.add(job.ch.group);
    job.ch.face.base = "neutral";
    c.speed = 0; c.vx = c.vz = 0;
    if (emergency) g.crime.addCrime(1);
    g.life.shout(job.ch, pick(r, LINES.grab), "shocked", true);
    return true;
  }
  const jobsAfter = [];               // people mid-reaction (lying there, about to get up)
  const active = () => !!job;
  const DUR = 1.95;
  function updateJob(dt) {
    const J = job, c = J.c, P = g.player(), spot = g.doors.exitSpot(c);
    J.t += dt;
    const T = J.t, ch = J.ch, look = J.d.look;
    const cs = Math.cos(c.h), sn = Math.sin(c.h);
    const local = (lx, lz) => ({ x: c.x + lx * cs + lz * sn, z: c.z - lx * sn + lz * cs });
    const W = c.spec.wid / 2, seat = c.spec.seat;
    // you: stride to the door, rip it open, reach in, haul back
    P.amt = T < 0.5 ? 1 : 0; if (T < 0.5) P.phase = (P.phase || 0) + dt * 6;
    if (T < 0.5) { const f = T / 0.5; P.x += (spot.x - P.x) * Math.min(1, f * 1.6); P.z += (spot.z - P.z) * Math.min(1, f * 1.6); P.yaw = Math.atan2(c.x - P.x, c.z - P.z); }
    else { P.x = spot.x; P.z = spot.z; P.yaw = spot.yaw; }
    const doorA = T < 0.5 ? 0 : Math.min(1.15, (T - 0.5) / 0.18 * 1.15);
    if (c.openDoor) c.openDoor("FL", doorA);
    J.youOver = T < 0.5 ? null : T < 0.85 ? { armR: -1.3, elbowR: -0.2, armL: -1.2, elbowL: -0.3, gripR: 0.9, gripL: 0.9, lean: 0.25 }
      : { armR: -0.9, elbowR: -1.4, armL: -0.8, elbowL: -1.5, gripR: 1, gripL: 1, lean: -0.25 };
    // the driver: at the wheel, grabbed, dragged out over the sill, thrown down
    const sp = seatPose(c, look, 0);
    if (T < 0.85 && ch) {
      ch.pose(sp.x, sp.y, sp.z, sp.yaw - (T > 0.5 ? (T - 0.5) * 1.2 : 0), 0, 0.04, { override: { ...sp.over, armL: T > 0.55 ? -1.8 : sp.over.armL, elbowL: T > 0.55 ? -1.2 : sp.over.elbowL }, expr: T > 0.5 ? "shocked" : "surprised" });
    } else if (T < 1.45 && ch) {
      const f = (T - 0.85) / 0.6, e = f * f * (3 - 2 * f);
      const a = local(seat.x + (W + 0.9 - seat.x) * e, seat.z - 0.1 * e);
      const y0 = sp.y, y1 = (c.y || 0);
      ch.pose(a.x, y0 + (y1 - y0) * e + Math.sin(e * Math.PI) * 0.15, a.z, c.h - Math.PI / 2 * e, 0, 0.04,
        { override: { thighL: -1.45 * (1 - e) - 0.4 * e, thighR: -1.45 * (1 - e) + 0.3 * e, kneeL: 1.45 * (1 - e) + 0.6 * e, kneeR: 1.45 * (1 - e), armL: -2.0, armR: -1.6, elbowL: -0.6, elbowR: -0.9, lean: 0.3 * e }, expr: "scared" });
    } else if (T >= 1.45) {
      // on the ground: becomes a real pedestrian lying there (who'll get up and react)
      if (!J.ped) {
        const a = local(W + 1.25, seat.z - 0.3);
        const p = borrowPed(a.x, a.z, look);
        if (p) { p.knocked = 1.9; p.y = 0.01; p.vy = 0; p.vx = Math.cos(c.h) * 1.2; p.vz = -Math.sin(c.h) * 1.2; p.yaw = c.h + Math.PI / 2; p._react = { role: J.d.role, t: 2.0 }; jobsAfter.push(p); J.ped = p; }
        scene.remove(ch.group); J.ch = null;
        g.crowd.scare(c.x, c.z, 14, 4);
        if (g.crime.units.some(u => u.active && g.crime.los(u.x, u.z, c.x, c.z))) g.crime.addCrime(1);
      }
    }
    if (J.ch) { J.ch.x = c.x + Math.cos(c.h) * (W + 0.4); J.ch.z = c.z - Math.sin(c.h) * (W + 0.4); J.ch.y = c.y || 0; }   // for the speech bubble
    if (T >= DUR) {
      if (J.ch) scene.remove(J.ch.group);
      job = null;
      g.finishEnter(c, 0.36);         // climb in (the door's already open)
    }
  }

  // ---- owners: workers by their parked vehicles ----
  function updateOwners(dt) {
    const P = g.player();
    for (let i = owners.length - 1; i >= 0; i--) {
      const o = owners[i], p = o.p;
      if (!o.car.alive || (p.x - P.x) ** 2 + (p.z - P.z) ** 2 > 80 * 80 || p.knocked > 0 && p.dead) {
        if (!o.car.alive && !o.reacted) { o.reacted = true; p.ai = null; p.owner = null; p.phoneT = 0; p.workT = 0; react(p, o.role, "parked"); }
        else if (o.car.alive) { p.ai = null; p.owner = null; p.phoneT = 0; p.workT = 0; g.crowd.respawnNear(p, P.x, P.z); }
        owners.splice(i, 1); continue;
      }
      // you walk right up to their car: a warning
      const d2 = (o.car.x - P.x) ** 2 + (o.car.z - P.z) ** 2;
      if (!P.car && d2 < 3.2 * 3.2 && !o.warned) { o.warned = true; g.life.shout(p, pick(r, LINES.owner), "annoyed"); }
      if (d2 > 8 * 8) o.warned = false;
    }
    if (owners.length >= 3 || r() > dt * 1.5) return;
    // a new one: a parked van / taxi / pickup / ambulance nearby that hasn't been looked at yet
    const cand = g.parked.cars.find(c => c.alive && !c._ownerChecked && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 45 * 45 && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 > 14 * 14);
    if (!cand) return;
    cand._ownerChecked = true;
    const R = ROLES[cand.type];
    if (!(R ? r() < 0.75 : r() < 0.2)) return;
    const look = randomLook(r);
    if (R && R.shirt !== undefined) { look.shirt = R.shirt; look.pants = R.pants; }
    finishLook(look);
    const fx = Math.sin(cand.h), fz = Math.cos(cand.h), L = carSpec(cand.type).len / 2 + 0.8;
    const p = borrowPed(cand.x - fx * L, cand.z - fz * L, look);
    if (!p) return;
    p.owner = cand; p.yaw = cand.h;
    const busy = r();
    p.ai = (q, dt2) => { q.amt = 0; q.phoneT = busy < 0.35 ? 1 : 0; q.yaw = Math.atan2(cand.x - q.x, cand.z - q.z); if (busy > 0.7) q.workT = (q.workT || 0) + dt2; };
    owners.push({ p, car: cand, role: R ? R.role : null, reacted: false });
  }

  // victims get up and do something about it
  function updateAfter(dt) {
    for (let i = jobsAfter.length - 1; i >= 0; i--) {
      const p = jobsAfter[i];
      if (p.knocked > 0) continue;
      p._react.t -= dt;
      if (p._react.t <= 0 || p.knocked <= 0) {
        if (p._react.bike) g.life.shout(p, pick(r, LINES.bike), "mad");
        react(p, p._react.role, "traffic");
        p._react = null; jobsAfter.splice(i, 1);
      }
    }
  }

  function update(dt) {
    if (job) updateJob(dt);
    updateOwners(dt);
    updateAfter(dt);
  }
  // the player's pose during the hijack (null when there isn't one)
  const playerPose = () => job ? job.youOver : null;

  // drivers at the wheel of the nearest traffic: real people, seated, hands on the wheel
  const _l = [];
  function render(now) {
    if (!humansReady()) return;
    const P = g.player();
    _l.length = 0;
    for (const t of g.traffic.cars) {
      if (!t.alive || carSpec(t.type).bike) continue;
      const d2 = (t.x - P.x) ** 2 + (t.z - P.z) ** 2;
      if (d2 < 32 * 32) { t._dd = d2; _l.push(t); }
    }
    _l.sort((a, b) => a._dd - b._dd);
    const owners2 = _l.map(t => driverOf(t));
    const assigned = pool.assign(owners2);
    for (const t of _l) {
      const d = t.driver, h = assigned.get(d);
      if (!h) continue;
      const sp = seatPose({ x: t.x, z: t.z, h: t.h, y: 0, spec: carSpec(t.type) }, d.look, t.turn ? 0.3 : 0);
      if (!sp) { h.root.visible = false; continue; }
      gait(0, 0.04, _g); Object.assign(_g, sp.over);
      // a glance about now and then
      d.face.base = d.mood < 0.2 ? "annoyed" : "neutral";
      tickFace(d.face, 1 / 60, now);
      h.drive(sp.x, sp.y, sp.z, sp.yaw, _g, null, d.face);
    }
  }
  return { start, update, render, active, playerPose, driverOf };
}
