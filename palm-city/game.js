// Palm City — mobile open-world story game. Three.js r160, procedural assets.
import * as THREE from "./vendor/three.module.js";
import { STR } from "./strings.js";
import { AudioSys } from "./audio.js";

// ---------- seeded RNG (world gen is deterministic) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260612);
const rr = (a, b) => a + rng() * (b - a);
const pick = arr => arr[(rng() * arr.length) | 0];

// ---------- city constants ----------
const N = 6, CELL = 88, ROAD = 18, BLOCK = 70;
const HALF = (N * CELL + ROAD) / 2;            // 273
const roadC = k => -HALF + ROAD / 2 + k * CELL;
const blockMin = i => roadC(i) + ROAD / 2;
const bc = i => blockMin(i) + BLOCK / 2;
const CURB = 0.22;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- renderer / scene ----------
const dom = id => document.getElementById(id);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.body.innerHTML = "<p style='color:#333;padding:40px;font-size:18px'>" + STR.noWebgl + "</p>";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic highlight roll-off for a premium look
renderer.toneMappingExposure = 1.2;
document.body.insertBefore(renderer.domElement, document.getElementById("ui"));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7c98e);          // golden-hour haze (style blocks 3-4)
scene.fog = new THREE.Fog(0xf7c98e, 170, 420);

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.5, 900);
camera.position.set(0, 8, -14);

const hemi = new THREE.HemisphereLight(0xffe8c4, 0x8a7355, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
sun.position.set(120, 160, 80);
scene.add(sun);

// gradient sky dome (1 draw call) — zenith→horizon, recoloured by the day/night cycle
const skyUniforms = {
  topColor: { value: new THREE.Color(0x4a90d9) },
  horizonColor: { value: new THREE.Color(0xf7c98e) },
  exponent: { value: 0.65 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(700, 24, 12),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 topColor; uniform vec3 horizonColor; uniform float exponent; varying vec3 vDir; void main(){ float f = pow(max(vDir.y,0.0), exponent); gl_FragColor = vec4(mix(horizonColor, topColor, f), 1.0); }",
  }));
skyDome.frustumCulled = false;
scene.add(skyDome);

// sun / moon disc aligned with the key light
const sunTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  for (let r = c; r > 0; r--) { ctx.globalAlpha = Math.pow(1 - r / c, 1.6) * 0.85; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); }
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xfff2c0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(70, 70, 1);
{ const d = new THREE.Vector3(120, 160, 80).normalize().multiplyScalar(620); sunSprite.position.copy(d); }
scene.add(sunSprite);
const SUN_DAY = new THREE.Color(0xfff2c0), SUN_NIGHT = new THREE.Color(0xcdd8f2);

// day/night cycle (4 min): warm day -> dusk -> night -> dawn
const ENV_KEYS = [
  { t: 0.00, sky: new THREE.Color(0xf7c98e), top: new THREE.Color(0x4a90d9), sun: 1.7, hemi: 1.05, far: 420, night: 0.0 },
  { t: 0.42, sky: new THREE.Color(0xf7c98e), top: new THREE.Color(0x4a90d9), sun: 1.7, hemi: 1.05, far: 420, night: 0.0 },
  { t: 0.52, sky: new THREE.Color(0xee9d7a), top: new THREE.Color(0x9a6a8a), sun: 1.1, hemi: 0.85, far: 400, night: 0.35 },
  { t: 0.60, sky: new THREE.Color(0x2c3354), top: new THREE.Color(0x10142c), sun: 0.18, hemi: 0.42, far: 340, night: 1.0 },
  { t: 0.86, sky: new THREE.Color(0x2c3354), top: new THREE.Color(0x10142c), sun: 0.18, hemi: 0.42, far: 340, night: 1.0 },
  { t: 0.95, sky: new THREE.Color(0xf2b890), top: new THREE.Color(0x7a6a9a), sun: 1.2, hemi: 0.90, far: 400, night: 0.3 },
  { t: 1.00, sky: new THREE.Color(0xf7c98e), top: new THREE.Color(0x4a90d9), sun: 1.7, hemi: 1.05, far: 420, night: 0.0 },
];
const _sky = new THREE.Color(), _top = new THREE.Color(), _sunCol = new THREE.Color();
function envUpdate() {
  const t = (simTime / 240) % 1;
  let a = ENV_KEYS[0], b = ENV_KEYS[ENV_KEYS.length - 1];
  for (let i = 1; i < ENV_KEYS.length; i++) {
    if (ENV_KEYS[i].t >= t) { a = ENV_KEYS[i - 1]; b = ENV_KEYS[i]; break; }
  }
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  _sky.lerpColors(a.sky, b.sky, k);
  scene.background.copy(_sky);
  scene.fog.color.copy(_sky);
  scene.fog.far = a.far + (b.far - a.far) * k;
  sun.intensity = a.sun + (b.sun - a.sun) * k;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * k;
  skyUniforms.horizonColor.value.copy(_sky);
  skyUniforms.topColor.value.copy(_top.lerpColors(a.top, b.top, k));
  const night = a.night + (b.night - a.night) * k;
  palmIM.material.emissiveIntensity = 1 + night * 1.7;          // Golden Palms glow at night
  sunSprite.material.color.copy(_sunCol.lerpColors(SUN_DAY, SUN_NIGHT, night));
  const sc = 70 - night * 24;
  sunSprite.scale.set(sc, sc, 1);
}

addEventListener("resize", onResize);
addEventListener("orientationchange", onResize);
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ---------- procedural textures (seamless by construction; style formula palette) ----------
function canvasTex(size, draw, repX = 1, repY = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  return t;
}
// speckle that wraps across edges so the tile stays seamless
function speckle(ctx, s, n, colors, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = rng() * s, y = rng() * s, r = rr(r0, r1);
    ctx.fillStyle = pick(colors);
    for (const ox of [0, -s, s]) for (const oz of [0, -s, s]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oz, r, 0, 7); ctx.fill();
    }
  }
}
const texAsphalt = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = "#46525a"; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 260, ["#4d5a62", "#3f4a52", "#525e66"], 1, 3);
  ctx.fillStyle = "#3a444b"; ctx.fillRect(0, 0, 14, s); ctx.fillRect(s - 14, 0, 14, s); // gutters
  ctx.fillStyle = "#e8c35a";                                  // center dashes (64 divides 256 => seamless)
  for (let y = 0; y < s; y += 64) ctx.fillRect(s / 2 - 3, y, 6, 32);
}, 1, 30);
const texSidewalk = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = "#cfc5ae"; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 200, ["#d6cdb8", "#c6bca4", "#cabfa9"], 1, 2.5);
  ctx.strokeStyle = "#b7ad96"; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (s / 4) * i;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
}, 16, 16);
const texGrass = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = "#7fb069"; ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 240, ["#8abc73", "#74a45f", "#90c47c", "#6d9b58"], 2, 6);
}, 12, 12);
const texFacade = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = "#f5efe2"; ctx.fillRect(0, 0, s, s);
  const band = 44;                                       // street-level storefront band
  ctx.fillStyle = "#ddd2bd"; ctx.fillRect(0, s - band, s, band);
  ctx.fillStyle = "#7a6f5c"; ctx.fillRect(s / 2 - 14, s - band + 10, 28, band - 10); // door
  const cols = 6, rows = 7, ww = 22, wh = 18;
  for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
    const x = 14 + cx * ((s - 28) / cols) + 4, y = 12 + cy * ((s - band - 24) / rows);
    ctx.fillStyle = rng() < 0.3 ? "#ffd98a" : "#5e7287";
    ctx.fillRect(x, y, ww, wh);
  }
});

// ---------- geometry helpers (merged vertex-colored boxes => 1 draw call per model) ----------
const _col = new THREE.Color();
function boxGeoC(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  _col.set(color);
  for (let i = 0; i < n; i++) { cols[i * 3] = _col.r; cols[i * 3 + 1] = _col.g; cols[i * 3 + 2] = _col.b; }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}
function mergeGeos(geos) {
  const pos = [], norm = [], col = [], uv = [], idx = [];
  let off = 0;
  const hasUv = !!geos[0].attributes.uv, hasCol = !!geos[0].attributes.color;
  for (const g of geos) {
    const p = g.attributes.position, nr = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(nr.getX(i), nr.getY(i), nr.getZ(i));
      if (hasCol) { const c = g.attributes.color; col.push(c.getX(i), c.getY(i), c.getZ(i)); }
      if (hasUv) { const u = g.attributes.uv; uv.push(u.getX(i), u.getY(i)); }
    }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  if (hasCol) out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  if (hasUv) out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
function textSprite(text, fg, bg, w, h, y) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(6, 14, 500, 100, 28); ctx.fill(); }
  else ctx.fillRect(6, 14, 500, 100);
  ctx.fillStyle = fg; ctx.font = "800 52px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  sp.scale.set(w, h, 1); sp.position.y = y;
  return sp;
}

// ---------- world build ----------
const colliders = [];   // {x0,x1,z0,z1}
const addCollider = (x, z, hw, hd) => colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

const matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400),
  new THREE.MeshLambertMaterial({ color: 0x9aab72 }));
ground.geometry.rotateX(-Math.PI / 2);
scene.add(ground);

// roads: two merged meshes (all vertical, all horizontal)
{
  const matRoad = new THREE.MeshLambertMaterial({ map: texAsphalt });
  const vGeos = [], hGeos = [];
  for (let k = 0; k <= N; k++) {
    let g = new THREE.PlaneGeometry(ROAD, 2 * HALF);
    g.rotateX(-Math.PI / 2); g.translate(roadC(k), 0.045, 0);
    vGeos.push(g);
    g = new THREE.PlaneGeometry(ROAD, 2 * HALF);
    g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, 0.03, roadC(k));
    hGeos.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeos(vGeos), matRoad));
  scene.add(new THREE.Mesh(mergeGeos(hGeos), matRoad));
}

// block layout
const PARKS = new Set(["2,2", "1,1", "4,4"]);
const SPECIAL = { "1,3": "wash", "4,2": "burger", "5,0": "club", "0,4": "depot", "1,2": "pizza", "2,4": "taxi", "5,5": "marina", "3,2": "garage" };
const PLAZA = { x: bc(2), z: bc(2) };
const GARAGE = { x: bc(3), z: bc(2) };

// curb slabs: paved + grass, instanced
{
  const slab = new THREE.BoxGeometry(BLOCK, CURB * 2, BLOCK);
  const paved = [], grass = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    (PARKS.has(i + "," + j) && i + "," + j !== "2,2" ? grass : paved).push([bc(i), bc(j)]);
  const m = new THREE.Matrix4();
  const mk = (list, tex) => {
    const im = new THREE.InstancedMesh(slab, new THREE.MeshLambertMaterial({ map: tex }), list.length);
    list.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); im.setMatrixAt(i, m); });
    scene.add(im);
  };
  mk(paved, texSidewalk); mk(grass, texGrass);
}

// buildings: one InstancedMesh, facade texture sides / plain roof, pastel instance tints
const PASTELS = [0xf2d4c2, 0xd9e4f0, 0xf5e8c8, 0xd8ecd4, 0xecd3e2, 0xe7ded0, 0xc9dce6, 0xf0dcc0];
let buildingsIM;
{
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const matSide = new THREE.MeshLambertMaterial({ map: texFacade });
  const matRoof = new THREE.MeshLambertMaterial({ color: 0xb8ab9a });
  const mats = [matSide, matSide, matRoof, matRoof, matSide, matSide];
  const placed = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const key = i + "," + j;
    if (PARKS.has(key) || SPECIAL[key]) continue;
    for (const qx of [0, 1]) for (const qz of [0, 1]) {
      if (rng() < 0.26) continue;
      const w = rr(16, 24), d = rr(16, 24), h = pick([8, 8, 12, 12, 16, 22, 30]);
      const x = blockMin(i) + 8 + 13 + qx * 28 + rr(-2, 2);
      const z = blockMin(j) + 8 + 13 + qz * 28 + rr(-2, 2);
      placed.push({ x, z, w, d, h, tint: pick(PASTELS) });
      addCollider(x, z, w / 2, d / 2);
    }
  }
  buildingsIM = new THREE.InstancedMesh(unit, mats, placed.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  placed.forEach((b, idx) => {
    p.set(b.x, CURB, b.z); s.set(b.w, b.h, b.d); q.identity();
    m.compose(p, q, s);
    buildingsIM.setMatrixAt(idx, m);
    buildingsIM.setColorAt(idx, _col.set(b.tint));
  });
  scene.add(buildingsIM);
}

// special buildings + labels
function specialBuilding(x, z, w, h, d, color, labelText, labelColor) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, CURB + h / 2, z);
  scene.add(mesh);
  addCollider(x, z, w / 2, d / 2);
  const sp = textSprite(labelText, "#fff", labelColor, 16, 4, 0);
  sp.position.set(x, CURB + h + 3, z);
  scene.add(sp);
  return sp;
}
specialBuilding(bc(1), bc(3), 42, 9, 26, 0x6fb7d9, STR.biz.wash.name, "rgba(40,90,130,.9)");
specialBuilding(bc(4), bc(2), 26, 11, 26, 0xd95f4b, STR.biz.burger.name, "rgba(150,50,30,.9)");
specialBuilding(bc(5), bc(0), 32, 17, 28, 0x8e5fc9, STR.biz.club.name, "rgba(80,40,130,.9)");
specialBuilding(bc(0), bc(4), 48, 10, 40, 0x9aa0a8, STR.depotName, "rgba(60,65,75,.9)");
specialBuilding(bc(1) + 18, bc(2) + 14, 18, 8, 18, 0xe0b04e, STR.pizzaName, "rgba(140,90,20,.9)");
specialBuilding(bc(2), bc(4), 30, 6, 24, 0xe8c35a, STR.biz.taxi.name, "rgba(160,120,20,.9)");
specialBuilding(bc(5), bc(5), 40, 7, 30, 0x5fa8c9, STR.biz.marina.name, "rgba(30,100,140,.9)");
specialBuilding(GARAGE.x, GARAGE.z, 34, 8, 26, 0x5b6470, STR.garageName, "rgba(40,46,55,.9)");

// plaza: fountain + hot dog cart
{
  const f = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 1, 18),
    new THREE.MeshLambertMaterial({ color: 0xd8cfbb }));
  base.position.y = CURB + 0.5;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.3, 18),
    new THREE.MeshLambertMaterial({ color: 0x7fc8d9 }));
  water.position.y = CURB + 1.05;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8cfbb }));
  spire.position.y = CURB + 2.2;
  f.add(base, water, spire);
  f.position.set(PLAZA.x, 0, PLAZA.z);
  scene.add(f);
  addCollider(PLAZA.x, PLAZA.z, 5, 5);

  const cart = new THREE.Mesh(mergeGeos([
    boxGeoC(2.4, 1.3, 1.4, 0, 1.0, 0, 0xf5f0e6),
    boxGeoC(0.3, 0.4, 0.3, 0, 0.4, 0, 0x6b6258),
    boxGeoC(2.8, 0.2, 1.8, 0, 2.6, 0, 0xe8543f),
    boxGeoC(0.12, 1.1, 0.12, 0.8, 1.9, 0, 0x6b6258),
  ]), matVC);
  cart.position.set(bc(2) + 28, CURB, bc(2) + 28);
  scene.add(cart);
  addCollider(bc(2) + 28, bc(2) + 28, 1.6, 1.2);
}

// trees: instanced trunks + canopies
{
  const spots = [];
  for (const key of PARKS) {
    const [i, j] = key.split(",").map(Number);
    const n = key === "2,2" ? 6 : 11;
    for (let t = 0; t < n; t++) {
      const x = blockMin(i) + rr(6, BLOCK - 6), z = blockMin(j) + rr(6, BLOCK - 6);
      if (dist2(x, z, PLAZA.x, PLAZA.z) < 144 && key === "2,2") continue;
      spots.push([x, z, rr(0.8, 1.3)]);
    }
  }
  for (let t = 0; t < 26; t++) {                       // street trees on random corners
    const i = (rng() * N) | 0, j = (rng() * N) | 0;
    if (PARKS.has(i + "," + j)) continue;
    const x = blockMin(i) + pick([4, BLOCK - 4]), z = blockMin(j) + rr(6, BLOCK - 6);
    spots.push([x, z, rr(0.7, 1.1)]);
  }
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 1.7, 6);
  trunk.translate(0, 0.85, 0);
  const canopy = new THREE.IcosahedronGeometry(1.5, 1);
  canopy.translate(0, 2.6, 0);
  const imT = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), spots.length);
  const imC = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const greens = [0x6da85e, 0x7fb069, 0x5d9952, 0x8fbc6f];
  spots.forEach(([x, z, k], idx) => {
    p.set(x, CURB, z); s.set(k, k, k); q.identity(); m.compose(p, q, s);
    imT.setMatrixAt(idx, m); imC.setMatrixAt(idx, m);
    imC.setColorAt(idx, _col.set(pick(greens)));
    addCollider(x, z, 0.5, 0.5);
  });
  scene.add(imT, imC);
}

// ---------- characters ----------
function personGeo(p) {
  return mergeGeos([
    boxGeoC(0.22, 0.64, 0.26, 0.14, 0.32, 0, p.pants),
    boxGeoC(0.22, 0.64, 0.26, -0.14, 0.32, 0, p.pants),
    boxGeoC(0.56, 0.6, 0.32, 0, 0.95, 0, p.shirt),
    boxGeoC(0.16, 0.52, 0.2, 0.37, 0.98, 0, p.shirt),
    boxGeoC(0.16, 0.52, 0.2, -0.37, 0.98, 0, p.shirt),
    boxGeoC(0.34, 0.34, 0.3, 0, 1.43, 0, p.skin),
    boxGeoC(0.36, 0.13, 0.32, 0, 1.66, 0, p.hair),
  ]);
}
function articulatedPerson(p) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const limb = (w, h, d, c) => {
    const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, -h / 2, 0);
    return new THREE.Mesh(geo, mat(c));
  };
  const legL = limb(0.22, 0.64, 0.26, p.pants); legL.position.set(0.14, 0.64, 0);
  const legR = limb(0.22, 0.64, 0.26, p.pants); legR.position.set(-0.14, 0.64, 0);
  const armL = limb(0.16, 0.54, 0.2, p.shirt); armL.position.set(0.37, 1.24, 0);
  const armR = limb(0.16, 0.54, 0.2, p.shirt); armR.position.set(-0.37, 1.24, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.32), mat(p.shirt)); torso.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.3), mat(p.skin)); head.position.y = 1.43;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.32), mat(p.hair)); hair.position.y = 1.66;
  g.add(legL, legR, armL, armR, torso, head, hair);
  return { group: g, legL, legR, armL, armR };
}
const HERO_PAL = { shirt: 0xff7a33, pants: 0xf5f0e6, skin: 0xe8b08a, hair: 0x3a2c20 };
const NPC_PALS = [
  { shirt: 0x6fb7d9, pants: 0x4a4f59, skin: 0xe8b08a, hair: 0x2c2620 },
  { shirt: 0xecd3e2, pants: 0x7a6f5c, skin: 0xc98f6b, hair: 0x1f1a16 },
  { shirt: 0x9fe6a0, pants: 0x3f4a52, skin: 0xf0c8a0, hair: 0x6b4a2a },
  { shirt: 0xf5e8c8, pants: 0x8e5fc9, skin: 0xd9a37a, hair: 0x3a2c20 },
  { shirt: 0xd95f4b, pants: 0xd9e4f0, skin: 0xe8b08a, hair: 0x55524e },
];
const npcGeos = NPC_PALS.map(personGeo);

// ---------- cars ----------
const carGeo = mergeGeos([
  boxGeoC(2.0, 0.7, 4.6, 0, 0.75, 0, 0xffffff),          // body (white => tintable)
  boxGeoC(1.7, 0.65, 2.3, 0, 1.35, -0.2, 0x2a3d4d),       // glass cabin
  boxGeoC(0.4, 0.7, 0.7, 0.85, 0.35, 1.5, 0x23262b),
  boxGeoC(0.4, 0.7, 0.7, -0.85, 0.35, 1.5, 0x23262b),
  boxGeoC(0.4, 0.7, 0.7, 0.85, 0.35, -1.5, 0x23262b),
  boxGeoC(0.4, 0.7, 0.7, -0.85, 0.35, -1.5, 0x23262b),
  boxGeoC(0.34, 0.18, 0.1, 0.55, 0.85, 2.31, 0xfff4c4),   // headlights
  boxGeoC(0.34, 0.18, 0.1, -0.55, 0.85, 2.31, 0xfff4c4),
  boxGeoC(0.34, 0.18, 0.1, 0.55, 0.85, -2.31, 0xc8403a),  // taillights
  boxGeoC(0.34, 0.18, 0.1, -0.55, 0.85, -2.31, 0xc8403a),
]);
const CAR_COLORS = [0xe8543f, 0x3f7fe8, 0xf0c040, 0x58b368, 0xc25cd6, 0xe8e4da, 0xff8c42];
function makeCar(color) {
  const mesh = new THREE.Mesh(carGeo, new THREE.MeshLambertMaterial({ vertexColors: true, color }));
  scene.add(mesh);
  return mesh;
}

// drivable cars
const cars = [
  { x: -30, z: 6, h: Math.PI / 2, speed: 0, mesh: makeCar(0xf0c040) },   // Marco's hatchback
  { x: 132, z: -82, h: -Math.PI / 2, speed: 0, mesh: makeCar(0x3f7fe8) },
  { x: 179, z: 100, h: Math.PI, speed: 0, mesh: makeCar(0x58b368) },
  { x: -170, z: 138, h: 0, speed: 0, mesh: makeCar(0xc25cd6) },
];
const starterCar = cars[0];

// personal cars for sale at the City Garage — buy to drive & repaint (persisted in save).
// Per-car accel / top speed / turn give a money sink and a real progression past businesses.
const PCARS = [
  { id: "coral",    color: 0xff6b5c, price: 1500,  accel: 15, top: 30, turn: 2.0,  jumpMult: 1.5 },
  { id: "azure",    color: 0x3fa9f5, price: 4000,  accel: 18, top: 34, turn: 2.25, heatMult: 2.2 },
  { id: "sterling", color: 0x2b2f36, price: 12000, accel: 22, top: 40, turn: 2.4,  fineMult: 0.5 },
];
PCARS.forEach((pc, i) => {
  const px = GARAGE.x - 13 + i * 13, pz = GARAGE.z + 18;
  const car = {
    x: px, z: pz, h: 0, speed: 0, mesh: makeCar(pc.color),
    personal: true, locked: true, pid: pc.id, price: pc.price,
    accel: pc.accel, top: pc.top, turn: pc.turn,
    jumpMult: pc.jumpMult, heatMult: pc.heatMult, fineMult: pc.fineMult,
  };
  const sp = textSprite(STR.carForSale(STR.pcars[pc.id].name, pc.price), "#fff", "rgba(40,46,55,.92)", 12, 2.4, 0);
  sp.position.set(px, 3.4, pz);
  scene.add(sp);
  car.sale = sp;
  pc.car = car;
  cars.push(car);
});

for (const c of cars) { c.y = 0; c.vy = 0; c.lat = 0; c.rampCD = 0; c.airStart = 0; }

// ---------- stunt ramps ----------
function wedgeGeo(w, l, hgt) {
  const x = w / 2, z = l / 2;
  const v = [
    -x,0,-z,  x,0,-z,  x,hgt,z,   -x,0,-z,  x,hgt,z, -x,hgt,z,   // slope
    -x,0,-z, -x,0,z,    x,0,z,     -x,0,-z,  x,0,z,    x,0,-z,    // bottom
    -x,0,z,  -x,hgt,z,  x,hgt,z,   -x,0,z,   x,hgt,z,  x,0,z,     // back
    -x,0,-z, -x,hgt,z, -x,0,z,                                    // left side
     x,0,-z,  x,0,z,    x,hgt,z,                                  // right side
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const RAMPS = [
  { x: -88, z: -40, h: 0 }, { x: 88, z: 60, h: Math.PI }, { x: -40, z: -176, h: Math.PI / 2 },
  { x: 60, z: 88, h: -Math.PI / 2 }, { x: 0, z: 120, h: 0 },
];
const rampIM = new THREE.InstancedMesh(wedgeGeo(6, 7, 2.0),
  new THREE.MeshLambertMaterial({ color: 0xd9763a, side: THREE.DoubleSide }), RAMPS.length);
{
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s2 = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  RAMPS.forEach((r, i) => { p.set(r.x, groundY(r.x, r.z), r.z); q.setFromAxisAngle(up, r.h); m.compose(p, q, s2); rampIM.setMatrixAt(i, m); });
}
scene.add(rampIM);

// traffic cars on block-ring routes
const traffic = [];
for (let t = 0; t < 10; t++) {
  const i = (rng() * N) | 0, j = (rng() * N) | 0;
  const x0 = roadC(i) + 4, x1 = roadC(i + 1) - 4, z0 = roadC(j) + 4, z1 = roadC(j + 1) - 4;
  const wp = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const start = (rng() * 4) | 0;
  traffic.push({
    wp, next: (start + 1) % 4, x: wp[start][0], z: wp[start][1],
    h: 0, speed: rr(7, 11), mesh: makeCar(pick(CAR_COLORS)),
  });
}

// police cars (spawned by wanted level)
const POLICE_N = 3;
const police = [];
for (let i = 0; i < POLICE_N; i++) {
  const mesh = makeCar(0x20407a);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.26, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
  bar.position.set(0, 1.78, -0.2);
  mesh.add(bar);
  mesh.position.set(0, -9999, 0);
  police.push({ x: 0, z: -9999, h: 0, speed: 0, active: false, mesh, bar });
}

// pedestrians
const npcs = [];
for (let t = 0; t < 14; t++) {
  const i = (rng() * N) | 0, j = (rng() * N) | 0;
  const mesh = new THREE.Mesh(npcGeos[t % npcGeos.length], matVC);
  scene.add(mesh);
  npcs.push({
    mesh, x: blockMin(i) + rr(2, BLOCK - 2), z: blockMin(j) + rr(2, BLOCK - 2),
    h: rr(0, Math.PI * 2), speed: rr(1.0, 1.7), timer: rr(2, 6), phase: rr(0, 6),
  });
}

// story characters
function storyNPC(pal, x, z, name) {
  const mesh = new THREE.Mesh(personGeo(pal), matVC);
  mesh.position.set(x, CURB, z);
  const tag = textSprite(name, "#1d2a20", "rgba(255,209,102,.95)", 5, 1.25, 2.3);
  mesh.add(tag);
  scene.add(mesh);
  return mesh;
}
const marco = storyNPC({ shirt: 0x2a9d8f, pants: 0x4a4f59, skin: 0xc98f6b, hair: 0x1f1a16 },
  PLAZA.x, PLAZA.z + 11, STR.who.marco);
const ROSA_POS = { x: blockMin(4) + 2, z: 132 };
const rosa = storyNPC({ shirt: 0xe76f8a, pants: 0xf5f0e6, skin: 0xe8b08a, hair: 0x3a2010 },
  ROSA_POS.x, ROSA_POS.z, STR.who.rosa);
const vince = storyNPC({ shirt: 0x4a4f59, pants: 0x23262b, skin: 0xd9a37a, hair: 0x55524e },
  PLAZA.x, PLAZA.z - 8, STR.who.vince);
vince.visible = false;

// ---------- player ----------
const hero = articulatedPerson(HERO_PAL);
scene.add(hero.group);
const player = { x: PLAZA.x, z: roadC(3) - 12, y: CURB, h: Math.PI, walkPhase: 0, speed: 0 };
let driving = null;   // car object while driving

// ---------- blob shadows (one instanced draw) ----------
const SHADOW_N = 1 + cars.length + traffic.length + police.length + npcs.length + 3;
const shadowGeo = new THREE.CircleGeometry(1, 14);
shadowGeo.rotateX(-Math.PI / 2);
const shadowIM = new THREE.InstancedMesh(shadowGeo,
  new THREE.MeshBasicMaterial({ color: 0x33291c, transparent: true, opacity: 0.3, depthWrite: false }), SHADOW_N);
scene.add(shadowIM);

// ---------- juice: particles (1 draw call), screen shake, haptics, flash ----------
const PMAXN = 160;
const pPos = new Float32Array(PMAXN * 3).fill(-9999);
const pVel = new Float32Array(PMAXN * 3);
const pCol = new Float32Array(PMAXN * 3);
const pBase = new Float32Array(PMAXN * 3);
const pLife = new Float32Array(PMAXN);
const pTtl = new Float32Array(PMAXN);
let pHead = 0;
const partTex = canvasTex(64, (ctx, s) => {           // soft round sprite, built from stacked arcs (no gradients)
  const c = s / 2;
  for (let r = c; r > 0; r--) { ctx.globalAlpha = (1 - r / c) * 0.09; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); }
});
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const pPoints = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 2.6, map: partTex, vertexColors: true, transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
}));
pPoints.frustumCulled = false;
scene.add(pPoints);
function emit(x, y, z, vx, vy, vz, ttl, r, g, b) {
  const i = pHead; pHead = (pHead + 1) % PMAXN;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pBase[i * 3] = r; pBase[i * 3 + 1] = g; pBase[i * 3 + 2] = b;
  pLife[i] = ttl; pTtl[i] = ttl;
}
function burst(x, y, z, n, spread, up, ttl, r, g, b) {
  for (let k = 0; k < n; k++)
    emit(x, y, z, rr(-spread, spread), rr(up * 0.2, up), rr(-spread, spread), ttl * rr(0.6, 1), r, g, b);
}
function updateParticles(dt) {
  for (let i = 0; i < PMAXN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
    const t = pLife[i] / pTtl[i];
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    pVel[i * 3 + 1] -= 3 * dt;                          // gentle gravity
    pCol[i * 3] = pBase[i * 3] * t;
    pCol[i * 3 + 1] = pBase[i * 3 + 1] * t;
    pCol[i * 3 + 2] = pBase[i * 3 + 2] * t;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
let shake = 0, colCD = 0, driftCD = 0;
function addShake(v) { shake = Math.min(1.4, shake + v); }
function buzz(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }
const elFlash = dom("flash");
function flash(color, a) { elFlash.style.background = color; elFlash.style.opacity = a; setTimeout(() => { elFlash.style.opacity = 0; }, 60); }

// ---------- markers ----------
function makeMarker(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 3.0, 26),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 26, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 13;
  g.add(ring, beam);
  g.visible = false;
  scene.add(g);
  return { group: g, ring };
}
const missionMarker = makeMarker(0xffd166);
const sideMarker = makeMarker(0xff8c42);

// ---------- businesses ----------
const BIZ = [
  { id: "dogs", cost: 500, rate: 30, x: bc(2) + 28, z: bc(2) + 28, ly: 4.6, tips: 0 },
  { id: "wash", cost: 2000, rate: 90, x: bc(1) + 32, z: bc(3), ly: 4.6, tips: 0 },
  { id: "burger", cost: 5000, rate: 220, x: bc(4) - 32, z: bc(2), ly: 4.6, tips: 0 },
  { id: "club", cost: 10000, rate: 500, x: bc(5) - 32, z: bc(0) + 18, ly: 4.6, tips: 0 },
  { id: "taxi", cost: 3500, rate: 150, x: bc(2), z: 110, ly: 4.6, tips: 0 },
  { id: "marina", cost: 15000, rate: 700, x: bc(5), z: 196, ly: 4.6, tips: 0 },
];
for (const b of BIZ) {
  b.sale = textSprite(STR.forSale(b.cost), "#fff", "rgba(200,90,30,.92)", 11, 2.75, 0);
  b.sale.position.set(b.x, b.ly, b.z);
  scene.add(b.sale);
}

// ---------- collectibles: Golden Palms ----------
const PALMS = [[-176,-88],[-176,0],[-176,88],[-88,0],[0,-176],[0,0],[0,176],[88,-176],[88,176],[176,-88],[176,0],[176,88]];
const PALM_REWARD = 150, PALM_ALL_BONUS = 2000;
const palmCollected = PALMS.map(() => false);
const palmGeo = new THREE.OctahedronGeometry(0.85, 0);
const palmIM = new THREE.InstancedMesh(palmGeo,
  new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x7a5600 }), PALMS.length);
palmIM.frustumCulled = false;
scene.add(palmIM);
const palmQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const palmsGot = () => { let n = 0; for (const c of palmCollected) if (c) n++; return n; };
function collectPalm(i) {
  if (palmCollected[i]) return;
  palmCollected[i] = true;
  state.palms.push(i);
  state.money += PALM_REWARD;
  burst(PALMS[i][0], CURB + 1.5, PALMS[i][1], 16, 1.3, 2.6, 0.6, 0.95, 0.78, 0.22);   // gold sparkle
  buzz(15);
  if (palmsGot() === PALMS.length) { state.money += PALM_ALL_BONUS; toast(STR.palmsAll(PALM_ALL_BONUS)); flash("#ffe24a", 0.5); buzz([0, 40, 30, 40, 30, 90]); }
  else toast(STR.palmGot(PALM_REWARD));
  AudioSys.play("cash", 0.9);
  save();
}

// ---------- game state / save ----------
const SAVE_KEY = "sunset_city_save_v1"; // legacy key kept so pre-rename progress survives
const state = {
  money: 25,
  owned: {},
  cars: {},              // owned personal cars: pid -> chosen paint color (hex)
  palms: [],
  bestJump: 0,
  races: {},             // best lap per circuit id (seconds)
  maxMoney: 0,           // high-water cash mark (for the Tycoon achievement)
  ach: [],               // unlocked achievement ids
  mi: 0,                 // mission index; 8 = story complete
  phase: "intro",        // intro | play
};
function save() {
  state.maxMoney = Math.max(state.maxMoney || 0, Math.floor(state.money));
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, money: Math.floor(state.money), owned: state.owned, cars: state.cars, palms: state.palms, bestJump: state.bestJump || 0, races: state.races, maxMoney: state.maxMoney || 0, ach: state.ach, mi: state.mi })); } catch (e) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.v === 1) {
      state.money = d.money; state.owned = d.owned || {}; state.mi = d.mi || 0;
      state.cars = d.cars || {};
      state.palms = d.palms || [];
      state.bestJump = d.bestJump || 0;
      state.races = d.races || (d.bestRace ? { downtown: d.bestRace } : {});   // migrate single-circuit saves
      state.maxMoney = d.maxMoney || 0;
      state.ach = d.ach || [];
      for (const k in state.owned) if (state.owned[k] === true) state.owned[k] = 1; // pre-upgrade saves
      return true;
    }
  } catch (e) {}
  return false;
}
const hasSave = !!localStorage.getItem(SAVE_KEY);
function applyOwnership() {
  for (const b of BIZ) if (state.owned[b.id]) markOwned(b);
  for (const i of state.palms) if (i >= 0 && i < palmCollected.length) palmCollected[i] = true;
  for (const c of cars) if (c.personal && state.cars[c.pid] != null) unlockCar(c, state.cars[c.pid]);
}
function unlockCar(c, color) {
  c.locked = false;
  c.mesh.material.color.setHex(color);
  if (c.sale) c.sale.visible = false;
}
function markOwned(b) {
  const lvl = state.owned[b.id] || 1;
  b.sale.material.map.dispose();
  const sp = textSprite(STR.ownedLabel(lvl, b.rate * lvl), "#1d2a20", "rgba(159,230,160,.95)", 11, 2.75, 0);
  b.sale.material.map = sp.material.map;
  sp.material.dispose();
}
function incomeRate() {
  let s = 0;
  for (const b of BIZ) {
    const lvl = state.owned[b.id] || 0;
    if (!lvl) continue;
    let r = b.rate * lvl;
    if (b.id === "club" && state.mi > 10) r *= 1.25;   // Rosa manages the club (ch 11)
    s += r;
  }
  if (state.mi === 9) s *= 0.5;                        // Sterling's takeover bites (ch 10)
  if (state.mi > 9) s *= 1.1;                          // loyalty bonus won in ch 10
  return Math.round(s);
}

// ---------- missions ----------
const M = STR.missions;
const MISSIONS = [
  { reward: 100, steps: [{ x: PLAZA.x, z: PLAZA.z + 11, r: 4 }] },
  { reward: 150, steps: [{ x: bc(1) + 18, z: bc(2) + 4, r: 4 }, { x: 44, z: -100, r: 4 }] },
  { reward: 200, steps: [{ x: -30, z: 6, r: 6, cond: () => !!driving }, { x: -188, z: 132, r: 8, needCar: true }] },
  {
    reward: 300, steps: [
      { x: ROSA_POS.x, z: ROSA_POS.z, r: 6, needCar: true, onDone: () => { rosa.visible = false; } },
      { x: 132, z: -180, r: 8, needCar: true }]
  },
  {
    reward: 500, steps: [
      { x: 182, z: 132, r: 8, needCar: true },
      { x: -182, z: -132, r: 8, needCar: true },
      { x: 44, z: -182, r: 8, needCar: true }]
  },
  { reward: 250, steps: [{ x: BIZ[0].x, z: BIZ[0].z, r: 4, cond: () => !!state.owned.dogs }] },
  {
    reward: 750, steps: [
      { cond: () => state.money >= 2000 },
      { x: BIZ[1].x, z: BIZ[1].z, r: 5, cond: () => !!state.owned.wash }]
  },
  {
    reward: 2000, steps: [
      { x: BIZ[2].x, z: BIZ[2].z, r: 5, cond: () => !!state.owned.burger },
      { x: BIZ[3].x, z: BIZ[3].z, r: 5, cond: () => !!state.owned.club }]
  },
  { reward: 300, steps: [{ x: PLAZA.x, z: PLAZA.z - 8, r: 4 }] },
  {
    reward: 1500, steps: [
      { x: BIZ[0].x, z: BIZ[0].z, r: 6 },
      { x: BIZ[1].x, z: BIZ[1].z, r: 6 },
      { x: BIZ[2].x, z: BIZ[2].z, r: 6 },
      { x: BIZ[3].x, z: BIZ[3].z, r: 6 }]
  },
  {
    reward: 1000,
    onStart: () => { rosa.position.set(128, CURB, -188); rosa.visible = true; },
    steps: [
      { x: 128, z: -188, r: 7, needCar: true, onDone: () => { rosa.visible = false; } },
      { x: -44, z: -88, r: 8, needCar: true },
      { x: -176, z: 0, r: 8, needCar: true },
      { x: -44, z: -88, r: 8, needCar: true }]
  },
  {
    reward: 5000, race: { from: 1, limit: 100 },
    steps: [
      { x: -176, z: -176, r: 9, needCar: true },
      { x: 176, z: -176, r: 9, needCar: true },
      { x: 176, z: 176, r: 9, needCar: true },
      { x: -88, z: 176, r: 9, needCar: true },
      { x: -88, z: -88, r: 9, needCar: true },
      { x: 88, z: 0, r: 9, needCar: true }]
  },
];
let mState = "idle", mStep = 0, mTimer = 0, raceT = null;

// side jobs (unlock after chapter 5)
const SIDE_TARGETS = [[182, 132], [-182, -132], [44, -182], [132, -180], [-182, 220], [220, 44]];
const DEPOT = { x: -188, z: 132 };
let side = { stage: "idle" };  // idle | pickup | carry
const sideUnlocked = () => state.mi >= 5;
const sideReward = () => 75 + 25 * Object.keys(state.owned).length;

// ---------- dialogue ----------
let dlgLines = null, dlgIdx = 0, dlgCb = null;
const elD = dom("dialogue"), elWho = dom("dwho"), elText = dom("dtext");
dom("dhint").textContent = STR.tapToContinue;
function showDialogue(lines, cb) {
  dlgLines = lines; dlgIdx = 0; dlgCb = cb;
  renderDlg();
  elD.style.display = "block";
}
function renderDlg() {
  const [who, text] = dlgLines[dlgIdx];
  elWho.textContent = STR.who[who];
  elText.textContent = text;
}
function advanceDialogue() {
  if (!dlgLines) return;
  dlgIdx++;
  if (dlgIdx >= dlgLines.length) {
    dlgLines = null;
    elD.style.display = "none";
    const cb = dlgCb; dlgCb = null;
    if (cb) cb();
  } else renderDlg();
}
elD.addEventListener("pointerdown", e => { e.preventDefault(); advanceDialogue(); });

// ---------- toasts ----------
const elToast = dom("toast");
let toastTimer = 0;
function toast(msg) { elToast.textContent = msg; elToast.style.opacity = 1; toastTimer = 2.2; }

// ---------- mission flow ----------
function startMission(i) {
  mState = "intro"; mStep = 0; raceT = null;
  if (MISSIONS[i].onStart) MISSIONS[i].onStart();
  showDialogue(M[i].intro, () => { mState = "active"; });
}
function completeMission() {
  const i = state.mi;
  state.money += MISSIONS[i].reward;
  toast(STR.reward(MISSIONS[i].reward));
  AudioSys.play("jingle", 0.9);
  raceT = null;
  mState = "outro";
  showDialogue(M[i].outro, () => {
    state.mi++;
    save();
    if (state.mi === 5) toast(STR.sideUnlock);
    if (state.mi < M.length) { mState = "wait"; mTimer = 1.4; }
    else mState = "done";
  });
}
function updateMissions(dt) {
  if (dlgLines) return;
  if (mState === "wait") { mTimer -= dt; if (mTimer <= 0) startMission(state.mi); return; }
  if (mState !== "active") return;
  const mis = MISSIONS[state.mi], step = mis.steps[mStep];
  if (mis.race) {
    if (mStep >= mis.race.from) {
      if (raceT === null) raceT = mis.race.limit;
      raceT -= dt;
      if (raceT <= 0) { raceT = null; mStep = 0; toast(STR.raceFail); return; }
    } else raceT = null;
  }
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  let ok;
  if (step.cond) ok = step.cond();
  else ok = dist2(px, pz, step.x, step.z) < step.r * step.r && (!step.needCar || !!driving);
  if (ok) {
    if (step.onDone) step.onDone();
    mStep++;
    if (mStep >= mis.steps.length) completeMission();
  }
}
function updateSideJob() {
  if (!sideUnlocked() || mState === "intro" || dlgLines) { return; }
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (side.stage === "idle") { side.stage = "pickup"; }
  if (side.stage === "pickup") {
    if (dist2(px, pz, DEPOT.x, DEPOT.z) < 49) {
      const t = SIDE_TARGETS[(Math.random() * SIDE_TARGETS.length) | 0];
      side = { stage: "carry", x: t[0], z: t[1] };
    }
  } else if (side.stage === "carry") {
    if (dist2(px, pz, side.x, side.z) < 49) {
      state.money += sideReward();
      toast(STR.sideJobDone + "  " + STR.reward(sideReward()));
      AudioSys.play("cash");
      side = { stage: "pickup" };
      save();
    }
  }
}

// ---------- street races (freeplay) ----------
// Multiple circuits, each with its own checkered start gate, time limit, reward and best lap.
const CIRCUITS = [
  { id: "downtown", start: { x: roadC(2), z: roadC(4) }, limit: 52, reward: 500,
    cps: [[roadC(4), roadC(4)], [roadC(4), roadC(2)], [roadC(2), roadC(2)], [roadC(2), roadC(4)]] },
  { id: "outer", start: { x: roadC(1), z: roadC(1) }, limit: 72, reward: 800,
    cps: [[roadC(5), roadC(1)], [roadC(5), roadC(5)], [roadC(1), roadC(5)], [roadC(1), roadC(1)]] },
  { id: "harbor", start: { x: roadC(4), z: roadC(3) }, limit: 42, reward: 400,
    cps: [[roadC(6), roadC(3)], [roadC(6), roadC(5)], [roadC(4), roadC(5)], [roadC(4), roadC(3)]] },
];
const RACE_BEST_BONUS = 300, RACE_CP_R = 9;
let race = { stage: "idle", ci: -1, cp: 0, t: 0, armed: true };  // idle | active
{
  const post = new THREE.BoxGeometry(0.6, 4, 0.6);
  const matW = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const matB = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  for (const C of CIRCUITS) {
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(post, matW); p1.position.set(-3.4, 2, 0);
    const p2 = new THREE.Mesh(post, matW); p2.position.set(3.4, 2, 0);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.9, 0.3), matB);
    banner.position.set(0, 4.1, 0);
    g.add(p1, p2, banner);
    g.position.set(C.start.x, CURB, C.start.z);
    scene.add(g);
  }
}
function updateRace(dt) {
  if (state.mi < M.length || dlgLines) return;     // freeplay only
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (race.stage === "idle") {
    let at = -1;
    for (let i = 0; i < CIRCUITS.length; i++) {
      const s = CIRCUITS[i].start;
      if (dist2(px, pz, s.x, s.z) < RACE_CP_R * RACE_CP_R) { at = i; break; }
    }
    if (at < 0) race.armed = true;                 // leave every gate to re-arm
    else if (race.armed && driving) {
      race.stage = "active"; race.ci = at; race.cp = 0; race.t = CIRCUITS[at].limit; race.armed = false;
      toast(STR.raceStart(STR.circuits[CIRCUITS[at].id].name)); AudioSys.play("horn", 0.6);
      addShake(0.18); buzz(20);
    }
    return;
  }
  const C = CIRCUITS[race.ci];
  race.t -= dt;
  if (race.t <= 0) { race.stage = "idle"; toast(STR.raceTimeout); return; }
  const cp = C.cps[race.cp];
  if (driving && dist2(px, pz, cp[0], cp[1]) < RACE_CP_R * RACE_CP_R) {
    race.cp++;
    if (race.cp >= C.cps.length) {
      const time = C.limit - race.t;
      let reward = C.reward;
      const prev = state.races[C.id] || 0;
      const isBest = !prev || time < prev;
      if (isBest) { reward += RACE_BEST_BONUS; state.races[C.id] = time; }
      state.money += reward;
      toast(isBest ? STR.raceBest(reward, time) : STR.raceWin(reward, time));
      AudioSys.play("jingle", 0.9);
      addShake(0.4); buzz([0, 30, 30, 30, 30, 90]); flash("#ffe9a0", 0.4);
      burst(px, 0.4, pz, 18, 2.0, 2.6, 0.7, 0.9, 0.78, 0.3);
      race.stage = "idle"; race.armed = false;
      save();
    } else { AudioSys.play("cash", 0.5); burst(cp[0], 0.4, cp[1], 8, 1.4, 2.2, 0.5, 0.4, 0.7, 0.9); buzz(12); }
  }
}

// ---------- wanted level & police ----------
let wanted = 0, wantedCD = 0, crimeCD = 0;
function heatActive() {
  const mis = MISSIONS[state.mi];
  return (mis && mis.race && mState === "active") ? 0 : wanted;   // no heat during the timed race
}
function registerCrime() {
  const mis = MISSIONS[state.mi];
  if (mis && mis.race && mState === "active") return;
  if (crimeCD > 0) { wantedCD = 14; return; }
  crimeCD = 1.5; wantedCD = 14;
  if (wanted < 3) { wanted++; toast(STR.wantedToast(wanted)); }
}
function bust() {
  const fine = Math.round((100 + 80 * wanted) * (driving && driving.fineMult ? driving.fineMult : 1));
  state.money = Math.max(0, state.money - fine);
  toast(STR.busted(fine));
  AudioSys.play("door", 1);
  addShake(0.7); buzz([0, 60, 40, 120]); flash("#ff3b3b", 0.42);
  wanted = 0; wantedCD = 0; crimeCD = 0;
  for (const p of police) { p.active = false; p.mesh.position.set(0, -9999, 0); }
  save();
}
function updatePolice(dt) {
  if (crimeCD > 0) crimeCD -= dt;
  if (wanted > 0) {
    wantedCD -= dt * (driving && driving.heatMult ? driving.heatMult : 1);
    if (wantedCD <= 0) { wanted = Math.max(0, wanted - 1); wantedCD = 8; if (wanted === 0) toast(STR.wantedClear); }
  }
  const heat = heatActive();
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  for (let i = 0; i < police.length; i++) {
    const p = police[i];
    const want = i < heat;
    if (want && !p.active) {
      const ang = Math.random() * Math.PI * 2;
      p.x = clamp(px + Math.cos(ang) * 72, -HALF + 3, HALF - 3);
      p.z = clamp(pz + Math.sin(ang) * 72, -HALF + 3, HALF - 3);
      p.h = Math.atan2(px - p.x, pz - p.z); p.speed = 0; p.active = true;
    } else if (!want && p.active) {
      p.active = false; p.mesh.position.set(0, -9999, 0);
    }
    if (!p.active) continue;
    const dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz) || 1;
    p.h = lerpAngle(p.h, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
    const tgt = dlgLines ? 0 : 19;
    p.speed += (tgt - p.speed) * Math.min(1, 3 * dt);
    moveWithCollision(p, Math.sin(p.h) * p.speed * dt, Math.cos(p.h) * p.speed * dt, 2.1);
    p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
    p.mesh.rotation.y = p.h;
    p.bar.material.emissive.setHex((Math.floor(simTime * 6) % 2) ? 0x2244ff : 0xff2222);
    if (!dlgLines && d < 3.6) bust();
  }
}

// ---------- input ----------
const keys = new Set();
let actA = false, actB = false, bHeld = false;   // actA/actB edge-triggered, bHeld = sprint hold
addEventListener("keydown", e => {
  if (e.code === "Enter" || (e.code === "Space" && dlgLines)) { advanceDialogue(); e.preventDefault(); return; }
  if (e.code === "KeyE") actA = true;
  if (e.code === "KeyB") actB = true;
  keys.add(e.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.code));

// floating joystick (left side)
const elJoy = dom("joy"), elKnob = dom("knob");
let joyId = null, joyOx = 0, joyOy = 0, joyX = 0, joyY = 0;
addEventListener("pointerdown", e => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen) return;
  if (e.target.closest && (e.target.closest(".btn") || e.target.closest("#dialogue") || e.target.closest("#garage") || e.target.closest("#stats"))) return;
  if (e.clientX > innerWidth * 0.55 || joyId !== null) return;
  joyId = e.pointerId; joyOx = e.clientX; joyOy = e.clientY;
  elJoy.style.display = "block";
  elJoy.style.left = (joyOx - 60) + "px"; elJoy.style.top = (joyOy - 60) + "px";
  elKnob.style.left = "33px"; elKnob.style.top = "33px";
});
addEventListener("pointermove", e => {
  if (e.pointerId !== joyId) return;
  let dx = e.clientX - joyOx, dy = e.clientY - joyOy;
  const len = Math.hypot(dx, dy), max = 50;
  if (len > max) { dx *= max / len; dy *= max / len; }
  joyX = dx / max; joyY = -dy / max;
  if (Math.hypot(joyX, joyY) < 0.12) { joyX = 0; joyY = 0; }
  elKnob.style.left = (33 + dx) + "px"; elKnob.style.top = (33 + dy) + "px";
});
function joyEnd(e) {
  if (e.pointerId !== joyId) return;
  joyId = null; joyX = 0; joyY = 0;
  elJoy.style.display = "none";
}
addEventListener("pointerup", joyEnd);
addEventListener("pointercancel", joyEnd);
document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });

const btnA = dom("btnA"), btnB = dom("btnB");
btnA.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actA = true; });
btnB.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actB = true; bHeld = true; });
addEventListener("pointerup", () => { bHeld = false; });
addEventListener("pointercancel", () => { bHeld = false; });

function readInput() {
  let mx = joyX, mz = joyY;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  for (const gp of (navigator.getGamepads ? navigator.getGamepads() : [])) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.2) { mx += ax; mz -= ay; }
    if (gp.buttons[0] && gp.buttons[0].pressed) {
      if (!gpHeld) { gpHeld = true; if (dlgLines) advanceDialogue(); else actA = true; }
    } else gpHeld = false;
    if (gp.buttons[2] && gp.buttons[2].pressed) { if (!gpHeldB) { gpHeldB = true; actB = true; } } else gpHeldB = false;
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  return { mx, mz, mag: Math.min(len, 1) };
}
let gpHeld = false, gpHeldB = false;

// ---------- movement / collision ----------
function hitsCollider(x, z, r) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
function moveWithCollision(o, dx, dz, r) {
  const lim = HALF - 3;
  let nx = clamp(o.x + dx, -lim, lim);
  if (!hitsCollider(nx, o.z, r)) o.x = nx; else if (driving === o) { o.speed *= -0.25; carHit(o); }
  let nz = clamp(o.z + dz, -lim, lim);
  if (!hitsCollider(o.x, nz, r)) o.z = nz; else if (driving === o) { o.speed *= -0.25; carHit(o); }
}
function carHit(o) {
  if (colCD > 0) return;
  if (Math.abs(o.speed) < 3) return;                   // ignore gentle nudges
  colCD = 0.2; addShake(0.22); buzz(12);
  burst(o.x + Math.sin(o.h) * 2.2, 0.8, o.z + Math.cos(o.h) * 2.2, 5, 1.2, 1.4, 0.4, 0.6, 0.55, 0.4);
}
function groundY(x, z) {
  const u = x + HALF, v = z + HALF;
  const onRoad = (u % CELL) < ROAD || (v % CELL) < ROAD || u > N * CELL || v > N * CELL;
  return onRoad ? 0 : CURB;
}

// ---------- camera ----------
let camYaw = Math.PI;
const camPos = new THREE.Vector3(player.x, 8, player.z - 14);
const _look = new THREE.Vector3();

// ---------- HUD ----------
const elMoney = dom("money"), elIncome = dom("income"), elTitle = dom("mtitle"), elStep = dom("mstep");
const elPalms = dom("palms"), elWanted = dom("wanted");
const mapCtx = dom("minimap").getContext("2d");
let lastMoneyShown = -1, lastBtnA = "", lastBtnB = "";

function nearestCar() {
  let best = null, bd = 25;
  for (const c of cars) {
    if (c.locked) continue;                      // can't drive a car you haven't bought
    const d = dist2(player.x, player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestPersonalCar() {
  if (driving) return null;
  let best = null, bd = 20;
  for (const c of cars) {
    if (!c.personal) continue;
    const d = dist2(player.x, player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestBizAction() {
  if (driving) return null;
  for (const b of BIZ) {
    if (dist2(player.x, player.z, b.x, b.z) >= 20) continue;
    const lvl = state.owned[b.id] || 0;
    if (!lvl) return { b, mode: "buy", cost: b.cost, lvl: 1 };
    if (lvl < 3) return { b, mode: "up", cost: b.cost * lvl, lvl: lvl + 1 };
  }
  return null;
}

function currentObjective() {
  if (state.mi < M.length && mState === "active") {
    const mis = MISSIONS[state.mi], step = mis.steps[mStep];
    return { title: STR.missionTag(state.mi + 1) + " · " + M[state.mi].title, text: M[state.mi].steps[mStep], x: step.x, z: step.z };
  }
  if (state.mi >= M.length) {
    if (race.stage === "active") {
      const C = CIRCUITS[race.ci], cp = C.cps[race.cp];
      return { title: STR.raceTitle + " · " + STR.circuits[C.id].name, text: STR.raceProgress(race.cp + 1, C.cps.length) + " · " + STR.raceTimer(Math.ceil(race.t)), x: cp[0], z: cp[1] };
    }
    if (side.stage === "carry") return { title: STR.freeplay, text: STR.sideJobGo, x: side.x, z: side.z };
    if (sideUnlocked()) return { title: STR.freeplay, text: STR.sideJobAt, x: DEPOT.x, z: DEPOT.z };
    return { title: STR.freeplay, text: "", x: undefined };
  }
  return { title: state.mi < M.length ? STR.missionTag(state.mi + 1) + " · " + M[state.mi].title : "", text: "…" };
}

function updateHUD() {
  const m = Math.floor(state.money);
  if (m !== lastMoneyShown) { elMoney.textContent = STR.money(m); lastMoneyShown = m; }
  const rate = incomeRate();
  elIncome.textContent = rate ? STR.incomeRate(rate) : "";
  elPalms.textContent = STR.palmCount(palmsGot(), PALMS.length);
  const heat = heatActive();
  elWanted.textContent = heat > 0 ? "\u2605".repeat(heat) : "";

  const obj = currentObjective();
  elTitle.textContent = obj.title;
  let txt = (raceT !== null ? STR.raceTimer(Math.ceil(raceT)) + "  " : "") + (obj.text || "");
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (obj.x !== undefined) {
    txt += "  ·  " + STR.distance(Math.sqrt(dist2(px, pz, obj.x, obj.z)));
    missionMarker.group.visible = true;
    missionMarker.group.position.set(obj.x, groundY(obj.x, obj.z), obj.z);
  } else missionMarker.group.visible = false;
  elStep.textContent = txt;

  // side-job marker (orange) — hidden while a street race is on
  let svis = false, sx = DEPOT.x, sz = DEPOT.z;
  if (sideUnlocked() && race.stage !== "active") {
    if (side.stage === "pickup") svis = true;
    else if (side.stage === "carry") { svis = true; sx = side.x; sz = side.z; }
  }
  sideMarker.group.visible = svis;
  if (svis) sideMarker.group.position.set(sx, groundY(sx, sz), sz);

  // contextual buttons
  let a = "";
  if (!dlgLines) {
    if (driving) a = STR.btnExit;
    else if (nearestCar()) a = STR.btnDrive;
  }
  if (a !== lastBtnA) { btnA.style.display = a ? "block" : "none"; btnA.textContent = a; lastBtnA = a; }
  let b = "";
  if (!dlgLines) {
    if (driving) b = STR.btnHorn;
    else {
      const act = nearestBizAction();
      if (act) b = act.mode === "buy" ? STR.btnBuy(STR.biz[act.b.id].name, act.cost)
                                      : STR.btnUpgrade(act.lvl, act.cost);
      else {
        const pc = nearestPersonalCar();
        if (pc) b = pc.locked ? STR.btnBuyCar(STR.pcars[pc.pid].name, pc.price) : STR.btnRepaint;
        else b = STR.btnSprint;
      }
    }
  }
  if (b !== lastBtnB) { btnB.style.display = b ? "block" : "none"; btnB.textContent = b; lastBtnB = b; }
}

function drawMinimap(t) {
  const S = 132, sc = S / (2 * HALF);
  mapCtx.clearRect(0, 0, S, S);
  mapCtx.fillStyle = "rgba(22,32,26,.85)"; mapCtx.fillRect(0, 0, S, S);
  mapCtx.fillStyle = "#55606a";
  for (let k = 0; k <= N; k++) {
    const p = (roadC(k) + HALF) * sc - 2;
    mapCtx.fillRect(p, 0, 4, S);
    mapCtx.fillRect(0, p, S, 4);
  }
  mapCtx.fillStyle = "#5d9952";
  for (const key of PARKS) {
    const [i, j] = key.split(",").map(Number);
    mapCtx.fillRect((blockMin(i) + HALF) * sc, (blockMin(j) + HALF) * sc, BLOCK * sc, BLOCK * sc);
  }
  for (const b of BIZ) {
    mapCtx.fillStyle = state.owned[b.id] ? "#9fe6a0" : "#ffd166";
    mapCtx.beginPath(); mapCtx.arc((b.x + HALF) * sc, (b.z + HALF) * sc, 3, 0, 7); mapCtx.fill();
  }
  // garage (square) + owned personal cars (cyan dots)
  mapCtx.fillStyle = "#7fd6ff";
  mapCtx.fillRect((GARAGE.x + HALF) * sc - 3, (GARAGE.z + HALF) * sc - 3, 6, 6);
  for (const c of cars) if (c.personal && !c.locked) {
    mapCtx.beginPath(); mapCtx.arc((c.x + HALF) * sc, (c.z + HALF) * sc, 2.5, 0, 7); mapCtx.fill();
  }
  // street-race start gates (white, freeplay only)
  if (state.mi >= M.length) {
    mapCtx.fillStyle = "#ffffff";
    for (const C of CIRCUITS)
      mapCtx.fillRect((C.start.x + HALF) * sc - 2.5, (C.start.z + HALF) * sc - 2.5, 5, 5);
  }
  mapCtx.fillStyle = "#ffe24a";
  for (let i = 0; i < PALMS.length; i++) {
    if (palmCollected[i]) continue;
    mapCtx.fillRect((PALMS[i][0] + HALF) * sc - 1, (PALMS[i][1] + HALF) * sc - 1, 2.4, 2.4);
  }
  for (const p of police) if (p.active) {
    mapCtx.fillStyle = "#ff3b3b";
    mapCtx.beginPath(); mapCtx.arc((p.x + HALF) * sc, (p.z + HALF) * sc, 3, 0, 7); mapCtx.fill();
  }
  const obj = currentObjective();
  if (obj.x !== undefined && (t * 2 | 0) % 2 === 0) {
    mapCtx.fillStyle = "#ffd166";
    mapCtx.beginPath(); mapCtx.arc((obj.x + HALF) * sc, (obj.z + HALF) * sc, 4.5, 0, 7); mapCtx.fill();
  }
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  const h = driving ? driving.h : player.h;
  mapCtx.save();
  mapCtx.translate((px + HALF) * sc, (pz + HALF) * sc);
  mapCtx.rotate(Math.atan2(Math.cos(h), Math.sin(h)));
  mapCtx.fillStyle = "#ff7a33";
  mapCtx.beginPath(); mapCtx.moveTo(6, 0); mapCtx.lineTo(-4, 4); mapCtx.lineTo(-4, -4); mapCtx.closePath(); mapCtx.fill();
  mapCtx.restore();
}

// ---------- intro overlay ----------
const elIntro = dom("intro");
function buildIntro() {
  elIntro.innerHTML = "";
  const h1 = document.createElement("h1"); h1.textContent = STR.title;
  const tag = document.createElement("div"); tag.className = "tag"; tag.textContent = STR.tagline;
  const blurb = document.createElement("div"); blurb.className = "blurb"; blurb.textContent = STR.introBlurb;
  const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = STR.controlsHint;
  const start = document.createElement("button");
  start.textContent = hasSave ? STR.continueGame : STR.start;
  start.addEventListener("click", () => beginPlay());
  elIntro.append(h1, tag, blurb, start, hint);
  if (hasSave) {
    const reset = document.createElement("button");
    reset.className = "secondary"; reset.textContent = STR.newGame;
    reset.addEventListener("click", () => {
      if (confirm(STR.confirmReset)) { localStorage.removeItem(SAVE_KEY); location.reload(); }
    });
    elIntro.append(reset);
  }
}
function beginPlay() {
  if (hasSave) { load(); applyOwnership(); }
  refreshAch(false);           // seed already-earned achievements without re-announcing them
  elIntro.style.display = "none";
  state.phase = "play";
  AudioSys.init();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (state.mi < M.length) { mState = "wait"; mTimer = 0.7; }
  else mState = "done";
}
buildIntro();

// ---------- garage: showroom panel (stats + perk + buy / repaint) ----------
let garageOpen = false, garageCar = null;
const elGarage = dom("garage");
const PAINTS = [0xff6b5c, 0xff8c42, 0xf5c542, 0x58c97a, 0x20b2aa, 0x3fa9f5, 0x6a5acd, 0xc25cd6, 0xe8e4da, 0x2b2f36];
function applyPaint(hex) {
  if (!garageCar || garageCar.locked) return;
  garageCar.mesh.material.color.setHex(hex);
  state.cars[garageCar.pid] = hex;
  save();
}
{
  const sw = dom("gswatches");
  for (const hex of PAINTS) {
    const dot = document.createElement("div");
    dot.className = "gsw";
    dot.style.background = "#" + hex.toString(16).padStart(6, "0");
    dot.addEventListener("click", () => applyPaint(hex));
    sw.appendChild(dot);
  }
  const done = dom("gdone"); done.textContent = STR.garageDone; done.addEventListener("click", closeGarage);
  dom("gbuy").addEventListener("click", buyCurrent);
}
function renderShowroom() {
  const c = garageCar; if (!c) return;
  const p = STR.pcars[c.pid];
  dom("gtitle").textContent = p.name;
  const bar = (label, v, max) =>
    '<div class="grow"><span>' + label + '</span><div class="gbar"><i style="width:' +
    Math.round(Math.min(1, v / max) * 100) + '%"></i></div></div>';
  dom("gstats").innerHTML =
    bar(STR.garageSpeed, c.top, 40) + bar(STR.garageAccel, c.accel, 22) + bar(STR.garageHandling, c.turn, 2.4) +
    '<div class="gperk">★ ' + p.perk + "</div>";
  const buy = dom("gbuy");
  buy.style.display = c.locked ? "block" : "none";
  buy.textContent = STR.garageBuy(c.price);
  dom("gswatches").style.display = c.locked ? "none" : "flex";
}
function openShowroom(c) {
  garageCar = c; garageOpen = true;
  renderShowroom();
  elGarage.style.display = "flex";
}
function closeGarage() {
  garageOpen = false; garageCar = null;
  elGarage.style.display = "none";
}
function buyCurrent() {
  const c = garageCar; if (!c || !c.locked) return;
  if (state.money < c.price) { toast(STR.needMore(c.price - Math.floor(state.money))); return; }
  state.money -= c.price;
  unlockCar(c, c.mesh.material.color.getHex());
  state.cars[c.pid] = c.mesh.material.color.getHex();
  toast(STR.carBought(STR.pcars[c.pid].name));
  AudioSys.play("cash");
  save();
  renderShowroom();   // flip the panel to repaint mode so you can recolour your new ride
}

// ---------- achievements + progress panel ----------
const ownedBizCount = () => { let n = 0; for (const b of BIZ) if (state.owned[b.id]) n++; return n; };
const ownedCarCount = () => Object.keys(state.cars).length;
const ACH = [
  { id: "car1",    done: () => ownedCarCount() >= 1 },
  { id: "car3",    done: () => ownedCarCount() >= PCARS.length },
  { id: "biz6",    done: () => ownedBizCount() >= BIZ.length },
  { id: "palms12", done: () => palmsGot() >= PALMS.length },
  { id: "jump1",   done: () => (state.bestJump || 0) >= 1.0 },
  { id: "race1",   done: () => Object.keys(state.races).length > 0 },
  { id: "crown",   done: () => CIRCUITS.every(c => (state.races[c.id] || 0) > 0) },
  { id: "tycoon",  done: () => (state.maxMoney || 0) >= 50000 },
  { id: "story",   done: () => state.mi >= M.length },
];
const bestLap = () => { let b = 0; for (const k in state.races) { const v = state.races[k]; if (v > 0 && (!b || v < b)) b = v; } return b; };
function refreshAch(announce) {
  let changed = false;
  for (const a of ACH) {
    if (state.ach.includes(a.id) || !a.done()) continue;
    state.ach.push(a.id);
    changed = true;
    if (announce) { toast(STR.achUnlocked(STR.ach[a.id].name)); AudioSys.play("jingle", 0.8); }
  }
  if (changed && announce) save();
}

let statsOpen = false;
const elStats = dom("stats");
function renderStats() {
  dom("sttitle").textContent = STR.title + " · " + STR.statsTitle;
  const cell = (label, val) => '<div class="scell"><span>' + label + "</span><b>" + val + "</b></div>";
  let html = '<div class="sgrid">' +
    cell(STR.statCash, STR.money(Math.floor(state.money))) +
    cell(STR.statBiz, ownedBizCount() + "/" + BIZ.length) +
    cell(STR.statCars, ownedCarCount() + "/" + PCARS.length) +
    cell(STR.statPalms, palmsGot() + "/" + PALMS.length) +
    cell(STR.statJump, STR.statJumpVal(state.bestJump || 0)) +
    cell(STR.statRacesWon, Object.keys(state.races).length + "/" + CIRCUITS.length) +
    "</div>";
  html += '<div class="shead">' + STR.statBestLaps + "</div>";
  html += '<div class="sgrid">';
  for (const C of CIRCUITS) html += cell(STR.circuits[C.id].name, STR.statSeconds(state.races[C.id] || 0));
  html += "</div>";
  html += '<div class="shead">' + STR.achHeader + " · " + state.ach.length + "/" + ACH.length + "</div>";
  for (const a of ACH) {
    const on = state.ach.includes(a.id);
    html += '<div class="ach' + (on ? " on" : "") + '"><div class="amark">' + (on ? "★" : "·") +
      '</div><div class="atext"><b>' + STR.ach[a.id].name + "</b><span>" + STR.ach[a.id].desc + "</span></div></div>";
  }
  dom("stbody").innerHTML = html;
}
function openStats() { statsOpen = true; renderStats(); elStats.style.display = "flex"; }
function closeStats() { statsOpen = false; elStats.style.display = "none"; }
dom("statsbtn").addEventListener("click", () => { if (state.phase === "play" && !dlgLines) openStats(); });
dom("stclose").addEventListener("click", closeStats);
dom("stclose").textContent = STR.statsClose;
dom("streset").addEventListener("click", () => {
  if (confirm(STR.confirmReset)) { localStorage.removeItem(SAVE_KEY); location.reload(); }
});
dom("streset").textContent = STR.newGame;

// mute toggle (persisted separately from the save)
const muteBtn = dom("mute");
const MUTE_KEY = "palm_city_mute";
function setMute(m) {
  AudioSys.setMuted(m);
  muteBtn.textContent = m ? "\u{1F507}" : "\u{1F50A}";
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch (e) {}
}
muteBtn.addEventListener("click", () => setMute(!AudioSys.muted));
setMute((() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } })());

// ---------- actions ----------
function doActionA() {
  if (driving) {                                   // exit car
    const c = driving;
    const rx = -Math.cos(c.h), rz = Math.sin(c.h);
    let ex = c.x + rx * 2.6, ez = c.z + rz * 2.6;
    if (hitsCollider(ex, ez, 0.5)) { ex = c.x - rx * 2.6; ez = c.z - rz * 2.6; }
    player.x = clamp(ex, -HALF + 3, HALF - 3); player.z = clamp(ez, -HALF + 3, HALF - 3);
    player.h = c.h;
    c.speed = 0; c.lat = 0;
    driving = null;
    hero.group.visible = true;
    AudioSys.play("door", 0.8);
  } else {
    const c = nearestCar();
    if (c) { driving = c; hero.group.visible = false; AudioSys.play("door", 0.8); }
  }
}
function doActionB() {
  if (driving) {
    AudioSys.horn();
    for (const n of npcs) {
      if (dist2(n.x, n.z, driving.x, driving.z) < 144) {
        n.flee = 1.3;
        n.h = Math.atan2(n.x - driving.x, n.z - driving.z);
      }
    }
    return;
  }
  const act = nearestBizAction();
  if (act) {
    if (state.money >= act.cost) {
      state.money -= act.cost;
      state.owned[act.b.id] = act.lvl;
      markOwned(act.b);
      toast(act.mode === "buy" ? STR.purchased(STR.biz[act.b.id].name)
                               : STR.upgraded(STR.biz[act.b.id].name, act.lvl));
      AudioSys.play("cash");
      save();
    } else {
      toast(STR.needMore(act.cost - Math.floor(state.money)));
    }
    return;
  }
  const pc = nearestPersonalCar();
  if (pc) openShowroom(pc);
}

// ---------- simulation ----------
const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1);
let simTime = 0, achTimer = 1;

function update(dt) {
  simTime += dt;
  const inp = (dlgLines || garageOpen || statsOpen) ? { mx: 0, mz: 0, mag: 0 } : readInput();
  const a = actA, b = actB; actA = false; actB = false;
  if (a && !dlgLines && !garageOpen && !statsOpen) doActionA();
  if (b && !dlgLines && !garageOpen && !statsOpen) doActionB();

  if (driving) {
    const c = driving;
    // throttle / brake
    const accel = inp.mz > 0 ? (c.accel || 13) * inp.mz : 0;
    const brake = inp.mz < 0 ? 22 * -inp.mz : 0;
    c.speed += accel * dt;
    if (brake) c.speed = c.speed > 0 ? Math.max(0, c.speed - brake * dt) : Math.max(-8, c.speed - 6 * dt);
    if (inp.mz < 0 && c.speed <= 0) c.speed = Math.max(-8, c.speed - 8 * dt);
    c.speed -= c.speed * 0.6 * dt;                                  // drag
    c.speed = clamp(c.speed, -8, c.top || 26);
    const dir = c.speed >= 0 ? 1 : -1;
    const prevH = c.h;
    c.h -= inp.mx * (c.turn || 1.9) * dt * dir * clamp(Math.abs(c.speed) / 10, 0, 1);
    // momentum thrown to the outside of the turn => arcade drift at speed
    c.lat = clamp((c.lat || 0) * Math.exp(-4.2 * dt) + (c.h - prevH) * c.speed * 0.55, -12, 12);
    moveWithCollision(c,
      Math.sin(c.h) * c.speed * dt - Math.cos(c.h) * c.lat * dt,
      Math.cos(c.h) * c.speed * dt + Math.sin(c.h) * c.lat * dt, 2.1);
    // tyre-smoke puffs off the back when the car is sliding
    driftCD -= dt;
    if (c.y === 0 && Math.abs(c.lat) > 4.6 && Math.abs(c.speed) > 7 && driftCD <= 0) {
      driftCD = 0.04;
      emit(c.x - Math.sin(c.h) * 2.2, 0.3, c.z - Math.cos(c.h) * 2.2,
        rr(-0.5, 0.5), rr(0.4, 1.0), rr(-0.5, 0.5), 0.55, 0.4, 0.4, 0.44);
    }
    // stunt ramps + vertical physics
    if (c.rampCD > 0) c.rampCD -= dt;
    if (c.y === 0 && c.rampCD <= 0 && c.speed > 9) {
      for (const ramp of RAMPS) {
        const dx = c.x - ramp.x, dz = c.z - ramp.z;
        const lx = dx * Math.cos(ramp.h) - dz * Math.sin(ramp.h);
        const lz = dx * Math.sin(ramp.h) + dz * Math.cos(ramp.h);
        if (Math.abs(lx) < 3.5 && Math.abs(lz) < 4.5 && Math.cos(c.h - ramp.h) > 0.4) {
          c.vy = 6 + Math.min(c.speed, 26) * 0.4; c.y = 0.02; c.airStart = simTime; c.rampCD = 1.2;
          c.speed *= 1.05;
          burst(c.x, 0.3, c.z, 8, 1.4, 2.4, 0.5, 0.5, 0.45, 0.34);
          addShake(0.3); buzz(18);
          break;
        }
      }
    }
    if (c.y > 0 || c.vy !== 0) {
      c.vy -= 30 * dt; c.y += c.vy * dt;
      if (c.y <= 0) {
        c.y = 0; c.vy = 0;
        const air = simTime - (c.airStart || 0);
        if (air > 0.2) {
          burst(c.x, 0.25, c.z, 10, 1.9, 1.5, 0.55, 0.55, 0.48, 0.36);   // landing dust
          addShake(0.2 + Math.min(0.6, air * 0.5)); buzz(Math.min(60, 18 + (air * 40 | 0)));
        }
        if (air > 0.35) {
          const bonus = Math.round((40 + air * air * 240) * (c.jumpMult || 1));
          state.money += bonus;
          if (air > (state.bestJump || 0)) state.bestJump = air;
          toast(STR.jump(bonus));
          AudioSys.play("cash", 0.8);
          save();
        }
      }
    }
    camYaw = lerpAngle(camYaw, c.h, 1 - Math.exp(-3.2 * dt));
  } else {
    // camera-relative walk
    const f = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    const r = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    const wx = f.x * inp.mz + r.x * inp.mx, wz = f.z * inp.mz + r.z * inp.mx;
    const mag = inp.mag;
    const sprint = bHeld || keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = (mag > 0.72 ? 6.4 : mag * 4.6) * (sprint ? 1.32 : 1);
    player.speed = speed;
    if (mag > 0.01) {
      const len = Math.hypot(wx, wz) || 1;
      moveWithCollision(player, wx / len * speed * dt, wz / len * speed * dt, 0.45);
      player.h = lerpAngle(player.h, Math.atan2(wx, wz), 1 - Math.exp(-12 * dt));
      camYaw = lerpAngle(camYaw, Math.atan2(wx, wz), 1 - Math.exp(-1.6 * dt));
      player.walkPhase += speed * dt * 2.4;
    } else {
      player.walkPhase *= 1 - Math.min(1, 10 * dt);
    }
  }

  // traffic
  for (const t of traffic) {
    const [tx, tz] = t.wp[t.next];
    const dx = tx - t.x, dz = tz - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) { t.next = (t.next + 1) % 4; continue; }
    // yield near the player or the player's car
    const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
    const near = dist2(t.x, t.z, px, pz) < (driving ? 100 : 22);
    t.h = lerpAngle(t.h, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
    if (!near) { t.x += dx / d * t.speed * dt; t.z += dz / d * t.speed * dt; }
    t.mesh.position.set(t.x, groundY(t.x, t.z), t.z);
    t.mesh.rotation.y = t.h;
  }

  // pedestrians
  for (const n of npcs) {
    n.flee = (n.flee || 0) - dt;
    if (driving && Math.abs(driving.speed) > 5 && n.flee <= 0 &&
        dist2(n.x, n.z, driving.x, driving.z) < 49) {
      n.flee = 1.3;
      n.h = Math.atan2(n.x - driving.x, n.z - driving.z);
    }
    if (driving && Math.abs(driving.speed) > 8 && dist2(n.x, n.z, driving.x, driving.z) < 9) {
      n.flee = 1.6;
      n.h = Math.atan2(n.x - driving.x, n.z - driving.z);
      n.x += Math.sin(n.h) * 1.1; n.z += Math.cos(n.h) * 1.1;
      registerCrime();
    }
    n.timer -= dt;
    if (n.timer <= 0 && n.flee <= 0) { n.timer = rr(2, 6); n.h += rr(-1.4, 1.4); }
    const ox = n.x, oz = n.z;
    const sp = n.flee > 0 ? 3.8 : n.speed;
    moveWithCollision(n, Math.sin(n.h) * sp * dt, Math.cos(n.h) * sp * dt, 0.4);
    if (Math.abs(n.x - ox) + Math.abs(n.z - oz) < sp * dt * 0.3) n.h += Math.PI + rr(-0.5, 0.5);
    const gy = groundY(n.x, n.z);
    n.mesh.position.set(n.x, gy + Math.abs(Math.sin(simTime * 9 + n.phase)) * 0.05, n.z);
    n.mesh.rotation.y = n.h;
    n.mesh.rotation.z = Math.sin(simTime * 9 + n.phase) * 0.07;
  }

  // income + missions
  state.money += incomeRate() / 60 * dt;
  envUpdate();
  // tip jars: owned businesses fill up; collect by stopping by on foot
  for (const b of BIZ) {
    const lvl = state.owned[b.id] || 0;
    if (!lvl) continue;
    b.tips = Math.min(b.tips + b.rate * lvl * 0.1 / 60 * dt, b.rate * lvl);
    if (!driving && b.tips >= 5 && dist2(player.x, player.z, b.x, b.z) < 25) {
      const amt = Math.floor(b.tips);
      b.tips = 0;
      state.money += amt;
      toast(STR.tips(amt));
      AudioSys.play("cash", 0.9);
    }
  }
  AudioSys.engine(driving ? Math.abs(driving.speed) : 0);
  updateMissions(dt);
  updateSideJob();
  updateRace(dt);
  updatePolice(dt);
  achTimer -= dt; if (achTimer <= 0) { achTimer = 1; refreshAch(true); }
  {
    const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
    for (let i = 0; i < PALMS.length; i++) {
      const x = PALMS[i][0], z = PALMS[i][1];
      if (!palmCollected[i] && dist2(px, pz, x, z) < 12) collectPalm(i);
      if (palmCollected[i]) { tmpP.set(0, -50, 0); tmpS.set(0.001, 0.001, 0.001); }
      else { tmpP.set(x, CURB + 1.5 + Math.sin(simTime * 2 + i) * 0.25, z); tmpS.set(1, 1, 1); }
      palmQ.setFromAxisAngle(UP, simTime * 1.6 + i);
      tmpM.compose(tmpP, palmQ, tmpS);
      palmIM.setMatrixAt(i, tmpM);
    }
    palmIM.instanceMatrix.needsUpdate = true;
  }

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) elToast.style.opacity = 0; }

  // player mesh
  if (!driving) {
    const gy = groundY(player.x, player.z);
    player.y += (gy - player.y) * Math.min(1, 12 * dt);
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.y = player.h;
    const sw = Math.sin(player.walkPhase) * Math.min(1, player.speed / 4) * 0.75;
    hero.legL.rotation.x = sw; hero.legR.rotation.x = -sw;
    hero.armL.rotation.x = -sw * 0.8; hero.armR.rotation.x = sw * 0.8;
  }
  for (const c of cars) {
    if (c !== driving && c.y > 0) { c.vy -= 30 * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y === 0) c.vy = 0; }
    const gy = groundY(c.x, c.z);
    c.mesh.position.set(c.x, gy + (c.y || 0), c.z);
    c.mesh.rotation.y = c.h;
    c.mesh.rotation.x = (c.y > 0) ? clamp(-c.vy * 0.02, -0.5, 0.5) : 0;
  }

  // story characters idle bob
  marco.position.y = CURB + Math.abs(Math.sin(simTime * 2.2)) * 0.04;
  if (rosa.visible) rosa.position.y = CURB + Math.abs(Math.sin(simTime * 2.5 + 1)) * 0.04;
  vince.visible = state.mi === 8;
  if (vince.visible) vince.position.y = CURB + Math.abs(Math.sin(simTime * 2.0 + 2)) * 0.03;

  // markers pulse
  const pulse = 1 + Math.sin(simTime * 4) * 0.13;
  missionMarker.ring.scale.setScalar(pulse);
  sideMarker.ring.scale.setScalar(pulse);

  // blob shadows
  let si = 0;
  const put = (x, y, z, r) => {
    tmpP.set(x, y + 0.06, z); tmpS.set(r, 1, r);
    tmpM.compose(tmpP, tmpQ, tmpS);
    shadowIM.setMatrixAt(si++, tmpM);
  };
  if (!driving) put(player.x, player.y, player.z, 0.55); else put(0, -10, 0, 0.01);
  for (const c of cars) put(c.x, c.mesh.position.y, c.z, 2.2);
  for (const t of traffic) put(t.x, t.mesh.position.y, t.z, 2.2);
  for (const p of police) { if (p.active) put(p.x, p.mesh.position.y, p.z, 2.2); else put(0, -10, 0, 0.01); }
  for (const n of npcs) put(n.x, groundY(n.x, n.z), n.z, 0.5);
  put(marco.position.x, CURB, marco.position.z, 0.5);
  if (rosa.visible) put(rosa.position.x, CURB, rosa.position.z, 0.5); else put(0, -10, 0, 0.01);
  if (vince.visible) put(vince.position.x, CURB, vince.position.z, 0.5); else put(0, -10, 0, 0.01);
  shadowIM.instanceMatrix.needsUpdate = true;

  if (colCD > 0) colCD -= dt;
  updateParticles(dt);

  // camera
  const tx = driving ? driving.x : player.x, tz = driving ? driving.z : player.z;
  const ty = driving ? driving.mesh.position.y : player.y;
  const dist = driving ? 14 : 9, h = driving ? 6 : 4.4;
  tmpP.set(tx - Math.sin(camYaw) * dist, ty + h, tz - Math.cos(camYaw) * dist);
  camPos.lerp(tmpP, 1 - Math.exp(-5 * dt));
  camera.position.copy(camPos);
  // screen shake (impacts, landings, busts, wins)
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.4);
    const s = shake * shake * 0.7;
    camera.position.x += rr(-s, s); camera.position.y += rr(-s, s) * 0.5; camera.position.z += rr(-s, s);
  }
  // speed-based FOV for a sense of velocity while driving
  const tgtFov = 64 + (driving ? clamp(Math.abs(driving.speed) / 26, 0, 1) * 13 : 0);
  if (Math.abs(camera.fov - tgtFov) > 0.04) { camera.fov += (tgtFov - camera.fov) * Math.min(1, 8 * dt); camera.updateProjectionMatrix(); }
  _look.set(tx, ty + 1.7, tz);
  camera.lookAt(_look);
}

// ---------- autosave ----------
setInterval(() => { if (state.phase === "play") save(); }, 8000);

// ---------- main loop (fixed timestep) ----------
const STEP = 1 / 60;
let acc = 0, last = performance.now(), paused = false;
addEventListener("blur", () => paused = true);
addEventListener("focus", () => { paused = false; last = performance.now(); });
document.addEventListener("visibilitychange", () => {
  paused = document.hidden;
  if (!paused) last = performance.now();
});

const devEl = dom("dev");
const devOn = new URLSearchParams(location.search).has("dev");
if (devOn) devEl.style.display = "block";
let frames = 0, fpsAt = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  acc = Math.min(acc + (now - last) / 1000, 0.25);
  last = now;
  if (state.phase === "play") {
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    updateHUD();
    drawMinimap(now / 1000);
  } else acc = 0;
  renderer.render(scene, camera);
  if (devOn && (frames++, now - fpsAt >= 500)) {
    devEl.textContent = Math.round(frames * 1000 / (now - fpsAt)) + " fps · " +
      renderer.info.render.calls + " calls · " + renderer.info.render.triangles + " tris";
    frames = 0; fpsAt = now;
  }
}
requestAnimationFrame(frame);

// dev instrumentation: programmatic state/input access for automated smoke runs (?dev=1 tooling)
globalThis.__palmCity = {
  state, player, cars, police, update, beginPlay, advanceDialogue,
  forceCrime: () => { if (wanted < 3) wanted++; wantedCD = 14; },
  paint: hex => applyPaint(hex),
  buyCurrent: () => buyCurrent(),
  closeGarage: () => closeGarage(),
  openStats: () => openStats(),
  closeStats: () => closeStats(),
  refreshAch: () => refreshAch(true),
  debug: () => ({ mState, mStep, raceT, dlg: !!dlgLines, driving: !!driving, side: side.stage, sx: side.x, sz: side.z, tips0: BIZ[0].tips, wanted, palms: palmsGot(), bestJump: state.bestJump || 0, garage: garageOpen, race: race.stage, rcp: race.cp, stats: statsOpen }),
};
