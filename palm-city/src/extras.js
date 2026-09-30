// Palm City — the rest of the progression: the City Garage (three personal cars with perks,
// engine/turbo/tyre upgrades, repaints), 12 hidden Golden Palms, stunt ramps with scored air
// time, three street-race circuits with medals and best laps, and achievements.
import * as THREE from "../vendor/three.module.js";
import { roadC, blockC, blockMin, HALF, BLOCK, CURB, PLAZA, clamp, groundY } from "./world.js";
import { carSpec } from "./cars.js";
import { spawnCar, syncCar } from "./play.js";
import { PLACES } from "./places.js";
import { SEA_Y } from "./ocean.js";

export const PCARS = [
  { id: "coral", name: "Coral Cruiser", type: "compact", color: 0xc8503e, price: 1500, perk: "Showtime — +50% stunt-jump cash", mult: { top: 1.0, accel: 1.05, turn: 1.0 }, jumpMult: 1.5 },
  { id: "azure", name: "Azure Sport", type: "sports", color: 0x2a6fb8, price: 4000, perk: "Slippery — shakes police heat twice as fast", mult: { top: 0.95, accel: 0.95, turn: 1.0 }, heatMult: 2 },
  { id: "sterling", name: "Sterling GT", type: "sports", color: 0x2b2f36, price: 12000, perk: "Connected — bust fines cut in half", mult: { top: 1.12, accel: 1.15, turn: 1.05 }, fineMult: 0.5 },
];
export const PAINT = [0x9d0f14, 0xc8503e, 0xe8e8e6, 0x1a1b1d, 0x2a6fb8, 0x1f2d4a, 0x3a5a3a, 0xb8bcc0, 0xd8a21e, 0x6a2a5a];
const MOD_MAX = 3, modCost = l => 800 * (l + 1);
const MODS = [["engine", "Engine", "top speed"], ["turbo", "Turbo", "acceleration"], ["tyres", "Tyres", "grip & handling"]];

// golden palm spots: sidewalks, parks, the beach, the outskirts (never inside a building)
const PALM_SPOTS = [[1, 1, 4, 4], [12, 1, -4, 4], [6, 4, 0, -27], [3, 5, 0, 0], [10, 10, 0, 0], [7, 2, 5, -3], [13, 7, 27, 0], [0, 12, -27, 6],
  [9, 13, 0, 40], [2, 13, 0, 42], [12, 13, 0, 44], [5, 8, -27, 12]].map(([i, j, dx, dz]) => ({ x: blockC(i) + dx, z: blockC(j) + dz }));
// stunt ramps: a wedge you hit at speed. [x, z, heading]
const RAMPS = [
  [blockC(3), blockC(5) - 18, 0], [blockC(10), blockC(10) + 18, Math.PI], [blockC(7), blockC(2) - 16, 0],
  [-HALF + 120, HALF + 22, Math.PI / 2], [HALF - 160, HALF + 22, -Math.PI / 2], [blockC(PLAZA.i) - 18, blockC(PLAZA.j) - 24, Math.PI / 2],
];
const RL = 9, RW = 4.6, RH = 2.1;
export const CIRCUITS = [
  { id: "downtown", name: "Downtown Loop", start: [5, 4], cps: [[9, 4], [9, 8], [5, 8], [5, 4]], limit: 52, reward: 500 },
  { id: "outer", name: "Outer Ring", start: [1, 1], cps: [[13, 1], [13, 12], [1, 12], [1, 1]], limit: 95, reward: 900 },
  { id: "harbor", name: "Harbor Dash", start: [8, 10], cps: [[12, 10], [12, 13], [4, 13], [4, 10], [8, 10]], limit: 60, reward: 600 },
].map(C => ({ ...C, start: { x: roadC(C.start[0]), z: roadC(C.start[1]) }, cps: C.cps.map(([i, j]) => ({ x: roadC(i), z: roadC(j) })) }));
// the water circuit: grab a jet ski (or the boat) at the marina and slalom the bay
{
  const mx = PLACES.marina.x, cx = x => clamp(x, -HALF + 40, HALF - 40);
  CIRCUITS.push({ id: "wake", name: "Wake Breaker", water: true, limit: 80, reward: 900, start: { x: cx(mx - 6), z: HALF + 86 },
    cps: [[mx - 90, 110], [mx - 200, 160], [mx - 70, 215], [mx + 110, 165], [mx + 190, 110], [mx - 6, 86]].map(([x, z]) => ({ x: cx(x), z: HALF + z })) });
}
const isWaterCraft = c => c && (c.kind === "boat" || c.kind === "jetski");
const medalFor = (C, t) => t <= C.limit * 0.5 ? 3 : t <= C.limit * 0.65 ? 2 : t <= C.limit * 0.82 ? 1 : 0;

export function makeExtras(scene, g) {
  // g: { st, cars, player(), focus(), earn, toast, banner, sound, save, panel(title, rows), story, crime }
  const st = g.st;
  st.pcars = st.pcars || {}; st.mods = st.mods || {}; st.palms = st.palms || []; st.races = st.races || {}; st.medals = st.medals || {};
  st.ach = st.ach || []; st.stats = st.stats || {};
  const S = st.stats;

  // ---------------- garage ----------------
  const GARAGE = { x: blockC(PLAZA.i) - 21.5, z: blockC(PLAZA.j) };
  const show = [];
  PCARS.forEach((pc, i) => {
    const col = st.pcars[pc.id] !== undefined ? st.pcars[pc.id] : pc.color;
    const v = spawnCar(scene, pc.type, col, GARAGE.x, GARAGE.z - 12 + i * 12, 0);
    v.personal = pc; v.locked = st.pcars[pc.id] === undefined;
    applyMods(v);
    g.cars.push(v); show.push(v);
  });
  function applyMods(v) {
    const pc = v.personal, m = st.mods[pc.id] || [0, 0, 0], base = carSpec(pc.type);
    v.spec = { ...base, top: base.top * pc.mult.top * (1 + m[0] * 0.1), accel: base.accel * pc.mult.accel * (1 + m[1] * 0.12), turn: base.turn * pc.mult.turn * (1 + m[2] * 0.06), grip: base.grip * (1 + m[2] * 0.08) };
    v.jumpMult = pc.jumpMult || 1; v.heatMult = pc.heatMult || 1; v.fineMult = pc.fineMult || 1;
  }
  function paintCar(v, hex) { v.body.material.color.set(hex); st.pcars[v.personal.id] = hex; g.save(); }
  function garagePanel() {
    const rows = [];
    for (const v of show) {
      const pc = v.personal, owned = st.pcars[pc.id] !== undefined, m = st.mods[pc.id] || [0, 0, 0];
      if (!owned) { rows.push({ label: pc.name, sub: pc.perk, btn: "BUY $" + pc.price.toLocaleString(), onClick: () => buyCar(v) }); continue; }
      rows.push({ label: pc.name + "  ✓", sub: pc.perk, btn: "REPAINT", onClick: () => { const cur = PAINT.indexOf(st.pcars[pc.id]); paintCar(v, PAINT[(cur + 1) % PAINT.length]); g.sound("blip", 0.5); garagePanel(); } });
      MODS.forEach(([, label, what], k) => rows.push({
        label: "   " + label + " " + "●".repeat(m[k]) + "○".repeat(MOD_MAX - m[k]), sub: "+" + what,
        btn: m[k] >= MOD_MAX ? "MAX" : "$" + modCost(m[k]).toLocaleString(), disabled: m[k] >= MOD_MAX,
        onClick: () => { const c = modCost(m[k]); if (st.money < c) { g.toast("You need $" + Math.ceil(c - st.money).toLocaleString() + " more"); return; } st.money -= c; m[k]++; st.mods[pc.id] = m; applyMods(v); g.sound("cash", 0.7); g.save(); garagePanel(); },
      }));
    }
    g.panel("CITY GARAGE", rows);
  }
  function buyCar(v) {
    const pc = v.personal;
    if (st.money < pc.price) { g.toast("You need $" + Math.ceil(pc.price - st.money).toLocaleString() + " more"); g.sound("door", 0.3); return; }
    st.money -= pc.price; st.pcars[pc.id] = pc.color; v.locked = false;
    g.banner("NEW RIDE", pc.name + " is yours", "", 2.6); g.sound("jingle", 0.9); g.save(); garagePanel();
  }

  // ---------------- golden palms ----------------
  const palmMat = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xff9a10, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.25 });
  const palmGeo = new THREE.OctahedronGeometry(0.7, 0);
  const palms = PALM_SPOTS.map((p, i) => {
    const m = new THREE.Mesh(palmGeo, palmMat); m.position.set(p.x, groundY(p.x, p.z) + 1.3, p.z); m.castShadow = true;
    m.visible = !st.palms.includes(i); scene.add(m); return { ...p, m, i };
  });

  // ---------------- ramps ----------------
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6e, roughness: 0.7, metalness: 0.4 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 });
  const ramps = RAMPS.map(([x, z, h]) => {
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(RL, 0); shape.lineTo(RL, RH); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: RW, bevelEnabled: false }); geo.translate(0, 0, -RW / 2); geo.rotateY(-Math.PI / 2);
    const m = new THREE.Mesh(geo, rampMat); m.castShadow = true; m.receiveShadow = true;
    const gy = groundY(x, z);
    m.position.set(x, gy, z); m.rotation.y = h; scene.add(m);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.06, 0.4), stripe); lip.position.set(0, RH + 0.03, RL - 0.2); m.add(lip);
    return { x, z, h, fx: Math.sin(h), fz: Math.cos(h) };
  });
  function rampHeight(x, z) {
    for (const r of ramps) {
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.fx + dz * r.fz, s = dx * r.fz - dz * r.fx;
      if (u > 0 && u < RL && Math.abs(s) < RW / 2) return u / RL * RH;
    }
    return 0;
  }
  // colliding with a ramp's tall back face: treat the lip end as a wall
  function landing(v) {
    if (!v.landed || v.landed < 0.35) return;
    const air = v.landed;
    const mult = v.jumpMult || 1;
    const bonus = g.earn(Math.round((40 + air * air * 240) * mult));
    if (air > (S.bestJump || 0)) S.bestJump = air;
    g.toast("🛫 SWEET JUMP " + air.toFixed(2) + "s  +$" + bonus); g.sound("cash", 0.8); g.shake(0.3);
  }

  // ---------------- races ----------------
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  function makeGate(color) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.35, 8, 40, Math.PI), mat);
    grp.add(ring); grp.visible = false; scene.add(grp); return grp;
  }
  const startGates = CIRCUITS.map(C => {
    const grp = new THREE.Group();
    const posts = [-8, 8].map(x => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), rampMat); m.position.set(x, 3.5, 0); grp.add(m); return m; });
    const c = document.createElement("canvas"); c.width = 512; c.height = 64; const x2 = c.getContext("2d");
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x2.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f4"; x2.fillRect(i * 16, j * 16, 16, 16); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(16.5, 1.2, 0.2), new THREE.MeshStandardMaterial({ map: tex }));
    banner.position.y = 7; grp.add(banner);
    if (C.water) {                                     // floating start line: buoys under the posts
      for (const x of [-8, 8]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 14), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })); b.position.set(x, 0, 0); grp.add(b); }
    }
    grp.position.set(C.start.x, C.water ? SEA_Y : 0, C.start.z); scene.add(grp);
    return grp;
  });
  const cpGate = makeGate(0x40ff90);
  let race = null, raceCD = 0;
  function updateRace(dt) {
    const F = g.focus();
    if (raceCD > 0) raceCD -= dt;
    if (!race) {
      if (!F.car || raceCD > 0 || g.busy()) return;
      for (const C of CIRCUITS) {
        if (!!C.water !== isWaterCraft(F.car) || (!C.water && F.car.kind && F.car.kind !== "bike")) continue;   // boats race the bay, cars the streets
        if ((F.x - C.start.x) ** 2 + (F.z - C.start.z) ** 2 < (C.water ? 100 : 64)) {
          race = { C, i: 0, t: C.limit, el: 0 };
          g.banner("GO!", C.name + " · gold under " + Math.ceil(C.limit * 0.5) + "s", C.water ? "WATER RACE" : "STREET RACE", 1.8); g.sound("jingle", 0.7);
          break;
        }
      }
      return;
    }
    race.t -= dt; race.el += dt;
    const cp = race.C.cps[race.i];
    cpGate.visible = true; cpGate.position.set(cp.x, race.C.water ? SEA_Y : 0, cp.z); cpGate.rotation.y = g.time() * 0.6;
    if (!F.car) { g.toast("🏁 Race abandoned — you left the " + (race.C.water ? "jet ski" : "car")); race = null; cpGate.visible = false; raceCD = 4; return; }
    if ((F.x - cp.x) ** 2 + (F.z - cp.z) ** 2 < (race.C.water ? 144 : 100)) {
      race.i++; g.sound("blip", 0.8);
      if (race.i >= race.C.cps.length) {
        const C = race.C, t = race.el, medal = medalFor(C, t);
        const prevBest = st.races[C.id] || 0, best = !prevBest || t < prevBest;
        if (best) st.races[C.id] = t;
        if (medal > (st.medals[C.id] || 0)) st.medals[C.id] = medal;
        const paid = g.earn(C.reward + medal * 250);
        g.banner(["FINISHED", "🥉 BRONZE", "🥈 SILVER", "🥇 GOLD"][medal], C.name + " · " + t.toFixed(1) + "s" + (best ? " · new best!" : "") + " · +$" + paid.toLocaleString(), "RACE COMPLETE", 3.4);
        g.sound("jingle", 1); g.save(); race = null; cpGate.visible = false; raceCD = 6; return;
      }
      g.toast("✔ Checkpoint " + race.i + "/" + race.C.cps.length, 1);
    }
    if (race.t <= 0) { g.toast("⏱ Out of time — roll through the start gate to retry"); race = null; cpGate.visible = false; raceCD = 5; }
  }

  // ---------------- achievements ----------------
  const ACH = [
    ["car1", "First Wheels", "Buy a car at the City Garage", () => Object.keys(st.pcars).length >= 1],
    ["car3", "Car Collector", "Own all 3 personal cars", () => Object.keys(st.pcars).length >= 3],
    ["biz6", "Property Mogul", "Own all 6 businesses", () => Object.keys(st.owned).length >= 6],
    ["palms12", "Palm Hunter", "Collect all 12 Golden Palms", () => st.palms.length >= 12],
    ["jump1", "Daredevil", "Land a 1.0s+ stunt jump", () => (S.bestJump || 0) >= 1],
    ["race1", "Speed Demon", "Win a street race", () => Object.keys(st.races).length > 0],
    ["goldrush", "Gold Rush", "Gold on every circuit", () => CIRCUITS.every(C => (st.medals[C.id] || 0) >= 3)],
    ["homeowner", "Homeowner", "Buy a home", () => st.apt || st.home || st.house],
    ["turf3", "Kingpin", "Take all 3 gang turfs", () => Object.keys(st.turf || {}).length >= 3],
    ["shark", "Shark Hunter", "Defeat Vic 'The Shark' Moreno", () => ((st.nem && st.nem.defeated) || 0) >= 1],
    ["tycoon", "Palm City Tycoon", "Have $50,000", () => (S.maxMoney || 0) >= 50000],
    ["story", "King of the City", "Finish the 12-chapter story", () => st.mi >= 12],
    ["lvl10", "Rising Star", "Reach level 10", () => st.lvl >= 10],
    ["lvl25", "City Legend", "Reach level 25", () => st.lvl >= 25],
  ];
  let achCD = 1;
  function checkAch(announce) {
    for (const [id, name, , done] of ACH) {
      if (st.ach.includes(id) || !done()) continue;
      st.ach.push(id);
      if (announce) { g.banner("🏆 " + name, "Achievement unlocked", "", 3); g.sound("jingle", 0.8); }
    }
  }
  checkAch(false);

  function update(dt) {
    const F = g.focus();
    S.maxMoney = Math.max(S.maxMoney || 0, Math.floor(st.money));
    // palms
    for (const p of palms) {
      if (!p.m.visible) continue;
      p.m.rotation.y += dt * 2; p.m.position.y = groundY(p.x, p.z) + 1.3 + Math.sin(g.time() * 2 + p.i) * 0.2;
      if ((F.x - p.x) ** 2 + (F.z - p.z) ** 2 < (F.car ? 9 : 3)) {
        p.m.visible = false; st.palms.push(p.i);
        const got = g.earn(150);
        if (st.palms.length >= 12) { const b = g.earn(2000); g.banner("ALL 12 GOLDEN PALMS", "+$" + b.toLocaleString() + " bonus", "", 3.2); }
        else g.toast("🌴 Golden Palm " + st.palms.length + "/12  +$" + got);
        g.sound("cash", 0.9); g.save();
      }
    }
    if (F.car) landing(F.car);
    updateRace(dt);
    achCD -= dt; if (achCD <= 0) { achCD = 1; checkAch(true); }
  }
  function objective() {
    if (!race) return null;
    const cp = race.C.cps[race.i];
    return { title: "RACE · " + race.C.name, text: "Checkpoint " + (race.i + 1) + "/" + race.C.cps.length + " · ⏱ " + Math.ceil(race.t) + "s", x: cp.x, z: cp.z, r: 8, event: true };
  }
  function statsRows() {
    const rows = [
      ["Level", st.lvl], ["Cash", "$" + Math.floor(st.money).toLocaleString()], ["Bank", "$" + Math.floor(st.bank || 0).toLocaleString()],
      ["Businesses", Object.keys(st.owned).length + "/6"], ["Personal cars", Object.keys(st.pcars).length + "/3"], ["Golden Palms", st.palms.length + "/12"],
      ["Gang turfs", Object.keys(st.turf || {}).length + "/3"], ["Best jump", S.bestJump ? S.bestJump.toFixed(2) + "s" : "—"],
      ...CIRCUITS.map(C => [C.name, st.races[C.id] ? st.races[C.id].toFixed(1) + "s " + ["", "🥉", "🥈", "🥇"][st.medals[C.id] || 0] : "—"]),
    ];
    return { rows, ach: ACH.map(([id, name, desc]) => ({ name, desc, got: st.ach.includes(id) })) };
  }
  return { update, objective, rampHeight, garagePanel, GARAGE, show, palms, ramps, race: () => race, statsRows, PCARS };
}
