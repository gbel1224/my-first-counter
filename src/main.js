// Palm City — bootstrap + main loop.
import * as THREE from "../vendor/three.module.js";
import { createRenderer, isMobile } from "./render.js";
import { buildCity, Collider, groundY, district, blockC, blockMin, PLAZA, HALF, ROAD, BLOCK, CURB, mulberry32, clamp } from "./world.js";
import { createSky } from "./sky.js";
import { createCity } from "./city.js";
import { createOcean } from "./ocean.js";
import { Crowd, randomLook } from "./people.js";
import { Traffic, SIGNAL, Parked } from "./traffic.js";
import { buildFacadeDetail, buildStreetDetail, updateSignals } from "./detail.js";
import { PAINTS } from "./cars.js";
import { initInput, pollInput, I } from "./input.js";
import { createHUD } from "./hud.js";
import { createPlayer, updatePlayerOnFoot, poseOnFoot, spawnCar, syncCar, driveStep, createCamRig, updateCam } from "./play.js";
import { AudioSys } from "./audio.js";

const bootBar = document.getElementById("bootbar");
const step = async (pct) => { bootBar.style.width = pct + "%"; await new Promise(r => setTimeout(r, 0)); };

const R = createRenderer(document.getElementById("c"));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 1400);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); R.resize(); });

await step(8);
const plan = buildCity();
const collider = new Collider(plan.buildings);
await step(20);
const sky = createSky(scene, R.renderer);
await step(35);
const city = createCity(scene, plan, groundY);
const facade = buildFacadeDetail(scene, plan);
const street = buildStreetDetail(scene, plan);
await step(55);
const ocean = createOcean(scene, sky);
await step(65);
const crowd = new Crowd(scene, plan, isMobile ? 380 : 520);
await step(78);
const traffic = new Traffic(scene, isMobile ? 110 : 150);
const parked = new Parked(scene, district);
await step(88);

// ---------------------------------------------------------------------------------------------
// save
const SAVE_KEY = "palmcity2_save";
let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
const state = { money: save ? save.money : 250, phase: "title" };
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: Math.floor(state.money), x: P.x, z: P.z })); } catch (e) {}
}

// ---------------------------------------------------------------------------------------------
// player + a few cars parked round the plaza
const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);
const P = createPlayer(scene, { skin: 0xc68a5c, hair: 0x1c1410, shirt: 0xf7f7f2, pants: 0x2b3a55, bald: false, h: 1.0, bulk: 1.0 });
P.x = save ? save.x : px + BLOCK / 2 - 2.5; P.z = save ? save.z : pz + 6; P.yaw = -Math.PI / 2; P.y = groundY(P.x, P.z);
const cars = [];
{
  // parked on the plaza's paved edge (not in a traffic lane, so the city can still flow round them)
  const e = px + 21.5;
  cars.push(spawnCar(scene, "sports", 0x9d0f14, e, pz - 8, Math.PI));
  cars.push(spawnCar(scene, "compact", 0x3a4c6a, e, pz + 3, Math.PI));
  cars.push(spawnCar(scene, "suv", 0x1a1b1d, e, pz + 14, Math.PI));
  const s = pz + 21.5;
  cars.push(spawnCar(scene, "sedan", 0xc6c9cc, px + 10, s, -Math.PI / 2));
}

// gather the crowd and traffic around the spawn point so the very first view is lively
for (const p of crowd.people) if (!p.beach) crowd.respawnNear(p, P.x, P.z);
{
  // half the crowd right around the plaza (the respawn skips the nearest ring, so seed it directly)
  let k = 0;
  for (const p of crowd.people) {
    if (p.beach || k++ % 2) continue;
    p.bi = PLAZA.i + ((crowd.r() * 3) | 0) - 1; p.bj = PLAZA.j + ((crowd.r() * 3) | 0) - 1; p.t = crowd.r() * 4; crowd.place(p);
  }
}
for (const c of traffic.cars) traffic.respawnNear(c, P.x, P.z, 30);

// ---------------------------------------------------------------------------------------------
const hud = createHUD(plan);
initInput(hud.ui);
if (!isMobile) document.body.classList.add("kb");
const rig = createCamRig(camera);
rig.yaw = P.yaw; rig.pitch = 0.22;

// title screen
const title = document.createElement("div");
title.id = "title";
title.innerHTML = `<div><div class="logo">PALM<br>CITY</div><div class="tag">Sun. Money. No rules.</div></div>
  <div><button class="go">${save ? "CONTINUE" : "PLAY"}</button><div class="sub">${isMobile ? "Left thumb moves · drag right side to look" : "WASD move · Shift run/boost · Space jump/drift · E drive · drag to look"}</div></div>`;
document.getElementById("ui").appendChild(title);
function start() {
  if (state.phase !== "title") return;
  state.phase = "play";
  title.classList.add("gone");
  hud.show(true);
  AudioSys.init();
  hud.toast("Welcome to Palm City", 2.4);
  if (document.documentElement.requestFullscreen && isMobile) document.documentElement.requestFullscreen().catch(() => {});
}
title.querySelector(".go").addEventListener("click", start);
addEventListener("keydown", e => { if (e.code === "Enter" && state.phase === "title") start(); });

// ---------------------------------------------------------------------------------------------
let time = 0, last = performance.now(), frozen = false, saveT = 0;
const sim = { dt: 0 };
function nearestCar() {
  let best = null, bd = 3.4 * 3.4, traf = null;
  for (const c of cars) { const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2; if (d < bd) { bd = d; best = c; } }
  const t = traffic.nearest(P.x, P.z, 3.4);
  if (t && (t.x - P.x) ** 2 + (t.z - P.z) ** 2 < bd) { best = null; traf = t; bd = (t.x - P.x) ** 2 + (t.z - P.z) ** 2; }
  const pk = parked.nearest(P.x, P.z, 3.4);
  let park = null;
  if (pk && (pk.x - P.x) ** 2 + (pk.z - P.z) ** 2 < bd) { best = null; traf = null; park = pk; }
  return best || traf || park ? { car: best, traf, park } : null;
}
function enterCar(n) {
  let c = n.car;
  if (n.traf) {                                     // take it from the traffic
    const t = n.traf; traffic.take(t);
    c = spawnCar(scene, t.type, t.color, t.x, t.z, t.h);
    c.vx = Math.sin(t.h) * t.speed * 0.3; c.vz = Math.cos(t.h) * t.speed * 0.3;
    cars.push(c);
    hud.toast("🚗 Borrowed a " + t.type + " — no questions asked", 2.2);
  }
  if (n.park) {                                     // break into a parked one
    const t = n.park; parked.take(t);
    c = spawnCar(scene, t.type, t.color, t.x, t.z, t.h);
    cars.push(c);
    hud.toast("🔓 Hot-wired a parked " + t.type, 2.0);
  }
  P.car = c; P.ch.group.visible = false;
  AudioSys.play("door", 0.7);
}
function exitCar() {
  const c = P.car;
  // step out on the driver's side (left of the heading)
  const lx = Math.cos(c.h), lz = -Math.sin(c.h);
  P.x = c.x + lx * 1.9; P.z = c.z + lz * 1.9; P.yaw = c.h; P.speed = 0;
  const res = collider.resolve(P.x, P.z, 0.4); P.x = res.x; P.z = res.z; P.y = groundY(P.x, P.z);
  P.car = null; P.ch.group.visible = true;
  AudioSys.play("door", 0.6);
  AudioSys.engine(0);
}

function update(dt) {
  time += dt;
  const inp = pollInput();
  if (state.phase === "play") {
    if (P.car) {
      const c = P.car;
      const impact = Math.max(driveStep(c, inp, dt, collider), parked.collide(c));
      if (impact > 4) { rig.shake = Math.min(1, impact / 18); AudioSys.play("door", Math.min(1, impact / 20), 0.6); }
      // shunt traffic you hit
      for (const t of traffic.cars) {
        if (!t.alive) continue;
        const dx = t.x - c.x, dz = t.z - c.z, d2 = dx * dx + dz * dz;
        if (d2 < 9) {
          const d = Math.sqrt(d2) || 1, nx = dx / d, nz = dz / d, rel = c.vx * nx + c.vz * nz;
          if (rel > 0) { c.vx -= nx * rel * 1.2; c.vz -= nz * rel * 1.2; t.stun = 2.5; t.speed = 0; if (rel > 5) { rig.shake = Math.min(1, rel / 20); AudioSys.play("door", 0.8, 0.5); } }
          c.x -= nx * (3 - d) * 0.5; c.z -= nz * (3 - d) * 0.5;
        }
      }
      syncCar(c);
      AudioSys.engine(c.speed / c.spec.top);
      AudioSys.skid(clamp((c.drift - 3) / 8, 0, 1));
      if (inp.hornHeld) AudioSys.horn();
      if (inp.action) exitCar();
    } else {
      updatePlayerOnFoot(P, inp, dt, rig.yaw, collider);
      const n = nearestCar();
      if (inp.action && n) enterCar(n);
    }
    saveT += dt; if (saveT > 5) { saveT = 0; writeSave(); }
  }
  // world sim
  const focus = P.car || P;
  const hz = P.car ? [{ x: P.car.x, z: P.car.z, speed: P.car.speed, vx: P.car.vx, vz: P.car.vz, onHit: (p, sp) => { rig.shake = 0.35; AudioSys.play("door", 0.5, 0.8); } }] : [];
  crowd.update(dt, time, focus.x, focus.z, hz);
  traffic.update(dt, time, [P.car ? { x: P.car.x, z: P.car.z, car: true } : { x: P.x, z: P.z, car: false }]);
  if (state.phase === "title") {
    // slow cinematic orbit over the plaza, high enough to clear the rooftops
    const a = 0.7 + time * 0.03, r = 150 + Math.sin(time * 0.1) * 20;
    camera.position.set(px + Math.sin(a) * r, 82 + Math.sin(time * 0.07) * 10, pz + Math.cos(a) * r);
    camera.lookAt(px, 0, pz);
  } else if (state.phase === "play") {
    updateCam(rig, dt, P.car ? { x: P.car.x, z: P.car.z, y: P.car.y, h: P.car.h, speed: P.car.speed } : { x: P.x, z: P.z, y: P.y, h: P.yaw, speed: 0 }, inp, collider, !!P.car, time);
  }
  sky.update(dt, time, focus, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (frozen) return;
  update(dt);
  render();
}
function render() {
  const focus = P.car || P;
  if (!P.car) poseOnFoot(P, time);
  crowd.render(camera.position.x * 0.5 + focus.x * 0.5, camera.position.z * 0.5 + focus.z * 0.5, camera);
  traffic.render(focus.x, focus.z, sky.state.night);
  parked.render(focus.x, focus.z);
  city.update(time, sky.state.night);
  updateSignals(street.lampMats, SIGNAL.phase);
  ocean.update(time, scene.fog);
  if (state.phase === "play") {
    const near = !P.car && nearestCar();
    hud.buttons(!!P.car, !!near);
    hud.prompt(!P.car && near ? (I.touch ? "Tap <b>DRIVE</b> to get in" : "Press <b>E</b> to drive") : "");
    hud.speed(P.car ? P.car.speed * 3.6 : 0, !!P.car);
    hud.cash(state.money);
    hud.minimap(focus.x, focus.z, P.car ? P.car.h : P.yaw, rig.yaw, cars.filter(c => c !== P.car).map(c => ({ x: c.x, z: c.z, c: "#2f7cff", r: 3 })), null);
    hud.update(1 / 60);
  }
  R.render(scene, camera, time);
}

hud.objective("Palm City", "Explore the city · grab any car");
await step(100);
document.getElementById("boot").classList.add("gone");
requestAnimationFrame(frame);

// debug / test hooks
globalThis.__pc2 = {
  THREE, scene, camera, R, sky, city, plan, facade, parked, collider, crowd, traffic, P, cars, state, rig, I,
  freeze: v => { frozen = v; }, renderOnce: () => render(), step: (dt = 1 / 60) => { update(dt); },
  start, setTime: t => sky.set(t), enterNearest: () => { const n = nearestCar(); if (n) enterCar(n); return !!n; }, exitCar,
  look: (px, py, pz, tx, ty, tz) => { state.phase = "debug"; title.classList.add("gone"); camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); },
};
