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
import { makeCharacter } from "./people.js";
import { PLACES, buildSigns, setSignNight, makeBeacon } from "./places.js";
import { BIZ, PROPS, newState, makeEconomy, xpNeed } from "./economy.js";
import { makeStory } from "./story.js";
import { STORY } from "./strings.js";
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
// save. The first time you open the new city, progress from the original game comes with you
// (cash, businesses, homes, story chapter, level).
const SAVE_KEY = "palmcity_save";
const SAVE_FIELDS = ["money", "xp", "lvl", "owned", "apt", "home", "house", "mi", "bank", "stats"];
let save = null, imported = false;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem("palmcity2_save") || "null"); } catch (e) {}
if ((!save || save.mi === undefined) && !localStorage.getItem("sunset_city_save_v1_imported")) {
  try {
    const old = JSON.parse(localStorage.getItem("sunset_city_save_v1") || "null");
    if (old && (old.money > 25 || old.mi > 0)) {
      save = { money: old.money || 0, xp: old.xp || 0, lvl: old.lvl || 1, owned: old.owned || {}, apt: !!old.apt, home: !!old.home, house: !!old.house,
        mi: Math.min(old.mi || 0, 12), bank: old.bank || 0 };
      imported = true;
    }
  } catch (e) {}
}
const st = Object.assign(newState(), save ? Object.fromEntries(SAVE_FIELDS.filter(k => save[k] !== undefined).map(k => [k, save[k]])) : {});
const state = st;
state.phase = "title";
function writeSave() {
  const out = {}; for (const k of SAVE_FIELDS) out[k] = st[k];
  out.money = Math.floor(st.money); out.x = P.x; out.z = P.z;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(out)); } catch (e) {}
}

// ---------------------------------------------------------------------------------------------
// player + a few cars parked round the plaza
const px = blockC(PLAZA.i), pz = blockC(PLAZA.j);
const P = createPlayer(scene, { skin: 0xc68a5c, hair: 0x1c1410, shirt: 0xf7f7f2, pants: 0x2b3a55, bald: false, h: 1.0, bulk: 1.0 });
P.x = save && save.x !== undefined ? save.x : px + BLOCK / 2 - 2.5; P.z = save && save.z !== undefined ? save.z : pz + 6; P.yaw = -Math.PI / 2; P.y = groundY(P.x, P.z);
const cars = [];
{
  // parked on the plaza's paved edge (not in a traffic lane, so the city can still flow round them)
  const e = px + 21.5;
  cars.push(spawnCar(scene, "sports", 0x9d0f14, e, pz - 8, Math.PI));
  const marcoCar = spawnCar(scene, "compact", 0x6f8aa0, e, pz + 3, Math.PI);   // Marco's old hatchback (chapter 3)
  marcoCar.marco = true; cars.push(marcoCar);
  cars.push(spawnCar(scene, "suv", 0x1a1b1d, e, pz + 14, Math.PI));
  const s = pz + 21.5;
  cars.push(spawnCar(scene, "sedan", 0xc6c9cc, px + 10, s, -Math.PI / 2));
}

// ---------------------------------------------------------------------------------------------
// the named city: shop signs, the objective beacons, the story's people, the hot-dog cart
const signs = buildSigns(scene);
const beacon = makeBeacon(scene, 0xffc861), sideBeacon = makeBeacon(scene, 0xff8a4c);
const NPC_LOOKS = {
  marco: { skin: 0xb57a52, hair: 0x16100c, shirt: 0xe8e6e0, pants: 0x2a3a52, bald: false, h: 1.02, bulk: 1.08 },
  rosa: { skin: 0xd4a07a, hair: 0x2a1c12, shirt: 0x6a2a2a, pants: 0x1e1e22, long: true, h: 0.95, bulk: 0.92 },
  vince: { skin: 0xe8bf9c, hair: 0xa8a49c, shirt: 0x1e2a44, pants: 0x1e2a44, h: 1.03, bulk: 1.05 },
};
const npcs = {};
for (const [id, look] of Object.entries(NPC_LOOKS)) {
  const c = makeCharacter(look); scene.add(c.group);
  npcs[id] = { ch: c, at: null, yaw: 0 };
  c.group.visible = false;
}
function showNpc(id, place) {
  const n = npcs[id]; n.at = place;
  n.ch.group.visible = !!place;
  if (place) n.yaw = place.face !== undefined ? place.face : 0;
}
showNpc("marco", PLACES.fountain);
{
  // the Sunny Dogs cart in the plaza
  const d = PLACES.dogs, g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.1), mat(0xd8d2c4)); body.position.y = 0.95;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.2, 1.12), mat(0xb8261e)); stripe.position.y = 1.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), mat(0x888888)); pole.position.set(0, 2.1, 0);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 10), mat(0xf0c020)); umb.position.set(0, 3.1, 0);
  const wheels = [-0.7, 0.7].map(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), mat(0x222222)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.28, 0.58); return w; });
  g.add(body, stripe, pole, umb, ...wheels);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(d.x + Math.sin(d.face) * -1.6, 0.22, d.z + Math.cos(d.face) * -1.6); g.rotation.y = d.face;
  scene.add(g);
}
const eco = makeEconomy(st, {
  toast: m => hud.toast(m), banner: (a, b) => hud.banner(a, b), sound: (k, v) => AudioSys.play(k, v), save: () => writeSave(),
  rest: () => sky.set(sky.state.t + 0.12),
});
const story = makeStory({
  st, pos: () => P.car ? [P.car.x, P.car.z] : [P.x, P.z], driving: () => P.car, marcoCar: () => cars.find(c => c.marco && c !== P.car) || (P.car && P.car.marco ? P.car : null),
  showNpc,
  fx: {
    toast: m => hud.toast(m), banner: (a, b) => hud.banner(a, b), sound: (k, v) => AudioSys.play(k, v), save: () => writeSave(),
    earn: n => eco.earn(n), dialogue: (lines, cb) => hud.dialogue(lines, cb), talking: () => hud.talking(),
    chapter: (n, t) => hud.banner(t, "", "CHAPTER " + n, 3.2, "chapter"),
  },
});

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
  <div><button class="go">${save ? "CONTINUE" : "PLAY"}</button>${save ? '<button class="newg">NEW GAME</button>' : ""}<div class="sub">${isMobile ? "Left thumb moves · drag right side to look" : "WASD move · Shift run/boost · Space jump/drift · E drive · drag to look"}</div></div>`;
document.getElementById("ui").appendChild(title);
function start() {
  if (state.phase !== "title") return;
  state.phase = "play";
  title.classList.add("gone");
  hud.show(true);
  AudioSys.init();
  if (imported) hud.toast("Welcome back — your progress from the old city came with you", 4);
  story.begin();
  if (document.documentElement.requestFullscreen && isMobile) document.documentElement.requestFullscreen().catch(() => {});
}
title.querySelector(".go").addEventListener("click", start);
const newg = title.querySelector(".newg");
if (newg) newg.addEventListener("click", () => {
  if (!confirm("Start a new game? Your saved city will be erased.")) return;
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem("palmcity2_save"); localStorage.setItem("sunset_city_save_v1_imported", "1"); } catch (e) {}
  location.reload();
});
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
  hud.update(dt);
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
      if (inp.action && !hud.talking()) exitCar();
    } else {
      if (hud.talking()) { inp.mx = 0; inp.mz = 0; inp.jump = false; inp.action = false; }
      updatePlayerOnFoot(P, inp, dt, rig.yaw, collider);
      const act = eco.actionAt(P.x, P.z);
      const n = nearestCar();
      if (inp.action) { if (act && act.kind !== "bizmax") eco.doAction(act, bizNames); else if (n) enterCar(n); }
    }
    eco.tick(dt, P.x, P.z, !P.car);
    story.update(dt);
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
  for (const id in npcs) {
    const n = npcs[id]; if (!n.at) continue;
    const dx = (P.car ? P.car.x : P.x) - n.at.x, dz = (P.car ? P.car.z : P.z) - n.at.z;
    if (dx * dx + dz * dz < 150) n.yaw = Math.atan2(dx, dz);                 // turn to face you as you walk up
    n.ch.pose(n.at.x, groundY(n.at.x, n.at.z), n.at.z, n.yaw, time * 0.9, 0.04, null);
  }
  setSignNight(signs, sky.state.night);
  const obj = state.phase === "play" ? story.objective() : null;
  beacon.set(obj && obj.main && obj.x !== undefined ? { x: obj.x, z: obj.z } : null, obj ? obj.r : 3);
  sideBeacon.set(obj && obj.side ? { x: obj.x, z: obj.z } : null, 3);
  beacon.update(time, obj && obj.x !== undefined ? Math.hypot(camera.position.x - obj.x, camera.position.z - obj.z) : 0);
  sideBeacon.update(time, 200);
  if (state.phase === "play") {
    const near = !P.car && nearestCar();
    const act = !P.car && eco.actionAt(P.x, P.z);
    let actLabel = null, actPrompt = "";
    if (act) {
      if (act.kind === "biz") { actLabel = (act.mode === "buy" ? "BUY" : "UPGRADE") + " $" + act.cost.toLocaleString(); actPrompt = (act.mode === "buy" ? "Buy " : "Upgrade ") + "<b>" + bizNames[act.b.id] + "</b> · $" + act.cost.toLocaleString() + " · +$" + (act.b.rate * act.lvl) + "/min"; }
      else if (act.kind === "prop") { actLabel = "BUY $" + act.cost.toLocaleString(); actPrompt = "Buy the <b>" + act.pr.label + "</b> · $" + act.cost.toLocaleString(); }
      else if (act.kind === "rest") { actLabel = "REST"; actPrompt = "Your <b>" + act.pr.label + "</b> · rest to pass time"; }
      else if (act.kind === "bizmax") actPrompt = "<b>" + bizNames[act.b.id] + "</b> · max level · +$" + (act.b.rate * 3) + "/min";
    }
    hud.buttons(!!P.car, !!near, actLabel);
    const key = I.touch ? "Tap" : "Press <b>E</b>";
    hud.prompt(actPrompt ? (actLabel ? actPrompt + (I.touch ? "" : " · <b>E</b>") : actPrompt) : (!P.car && near ? (I.touch ? "Tap <b>DRIVE</b> to get in" : "Press <b>E</b> to drive") : ""));
    hud.level(st.lvl, st.xp, xpNeed(st.lvl), eco.incomeRate());
    if (obj) {
      hud.objective(obj.title, obj.text);
      const f = P.car || P;
      hud.objDistance(obj.x !== undefined ? Math.hypot(f.x - obj.x, f.z - obj.z) : null);
    } else { hud.objective("Palm City", st.mi >= 12 ? "The city is yours — keep building" : "Explore the city"); hud.objDistance(null); }
    hud.speed(P.car ? P.car.speed * 3.6 : 0, !!P.car);
    hud.cash(state.money);
    const dots = [];
    for (const b of BIZ) dots.push({ x: b.p.x, z: b.p.z, c: st.owned[b.id] ? "#2fae6a" : "#d9962a", r: 5, t: "$" });
    for (const pr of PROPS) dots.push({ x: pr.p.x, z: pr.p.z, c: st[pr.flag] ? "#2fae6a" : "#7a6ad8", r: 5, t: "⌂" });
    if (st.mi >= 5) dots.push({ x: PLACES.depot.x, z: PLACES.depot.z, c: "#8a6a3a", r: 5, t: "D" });
    for (const c of cars) if (c !== P.car) dots.push({ x: c.x, z: c.z, c: "#2f7cff", r: 3 });
    hud.minimap(focus.x, focus.z, P.car ? P.car.h : P.yaw, rig.yaw, dots, obj && obj.x !== undefined ? { x: obj.x, z: obj.z, c: obj.side ? "#ff8a4c" : "#ffc861" } : null);
  }
  R.render(scene, camera, time);
}

const bizNames = Object.fromEntries(Object.entries(STORY.biz).map(([k, v]) => [k, v.name]));
await step(100);
document.getElementById("boot").classList.add("gone");
requestAnimationFrame(frame);

// debug / test hooks
globalThis.__pc2 = {
  THREE, scene, camera, R, sky, city, plan, facade, parked, eco, story, st, npcs, PLACES, BIZ, PROPS, hud, collider, crowd, traffic, P, cars, state, rig, I,
  freeze: v => { frozen = v; }, renderOnce: () => render(), step: (dt = 1 / 60) => { update(dt); },
  start, setTime: t => sky.set(t), enterNearest: () => { const n = nearestCar(); if (n) enterCar(n); return !!n; }, exitCar,
  look: (px, py, pz, tx, ty, tz) => { state.phase = "debug"; title.classList.add("gone"); camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); },
};
