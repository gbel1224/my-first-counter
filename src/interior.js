// Palm City — interiors. Homes you own and the businesses and landmarks around town are real
// multi-room buildings: walls with doorways, arches and hatches, a floor, ceiling lights and furniture
// per room (built from layouts.js with the furniture kit), people going about their business, and
// a camera that cuts to a corner of whichever room you walk into. Your home is decorated from your
// saved decor choices. Buildings are staged just outside town, past the fog; the street keeps
// ticking around the front door while you're in.
import * as THREE from "../vendor/three.module.js";
import { HALF, clamp } from "./world.js";
import { makeCharacter, randomLook } from "./people.js";
import { PLACES } from "./places.js";
import { makeKit } from "./furniture.js";
import * as F from "./furniture.js";
import { PLANS } from "./layouts.js";
import * as DC from "./decor.js";
import { RL, roomLit, MAX_LIGHTS, MAX_ROOMS } from "./roomlight.js";

const ROOM = { x: HALF + 360, z: -HALF - 220 };
const T = 0.14;          // wall thickness
// which places you can walk into, and what kind of building each is
export const VENUES = {
  pizza: "food", burger: "food", club: "club", gallery: "gallery", hospital: "hospital", police: "police",
  taxi: "office", marina: "office", studio: "office", prints: "office", depot: "depot",
};

// same slots and option order as the original game, so imported decor carries straight over
export const DECOR = {
  wall: { name: "Walls", opts: [{ n: "Cream", c: 0xe6dccb }, { n: "Sky", c: 0xc6d8e6 }, { n: "Sage", c: 0xc9d8c4 }, { n: "Blush", c: 0xe6ccd0 }, { n: "Slate", c: 0x8e949e }, { n: "Tan", c: 0xd8c49c }, { n: "Lilac", c: 0xd4c8e4 },
    { n: "Striped wallpaper", c: 0xe0d0b0, mat: "stripes" }, { n: "Damask wallpaper", c: 0xb8c8c0, mat: "damask" }, { n: "Exposed brick", c: 0xffffff, mat: "brick" }, { n: "Oak panelling", c: 0xffffff, mat: "panel" }], cost: 150 },
  floor: { name: "Floor", opts: [{ n: "Oak planks", tex: "wood" }, { n: "Stone tile", tex: "tile" }, { n: "Carpet", tex: "carpet" }, { n: "Polished concrete", tex: "concrete" }, { n: "Marble", tex: "marble" }, { n: "Dark oak", tex: "darkwood" }], cost: 400 },
  sofa: { name: "Sofa", opts: [{ n: "None", none: true }, { n: "Navy", c: 0x2e3f5e }, { n: "Teal", c: 0x25625e }, { n: "Mustard", c: 0xb88a2e }, { n: "Crimson", c: 0x8a2e2e }, { n: "Grey", c: 0x5a5e66 }, { n: "Plum", c: 0x5a3e6a }], cost: 600 },
  bed: { name: "Bed", opts: [{ n: "None", none: true }, { n: "Blue", c: 0x41628a }, { n: "Green", c: 0x41785a }, { n: "Red", c: 0x8e3e3e }, { n: "Cream", c: 0xd8cdb6 }], cost: 700 },
  rug: { name: "Rug", opts: [{ n: "None", none: true }, { n: "Red", c: 0x9a3e3e }, { n: "Blue", c: 0x33507a }, { n: "Gold", c: 0xb08e32 }, { n: "Green", c: 0x416a4f }, { n: "Mono", c: 0x33333a }], cost: 250 },
  tv: { name: "TV", opts: [{ n: "None", none: true }, { n: "Black stand", c: 0x222226 }, { n: "Walnut stand", c: 0x4e3624 }, { n: "White stand", c: 0xd6d6d4 }], cost: 900 },
  plant: { name: "Plant", opts: [{ n: "None", none: true }, { n: "Palm", c: 0x2f7a3e }, { n: "Fern", c: 0x4e8e4a }, { n: "Cactus", c: 0x5a8a40 }], cost: 120 },
  table: { name: "Coffee table", opts: [{ n: "None", none: true }, { n: "Wood", c: 0x6a4c30 }, { n: "Black", c: 0x222226 }, { n: "Glass", c: 0xb8d0da }], cost: 300 },
  art: { name: "Wall art", opts: [{ n: "None", none: true }, { n: "Sunset", c: 0xff8a3a }, { n: "Ocean", c: 0x3a8ac0 }, { n: "Abstract", c: 0xc04a8a }, { n: "Forest", c: 0x3a7a4a }], cost: 500 },
  lamp: { name: "Lamp", opts: [{ n: "None", none: true }, { n: "Warm", c: 0xffd08a }, { n: "Cool", c: 0xcfe4ff }, { n: "Pink", c: 0xffb0d0 }], cost: 200 },
};
export const DECOR_DEFAULT = { wall: 0, floor: 0, sofa: 1, bed: 1, rug: 1, tv: 1, plant: 1, table: 1, art: 1, lamp: 1 };

function canvasTex(size, draw, rx, ry) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}
const rnd = Math.random;
const FLOORS = {
  wood: { rough: 0.55, tex: () => canvasTex(512, (x, s) => {
    const rows = 8, h = s / rows;
    for (let r = 0; r < rows; r++) {
      let px = -rnd() * 200;
      while (px < s) {
        const w = 150 + rnd() * 200, base = [[128, 88, 56], [140, 98, 62], [118, 80, 50], [150, 108, 70]][Math.floor(rnd() * 4)];
        x.fillStyle = `rgb(${base})`; x.fillRect(px, r * h, w, h);
        for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(60,36,18,${0.08 + rnd() * 0.1})`; x.lineWidth = 1 + rnd(); const y = r * h + rnd() * h; x.beginPath(); x.moveTo(px, y); x.bezierCurveTo(px + w * 0.3, y + (rnd() - 0.5) * 6, px + w * 0.6, y + (rnd() - 0.5) * 6, px + w, y); x.stroke(); }
        x.fillStyle = "rgba(30,18,8,.55)"; x.fillRect(px, r * h, 2, h);
        px += w;
      }
      x.fillStyle = "rgba(30,18,8,.6)"; x.fillRect(0, r * h, s, 2);
    }
  }, 3, 3) },
  tile: { rough: 0.42, tex: () => canvasTex(256, (x, s) => {
    const n = 4, g = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 196 + rnd() * 20; x.fillStyle = `rgb(${v},${v - 2},${v - 8})`; x.fillRect(i * g, j * g, g, g); for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(120,110,100,${rnd() * 0.08})`; x.fillRect(i * g + rnd() * g, j * g + rnd() * g, 3 + rnd() * 8, 1 + rnd() * 3); } }
    x.strokeStyle = "#8c8680"; x.lineWidth = 3; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * g, 0); x.lineTo(i * g, s); x.moveTo(0, i * g); x.lineTo(s, i * g); x.stroke(); }
  }, 4, 4) },
  carpet: { rough: 0.97, tex: () => canvasTex(256, (x, s) => {
    x.fillStyle = "#6c5a52"; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) { const v = rnd(); x.fillStyle = v < 0.5 ? "rgba(90,74,66,.5)" : "rgba(130,112,100,.35)"; x.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
  }, 5, 5) },
  concrete: { rough: 0.55, tex: () => canvasTex(512, (x, s) => {
    x.fillStyle = "#8e8c88"; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { const r = 20 + rnd() * 80, gr = x.createRadialGradient(rnd() * s, rnd() * s, 0, rnd() * s, rnd() * s, r); gr.addColorStop(0, `rgba(${rnd() < 0.5 ? "70,68,64" : "170,168,162"},.12)`); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, s, s); }
    for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? "60,60,60" : "200,200,200"},.1)`; x.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2); }
    x.strokeStyle = "rgba(40,40,40,.4)"; x.lineWidth = 2; x.strokeRect(0, 0, s, s);
  }, 2, 2) },
};
// the view out of the window: the skyline across the bay, by day and by night
function viewTex(night) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d");
  const gr = x.createLinearGradient(0, 0, 0, 256);
  if (night) { gr.addColorStop(0, "#050914"); gr.addColorStop(1, "#1c2240"); } else { gr.addColorStop(0, "#5f95cc"); gr.addColorStop(1, "#dfe8ec"); }
  x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
  let px = 0;
  while (px < 512) {
    const w = 20 + rnd() * 46, h = 50 + rnd() * 150;
    x.fillStyle = night ? "#0b0e18" : ["#8a95a2", "#9ea6ae", "#7a8592", "#b0aca4"][Math.floor(rnd() * 4)];
    x.fillRect(px, 256 - h, w, h);
    for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = px + 4; wx < px + w - 4; wx += 7) {
      if (night ? rnd() < 0.35 : rnd() < 0.5) { x.fillStyle = night ? (rnd() < 0.8 ? "#ffcf80" : "#bfe0ff") : "rgba(40,60,80,.35)"; x.fillRect(wx, wy, 3, 4); }
    }
    px += w + rnd() * 6;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// more floors for the venues; `scale` is metres per texture repeat (floor UVs are in metres)
Object.assign(FLOORS, {
  checker: { rough: 0.3, tex: () => canvasTex(256, (x, s) => { const n = 4, g = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? "#1c1c1e" : "#ecebe6"; x.fillRect(i * g, j * g, g, g); } for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(128,128,128,${rnd() * 0.08})`; x.fillRect(rnd() * s, rnd() * s, 2, 2); } }, 1, 1) },
  quarry: { rough: 0.6, tex: () => canvasTex(256, (x, s) => { const n = 4, g = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = rnd() * 16; x.fillStyle = `rgb(${150 + v},${70 + v * 0.5},${50})`; x.fillRect(i * g, j * g, g, g); } x.strokeStyle = "#6a5a50"; x.lineWidth = 4; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * g, 0); x.lineTo(i * g, s); x.moveTo(0, i * g); x.lineTo(s, i * g); x.stroke(); } }, 1, 1) },
  vinyl: { rough: 0.35, tex: () => canvasTex(256, (x, s) => { const n = 4, g = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = rnd() * 8; x.fillStyle = `rgb(${206 + v},${220 + v},${216 + v})`; x.fillRect(i * g, j * g, g, g); for (let k = 0; k < 30; k++) { x.fillStyle = `rgba(120,140,140,${rnd() * 0.1})`; x.fillRect(i * g + rnd() * g, j * g + rnd() * g, 2, 2); } } x.strokeStyle = "rgba(120,140,140,.35)"; x.lineWidth = 1.5; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * g, 0); x.lineTo(i * g, s); x.moveTo(0, i * g); x.lineTo(s, i * g); x.stroke(); } }, 1, 1) },
  marble: { rough: 0.18, tex: () => canvasTex(512, (x, s) => { x.fillStyle = "#e8e6e0"; x.fillRect(0, 0, s, s); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(${140 + rnd() * 40},${140 + rnd() * 40},${150 + rnd() * 30},${0.1 + rnd() * 0.25})`; x.lineWidth = 0.5 + rnd() * 2; x.beginPath(); let px = rnd() * s, py = rnd() * s; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rnd() - 0.3) * 90; py += (rnd() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); } x.strokeStyle = "rgba(90,90,90,.35)"; x.lineWidth = 2; x.strokeRect(0, 0, s / 2, s / 2); x.strokeRect(s / 2, s / 2, s / 2, s / 2); x.strokeRect(0, 0, s, s); }, 1, 1) },
  darkwood: { rough: 0.45, tex: () => { const t = FLOORS.wood.tex(); const c = t.image, x = c.getContext("2d"); x.fillStyle = "rgba(20,10,4,.55)"; x.fillRect(0, 0, c.width, c.height); t.needsUpdate = true; return t; } },
  carpetRed: { rough: 0.97, tex: () => canvasTex(256, (x, s) => { x.fillStyle = "#5a1020"; x.fillRect(0, 0, s, s); for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() < 0.5 ? "rgba(90,20,36,.5)" : "rgba(40,6,14,.4)"; x.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); } x.strokeStyle = "rgba(200,160,70,.35)"; x.lineWidth = 3; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(s / 2, s / 2, 30 + i * 30, 0, 7); x.stroke(); } }, 1, 1) },
  concreteDark: { rough: 0.5, tex: () => { const t = FLOORS.concrete.tex(); const c = t.image, x = c.getContext("2d"); x.fillStyle = "rgba(10,8,14,.72)"; x.fillRect(0, 0, c.width, c.height); t.needsUpdate = true; return t; } },
});
const FLOOR_SCALE = { wood: 2.4, darkwood: 2.4, tile: 2.4, carpet: 2.0, carpetRed: 3.0, concrete: 4.0, concreteDark: 4.0, checker: 1.2, quarry: 1.2, vinyl: 2.4, marble: 2.4 };
const floorMats = {};
function floorMat(type) {
  if (floorMats[type]) return floorMats[type];
  const tex = FLOORS[type].tex(); tex.repeat.set(1, 1);
  // the building sits on the open ground outside town: offset the floor so the terrain never shows through
  return (floorMats[type] = new THREE.MeshStandardMaterial({ map: tex, roughness: FLOORS[type].rough, envMapIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
}
function textTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const hex = c => "#" + new THREE.Color(c).getHexString();
function paintingTex(v) {
  return textTex(256, 256, (x, w, h) => {
    const base = v > 64 ? new THREE.Color(v) : new THREE.Color().setHSL((v * 0.137) % 1, 0.5, 0.5);
    const gr = x.createLinearGradient(0, 0, w * (v % 2 ? 1 : 0.3), h);
    gr.addColorStop(0, hex(base.clone().offsetHSL(0, 0, 0.22))); gr.addColorStop(1, hex(base.clone().offsetHSL(0.06, 0, -0.25)));
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const kind = Math.floor(v) % 4;
    if (kind === 3) { x.fillStyle = hex(base.clone().offsetHSL(0.1, 0.2, 0.25)); x.beginPath(); x.arc(w * 0.62, h * 0.4, w * 0.16, 0, 7); x.fill(); x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, h * 0.62, w, h * 0.38); for (let i = 0; i < 6; i++) { x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(i * 44 + rnd() * 10, h * 0.62 - rnd() * 60, 6, 80); } }
    else for (let i = 0; i < 16; i++) {
      x.fillStyle = hex(new THREE.Color().setHSL(rnd(), 0.55, 0.3 + rnd() * 0.45)); x.globalAlpha = 0.6;
      if (kind === 0) { x.beginPath(); x.arc(rnd() * w, rnd() * h, 10 + rnd() * 50, 0, 7); x.fill(); }
      else if (kind === 1) x.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 90, 8 + rnd() * 60);
      else { x.beginPath(); x.moveTo(rnd() * w, rnd() * h); x.lineTo(rnd() * w, rnd() * h); x.lineTo(rnd() * w, rnd() * h); x.fill(); }
      x.globalAlpha = 1;
    }
  });
}

export function makeInterior(scene, g) {
  // g: { st, sky, hud, toast, sound, save, sleep(), venueAction(kind, site) }
  const st = g.st;
  st.decor = Object.assign({}, DECOR_DEFAULT, st.decor || {});
  const root = new THREE.Group(); root.position.set(ROOM.x, 0, ROOM.z); root.visible = false; scene.add(root);
  const view = { day: viewTex(false), night: viewTex(true) };
  const viewMat = new THREE.MeshBasicMaterial({ map: view.day });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.95, envMapIntensity: 0.1 });
  const light = new THREE.PointLight(0xffd6a0, 0, 30, 1.2); root.add(light);
  const light2 = new THREE.PointLight(0xffd6a0, 0, 22, 1.3); root.add(light2);
  // bounce light: rooms are never pitch black on the side facing away from the lamp
  const amb = new THREE.AmbientLight(0xfff0e0, 0); root.add(amb);
  // the key light: a soft spot in the ceiling of the room you're in, casting real furniture shadows
  const spot = new THREE.SpotLight(0xffe0b8, 0, 14, 1.1, 0.8, 1.3);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.025;
  spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 9; spot.position.set(0, 3, 0); root.add(spot, spot.target);
  // reflections and bounce light come from a probe captured inside the room itself
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.05, 60, cubeRT);
  let pmrem = null, envRT = null;
  function bake(r) {
    if (!g.renderer || !B) return;
    pmrem = pmrem || new THREE.PMREMGenerator(g.renderer);
    cubeCam.position.set(ROOM.x + r.cx, 1.5, ROOM.z + r.cz);
    const rw = S.bakeRaw || r;
    RL.uProbePos.value.copy(cubeCam.position); RL.uProbeMin.value.set(ROOM.x + rw.x0, 0, ROOM.z + rw.z0); RL.uProbeMax.value.set(ROOM.x + rw.x1, B.H, ROOM.z + rw.z1);
    cubeCam.update(g.renderer, scene);
    const old = envRT; envRT = pmrem.fromCubemap(cubeRT.texture);
    scene.environment = envRT.texture; if (old) old.dispose();
  }
  // a quick fade through black on the way in and out
  const fade = document.createElement("div"); fade.id = "ifade";
  Object.assign(fade.style, { position: "fixed", inset: "0", background: "#000", opacity: "0", pointerEvents: "none", zIndex: "90", transition: "opacity .5s" });
  document.body.appendChild(fade);
  function dip() { fade.style.transition = "none"; fade.style.opacity = "1"; void fade.offsetWidth; fade.style.transition = "opacity .55s ease-out"; fade.style.opacity = "0"; }
  // a pool of people to staff the place
  const crew = [];
  const S = { picked: [], inside: false, pr: null, camX: 0, camZ: 0, camY: 2.6, yaw: 0, room: null, snap: true, fov: 58 };
  let B = null;                                           // the building you're in

  // ------------------------------------------------------------------------------------------
  // building
  // ------------------------------------------------------------------------------------------
  function build(plan, opts) {
    const K = makeKit(), W = plan.W, D = plan.D, H = plan.H, lights = [];
    const group = new THREE.Group(), extras = [];
    const own = [];                                        // textures/materials to dispose on exit
    const keys = Object.keys(plan.rooms);
    const R = {}, raw = {};
    const linkBetween = (a, b) => plan.links.filter(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    const isOpen = (a, b) => linkBetween(a, b).some(l => l.kind === "open");
    // shared edges between rooms
    const walls = [];                                      // { axis:'x'|'z', at, from, to, rooms:{key:sign}, openings:[] }
    for (const k of keys) { const [x0, z0, x1, z1] = plan.rooms[k].r; raw[k] = { x0, z0, x1, z1 }; }
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = raw[keys[i]], b = raw[keys[j]], A = keys[i], Bk = keys[j];
      for (const [e1, e2, s1] of [[a.x1, b.x0, 1], [a.x0, b.x1, -1]]) if (Math.abs(e1 - e2) < 1e-6) {
        const from = Math.max(a.z0, b.z0), to = Math.min(a.z1, b.z1);
        if (to - from > 0.01 && !isOpen(A, Bk)) walls.push({ axis: "z", at: e1, from, to, rooms: { [A]: -s1, [Bk]: s1 }, pair: [A, Bk], openings: [] });
      }
      for (const [e1, e2, s1] of [[a.z1, b.z0, 1], [a.z0, b.z1, -1]]) if (Math.abs(e1 - e2) < 1e-6) {
        const from = Math.max(a.x0, b.x0), to = Math.min(a.x1, b.x1);
        if (to - from > 0.01 && !isOpen(A, Bk)) walls.push({ axis: "x", at: e1, from, to, rooms: { [A]: -s1, [Bk]: s1 }, pair: [A, Bk], openings: [] });
      }
    }
    // outer walls: every room side on the perimeter
    for (const k of keys) {
      const r = raw[k];
      if (Math.abs(r.x0 + W / 2) < 1e-6) walls.push({ axis: "z", at: r.x0, from: r.z0, to: r.z1, rooms: { [k]: 1 }, outer: "left", openings: [] });
      if (Math.abs(r.x1 - W / 2) < 1e-6) walls.push({ axis: "z", at: r.x1, from: r.z0, to: r.z1, rooms: { [k]: -1 }, outer: "right", openings: [] });
      if (Math.abs(r.z0 + D / 2) < 1e-6) walls.push({ axis: "x", at: r.z0, from: r.x0, to: r.x1, rooms: { [k]: 1 }, outer: "back", openings: [] });
      if (Math.abs(r.z1 - D / 2) < 1e-6) walls.push({ axis: "x", at: r.z1, from: r.x0, to: r.x1, rooms: { [k]: -1 }, outer: "front", openings: [] });
    }
    // which room sides carry a wall (for the usable inner rectangles)
    for (const k of keys) {
      const r = raw[k], has = side => walls.some(w => w.rooms[k] !== undefined && (side === "x0" ? w.axis === "z" && Math.abs(w.at - r.x0) < 1e-6 : side === "x1" ? w.axis === "z" && Math.abs(w.at - r.x1) < 1e-6 : side === "z0" ? w.axis === "x" && Math.abs(w.at - r.z0) < 1e-6 : w.axis === "x" && Math.abs(w.at - r.z1) < 1e-6));
      const t = T / 2;
      R[k] = { x0: r.x0 + (has("x0") ? t : 0), x1: r.x1 - (has("x1") ? t : 0), z0: r.z0 + (has("z0") ? t : 0), z1: r.z1 - (has("z1") ? t : 0) };
      Object.assign(R[k], { cx: (R[k].x0 + R[k].x1) / 2, cz: (R[k].z0 + R[k].z1) / 2, w: R[k].x1 - R[k].x0, d: R[k].z1 - R[k].z0, key: k });
    }
    // openings from links, the front door and windows
    const OPEN = { door: [0, 2.15], arch: [0, Math.min(2.6, H - 0.35)], hatch: [1.05, 2.05], window: [1.0, 2.1] };
    for (const l of plan.links) {
      if (l.kind === "open") continue;
      const w = walls.find(w => w.pair && w.pair.includes(l.a) && w.pair.includes(l.b) && l.at > w.from && l.at < w.to);
      if (!w) { console.warn("no wall for link", l); continue; }
      const [y0, y1] = OPEN[l.kind];
      w.openings.push({ c: l.at, w: l.w || (l.kind === "door" ? 0.95 : 1.6), y0, y1, kind: l.kind, link: l });
    }
    const front = walls.find(w => w.outer === "front" && plan.door > w.from && plan.door < w.to);
    front.openings.push({ c: plan.door, w: 1.3, y0: 0, y1: 2.3, kind: "front" });
    for (const win of plan.windows || []) {
      const w = walls.find(w => w.outer === win.side && w.rooms[win.room] !== undefined);
      if (w) w.openings.push({ c: win.at, w: win.w, y0: 0.95, y1: 2.2, kind: "outwin" });
    }
    // ---- raise the walls ----
    const wallCol = opts.wall ?? plan.wall ?? 0xe6dccb, trim = 0xf2efe8, wallFin = opts.wallMat || plan.wallMat || "plaster";
    const pieces = [];
    const seg = (w, a, b, y0, y1) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return;
      const mid = (a + b) / 2, len = b - a, h = y1 - y0;
      if (w.axis === "x") K.box(wallFin, len, h, T, mid, (y0 + y1) / 2, w.at, wallCol); else K.box(wallFin, T, h, len, w.at, (y0 + y1) / 2, mid, wallCol);
      if (y0 < 0.01 || (y0 > 0.5 && y0 < 1.2)) { if (w.axis === "x") K.block(a, w.at - T / 2, b, w.at + T / 2); else K.block(w.at - T / 2, a, w.at + T / 2, b); }
      pieces.push({ w, a, b, y0, y1 });
    };
    for (const w of walls) {
      const ops = w.openings.sort((p, q) => p.c - q.c);
      let cur = w.from;
      for (const o of ops) {
        const a = o.c - o.w / 2, b = o.c + o.w / 2;
        seg(w, cur, a, 0, H);
        seg(w, a, b, 0, o.y0);                          // below a window / hatch
        seg(w, a, b, o.y1, H);                          // lintel
        cur = b;
        openingDress(w, o);
      }
      seg(w, cur, w.to, 0, H);
    }
    // skirting boards on every face of every piece that touches the floor
    const faces = w => Object.entries(w.rooms);
    for (const p of pieces) if (p.y0 < 0.01) for (const [, s] of faces(p.w)) {
      const off = p.w.at + s * (T / 2 + 0.01), len = p.b - p.a, mid = (p.a + p.b) / 2;
      if (p.w.axis === "x") K.box("gloss", len, 0.1, 0.02, mid, 0.05, off, trim); else K.box("gloss", 0.02, 0.1, len, off, 0.05, mid, trim);
    }
    // crown moulding where the walls meet the ceiling
    if (plan.crown !== false) for (const p of pieces) if (p.y1 > H - 0.01) for (const [, s] of faces(p.w)) {
      const len = p.b - p.a, mid = (p.a + p.b) / 2, o1 = p.w.at + s * (T / 2 + 0.015), o2 = p.w.at + s * (T / 2 + 0.04);
      if (p.w.axis === "x") { K.box("gloss", len, 0.08, 0.03, mid, H - 0.04, o1, trim); K.box("gloss", len, 0.07, 0.07, mid, H - 0.085, o2, trim, { rx: Math.PI / 4 }); }
      else { K.box("gloss", 0.03, 0.08, len, o1, H - 0.04, mid, trim); K.box("gloss", 0.07, 0.07, len, o2, H - 0.085, mid, trim, { rz: Math.PI / 4 }); }
    }
    const nWallBlocks = K.blocks.length;
    // doors, arches, hatches and windows get their joinery
    function openingDress(w, o) {
      const along = (u, y, n, lw, lh, ld, col, mat = "wood") => {       // a box at (u along the wall, y, n across it)
        if (w.axis === "x") K.box(mat, lw, lh, ld, u, y, w.at + n, col); else K.box(mat, ld, lh, lw, w.at + n, y, u, col);
      };
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      const sides = Object.values(w.rooms);
      if (o.kind === "door" || o.kind === "arch" || o.kind === "front") {
        for (const s of sides) {
          const n = s * (T / 2 + 0.012);
          along(a - 0.04, o.y1 / 2, n, 0.08, o.y1 + 0.04, 0.025, trim, "gloss"); along(b + 0.04, o.y1 / 2, n, 0.08, o.y1 + 0.04, 0.025, trim, "gloss");
          along(o.c, o.y1 + 0.04, n, o.w + 0.16, 0.08, 0.025, trim, "gloss");
        }
        along(o.c, 0.005, 0, o.w, 0.01, T, 0x8a8278, "matte");                          // threshold
      }
      if (o.kind === "door") {
        // an open door leaf, standing into the room it belongs to, hinged on the near jamb
        const into = o.link.into || o.link.b, s = w.rooms[into], L = o.w - 0.06;
        const hingeB = (w.to - b) < (a - w.from);
        const hx = hingeB ? b - 0.08 : a;
        const hc = hx + 0.04;                              // the leaf's line along the wall
        if (w.axis === "x") { K.box("wood", 0.04, 2.08, L, hc - 0.01, 1.05, w.at + s * (T / 2 + L / 2), 0x6a4a30, { r: 0.006 }); K.box("chrome", 0.03, 0.03, 0.12, hc + (hingeB ? -0.05 : 0.05), 1.02, w.at + s * (T / 2 + L - 0.1), 0xc8b27a); K.block(hx, Math.min(w.at + s * T / 2, w.at + s * (T / 2 + L)), hx + 0.08, Math.max(w.at + s * T / 2, w.at + s * (T / 2 + L))); }
        else { K.box("wood", L, 2.08, 0.04, w.at + s * (T / 2 + L / 2), 1.05, hc - 0.01, 0x6a4a30, { r: 0.006 }); K.box("chrome", 0.12, 0.03, 0.03, w.at + s * (T / 2 + L - 0.1), 1.02, hc + (hingeB ? -0.05 : 0.05), 0xc8b27a); K.block(Math.min(w.at + s * T / 2, w.at + s * (T / 2 + L)), hx, Math.max(w.at + s * T / 2, w.at + s * (T / 2 + L)), hx + 0.08); }
      }
      if (o.kind === "front") {
        along(o.c, 1.15, 0, o.w - 0.06, 2.24, 0.06, 0x3a2618, "wood");
        for (const s of sides) { along(o.c - o.w / 2 + 0.16, 1.05, s * 0.06, 0.04, 0.04, 0.06, 0xc8b27a, "chrome"); along(o.c - o.w / 2 + 0.16, 1.05, s * 0.09, 0.14, 0.03, 0.03, 0xc8b27a, "chrome"); }
        for (const [i, s] of sides.entries()) if (i === 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 1 })); own.push(m.geometry, m.material); m.rotation.x = -Math.PI / 2; if (w.axis === "x") m.position.set(o.c, 0.05, w.at + s * 0.55); else m.position.set(w.at + s * 0.55, 0.05, o.c); extras.push(m); }
      }
      if (o.kind === "hatch") for (const s of sides) along(o.c, o.y0 + 0.02, s * 0.12, o.w + 0.1, 0.05, 0.3, 0xd8d4cc, "gloss");
      if (o.kind === "window" || o.kind === "outwin") {
        along(o.c, (o.y0 + o.y1) / 2, 0, o.w, o.y1 - o.y0, 0.012, 0xdde8ee, "glass");
        for (const s of sides) {
          const n = s * (T / 2 + 0.01);
          along(o.c, o.y0 - 0.02, n + s * 0.04, o.w + 0.16, 0.05, 0.12, trim, "gloss");        // sill
          along(o.c, o.y1 + 0.03, n, o.w + 0.12, 0.06, 0.03, trim, "gloss");
          along(a - 0.03, (o.y0 + o.y1) / 2, n, 0.06, o.y1 - o.y0, 0.03, trim, "gloss"); along(b + 0.03, (o.y0 + o.y1) / 2, n, 0.06, o.y1 - o.y0, 0.03, trim, "gloss");
          along(o.c, (o.y0 + o.y1) / 2, n, 0.04, o.y1 - o.y0, 0.03, trim, "gloss");
        }
        if (o.kind === "outwin") {
          const s = -sides[0], m = new THREE.Mesh(new THREE.PlaneGeometry(o.w * 1.6, (o.y1 - o.y0) * 1.5), viewMat);
          if (w.axis === "x") { m.position.set(o.c, (o.y0 + o.y1) / 2, w.at + s * 0.6); m.rotation.y = s > 0 ? Math.PI : 0; }
          else { m.position.set(w.at + s * 0.6, (o.y0 + o.y1) / 2, o.c); m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; }
          own.push(m.geometry); extras.push(m);
          // curtains either side, inside
          const n = sides[0] * (T / 2 + 0.12);
          for (const u of [a - 0.2, b + 0.2]) along(u, 1.35, n, 0.36, 2.2, 0.05, opts.curtain ?? 0xc8b8a0, "fabric");
          along(o.c, o.y1 + 0.25, n, o.w + 1.0, 0.03, 0.03, 0x2a2a2e, "metal");
        }
      }
      // door signs
      if (o.link && o.link.sign) o.link.sign.forEach((txt, i) => {
        if (!txt) return;
        const key = i === 0 ? o.link.a : o.link.b, s = w.rooms[key];
        const tex = textTex(256, 64, (x, W2, H2) => { x.fillStyle = "#1e2226"; x.fillRect(0, 0, W2, H2); x.fillStyle = "#f4f4f0"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.fillText(txt, W2 / 2, 43); });
        const mat = new THREE.MeshBasicMaterial({ map: tex }); own.push(tex, mat);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.175), mat); own.push(m.geometry);
        const y = Math.min(H - 0.15, o.y1 + 0.25), off = s * (T / 2 + 0.015);
        if (w.axis === "x") { m.position.set(o.c, y, w.at + off); m.rotation.y = s > 0 ? 0 : Math.PI; } else { m.position.set(w.at + off, y, o.c); m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; }
        extras.push(m);
      });
    }
    // ---- floors, ceiling, ceiling lights ----
    for (const k of keys) {
      const r = raw[k], ft = plan.rooms[k].floor === "@decor" ? opts.floor : plan.rooms[k].floor, sc = FLOOR_SCALE[ft] || 2.4;
      const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0); geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + (r.x0 + r.x1) / 2) / sc, (pos.getZ(i) + (r.z0 + r.z1) / 2) / sc);
      const m = new THREE.Mesh(geo, floorMat(ft)); m.position.set((r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2); m.receiveShadow = true;
      own.push(geo); extras.push(m);
      const kind = plan.rooms[k].ceil || "round";
      {
        const nx = Math.max(1, Math.round((r.x1 - r.x0) / 4.5)), nz = Math.max(1, Math.round((r.z1 - r.z0) / 4.5));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const fx = r.x0 + (i + 0.5) * (r.x1 - r.x0) / nx, fz = r.z0 + (j + 0.5) * (r.z1 - r.z0) / nz;
          if (kind !== "none") F.ceilingLight(K, fx, fz, H, kind, plan.rooms[k].light[0]);
          lights.push({ x: fx, y: H - 0.3, z: fz, col: new THREE.Color(plan.rooms[k].light[0]), I: plan.rooms[k].light[1] * 1.15 / Math.sqrt(nx * nz) * Math.max(1, Math.sqrt(nx * nz) * 0.75), range: 10 });
        }
      }
    }
    const cm = ceilMat.clone(); cm.color.setHex(plan.ceiling ?? 0xf0ece4); cm.envMapIntensity = 0.5; own.push(cm);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.2, D + 0.4), cm); ceil.position.y = H + 0.1; ceil.castShadow = true; ceil.receiveShadow = true;
    own.push(ceil.geometry); extras.push(ceil);
    // smoke detectors, vents, light switches by the doors
    for (const k of keys) { const r = raw[k]; DC.smokeDetector(K, (r.x0 + r.x1) / 2 + 0.8, (r.z0 + r.z1) / 2 - 0.6, H); if (!plan.home) DC.vent(K, (r.x0 + r.x1) / 2 - 1.2, (r.z0 + r.z1) / 2 + 0.9, H); }
    for (const w of walls) for (const o of w.openings) if (o.kind === "door" || o.kind === "arch" || o.kind === "front") for (const [, sd] of Object.entries(w.rooms)) {
      const u = o.c + o.w / 2 + 0.22, n = w.at + sd * (T / 2);
      if (u > w.to - 0.1) continue;
      if (w.axis === "x") K.push(u, n, sd > 0 ? 0 : Math.PI, 0); else K.push(n, u, sd > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      DC.switchPlate(K); K.pop();
    }
    // ---- furnish ----
    const spots = [], npcs = [], updates = [];
    const brand = new THREE.Color(opts.place && opts.place.bg || "#445").getHex();
    const facing = ry => [Math.sin(ry), Math.cos(ry)];
    const plane = (x, y, z, ry, w, h, mat, off = 0.012) => { const [nx, nz] = facing(ry); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x + nx * off, y, z + nz * off); m.rotation.y = ry; own.push(m.geometry, mat); if (mat.map) own.push(mat.map); extras.push(m); return m; };
    const ctx = {
      K, R, H, brand, fg: opts.place && opts.place.fg || "#fff", label: opts.label || "",
      P(x, z, ry, fn, y = 0) { K.push(x, z, ry, y); fn(); K.pop(); },
      spot(x, z, r, label, prompt, act) { spots.push({ x, z, r, label, prompt, act }); },
      npc(x, z, yaw, pose, look, path, stop) { npcs.push({ x, z, yaw, pose, look, path, stop }); },
      painting(x, y, z, ry, w, h, v, o = {}) {
        const [nx, nz] = facing(ry), tilt = o.lean || 0;
        K.push(x + nx * 0.025, z + nz * 0.025, ry, y); K.box("wood", w + 0.08, h + 0.08, 0.04, 0, 0, 0, 0x1e1a14, { rx: -tilt }); K.pop();
        const m = plane(x + nx * 0.025, y, z + nz * 0.025, ry, w, h, new THREE.MeshStandardMaterial({ map: paintingTex(v), roughness: 0.85, envMapIntensity: 0.1 }), 0.022);
        m.rotation.x = 0; if (tilt) { m.rotation.order = "YXZ"; m.rotation.x = -tilt; }
      },
      rug(x, z, w, d, col, ry = 0) {
        const c = new THREE.Color(col), tex = textTex(256, 256, (cx, s) => { cx.fillStyle = hex(c); cx.fillRect(0, 0, s, s); cx.strokeStyle = "rgba(240,230,210,.55)"; cx.lineWidth = 8; cx.strokeRect(18, 18, s - 36, s - 36); cx.lineWidth = 3; cx.strokeRect(34, 34, s - 68, s - 68); cx.strokeStyle = "rgba(240,230,210,.3)"; cx.beginPath(); cx.moveTo(s / 2, 50); cx.lineTo(s - 50, s / 2); cx.lineTo(s / 2, s - 50); cx.lineTo(50, s / 2); cx.closePath(); cx.stroke(); for (let i = 0; i < 4000; i++) { cx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; cx.fillRect(rnd() * s, rnd() * s, 2, 2); } });
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, envMapIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.set(-Math.PI / 2, 0, ry, "YXZ"); m.rotation.order = "XYZ"; m.rotation.set(-Math.PI / 2, 0, -ry); m.position.set(x, 0.05, z); m.receiveShadow = true;
        own.push(m.geometry, mat, tex); extras.push(m);
      },
      screen(x, y, z, ry, w, h, dz) {
        const [nx, nz] = facing(ry); const mat = new THREE.MeshBasicMaterial({ color: 0x2a4a7a });
        const m = plane(x + nx * dz, y, z + nz * dz, ry, w, h, mat, 0);
        updates.push(t => { const f = 0.7 + Math.sin(t * 7) * 0.08 + Math.sin(t * 2.3) * 0.12; mat.color.setRGB(0.25 * f, 0.45 * f, 0.8 * f); });
      },
      dance(cx, cz, n, s) {
        const geo = new THREE.BoxGeometry(s * 0.96, 0.03, s * 0.96), mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const tiles = new THREE.InstancedMesh(geo, mat, n * n); own.push(geo, mat);
        const m = new THREE.Matrix4(), c = new THREE.Color();
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { m.makeTranslation(cx + (i - n / 2 + 0.5) * s, 0.06, cz + (j - n / 2 + 0.5) * s); tiles.setMatrixAt(i * n + j, m); tiles.setColorAt(i * n + j, c.set(0x222222)); }
        extras.push(tiles);
        const neon = [0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b];
        updates.push(t => { const beat = Math.floor(t * 2.2); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const on = ((i * 7 + j * 3 + beat) % 5) < 3; c.setHex(neon[(i + j + beat) % 4]).multiplyScalar(on ? 1.6 : 0.1); tiles.setColorAt(i * n + j, c); } tiles.instanceColor.needsUpdate = true; });
      },
      // colour a room's walls: full height (h = 0) or a wainscot / tiled dado up to h
      paint(key, col, h, mat, o = {}) {
        for (const p of pieces) {
          const s = p.w.rooms[key]; if (s === undefined) continue;
          if (o.accentWall) { const r = raw[key]; if (!(p.w.axis === "x" && Math.abs(p.w.at - r.z0) < 1e-6)) continue; }
          if (o.side) { const r = raw[key], at = r[o.side]; if (!(p.w.axis === (o.side[0] === "x" ? "z" : "x") && Math.abs(p.w.at - at) < 1e-6)) continue; }
          let y0 = p.y0, y1 = Math.min(p.y1, h || p.y1);
          if (o.backsplash) { y0 = Math.max(p.y0, 0.92); y1 = Math.min(p.y1, 1.55); }
          if (y1 - y0 < 0.01) continue;
          const off = p.w.at + s * (T / 2 + 0.004 + (o.layer || 0) * 0.005), len = p.b - p.a, mid = (p.a + p.b) / 2;
          if (p.w.axis === "x") K.box(mat || "matte", len, y1 - y0, 0.006, mid, (y0 + y1) / 2, off, col); else K.box(mat || "matte", 0.006, y1 - y0, len, off, (y0 + y1) / 2, mid, col);
          if (h && !o.backsplash && y1 < p.y1 && y1 - y0 > 0.3) { const c2 = o.color2 ?? 0x8a8278, off2 = p.w.at + s * (T / 2 + 0.012); if (p.w.axis === "x") K.box("gloss", len, 0.05, 0.02, mid, y1, off2, c2); else K.box("gloss", 0.02, 0.05, len, off2, y1, mid, c2); }
        }
      },
      pendant(x, z, drop, shade) { F.pendantLamp(K, x, z, H, drop, 0xfff0c8, shade ?? 0x1a1a1c); lights.push({ x, y: H - drop - 0.18, z, col: new THREE.Color(0xffd8a0), I: 6, range: 5 }); },
      // a light source in the room: lamps, fires, screens, signs (fn(t, L) can animate it)
      light(x, y, z, col, I, range = 5, fn) { lights.push({ x, y, z, col: new THREE.Color(col), I, range, fn }); },
      neon(x, y, z, ry, text, col) {
        ctx.light(x + Math.sin(ry) * 0.5, y, z + Math.cos(ry) * 0.5, col, 2.5, 4);
        const tex = textTex(512, 128, (c, w, h) => { c.font = "bold 84px sans-serif"; c.textAlign = "center"; c.shadowColor = hex(col); c.shadowBlur = 18; c.fillStyle = "#ffffff"; c.fillText(text, w / 2, 94); c.fillStyle = hex(col); c.globalAlpha = 0.6; c.fillText(text, w / 2, 94); });
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1.8, 1.8, 1.8) });
        plane(x, y, z, ry, Math.min(3.2, text.length * 0.34), 0.8, mat, 0.03);
      },
      poster(x, y, z, ry, w, h, text, bg, fgc = 0xffffff) {
        const tex = textTex(256, Math.round(256 * h / w), (c, W2, H2) => { c.fillStyle = hex(bg); c.fillRect(0, 0, W2, H2); c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 6; c.strokeRect(8, 8, W2 - 16, H2 - 16); c.fillStyle = hex(fgc); c.textAlign = "center"; c.font = "bold 34px sans-serif"; text.split(" ").forEach((wd, i, a) => c.fillText(wd, W2 / 2, H2 / 2 - (a.length - 1) * 20 + i * 40 + 10)); if (text === "WANTED" || text === "MISSING") { c.fillStyle = "#6a6258"; c.fillRect(W2 * 0.25, H2 * 0.45, W2 * 0.5, H2 * 0.38); c.fillStyle = "#2a2622"; c.beginPath(); c.arc(W2 / 2, H2 * 0.58, W2 * 0.12, 0, 7); c.fill(); c.fillRect(W2 * 0.32, H2 * 0.68, W2 * 0.36, H2 * 0.15); } });
        plane(x, y, z, ry, w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, envMapIntensity: 0.1 }));
      },
      banner(x, y, z, ry, w, h, text, bg, fgc) {
        const tex = textTex(512, Math.round(512 * h / w), (c, W2, H2) => { c.fillStyle = hex(bg); c.fillRect(0, 0, W2, H2); c.fillStyle = typeof fgc === "string" ? fgc : hex(fgc ?? 0xffffff); c.textAlign = "center"; c.font = `bold ${Math.round(H2 * 0.42)}px sans-serif`; c.fillText(text, W2 / 2, H2 * 0.64); });
        plane(x, y, z, ry, w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, envMapIntensity: 0.1 }));
      },
      menu(x, y, z, ry, w, h) {
        const label = ctx.label, pizza = label.includes("PIZZA");
        const tex = textTex(768, Math.round(768 * h / w), (c, W2, H2) => {
          c.fillStyle = "#16181c"; c.fillRect(0, 0, W2, H2); c.fillStyle = hex(brand); c.fillRect(0, 0, W2, 50);
          c.fillStyle = ctx.fg; c.font = "bold 34px sans-serif"; c.textAlign = "center"; c.fillText(label, W2 / 2, 37);
          c.textAlign = "left"; c.font = "bold 26px sans-serif";
          const items = pizza ? [["Margherita", "8"], ["Pepperoni", "10"], ["Veggie Supreme", "9"], ["Meat Feast", "12"], ["Garlic knots", "4"], ["Soda", "2"]] : [["Big Bun", "9"], ["Double Stack", "12"], ["Chicken Crunch", "8"], ["Fries", "3"], ["Onion rings", "4"], ["Shake", "4"]];
          items.forEach(([n, p], i) => { const cx = 30 + (i % 2) * 380, cy = 100 + Math.floor(i / 2) * 64; c.fillStyle = "#f0e8d8"; c.fillText(n, cx, cy); c.fillStyle = "#ffcf5a"; c.fillText("$" + p, cx + 290, cy); });
        });
        plane(x, y, z, ry, w, h, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.15, 1.15) }));
      },
      cross(x, y, z, ry) { const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe02020).multiplyScalar(1.6) }); plane(x, y, z, ry, 0.35, 1.1, mat); plane(x, y, z, ry, 1.1, 0.35, mat.clone()); },
      seal(x, y, z, ry) {
        const tex = textTex(256, 256, (c, w) => { c.fillStyle = "#10204a"; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 4, 0, 7); c.fill(); c.strokeStyle = "#e8c84a"; c.lineWidth = 10; c.stroke(); c.fillStyle = "#e8c84a"; c.font = "bold 64px sans-serif"; c.textAlign = "center"; c.fillText("PCPD", w / 2, w / 2 + 22); });
        plane(x, y, z, ry, 1.2, 1.2, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      },
      mirror(x, y, z, ry, w, h) { const [nx, nz] = facing(ry); K.push(x + nx * 0.02, z + nz * 0.02, ry, y); K.box("metal", w + 0.08, h + 0.08, 0.03, 0, 0, 0, 0x2a2a2e); K.box("glass", w, h, 0.01, 0, 0, 0.02, 0x101418); K.pop(); },
    };
    const d = opts.decor;
    const anims = [], dyn = [];
    Object.assign(ctx, {
      anim(a, x = 0, z = 0, ry = 0, y = 0) { a.group.position.set(x, y, z); a.group.rotation.y = ry; extras.push(a.group); anims.push(a); a.group.traverse(o => { if (o.geometry) own.push(o.geometry); if (o.material && o.material.dispose) own.push(o.material); }); return a; },
      fan(x, z) { ctx.anim(DC.ceilingFan(0, 0, 0), x, z, 0, H); },
      aquarium(x, z, ry, w, h, dd) { K.push(x, z, ry, 0); const a = DC.aquarium(K, w, h, dd); K.pop(); ctx.anim(a, x, z, ry); ctx.light(x + Math.sin(ry) * 0.5, 1.4, z + Math.cos(ry) * 0.5, 0x7ad8ff, 2.2, 3.5); },
      fire(x, y, z, s = 1) { ctx.light(x, y + 0.35, z + 0.25, 0xff7a2a, 7 * s, 5, (t, L) => { L.I = 7 * s * (0.8 + 0.12 * Math.sin(t * 13) + 0.1 * Math.sin(t * 29 + 1)); }); updates.push((t, dt) => { if (!g.fx) return; for (let i = 0; i < 2; i++) if (Math.random() < dt * 40) g.fx.flame(ROOM.x + x + (Math.random() - 0.5) * 0.45 * s, y, ROOM.z + z, s); }); },
      steam(x, y, z) { updates.push((t, dt) => { if (Math.random() < dt * 4 && g.fx) g.fx.smoke(ROOM.x + x + (Math.random() - 0.5) * 0.2, y, ROOM.z + z, 0.85); }); },
      tv(x, y, z, ry, w, h, kind = "sport") { ctx.light(x + Math.sin(ry) * 0.6, y, z + Math.cos(ry) * 0.6, kind === "news" ? 0x6a90ff : 0x60c070, 1.6, 3.5, (t, L) => { L.I = 1.6 * (0.75 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 1.7)); }); const tex = tvTex(kind); own.push(tex); const m = plane(x, y, z, ry, w, h, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.25) }), 0.035); updates.push(t => tex.userData.draw(t)); return m; },
      beams(list) { clubBeams(list, extras, own, updates); },
      specks(bx, by, bz, key) { mirrorSpecks(bx, by, bz, R[key], H, extras, own, updates); },
      forklift(z, x0, x1) {
        const FK = makeKit(); F.forklift(FK); const grp = FK.build(); grp.traverse(o => { if (o.geometry) own.push(o.geometry); });
        const hold = new THREE.Group(); hold.add(grp); extras.push(hold);
        const blk = [0, 0, 0, 0]; dyn.push(blk);
        let x = x0, dir = 1, pause = 0;
        updates.push((t, dt) => {
          if (pause > 0) pause -= dt; else { x += dir * dt * 1.6; if (x > x1 || x < x0) { dir = -dir; pause = 2.5; x = Math.max(x0, Math.min(x1, x)); } }
          hold.position.set(x, 0, z); hold.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          blk[0] = x - 1.3; blk[1] = x + 1.3; blk[2] = z - 0.75; blk[3] = z + 0.75;
          if (pause <= 0 && dir < 0 && Math.random() < dt * 2 && g.sound && Math.abs(ROOM.x + x - (g.player ? g.player().x : 0)) < 12) g.sound("blip", 0.12);
        });
      },
    });
    plan.furnish(ctx, d || {});
    if (!plan.home) {                                       // a lit EXIT sign over the front door
      const ex = textTex(128, 48, (c, w2, h2) => { c.fillStyle = "#0a5a2a"; c.fillRect(0, 0, w2, h2); c.fillStyle = "#e8fff0"; c.font = "bold 34px sans-serif"; c.textAlign = "center"; c.fillText("EXIT", w2 / 2, 36); });
      plane(plan.door, 2.55, D / 2 - T / 2, Math.PI, 0.4, 0.15, new THREE.MeshBasicMaterial({ map: ex, color: new THREE.Color(1.8, 1.8, 1.8) }), 0.02);
    }
    // soft contact shadows under everything that stands on the floor, and darker corners along the walls
    extras.push(...contactShadows(K.blocks.slice(nWallBlocks), pieces, H, own));
    const kitGroup = K.build(); group.add(kitGroup, ...extras);
    kitGroup.traverse(o => { if (o.geometry) own.push(o.geometry); });
    const blocks = K.blocks;
    // the exit mat, just inside the front door
    const exit = { x: plan.door, z: D / 2 - 0.75 };
    // which openings connect which rooms (for the second light)
    const doors = [];
    for (const w of walls) for (const o of w.openings) if (o.link) doors.push({ x: w.axis === "x" ? o.c : w.at, z: w.axis === "x" ? w.at : o.c, a: o.link.a, b: o.link.b });
    for (const l of plan.links) if (l.kind === "open") { const a = raw[l.a], b = raw[l.b]; doors.push({ x: (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, z: (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2, a: l.a, b: l.b }); }
    // rooms joined by an open plan share their light
    const grp = {}; keys.forEach((k, i) => grp[k] = i);
    for (let pass = 0; pass < keys.length; pass++) for (const l of plan.links) if (l.kind === "open") { const m = Math.min(grp[l.a], grp[l.b]); grp[l.a] = grp[l.b] = m; }
    // daylight through the windows
    for (const w of walls) if (w.outer) for (const o of w.openings) if (o.kind === "outwin") {
      const s = Object.values(w.rooms)[0], x = w.axis === "x" ? o.c : w.at + s * 0.9, z = w.axis === "x" ? w.at + s * 0.9 : o.c;
      lights.push({ x, y: 1.7, z, col: new THREE.Color(0xfff0dc), I: 0, range: 7, day: true });
    }
    for (const L of lights) { L.room = keys.find(k => L.x >= raw[k].x0 - 0.01 && L.x <= raw[k].x1 + 0.01 && L.z >= raw[k].z0 - 0.01 && L.z <= raw[k].z1 + 0.01) || keys[0]; L.group = grp[L.room]; L.I0 = L.I; }
    return { group, plan, R, raw, keys, blocks, dyn, spots, npcs, updates, anims, exit, doors, own, walls, lights, grp, W, D, H };
  }
  function dispose(b) {
    root.remove(b.group);
    for (const o of b.own) if (o && o.dispose) o.dispose();
  }
  // ---- animated screens: a match on the TV, the news in the waiting rooms ----
  function tvTex(kind) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 144; const x = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pl = Array.from({ length: 12 }, (_, i) => ({ x: 40 + Math.random() * 176, y: 30 + Math.random() * 90, ph: Math.random() * 6, team: i % 2 }));
    let last = -1;
    tex.userData.draw = t => {
      if (t - last < 0.08) return; last = t;
      if (kind === "news") {
        x.fillStyle = "#16263e"; x.fillRect(0, 0, 256, 144);
        x.fillStyle = "#2a4a7a"; x.fillRect(12, 18, 150, 90); x.fillStyle = "#d8c0a0"; x.beginPath(); x.arc(87, 55, 18, 0, 7); x.fill(); x.fillStyle = "#1e2a44"; x.fillRect(62, 74, 50, 34);
        x.fillStyle = "#c81e1e"; x.fillRect(0, 108, 256, 16); x.fillStyle = "#fff"; x.font = "bold 11px sans-serif"; x.fillText("PALM CITY NEWS · LIVE", 6, 120);
        x.fillStyle = "#0e1624"; x.fillRect(0, 124, 256, 20); x.fillStyle = "#ffd040"; x.font = "11px sans-serif";
        const msg = "  HEATWAVE CONTINUES · MARINA BOAT SHOW THIS WEEKEND · POLICE WARN OF STREET RACING DOWNTOWN · STOCKS UP 2% ·";
        x.fillText(msg + msg, 256 - ((t * 40) % 700), 138);
        x.fillStyle = "#fff"; x.font = "bold 13px sans-serif"; x.fillText("WEATHER", 176, 40); x.fillText("31°", 186, 70);
      } else {
        for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#2e8a3a" : "#34963f"; x.fillRect(i * 32, 0, 32, 144); }
        x.strokeStyle = "rgba(255,255,255,.8)"; x.lineWidth = 2; x.strokeRect(10, 14, 236, 120); x.beginPath(); x.moveTo(128, 14); x.lineTo(128, 134); x.stroke(); x.beginPath(); x.arc(128, 74, 20, 0, 7); x.stroke();
        const bx = 128 + Math.sin(t * 0.7) * 90, by = 74 + Math.sin(t * 1.3) * 40;
        for (const p of pl) { const tx = bx + Math.sin(t * 0.5 + p.ph) * 60, ty = by + Math.cos(t * 0.6 + p.ph) * 35; p.x += (tx - p.x) * 0.05; p.y += (ty - p.y) * 0.05; x.fillStyle = p.team ? "#e83a3a" : "#f4f4f4"; x.beginPath(); x.arc(p.x, p.y, 3.5, 0, 7); x.fill(); }
        x.fillStyle = "#fff"; x.beginPath(); x.arc(bx, by, 2.5, 0, 7); x.fill();
        x.fillStyle = "rgba(0,0,0,.65)"; x.fillRect(6, 4, 104, 16); x.fillStyle = "#fff"; x.font = "bold 11px sans-serif"; x.fillText("PCFC 2 - 1 BAY   " + (60 + Math.floor(t / 4) % 30) + "'", 10, 16);
      }
      tex.needsUpdate = true;
    };
    tex.userData.draw(0);
    return tex;
  }
  // ---- club: moving-head beams sweeping the floor, and the mirror ball's specks racing round the walls ----
  const gradTex = (() => { const c = document.createElement("canvas"); c.width = 4; c.height = 128; const x = c.getContext("2d"); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.5, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
  function clubBeams(list, extras, own, updates) {
    const geo = new THREE.CylinderGeometry(0.03, 0.7, 6, 20, 1, true); geo.translate(0, -3, 0); own.push(geo);
    list.forEach(([x, y, z, col], i) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.5), map: gradTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const b = new THREE.Mesh(geo, m); b.position.set(x, y, z); b.renderOrder = 3; extras.push(b); own.push(m);
      updates.push(t => { b.rotation.set(0.5 + Math.sin(t * 0.9 + i * 1.7) * 0.45, 0, Math.sin(t * 0.7 + i) * 0.6, "YXZ"); b.rotation.y = Math.sin(t * 0.43 + i * 2.1) * 1.2; m.opacity = 0.35 + 0.25 * Math.max(0, Math.sin(t * 2.07 * 2 + i)); });
    });
  }
  function mirrorSpecks(bx, by, bz, r, H, extras, own, updates) {
    const N = 110, geo = new THREE.PlaneGeometry(0.07, 0.07), m = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(geo, m, N); own.push(geo, m); extras.push(inst); inst.frustumCulled = false;
    const dirs = Array.from({ length: N }, () => { const a = Math.random() * Math.PI * 2, e = -0.1 - Math.random() * 0.9; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]; });
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), n = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
    updates.push(t => {
      const a = t * 0.35, ca = Math.cos(a), sa = Math.sin(a);
      dirs.forEach(([dx0, dy, dz0], i) => {
        const dx = dx0 * ca - dz0 * sa, dz = dx0 * sa + dz0 * ca;
        let best = 1e9;
        if (dx > 0) { const tt = (r.x1 - bx) / dx; if (tt < best) { best = tt; n.set(-1, 0, 0); } } else if (dx < 0) { const tt = (r.x0 - bx) / dx; if (tt < best) { best = tt; n.set(1, 0, 0); } }
        if (dz > 0) { const tt = (r.z1 - bz) / dz; if (tt < best) { best = tt; n.set(0, 0, -1); } } else if (dz < 0) { const tt = (r.z0 - bz) / dz; if (tt < best) { best = tt; n.set(0, 0, 1); } }
        if (dy < 0) { const tt = (0.08 - by) / dy; if (tt < best) { best = tt; n.set(0, 1, 0); } }
        v.set(bx + dx * best, by + dy * best, bz + dz * best).addScaledVector(n, 0.02);
        q.setFromUnitVectors(Z, n); M4.compose(v, q, one); inst.setMatrixAt(i, M4);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }
  // ---- soft contact shadows (9-slice decals under furniture) and ambient-occlusion strips along the walls ----
  const aoTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.shadowColor = "rgba(0,0,0,1)"; x.shadowBlur = 20; x.shadowOffsetX = 1000; x.fillStyle = "#000"; x.fillRect(-1000 + 28, 28, 72, 72); return new THREE.CanvasTexture(c); })();
  const stripTex = (() => { const c = document.createElement("canvas"); c.width = 4; c.height = 64; const x = c.getContext("2d"); const gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)"); x.fillStyle = gr; x.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c); })();
  const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -12 });
  const stripMat = new THREE.MeshBasicMaterial({ map: stripTex, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -12, side: THREE.DoubleSide });
  function contactShadows(blocks, pieces, H, own) {
    const P = [], U = [], I = [];
    const quad9 = (x0, z0, x1, z1, m) => {
      const xs = [x0 - m, x0, x1, x1 + m], zs = [z0 - m, z0, z1, z1 + m], us = [0, 0.22, 0.78, 1], base = P.length / 3;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { P.push(xs[i], 0.055, zs[j]); U.push(us[i], 1 - us[j]); }
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const a = base + j * 4 + i; I.push(a, a + 4, a + 1, a + 1, a + 4, a + 5); }
    };
    for (const [x0, x1, z0, z1] of blocks) { const w = x1 - x0, dd = z1 - z0; if (w < 0.1 || dd < 0.1 || w * dd > 40) continue; quad9(x0 + 0.04, z0 + 0.04, x1 - 0.04, z1 - 0.04, Math.min(0.32, 0.12 + Math.min(w, dd) * 0.2)); }
    const g1 = new THREE.BufferGeometry(); g1.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g1.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2)); g1.setIndex(I);
    // wall strips: dark at the wall on the floor, dark at the floor on the wall, a hint at the ceiling line
    const P2 = [], U2 = [], I2 = [];
    const quad = (a, b, c, d, va, vb) => { const base = P2.length / 3; P2.push(...a, ...b, ...c, ...d); U2.push(0, va, 1, va, 1, vb, 0, vb); I2.push(base, base + 1, base + 2, base, base + 2, base + 3); };
    for (const p of pieces) for (const [, s] of Object.entries(p.w.rooms)) {
      const f = p.w.at + s * (T / 2 + 0.003), n = f + s * 0.5;
      const L = (u, y, off) => p.w.axis === "x" ? [u, y, off] : [off, y, u];
      if (p.y0 < 0.01) { quad(L(p.a, 0.056, f), L(p.b, 0.056, f), L(p.b, 0.056, n), L(p.a, 0.056, n), 1, 0); quad(L(p.a, 0.06, f), L(p.b, 0.06, f), L(p.b, 0.55, f), L(p.a, 0.55, f), 0.8, 0); }
      if (p.y1 > H - 0.01) quad(L(p.a, H - 0.02, f), L(p.b, H - 0.02, f), L(p.b, H - 0.45, f), L(p.a, H - 0.45, f), 0.55, 0);
    }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(P2, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(U2, 2)); g2.setIndex(I2);
    own.push(g1, g2);
    const m1 = new THREE.Mesh(g1, aoMat), m2 = new THREE.Mesh(g2, stripMat); m1.renderOrder = 1; m2.renderOrder = 1;
    return [m1, m2];
  }

  // ------------------------------------------------------------------------------------------
  // decor → furniture choices
  // ------------------------------------------------------------------------------------------
  function decorSpec() {
    const d = st.decor, o = k => DECOR[k].opts[d[k]] || DECOR[k].opts[0];
    const col = k => (o(k).none ? null : o(k).c);
    const t = o("table");
    return {
      spec: {
        sofa: col("sofa"), bed: col("bed"), rug: col("rug"), tv: col("tv"), art: col("art"), lamp: col("lamp"),
        plant: o("plant").none ? null : o("plant").n.toLowerCase(),
        table: t.none ? null : t.n === "Glass" ? { glass: true } : { wood: t.c },
        accent: col("lamp") || 0xd8cfb8,
      },
      wall: o("wall").c, wallMat: o("wall").mat, floor: o("floor").tex,
    };
  }

  // ------------------------------------------------------------------------------------------
  // enter / leave
  // ------------------------------------------------------------------------------------------
  let prop = null;
  function open(plan, opts, P) {
    if (B) dispose(B);
    B = build(plan, opts);
    addBeams(B);
    B.group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) roomLit(o.material); });
    for (const n of crew) n.ch.group.traverse(o => o.isMesh && roomLit(o.material));
    if (g.player && g.player().ch) g.player().ch.group.traverse(o => o.isMesh && roomLit(o.material));
    B.keys.slice(0, MAX_ROOMS).forEach((k, i) => {
      const r = B.raw[k], c = new THREE.Color(B.plan.rooms[k].light[0]).multiplyScalar((B.plan.ambient ?? 0.6) * 1.05);
      RL.uRoomBox.value[i].set(ROOM.x + r.x0, ROOM.z + r.z0, ROOM.x + r.x1, ROOM.z + r.z1);
      RL.uRoomAmb.value[i].set(c.r, c.g, c.b, B.grp[k]);
    });
    RL.uRLRooms.value = Math.min(MAX_ROOMS, B.keys.length); RL.uRLOn.value = 1;
    g.sky.indoor = true;
    pickLights(B.exit.x, B.exit.z);
    root.add(B.group); root.visible = true; S.inside = true; S.room = null; S.bakeT = 0;
    staff(B.npcs);
    dip();
    if (g.indoor) g.indoor(plan === PLANS.club ? "club" : "in");
    const e = B.exit; P.x = ROOM.x + e.x; P.z = ROOM.z + e.z - 0.3; P.y = 0; P.vy = 0; P.yaw = Math.PI; P.speed = 0;
    S.snap = true;
  }
  function enter(pr, P) {
    prop = pr; S.pr = pr;
    const ds = decorSpec();
    open(PLANS[pr.id] || PLANS.condo, { decor: ds.spec, wall: ds.wall, wallMat: ds.wallMat, floor: ds.floor, label: pr.label }, P);
    g.sound("door", 0.6); g.toast("🏠 " + pr.label + " · the front door takes you back out");
  }
  function enterVenue(id, P) {
    const place = PLACES[id], theme = VENUES[id];
    prop = { id, p: place, label: place.label || id, theme }; S.pr = prop;
    open(PLANS[theme], { place, label: prop.label }, P);
    g.sound("door", 0.6); g.toast("🚪 " + prop.label + " · the front door takes you back out");
  }
  function exit(P) {
    const p = prop.p;
    S.inside = false; root.visible = false; light.intensity = 0; light2.intensity = 0; amb.intensity = 0; spot.intensity = 0; staff([]);
    if (B) { dispose(B); B = null; }
    if (envRT) { envRT.dispose(); envRT = null; } if (g.sky.envTex) scene.environment = g.sky.envTex();
    RL.uRLOn.value = 0; RL.uRLN.value = 0; g.sky.indoor = false;
    dip(); if (g.indoor) g.indoor(null);
    P.x = p.x + Math.sin(p.face) * 2; P.z = p.z + Math.cos(p.face) * 2; P.y = 0; P.yaw = p.face; P.speed = 0;
    g.sound("door", 0.6); g.save();
  }
  // redecorating rebuilds the home around you, keeping you where you stand
  function rebuildHome(P) {
    const x = P.x, z = P.z, yaw = P.yaw;
    enter(prop, P); P.x = x; P.z = z; P.yaw = yaw;
  }

  // ------------------------------------------------------------------------------------------
  // people
  // ------------------------------------------------------------------------------------------
  function staff(list) {
    for (const n of crew) n.ch.group.visible = false;
    list.forEach((it, i) => {
      if (!crew[i]) { const ch = makeCharacter(randomLook(Math.random)); scene.add(ch.group); crew[i] = { ch, base: { ...ch.look } }; }
      const n = crew[i]; Object.assign(n, { x: it.x, z: it.z, yaw: it.yaw, pose: it.pose, phase: Math.random() * 6, path: it.path || null, stop: it.stop || "stand", pi: 0, wait: Math.random() * 3, walking: false, wp: 0 });
      Object.assign(n.ch.look, n.base, it.look || {}); n.ch.look.armCol = n.ch.look.sleeveless ? n.ch.look.skin : n.ch.look.shirt; n.ch.look.shinCol = n.ch.look.shorts ? n.ch.look.skin : n.ch.look.pants; n.ch.recolor();
      n.ch.group.visible = true;
    });
    S.npcN = list.length;
  }
  const SIT = { thighL: -1.5, thighR: -1.5, kneeL: 1.5, kneeR: 1.5 };
  function poseCrew(time, dt) {
    for (let i = 0; i < S.npcN; i++) {
      const n = crew[i];
      // people with somewhere to be walk a loop of stops, pausing at each one
      if (n.path) {
        if (n.wait > 0) { n.wait -= dt; n.walking = false; }
        else {
          const [tx, tz, ty] = n.path[n.pi], dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
          if (d < 0.08) { n.pi = (n.pi + 1) % n.path.length; n.wait = 2 + Math.random() * 4; if (ty !== undefined) n.yaw = ty; n.walking = false; }
          else { const sp = Math.min(d, dt * 1.05); n.x += dx / d * sp; n.z += dz / d * sp; n.yaw = lerpA(n.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); n.walking = true; n.wp += dt * 1.05 * 2.25; }
        }
        if (n.walking) { n.ch.pose(ROOM.x + n.x, 0.04, ROOM.z + n.z, n.yaw, n.wp, 0.45); continue; }
      }
      const x = ROOM.x + n.x, z = ROOM.z + n.z, t = time + n.phase, pose = n.path ? n.stop : n.pose;
      if (pose === "type") n.ch.pose(x, -0.42, z, n.yaw, 0, 0.04, { override: { ...SIT, armL: -1.15, armR: -1.15, elbowL: -0.45 + Math.sin(t * 17) * 0.06, elbowR: -0.45 + Math.sin(t * 15 + 1) * 0.06, lean: 0.12 }, headPitch: 0.1 });
      else if (pose === "cook") n.ch.pose(x, 0.04, z, n.yaw, t * 0.9, 0.04, { override: { armL: -1.0, elbowL: -0.9, armR: -1.1 + Math.sin(t * 5) * 0.2, elbowR: -0.8 + Math.cos(t * 5) * 0.25, lean: 0.12 } });
      else if (pose === "wipe") n.ch.pose(x, 0.04, z, n.yaw, t * 0.9, 0.04, { override: { armR: -1.25 + Math.sin(t * 3) * 0.15, elbowR: -0.4 + Math.cos(t * 3) * 0.3, armL: -0.3, lean: 0.2 } });
      else if (pose === "look") n.ch.pose(x, 0.04, z, n.yaw, t * 0.5, 0.04, { override: { armL: 0.25, armR: 0.25, elbowL: -0.5, elbowR: -0.5 }, headPitch: -0.28 + Math.sin(t * 0.4) * 0.08 });
      else if (pose === "phone") n.ch.pose(x, 0.04, z, n.yaw + Math.sin(t * 0.3) * 0.4, t * 0.9, 0.04, { override: { armR: -2.6, elbowR: -2.3, armL: -0.2 } });
      else if (n.pose === "dance") n.ch.pose(x, 0.06, z, n.yaw + Math.sin(t * 1.3) * 0.7, t * 5, 0.5, { override: { armL: -2.3 + Math.sin(t * 5) * 0.6, armR: -2.1 - Math.sin(t * 5) * 0.6, elbowL: -0.7, elbowR: -0.7 } });
      else if (n.pose === "dj") n.ch.pose(x, 0, z, n.yaw, t * 0.9, 0.04, { override: { armL: -1.0 + Math.sin(t * 4.4) * 0.15, armR: -1.1, elbowL: -0.9, elbowR: -1.0, lean: 0.25 + Math.sin(t * 4.4) * 0.08 }, headPitch: Math.sin(t * 8.8) * 0.18 });
      else if (n.pose === "sit") n.ch.pose(x, -0.42, z, n.yaw, 0, 0.04, { override: { ...SIT, armL: -0.35, armR: -0.3, elbowL: -1.05, elbowR: -1.1, lean: -0.05 } });
      else if (n.pose === "sitlow") n.ch.pose(x, -0.36, z, n.yaw, 0, 0.04, { override: { ...SIT, lean: 0.35, armL: -0.3, armR: -0.3, elbowL: -1.3, elbowR: -1.3 } });
      else if (n.pose === "perch") n.ch.pose(x, -0.12, z, n.yaw, 0, 0.04, { override: { thighL: -1.35, thighR: -1.35, kneeL: 1.6, kneeR: 1.4, armL: -0.9, armR: -0.7, elbowL: -1.0, elbowR: -1.1 } });
      else if (n.pose === "lie") n.ch.pose(x, 0.58, z, n.yaw, 0, 0.0, { tilt: -1.45, override: { bob: -0.72, thighL: 0, thighR: 0, kneeL: 0.1, kneeR: 0.1, armL: 0, armR: 0, elbowL: -0.2, elbowR: -0.2, lean: 0 } });
      else n.ch.pose(x, 0.04, z, n.yaw, t * 0.9, 0.04);
    }
  }
  const lerpA = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  // ---- sunbeams: shafts of light through the windows with dust drifting in them, fading at dusk ----
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const patchTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 128, 128); x.shadowColor = "#fff"; x.shadowBlur = 10; x.fillStyle = "#fff"; for (const [px, py] of [[10, 10], [68, 10], [10, 68], [68, 68]]) x.fillRect(px, py, 50, 50); return new THREE.CanvasTexture(c); })();
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, color: new THREE.Color(1.0, 0.85, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -14 });
  const dustMat = new THREE.PointsMaterial({ color: 0xffe8c0, size: 0.022, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  function sunbeams(night) {
    if (!B || !B.beams) return;
    const day = Math.max(0, 1 - night * 1.6) * (1 - (g.sky.weatherDim || 0) * 0.85) * (g.sky.state.elev > 0 ? 1 : 0);
    beamMat.opacity = 0.1 * day; patchMat.opacity = 0.55 * day; dustMat.opacity = 0.8 * day;
    for (const b of B.beams) { const p = b.dust.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - 0.0015 + Math.sin(i + performance.now() * 0.0004) * 0.0008; if (y < 0.1) y = 2.1; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(i * 7 + performance.now() * 0.0003) * 0.0006); } p.needsUpdate = true; }
  }
  function addBeams(b) {
    b.beams = [];
    if (!b.plan.home && !b.plan.sunbeams) return;
    for (const w of b.walls) if (w.outer) for (const o of w.openings) if (o.kind === "outwin") {
      const s = Object.values(w.rooms)[0], inward = s, a = o.c - o.w / 2 + 0.05, c = o.c + o.w / 2 - 0.05;
      const drop = [0.95, 1.2];                           // floor distance the light lands in front of the sill
      const P = (u, y, n) => w.axis === "x" ? [u, y, w.at + inward * n] : [w.at + inward * n, y, u];
      const top = [P(a, o.y1, 0.08), P(c, o.y1, 0.08)], bot = [P(a, o.y0, 0.08), P(c, o.y0, 0.08)];
      const flr = [P(a + 0.25, 0.06, 0.08 + o.y1 * drop[0] + 0.6), P(c + 0.25, 0.06, 0.08 + o.y1 * drop[0] + 0.6)], fln = [P(a + 0.25, 0.06, 0.08 + o.y0 * drop[1]), P(c + 0.25, 0.06, 0.08 + o.y0 * drop[1])];
      const pos = [], col = [], idx = [], warm = [1.0, 0.85, 0.6];
      const v = (p, k) => { pos.push(...p); col.push(warm[0] * k, warm[1] * k, warm[2] * k); return pos.length / 3 - 1; };
      const t0 = v(top[0], 1), t1 = v(top[1], 1), b0 = v(bot[0], 1), b1 = v(bot[1], 1), f0 = v(flr[0], 0.05), f1 = v(flr[1], 0.05), n0 = v(fln[0], 0.05), n1 = v(fln[1], 0.05);
      idx.push(t0, t1, f1, t0, f1, f0, b0, b1, n1, b0, n1, n0, t0, f0, n0, t0, n0, b0, t1, f1, n1, t1, n1, b1);
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
      const beam = new THREE.Mesh(geo, beamMat); beam.renderOrder = 4; b.group.add(beam); b.own.push(geo);
      // the bright patch on the floor
      const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute([...fln[0], ...fln[1], ...flr[1], ...flr[0]], 3)); pg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); pg.setIndex([0, 1, 2, 0, 2, 3]);
      const patch = new THREE.Mesh(pg, patchMat); patch.renderOrder = 2; b.group.add(patch); b.own.push(pg);
      // dust motes in the shaft
      const dp = [];
      for (let i = 0; i < 60; i++) { const k = Math.random(), u = Math.random(), yy = 0.2 + Math.random() * 1.9; const P0 = P(a + (c - a) * u + 0.1, yy, 0.1 + (2.2 - yy) * 0.6 * k + 0.2); dp.push(...P0); }
      const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
      const dust = new THREE.Points(dg, dustMat); b.group.add(dust); b.own.push(dg);
      b.beams.push({ dust });
    }
  }

  // ------------------------------------------------------------------------------------------
  // play: walls & furniture, the room cam, lights, actions
  // ------------------------------------------------------------------------------------------
  function roomAt(lx, lz) {
    for (const k of B.keys) { const r = B.raw[k]; if (lx >= r.x0 - 0.01 && lx <= r.x1 + 0.01 && lz >= r.z0 - 0.01 && lz <= r.z1 + 0.01) return k; }
    return B.keys[0];
  }
  function confine(P) {
    if (!B) return;
    let lx = P.x - ROOM.x, lz = P.z - ROOM.z;
    const r = 0.3;
    lx = clamp(lx, -B.W / 2 + T / 2 + r, B.W / 2 - T / 2 - r); lz = clamp(lz, -B.D / 2 + T / 2 + r, B.D / 2 - T / 2 - r);
    for (let pass = 0; pass < 2; pass++) for (const [x0, x1, z0, z1] of pass ? B.dyn : B.blocks.concat(B.dyn)) {
      if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) {
        const pl = lx - (x0 - r), pr = (x1 + r) - lx, pb = lz - (z0 - r), pf = (z1 + r) - lz, m = Math.min(pl, pr, pb, pf);
        if (m === pl) lx = x0 - r; else if (m === pr) lx = x1 + r; else if (m === pb) lz = z0 - r; else lz = z1 + r;
      }
    }
    P.x = ROOM.x + lx; P.z = ROOM.z + lz; P.y = 0.04; P.grounded = true; P.vy = Math.min(P.vy, 0);
  }
  // a camera up in a corner of the room you're in: it cuts when you walk through a doorway, set on
  // the wall you came in by and sliding along it to keep you framed
  function camera(cam, P, dt) {
    const lx = P.x - ROOM.x, lz = P.z - ROOM.z, k = roomAt(lx, lz), r = B.R[k];
    if (k !== S.room) {
      S.room = k; S.snap = true;
      const dists = [["x0", lx - r.x0], ["x1", r.x1 - lx], ["z0", lz - r.z0], ["z1", r.z1 - lz]];
      S.side = pickSide(r, lx, lz, P);
      const m = Math.min(r.w, r.d); S.fov = m < 3.8 ? 74 : m < 5 ? 66 : 58;
      const L = B.plan.rooms[k].light; light.color.setHex(L[0]); light.position.set(r.cx, B.H - 0.45, r.cz);
      S.light = L[1] * Math.min(1.35, Math.max(1, Math.sqrt(r.w * r.d / 40)));      // bigger rooms need more light
      spot.color.setHex(L[0]); spot.position.set(r.cx, B.H - 0.06, r.cz); spot.target.position.set(r.cx, 0, r.cz);
      spot.angle = Math.min(1.3, Math.atan(Math.hypot(r.w, r.d) / 2 / B.H) * 1.15); spot.distance = B.H * 3.2; spot.shadow.camera.far = B.H + 1;
      S.bakeRoom = r; S.bakeRaw = B.raw[k]; S.bakeT = 0.02; S.bakes = 2;
      pickLights(lx, lz);          // capture the room for reflections (twice: the second sees the first's bounce)
      // the neighbour through the nearest opening gets the fill light
      let best = null, bd = Infinity;
      for (const dr of B.doors) if (dr.a === k || dr.b === k) { const dd = (dr.x - lx) ** 2 + (dr.z - lz) ** 2; if (dd < bd) { bd = dd; best = dr; } }
      if (best) { const o = B.R[best.a === k ? best.b : best.a], L2 = B.plan.rooms[best.a === k ? best.b : best.a].light; light2.color.setHex(L2[0]); light2.position.set(o.cx, B.H - 0.45, o.cz); S.light2 = L2[1] * 0.7; } else S.light2 = 0;
    }
    // something got in the way for a moment: cut to a better wall
    S.occT = (S.occT || 0) + dt;
    if (S.occT > 0.35) { S.occT = 0; S.blockedT = occluded(S.side, r, lx, lz, P) ? (S.blockedT || 0) + 0.35 : 0; if (S.blockedT > 0.7) { S.blockedT = 0; const ns = pickSide(r, lx, lz, P); if (ns !== S.side) { S.side = ns; S.snap = true; } } }
    let [tx, tz] = camSpot(S.side, r, lx, lz);
    // big halls: don't let the camera sit miles away
    const dd = Math.hypot(tx - lx, tz - lz), max = 8.5;
    if (dd > max) { tx = lx + (tx - lx) * max / dd; tz = lz + (tz - lz) * max / dd; }
    const kk = S.snap ? 1 : 1 - Math.exp(-dt * 3);
    S.camX += (ROOM.x + tx - S.camX) * kk; S.camZ += (ROOM.z + tz - S.camZ) * kk; S.snap = false;
    // higher when you're far away, lower up close: a three-quarter view rather than looking down on your head
    const y = camY(tx, tz, lx, lz);
    S.camY += (y - S.camY) * (kk === 1 ? 1 : kk);
    cam.position.set(S.camX, S.camY, S.camZ);
    cam.lookAt(P.x, 1.05, P.z);
    if (cam.fov !== S.fov) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
    return Math.atan2(P.x - S.camX, P.z - S.camZ);
  }
  // the nearest wall that sits a comfortable distance away and actually has a clear view of you
  function pickSide(r, lx, lz, P) {
    const c = [["x0", lx - r.x0], ["x1", r.x1 - lx], ["z0", lz - r.z0], ["z1", r.z1 - lz]].filter(([s]) => (s[0] === "x" ? r.d : r.w) > 2.2);
    const score = ([, d]) => (d < 1.9 ? 10 + (1.9 - d) : 0) + d * 0.1;
    c.sort((a, b) => score(a) - score(b));
    for (const [s] of c) if (!occluded(s, r, lx, lz, P)) return s;
    return c[0][0];
  }
  const rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
  function camY(tx, tz, lx, lz) { return clamp(1.75 + Math.hypot(tx - lx, tz - lz) * 0.26, 2.05, Math.min(B.H - 0.3, 3.4)); }
  function occluded(side, r, lx, lz, P) {
    const [tx, tz] = camSpot(side, r, lx, lz);
    _o.set(ROOM.x + tx, camY(tx, tz, lx, lz), ROOM.z + tz); _d.set(P.x, 1.35, P.z).sub(_o);
    const dist = _d.length(); _d.normalize();
    rc.set(_o, _d); rc.far = dist - 0.35;
    B.group.updateMatrixWorld(true);
    return rc.intersectObject(B.group, true).some(h => !(h.object.material && h.object.material.transparent) && !h.object.isInstancedMesh);
  }
  // the lights the GPU gets: everything in your room (and its open-plan neighbours) first, then the nearest
  function pickLights(lx, lz) {
    if (!B) return;
    const k = roomAt(lx, lz), gr = B.grp[k];
    const list = B.lights.slice().sort((a, b) => ((a.group === gr ? 0 : 1000) + Math.hypot(a.x - lx, a.z - lz)) - ((b.group === gr ? 0 : 1000) + Math.hypot(b.x - lx, b.z - lz)));
    S.picked = list.slice(0, MAX_LIGHTS);
    RL.uRLN.value = S.picked.length;
  }
  function camSpot(side, r, lx, lz) {
    const inset = 0.28;
    if (side === "z0" || side === "z1") return [clamp(r.cx - (lx - r.cx) * 0.6, r.x0 + inset, r.x1 - inset), side === "z0" ? r.z0 + inset : r.z1 - inset];
    return [side === "x0" ? r.x0 + inset : r.x1 - inset, clamp(r.cz - (lz - r.cz) * 0.6, r.z0 + inset, r.z1 - inset)];
  }
  function update(dt, time) {
    if (!S.inside || !B) return;
    const night = g.sky.state.night;
    viewMat.map = night > 0.5 ? view.night : view.day;
    viewMat.color.setScalar(night > 0.5 ? 1.0 : 1.25 - (g.sky.weatherDim || 0) * 0.4);
    light.intensity = 0; light2.intensity = 0; amb.intensity = 0;
    spot.intensity = (S.light || 20) * 0.5;
    const day = Math.max(0, 1 - night * 1.6) * (1 - (g.sky.weatherDim || 0) * 0.7) * (g.sky.state.elev > 0 ? 1 : 0);
    for (let i = 0; i < S.picked.length; i++) {
      const L = S.picked[i];
      if (L.fn) L.fn(time, L);
      const I = L.day ? 9 * day : L.I;
      RL.uRLPos.value[i].set(ROOM.x + L.x, L.y, ROOM.z + L.z, L.range);
      RL.uRLCol.value[i].set(L.col.r * I, L.col.g * I, L.col.b * I, L.group);
    }
    if (S.bakes > 0 && (S.bakeT -= dt) <= 0) { bake(S.bakeRoom); S.bakes--; S.bakeT = 0.3; }
    if (envRT && scene.environment !== envRT.texture) scene.environment = envRT.texture;
    for (const u of B.updates) u(time, dt);
    for (const a of B.anims) a.update(time, dt);
    F.tickScreens(time);
    if (g.beat) g.beat();
    sunbeams(night);
    poseCrew(time, dt);
  }
  function action(P) {
    if (!S.inside || !B) return null;
    const lx = P.x - ROOM.x, lz = P.z - ROOM.z;
    if ((lx - B.exit.x) ** 2 + (lz - B.exit.z) ** 2 < 1.4) return ["EXIT", "Head back outside", () => exit(P)];
    let best = null, bd = Infinity;
    for (const s of B.spots) { const d2 = (lx - s.x) ** 2 + (lz - s.z) ** 2; if (d2 < s.r * s.r && d2 < bd) { bd = d2; best = s; } }
    if (!best) return null;
    if (best.act === "sleep") return [best.label, best.prompt, () => g.sleep()];
    if (best.act === "decorate") return [best.label, "🎨 Decorate your <b>" + prop.label + "</b>", () => panel("wall")];
    return [best.label, best.prompt, () => g.venueAction(best.act, prop)];
  }
  // the decorate panel: one slot at a time, a row to step to the next slot
  function panel(slot) {
    const rows = [];
    rows.push({ label: "ROOM", sub: Object.keys(DECOR).map(k => (k === slot ? "▸ " : "") + DECOR[k].name).join(" · "), btn: "NEXT ▸", onClick: () => { const ks = Object.keys(DECOR); panel(ks[(ks.indexOf(slot) + 1) % ks.length]); } });
    const D2 = DECOR[slot];
    D2.opts.forEach((o, i) => {
      const on = st.decor[slot] === i, cost = o.none ? 0 : D2.cost;
      rows.push({ label: D2.name.toUpperCase() + " · " + o.n + (on ? "  ✓" : ""), sub: o.none ? "Clear it out" : "$" + cost, btn: on ? "PLACED" : o.none ? "REMOVE" : "BUY", disabled: on,
        onClick: () => {
          if (cost && st.money < cost) { g.toast("You need $" + Math.ceil(cost - st.money) + " more"); return; }
          st.money -= cost; st.decor[slot] = i; g.sound("cash", 0.5); g.save();
          if (S.inside && prop && !prop.theme && g.player) rebuildHome(g.player());
          panel(slot);
        } });
    });
    g.hud.panel("DECORATE · " + D2.name.toUpperCase(), rows);
  }
  const venueAt = (x, z) => { for (const id in VENUES) { const p = PLACES[id]; if (p && (p.x - x) ** 2 + (p.z - z) ** 2 < 5) return id; } return null; };
  const doorWorld = () => prop ? { x: prop.p.x, z: prop.p.z } : { x: 0, z: 0 };
  return {
    S, enter, enterVenue, venueAt, exit, confine, camera, update, action, panel, doorWorld, ROOM,
    venue: () => B && prop && prop.theme ? { theme: prop.theme, spots: B.spots, R: B.R } : null,
    building: () => B,
    get inside() { return S.inside; },
  };
}
