// Palm City — walk-in venues. Each business or landmark you can step into gets its own themed room
// (built by interior.js's room shell): a burger joint and pizzeria with a menu board and booths, a
// neon club with a lit dance floor, a white-walled gallery, the hospital, the police front desk,
// small offices, and the depot warehouse. Most have somebody behind the counter and one thing to do.
import * as THREE from "../vendor/three.module.js";

// which places are walk-in, and as what
export const VENUES = {
  pizza: "food", burger: "food", club: "club", gallery: "gallery", hospital: "hospital", police: "police",
  taxi: "office", marina: "office", studio: "office", prints: "office", depot: "depot",
};
export const VENUE_SIZE = { food: [14, 10], club: [16, 12], gallery: [16, 11], hospital: [15, 11], police: [15, 11], office: [12, 9], depot: [18, 13] };

const rnd = Math.random;
function textTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function painting(seed) {
  return textTex(256, 256, (x, w, h) => {
    const hue = (seed * 67) % 360;
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${hue},55%,62%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},45%,28%)`);
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const kind = seed % 3;
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `hsla(${(hue + i * 37) % 360},60%,${40 + rnd() * 40}%,.55)`;
      if (kind === 0) { x.beginPath(); x.arc(rnd() * w, rnd() * h, 12 + rnd() * 50, 0, 7); x.fill(); }
      else if (kind === 1) x.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 90, 8 + rnd() * 60);
      else { x.beginPath(); x.moveTo(rnd() * w, rnd() * h); x.lineTo(rnd() * w, rnd() * h); x.lineTo(rnd() * w, rnd() * h); x.fill(); }
    }
  });
}

// ctx: { grp, W, D, B, M, std, place, label, st, owned() }
export function buildVenue(theme, ctx) {
  const { grp, W, D, B, M, std, place } = ctx;
  const brand = new THREE.Color(place.bg || "#444"), fg = place.fg || "#fff";
  const out = { blocks: [], counter: null, clerk: null, wall: 0xe6dccb, floor: "tile", light: [0xffe0b8, 30], update: null, action: null };
  const back = -D / 2;
  if (theme === "food") {
    out.wall = 0xf0e6d4; out.floor = "tile";
    const cz = back + 2.4;
    B(grp, 6.4, 1.0, 0.8, std(brand.getHex(), 0.5), 0, 0.5, cz);
    B(grp, 6.6, 0.06, 0.95, std(0xe8e4dc, 0.25), 0, 1.03, cz);
    B(grp, 0.45, 0.3, 0.4, std(0x202226, 0.4, 0.4), 1.8, 1.21, cz);                         // register
    for (let i = 0; i < 3; i++) B(grp, 1.2, 1.0, 0.7, std(0xb8bcc0, 0.3, 0.8), -2.6 + i * 1.5, 0.5, back + 0.4);   // fryers & ovens
    const menu = textTex(512, 160, (x, w, h) => {
      x.fillStyle = "#16181c"; x.fillRect(0, 0, w, h); x.fillStyle = place.bg || "#c8641e"; x.fillRect(0, 0, w, 34);
      x.fillStyle = fg; x.font = "bold 24px sans-serif"; x.textAlign = "center"; x.fillText(ctx.label, w / 2, 25);
      x.textAlign = "left"; x.font = "bold 20px sans-serif";
      const items = ctx.label.includes("PIZZA") ? [["Margherita", "8"], ["Pepperoni", "10"], ["Veggie", "9"], ["Garlic knots", "4"]] : [["Big Bun", "9"], ["Double Stack", "12"], ["Fries", "3"], ["Shake", "4"]];
      items.forEach(([n, p], i) => { x.fillStyle = "#f0e8d8"; x.fillText(n, 24 + (i % 2) * 250, 72 + Math.floor(i / 2) * 40); x.fillStyle = "#ffcf5a"; x.fillText("$" + p, 200 + (i % 2) * 250, 72 + Math.floor(i / 2) * 40); });
    });
    const mb = M(grp, new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: menu }), 0, 2.35, back + 0.03); mb.castShadow = false;
    // booths and stools out front
    const seat = std(0x8a2a2a, 0.7), tbl = std(0xd8d0c4, 0.35);
    for (const [x, z] of [[-W / 2 + 1.6, 0.4], [-W / 2 + 1.6, 3.0], [1.5, 2.6]]) {
      B(grp, 1.1, 0.06, 1.3, tbl, x, 0.76, z); B(grp, 0.12, 0.74, 0.12, std(0x333333, 0.4, 0.6), x, 0.38, z);
      for (const s of [-1, 1]) { B(grp, 0.55, 0.45, 1.3, seat, x + s * 0.95, 0.23, z); B(grp, 0.15, 0.6, 1.3, seat, x + s * 1.2, 0.75, z); }
      out.blocks.push([x - 1.35, x + 1.35, z - 0.7, z + 0.7]);
    }
    out.blocks.push([-W / 2, W / 2, back, cz + 0.45]);
    out.counter = { x: 0, z: cz + 1.1 }; out.clerk = { x: -0.6, z: cz - 0.7, yaw: 0 };
    out.action = ["EAT", "🍽 Grab a bite · $15 · patches you up", "eat"];
  } else if (theme === "club") {
    out.wall = 0x1a1420; out.floor = "concrete"; out.light = [0xc050ff, 10];
    // the dance floor: a grid of glowing tiles that pulse to the beat
    const n = 6, s = 1.0, geo = new THREE.BoxGeometry(s * 0.96, 0.04, s * 0.96);
    const tiles = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n * n);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { m.makeTranslation(1.5 + (i - n / 2 + 0.5) * s, 0.065, (j - n / 2 + 0.5) * s); tiles.setMatrixAt(i * n + j, m); tiles.setColorAt(i * n + j, c.set(0x222222)); }
    grp.add(tiles);
    const neon = [0xff3b8b, 0x3bd0ff, 0xb44bff, 0xffd23b];
    out.update = t => {
      const beat = Math.floor(t * 2.2);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const k = (i + j + beat) % 4, on = ((i * 7 + j * 3 + beat) % 5) < 3; c.setHex(neon[k]).multiplyScalar(on ? 1.6 : 0.12); tiles.setColorAt(i * n + j, c); }
      tiles.instanceColor.needsUpdate = true;
    };
    // bar along the left wall, bottles lit from behind
    const bx = -W / 2 + 1.4;
    B(grp, 0.9, 1.1, 6, std(0x241c30, 0.4, 0.3), bx, 0.55, -0.5);
    B(grp, 1.0, 0.05, 6.1, std(0x0e0e10, 0.15, 0.5), bx, 1.12, -0.5);
    const strip = M(grp, new THREE.BoxGeometry(0.04, 0.06, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b8b).multiplyScalar(3) }), bx + 0.47, 0.9, -0.5); strip.castShadow = false;
    B(grp, 0.3, 1.6, 6, std(0x100c14, 0.6), -W / 2 + 0.15, 2.0, -0.5);
    for (let i = 0; i < 18; i++) { const b = M(grp, new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rnd(), 0.7, 0.5).multiplyScalar(1.4) }), -W / 2 + 0.3, 1.5 + (i % 3) * 0.5, -3.2 + Math.floor(i / 3) * 1.05); b.castShadow = false; }
    out.blocks.push([-W / 2, bx + 0.5, -3.5, 2.5]);
    // DJ booth at the back
    B(grp, 3.0, 1.1, 1.0, std(0x16161a, 0.4, 0.4), 1.5, 0.55, back + 1.2);
    const dj = M(grp, new THREE.BoxGeometry(2.9, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3bd0ff).multiplyScalar(3) }), 1.5, 0.9, back + 1.71); dj.castShadow = false;
    for (const x of [-0.4, 3.4]) B(grp, 0.9, 1.8, 0.8, std(0x0c0c0e, 0.5), x, 0.9, back + 0.6);   // speakers
    out.blocks.push([-0.9, 3.9, back, back + 1.75]);
    out.counter = { x: bx + 1.2, z: -0.5 }; out.clerk = { x: bx - 0.2, z: -0.5, yaw: Math.PI / 2 };
    out.dancer = { x: 1.5, z: back + 0.55, yaw: 0 };
    out.action = ["DRINK", "🍹 Order a drink at the bar · $25", "drink"];
  } else if (theme === "gallery") {
    out.wall = 0xf4f2ee; out.floor = "concrete"; out.light = [0xfff4e4, 22];
    const frame = std(0x1a1814, 0.5);
    let k = 1;
    for (const x of [-W / 2 + 3, 0, W / 2 - 3]) { B(grp, 2.2, 1.6, 0.06, frame, x, 1.8, back + 0.03); M(grp, new THREE.PlaneGeometry(2.0, 1.4), std(0xffffff, 0.9, 0, { map: painting(k++) }), x, 1.8, back + 0.07).castShadow = false; }
    for (const sx of [-1, 1]) for (const z of [-2, 1.2]) {
      const g2 = B(grp, 0.06, 1.3, 1.8, frame, sx * (W / 2 - 0.03), 1.8, z);
      const pic = M(grp, new THREE.PlaneGeometry(1.6, 1.1), std(0xffffff, 0.9, 0, { map: painting(k++) }), sx * (W / 2 - 0.07), 1.8, z, -sx * Math.PI / 2); pic.castShadow = false; g2.castShadow = false;
    }
    for (const [x, z] of [[-3, 0], [3, 0.5]]) {
      B(grp, 0.8, 1.0, 0.8, std(0xf6f6f4, 0.6), x, 0.5, z);
      M(grp, new THREE.TorusKnotGeometry(0.22, 0.07, 64, 10), std(x < 0 ? 0xc8a24a : 0x2a2a30, 0.25, 0.8), x, 1.35, z);
      out.blocks.push([x - 0.45, x + 0.45, z - 0.45, z + 0.45]);
    }
    B(grp, 2.4, 0.45, 0.6, std(0x3a2e24, 0.6), 0, 0.23, 2.2);                                    // bench
    out.blocks.push([-1.25, 1.25, 1.9, 2.5]);
    B(grp, 1.8, 1.0, 0.7, std(0xe8e6e2, 0.5), W / 2 - 1.6, 0.5, back + 2.6);                     // front desk
    out.blocks.push([W / 2 - 2.5, W / 2, back, back + 3.0]);
    out.counter = { x: W / 2 - 1.6, z: back + 3.6 }; out.clerk = { x: W / 2 - 1.6, z: back + 1.8, yaw: 0 };
    out.action = ["BROWSE", "🖼 Browse the collection", "browse"];
  } else if (theme === "hospital") {
    out.wall = 0xe4eef0; out.floor = "tile"; out.light = [0xf0f6ff, 20];
    B(grp, 4.4, 1.05, 0.9, std(0xdfe6ea, 0.5), 1.5, 0.53, back + 2.6);
    B(grp, 4.5, 0.05, 1.0, std(0x9ab8c4, 0.3), 1.5, 1.07, back + 2.6);
    const cross = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe02020).multiplyScalar(1.6) });
    M(grp, new THREE.BoxGeometry(0.35, 1.1, 0.04), cross, 1.5, 2.3, back + 0.03).castShadow = false;
    M(grp, new THREE.BoxGeometry(1.1, 0.35, 0.04), cross, 1.5, 2.3, back + 0.03).castShadow = false;
    for (const z of [-2.2, 1.0]) {                                                                // beds with curtains
      const bx = -W / 2 + 1.3;
      B(grp, 1.0, 0.5, 2.1, std(0xc8ccd0, 0.3, 0.6), bx, 0.45, z); B(grp, 0.95, 0.15, 2.0, std(0xf4f6f8, 0.9), bx, 0.77, z);
      B(grp, 0.02, 2.2, 2.4, std(0x8ec8c8, 0.9, 0, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), bx + 1.0, 1.3, z);
      out.blocks.push([-W / 2, bx + 1.05, z - 1.2, z + 1.2]);
    }
    for (let i = 0; i < 4; i++) { const x = W / 2 - 0.5; B(grp, 0.5, 0.45, 0.5, std(0x2e6a8a, 0.6), x, 0.23, -1 + i * 0.7); B(grp, 0.1, 0.5, 0.5, std(0x2e6a8a, 0.6), x + 0.22, 0.6, -1 + i * 0.7); }
    out.blocks.push([W / 2 - 0.8, W / 2, -1.4, 1.5]);
    out.blocks.push([-0.8, 3.8, back, back + 3.1]);
    out.counter = { x: 1.5, z: back + 3.6 }; out.clerk = { x: 1.5, z: back + 1.8, yaw: 0, look: { shirt: 0xe8f0f4, pants: 0xe8f0f4 } };
    out.action = ["HEAL", "🩺 Get patched up · $120", "heal"];
  } else if (theme === "police") {
    out.wall = 0xd4d8dc; out.floor = "tile"; out.light = [0xf4f8ff, 20];
    B(grp, 4.6, 1.15, 0.9, std(0x2a3446, 0.5), 1.0, 0.58, back + 2.6);
    B(grp, 4.7, 0.05, 1.0, std(0x8a8e94, 0.3), 1.0, 1.17, back + 2.6);
    const seal = textTex(256, 256, (x, w) => { x.fillStyle = "#10204a"; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 4, 0, 7); x.fill(); x.strokeStyle = "#e8c84a"; x.lineWidth = 10; x.stroke(); x.fillStyle = "#e8c84a"; x.font = "bold 64px sans-serif"; x.textAlign = "center"; x.fillText("PCPD", w / 2, w / 2 + 22); });
    M(grp, new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ map: seal, transparent: true }), 1.0, 2.3, back + 0.03).castShadow = false;
    // a holding cell in the back-left corner
    const bars = std(0x55595e, 0.35, 0.8), cx0 = -W / 2, cx1 = -W / 2 + 3.4, cz1 = back + 3.2;
    for (let x = cx0 + 0.2; x < cx1; x += 0.22) M(grp, new THREE.CylinderGeometry(0.025, 0.025, H_BARS, 6), bars, x, H_BARS / 2, cz1);
    for (let z = back + 0.2; z < cz1; z += 0.22) M(grp, new THREE.CylinderGeometry(0.025, 0.025, H_BARS, 6), bars, cx1, H_BARS / 2, z);
    B(grp, 1.8, 0.4, 0.6, std(0x6a6e72, 0.8), cx0 + 1.2, 0.2, back + 0.4);
    out.blocks.push([cx0, cx1 + 0.1, back, cz1 + 0.1]);
    for (let i = 0; i < 2; i++) B(grp, 2.2, 0.45, 0.5, std(0x3a3a40, 0.6), -W / 2 + 1.5 + i * 0.0, 0.23, 1.2 + i * 1.6);
    out.blocks.push([-W / 2, -W / 2 + 2.7, 0.9, 3.1]);
    out.blocks.push([-1.4, 3.4, back, back + 3.1]);
    out.counter = { x: 1.0, z: back + 3.6 }; out.clerk = { x: 1.0, z: back + 1.8, yaw: 0, look: { shirt: 0x1e2a44, pants: 0x1e2a44 } };
    out.action = ["TALK", "👮 Speak to the desk sergeant", "cop"];
  } else if (theme === "office") {
    out.wall = 0xe0dcd4; out.floor = "carpet"; out.light = [0xfff0dc, 30];
    B(grp, 2.4, 0.06, 1.1, std(0x5a4230, 0.45), 0, 0.76, back + 2.2);
    for (const x of [-1.1, 1.1]) B(grp, 0.08, 0.74, 1.0, std(0x3a2a20, 0.5), x, 0.37, back + 2.2);
    const scr = M(grp, new THREE.BoxGeometry(0.7, 0.42, 0.04), new THREE.MeshBasicMaterial({ color: 0x9ac4ff }), 0.3, 1.05, back + 2.0); scr.castShadow = false;
    B(grp, 0.55, 0.9, 0.55, std(0x1e1e22, 0.5), 0, 0.45, back + 1.3);                             // chair
    for (let i = 0; i < 3; i++) B(grp, 0.6, 1.3, 0.6, std(0x8a8e94, 0.4, 0.6), W / 2 - 0.5, 0.65, back + 0.6 + i * 0.65);
    out.blocks.push([W / 2 - 0.85, W / 2, back, back + 2.3]);
    const poster = textTex(256, 340, (x, w, h) => { x.fillStyle = place.bg || "#333"; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = "bold 30px sans-serif"; x.textAlign = "center"; ctx.label.split(" ").forEach((wd, i) => x.fillText(wd, w / 2, 120 + i * 40)); x.fillRect(40, 250, w - 80, 6); });
    M(grp, new THREE.PlaneGeometry(1.1, 1.46), new THREE.MeshBasicMaterial({ map: poster }), -W / 2 + 0.03, 1.8, -0.5, Math.PI / 2).castShadow = false;
    for (let i = 0; i < 2; i++) B(grp, 0.55, 0.45, 0.55, std(brand.getHex(), 0.7), -0.7 + i * 1.4, 0.23, back + 3.4);   // visitor chairs
    out.blocks.push([-1.4, 1.4, back, back + 2.8]);
    out.counter = { x: 0, z: back + 3.0 }; out.clerk = { x: 0, z: back + 1.4, yaw: 0 };
    out.action = ["ASK", "💼 Talk to the front desk", "office"];
  } else if (theme === "depot") {
    out.wall = 0x9a948a; out.floor = "concrete"; out.light = [0xfff2dc, 28];
    const crate = [std(0x8a6a3a, 0.9), std(0x6b5236, 0.9), std(0x9a7a4a, 0.9)];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = -W / 2 + 2 + i * 3.2, z = back + 1.6 + j * 3.4, h = 1 + ((i + j) % 3);
      for (let k = 0; k < h; k++) B(grp, 1.6, 1.0, 1.6, crate[(i + j + k) % 3], x + (k % 2) * 0.12, 0.5 + k * 1.0, z, (k % 2) * 0.2);
      out.blocks.push([x - 0.9, x + 0.9, z - 0.9, z + 0.9]);
    }
    B(grp, 1.4, 1.4, 2.4, std(0xe0a020, 0.5, 0.2), W / 2 - 2, 0.9, 0.5);                           // forklift body
    B(grp, 0.1, 2.4, 0.1, std(0x333333, 0.4, 0.6), W / 2 - 2.5, 1.2, 1.8); B(grp, 0.1, 2.4, 0.1, std(0x333333, 0.4, 0.6), W / 2 - 1.5, 1.2, 1.8);
    out.blocks.push([W / 2 - 2.8, W / 2 - 1.2, -0.8, 2.0]);
    out.counter = null; out.clerk = { x: -2, z: 2.2, yaw: Math.PI * 0.8, look: { shirt: 0xe0a020, pants: 0x2a3a52 } };
  }
  return out;
}
const H_BARS = 2.6;
