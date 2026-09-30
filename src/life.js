// Palm City — everyday city life: fuel and gas stations, the clothing store and barber, ATMs to
// rob, stores to hold up, talking to people (some won't like it — and might swing at you), the
// beach basketball court, the arcade & bowling alley, and the first-launch tutorial.
import * as THREE from "../vendor/three.module.js";
import { HALF, blockC, blockMin, BLOCK, CURB, groundY, clamp, mulberry32 } from "./world.js";
import { PLACES } from "./places.js";
import { openArcade, closeArcade, updateArcade, arcadeOpen, initArcade } from "./arcade.js";

export const OUTFITS = [
  ["White Tee", 0xe8e6e0, 0x2a3a52], ["Street Black", 0x23262b, 0x3a3f47], ["Navy Polo", 0x1f2d4a, 0xa89a7a], ["Olive Field", 0x4a5236, 0x2a2a2c],
  ["Linen", 0xe6dcc4, 0xc9a878], ["Burgundy", 0x6a2a2a, 0x1e1e22], ["Denim Day", 0x5a7aa0, 0x2a3a52], ["Beach Shirt", 0x3a8a8a, 0xe8e4d8],
  ["Grey Hoodie", 0x6a6e72, 0x1e1e22], ["Sunset Orange", 0xc8641e, 0xe8e4da], ["Suit", 0x16181e, 0x16181e], ["Pink Linen", 0xc88a8a, 0xe8e4d8],
].map(([name, shirt, pants]) => ({ name, shirt, pants, cost: 120 }));
export const HAIR = [
  ["Short Black", 0x16100c], ["Brown", 0x4a3220], ["Blonde", 0xc49a5a], ["Ginger", 0x8a3a1c], ["Silver", 0xa8a49c], ["Buzz / Bald", 0x16100c, "bald"], ["Long Black", 0x16100c, "long"], ["Long Brown", 0x4a3220, "long"],
].map(([name, color, style]) => ({ name, color, style, cost: 80 }));
export const HATS = [["No hat"], ["Red Cap", "cap", 0xa0282a], ["Black Cap", "cap", 0x1a1a1c], ["Beanie", "beanie", 0x3a3f47], ["Fedora", "fedora", 0x4a3826], ["Top Hat", "tophat", 0x16161a]]
  .map(([name, type, color]) => ({ name, type, color, none: !type, cost: 90 }));
export const GLASSES = [["No glasses"], ["Sunglasses", "dark", 0x111114], ["Aviators", "dark", 0x2a3340], ["Gold frames", "clear", 0xc8a040]].map(([name, type, color]) => ({ name, type, color, none: !type, cost: 70 }));
export const BEARDS = [["Clean shaven"], ["Full black", "full", 0x1f1812], ["Full brown", "full", 0x4a3220], ["Goatee", "goatee", 0x241c14], ["Mustache", "mustache", 0x2a2018], ["Grey beard", "full", 0x8a847a]]
  .map(([name, type, color]) => ({ name, type, color, none: !type, cost: 60 }));

const LINES = {
  friendly: ["Hey, how's it goin'?", "Lovely day, ain't it?", "Stay outta trouble!", "Nice threads!", "Have a good one!", "Lookin' sharp today!", "Take care out there."],
  neutral: ["…do I know you?", "Busy day, huh.", "Yeah yeah, keep movin'.", "Traffic's brutal today.", "You seen my bus?", "Could go for a coffee right about now."],
  rude: ["Outta my way.", "What are you lookin' at?", "Beat it, weirdo.", "Nobody asked, pal.", "Ugh, it's YOU again.", "Take a hike, clown."],
  angry: ["Touch me again and we got PROBLEMS!", "Back OFF before I lose it!", "You got a death wish?!", "Keep talkin', see what happens!"],
  random: ["I once fought a pigeon. I lost.", "Do birds even have knees?", "I named my car. Her name's Brenda.", "Never trust a man with two phones.", "Pineapple belongs on pizza. Fight me."],
};
const pick = a => a[(Math.random() * a.length) | 0];

export function makeLife(scene, g) {
  // g: { st, P, crowd, crime, combat, cars, focus(), camera, hud, earn, toast, banner, sound, save, time(), isMobile }
  const st = g.st, r = mulberry32(0x11FE);
  st.look = st.look || {};
  initArcade({ earn: n => g.earn(n), save: g.save, state: st, buzz: () => {} });

  // ---- wardrobe ----
  function applyLook() {
    const L = g.P.ch.look;
    const o = OUTFITS[st.look.outfit ?? -1]; if (o) { L.shirt = o.shirt; L.pants = o.pants; }
    const h = HAIR[st.look.hair ?? -1]; if (h) { L.hair = h.color; L.bald = h.style === "bald"; L.long = h.style === "long"; }
    L.armCol = L.sleeveless ? L.skin : L.shirt; L.shinCol = L.shorts ? L.skin : L.pants;
    g.P.ch.recolor();
    g.P.ch.setAcc("hat", HATS[st.look.hat || 0]); g.P.ch.setAcc("glasses", GLASSES[st.look.glasses || 0]); g.P.ch.setAcc("beard", BEARDS[st.look.beard || 0]);
  }
  applyLook();
  function shopPanel(kind) {
    const lists = kind === "barber" ? [["Haircuts", HAIR, "hair"], ["Beards", BEARDS, "beard"]] : [["Outfits", OUTFITS, "outfit"], ["Hats", HATS, "hat"], ["Glasses", GLASSES, "glasses"]];
    const rows = [];
    for (const [head, list, key] of lists) list.forEach((it, i) => {
      const on = (st.look[key] ?? (key === "outfit" || key === "hair" ? -1 : 0)) === i;
      rows.push({ label: (i === 0 ? head.toUpperCase() + " · " : "") + it.name + (on ? "  ✓" : ""), sub: it.none ? "" : "$" + it.cost, btn: on ? "WEARING" : it.none ? "REMOVE" : "BUY",
        disabled: on, onClick: () => {
          if (!it.none && st.money < it.cost) { g.toast("You need $" + Math.ceil(it.cost - st.money) + " more"); return; }
          if (!it.none) st.money -= it.cost;
          st.look[key] = i; applyLook(); g.sound("cash", 0.6); g.save(); shopPanel(kind);
        } });
    });
    g.hud.panel(kind === "barber" ? "FADE CITY BARBER" : "THREADS", rows);
  }

  // ---- fuel ----
  const GAS = [PLACES.gas1, PLACES.gas2];
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 });
  for (const p of GAS) {
    // two pumps and a canopy out on the kerb in front of the station
    const cx = p.x + Math.sin(p.face) * 0.4, cz = p.z + Math.cos(p.face) * 0.4;
    for (const k of [-3, 3]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.6), pumpMat);
      m.position.set(cx + Math.cos(p.face) * k, CURB + 0.85, cz - Math.sin(p.face) * k); m.rotation.y = p.face; m.castShadow = true; scene.add(m);
    }
  }
  function fuelTick(dt) {
    const v = g.P.car; if (!v || v.kind === "heli" || v.kind === "plane" || v.kind === "boat" || v.kind === "jetski") return;
    if (v.fuel === undefined) v.fuel = 100;
    v.fuel = Math.max(0, v.fuel - v.speed * dt * 0.012);
    if (v.fuel <= 0) { v.vx *= Math.exp(-2 * dt); v.vz *= Math.exp(-2 * dt); if (!v.dryWarn) { v.dryWarn = true; g.toast("⛽ Out of gas — push it to a station or grab another ride"); } }
    else if (v.fuel < 15 && !v.lowWarn) { v.lowWarn = true; g.toast("⛽ Low fuel — PALM FUEL is on the map"); }
    for (const p of GAS) if ((v.x - p.x) ** 2 + (v.z - p.z) ** 2 < 100 && v.fuel < 99 && v.speed < 2) {
      const need = 100 - v.fuel, cost = Math.ceil(need * 0.8);
      if (st.money >= cost) { st.money -= cost; v.fuel = 100; v.dryWarn = v.lowWarn = false; g.toast("⛽ Filled up · $" + cost); g.sound("cash", 0.5); }
    }
  }

  // ---- ATMs (rob them) ----
  const ATMS = [[4, 9, "E"], [8, 5, "W"], [11, 10, "N"], [2, 3, "E"], [6, 12, "N"], [12, 4, "W"]].map(([i, j, s]) => {
    const x0 = blockMin(i), z0 = blockMin(j), c = BLOCK / 2, off = 12;
    const P = s === "E" ? { x: x0 + BLOCK - 4.6, z: z0 + c + off, face: Math.PI / 2 } : s === "W" ? { x: x0 + 4.6, z: z0 + c + off, face: -Math.PI / 2 } : { x: x0 + c + off, z: z0 + 4.6, face: Math.PI };
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.4, metalness: 0.5 }));
    m.position.set(P.x - Math.sin(P.face) * 0.3, CURB + 0.9, P.z - Math.cos(P.face) * 0.3); m.rotation.y = P.face; m.castShadow = true; scene.add(m);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0x5fc8ff, toneMapped: false }));
    scr.position.set(0, 0.35, 0.31); m.add(scr);
    return { ...P, cd: 0 };
  });
  // ---- holdups at these stores (needs a gun out) ----
  const STORES = ["pizza", "prints", "burger", "wash", "taxi"].map(k => ({ k, p: PLACES[k], cd: 0 }));

  // ---- basketball court on the beach ----
  const court = { x: blockC(5), z: HALF + 26 };
  {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 15), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(court.x, 0.04, court.z); floor.receiveShadow = true; scene.add(floor);
    const line = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff })); line.rotation.x = -Math.PI / 2; line.position.set(court.x, 0.05, court.z); scene.add(line);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x555555 })); pole.position.set(court.x + s * 14.5, 1.7, court.z); scene.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 1.8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 })); board.position.set(court.x + s * 14.2, 3.45, court.z); scene.add(board);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 20), new THREE.MeshStandardMaterial({ color: 0xff5a1e })); rim.rotation.x = Math.PI / 2; rim.position.set(court.x + s * 13.8, 3.05, court.z); scene.add(rim);
    }
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8641e, roughness: 0.8 }));
  ball.visible = false; ball.castShadow = true; scene.add(ball);
  let shot = null; const hoops = { made: 0, tried: 0 };

  // ---- talking ----
  const bubble = document.createElement("div"); bubble.id = "bubble"; document.getElementById("ui").appendChild(bubble);
  let talk = null;
  const _v = new THREE.Vector3();
  function nearestPed(maxD) { return g.crowd.nearest(g.P.x, g.P.z, maxD, p => !p.gang && !p.ally); }
  function speak(p) {
    if (p.mood === undefined) p.mood = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2;
    p.anger = p.anger || 0;
    if (p.mood === 2) p.anger++;
    const line = p.anger >= 2 ? pick(LINES.angry) : p.mood === 0 ? pick([...LINES.friendly, ...LINES.random]) : p.mood === 2 ? pick(LINES.rude) : pick([...LINES.neutral, ...LINES.random]);
    talk = { p, line, t: 3.2 };
    p.pause = 3; p.yaw = Math.atan2(g.P.x - p.x, g.P.z - p.z);
    g.sound("blip", 0.35);
    if (p.anger >= 2 && r() < 0.6) fightBack(p);
  }
  // an angry pedestrian squares up and swings at you until one of you goes down
  function fightBack(p) {
    const old = p.ai;
    p.fightT = 14; p.hp = p.hp || 45;
    p.ai = (q, dt) => {
      q.fightT -= dt;
      if (q.fightT <= 0) { q.ai = old; q.anger = 0; q.hp = undefined; if (!q.beach) g.crowd.snapToRing(q); return; }
      const dx = g.P.x - q.x, dz = g.P.z - q.z, d = Math.hypot(dx, dz) || 1;
      q.yaw = Math.atan2(dx, dz);
      if (d > 1.1) { q.x += dx / d * 3.2 * dt; q.z += dz / d * 3.2 * dt; q.amt = 1.5; }
      else { q.amt = 0; q.swing = (q.swing || 0) - dt; if (q.swing <= 0 && !g.P.car) { q.swing = 0.9 + r() * 0.5; g.crime.hurt(6); g.sound("door", 0.4, 1.6); } }
      q.phase += dt * 3;
    };
  }

  // ---- tutorial ----
  const tutKey = "palmcity_tut";
  function tutorial() {
    let seen = false; try { seen = localStorage.getItem(tutKey) === "1"; } catch (e) {}
    if (seen) return;
    const pages = g.isMobile ? [
      ["🕹️", "Move & drive", "Drag the LEFT side of the screen to walk or steer. Drag the right side to look around."],
      ["🎯", "Make your name", "Follow the yellow beacon for story jobs. Walk up to $ businesses to buy them — they pay you."],
      ["📱", "Your phone", "Tap 📱 for bank, stocks, heists and jobs. ☰ has the map. Get stars? Break line of sight and hide."],
    ] : [
      ["⌨️", "Move & drive", "WASD / arrows · Shift runs & boosts · Space jumps & drifts · E gets in cars · drag the mouse to look."],
      ["🎯", "Make your name", "Follow the yellow beacon for story jobs. Walk up to $ businesses and press E to buy them."],
      ["📱", "Your phone", "P opens the phone, M the map. F punches / shoots, Q switches weapon. Get stars? Break line of sight."],
    ];
    let i = 0;
    const show = () => g.hud.panel("HOW TO PLAY  " + (i + 1) + "/3", [{ label: pages[i][0] + "  " + pages[i][1], sub: pages[i][2], btn: i < 2 ? "NEXT" : "LET'S GO", onClick: () => { i++; if (i < 3) show(); else { g.hud.closePanel(); try { localStorage.setItem(tutKey, "1"); } catch (e) {} } } }]);
    show();
  }

  function near(p, rad = 3.2) { return (g.P.x - p.x) ** 2 + (g.P.z - p.z) ** 2 < rad * rad; }
  // what E / the action button does on foot here (label + handler), or null
  function action() {
    if (g.P.car) return null;
    if (near(PLACES.clothes)) return ["CLOTHES", "<b>THREADS</b> · outfits, hats & glasses", () => shopPanel("clothes")];
    if (near(PLACES.barber)) return ["BARBER", "<b>FADE CITY</b> · haircuts & beards", () => shopPanel("barber")];
    if (near(PLACES.arcade)) return ["PLAY", "<b>PALM BOWL</b> · bowling & arcade", () => g.hud.panel("PALM BOWL", [
      { label: "🎳 Bowling", sub: "5 frames · pays per pin", btn: "PLAY", onClick: () => { g.hud.closePanel(); openArcade("bowl"); } },
      { label: "🐛 Bug Smash", sub: "25 seconds · tap the bugs", btn: "PLAY", onClick: () => { g.hud.closePanel(); openArcade("smash"); } },
      { label: "🎰 Lucky Spin", sub: "$25 a spin", btn: "PLAY", onClick: () => { g.hud.closePanel(); openArcade("spin"); } },
      { label: "⚡ Quick Reflex", sub: "5 rounds · the faster, the richer", btn: "PLAY", onClick: () => { g.hud.closePanel(); openArcade("reflex"); } },
    ])];
    for (const a of ATMS) if (near(a, 2.2)) return a.cd > 0 ? null : ["ROB ATM", "💳 ATM · smash it open (it's a crime)", () => {
      a.cd = 120; const got = g.earn(200 + Math.floor(r() * 400)); g.crime.addCrime(2); g.toast("💳 ATM cracked · +$" + got); g.sound("cash", 0.8); g.shake(0.3); g.save();
    }];
    const armed = g.combat.current().id !== "fists";
    for (const s of STORES) if (near(s.p, 3.5) && armed && s.cd <= 0) return ["HOLD UP", "🔫 Hold up <b>the store</b> — they'll call the cops", () => {
      s.cd = 180; const got = g.earn(600 + Math.floor(r() * 700)); g.crime.addCrime(3); g.crowd.scare(s.p.x, s.p.z, 30, 8);
      g.banner("STORE ROBBED", "+$" + got.toLocaleString() + " · now get away", "", 2.4); g.sound("cash", 1); g.save();
    }];
    if (Math.abs(g.P.x - court.x) < 14 && Math.abs(g.P.z - court.z) < 8 && !shot) return ["SHOOT", "🏀 Beach court · " + hoops.made + "/" + hoops.tried, () => shoot()];
    const ped = nearestPed(2.2);
    if (ped) return ["TALK", "", () => speak(ped)];
    return null;
  }
  function shoot() {
    const side = g.P.x > court.x ? 1 : -1, hx = court.x + side * 13.8, hz = court.z, hy = 3.05;
    const d = Math.hypot(hx - g.P.x, hz - g.P.z);
    const make = r() < clamp(0.9 - d * 0.045, 0.12, 0.85);
    shot = { t: 0, dur: 0.6 + d * 0.035, x0: g.P.x, y0: (g.P.y || 0) + 2, z0: g.P.z, x1: hx + (make ? 0 : (r() - 0.5) * 1.2), y1: hy, z1: hz + (make ? 0 : (r() - 0.5) * 1.2), make, h: 2 + d * 0.25 };
    g.P.yaw = Math.atan2(hx - g.P.x, hz - g.P.z); hoops.tried++;
  }
  function update(dt) {
    fuelTick(dt);
    for (const a of ATMS) if (a.cd > 0) a.cd -= dt;
    for (const s of STORES) if (s.cd > 0) s.cd -= dt;
    if (arcadeOpen) updateArcade(dt);
    if (shot) {
      shot.t += dt; const u = Math.min(1, shot.t / shot.dur);
      ball.visible = true;
      ball.position.set(shot.x0 + (shot.x1 - shot.x0) * u, shot.y0 + (shot.y1 - shot.y0) * u + Math.sin(u * Math.PI) * shot.h, shot.z0 + (shot.z1 - shot.z0) * u);
      if (u >= 1) {
        if (shot.make) { hoops.made++; const got = g.earn(40); g.toast("🏀 Swish! +$" + got + " · " + hoops.made + "/" + hoops.tried, 1.4); g.sound("cash", 0.6); }
        else { g.toast("🏀 Clank · " + hoops.made + "/" + hoops.tried, 1.2); g.sound("door", 0.3, 1.4); }
        shot = null; ball.visible = false;
      }
    }
    // speech bubble follows the speaker's head on screen
    if (talk) {
      talk.t -= dt;
      _v.set(talk.p.x, (talk.p.y || 0) + 2.2, talk.p.z).project(g.camera);
      const on = talk.t > 0 && _v.z < 1;
      bubble.style.display = on ? "block" : "none";
      if (on) { bubble.textContent = talk.line; bubble.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + "px"; bubble.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + "px"; bubble.className = talk.p.anger >= 2 ? "angry" : ""; }
      if (talk.t <= 0) talk = null;
    }
  }
  return { update, action, applyLook, tutorial, arcadeOpen: () => arcadeOpen, closeArcade, court, ATMS, fuelOf: v => v && v.fuel };
}
