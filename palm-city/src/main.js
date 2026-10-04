// Palm City — bootstrap + main loop.
import * as THREE from "../vendor/three.module.js";
import { createRenderer, isMobile } from "./render.js";
import { buildCity, Collider, groundY, district, blockC, blockMin, PLAZA, HALF, ROAD, BLOCK, CURB, WALK, mulberry32, clamp } from "./world.js";
import { createSky } from "./sky.js";
import { createCity } from "./city.js";
import { bakeStreetLights, setStreetLights, setHeadlights } from "./streetlight.js";
import { createOcean } from "./ocean.js";
import { Crowd, randomLook } from "./people.js";
import { Traffic, SIGNAL, Parked, signalState, walkState, RED } from "./traffic.js";
import { buildFacadeDetail, buildStreetDetail, updateSignals } from "./detail.js";
import { buildBladeSigns } from "./signs.js";
import { PAINTS, REAL_PAINTS, LAMP_U, driveLamps } from "./cars.js";
import { initInput, pollInput, I } from "./input.js";
import { createHUD, askConfirm } from "./hud.js";
import { makeProps } from "./props.js";
import { makeSkids } from "./skid.js";
import { makeDoors, seatPose } from "./doors.js";
import { makeHijack } from "./hijack.js";
import { createPlayer, updatePlayerOnFoot, poseOnFoot, spawnCar, syncCar, driveStep, createCamRig, updateCam } from "./play.js";
import { makeCharacter } from "./people.js";
import { setExpr, HAIR_U } from "./face.js";
import { PLACES, buildSigns, setSignNight, makeBeacon } from "./places.js";
import { BIZ, PROPS, newState, makeEconomy, xpNeed } from "./economy.js";
import { makeStory } from "./story.js";
import { STORY } from "./strings.js";
import { createFX } from "./fx.js";
import { makeCrime } from "./crime.js";
import { makeCombat, WEAPONS } from "./combat.js";
import { makeGangs, GANGS } from "./gangs.js";
import { createPhone } from "./phoneui.js";
import * as PH from "./phone.js";
import { initHeists, updateHeists, heistObjective, heistActive, startHeist, abortHeist, _debug as heistsDebug } from "./heists.js";
import { makeEvents } from "./events.js";
import { makeJobs } from "./jobs.js";
import { makeExtras, CIRCUITS } from "./extras.js";
import { createWeather } from "./weather.js";
import { createMenu } from "./menu.js";
import { setSurface } from "./play.js";
import { makeWater } from "./water.js";
import { makeLife } from "./life.js";
import { inWater, waterStep, heliStep, planeStep } from "./craft.js";
import { SEA_Y } from "./ocean.js";
import { AudioSys } from "./audio.js";
import { makeInterior } from "./interior.js";
import { loadHumans, humansReady } from "./human.js";
import { setView } from "./cull.js";
import { makeProbe } from "./reflect.js";

const bootBar = document.getElementById("bootbar");
const step = async (pct) => { bootBar.style.width = pct + "%"; await new Promise(r => setTimeout(r, 0)); };

const R = createRenderer(document.getElementById("c"));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 1400);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); R.resize(); });

// the real people (rigged, textured models) load alongside the city; the built-up figures stand in until they arrive
const humansLoad = loadHumans();
await step(8);
const plan = buildCity();
const collider = new Collider(plan.buildings);
await step(20);
const sky = createSky(scene, R.renderer);
await step(35);
const city = createCity(scene, plan, groundY);
// every street lamp's light, baked into the map the lit materials read after dark (head 1.8 m out on its arm)
{
  const heads = plan.lamps.map(([x, z, a]) => [x - Math.sin(a) * 1.8, groundY(x, z) + 6.2, z - Math.cos(a) * 1.8]);
  // shop windows and lobbies spill a softer light onto the pavement in front of them
  for (const b of plan.buildings) {
    if (b.y > 0.5 || b.h < 7 || b.style === 3 || b.style === 5) continue;          // not the houses
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const len = nx ? b.d : b.w, n = Math.max(1, Math.round(len / 11));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        heads.push([b.x + (nx ? nx * (b.w / 2 + 1.2) : t * b.w), 3.2, b.z + (nz ? nz * (b.d / 2 + 1.2) : t * b.d), 0.22, 12]);
      }
    }
  }
  for (const l of city.houses.lights) heads.push(l);                 // porch, garage and pool lights
  bakeStreetLights(heads, HALF);
}
const facade = buildFacadeDetail(scene, plan);
const street = buildStreetDetail(scene, plan);
buildBladeSigns(scene, facade.blades, city.U);                 // projecting neon signs over the shops
await step(55);
const ocean = createOcean(scene, sky);
await step(65);
const crowd = new Crowd(scene, plan, isMobile ? 380 : 520);
await step(78);
const traffic = new Traffic(scene, isMobile ? 110 : 150);
const parked = new Parked(scene, district);
// the suburbs: a car in some of the driveways, nose to the garage; nobody parks across a driveway
{
  const r = mulberry32(0xD21FE);
  for (const L of plan.lots) {
    const gx = (L.drive[0] + L.drive[2]) / 2, apronZ = L.zE + L.fz * (WALK + 2);
    for (const c of parked.cars) if (c.alive && Math.abs(c.x - gx) < 4.6 && Math.abs(c.z - apronZ) < 3.5) c.alive = false;
    if (!L.car) continue;
    const type = ["sedan", "suv", "pickup", "compact", "van", "coupe", "suv", "sedan"][(r() * 8) | 0];
    const c = { type, color: REAL_PAINTS[(r() * REAL_PAINTS.length) | 0], alive: true, x: gx + (r() - 0.5) * 0.3, z: L.garage.z + L.fz * (L.garage.d / 2 + 3.1), y: CURB, h: (L.fz > 0 ? Math.PI : 0) + (r() - 0.5) * 0.05 };
    parked.cars.push(c); parked.gridAdd(c);
  }
}
await step(88);

// ---------------------------------------------------------------------------------------------
// save. The first time you open the new city, progress from the original game comes with you
// (cash, businesses, homes, story chapter, level).
const SAVE_KEY = "palmcity_save";
const SAVE_FIELDS = ["money", "xp", "lvl", "owned", "apt", "home", "house", "mi", "bank", "stats", "weapons", "ammo", "turf", "nem", "term", "shares", "sprice", "sfair", "scost", "ledger", "pcars", "mods", "palms", "races", "medals", "ach", "treasure", "jetpack", "look", "decor"];
let save = null, imported = false;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || localStorage.getItem("palmcity2_save") || "null"); } catch (e) {}
if ((!save || save.mi === undefined) && !localStorage.getItem("sunset_city_save_v1_imported")) {
  try {
    const old = JSON.parse(localStorage.getItem("sunset_city_save_v1") || "null");
    if (old && (old.money > 25 || old.mi > 0)) {
      save = { money: old.money || 0, xp: old.xp || 0, lvl: old.lvl || 1, owned: old.owned || {}, apt: !!old.apt, home: !!old.home, house: !!old.house,
        mi: Math.min(old.mi || 0, 12), bank: old.bank || 0, decor: old.decor };
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
  onLevel: l => PH.pushLevel(l),
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

// ---------------------------------------------------------------------------------------------
// heat + fighting
const fx = createFX(scene);
let greyT = 0;
function respawnAt(place, label) {
  if (P.car) { const c = P.car; P.car = null; P.ch.group.visible = true; c.vx = c.vz = 0; }
  P.x = place.x + Math.sin(place.face) * 2; P.z = place.z + Math.cos(place.face) * 2; P.y = groundY(P.x, P.z); P.speed = 0; P.yaw = place.face;
  rig.init = false; rig.yaw = place.face + Math.PI;
}
const crime = makeCrime(scene, {
  collider, fxParticles: fx,
  focus: () => P.car ? { x: P.car.x, z: P.car.z, car: true, speed: P.car.speed } : { x: P.x, z: P.z, car: false, speed: P.speed },
  sound: (k, v, r) => AudioSys.play(k, v, r), toast: m => hud.toast(m), shake: a => { rig.shake = Math.max(rig.shake, a); },
  paused: () => hud.talking() || state.phase !== "play",
  heatMult: () => (P.car && P.car.heatMult) || 1,
  noHeat: () => story.state().mState === "active" && st.mi === 11,        // no cops during the Grand Race
  night: () => sky.state.night,
  // the SWAT tank's cannon: a shell flies at where it saw you
  shell: (x, z, tx, tz, owner) => { const d = Math.hypot(tx - x, tz - z) || 1; combat.launch("rocket", x, 1.9, z, (tx - x) / d, (tz - z) / d, { d, y: 1.0 }, owner); AudioSys.play("boom", 0.5, 0.6); },
  // …and it rolls straight over traffic
  crush: u => combat.asCops(() => { for (const t of traffic.cars) if (t.alive && (t.x - u.x) ** 2 + (t.z - u.z) ** 2 < 9) combat.damageCar(t, 200, "traffic"); for (const c of parked.around(u.x, u.z)) if (!c.boom && (c.x - u.x) ** 2 + (c.z - u.z) ** 2 < 9) combat.damageCar(c, 200, "parked"); }),
  onHeliCrash: (x, z) => combat.blast(x, z, 9, 120, null),
  onBust: fine => {
    if (P.car && P.car.fineMult) fine = Math.round(fine * P.car.fineMult);
    st.money = Math.max(0, st.money - fine);
    hud.banner("BUSTED", "Fine $" + fine.toLocaleString() + " · the bank keeps what you saved", "", 3.4, "bad"); greyT = 2.6;
    AudioSys.play("door", 1); respawnAt(PLACES.police); abortHeist("The score's lost."); writeSave();
  },
  onWasted: fine => {
    st.money = Math.max(0, st.money - fine);
    hud.banner("WASTED", "Patched up at Palm General · fine $" + fine.toLocaleString(), "", 3.4, "bad"); greyT = 2.6;
    AudioSys.play("boom", 0.7); const h = eco.home(); respawnAt(h ? h.p : PLACES.hospital); abortHeist("The score's lost."); writeSave();
  },
});
const combat = makeCombat(scene, {
  earn: n => eco.earn(n),
  onCombo: (x, pts) => { if (x > 1) hud.combo(x, pts); },
  onComboEnd: (pts, x) => { st.stats.bestRampage = Math.max(st.stats.bestRampage || 0, pts); PH.pushRampage(pts, P.x, P.z); hud.toast("💥 Rampage banked · " + pts + " pts · best " + st.stats.bestRampage); },
  onExplode: (x, z) => { PH.chaosShock(st); if (Math.random() < 0.3) PH.pushRampage(0, x, z); },
  crowd, traffic, parked, crime, fx, collider, st, propsBlast: (x, z, r) => props.blast(x, z, r),
  sound: (k, v, r) => AudioSys.play(k, v, r), shake: a => { rig.shake = Math.max(rig.shake, a); }, toast: m => hud.toast(m),
  player: () => P.car ? { x: P.car.x, z: P.car.z, y: P.car.y, car: P.car, yaw: P.car.h } : P,
});
const gangs = makeGangs({
  crowd, crime, fx, st, collider, toast: (m, t) => hud.toast(m, t), banner: (a, b, k, t) => hud.banner(a, b, k, t), sound: (k, v) => AudioSys.play(k, v),
  earn: n => eco.earn(n), paused: () => hud.talking() || state.phase !== "play",
  player: () => P.car ? { x: P.car.x, z: P.car.z, car: true, speed: P.car.speed } : { x: P.x, z: P.z, car: false, speed: P.speed },
  boss: (on, name, frac) => hud.boss(on, name, frac),
});
{ const add = crime.addCrime; crime.addCrime = n => { add(n); gangs.grudge(3 * (n || 1)); }; }
// ---------------------------------------------------------------------------------------------
// phone, heists, street events, jobs
const focusInfo = () => P.car ? { x: P.car.x, z: P.car.z, car: P.car, driving: true, speed: P.car.speed } : { x: P.x, z: P.z, car: null, driving: false, speed: P.speed };
const freeplay = () => st.mi >= 12 && !hud.talking();
const HEIST_TARGETS = [
  ["club", "Neon Palms Club"], ["marina", "Bayside Marina"], ["burger", "Big Bun Burgers"], ["taxi", "Palm Taxi Co."], ["wash", "Marina Car Wash"], ["depot", "the Depot"], ["gallery", "Palm Gallery"],
].map(([k, name]) => ({ x: PLACES[k].x, z: PLACES[k].z, name }));
initHeists(scene, {
  toast: m => hud.toast(m), canStart: freeplay, targets: () => HEIST_TARGETS, focus: focusInfo, buzz: () => {},
  wanted: () => crime.S.wanted, copSearching: () => crime.S.searching, earn: n => eco.earn(n), addHeat: n => crime.addCrime(n),
  burst: (x, y, z) => fx.explosion(x, y, z, 0.5), addShake: a => { rig.shake = Math.max(rig.shake, a); },
  onScore: name => { PH.pushHeist(name); PH.shockByName(st, name, -0.22); }, save: () => writeSave(),
});
const events = makeEvents(scene, {
  focus: focusInfo, crowd, gangs, fx, crime, combat, collider, time: () => time,
  sound: (k, v, r) => AudioSys.play(k, v, r), toast: (m, t) => hud.toast(m, t), banner: (a, b, k, t) => hud.banner(a, b, k, t),
  earn: n => eco.earn(n), save: () => writeSave(), shake: a => { rig.shake = Math.max(rig.shake, a); },
  canStart: () => freeplay() && !heistActive() && !jobs.active() && crime.S.wanted === 0,
});
const jobs = makeJobs({
  hospital: () => PLACES.hospital,
  focus: focusInfo, traffic, crowd, gangs, crime, combat, fx, collider, st,
  toast: m => hud.toast(m), banner: (a, b, k, t) => hud.banner(a, b, k, t), sound: (k, v) => AudioSys.play(k, v), earn: n => eco.earn(n), save: () => writeSave(),
});
function mechanic() {
  if (st.money < 500) return "Cash up front, cuz. $500.";
  if (P.car) return "You're already driving something.";
  st.money -= 500;
  const a = P.yaw + Math.PI / 2, x = P.x + Math.sin(a) * 4, z = P.z + Math.cos(a) * 4;
  const c = spawnCar(scene, ["sports", "sedan", "suv"][(Math.random() * 3) | 0], [0x9d0f14, 0x1a1b1d, 0xc6c9cc, 0x1f2d4a][(Math.random() * 4) | 0], x, z, P.yaw);
  const q = collider.resolve(c.x, c.z, 2.2); c.x = q.x; c.z = q.z; syncCar(c); cars.push(c);
  AudioSys.play("door", 0.6); writeSave();
  return null;
}
let phone = null;
const makePhone = () => createPhone({
  st, clock: () => { const t = sky.state.t, m = Math.floor(t * 1440), h = Math.floor(m / 60); return (h % 12 || 12) + ":" + String(m % 60).padStart(2, "0") + (h < 12 ? " AM" : " PM"); },
  objective: () => currentObjective(), focus: focusInfo, jobs, heists: { active: heistActive }, startHeist: a => startHeist(a),
  hire: () => jobs.hire(), mechanic, toast: m => hud.toast(m), sound: (k, v) => AudioSys.play(k, v), save: () => writeSave(),
});

function currentObjective() {
  const o = story.objective();
  if (o && o.main) return o;
  return (extras && extras.objective()) || heistObjectiveNew() || jobs.objective() || events.objective() || o;
}
function heistObjectiveNew() { const h = heistObjective(); return h ? { ...h, r: 5, event: true } : null; }
const extras = makeExtras(scene, {
  st, cars, focus: focusInfo, earn: n => eco.earn(n), toast: (m, t) => hud.toast(m, t), banner: (a, b, k, t) => hud.banner(a, b, k, t),
  sound: (k, v) => AudioSys.play(k, v), save: () => writeSave(), panel: (t, r) => hud.panel(t, r), time: () => time,
  shake: a => { rig.shake = Math.max(rig.shake, a); },
  busy: () => heistActive() || jobs.active() || events.active() || (story.state().mState === "active" && st.mi < 12),
});
setSurface(extras.rampHeight);
const weather = createWeather(scene, sky, city);
const life = makeLife(scene, {
  st, P, crowd, crime, combat, cars, camera, focus: focusInfo, isMobile, time: () => time,
  get hud() { return hud; }, earn: n => eco.earn(n), toast: (m, t) => hud.toast(m, t), banner: (a, b, k, t) => hud.banner(a, b, k, t),
  sound: (k, v, r) => AudioSys.play(k, v, r), save: () => writeSave(), shake: a => { rig.shake = Math.max(rig.shake, a); },
  indoors: () => typeof interior !== "undefined" && interior.inside,
});
const props = makeProps(street, {
  fx, sound: (k, v, r) => AudioSys.play(k, v, r), shake: a => { rig.shake = Math.max(rig.shake, a); },
  focus: () => P.car || P, playerCar: () => P.car,
  movers: () => { const l = []; if (P.car && !P.car.kind) l.push(P.car); for (const t of traffic.cars) if (t.alive) l.push(t); for (const u of crime.units) if (u.active) l.push(u); return l; },
});
const skids = makeSkids(scene);
const doors = makeDoors();
// hijacking: drivers at the wheel, dragged out; owners by their vans
const hijack = makeHijack(scene, {
  player: () => P, crowd, traffic, parked, crime, life, doors, toast: (m, t) => hud.toast(m, t),
  finishEnter: (c, t0) => { P.car = c; P.ch.group.visible = true; AudioSys.play("door", 0.7); doors.play(c, "in", t0); },
});
// haptics: a short buzz on phones when something big hits (explosions, crashes, getting shot)
let lastShake = 0, buzzCD = 0;
function haptics(dt) {
  buzzCD -= dt;
  const jump = rig.shake - lastShake; lastShake = rig.shake;
  if (jump > 0.22 && buzzCD <= 0 && I.touch && navigator.vibrate) { try { navigator.vibrate(Math.round(15 + rig.shake * 45)); } catch (e) {} buzzCD = 0.25; }
}
const interior = makeInterior(scene, {
  st, sky, get hud() { return hud; }, toast: (m, t) => hud.toast(m, t), sound: (k, v) => AudioSys.play(k, v), save: () => writeSave(),
  venueAction: (kind, site) => venueAction(kind, site), player: () => P,
  renderer: R.renderer, fx, indoor: m => AudioSys.indoor(m), beat: () => AudioSys.beat(),
  sleep: () => { sky.set(0.3); settings.time = "0.3"; crime.S.health = 100; hud.banner("GOOD MORNING", "You slept like a baby · game saved", "", 2.4); AudioSys.play("jingle", 0.5); writeSave(); },
});
// what you can do inside a venue, at the counter
// the back rooms: a line of flavour, sometimes a little health or cash
const FLAVOR = {
  game: { lines: ["🎮 Three rounds, three wins. Untouchable.", "🎮 Rage-quit. The controller survived. Barely.", "🎮 'One more game' — an hour ago"] },
  outfit: { lines: ["👔 Fresh fit. Palm City isn't ready.", "👟 New kicks, new you", "🕶 Drip check: passed"] },
  workout: { hp: 15, lines: ["🏋 New personal best", "🥊 The heavy bag never stood a chance", "🏃 Five miles on the treadmill. Legs: gone."] },
  movie: { hp: 5, lines: ["🍿 Car chases and explosions. Five stars.", "🍿 You fell asleep in the second act", "🎬 The popcorn's stale. The movie slaps."] },
  tinker: { lines: ["🔧 You tighten something. It was already tight.", "🔧 New spark plugs. She purrs.", "🛠 Oil change done. Your hands are filthy."] },
  toys: { lines: ["🧸 The teddy approves", "🚀 You build a rocket out of blocks. It's beautiful.", "🧩 Puzzle finished. One piece missing. Always."] },
  stock: { lines: ["🥫 You count the tomatoes. Twice.", "📦 \"Hey — you can't be back here!\"", "🧊 The walk-in is cold. Very cold."] },
  green: { lines: ["🎤 \"Who let you back here?\" — the headliner", "🎸 You strum the guitar. The band winces.", "🍇 You help yourself to the rider"] },
  clubboss: { lines: ["💰 \"You didn't see any of this.\"", "💰 \"Business is good. Real good.\"", "💰 He counts the cash twice and stares at you."] },
  keg: { hp: 5, lines: ["🍺 'Quality control.' Tastes like profit.", "🍺 Fresh keg, fresh pour"] },
  restore: { lines: ["🎨 \"Don't touch that. It's worth more than your car.\"", "🖌 A 300-year-old smile, one brushstroke at a time", "🔍 Under the magnifier: a forger's signature"] },
  vault: { lines: ["🔒 Time lock's on till morning. Shame.", "🔒 The guard watches you very, very closely", "💎 You count the cameras. Eight. Nine."] },
  surgery: { lines: ["🩺 \"Scalpel.\" You look away.", "🩺 The monitor beeps steady. Good sign.", "🩺 \"Who's that in the doorway? Out!\""] },
  scan: { lines: ["🧲 \"Empty your pockets. All of them.\"", "🧲 The magnet hums. Your keys fly across the room.", "🩻 Nice skeleton. Very symmetrical."] },
  armory: { lines: ["🔫 \"Badge first, hotshot.\"", "🔫 \"Nice try. Civilians wait outside.\"", "🛡 The riot shields have seen things"] },
  evidence: { lines: ["🗃 Case #4471: one stolen sedan. Not yours. Probably.", "🗃 Exhibit B is a very large bag of cash", "🗃 \"Sign the log or get out.\""] },
  meeting: { lines: ["💼 \"Let's circle back on that.\" You nod wisely.", "📈 Up eighteen percent. Everyone claps.", "💼 This meeting could have been an email"] },
  servers: { lines: ["🖥 Blinking lights. Somebody's mining crypto in here.", "🖥 \"Did you try turning it off and on again?\"", "❄ It's freezing. The servers like it that way."] },
  load: { pay: 20, lines: ["📦 You haul a few boxes onto the truck", "📦 Pallet loaded. The driver tips you.", "📦 Your back will remember this"] },
};
function venueAction(kind, site) {
  const pay = n => { if (st.money < n) { hud.toast("You need $" + Math.ceil(n - st.money) + " more"); return false; } st.money -= n; AudioSys.play("cash", 0.5); return true; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  if (kind === "eat" || kind === "snack" || kind === "drink") { if (P.ch.face) { P.ch.face.talk = 2.5; setExpr(P.ch.face, "happy", 3); } }       // chewing, sipping
  if (kind === "eat") { if (pay(15)) { crime.S.health = 100; hud.toast(pick(["🍕 That hit the spot", "🍔 Best in Palm City", "🍟 Greasy. Perfect."]) + " · fully healed"); } }
  else if (kind === "drink") { if (pay(25)) { crime.S.health = Math.min(100, crime.S.health + 15); rig.shake = Math.max(rig.shake, 0.15); hud.toast(pick(["🍹 Cheers!", "🍸 On the house? Nope. $25.", "🥂 The night is young"])); } }
  else if (kind === "heal") { if (crime.S.health >= 100) hud.toast("🩺 \"You're in great shape. Next!\""); else if (pay(120)) { crime.S.health = 100; hud.toast("🩺 All patched up"); } }
  else if (kind === "browse") hud.toast(pick(["🖼 \"Sunset Over Nothing\" · $40,000. You keep walking.", "🖼 A single red square. The card says it's about loss.", "🖼 It's a palm tree. It's very good.", "🗿 The gold one is for sale. Everything's for sale."]), 3.2);
  else if (kind === "pool") hud.toast(pick(["🎱 Clean break. Two stripes down.", "🎱 Eight ball, corner pocket. Called it.", "🎱 You scratch. Nobody saw that."]), 3);
  else if (kind === "snack") { crime.S.health = Math.min(100, crime.S.health + 25); hud.toast(pick(["🥪 A sandwich. Life is good.", "🍎 Healthy choice", "🧃 Juice box. No regrets."]) + " · +25 health"); AudioSys.play("blip", 0.4); }
  else if (kind === "wash") hud.toast(pick(["🧼 Squeaky clean", "🚿 You look like a new person", "🪞 Looking sharp"]));
  else if (kind === "dance") { P.danceT = 6; hud.toast(pick(["🕺 Nobody's watching. Everybody's watching.", "💃 The DJ nods at you", "🕺 Moves like that should be illegal"]), 3); }
  else if (kind === "vip") hud.toast(st.money >= 50000 ? "🥂 \"Right this way, you're on the list.\"" : "🥂 \"Nice try. VIP starts at $50,000 in the bank.\"", 3);
  else if (kind === "visit") { crime.S.health = Math.min(100, crime.S.health + 10); hud.toast(pick(["💐 The patients appreciate the company", "💐 \"You're the best visitor we've had all week\""])); }
  else if (kind === "cop") hud.toast(pick(["👮 \"Keep your nose clean, pal.\"", "👮 \"Lost property's round the back.\"", "👮 \"We've got our eye on you.\""]), 3);
  else if (FLAVOR[kind]) {
    const f = FLAVOR[kind];
    if (f.hp) crime.S.health = Math.min(100, crime.S.health + f.hp);
    if (f.pay) { eco.earn(f.pay); AudioSys.play("cash", 0.4); }
    hud.toast(pick(f.lines) + (f.hp ? " · +" + f.hp + " health" : "") + (f.pay ? " · +$" + f.pay : ""), 3);
  }
  else if (kind === "office") {
    const b = BIZ.find(b => b.p === site.p || b.id === site.id), lvl = b && st.owned[b.id];
    hud.toast(lvl ? "💼 \"Books look great, boss\" · level " + lvl + " · +$" + (b.rate * lvl) + "/min" : pick(["💼 \"We're not hiring right now.\"", "💼 \"Take a number.\"", "💼 \"Leave your card, we'll call you.\""]), 3);
  }
}
// you only go indoors with a clear head: no heat, no job running
function canGoIn() {
  if (crime.S.wanted > 0) { hud.toast("Lose the cops first"); return false; }
  if (heistActive() || jobs.active()) { hud.toast("Not now — finish the job first"); return false; }
  return true;
}
const water = makeWater(scene, {
  st, cars, focus: focusInfo, player: () => P, crime, fx, time: () => time,
  toast: (m, t) => hud.toast(m, t), banner: (a, b, k, t) => hud.banner(a, b, k, t), sound: (k, v) => AudioSys.play(k, v), earn: n => eco.earn(n), save: () => writeSave(),
});
function openGunShop() {
  hud.panel("AMMU-PALM", WEAPONS.filter(w => w.id !== "fists").map(w => {
    const owned = combat.own(w);
    return { label: w.name + (owned ? "  ✓" : ""), sub: owned ? "Ammo: " + (st.ammo[w.id] || 0) + " · +" + w.ammo + " rounds" : "Damage " + w.dmg + " · range " + w.range + " m",
      btn: owned ? "AMMO $" + w.ammoCost : "BUY $" + w.cost.toLocaleString(),
      onClick: () => { const err = combat.buy(w); if (err) { hud.toast(err); AudioSys.play("door", 0.3); } else { AudioSys.play("cash", 0.8); writeSave(); } openGunShop(); } };
  }));
}

// gather the crowd and traffic around the spawn point so the very first view is lively
for (const p of crowd.people) if (!p.beach && !p.gang) crowd.respawnNear(p, P.x, P.z);
{
  // half the crowd right around the plaza (the respawn skips the nearest ring, so seed it directly)
  let k = 0;
  for (const p of crowd.people) {
    if (p.beach || p.gang || k++ % 2) continue;
    p.bi = PLAZA.i + ((crowd.r() * 3) | 0) - 1; p.bj = PLAZA.j + ((crowd.r() * 3) | 0) - 1; p.t = crowd.r() * 4; crowd.place(p);
  }
}
for (const c of traffic.cars) traffic.respawnNear(c, P.x, P.z, 30);

// ---------------------------------------------------------------------------------------------
const hud = createHUD(plan);
initInput(hud.ui);
phone = makePhone();
// settings (persisted per device) + the ☰ menu
const SET_KEY = "palmcity_settings";
let settings = { quality: "high", cycle: "false", time: "0.63", weather: "0", sound: "true" };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || "{}")); } catch (e) {}
let menuPaused = false, photoMode = false;
function applySetting(k, v) {
  settings[k] = v;
  if (k === "quality") {
    R.renderer.setPixelRatio(v === "perf" ? 1 : Math.min(devicePixelRatio || 1, 2)); R.resize();
    const sz = v === "perf" ? 1024 : (isMobile ? 2048 : 4096);
    if (sky.sun.shadow.mapSize.x !== sz) { sky.sun.shadow.mapSize.set(sz, sz); if (sky.sun.shadow.map) { sky.sun.shadow.map.dispose(); sky.sun.shadow.map = null; } }
  }
  if (k === "cycle") sky.state.cycle = v === "true";
  if (k === "time") { sky.set(+v); settings.cycle = "false"; sky.state.cycle = false; }
  if (k === "weather") weather.W.mode = +v;
  if (k === "sound") AudioSys.setMuted(v !== "true");
  try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {}
}
for (const k of ["quality", "cycle", "weather"]) applySetting(k, settings[k]);
if (settings.cycle !== "true") sky.set(+settings.time);
const menu = createMenu({
  hud, stats: () => extras.statsRows(), objective: () => currentObjective(),
  player: () => P.car ? { x: P.car.x, z: P.car.z, h: P.car.h } : { x: P.x, z: P.z, h: P.yaw },
  settings: { get: () => settings, set: applySetting },
  onPause: on => { menuPaused = on; },
  photo: on => { photoMode = on; },
  reset: () => askConfirm("Start a new game? Your saved city will be erased.", "Erase & restart", () => { try { localStorage.removeItem(SAVE_KEY); localStorage.setItem("sunset_city_save_v1_imported", "1"); } catch (e) {} location.reload(); }),
  pois: () => {
    const d = [];
    for (const G of GANGS) if (!st.turf[G.id]) d.push({ x: G.x, z: G.z, c: "rgba(255,70,50,.25)", big: G.r });
    for (const b of BIZ) d.push({ x: b.p.x, z: b.p.z, c: st.owned[b.id] ? "#2fae6a" : "#d9962a", t: "$" });
    for (const pr of PROPS) d.push({ x: pr.p.x, z: pr.p.z, c: st[pr.flag] ? "#2fae6a" : "#7a6ad8", t: "⌂" });
    d.push({ x: extras.GARAGE.x, z: extras.GARAGE.z, c: "#2f7cff", t: "G" }, { x: PLACES.guns.x, z: PLACES.guns.z, c: "#444", t: "🔫" },
      { x: PLACES.hospital.x, z: PLACES.hospital.z, c: "#e84040", t: "+" }, { x: PLACES.police.x, z: PLACES.police.z, c: "#10204a", t: "P" });
    if (st.mi >= 5) d.push({ x: PLACES.depot.x, z: PLACES.depot.z, c: "#8a6a3a", t: "D" });
    for (const C of CIRCUITS) d.push({ x: C.start.x, z: C.start.z, c: "#222", t: "🏁" });
    return d;
  },
});
// Vic's taunts land in your messages too
{ const t0 = hud.toast; hud.toast = (m, secs) => { if (/^📱 Vic/.test(m)) phone.vicText(m.replace(/^📱 [^:]+: /, "")); t0(m, secs); }; }
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
  setTimeout(() => life.tutorial(), 400);
  if (document.documentElement.requestFullscreen && isMobile) document.documentElement.requestFullscreen().catch(() => {});
}
title.querySelector(".go").addEventListener("click", start);
const newg = title.querySelector(".newg");
if (newg) newg.addEventListener("click", () => askConfirm("Start a new game? Your saved city will be erased.", "Erase & restart", () => {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem("palmcity2_save"); localStorage.setItem("sunset_city_save_v1_imported", "1"); } catch (e) {}
  location.reload();
}));
addEventListener("keydown", e => { if (e.code === "Enter" && state.phase === "title") start(); });

// ---------------------------------------------------------------------------------------------
let time = 0, last = performance.now(), frozen = false, saveT = 0;
const sim = { dt: 0 };
function nearestCar() {
  let best = null, bd = 3.4 * 3.4, traf = null;
  for (const c of cars) {
    if (c.boom || c.locked) continue;
    const reach = { plane: 6.5, heli: 5.5, boat: 5 }[c.kind] || 3.4;
    const d = (c.x - P.x) ** 2 + (c.z - P.z) ** 2;
    if (d < reach * reach && d < bd + (reach * reach - 3.4 * 3.4)) { bd = Math.min(d, bd); best = c; }
  }
  const t = traffic.nearest(P.x, P.z, 3.4);
  if (t && (t.x - P.x) ** 2 + (t.z - P.z) ** 2 < bd) { best = null; traf = t; bd = (t.x - P.x) ** 2 + (t.z - P.z) ** 2; }
  const pk = parked.nearest(P.x, P.z, 3.4);
  let park = null;
  if (pk && (pk.x - P.x) ** 2 + (pk.z - P.z) ** 2 < bd) { best = null; traf = null; park = pk; }
  return best || traf || park ? { car: best, traf, park } : null;
}
function enterCar(n) {
  let c = n.car;
  if (n.traf) {                                     // hijack it: the driver's in there
    const t = n.traf;
    if (t.speed > 9) { hud.toast("Too fast to grab — step out in front of it", 1.6); return; }
    hijack.driverOf(t);
    traffic.take(t);
    c = spawnCar(scene, t.type, t.color, t.x, t.z, t.h);
    cars.push(c);
    hud.toast(t.type === "motorbike" ? "🏍️ Bike jacked" : "🚗 Hijacked", 1.6);
    crowd.scare(t.x, t.z, 12, 4);
    if (crime.units.some(u => u.active && crime.los(u.x, u.z, t.x, t.z))) crime.addCrime(1);
    if (hijack.start(t, c)) return;                 // the drag-out plays first, then you climb in
  }
  if (n.park) {                                     // break into a parked one
    const t = n.park; parked.take(t);
    c = spawnCar(scene, t.type, t.color, t.x, t.z, t.h);
    cars.push(c);
    hud.toast("🔓 Hot-wired a parked " + t.type, 2.0);
  }
  P.car = c; P.ch.group.visible = true;
  AudioSys.play("door", 0.7); doors.play(c, "in");
  if (c.kind === "heli") hud.toast("🚁 ▲ (Shift) to lift off, ▼ (Space) to descend · stick flies", 3.5);
  if (c.kind === "plane") hud.toast("✈️ Push forward to build speed, hold ▲ (Shift) to take off", 3.5);
}
function exitCar() {
  const c = P.car;
  // step out where the get-in routine starts: the driver's side (the bus: its door, kerb side)
  const spot = doors.exitSpot(c);
  if (spot) { P.x = spot.x; P.z = spot.z; P.yaw = spot.yaw; }
  else { const lx = Math.cos(c.h), lz = -Math.sin(c.h); P.x = c.x + lx * 1.9; P.z = c.z + lz * 1.9; P.yaw = c.h; }
  P.speed = 0;
  const res = collider.resolve(P.x, P.z, 0.4); P.x = res.x; P.z = res.z; P.y = groundY(P.x, P.z);
  if (c.setLamps) c.setLamps(false, 0, 0, false);           // engine off: lamps out
  P.car = null; P.ch.group.visible = true;
  AudioSys.play("door", 0.6); if (!c.boom) doors.play(c, "out");
  AudioSys.engine(0);
}

const focus0 = () => P.car || P;
function update(dt) {
  if (menuPaused) { pollInput(); return; }
  if (life && life.arcadeOpen()) { life.update(dt); pollInput(); return; }                       // the city holds still behind the menu
  time += dt;
  hud.update(dt);
  const inp = pollInput();
  // mid get-in or get-out routine, or dragging someone out: hands off the controls
  if ((P.car && doors.busy(P.car)) || (!P.car && doors.leaving())) { inp.mx = 0; inp.mz = 0; }
  if (hijack.active()) { inp.mx = 0; inp.mz = 0; inp.action = false; inp.fire = false; }
  if (photoMode) { inp.mx = 0; inp.mz = 0; inp.action = false; inp.fire = false; inp.fireHeld = false; inp.jump = false; }
  if (state.phase === "play") {
    if (P.car) {
      const c = P.car;
      if (hud.talking()) { inp.mz = 0; inp.mx = 0; }
      let impact = 0;
      if (c.kind === "boat" || c.kind === "jetski") waterStep(c, inp, dt, time, fx);
      else if (c.kind === "heli") heliStep(c, inp, dt, time, collider);
      else if (c.kind === "plane") { planeStep(c, inp, dt, time, collider); if (c.crash && !c.boom) combat.explodeCar(c, "player"); }
      else { impact = Math.max(driveStep(c, inp, dt, collider), parked.collide(c)); skids.track(c, (c.drift > 3.8 || (inp.handbrakeHeld && Math.abs(c.speed) > 6)) && !c.air, groundY(c.x, c.z) + 0.02); }
      driveLamps(c, c.kind ? null : inp, dt);
      if (impact > 4) { rig.shake = Math.min(1, impact / 18); AudioSys.play("door", Math.min(1, impact / 20), 0.6); fx.sparks(c.x + Math.sin(c.h) * 2, 0.8, c.z + Math.cos(c.h) * 2, 8); }
      if (impact > 9) combat.damageCar(c, (impact - 8) * 2.2, "player");
      // ram the cops: it's a crime, and it hurts both of you
      for (const u of crime.units) {
        if (!u.active) continue;
        const dx = u.x - c.x, dz = u.z - c.z, d2 = dx * dx + dz * dz;
        if (d2 < 10) {
          const d = Math.sqrt(d2) || 1, nx = dx / d, nz = dz / d, rel = (c.vx - u.vx) * nx + (c.vz - u.vz) * nz;
          if (rel > 0) { c.vx -= nx * rel * 0.7; c.vz -= nz * rel * 0.7; u.vx += nx * rel * 0.7; u.vz += nz * rel * 0.7; if (rel > 6) { crime.addCrime(1); combat.damageCar(u, rel * 1.5, "cop"); } }
          c.x -= nx * (3.2 - d) * 0.5; c.z -= nz * (3.2 - d) * 0.5; u.x += nx * (3.2 - d) * 0.5; u.z += nz * (3.2 - d) * 0.5;
        }
      }
      // shunt traffic you hit
      for (const t of traffic.cars) {
        if (!t.alive) continue;
        // the nearest point along the other vehicle's length (a bus is long, not round)
        const hl = Math.max(0, (t.len || 4.6) / 2 - 1.5), fx = Math.sin(t.h), fz = Math.cos(t.h);
        const along = Math.max(-hl, Math.min(hl, (c.x - t.x) * fx + (c.z - t.z) * fz));
        const dx = t.x + fx * along - c.x, dz = t.z + fz * along - c.z, d2 = dx * dx + dz * dz;
        if (d2 < 9) {
          const d = Math.sqrt(d2) || 1, nx = dx / d, nz = dz / d, rel = c.vx * nx + c.vz * nz;
          if (rel > 0) { c.vx -= nx * rel * 1.2; c.vz -= nz * rel * 1.2; t.stun = 2.5; t.speed = 0; if (rel > 5) { rig.shake = Math.min(1, rel / 20); AudioSys.play("door", 0.8, 0.5); combat.damageCar(t, rel * 2, "traffic"); combat.damageCar(c, rel * 0.8, "player"); } }
          c.x -= nx * (3 - d) * 0.5; c.z -= nz * (3 - d) * 0.5;
        }
      }
      syncCar(c);
      AudioSys.engine(isFinite(c.speed) ? c.speed / c.spec.top : 0);
      AudioSys.skid(clamp((c.drift - 3) / 8, 0, 1));
      if (inp.hornHeld) AudioSys.horn();
      if (inp.action && !hud.talking()) {
        const wact = water.action(P);
        if (wact) water.doAction(P);
        else if ((c.kind === "heli" || c.kind === "plane") && c.y > groundY(c.x, c.z) + 2) hud.toast("Land first");
        else exitCar();
      }
    } else if (interior.inside) {
      // at home: a room cam, the walls and the furniture; the door takes you back out
      if (hud.talking()) { inp.mx = 0; inp.mz = 0; inp.action = false; }
      inp.lookX = inp.lookY = 0; inp.jump = false;
      updatePlayerOnFoot(P, inp, dt, interior.S.yaw || 0, collider);
      interior.confine(P);
      if (P.danceT > 0) { P.danceT -= dt; if (P.speed > 0.5) P.danceT = 0; }
      const ia = interior.action(P);
      if (inp.action && ia) { ia[2](); if (!interior.inside) rig.init = false; }
    } else {
      if (hud.talking()) { inp.mx = 0; inp.mz = 0; inp.jump = false; inp.action = false; }
      if (inWater(P.x, P.z)) { inp.sprintHeld = false; inp.jump = false; }
      updatePlayerOnFoot(P, inp, dt, rig.yaw, collider);
      P.swim = inWater(P.x, P.z);
      if (P.swim) { P.speed = Math.min(P.speed, 2.3); P.y = SEA_Y - 1.05 + Math.sin(time * 1.6) * 0.06; P.vy = 0; P.grounded = true; }
      else if (st.jetpack && I.sprintHeld && (!P.grounded || inp.jump || P.jetOn)) {
        // jetpack: hold RUN/Shift once you're off the ground
        P.jetOn = true; P.grounded = false; P.vy = Math.min(7, P.vy + 28 * dt);
        if (Math.random() < dt * 40) fx.fire(P.x - Math.sin(P.yaw) * 0.3, P.y + 0.7, P.z - Math.cos(P.yaw) * 0.3);
      } else if (P.grounded) P.jetOn = false;
      const act = eco.actionAt(P.x, P.z);
      const n = nearestCar();
      const atGuns = (P.x - PLACES.guns.x) ** 2 + (P.z - PLACES.guns.z) ** 2 < 16;
      const atGarage = (P.x - extras.GARAGE.x) ** 2 + (P.z - extras.GARAGE.z) ** 2 < 400;
      const wact = water.action(P);
      if (inp.action && !hud.talking() && wact) { water.doAction(P); inp.action = false; }
      const lact = life.action();
      const vid = !(act && act.kind !== "bizmax") && interior.venueAt(P.x, P.z);
      if (inp.action && !hud.talking()) {
        if (atGuns) openGunShop();
        else if (atGarage && !n) extras.garagePanel();
        else if (lact && !(act && act.kind !== "bizmax") && (lact[0] !== "TALK" || (!n && !vid))) lact[2]();
        else if (act && act.kind === "rest") { if (canGoIn()) interior.enter(act.pr, P); }
        else if (act && act.kind !== "bizmax") eco.doAction(act, bizNames);
        else if (vid) { if (canGoIn()) interior.enterVenue(vid, P); }
        else if (n) enterCar(n);
      }
      if (!hud.talking() && !hud.panelOpen()) {
        if (inp.cycle) { const w = combat.cycle(); hud.toast(w.name, 1.2); }
        const w = combat.current();
        if (inp.fire || (inp.fireHeld && w.id !== "fists" && w.id !== "pistol" && w.id !== "shotgun")) combat.fire(rig.yaw);
      }
    }
    eco.tick(dt, P.x, P.z, !P.car);
    phone.update(dt, { wanted: crime.S.wanted, searching: crime.S.searching, x: focus0().x, z: focus0().z });
    story.update(dt);
    saveT += dt; if (saveT > 5) { saveT = 0; writeSave(); }
  }
  // world sim — while you're indoors the street carries on around your front door
  const focus = interior.inside ? interior.doorWorld() : P.car || P;
  const hz = P.car ? [{ x: P.car.x, z: P.car.z, speed: P.car.speed, vx: P.car.vx, vz: P.car.vz, onHit: (p, sp) => { rig.shake = 0.35; AudioSys.play("door", 0.5, 0.8); if (sp > 9) { crime.addCrime(1); if (sp > 16) p.dead = true, p.knocked = 22; } } }] : [];
  for (const u of crime.units) if (u.active && u.speed > 5) hz.push({ x: u.x, z: u.z, speed: u.speed, vx: u.vx, vz: u.vz });
  interior.update(dt, time);
  if (interior.inside || hud.talking()) life.quiet();
  // your own face: wince when you're hurt, grit your teeth when you swing, sweat it with the cops on you
  if (P.ch.face) {
    const f = P.ch.face;
    if (crime.S.flash > 0.25) setExpr(f, "pain", 0.5);
    else if (combat.S.punchT > 0) setExpr(f, "mad", 0.6);
    else if (crime.S.wanted >= 3 && f.hold <= 0) setExpr(f, P.speed > 5 ? "scared" : "annoyed", 1);
  }
  if (state.phase === "play" && !hud.talking() && !interior.inside) {             // the world holds its breath during dialogue
    crime.update(dt, time); combat.update(dt, time); gangs.update(dt);
    updateHeists(dt, time); events.update(dt); jobs.update(dt); extras.update(dt); life.update(dt);
    if (P.car && P.car.boom && !P.car.charred) {           // your ride went up: you're thrown clear, it's a burnt shell
      const c = P.car; c.charred = true;
      c.group.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color && o.material.color.set(0x1a1816); o.material.metalness = 0.1; o.material.roughness = 1; } });
      exitCar(); cars.splice(cars.indexOf(c), 1);
    }
  }
  fx.update(dt);
  props.update(dt, time); haptics(dt); doors.update(dt); hijack.update(dt);
  if (greyT > 0) { greyT -= dt; R.grade.uSat.value = 1.1 - Math.min(1, greyT) * 0.95; } else R.grade.uSat.value = 1.1;
  crowd.update(dt, time, focus.x, focus.z, hz);
  traffic.update(dt, time, [P.car ? { x: P.car.x, z: P.car.z, car: true } : { x: focus.x, z: focus.z, car: false }]);
  if (state.phase === "play" && P.car && !interior.inside) redLight(P.car);
  if (state.phase === "title") {
    // slow cinematic orbit over the plaza, high enough to clear the rooftops
    const a = 0.7 + time * 0.03, r = 150 + Math.sin(time * 0.1) * 20;
    camera.position.set(px + Math.sin(a) * r, 82 + Math.sin(time * 0.07) * 10, pz + Math.cos(a) * r);
    camera.lookAt(px, 0, pz);
  } else if (state.phase === "play" && interior.inside) {
    interior.S.yaw = interior.camera(camera, P, dt);
  } else if (state.phase === "play") {
    updateCam(rig, dt, P.car ? { x: P.car.x, z: P.car.z, y: P.car.y, h: P.car.h, speed: P.car.speed } : { x: P.x, z: P.z, y: P.y, h: P.yaw, speed: 0 }, inp, collider, !!P.car, time);
  }
  weather.update(dt, camera, interior.inside);
  // the breeze the hair blows in: a sea wind off the bay, swinging round slowly, stronger in a storm (none indoors)
  {
    const storm = (weather.W && (weather.W.rain || weather.W.amt || weather.W.k)) || 0, ang = time * 0.03 + 0.6, str = interior.inside ? 0.12 : 0.55 + storm * 1.4;
    HAIR_U.uTime.value = time; HAIR_U.uWind.value.set(Math.cos(ang) * str, 0, Math.sin(ang) * str);
  }
  sky.update(dt, time, P.car || P, camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (frozen) return;
  update(dt);
  render();
}
// the street the cars reflect, filmed around you a face at a time
const probe = makeProbe(R.renderer, scene, sky, { mobile: isMobile });
// running a red light in front of a cop is a crime; anywhere else the other drivers just lean on the horn
let lastBox = null;
function redLight(c) {
  const i = Math.round((c.x + HALF - ROAD / 2) / (BLOCK + ROAD)), j = Math.round((c.z + HALF - ROAD / 2) / (BLOCK + ROAD));
  const cx = -HALF + ROAD / 2 + i * (BLOCK + ROAD), cz = -HALF + ROAD / 2 + j * (BLOCK + ROAD);
  const inBox = Math.abs(c.x - cx) < ROAD / 2 && Math.abs(c.z - cz) < ROAD / 2 && i > 0 && j > 0 && i < 14 && j < 14;
  const key = inBox ? i + "," + j : null;
  if (key && key !== lastBox) {
    const vx = c.vx || Math.sin(c.h) * c.speed, vz = c.vz || Math.cos(c.h) * c.speed;
    const axis = Math.abs(vx) > Math.abs(vz) ? "x" : "z", sp = Math.hypot(vx, vz);
    // only if they came in from the approach (not if they were already turning in the box)
    const edge = axis === "x" ? Math.abs(c.x - cx) > ROAD / 2 - 2.5 : Math.abs(c.z - cz) > ROAD / 2 - 2.5;
    if (edge && sp > 5 && signalState(i, j, axis, SIGNAL.t) === RED) {
      const cop = crime.units.some(u => u.active && (u.x - c.x) ** 2 + (u.z - c.z) ** 2 < 70 * 70);
      if (cop) { hud.toast("🚦 Ran a red light — in front of the cops"); crime.addCrime(1); }
      else { if (Math.random() < 0.6) AudioSys.play("horn", 0.5, 0.9 + Math.random() * 0.2); hud.toast("🚦 Ran a red light", 1.2); }
    }
  }
  lastBox = key;
}
traffic.walkers = () => crowd.people.filter(p => p.cross && !p.cross.wait && p.knocked <= 0);
traffic.onHonk = c => { const d2 = (c.x - P.x) ** 2 + (c.z - P.z) ** 2; if (d2 < 40 * 40) AudioSys.play("horn", Math.max(0.15, 0.7 - Math.sqrt(d2) / 60), 0.85 + Math.random() * 0.3); };

// the headlight beams of the car you're driving: real light on the road ahead after dark
const beam = new THREE.SpotLight(0xfff1dc, 0, 70, 0.55, 0.55, 1.3);
beam.target.position.set(0, -1.2, 22); beam.add(beam.target); scene.add(beam);
function render() {
  const focus = interior.inside ? interior.doorWorld() : P.car || P;
  LAMP_U.uTime.value = time; LAMP_U.night = sky.state.night;
  {
    const c = P.car, on = c && !c.kind && c.setLamps && sky.state.night > 0.3;
    if (on && beam.parent !== c.chassis) { c.chassis.add(beam); beam.position.set(0, (c.spec.ride || 0.2) + 0.55, c.spec.len / 2 + 0.1); }
    beam.intensity = on ? 180 * Math.min(1, (sky.state.night - 0.3) * 3) : 0;
  }
  const mount = P.car && doors.pose(P.car, P.ch.look);       // mid get-in routine
  if (mount) {
    P.ch.group.visible = true;
    P.ch.pose(mount.x, mount.y, mount.z, mount.yaw, time * 7, mount.walk ? 0.55 : 0.04, { override: mount.over, headPitch: mount.headPitch });
  } else if (P.car && (P.car.kind === "bike" || P.car.kind === "jetski")) {
    const c = P.car; P.ch.group.visible = true;
    const seat = c.kind === "bike" ? 0.62 : 0.55;
    P.ch.pose(c.x - Math.sin(c.h) * 0.25, (c.y || 0) + seat - 0.97 + 0.12, c.z - Math.cos(c.h) * 0.25, c.h, 0, 0,
      { tilt: 0, override: { thighL: -1.45, thighR: -1.45, kneeL: 1.5, kneeR: 1.5, armL: -1.1, armR: -1.1, elbowL: -0.3, elbowR: -0.3, lean: 0.35, roll: (c.roll || 0) } });
  } else if (P.car) {
    // at the wheel: you can see the driver through the glass
    const sp = seatPose(P.car, P.ch.look, P.car.steer || 0);
    P.ch.group.visible = !!sp;
    if (sp) P.ch.pose(sp.x, sp.y, sp.z, sp.yaw, 0, 0.04, { override: sp.over });
  }
  const leave = !P.car && doors.pose(null, P.ch.look);       // mid get-out routine
  if (leave) P.ch.pose(leave.x, leave.y, leave.z, leave.yaw, time * 7, leave.walk ? 0.55 : 0.04, { override: leave.over, headPitch: leave.headPitch });
  else if (!P.car) {
    let over = combat.pose();
    if (P.swim) over = { tilt: 1.25, armL: Math.sin(time * 4) * 2.6, armR: -Math.sin(time * 4) * 2.6, thighL: Math.sin(time * 8) * 0.3, thighR: -Math.sin(time * 8) * 0.3, kneeL: 0.2, kneeR: 0.2, elbowL: -0.3, elbowR: -0.3 };
    if (!over && combat.current().id !== "fists") over = { armR: -1.45, elbowR: -0.1, armL: -1.2, elbowL: -0.5 };   // weapon up
    if (P.danceT > 0 && P.speed < 0.3) over = { armL: -2.3 + Math.sin(time * 5) * 0.6, armR: -2.1 - Math.sin(time * 5) * 0.6, elbowL: -0.7, elbowR: -0.7, thighL: Math.max(0, Math.sin(time * 5)) * -0.5, thighR: Math.max(0, -Math.sin(time * 5)) * -0.5, kneeL: Math.max(0, Math.sin(time * 5)) * 0.8, kneeR: Math.max(0, -Math.sin(time * 5)) * 0.8 };
    const hands = !P.swim && combat.hands();
    if (hands) over = Object.assign({}, over || {}, hands);
    const hj = hijack.playerPose(); if (hj) over = hj;
    poseOnFoot(P, time, over);
  }
  camera.updateMatrixWorld(); setView(camera);
  crowd.render(camera.position.x * 0.5 + focus.x * 0.5, camera.position.z * 0.5 + focus.z * 0.5, camera);
  hijack.render(performance.now() / 1000);
  traffic.render(focus.x, focus.z, sky.state.night);
  parked.render(focus.x, focus.z);
  city.update(time, sky.state.night);
  updateSignals(street.signals, SIGNAL.t, signalState, walkState, camera.position, sky.state.night);
  ocean.update(time, scene.fog);
  for (const id in npcs) {
    const n = npcs[id]; if (!n.at) continue;
    const dx = (P.car ? P.car.x : P.x) - n.at.x, dz = (P.car ? P.car.z : P.z) - n.at.z;
    if (dx * dx + dz * dz < 150) n.yaw = Math.atan2(dx, dz);                 // turn to face you as you walk up
    n.ch.pose(n.at.x, groundY(n.at.x, n.at.z), n.at.z, n.yaw, time * 0.9, 0.04, null);
  }
  setSignNight(signs, sky.state.night);
  setStreetLights(Math.min(1, sky.state.night * 1.6) * 8);
  {
    // headlights: the six nearest cars on the road (ahead of the camera first) light the street before them
    const hl = [], night = sky.state.night, cx = camera.position.x, cz = camera.position.z;
    if (night > 0.3) {
      for (const t of traffic.cars) {
        if (!t.alive) continue;
        const d2 = (t.x - cx) ** 2 + (t.z - cz) ** 2;
        if (d2 > 90 * 90) continue;
        const half = (t.len || 4.6) / 2;
        hl.push({ x: t.x + Math.sin(t.h) * half, z: t.z + Math.cos(t.h) * half, h: t.h, d: d2 });
      }
      for (const u of crime.units) if (u.active && u.x !== undefined) { const h = u.h ?? Math.atan2(u.vx || 0, u.vz || 1); hl.push({ x: u.x + Math.sin(h) * 2.3, z: u.z + Math.cos(h) * 2.3, h, d: (u.x - cx) ** 2 + (u.z - cz) ** 2 }); }
      hl.sort((a, b) => a.d - b.d);
    }
    setHeadlights(hl, Math.min(1, (night - 0.3) * 3));
  }
  const obj = state.phase === "play" ? currentObjective() : null;
  beacon.set(obj && (obj.main || obj.event) && obj.x !== undefined ? { x: obj.x, z: obj.z } : null, obj ? obj.r : 3);
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
      else if (act.kind === "rest") { actLabel = "ENTER"; actPrompt = "Your <b>" + act.pr.label + "</b> · head inside"; }
      else if (act.kind === "bizmax") actPrompt = "<b>" + bizNames[act.b.id] + "</b> · max level · +$" + (act.b.rate * 3) + "/min";
    }
    const la = !P.car && !act && life.action();
    if (la && !(la[0] === "TALK" && near)) { actLabel = la[0]; if (la[1]) actPrompt = la[1]; hud.buttons(false, !!near, actLabel); hud.prompt(actPrompt + (I.touch ? "" : " · <b>E</b>")); }
    const vid = !P.car && !interior.inside && !(act && act.kind !== "bizmax") && interior.venueAt(P.x, P.z);
    if (vid && !(la && la[0] !== "TALK")) { actLabel = "ENTER"; actPrompt = "<b>" + (PLACES[vid].label || vid) + "</b> · walk in"; }
    const wlab = water.action(P);
    hud.buttons(!!P.car, !!near, wlab || actLabel, P.car && P.car.kind);
    if (wlab) hud.prompt(wlab === "CAST" ? "🎣 Stopped on the water — <b>CAST</b> a line" : wlab === "DIVE" ? "💰 Something glitters below — <b>DIVE</b>" : "🎣 Wait for the bite, then <b>REEL</b>");
    const key = I.touch ? "Tap" : "Press <b>E</b>";
    hud.prompt(actPrompt ? (actLabel ? actPrompt + (I.touch ? "" : " · <b>E</b>") : actPrompt) : (!P.car && near ? (near.traf ? (I.touch ? "Tap <b>DRIVE</b> to hijack the " : "Press <b>E</b> to hijack the ") + near.traf.type : near.park ? (I.touch ? "Tap <b>DRIVE</b> to break into the " : "Press <b>E</b> to break into the ") + near.park.type : (I.touch ? "Tap <b>DRIVE</b> to get in" : "Press <b>E</b> to drive")) : ""));
    hud.level(st.lvl, st.xp, xpNeed(st.lvl), eco.incomeRate());
    hud.comboTick(combat.S.rampT);
    const w = combat.current();
    hud.vitals(crime.S.health, crime.S.wanted, crime.S.searching, w.name, w.id === "fists" ? null : (st.ammo[w.id] || 0), !P.car);
    hud.hurt(crime.S.flash + (crime.S.health < 25 ? 0.25 + Math.sin(time * 6) * 0.1 : 0));
    if (!P.car && !near && (P.x - extras.GARAGE.x) ** 2 + (P.z - extras.GARAGE.z) ** 2 < 400 && !act) { hud.buttons(false, false, "GARAGE"); hud.prompt("<b>CITY GARAGE</b> · buy, upgrade & repaint" + (I.touch ? "" : " · <b>E</b>")); }
    if (!P.car && (P.x - PLACES.guns.x) ** 2 + (P.z - PLACES.guns.z) ** 2 < 16 && !act) { actLabel = "SHOP"; actPrompt = "<b>AMMU-PALM</b> · guns & ammo"; hud.buttons(false, !!near, actLabel); hud.prompt(actPrompt); }
    if (interior.inside) { const ia = interior.action(P); hud.buttons(false, false, ia && ia[0]); hud.prompt(ia ? ia[1] + (I.touch ? "" : " · <b>E</b>") : ""); }
    if (obj) {
      hud.objective(obj.title, obj.text);
      const f = P.car || P;
      hud.objDistance(obj.x !== undefined ? Math.hypot(f.x - obj.x, f.z - obj.z) : null);
    } else { hud.objective("Palm City", st.mi >= 12 ? "The city is yours — keep building" : "Explore the city"); hud.objDistance(null); }
    hud.speed(P.car ? P.car.speed * 3.6 : 0, !!P.car, P.car && P.car.fuel !== undefined ? P.car.fuel : null);
    hud.cash(state.money);
    const dots = [];
    for (const b of BIZ) dots.push({ x: b.p.x, z: b.p.z, c: st.owned[b.id] ? "#2fae6a" : "#d9962a", r: 5, t: "$" });
    for (const pr of PROPS) dots.push({ x: pr.p.x, z: pr.p.z, c: st[pr.flag] ? "#2fae6a" : "#7a6ad8", r: 5, t: "⌂" });
    if (st.mi >= 5) dots.push({ x: PLACES.depot.x, z: PLACES.depot.z, c: "#8a6a3a", r: 5, t: "D" });
    for (const c of cars) if (c !== P.car) dots.push({ x: c.x, z: c.z, c: "#2f7cff", r: 3 });
    for (const G of GANGS) if (!st.turf[G.id]) dots.unshift({ x: G.x, z: G.z, c: ["rgba(200,40,40,.22)", "rgba(40,80,200,.22)", "rgba(40,150,70,.22)"][GANGS.indexOf(G)], r: G.r * 0.5 });
    for (const u of crime.units) if (u.active) dots.push({ x: u.x, z: u.z, c: Math.floor(time * 6) % 2 ? "#ff3030" : "#3060ff", r: 3.5 });
    if (crime.heli.active) dots.push({ x: crime.heli.x, z: crime.heli.z, c: "#ffffff", r: 4.5 });
    for (const p of gangs.members) if (!p.hidden && p.knocked <= 0 && (p.goon || (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 < 3600)) dots.push({ x: p.x, z: p.z, c: p.boss ? "#ff00aa" : "#ff5a3a", r: p.boss ? 4 : 2.5 });
    hud.minimap(focus.x, focus.z, P.car ? P.car.h : P.yaw, rig.yaw, dots, obj && obj.x !== undefined ? { x: obj.x, z: obj.z, c: obj.side ? "#ff8a4c" : "#ffc861" } : null);
  }
  probe.update(P.car || P, [P.car && P.car.group, P.ch.group], interior.inside);
  R.render(scene, camera, time);
}

const bizNames = Object.fromEntries(Object.entries(STORY.biz).map(([k, v]) => [k, v.name]));
// give the people a few seconds to arrive before the curtain goes up; a slow connection plays on and they swap in
await Promise.race([humansLoad, new Promise(r => setTimeout(r, 9000))]);
await step(100);
document.getElementById("boot").classList.add("gone");
requestAnimationFrame(frame);

// debug / test hooks
globalThis.__pc2 = {
  THREE, scene, camera, R, sky, city, plan, facade, parked, eco, story, st, npcs, PLACES, BIZ, PROPS, hud, crime, combat, fx, gangs, extras, weather, water, life, menu: () => menu, applySetting, phone: () => phone, events, jobs, heistsDebug, startHeist, PH, collider, crowd, traffic, humansReady, hijack, P, cars, state, rig, I,
  interior, props, skids, freeze: v => { frozen = v; }, renderOnce: () => render(), step: (dt = 1 / 60) => { update(dt); },
  start, setTime: t => sky.set(t), enterNearest: () => { const n = nearestCar(); if (n) enterCar(n); return !!n; }, exitCar,
  look: (px, py, pz, tx, ty, tz) => { state.phase = "debug"; title.classList.add("gone"); camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); },
};
