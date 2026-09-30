// Palm City — street events. In freeplay the city keeps offering you something to do: every so
// often an event pops up nearby with a beacon, a countdown and a payout.
//   cash      grab a cash drop before someone else does
//   delivery  timed pickup → drop-off
//   bounty    a wanted man on foot — catch him
//   heist     an armored truck on the run — ram it until it cracks open
//   gang      a shootout in progress — take the crew out
//   chase     a stolen car fleeing — run it off the road
//   race      a street race flashing JOIN NOW — hit the grid, then the checkpoints
import { mulberry32, clamp, HALF, N, roadC, nearestRoad, ROAD } from "./world.js";
import { makeCar, carSpec } from "./cars.js";
import { driveStep, syncCar } from "./play.js";
import { randomLook } from "./people.js";

const TYPES = ["cash", "delivery", "bounty", "heist", "gang", "chase", "race"];
const REWARD = { cash: [180, 450], delivery: [400, 800], bounty: [600, 1000], heist: [2500, 5000], gang: [1200, 2000], chase: [900, 1500], race: [800, 1400] };

export function makeEvents(scene, g) {
  // g: { focus(), crowd, gangs, fx, sound, toast, banner, earn, save, canStart(), collider, crime, combat, player }
  const r = mulberry32(0x0FF1CE99);
  const rr = (a, b) => a + r() * (b - a);
  let ev = null, idle = 25;
  // a spot on a road 120-260 m away (so you have to travel)
  function roadSpot(x, z, a0 = 120, a1 = 260) {
    for (let k = 0; k < 10; k++) {
      const a = r() * 6.283, d = rr(a0, a1);
      const px = clamp(x + Math.cos(a) * d, -HALF + 20, HALF - 20), pz = clamp(z + Math.sin(a) * d, -HALF + 20, HALF - 20);
      return r() < 0.5 ? [roadC(nearestRoad(px)), pz] : [px, roadC(nearestRoad(pz))];
    }
  }
  // a fleeing vehicle that picks, at every junction, the road that takes it furthest from you
  const runners = {};
  function runnerCar(kind) {
    if (runners[kind]) return runners[kind];
    const C = kind === "truck" ? makeCar("suv", 0x8b9099) : makeCar("sports", 0xc01818);
    C.group.visible = false; scene.add(C.group);
    const v = { ...C, x: 0, z: 0, h: 0, vx: 0, vz: 0, y: 0, steer: 0, yawRate: 0, speed: 0, spec: { ...carSpec(kind === "truck" ? "suv" : "sports"), top: kind === "truck" ? 26 : 34 }, tx: 0, tz: 0 };
    return (runners[kind] = v);
  }
  const inp = { mx: 0, mz: 1, sprintHeld: false, handbrakeHeld: false };
  function flee(v, dt) {
    const F = g.focus();
    const ai = nearestRoad(v.x), aj = nearestRoad(v.z);
    if ((v.tx - v.x) ** 2 + (v.tz - v.z) ** 2 < 36 || v.tx === undefined) {
      let best = null, bd = -1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = ai + di, j = aj + dj; if (i < 1 || j < 1 || i > N - 1 || j > N - 1) continue;
        const x = roadC(i), z = roadC(j), d = (x - F.x) ** 2 + (z - F.z) ** 2 + r() * 900;
        if (d > bd) { bd = d; best = [x, z]; }
      }
      [v.tx, v.tz] = best;
    }
    let dh = Math.atan2(v.tx - v.x, v.tz - v.z) - v.h; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
    inp.mx = clamp(-dh * 2.2, -1, 1); inp.mz = Math.abs(dh) > 1.6 ? 0.2 : 1; inp.handbrakeHeld = Math.abs(dh) > 0.9 && v.speed > 10;
    if (v.reverseT > 0) { v.reverseT -= dt; inp.mz = -1; inp.mx = -inp.mx; }
    else if (v.speed < 1.5) { v.stuck = (v.stuck || 0) + dt; if (v.stuck > 1.2) { v.stuck = 0; v.reverseT = 1; } } else v.stuck = 0;
    driveStep(v, inp, dt, g.collider); syncCar(v);
  }
  function start(forced) {
    const F = g.focus();
    const type = forced || TYPES[(r() * TYPES.length) | 0];
    const [x, z] = roadSpot(F.x, F.z, type === "cash" ? 70 : 110, type === "cash" ? 150 : 240);
    ev = { type, x, z, t: type === "race" ? 45 : type === "cash" ? 40 : 75, reward: Math.round(rr(...REWARD[type])), stage: 0 };
    const title = { cash: "💰 CASH DROP", delivery: "📦 RUSH DELIVERY", bounty: "🎯 BOUNTY", heist: "🚚 ARMORED TRUCK", gang: "🔫 GANG SHOOTOUT", chase: "🚔 POLICE CHASE", race: "🏁 STREET RACE — JOIN NOW" }[type];
    g.toast(title + " nearby · +$" + ev.reward, 3.2); g.sound("blip", 0.8);
    if (type === "bounty") {
      const look = Object.assign(randomLook(r), { shirt: 0xd8a21e });
      const p = { gang: true, x, z, yaw: 0, speed: 5, look, phase: 0, style: { stride: 1.1, arm: 1.2 }, pause: 0, knocked: 0, vx: 0, vy: 0, vz: 0, y: 0, spin: 0, dir: 1, t: 0, hp: 40 };
      p.ai = (q, dt) => {
        const F2 = g.focus(), dx = q.x - F2.x, dz = q.z - F2.z, d = Math.hypot(dx, dz) || 1;
        if (d < 60) { q.yaw = Math.atan2(dx, dz) + Math.sin(g.time() * 1.3) * 0.5; const sp = 4.8; q.x += Math.sin(q.yaw) * sp * dt; q.z += Math.cos(q.yaw) * sp * dt; q.amt = 2; }
        else q.amt = 0;
        const res = g.collider.resolve(q.x, q.z, 0.4); q.x = res.x; q.z = res.z;
        q.phase += dt * 3.2 * (q.amt ? 1 : 0.2);
      };
      p.onDeath = () => { if (ev && ev.type === "bounty") win("🎯 Bounty collected — dead or alive"); };
      p.onRespawn = q => { q.hidden = true; q.x = 99999; };
      g.crowd.people.push(p); ev.ped = p;
    }
    if (type === "heist" || type === "chase") {
      const v = runnerCar(type === "heist" ? "truck" : "runner");
      v.x = x; v.z = z; v.h = r() * 6.28; v.vx = v.vz = 0; v.speed = 0; v.hp = type === "heist" ? 140 : 70; v.tx = undefined; v.boom = false; v.group.visible = true;
      ev.v = v;
    }
    if (type === "gang") ev.crew = g.gangs.crew(x, z, 4);
    if (type === "race") ev.cps = [0, 1, 2].map(() => roadSpot(x, z, 60, 140));
  }
  function end(msg, paid) {
    if (ev.ped) { ev.ped.hidden = true; ev.ped.x = 99999; }
    if (ev.v) ev.v.group.visible = false;
    if (ev.crew) g.gangs.dismiss(ev.crew);
    if (paid) { const got = g.earn(ev.reward); g.banner("EVENT COMPLETE", msg + " · +$" + got.toLocaleString(), "", 2.8); g.sound("cash", 1); g.save(); }
    else { g.toast(msg, 2.6); }
    ev = null; idle = rr(35, 70);
  }
  const win = m => end(m, true), fizzle = m => end(m, false);
  function update(dt) {
    if (!ev) { idle -= dt; if (idle <= 0 && g.canStart()) start(); return; }
    if (!g.canStart() && ev.stage === 0 && ev.type !== "race") { /* keep ticking — events outlive a dialogue */ }
    const F = g.focus(), reach = F.car ? 7 : 3.5;
    const near = (x, z, rad = reach) => (F.x - x) ** 2 + (F.z - z) ** 2 < rad * rad;
    ev.t -= dt;
    switch (ev.type) {
      case "cash":
        if (near(ev.x, ev.z)) return win("💰 Cash grabbed");
        if (ev.t <= 0) return fizzle("💨 Someone else got the cash");
        break;
      case "delivery":
        if (ev.stage === 0 && near(ev.x, ev.z)) { const [x, z] = roadSpot(ev.x, ev.z, 140, 260); ev.x = x; ev.z = z; ev.stage = 1; ev.t = 40; g.toast("📦 Parcel grabbed — deliver it, fast!"); g.sound("blip", 0.6); }
        else if (ev.stage === 1 && near(ev.x, ev.z)) return win("📦 Delivered on time");
        if (ev.t <= 0) return fizzle("⏱ Too slow — delivery failed");
        break;
      case "bounty":
        ev.x = ev.ped.x; ev.z = ev.ped.z;
        if (ev.ped.knocked > 0 || near(ev.x, ev.z, F.car ? 3 : 1.6)) { if (!ev.ped.dead) g.crowd.knock(ev.ped, 0, 2, 0, false); return win("🎯 Bounty caught"); }
        if (ev.t <= 0) return fizzle("💨 The bounty got away");
        break;
      case "heist": case "chase": {
        const v = ev.v;
        flee(v, dt); ev.x = v.x; ev.z = v.z;
        // ramming it: every solid hit takes a chunk off
        if (F.car && near(v.x, v.z, 3.6)) {
          const rel = Math.hypot(F.car.vx - v.vx, F.car.vz - v.vz);
          if (rel > 4 && !ev.hitCD) { v.hp -= rel * 2.2; ev.hitCD = 0.6; g.shake(0.4); g.sound("door", 0.9, 0.5); g.fx.sparks(v.x, 1, v.z, 12); }
        }
        if (ev.hitCD) ev.hitCD = Math.max(0, ev.hitCD - dt);
        if (v.hp < 50 && r() < dt * 8) g.fx.smoke(v.x, 1.5, v.z, 0.25);
        if (v.hp <= 0) {
          g.fx.explosion(v.x, 1, v.z, ev.type === "heist" ? 0.7 : 1); g.sound("boom", 0.8);
          if (ev.type === "heist") g.crime.addCrime(2);
          return win(ev.type === "heist" ? "🚚 Truck cracked — big score" : "🚔 Runner stopped");
        }
        if (ev.t <= 0) return fizzle(ev.type === "heist" ? "💨 The truck got away" : "💨 The runner lost everyone");
        break;
      }
      case "gang":
        if (ev.crew.every(p => p.knocked > 0 || p.hidden)) return win("🔫 Shootout won");
        if (ev.t <= 0) return fizzle("💨 The crew scattered");
        break;
      case "race":
        if (ev.stage === 0) {
          if (near(ev.x, ev.z, 9)) { if (!F.car) { g.toast("🏁 You need a car to race"); break; } ev.stage = 1; ev.t = 60; ev.i = 0; [ev.x, ev.z] = ev.cps[0]; g.banner("GO!", "Hit all three checkpoints", "STREET RACE", 1.6); g.sound("jingle", 0.6); }
          else if (ev.t <= 0) return fizzle("🏁 The race rolled out without you");
        } else {
          if (near(ev.x, ev.z, 10)) { ev.i++; g.sound("blip", 0.8); if (ev.i >= ev.cps.length) return win("🏁 Race won"); [ev.x, ev.z] = ev.cps[ev.i]; g.toast("✔ Checkpoint " + ev.i + "/3", 1.2); }
          if (ev.t <= 0) return fizzle("🏁 Out of time — race lost");
        }
        break;
    }
  }
  function objective() {
    if (!ev) return null;
    const s = Math.max(0, Math.ceil(ev.t));
    const t = {
      cash: ["Cash Drop", "Grab the cash"], delivery: ev.stage ? ["Rush Delivery", "Deliver the parcel"] : ["Rush Delivery", "Pick up the parcel"],
      bounty: ["Bounty", "Catch the target"], heist: ["Armored Truck", "Ram the truck until it cracks"], gang: ["Gang Shootout", "Take out the crew"],
      chase: ["Police Chase", "Run the stolen car off the road"], race: ev.stage ? ["Street Race", "Checkpoint " + (ev.i + 1) + "/3"] : ["Street Race", "🏁 JOIN NOW — get to the grid"],
    }[ev.type];
    return { title: "EVENT · " + t[0], text: t[1] + " · " + s + "s · +$" + ev.reward, x: ev.x, z: ev.z, r: 4, event: true };
  }
  return { update, objective, active: () => !!ev, _spawn: type => { if (ev) end("", false); start(type); }, get: () => ev, forceIdle: v => { idle = v; }, cancel: () => { if (ev) end("", false); } };
}
