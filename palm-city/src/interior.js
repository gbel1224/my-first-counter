// Palm City — home interiors. Walk through the door of a place you own and you're inside a lit,
// furnished room you decorate yourself (walls, floor, sofa, bed, rug, TV, plant, table, art, lamp),
// saved with your game. Sleep in the bed to pass the night. The room is staged just outside town,
// past the fog, and the city keeps ticking around your front door while you're in.
import * as THREE from "../vendor/three.module.js";
import { HALF, clamp } from "./world.js";

const ROOM = { x: HALF + 360, z: -HALF - 220 };
const SIZES = { apartment: [12, 9], condo: [15, 11], house: [18, 13] };
const H = 3.2;   // ceiling

// same slots and option order as the original game, so imported decor carries straight over
export const DECOR = {
  wall: { name: "Walls", opts: [{ n: "Cream", c: 0xe6dccb }, { n: "Sky", c: 0xc6d8e6 }, { n: "Sage", c: 0xc9d8c4 }, { n: "Blush", c: 0xe6ccd0 }, { n: "Slate", c: 0x8e949e }, { n: "Tan", c: 0xd8c49c }, { n: "Lilac", c: 0xd4c8e4 }], cost: 150 },
  floor: { name: "Floor", opts: [{ n: "Oak planks", tex: "wood" }, { n: "Stone tile", tex: "tile" }, { n: "Carpet", tex: "carpet" }, { n: "Polished concrete", tex: "concrete" }], cost: 400 },
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
  wood: { rough: 0.5, tex: () => canvasTex(512, (x, s) => {
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
  tile: { rough: 0.28, tex: () => canvasTex(256, (x, s) => {
    const n = 4, g = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 196 + rnd() * 20; x.fillStyle = `rgb(${v},${v - 2},${v - 8})`; x.fillRect(i * g, j * g, g, g); for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(120,110,100,${rnd() * 0.08})`; x.fillRect(i * g + rnd() * g, j * g + rnd() * g, 3 + rnd() * 8, 1 + rnd() * 3); } }
    x.strokeStyle = "#8c8680"; x.lineWidth = 3; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * g, 0); x.lineTo(i * g, s); x.moveTo(0, i * g); x.lineTo(s, i * g); x.stroke(); }
  }, 4, 4) },
  carpet: { rough: 0.97, tex: () => canvasTex(256, (x, s) => {
    x.fillStyle = "#6c5a52"; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) { const v = rnd(); x.fillStyle = v < 0.5 ? "rgba(90,74,66,.5)" : "rgba(130,112,100,.35)"; x.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
  }, 5, 5) },
  concrete: { rough: 0.38, tex: () => canvasTex(512, (x, s) => {
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

export function makeInterior(scene, g) {
  // g: { st, P, sky, toast, sound, save, hud, earn, rest(), heal() }
  const st = g.st;
  st.decor = Object.assign({}, DECOR_DEFAULT, st.decor || {});
  const root = new THREE.Group(); root.position.set(ROOM.x, 0, ROOM.z); root.visible = false; scene.add(root);
  const fixed = new THREE.Group(), furn = new THREE.Group(); root.add(fixed, furn);
  const std = (color, rough = 0.8, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: 0.35, ...extra });
  const wallMat = std(0xe6dccb, 0.92), trimMat = std(0xf2efe8, 0.5), ceilMat = std(0xf0ece4, 0.95);
  const floorMat = std(0xffffff, 0.5);
  const floorTex = {};
  const view = { day: viewTex(false), night: viewTex(true) };
  const viewMat = new THREE.MeshBasicMaterial({ map: view.day });
  const light = new THREE.PointLight(0xffd6a0, 0, 30, 1.2); light.castShadow = false; root.add(light);
  const lampLight = new THREE.PointLight(0xffd08a, 0, 9, 1.5); root.add(lampLight);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2da });
  const M = (grp, geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; grp.add(m); return m; };
  const B = (grp, w, h, d, mat, x, y, z, ry) => M(grp, new THREE.BoxGeometry(w, h, d), mat, x, y, z, ry);
  const clear = grp => { while (grp.children.length) { const c = grp.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } };

  let W = 15, D = 11, prop = null, blocks = [];
  const door = () => ({ x: W / 2 - 2.2, z: D / 2 - 0.7 });
  function buildRoom() {
    clear(fixed);
    const floor = M(fixed, new THREE.PlaneGeometry(W, D), floorMat, 0, 0.01, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    const ceil = M(fixed, new THREE.BoxGeometry(W + 0.4, 0.2, D + 0.4), ceilMat, 0, H + 0.1, 0);
    ceil.receiveShadow = false;
    const T = 0.2;
    // back wall with a window cut in it (built from four pieces around the opening)
    const wx = -W * 0.08, ww = 3.4, wy0 = 1.0, wy1 = 2.5;
    B(fixed, (W / 2 + wx - ww / 2), H, T, wallMat, (-W / 2 + (wx - ww / 2)) / 2, H / 2, -D / 2 - T / 2);
    B(fixed, (W / 2 - wx - ww / 2), H, T, wallMat, (W / 2 + (wx + ww / 2)) / 2, H / 2, -D / 2 - T / 2);
    B(fixed, ww, wy0, T, wallMat, wx, wy0 / 2, -D / 2 - T / 2);
    B(fixed, ww, H - wy1, T, wallMat, wx, (H + wy1) / 2, -D / 2 - T / 2);
    const v = M(fixed, new THREE.PlaneGeometry(ww, wy1 - wy0), viewMat, wx, (wy0 + wy1) / 2, -D / 2 - 0.35); v.castShadow = v.receiveShadow = false;
    for (const [w, h, x, y] of [[ww + 0.2, 0.1, wx, wy0], [ww + 0.2, 0.1, wx, wy1], [0.1, wy1 - wy0, wx - ww / 2, (wy0 + wy1) / 2], [0.1, wy1 - wy0, wx + ww / 2, (wy0 + wy1) / 2], [0.06, wy1 - wy0, wx, (wy0 + wy1) / 2]])
      B(fixed, w, h, 0.14, trimMat, x, y, -D / 2 + 0.02);
    B(fixed, ww + 0.3, 0.06, 0.3, trimMat, wx, wy0 - 0.02, -D / 2 + 0.12);                 // sill
    // side walls
    B(fixed, T, H, D + T * 2, wallMat, -W / 2 - T / 2, H / 2, 0);
    B(fixed, T, H, D + T * 2, wallMat, W / 2 + T / 2, H / 2, 0);
    // front wall with the front door
    const dr = door(), dw = 1.3;
    B(fixed, (dr.x - dw / 2) + W / 2, H, T, wallMat, (-W / 2 + dr.x - dw / 2) / 2, H / 2, D / 2 + T / 2);
    B(fixed, W / 2 - (dr.x + dw / 2), H, T, wallMat, (W / 2 + dr.x + dw / 2) / 2, H / 2, D / 2 + T / 2);
    B(fixed, dw, H - 2.3, T, wallMat, dr.x, (H + 2.3) / 2, D / 2 + T / 2);
    const doorMat = std(0x4a3222, 0.6);
    B(fixed, dw - 0.06, 2.26, 0.08, doorMat, dr.x, 1.13, D / 2 + 0.05);
    for (const [w, h, x, y] of [[0.1, 2.35, dr.x - dw / 2, 1.17], [0.1, 2.35, dr.x + dw / 2, 1.17], [dw + 0.2, 0.1, dr.x, 2.33]]) B(fixed, w, h, 0.16, trimMat, x, y, D / 2 - 0.02);
    M(fixed, new THREE.SphereGeometry(0.05, 8, 6), std(0xc8b27a, 0.3, 0.9), dr.x - dw / 2 + 0.18, 1.05, D / 2 - 0.02);
    const mat = M(fixed, new THREE.PlaneGeometry(1.2, 0.7), std(0x3a3430, 1), dr.x, 0.02, D / 2 - 0.6); mat.rotation.x = -Math.PI / 2;
    // baseboards
    for (const [w, d, x, z] of [[W, 0.04, 0, -D / 2 + 0.02], [0.04, D, -W / 2 + 0.02, 0], [0.04, D, W / 2 - 0.02, 0]]) B(fixed, w, 0.12, d, trimMat, x, 0.06, z);
    // ceiling light
    const fix = M(fixed, new THREE.CylinderGeometry(0.45, 0.5, 0.08, 20), bulbMat, 0, H - 0.04, 0); fix.castShadow = false;
    light.position.set(0, H - 0.4, 0);
    // kitchenette along the left wall, near the front
    const cab = std(0x33363a, 0.55), top = std(0xd8d4cc, 0.25), steel = std(0xb8bcc0, 0.3, 0.8);
    const kz0 = 0.4, kz1 = D / 2 - 0.4, kl = kz1 - kz0, kc = (kz0 + kz1) / 2;
    B(fixed, 0.65, 0.88, kl - 0.9, cab, -W / 2 + 0.33, 0.44, kc + 0.45);
    B(fixed, 0.7, 0.05, kl - 0.9, top, -W / 2 + 0.35, 0.9, kc + 0.45);
    B(fixed, 0.72, 1.9, 0.8, steel, -W / 2 + 0.36, 0.95, kz0 + 0.4);                     // fridge
    B(fixed, 0.36, 0.7, kl - 0.9, cab, -W / 2 + 0.18, 2.0, kc + 0.45);                     // upper cabinets
    B(fixed, 0.4, 0.02, 0.6, std(0x151515, 0.3), -W / 2 + 0.36, 0.93, kc + 0.8);            // hob
    blocks = [[-W / 2, -W / 2 + 0.75, kz0, kz1]];
    // a bookshelf by the door
    const shelf = std(0x5a4030, 0.7);
    B(fixed, 1.6, 2.0, 0.4, shelf, W / 2 - 4.0, 1.0, D / 2 - 0.25);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) if (rnd() < 0.8) B(fixed, 0.14, 0.3 + rnd() * 0.1, 0.26, std([0x7a2e2e, 0x2e4a7a, 0xc8b27a, 0x3a5a3a, 0xd8d0c0][Math.floor(rnd() * 5)], 0.8), W / 2 - 4.65 + k * 0.24, 0.35 + i * 0.47, D / 2 - 0.27);
    blocks.push([W / 2 - 4.85, W / 2 - 3.15, D / 2 - 0.5, D / 2]);
  }

  function buildFurniture() {
    clear(furn);
    const d = st.decor, opt = k => DECOR[k].opts[d[k]] || DECOR[k].opts[0];
    wallMat.color.setHex(opt("wall").c);
    const ft = opt("floor").tex; floorTex[ft] = floorTex[ft] || FLOORS[ft].tex();
    floorMat.map = floorTex[ft]; floorMat.roughness = FLOORS[ft].rough; floorMat.needsUpdate = true;
    const fb = blocks.slice(0, 2);
    const lx = W / 2 - 3.2, lz = -0.6;                     // the living area, facing the TV on the right wall
    let o;
    o = opt("rug"); if (!o.none) {
      const c = new THREE.Color(o.c), tex = canvasTex(256, (x, s) => { x.fillStyle = "#" + c.getHexString(); x.fillRect(0, 0, s, s); x.strokeStyle = "rgba(240,230,210,.55)"; x.lineWidth = 8; x.strokeRect(18, 18, s - 36, s - 36); x.lineWidth = 3; x.strokeRect(34, 34, s - 68, s - 68); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; x.fillRect(rnd() * s, rnd() * s, 2, 2); } }, 1, 1);
      const r = M(furn, new THREE.PlaneGeometry(4.2, 3.0), std(0xffffff, 1, 0, { map: tex }), lx, 0.025, lz); r.rotation.x = -Math.PI / 2; r.rotation.z = Math.PI / 2; r.castShadow = false;
    }
    o = opt("sofa"); if (!o.none) {
      const m = std(o.c, 0.95), sx = lx - 2.3;
      B(furn, 0.95, 0.42, 2.6, m, sx, 0.3, lz); B(furn, 0.28, 0.55, 2.6, m, sx - 0.36, 0.72, lz);
      for (const z of [-1.2, 1.2]) B(furn, 0.95, 0.62, 0.22, m, sx, 0.4, lz + z);
      for (const z of [-0.6, 0.6]) B(furn, 0.7, 0.14, 1.12, std(o.c, 1), sx + 0.08, 0.57, lz + z);
      for (const z of [-1.1, 1.1]) for (const x of [-0.4, 0.4]) B(furn, 0.06, 0.1, 0.06, std(0x222222, 0.5), sx + x, 0.05, lz + z * 1.1);
      fb.push([sx - 0.5, sx + 0.5, lz - 1.35, lz + 1.35]);
    }
    o = opt("table"); if (!o.none) {
      const glass = d.table === 3, m = glass ? std(o.c, 0.05, 0, { transparent: true, opacity: 0.45 }) : std(o.c, 0.45);
      B(furn, 0.9, 0.05, 1.5, m, lx - 0.7, 0.42, lz);
      for (const x of [-0.38, 0.38]) for (const z of [-0.66, 0.66]) B(furn, 0.05, 0.4, 0.05, std(glass ? 0xb0b4b8 : o.c, 0.4, glass ? 0.8 : 0), lx - 0.7 + x, 0.2, lz + z);
      B(furn, 0.22, 0.03, 0.3, std(0xd8d0c0, 0.8), lx - 0.6, 0.46, lz + 0.3, 0.3);             // a magazine
      fb.push([lx - 1.2, lx - 0.2, lz - 0.8, lz + 0.8]);
    }
    o = opt("tv"); if (!o.none) {
      const tx = W / 2 - 0.35;
      B(furn, 0.5, 0.5, 2.2, std(o.c, 0.5), tx, 0.25, lz);
      B(furn, 0.06, 0.95, 1.7, std(0x0a0a0c, 0.2, 0.3), tx - 0.02, 1.1, lz);
      const scr = M(furn, new THREE.PlaneGeometry(1.6, 0.86), new THREE.MeshBasicMaterial({ color: 0x2a4a7a }), tx - 0.06, 1.1, lz, -Math.PI / 2); scr.castShadow = false; tvScreen = scr;
      fb.push([tx - 0.3, W / 2, lz - 1.15, lz + 1.15]);
    } else tvScreen = null;
    o = opt("bed"); if (!o.none) {
      const bx = -W / 2 + 2.1, bz = -D / 2 + 1.3, frame = std(0x4a3626, 0.6);
      B(furn, 1.9, 0.35, 2.3, frame, bx, 0.18, bz);
      B(furn, 2.0, 1.1, 0.12, frame, bx, 0.55, -D / 2 + 0.08);                                // headboard
      B(furn, 1.8, 0.25, 2.15, std(0xf0ece2, 0.9), bx, 0.47, bz + 0.05);                   // mattress
      B(furn, 1.84, 0.1, 1.5, std(o.c, 0.95), bx, 0.62, bz + 0.38);                          // duvet
      for (const x of [-0.45, 0.45]) B(furn, 0.7, 0.14, 0.4, std(0xf6f2ea, 0.95), bx + x, 0.66, -D / 2 + 0.45);
      B(furn, 0.5, 0.5, 0.45, frame, bx + 1.35, 0.25, -D / 2 + 0.3);                          // nightstand
      bedPos = { x: bx, z: bz };
      fb.push([bx - 1.0, bx + 1.6, -D / 2, bz + 1.2]);
    } else bedPos = null;
    o = opt("plant"); if (!o.none) {
      const px = W / 2 - 0.6, pz = -D / 2 + 0.6, pot = std(0x7a4a2e, 0.8), leaf = std(o.c, 0.8);
      M(furn, new THREE.CylinderGeometry(0.28, 0.2, 0.5, 14), pot, px, 0.25, pz);
      if (d.plant === 3) { M(furn, new THREE.CylinderGeometry(0.12, 0.14, 1.1, 10), leaf, px, 1.0, pz); M(furn, new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8), leaf, px + 0.2, 1.05, pz).rotation.z = -0.9; }
      else for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, l = M(furn, new THREE.ConeGeometry(0.16, 0.9, 5), leaf, px + Math.cos(a) * 0.22, 0.95, pz + Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); }
      fb.push([px - 0.35, px + 0.35, pz - 0.35, pz + 0.35]);
    }
    o = opt("art"); if (!o.none) {
      const c = new THREE.Color(o.c), ax = W / 2 - 3.2, tex = canvasTex(256, (x, s) => {
        const gr = x.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, "#" + c.clone().offsetHSL(0, 0, 0.2).getHexString()); gr.addColorStop(1, "#" + c.clone().offsetHSL(0.05, 0, -0.2).getHexString()); x.fillStyle = gr; x.fillRect(0, 0, s, s);
        for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${rnd() * 0.18})`; x.beginPath(); x.arc(rnd() * s, rnd() * s, 10 + rnd() * 60, 0, 7); x.fill(); }
      }, 1, 1);
      B(furn, 2.0, 1.3, 0.06, std(0x1e1a14, 0.5), ax, 1.9, -D / 2 + 0.03);
      M(furn, new THREE.PlaneGeometry(1.84, 1.14), std(0xffffff, 0.9, 0, { map: tex }), ax, 1.9, -D / 2 + 0.07).castShadow = false;
    }
    o = opt("lamp"); lampLight.intensity = 0;
    if (!o.none) {
      const px = lx - 2.3, pz = lz - 1.75;
      M(furn, new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), std(0x1e1e22, 0.4, 0.6), px, 0.03, pz);
      M(furn, new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), std(0x1e1e22, 0.4, 0.6), px, 0.8, pz);
      M(furn, new THREE.CylinderGeometry(0.2, 0.32, 0.4, 16, 1, true), std(0xf0e8d8, 0.9, 0, { side: THREE.DoubleSide, emissive: o.c, emissiveIntensity: 0.6 }), px, 1.7, pz);
      lampLight.color.setHex(o.c); lampLight.position.set(px, 1.6, pz); lampLight.intensity = 6;
      fb.push([px - 0.25, px + 0.25, pz - 0.25, pz + 0.25]);
    }
    blocks = fb;
  }
  let tvScreen = null, bedPos = null;

  const S = { inside: false, pr: null, camX: 0, camZ: 0 };
  function enter(pr, P) {
    prop = pr; S.pr = pr; [W, D] = SIZES[pr.id] || SIZES.condo;
    buildRoom(); buildFurniture();
    root.visible = true; S.inside = true;
    light.intensity = 38;
    const dr = door();
    P.x = ROOM.x + dr.x; P.z = ROOM.z + dr.z - 0.6; P.y = 0; P.vy = 0; P.yaw = Math.PI; P.speed = 0;
    S.camX = ROOM.x + dr.x; S.camZ = ROOM.z + D / 2 - 0.3; S.snap = true;
    g.sound("door", 0.6); g.toast("🏠 " + pr.label + " · walk to the door to leave");
  }
  function exit(P) {
    const p = prop.p;
    S.inside = false; root.visible = false; light.intensity = 0; lampLight.intensity = 0;
    P.x = p.x + Math.sin(p.face) * 2; P.z = p.z + Math.cos(p.face) * 2; P.y = 0; P.yaw = p.face; P.speed = 0;
    g.sound("door", 0.6); g.save();
  }
  // keep the player inside the walls and out of the furniture
  function confine(P) {
    let lx = P.x - ROOM.x, lz = P.z - ROOM.z;
    const r = 0.32;
    lx = clamp(lx, -W / 2 + r, W / 2 - r); lz = clamp(lz, -D / 2 + r, D / 2 - r);
    for (const [x0, x1, z0, z1] of blocks) {
      if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) {
        const pl = lx - (x0 - r), pr = (x1 + r) - lx, pb = lz - (z0 - r), pf = (z1 + r) - lz, m = Math.min(pl, pr, pb, pf);
        if (m === pl) lx = x0 - r; else if (m === pr) lx = x1 + r; else if (m === pb) lz = z0 - r; else lz = z1 + r;
      }
    }
    P.x = ROOM.x + lx; P.z = ROOM.z + lz; P.y = 0; P.grounded = true; P.vy = Math.min(P.vy, 0);
  }
  // corner camera across the room from you, looking in
  function camera(cam, P, dt) {
    const lx = P.x - ROOM.x;
    const tx = ROOM.x + clamp(-lx * 0.7, -W / 2 + 0.7, W / 2 - 0.7), tz = ROOM.z + D / 2 - 0.35;
    const k = S.snap ? 1 : 1 - Math.exp(-dt * 2.5); S.snap = false;
    S.camX += (tx - S.camX) * k; S.camZ += (tz - S.camZ) * k;
    cam.position.set(S.camX, H - 0.35, S.camZ);
    cam.lookAt(P.x, 1.0, P.z);
    return Math.atan2(P.x - S.camX, P.z - S.camZ);          // "forward" for the stick
  }
  function update(dt, time) {
    if (!S.inside) return;
    const night = g.sky.state.night;
    viewMat.map = night > 0.5 ? view.night : view.day;
    const b = night > 0.5 ? 1.0 : 1.25 - (g.sky.weatherDim || 0) * 0.4; viewMat.color.setScalar(b);
    light.intensity = 26 + night * 14;
    if (tvScreen) { const f = 0.7 + Math.sin(time * 7) * 0.08 + Math.sin(time * 2.3) * 0.12; tvScreen.material.color.setRGB(0.25 * f, 0.45 * f, 0.8 * f); }
  }
  function action(P) {
    if (!S.inside) return null;
    const lx = P.x - ROOM.x, lz = P.z - ROOM.z, dr = door();
    if ((lx - dr.x) ** 2 + (lz - dr.z) ** 2 < 1.6) return ["EXIT", "Head back outside", () => exit(P)];
    if (bedPos && (lx - bedPos.x) ** 2 + (lz - bedPos.z) ** 2 < 5.5) return ["SLEEP", "🛏 Sleep till morning · heals you and saves", () => { g.sleep(); }];
    return ["DECORATE", "🎨 Decorate your <b>" + prop.label + "</b>", () => panel("wall")];
  }
  // the decorate panel: one slot at a time, with tabs across the top as rows
  function panel(slot) {
    const rows = [];
    rows.push({ label: "ROOM", sub: Object.keys(DECOR).map(k => (k === slot ? "▸ " : "") + DECOR[k].name).join(" · "), btn: "NEXT ▸", onClick: () => { const ks = Object.keys(DECOR); panel(ks[(ks.indexOf(slot) + 1) % ks.length]); } });
    const D2 = DECOR[slot];
    D2.opts.forEach((o, i) => {
      const on = st.decor[slot] === i, cost = o.none ? 0 : D2.cost;
      rows.push({ label: D2.name.toUpperCase() + " · " + o.n + (on ? "  ✓" : ""), sub: o.none ? "Clear it out" : "$" + cost, btn: on ? "PLACED" : o.none ? "REMOVE" : "BUY", disabled: on,
        onClick: () => {
          if (cost && st.money < cost) { g.toast("You need $" + Math.ceil(cost - st.money) + " more"); return; }
          st.money -= cost; st.decor[slot] = i; buildFurniture(); g.sound("cash", 0.5); g.save(); panel(slot);
        } });
    });
    g.hud.panel("DECORATE · " + D2.name.toUpperCase(), rows);
  }
  const doorWorld = () => prop ? { x: prop.p.x, z: prop.p.z } : { x: 0, z: 0 };
  return { S, enter, exit, confine, camera, update, action, panel, doorWorld, ROOM, get inside() { return S.inside; } };
}
