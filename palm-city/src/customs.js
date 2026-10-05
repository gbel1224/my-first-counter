// Palm City — Palm Customs and your garages. Pull any car into the shop and make it yours:
// paint and finish (gloss, metallic, matte, chrome), window tint, a lowered stance, neon under the
// sills, and the go-faster parts — engine, turbo, brakes, handling, armour. Then park it at one of
// your homes and it's kept, mods and all; walk up to the garage door and take any of them out again.
import * as THREE from "../vendor/three.module.js";
import { PLACES } from "./places.js";
import { PROPS } from "./economy.js";
import { carSpec } from "./cars.js";

export const PAINT_SET = [
  ["Arctic White", 0xf2f2f0], ["Gunmetal", 0x3a3e44], ["Jet Black", 0x0e0f11], ["Silver", 0xb8bcc0],
  ["Candy Red", 0xb0101c], ["Sunset Orange", 0xe0561a], ["Taxi Yellow", 0xf2c200], ["Lime", 0x7ac224],
  ["Racing Green", 0x10452a], ["Ocean Blue", 0x1550a8], ["Midnight Blue", 0x101c3c], ["Purple Haze", 0x5a2a8a],
  ["Hot Pink", 0xe03a8a], ["Teal", 0x0f8a8a], ["Champagne", 0xcbb894], ["Matte Olive", 0x4a5236],
];
const FINISH = [
  ["Gloss", { roughness: 0.26, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.02 }],
  ["Metallic", { roughness: 0.32, metalness: 0.78, clearcoat: 1, clearcoatRoughness: 0.05 }],
  ["Matte", { roughness: 0.78, metalness: 0.1, clearcoat: 0, clearcoatRoughness: 1 }],
  ["Chrome", { roughness: 0.06, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.0 }],
];
const NEON = [["Off", null], ["Ice Blue", 0x40c8ff], ["Hot Pink", 0xff3aa8], ["Lime", 0x7aff3a], ["Purple", 0xa040ff], ["Red", 0xff2a2a], ["Gold", 0xffc030]];
const TINT = [["Clear", 0], ["Light", 1], ["Dark", 2], ["Limo", 3]];
// performance parts: [key, label, what it does, price of level 1..3]
const PERF = [
  ["engine", "Engine", "top speed", [1500, 3500, 7000]],
  ["turbo", "Turbo", "acceleration", [2000, 4500, 9000]],
  ["brakes", "Brakes", "stopping power", [800, 1800, 3500]],
  ["handling", "Suspension & tyres", "grip and turn-in", [1200, 2800, 5500]],
  ["armor", "Armour", "takes less damage", [2500, 6000, 12000]],
];
const SLOTS = { apartment: 2, condo: 3, house: 4, bungalow: 2, villa: 4, penthouse: 5 };
export const SPRAY_PER_STAR = 250;
export const freshMods = () => ({ paint: null, finish: 0, tint: 0, lower: 0, neon: 0, engine: 0, turbo: 0, brakes: 0, handling: 0, armor: 0 });

// a soft glow under the car: a radial gradient on a plane, additive
let neonTex = null;
function neonTexture() {
  if (neonTex) return neonTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  neonTex = new THREE.CanvasTexture(c);
  return neonTex;
}

// put a car's mods on it: looks (paint, finish, glass, stance, neon) and the numbers
export function applyCarMods(v) {
  const m = v.mods; if (!m || !v.chassis) return;
  const base = v.baseSpec || (v.baseSpec = v.spec);
  if (m.paint !== null && m.paint !== undefined) { v.body.material.color.set(m.paint); v.color = m.paint; }
  Object.assign(v.body.material, FINISH[m.finish || 0][1]);
  if (m.finish === 3) v.body.material.color.lerp(new THREE.Color(0xdde2e6), 0.55);       // chrome: the colour becomes a tint on the mirror
  // window tint: this car's own glass
  v.chassis.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.transmission && !(o.material.opacity < 0.95 && o.material.transparent)) return;
    if (!o.userData.ownGlass) { const b = o.material, c = b.clone(); c.onBeforeCompile = b.onBeforeCompile; c.customProgramCacheKey = b.customProgramCacheKey; o.material = c; o.userData.ownGlass = { color: b.color.clone(), opacity: b.opacity }; }
    const t = m.tint || 0, G = o.userData.ownGlass;
    o.material.color.copy(G.color).multiplyScalar(1 - t * 0.22); o.material.opacity = Math.min(0.97, G.opacity + t * 0.12);
  });
  v.lowered = m.lower || 0;
  // neon
  const col = NEON[m.neon || 0][1];
  if (col !== null && col !== undefined) {
    if (!v.neon) {
      const S = v.spec;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry((S.wid || 1.9) + 1.6, (S.len || 4.6) + 1.4), new THREE.MeshBasicMaterial({ map: neonTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.04; mesh.renderOrder = 3;
      v.group.add(mesh); v.neon = mesh;
    }
    v.neon.visible = true; v.neon.material.color.set(col).multiplyScalar(2.2);
  } else if (v.neon) v.neon.visible = false;
  // performance
  v.spec = { ...base, top: base.top * (1 + 0.07 * m.engine), accel: base.accel * (1 + 0.13 * m.turbo), grip: base.grip * (1 + 0.07 * m.handling + 0.03 * v.lowered),
    turn: base.turn * (1 + 0.04 * m.handling), brakeMod: 1 + 0.18 * m.brakes, rollMod: 1 - 0.12 * v.lowered - 0.08 * m.handling };
  v.armor = m.armor || 0;
}

export function makeCustoms(scene, g) {
  // g: { st, toast, banner, sound, save, panel(title, rows), closePanel(), spawn(type, color, x, z, h), player(), repair(car), cars }
  const st = g.st;
  if (!st.garage) st.garage = {};                     // homeId -> [{ type, color, mods }]
  if (!st.cmods) st.cmods = {};                       // the showroom cars' mods (they live at the City Garage)
  const shop = PLACES.customs;
  const bay = { x: shop.x + Math.sin(shop.face) * 5.5, z: shop.z + Math.cos(shop.face) * 5.5 };
  const atShop = c => c && !c.kind && (c.x - bay.x) ** 2 + (c.z - bay.z) ** 2 < 9 * 9 && Math.abs(c.speed || 0) < 1.5;

  function keep(v) {                                   // a showroom car remembers its mods by itself
    if (v.personal) { st.cmods[v.personal.id] = v.mods; g.save(); }
  }
  function charge(cost) {
    if (st.money < cost) { g.toast("You need $" + Math.ceil(cost - st.money).toLocaleString() + " more"); g.sound("door", 0.3); return false; }
    st.money -= cost; g.sound("cash", 0.6); return true;
  }
  // Pay 'n' Spray: wanted, you pull in where they can't see you, the shutter comes down, and you roll
  // out in a new colour with every panel fixed and no stars. If they watched you go in, it's no use.
  function spray(v) {
    const w = g.wanted();
    if (g.copsSee && g.copsSee()) { g.toast("🚨 They saw you pull in — lose them first!", 2.6); g.sound("door", 0.4); return false; }
    if (!charge(SPRAY_PER_STAR * w)) return false;
    if (!v.mods) v.mods = freshMods();
    const cur = v.mods.paint ?? v.color, pool = PAINT_SET.filter(([, c]) => c !== cur);
    v.mods.paint = pool[(Math.random() * pool.length) | 0][1];
    if (g.repair) g.repair(v);
    applyCarMods(v); keep(v);
    if (g.curtain) g.curtain("🎨 PAY 'N' SPRAY", PAINT_SET.find(([, c]) => c === v.mods.paint)[0] + " · all fixed up");
    g.clearHeat();
    g.sound("blip", 0.7);
    setTimeout(() => g.toast("🎨 Fresh paint — the cops have lost you", 3), 1500);
    g.save(); return true;
  }
  const TABS = ["Paint", "Finish", "Neon", "Tint", "Stance", "Performance", "Repair"];
  function open(v, tab = "Paint") {
    if (!v.mods) v.mods = freshMods();
    const m = v.mods, rows = [];
    rows.push({ label: "PALM CUSTOMS · " + (v.type || "car").toUpperCase(), sub: TABS.map(t => (t === tab ? "▸ " : "") + t).join(" · "), btn: "NEXT ▸", onClick: () => open(v, TABS[(TABS.indexOf(tab) + 1) % TABS.length]) });
    const set = (k, val, cost) => { if (cost && !charge(cost)) return; m[k] = val; applyCarMods(v); keep(v); open(v, tab); };
    if (tab === "Paint") PAINT_SET.forEach(([n, hex]) => rows.push({ label: n + (m.paint === hex ? "  ✓" : ""), sub: "$400 · respray", btn: m.paint === hex ? "ON" : "PAINT", disabled: m.paint === hex, onClick: () => set("paint", hex, 400) }));
    if (tab === "Finish") FINISH.forEach(([n], i) => rows.push({ label: n + (m.finish === i ? "  ✓" : ""), sub: i === 3 ? "$5,000" : i ? "$900" : "Factory", btn: m.finish === i ? "ON" : "APPLY", disabled: m.finish === i, onClick: () => set("finish", i, i === 3 ? 5000 : i ? 900 : 0) }));
    if (tab === "Neon") NEON.forEach(([n], i) => rows.push({ label: n + (m.neon === i ? "  ✓" : ""), sub: i ? "$1,200 · glows at night" : "No underglow", btn: m.neon === i ? "ON" : i ? "FIT" : "REMOVE", disabled: m.neon === i, onClick: () => set("neon", i, i ? 1200 : 0) }));
    if (tab === "Tint") TINT.forEach(([n], i) => rows.push({ label: n + (m.tint === i ? "  ✓" : ""), sub: i ? "$" + (300 * i) : "Factory glass", btn: m.tint === i ? "ON" : "APPLY", disabled: m.tint === i, onClick: () => set("tint", i, 300 * i) }));
    if (tab === "Stance") ["Stock", "Lowered", "Slammed"].forEach((n, i) => rows.push({ label: n + (m.lower === i ? "  ✓" : ""), sub: i ? "$" + (i * 900) + " · a little more grip" : "Factory ride height", btn: m.lower === i ? "ON" : "SET", disabled: m.lower === i, onClick: () => set("lower", i, i * 900) }));
    if (tab === "Performance") for (const [k, label, what, prices] of PERF) {
      const lv = m[k] || 0;
      rows.push({ label: label + " " + "●".repeat(lv) + "○".repeat(3 - lv), sub: "+" + what, btn: lv >= 3 ? "MAX" : "$" + prices[lv].toLocaleString(), disabled: lv >= 3, onClick: () => set(k, lv + 1, prices[lv]) });
    }
    if (tab === "Repair") {
      const hurt = (v.hp !== undefined && v.hp < 100) || v.flat || v.dmg;
      rows.push({ label: hurt ? "Fix everything" : "Nothing to fix", sub: "Panels, glass, tyres", btn: hurt ? "$250" : "OK", disabled: !hurt, onClick: () => { if (!charge(250)) return; g.repair(v); applyCarMods(v); open(v, tab); } });
    }
    g.panel("PALM CUSTOMS", rows);
  }

  // ---- garages at your homes ----
  const homes = () => PROPS.filter(pr => st[pr.flag]);
  const doorOf = pr => { const p = pr.p, tx = Math.cos(p.face), tz = -Math.sin(p.face); return { x: p.x + tx * 4.5, z: p.z + tz * 4.5, curbX: p.x + Math.sin(p.face) * 6 + tx * 4.5, curbZ: p.z + Math.cos(p.face) * 6 + tz * 4.5, h: p.face + Math.PI / 2 }; };
  // a car pulled up at the kerb right outside one of your garage doors
  function homeNear(x, z, r) { for (const pr of homes()) { const d = doorOf(pr); if ((x - d.curbX) ** 2 + (z - d.curbZ) ** 2 < r * r) return pr; } return null; }
  function store(v) {
    const pr = homeNear(v.x, v.z, 5); if (!pr) return false;
    const list = st.garage[pr.id] || (st.garage[pr.id] = []), cap = SLOTS[pr.id] || 2;
    if (v.personal) { g.toast("Your " + v.personal.name + " lives at the City Garage"); return false; }
    if (list.length >= cap) { g.toast("🅿 The " + pr.label + " garage is full (" + cap + " cars)"); return false; }
    list.push({ type: v.type, color: v.color, mods: v.mods || freshMods() });
    g.save(); g.sound("door", 0.7);
    g.banner("CAR STORED", "Parked at your " + pr.label + " · " + list.length + "/" + cap, "", 2.4);
    return pr;
  }
  function garagePanel(pr) {
    const list = st.garage[pr.id] || [], cap = SLOTS[pr.id] || 2, rows = [];
    rows.push({ label: pr.label.toUpperCase() + " GARAGE", sub: list.length + "/" + cap + " spaces · drive a car up here to park it", btn: "", disabled: true });
    list.forEach((c, i) => {
      const pn = (PAINT_SET.find(p => p[1] === c.color) || ["Custom"])[0];
      const perf = (c.mods.engine || 0) + (c.mods.turbo || 0) + (c.mods.handling || 0) + (c.mods.brakes || 0) + (c.mods.armor || 0);
      rows.push({ label: pn + " " + c.type, sub: (perf ? "Upgrades " + "●".repeat(Math.min(15, perf)) : "Stock") + (c.mods.neon ? " · neon" : ""), btn: "TAKE OUT",
        onClick: () => {
          const d = doorOf(pr), v = g.spawn(c.type, c.color, d.curbX, d.curbZ, d.h);
          v.mods = c.mods; applyCarMods(v); list.splice(i, 1); g.save(); g.closePanel(); g.sound("door", 0.6);
          g.toast("🚗 Your " + c.type + " is out front", 2.5);
        } });
    });
    if (!list.length) rows.push({ label: "Empty", sub: "Drive any car here and press STORE", btn: "", disabled: true });
    g.panel("GARAGE", rows);
  }
  // showroom cars get their mods back on load
  if (g.cars) for (const v of g.cars) if (v.personal && st.cmods[v.personal.id]) { v.mods = st.cmods[v.personal.id]; applyCarMods(v); }
  return {
    bay, atShop, open, spray,
    // in a car: what the action button does here (null = nothing special)
    carAction(v) {
      if (!v || v.kind) return null;
      if (atShop(v) && g.wanted && g.wanted() > 0) return ["SPRAY", "🎨 <b>PAY 'N' SPRAY</b> · new paint, lose the cops · $" + (SPRAY_PER_STAR * g.wanted()).toLocaleString(), () => spray(v)];
      if (atShop(v)) return ["MODS", "<b>PALM CUSTOMS</b> · paint, neon, tint, performance", () => open(v)];
      if (Math.abs(v.speed || 0) < 1.5 && homeNear(v.x, v.z, 5)) return ["STORE", "🅿 Park this car in your garage", () => store(v)];
      return null;
    },
    // on foot: the garage door at a home
    footAction(x, z) {
      for (const pr of homes()) { const d = doorOf(pr); if ((x - d.x) ** 2 + (z - d.z) ** 2 < 2.2 * 2.2) return ["GARAGE", "🅿 Your <b>" + pr.label + "</b> garage · " + ((st.garage[pr.id] || []).length) + " cars", () => garagePanel(pr)]; }
      return null;
    },
    store,
  };
}
