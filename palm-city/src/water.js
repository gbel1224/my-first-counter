// Palm City — the sea and the sky: a marina pier with a speedboat and jet skis, a beach helipad,
// a runway on the west edge of town, motorbikes, a hidden jetpack, swimming, sharks that hunt you
// in deep water, fishing from a stopped boat, and sunken treasure to dive for.
import * as THREE from "../vendor/three.module.js";
import { HALF, CURB, clamp, groundY, blockC, mulberry32 } from "./world.js";
import { SEA_Y } from "./ocean.js";
import { buildCraft, CRAFT_SPEC, inWater } from "./craft.js";
import { syncCar } from "./play.js";
import { PLACES } from "./places.js";

export const FISH = [["Mackerel", 18, 40], ["Snapper", 45, 26], ["Mahi-mahi", 90, 16], ["Tarpon", 160, 10], ["Swordfish", 240, 6], ["Golden Koi", 350, 2]];

export function makeWater(scene, g) {
  // g: { st, cars, focus(), player, crime, fx, toast, banner, sound, earn, save, time() }
  const st = g.st;
  st.treasure = st.treasure || [];
  const r = mulberry32(0x5EA5);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

  // ---- the marina pier ----
  const mx = PLACES.marina.x;
  mk(new THREE.BoxGeometry(4, 0.3, 52), wood, mx, 0.35, HALF + 50);
  for (let z = HALF + 28; z < HALF + 76; z += 6) for (const dx of [-1.8, 1.8]) mk(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), wood, mx + dx, -0.6, z);
  // ---- helipad on the sand ----
  const hp = { x: -HALF + 70, z: HALF + 22 };
  mk(new THREE.CylinderGeometry(7, 7, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.8 }), hp.x, 0.06, hp.z);
  const hTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); x.strokeStyle = "#f2d020"; x.lineWidth = 14; x.beginPath(); x.arc(128, 128, 110, 0, 6.3); x.stroke(); x.fillStyle = "#fff"; x.font = "900 150px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("H", 128, 136); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const hMark = new THREE.Mesh(new THREE.CircleGeometry(6.5, 32), new THREE.MeshStandardMaterial({ map: hTex, transparent: true, roughness: 0.8 }));
  hMark.rotation.x = -Math.PI / 2; hMark.position.set(hp.x, 0.13, hp.z); scene.add(hMark);
  // ---- runway west of town ----
  const rw = { x0: -HALF - 360, x1: -HALF - 40, z: 60 };
  const rTex = (() => { const c = document.createElement("canvas"); c.width = 1024; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#2a2a2c"; x.fillRect(0, 0, 1024, 64); x.fillStyle = "#e8e8e0"; for (let i = 0; i < 1024; i += 48) x.fillRect(i, 29, 26, 6); x.fillRect(0, 2, 1024, 3); x.fillRect(0, 59, 1024, 3); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(rw.x1 - rw.x0, 26), new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.85 }));
  strip.rotation.x = -Math.PI / 2; strip.position.set((rw.x0 + rw.x1) / 2, 0.03, rw.z); strip.receiveShadow = true; scene.add(strip);
  mk(new THREE.BoxGeometry(18, 7, 12), new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.8 }), rw.x1 + 8, 3.5, rw.z - 30);   // hangar

  // ---- vehicles ----
  const spawn = (kind, color, x, z, h) => {
    const C = buildCraft(kind, color);
    scene.add(C.group);
    const v = { ...C, kind, x, z, h, vx: 0, vz: 0, y: kind === "boat" || kind === "jetski" ? SEA_Y : groundY(x, z), steer: 0, yawRate: 0, speed: 0,
      spec: { ...CRAFT_SPEC[kind], ...(kind === "bike" ? { cabin: [[0, 1], [0, 1.2], [0, 1.2], [0, 1]] } : {}) } };
    syncCar(v); g.cars.push(v); return v;
  };
  spawn("boat", 0xe8e8e6, mx + 6, HALF + 70, Math.PI);
  spawn("jetski", 0xd81e2a, mx - 5, HALF + 64, Math.PI);
  spawn("jetski", 0x1e6fd8, mx - 8, HALF + 64, Math.PI);
  spawn("heli", 0x1f3a6a, hp.x, hp.z, Math.PI / 2);
  spawn("plane", 0xf2f2ee, rw.x1 - 20, rw.z, -Math.PI / 2);
  spawn("bike", 0x1a1a1a, blockC(6) + 8, blockC(9) + 24, -Math.PI / 2);
  spawn("bike", 0xb81e1e, blockC(9) + 20, HALF + 12, Math.PI / 2);

  // ---- the jetpack: hidden on the roof... of the beach hangar? no — on the far east sand ----
  const jpSpot = { x: HALF - 40, z: HALF + 30 };
  const jp = mk(new THREE.BoxGeometry(0.7, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.3, emissive: 0x442200 }), jpSpot.x, 1.2, jpSpot.z);
  jp.visible = !st.jetpack;

  // ---- sharks ----
  const sharkMat = new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.5 });
  const sharks = [0, 1, 2].map(k => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3.2, 6, 12), sharkMat); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.8); grp.add(body);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 4), sharkMat); fin.position.set(0, 0.8, 0.2); fin.scale.set(0.35, 1, 1.2); grp.add(fin);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 4), sharkMat); tail.position.set(0, 0.1, -2.4); tail.rotation.x = -Math.PI / 2; tail.scale.set(0.2, 1, 1); grp.add(tail);
    scene.add(grp);
    return { grp, x: -200 + k * 250, z: HALF + 160 + k * 40, h: r() * 6.28, bite: 0 };
  });
  // ---- treasure ----
  const TREASURE = [[-320, 150], [-90, 210], [140, 170], [330, 240], [-420, 280], [40, 320]].map(([x, dz]) => ({ x, z: HALF + dz }));
  const glint = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tMarks = TREASURE.map((t, i) => { const m = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), glint); m.rotation.x = -Math.PI / 2; m.position.set(t.x, SEA_Y + 0.15, t.z); m.visible = !st.treasure.includes(i); scene.add(m); return m; });

  // ---- fishing ----
  const bob = mk(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0x551000 }), 0, -99, 0);
  let fish = null;
  let warnedDeep = false;

  function playerSwimming() { const P = g.player(); return !P.car && inWater(P.x, P.z); }
  function action(P) {
    // what the action button does out here (returns a label or null)
    const v = P.car;
    if (v && (v.kind === "boat" || v.kind === "jetski") && v.speed < 1.5) return fish ? (fish.bite ? "REEL" : "…") : "CAST";
    if (!v && inWater(P.x, P.z)) for (let i = 0; i < TREASURE.length; i++) if (!st.treasure.includes(i) && (P.x - TREASURE[i].x) ** 2 + (P.z - TREASURE[i].z) ** 2 < 9) return "DIVE";
    return null;
  }
  function doAction(P) {
    const a = action(P);
    if (a === "CAST") { const v = P.car; fish = { t: 0, wait: 3 + r() * 5, x: v.x + Math.sin(v.h + 1.2) * 5, z: v.z + Math.cos(v.h + 1.2) * 5, bite: false }; g.sound("blip", 0.5); return true; }
    if (a === "REEL") {
      let roll = r() * FISH.reduce((s, f) => s + f[2], 0), pick = FISH[0];
      for (const f of FISH) { roll -= f[2]; if (roll <= 0) { pick = f; break; } }
      const got = g.earn(pick[1]); g.toast("🎣 " + pick[0] + "!  +$" + got); g.sound("cash", 0.8); fish = null; bob.position.y = -99; g.save(); return true;
    }
    if (a === "…") { g.toast("🎣 Too early — it got away"); fish = null; bob.position.y = -99; return true; }
    if (a === "DIVE") {
      const i = TREASURE.findIndex((t, k) => !st.treasure.includes(k) && (P.x - t.x) ** 2 + (P.z - t.z) ** 2 < 9);
      st.treasure.push(i); tMarks[i].visible = false;
      const got = g.earn(250 + Math.floor(r() * 550));
      g.banner("SUNKEN TREASURE", "+$" + got.toLocaleString() + " · " + st.treasure.length + "/6 found", "", 2.6); g.sound("jingle", 0.8);
      for (let k = 0; k < 16; k++) g.fx.dust(P.x, SEA_Y, P.z, 1);
      g.save(); return true;
    }
    return false;
  }
  function update(dt) {
    const t = g.time(), P = g.player(), F = g.focus();
    // jetpack pickup
    if (jp.visible) { jp.rotation.y += dt * 1.5; jp.position.y = 1.2 + Math.sin(t * 2) * 0.2; if (!P.car && (P.x - jpSpot.x) ** 2 + (P.z - jpSpot.z) ** 2 < 4) { jp.visible = false; st.jetpack = true; g.banner("JETPACK", "Hold RUN / Shift in the air to fly", "SECRET FOUND", 3.4); g.sound("jingle", 1); g.save(); } }
    // treasure shimmer
    for (const m of tMarks) if (m.visible) { m.material.opacity = 0.35 + Math.sin(t * 3) * 0.25; m.rotation.z = t * 0.4; }
    // fishing
    if (fish) {
      const v = P.car;
      if (!v || v.speed > 2) { fish = null; bob.position.y = -99; }
      else {
        fish.t += dt; bob.position.set(fish.x, SEA_Y + 0.1 + Math.sin(t * 3) * 0.05 - (fish.bite ? 0.25 + Math.sin(t * 20) * 0.1 : 0), fish.z);
        if (!fish.bite && fish.t > fish.wait) { fish.bite = true; fish.biteT = 1.4; g.toast("❗ Something's biting — REEL!", 1.4); g.sound("blip", 1); }
        if (fish.bite) { fish.biteT -= dt; if (fish.biteT <= 0) { g.toast("🎣 It got away"); fish = null; bob.position.y = -99; } }
      }
    }
    // sharks patrol deep water; a swimmer out there gets hunted
    const swimmer = playerSwimming();
    const deep = swimmer && P.z > HALF + 110;
    if (deep && !warnedDeep) { warnedDeep = true; g.toast("🦈 Deep water — sharks out here. Head back to the shallows!", 3); }
    if (!swimmer) warnedDeep = false;
    for (const s of sharks) {
      let tx, tz, sp = 4;
      const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz);
      if (deep && d < 60) { tx = P.x; tz = P.z; sp = 7.5; }
      else { if (!s.tx || (s.tx - s.x) ** 2 + (s.tz - s.z) ** 2 < 100) { s.tx = clamp(s.x + (r() - 0.5) * 160, -HALF, HALF); s.tz = HALF + 130 + r() * 220; } tx = s.tx; tz = s.tz; }
      let dh = Math.atan2(tx - s.x, tz - s.z) - s.h; while (dh > Math.PI) dh -= 6.283; while (dh < -Math.PI) dh += 6.283;
      s.h += clamp(dh, -1.2 * dt, 1.2 * dt);
      s.x += Math.sin(s.h) * sp * dt; s.z += Math.cos(s.h) * sp * dt; s.z = Math.max(HALF + 100, s.z);
      s.grp.position.set(s.x, SEA_Y - 0.55 + Math.sin(t * 2 + s.x) * 0.05, s.z); s.grp.rotation.set(0, s.h, Math.sin(t * 3) * 0.08);
      s.bite -= dt;
      if (deep && d < 2.5 && s.bite <= 0) { s.bite = 1.6; g.crime.hurt(24); g.sound("door", 0.8, 0.6); g.fx.dust(P.x, SEA_Y + 0.3, P.z, 8); g.toast("🦈 BITTEN!", 1); }
    }
  }
  return { update, action, doAction, swimming: playerSwimming, hp, rw, TREASURE, sharks, jpSpot };
}
