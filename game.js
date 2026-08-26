// Palm City — mobile open-world story game. Three.js r160, procedural assets.
import * as THREE from "./vendor/three.module.js";
import { STR } from "./strings.js";
import { AudioSys } from "./audio.js";
import { mulberry32, rng, rr, pick, N, CELL, ROAD, BLOCK, HALF, roadC, blockMin, bc, O, Rc, Bm, Bc, CURB, clamp, dist2, lerpAngle } from "./util.js";
import { boxGeoC, colorize, cylC, sphC, mergeGeos, textSprite } from "./geometry.js";
import { setAnisotropy, setTexScale, canvasTex, canvasNormalTex, speckle, buildWorldTextures } from "./textures.js";
import { matPerson, personGeo, articulatedPerson, walkerGeos, makeWalker, HERO_PAL, NPC_PALS, npcGeos, npcWalkerGeos } from "./characters.js";
import { initRagdolls, ragRng, rrand, ragdolls, RAG_G, spawnRagdoll, updateRagdolls } from "./ragdoll.js";
import { initVehicles, wheelGeo, carGeo, bikeGeo, CAR_COLORS, makeCar, makeBike, makeHeli, makeBoat, makeJetSki, makePlane, makeBlob } from "./vehicles.js";
import { initProjectiles, projPool, fireProjectile, updateProjectiles, muzzleFlash, updateFlashes } from "./projectiles.js";
import { initArcade, arcadeOpen, openArcade, closeArcade, updateArcade, ARC_BY_CAB } from "./arcade.js";
import { initWeather, updateWeather, weatherMode, cycleWeatherMode } from "./weather.js";
import { initOcean, updateOcean, sharks, swimmers, fishing, fishTap, treasures, dive, nearTreasure, startDive, diveDepth } from "./ocean.js";
import { initEvents, updateEvents, eventObjective, eventActive, _debug as eventsDebug } from "./events.js";

// ---------- renderer / scene ----------
const dom = id => document.getElementById(id);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.body.innerHTML = "<p style='color:#333;padding:40px;font-size:18px'>" + STR.noWebgl + "</p>";
  throw e;
}
// graphics mode (player-toggleable): Quality = crisp + 4x MSAA; Performance = lighter for slower phones
let gfxMode = (() => { try { return localStorage.getItem("palm_city_gfx") || "quality"; } catch (e) { return "quality"; } })();
const DPR = devicePixelRatio || 1;
let PR_CAP = Math.min(DPR, gfxMode === "perf" ? 1.25 : 2);   // adaptive-resolution ceiling
let PR_FLOOR = Math.min(PR_CAP, 1.0);                  // never blurrier than native 1x — no "Minecraft" look
let msaaSamples = gfxMode === "perf" ? 0 : 4;          // antialiasing on the offscreen scene buffer
let pr = PR_CAP;
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight);
const MAXANISO = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 1;   // crisp textures at grazing angles
setAnisotropy(MAXANISO);   // textures.js reads this for every canvas texture it builds

// post-processing bloom (default ON for the premium neon look; any failure silently falls back to
// the plain renderer, and the adaptive pixel-ratio guard keeps fps up — toggle in the progress panel)
const BLOOM_KEY = "palm_city_bloom";
let bloomOn = (() => { try { const v = localStorage.getItem(BLOOM_KEY); return v === null ? true : v === "1"; } catch (e) { return true; } })();
let bloomReady = false, bloomFailed = false, bloomW = 0, bloomH = 0;
let rtScene, rtB1, rtB2, fsScene, fsCam, fsQuad, brightMat, blurMat, compMat;
let rtAO, rtAOb, aoMat;   // depth-based ambient occlusion (rides the bloom offscreen pass)
let aoOn = (() => { try { return localStorage.getItem("palm_city_ao") !== "0"; } catch (e) { return true; } })();
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // filmic highlight roll-off for a premium look
renderer.toneMappingExposure = 1.3;
renderer.domElement.id = "scene";   // CSS color-grades the 3D layer (HUD sits above, ungraded)
document.body.insertBefore(renderer.domElement, document.getElementById("ui"));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf9c071);          // golden-hour haze (warm, sunset-biased cycle)
scene.fog = new THREE.Fog(0xf9c071, 230, 720);

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.5, 900);
camera.position.set(0, 8, -14);

const hemi = new THREE.HemisphereLight(0xffe8c4, 0x8a7355, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
sun.position.set(120, 160, 80);
scene.add(sun);
scene.add(sun.target);

// real-time sun shadows (dynamic objects only, to stay mobile-friendly); follows the player.
// On phones, shave the shadow cost (a smaller map + cheaper filter) — ~50% less shadow work for a
// barely-visible difference. Desktop keeps the crisp 3072² PCFSoft shadows.
const isMobile = (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; }
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 2048 : 3072, isMobile ? 2048 : 3072);
sun.shadow.camera.near = 8; sun.shadow.camera.far = 560;
sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
const _sunDir = new THREE.Vector3(0.45, 0.8, 0.4).normalize();   // current key-light direction (set by the cycle)
function updateSunShadow() {
  // snap the shadow frustum to whole-texel steps so its texels stay put in the world as the player
  // moves — otherwise sub-texel drift makes every shadow edge crawl/shimmer during fast movement.
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const rx = driving ? driving.x : player.x, rz = driving ? driving.z : player.z;
  const tx = Math.round(rx / texel) * texel, tz = Math.round(rz / texel) * texel;
  sun.target.position.set(tx, 0, tz);                 // keep the shadow frustum centred on the action
  sun.position.set(tx + _sunDir.x * 240, _sunDir.y * 240, tz + _sunDir.z * 240);
}

// image-based environment so car paint gets real reflections (built once from a sky gradient)
try {
  const ec = document.createElement("canvas"); ec.width = 256; ec.height = 128;
  const ex = ec.getContext("2d"), grd = ex.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0.00, "#8fbfe8"); grd.addColorStop(0.45, "#d6e6f0");
  grd.addColorStop(0.54, "#ffe8c0"); grd.addColorStop(0.74, "#caa570");
  grd.addColorStop(1.00, "#6f5d44");
  ex.fillStyle = grd; ex.fillRect(0, 0, 256, 128);
  const skyEq = new THREE.CanvasTexture(ec); skyEq.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(skyEq).texture;
  skyEq.dispose(); pmrem.dispose();
} catch (e) { /* reflections optional — fall back to lit materials */ }

const specialMats = [];   // facade materials of the business buildings (ramped by the night cycle)

// sky group follows the camera so the dome/sun/clouds are always centred on the player
// (essential now the city is far larger than the dome radius)
const skyGroup = new THREE.Group(); skyGroup.frustumCulled = false; scene.add(skyGroup);
// gradient sky dome (1 draw call) — zenith→horizon, recoloured by the day/night cycle
const skyUniforms = {
  topColor: { value: new THREE.Color(0x4a90d9) },
  horizonColor: { value: new THREE.Color(0xf7c98e) },
  exponent: { value: 0.65 },
  hazeColor: { value: new THREE.Color(0xfbd9a6) },
  cloudColor: { value: new THREE.Color(0xffffff) },
  cloudAmt: { value: 0.6 },
  sunDir: { value: new THREE.Vector3(0, 0.6, -1).normalize() },
  sunCol: { value: new THREE.Color(0xffe6b0) },
  uTime: { value: 0 },
};
const SKY_FRAG = `
  uniform vec3 topColor; uniform vec3 horizonColor; uniform float exponent;
  uniform vec3 hazeColor; uniform vec3 cloudColor; uniform float cloudAmt;
  uniform vec3 sunDir; uniform vec3 sunCol; uniform float uTime;
  varying vec3 vDir;
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    float a=h21(i), b=h21(i+vec2(1.0,0.0)), c=h21(i+vec2(0.0,1.0)), d=h21(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
  float fbm(vec2 p){ float s=0.0, a=0.5; for(int k=0;k<5;k++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
  void main(){
    vec3 dir = normalize(vDir);
    float f = pow(max(dir.y,0.0), exponent);
    vec3 sky = mix(horizonColor, topColor, f);
    sky = mix(sky, hazeColor, smoothstep(0.22, -0.02, dir.y) * 0.7);   // thick haze toward the horizon
    float sd = max(dot(dir, sunDir), 0.0);
    sky += sunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 260.0) * 1.1);       // atmospheric sun scattering
    if (dir.y > 0.015) {
      vec2 uv = dir.xz / (dir.y + 0.16);
      float c = fbm(uv * 1.7 + vec2(uTime * 0.011, uTime * 0.005));
      c = smoothstep(0.52, 0.96, c) * smoothstep(0.0, 0.32, dir.y) * cloudAmt;
      vec3 lit = mix(cloudColor, sunCol, pow(sd, 3.0) * 0.6);            // clouds catch the sun
      sky = mix(sky, lit, c);
    }
    gl_FragColor = vec4(sky, 1.0);
  }`;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: SKY_FRAG,
  }));
skyDome.frustumCulled = false;
skyGroup.add(skyDome);

// sun (warm glowing disc) — bright by day, arcs across the sky
const sunTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  for (let r = c; r > 0; r--) { ctx.globalAlpha = Math.pow(1 - r / c, 1.6) * 0.85; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); }
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xfff0bd, transparent: true, opacity: 1, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(78, 78, 1);
skyGroup.add(sunSprite);
// wide atmospheric glare halo around the sun (warm bloom-like spill across the sky)
const sunGlare = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunGlare.scale.set(340, 340, 1);
skyGroup.add(sunGlare);
// moon (pale cratered disc) — rises at night, opposite the sun
const moonTex = canvasTex(96, (ctx, s) => {
  const c = s / 2;
  ctx.globalAlpha = 1; ctx.fillStyle = "#e9edf6"; ctx.beginPath(); ctx.arc(c, c, c * 0.8, 0, 7); ctx.fill();
  ctx.fillStyle = "#c2cad9";
  for (const cr of [[0.40, 0.40, 0.13], [0.62, 0.54, 0.09], [0.50, 0.66, 0.07], [0.34, 0.60, 0.055], [0.58, 0.34, 0.05]]) {
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(s * cr[0], s * cr[1], s * cr[2], 0, 7); ctx.fill();
  }
});
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
moonSprite.scale.set(58, 58, 1);
skyGroup.add(moonSprite);

// sky detail: drifting clouds (day) + stars (night) + sun/moon arc, faded by the night factor
let starPts = null, cloudPts = null, cloudPos = null, cloudBase = null, cloudN = 0;
const C_DAY = new THREE.Color(0xffe7c0), C_HORIZON = new THREE.Color(0xff7a2e), C_MOON = new THREE.Color(0x9fb4e0), _lc = new THREE.Color(), _white = new THREE.Color(0xffffff);
function setSky(night) {
  const t = (simTime / 240) % 1, sa = t * Math.PI * 2, sy = Math.sin(sa), cx = Math.cos(sa);
  sunSprite.position.set(cx * 340, sy * 210 + 90, -240);
  sunSprite.material.opacity = clamp(1 - night * 1.4, 0, 1);
  sunGlare.position.copy(sunSprite.position);
  // glare blooms strongest when the sun is low (sunrise/sunset), and dies out at night
  sunGlare.material.opacity = clamp(1 - night * 1.5, 0, 1) * (0.22 + clamp(1 - Math.abs(sy) * 1.4, 0, 1) * 0.5);
  moonSprite.position.set(-cx * 340, -sy * 210 + 90, -240);
  moonSprite.material.opacity = clamp(night * 1.3, 0, 1);
  // key light follows whichever body is up, and warms near the horizon / cools at night
  const lx = (night > 0.5 ? -cx : cx), ly = Math.max(0.35, Math.abs(sy));
  sun.position.set(lx * 200, ly * 240, 90);
  _sunDir.copy(sun.position).normalize();   // remember the light direction for the player-following shadow
  const horizon = (1 - night) * clamp(1 - Math.abs(sy) * 1.6, 0, 1);
  _lc.copy(C_DAY).lerp(C_HORIZON, horizon).lerp(C_MOON, night);
  sun.color.copy(_lc);
  if (starPts) starPts.material.opacity = Math.min(1, night) * 0.95;
  if (cloudPts) {
    cloudPts.material.opacity = (1 - night) * 0.32;
    cloudPts.material.color.copy(_lc).lerp(_white, 0.5);   // clouds catch the warm sunset light
    for (let i = 0; i < cloudN; i++) { let x = cloudBase[i] + simTime * 3; cloudPos[i * 3] = ((x + 700) % 1400 + 1400) % 1400 - 700; }
    cloudPts.geometry.attributes.position.needsUpdate = true;
  }
  // procedural sky-dome: feed sun direction, scattering colour and drifting cloud layer
  skyUniforms.uTime.value = simTime;
  skyUniforms.sunDir.value.copy(sunSprite.position).normalize();
  skyUniforms.sunCol.value.copy(_lc).multiplyScalar(clamp(1 - night, 0.04, 1) * 0.9);
  skyUniforms.hazeColor.value.copy(skyUniforms.horizonColor.value).lerp(_white, 0.12);
  skyUniforms.cloudColor.value.copy(_white).lerp(_lc, 0.3 + night * 0.45);
  skyUniforms.cloudAmt.value = 0.35 + (1 - night) * 0.3;   // puffy by day, faint wisps at night
}

// neon glow cloud (fake bloom) — additive sprites at landmarks/signs, lit by the night factor
let glowGeo = null, glowBase = null, glowCol = null;
function setGlow(night) {
  if (!glowGeo) return;
  const g = Math.max(0, (night - 0.15) / 0.85);   // off by day, full at night
  for (let i = 0; i < glowCol.length; i++) glowCol[i] = glowBase[i] * g;
  glowGeo.attributes.color.needsUpdate = true;
}

// day/night cycle (4 min): warm day -> dusk -> night -> dawn
const ENV_KEYS = [
  // Golden-sunset biased cycle: warm amber daytime, a rich sunset, then a short night.
  { t: 0.00, sky: new THREE.Color(0xf9c071), top: new THREE.Color(0xf0934a), sun: 1.55, hemi: 1.02, far: 720, night: 0.0 },
  { t: 0.50, sky: new THREE.Color(0xf9c071), top: new THREE.Color(0xf0934a), sun: 1.55, hemi: 1.02, far: 720, night: 0.0 },
  { t: 0.60, sky: new THREE.Color(0xf3863f), top: new THREE.Color(0xb44e72), sun: 1.2,  hemi: 0.82, far: 660, night: 0.4 },
  { t: 0.68, sky: new THREE.Color(0x6a4368), top: new THREE.Color(0x281f40), sun: 0.5,  hemi: 0.55, far: 560, night: 0.85 },
  { t: 0.82, sky: new THREE.Color(0x2c3354), top: new THREE.Color(0x10142c), sun: 0.2,  hemi: 0.46, far: 560, night: 1.0 },
  { t: 0.90, sky: new THREE.Color(0xef9b63), top: new THREE.Color(0x8a5e8c), sun: 1.05, hemi: 0.86, far: 660, night: 0.32 },
  { t: 1.00, sky: new THREE.Color(0xf9c071), top: new THREE.Color(0xf0934a), sun: 1.55, hemi: 1.02, far: 720, night: 0.0 },
];
// neutral-daylight alternative ("midday" lighting option): cool blue daytime sky + clearer air,
// keeping the same dusk/night so the cycle still has variety. selected via the stats-panel toggle.
const ENV_MIDDAY = [
  { t: 0.00, sky: new THREE.Color(0xbcd6ec), top: new THREE.Color(0x7fb0e0), sun: 1.85, hemi: 1.12, far: 880, night: 0.0 },
  { t: 0.50, sky: new THREE.Color(0xbcd6ec), top: new THREE.Color(0x7fb0e0), sun: 1.85, hemi: 1.12, far: 880, night: 0.0 },
  { t: 0.60, sky: new THREE.Color(0xe6ab78), top: new THREE.Color(0xb0687a), sun: 1.2,  hemi: 0.82, far: 680, night: 0.4 },
  { t: 0.68, sky: new THREE.Color(0x6a4368), top: new THREE.Color(0x281f40), sun: 0.5,  hemi: 0.55, far: 560, night: 0.85 },
  { t: 0.82, sky: new THREE.Color(0x2c3354), top: new THREE.Color(0x10142c), sun: 0.2,  hemi: 0.46, far: 560, night: 1.0 },
  { t: 0.90, sky: new THREE.Color(0x9fb9d8), top: new THREE.Color(0x6a8ec0), sun: 1.15, hemi: 0.88, far: 700, night: 0.32 },
  { t: 1.00, sky: new THREE.Color(0xbcd6ec), top: new THREE.Color(0x7fb0e0), sun: 1.85, hemi: 1.12, far: 880, night: 0.0 },
];
let dayMode = (() => { try { return localStorage.getItem("palm_city_light") === "golden" ? "golden" : "midday"; } catch (e) { return "midday"; } })();   // neutral midday is the default look
// day/night cycle is OFF by default — the constant tint-shifting reads as the screen "filtering".
// Locked to a stable bright daytime (DAY_T); re-enable the moving cycle from the settings panel.
let dayCycle = (() => { try { return localStorage.getItem("palm_city_cycle") === "1"; } catch (e) { return false; } })();
const DAY_T = 0.25;
let gNight = 0;   // current night factor (0 bright day … 1 deep night), shared across systems
let gradeSat = dayMode === "midday" ? 1.06 : 1.12;   // saturation multiplier in the final grade — punchy, toy-diorama colour
const _sky = new THREE.Color(), _top = new THREE.Color(), _sunCol = new THREE.Color();
function envUpdate() {
  const KEYS = dayMode === "midday" ? ENV_MIDDAY : ENV_KEYS;
  const t = dayCycle ? (simTime / 240) % 1 : DAY_T;   // locked to bright daytime unless the cycle is on
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 1; i < KEYS.length; i++) {
    if (KEYS[i].t >= t) { a = KEYS[i - 1]; b = KEYS[i]; break; }
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
  gNight = night;                                               // shared so other systems (e.g. the chopper searchlight) can dim by day
  palmIM.material.emissiveIntensity = 1 + night * 1.7;          // Golden Palms glow at night
  if (buildingMat) buildingMat.emissiveIntensity = night * 1.2;    // windows light up after dark
  for (const mm of specialMats) mm.emissiveIntensity = night * 1.2;   // business windows too
  if (lampMat) lampMat.emissiveIntensity = night * 2.2;            // street lamps glow after dark
  if (lampPoolMat) lampPoolMat.opacity = night * 0.5;             // ground light pools under lamps
  if (nsPool) nsPool.opacity = ewPool.opacity = night * 0.4;       // traffic-signal road spill — night only
  if (lampConeMat) lampConeMat.opacity = night * 0.16;            // volumetric light shafts under lamps
  setGlow(night);
  setSky(night);
  updateCarLights(night);
  updateHeadBeams(night);
  updateTrafficBeams(night);
}

addEventListener("resize", onResize);
addEventListener("orientationchange", onResize);
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ---------- procedural textures — moved to textures.js ----------
// built HERE (not at module load) so the seeded-RNG stream is consumed at the exact same point
// in startup as when these were inline constants — the deterministic world stays byte-identical.
// Phones halve every canvas: the full-size set is ~130MB of VRAM once mipmapped, which desktop
// absorbs happily and mobile does not. Detail counts scale with area, so the smaller tiles keep
// the same look, just softer.
setTexScale(isMobile ? 0.5 : 1);
const { texAsphalt, texAsphaltNormal, texAsphaltRough, texSidewalk, texSidewalkNormal, texSidewalkRough,
  texGrass, texLeaf, texCrosswalk, texArrow, texFacade, texWindows, texFacadeNormal,
  texTower, texTowerWin, texTowerRough, texGhetto, texGhettoWin } = buildWorldTextures();

// ---------- geometry helpers (merged vertex-colored boxes => 1 draw call per model) ----------
// moved to geometry.js — imported at the top of the file
const _col = new THREE.Color();   // scratch colour, still used by instanced-tint code below

// ---------- world build ----------
const colliders = [];   // {x0,x1,z0,z1}
const ENTERABLES = [];  // buildings you can walk into: { x, z, name, r (squared radius) }
const colGrid = new Map();   // spatial hash so collision stays O(1) however big the city gets
const colCell = v => Math.floor((v + HALF) / CELL);
const addCollider = (x, z, hw, hd) => {
  const b = { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
  colliders.push(b);
  for (let ci = colCell(b.x0); ci <= colCell(b.x1); ci++)
    for (let cj = colCell(b.z0); cj <= colCell(b.z1); cj++) {
      const k = ci + "," + cj; let a = colGrid.get(k); if (!a) colGrid.set(k, a = []); a.push(b);
    }
  return b;
};
const disableCollider = b => { b.x0 = b.x1 = b.z0 = b.z1 = 1e9; };   // degenerate box — never hits again, cheaper than unlinking from every grid cell
// prop-physics bookkeeping (declared here since street clutter registers into it at world-build time,
// before the rest of the prop-physics module below has run) — see "prop physics" further down.
const knockableProps = [];
const colliderToProp = new Map();
const activeProps = [];
const propEuler = new THREE.Euler();
// coarse render chunks so the big-city instanced meshes get frustum-culled per region
const CHUNKW = 4 * CELL;
const chunkKey = (x, z) => Math.floor((x + HALF) / CHUNKW) + "," + Math.floor((z + HALF) / CHUNKW);
function byChunk(list) { const map = new Map(); for (const b of list) { const k = chunkKey(b.x, b.z); let a = map.get(k); if (!a) map.set(k, a = []); a.push(b); } return [...map.values()]; }

const matVC = new THREE.MeshLambertMaterial({ vertexColors: true });
let roadMat = null, sidewalkMat = null;   // exposed so rain can make the floor wet
let oceanTex = null;   // exposed so the sea can drift/shimmer
let seaNormTex = null; // animated ripple normals so the surface catches the sun
let foamMat = null;    // shoreline foam (pulses like waves)
let seaWave = null;    // {geo} segmented ocean surface, gently rising/falling each frame
let seaGlitter = null; // {uniforms} additive sun-glitter twinkle field on the water
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 1700, 2 * HALF + 1700),
  // polygon-offset the base grass back in the depth buffer so the road/sidewalk/sand decals laid just
  // above it always win — but at grazing angles far from the camera, GPU polygon offset alone isn't
  // reliable (the depth-slope term it scales by swings during rotation), so it still z-fights and
  // flickers hard while turning. A real, physical drop is angle-independent and settles it for good;
  // nothing depends on this mesh's exact height, since gameplay ground height comes from groundY().
  new THREE.MeshLambertMaterial({ color: 0x9aab72, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
ground.geometry.rotateX(-Math.PI / 2);
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

// roads: two merged meshes (all vertical, all horizontal)
{
  const matRoad = roadMat = new THREE.MeshStandardMaterial({ map: texAsphalt, normalMap: texAsphaltNormal, roughnessMap: texAsphaltRough, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  matRoad.normalScale.set(0.9, 0.9);
  const vGeos = [], hGeos = [];
  for (let k = 0; k <= N; k++) {
    let g = new THREE.PlaneGeometry(ROAD, 2 * HALF);
    g.rotateX(-Math.PI / 2); g.translate(roadC(k), 0.045, 0);
    vGeos.push(g);
    g = new THREE.PlaneGeometry(ROAD, 2 * HALF);
    g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, 0.03, roadC(k));
    hGeos.push(g);
  }
  const rv = new THREE.Mesh(mergeGeos(vGeos), matRoad), rh = new THREE.Mesh(mergeGeos(hGeos), matRoad);
  rv.receiveShadow = rh.receiveShadow = true;
  scene.add(rv, rh);
}
// zebra crosswalks on all four sides of every intersection
{
  const cwGeo = new THREE.PlaneGeometry(ROAD - 3, 3.4); cwGeo.rotateX(-Math.PI / 2);
  // road paint is a dirty concrete-white (below the bloom threshold) so it reads as markings, not glowing blobs
  const cwMat = new THREE.MeshBasicMaterial({ map: texCrosswalk, color: 0xafb3ad, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const spots = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const cx = roadC(i), cz = roadC(j);
    spots.push([cx, cz + ROAD / 2 + 2.1, 0], [cx, cz - ROAD / 2 - 2.1, 0], [cx + ROAD / 2 + 2.1, cz, Math.PI / 2], [cx - ROAD / 2 - 2.1, cz, Math.PI / 2]);
  }
  const im = new THREE.InstancedMesh(cwGeo, cwMat, spots.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z, rot], idx) => { p.set(x, 0.055, z); q.setFromAxisAngle(up, rot); m.compose(p, q, s); im.setMatrixAt(idx, m); });
  im.frustumCulled = false; scene.add(im);
  // solid white stop lines just inside each crosswalk
  const slGeo = new THREE.PlaneGeometry(ROAD - 3.5, 0.7); slGeo.rotateX(-Math.PI / 2);
  const slIM = new THREE.InstancedMesh(slGeo, new THREE.MeshBasicMaterial({ color: 0xafb3ad, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), spots.length);
  const sl = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const cx = roadC(i), cz = roadC(j); sl.push([cx, cz + ROAD / 2 + 0.5, 0], [cx, cz - ROAD / 2 - 0.5, 0], [cx + ROAD / 2 + 0.5, cz, Math.PI / 2], [cx - ROAD / 2 - 0.5, cz, Math.PI / 2]); }
  sl.forEach(([x, z, rot], idx) => { p.set(x, 0.052, z); q.setFromAxisAngle(up, rot); m.compose(p, q, s); slIM.setMatrixAt(idx, m); });
  slIM.frustumCulled = false; scene.add(slIM);
  // lane turn-arrows: one in the right-hand approach lane on each side of every intersection, pointing in
  const arGeo = new THREE.PlaneGeometry(3.2, 5.2); arGeo.rotateX(-Math.PI / 2);
  const arMat = new THREE.MeshBasicMaterial({ map: texArrow, color: 0xafb3ad, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const lane = ROAD / 4, back = ROAD / 2 + 8.5;   // right-hand lane offset, distance back from the box
  const ar = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const cx = roadC(i), cz = roadC(j);
    ar.push([cx + lane, cz - back, 0], [cx - lane, cz + back, Math.PI], [cx - back, cz + lane, -Math.PI / 2], [cx + back, cz - lane, Math.PI / 2]);
  }
  const arIM = new THREE.InstancedMesh(arGeo, arMat, ar.length);
  ar.forEach(([x, z, rot], idx) => { p.set(x, 0.058, z); q.setFromAxisAngle(up, rot); m.compose(p, q, s); arIM.setMatrixAt(idx, m); });
  arIM.frustumCulled = false; scene.add(arIM);
}

// block layout
// district block keys, recentred by the offset O so they sit in the middle of the bigger grid
const _pad = k => { const [a, b] = k.split(",").map(Number); return (a + O) + "," + (b + O); };
const PARKS = new Set(["2,2", "1,1", "4,4"].map(_pad));
const PLAZA_KEY = _pad("2,2");   // recentred plaza block key
// outskirt districts: a suburban neighbourhood (NW corner) and a run-down quarter (NE corner)
const isResid = (i, j) => i <= 2 && j <= 2;
const isGhetto = (i, j) => i <= 2 && j >= N - 3;
const RESERVED = new Set(["1,1", "1," + (N - 2),     // buyable House & Apartment
  "0,1", "0," + (N - 2), (N - 1) + ",1", (N - 1) + "," + (N - 2),   // clothing stores & barbershops
  (N / 2) + "," + (N / 2), (N / 2 + 1) + "," + (N / 2),   // Ammo Shop + Bowling Alley (central)
  (N / 2 - 1) + "," + (N / 2 - 2),     // Gun Store (by the plaza, facing spawn)
  "2," + (N - 2)]);   // Back-alley arms dealer (run-down quarter)
const SPECIAL = {}; for (const [k, v] of Object.entries({ "1,3": "wash", "4,2": "burger", "5,0": "club", "0,4": "depot", "1,2": "pizza", "2,4": "taxi", "5,5": "marina", "3,2": "garage", "2,3": "home", "3,4": "hospital" })) SPECIAL[_pad(k)] = v;
const PLAZA = { x: Bc(2), z: Bc(2) };
const GARAGE = { x: Bc(3), z: Bc(2) };
const HOME = { x: Bc(2), z: Bc(3) };
const HOSPITAL = { x: Bc(3), z: Bc(4) };
const GAS = { x: Rc(2) + 7, z: Rc(3) - 7 };   // roadside fuel station (west-central)

// curb slabs: paved + grass, instanced
{
  // the block footprint (BLOCK) exactly equals the gap between blocks (CELL - ROAD), so the slab's edge
  // and the road's edge land on the exact same seam with zero margin — a classic silhouette/edge flicker
  // at grazing angles (worst near the green curb slabs, where the color contrast against asphalt makes it
  // obvious). Overlap the slab a hair into the road on every side; its top (CURB) sits well above the road
  // surface, so the overlap always and unambiguously wins, like a real curb overlapping the road edge.
  const SEAM = 0.4;
  const slab = new THREE.BoxGeometry(BLOCK + SEAM * 2, CURB * 2, BLOCK + SEAM * 2);
  const paved = [], grass = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
    ((isResid(i, j) || (PARKS.has(i + "," + j) && i + "," + j !== PLAZA_KEY)) ? grass : paved).push([bc(i), bc(j)]);
  const m = new THREE.Matrix4();
  const mk = (list, tex, pbr) => {
    const mat = pbr ? (sidewalkMat = new THREE.MeshStandardMaterial({ map: tex, normalMap: texSidewalkNormal, roughnessMap: texSidewalkRough, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.4 }))
      : new THREE.MeshLambertMaterial({ map: tex });
    if (pbr) mat.normalScale.set(1.0, 1.0);
    const im = new THREE.InstancedMesh(slab, mat, list.length);
    im.receiveShadow = true;
    list.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); im.setMatrixAt(i, m); });
    scene.add(im);
  };
  mk(paved, texSidewalk, true); mk(grass, texGrass);
}

// buildings: one InstancedMesh, facade texture sides / plain roof, pastel instance tints
const PASTELS = [0xf2d4c2, 0xd9e4f0, 0xf5e8c8, 0xd8ecd4, 0xecd3e2, 0xe7ded0, 0xc9dce6, 0xf0dcc0];
const TOWER_TINTS = [0xbcd2e0, 0xc8d8e8, 0xd0e0e0, 0xe2e6ea, 0xb8c8d8, 0xd8d0c4, 0xc4d4dc];   // cool glass
const HOUSE_TINTS = [0xf3e2c4, 0xe8d6be, 0xd9e6dc, 0xf0e0d2, 0xe6dcc8, 0xdce6ea, 0xf2ddc6];   // pastel stucco
const HOUSE_ROOFS = [0xb5532e, 0x9a6b4a, 0x7a7e84, 0xa84e3a, 0x6f5a45, 0x8a6340];
const GHETTO_TINTS = [0x9a8e7c, 0x8c8474, 0xa2937c, 0x86806e, 0x948a72, 0x7e7866];   // grimy
let buildingMat = null;
{
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const matSide = new THREE.MeshLambertMaterial({ map: texFacade, normalMap: texFacadeNormal, emissive: 0xffffff, emissiveMap: texWindows, emissiveIntensity: 0 });
  matSide.normalScale.set(1.15, 1.15);
  buildingMat = matSide;
  const matRoof = new THREE.MeshLambertMaterial({ color: 0xb8ab9a });
  const mats = [matSide, matSide, matRoof, matRoof, matSide, matSide];
  const placed = [], towers = [], houses = [], ghetto = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const key = i + "," + j;
    if (PARKS.has(key) || SPECIAL[key] || RESERVED.has(key)) continue;
    const cen = (N - 1) / 2;
    const dc = Math.max(Math.abs(i - cen), Math.abs(j - cen));  // 0 = dead centre … grows to the city edge
    const downtown = dc <= 1.5;                                 // core 4x4
    // Camellia-style skyline: a smooth closeness factor that peaks at dead centre and
    // fades out ~6 blocks away, so towers rise into a tight central cluster of spires.
    const core = clamp(1 - dc / 6.5, 0, 1);                     // 1 at centre … 0 at the edge of the core
    const resid = isResid(i, j), slum = isGhetto(i, j);
    const skip = downtown ? 0.06 : 0.18 - core * 0.08;          // pack the core denser
    const towerChance = downtown ? 0.94 : 0.55 + core * 0.34;   // skyscrapers cluster toward the centre
    for (const qx of [0, 1]) for (const qz of [0, 1]) {
      if (rng() < skip) continue;
      const x = blockMin(i) + 8 + 13 + qx * 28 + rr(-2, 2);
      const z = blockMin(j) + 8 + 13 + qz * 28 + rr(-2, 2);
      if (resid) {                                             // suburban house with a pitched roof
        const w = rr(9, 13), d = rr(9, 13), h = rr(5, 7);
        houses.push({ x, z, w, d, h, tint: pick(HOUSE_TINTS), roof: pick(HOUSE_ROOFS) });
        addCollider(x, z, w / 2, d / 2);
      } else if (slum) {                                       // run-down low-rise apartment
        const w = rr(16, 22), d = rr(16, 22), h = rr(8, 18);
        ghetto.push({ x, z, w, d, h, tint: pick(GHETTO_TINTS) });
        addCollider(x, z, w / 2, d / 2);
      } else if (rng() < towerChance) {                        // glass skyscraper — taller in the core
        // base height + a steep centre-weighted bonus, and slimmer footprints toward the core, so
        // downtown reads as a tight cluster of soaring spires (Camellia City silhouette)
        const cw = Math.pow(core, 1.5);                          // sharper falloff than a plain gradient
        const w = rr(14, 21) - core * 5, d = rr(14, 21) - core * 5;
        const h = rr(26, 50) + cw * rr(150, 240);               // up to ~290m dead-centre, ~26m at the rim
        towers.push({ x, z, w, d, h, tint: pick(TOWER_TINTS) });
        addCollider(x, z, w / 2, d / 2);
      } else {                                                 // occasional low / mid-rise infill
        const w = rr(16, 24), d = rr(16, 24), h = pick([10, 14, 18, 22, 26]);
        placed.push({ x, z, w, d, h, tint: pick(PASTELS) });
        addCollider(x, z, w / 2, d / 2);
      }
    }
  }
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const boxChunks = (list, material) => {
    for (const items of byChunk(list)) {
      const im = new THREE.InstancedMesh(unit, material, items.length); im.receiveShadow = true; im.castShadow = true;
      items.forEach((b, idx) => { p.set(b.x, CURB, b.z); s.set(b.w, b.h, b.d); q.identity(); m.compose(p, q, s); im.setMatrixAt(idx, m); im.setColorAt(idx, _col.set(b.tint)); });
      scene.add(im);
    }
  };
  boxChunks(placed, mats);
  // make a scattering of ordinary buildings enterable too (generic lobby interior)
  placed.forEach((b, i) => { if (i % 7 === 0) ENTERABLES.push({ x: b.x, z: b.z, name: "🏢 Lobby", r: Math.pow(Math.max(b.w, b.d) / 2 + 4, 2) }); });

  // downtown skyscrapers — reflective glass-tower facade (PBR so the sky env mirrors off the glass)
  const towerSide = new THREE.MeshStandardMaterial({ map: texTower, roughnessMap: texTowerRough, metalness: 0.85, roughness: 1.0, envMapIntensity: 1.6, emissive: 0xffffff, emissiveMap: texTowerWin, emissiveIntensity: 0 });   // sharper, more mirror-like curtain-wall glass; roughness map keeps panes glassy, mullions matte
  specialMats.push(towerSide);
  boxChunks(towers, [towerSide, towerSide, matRoof, matRoof, towerSide, towerSide]);

  // suburban houses: tinted stucco bodies + pyramid roofs (chunked)
  if (houses.length) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff }), roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const roofUnit = new THREE.ConeGeometry(0.82, 1, 4); roofUnit.rotateY(Math.PI / 4); roofUnit.translate(0, 0.5, 0);
    for (const items of byChunk(houses)) {
      const bIM = new THREE.InstancedMesh(unit, bodyMat, items.length); bIM.receiveShadow = true; bIM.castShadow = true;
      const rIM = new THREE.InstancedMesh(roofUnit, roofMat, items.length); rIM.receiveShadow = true; rIM.castShadow = true;
      items.forEach((b, idx) => {
        p.set(b.x, CURB, b.z); s.set(b.w, b.h, b.d); q.identity(); m.compose(p, q, s);
        bIM.setMatrixAt(idx, m); bIM.setColorAt(idx, _col.set(b.tint));
        p.set(b.x, CURB + b.h, b.z); s.set(b.w * 0.92, rr(2.6, 3.8), b.d * 0.92); m.compose(p, q, s);
        rIM.setMatrixAt(idx, m); rIM.setColorAt(idx, _col.set(b.roof));
      });
      scene.add(bIM, rIM);
    }
  }

  // run-down apartments: grimy facade with boarded windows (chunked)
  if (ghetto.length) {
    const ghettoSide = new THREE.MeshLambertMaterial({ map: texGhetto, emissive: 0xffffff, emissiveMap: texGhettoWin, emissiveIntensity: 0 });
    specialMats.push(ghettoSide);
    boxChunks(ghetto, [ghettoSide, ghettoSide, matRoof, matRoof, ghettoSide, ghettoSide]);
  }

  // rooftop clutter: water tanks + antenna masts on every tower, red aircraft beacons on the tallest
  const tankGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.7, 8); tankGeo.translate(0, 0.85, 0);
  const mastGeo = new THREE.BoxGeometry(0.24, 4.6, 0.24); mastGeo.translate(0, 2.3, 0);
  const tankIM = new THREE.InstancedMesh(tankGeo, new THREE.MeshLambertMaterial({ color: 0x6f5e4c }), towers.length);
  const mastIM = new THREE.InstancedMesh(mastGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f47 }), towers.length);
  const tall = towers.filter(b => b.h > 70);
  const beaconGeo = new THREE.SphereGeometry(0.3, 8, 6);
  const beaconIM = new THREE.InstancedMesh(beaconGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1e }), tall.length);
  towers.forEach((b, idx) => {
    const topY = CURB + b.h;
    m.makeTranslation(b.x - b.w * 0.2, topY, b.z + b.d * 0.2); tankIM.setMatrixAt(idx, m);
    m.makeTranslation(b.x + b.w * 0.25, topY, b.z - b.d * 0.22); mastIM.setMatrixAt(idx, m);
  });
  tall.forEach((b, idx) => { m.makeTranslation(b.x + b.w * 0.25, CURB + b.h + 4.6, b.z - b.d * 0.22); beaconIM.setMatrixAt(idx, m); });
  scene.add(tankIM, mastIM, beaconIM);
}

// outer ground gets a tiling grass texture so the outskirts aren't a flat colour
{
  const g = texGrass.clone(); g.needsUpdate = true; const gr = Math.round((2 * HALF + 1700) / 30); g.repeat.set(gr, gr);
  // keep the depth bias from the ground's original material — this full material swap was silently
  // dropping it, un-doing the fix that keeps roads/sidewalks/sand from z-fighting the grass beneath them.
  ground.material = new THREE.MeshLambertMaterial({ map: g, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 });
}

// ---------- beach district (south of the city, on the open ground beyond the grid) ----------
const SEA_Z = HALF + 80;      // shoreline just past the south edge of the (bigger) grid
// beachfront basketball court: hoisted so the pickup-game logic further down (near doPunch) can see it
const COURT = { x: 150, z: SEA_Z - 60, hoopL: { x: 150 - 13, z: SEA_Z - 60 }, hoopR: { x: 150 + 13, z: SEA_Z - 60 } };
{
  // sand: tile uniformly (square ~11u tiles) across the beach plane. The old 16x7 repeat stretched the
  // grain ~20x horizontally (looked like planks). The plane reaches from the beachfront road down to the
  // waterline so the whole beach is sand — no grass showing between the city and the shore.
  const sandPlaneW = 2 * HALF + 200, sandTile = 11, sandD = 92;
  const sandTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = "#e7d3a2"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 520, ["#dec88e", "#efe1b6", "#d4ba80", "#ecd8a0"], 1, 3);
  }, Math.round(sandPlaneW / sandTile), Math.round(sandD / sandTile));
  // base sea tint is light; the per-vertex shore→deep gradient (below) tints it to ocean colour, and the
  // wave streaks add subtle light/dark surface variation. (keeps exactly 30 rng() calls — determinism.)
  const seaTex = oceanTex = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = "#dfeef3"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) { ctx.strokeStyle = i % 2 ? "rgba(255,255,255,.5)" : "rgba(120,165,185,.45)"; ctx.lineWidth = 1.5; const y = rng() * s; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(s / 3, y + 5, 2 * s / 3, y - 5, s, y); ctx.stroke(); }
  }, 26, 26);
  // rippled wave normals (own PRNG, so it doesn't touch the seeded city/economy stream)
  const seaRng = mulberry32(0x5EA00D);
  seaNormTex = canvasNormalTex(128, (ctx, s) => {
    for (let i = 0; i < 80; i++) {
      const x = seaRng() * s, y = seaRng() * s, r = 5 + seaRng() * 13, up = seaRng() < 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, up ? "#ffffff" : "#202020"); g.addColorStop(1, "rgba(128,128,128,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, 34, 34);
  // court markings: U(=x in world) is the LENGTH (baskets at the two x-ends), V(=z) is the width.
  const courtTex = canvasTex(256, (ctx, s) => {
    ctx.fillStyle = "#3f6f54"; ctx.fillRect(0, 0, s, s);            // green sport surface
    ctx.strokeStyle = "#f0ede0"; ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    ctx.beginPath(); ctx.moveTo(s / 2, 8); ctx.lineTo(s / 2, s - 8); ctx.stroke();    // half-court line (across the width)
    ctx.beginPath(); ctx.arc(s / 2, s / 2, 34, 0, Math.PI * 2); ctx.stroke();          // centre circle
    ctx.beginPath(); ctx.arc(8, s / 2, 52, -Math.PI / 2, Math.PI / 2); ctx.stroke();   // free-throw key under the LEFT basket
    ctx.beginPath(); ctx.arc(s - 8, s / 2, 52, Math.PI / 2, Math.PI * 1.5); ctx.stroke();   // and the RIGHT basket
  });

  // sand reaches from the beachfront road (city edge) down to the waterline — the whole beach is sand
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(sandPlaneW, sandD, 1, 1),
    new THREE.MeshLambertMaterial({ map: sandTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(10, 0.06, SEA_Z - sandD / 2 + 12);
  sand.renderOrder = 1;
  scene.add(sand);
  // opaque seabed under the (transparent) water so you see deep blue through it, not the grass below.
  // depth-offset so it wins over the base grass plane the same way the sand does.
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 900, 600),
    new THREE.MeshLambertMaterial({ color: 0x0d4061, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));
  seabed.rotation.x = -Math.PI / 2; seabed.position.set(10, 0.02, SEA_Z + 295); seabed.renderOrder = 1;
  scene.add(seabed);
  // ocean: a rippled, reflective surface that shades from turquoise at the shore to deep blue offshore
  const seaGeo = new THREE.PlaneGeometry(2 * HALF + 900, 600, 12, 12);
  { const pos = seaGeo.attributes.position, cols = [], shore = new THREE.Color(0x35b8cf), deep = new THREE.Color(0x0a4a73);
    for (let i = 0; i < pos.count; i++) { const t = clamp((300 - pos.getY(i)) / 600, 0, 1); const c = shore.clone().lerp(deep, t * t); cols.push(c.r, c.g, c.b); }
    seaGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); }
  const sea = new THREE.Mesh(seaGeo,
    new THREE.MeshStandardMaterial({ map: seaTex, normalMap: seaNormTex, normalScale: new THREE.Vector2(0.55, 0.55),
      vertexColors: true, transparent: true, opacity: 0.95, roughness: 0.11, metalness: 0.0, envMapIntensity: 1.7 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(10, 0.03, SEA_Z + 295);
  scene.add(sea);
  seaWave = { geo: seaGeo };   // animated per-frame (local z = world height) for gentle swell
  // shoreline foam band where the water meets the sand
  const foamTex = canvasTex(128, (ctx, s) => { ctx.clearRect(0, 0, s, s); for (let i = 0; i < 90; i++) { ctx.fillStyle = "rgba(255,255,255," + (0.3 + Math.random() * 0.5) + ")"; ctx.beginPath(); ctx.arc(Math.random() * s, s * 0.5 + (Math.random() - 0.5) * s * 0.7, 2 + Math.random() * 6, 0, 7); ctx.fill(); } }, 60, 1);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 200, 7), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(10, 0.08, SEA_Z - 1); foam.renderOrder = 2;
  scene.add(foam); foamMat = foam.material;

  // sun-glitter: a field of tiny additive specks just above the water that twinkle independently,
  // reading as sunlight sparkling off the swell. Own PRNG so the seeded city stream is untouched.
  {
    const glN = 900, glRng = mulberry32(0x6111E7);
    const gpos = new Float32Array(glN * 3), gph = new Float32Array(glN);
    for (let i = 0; i < glN; i++) {
      gpos[i * 3] = 10 + (glRng() * 2 - 1) * (HALF + 280);
      gpos[i * 3 + 1] = 0.45;                              // sit just above the surface
      gpos[i * 3 + 2] = SEA_Z + 5 + glRng() * glRng() * 430;  // biased toward the shoreline
      gph[i] = glRng() * Math.PI * 2;
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.BufferAttribute(gpos, 3));
    gGeo.setAttribute("aphase", new THREE.BufferAttribute(gph, 1));
    const gMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 26 }, uSun: { value: new THREE.Vector2(0.75, 0.66) }, uCam: { value: new THREE.Vector2() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      // glitter blazes along the line from the camera toward the sun's azimuth (the real glitter path),
      // and only faintly twinkles elsewhere — like sunlight skipping across the swell.
      vertexShader: `attribute float aphase; uniform float uTime; uniform float uSize; uniform vec2 uSun; uniform vec2 uCam; varying float vTw;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          float tw = sin(uTime*3.2 + aphase)*0.5+0.5; tw = pow(tw, 4.0);
          vec2 toP = normalize(position.xz - uCam);
          float path = smoothstep(0.45, 0.92, dot(toP, uSun));   // 1 along the sun reflection path
          vTw = tw * (0.12 + path);
          gl_PointSize = min(uSize * (0.25 + tw) * (0.4 + path) * (300.0 / max(-mv.z, 1.0)), 9.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vTw; void main(){ vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d); if(r > 0.5) discard;
          gl_FragColor = vec4(vec3(1.0,0.96,0.82), (1.0 - r*2.0) * vTw); }`
    });
    const glitter = new THREE.Points(gGeo, gMat);
    glitter.renderOrder = 3; glitter.frustumCulled = false;
    scene.add(glitter);
    seaGlitter = gMat;
  }

  // beach palms (compact instanced clump: leaning trunks + frond crowns)
  const pspots = [];
  for (let t = 0; t < 34; t++) pspots.push([rr(-HALF, HALF), SEA_Z - rr(48, 74), rr(0.9, 1.3)]);
  const ptrunk = new THREE.CylinderGeometry(0.18, 0.34, 6, 6); ptrunk.translate(0, 3, 0);
  const fparts = [];
  for (let f = 0; f < 8; f++) { const fr = new THREE.BoxGeometry(0.5, 0.07, 2.8); fr.translate(0, 0, 1.4); fr.rotateX(0.4); fr.rotateY(f / 8 * Math.PI * 2); fparts.push(fr); }
  const pcrown = mergeGeos(fparts); pcrown.translate(0, 6, 0);
  const ptIM = new THREE.InstancedMesh(ptrunk, new THREE.MeshLambertMaterial({ color: 0xa6824f }), pspots.length);
  const pcIM = new THREE.InstancedMesh(pcrown, new THREE.MeshLambertMaterial({ color: 0xffffff, map: texLeaf }), pspots.length);
  const e2 = new THREE.Euler(), q2 = new THREE.Quaternion(), m2 = new THREE.Matrix4(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  const pg = [0x5d9952, 0x6da85e, 0x7fb069, 0x4f8a47];
  pspots.forEach(([x, z, k], idx) => {
    e2.set(rr(-0.12, 0.12), rng() * 6.28, rr(-0.12, 0.12)); q2.setFromEuler(e2);
    pp.set(x, 0.04, z); ss.set(k, k, k); m2.compose(pp, q2, ss);
    ptIM.setMatrixAt(idx, m2); pcIM.setMatrixAt(idx, m2); pcIM.setColorAt(idx, _col.set(pick(pg)));
  });
  scene.add(ptIM, pcIM);

  // colourful beach umbrellas (cone canopy + pole)
  const uCanopy = new THREE.ConeGeometry(2.0, 1.1, 10); uCanopy.translate(0, 2.6, 0);
  const uPole = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6); uPole.translate(0, 1.3, 0);
  const uColors = [0xe8543f, 0x3f7fe8, 0xf0c040, 0xe85fae, 0x58b368];
  for (let t = 0; t < 26; t++) {
    const x = rr(-HALF, HALF), z = SEA_Z - rr(10, 34);
    const can = new THREE.Mesh(uCanopy, new THREE.MeshLambertMaterial({ color: pick(uColors) }));
    const pol = new THREE.Mesh(uPole, new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
    const grp = new THREE.Group(); grp.add(can, pol); grp.position.set(x, 0.04, z); grp.rotation.y = rng() * 6.28;
    scene.add(grp);
  }

  // beachfront basketball court with two hoops
  const courtX = COURT.x, courtZ = COURT.z;
  const court = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.MeshLambertMaterial({ map: courtTex, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -32 }));
  court.rotation.x = -Math.PI / 2; court.position.set(courtX, 0.09, courtZ); court.renderOrder = 2; scene.add(court);
  // face = direction toward centre court (in +x/-x): the pole sits on the baseline, the backboard hangs
  // in front of it and the rim extends further toward the court — all along the court's long (x) axis.
  function hoop(x, z, face) {
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 8), new THREE.MeshLambertMaterial({ color: 0x5a5f66 })); pole.position.y = 1.8;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.8), new THREE.MeshLambertMaterial({ color: 0xf2f0e8 })); board.position.set(face * 0.45, 3.3, 0);   // thin face toward the court, 1.8 wide across z
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 16), new THREE.MeshLambertMaterial({ color: 0xff6a2e })); rim.rotation.x = Math.PI / 2; rim.position.set(face * 0.95, 3.1, 0);   // horizontal ring out over the court
    grp.add(pole, board, rim); grp.position.set(x, 0.05, z); scene.add(grp);
    addCollider(x, z, 0.4, 0.4);
  }
  hoop(courtX - 13, courtZ, 1); hoop(courtX + 13, courtZ, -1);   // left faces +x, right faces -x (both toward centre)
}

// special buildings + labels — facade + lit-window textures (tinted by the accent colour),
// so businesses read as real buildings instead of flat colour blocks.
function specialBuilding(x, z, w, h, d, color, labelText, labelColor) {
  const matSide = new THREE.MeshLambertMaterial({ map: texFacade, normalMap: texFacadeNormal, color, emissive: 0xffffff, emissiveMap: texWindows, emissiveIntensity: 0 });
  matSide.normalScale.set(1.15, 1.15);
  const matRoof = new THREE.MeshLambertMaterial({ color: _col.set(color).lerp(new THREE.Color(0xb8ab9a), 0.55).getHex() });
  specialMats.push(matSide);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [matSide, matSide, matRoof, matRoof, matSide, matSide]);
  mesh.position.set(x, CURB + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  addCollider(x, z, w / 2, d / 2);
  const sp = textSprite(labelText, "#fff", labelColor, 16, 4, 0);
  sp.position.set(x, CURB + h + 3, z);
  scene.add(sp);
  const rad = Math.min(Math.max(w, d) / 2 + 5, 15);
  ENTERABLES.push({ x, z, name: labelText, r: rad * rad });   // every business/shop/property is enterable
  return sp;
}
specialBuilding(Bc(1), Bc(3), 42, 9, 26, 0x6fb7d9, STR.biz.wash.name, "rgba(40,90,130,.9)");
specialBuilding(Bc(4), Bc(2), 26, 11, 26, 0xd95f4b, STR.biz.burger.name, "rgba(150,50,30,.9)");
specialBuilding(Bc(5), Bc(0), 32, 17, 28, 0x8e5fc9, STR.biz.club.name, "rgba(80,40,130,.9)");
specialBuilding(Bc(0), Bc(4), 48, 10, 40, 0x9aa0a8, STR.depotName, "rgba(60,65,75,.9)");
specialBuilding(Bc(1) + 18, Bc(2) + 14, 18, 8, 18, 0xe0b04e, STR.pizzaName, "rgba(140,90,20,.9)");
specialBuilding(Bc(2), Bc(4), 30, 6, 24, 0xe8c35a, STR.biz.taxi.name, "rgba(160,120,20,.9)");
specialBuilding(Bc(5), Bc(5), 40, 7, 30, 0x5fa8c9, STR.biz.marina.name, "rgba(30,100,140,.9)");
specialBuilding(GARAGE.x, GARAGE.z, 34, 8, 26, 0x5b6470, STR.garageName, "rgba(40,46,55,.9)");
const homeSign = specialBuilding(HOME.x, HOME.z, 24, 11, 22, 0xc98a6b, STR.homeForSale, "rgba(150,90,50,.92)");
specialBuilding(HOSPITAL.x, HOSPITAL.z, 30, 12, 26, 0xeef2f5, STR.hospitalName, "rgba(40,120,120,.92)");

// buyable properties (three tiers): a cheap apartment in the rough quarter, the central condo,
// and a premium house out in the suburbs. Each is a for-sale building you walk up to and buy.
const HOUSE_POS = { x: bc(1), z: bc(1) }, APT_POS = { x: bc(1), z: bc(N - 2) };
const houseSign = specialBuilding(HOUSE_POS.x, HOUSE_POS.z, 22, 8, 20, 0xf0d8b0, STR.propForSale("🏡 House", 12000), "rgba(110,80,40,.92)");
const aptSign = specialBuilding(APT_POS.x, APT_POS.z, 24, 15, 22, 0x8c8474, STR.propForSale("🏚 Apartment", 2500), "rgba(70,66,58,.92)");
const HOME_COST = 6000;
const PROPS = [
  { id: "apartment", flag: "apt", label: "🏚 Apartment", cost: 2500, x: APT_POS.x, z: APT_POS.z, sign: aptSign },
  { id: "condo", flag: "home", label: "🏢 Condo", cost: HOME_COST, x: HOME.x, z: HOME.z, sign: homeSign, ownLabel: STR.homeOwned },
  { id: "house", flag: "house", label: "🏡 House", cost: 12000, x: HOUSE_POS.x, z: HOUSE_POS.z, sign: houseSign },
];

// neighborhood storefronts: clothing stores & barbershops (textured shop + striped awning + sign)
const SHOPS = [];   // walk-up style shops: { x, z, kind }
function shopFront(x, z, label, labelColor, bodyColor, awnColor, kind) {
  specialBuilding(x, z, 20, 7, 18, bodyColor, label, labelColor);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(17, 0.5, 3.2), new THREE.MeshLambertMaterial({ color: awnColor }));
  awn.position.set(x, CURB + 3.4, z + 9 + 1.1); awn.rotation.x = -0.28; awn.receiveShadow = true;
  scene.add(awn);
  SHOPS.push({ x, z: z + 9, kind });   // interact point is at the storefront
}
shopFront(bc(0), bc(1), "👕 THREADS", "rgba(190,60,110,.92)", 0xe87fae, 0xcf3f74, "wardrobe");          // clothing (suburb)
shopFront(bc(N - 1), bc(N - 2), "👗 BELLA BOUTIQUE", "rgba(150,40,150,.92)", 0xc78fd9, 0x7d3fc0, "wardrobe"); // clothing (east)
shopFront(bc(0), bc(N - 2), "💈 FRESH CUTS", "rgba(30,90,140,.92)", 0x6fb7d9, 0xc23a36, "barber");      // barbershop (ghetto)
shopFront(bc(N - 1), bc(1), "💈 THE FADE SHOP", "rgba(120,30,30,.92)", 0xd98a6b, 0x2b6fb0, "barber");   // barbershop (east)
shopFront(bc(N / 2), bc(N / 2), "🔫 AMMO SHOP", "rgba(120,30,30,.95)", 0x7a3a30, 0x2a1a16, "ammo");   // weapons (central)
shopFront(bc(N / 2 - 1), bc(N / 2 - 2), "🔫 GUNS & AMMO", "rgba(40,40,46,.96)", 0x3a3f47, 0x14181c, "ammo");   // weapon store by the plaza (faces spawn)
shopFront(bc(2), bc(N - 2), "🔫 BACK-ALLEY ARMS", "rgba(60,50,30,.96)", 0x4a4330, 0x1a1812, "ammo");   // arms dealer in the run-down quarter
specialBuilding(bc(N / 2 + 1), bc(N / 2), 40, 12, 30, 0x4a3f6a, "🎳 BOWLING ALLEY", "rgba(80,40,130,.95)");   // bowling + arcade (enterable)
// gas station: a pump prop + canopy at the roadside; drive near to refuel
{
  const pump = new THREE.Mesh(mergeGeos([
    boxGeoC(0.9, 1.4, 0.7, 0, 0.7, 0, 0xd24b3a), boxGeoC(0.7, 0.5, 0.5, 0, 1.25, 0.05, 0xf2efe6),
    boxGeoC(0.12, 0.5, 0.12, 0.55, 0.95, 0, 0x2a2620),
  ]), matVC);
  pump.position.set(GAS.x, CURB, GAS.z); scene.add(pump);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0xd24b3a }));
  canopy.position.set(GAS.x, CURB + 4.2, GAS.z); scene.add(canopy);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4, 6), new THREE.MeshLambertMaterial({ color: 0xb8ab9a }));
  post.position.set(GAS.x + 2.4, CURB + 2, GAS.z + 2.4); scene.add(post);
  const sign = textSprite(STR.gasName, "#fff", "rgba(200,70,50,.95)", 8, 2, 0);
  sign.position.set(GAS.x, CURB + 5.2, GAS.z); scene.add(sign);
}

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
  cart.position.set(Bc(2) + 28, CURB, Bc(2) + 28);
  scene.add(cart);
  addCollider(Bc(2) + 28, Bc(2) + 28, 1.6, 1.2);
}

// trees: instanced trunks + canopies
{
  const spots = [];
  for (const key of PARKS) {
    const [i, j] = key.split(",").map(Number);
    const n = key === PLAZA_KEY ? 6 : 11;
    for (let t = 0; t < n; t++) {
      const x = blockMin(i) + rr(6, BLOCK - 6), z = blockMin(j) + rr(6, BLOCK - 6);
      if (dist2(x, z, PLAZA.x, PLAZA.z) < 144 && key === PLAZA_KEY) continue;
      spots.push([x, z, rr(0.8, 1.3)]);
    }
  }
  for (let t = 0; t < 26; t++) {                       // street trees on random corners
    const i = (rng() * N) | 0, j = (rng() * N) | 0;
    if (PARKS.has(i + "," + j)) continue;
    const x = blockMin(i) + pick([4, BLOCK - 4]), z = blockMin(j) + rr(6, BLOCK - 6);
    const k = rr(0.7, 1.1);                             // (drawn unconditionally to keep RNG stable)
    if (hitsCollider(x, z, 1.4)) continue;             // don't plant a tree clipping into a building/prop
    spots.push([x, z, k]);
  }
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 1.7, 6);
  trunk.translate(0, 0.85, 0);
  const canopy = new THREE.IcosahedronGeometry(1.5, 1);
  canopy.translate(0, 2.6, 0);
  const imT = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), spots.length);
  const imC = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ color: 0xffffff, map: texLeaf }), spots.length);
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

// ---------- palm trees (the city's signature: leaning trunks + drooping frond crowns) ----------
{
  const spots = [];
  const add = (x, z, k, solid) => spots.push([x, z, k, solid]);
  for (let a = 0; a < 10; a++) { const ang = a / 10 * Math.PI * 2; add(PLAZA.x + Math.cos(ang) * 19, PLAZA.z + Math.sin(ang) * 19, rr(0.95, 1.2), false); }
  for (const key of PARKS) { const [i, j] = key.split(",").map(Number); for (let t = 0; t < 4; t++) add(blockMin(i) + rr(5, BLOCK - 5), blockMin(j) + rr(5, BLOCK - 5), rr(0.85, 1.25), true); }
  for (let t = 0; t < 24; t++) { const i = (rng() * N) | 0, j = (rng() * N) | 0; if (PARKS.has(i + "," + j)) continue; add(blockMin(i) + pick([3, BLOCK - 3]), blockMin(j) + pick([3, BLOCK - 3]), rr(0.8, 1.15), true); }

  const trunk = new THREE.CylinderGeometry(0.18, 0.34, 6, 6); trunk.translate(0, 3, 0);
  const fparts = [];                                   // 8 tapered blades radiating out and drooping
  for (let f = 0; f < 8; f++) { const fr = new THREE.BoxGeometry(0.5, 0.07, 2.8); fr.translate(0, 0, 1.4); fr.rotateX(0.4); fr.rotateY(f / 8 * Math.PI * 2); fparts.push(fr); }
  const crown = mergeGeos(fparts); crown.translate(0, 6, 0);

  const imT = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0xa6824f }), spots.length);
  const imC = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, map: texLeaf }), spots.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  const greens = [0x5d9952, 0x6da85e, 0x7fb069, 0x4f8a47];
  spots.forEach(([x, z, k, solid], idx) => {
    e.set(rr(-0.1, 0.1), rng() * 6.28, rr(-0.1, 0.1)); q.setFromEuler(e);
    p.set(x, CURB, z); s.set(k, k, k); m.compose(p, q, s);
    imT.setMatrixAt(idx, m); imC.setMatrixAt(idx, m);
    imC.setColorAt(idx, _col.set(pick(greens)));
    if (solid) addCollider(x, z, 0.4, 0.4);
  });
  scene.add(imT, imC);
}

// ---------- street lamps (instanced poles + heads that glow at night) ----------
const lampHeads = [];
let lampMat = null, lampPoolMat = null, lampConeMat = null;
{
  const pole = new THREE.CylinderGeometry(0.16, 0.22, 7, 6); pole.translate(0, 3.5, 0);
  const head = new THREE.BoxGeometry(0.8, 0.42, 0.8); head.translate(0, 7.05, 0);
  const spots = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) spots.push([blockMin(i) + 2.5, blockMin(j) + 2.5]);
  const poleIM = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: 0x3a3f47 }), spots.length);
  lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0xffd98a, emissiveIntensity: 0 });
  const headIM = new THREE.InstancedMesh(head, lampMat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], idx) => { m.makeTranslation(x, CURB, z); poleIM.setMatrixAt(idx, m); headIM.setMatrixAt(idx, m); lampHeads.push([x, 7.05 + CURB, z]); });
  scene.add(poleIM, headIM);
  // warm light pools cast on the ground under each lamp at night
  const poolGeo = new THREE.CircleGeometry(3.4, 18); poolGeo.rotateX(-Math.PI / 2);
  lampPoolMat = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolIM = new THREE.InstancedMesh(poolGeo, lampPoolMat, spots.length);
  spots.forEach(([x, z], idx) => { m.makeTranslation(x, 0.07, z); poolIM.setMatrixAt(idx, m); });
  scene.add(poolIM);
  // soft volumetric light cone hanging under each lamp (additive, fades up at night)
  const coneGeo = new THREE.ConeGeometry(3.0, 6.6, 16, 1, true); coneGeo.translate(0, 6.6 / 2 + 0.4, 0);
  lampConeMat = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const coneIM = new THREE.InstancedMesh(coneGeo, lampConeMat, spots.length);
  spots.forEach(([x, z], idx) => { m.makeTranslation(x, 0.1, z); coneIM.setMatrixAt(idx, m); });
  coneIM.frustumCulled = false; scene.add(coneIM);
}

// ---------- traffic lights: dual-direction signals (N-S ⟷ E-W alternate) with glowing lamps + road spill ----------
let trafPhase = 0, trafCD = 6.5;
let nsR, nsA, nsG, ewR, ewA, ewG, nsPool, ewPool;
const TL_DIM = 0.11;
{
  // soft round glow sprite so each lit lamp blooms like a real signal lens
  const glowTex = canvasTex(48, (ctx, s) => { const c = s / 2; for (let r = c; r > 0; r--) { ctx.globalAlpha = (1 - r / c) * 0.14; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); } });
  // realistic mast-arm signal: a tall pole on the corner, a horizontal arm reaching out over the road,
  // and a signal head hanging at the end whose lamps face back at the oncoming traffic.
  const ARM = ROAD / 2 + 2.4;                                       // arm reaches over the road to ~the lane
  const HX = ARM - 0.2;                                             // head sits at the far end of the arm (+x)
  const struct = mergeGeos([
    cylC(0.18, 0.22, 6.6, 0, 3.3, 0, 0x2a2e34),                     // pole
    boxGeoC(ARM, 0.22, 0.22, ARM / 2, 6.45, 0, 0x2a2e34),          // mast arm (+x)
    boxGeoC(0.46, 1.92, 0.66, HX, 5.45, 0, 0x14161a),              // signal head hanging at the arm's end
    boxGeoC(0.58, 0.18, 0.78, HX, 6.48, 0, 0x0e1014),              // backplate cap
  ]);
  const lamp = y => { const g = new THREE.PlaneGeometry(0.4, 0.4); g.rotateY(Math.PI); g.translate(HX, y, -0.36); return g; };   // on the head's -z face, facing the oncoming lane
  // Like a real 4-way intersection: a signal on EACH approach, mounted on a far-side corner pole
  // with the mast arm reaching out over that road and the head facing the traffic coming at it.
  //   N head (q0)   serves +z traffic · S head (q180) serves -z · E head (q90) serves +x · W head (q270) serves -x
  const G = 11;                                                    // head sits over the road just past the far crosswalk
  const nSpots = [], sSpots = [], eSpots = [], wSpots = [];        // pole-base positions per approach
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const X = roadC(i), Z = roadC(j);
    nSpots.push([X - HX, Z + G]);                                  // arm reaches +x over the road, head at (X, Z+G)
    sSpots.push([X + HX, Z - G]);                                  // rotated 180°, head at (X, Z-G)
    eSpots.push([X + G, Z + HX]);                                  // rotated +90°, head at (X+G, Z)
    wSpots.push([X - G, Z - HX]);                                  // rotated -90°, head at (X-G, Z)
  }
  const mm = new THREE.Matrix4(), pv = new THREE.Vector3(), sc1 = new THREE.Vector3(1, 1, 1), upv = new THREE.Vector3(0, 1, 0);
  const q0 = new THREE.Quaternion();
  const q90 = new THREE.Quaternion().setFromAxisAngle(upv, Math.PI / 2);
  const q180 = new THREE.Quaternion().setFromAxisAngle(upv, Math.PI);
  const q270 = new THREE.Quaternion().setFromAxisAngle(upv, -Math.PI / 2);
  const placeIM = (geo, mat, spots, q) => { const im = new THREE.InstancedMesh(geo, mat, spots.length); spots.forEach(([x, z], k) => { pv.set(x, CURB, z); mm.compose(pv, q, sc1); im.setMatrixAt(k, mm); }); im.frustumCulled = false; scene.add(im); return im; };
  const structMat = new THREE.MeshLambertMaterial({ color: 0x23262c });
  placeIM(struct, structMat, nSpots, q0); placeIM(struct, structMat, sSpots, q180);
  placeIM(struct, structMat, eSpots, q90); placeIM(struct, structMat, wSpots, q270);
  const lampMat = c => new THREE.MeshBasicMaterial({ map: glowTex, color: c, transparent: true, opacity: TL_DIM, blending: THREE.AdditiveBlending, depthWrite: false });
  nsR = lampMat(0xff3b30); nsA = lampMat(0xffce3a); nsG = lampMat(0x46e15a);
  ewR = lampMat(0xff3b30); ewA = lampMat(0xffce3a); ewG = lampMat(0x46e15a);
  // N-S phase lamps go on the N + S heads; E-W phase lamps on the E + W heads
  for (const [y, m] of [[6.0, nsR], [5.45, nsA], [4.9, nsG]]) { const g = lamp(y); placeIM(g, m, nSpots, q0); placeIM(g, m, sSpots, q180); }
  for (const [y, m] of [[6.0, ewR], [5.45, ewA], [4.9, ewG]]) { const g = lamp(y); placeIM(g, m, eSpots, q90); placeIM(g, m, wSpots, q270); }
  // coloured spill the active signal casts onto the road below each head
  const poolGeo = new THREE.CircleGeometry(4.0, 20); poolGeo.rotateX(-Math.PI / 2);
  const poolMat = () => new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  nsPool = poolMat(); ewPool = poolMat();
  const placePool = (mat, spots, dx, dz) => { const im = new THREE.InstancedMesh(poolGeo, mat, spots.length); spots.forEach(([x, z], k) => { mm.makeTranslation(x + dx, 0.08, z + dz); im.setMatrixAt(k, mm); }); im.frustumCulled = false; scene.add(im); return im; };
  placePool(nsPool, nSpots, HX, 0); placePool(nsPool, sSpots, -HX, 0);   // under the N + S heads
  placePool(ewPool, eSpots, 0, -HX); placePool(ewPool, wSpots, 0, HX);   // under the E + W heads
}
function applyTrafPhase() {
  if (!nsR) return;
  // phase: 0 N-S green · 1 N-S amber · 2 E-W green · 3 E-W amber  (the cross street is red meanwhile)
  nsG.opacity = trafPhase === 0 ? 1 : TL_DIM;
  nsA.opacity = trafPhase === 1 ? 1 : TL_DIM;
  nsR.opacity = (trafPhase === 2 || trafPhase === 3) ? 1 : TL_DIM;
  ewG.opacity = trafPhase === 2 ? 1 : TL_DIM;
  ewA.opacity = trafPhase === 3 ? 1 : TL_DIM;
  ewR.opacity = (trafPhase === 0 || trafPhase === 1) ? 1 : TL_DIM;
  // road spill tinted by whichever colour each direction is showing — opacity is driven by the
  // night factor in envUpdate so it only glows after dark (no bright blobs on the road by day)
  const tint = (mat, g, a) => { mat.color.setHex(g ? 0x46e15a : a ? 0xffce3a : 0xff3b30); };
  tint(nsPool, trafPhase === 0, trafPhase === 1);
  tint(ewPool, trafPhase === 2, trafPhase === 3);
}
applyTrafPhase();
function updateTrafficLights(dt) {
  trafCD -= dt;
  if (trafCD <= 0) { trafPhase = (trafPhase + 1) % 4; trafCD = (trafPhase === 1 || trafPhase === 3) ? 1.7 : 6.5; applyTrafPhase(); }
}

// ---------- street clutter: trash cans, hydrants, benches & planters along the sidewalks ----------
// a busy, lived-in street reads far more real than empty pavement. placed with a *local* PRNG so the
// main seeded stream (NPCs, missions, traffic) is byte-for-byte unchanged.
{
  let _cs = 0x9e3779b9 >>> 0;
  const crand = () => { _cs = (_cs + 0x6D2B79F5) >>> 0; let t = _cs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const matProp = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.5 });
  // prop geometries (origin at the base; instanced onto the curb height)
  const trashGeo = mergeGeos([
    cylC(0.28, 0.32, 0.92, 0, 0.46, 0, 0x3a4a40),           // bin body
    cylC(0.31, 0.31, 0.07, 0, 0.95, 0, 0x2a352f),           // lid rim
    sphC(0.30, 0, 0.99, 0, 0x2a352f, 1, 0.45, 1),           // domed lid
  ]);
  const hydrantGeo = mergeGeos([
    cylC(0.17, 0.2, 0.5, 0, 0.25, 0, 0xb5392b),             // body
    sphC(0.17, 0, 0.52, 0, 0xb5392b, 1, 0.7, 1),            // dome cap
    cylC(0.06, 0.06, 0.1, 0, 0.62, 0, 0x922b20),            // top bolt
    boxGeoC(0.52, 0.13, 0.13, 0, 0.36, 0, 0xc24535),        // side arms
  ]);
  const benchGeo = mergeGeos([
    boxGeoC(1.6, 0.09, 0.5, 0, 0.5, 0, 0x6b4a2e),           // seat
    boxGeoC(1.6, 0.42, 0.09, 0, 0.74, -0.2, 0x6b4a2e),      // backrest
    boxGeoC(0.1, 0.5, 0.46, 0.7, 0.25, 0, 0x3a3f47),        // legs
    boxGeoC(0.1, 0.5, 0.46, -0.7, 0.25, 0, 0x3a3f47),
  ]);
  const planterGeo = mergeGeos([
    boxGeoC(1.0, 0.46, 1.0, 0, 0.23, 0, 0x8a7a5c),          // stone box
    boxGeoC(1.04, 0.08, 1.04, 0, 0.46, 0, 0x9a8a6c),        // rim
    sphC(0.52, 0, 0.62, 0, 0x5d9952, 1, 0.7, 1),            // shrub
    sphC(0.34, 0.22, 0.74, 0.18, 0x6da85e, 1, 0.8, 1),
    sphC(0.30, -0.2, 0.72, -0.16, 0x528a48, 1, 0.8, 1),
  ]);
  const TYPES = [
    { geo: trashGeo, w: 0.7, r: 0.34, knockable: true },
    { geo: hydrantGeo, w: 0.5, r: 0.26, knockable: true },
    { geo: benchGeo, w: 0.35, r: 0.85 },
    { geo: planterGeo, w: 0.45, r: 0.6 },
  ];
  const wsum = TYPES.reduce((a, t) => a + t.w, 0);
  const buckets = TYPES.map(() => []);
  const inset = 2.6;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const key = i + "," + j;
    if (PARKS.has(key)) continue;                            // parks already have their own greenery
    const x0 = blockMin(i), z0 = blockMin(j);
    const tries = 1 + (crand() < 0.55 ? 1 : 0) + (crand() < 0.25 ? 1 : 0);   // 1–3 props per block
    for (let n = 0; n < tries; n++) {
      const edge = (crand() * 4) | 0, t = 4 + crand() * (BLOCK - 8);
      let x, z, rot;
      if (edge === 0) { x = x0 + t; z = z0 + inset; rot = 0; }
      else if (edge === 1) { x = x0 + t; z = z0 + BLOCK - inset; rot = Math.PI; }
      else if (edge === 2) { x = x0 + inset; z = z0 + t; rot = Math.PI / 2; }
      else { x = x0 + BLOCK - inset; z = z0 + t; rot = Math.PI / 2; }
      // pick a type, then reject if it would clip a building / another prop
      let pickT = crand() * wsum, ti = 0; for (; ti < TYPES.length; ti++) { pickT -= TYPES[ti].w; if (pickT <= 0) break; }
      const T = TYPES[Math.min(ti, TYPES.length - 1)];
      if (hitsCollider(x, z, T.r + 0.4)) continue;
      const b = addCollider(x, z, T.r, T.r);
      buckets[TYPES.indexOf(T)].push([x, z, rot, b]);
    }
  }
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
  TYPES.forEach((T, ti) => {
    const list = buckets[ti]; if (!list.length) return;
    const im = new THREE.InstancedMesh(T.geo, matProp, list.length);
    im.castShadow = true; im.receiveShadow = true;
    list.forEach(([x, z, rot, b], idx) => {
      p.set(x, CURB, z); q.setFromAxisAngle(up, rot); m.compose(p, q, s); im.setMatrixAt(idx, m);
      // knockable street furniture: register with the prop-physics system so a hard enough bump sends
      // it tumbling (see "prop physics" below) — trash cans & hydrants only, benches/planters stay put.
      if (T.knockable) registerKnockable(im, idx, x, CURB, z, rot, b);
    });
    scene.add(im);
  });
}

// ---------- ATMs: quick cash-grab robbery points dotted along the sidewalks ----------
const atms = [];
{
  let _as = 0x1234567 >>> 0;
  const arand = () => { _as = (_as + 0x6D2B79F5) >>> 0; let t = _as; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bodyG = boxGeoC(0.7, 1.5, 0.45, 0, 0.75, 0, 0x2a2f37);
  const screenG = boxGeoC(0.5, 0.42, 0.06, 0, 1.05, 0.24, 0x59d6e6);
  const spots = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (PARKS.has(i + "," + j) || arand() < 0.9) continue;          // sparse
    const x0 = blockMin(i), z0 = blockMin(j), inset = 2.2;
    const edge = (arand() * 4) | 0, tt = 6 + arand() * (BLOCK - 12);
    let x, z, rot;
    if (edge === 0) { x = x0 + tt; z = z0 + inset; rot = Math.PI; }
    else if (edge === 1) { x = x0 + tt; z = z0 + BLOCK - inset; rot = 0; }
    else if (edge === 2) { x = x0 + inset; z = z0 + tt; rot = -Math.PI / 2; }
    else { x = x0 + BLOCK - inset; z = z0 + tt; rot = Math.PI / 2; }
    if (hitsCollider(x, z, 1.0)) continue;
    spots.push([x, z, rot]); atms.push({ x, z, cd: 0 });
  }
  if (spots.length) {
    const bIM = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), spots.length);
    const sIM = new THREE.InstancedMesh(screenG, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2aa6c0, emissiveIntensity: 0.6, roughness: 0.4 }), spots.length);
    bIM.castShadow = true;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, rot], idx) => { p.set(x, CURB, z); q.setFromAxisAngle(up, rot); m.compose(p, q, s); bIM.setMatrixAt(idx, m); sIM.setMatrixAt(idx, m); });
    scene.add(bIM, sIM);
  }
}

// ---------- road centre-line markings (one instanced draw) ----------
{
  const dash = new THREE.BoxGeometry(0.5, 0.06, 3);
  const mat = new THREE.MeshLambertMaterial({ color: 0xe7d98a, emissive: 0x3a3320 });
  const items = [];
  const lim = HALF - 8, step = 14;
  for (let i = 0; i <= N; i++) {
    const c = roadC(i);
    for (let p = -lim; p <= lim; p += step) { items.push([c, p, 0]); items.push([p, c, Math.PI / 2]); }
  }
  const im = new THREE.InstancedMesh(dash, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  items.forEach(([x, z, rot], idx) => { pv.set(x, 0.04, z); q.setFromAxisAngle(up, rot); m.compose(pv, q, s); im.setMatrixAt(idx, m); });
  im.frustumCulled = false;
  scene.add(im);
}

// ---------- characters — moved to characters.js ----------

// ---------- cars — factories moved to vehicles.js ----------
initVehicles(scene);

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
    baseAccel: pc.accel, baseTop: pc.top, baseTurn: pc.turn,
    jumpMult: pc.jumpMult, heatMult: pc.heatMult, fineMult: pc.fineMult,
  };
  const sp = textSprite(STR.carForSale(STR.pcars[pc.id].name, pc.price), "#fff", "rgba(40,46,55,.92)", 12, 2.4, 0);
  sp.position.set(px, 3.4, pz);
  scene.add(sp);
  car.sale = sp;
  pc.car = car;
  cars.push(car);
});

// free-to-ride motorbikes parked around town — high accel & turn, modest top speed
for (const b of [{ x: 0, z: -30, h: 0, c: 0xe8543f }, { x: 120, z: 4, h: Math.PI / 2, c: 0x2b2f36 }]) {
  cars.push({ x: b.x, z: b.z, h: b.h, speed: 0, mesh: makeBike(b.c), bike: true, accel: 21, top: 30, turn: 2.7 });
}

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
// ramps sit toward the curb side of their road (offset perpendicular to travel), not dead-centre
const RAMPS = [
  { x: -82.5, z: -40, h: 0 }, { x: 82.5, z: 60, h: Math.PI }, { x: -40, z: -181.5, h: Math.PI / 2 },
  { x: 60, z: 93.5, h: -Math.PI / 2 }, { x: -5.5, z: 120, h: 0 },
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
const carGrid = new Map();   // per-frame spatial hash of moving cars, for car-following / queueing
for (let t = 0; t < Math.round(200 * N / 32); t++) {   // traffic scales with the city
  const i = (rng() * N) | 0, j = (rng() * N) | 0;
  const x0 = roadC(i) + 4, x1 = roadC(i + 1) - 4, z0 = roadC(j) + 4, z1 = roadC(j + 1) - 4;
  const wp = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const start = (rng() * 4) | 0;
  traffic.push({
    wp, next: (start + 1) % 4, x: wp[start][0], z: wp[start][1],
    h: 0, speed: rr(7, 11), mesh: makeCar(pick(CAR_COLORS)),
  });
}
// extra traffic so the streets feel busy, not empty. Spawned from a DEDICATED local PRNG (never the
// seeded world stream) so the deterministic city/economy stays byte-identical — the LOD only
// simulates/draws the cars near you, so a fuller road stays cheap.
{
  let _et = 0x7A11C0DE >>> 0;
  const erand = () => { _et = (_et + 0x6D2B79F5) >>> 0; let t = _et; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const epick = arr => arr[(erand() * arr.length) | 0];
  for (let t = 0; t < Math.round(500 * N / 32); t++) {   // ~+625 cars
    // concentrate the extras in the central ~24×24 blocks (the core + suburbs you actually drive
    // through) instead of the far map edges — far denser where it matters, for the same car budget
    const i = 8 + (erand() * 24) | 0, j = 8 + (erand() * 24) | 0;
    const x0 = roadC(i) + 4, x1 = roadC(i + 1) - 4, z0 = roadC(j) + 4, z1 = roadC(j + 1) - 4;
    const wp = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const start = (erand() * 4) | 0;
    traffic.push({
      wp, next: (start + 1) % 4, x: wp[start][0], z: wp[start][1],
      h: 0, speed: 7 + erand() * 4, mesh: makeCar(epick(CAR_COLORS)),
    });
  }
  // avenue cruisers: cars that run LONG straight routes down a main road (not tiny block loops), so the
  // street you're driving on actually has a stream of traffic flowing along it — oncoming and ahead.
  for (let t = 0; t < Math.round(240 * N / 32); t++) {
    const k = 8 + (erand() * 24) | 0;             // a central road line
    const lane = (erand() < 0.5 ? -1 : 1) * 3;    // pick a lane either side of the centre line
    const a = 6 + (erand() * 22) | 0, b = a + 4 + (erand() * 14) | 0;   // two endpoints several blocks apart
    let wp, h0;
    if (erand() < 0.5) { const x = roadC(k) + lane; wp = [[x, roadC(a)], [x, roadC(Math.min(b, N))]]; }   // N-S run
    else { const z = roadC(k) + lane; wp = [[roadC(a), z], [roadC(Math.min(b, N)), z]]; }                  // E-W run
    const start = (erand() * 2) | 0;
    traffic.push({
      wp, next: (start + 1) % 2, x: wp[start][0], z: wp[start][1],
      h: 0, speed: 8 + erand() * 5, mesh: makeCar(epick(CAR_COLORS)),
    });
  }
}
// armored cash trucks: rare, tanky targets — crack one open for a big score and serious heat.
// uses a local PRNG so the main seeded stream (NPCs, parked cars) stays byte-for-byte identical.
{
  let _ts = 0x51ed2701 >>> 0;
  const trand = () => { _ts = (_ts + 0x6D2B79F5) >>> 0; let t = _ts; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let a = 0; a < 2; a++) {
    const i = (trand() * N) | 0, j = (trand() * N) | 0;
    const x0 = roadC(i) + 4, x1 = roadC(i + 1) - 4, z0 = roadC(j) + 4, z1 = roadC(j + 1) - 4;
    const wp = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], st = (trand() * 4) | 0;
    const mesh = makeCar(0x394049); mesh.scale.set(1.18, 1.4, 1.2);
    traffic.push({ wp, next: (st + 1) % 4, x: wp[st][0], z: wp[st][1], h: 0, speed: 5 + trand() * 2, mesh, armored: true, hp: 320, loot: 2500 });
  }
}
// ---------- helicopter: a flyable chopper (BOOST = up, BRAKE = down, stick = move/turn) ----------
const helis = [];
helis.push(makeHeli(PLAZA.x + 22, Rc(3) - 12));

// ---------- boats: drive out across the harbor (board from the south shore) ----------
const boats = [];
boats.push(makeBoat(10, SEA_Z + 7));
boats.push(makeBoat(-90, SEA_Z + 7));
// jet skis: quick, twitchy watercraft — the rider stays visible on the saddle like the bikes
boats.push(makeJetSki(34, SEA_Z + 5, 0xffd23f));
boats.push(makeJetSki(-52, SEA_Z + 5, 0x3fa9f5));
boats.push(makeJetSki(160, SEA_Z + 6, 0xe8543f));
initOcean(scene, SEA_Z, {
  focus: () => ({ x: driving ? driving.x : player.x, z: driving ? driving.z : player.z, h: driving ? driving.h : player.h, swimming }),
  hurt: n => hurt(n), toast: t => toast(t), addShake: v => addShake(v), buzz: v => buzz(v),
  burst: (...a) => burst(...a), emit: (...a) => emit(...a),
  earn: n => earn(n), save: () => save(),
  fishable: () => !!(driving && driving.boat && Math.abs(driving.speed) < 0.8),
  taken: () => state.treasures,
  collectTreasure: (i, pay) => { state.treasures.push(i); toast("💎 Sunken treasure!  +$" + earn(pay)); save(); },
});
initEvents(scene, {
  focus: () => ({ x: driving ? driving.x : player.x, z: driving ? driving.z : player.z, h: driving ? driving.h : player.h, driving: !!driving, speed: driving ? Math.abs(driving.speed) : player.speed }),
  groundY: (x, z) => groundY(x, z),
  toast: t => toast(t), earn: n => earn(n), save: () => save(), buzz: v => buzz(v), addShake: v => addShake(v),
  burst: (...a) => burst(...a),
  // only fire in freeplay, when you're free to act (not in a menu / dialogue / mid-mission / indoors)
  canStart: () => state.mi >= M.length && !dlgLines && !inside && !garageOpen && !statsOpen && !styleOpen && !arcadeOpen && !mapOpen,
});

// ---------- jetpack pickup: grab it once, then hold BOOST on foot to fly ----------
const jetpackPickup = { x: PLAZA.x - 26, z: Rc(3) - 12 };
const jpMesh = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xff7a33, roughness: 0.4, metalness: 0.5, emissive: 0x5a2600, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), mat); body.position.y = 1.1; jpMesh.add(body);
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 8), mat); t1.position.set(-0.46, 1.0, 0); jpMesh.add(t1);
  const t2 = t1.clone(); t2.position.x = 0.46; jpMesh.add(t2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.35; jpMesh.add(ring);
  jpMesh.position.set(jetpackPickup.x, CURB, jetpackPickup.z); scene.add(jpMesh);
}

// ---------- airport: a runway, terminal & control tower west of the city, with planes + a chopper ----------
const planes = [];
const AIRPORT = { x: -HALF - 150, z: 0 };
{
  const AP = AIRPORT;
  const rwMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.85 });
  const runway = new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 520), rwMat); runway.position.set(AP.x, 0.08, 0); runway.receiveShadow = true; scene.add(runway);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf0e6b0 });
  for (let z = -240; z <= 240; z += 24) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 9), dashMat); d.position.set(AP.x, 0.24, z); scene.add(d); }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(64, 0.28, 110), rwMat); apron.position.set(AP.x + 52, 0.07, 30); scene.add(apron);
  const term = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 26), new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.7 })); term.position.set(AP.x + 82, 6, 40); term.castShadow = term.receiveShadow = true; scene.add(term); addCollider(AP.x + 82, 40, 20, 13);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), new THREE.MeshStandardMaterial({ color: 0xa7b0ba })); tower.position.set(AP.x + 54, 11, 96); tower.castShadow = true; scene.add(tower); addCollider(AP.x + 54, 96, 3, 3);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), new THREE.MeshStandardMaterial({ color: 0x33536b, roughness: 0.4 })); cab.position.set(AP.x + 54, 23, 96); scene.add(cab);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.9 })); pad.rotation.x = -Math.PI / 2; pad.position.set(AP.x + 44, 0.12, -80); scene.add(pad);
  planes.push(makePlane(AP.x, -170));
  planes.push(makePlane(AP.x + 13, -130));
  helis.push(makeHeli(AP.x + 44, -80));
}

// world play-bounds: the drivable/walkable area reaches the actual visible edges — the
// airport to the west and the beach waterline to the south — instead of an invisible wall
// at the building grid. Keeps you out of open ocean / off the far west apron.
const WB = {
  x0: Math.min(-HALF - 24, AIRPORT.x - 44),   // west: out across the runway/apron
  x1: HALF + 24,                              // east: a little past the last block
  z0: -HALF - 24,                             // north: a little past the last block
  z1: SEA_Z - 5,                              // south: stop right at the water's edge
};
const SWIM_Z1 = SEA_Z + 380;   // the on-foot player alone may pass the waterline — and swim out this far

// police cars (spawned by wanted level)
const POLICE_N = 5;   // up to 5-star wanted
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

// ---------- high-heat escalation: a police chopper (4★) and an army tank (5★) ----------
// Both are singletons summoned when the heat climbs and can only be put down with explosives.
function makePoliceChopper() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.9 });
  const dark = mat(0x14161a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 4.0), mat(0x1b2330)); body.position.y = 1.1; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), mat(0x12161e)); nose.scale.set(0.95, 0.85, 1.35); nose.position.set(0, 1.15, 1.9); g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 3.4), mat(0x1b2330)); boom.position.set(0, 1.45, -3.3); g.add(boom);
  for (const sx of [-0.9, 0.9]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), dark); skid.position.set(sx, 0.15, 0.1); g.add(skid); }
  const rotor = new THREE.Group(); rotor.position.set(0, 2.05, 0.1);
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.06, 0.42), dark));
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 9.2), dark));
  g.add(rotor);
  // flashing police beacon under the nose
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  beacon.position.set(0, 0.3, 1.6); g.add(beacon);
  // downward spotlight cone sweeping the ground
  const spot = new THREE.Mesh(new THREE.ConeGeometry(5.5, 1, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(spot);   // positioned each frame
  g.position.set(0, -9999, 0); scene.add(g);
  return { x: 0, z: 0, y: 0, h: 0, mesh: g, rotor, beacon, spot, active: false, dead: false, hp: 100, shootCD: 0, leave: false, cd: 0 };
}
function makeTank() {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.7 });
  const green = mat(0x3b4a32), dark = mat(0x20251c);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 4.6), green); hull.position.y = 0.95; hull.castShadow = true; g.add(hull);
  for (const sx of [-1.45, 1.45]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 4.8), dark); tr.position.set(sx, 0.55, 0); g.add(tr); }
  const turret = new THREE.Group(); turret.position.set(0, 1.55, 0);
  turret.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.4), mat(0x44553a)));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.0, 10), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.1, 2.0); turret.add(barrel);
  g.add(turret);
  g.position.set(0, -9999, 0); scene.add(g);
  return { x: 0, z: 0, h: 0, mesh: g, turret, active: false, dead: false, hp: 240, speed: 0, shootCD: 0, cd: 0 };
}
const chopper = makePoliceChopper(), tank = makeTank();

// pedestrians
const npcs = [];
for (let t = 0; t < Math.round(340 * N / 32); t++) {   // a bigger crowd, scaled with the city
  const i = (rng() * N) | 0, j = (rng() * N) | 0;
  const w = makeWalker(npcWalkerGeos[(rng() * npcWalkerGeos.length) | 0]);
  w.group.scale.set(rr(0.92, 1.06), rr(0.9, 1.14), rr(0.92, 1.06));   // varied heights & builds
  scene.add(w.group);
  npcs.push({
    mesh: w.group, legL: w.legL, legR: w.legR, armL: w.armL, armR: w.armR, kneeL: w.kneeL, kneeR: w.kneeR,
    x: blockMin(i) + rr(2, BLOCK - 2), z: blockMin(j) + rr(2, BLOCK - 2),
    h: rr(0, Math.PI * 2), speed: rr(1.0, 1.7), timer: rr(2, 6), phase: rr(0, 6), walkPhase: rr(0, 6),
    mood: (rng() * 3) | 0, talkCD: 0, anger: 0, bubble: null, bubbleT: 0,   // 0 friendly · 1 neutral · 2 rude
  });
}
// Extra crowds so the world feels alive everywhere — a denser street crowd plus people on the beach,
// the waterfront and the central plaza. Uses its OWN PRNG so the seeded city/economy stays byte-identical,
// and the update loop distance-culls them, so a packed city stays cheap.
{
  const lp = mulberry32(0x9E3779B1);
  const lrr = (a, b) => a + lp() * (b - a);
  const spawnNPC = (x, z, ambient) => {
    const w = makeWalker(npcWalkerGeos[(lp() * npcWalkerGeos.length) | 0]);
    w.group.scale.set(lrr(0.92, 1.06), lrr(0.9, 1.14), lrr(0.92, 1.06));
    scene.add(w.group);
    npcs.push({
      mesh: w.group, legL: w.legL, legR: w.legR, armL: w.armL, armR: w.armR, kneeL: w.kneeL, kneeR: w.kneeR,
      x, z, h: lrr(0, Math.PI * 2), speed: lrr(1.0, 1.7), timer: lrr(2, 6), phase: lrr(0, 6), walkPhase: lrr(0, 6),
      mood: (lp() * 3) | 0, talkCD: 0, anger: 0, bubble: null, bubbleT: 0, ambient: !!ambient,
    });
  };
  for (let t = 0; t < Math.round(100 * N / 32); t++) {   // street crowd scattered across the grid
    const i = (lp() * N) | 0, j = (lp() * N) | 0;
    spawnNPC(blockMin(i) + lrr(2, BLOCK - 2), blockMin(j) + lrr(2, BLOCK - 2));
  }
  // sidewalk crowd: hug the block edges right along the roads (what you see while driving/walking)
  for (let t = 0; t < Math.round(150 * N / 32); t++) {
    const i = (lp() * N) | 0, j = (lp() * N) | 0, m0 = blockMin(i), n0 = blockMin(j), a = lp() * BLOCK;
    const edge = (lp() * 4) | 0;
    const x = edge === 2 ? m0 + 1.6 : edge === 3 ? m0 + BLOCK - 1.6 : m0 + a;
    const z = edge === 0 ? n0 + 1.6 : edge === 1 ? n0 + BLOCK - 1.6 : n0 + a;
    spawnNPC(x, z);
  }
  for (let t = 0; t < 120; t++) spawnNPC(lrr(-HALF + 20, HALF - 20), SEA_Z - lrr(30, 78));   // beach + waterfront
  for (let t = 0; t < 70; t++) spawnNPC(PLAZA.x + lrr(-34, 34), PLAZA.z + lrr(-34, 34));       // plaza gathering
  // ambient pool: these recycle to stay near the player (see the update loop), so the streets are
  // populated EVERYWHERE you go — the static crowd above is too thin to cover a map this big alone.
  for (let t = 0; t < 95; t++) spawnNPC(lrr(-HALF, HALF), lrr(-HALF, HALF), true);
}
// dedicated PRNG for crowd wandering — deterministic (reproducible) but separate from the seeded
// city/economy stream, so the crowd is purely cosmetic and never shifts gameplay outcomes
const npcRng = mulberry32(0x51ED5EED);

// ---------- pedestrian banter: walk up to anyone and talk — GTA-style moods & humour ----------
const NPC_LINES = {
  friendly: ["Hey, how's it goin'?", "Lovely day, ain't it?", "Stay outta trouble!", "You're alright, you know that?",
    "Nice threads!", "Keep your chin up, friend.", "Have a good one!", "Hey, I like your vibe.", "Lookin' sharp today!",
    "Mornin'! Or afternoon. Whatever.", "You look like you're goin' places.", "Take care out there.", "Bless up.", "Smile, it's free!"],
  neutral: ["...do I know you?", "Busy day, huh.", "Yeah yeah, keep movin'.", "What's the word?", "Traffic's brutal today.",
    "I'm late for somethin', probably.", "Could go for a coffee right about now.", "Eh. Could be worse.", "I'm not from around here.",
    "You seen my bus?", "Weather's doin' a thing.", "You ever just stand here? Me neither."],
  rude: ["Outta my way, jackass.", "What the hell are you lookin' at?", "Get a job, ya bum.", "You smell like a wet dog.",
    "Beat it, weirdo.", "Nobody asked, pal.", "Piss off.", "Ugh, it's YOU again.", "Take a hike, clown.",
    "I've seen roadkill with more class.", "Do us all a favor and disappear.", "Your face is doin' somethin' weird.", "Cry about it."],
  angry: ["Touch me again and we got PROBLEMS!", "I will END you, pal!", "Back OFF before I lose it!",
    "You got a death wish or somethin'?!", "That's IT — I'm callin' the cops!", "Keep talkin', see what happens!"],
  random: ["I once fought a pigeon. I lost.", "My horoscope said 'avoid people like you.'", "The vibes are immaculate today.",
    "I'm 90% energy drink at this point.", "Do birds even have knees? Think about it.", "I left the stove on. Eh.",
    "Pretty sure that cloud is followin' me.", "Tax season ruined me, man.", "I named my car. Her name's Brenda.",
    "Never trust a man with two phones.", "Pineapple belongs on pizza. Fight me.", "I dreamt I could fly, woke up on the bus."],
};
const rpick = a => a[(Math.random() * a.length) | 0];
function npcLine(n) {
  if (n.anger >= 2) return rpick(NPC_LINES.angry);
  const pool = n.mood === 0 ? [...NPC_LINES.friendly, ...NPC_LINES.random]
    : n.mood === 2 ? [...NPC_LINES.rude, ...NPC_LINES.rude, ...NPC_LINES.random]
      : [...NPC_LINES.neutral, ...NPC_LINES.random, ...NPC_LINES.friendly];
  return rpick(pool);
}
function speak(n, line) {
  if (n.bubble) { n.mesh.remove(n.bubble); n.bubble.material.map.dispose(); n.bubble.material.dispose(); }
  const col = n.anger >= 2 ? "rgba(255,206,206,.96)" : n.mood === 0 ? "rgba(214,255,220,.95)" : n.mood === 2 ? "rgba(255,236,210,.95)" : "rgba(255,255,255,.94)";
  const sp = textSprite(line, "#16181c", col, 7, 1.75, 2.4);
  n.mesh.add(sp); n.bubble = sp; n.bubbleT = 3.6;
}
function talkTo(n) {
  if (!n || n.talkCD > 0) return;
  n.talkCD = 0.6;
  if (n.mood === 2) n.anger = Math.min(3, n.anger + 1);   // poke a rude one and it escalates
  speak(n, npcLine(n));
  AudioSys.play("blip", 0.35); buzz(8);
  if (n.anger >= 2 && Math.random() < 0.5) { n.flee = 2.0; n.h = Math.atan2(n.x - player.x, n.z - player.z); }   // storms off
}
function nearestTalkNPC() {
  if (driving) return null;
  let best = null, bd = 16;
  for (const n of npcs) { const d = dist2(player.x, player.z, n.x, n.z); if (d < bd) { bd = d; best = n; } }
  return best;
}
let ambientCD = 5;

// ---------- gang turf wars: hostile crews hold 3 districts; wipe a turf to capture it ----------
const GANGS = [
  { name: "Crimson Kings", x: bc(5), z: bc(5), r: 80, pal: 0, captured: false, kills: 0, need: 8 },
  { name: "Azure Mob", x: bc(N - 6), z: bc(6), r: 80, pal: 1, captured: false, kills: 0, need: 8 },
  { name: "Verde Cartel", x: bc(6), z: bc(N - 6), r: 80, pal: 2, captured: false, kills: 0, need: 8 },
];
const GANG_PALS = [
  { shirt: 0x8c2020, pants: 0x1a1a1f, skin: 0xc98f6b, hair: 0x141014 },
  { shirt: 0x1f3f8c, pants: 0x16181d, skin: 0xe8b08a, hair: 0x20160f },
  { shirt: 0x1f6b3a, pants: 0x16181d, skin: 0x8d5a3b, hair: 0x100c0a },
];
const gangWalkerGeos = GANG_PALS.map(walkerGeos);
const gangsters = [];
{
  let _gs = 0xA53F19C7 >>> 0;
  const grand = () => { _gs = (_gs + 0x6D2B79F5) >>> 0; let t = _gs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  GANGS.forEach((G, gi) => {
    for (let k = 0; k < 7; k++) {
      const ang = grand() * 6.2832, rad = 8 + grand() * (G.r - 18);
      const w = makeWalker(gangWalkerGeos[G.pal]); scene.add(w.group);
      gangsters.push({
        mesh: w.group, legL: w.legL, legR: w.legR, armL: w.armL, armR: w.armR, kneeL: w.kneeL, kneeR: w.kneeR,
        gang: gi, hp: 100, alive: true, respawn: 0, shootCD: grand() * 2,
        x: clamp(G.x + Math.cos(ang) * rad, -HALF + 4, HALF - 4),
        z: clamp(G.z + Math.sin(ang) * rad, -HALF + 4, HALF - 4),
        h: grand() * 6.2832, walkPhase: grand() * 6.2832,
      });
    }
  });
}

// parked cars along the curbs — static, rendered as a single instanced draw call
{
  const edge = ROAD / 2 - 1.3;                         // sit just inside the road edge, by the curb
  const start = { x: PLAZA.x, z: Rc(3) - 12 };      // keep the player's spawn area clear
  const ok = (x, z) => dist2(x, z, PLAZA.x, PLAZA.z) > 900 && dist2(x, z, start.x, start.z) > 576
    && RAMPS.every(r => dist2(x, z, r.x, r.z) > 169);   // never block a stunt ramp
  // a boxy delivery van mixed into the curbside parking for vehicle variety (tintable white body)
  const vanGeo = mergeGeos([
    boxGeoC(2.05, 0.5, 5.0, 0, 0.5, 0, 0x20242a),        // chassis
    boxGeoC(2.1, 1.6, 3.0, 0, 1.45, -0.85, 0xffffff),    // cargo box (tintable)
    boxGeoC(2.0, 1.05, 1.7, 0, 1.05, 1.65, 0xffffff),    // cab (tintable)
    boxGeoC(1.82, 0.62, 0.12, 0, 1.35, 2.52, 0x223040),  // windshield
    boxGeoC(0.12, 0.5, 1.0, 1.0, 1.2, 1.7, 0x223040),    // cab side windows
    boxGeoC(0.12, 0.5, 1.0, -1.0, 1.2, 1.7, 0x223040),
    wheelGeo(0.5, 0.34, 0.95, 0.5, 1.5, 0x161616), wheelGeo(0.5, 0.34, -0.95, 0.5, 1.5, 0x161616),
    wheelGeo(0.5, 0.34, 0.95, 0.5, -1.5, 0x161616), wheelGeo(0.5, 0.34, -0.95, 0.5, -1.5, 0x161616),
    wheelGeo(0.2, 0.36, 0.97, 0.5, 1.5, 0xc2c6cc), wheelGeo(0.2, 0.36, -0.97, 0.5, 1.5, 0xc2c6cc),
    wheelGeo(0.2, 0.36, 0.97, 0.5, -1.5, 0xc2c6cc), wheelGeo(0.2, 0.36, -0.97, 0.5, -1.5, 0xc2c6cc),
    boxGeoC(0.3, 0.18, 0.1, 0.6, 0.7, 2.52, 0xfff4c4), boxGeoC(0.3, 0.18, 0.1, -0.6, 0.7, 2.52, 0xfff4c4),  // headlights
    boxGeoC(0.32, 0.5, 0.1, 0.85, 1.3, -2.35, 0xc8403a), boxGeoC(0.32, 0.5, 0.1, -0.85, 1.3, -2.35, 0xc8403a),  // taillights
  ]);
  const VAN_COLORS = [0xe8e4da, 0xc8ccd2, 0x8a9098, 0x3a4452, 0xd8d4c8, 0x9a6a4a];
  const carSpots = [], vanSpots = [];
  // route ~1-in-6 spots to vans, chosen deterministically from position (no rng() => seeded stream untouched)
  const route = (x, z, yaw) => (((Math.floor(x * 7.3 + z * 3.1) % 6) + 6) % 6 === 0 ? vanSpots : carSpots).push([x, z, yaw]);
  for (let k = 0; k <= N; k++) {
    const c = roadC(k);
    for (let b = 0; b < N; b++) {
      const z = bc(b) + rr(-16, 16), sv = rng() < 0.5 ? edge : -edge;
      if (rng() < 0.72 && ok(c + sv, z)) route(c + sv, z, sv > 0 ? 0 : Math.PI);
      const x = bc(b) + rr(-16, 16), sh = rng() < 0.5 ? edge : -edge;
      if (rng() < 0.72 && ok(x, c + sh)) route(x, c + sh, sh > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  const parkMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.38, envMapIntensity: 1.0 });
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  // chunk parked vehicles so distant ones get frustum-culled (PBR cars are the heaviest static prop)
  const emit = (list, geo, halfL, colors) => {
    list.forEach(([x, z, yaw]) => {
      const alongX = Math.abs(Math.sin(yaw)) > 0.5;      // orientation-aware collider footprint
      addCollider(x, z, alongX ? halfL : 1.15, alongX ? 1.15 : halfL);
    });
    const chunks = new Map();
    for (const sp of list) { const k = chunkKey(sp[0], sp[1]); let a = chunks.get(k); if (!a) chunks.set(k, a = []); a.push(sp); }
    for (const arr of chunks.values()) {
      const im = new THREE.InstancedMesh(geo, parkMat, arr.length);
      arr.forEach(([x, z, yaw], idx) => { p.set(x, 0, z); q.setFromAxisAngle(up, yaw); m.compose(p, q, s); im.setMatrixAt(idx, m); im.setColorAt(idx, _col.set(pick(colors))); });
      scene.add(im);
    }
  };
  emit(carSpots, carGeo, 2.4, CAR_COLORS);   // sedans
  emit(vanSpots, vanGeo, 2.7, VAN_COLORS);   // delivery vans (taller, longer)
}

// story characters
function storyNPC(pal, x, z, name) {
  const mesh = new THREE.Mesh(personGeo(pal), matPerson);
  mesh.castShadow = true;
  mesh.position.set(x, CURB, z);
  const tag = textSprite(name, "#1d2a20", "rgba(255,209,102,.95)", 5, 1.25, 2.3);
  mesh.add(tag);
  scene.add(mesh);
  return mesh;
}
const marco = storyNPC({ shirt: 0x2a9d8f, pants: 0x4a4f59, skin: 0xc98f6b, hair: 0x1f1a16 },
  PLAZA.x, PLAZA.z + 11, STR.who.marco);
const ROSA_POS = { x: Bm(4) + 2, z: 132 };
const rosa = storyNPC({ shirt: 0xe76f8a, pants: 0xf5f0e6, skin: 0xe8b08a, hair: 0x3a2010 },
  ROSA_POS.x, ROSA_POS.z, STR.who.rosa);
const vince = storyNPC({ shirt: 0x4a4f59, pants: 0x23262b, skin: 0xd9a37a, hair: 0x55524e },
  PLAZA.x, PLAZA.z - 8, STR.who.vince);
vince.visible = false;

// ---------- player ----------
const hero = articulatedPerson(HERO_PAL);
// yaw first, then pitch/roll in body space — so a forward lean or a weight shift tilts the body
// along its own axes instead of the world's, whichever way you happen to be facing.
hero.group.rotation.order = "YXZ";
hero.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
scene.add(hero.group);
// The foot shadow lives in the scene, NOT under hero.group: parented, it would inherit the body's
// walk lean and weight roll and go skating through the road surface. Flat on the ground, always.
const heroBlob = makeBlob(1.5, 1.5, 0.4);
scene.add(heroBlob);
const HIP_Y = 0.88;   // hip pivot height — the lever a swinging leg lifts its foot on (see the walk dip)
// scratch for keeping a parented contact shadow world-flat under a body that pitches/rolls
const _flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _tmpQ = new THREE.Quaternion();
function levelBlob(mesh) {   // cancel the parent's tilt so the shadow stays lying on the road
  const b = mesh.userData && mesh.userData.blob;
  if (b) b.quaternion.copy(_tmpQ.copy(mesh.quaternion).invert()).multiply(_flatQ);
}

// ---------- vehicle entry/exit animation: a door swings open + the player gets in / mounts ----------
let mount = null;   // { c, mode:'in'|'out', t, dur, ex, ez } while a get-in / get-off plays
const doorPivot = new THREE.Group();   // hinges at the front edge so the panel swings like a real door
const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.82, 1.5),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.28, envMapIntensity: 1.3 }));
doorPanel.position.z = -0.75; doorPanel.castShadow = true;
doorPivot.add(doorPanel); doorPivot.visible = false; scene.add(doorPivot);
const smooth = p => p * p * (3 - 2 * p);
const lerp = (a, b, t) => a + (b - a) * t;
function startMount(c, mode, ex, ez) {
  c.speed = 0; c.lat = 0;
  if (globalThis.__PALM_TEST) {   // headless determinism runs skip the animation (instant enter/exit, as before)
    if (mode === "in") { if (!c.bike) hero.group.visible = false; }
    else { player.x = clamp(ex, WB.x0, WB.x1); player.z = clamp(ez, WB.z0, WB.z1); player.h = c.h; driving = null; hero.group.visible = true; }
    AudioSys.play("door", 0.85);
    return;
  }
  mount = { c, mode, t: 0, dur: c.bike ? 0.5 : 0.55, ex, ez };
  hero.group.visible = true;
  AudioSys.play("door", 0.85);
}
function finishMount() {
  const m = mount; mount = null; doorPivot.visible = false;
  hero.group.scale.set(1, 1, 1);
  if (m.mode === "in") { if (!m.c.bike) hero.group.visible = false; }   // tucked inside the car (bike keeps the rider shown)
  else {                                                                // dismounted — step off and let go of the vehicle
    player.x = clamp(m.ex, WB.x0, WB.x1); player.z = clamp(m.ez, WB.z0, WB.z1); player.h = m.c.h;
    driving = null; hero.group.visible = true;
    hero.group.scale.set(1, 1, 1);
  }
}
function updateMount(dt) {
  if (!mount) return;
  const m = mount, c = m.c;
  if (driving !== c) { mount = null; doorPivot.visible = false; hero.group.scale.set(1, 1, 1); return; }   // vehicle lost mid-animation (e.g. wasted)
  m.t += dt;
  const p = clamp(m.t / m.dur, 0, 1), e = smooth(p);
  const k = m.mode === "in" ? e : 1 - e;            // 0 = outside/standing · 1 = inside/seated
  const fx = Math.sin(c.h), fz = Math.cos(c.h), sx = Math.cos(c.h), sz = -Math.sin(c.h);   // forward + left-side unit vectors
  const gy = groundY(c.x, c.z);
  if (c.bike) {
    // swing a leg over and settle onto the saddle (reverse to step off)
    const seatX = c.x - fx * 0.26, seatZ = c.z - fz * 0.26, seatY = gy - 0.04;
    const standX = c.x + sx * 1.0, standZ = c.z + sz * 1.0;
    hero.group.position.set(lerp(standX, seatX, k), lerp(gy, seatY, k) + Math.sin(p * Math.PI) * 0.14, lerp(standZ, seatZ, k));
    hero.group.rotation.set(0.12 * k, c.h, 0);
    hero.legL.rotation.x = -1.4 * k; hero.legR.rotation.x = -1.4 * k;
    hero.kneeL.rotation.x = 1.55 * k; hero.kneeR.rotation.x = 1.55 * k;
    hero.legL.rotation.z = 0.22 * k; hero.legR.rotation.z = -0.22 * k;
    hero.armL.rotation.x = hero.armR.rotation.x = -1.05 * k;
  } else {
    // a door swings open, the player slips into the seat, then it shuts behind them
    doorPivot.visible = true; doorPanel.material.color.copy(c.mesh.material.color);
    const open = Math.sin(p * Math.PI);                            // open through the middle, shut by the end
    const sideX = c.x + sx * 0.95, sideZ = c.z + sz * 0.95;        // driver side
    doorPivot.position.set(sideX + fx * 0.75, gy + 0.62, sideZ + fz * 0.75);   // hinge at the door's front edge
    doorPivot.rotation.set(0, c.h - open * 1.05, 0);                            // free edge swings outward, away from the body
    const outX = c.x + sx * 1.5, outZ = c.z + sz * 1.5;
    hero.group.position.set(lerp(outX, c.x, k), gy, lerp(outZ, c.z, k));
    hero.group.rotation.set(0, c.h + (1 - k) * 0.5, 0);            // turn to face into the seat
    const duck = Math.min(1, k * 1.25);
    hero.legL.rotation.set(0.7 * duck, 0, 0); hero.legR.rotation.set(0.7 * duck, 0, 0);
    hero.kneeL.rotation.x = 1.0 * duck; hero.kneeR.rotation.x = 1.0 * duck;
    hero.armL.rotation.x = hero.armR.rotation.x = 0.4 * duck;
    hero.group.visible = k < 0.86;                                 // gone inside by the end
  }
  if (m.t >= m.dur) finishMount();
}

// ---------- wardrobe (clothing) + barber (haircuts): change the player's look ----------
const OUTFITS = [
  { name: "Sunset Tee", shirt: 0xff7a33, pants: 0xf5f0e6 },
  { name: "Aqua Casual", shirt: 0x39b6c8, pants: 0x33414d },
  { name: "Rose Hoodie", shirt: 0xe8688f, pants: 0x3a3a44 },
  { name: "Mint Fresh", shirt: 0x7fd4a0, pants: 0xeef0e8 },
  { name: "Royal Suit", shirt: 0x2f3b73, pants: 0x222633 },
  { name: "Cream Linen", shirt: 0xf2e6c8, pants: 0xc9a878 },
  { name: "Neon Pop", shirt: 0xc6ff3a, pants: 0x2a2a2a },
  { name: "Lavender", shirt: 0xb79ce0, pants: 0x4a4f59 },
  { name: "Crimson", shirt: 0xd2402f, pants: 0xe8e4da },
  { name: "Tropic", shirt: 0xffcf3f, pants: 0x1f8f8f },
  { name: "Street Black", shirt: 0x23262b, pants: 0x3a3f47 },
  { name: "Ocean Blue", shirt: 0x2f6fd0, pants: 0xdfe6ee },
];
const HAIRCUTS = [
  { name: "Short Black", color: 0x241c18, style: "short" },
  { name: "Brown Crop", color: 0x5a3b22, style: "short" },
  { name: "Blonde", color: 0xe6c26a, style: "short" },
  { name: "Ginger", color: 0xb5572a, style: "short" },
  { name: "Silver Fox", color: 0xcfcfcf, style: "short" },
  { name: "Platinum", color: 0xeae6d8, style: "short" },
  { name: "Buzz Cut", color: 0x241c18, style: "buzz" },
  { name: "Buzz Blonde", color: 0xc9a85e, style: "buzz" },
  { name: "Afro", color: 0x1a1410, style: "afro" },
  { name: "Brown Afro", color: 0x4a3220, style: "afro" },
  { name: "Pompadour", color: 0x2a2018, style: "tall" },
  { name: "Mohawk", color: 0x222018, style: "mohawk" },
  { name: "Pink Mohawk", color: 0xe8488f, style: "mohawk" },
  { name: "Blue Spike", color: 0x2f7fd0, style: "tall" },
  { name: "Long Blonde", color: 0xdcb45a, style: "long" },
  { name: "Long Brown", color: 0x4a3220, style: "long" },
  { name: "Long Black", color: 0x1c1814, style: "long" },
  { name: "Pink Dye", color: 0xe86fae, style: "short" },
  { name: "Green Dye", color: 0x4fb36a, style: "short" },
  { name: "Bald", color: 0x3a2c20, style: "bald" },
];
function setHairStyle(style) {
  const h = hero.hair; h.visible = true;
  if (style === "buzz") { h.scale.set(1.02, 0.5, 1.02); h.position.set(0, 1.70, -0.02); }
  else if (style === "afro") { h.scale.set(1.5, 1.35, 1.5); h.position.set(0, 1.74, -0.02); }
  else if (style === "tall") { h.scale.set(1.0, 1.32, 1.0); h.position.set(0, 1.78, -0.04); }
  else if (style === "long") { h.scale.set(1.18, 1.08, 1.18); h.position.set(0, 1.66, -0.06); }
  else if (style === "mohawk") { h.scale.set(0.42, 1.5, 1.05); h.position.set(0, 1.8, -0.02); }
  else if (style === "bald") { h.visible = false; }
  else { h.scale.set(1.05, 0.82, 1.05); h.position.set(0, 1.71, -0.04); }
}
function applyOutfit(idx, quiet) {
  const o = OUTFITS[idx]; if (!o) return;
  hero.shirtMat.color.setHex(o.shirt); hero.pantsMat.color.setHex(o.pants);
  state.outfit = idx;
  if (!quiet) { toast("👕 " + o.name); AudioSys.play("blip", 0.5); save(); }
}
function applyHaircut(idx, quiet) {
  const hc = HAIRCUTS[idx]; if (!hc) return;
  hero.hairMat.color.setHex(hc.color); setHairStyle(hc.style);
  state.haircut = idx;
  if (!quiet) { toast("💈 " + hc.name); AudioSys.play("blip", 0.5); save(); }
}

// accessories: jackets, hats, glasses (built on demand into the hero's holder groups)
const JACKETS = [
  { name: "None", none: true }, { name: "Leather Black", color: 0x1c1c20 }, { name: "Denim", color: 0x3f5e86 },
  { name: "Bomber Green", color: 0x3f5a3a }, { name: "Red Varsity", color: 0xb2342f }, { name: "Cream Coat", color: 0xe6dcc4 },
  { name: "Purple", color: 0x6a4a9c }, { name: "Hi-Vis Orange", color: 0xff7a1e },
];
const HATS = [
  { name: "None", none: true }, { name: "Red Cap", type: "cap", color: 0xc0392b }, { name: "Blue Cap", type: "cap", color: 0x2f6fb0 },
  { name: "Beanie", type: "beanie", color: 0x3a3f47 }, { name: "Fedora", type: "fedora", color: 0x4a3826 },
  { name: "Bucket Hat", type: "bucket", color: 0x6f8b4a }, { name: "Top Hat", type: "tophat", color: 0x16161a }, { name: "Pink Beanie", type: "beanie", color: 0xe86fae },
];
const GLASSES = [
  { name: "None", none: true }, { name: "Sunglasses", type: "dark", color: 0x111114 }, { name: "Aviators", type: "dark", color: 0x2a3340 },
  { name: "Round", type: "clear", color: 0x222222 }, { name: "Neon Pink", type: "dark", color: 0xe0408a }, { name: "Ski Goggles", type: "dark", color: 0x30b0c0 },
];
function clearHolder(grp) { while (grp.children.length) { const c = grp.children.pop(); if (c.geometry) c.geometry.dispose(); } }
function setJacket(j) {
  clearHolder(hero.jacketHolder);
  if (!j || j.none) return;
  const m = new THREE.MeshLambertMaterial({ color: j.color });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.64, 12, 1, true), m); body.position.y = 1.12;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.21, 0.12, 12, 1, true), m); collar.position.y = 1.42;
  const sl = x => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.46, 8), m); a.position.set(x, 1.28, 0); return a; };
  body.castShadow = collar.castShadow = true;
  hero.jacketHolder.add(body, collar, sl(0.3), sl(-0.3));
}
function setHat(h) {
  clearHolder(hero.hatHolder);
  if (!h || h.none) return;
  const m = new THREE.MeshLambertMaterial({ color: h.color });
  const parts = [];
  if (h.type === "cap") {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, 6.3, 0, 1.5), m); crown.scale.set(1, 0.72, 1); crown.position.y = 1.74;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.22), m); brim.position.set(0, 1.71, 0.2);
    parts.push(crown, brim);
  } else if (h.type === "beanie") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 8, 0, 6.3, 0, 1.9), m); b.scale.set(1.03, 0.95, 1.03); b.position.y = 1.72; parts.push(b);
  } else if (h.type === "fedora") {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 12), m); crown.position.y = 1.85;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 18), m); brim.position.y = 1.76; parts.push(crown, brim);
  } else if (h.type === "bucket") {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.2, 12), m); crown.position.y = 1.8;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 18), m); brim.position.y = 1.72; parts.push(crown, brim);
  } else if (h.type === "tophat") {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 14), m); crown.position.y = 1.94;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18), m); brim.position.y = 1.76; parts.push(crown, brim);
  }
  parts.forEach(p => { p.castShadow = true; hero.hatHolder.add(p); });
}
function setGlasses(g) {
  clearHolder(hero.glassHolder);
  if (!g || g.none) return;
  const m = new THREE.MeshLambertMaterial({ color: g.color, transparent: g.type === "clear", opacity: g.type === "clear" ? 0.5 : 1 });
  const lens = x => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.085, 0.02), m); l.position.set(x, 1.635, 0.17); return l; };
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), m); bridge.position.set(0, 1.645, 0.17);
  hero.glassHolder.add(lens(0.08), lens(-0.08), bridge);
}
// beards / facial hair (built into the hero's beard holder, around the chin & jaw)
const BEARDS = [
  { name: "Clean Shaven", none: true }, { name: "Stubble", type: "full", color: 0x2a2118, scale: 0.55 },
  { name: "Full Black", type: "full", color: 0x1f1812 }, { name: "Full Brown", type: "full", color: 0x4a3220 },
  { name: "Full Ginger", type: "full", color: 0xa85a2c }, { name: "Grey Beard", type: "full", color: 0xb8b2a6 },
  { name: "Goatee", type: "goatee", color: 0x241c14 }, { name: "Goatee Brown", type: "goatee", color: 0x4a3220 },
  { name: "Mustache", type: "mustache", color: 0x2a2018 }, { name: "Blonde Beard", type: "full", color: 0xc9a85e },
];
function setBeard(b) {
  clearHolder(hero.beardHolder);
  if (!b || b.none) return;
  const m = new THREE.MeshLambertMaterial({ color: b.color });
  if (b.type === "full") {
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9, 0, 6.3, 1.3, 1.5), m);
    jaw.scale.set(1.02, (b.scale || 0.9), 0.95); jaw.position.set(0, 1.57, 0.02); jaw.castShadow = true;
    hero.beardHolder.add(jaw);
  } else if (b.type === "goatee") {
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.07), m); chin.position.set(0, 1.5, 0.13);
    const stash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.04), m); stash.position.set(0, 1.585, 0.16);
    hero.beardHolder.add(chin, stash);
  } else if (b.type === "mustache") {
    const stash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.04), m); stash.position.set(0, 1.585, 0.16);
    hero.beardHolder.add(stash);
  }
}
function applyBeard(idx, quiet) { state.beard = idx; setBeard(BEARDS[idx]); if (!quiet) { toast("🧔 " + BEARDS[idx].name); AudioSys.play("blip", 0.5); save(); } }
function applyJacket(idx, quiet) { state.jacket = idx; setJacket(JACKETS[idx]); if (!quiet) { toast("🧥 " + JACKETS[idx].name); AudioSys.play("blip", 0.5); save(); } }
function applyHat(idx, quiet) { state.hat = idx; setHat(HATS[idx]); if (!quiet) { toast("🎩 " + HATS[idx].name); AudioSys.play("blip", 0.5); save(); } }
function applyGlasses(idx, quiet) { state.glasses = idx; setGlasses(GLASSES[idx]); if (!quiet) { toast("🕶 " + GLASSES[idx].name); AudioSys.play("blip", 0.5); save(); } }
const nearShop = () => {
  if (driving) return null;
  for (const sh of SHOPS) if (dist2(player.x, player.z, sh.x, sh.z) < 30) return sh;
  return null;
};
const player = { x: PLAZA.x, z: Rc(3) - 12, y: CURB, h: Math.PI, walkPhase: 0, speed: 0, turn: 0 };
let driving = null;   // car object (or helicopter) while driving/flying
let para = null;      // non-null while parachuting (after bailing from a chopper midair)
// parachute canopy (a half-dome), hidden until deployed
const paraMesh = new THREE.Mesh(
  new THREE.SphereGeometry(2.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xff6b3a, side: THREE.DoubleSide, roughness: 0.75, metalness: 0.0 }));
paraMesh.visible = false; paraMesh.castShadow = true; scene.add(paraMesh);
// job objective marker (a glowing column), shown during courier/bounty jobs
const jobMarker = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.2, 9, 14, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
jobMarker.visible = false; scene.add(jobMarker);

// ---------- enterable building interiors (a single furnished room, staged far from the city) ----------
const INT = { x: 4000, z: 0 };
let inside = false, intReturn = { x: 0, z: 0, h: 0 };
const intSign = textSprite("", "#fff", "rgba(20,20,24,.9)", 16, 4, 0);
const intLight = new THREE.PointLight(0xfff2d6, 0, 48, 1.4); intLight.position.set(INT.x, 4.2, INT.z + 1); scene.add(intLight);
const intProps = new THREE.Group(); scene.add(intProps);
let intFloor, intWallMat, intTheme = "shop";
// interior surface textures
const R = Math.random;
const woodTex = canvasTex(128, (ctx, s) => { for (let i = 0; i < 8; i++) { const w = s / 8; ctx.fillStyle = ["#9a6e44", "#a9794d", "#8f6440", "#b08355"][i % 4]; ctx.fillRect(i * w, 0, w, s); ctx.strokeStyle = "rgba(60,40,20,.35)"; ctx.strokeRect(i * w, 0, w, s); for (let k = 0; k < 12; k++) { ctx.fillStyle = "rgba(70,45,25,.16)"; ctx.fillRect(i * w + 3, R() * s, 6 + R() * 16, 1); } } }, 4, 4);
const tileTex = canvasTex(128, (ctx, s) => { ctx.fillStyle = "#d9d9df"; ctx.fillRect(0, 0, s, s); const g = s / 4; ctx.strokeStyle = "#aab0bc"; ctx.lineWidth = 3; for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * g, 0); ctx.lineTo(i * g, s); ctx.moveTo(0, i * g); ctx.lineTo(s, i * g); ctx.stroke(); } }, 5, 5);
const carpetTex = canvasTex(128, (ctx, s) => { ctx.fillStyle = "#7a3540"; ctx.fillRect(0, 0, s, s); for (let i = 0; i < 500; i++) { ctx.fillStyle = R() < 0.5 ? "#8a3d48" : "#6a2c36"; ctx.fillRect(R() * s, R() * s, 2, 2); } }, 6, 6);
const concreteTex = canvasTex(128, (ctx, s) => { ctx.fillStyle = "#9a9a9e"; ctx.fillRect(0, 0, s, s); for (let i = 0; i < 360; i++) { ctx.fillStyle = ["#909094", "#a6a6aa", "#8a8a8e"][i % 3]; const r = 1 + R() * 2; ctx.fillRect(R() * s, R() * s, r, r); } }, 6, 6);
const FLOORTEX = { wood: woodTex, tile: tileTex, carpet: carpetTex, concrete: concreteTex };
const wallTex = canvasTex(64, (ctx, s) => { ctx.fillStyle = "#ece3d2"; ctx.fillRect(0, 0, s, s); for (let i = 0; i < 50; i++) { ctx.fillStyle = "rgba(0,0,0,.04)"; ctx.fillRect(R() * s, R() * s, 2, 2); } ctx.fillStyle = "#cdbfa6"; ctx.fillRect(0, s - 7, s, 7); }, 3, 1);
{
  const wallMat = intWallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  intFloor = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), new THREE.MeshLambertMaterial({ map: woodTex }));
  intFloor.rotation.x = -Math.PI / 2; intFloor.position.set(INT.x, 0.02, INT.z + 0.5); intFloor.receiveShadow = true; scene.add(intFloor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), new THREE.MeshLambertMaterial({ color: 0xf2ecde }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(INT.x, 4.4, INT.z + 0.5); scene.add(ceil);
  const wall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); };
  wall(20, 4.4, 0.4, INT.x, 2.2, INT.z + 8);
  wall(0.4, 4.4, 15.4, INT.x - 10, 2.2, INT.z + 0.5);
  wall(0.4, 4.4, 15.4, INT.x + 10, 2.2, INT.z + 0.5);
  wall(7.2, 4.4, 0.4, INT.x - 6.4, 2.2, INT.z - 7);
  wall(7.2, 4.4, 0.4, INT.x + 6.4, 2.2, INT.z - 7);
  wall(20, 1.0, 0.4, INT.x, 3.9, INT.z - 7);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  lamp.position.set(INT.x, 4.3, INT.z + 0.5); scene.add(lamp);
  intSign.position.set(INT.x, 3.45, INT.z + 7.7); scene.add(intSign);
}
// themed furniture, rebuilt on entry. box(w,h,d, x,y,z, color[, emissive])
function ib(w, h, d, x, y, z, color, emis) {
  const mm = emis ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm);
  m.position.set(INT.x + x, y, INT.z + z); m.castShadow = !emis; m.receiveShadow = !emis; intProps.add(m); return m;
}
const INTHEMES = {
  home: { floor: "carpet", build: () => { ib(4, 0.8, 1.6, -4, 0.5, 4.4, 0x4a5f86); ib(4, 0.6, 0.5, -4, 1.0, 5.1, 0x55699a); ib(2.4, 0.4, 1.2, -4, 0.45, 2.4, 0x7a5a3a); ib(3, 1.7, 0.25, 6, 1.5, 6.7, 0x16181c); ib(2, 0.6, 1, 6, 0.5, 6, 0x2a2a2e); ib(0.5, 1.6, 0.5, 8.5, 0.85, -5, 0x3a7a3a); } },
  armory: { floor: "concrete", build: () => { ib(7, 1.1, 1.2, 0, 0.55, 6, 0x3a3f47); ib(7, 1.6, 0.2, 0, 2.6, 7.7, 0x2a2620); for (let i = -3; i <= 3; i++) ib(0.16, 1.1, 0.4, i, 2.6, 7.55, 0x6b5a44); ib(2, 1.2, 2, 8, 0.6, -4, 0x6b5236); ib(2, 1.2, 2, 8, 0.6, -1, 0x6b5236); } },
  club: { floor: "tile", floorTint: 0x5a5a72, build: () => { ib(8, 1.1, 1.4, 0, 0.55, 6, 0x241c30); ib(7, 1.4, 0.3, 0, 2.6, 7.6, 0x12101a); ib(6, 0.3, 0.3, 0, 2.0, 7.5, 0xff3b8b, true); ib(6, 0.3, 0.3, 0, 3.2, 7.5, 0x3bd0ff, true); for (let i = -3; i <= 3; i += 2) ib(0.5, 1.0, 0.5, i, 0.5, 3.6, 0x3a3a44); } },
  food: { floor: "tile", build: () => { ib(8, 1.1, 1.4, 0, 0.55, 6, 0xb5532e); ib(5, 1.6, 0.2, 0, 2.7, 7.6, 0x1c1e22); ib(4.6, 1.3, 0.1, 0, 2.7, 7.5, 0xffcf3f, true); for (let i = -4; i <= 4; i += 2.6) { ib(1.4, 0.4, 1.4, i, 0.5, 1.5, 0xe6e6e6); ib(0.4, 0.9, 0.4, i, 0.45, 1.5, 0x9a9a9a); } } },
  barber: { floor: "tile", build: () => { for (const sx of [-5, 5]) { ib(3, 1.6, 0.12, sx, 1.6, 7.5, 0x9fd8ea); ib(1, 0.5, 1, sx, 0.55, 5, 0x2a2a30); ib(0.85, 0.8, 0.85, sx, 1.1, 5, 0x4a4a55); } ib(5, 1.0, 1, 0, 0.5, 6.5, 0x3a3f47); } },
  clothing: { floor: "wood", build: () => { for (const z of [2.5, 5.2]) { ib(0.1, 0.12, 4, -6, 2.0, z, 0x999999); for (let i = 0; i < 5; i++) ib(0.7, 1.3, 0.28, -6, 1.0, z - 1.6 + i * 0.8, [0xe8688f, 0x39b6c8, 0xf0c040, 0x7fd4a0, 0xb79ce0][i]); } ib(6, 2.4, 0.3, 6.5, 1.6, 4, 0xc9b79a); } },
  hospital: { floor: "tile", floorTint: 0xe8f2f2, build: () => { ib(2, 0.6, 4, -5, 0.5, 4, 0xeef4f6); ib(2, 0.3, 4, -5, 0.92, 4, 0xbfe0e8); ib(0.45, 2, 0.45, 5.5, 1.2, 7, 0xcc3333, true); ib(1.3, 0.5, 0.45, 5.5, 1.55, 7.1, 0xcc3333, true); ib(1.6, 1.3, 1.4, 8, 0.65, 2, 0xdfe6ea); } },
  garage: { floor: "concrete", build: () => { ib(2, 1.4, 0.7, -6, 0.8, 5.5, 0xc23a36); ib(5, 0.3, 2.4, 4, 0.25, 4, 0x2a2d33); for (let i = 0; i < 5; i++) ib(0.3, 1.7, 0.3, -8 + i * 0.45, 1.05, 7.6, 0x555a60); } },
  warehouse: { floor: "concrete", build: () => { for (let i = -6; i <= 6; i += 3) for (let j = 0; j <= 6; j += 3) ib(2, 2, 2, i, 1.0, j, [0x8a6a3a, 0x6b5236, 0x9a7a4a][((i + 6) / 3) % 3]); } },
  office: { floor: "carpet", floorTint: 0x7c828e, build: () => { ib(3, 1.0, 1.6, 0, 0.5, 5.5, 0x6a5a44); ib(1.2, 0.6, 1.2, 0, 0.45, 3.5, 0x2a2a30); ib(0.5, 1.6, 0.5, 8.5, 0.85, -5, 0x3a7a3a); ib(3.5, 2, 0.2, 0, 2.4, 7.7, 0xdfe6ea); } },
  shop: { floor: "wood", build: () => { ib(7, 1.1, 1.4, 0, 0.55, 6, 0x6b4a32); for (const z of [2.5, -2.5]) { ib(0.6, 3, 4, -9, 1.6, z, 0xb9a07e); for (let i = 0; i < 5; i++) ib(0.55, 0.5, 0.55, -8.9, 0.6 + i * 0.6, z, [0xe8543f, 0x3f7fe8, 0xf0c040, 0x58b368, 0xc25cd6][i]); } } },
};
function buildInterior(theme) {
  while (intProps.children.length) { const c = intProps.children.pop(); if (c.geometry) c.geometry.dispose(); }
  bowlGroup.visible = false;
  if (theme === "bowling") { if (intWallMat) intWallMat.color.setHex(0xe8e0d0); intFloor.material.map = woodTex; intFloor.material.color.setHex(0xffffff); intFloor.material.needsUpdate = true; bowlGroup.visible = true; bowlEnter(); return; }
  if (theme === "home") { buildHome(); return; }          // your apartment is built from your saved decor
  if (intWallMat) intWallMat.color.setHex(0xffffff);
  const cfg = INTHEMES[theme] || INTHEMES.shop;
  intFloor.material.map = FLOORTEX[cfg.floor] || woodTex;
  intFloor.material.color.setHex(cfg.floorTint || 0xffffff);
  intFloor.material.needsUpdate = true;
  cfg.build();
}
// ---------- apartment decoration: pick furniture/colours, saved in state.decor ----------
const DECOR = {
  wall: { name: "Wall", opts: [{ n: "Cream", c: 0xece3d2 }, { n: "Sky", c: 0xcfe0ee }, { n: "Sage", c: 0xd2e0cf }, { n: "Blush", c: 0xeed4d8 }, { n: "Slate", c: 0x9aa0ac }, { n: "Tan", c: 0xe2cfa6 }, { n: "Lilac", c: 0xddd2ec }] },
  floor: { name: "Floor", opts: [{ n: "Wood", tex: "wood" }, { n: "Tile", tex: "tile" }, { n: "Carpet", tex: "carpet" }, { n: "Concrete", tex: "concrete" }] },
  sofa: { name: "Sofa", opts: [{ n: "None", none: true }, { n: "Navy", c: 0x3a4f76 }, { n: "Teal", c: 0x2e7d78 }, { n: "Mustard", c: 0xd0a23a }, { n: "Crimson", c: 0xa23a3a }, { n: "Grey", c: 0x6a6e76 }, { n: "Plum", c: 0x6a4a7a }] },
  bed: { name: "Bed", opts: [{ n: "None", none: true }, { n: "Blue", c: 0x4a6f9a }, { n: "Green", c: 0x4a8a5a }, { n: "Red", c: 0xa24a4a }, { n: "Cream", c: 0xe0d6c0 }] },
  rug: { name: "Rug", opts: [{ n: "None", none: true }, { n: "Red", c: 0xb24a4a }, { n: "Blue", c: 0x3a5a8a }, { n: "Gold", c: 0xc7a23a }, { n: "Green", c: 0x4a7a5a }, { n: "Mono", c: 0x3a3a40 }] },
  tv: { name: "TV", opts: [{ n: "None", none: true }, { n: "Stand", c: 0x2a2a2e }, { n: "Walnut", c: 0x5a3f2a }, { n: "White", c: 0xdedede }] },
  plant: { name: "Plant", opts: [{ n: "None", none: true }, { n: "Palm", c: 0x3a8a4a }, { n: "Fern", c: 0x5aa05a }, { n: "Cactus", c: 0x6a9a4a }] },
  table: { name: "Table", opts: [{ n: "None", none: true }, { n: "Wood", c: 0x7a5a3a }, { n: "Black", c: 0x2a2a2e }, { n: "Glass", c: 0xbfd6e0 }] },
  art: { name: "Wall Art", opts: [{ n: "None", none: true }, { n: "Sunset", c: 0xff8a3a }, { n: "Ocean", c: 0x3a8ac0 }, { n: "Abstract", c: 0xc04a8a }, { n: "Forest", c: 0x3a7a4a }] },
  lamp: { name: "Lamp", opts: [{ n: "None", none: true }, { n: "Warm", c: 0xffd98a }, { n: "Cool", c: 0xbfe0ff }, { n: "Pink", c: 0xffb0d0 }] },
};
const swatchTexCol = { wood: 0x9a6e44, tile: 0xd9d9df, carpet: 0x7a3540, concrete: 0x9a9a9e };
function buildHome() {
  const d = state.decor;
  if (intWallMat) intWallMat.color.setHex(DECOR.wall.opts[d.wall].c);
  intFloor.material.map = FLOORTEX[DECOR.floor.opts[d.floor].tex]; intFloor.material.color.setHex(0xffffff); intFloor.material.needsUpdate = true;
  const opt = slot => DECOR[slot].opts[d[slot]];
  let o;
  o = opt("rug"); if (!o.none) { const rug = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshLambertMaterial({ color: o.c })); rug.rotation.x = -Math.PI / 2; rug.position.set(INT.x, 0.04, INT.z + 3.6); intProps.add(rug); }
  o = opt("sofa"); if (!o.none) { ib(4, 0.8, 1.6, -4, 0.5, 5, o.c); ib(4, 0.6, 0.5, -4, 1.05, 5.7, o.c); ib(0.5, 0.7, 1.6, -6, 0.7, 5, o.c); ib(0.5, 0.7, 1.6, -2, 0.7, 5, o.c); }
  o = opt("table"); if (!o.none) { ib(2.2, 0.12, 1.1, -4, 0.5, 2.6, o.c); ib(0.15, 0.5, 0.15, -4.9, 0.25, 2.1, o.c); ib(0.15, 0.5, 0.15, -3.1, 0.25, 3.1, o.c); }
  o = opt("tv"); if (!o.none) { ib(2, 0.6, 1, 6, 0.4, 6.2, o.c); ib(3, 1.7, 0.18, 6, 1.6, 6.9, 0x121316); }
  o = opt("bed"); if (!o.none) { ib(3.6, 0.5, 2.4, 7, 0.4, 1.5, 0x6a5a44); ib(3.6, 0.35, 2.4, 7, 0.72, 1.5, o.c); ib(3.6, 0.3, 0.6, 7, 0.95, 0.5, 0xf2efe6); }
  o = opt("plant"); if (!o.none) { ib(0.55, 0.8, 0.55, 8.6, 0.4, -5, 0x8a5a36); ib(0.9, 1.1, 0.9, 8.6, 1.3, -5, o.c); }
  o = opt("art"); if (!o.none) { ib(2.6, 1.5, 0.1, 0, 2.5, 7.7, 0x2a2218); ib(2.3, 1.25, 0.06, 0, 2.5, 7.74, o.c); }
  o = opt("lamp"); if (!o.none) { ib(0.18, 1.9, 0.18, 8.6, 0.95, 6, 0x2a2a30); ib(0.8, 0.55, 0.8, 8.6, 2.0, 6, 0xf0ead8); intProps.add((() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: o.c })); m.position.set(INT.x + 8.6, 1.95, INT.z + 6); return m; })()); }
}
function themeOf(name) {
  const n = (name || "").toUpperCase();
  if (n.includes("BOWL")) return "bowling";
  if (n.includes("AMMO")) return "armory";
  if (n.includes("BARBER") || n.includes("CUT") || n.includes("FADE")) return "barber";
  if (n.includes("THREAD") || n.includes("BOUTIQUE")) return "clothing";
  if (n.includes("BURGER") || n.includes("PIZZA") || n.includes("DOG")) return "food";
  if (n.includes("CLUB")) return "club";
  if (n.includes("HOSPITAL")) return "hospital";
  if (n.includes("GARAGE")) return "garage";
  if (n.includes("DEPOT")) return "warehouse";
  if (n.includes("TAXI") || n.includes("MARINA") || n.includes("WASH")) return "office";
  if (n.includes("HOUSE") || n.includes("CONDO") || n.includes("APART") || n.includes("HOME")) return "home";
  return "shop";
}
function setSpriteText(sp, text) {
  const t = textSprite(text, "#fff", "rgba(20,20,24,.9)", 16, 4, 0);
  if (sp.material.map) sp.material.map.dispose();
  sp.material.map = t.material.map; t.material.dispose();
}

// ---------- bowling alley mini-game (lives inside the bowling building) ----------
const bowlGroup = new THREE.Group(); bowlGroup.visible = false; scene.add(bowlGroup);
const bowlScore = textSprite("", "#fff", "rgba(20,20,30,.92)", 16, 4, 0);
const bowl = { rolling: false, ball: null, bx: 0, bz: 0, pins: [], cd: 0 };
{
  const midZ = INT.z + 1;
  const lane = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 13), new THREE.MeshLambertMaterial({ map: woodTex }));
  lane.position.set(INT.x, 0.07, midZ); lane.receiveShadow = true; bowlGroup.add(lane);
  for (const sx of [-2.95, 2.95]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 13), new THREE.MeshLambertMaterial({ color: 0x2a2d33 })); g.position.set(INT.x + sx, 0.05, midZ); bowlGroup.add(g); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1a1f7a, metalness: 0.35, roughness: 0.22, envMapIntensity: 1 }));
  ball.castShadow = true; bowl.ball = ball; bowlGroup.add(ball);
  const pinGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.7, 10); pinGeo.translate(0, 0.35, 0);
  const pinMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rows = [[0], [-0.4, 0.4], [-0.8, 0, 0.8], [-1.2, -0.4, 0.4, 1.2]];
  const pz0 = INT.z + 5.0;
  rows.forEach((row, ri) => row.forEach(px => { const m = new THREE.Mesh(pinGeo, pinMat); m.castShadow = true; const x = INT.x + px, z = pz0 + ri * 0.5; m.position.set(x, 0.07, z); bowlGroup.add(m); bowl.pins.push({ mesh: m, x, z, down: false }); }));
  bowlScore.position.set(INT.x, 3.1, INT.z + 7.7); bowlGroup.add(bowlScore);
  for (let i = 0; i < 4; i++) {   // arcade cabinets along the side wall (decor for now)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.9), new THREE.MeshLambertMaterial({ color: [0xd2402f, 0x3f7fe8, 0x58b368, 0xc25cd6][i] }));
    cab.position.set(INT.x - 8.6, 1.0, INT.z - 4 + i * 1.7); cab.castShadow = true; bowlGroup.add(cab);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: 0x6fd0ff })); scr.position.set(INT.x - 8.05, 1.55, INT.z - 4 + i * 1.7); scr.rotation.y = Math.PI / 2; bowlGroup.add(scr);
  }
}
function resetPins() { for (const p of bowl.pins) { p.down = false; p.mesh.visible = true; p.mesh.rotation.set(0, 0, 0); p.mesh.position.set(p.x, 0.07, p.z); } }
function placeBall() { bowl.ball.position.set(clamp(player.x, INT.x - 2.3, INT.x + 2.3), 0.4, INT.z - 4.5); }
function bowlEnter() { bowl.rolling = false; bowl.cd = 0; resetPins(); placeBall(); setSpriteText(bowlScore, "🎳 Move onto the lane, then press BOWL"); }
function doBowl() {
  if (bowl.rolling || bowl.cd > 0) return;
  bowl.rolling = true; bowl.bx = clamp(player.x, INT.x - 3.4, INT.x + 3.4); bowl.bz = INT.z - 4.5;
  bowl.ball.position.set(bowl.bx, 0.4, bowl.bz); AudioSys.play("door", 0.4); buzz(12);
}
function updateBowling(dt) {
  if (bowl.cd > 0) bowl.cd -= dt;
  if (!bowl.rolling) { if (bowl.cd <= 0) placeBall(); return; }
  bowl.bz += 19 * dt; bowl.ball.position.set(bowl.bx, 0.4, bowl.bz); bowl.ball.rotation.x -= 56 * dt;
  if (bowl.bz >= INT.z + 4.9) {
    bowl.rolling = false; bowl.cd = 2.6;
    const gutter = Math.abs(bowl.bx - INT.x) > 2.35;
    if (!gutter) {
      bowl.pins.forEach(p => { if (!p.down && Math.abs(p.x - bowl.bx) < 0.9) p.down = true; });
      for (let pass = 0; pass < 3; pass++) bowl.pins.forEach(p => { if (p.down) return; for (const q of bowl.pins) if (q.down && Math.abs(q.x - p.x) < 0.82 && Math.abs(q.z - p.z) < 1.5 && Math.random() < 0.72) { p.down = true; break; } });
    }
    let down = 0; bowl.pins.forEach(p => { if (p.down) { down++; p.mesh.rotation.x = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; p.mesh.position.y = 0.16; } });
    const strike = down === 10, reward = earn(down * 40 + (strike ? 400 : 0));
    setSpriteText(bowlScore, gutter ? "🎳 Gutter ball! $0" : strike ? "🎳 STRIKE!  +$" + reward : "🎳 " + down + " pins!  +$" + reward);
    if (strike) { AudioSys.play("jingle", 0.8); flash("#ffd166", 0.3); addShake(0.25); } else AudioSys.play("cash", 0.6);
    buzz(20); save();
    setTimeout(() => { if (inside && intTheme === "bowling") { resetPins(); setSpriteText(bowlScore, "🎳 Press BOWL"); } }, 2600);
  }
}

// ---------- arcade cabinets — moved to arcade.js (initArcade is called after the save/state section) ----------
const arcadeBtn = dom("arcadebtn");
const nearCabinet = () => inside && intTheme === "bowling" && player.x < INT.x - 5;
arcadeBtn.addEventListener("click", () => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen || styleOpen || arcadeOpen) return;
  if (nearCabinet()) openArcade(ARC_BY_CAB[clamp(Math.round((player.z - (INT.z - 4)) / 1.7), 0, 3)]);
});

function snapCam() { const d = inside ? 4.5 : 9, hh = inside ? 6 : 4.4; camYaw = player.h; camPos.set(player.x - Math.sin(player.h) * d, player.y + hh, player.z - Math.cos(player.h) * d); }
function enterBuilding(e) {
  if (driving || inside) return;
  intReturn = { x: player.x, z: player.z, h: player.h };
  inside = true; intLight.intensity = 1.2;
  player.x = INT.x; player.z = INT.z + 0.5; player.h = 0; player.speed = 0;   // mid-room, facing the counter
  intTheme = themeOf(e.name); buildInterior(intTheme);
  setSpriteText(intSign, e.name); snapCam(); AudioSys.play("door", 0.7);
}
function exitBuilding() {
  if (!inside) return;
  inside = false; intLight.intensity = 0;
  player.x = intReturn.x; player.z = intReturn.z; player.h = intReturn.h; player.speed = 0;
  snapCam(); AudioSys.play("door", 0.6);
}
const nearEnterable = () => {
  if (driving || inside) return null;
  for (const e of ENTERABLES) if (dist2(player.x, player.z, e.x, e.z) < e.r) return e;
  return null;
};

// ---------- blob shadows (one instanced draw) ----------
const SHADOW_N = 1 + cars.length + traffic.length + police.length + npcs.length + 3;
// soft radial falloff so contact shadows read as ambient occlusion, not flat discs
const shadowTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  for (let r = c; r > 0; r--) { const t = 1 - r / c; ctx.globalAlpha = t * t * 0.85; ctx.beginPath(); ctx.arc(c, c, r, 0, 7); ctx.fillStyle = "#000"; ctx.fill(); }
}, 1, 1);
const shadowGeo = new THREE.PlaneGeometry(2, 2);
shadowGeo.rotateX(-Math.PI / 2);
const shadowIM = new THREE.InstancedMesh(shadowGeo,
  new THREE.MeshBasicMaterial({ color: 0x2a2218, map: shadowTex, transparent: true, opacity: 0.42, depthWrite: false }), SHADOW_N);
scene.add(shadowIM);

// ---------- skid marks (rubber laid on the asphalt while sliding; one instanced ring buffer) ----------
const SKID_MAX = 260;
const skidTex = canvasTex(32, (ctx, s) => {     // soft-edged streak, dark in the middle, fading at the sides
  ctx.clearRect(0, 0, s, s);
  for (let x = 0; x < s; x++) { const e = 1 - Math.abs(x / s - 0.5) * 2; ctx.globalAlpha = Math.pow(e, 0.7) * 0.6; ctx.fillStyle = "#000"; ctx.fillRect(x, 0, 1, s); }
}, 1, 1);
const skidGeo = new THREE.PlaneGeometry(0.32, 1.7); skidGeo.rotateX(-Math.PI / 2);
const skidIM = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ map: skidTex, transparent: true, opacity: 0.55, depthWrite: false }), SKID_MAX);
skidIM.frustumCulled = false; skidIM.count = SKID_MAX;
{ const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SKID_MAX; i++) skidIM.setMatrixAt(i, m); skidIM.instanceMatrix.needsUpdate = true; }
scene.add(skidIM);
let skidHead = 0;
const _skP = new THREE.Vector3(), _skQ = new THREE.Quaternion(), _skS = new THREE.Vector3(1, 1, 1), _skM = new THREE.Matrix4(), _skUp = new THREE.Vector3(0, 1, 0);
function layStreak(x, z, h) {
  _skP.set(x, 0.07, z); _skQ.setFromAxisAngle(_skUp, h); _skM.compose(_skP, _skQ, _skS);
  skidIM.setMatrixAt(skidHead, _skM); skidHead = (skidHead + 1) % SKID_MAX;
  skidIM.instanceMatrix.needsUpdate = true;
}

// ---------- juice: particles (1 draw call), screen shake, haptics, flash ----------
const PMAXN = 340;
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
function addShake(v) { shake = Math.min(2.0, shake + v); }
// hit-stop: briefly freeze the sim on big impacts so hits land with weight (classic "impact freeze")
let hitStop = 0;
function freezeFrame(s) { hitStop = Math.max(hitStop, s); }
// directional camera punch (recoil / blast kick) — distinct from the random shake noise
const camKick = new THREE.Vector3();
function kickCam(x, y, z) { camKick.x += x; camKick.y += y; camKick.z += z; }
function buzz(p) { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }
const elFlash = dom("flash");
function flash(color, a) { elFlash.style.background = color; elFlash.style.opacity = a; setTimeout(() => { elFlash.style.opacity = 0; }, 60); }

// car headlights + taillights (one additive point cloud, lit only at night)
const LIGHT_CARS = [...cars, ...traffic, ...police];
const HLN = LIGHT_CARS.length * 4;
const hlPos = new Float32Array(HLN * 3).fill(-9999), hlCol = new Float32Array(HLN * 3);
const hlGeo = new THREE.BufferGeometry();
hlGeo.setAttribute("position", new THREE.BufferAttribute(hlPos, 3));
hlGeo.setAttribute("color", new THREE.BufferAttribute(hlCol, 3));
const hlPoints = new THREE.Points(hlGeo, new THREE.PointsMaterial({
  size: 3.2, map: partTex, vertexColors: true, transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
}));
hlPoints.frustumCulled = false; scene.add(hlPoints);
function updateCarLights(g) {
  let k = 0;
  for (const c of LIGHT_CARS) {
    const active = (c.active === undefined || c.active) && !c.locked;   // unowned showroom cars stay dark
    const headOn = active && g > 0.01;                                  // headlights: at night
    const isBraking = active && (c.braking || (c === driving && braking()));
    const tailG = Math.max(g * 0.7, isBraking ? 1.0 : 0);               // brake lights flare red even by day
    const tailOn = active && tailG > 0.02;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    const cy = (c.mesh ? c.mesh.position.y : 0) + 0.85;
    for (let s = -1; s <= 1; s += 2) {   // headlights (front, warm)
      hlPos[k * 3] = headOn ? c.x + fx * 2.4 + rx * 0.6 * s : -9999; hlPos[k * 3 + 1] = cy; hlPos[k * 3 + 2] = c.z + fz * 2.4 + rz * 0.6 * s;
      hlCol[k * 3] = 0.95 * g; hlCol[k * 3 + 1] = 0.88 * g; hlCol[k * 3 + 2] = 0.6 * g; k++;
    }
    for (let s = -1; s <= 1; s += 2) {   // taillights / brake lights (rear, red)
      hlPos[k * 3] = tailOn ? c.x - fx * 2.4 + rx * 0.6 * s : -9999; hlPos[k * 3 + 1] = cy; hlPos[k * 3 + 2] = c.z - fz * 2.4 + rz * 0.6 * s;
      hlCol[k * 3] = tailG; hlCol[k * 3 + 1] = tailG * 0.09; hlCol[k * 3 + 2] = tailG * 0.06; k++;
    }
  }
  hlGeo.attributes.position.needsUpdate = true; hlGeo.attributes.color.needsUpdate = true;
}
// player headlight beams: two flat fans spilling forward onto the road, only while driving at night
const headBeams = new THREE.Group(); headBeams.visible = false;
{
  const bGeo = new THREE.ConeGeometry(2.2, 11, 14, 1, true); bGeo.rotateX(-Math.PI / 2); bGeo.translate(0, 0, 11 / 2);   // apex at the headlights, fanning FORWARD (+z = the car's facing)
  const bMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  headBeams.userData.mat = bMat;
  for (const s of [-1, 1]) { const b = new THREE.Mesh(bGeo, bMat); b.position.x = s * 0.7; b.scale.y = 0.16; headBeams.add(b); }
  scene.add(headBeams);
}
function updateHeadBeams(g) {
  const on = !!driving && g > 0.04;
  headBeams.visible = on;
  if (!on) return;
  headBeams.userData.mat.opacity = 0.12 + g * 0.18;
  const fx = Math.sin(driving.h), fz = Math.cos(driving.h);
  headBeams.position.set(driving.x + fx * 2.6, 0.12, driving.z + fz * 2.6);
  headBeams.rotation.y = driving.h;
}

// nearby traffic headlight beams at night — a small pool reused for the closest cars, so the
// night world has real light shafts spilling across the road without a cone per vehicle.
const TBEAMS = 14, TBEAM_R2 = 9000;
const trafBeams = new THREE.Group(); trafBeams.visible = false; scene.add(trafBeams);
{
  const bGeo = new THREE.ConeGeometry(2.0, 9, 12, 1, true); bGeo.rotateX(-Math.PI / 2); bGeo.translate(0, 0, 9 / 2);   // apex at the headlights, fanning FORWARD
  for (let i = 0; i < TBEAMS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const g = new THREE.Group(); g.userData.mat = mat; g.visible = false;
    for (const s of [-1, 1]) { const b = new THREE.Mesh(bGeo, mat); b.position.x = s * 0.6; b.scale.y = 0.15; g.add(b); }
    trafBeams.add(g);
  }
}
const _tbCand = [];
function updateTrafficBeams(g) {
  const on = g > 0.04;
  trafBeams.visible = on;
  if (!on) return;
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  _tbCand.length = 0;
  for (const c of LIGHT_CARS) {
    if (c === driving || c.dead) continue;
    if (!((c.active === undefined || c.active) && !c.locked)) continue;   // dark showroom cars don't beam
    const dd = dist2(c.x, c.z, px, pz);
    if (dd < TBEAM_R2) _tbCand.push([dd, c]);
  }
  _tbCand.sort((a, b) => a[0] - b[0]);
  const op = 0.10 + g * 0.16;
  for (let i = 0; i < TBEAMS; i++) {
    const slot = trafBeams.children[i], e = _tbCand[i];
    if (!e) { slot.visible = false; continue; }
    const c = e[1];
    slot.visible = true;
    slot.userData.mat.opacity = op * clamp(1 - e[0] / TBEAM_R2, 0.2, 1);
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    slot.position.set(c.x + fx * 2.6, (c.mesh ? c.mesh.position.y : 0) + 0.5, c.z + fz * 2.6);
    slot.rotation.y = c.h;
  }
}

// ---------- markers ----------
function makeMarker(color) {
  // a subtle flat ground ring at the objective (no tall light-beam pillar in the road)
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.6, 30),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  return { group: g, ring };
}
const missionMarker = makeMarker(0xffd166);
const sideMarker = makeMarker(0xff8c42);

// ---------- businesses ----------
const BIZ = [
  { id: "dogs", cost: 500, rate: 30, x: Bc(2) + 28, z: Bc(2) + 28, ly: 4.6, tips: 0 },
  { id: "wash", cost: 2000, rate: 90, x: Bc(1) + 32, z: Bc(3), ly: 4.6, tips: 0 },
  { id: "burger", cost: 5000, rate: 220, x: Bc(4) - 32, z: Bc(2), ly: 4.6, tips: 0 },
  { id: "club", cost: 10000, rate: 500, x: Bc(5) - 32, z: Bc(0) + 18, ly: 4.6, tips: 0 },
  { id: "taxi", cost: 3500, rate: 150, x: Bc(2), z: 110, ly: 4.6, tips: 0 },
  { id: "marina", cost: 15000, rate: 700, x: Bc(5), z: 196, ly: 4.6, tips: 0 },
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
  const palmGot = earn(PALM_REWARD);
  burst(PALMS[i][0], CURB + 1.5, PALMS[i][1], 16, 1.3, 2.6, 0.6, 0.95, 0.78, 0.22);   // gold sparkle
  buzz(15);
  if (palmsGot() === PALMS.length) { toast(STR.palmsAll(earn(PALM_ALL_BONUS))); flash("#ffe24a", 0.5); buzz([0, 40, 30, 40, 30, 90]); }
  else toast(STR.palmGot(palmGot));
  AudioSys.play("cash", 0.9);
  save();
}

// ---------- game state / save ----------
const SAVE_KEY = "sunset_city_save_v1"; // legacy key kept so pre-rename progress survives
const state = {
  money: 25,
  owned: {},
  cars: {},              // owned personal cars: pid -> chosen paint color (hex)
  mods: {},              // pid -> [engine, turbo, tyres] upgrade levels
  palms: [],
  bestJump: 0,
  races: {},             // best lap per circuit id (seconds)
  medals: {},            // best medal tier per circuit id (1 bronze / 2 silver / 3 gold)
  maxMoney: 0,           // high-water cash mark (for the Tycoon achievement)
  bestRampage: 0,        // best-ever banked rampage score (the chase-the-record hook)
  bossWins: 0,           // times the rival nemesis boss has been toppled
  busts: 0,              // crooks busted (vigilante)
  rescues: 0,            // patients delivered (paramedic)
  home: false,           // owns the central condo (legacy "home" flag)
  house: false,          // owns the suburban house
  apt: false,            // owns the apartment in the rough quarter
  outfit: -1,            // chosen wardrobe outfit (index, -1 = default)
  haircut: -1,           // chosen haircut (index, -1 = default)
  jacket: 0, hat: 0, glasses: 0, beard: 0,   // accessory indices (0 = None)
  weapon: null, ammo: {},   // equipped weapon index + owned ammo per weapon id
  decor: { wall: 0, floor: 2, sofa: 1, bed: 1, rug: 1, tv: 1, plant: 1, table: 1, art: 1, lamp: 1 },   // apartment furnishings
  ach: [],               // unlocked achievement ids
  treasures: [],         // collected sunken-treasure dive spots (indices)
  mi: 0,                 // mission index; 8 = story complete
  xp: 0,                 // experience toward the next player level
  lvl: 1,                // player level (1..LVL_MAX); levels boost all earnings
  phase: "intro",        // intro | play
};
// One schema drives BOTH save() and load(). The old version was two hand-maintained twin lists —
// every new persistent field had to be added in both places by name, and forgetting one silently
// dropped that feature's progress on reload. Now a field is declared exactly once, here:
// { save: state value -> what's written, load: raw saved value -> restored state value }.
const _sfNum = { save: v => v || 0, load: v => v || 0 };
const _sfBool = { save: v => !!v, load: v => !!v };
const _sfObj = { save: v => v, load: v => v || {} };
const DECOR_DEFAULTS = Object.assign({}, state.decor);
const SAVE_FIELDS = {
  money: { save: v => Math.floor(v), load: v => v },
  owned: _sfObj, cars: _sfObj, mods: _sfObj, medals: _sfObj, ammo: _sfObj,
  palms: { save: v => v, load: v => v || [] },
  ach: { save: v => v, load: v => v || [] },
  treasures: { save: v => v, load: v => v || [] },
  races: { save: v => v, load: (v, d) => v || (d.bestRace ? { downtown: d.bestRace } : {}) },   // migrate single-circuit saves
  bestJump: _sfNum, maxMoney: _sfNum, bestRampage: _sfNum, bossWins: _sfNum, busts: _sfNum, rescues: _sfNum,
  jacket: _sfNum, hat: _sfNum, glasses: _sfNum, beard: _sfNum, mi: _sfNum,
  home: _sfBool, house: _sfBool, apt: _sfBool, jetpack: _sfBool,
  outfit: { save: v => v, load: v => v == null ? -1 : v },
  haircut: { save: v => v, load: v => v == null ? -1 : v },
  weapon: { save: v => v, load: v => v == null ? null : v },
  decor: { save: v => v, load: v => Object.assign({}, DECOR_DEFAULTS, v || {}) },
  xp: { save: v => Math.round(v || 0), load: v => v || 0 },
  lvl: { save: v => v || 1, load: v => v || 1 },
};
function save() {
  state.maxMoney = Math.max(state.maxMoney || 0, Math.floor(state.money));
  const out = { v: 1 };
  for (const k in SAVE_FIELDS) out[k] = SAVE_FIELDS[k].save(state[k]);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(out)); } catch (e) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.v === 1) {
      for (const k in SAVE_FIELDS) state[k] = SAVE_FIELDS[k].load(d[k], d);
      recalcLvlMult();
      for (const k in state.owned) if (state.owned[k] === true) state.owned[k] = 1; // pre-upgrade saves
      return true;
    }
  } catch (e) {}
  return false;
}
const hasSave = !!localStorage.getItem(SAVE_KEY);
initArcade({ earn, save, state, buzz });   // arcade mini-games need the economy + haptics hooks

// ---------- player level / XP ----------
// A single progression spine the whole economy feeds: every payout grants XP, and each
// level permanently lifts all earnings (lvlMult), so the player visibly climbs past "level 1".
const LVL_MAX = 30;
const xpNeed = l => Math.round(80 + (l - 1) * 70);   // XP to go from level l -> l+1
let lvlMult = 1;                                      // earnings multiplier granted by level
function recalcLvlMult() { lvlMult = 1 + (Math.max(1, state.lvl) - 1) * 0.03; } // +3%/level
function addXP(n) {
  if (!n || state.lvl >= LVL_MAX) return;
  state.xp += n;
  let leveled = false;
  while (state.lvl < LVL_MAX && state.xp >= xpNeed(state.lvl)) {
    state.xp -= xpNeed(state.lvl);
    state.lvl++;
    leveled = true;
    const bonus = state.lvl * 150;                    // a cash reward on every level-up
    state.money += bonus;
    recalcLvlMult();
    toast(STR.levelUp(state.lvl, bonus));
    AudioSys.play("jingle", 0.9); flash("#7ad1ff", 0.45); buzz([0, 40, 30, 60]);
  }
  if (state.lvl >= LVL_MAX) state.xp = 0;             // capped: no dangling progress bar
  if (leveled) { refreshAch(true); save(); }
}
// Central payout: scales a base reward by the level multiplier, banks it, and awards XP.
// Returns the actual (boosted) amount so callers can show the real number in toasts.
function earn(base) {
  const g = Math.round(base * lvlMult);
  state.money += g;
  addXP(Math.max(1, Math.round(base / 8)));
  return g;
}

function applyOwnership() {
  for (const b of BIZ) if (state.owned[b.id]) markOwned(b);
  for (const i of state.palms) if (i >= 0 && i < palmCollected.length) palmCollected[i] = true;
  for (const c of cars) if (c.personal && state.cars[c.pid] != null) unlockCar(c, state.cars[c.pid]);
  for (const c of cars) if (c.personal) applyMods(c);
  for (const pr of PROPS) if (state[pr.flag]) markPropOwned(pr);
  if (state.outfit >= 0) applyOutfit(state.outfit, true);
  if (state.haircut >= 0) applyHaircut(state.haircut, true);
  applyJacket(state.jacket || 0, true); applyHat(state.hat || 0, true); applyGlasses(state.glasses || 0, true); applyBeard(state.beard || 0, true);
}
function unlockCar(c, color) {
  c.locked = false;
  c.mesh.material.color.setHex(color);
  if (c.sale) c.sale.visible = false;
}
const MOD_MAX = 3;
const modCost = lvl => 800 * (lvl + 1);   // cost to buy the next level from the current one
function applyMods(c) {
  const m = state.mods[c.pid] || [0, 0, 0];
  c.top = c.baseTop * (1 + m[0] * 0.12);
  c.accel = c.baseAccel * (1 + m[1] * 0.12);
  c.turn = c.baseTurn * (1 + m[2] * 0.07);
}
function buyMod(c, track) {
  if (!c || c.locked) return;
  const m = state.mods[c.pid] || (state.mods[c.pid] = [0, 0, 0]);
  if (m[track] >= MOD_MAX) return;
  const cost = modCost(m[track]);
  if (state.money < cost) { toast(STR.needMore(cost - Math.floor(state.money))); return; }
  state.money -= cost; m[track]++;
  applyMods(c);
  AudioSys.play("cash"); buzz(12);
  toast(STR.modBought(STR.mods[["engine", "turbo", "grip"][track]], m[track]));
  save();
  renderShowroom();
}

// ---------- apartment (buyable home + rest to pass time) ----------
const nearProp = () => {
  if (driving) return null;
  for (const pr of PROPS) if (dist2(player.x, player.z, pr.x, pr.z) < 25) return pr;
  return null;
};
function markPropOwned(pr) {
  pr.sign.material.map.dispose();
  const sp = textSprite(pr.ownLabel || STR.propOwned(pr.label), "#fff", "rgba(90,150,90,.92)", 16, 4, 0);
  pr.sign.material.map = sp.material.map; sp.material.dispose();
}
function buyProp(pr) {
  if (state.money < pr.cost) { toast(STR.needMore(pr.cost - Math.floor(state.money))); return; }
  state.money -= pr.cost; state[pr.flag] = true; markPropOwned(pr);
  toast(STR.propBought(pr.label)); AudioSys.play("jingle", 0.9); flash("#9fe6a0", 0.3); buzz(20); save();
}
function restAtHome() { simTime += 120; toast(STR.rested); AudioSys.play("door", 0.6); save(); }
const ownsAnyProp = () => state.home || state.house || state.apt;
const homeSpawn = () => { for (const pr of PROPS) if (state[pr.flag]) return pr; return null; };

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
  return Math.round(s * lvlMult);                       // player level lifts business income too
}

// ---------- missions ----------
const M = STR.missions;
const MISSIONS = [
  { reward: 100, steps: [{ x: PLAZA.x, z: PLAZA.z + 11, r: 4 }] },
  { reward: 150, steps: [{ x: Bc(1) + 18, z: Bc(2) + 4, r: 4 }, { x: 44, z: -100, r: 4 }] },
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
  toast(STR.reward(earn(MISSIONS[i].reward)));
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
      toast(STR.sideJobDone + "  " + STR.reward(earn(sideReward())));
      AudioSys.play("cash");
      side = { stage: "pickup" };
      save();
    }
  }
}

// ---------- street races (freeplay) ----------
// Multiple circuits, each with its own checkered start gate, time limit, reward and best lap.
const CIRCUITS = [
  { id: "downtown", start: { x: Rc(2), z: Rc(4) }, limit: 52, reward: 500,
    cps: [[Rc(4), Rc(4)], [Rc(4), Rc(2)], [Rc(2), Rc(2)], [Rc(2), Rc(4)]] },
  { id: "outer", start: { x: Rc(1), z: Rc(1) }, limit: 72, reward: 800,
    cps: [[Rc(5), Rc(1)], [Rc(5), Rc(5)], [Rc(1), Rc(5)], [Rc(1), Rc(1)]] },
  { id: "harbor", start: { x: Rc(4), z: Rc(3) }, limit: 42, reward: 400,
    cps: [[Rc(6), Rc(3)], [Rc(6), Rc(5)], [Rc(4), Rc(5)], [Rc(4), Rc(3)]] },
  // water circuit: grab a jet ski (or boat) and slalom the coast — the start line floats by the rental skis
  { id: "wake", water: true, start: { x: 34, z: SEA_Z + 16 }, limit: 58, reward: 900,
    cps: [[-80, SEA_Z + 45], [-190, SEA_Z + 95], [-40, SEA_Z + 140], [130, SEA_Z + 95], [210, SEA_Z + 45], [34, SEA_Z + 16]] },
];
const RACE_BEST_BONUS = 300, RACE_CP_R = 9;
const MEDAL_BONUS = [0, 200, 500, 1000];   // bronze / silver / gold cash on first reaching a tier
const medalFor = (C, t) => t <= C.limit * 0.5 ? 3 : t <= C.limit * 0.65 ? 2 : t <= C.limit * 0.82 ? 1 : 0;
const goldTime = C => C.limit * 0.5;
let race = { stage: "idle", ci: -1, cp: 0, t: 0, armed: true };  // idle | active
{
  // flat checkered start line painted on the road — no overhead gate spanning the street
  const checkTex = canvasTex(64, (ctx, s) => {
    const n = 8, c = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { ctx.fillStyle = ((x + y) & 1) ? "#f4f4f4" : "#14141a"; ctx.fillRect(x * c, y * c, c, c); }
  });
  const padGeo = new THREE.PlaneGeometry(7, 2.4); padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshLambertMaterial({ map: checkTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const C of CIRCUITS) {
    const m = new THREE.Mesh(padGeo, padMat);
    m.position.set(C.start.x, C.water ? 0.14 : CURB + 0.05, C.start.z);
    scene.add(m);
  }
}
// build the neon glow cloud at landmark/sign positions (declared near the sky setup)
{
  const NEON = { club: [0.95, 0.35, 0.9], dogs: [0.95, 0.7, 0.3], wash: [0.4, 0.7, 0.95],
    burger: [0.95, 0.45, 0.3], taxi: [0.95, 0.82, 0.3], marina: [0.4, 0.8, 0.85] };
  const pts = [];   // [x, y, z, r, g, b]
  for (const b of BIZ) { const c = NEON[b.id] || [0.9, 0.8, 0.5]; pts.push([b.x, b.ly + 1, b.z, c[0], c[1], c[2]]); }
  pts.push([PLAZA.x, 3.4, PLAZA.z, 0.7, 0.85, 0.95]);                 // fountain
  pts.push([GARAGE.x, 5, GARAGE.z, 0.4, 0.85, 0.95]);                 // garage sign
  for (const C of CIRCUITS) pts.push([C.start.x, 0.6, C.start.z, 0.9, 0.9, 0.95]);     // race start lines (ground glow)
  for (const lh of lampHeads) pts.push([lh[0], lh[1], lh[2], 0.5, 0.4, 0.18]);         // street-lamp halos
  const gpos = new Float32Array(pts.length * 3);
  glowBase = new Float32Array(pts.length * 3);
  glowCol = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    gpos[i * 3] = p[0]; gpos[i * 3 + 1] = p[1]; gpos[i * 3 + 2] = p[2];
    glowBase[i * 3] = p[3]; glowBase[i * 3 + 1] = p[4]; glowBase[i * 3 + 2] = p[5];
  });
  glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute("position", new THREE.BufferAttribute(gpos, 3));
  glowGeo.setAttribute("color", new THREE.BufferAttribute(glowCol, 3));
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
    size: 13, map: partTex, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  glow.frustumCulled = false;
  scene.add(glow);
}
// sky detail clouds + stars (reuse the soft particle sprite; updated by setSky/the day-night cycle)
{
  const SN = 950, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const a = rng() * Math.PI * 2, e = 0.12 + rng() * 0.82, r = 660;
    sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  starPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.3, map: partTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  starPts.frustumCulled = false; skyGroup.add(starPts);

  // puffy clouds: each cloud is a cluster of overlapping soft puffs
  const CLOUDS = 44, PUFFS = 9;
  cloudN = CLOUDS * PUFFS; cloudPos = new Float32Array(cloudN * 3); cloudBase = new Float32Array(cloudN);
  let ci = 0;
  for (let c = 0; c < CLOUDS; c++) {
    const cx0 = rr(-660, 660), cy0 = rr(140, 300), cz0 = rr(-600, 600), spread = rr(0.7, 1.5);
    for (let p = 0; p < PUFFS; p++) {
      const x = cx0 + rr(-70, 70) * spread;
      cloudBase[ci] = x; cloudPos[ci * 3] = x; cloudPos[ci * 3 + 1] = cy0 + rr(-14, 14); cloudPos[ci * 3 + 2] = cz0 + rr(-50, 50) * spread;
      ci++;
    }
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.BufferAttribute(cloudPos, 3));
  cloudPts = new THREE.Points(cg, new THREE.PointsMaterial({ size: 180, map: partTex, color: 0xfff2e0, transparent: true, opacity: 0.5, depthWrite: false, fog: false, sizeAttenuation: true }));
  cloudPts.frustumCulled = false; skyGroup.add(cloudPts);
}

// ---------- weather — moved to weather.js ----------
initWeather({ scene, sun, hemi, roadMat, sidewalkMat });   // also seeds the rain streaks (consumes the seeded RNG here, same order as before)


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
      const tier = medalFor(C, time), prevTier = state.medals[C.id] || 0;
      const newMedal = tier > prevTier;
      if (newMedal) { state.medals[C.id] = tier; reward += MEDAL_BONUS[tier]; }
      reward = earn(reward);
      toast(newMedal ? STR.medalGot(STR.circuits[C.id].name, tier) + STR.reward(reward)
                     : (isBest ? STR.raceBest(reward, time) : STR.raceWin(reward, time)));
      AudioSys.play("jingle", 0.9);
      addShake(0.4); buzz([0, 30, 30, 30, 30, 90]); flash("#ffe9a0", 0.4);
      burst(px, 0.4, pz, 18, 2.0, 2.6, 0.7, 0.9, 0.78, 0.3);
      race.stage = "idle"; race.armed = false;
      save();
    } else { AudioSys.play("cash", 0.5); burst(cp[0], 0.4, cp[1], 8, 1.4, 2.2, 0.5, 0.4, 0.7, 0.9); buzz(12); }
  }
}

// ---------- vigilante: chase down a fleeing crook (freeplay) ----------
const crook = { mesh: makeCar(0x5a2e2e), active: false, t: 0, cd: 25, x: 0, z: 0, h: 0 };
crook.mesh.position.set(0, -9999, 0);
const crookMarker = makeMarker(0xff3b3b);
crookMarker.group.visible = false;
function updateVigilante(dt) {
  if (state.mi < M.length || dlgLines) { crookMarker.group.visible = false; return; }   // freeplay only
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (!crook.active) {
    crookMarker.group.visible = false; crook.mesh.position.set(0, -9999, 0);
    crook.cd -= dt;
    if (crook.cd <= 0 && driving && race.stage !== "active" && medic.stage === "idle") {
      const ang = Math.random() * Math.PI * 2;
      crook.x = clamp(px + Math.cos(ang) * 44, -HALF + 5, HALF - 5);
      crook.z = clamp(pz + Math.sin(ang) * 44, -HALF + 5, HALF - 5);
      crook.h = Math.atan2(crook.x - px, crook.z - pz); crook.active = true; crook.t = 42;
      toast(STR.crookSpotted); AudioSys.play("horn", 0.5);
    }
    return;
  }
  crook.t -= dt;
  const dx = crook.x - px, dz = crook.z - pz, d = Math.hypot(dx, dz) || 1;
  crook.h = lerpAngle(crook.h, Math.atan2(dx, dz), 1 - Math.exp(-3 * dt));   // flee from the player
  moveWithCollision(crook, Math.sin(crook.h) * 14 * dt, Math.cos(crook.h) * 14 * dt, 2.1);
  crook.mesh.position.set(crook.x, groundY(crook.x, crook.z), crook.z);
  crook.mesh.rotation.y = crook.h;
  crookMarker.group.visible = true;
  crookMarker.group.position.set(crook.x, groundY(crook.x, crook.z), crook.z);
  crookMarker.ring.scale.setScalar(1 + Math.sin(simTime * 4) * 0.13);
  if (driving && d < 5.5) {                                                  // rammed = busted
    const reward = 400 + (state.busts || 0) * 50;
    const got = earn(reward); state.busts = (state.busts || 0) + 1;
    toast(STR.crookBusted(got)); AudioSys.play("cash"); buzz([0, 40, 40, 80]);
    burst(crook.x, 0.6, crook.z, 16, 2, 2.2, 0.6, 0.95, 0.5, 0.2); addShake(0.4);
    crook.active = false; crook.cd = rr(35, 60); save();
    return;
  }
  if (crook.t <= 0 || d > 150) { crook.active = false; crook.cd = rr(35, 60); toast(STR.crookEscaped); }
}

// ---------- paramedic: rush a patient to the hospital (freeplay) ----------
const medic = { stage: "idle", cd: 35, t: 0, x: 0, z: 0 };
const medicMarker = makeMarker(0x44d0ff);
medicMarker.group.visible = false;
const patient = new THREE.Mesh(personGeo({ shirt: 0xedeff2, pants: 0x9aa0a8, skin: 0xe8b08a, hair: 0x3a2c20 }), matPerson);
patient.visible = false; scene.add(patient);
function updateParamedic(dt) {
  if (state.mi < M.length || dlgLines) { medicMarker.group.visible = false; patient.visible = false; return; }   // freeplay only
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  patient.visible = medic.stage === "pickup";
  if (medic.stage === "pickup") { patient.position.set(medic.x, CURB, medic.z); patient.rotation.y = simTime * 0.6; }
  if (medic.stage === "idle") {
    medicMarker.group.visible = false; medic.cd -= dt;
    if (medic.cd <= 0 && driving && race.stage !== "active" && !crook.active) {
      const ang = Math.random() * Math.PI * 2;
      medic.x = clamp(px + Math.cos(ang) * 55, -HALF + 6, HALF - 6);
      medic.z = clamp(pz + Math.sin(ang) * 55, -HALF + 6, HALF - 6);
      medic.stage = "pickup"; toast(STR.medicCall); AudioSys.play("horn", 0.4);
    }
    return;
  }
  const tgt = medic.stage === "pickup" ? medic : HOSPITAL;
  medicMarker.group.visible = true;
  medicMarker.group.position.set(tgt.x, groundY(tgt.x, tgt.z), tgt.z);
  medicMarker.ring.scale.setScalar(1 + Math.sin(simTime * 4) * 0.13);
  if (medic.stage === "pickup") {
    if (driving && dist2(px, pz, medic.x, medic.z) < 30) { medic.stage = "deliver"; medic.t = 38; toast(STR.medicAboard); AudioSys.play("door", 0.6); }
    return;
  }
  medic.t -= dt;
  if (medic.t <= 0) { medic.stage = "idle"; medic.cd = rr(30, 55); toast(STR.medicLost); return; }
  if (driving && dist2(px, pz, HOSPITAL.x, HOSPITAL.z) < 40) {
    const reward = 350 + (state.rescues || 0) * 45;
    const got = earn(reward); state.rescues = (state.rescues || 0) + 1;
    toast(STR.medicDelivered(got)); AudioSys.play("jingle", 0.8); flash("#9fe6a0", 0.25); buzz([0, 30, 30]);
    medic.stage = "idle"; medic.cd = rr(30, 55); save();
  }
}

// ---------- wanted level & police ----------
let wanted = 0, wantedCD = 0, crimeCD = 0;
let bustTimer = 0, copsOnYou = false;   // on-foot arrest timer + escape (broke-contact) tracking
let holdup = null, getaway = 0;         // active store holdup + clean-getaway bonus window
let job = null;                         // active on-demand phone job
// ---------- ragdoll physics — moved to ragdoll.js ----------
initRagdolls(scene, groundY);   // hand it the scene + ground height (groundY is hoisted from below)

// ---------- health / damage / respawn ----------
let health = 100, hurtCD = 0, hitCD = 0, fuel = 100, fuelWarned = false;
function hurt(amount) {
  if (health <= 0) return;
  health = Math.max(0, health - amount);
  hurtCD = 3; flash("#ff3b3b", Math.min(0.4, amount / 120)); addShake(0.22); buzz(20);
  if (health <= 0) wasted();
}
function wasted() {
  const fine = 100 + 60 * wanted;
  state.money = Math.max(0, state.money - fine);
  toast(STR.wasted(fine)); AudioSys.play("boom", 0.8); flash("#ff3b3b", 0.5); buzz([0, 80, 60, 140]);
  addShake(1.0); freezeFrame(0.12);
  if (!driving) {   // leave a tumbling corpse at the death spot (a throwaway clone — the real hero rig
    const corpse = articulatedPerson(HERO_PAL);          // teleports to respawn immediately below, unaffected)
    scene.add(corpse.group);
    const bh = player.h + Math.PI;
    spawnRagdoll(corpse, player.x, player.y, player.z, player.h,
      { vx: Math.sin(bh) * rrand(0.6, 1.8), vy: rrand(3, 5.5), vz: Math.cos(bh) * rrand(0.6, 1.8) }, "corpse");
  }
  if (driving) { driving.speed = 0; driving.lat = 0; driving = null; hero.group.visible = true; }
  const sp = homeSpawn() || PLAZA;                      // respawn at an owned property, else the plaza
  player.x = sp.x; player.z = sp.z + 12; player.y = CURB; player.speed = 0;
  health = 100; hurtCD = 2; fuel = 100;
  wanted = 0; wantedCD = 0; crimeCD = 0; bustTimer = 0; copsOnYou = false; holdup = null; getaway = 0;
  for (const p of police) { p.active = false; p.mesh.position.set(0, -9999, 0); }
  clearChaseUnits();
  // shake off the rival's hit-squad on death; if it was the showdown, the boss bows out for now
  for (const g of nemGoons) if (!g.boss) { g.alive = false; if (g.mesh) g.mesh.visible = false; }
  NEM.squadOut = false; NEM.squadCD = Math.max(NEM.squadCD, rr(12, 20));
  if (NEM.showdown) { NEM.showdown = false; NEM.flee = false; nemBoss.alive = false; if (nemBoss.mesh) nemBoss.mesh.visible = false; nemCar.active = false; nemCar.mesh.visible = false; showBossBar(false); NEM.grudge = 70; }
  save();
}
function heatActive() {
  const mis = MISSIONS[state.mi];
  return (mis && mis.race && mState === "active") ? 0 : wanted;   // no heat during the timed race
}
function registerCrime() {
  const mis = MISSIONS[state.mi];
  if (mis && mis.race && mState === "active") return;
  if (crimeCD > 0) { wantedCD = 14; return; }
  crimeCD = 1.5; wantedCD = 14;
  nemAddGrudge(3);                                      // every fresh crime stokes the rival boss's grudge
  if (wanted < 5) { wanted++; toast(STR.wantedToast(wanted)); }
}
function bust() {
  const fine = Math.round((100 + 80 * wanted) * (driving && driving.fineMult ? driving.fineMult : 1));
  state.money = Math.max(0, state.money - fine);
  toast(STR.busted(fine));
  AudioSys.play("door", 1);
  addShake(0.7); buzz([0, 60, 40, 120]); flash("#ff3b3b", 0.42);
  wanted = 0; wantedCD = 0; crimeCD = 0; bustTimer = 0; copsOnYou = false; holdup = null; getaway = 0;
  for (const p of police) { p.active = false; p.mesh.position.set(0, -9999, 0); }
  clearChaseUnits();
  save();
}
function clearChaseUnits() {
  chopper.active = false; chopper.dead = false; chopper.cd = 0; chopper.mesh.position.set(0, -9999, 0);
  tank.active = false; tank.dead = false; tank.cd = 0; tank.mesh.position.set(0, -9999, 0);
}
function updatePolice(dt) {
  if (crimeCD > 0) crimeCD -= dt;
  const heat = heatActive();
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  let nearestD = Infinity, grabbing = false;
  for (let i = 0; i < police.length; i++) {
    const p = police[i];
    const want = i < heat;
    if (want && !p.active) {
      const ang = Math.random() * Math.PI * 2;
      p.x = clamp(px + Math.cos(ang) * 72, -HALF + 3, HALF - 3);
      p.z = clamp(pz + Math.sin(ang) * 72, -HALF + 3, HALF - 3);
      p.h = Math.atan2(px - p.x, pz - p.z); p.speed = 0; p.active = true; p.shootCD = rr(0.6, 1.6);
    } else if (!want && p.active) {
      p.active = false; p.mesh.position.set(0, -9999, 0);
    }
    if (!p.active) continue;
    const dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz) || 1;
    if (d < nearestD) nearestD = d;
    p.h = lerpAngle(p.h, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
    const tgt = dlgLines ? 0 : 19 + heat * 1.2;   // higher stars = faster, scarier police
    p.speed += (tgt - p.speed) * Math.min(1, 3 * dt);
    moveWithCollision(p, Math.sin(p.h) * p.speed * dt, Math.cos(p.h) * p.speed * dt, 2.1);
    p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
    p.mesh.rotation.y = p.h;
    p.bar.material.emissive.setHex((Math.floor(simTime * 6) % 2) ? 0x2244ff : 0xff2222);
    if (!dlgLines && driving && d < 3.6 && hitCD <= 0) {   // PIT ram — drains your health in a car
      hitCD = 0.8; hurt(26);
    }
    if (!driving && d < 2.8) grabbing = true;               // close enough on foot to make the arrest
    // gunfire from 3 stars up: dangerous at range, far less accurate while you sprint or drive fast
    if (!dlgLines && heat >= 3 && d > 4 && d < 42) {
      p.shootCD -= dt;
      if (p.shootCD <= 0) {
        p.shootCD = rr(0.9, 1.7);
        burst(p.x + Math.sin(p.h) * 1.1, 1.3, p.z + Math.cos(p.h) * 1.1, 4, 0.5, 0.5, 0.14, 1.0, 0.86, 0.4);   // muzzle flash
        AudioSys.play("gun", 0.5);
        const fast = (driving ? Math.abs(driving.speed) : player.speed) > 6;
        if (Math.random() < clamp(0.5 - d * 0.009 - (fast ? 0.2 : 0), 0.05, 0.5)) hurt(driving ? 5 : 9);
      }
    }
  }
  updateChaseUnits(dt, heat, px, pz);   // chopper at 4★, tank at 5★
  // on-foot arrest: stay cornered by a cop for ~1.1s and you're BUSTED (lose cash, not your life)
  if (grabbing && !driving) { bustTimer += dt; if (bustTimer >= 1.1) { bustTimer = 0; bust(); return; } }
  else bustTimer = Math.max(0, bustTimer - dt * 2);
  // escape: heat only cools once you've broken contact with every cop (out-run / out-manoeuvre them)
  if (wanted > 0) {
    if (nearestD <= 60) { wantedCD = Math.max(wantedCD, 6); copsOnYou = true; }
    else {
      if (copsOnYou) { copsOnYou = false; toast("🚓 Shaking them — keep moving!"); }
      wantedCD -= dt * (driving && driving.heatMult ? driving.heatMult : 1);
      if (wantedCD <= 0) { wanted = Math.max(0, wanted - 1); wantedCD = 8; if (wanted === 0) toast(STR.wantedClear); }
    }
  }
}
// a tank shell blast: hurts you and nearby cars, but doesn't add to YOUR heat/combo (the cops did it)
function explodeShell(x, z) {
  burst(x, 1.0, z, 16, 1.2, 2.0, 0.15, 1.0, 0.9, 0.6);
  burst(x, 1.2, z, 30, 3.0, 4.0, 0.8, 1.0, 0.5, 0.15);
  burst(x, 1.5, z, 16, 2.0, 4.6, 1.2, 0.28, 0.28, 0.28);
  AudioSys.play("boom", 0.95); addShake(0.7); flash("#ff7a33", 0.3); freezeFrame(0.04);
  for (const c of traffic) if (!c.dead && dist2(c.x, c.z, x, z) < 36) explodeCar(c);
  const pd = dist2(player.x, player.z, x, z);
  if (pd < 49) hurt(driving ? 20 : Math.round(40 * (1 - Math.sqrt(pd) / 8)));
  for (const n of npcs) if (dist2(n.x, n.z, x, z) < 90) { n.flee = 3; n.h = Math.atan2(n.x - x, n.z - z); }
}
function damageChopper(dmg) {
  if (!chopper.active || chopper.dead) return;
  chopper.hp -= dmg;
  burst(chopper.x, chopper.y, chopper.z, 8, 1.4, 1.4, 0.4, 1.0, 0.7, 0.3);
  if (chopper.hp <= 0) {
    burst(chopper.x, chopper.y, chopper.z, 34, 2.6, 2.6, 0.9, 1.0, 0.55, 0.15);
    AudioSys.play("boom", 1.0); addShake(0.85); flash("#ff7a33", 0.34);
    const r = earn(2500); toast("🚁💥 CHOPPER DOWN  +$" + r); addChaos(120); buzz([0, 60, 40, 120]); save();
    chopper.active = false; chopper.dead = false; chopper.cd = rr(16, 24); chopper.mesh.position.set(0, -9999, 0);   // a beat before the next one scrambles
  }
}
function damageTank(dmg) {
  if (!tank.active || tank.dead) return;
  tank.hp -= dmg;
  burst(tank.x, 1.4, tank.z, 8, 1.4, 1.4, 0.4, 1.0, 0.7, 0.3);
  if (tank.hp <= 0) {
    burst(tank.x, 1.6, tank.z, 40, 3.0, 3.0, 1.0, 1.0, 0.55, 0.15);
    AudioSys.play("boom", 1.0); addShake(1.0); flash("#ff7a33", 0.4); freezeFrame(0.06);
    const r = earn(6000); toast("🪖💥 TANK DESTROYED  +$" + r); addChaos(200); buzz([0, 80, 50, 160]); save();
    tank.active = false; tank.dead = false; tank.cd = rr(22, 32); tank.mesh.position.set(0, -9999, 0);   // reinforcements take a while
  }
}
function updateChaseUnits(dt, heat, px, pz) {
  // ---- police chopper: summoned at 4★, orbits overhead with a spotlight, can only be downed by explosives ----
  const ch = chopper;
  if (ch.cd > 0) ch.cd -= dt;
  if (heat >= 4 && !ch.active && ch.cd <= 0) {
    ch.active = true; ch.leave = false; ch.dead = false; ch.hp = 100;
    const ang = Math.random() * Math.PI * 2;
    ch.x = px + Math.cos(ang) * 60; ch.z = pz + Math.sin(ang) * 60; ch.y = 36; ch.shootCD = rr(1.5, 3);
    toast("🚁 Police chopper inbound!"); AudioSys.play("blip", 0.7);
  }
  if (ch.active) {
    ch.leave = heat < 4;
    const dx = px - ch.x, dz = pz - ch.z, d = Math.hypot(dx, dz) || 1;
    const want = ch.leave ? 0 : 18, spd = ch.leave ? 26 : 14;
    ch.x += (dx / d) * clamp(d - want, -spd, spd) * dt * 0.9;
    ch.z += (dz / d) * clamp(d - want, -spd, spd) * dt * 0.9;
    if (!ch.leave) { ch.x += (-dz / d) * 6 * dt; ch.z += (dx / d) * 6 * dt; }   // orbit drift
    const ty = ch.leave ? 78 : 24 + Math.sin(simTime * 1.3) * 1.5;
    ch.y += (ty - ch.y) * Math.min(1, 1.6 * dt);
    ch.h = lerpAngle(ch.h, Math.atan2(dx, dz), 1 - Math.exp(-3 * dt));
    ch.mesh.position.set(ch.x, ch.y, ch.z);
    ch.mesh.rotation.y = ch.h;
    ch.rotor.rotation.y += 30 * dt;
    ch.beacon.visible = (Math.floor(simTime * 5) % 2) === 0;
    ch.spot.position.set(0, -ch.y / 2, 0); ch.spot.scale.y = ch.y;   // cone reaches from the chopper to the ground
    ch.spot.material.opacity = 0.04 + gNight * 0.22;                 // barely there by day, a real searchlight after dark
    if (!ch.leave && !dlgLines && d < 48) {
      ch.shootCD -= dt;
      if (ch.shootCD <= 0) {
        ch.shootCD = rr(1.4, 2.4); AudioSys.play("gun", 0.45);
        const fast = (driving ? Math.abs(driving.speed) : player.speed) > 6;
        burst(px + rr(-2, 2), 0.4, pz + rr(-2, 2), 6, 0.6, 0.6, 0.2, 1.0, 0.85, 0.4);
        if (Math.random() < (fast ? 0.18 : 0.4)) hurt(driving ? 5 : 8);
      }
    }
    if (ch.leave && ch.y > 64) { ch.active = false; ch.mesh.position.set(0, -9999, 0); }
  }
  // ---- army tank: summoned at 5★, slow and brutal, lobs explosive shells ----
  const tk = tank;
  if (tk.cd > 0) tk.cd -= dt;
  if (heat >= 5 && !tk.active && tk.cd <= 0) {
    tk.active = true; tk.dead = false; tk.hp = 240;
    const ang = Math.random() * Math.PI * 2;
    tk.x = clamp(px + Math.cos(ang) * 64, WB.x0 + 4, WB.x1 - 4);
    tk.z = clamp(pz + Math.sin(ang) * 64, WB.z0 + 4, WB.z1 - 4);
    tk.h = Math.atan2(px - tk.x, pz - tk.z); tk.speed = 0; tk.shootCD = rr(2.5, 4);
    toast("🪖 ARMY TANK deployed — RUN!"); AudioSys.play("boom", 0.5); buzz([0, 60, 40, 120]);
  }
  if (tk.active) {
    const leave = heat < 5;
    const dx = px - tk.x, dz = pz - tk.z, d = Math.hypot(dx, dz) || 1;
    tk.h = lerpAngle(tk.h, Math.atan2(dx, dz), 1 - Math.exp(-1.6 * dt));   // heavy, slow to turn
    const tgt = (leave || dlgLines) ? 0 : 9;
    tk.speed += (tgt - tk.speed) * Math.min(1, 1.5 * dt);
    moveWithCollision(tk, Math.sin(tk.h) * tk.speed * dt, Math.cos(tk.h) * tk.speed * dt, 2.4);
    tk.mesh.position.set(tk.x, groundY(tk.x, tk.z), tk.z);
    tk.mesh.rotation.y = tk.h;
    tk.turret.rotation.y = lerpAngle(tk.turret.rotation.y, Math.atan2(dx, dz) - tk.h, 1 - Math.exp(-2 * dt));
    if (!leave && !dlgLines && d < 72) {
      tk.shootCD -= dt;
      if (tk.shootCD <= 0) {
        tk.shootCD = rr(3.2, 4.6);
        AudioSys.play("boom", 0.7); addShake(0.4); kickCam(0, 0.2, 0);
        burst(tk.x + Math.sin(tk.h) * 3, 1.6, tk.z + Math.cos(tk.h) * 3, 8, 0.8, 0.8, 0.2, 1.0, 0.8, 0.4);
        const lead = Math.min(1, d / 60);   // a little inaccuracy at range keeps it survivable
        explodeShell(px + rr(-3, 3) * lead, pz + rr(-3, 3) * lead);
      }
    }
    if (leave && d > 130) { tk.active = false; tk.mesh.position.set(0, -9999, 0); }
  }
}
// ---------- melee: punch to fight back / take down crooks on foot ----------
let actP = false, punchCD = 0, punchT = 0, gunKickT = 0, kickT = 0, comboStep = 0, comboT = 0, hostileNear = false, punchBufferT = 0;
function doPunch() {
  if (driving) return;
  if (inside) { if (intTheme === "bowling") doBowl(); return; }   // BOWL inside the alley; no fists indoors
  if (swimming) { if (nearTreasure(player.x, player.z) >= 0) startDive(player.x, player.z); return; }   // dive a treasure spot; no combat in the water
  if (armed()) { doShoot(); return; }              // fire if a weapon is equipped, else throw a punch
  if (nearCourtPlay()) { doHoopShot(); return; }   // step onto the beach court unarmed -> shoot hoops instead of punching air
  if (punchCD > 0) return;
  // 3-hit combo: jab, jab, then a heavier finishing kick — landing hits inside the window advances it,
  // letting the window lapse resets back to the opening jab
  comboStep = comboT > 0 ? (comboStep + 1) % 3 : 0;
  comboT = 0.9;
  const isKick = comboStep === 2;
  punchCD = isKick ? 0.6 : 0.42; punchT = isKick ? 0 : 0.24; kickT = isKick ? 0.34 : 0;
  AudioSys.play("door", isKick ? 0.55 : 0.4); buzz(isKick ? 22 : 15);
  const fx = Math.sin(player.h), fz = Math.cos(player.h);
  const reach = isKick ? 1.7 : 1.4;
  const hx = player.x + fx * reach, hz = player.z + fz * reach;
  if (crook.active && dist2(player.x, player.z, crook.x, crook.z) < 10) {   // bust a crook on foot
    const reward = 400 + (state.busts || 0) * 50;
    const got = earn(reward); state.busts = (state.busts || 0) + 1;
    toast(STR.crookBusted(got)); AudioSys.play("cash"); buzz([0, 40, 40, 80]);
    burst(crook.x, 0.7, crook.z, 16, 2, 2.2, 0.6, 0.95, 0.5, 0.2); addShake(0.3);
    crook.active = false; crook.cd = rr(35, 60); save(); return;
  }
  let best = null, bd = isKick ? 7.5 : 6;
  for (const n of npcs) { if (n.ragdoll) continue; const d = dist2(hx, hz, n.x, n.z); if (d < bd) { bd = d; best = n; } }
  if (best) {
    best.flee = 1.6; const dh = Math.atan2(best.x - player.x, best.z - player.z); best.h = dh;
    burst(best.x, 1.0, best.z, isKick ? 10 : 6, isKick ? 1.3 : 0.8, isKick ? 1.7 : 1.2, 0.4, 0.95, 0.85, 0.6);
    addShake(isKick ? 0.22 : 0.12);
    // getting hit maxes out how riled up they are (the same anger meter that escalates from being rude
    // on the talk system) — the angrier (and ruder to start) they are, the better the odds they square
    // up and swing back instead of running. A solid kick knocks more of that fight out of them than a
    // jab does, and a couple of rounds of either is enough for anyone.
    best.anger = 3;
    best.fightRounds = best.fighting ? (best.fightRounds || 0) + 1 : 0;
    const baseFight = (best.mood === 2 ? 0.55 : best.mood === 0 ? 0.15 : 0.32) - (isKick ? 0.18 : 0);
    best.postFight = (best.fightRounds < 2 && ragRng() < Math.max(0.05, baseFight)) ? "fight" : "flee";
    best.fighting = false;   // paused during the stagger — resolved once they climb back up, below
    // knocked clean off their feet — a brief stagger ragdoll, then they climb back up and either
    // square up to fight back or bolt, decided by postFight above
    const lo = isKick ? 3.2 : 2, hi = isKick ? 5 : 3.4;
    best.ragdoll = spawnRagdoll(
      { group: best.mesh, legL: best.legL, legR: best.legR, armL: best.armL, armR: best.armR, kneeL: best.kneeL, kneeR: best.kneeR },
      best.x, groundY(best.x, best.z), best.z, dh,
      { vx: Math.sin(dh) * rrand(lo, hi), vy: rrand(lo, hi), vz: Math.cos(dh) * rrand(lo, hi) }, "stagger", { npc: best });
  }
}

// ---------- beach basketball: pickup game at the beachfront court ----------
// a shooting spot in front of each hoop, offset toward centre-court along the court's long (x) axis
const HOOP_SPOT_L = { x: COURT.hoopL.x + 6, z: COURT.hoopL.z };
const HOOP_SPOT_R = { x: COURT.hoopR.x - 6, z: COURT.hoopR.z };
const hoopBallTex = canvasTex(64, (ctx, s) => {
  ctx.fillStyle = "#e8712a"; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#2a1508"; ctx.lineWidth = s * 0.045;
  ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.46, s * 0.18, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(s / 2, s / 2, s * 0.18, s * 0.46, 0, 0, 7); ctx.stroke();
});
const hoopBall = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ map: hoopBallTex, roughness: 0.65 }));
hoopBall.castShadow = true; scene.add(hoopBall);
const hoopScore = textSprite("", "#fff", "rgba(20,20,30,.92)", 12, 3, 0);
hoopScore.position.set(COURT.x, 4.6, COURT.z); scene.add(hoopScore);
setSpriteText(hoopScore, "🏀 Walk up to a hoop and press SHOOT");
let hoopMade = 0, hoopShot = 0, hoopShootT = 0;
const hb = { flying: false, cd: 0, t: 0, dur: 0.55, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, willMake: false };
function nearestHoopSpot() {
  const dL = dist2(player.x, player.z, HOOP_SPOT_L.x, HOOP_SPOT_L.z), dR = dist2(player.x, player.z, HOOP_SPOT_R.x, HOOP_SPOT_R.z);
  return dL < dR ? { spot: HOOP_SPOT_L, hoop: COURT.hoopL, d2: dL } : { spot: HOOP_SPOT_R, hoop: COURT.hoopR, d2: dR };
}
function nearCourtPlay() { return !driving && !inside && nearestHoopSpot().d2 < 100; }   // within ~10 units of a hoop's shooting spot
function placeHoopBall() { const { spot } = nearestHoopSpot(); hoopBall.position.set(spot.x, 0.28, spot.z); }
function doHoopShot() {
  if (hb.flying || hb.cd > 0) return;
  const { spot, hoop, d2 } = nearestHoopSpot();
  hb.flying = true; hb.t = 0;
  hb.sx = spot.x; hb.sy = 1.5; hb.sz = spot.z;
  // accuracy falls off with distance from the sweet spot — line up close to the hoop for an easy look
  const d = Math.sqrt(d2), acc = clamp(1 - (d - 2) / 8, 0.1, 0.92);
  hb.willMake = ragRng() < acc;
  hb.tx = hoop.x + (hb.willMake ? 0 : rrand(-1.6, 1.6)); hb.ty = 3.15; hb.tz = hoop.z + (hb.willMake ? 0 : rrand(-1.2, 1.2));
  hoopShootT = 0.5;   // player animation: rise into a set-shot release
  AudioSys.play("door", 0.35); buzz(10);
}
function updateHoop(dt) {
  if (hb.cd > 0) hb.cd -= dt;
  if (!hb.flying) { if (hb.cd <= 0) placeHoopBall(); return; }
  hb.t += dt;
  const k = clamp(hb.t / hb.dur, 0, 1);
  hoopBall.position.set(hb.sx + (hb.tx - hb.sx) * k, hb.sy + (hb.ty - hb.sy) * k + Math.sin(k * Math.PI) * 2.2, hb.sz + (hb.tz - hb.sz) * k);
  hoopBall.rotation.x -= 10 * dt;
  if (k >= 1) {
    hb.flying = false; hb.cd = 1.7; hoopShot++;
    if (hb.willMake) {
      hoopMade++;
      const reward = earn(30);
      setSpriteText(hoopScore, "🏀 SWISH! +$" + reward + "  (" + hoopMade + "/" + hoopShot + ")");
      AudioSys.play("cash", 0.6); flash("#ffd166", 0.2); addShake(0.12); buzz(18); save();
    } else {
      setSpriteText(hoopScore, "🏀 Rim out!  (" + hoopMade + "/" + hoopShot + ")");
      AudioSys.play("blip", 0.4);
    }
    setTimeout(() => { if (!inside) setSpriteText(hoopScore, "🏀 Press SHOOT  (" + hoopMade + "/" + hoopShot + ")"); }, 1400);
  }
}

// ---------- projectiles + muzzle flash — moved to projectiles.js ----------
initProjectiles({ scene, burst, emit });   // builds its mesh pools in the scene (needs burst/emit for trails)

// ---------- weapons (bought at the Ammo Shop; fire with the on-foot action button) ----------
const WEAPONS = [
  { id: "pistol", name: "🔫 Pistol", price: 800, rate: 0.34, range: 32, ammo: 60, spread: 0.02, pellets: 1 },
  { id: "smg", name: "💥 SMG", price: 3500, rate: 0.1, range: 28, ammo: 200, spread: 0.06, pellets: 1 },
  { id: "shotgun", name: "🟥 Shotgun", price: 6000, rate: 0.72, range: 19, ammo: 48, spread: 0.16, pellets: 6 },
  { id: "rifle", name: "🎯 Rifle", price: 12000, rate: 0.5, range: 48, ammo: 80, spread: 0.008, pellets: 1 },
  // appended (keeps existing saves' equipped-weapon index valid)
  { id: "microsmg", name: "🔫 Micro SMG", price: 1800, rate: 0.07, range: 22, ammo: 150, spread: 0.1, pellets: 1 },
  { id: "combat", name: "🟧 Combat Shotgun", price: 9000, rate: 0.5, range: 24, ammo: 64, spread: 0.13, pellets: 8 },
  { id: "sniper", name: "🔭 Sniper Rifle", price: 18000, rate: 0.95, range: 90, ammo: 30, spread: 0.001, pellets: 1 },
  { id: "minigun", name: "🌀 Minigun", price: 40000, rate: 0.05, range: 36, ammo: 400, spread: 0.09, pellets: 1 },
  // explosive launchers: the shot detonates on impact (reuses the car-explosion system)
  { id: "grenade", name: "💣 Grenade Launcher", price: 16000, rate: 1.0, range: 34, ammo: 18, spread: 0.01, pellets: 1, explosive: true, blast: 6 },
  { id: "rpg", name: "🚀 RPG", price: 32000, rate: 1.5, range: 72, ammo: 10, spread: 0, pellets: 1, explosive: true, blast: 8 },
];
const armed = () => state.weapon != null && WEAPONS[state.weapon];
const ammoOf = w => state.ammo[w.id] || 0;
function buyWeapon(idx) {
  const w = WEAPONS[idx];
  const first = state.ammo[w.id] === undefined;
  const cost = first ? w.price : Math.round(w.price * 0.25);   // first buy = the gun, later = an ammo refill
  if (state.money < cost) { toast(STR.needMore(cost - Math.floor(state.money))); return; }
  state.money -= cost;
  state.ammo[w.id] = (state.ammo[w.id] || 0) + w.ammo;
  state.weapon = idx;
  toast(w.name + (first ? " bought!" : " · +" + w.ammo + " ammo"));
  AudioSys.play("cash"); buzz(20); save();
}
let shootCD = 0;
function doShoot() {
  const w = armed(); if (!w) return;
  if (shootCD > 0) return;
  if (ammoOf(w) <= 0) { toast("Out of ammo — restock at the 🔫 Ammo Shop"); AudioSys.play("blip", 0.4); return; }
  shootCD = w.rate; state.ammo[w.id] = ammoOf(w) - 1;
  AudioSys.play("gun", w.explosive ? 1.0 : 0.85); buzz(18); addShake(w.explosive ? 0.3 : 0.15); punchT = 0.18;
  const fx = Math.sin(player.h), fz = Math.cos(player.h);
  const mx = player.x + fx * 0.9, mz = player.z + fz * 0.9, my = 1.42;   // muzzle position
  muzzleFlash(mx, my, mz, w.explosive);
  kickCam(-fx * (w.explosive ? 0.34 : 0.14), 0.05, -fz * (w.explosive ? 0.34 : 0.14));      // recoil punch
  gunKickT = 0.14;                                                      // extra arm snap-back, layered onto the aim pose
  if (w.explosive) {                                          // launcher: aim at the first car hit, else at range
    let impT = w.range, ix = player.x + fx * w.range, iz = player.z + fz * w.range;
    const probe = c => { const dx = c.x - player.x, dz = c.z - player.z, t = dx * fx + dz * fz; if (t < 1 || t > impT || Math.abs(dx * fz - dz * fx) > 2.4) return; impT = t; ix = c.x; iz = c.z; };
    for (const c of traffic) if (!c.dead) probe(c);
    for (const c of police) if (c.active && !c.dead) probe(c);
    for (const g of gangsters) if (g.alive) probe(g);
    for (const g of nemGoons) if (g.alive) probe(g);
    if (nemCar.active) probe(nemCar);
    if (chopper.active && !chopper.dead) probe(chopper);
    if (tank.active && !tank.dead) probe(tank);
    // real flight time: the blast only goes off once the rocket/grenade actually arrives, so a shot
    // fired at something 70 units away doesn't detonate on your own feet the instant you pull the trigger
    fireProjectile(w.id === "grenade" ? "grenade" : "rocket", mx, my, mz, ix, 0.6, iz, () => explodeAt(ix, iz, w.blast || 7));
    registerCrime();
    return;
  }
  for (let s = 0; s < (w.pellets || 1); s++) {
    const sp = (Math.random() - 0.5) * w.spread * 2;
    const ax = Math.sin(player.h + sp), az = Math.cos(player.h + sp);
    let best = null, bestT = w.range, bestCar = null;
    for (const n of npcs) {
      if (n.ragdoll) continue;
      const dx = n.x - player.x, dz = n.z - player.z, t = dx * ax + dz * az;
      if (t < 1 || t > bestT) continue;
      if (Math.abs(dx * az - dz * ax) > 1.5) continue;
      bestT = t; best = n;
    }
    const hitCar = c => {                                  // cars are wider targets; nearest hit wins
      if (c.dead) return;
      const dx = c.x - player.x, dz = c.z - player.z, t = dx * ax + dz * az;
      if (t < 1 || t > bestT || Math.abs(dx * az - dz * ax) > 2.0) return;
      bestT = t; bestCar = c; best = null;
    };
    for (const c of traffic) hitCar(c);
    for (const c of police) if (c.active) hitCar(c);
    let bestGang = null;
    for (const g of gangsters) {                          // gangsters take aimed hits too
      if (!g.alive) continue;
      const dx = g.x - player.x, dz = g.z - player.z, t = dx * ax + dz * az;
      if (t < 1 || t > bestT || Math.abs(dx * az - dz * ax) > 1.6) continue;
      bestT = t; bestGang = g; bestCar = null; best = null;
    }
    let bestNem = null;
    for (const g of nemGoons) {                            // the boss's enforcers / the boss himself
      if (!g.alive) continue;
      const dx = g.x - player.x, dz = g.z - player.z, t = dx * ax + dz * az;
      if (t < 1 || t > bestT || Math.abs(dx * az - dz * ax) > (g.boss ? 2.0 : 1.6)) continue;
      bestT = t; bestNem = g; bestGang = null; bestCar = null; best = null;
    }
    let hitNemCar = false;
    if (nemCar.active) { const dx = nemCar.x - player.x, dz = nemCar.z - player.z, t = dx * ax + dz * az; if (t >= 1 && t <= bestT && Math.abs(dx * az - dz * ax) <= 2.4) { hitNemCar = true; bestNem = null; bestGang = null; bestCar = null; best = null; } }
    // the hit itself resolves instantly (so a fast-moving target's state can't get weird mid-flight) —
    // the bullet tracer fired below is a fast cosmetic flourish flying out to wherever it landed
    let impX = player.x + ax * w.range, impZ = player.z + az * w.range, impY = my;
    if (hitNemCar) { damageNemCar(20); impX = nemCar.x; impZ = nemCar.z; impY = 1.0; }
    else if (bestNem) { damageNem(bestNem, 34, { vx: ax * rrand(2.5, 4.5), vy: rrand(2.5, 4.5), vz: az * rrand(2.5, 4.5) }); impX = bestNem.x; impZ = bestNem.z; impY = 1.0; }
    else if (bestGang) { damageGangster(bestGang, 34, { vx: ax * rrand(2.5, 4.5), vy: rrand(2.5, 4.5), vz: az * rrand(2.5, 4.5) }); impX = bestGang.x; impZ = bestGang.z; impY = 1.0; }
    else if (bestCar) { damageCar(bestCar, 24); impX = bestCar.x; impZ = bestCar.z; impY = 1.0; }
    else if (best) {   // civilians go down in one hit — a sharp directional ragdoll, then gone for good
      burst(best.x, 1.0, best.z, 9, 1.0, 1.5, 0.5, 0.95, 0.3, 0.25);
      spawnRagdoll(
        { group: best.mesh, legL: best.legL, legR: best.legR, armL: best.armL, armR: best.armR, kneeL: best.kneeL, kneeR: best.kneeR },
        best.x, groundY(best.x, best.z), best.z, best.h,
        { vx: ax * rrand(2.5, 4.5), vy: rrand(2.5, 4.5), vz: az * rrand(2.5, 4.5) }, "corpse");
      const idx = npcs.indexOf(best); if (idx >= 0) npcs.splice(idx, 1);
      impX = best.x; impZ = best.z; impY = 1.0;
    }
    fireProjectile("bullet", mx, my, mz, impX, impY, impZ);
  }
  registerCrime();   // firing in public draws police heat
}

// ---------- explosions, chain reactions & a chaos/rampage combo ----------
// rampage combo: each act of mayhem within the window builds a multiplier (x1…x8) and a running
// score. Let the window lapse and the score banks as cash — beat your best-ever rampage. The
// "one more run" hook: chain kills/wrecks fast to crank the multiplier before it cools off.
let chaos = 0, chaosCD = 0, combo = 0, comboMult = 1, comboTierShown = 0;
const COMBO_WINDOW = 5.0;
const elCombo = dom("combo"), elComboMult = dom("combomult"), elComboTier = dom("combotier"), elComboFill = dom("combofill"), elComboPts = dom("combopts");
const COMBO_TIERS = [[1, "RAMPAGE", "💥"], [3, "KILLING SPREE", "🔥"], [5, "UNSTOPPABLE", "⚡"], [7, "LEGENDARY", "👑"]];
function comboTier() { let t = COMBO_TIERS[0]; for (const c of COMBO_TIERS) if (comboMult >= c[0]) t = c; return t; }
function addChaos(pts) {
  combo++;
  comboMult = Math.min(8, 1 + Math.floor(combo / 3));     // +1x every 3 acts, up to x8
  chaos += Math.round(pts * comboMult);
  chaosCD = COMBO_WINDOW;
  const tier = comboTier();
  if (elComboMult) {
    elComboMult.textContent = "x" + comboMult;
    elComboTier.textContent = tier[2] + " " + tier[1];
    elComboPts.textContent = chaos.toLocaleString();
    elCombo.classList.add("on");
    elCombo.classList.remove("pop"); void elCombo.offsetWidth; elCombo.classList.add("pop");   // restart pop
  }
  // celebrate each new tier with a flash + a punchier sound as the streak heats up
  if (tier[0] > comboTierShown) { comboTierShown = tier[0]; toast(tier[2] + " " + tier[1] + "  x" + comboMult); flash("#ff9a3c", 0.22); AudioSys.play("jingle", 0.5); buzz(20); }
}
function bankCombo() {                                     // window lapsed: pay out and chase the record
  if (chaos <= 0) { resetCombo(); return; }
  const reward = earn(Math.round(chaos));
  const prevBest = state.bestRampage || 0;
  if (chaos > prevBest) { state.bestRampage = Math.round(chaos); toast("🏆 NEW BEST RAMPAGE  +$" + reward); flash("#ffe24a", 0.4); AudioSys.play("jingle", 1.0); buzz([0, 40, 30, 80]); save(); }
  else { toast("💥 RAMPAGE BANKED  +$" + reward + "  ·  best $" + prevBest.toLocaleString()); AudioSys.play("cash", 0.85); }
  resetCombo();
}
function resetCombo() { chaos = 0; combo = 0; comboMult = 1; comboTierShown = 0; if (elCombo) elCombo.classList.remove("on", "pop"); }
function drawCombo() { if (elComboFill && chaos > 0) elComboFill.style.width = Math.max(0, Math.min(1, chaosCD / COMBO_WINDOW)) * 100 + "%"; }
function damageCar(c, dmg) {
  if (c.dead) return;
  c.hp = (c.hp == null ? 100 : c.hp) - dmg;
  burst(c.x, 1.0, c.z, 7, 1.0, 1.2, 0.4, 1.0, 0.72, 0.32);   // sparks / glass
  if (c.hp <= 0) explodeCar(c);
}
// ---------- chaos physics: explosions fling whatever's already loose even further ----------
// a blast doesn't just hit fresh targets — any body still mid-tumble from an earlier hit, or a trash
// can somebody already kicked over, gets caught in the shockwave too and sent flying again. Scales
// with the rampage combo multiplier, so a hot streak makes the whole street noticeably more violent.
function shockwave(x, z, radius, force) {
  for (const r of ragdolls) {
    const dx = r.x - x, dz = r.z - z, d2 = dx * dx + dz * dz;
    if (d2 > radius * radius || d2 < 0.02) continue;
    const d = Math.sqrt(d2), falloff = 1 - d / radius;
    r.vx += dx / d * force * falloff; r.vz += dz / d * force * falloff; r.vy += force * 0.55 * falloff;
    r.wx += rrand(-3, 3) * falloff; r.wy += rrand(-2, 2) * falloff; r.wz += rrand(-3, 3) * falloff;
    if (r.mode === "settled" || r.mode === "getup") { r.mode = "tumble"; r.settleT = 0; }   // knocked right back into a tumble
  }
  for (const p of knockableProps) {   // any prop already knocked loose (mid-tumble OR settled) can get flung again
    if (!p.active) continue;
    const dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz;
    if (d2 > radius * radius || d2 < 0.02) continue;
    const d = Math.sqrt(d2), falloff = 1 - d / radius;
    p.vx += dx / d * force * falloff; p.vz += dz / d * force * falloff; p.vy += force * 0.4 * falloff;
    if (!activeProps.includes(p)) activeProps.push(p);   // wake a settled one back up
  }
}
function explodeCar(c) {
  if (c.dead) return;
  c.dead = true; c.detonateIn = null;
  const x = c.x, z = c.z;
  const cs = 1 + (comboMult - 1) * 0.1;   // chaos scale — a hot rampage streak makes the blast hit harder
  burst(x, 1.0, z, 24, 1.3, 2.2, 0.16, 1.0, 0.97, 0.75);     // white-hot core pop
  burst(x, 1.3, z, 54, 4.2, 5.6, 0.9, 1.0, 0.55, 0.12);      // fireball
  burst(x, 1.4, z, 22, 6.0, 1.2, 0.6, 1.0, 0.72, 0.22);      // fast low debris ring
  burst(x, 1.9, z, 28, 2.6, 6.2, 1.5, 0.26, 0.26, 0.26);     // smoke plume
  shockwave(x, z, 16 * cs, 5 + comboMult * 1.3);
  AudioSys.play("boom", 1.0); addShake(1.15 * cs); flash("#ff7a33", 0.42); buzz([0, 40, 30, 90]);
  freezeFrame(0.05); kickCam(rr(-0.5, 0.5), 0.55, rr(-0.5, 0.5));   // impact freeze + blast kick
  c.mesh.visible = false;
  if (c.wp) c.jacked = true;                                  // traffic car: stop & remove from the AI
  if (c.active !== undefined) { c.active = false; c.mesh.position.set(0, -9999, 0); }   // police car
  for (const n of npcs) { const dd = dist2(n.x, n.z, x, z); if (dd < 110) { n.flee = 3.2; n.h = Math.atan2(n.x - x, n.z - z); n.x += Math.sin(n.h) * 1.6; n.z += Math.cos(n.h) * 1.6; } }
  const tx = driving ? driving.x : player.x, tz = driving ? driving.z : player.z;
  const pd = dist2(tx, tz, x, z);
  if (pd < 72) hurt(Math.round((driving ? 26 : 42) * (1 - Math.sqrt(pd) / 8.5)));
  // chain reaction: cars caught in the blast cook off a beat later (never the one you're driving)
  for (const o of traffic) if (!o.dead && o !== driving && o.detonateIn == null && dist2(o.x, o.z, x, z) < 56) o.detonateIn = rr(0.15, 0.55);
  for (const o of police) if (o.active && !o.dead && o !== driving && o.detonateIn == null && dist2(o.x, o.z, x, z) < 56) o.detonateIn = rr(0.2, 0.6);
  if (c.armored) {                                          // cracked the vault — big payout, big heat
    const got = earn(c.loot || 2000);
    toast("🏦 ARMORED TRUCK CRACKED  +$" + got); AudioSys.play("cash", 1.0);
    burst(x, 1.6, z, 30, 2.4, 4.0, 1.3, 0.3, 0.95, 0.4);   // cash spray
    registerCrime();
  }
  registerCrime(); addChaos(c.armored ? 400 : 120);
  if (job && job.id === "rampage") job.prog++;
}
function robATM(a) {
  a.cd = 35;                                                // per-ATM cooldown so you can't farm one
  const got = earn(60 + (Math.random() * 110 | 0));
  toast("💸 ATM cracked  +$" + got); AudioSys.play("cash", 0.9); buzz(20);
  burst(a.x, 1.1, a.z, 14, 1.2, 2.0, 0.7, 0.3, 0.9, 0.45);
  registerCrime();                                          // robbery pulls a star
}
function startHoldup(sh) {
  holdup = { sh, t: 3.0 };
  toast("🔫 HOLDUP! Hold position at the counter...");
  AudioSys.play("blip", 0.6); buzz(20);
}
function updateHoldup(dt) {
  for (const s of SHOPS) if (s.cd > 0) s.cd -= dt;
  if (getaway > 0) {
    getaway -= dt;
    if (wanted === 0) { const b = earn(800); toast("🏃 CLEAN GETAWAY  +$" + b); AudioSys.play("jingle", 0.9); flash("#9fe6a0", 0.3); getaway = 0; }
    else if (getaway <= 0) { toast("Lost the getaway bonus"); }
  }
  if (!holdup) return;
  const sh = holdup.sh;
  if (driving || !armed() || dist2(player.x, player.z, sh.x, sh.z) > 49) { holdup = null; toast("Holdup abandoned"); return; }
  holdup.t -= dt;
  if (Math.random() < 0.3) burst(sh.x + rr(-1, 1), 1.3, sh.z + rr(-1, 1), 2, 0.4, 0.6, 0.3, 1, 0.8, 0.4);
  if (holdup.t <= 0) {
    const n = (state.holdups = (state.holdups || 0) + 1);
    const take = earn(400 + n * 150 + (Math.random() * 220 | 0));
    sh.cd = 120;
    toast("💰 STORE ROBBED  +$" + take + " — GET AWAY!");
    AudioSys.play("cash", 1.0); flash("#ffe24a", 0.3); buzz([0, 40, 30, 80]);
    wanted = Math.min(5, wanted + 2); wantedCD = 14;
    getaway = 60;
    holdup = null;
  }
}
// ---------- phone: on-demand jobs ----------
const JOBS = [
  { id: "rampage", label: "💥 Rampage", desc: "Wreck 5 cars in 60s" },
  { id: "courier", label: "📦 Courier", desc: "Reach the drop in 55s" },
  { id: "bounty", label: "🎯 Bounty", desc: "Destroy the marked car in 60s" },
  { id: "takeover", label: "🚩 Turf Takeover", desc: "Wipe out a gang to seize their turf" },
  { id: "hire", label: "🤝 Hire Muscle", desc: "$1500 — an armed ally guns down gangsters with you" },
];
function startJob(id) {
  if (id === "hire") { hireAlly(); closePhone(); return; }   // instant, not a timed job
  if (job) { toast("Finish your current job first"); return; }
  if (id === "rampage") { job = { id, label: "💥 RAMPAGE", t: 60, prog: 0, goal: 5 }; toast("💥 RAMPAGE — wreck 5 cars in 60s!"); }
  else if (id === "courier") {
    const dx = clamp(player.x + rr(-220, 220), -HALF + 20, HALF - 20), dz = clamp(player.z + rr(-220, 220), -HALF + 20, HALF - 20);
    job = { id, label: "📦 COURIER", t: 55, dx, dz };
    jobMarker.visible = true; jobMarker.position.set(dx, 3, dz);
    toast("📦 COURIER — get to the drop!");
  } else if (id === "bounty") {
    const cands = traffic.filter(c => !c.dead && !c.armored && !c.jacked);
    if (!cands.length) { toast("No target on the streets right now"); return; }
    job = { id, label: "🎯 BOUNTY", t: 60, target: cands[(Math.random() * cands.length) | 0] };
    jobMarker.visible = true;
    toast("🎯 BOUNTY — destroy the marked car!");
  } else if (id === "takeover") {
    let gi = -1, bd = Infinity;
    GANGS.forEach((G, i) => { if (G.captured) return; const d = dist2(player.x, player.z, G.x, G.z); if (d < bd) { bd = d; gi = i; } });
    if (gi < 0) { toast("You already run every turf in town"); return; }
    job = { id, label: "🚩 TAKEOVER", t: 180, gang: gi };
    jobMarker.visible = true; jobMarker.position.set(GANGS[gi].x, 3, GANGS[gi].z);
    toast("🚩 TAKEOVER — wipe out the " + GANGS[gi].name + "!");
  }
  AudioSys.play("blip", 0.6); closePhone();
}
function failJob(msg) { toast(msg || "Job failed"); job = null; jobMarker.visible = false; }
function winJob(reward) { const got = earn(reward); toast("✅ JOB DONE  +$" + got); AudioSys.play("jingle", 1.0); flash("#9fe6a0", 0.4); buzz([0, 50, 40, 90]); job = null; jobMarker.visible = false; save(); }
function updateJob(dt) {
  if (!job) return;
  job.t -= dt;
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (job.id === "courier") { jobMarker.rotation.y += 2 * dt; if (dist2(px, pz, job.dx, job.dz) < 49) { winJob(700); return; } }
  else if (job.id === "bounty") { if (job.target.dead) { winJob(1200); return; } jobMarker.position.set(job.target.x, 3, job.target.z); jobMarker.rotation.y += 2 * dt; }
  else if (job.id === "rampage") { if (job.prog >= job.goal) { winJob(1600); return; } }
  else if (job.id === "takeover") { jobMarker.rotation.y += 2 * dt; if (GANGS[job.gang].captured) { winJob(2500); return; } }
  if (job.t <= 0) failJob("⏰ " + job.label + " failed");
}
function blastImpulse(gx, gz, x, z, lo, hi) {                 // outward-from-blast direction, scaled to a launch speed
  const dx = gx - x, dz = gz - z, d = Math.hypot(dx, dz) || 1;
  return { vx: dx / d * rrand(lo, hi), vy: rrand(lo, hi), vz: dz / d * rrand(lo, hi) };
}
function explodeAt(x, z, r) {                                 // an AoE blast (RPG / grenade impact)
  let hitAny = false;
  shockwave(x, z, r * 1.8, 5 + comboMult * 1.3);   // catches anything already loose nearby, chaos-scaled
  for (const c of traffic) if (!c.dead && dist2(c.x, c.z, x, z) < r * r) { explodeCar(c); hitAny = true; }
  for (const c of police) if (c.active && !c.dead && dist2(c.x, c.z, x, z) < r * r) { explodeCar(c); hitAny = true; }
  for (const g of gangsters) if (g.alive && dist2(g.x, g.z, x, z) < r * r) killGangster(g, blastImpulse(g.x, g.z, x, z, 4, 7));   // blast catches gangsters
  for (const g of nemGoons) if (g.alive && dist2(g.x, g.z, x, z) < r * r) damageNem(g, g.boss ? 150 : 999, blastImpulse(g.x, g.z, x, z, 4, 7));   // and the boss's crew
  if (nemCar.active && dist2(nemCar.x, nemCar.z, x, z) < r * r) damageNemCar(150);   // blast the getaway car
  if (chopper.active && !chopper.dead && dist2(chopper.x, chopper.z, x, z) < (r + 2) * (r + 2)) { damageChopper(120); hitAny = true; }
  if (tank.active && !tank.dead && dist2(tank.x, tank.z, x, z) < (r + 2) * (r + 2)) { damageTank(120); hitAny = true; }
  if (!hitAny) {                                             // empty ground — still a satisfying boom
    const cs = 1 + (comboMult - 1) * 0.1;
    burst(x, 1.0, z, 20, 1.2, 2.0, 0.15, 1.0, 0.97, 0.75);    // white-hot core pop
    burst(x, 1.2, z, 40, 3.4, 4.4, 0.85, 1.0, 0.55, 0.14);
    burst(x, 1.4, z, 18, 5.4, 1.1, 0.55, 1.0, 0.72, 0.22);    // debris ring
    burst(x, 1.7, z, 22, 2.2, 5.2, 1.4, 0.28, 0.28, 0.28);
    AudioSys.play("boom", 1.0); addShake(0.95 * cs); flash("#ff7a33", 0.34);
    freezeFrame(0.045); kickCam(rr(-0.4, 0.4), 0.45, rr(-0.4, 0.4));
    const npcKills = [];
    for (const n of npcs) {
      const dd = dist2(n.x, n.z, x, z);
      if (dd > r * r * 1.6 || n.ragdoll) continue;
      if (dd < r * r * 0.7) {                                // caught in the inner blast radius — doesn't get up
        npcKills.push(n);
        spawnRagdoll({ group: n.mesh, legL: n.legL, legR: n.legR, armL: n.armL, armR: n.armR, kneeL: n.kneeL, kneeR: n.kneeR },
          n.x, groundY(n.x, n.z), n.z, n.h, blastImpulse(n.x, n.z, x, z, 4.5, 7.5), "corpse");
      } else { n.flee = 3; n.h = Math.atan2(n.x - x, n.z - z); n.x += Math.sin(n.h); n.z += Math.cos(n.h); }
    }
    for (const n of npcKills) { const idx = npcs.indexOf(n); if (idx >= 0) npcs.splice(idx, 1); }
    const pd = dist2(player.x, player.z, x, z);
    if (!driving && pd < r * r) hurt(Math.round(36 * (1 - Math.sqrt(pd) / (r + 1))));
    addChaos(60);
  }
  registerCrime();
}
function updateExplosions(dt) {
  for (const c of traffic) if (c.detonateIn != null && !c.dead) { c.detonateIn -= dt; if (c.detonateIn <= 0) explodeCar(c); }
  for (const c of police) if (c.detonateIn != null && c.active && !c.dead) { c.detonateIn -= dt; if (c.detonateIn <= 0) explodeCar(c); }
  for (const a of atms) if (a.cd > 0) a.cd -= dt;
  for (const hv of helis) if (hv !== driving && hv.y > 0.01) { hv.y = Math.max(0, hv.y - 7 * dt); hv.mesh.position.set(hv.x, hv.y, hv.z); if (hv.rotor) hv.rotor.rotation.y += 18 * dt; }   // abandoned chopper auto-lands
  for (const pl of planes) if (pl !== driving && pl.y > 0.01) { pl.y = Math.max(0, pl.y - 9 * dt); pl.mesh.position.set(pl.x, pl.y, pl.z); }   // abandoned plane glides down
  if (chaosCD > 0) { chaosCD -= dt; if (chaosCD <= 0) bankCombo(); }
  for (const G of GANGS) if (G.captured) state.money += 4 * dt;   // captured turf pays tribute
  if (state.jetpack) { if (jpMesh.visible) jpMesh.visible = false; }
  else {
    jpMesh.rotation.y += dt; jpMesh.position.y = CURB + Math.sin(simTime * 2) * 0.2;
    if (!driving && dist2(player.x, player.z, jetpackPickup.x, jetpackPickup.z) < 9) {
      state.jetpack = true; jpMesh.visible = false;
      toast("🚀 JETPACK! Hold BOOST to fly"); AudioSys.play("jingle", 1.0); flash("#ffd166", 0.3); buzz(30); save();
    }
  }
}
function damageGangster(g, dmg, impulse) {
  if (!g.alive) return;
  g.hp -= dmg;
  burst(g.x, 1.0, g.z, 8, 1.0, 1.4, 0.45, 0.95, 0.3, 0.3);
  if (g.hp <= 0) killGangster(g, impulse);
}
function killGangster(g, impulse) {
  if (!g.alive) return;
  g.alive = false; g.respawn = 6;
  // hand the mesh/rig off to the ragdoll system — it now owns the fall; a fresh one is built on respawn
  spawnRagdoll({ group: g.mesh, legL: g.legL, legR: g.legR, armL: g.armL, armR: g.armR, kneeL: g.kneeL, kneeR: g.kneeR },
    g.x, groundY(g.x, g.z), g.z, g.h,
    impulse || { vx: rrand(-1.5, 1.5), vy: rrand(2.5, 4), vz: rrand(-1.5, 1.5) }, "corpse");
  g.mesh = null;
  burst(g.x, 0.9, g.z, 18, 1.7, 2.1, 0.6, 0.9, 0.3, 0.3); addChaos(40);
  AudioSys.play("blip", 0.5); addShake(0.28); freezeFrame(0.035);   // crisp kill confirm
  const G = GANGS[g.gang];
  if (!G.captured) {
    G.kills++;
    if (G.kills >= G.need) captureTurf(g.gang);
    else toast("🔫 " + G.name + " turf  " + G.kills + "/" + G.need);
  }
}
function captureTurf(gi) {
  const G = GANGS[gi]; if (G.captured) return;
  G.captured = true;
  const reward = earn(3000);
  toast("🚩 TURF CAPTURED — " + G.name + "  +$" + reward);
  AudioSys.play("jingle", 1.0); flash("#ffe24a", 0.5); buzz([0, 60, 40, 120]); save();
}
function updateGangs(dt) {
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  for (const g of gangsters) {
    const G = GANGS[g.gang];
    if (!g.alive) {
      g.respawn -= dt;
      if (g.respawn <= 0 && !G.captured) {
        g.x = clamp(G.x + (Math.random() - 0.5) * G.r, -HALF + 4, HALF - 4);
        g.z = clamp(G.z + (Math.random() - 0.5) * G.r, -HALF + 4, HALF - 4);
        g.hp = 100; g.alive = true;
        if (!g.mesh) { const w = makeWalker(gangWalkerGeos[G.pal]); scene.add(w.group); g.mesh = w.group; g.legL = w.legL; g.legR = w.legR; g.armL = w.armL; g.armR = w.armR; g.kneeL = w.kneeL; g.kneeR = w.kneeR; }
        g.mesh.visible = true;
      }
      continue;
    }
    const dx = px - g.x, dz = pz - g.z, d = Math.hypot(dx, dz) || 1;
    const aggro = !G.captured && (d < 48 || dist2(px, pz, G.x, G.z) < G.r * G.r);
    let moving = false;
    if (aggro) {
      g.h = lerpAngle(g.h, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
      if (d > 6) { const sp = 4.2; g.x += Math.sin(g.h) * sp * dt; g.z += Math.cos(g.h) * sp * dt; g.walkPhase += sp * dt * 2.6; moving = true; }
      if (driving && Math.abs(driving.speed) > 8 && d < 3) {   // run them over — sent flying in the direction you were driving
        killGangster(g, { vx: Math.sin(driving.h) * rrand(3.5, 6), vy: rrand(3.5, 6.5), vz: Math.cos(driving.h) * rrand(3.5, 6) });
        continue;
      }
      g.shootCD -= dt;
      if (g.shootCD <= 0 && d < 36 && !dlgLines) {
        g.shootCD = rr(0.8, 1.6);
        burst(g.x + Math.sin(g.h) * 0.8, 1.3, g.z + Math.cos(g.h) * 0.8, 4, 0.5, 0.5, 0.14, 1.0, 0.5, 0.3);
        AudioSys.play("blip", 0.4);
        const fast = (driving ? Math.abs(driving.speed) : player.speed) > 6;
        if (Math.random() < clamp(0.45 - d * 0.009 - (fast ? 0.15 : 0), 0.05, 0.45)) hurt(driving ? 4 : 7);
      }
    }
    const sw = moving ? Math.sin(g.walkPhase) * 0.4 : g.legL.rotation.x * 0.85;
    g.legL.rotation.x = sw; g.legR.rotation.x = -sw;
    g.armL.rotation.x = -sw * 0.7; g.armR.rotation.x = sw * 0.7;
    const kA = moving ? 0.95 : 0;
    g.kneeL.rotation.x = kA * Math.max(0, -Math.cos(g.walkPhase));
    g.kneeR.rotation.x = kA * Math.max(0, Math.cos(g.walkPhase));
    g.mesh.position.set(g.x, groundY(g.x, g.z), g.z);
    g.mesh.rotation.y = g.h;
  }
}
// ---------- co-op: hire armed muscle that follows you and guns down gangsters ----------
const allies = [];
const allyWalkerGeo = walkerGeos({ shirt: 0x2a7f5a, pants: 0x1a1a1f, skin: 0xe8b08a, hair: 0x2a1c14 });
function hireAlly() {
  if (allies.length >= 2) { toast("Your crew is already full"); return; }
  if (state.money < 1500) { toast(STR.needMore(1500 - Math.floor(state.money))); return; }
  state.money -= 1500;
  const w = makeWalker(allyWalkerGeo); scene.add(w.group);
  allies.push({ mesh: w.group, legL: w.legL, legR: w.legR, armL: w.armL, armR: w.armR, kneeL: w.kneeL, kneeR: w.kneeR,
    x: player.x + rr(-2, 2), z: player.z - 2, h: player.h, shootCD: 0, walkPhase: 0 });
  toast("🤝 Muscle hired — they've got your back"); AudioSys.play("cash", 0.8); flash("#9fe6a0", 0.25); save();
}
function updateAllies(dt) {
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  for (const a of allies) {
    let tgt = null, td = 36;                                  // nearest hostile gangster
    for (const g of gangsters) { if (!g.alive || GANGS[g.gang].captured) continue; const d = Math.hypot(g.x - a.x, g.z - a.z); if (d < td) { td = d; tgt = g; } }
    let moving = false;
    if (tgt) {
      a.h = lerpAngle(a.h, Math.atan2(tgt.x - a.x, tgt.z - a.z), 1 - Math.exp(-5 * dt));
      a.shootCD -= dt;
      if (a.shootCD <= 0) {
        a.shootCD = rr(0.5, 1.0);
        burst(a.x + Math.sin(a.h) * 0.8, 1.3, a.z + Math.cos(a.h) * 0.8, 4, 0.5, 0.5, 0.14, 0.6, 1.0, 0.6);
        AudioSys.play("blip", 0.35);
        if (Math.random() < 0.65) damageGangster(tgt, 26);
      }
    } else {
      const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz) || 1;
      if (d > 5) { a.h = lerpAngle(a.h, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt)); const sp = Math.min(7.5, d); a.x += Math.sin(a.h) * sp * dt; a.z += Math.cos(a.h) * sp * dt; a.walkPhase += sp * dt * 2.6; moving = true; }
    }
    if (dist2(a.x, a.z, px, pz) > 8100) { a.x = px + rr(-3, 3); a.z = pz - 3; }   // catch up if you sped off
    const sw = moving ? Math.sin(a.walkPhase) * 0.4 : a.legL.rotation.x * 0.85;
    a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * 0.7; a.armR.rotation.x = sw * 0.7;
    const kA = moving ? 0.95 : 0;
    a.kneeL.rotation.x = kA * Math.max(0, -Math.cos(a.walkPhase)); a.kneeR.rotation.x = kA * Math.max(0, Math.cos(a.walkPhase));
    a.mesh.position.set(a.x, groundY(a.x, a.z), a.z);
    a.mesh.rotation.y = a.h;
  }
}

// ---------- NEMESIS: a rival crime boss who builds a grudge, sends hit-squads, then faces you ----------
const NEM = { name: 'Vic "The Shark" Moreno', grudge: 0, tier: 0, squadCD: 8, squadOut: false, showdown: false, intro: false, defeated: 0, bossMaxHp: 520, flee: false, fleeMaxHp: 0 };
const nemCar = { mesh: makeCar(0x101216), x: 0, z: 0, h: 0, speed: 0, hp: 0, active: false };
nemCar.mesh.visible = false; scene.add(nemCar.mesh);
const nemGoons = [];
let nemBoss = null;
{
  const goonGeo = walkerGeos({ shirt: 0x17181c, pants: 0x0d0e11, skin: 0xcf9a72, hair: 0x0c0a08 });   // dark-suited enforcers
  const bossGeo = walkerGeos({ shirt: 0xe6dcb6, pants: 0x1a1c22, skin: 0xd99c6e, hair: 0x141014 });   // flashy cream suit
  const mk = boss => {
    const w = makeWalker(boss ? bossGeo : goonGeo); w.group.visible = false; scene.add(w.group);
    return { mesh: w.group, legL: w.legL, legR: w.legR, armL: w.armL, armR: w.armR, kneeL: w.kneeL, kneeR: w.kneeR,
      hp: 0, alive: false, shootCD: 0, x: 0, z: 0, h: 0, walkPhase: 0, boss: !!boss, geo: boss ? bossGeo : goonGeo, scale: boss ? 1.14 : 1 };
  };
  for (let i = 0; i < 8; i++) nemGoons.push(mk(false));
  nemBoss = mk(true); nemBoss.mesh.scale.set(1.14, 1.14, 1.14); nemGoons.push(nemBoss);   // boss shares the array so weapons hit it
}
const elBossbar = dom("bossbar"), elBossName = dom("bossname"), elBossHp = dom("bosshp");
function showBossBar(on) { if (elBossbar) elBossbar.classList.toggle("on", on); if (on && elBossName) elBossName.textContent = "☠ " + NEM.name; }
function updateBossBar() {
  if (!elBossHp) return;
  if (NEM.flee && nemCar.active) elBossHp.style.width = Math.max(0, nemCar.hp / NEM.fleeMaxHp * 100) + "%";
  else if (nemBoss) elBossHp.style.width = Math.max(0, nemBoss.hp / NEM.bossMaxHp * 100) + "%";
}
function nemSquadAlive() { let n = 0; for (const g of nemGoons) if (g.alive && !g.boss) n++; return n; }
const NEM_TAUNTS = ["You're starting to annoy me.", "Boys — go remind him whose town this is.", "Still breathing? Won't last.", "I'll bury you myself.", "ENOUGH. Come find me — let's END this."];
function nemAddGrudge(n) {
  if (NEM.showdown) return;
  NEM.grudge = Math.min(100, NEM.grudge + n);
  if (!NEM.intro && NEM.grudge >= 6) { NEM.intro = true; toast("📱 " + NEM.name + ': "New hustler in MY city? Watch yourself."'); AudioSys.play("blip", 0.5); }
  const t = Math.floor(NEM.grudge / 20);
  if (t > NEM.tier) { NEM.tier = t; if (t >= 1 && t < 5) { toast("📱 " + NEM.name + ': "' + NEM_TAUNTS[t - 1] + '"'); AudioSys.play("blip", 0.5); } }
}
function spawnNemSquad() {
  const n = Math.min(2 + NEM.tier, 6);
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  let placed = 0;
  for (const g of nemGoons) {
    if (g.boss || g.alive || placed >= n) continue;
    const a = Math.random() * 6.2832, r = 26 + Math.random() * 14;
    g.x = clamp(px + Math.cos(a) * r, WB.x0, WB.x1); g.z = clamp(pz + Math.sin(a) * r, WB.z0, WB.z1);
    g.hp = 70; g.alive = true;
    if (!g.mesh) { const w = makeWalker(g.geo); scene.add(w.group); g.mesh = w.group; g.legL = w.legL; g.legR = w.legR; g.armL = w.armL; g.armR = w.armR; g.kneeL = w.kneeL; g.kneeR = w.kneeR; }
    g.mesh.visible = true; g.shootCD = rr(0.5, 1.5); g.h = Math.atan2(px - g.x, pz - g.z); g.walkPhase = Math.random() * 6.28;
    placed++;
  }
  if (placed) { NEM.squadOut = true; toast("⚠️ " + NEM.name + " sent his crew after you!"); AudioSys.play("blip", 0.6); flash("#ff5a3a", 0.18); buzz([0, 40, 30, 60]); }
}
function startNemShowdown() {
  NEM.showdown = true; NEM.squadOut = false;
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  NEM.bossMaxHp = 520 + NEM.defeated * 240;
  nemBoss.x = clamp(px, WB.x0, WB.x1); nemBoss.z = clamp(pz + 32, WB.z0, WB.z1);
  nemBoss.hp = NEM.bossMaxHp; nemBoss.alive = true;
  if (!nemBoss.mesh) { const w = makeWalker(nemBoss.geo); w.group.scale.setScalar(nemBoss.scale); scene.add(w.group); nemBoss.mesh = w.group; nemBoss.legL = w.legL; nemBoss.legR = w.legR; nemBoss.armL = w.armL; nemBoss.armR = w.armR; nemBoss.kneeL = w.kneeL; nemBoss.kneeR = w.kneeR; }
  nemBoss.mesh.visible = true; nemBoss.shootCD = 1.2; nemBoss.h = Math.PI; nemBoss.walkPhase = 0;
  let guards = 0;
  for (const g of nemGoons) {
    if (g.boss || g.alive || guards >= 3) continue;
    const a = Math.random() * 6.28; g.x = clamp(nemBoss.x + Math.cos(a) * 8, WB.x0, WB.x1); g.z = clamp(nemBoss.z + Math.sin(a) * 8, WB.z0, WB.z1);
    g.hp = 90; g.alive = true;
    if (!g.mesh) { const w = makeWalker(g.geo); scene.add(w.group); g.mesh = w.group; g.legL = w.legL; g.legR = w.legR; g.armL = w.armL; g.armR = w.armR; g.kneeL = w.kneeL; g.kneeR = w.kneeR; }
    g.mesh.visible = true; g.shootCD = rr(0.4, 1.2); g.walkPhase = Math.random() * 6.28; guards++;
  }
  toast("☠ " + NEM.name + ': "You want this city? COME TAKE IT!"'); AudioSys.play("boom", 0.7); flash("#ff3b1f", 0.34); addShake(1.0); buzz([0, 60, 40, 100]);
  showBossBar(true); updateBossBar();
}
function startBossFlee() {                                // boss bails to a getaway car — chase him down
  NEM.flee = true; nemBoss.alive = false; nemBoss.mesh.visible = false;
  nemCar.x = nemBoss.x; nemCar.z = nemBoss.z; nemCar.h = nemBoss.h; nemCar.speed = 9; nemCar.active = true;
  NEM.fleeMaxHp = 240 + NEM.defeated * 120; nemCar.hp = NEM.fleeMaxHp;
  nemCar.mesh.visible = true; nemCar.mesh.position.set(nemCar.x, 0, nemCar.z); nemCar.mesh.rotation.y = nemCar.h;
  toast("🚗 " + NEM.name + ': "This ain\'t over!" — HE\'S RUNNING! Chase him down!'); AudioSys.play("horn", 0.7); flash("#ffce4a", 0.2); buzz([0, 40, 30, 60]);
  updateBossBar();
}
function damageNemCar(dmg) {
  if (!nemCar.active) return;
  nemCar.hp -= dmg;
  burst(nemCar.x, 1.0, nemCar.z, 7, 1.0, 1.2, 0.4, 1.0, 0.6, 0.3); updateBossBar();
  if (nemCar.hp <= 0) {
    nemCar.active = false; nemCar.mesh.visible = false;
    burst(nemCar.x, 1.3, nemCar.z, 46, 3.4, 5.0, 0.9, 1.0, 0.55, 0.2); AudioSys.play("boom", 1.0); addShake(1.2); freezeFrame(0.14);
    nemBossDefeated();
  }
}
function nemBossDefeated() {
  NEM.showdown = false; NEM.flee = false; NEM.defeated++;
  nemCar.active = false; nemCar.mesh.visible = false;
  for (const g of nemGoons) { g.alive = false; if (g.mesh) g.mesh.visible = false; }
  const reward = earn(5000 + NEM.defeated * 2500);
  state.bossWins = NEM.defeated;
  toast("👑 YOU TOOK DOWN " + NEM.name.toUpperCase() + "!  +$" + reward); AudioSys.play("jingle", 1.0); flash("#ffe24a", 0.5); addShake(1.3); freezeFrame(0.16); buzz([0, 80, 60, 140]);
  showBossBar(false);
  NEM.grudge = 24; NEM.tier = 1; NEM.intro = true; NEM.squadCD = 30;   // he comes back angrier (NG+)
  save();
}
function damageNem(g, dmg, impulse) {
  if (!g.alive) return;
  g.hp -= dmg;
  burst(g.x, 1.0, g.z, g.boss ? 12 : 8, 1.0, 1.4, 0.45, 1.0, g.boss ? 0.5 : 0.3, 0.3);
  if (g.boss) {
    if (NEM.showdown && !NEM.flee && g.hp <= NEM.bossMaxHp * 0.35) { g.hp = NEM.bossMaxHp * 0.35; startBossFlee(); return; }   // bail to the getaway car
    updateBossBar();
  }
  if (g.hp <= 0) killNem(g, impulse);
}
function killNem(g, impulse) {
  if (!g.alive) return;
  g.alive = false;
  spawnRagdoll({ group: g.mesh, legL: g.legL, legR: g.legR, armL: g.armL, armR: g.armR, kneeL: g.kneeL, kneeR: g.kneeR },
    g.x, groundY(g.x, g.z), g.z, g.h,
    impulse || { vx: rrand(-1.5, 1.5), vy: rrand(2.5, 4), vz: rrand(-1.5, 1.5) }, "corpse");
  g.mesh = null;
  if (g.boss) { burst(g.x, 1.2, g.z, 46, 3.4, 5.0, 0.9, 1.0, 0.55, 0.2); AudioSys.play("boom", 1.0); nemBossDefeated(); return; }
  burst(g.x, 0.9, g.z, 18, 1.7, 2.1, 0.6, 0.9, 0.3, 0.3); AudioSys.play("blip", 0.5); addShake(0.28); freezeFrame(0.035); addChaos(70);
  if (NEM.squadOut && nemSquadAlive() === 0) { NEM.squadOut = false; NEM.squadCD = rr(26, 42); const r = earn(300 + NEM.tier * 150); toast("💪 Crew wiped out  +$" + r); AudioSys.play("cash", 0.7); }
}
function updateNemesis(dt) {
  if (state.phase !== "play") return;
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  if (!NEM.showdown) {
    if (NEM.grudge >= 100) startNemShowdown();
    else { if (NEM.squadCD > 0) NEM.squadCD -= dt; if (!NEM.squadOut && NEM.tier >= 1 && NEM.squadCD <= 0 && !dlgLines) spawnNemSquad(); }
  }
  // getaway-car chase: the boss flees, you run him down (ram with a vehicle or shoot the car out)
  if (NEM.flee && nemCar.active) {
    const c = nemCar;
    c.h = lerpAngle(c.h, Math.atan2(c.x - px, c.z - pz), 1 - Math.exp(-2.2 * dt));   // steer away from you
    c.speed = Math.min(27, c.speed + 11 * dt);
    c.x = clamp(c.x + Math.sin(c.h) * c.speed * dt, WB.x0, WB.x1);
    c.z = clamp(c.z + Math.cos(c.h) * c.speed * dt, WB.z0, WB.z1);
    c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h;
    if (driving && Math.abs(driving.speed) > 10 && dist2(driving.x, driving.z, c.x, c.z) < 18) { damageNemCar(36); driving.speed *= 0.6; addShake(0.4); }   // ram him
    if (c.hp < NEM.fleeMaxHp * 0.45 && Math.random() < 0.6) emit(c.x - Math.sin(c.h) * 2.2, 1.0, c.z - Math.cos(c.h) * 2.2, rr(-0.5, 0.5), rr(0.3, 0.8), rr(-0.5, 0.5), 0.8, 0.32, 0.3, 0.3);   // smoke trail when wounded
  }
  for (const g of nemGoons) {
    if (!g.alive) continue;
    const dx = px - g.x, dz = pz - g.z, d = Math.hypot(dx, dz) || 1;
    g.h = lerpAngle(g.h, Math.atan2(dx, dz), 1 - Math.exp(-4 * dt));
    let moving = false;
    const spd = g.boss ? 3.6 : 4.6;
    if (d > (g.boss ? 8 : 6)) { g.x += Math.sin(g.h) * spd * dt; g.z += Math.cos(g.h) * spd * dt; g.walkPhase += spd * dt * 2.6; moving = true; }
    if (driving && Math.abs(driving.speed) > 8 && d < 3.2 && !g.boss) {   // run over goons (boss shrugs it off)
      killNem(g, { vx: Math.sin(driving.h) * rrand(3.5, 6), vy: rrand(3.5, 6.5), vz: Math.cos(driving.h) * rrand(3.5, 6) });
      continue;
    }
    g.shootCD -= dt;
    if (g.shootCD <= 0 && d < 40 && !dlgLines) {
      g.shootCD = g.boss ? rr(0.5, 1.0) : rr(0.8, 1.7);
      burst(g.x + Math.sin(g.h) * 0.8, 1.3, g.z + Math.cos(g.h) * 0.8, 4, 0.5, 0.5, 0.14, 1.0, 0.5, 0.3);
      AudioSys.play("gun", g.boss ? 0.5 : 0.35);
      const fast = (driving ? Math.abs(driving.speed) : player.speed) > 6;
      if (Math.random() < clamp((g.boss ? 0.6 : 0.42) - d * 0.008 - (fast ? 0.15 : 0), 0.05, 0.6)) hurt(Math.round((g.boss ? 10 : 7) * (driving ? 0.6 : 1)));
    }
    const sw = moving ? Math.sin(g.walkPhase) * 0.4 : g.legL.rotation.x * 0.85;
    g.legL.rotation.x = sw; g.legR.rotation.x = -sw; g.armL.rotation.x = -sw * 0.7; g.armR.rotation.x = sw * 0.7;
    const kA = moving ? 0.95 : 0;
    g.kneeL.rotation.x = kA * Math.max(0, -Math.cos(g.walkPhase)); g.kneeR.rotation.x = kA * Math.max(0, Math.cos(g.walkPhase));
    g.mesh.position.set(g.x, groundY(g.x, g.z), g.z); g.mesh.rotation.y = g.h;
  }
}

// ---------- input ----------
const keys = new Set();
let actA = false, actB = false, bHeld = false;   // actA/actB edge-triggered, bHeld = sprint hold
addEventListener("keydown", e => {
  if (e.code === "Enter" || (e.code === "Space" && dlgLines)) { advanceDialogue(); e.preventDefault(); return; }
  if (e.code === "KeyE") actA = true;
  if (e.code === "KeyB") actB = true;
  if (e.code === "KeyQ") { cycleWeapon(); e.preventDefault(); return; }
  if (e.code === "Tab") { wheelOpen ? closeWheel() : openWheel(); e.preventDefault(); return; }
  if (e.code === "KeyP") { phoneOpen ? closePhone() : openPhone(); e.preventDefault(); return; }
  if (e.code === "KeyM") { mapOpen ? closeMap() : openMap(); e.preventDefault(); return; }
  if (e.code === "KeyT") { talkTo(nearestTalkNPC()); e.preventDefault(); return; }
  if (e.code === "KeyF") actP = true;
  keys.add(e.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.code));

// floating joystick (left side)
const elJoy = dom("joy"), elKnob = dom("knob");
let joyId = null, joyOx = 0, joyOy = 0, joyX = 0, joyY = 0;
addEventListener("pointerdown", e => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen || tutOpen || styleOpen || arcadeOpen) return;
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

const btnA = dom("btnA"), btnB = dom("btnB"), brakeBtn = dom("brake"), boostBtn = dom("boost"), punchBtn = dom("punch"), fireBtn = dom("fireBtn"), fishBtn = dom("fishBtn");
const climbBtn = dom("climbbtn"), diveBtn = dom("divebtn");
const doorBtn = dom("doorbtn");
doorBtn.addEventListener("click", () => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen || styleOpen || arcadeOpen) return;
  if (inside) exitBuilding(); else { const e = nearEnterable(); if (e) enterBuilding(e); }
});
const talkBtn = dom("talkbtn");
talkBtn.addEventListener("click", () => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen || styleOpen || arcadeOpen) return;
  talkTo(nearestTalkNPC());
});
const decorBtn = dom("decorbtn");
const canDecorate = () => inside && intTheme === "home" && ownsAnyProp();
decorBtn.addEventListener("click", () => {
  if (state.phase !== "play" || dlgLines || garageOpen || statsOpen || styleOpen || arcadeOpen) return;
  if (canDecorate()) openStyleShop("decor");
});
let brakeHeld = false, boostHeld = false, boostMeter = 1, climbHeld = false, diveHeld = false;
btnA.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actA = true; });
btnB.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actB = true; bHeld = true; });
brakeBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); brakeHeld = true; });
boostBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); boostHeld = true; });
climbBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); climbHeld = true; });
diveBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); diveHeld = true; });
punchBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actP = true; });
fireBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); actP = true; });
fishBtn.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); if (state.phase === "play" && !dlgLines) fishTap(); });
addEventListener("pointerup", () => { bHeld = false; brakeHeld = false; boostHeld = false; climbHeld = false; diveHeld = false; });
addEventListener("pointercancel", () => { bHeld = false; brakeHeld = false; boostHeld = false; climbHeld = false; diveHeld = false; });
// keyboard nitro (Shift) while driving
const boosting = () => (boostHeld || keys.has("ShiftLeft") || keys.has("ShiftRight")) && boostMeter > 0.04;   // nitro in a car, lift on a jetpack
// keyboard handbrake (Space) while driving
const braking = () => brakeHeld || (!!driving && keys.has("Space") && !dlgLines);
// aircraft vertical controls: dedicated ▲/▼ buttons, or Shift/Space on keyboard
const ascendInput = () => climbHeld || boostHeld || keys.has("ShiftLeft") || keys.has("ShiftRight");
const descendInput = () => diveHeld || brakeHeld || (keys.has("Space") && !dlgLines);

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
function findCollider(x, z, r) {                          // like hitsCollider, but hands back which box (so we
  for (let ci = colCell(x - r); ci <= colCell(x + r); ci++)   // can tell whether it's a knockable prop)
    for (let cj = colCell(z - r); cj <= colCell(z + r); cj++) {
      const arr = colGrid.get(ci + "," + cj); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz < r * r) return b;
      }
    }
  return null;
}
function hitsCollider(x, z, r) { return findCollider(x, z, r) !== null; }
function moveWithCollision(o, dx, dz, r) {
  if (inside && o === player) {                          // confined to the interior room
    o.x = clamp(o.x + dx, INT.x - 9.3, INT.x + 9.3);
    o.z = clamp(o.z + dz, INT.z - 6.3, INT.z + 7.2);
    return;
  }
  let nx = clamp(o.x + dx, WB.x0, WB.x1);
  let hit = findCollider(nx, o.z, r);
  if (!hit) o.x = nx; else { tryKnockProp(hit, o); if (driving === o) { o.speed *= -0.25; carHit(o); } }
  let nz = clamp(o.z + dz, WB.z0, o === player ? SWIM_Z1 : WB.z1);   // only the player can wade in and swim
  hit = findCollider(o.x, nz, r);
  if (!hit) o.z = nz; else { tryKnockProp(hit, o); if (driving === o) { o.speed *= -0.25; carHit(o); } }
}

// ---------- prop physics: trash cans & hydrants tumble when bumped hard enough ----------
// they're InstancedMesh (one draw call for the whole city), so a "knocked" instance isn't a separate
// Object3D — it's an entry in this list whose matrix we recompute and push into the instance buffer
// every frame, same tumble/settle approach as the ragdoll (gravity, ground bounce, spin, friction),
// just without limbs. Once it settles, we stop simulating it and leave the final matrix in place.
function registerKnockable(im, idx, x, y, z, rot, collider) {
  const p = { im, idx, x, y, z, rx: 0, ry: rot, rz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, collider, active: false };
  knockableProps.push(p);
  colliderToProp.set(collider, p);
}
function knockProp(p, impulse) {
  if (p.active) return;
  disableCollider(p.collider);      // a toppled trash can shouldn't keep blocking foot/car traffic
  p.active = true;
  p.vx = impulse.vx; p.vy = impulse.vy; p.vz = impulse.vz;
  p.wx = rrand(-6, 6); p.wy = rrand(-3, 3); p.wz = rrand(-6, 6);
  activeProps.push(p);
}
function tryKnockProp(collider, mover) {
  const p = colliderToProp.get(collider);
  if (!p || p.active) return;
  const spd = Math.abs(mover.speed || 0);
  if (spd < 1.4) return;                                  // a gentle bump shouldn't send it flying
  const h = mover.h != null ? mover.h : Math.atan2(mover.x - p.x, mover.z - p.z);
  const kick = clamp(spd * 0.32, 1.2, 8);
  knockProp(p, { vx: Math.sin(h) * kick, vy: kick * 0.4 + 1.2, vz: Math.cos(h) * kick });
}
function updatePropPhysics(dt) {
  for (let i = activeProps.length - 1; i >= 0; i--) {
    const p = activeProps[i];
    p.vy -= RAG_G * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const gy = groundY(p.x, p.z) + 0.05;
    let grounded = false;
    if (p.y <= gy) {
      p.y = gy; grounded = true;
      p.vy = p.vy < -0.6 ? -p.vy * 0.3 : 0;
      const fr = Math.exp(-2.6 * dt);                       // rolls a bit further than a body would
      p.vx *= fr; p.vz *= fr;
      p.wx *= Math.exp(-2.2 * dt); p.wy *= Math.exp(-2.2 * dt); p.wz *= Math.exp(-2.2 * dt);
    } else {
      p.vx *= Math.exp(-0.2 * dt); p.vz *= Math.exp(-0.2 * dt);
    }
    p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
    tmpP.set(p.x, p.y, p.z);
    tmpQ.setFromEuler(propEuler.set(p.rx, p.ry, p.rz));
    tmpM.compose(tmpP, tmpQ, tmpS);
    p.im.setMatrixAt(p.idx, tmpM);
    p.im.instanceMatrix.needsUpdate = true;
    const slow = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz < 0.03 && p.wx * p.wx + p.wy * p.wy + p.wz * p.wz < 0.08;
    if (grounded && slow) activeProps.splice(i, 1);         // done tumbling — leave it lying where it stopped
  }
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
const elLvlText = dom("lvltext"), elLvlFill = dom("lvlfill");
const elHealth = dom("health"), elHealthFill = dom("healthfill");
let lastLvlShown = -1, lastXpShown = -1;
const mapCtx = dom("minimap").getContext("2d");
const elSpeedo = dom("speedo"), spCtx = elSpeedo.getContext("2d");
let lastMoneyShown = -1, lastBtnA = "", lastBtnB = "";

// speedometer / gear dial (drawn while driving)
function drawSpeedo(spd, boost, fuelPct) {
  const S = 92, cx = 46, cy = 46, R = 35, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  spCtx.clearRect(0, 0, S, S);
  spCtx.fillStyle = "rgba(20,28,24,.82)"; spCtx.beginPath(); spCtx.arc(cx, cy, 44, 0, 7); spCtx.fill();
  spCtx.lineCap = "round";
  spCtx.lineWidth = 5; spCtx.strokeStyle = "rgba(255,255,255,.15)";
  spCtx.beginPath(); spCtx.arc(cx, cy, R, a0, a1); spCtx.stroke();
  const kmh = Math.min(220, Math.abs(spd) * 5.5), f = kmh / 220;
  spCtx.strokeStyle = f > 0.8 ? "#ff5b5b" : "#9fe6a0";
  spCtx.beginPath(); spCtx.arc(cx, cy, R, a0, a0 + (a1 - a0) * f); spCtx.stroke();
  const na = a0 + (a1 - a0) * f;
  spCtx.strokeStyle = "#ffd166"; spCtx.lineWidth = 2.5;
  spCtx.beginPath(); spCtx.moveTo(cx, cy); spCtx.lineTo(cx + Math.cos(na) * R * 0.86, cy + Math.sin(na) * R * 0.86); spCtx.stroke();
  spCtx.textAlign = "center";
  spCtx.fillStyle = "#fff"; spCtx.font = "bold 17px sans-serif"; spCtx.fillText(Math.round(kmh), cx, cy + 4);
  spCtx.fillStyle = "#9fe6a0"; spCtx.font = "bold 8px sans-serif"; spCtx.fillText("KM/H", cx, cy + 14);
  const gear = spd < -0.5 ? "R" : Math.abs(spd) < 0.5 ? "N" : Math.abs(spd) < 9 ? "1" : Math.abs(spd) < 18 ? "2" : "3";
  spCtx.fillStyle = "#ffd166"; spCtx.font = "bold 12px sans-serif"; spCtx.fillText(gear, cx, cy - 13);
  // nitro meter + fuel gauge (bottom bars)
  const bw = 52, bx = cx - bw / 2;
  spCtx.fillStyle = "rgba(255,255,255,.16)"; spCtx.fillRect(bx, 78, bw, 4);
  spCtx.fillStyle = (boost || 0) > 0.25 ? "#ff9d2e" : "#ff5b5b"; spCtx.fillRect(bx, 78, bw * (boost || 0), 4);
  const fp = (fuelPct || 0) / 100;
  spCtx.fillStyle = "rgba(255,255,255,.16)"; spCtx.fillRect(bx, 85, bw, 4);
  spCtx.fillStyle = fp > 0.3 ? "#7fd6ff" : "#ff5b5b"; spCtx.fillRect(bx, 85, bw * fp, 4);
}

function nearestCar() {
  let best = null, bd = Infinity;
  const consider = (c, range) => { const d = dist2(player.x, player.z, c.x, c.z); if (d < range && d < bd) { bd = d; best = c; } };
  for (const c of cars) if (!c.locked) consider(c, 25);     // your own cars (wider reach)
  for (const t of traffic) if (!t.jacked) consider(t, 16);  // ...or jack any street car nearby
  for (const hv of helis) consider(hv, 26);                 // ...or hop in the chopper
  for (const bt of boats) consider(bt, 28);                 // ...or take a boat at the shore
  for (const pl of planes) consider(pl, 30);                // ...or a plane at the airport
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
      return { title: STR.raceTitle + " · " + STR.circuits[C.id].name, text: STR.raceProgress(race.cp + 1, C.cps.length) + " · " + STR.raceTimer(Math.ceil(race.t)) + " · " + STR.goldTarget(goldTime(C)), x: cp[0], z: cp[1] };
    }
    const evo = eventObjective();
    if (evo) return evo;
    if (side.stage === "carry") return { title: STR.freeplay, text: STR.sideJobGo, x: side.x, z: side.z };
    if (sideUnlocked()) return { title: STR.freeplay, text: STR.sideJobAt, x: DEPOT.x, z: DEPOT.z };
    return { title: STR.freeplay, text: "", x: undefined };
  }
  return { title: state.mi < M.length ? STR.missionTag(state.mi + 1) + " · " + M[state.mi].title : "", text: "…" };
}

function updateHUD() {
  drawCombo();
  const m = Math.floor(state.money);
  if (m !== lastMoneyShown) { elMoney.textContent = STR.money(m); lastMoneyShown = m; }
  const rate = incomeRate();
  elIncome.textContent = rate ? STR.incomeRate(rate) : "";
  elPalms.textContent = STR.palmCount(palmsGot(), PALMS.length);
  if (elLvlText) {
    const capped = state.lvl >= LVL_MAX;
    const need = capped ? 1 : xpNeed(state.lvl);
    const pct = capped ? 100 : Math.max(0, Math.min(100, state.xp / need * 100));
    if (state.lvl !== lastLvlShown) { elLvlText.textContent = STR.lvlBadge(state.lvl); lastLvlShown = state.lvl; }
    const p100 = Math.round(pct);
    if (p100 !== lastXpShown) { elLvlFill.style.width = p100 + "%"; lastXpShown = p100; }
  }
  const heat = heatActive();
  elWanted.textContent = heat > 0 ? "\u2605".repeat(heat) : "";
  if (health < 100) { elHealth.style.display = "block"; elHealthFill.style.width = health + "%"; elHealthFill.style.background = health > 50 ? "#9fe6a0" : health > 25 ? "#ffd166" : "#ff5b5b"; }
  else if (elHealth.style.display !== "none") elHealth.style.display = "none";

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
      else if (nearProp()) { const pr = nearProp(); b = state[pr.flag] ? STR.btnRest : STR.btnBuyProp(pr.label, pr.cost); }
      else if (nearShop()) { b = nearShop().kind === "wardrobe" ? "👕 TRY ON" : "💈 HAIRCUT"; }
      else {
        const pc = nearestPersonalCar();
        if (pc) b = pc.locked ? STR.btnBuyCar(STR.pcars[pc.pid].name, pc.price) : STR.btnRepaint;
        else b = STR.btnSprint;
      }
    }
  }
  if (b !== lastBtnB) { btnB.style.display = b ? "block" : "none"; btnB.textContent = b; lastBtnB = b; }

  // brake/boost buttons + speedometer: only while driving · punch: only on foot
  const drive = driving && !dlgLines && !garageOpen && !statsOpen && !styleOpen;
  const flying = drive && (driving.heli || driving.plane);   // aircraft use ▲/▼ instead of boost/brake
  brakeBtn.style.display = (drive && !flying) ? "block" : "none";
  boostBtn.style.display = (drive && !flying) ? "block" : "none";
  climbBtn.style.display = flying ? "block" : "none";
  diveBtn.style.display = flying ? "block" : "none";
  const treasureHere = swimming && nearTreasure(player.x, player.z) >= 0;
  punchBtn.style.display = (!driving && (!swimming || treasureHere) && !dlgLines && !garageOpen && !statsOpen && !styleOpen && !arcadeOpen) ? "block" : "none";
  { const w = armed(); punchBtn.textContent = treasureHere ? "🤿 DIVE" : (inside && intTheme === "bowling") ? "🎳 BOWL" : w ? "🔫 " + ammoOf(w) : (!w && nearCourtPlay()) ? "🏀 SHOOT" : "PUNCH"; }
  fishBtn.style.display = (driving && driving.boat && Math.abs(driving.speed) < 0.8 && !dlgLines) ? "block" : "none";
  fishBtn.textContent = fishing.stage === "bite" ? "❗ REEL!" : fishing.stage === "waiting" ? "🎣 …" : "🎣 CAST";
  // dedicated FIRE control only appears once a weapon's actually drawn (not indoors bowling, not driving)
  { const w = armed(); fireBtn.style.display = (w && !inside && !driving && !swimming && !dlgLines && !garageOpen && !statsOpen && !styleOpen && !arcadeOpen) ? "block" : "none"; if (w) fireBtn.textContent = "🔥 " + ammoOf(w); }
  const menus = dlgLines || garageOpen || statsOpen || styleOpen || arcadeOpen;
  const showDoor = !menus && (inside || !!nearEnterable());
  doorBtn.style.display = showDoor ? "block" : "none";
  if (showDoor) doorBtn.textContent = inside ? "🚪 EXIT" : "🚪 ENTER";
  decorBtn.style.display = (!menus && canDecorate()) ? "block" : "none";
  arcadeBtn.style.display = (!menus && nearCabinet()) ? "block" : "none";
  talkBtn.style.display = (!menus && !driving && !inside && !!nearestTalkNPC()) ? "block" : "none";
  if (drive) { elSpeedo.style.display = "block"; drawSpeedo(driving.speed, boostMeter, fuel); }
  else if (elSpeedo.style.display !== "none") elSpeedo.style.display = "none";

  if (photoMode) { missionMarker.group.visible = false; sideMarker.group.visible = false; crookMarker.group.visible = false; }
}

// the maps cover a symmetric window wide enough to include the airport (west) and beach (south),
// which sit outside the building grid — otherwise the player/markers fall off the map edge there.
const MAPR = 1980;
function drawMinimap(t) {
  const S = 132, VIEWR = 300, sc = S / (2 * VIEWR);
  // render into a device-pixel-ratio backing store so the radar stays crisp on hi-DPI screens
  const dpr = Math.min(devicePixelRatio || 1, 3), buf = Math.round(S * dpr);
  if (mapCtx.canvas.width !== buf) { mapCtx.canvas.width = mapCtx.canvas.height = buf; }
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapCtx.clearRect(0, 0, S, S);
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z;
  const py = driving ? (driving.y || 0) : player.y, h = driving ? driving.h : player.h;
  // north-up, player-centred + zoomed local window (like a phone nav app) so nearby streets
  // actually read at radar size, instead of the whole city being squeezed into a few px
  const wx = x => (x - px + VIEWR) * sc, wz = z => (z - pz + VIEWR) * sc;
  // Google-Maps-style light theme: warm off-white land, soft sand + water band along the beach south
  // of the grid, bordered white roads (a darker under-stroke + a lighter fill reads as a paved shoulder
  // even at radar size), muted park green — legible in daylight and at a glance, unlike a dark radar.
  mapCtx.fillStyle = "#eef0ea"; mapCtx.fillRect(0, 0, S, S);
  const seaTop = wz(HALF);
  mapCtx.fillStyle = "#f3e4b8"; mapCtx.fillRect(0, seaTop, S, wz(SEA_Z) - seaTop);               // beach sand
  mapCtx.fillStyle = "#aed4e8"; mapCtx.fillRect(0, wz(SEA_Z), S, S);                             // ocean
  mapCtx.strokeStyle = "#d7cfba"; mapCtx.lineWidth = 6;
  for (let k = 0; k <= N; k++) {
    const rc = roadC(k), p = wx(rc), q = wz(rc);
    mapCtx.beginPath(); mapCtx.moveTo(p, 0); mapCtx.lineTo(p, S); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(0, q); mapCtx.lineTo(S, q); mapCtx.stroke();
  }
  mapCtx.strokeStyle = "#ffffff"; mapCtx.lineWidth = 3.4;
  for (let k = 0; k <= N; k++) {
    const rc = roadC(k), p = wx(rc), q = wz(rc);
    mapCtx.beginPath(); mapCtx.moveTo(p, 0); mapCtx.lineTo(p, S); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(0, q); mapCtx.lineTo(S, q); mapCtx.stroke();
  }
  mapCtx.fillStyle = "#c8e6ba";
  for (const key of PARKS) {
    const [i, j] = key.split(",").map(Number);
    mapCtx.fillRect(wx(blockMin(i)), wz(blockMin(j)), BLOCK * sc, BLOCK * sc);
  }
  // gang turf: tinted circles (gang colour while hostile, green once captured)
  const GANG_FILL = ["rgba(210,60,60,.22)", "rgba(60,110,220,.22)", "rgba(50,170,90,.22)"];
  const GANG_RING = ["rgba(200,50,50,.85)", "rgba(50,100,210,.85)", "rgba(40,150,80,.85)"];
  GANGS.forEach((G, gi) => {
    const gx = wx(G.x), gz = wz(G.z), gr = G.r * sc;
    mapCtx.fillStyle = G.captured ? "rgba(60,170,90,.18)" : GANG_FILL[gi];
    mapCtx.beginPath(); mapCtx.arc(gx, gz, gr, 0, 7); mapCtx.fill();
    mapCtx.strokeStyle = G.captured ? "rgba(50,150,80,.8)" : GANG_RING[gi];
    mapCtx.lineWidth = 1.2; mapCtx.beginPath(); mapCtx.arc(gx, gz, gr, 0, 7); mapCtx.stroke();
  });
  for (const b of BIZ) {
    mapCtx.fillStyle = state.owned[b.id] ? "#34a853" : "#f4b400";
    mapCtx.beginPath(); mapCtx.arc(wx(b.x), wz(b.z), 3, 0, 7); mapCtx.fill();
    mapCtx.strokeStyle = "#fff"; mapCtx.lineWidth = 0.8; mapCtx.stroke();
  }
  // garage (square) + owned personal cars (blue dots)
  mapCtx.fillStyle = "#1a73e8";
  mapCtx.fillRect(wx(GARAGE.x) - 3, wz(GARAGE.z) - 3, 6, 6);
  for (const c of cars) if (c.personal && !c.locked) {
    mapCtx.fillStyle = "#1a73e8";
    mapCtx.beginPath(); mapCtx.arc(wx(c.x), wz(c.z), 2.5, 0, 7); mapCtx.fill();
  }
  // street-race start gates (freeplay only)
  if (state.mi >= M.length) {
    mapCtx.fillStyle = "#5f6368";
    for (const C of CIRCUITS)
      mapCtx.fillRect(wx(C.start.x) - 2.5, wz(C.start.z) - 2.5, 5, 5);
  }
  mapCtx.fillStyle = "#5f6368"; mapCtx.font = "8px sans-serif"; mapCtx.textAlign = "center";
  mapCtx.fillText("🏀", wx(COURT.x), wz(COURT.z) + 3);
  mapCtx.fillStyle = "#f4b400";
  for (const tr of treasures) if (!tr.taken) { mapCtx.beginPath(); mapCtx.arc(wx(tr.x), wz(tr.z), 2, 0, 7); mapCtx.fill(); }
  mapCtx.fillStyle = "#f9a825";
  for (let i = 0; i < PALMS.length; i++) {
    if (palmCollected[i]) continue;
    mapCtx.fillRect(wx(PALMS[i][0]) - 1, wz(PALMS[i][1]) - 1, 2.4, 2.4);
  }
  for (const p of police) if (p.active) {
    mapCtx.fillStyle = "#ea4335";
    mapCtx.beginPath(); mapCtx.arc(wx(p.x), wz(p.z), 3, 0, 7); mapCtx.fill();
  }
  // airport icon (west) so the now-reachable airfield reads on the radar
  mapCtx.fillStyle = "#5f6368"; mapCtx.font = "8px sans-serif"; mapCtx.textAlign = "center";
  mapCtx.fillText("✈", wx(AIRPORT.x + 30), wz(AIRPORT.z) + 3);
  // nemesis crew (orange) + the boss (flashing skull-red, bigger) so you can see them coming
  for (const g of nemGoons) if (g.alive) {
    if (g.boss) { mapCtx.fillStyle = (t * 4 | 0) % 2 ? "#d50000" : "#ff8a80"; mapCtx.beginPath(); mapCtx.arc(wx(g.x), wz(g.z), 5, 0, 7); mapCtx.fill(); }
    else { mapCtx.fillStyle = "#ff8c3a"; mapCtx.beginPath(); mapCtx.arc(wx(g.x), wz(g.z), 2.6, 0, 7); mapCtx.fill(); }
  }
  if (crook.active) {   // fleeing crook (flashing)
    mapCtx.fillStyle = (t * 3 | 0) % 2 ? "#ff5b5b" : "#5f6368";
    mapCtx.beginPath(); mapCtx.arc(wx(crook.x), wz(crook.z), 3.5, 0, 7); mapCtx.fill();
  }
  if (medic.stage !== "idle") {   // paramedic target
    const mt = medic.stage === "pickup" ? medic : HOSPITAL;
    mapCtx.fillStyle = "#00acc1";
    mapCtx.beginPath(); mapCtx.arc(wx(mt.x), wz(mt.z), 3.5, 0, 7); mapCtx.fill();
  }
  const obj = currentObjective();
  if (obj.x !== undefined && (t * 2 | 0) % 2 === 0) {
    mapCtx.fillStyle = "#f4b400";
    mapCtx.beginPath(); mapCtx.arc(wx(obj.x), wz(obj.z), 4.5, 0, 7); mapCtx.fill();
  }
  const mpx = S / 2, mpz = S / 2;
  if (py > 4) {   // airborne: a growing ring under the blue dot reads as altitude, like a radar contact
    mapCtx.strokeStyle = "rgba(26,115,232,.45)"; mapCtx.lineWidth = 1.2;
    mapCtx.beginPath(); mapCtx.arc(mpx, mpz, clamp(py * 0.035, 3, 11), 0, 7); mapCtx.stroke();
  }
  // "you are here" halo + heading cone, in the same blue Google Maps uses for the current-location dot
  const pulse = 0.5 + Math.sin(t * 3) * 0.15;
  mapCtx.fillStyle = "rgba(26,115,232,.16)"; mapCtx.beginPath(); mapCtx.arc(mpx, mpz, 11 * pulse + 6, 0, 7); mapCtx.fill();
  mapCtx.save();
  mapCtx.translate(mpx, mpz);
  mapCtx.rotate(Math.atan2(Math.cos(h), Math.sin(h)));
  mapCtx.fillStyle = "rgba(26,115,232,.5)";
  mapCtx.beginPath(); mapCtx.moveTo(9, 0); mapCtx.lineTo(-3, 6); mapCtx.lineTo(-3, -6); mapCtx.closePath(); mapCtx.fill();   // heading cone
  mapCtx.restore();
  mapCtx.fillStyle = "#ffffff"; mapCtx.beginPath(); mapCtx.arc(mpx, mpz, 5, 0, 7); mapCtx.fill();
  mapCtx.fillStyle = "#1a73e8"; mapCtx.beginPath(); mapCtx.arc(mpx, mpz, 3.6, 0, 7); mapCtx.fill();
}

// ---------- full-screen city map ----------
let mapOpen = false;
const mapScreen = dom("mapscreen"), mapCanvas = dom("mapcanvas"), mapTitle = dom("maptitle"), mapCloseBtn = dom("mapclose");
if (mapScreen.style) mapScreen.style.cssText = "position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(8,10,14,.93);z-index:80;";
if (mapTitle.style) { mapTitle.textContent = "🗺 CITY MAP"; mapTitle.style.cssText = "color:#ffd166;font-weight:700;letter-spacing:2px;font-size:15px;"; }
if (mapCloseBtn.style) { mapCloseBtn.textContent = "✕ Close"; mapCloseBtn.style.cssText = "padding:9px 16px;border-radius:12px;color:#fff;background:rgba(60,42,42,.92);border:1px solid rgba(255,205,140,.3);font-size:14px;"; }
if (mapCanvas.style) mapCanvas.style.cssText = "border:1px solid rgba(255,205,140,.25);border-radius:14px;background:#10171a;max-width:92vw;max-height:74vh;";
function closeMap() { mapOpen = false; mapScreen.style.display = "none"; }
function openMap() { if (state.phase !== "play" || dlgLines) return; mapOpen = true; mapScreen.style.display = "flex"; drawFullMap(); }
mapCloseBtn.addEventListener && mapCloseBtn.addEventListener("click", closeMap);
function dot(ctx, x, z, sc, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc((x + MAPR) * sc, (z + MAPR) * sc, r, 0, 7); ctx.fill(); }
function drawFullMap() {
  const cv = mapCanvas; if (!cv.getContext) return;
  const S = Math.max(280, Math.min(innerWidth * 0.9, innerHeight * 0.72)) | 0;
  // hi-DPI backing store so the full map is sharp; CSS sizes the display box to S px
  const dpr = Math.min(devicePixelRatio || 1, 2), buf = Math.round(S * dpr);
  if (cv.width !== buf) { cv.width = cv.height = buf; cv.style.width = cv.style.height = S + "px"; }
  const ctx = cv.getContext("2d"), sc = S / (2 * MAPR);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const Wx = x => (x + MAPR) * sc, Wz = z => (z + MAPR) * sc;
  ctx.clearRect(0, 0, S, S);
  // base = the road/ground colour; district blocks paint over it, leaving the road grid showing through
  ctx.fillStyle = "#dccfa3"; ctx.fillRect(0, 0, S, S);
  const B = Math.ceil(BLOCK * sc), cen = (N - 1) / 2;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const key = i + "," + j, dc = Math.max(Math.abs(i - cen), Math.abs(j - cen));
    let col;
    if (PARKS.has(key)) col = key === PLAZA_KEY ? "#c4b485" : "#6fa45e";       // plaza / parks
    else if (isGhetto(i, j)) col = "#a08c63";                                  // run-down quarter
    else if (isResid(i, j)) col = "#a7c585";                                   // suburbs
    else if (dc <= 1.5) col = "#9aa7b5";                                       // downtown
    else col = "#c6b889";                                                      // mid-city
    ctx.fillStyle = col; ctx.fillRect(Wx(blockMin(i)) | 0, Wz(blockMin(j)) | 0, B, B);
  }
  // district name labels
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(45,45,55,.5)";
  const DF = Math.max(10, S * 0.026 | 0);
  ctx.font = "bold " + DF + "px sans-serif";
  ctx.fillText("DOWNTOWN", Wx(bc(cen)), Wz(bc(cen)));
  ctx.fillText("SUBURBS", Wx(bc(1)), Wz(bc(1)));
  ctx.fillText("THE PROJECTS", Wx(bc(1)), Wz(bc(N - 2)));
  // gang turf rings
  const GF = ["rgba(200,60,60,.22)", "rgba(70,110,210,.22)", "rgba(60,180,90,.22)"], GR = ["rgba(220,70,70,.95)", "rgba(95,135,235,.95)", "rgba(80,205,110,.95)"];
  ctx.textAlign = "center"; ctx.lineWidth = 2;
  GANGS.forEach((G, gi) => {
    ctx.fillStyle = G.captured ? "rgba(120,200,140,.2)" : GF[gi];
    ctx.beginPath(); ctx.arc(Wx(G.x), Wz(G.z), G.r * sc, 0, 7); ctx.fill();
    ctx.strokeStyle = G.captured ? "rgba(150,230,160,.95)" : GR[gi]; ctx.beginPath(); ctx.arc(Wx(G.x), Wz(G.z), G.r * sc, 0, 7); ctx.stroke();
  });
  const F = Math.max(9, S * 0.02 | 0);
  // small markers
  for (const b of BIZ) dot(ctx, b.x, b.z, sc, 3.4, state.owned[b.id] ? "#2f9d5b" : "#d99a2e");
  for (const s of SHOPS) dot(ctx, s.x, s.z, sc, 2.8, "#a8429a");
  for (const a of atms) dot(ctx, a.x, a.z, sc, 1.5, "#2a8f64");
  for (const hv of helis) dot(ctx, hv.x, hv.z, sc, 3.4, "#ffffff");
  for (const bt of boats) dot(ctx, bt.x, bt.z, sc, 3.4, "#cfe8ff");
  for (const p of police) if (p.active) dot(ctx, p.x, p.z, sc, 4, "#ff3b3b");
  for (const g of nemGoons) if (g.alive) dot(ctx, g.x, g.z, sc, g.boss ? 6 : 3.4, g.boss ? "#ff2a2a" : "#ff8c3a");
  if (jobMarker.visible) dot(ctx, jobMarker.position.x, jobMarker.position.z, sc, 5, "#ffd24a");
  const obj = currentObjective(); if (obj.x !== undefined) dot(ctx, obj.x, obj.z, sc, 5, "#ffe24a");
  // landmark labels
  ctx.font = "bold " + F + "px sans-serif"; ctx.fillStyle = "#fff";
  const lbl = (x, z, t) => ctx.fillText(t, Wx(x), Wz(z) + F * 0.35);
  lbl(PLAZA.x, PLAZA.z, "🏛"); lbl(GARAGE.x, GARAGE.z, "🚗"); lbl(HOSPITAL.x, HOSPITAL.z, "🏥"); lbl(GAS.x, GAS.z, "⛽"); lbl(AIRPORT.x + 40, AIRPORT.z, "✈");
  ctx.font = "bold " + Math.max(8, F - 1) + "px sans-serif";
  GANGS.forEach(G => ctx.fillText((G.captured ? "🚩 " : "") + G.name, Wx(G.x), Wz(G.z) - G.r * sc - 3));
  // beach label along the south shore (airport now has its own on-map ✈ marker)
  ctx.textAlign = "center"; ctx.fillStyle = "#cfe0e8"; ctx.font = "bold " + F + "px sans-serif";
  ctx.fillText("🏖 BEACH", Wx(0), Math.min(S - 5, Wz(SEA_Z - 40)));
  // legend
  const leg = [["#9aa7b5", "Downtown"], ["#a7c585", "Suburb"], ["#a08c63", "Ghetto"], ["#6fa45e", "Park"]];
  const lw = F * 6.4, lh = leg.length * (F + 3) + 6, lx = S - lw - 3, ly0 = S - lh - 3;
  ctx.fillStyle = "rgba(12,14,18,.62)"; ctx.fillRect(lx, ly0, lw, lh);
  ctx.textAlign = "left"; ctx.font = Math.max(8, F - 2) + "px sans-serif";
  leg.forEach((L, i) => { const ly = ly0 + 4 + i * (F + 3); ctx.fillStyle = L[0]; ctx.fillRect(lx + 4, ly, F - 1, F - 1); ctx.fillStyle = "#eee"; ctx.fillText(L[1], lx + 4 + F + 3, ly + F - 2); });
  // player marker
  const px = driving ? driving.x : player.x, pz = driving ? driving.z : player.z, ph = driving ? driving.h : player.h;
  ctx.save(); ctx.translate(Wx(px), Wz(pz)); ctx.rotate(Math.atan2(Math.cos(ph), Math.sin(ph)));
  ctx.fillStyle = "#ff5a1f"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, 7); ctx.lineTo(-7, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------- confirm dialog (in-game Yes/No; native confirm() is blocked in sandboxed iframes) ----------
const elConfirm = dom("confirm");
let confirmCb = null;
function askConfirm(msg, cb) { dom("cmsg").textContent = msg; confirmCb = cb; elConfirm.style.display = "flex"; }
function closeConfirm() { elConfirm.style.display = "none"; confirmCb = null; }
dom("cyes").textContent = STR.confirmYes;
dom("cno").textContent = STR.confirmNo;
dom("cyes").addEventListener("click", () => { const cb = confirmCb; closeConfirm(); if (cb) cb(); });
dom("cno").addEventListener("click", closeConfirm);
function resetGame() { askConfirm(STR.confirmReset, () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); }); }

// ---------- first-launch tutorial ----------
const TUT_KEY = "palm_city_tut";
let tutOpen = false;
const elTut = dom("tutorial");
{
  dom("ttitle").textContent = STR.tutTitle;
  dom("tbody").innerHTML = STR.tutLines.map(s => '<div class="trow">' + s + "</div>").join("");
  const go = dom("tgo"); go.textContent = STR.tutBtn;
  go.addEventListener("click", () => { tutOpen = false; elTut.style.display = "none"; try { localStorage.setItem(TUT_KEY, "1"); } catch (e) {} });
}
function maybeTutorial() {
  let seen = false; try { seen = localStorage.getItem(TUT_KEY) === "1"; } catch (e) {}
  if (!seen) { tutOpen = true; elTut.style.display = "flex"; }
}

// ---------- intro overlay ----------
const elIntro = dom("intro");
function buildIntro() {
  elIntro.innerHTML = "";
  const mk = (cls, parent) => { const e = document.createElement("div"); if (cls) e.className = cls; if (parent) parent.append(e); return e; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- cinematic backdrop: glowing sun, lit city skyline, sea, swaying palms ----
  mk("sun", elIntro);
  const skyline = mk("layer skyline", elIntro);
  for (let i = 0; i < 16; i++) {
    const b = mk("bld", skyline);
    const w = Math.round(rnd(16, 34)), h = Math.round(rnd(40, 132));
    b.style.width = w + "px"; b.style.height = h + "px";
    const cols = Math.max(1, Math.floor(w / 9)), rows = Math.floor(h / 14);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++)
      if (Math.random() < 0.5) { const win = mk("", b); win.style.cssText = "position:absolute;width:3px;height:3px;background:#ffd98a;border-radius:1px;box-shadow:0 0 4px #ffd98a;left:" + (5 + c * 8) + "px;bottom:" + (8 + r * 12) + "px"; }
  }
  mk("layer sea", elIntro);
  const pl = mk("palm l", elIntro); pl.textContent = "🌴";
  const pr = mk("palm r", elIntro); pr.textContent = "🌴";

  // ---- hero content ----
  const hero = mk("hero", elIntro);
  const h1 = document.createElement("h1"); h1.textContent = STR.title;
  const tag = mk("tag", hero); tag.textContent = STR.tagline;
  const feats = mk("feats", hero);
  feats.innerHTML = STR.features.map(f => '<span class="feat">' + f + "</span>").join("");
  hero.insertBefore(h1, tag);
  const start = document.createElement("button");
  start.textContent = hasSave ? STR.continueGame : STR.start;
  start.addEventListener("click", () => beginPlay());
  hero.append(start);
  if (hasSave) {
    const reset = document.createElement("button");
    reset.className = "secondary"; reset.textContent = STR.newGame;
    reset.addEventListener("click", resetGame);
    hero.append(reset);
  }
  const hint = mk("hint", hero); hint.textContent = STR.controlsHint;
}
function beginPlay() {
  if (hasSave) { load(); applyOwnership(); }
  NEM.defeated = state.bossWins || 0;   // carry the nemesis NG+ difficulty across sessions
  refreshAch(false);           // seed already-earned achievements without re-announcing them
  elIntro.style.display = "none";
  state.phase = "play";
  AudioSys.init();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (state.mi < M.length) { mState = "wait"; mTimer = 0.7; }
  else mState = "done";
  maybeTutorial();
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
  dom("gx").addEventListener("click", closeGarage);
  dom("gbuy").addEventListener("click", buyCurrent);
  ["gmEngine", "gmTurbo", "gmTyres"].forEach((id, t) => dom(id).addEventListener("click", () => buyMod(garageCar, t)));
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
  // upgrade buttons (owned cars only)
  dom("gmods").style.display = c.locked ? "none" : "flex";
  if (!c.locked) {
    const m = state.mods[c.pid] || [0, 0, 0];
    const set = (id, key, t) => { const lv = m[t]; dom(id).textContent = lv >= MOD_MAX ? STR.modMax(STR.mods[key]) : STR.modLabel(STR.mods[key], lv, modCost(lv)); };
    set("gmEngine", "engine", 0); set("gmTurbo", "turbo", 1); set("gmTyres", "grip", 2);
  }
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
  { id: "goldrush", done: () => CIRCUITS.every(c => (state.medals[c.id] || 0) >= 3) },
  { id: "vigil",   done: () => (state.busts || 0) >= 5 },
  { id: "homeowner", done: () => ownsAnyProp() },
  { id: "medic",   done: () => (state.rescues || 0) >= 5 },
  { id: "tycoon",  done: () => (state.maxMoney || 0) >= 50000 },
  { id: "story",   done: () => state.mi >= M.length },
  { id: "lvl10",   done: () => (state.lvl || 1) >= 10 },
  { id: "lvl25",   done: () => (state.lvl || 1) >= 25 },
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
  const lvlVal = state.lvl >= LVL_MAX ? STR.lvlBadge(state.lvl) + " · MAX"
    : STR.lvlBadge(state.lvl) + " · " + Math.floor(state.xp) + "/" + xpNeed(state.lvl) + " XP";
  let html = '<div class="sgrid">' +
    cell(STR.statLevel, lvlVal + "  (+" + Math.round((lvlMult - 1) * 100) + "% earnings)") +
    cell(STR.statCash, STR.money(Math.floor(state.money))) +
    cell(STR.statBiz, ownedBizCount() + "/" + BIZ.length) +
    cell(STR.statCars, ownedCarCount() + "/" + PCARS.length) +
    cell(STR.statPalms, palmsGot() + "/" + PALMS.length) +
    cell(STR.statJump, STR.statJumpVal(state.bestJump || 0)) +
    cell("💥 Best Rampage", "$" + (state.bestRampage || 0).toLocaleString()) +
    cell("☠ Boss Takedowns", "" + (state.bossWins || 0)) +
    cell(STR.statRacesWon, Object.keys(state.races).length + "/" + CIRCUITS.length) +
    "</div>";
  html += '<div class="shead">' + STR.statBestLaps + "</div>";
  html += '<div class="sgrid">';
  for (const C of CIRCUITS) html += cell(STR.medalEmoji(state.medals[C.id] || 0) + " " + STR.circuits[C.id].name, STR.statSeconds(state.races[C.id] || 0));
  html += "</div>";
  // local leaderboard: rivals + your best lap, ranked per circuit
  html += '<div class="shead">' + STR.leaderboard + "</div>";
  const RIVALS = [["Vince", 0.54], ["Rosa", 0.63], ["Marco", 0.72], ["Tony", 0.81]];
  for (const C of CIRCUITS) {
    const rows = RIVALS.map(r => ({ name: r[0], t: C.limit * r[1], you: false }));
    const you = state.races[C.id] || 0;
    if (you > 0) rows.push({ name: "YOU", t: you, you: true });
    rows.sort((a, b) => a.t - b.t);
    html += '<div class="lbtitle">' + STR.circuits[C.id].name + "</div>";
    rows.slice(0, 5).forEach((r, i) => { html += '<div class="lbrow' + (r.you ? " you" : "") + '"><span>' + (i + 1) + ". " + r.name + "</span><b>" + r.t.toFixed(1) + "s</b></div>"; });
  }
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

// ---------- style shop UI (wardrobe / barber): try looks on, the player changes live ----------
let styleOpen = false, styleKind = null, styleTab = "outfit";
const elStyle = dom("style");
function applyDecor(slot, idx) {
  state.decor[slot] = idx;
  if (inside && intTheme === "home") buildInterior("home");
  AudioSys.play("blip", 0.4); save();
}
function styleCfg() {
  if (styleKind === "decor") { const slot = styleTab, D = DECOR[slot]; return { list: D.opts, cur: state.decor[slot], apply: idx => applyDecor(slot, idx), dots: o => o.none ? [] : [o.c != null ? o.c : swatchTexCol[o.tex]] }; }
  if (styleKind === "ammo") return { list: WEAPONS, cur: (state.weapon == null ? -1 : state.weapon), apply: buyWeapon, dots: () => [], ammo: true };
  if (styleKind === "barber") {
    if (styleTab === "beard") return { list: BEARDS, cur: state.beard, apply: applyBeard, dots: it => it.none ? [] : [it.color] };
    return { list: HAIRCUTS, cur: state.haircut, apply: applyHaircut, dots: it => [it.color] };
  }
  if (styleTab === "jacket") return { list: JACKETS, cur: state.jacket, apply: applyJacket, dots: it => it.none ? [] : [it.color] };
  if (styleTab === "hat") return { list: HATS, cur: state.hat, apply: applyHat, dots: it => it.none ? [] : [it.color] };
  if (styleTab === "glasses") return { list: GLASSES, cur: state.glasses, apply: applyGlasses, dots: it => it.none ? [] : [it.color] };
  return { list: OUTFITS, cur: state.outfit, apply: applyOutfit, dots: it => [it.shirt, it.pants] };
}
function renderStyle() {
  dom("sytitle").textContent = styleKind === "ammo" ? "🔫 AMMO SHOP — buy weapons & ammo"
    : styleKind === "decor" ? "🎨 DECORATE YOUR APARTMENT"
    : styleKind === "barber" ? "💈 BARBER — pick a cut" : "👕 WARDROBE";
  const tabs = dom("sytabs"); tabs.innerHTML = "";
  if (styleKind === "ammo") tabs.style.display = "none";
  else {
    const tabSet = styleKind === "decor" ? Object.keys(DECOR).map(k => [k, DECOR[k].name])
      : styleKind === "barber" ? [["hair", "Hair"], ["beard", "Beard"]]
      : [["outfit", "Outfit"], ["jacket", "Jacket"], ["hat", "Hat"], ["glasses", "Glasses"]];
    tabs.style.display = "flex";
    tabSet.forEach(([k, lbl]) => {
      const t = document.createElement("button"); t.className = "sytab" + (styleTab === k ? " sel" : ""); t.textContent = lbl;
      t.addEventListener("click", () => { styleTab = k; renderStyle(); }); tabs.appendChild(t);
    });
  }
  const grid = dom("sygrid"); grid.innerHTML = "";
  const cfg = styleCfg();
  cfg.list.forEach((it, idx) => {
    const cell = document.createElement("div");
    cell.className = "syopt" + (idx === cfg.cur ? " sel" : "");
    const sw = document.createElement("div"); sw.className = "sysw";
    const dots = cfg.dots(it);
    if (!dots.length) { const d = document.createElement("div"); d.className = "sydot"; d.style.background = "repeating-linear-gradient(45deg,#555,#555 4px,#777 4px,#777 8px)"; sw.appendChild(d); }
    else dots.forEach(c => { const d = document.createElement("div"); d.className = "sydot"; d.style.background = "#" + (c >>> 0).toString(16).slice(-6).padStart(6, "0"); sw.appendChild(d); });
    const nm = document.createElement("div"); nm.className = "syname";
    nm.textContent = cfg.ammo ? it.name + "  $" + it.price + (state.ammo[it.id] === undefined ? "" : " · ammo " + (state.ammo[it.id] || 0)) : it.name;
    cell.appendChild(sw); cell.appendChild(nm);
    cell.addEventListener("click", () => { cfg.apply(idx); renderStyle(); });
    grid.appendChild(cell);
  });
}
function openStyleShop(kind) { styleKind = kind; styleTab = kind === "barber" ? "hair" : kind === "decor" ? "wall" : "outfit"; styleOpen = true; renderStyle(); elStyle.style.display = "flex"; }
function closeStyleShop() { styleOpen = false; styleKind = null; elStyle.style.display = "none"; }
dom("syx").addEventListener("click", closeStyleShop);
dom("sydone").addEventListener("click", closeStyleShop);
dom("stx").addEventListener("click", closeStats);
dom("stclose").textContent = STR.statsClose;
{
  const bb = dom("stbloom");
  bb.textContent = STR.bloomToggle(bloomOn);
  bb.addEventListener("click", () => { bloomOn = !bloomOn; bloomFailed = false; try { localStorage.setItem(BLOOM_KEY, bloomOn ? "1" : "0"); } catch (e) {} bb.textContent = STR.bloomToggle(bloomOn); });
  const wb = dom("stweather");
  wb.textContent = STR.weatherToggle(weatherMode);
  wb.addEventListener("click", () => { wb.textContent = STR.weatherToggle(cycleWeatherMode()); });
  const lb = dom("stlight");
  if (lb) {
    lb.textContent = lightLabel();
    lb.addEventListener("click", () => { applyDayMode(dayMode === "midday" ? "golden" : "midday", true); lb.textContent = lightLabel(); });
  }
  const ab = dom("stao");
  if (ab) {
    const aoLabel = () => "🌑 AO: " + (aoOn ? "On" : "Off");
    ab.textContent = aoLabel();
    ab.addEventListener("click", () => { aoOn = !aoOn; try { localStorage.setItem("palm_city_ao", aoOn ? "1" : "0"); } catch (e) {} ab.textContent = aoLabel(); });
  }
  const gx = dom("stgfx");
  if (gx) {
    const gfxLabel = () => "✨ Graphics: " + (gfxMode === "perf" ? "Performance" : "Quality");
    gx.textContent = gfxLabel();
    gx.addEventListener("click", () => { applyGfx(gfxMode === "perf" ? "quality" : "perf"); gx.textContent = gfxLabel(); toast(gfxMode === "perf" ? "⚡ Performance mode — smoother on slower devices" : "✨ Quality mode — crisp antialiased graphics"); });
  }
  const tb = dom("sttime");
  if (tb) {
    const timeLabel = () => "🕑 Time: " + (dayCycle ? "Day/Night" : "Always Day");
    tb.textContent = timeLabel();
    tb.addEventListener("click", () => { dayCycle = !dayCycle; try { localStorage.setItem("palm_city_cycle", dayCycle ? "1" : "0"); } catch (e) {} tb.textContent = timeLabel(); envUpdate(); toast(dayCycle ? "🌗 Day/night cycle ON" : "☀️ Locked to bright daytime — no more shifting"); });
  }
}
// flip resolution ceiling + MSAA and rebuild the offscreen chain so the change takes effect immediately
function applyGfx(mode) {
  gfxMode = mode;
  try { localStorage.setItem("palm_city_gfx", mode); } catch (e) {}
  PR_CAP = Math.min(DPR, mode === "perf" ? 1.25 : 2);
  PR_FLOOR = Math.min(PR_CAP, 1.0);
  msaaSamples = mode === "perf" ? 0 : 4;
  pr = PR_CAP;
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  bloomReady = false;   // buildBloom() rebuilds rtScene with the new sample count next frame
}
dom("streset").addEventListener("click", resetGame);
dom("streset").textContent = STR.newGame;

// lighting mood toggle: golden-hour (stylised) vs neutral midday (photoreal). persisted like bloom/mute.
function lightLabel() { return dayMode === "midday" ? "☀️ Midday" : "\u{1F305} Golden hour"; }
function applyDayMode(mode, refresh) {
  dayMode = mode === "midday" ? "midday" : "golden";
  const midday = dayMode === "midday";
  sun.color.setHex(midday ? 0xfff1da : 0xffd9a0);
  hemi.color.setHex(midday ? 0xdce8f6 : 0xffe8c4);
  renderer.toneMappingExposure = midday ? 1.18 : 1.3;
  gradeSat = midday ? 1.06 : 1.12;
  if (compMat) compMat.uniforms.uSat.value = gradeSat;
  try { localStorage.setItem("palm_city_light", dayMode); } catch (e) {}
  if (refresh) envUpdate();   // refresh sky / fog / sun intensity immediately (runtime toggle only)
}
applyDayMode(dayMode, false);   // startup: set lights only; the first frame's envUpdate does the rest

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

// photo mode: hide all HUD for a clean shot; you can still drive/walk to frame it
let photoMode = false;
function setPhoto(on) { photoMode = on; if (document.body.classList) document.body.classList.toggle("photo", on); }
dom("photobtn").addEventListener("click", () => { if (state.phase === "play" && !dlgLines && !garageOpen && !statsOpen && !styleOpen && !arcadeOpen) setPhoto(true); });
dom("photoclose").addEventListener("click", () => setPhoto(false));

// ---------- weapon wheel: switch between owned weapons in-world (built in JS, no markup) ----------
const ownedWeapons = () => WEAPONS.map((w, i) => ({ w, i })).filter(({ w }) => state.ammo[w.id] !== undefined);
function cycleWeapon() {
  const own = ownedWeapons(); if (!own.length) return;
  let at = own.findIndex(o => o.i === state.weapon);
  const next = own[(at + 1) % own.length];
  state.weapon = next.i; AudioSys.play("blip", 0.5); buzz(12);
  toast(next.w.name + " · " + (state.ammo[next.w.id] || 0)); save();
}
// restart the spring-in animation on a pop-up card each time it opens
function popIn(card) { if (!card || !card.classList) return; card.classList.remove("popin"); void card.offsetWidth; card.classList.add("popin"); }
let wheelOpen = false;
const wpnBtn = dom("wpnbtn"), wheelEl = dom("wpnwheel"), wheelCard = dom("wpnwheelcard");
wpnBtn.textContent = "🔫";
if (wpnBtn.style) wpnBtn.style.cssText = "position:absolute;right:16px;top:108px;width:50px;height:50px;border-radius:50%;font-size:21px;background:rgba(28,30,38,.72);color:#fff;border:1px solid rgba(255,205,140,.3);z-index:25;";
if (wheelEl.style) wheelEl.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(10,6,14,.42),rgba(6,3,10,.62));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:70;";
if (wheelCard.style) wheelCard.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;max-width:360px;justify-content:center;padding:20px;background:linear-gradient(165deg,rgba(40,32,50,.95),rgba(20,14,24,.96));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:22px;border:1px solid rgba(255,205,140,.32);box-shadow:0 20px 54px rgba(6,3,10,.62),inset 0 1px 1px rgba(255,255,255,.14);";
function closeWheel() { wheelOpen = false; wheelEl.style.display = "none"; }
function openWheel() {
  if (state.phase !== "play" || dlgLines) return;
  const own = ownedWeapons();
  if (!own.length) { toast("No weapons yet — buy one at the 🔫 Ammo Shop"); return; }
  wheelCard.innerHTML = "";
  const title = document.createElement("div"); title.textContent = "WEAPONS";
  title.style.cssText = "width:100%;text-align:center;color:#ffd166;font-weight:700;font-size:13px;letter-spacing:1px;"; wheelCard.appendChild(title);
  own.forEach(({ w, i }) => {
    const b = document.createElement("button"); b.className = "pe popbtn";
    b.innerHTML = w.name.replace(/^[^ ]+ /, m => m) + "<br><small style='opacity:.7'>" + (state.ammo[w.id] || 0) + " ammo</small>";
    b.style.cssText = "width:104px;height:62px;border-radius:14px;font-size:12px;line-height:1.25;color:#fff;background:linear-gradient(165deg,rgba(58,50,70,.96),rgba(36,30,46,.96));box-shadow:0 3px 9px rgba(0,0,0,.32),inset 0 1px 1px rgba(255,255,255,.12);border:2px solid " + (i === state.weapon ? "#ffd166" : "rgba(255,255,255,.14)") + ";";
    b.addEventListener("click", () => { state.weapon = i; save(); AudioSys.play("blip", 0.5); toast(w.name + " equipped"); closeWheel(); });
    wheelCard.appendChild(b);
  });
  wheelOpen = true; wheelEl.style.display = "flex"; popIn(wheelCard);
}
wpnBtn.addEventListener("click", () => wheelOpen ? closeWheel() : openWheel());
wheelEl.addEventListener("click", e => { if (e.target === wheelEl) closeWheel(); });

// ---------- phone: launch on-demand jobs from anywhere ----------
let phoneOpen = false;
const phoneBtn = dom("phonebtn"), phoneEl = dom("phone"), phoneCard = dom("phonecard");
phoneBtn.textContent = "📱";
if (phoneBtn.style) phoneBtn.style.cssText = "position:absolute;right:16px;top:166px;width:50px;height:50px;border-radius:50%;font-size:21px;background:rgba(28,30,38,.72);color:#fff;border:1px solid rgba(255,205,140,.3);z-index:25;";
if (phoneEl.style) phoneEl.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(10,6,14,.42),rgba(6,3,10,.62));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:70;";
if (phoneCard.style) phoneCard.style.cssText = "display:flex;flex-direction:column;gap:9px;width:300px;padding:20px;background:linear-gradient(165deg,rgba(40,32,50,.95),rgba(20,14,24,.96));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:22px;border:1px solid rgba(255,205,140,.32);box-shadow:0 20px 54px rgba(6,3,10,.62),inset 0 1px 1px rgba(255,255,255,.14);";
function closePhone() { phoneOpen = false; phoneEl.style.display = "none"; }
function openPhone() {
  if (state.phase !== "play" || dlgLines) return;
  phoneCard.innerHTML = "";
  const title = document.createElement("div"); title.textContent = "📱 JOBS";
  title.style.cssText = "text-align:center;color:#ffd166;font-weight:700;font-size:13px;letter-spacing:1px;margin-bottom:2px;"; phoneCard.appendChild(title);
  JOBS.forEach(J => {
    const b = document.createElement("button"); b.className = "pe popbtn";
    b.innerHTML = "<b>" + J.label + "</b><br><small style='opacity:.7'>" + J.desc + "</small>";
    b.style.cssText = "padding:12px;border-radius:14px;font-size:13px;line-height:1.3;color:#fff;text-align:left;background:linear-gradient(165deg,rgba(58,50,70,.96),rgba(36,30,46,.96));box-shadow:0 3px 9px rgba(0,0,0,.32),inset 0 1px 1px rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);";
    b.addEventListener("click", () => startJob(J.id));
    phoneCard.appendChild(b);
  });
  const close = document.createElement("button"); close.className = "pe popbtn"; close.textContent = "Close";
  close.style.cssText = "padding:9px;border-radius:12px;color:#fff;background:linear-gradient(165deg,rgba(96,52,52,.95),rgba(64,34,34,.95));box-shadow:0 3px 8px rgba(0,0,0,.3);border:1px solid rgba(255,160,140,.2);margin-top:4px;";
  close.addEventListener("click", closePhone); phoneCard.appendChild(close);
  phoneOpen = true; phoneEl.style.display = "flex"; popIn(phoneCard);
}
phoneBtn.addEventListener("click", () => phoneOpen ? closePhone() : openPhone());
phoneEl.addEventListener("click", e => { if (e.target === phoneEl) closePhone(); });

// ---------- consolidated HUD menu: one ☰ button replaces the floating 🔫/📱/🗺 buttons ----------
if (wpnBtn.style) wpnBtn.style.display = "none";
if (phoneBtn.style) phoneBtn.style.display = "none";
let menuOpen = false;
const menuBtn = dom("menubtn"), hudMenu = dom("hudmenu"), hudMenuCard = dom("hudmenucard");
menuBtn.textContent = "☰";
if (menuBtn.style) menuBtn.style.cssText = "position:absolute;right:16px;top:108px;width:50px;height:50px;border-radius:50%;font-size:22px;background:linear-gradient(160deg,rgba(50,42,60,.82),rgba(26,18,32,.82));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;border:1px solid rgba(255,205,140,.34);box-shadow:0 5px 16px rgba(8,4,12,.5),inset 0 1px 1px rgba(255,255,255,.14);z-index:25;";
if (hudMenu.style) hudMenu.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(10,6,14,.42),rgba(6,3,10,.62));backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:72;";
if (hudMenuCard.style) hudMenuCard.style.cssText = "display:flex;flex-direction:column;gap:9px;width:240px;padding:20px;background:linear-gradient(165deg,rgba(40,32,50,.95),rgba(20,14,24,.96));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:22px;border:1px solid rgba(255,205,140,.32);box-shadow:0 20px 54px rgba(6,3,10,.62),inset 0 1px 1px rgba(255,255,255,.14);";
function closeMenu() { menuOpen = false; hudMenu.style.display = "none"; }
function openMenu() {
  if (state.phase !== "play" || dlgLines) return;
  hudMenuCard.innerHTML = "";
  [["🔫 Weapons", openWheel], ["📱 Jobs", openPhone], ["🗺 Map", openMap]].forEach(([label, fn]) => {
    const b = document.createElement("button"); b.className = "pe popbtn"; b.textContent = label;
    b.style.cssText = "padding:13px;border-radius:14px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(165deg,rgba(58,50,70,.96),rgba(36,30,46,.96));box-shadow:0 3px 9px rgba(0,0,0,.32),inset 0 1px 1px rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);";
    b.addEventListener("click", () => { closeMenu(); fn(); });
    hudMenuCard.appendChild(b);
  });
  menuOpen = true; hudMenu.style.display = "flex"; popIn(hudMenuCard);
}
menuBtn.addEventListener("click", () => menuOpen ? closeMenu() : openMenu());
hudMenu.addEventListener("click", e => { if (e.target === hudMenu) closeMenu(); });

// ---------- actions ----------
function doActionA() {
  if (para || mount) return;                       // busy under the canopy / mid get-in animation
  if (driving) {                                   // exit car / chopper
    const c = driving;
    if ((c.heli || c.plane) && c.y > 3) {           // bail out midair -> parachute
      para = {}; player.x = c.x; player.z = c.z; player.y = c.y; player.speed = 0;
      driving = null; hero.group.visible = true;
      paraMesh.visible = true; paraMesh.position.set(player.x, player.y + 2.4, player.z);
      AudioSys.play("door", 0.6); toast("🪂 Parachute out!");
      return;
    }
    const rx = -Math.cos(c.h), rz = Math.sin(c.h);
    let ex = c.x + rx * 2.6, ez = c.z + rz * 2.6;
    if (hitsCollider(ex, ez, 0.5)) { ex = c.x - rx * 2.6; ez = c.z - rz * 2.6; }
    // owned cars + bikes play a get-off / dismount animation; everything else hops out instantly
    if (!c.heli && !c.plane && !c.boat && !c.wp) { startMount(c, "out", ex, ez); return; }
    player.x = clamp(ex, WB.x0, WB.x1); player.z = clamp(ez, WB.z0, SWIM_Z1);   // stepping off at sea -> swim
    player.h = c.h;
    c.speed = 0; c.lat = 0;
    driving = null;
    hero.group.visible = true;
    AudioSys.play("door", 0.8);
  } else {
    if (armed() && !holdup) {                        // armed at a store counter -> hold it up
      let sh = null, sd = 40;
      for (const s of SHOPS) { if (s.cd > 0) continue; const d = dist2(player.x, player.z, s.x, s.z); if (d < sd) { sd = d; sh = s; } }
      if (sh) { startHoldup(sh); return; }
    }
    let atm = null, ad = 6.25;                       // rob an ATM if you're standing right at one
    for (const a of atms) { if (a.cd > 0) continue; const d = dist2(player.x, player.z, a.x, a.z); if (d < ad) { ad = d; atm = a; } }
    if (atm) { robATM(atm); return; }
    const c = nearestCar();
    if (c) {
      if (c.wp && !c.jacked) {                      // carjacking a street car (traffic cars carry a .wp route)
        c.jacked = true;                            // stop its AI route — the player has the wheel now
        c.y = 0; c.vy = 0; c.lat = 0; c.rampCD = 0; c.airStart = 0;   // give it the player-physics fields
        c.heatMult = c.heatMult || 1.4;             // a stolen car runs a little hotter with the cops
        for (const n of npcs) if (dist2(n.x, n.z, c.x, c.z) < 225) { n.flee = 2.8; n.h = Math.atan2(n.x - c.x, n.z - c.z); }   // bystanders scatter
        registerCrime();                            // jacking draws police heat
        toast("🚗 Carjacked — floor it!"); buzz(30);
      }
      driving = c;
      // owned cars + bikes get a get-in / mount animation; aircraft, boats and jacked street cars board instantly
      if (!c.heli && !c.plane && !c.boat && !c.wp) startMount(c, "in");
      else hero.group.visible = !!c.jetski;   // jet-ski rider stays in view on the saddle
      if (!mount) AudioSys.play("door", 0.8);
      // one-time take-off tip the first time you ever board each aircraft (saved so it shows once)
      if (c.heli && !state.flewHeli) { state.flewHeli = true; toast("🚁 Hold ▲ to lift off — then steer with the stick"); save(); }
      else if (c.plane && !state.flewPlane) { state.flewPlane = true; toast("✈️ Hold forward to build speed, then ▲ to take off — keep your speed up!"); save(); }
    }
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
  { const pr = nearProp(); if (pr) { if (state[pr.flag]) restAtHome(); else buyProp(pr); return; } }
  { const sh = nearShop(); if (sh) { openStyleShop(sh.kind); return; } }
  const pc = nearestPersonalCar();
  if (pc) openShowroom(pc);
}

// ---------- simulation ----------
const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1);
let simTime = 0, achTimer = 1, sprintT = 0, npcScanBucket = 0, swimming = false, swimSplashT = 0;
const SPRINT_RAMP = 2.5;   // seconds of holding sprint to reach top running speed

function update(dt) {
  simTime += dt;
  if (oceanTex) { oceanTex.offset.x += dt * 0.006; oceanTex.offset.y += dt * 0.011; }   // drifting water
  if (seaNormTex) { seaNormTex.offset.x -= dt * 0.022; seaNormTex.offset.y += dt * 0.017; }   // ripples crossing the surface
  if (foamMat) foamMat.opacity = 0.5 + Math.sin(simTime * 1.4) * 0.28;                   // waves washing the shore
  if (seaWave) {   // gentle swell: displace each surface vertex's local z (= world height) by crossing sine waves
    const p = seaWave.geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const shore = clamp((300 - y) / 200, 0, 1);   // taper to flat at the waterline so it never dips under the sand
      const h = Math.sin(x * 0.012 + simTime * 0.9) * 1.0
              + Math.sin(y * 0.018 - simTime * 1.25) * 0.7
              + Math.sin((x + y) * 0.02 + simTime * 0.6) * 0.45;
      p.setZ(i, h * shore);
    }
    p.needsUpdate = true; seaWave.geo.computeVertexNormals();
  }
  if (seaGlitter) { const u = seaGlitter.uniforms; u.uTime.value = simTime;               // sun-glitter twinkle
    u.uCam.value.set(camera.position.x, camera.position.z);
    u.uSun.value.set(_sunDir.x, _sunDir.z).normalize(); }
  for (const bt of boats) {   // idle boats ride the swell: gentle bob + roll (the driven one bobs in its own block)
    if (bt === driving) continue;
    bt.mesh.position.y = 0.1 + Math.sin(simTime * 1.1 + bt.x * 0.15) * 0.08 + Math.sin(simTime * 0.7 + bt.z * 0.1) * 0.05;
    bt.mesh.rotation.set(Math.sin(simTime * 0.9 + bt.x * 0.2) * 0.025, bt.h, Math.sin(simTime * 1.3 + bt.z * 0.2) * 0.03);
  }
  const inp = (dlgLines || garageOpen || statsOpen || tutOpen || styleOpen || arcadeOpen) ? { mx: 0, mz: 0, mag: 0 } : readInput();
  const a = actA, b = actB, pn = actP; actA = false; actB = false; actP = false;
  if (a && !dlgLines && !garageOpen && !statsOpen && !tutOpen && !styleOpen && !arcadeOpen) doActionA();
  if (b && !dlgLines && !garageOpen && !statsOpen && !tutOpen && !styleOpen && !arcadeOpen) doActionB();
  if (pn && !dlgLines && !garageOpen && !statsOpen && !tutOpen && !styleOpen && !arcadeOpen) {
    // a melee swing thrown mid-recovery (e.g. right after the combo's slower finishing kick) used to be
    // dropped in total silence — buffer it briefly instead so it fires the instant the cooldown clears,
    // like any other combo-driven action game, rather than eating the input.
    if (!driving && !inside && !armed() && punchCD > 0) punchBufferT = 0.25;
    else doPunch();
  }
  if (punchBufferT > 0 && !driving && !inside && !armed() && punchCD <= 0) { punchBufferT = 0; doPunch(); }
  // health regen + combat cooldowns
  if (hitCD > 0) hitCD -= dt;
  if (punchCD > 0) punchCD -= dt;
  if (punchBufferT > 0) punchBufferT -= dt;
  if (shootCD > 0) shootCD -= dt;
  if (punchT > 0) punchT -= dt;
  if (inside && intTheme === "bowling") updateBowling(dt);
  updateHoop(dt);
  if (hurtCD > 0) hurtCD -= dt; else if (health < 100) health = Math.min(100, health + 9 * dt);
  // refuel near the gas station; low-fuel warning while driving
  { const fx = driving ? driving.x : player.x, fz = driving ? driving.z : player.z;
    if (dist2(fx, fz, GAS.x, GAS.z) < 90) fuel = Math.min(100, fuel + 26 * dt);
    else if (driving && fuel < 18 && !fuelWarned) { fuelWarned = true; toast(STR.lowFuel); }
    if (fuel > 25) fuelWarned = false; }

  let airMode = false;   // true while parachuting or jetpacking (skips the on-ground player-mesh snap)
  if (driving && !mount) {   // controls are locked while the get-in / mount animation plays
    const c = driving;
    if (c.heli) {
      // ---- helicopter: ▲ lifts straight up off the ground; only once AIRBORNE does the joystick
      //      yaw/steer and fly it forward. On the ground it just idles — no car-like sliding. ----
      const dry = fuel <= 0;
      const airborne = c.y > 0.6;                                   // clear of the ground?
      let lift = 0;                                                // hover (hold altitude) when neither held
      if (ascendInput() && !dry) lift = 17; else if (airborne && descendInput()) lift = -15;
      c.y = clamp((c.y || 0) + lift * dt, 0, 150);
      if (airborne) {
        c.h -= inp.mx * 1.7 * dt;                                   // yaw with the stick (airborne only)
        const fwd = dry ? 0 : Math.max(0, inp.mz);                  // push the stick forward to fly forward
        c.speed = clamp(c.speed + (fwd * 30 - c.speed) * Math.min(1, 2.5 * dt), 0, 34);
      } else {
        c.speed = Math.max(0, c.speed - c.speed * Math.min(1, 6 * dt));   // grounded: bleed off any speed, don't slide
      }
      c.x = clamp(c.x + Math.sin(c.h) * c.speed * dt, -HALF - 600, HALF + 600);
      c.z = clamp(c.z + Math.cos(c.h) * c.speed * dt, -HALF - 600, HALF + 600);
      fuel = Math.max(0, fuel - (0.9 + c.speed * 0.02) * dt);
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(-c.speed * 0.014, c.h, (airborne ? inp.mx : 0) * 0.22);   // nose dips when moving, banks in turns
      if (c.rotor) c.rotor.rotation.y += 34 * dt;
      if (c.tail) c.tail.rotation.x += 40 * dt;
      if (c.y < 6 && Math.random() < 0.5) emit(c.x + rr(-2, 2), 0.25, c.z + rr(-2, 2), rr(-1, 1), rr(0.2, 0.8), rr(-1, 1), 0.4, 0.62, 0.6, 0.52);   // rotor downwash
    } else if (c.plane) {
      // ---- plane: throttle up the runway, then PULL UP (▲) to rotate & take off once fast enough.
      //      On the ground it only nose-wheel steers (no banking); airborne it banks/pitches and will
      //      STALL (sink) if you let the speed bleed too low. No taxiing around like a car. ----
      const dry = fuel <= 0;
      const TAKEOFF = 16;
      const airborne = c.y > 0.6;
      // throttle: stick forward = thrust. Sits still on the ground at idle; a little cruise idle in
      // the air so it keeps flying without pinning the stick. Brake (▼/Space) to slow down & land.
      const throttle = dry ? 0 : (airborne ? 0.7 : 0) + Math.max(0, inp.mz);
      c.speed += (throttle * 30 - c.speed) * Math.min(1, 1.2 * dt);
      if (braking()) c.speed -= 22 * dt;
      c.speed = clamp(c.speed, 0, 60);
      // steering: gentle nose-wheel on the ground (scales from a standstill), full banked turns aloft
      const turn = airborne ? 1.05 * clamp(c.speed / 14, 0.4, 1) : 0.5 * clamp(c.speed / 10, 0, 1);
      c.h -= inp.mx * turn * dt;
      let vy = 0;
      if (airborne) {
        if (c.speed < TAKEOFF - 2) vy = -9;                        // too slow → lose lift (stall/sink)
        else if (ascendInput()) vy = 14;                           // climb
        else if (descendInput()) vy = -16;                         // nose down to descend / land
      } else if (c.speed > TAKEOFF && ascendInput()) {
        vy = 12;                                                   // rotate & lift off once up to speed
      }
      c.y = clamp((c.y || 0) + vy * dt, 0, 170);
      c.x = clamp(c.x + Math.sin(c.h) * c.speed * dt, -HALF - 600, HALF + 600);
      c.z = clamp(c.z + Math.cos(c.h) * c.speed * dt, -HALF - 600, HALF + 600);
      fuel = Math.max(0, fuel - (1.0 + c.speed * 0.02) * dt);
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(-clamp(vy * 0.03, -0.4, 0.4), c.h, (airborne ? inp.mx : 0) * 0.5);   // pitch w/ climb, bank only aloft
      if (c.prop) c.prop.rotation.z += 50 * dt;
    } else if (c.boat) {
      // ---- arcade boat: throttle forward, turn scales with speed, stays on the harbour ----
      // jet skis are the hot version: quicker off the line, higher top end, much sharper steering,
      // and at speed they skip across the chop instead of just bobbing
      const js = !!c.jetski;
      c.h -= inp.mx * (js ? 2.3 : 1.4) * dt * clamp(Math.abs(c.speed) / 6, 0.25, 1);
      const accel = Math.max(0, inp.mz) * (js ? 24 : 15);
      c.speed += (accel - c.speed * 0.5) * dt;
      if (braking()) c.speed -= 16 * dt;
      c.speed = clamp(c.speed, -4, js ? 32 : 22);
      c.x = clamp(c.x + Math.sin(c.h) * c.speed * dt, -HALF - 380, HALF + 380);
      c.z = clamp(c.z + Math.cos(c.h) * c.speed * dt, SEA_Z - 1, SEA_Z + 560);   // keep it in the water
      const hop = js ? Math.max(0, Math.sin(simTime * 7 + c.x * 0.2)) * clamp(c.speed / 32, 0, 1) * 0.22 : 0;
      c.mesh.position.set(c.x, 0.1 + Math.sin(simTime * 2 + c.x * 0.1) * 0.12 + hop, c.z);   // gentle bob (+ chop-skip)
      c.mesh.rotation.set(Math.sin(simTime * 1.5) * 0.03 - hop * 0.5, c.h, inp.mx * (js ? 0.3 : 0.12));
      if (Math.abs(c.speed) > 3 && Math.random() < (js ? 0.9 : 0.6)) emit(c.x - Math.sin(c.h) * (js ? 1.3 : 2.4), 0.15, c.z - Math.cos(c.h) * (js ? 1.3 : 2.4), rr(-0.5, 0.5), rr(0.1, js ? 0.9 : 0.5), rr(-0.5, 0.5), 0.6, 0.85, 0.9, 0.98);   // wake spray
    } else {
    // throttle / brake — dedicated brake button (or Space) decelerates then reverses
    const brakeAmt = braking() ? 1 : (inp.mz < 0 ? -inp.mz : 0);
    const dry = fuel <= 0;                                          // out of gas → limp only
    const accel = (inp.mz > 0 && !braking() && !dry) ? (c.accel || 13) * inp.mz : 0;
    const brake = brakeAmt > 0 ? 22 * brakeAmt : 0;
    // nitro: surge of accel + higher top speed while the meter lasts; recharges when off
    const nitro = boosting() && !dry;
    boostMeter = clamp(boostMeter + (nitro ? -dt * 0.5 : dt * 0.32), 0, 1);
    c.speed += accel * (nitro ? 2 : 1) * dt;
    if (nitro) c.speed += 14 * dt;                                  // extra shove
    if (brake) c.speed = c.speed > 0 ? Math.max(0, c.speed - brake * dt) : Math.max(-8, c.speed - 6 * dt);
    if (brakeAmt > 0 && c.speed <= 0) c.speed = Math.max(-8, c.speed - 8 * dt);
    c.speed -= c.speed * 0.6 * dt;                                  // drag
    c.speed = clamp(c.speed, -8, dry ? 5 : (c.top || 26) * (nitro ? 1.5 : 1));
    fuel = Math.max(0, fuel - (Math.abs(c.speed) * 0.028 + (nitro ? 1.2 : 0)) * dt);   // burn fuel while driving
    if (nitro && c.y === 0) {                                        // exhaust flames + rumble
      emit(c.x - Math.sin(c.h) * 2.4, 0.6, c.z - Math.cos(c.h) * 2.4, rr(-0.4, 0.4), rr(0.2, 0.7), rr(-0.4, 0.4), 0.4, 0.95, 0.5, 0.15);
      addShake(0.05);
    }
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
    // lay rubber: two parallel streaks at the rear wheels whenever the tyres are sliding
    if (c.y === 0 && Math.abs(c.lat) > 3.4 && Math.abs(c.speed) > 5) {
      const rx = Math.cos(c.h), rz = -Math.sin(c.h), bx = c.x - Math.sin(c.h) * 1.7, bz = c.z - Math.cos(c.h) * 1.7;
      layStreak(bx + rx * 0.7, bz + rz * 0.7, c.h);
      layStreak(bx - rx * 0.7, bz - rz * 0.7, c.h);
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
          const bonus = earn(Math.round((40 + air * air * 240) * (c.jumpMult || 1)));
          if (air > (state.bestJump || 0)) state.bestJump = air;
          toast(STR.jump(bonus));
          AudioSys.play("cash", 0.8);
          save();
        }
      }
    }
    // weight transfer: lean into turns off the lateral drift, dive under braking, squat under accel —
    // and sync the mesh directly (heli/plane/boat already do this themselves; giving cars/bikes the same
    // means a JACKED street car actually moves on screen instead of freezing at the spot you jacked it,
    // since it isn't in the `cars[]` array the old shared sync loop relied on).
    c.mesh.position.set(c.x, groundY(c.x, c.z) + (c.y || 0), c.z);
    c.mesh.rotation.y = c.h;
    const pitchTgt = c.y > 0 ? 0 : clamp(brakeAmt * 0.16 - (accel > 0 ? inp.mz : 0) * 0.06, -0.06, 0.18);
    c.pitch = (c.pitch || 0) + (pitchTgt - (c.pitch || 0)) * Math.min(1, 7 * dt);
    c.mesh.rotation.x = c.y > 0 ? clamp(-c.vy * 0.02, -0.4, 0.4) : c.pitch;
    c.mesh.rotation.z = c.bike ? clamp((c.lat || 0) * 0.05, -0.45, 0.45) : clamp((c.lat || 0) * 0.03, -0.22, 0.22);
    levelBlob(c.mesh);   // the car you're driving pitches/rolls constantly — keep its shadow on the road
    }
    camYaw = lerpAngle(camYaw, c.h, 1 - Math.exp(-3.2 * dt));
  } else if (para) {
    // ---- parachuting: slow descent with gentle steering ----
    airMode = true;
    player.h -= inp.mx * 1.1 * dt;
    const mv = Math.max(0, inp.mz) * 6.5;
    player.x = clamp(player.x + Math.sin(player.h) * mv * dt, WB.x0, WB.x1);
    player.z = clamp(player.z + Math.cos(player.h) * mv * dt, WB.z0, WB.z1);
    player.y -= 6.5 * dt;
    const gy = groundY(player.x, player.z);
    if (player.y <= gy) { player.y = gy; para = null; paraMesh.visible = false; toast("🪂 Nice landing!"); buzz(20); }
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.set(0, player.h, 0);   // drop the stride's lean/roll — you're hanging, not walking
    paraMesh.position.set(player.x, player.y + 2.4, player.z);
    camYaw = lerpAngle(camYaw, player.h, 1 - Math.exp(-3 * dt));
  } else if (state.jetpack && (boosting() || player.y > groundY(player.x, player.z) + 0.35)) {
    // ---- jetpack flight: BOOST climbs, stick moves (camera-relative), descend when you let go ----
    airMode = true;
    const gy = groundY(player.x, player.z);
    const f = { x: Math.sin(camYaw), z: Math.cos(camYaw) }, r = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    const wx = f.x * inp.mz + r.x * inp.mx, wz = f.z * inp.mz + r.z * inp.mx;
    player.x = clamp(player.x + wx * 9 * dt, WB.x0, WB.x1);
    player.z = clamp(player.z + wz * 9 * dt, WB.z0, SWIM_Z1);   // jetpack may cross the waterline
    player.y = clamp(player.y + (boosting() ? 15 : -11) * dt, gy, 95);
    if (Math.hypot(wx, wz) > 0.01) player.h = Math.atan2(wx, wz);
    player.speed = 0;
    hero.legL.rotation.x = 0.25; hero.legR.rotation.x = 0.25; hero.kneeL.rotation.x = 0.35; hero.kneeR.rotation.x = 0.35;
    hero.armL.rotation.x = 0.5; hero.armR.rotation.x = 0.5;
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.set(0, player.h, 0);   // drop the stride's lean/roll — you're flying, not walking
    if (boosting()) emit(player.x, player.y + 0.15, player.z, rr(-0.3, 0.3), rr(-0.9, -0.3), rr(-0.3, 0.3), 0.4, 1.0, 0.7, 0.3);   // thrust
  } else {
    // camera-relative walk
    const f = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    const r = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    const wx = f.x * inp.mz + r.x * inp.mx, wz = f.z * inp.mz + r.z * inp.mx;
    const mag = inp.mag;
    const sprint = (bHeld || keys.has("ShiftLeft") || keys.has("ShiftRight")) && mag > 0.01;
    // hold sprint longer to build up speed: charge ramps 0->1 over SPRINT_RAMP s, decays faster when released
    sprintT = clamp(sprint ? sprintT + dt : sprintT - dt * 2.5, 0, SPRINT_RAMP);
    const sprintMul = 1 + (sprint ? 0.32 + (sprintT / SPRINT_RAMP) * 0.63 : 0);   // 1.0 walk -> 1.32 -> ~1.95 at full charge
    const speed = (mag > 0.72 ? 6.4 : mag * 4.6) * sprintMul * (swimming ? 0.52 : 1);   // water drag
    player.speed = speed;
    if (mag > 0.01) {
      const len = Math.hypot(wx, wz) || 1;
      moveWithCollision(player, wx / len * speed * dt, wz / len * speed * dt, 0.45);
      const h0 = player.h;
      player.h = lerpAngle(player.h, Math.atan2(wx, wz), 1 - Math.exp(-12 * dt));
      // how fast the heading is sweeping, smoothed — drives the bank into a corner
      let dh = player.h - h0;
      if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
      player.turn += ((dt > 0 ? dh / dt : 0) - player.turn) * Math.min(1, 9 * dt);
      camYaw = lerpAngle(camYaw, Math.atan2(wx, wz), 1 - Math.exp(-1.6 * dt));
      player.walkPhase += speed * dt * 2.4;
    } else {
      player.walkPhase *= 1 - Math.min(1, 10 * dt);
      player.turn *= 1 - Math.min(1, 6 * dt);
    }
  }

  // traffic — obey signals, queue behind cars ahead, smooth start/stop, brake lights & honking.
  // Same tiered LOD as the pedestrians: only cars within ~300u of you actually drive; the ring out
  // to ~470u renders parked-in-place, and everything beyond that is hidden. Without this, every car
  // in the city ran its full waypoint/queue/signal logic each frame no matter how far away it was.
  const tpx = driving ? driving.x : player.x, tpz = driving ? driving.z : player.z;
  carGrid.clear();
  for (const t of traffic) {
    if (t.jacked || t.dead) continue;
    t._d2 = dist2(t.x, t.z, tpx, tpz);
    if (t._d2 > 90000) continue;   // far cars don't queue against anyone either
    const k = Math.floor(t.x / 14) + "," + Math.floor(t.z / 14); let a = carGrid.get(k); if (!a) carGrid.set(k, a = []); a.push(t);
  }
  // when you're on a rampage (recent mayhem) or heavily wanted, nearby drivers panic:
  // they floor it, run red lights and swerve away from you instead of calmly queuing.
  const mayhem = chaosCD > 0 || wanted >= 2;
  for (const t of traffic) {
    if (t.jacked) continue;   // being driven by the player, or left abandoned after a jack
    if (!t.dead && t._d2 > 90000) {
      t.mesh.visible = t._d2 < 220000;
      if (t.mesh.visible && !t.placed) { t.mesh.position.set(t.x, groundY(t.x, t.z), t.z); t.mesh.rotation.y = t.h; t.placed = true; }
      continue;
    }
    t.mesh.visible = true; t.placed = true;
    const [tx, tz] = t.wp[t.next];
    const dx = tx - t.x, dz = tz - t.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 2) { t.next = (t.next + 1) % t.wp.length; continue; }   // wp.length is 4 for block loops, 2 for avenue cruisers
    let fx = dx / d, fz = dz / d;
    const pd = mayhem ? dist2(t.x, t.z, tpx, tpz) : 1e9;
    const panic = pd < 3600;                                          // within ~60u of the chaos
    const near = !panic && dist2(t.x, t.z, tpx, tpz) < (driving ? 100 : 22);   // yield close to the player
    // obey the signal: hold on the approach to the intersection if this direction has a red light
    const nsTravel = Math.abs(dz) >= Math.abs(dx);
    const red = nsTravel ? (trafPhase === 2 || trafPhase === 3) : (trafPhase === 0 || trafPhase === 1);
    const atRed = !panic && red && d > 2.6 && d < 11;                 // panicked drivers blow the light
    // panic swerve: bias the heading away from the player, blended into the road-follow direction
    if (panic) {
      const px = t.x - tpx, pz = t.z - tpz, pl = Math.hypot(px, pz) || 1;
      const w = clamp(1 - pl / 60, 0, 1) * 0.8;
      fx += px / pl * w; fz += pz / pl * w;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    }
    // car-following: queue behind any car just ahead in the same lane
    let blocked = false;
    const cx0 = Math.floor(t.x / 14), cz0 = Math.floor(t.z / 14);
    for (let gx = -1; gx <= 1 && !blocked; gx++) for (let gz = -1; gz <= 1 && !blocked; gz++) {
      const arr = carGrid.get((cx0 + gx) + "," + (cz0 + gz)); if (!arr) continue;
      for (const o of arr) { if (o === t) continue; const ox = o.x - t.x, oz = o.z - t.z; const ahead = ox * fx + oz * fz; if (ahead > 0.3 && ahead < 6.5 && Math.abs(ox * fz - oz * fx) < 2.3) { blocked = true; break; } }
    }
    const stop = near || atRed || blocked;
    const target = stop ? 0 : t.speed * (panic ? 1.8 : 1);             // floor it when fleeing
    if (t.v === undefined) t.v = t.speed;
    t.v += (target - t.v) * Math.min(1, (panic ? 4 : 7) * dt);         // smooth accelerate / decelerate
    t.braking = !panic && stop && t.v < t.speed * 0.75;               // -> brake lights
    t.h = lerpAngle(t.h, Math.atan2(fx, fz), 1 - Math.exp(-(panic ? 9 : 6) * dt));
    if (t.v > 0.02) { t.x += fx * t.v * dt; t.z += fz * t.v * dt; }
    t.mesh.position.set(t.x, groundY(t.x, t.z), t.z);
    t.mesh.rotation.y = t.h;
    // honk: in a panic anyone close leans on it; otherwise only when stuck in a queue near you
    if (panic && pd < 900) { t.honkCD = (t.honkCD || 0) - dt; if (t.honkCD <= 0 && Math.random() < 0.04) { AudioSys.horn(); t.honkCD = rr(1.2, 3); } }
    else if ((atRed || blocked) && t.v < 1.2) { t.honkCD = (t.honkCD || 0) - dt; if (t.honkCD <= 0 && near && Math.random() < 0.02) { AudioSys.horn(); t.honkCD = rr(2.5, 6); } }
  }

  // pedestrians
  const npcFx = driving ? driving.x : player.x, npcFz = driving ? driving.z : player.z;
  hostileNear = false;
  // stagger the far-crowd bookkeeping: an NPC already known to be far only re-checks its distance
  // every 4th frame (round-robin by index), cutting the per-frame flat scan of the whole population
  // to a quarter. Nearby NPCs still get a full check + simulation every frame; a far one waking up
  // at worst 3 frames (~0.05s) late is imperceptible at these radii.
  npcScanBucket = (npcScanBucket + 1) & 3;
  for (let ni = 0; ni < npcs.length; ni++) {
    const n = npcs[ni];
    if (n.ragdoll) continue;   // knocked down — fully owned by updateRagdolls() until they climb back up
    if (n.far && (ni & 3) !== npcScanBucket) continue;
    // ambient pedestrians recycle to stay around you, so the streets are lively wherever you roam.
    // Snap each onto the SIDEWALK of a nearby road so they actually line the streets you see,
    // rather than scattering into block interiors / behind buildings where they're wasted.
    if (n.ambient && dist2(n.x, n.z, npcFx, npcFz) > 90000) {
      const ang = npcRng() * Math.PI * 2, rad = 70 + npcRng() * 190;
      let rx = npcFx + Math.cos(ang) * rad, rz = npcFz + Math.sin(ang) * rad;
      const side = npcRng() < 0.5 ? -1 : 1, off = ROAD / 2 + 1.4 + npcRng() * 2.5;
      if (npcRng() < 0.5) rx = roadC(Math.round((rx + HALF - ROAD / 2) / CELL)) + side * off;   // sidewalk along a N-S road
      else rz = roadC(Math.round((rz + HALF - ROAD / 2) / CELL)) + side * off;                   // sidewalk along an E-W road
      n.x = clamp(rx, -HALF + 6, HALF - 6); n.z = clamp(rz, -HALF + 6, SEA_Z - 12);
      n.h = npcRng() * Math.PI * 2; n.flee = 0; n.placed = false;
    }
    // tiered LOD so the city can be packed without cost: only the crowd near you (<~160u) fully
    // simulates; the mid ring (<~470u) renders but freezes; everything beyond that is hidden outright.
    const d2 = dist2(n.x, n.z, npcFx, npcFz);
    if (d2 > 26000) {
      n.far = true;
      n.mesh.visible = d2 < 220000;   // render out to ~470u so streets read as busy into the distance
      if (n.mesh.visible && !n.placed) { n.mesh.position.set(n.x, groundY(n.x, n.z), n.z); n.mesh.rotation.y = n.h; n.placed = true; }
      continue;
    }
    n.far = false;
    n.mesh.visible = true; n.placed = true;
    n.flee = (n.flee || 0) - dt;
    if (n.talkCD > 0) n.talkCD -= dt;
    if (n.anger > 0) n.anger = Math.max(0, n.anger - dt * 0.08);
    if (n.bubble) { n.bubbleT -= dt; if (n.bubbleT <= 0) { n.mesh.remove(n.bubble); n.bubble.material.map.dispose(); n.bubble.material.dispose(); n.bubble = null; } else if (n.bubbleT < 1) n.bubble.material.opacity = n.bubbleT; }
    if (driving && Math.abs(driving.speed) > 5 && n.flee <= 0 &&
        dist2(n.x, n.z, driving.x, driving.z) < 49) {
      n.flee = 1.3;
      n.h = Math.atan2(n.x - driving.x, n.z - driving.z);
    }
    if (driving && Math.abs(driving.speed) > 8 && dist2(n.x, n.z, driving.x, driving.z) < 9) {
      const dh = driving.h;   // hit hard enough to kill — sent flying in the direction you were driving
      spawnRagdoll({ group: n.mesh, legL: n.legL, legR: n.legR, armL: n.armL, armR: n.armR, kneeL: n.kneeL, kneeR: n.kneeR },
        n.x, groundY(n.x, n.z), n.z, n.h,
        { vx: Math.sin(dh) * rrand(3.5, 6), vy: rrand(3.5, 6.5), vz: Math.cos(dh) * rrand(3.5, 6) }, "corpse");
      burst(n.x, 1.0, n.z, 10, 1.2, 1.8, 0.5, 0.4, 0.2, 0.15); addShake(0.22);
      registerCrime();
      n._dead = true;
      continue;
    }
    if (n.fighting) {
      // squared up after a stagger: charge the player and throw hands until they either back off, hop
      // in a car, or land enough follow-up hits to finally send this one running instead.
      if (driving || dist2(n.x, n.z, player.x, player.z) > 1600) { n.fighting = false; }
      else {
        // this NPC's own fighting personality, rolled once and kept for good — completely different
        // reach, speed, timing, favorite move and guard height from the next pedestrian you rough up
        if (!n.style) n.style = {
          reach: rrand(1.5, 2.1), speed: rrand(2.6, 4.3), swingLo: rrand(0.5, 1.0), swingHi: rrand(1.0, 1.7),
          swingDur: rrand(0.22, 0.4), hitChance: rrand(0.26, 0.5), weave: rrand(0.08, 0.55), weaveRate: rrand(1.4, 3.6),
          kicker: ragRng() < 0.32, guard: rrand(0.12, 0.34),
        };
        const st = n.style;
        const dx = player.x - n.x, dz = player.z - n.z, d = Math.hypot(dx, dz) || 1;
        n.h = Math.atan2(dx, dz);
        if (d < 8) hostileNear = true;
        if (d > st.reach) {
          const wob = Math.sin(simTime * st.weaveRate + n.walkPhase) * st.weave;   // side-to-side juke, not a beeline
          moveWithCollision(n, (dx / d - dz / d * wob) * st.speed * dt, (dz / d + dx / d * wob) * st.speed * dt, 0.4);
          n.walkPhase += st.speed * dt * 2.6;
        }
        n.fightCD = (n.fightCD || 0) - dt;
        if (d <= st.reach + 0.3 && n.fightCD <= 0) {
          n.fightCD = rrand(st.swingLo, st.swingHi); n.swingT = st.swingDur;
          AudioSys.play("door", st.kicker ? 0.5 : 0.35); buzz(st.kicker ? 12 : 8);
          if (ragRng() < st.hitChance) { hurt(Math.round(rrand(3, 7))); addShake(0.15); flash("#ff3b3b", 0.12); }
        }
        n.swingT = (n.swingT || 0) - dt;
        const swinging = n.swingT > 0;
        const legSwing = Math.sin(n.walkPhase) * 0.35;
        n.legL.rotation.x = legSwing; n.legR.rotation.x = -legSwing;
        n.kneeL.rotation.x = Math.max(0, -Math.cos(n.walkPhase)) * 0.9;
        n.kneeR.rotation.x = Math.max(0, Math.cos(n.walkPhase)) * 0.9;
        if (st.kicker && swinging) {   // this one fights with kicks — overrides the leg swing when landing one
          n.legR.rotation.x = -1.25; n.kneeR.rotation.x = 0.8;
          n.armR.rotation.x = -0.35; n.armL.rotation.x = -0.35;
        } else {
          n.armR.rotation.x = swinging ? -1.4 : -st.guard - Math.abs(Math.sin(n.walkPhase * 0.5)) * 0.12;
          n.armL.rotation.x = -st.guard * 0.8 + Math.sin(n.walkPhase) * -0.2;
        }
        n.mesh.position.set(n.x, groundY(n.x, n.z), n.z);
        n.mesh.rotation.y = n.h;
        continue;
      }
    }
    n.timer -= dt;
    if (n.crossCD > 0) n.crossCD -= dt;
    // crossing the street like IRL: only near an intersection, and walk the crosswalk to the far side.
    const ix = roadC(Math.round((n.x + HALF - ROAD / 2) / CELL));   // nearest N-S road / intersection x
    const iz = roadC(Math.round((n.z + HALF - ROAD / 2) / CELL));   // nearest E-W road / intersection z
    if (!n.cross && n.flee <= 0 && (n.crossCD || 0) <= 0 && Math.abs(n.x) < HALF && Math.abs(n.z) < HALF &&
        Math.abs(n.x - ix) < ROAD / 2 + 9 && Math.abs(n.z - iz) < ROAD / 2 + 9 && npcRng() < 0.006) {
      const sx = n.x >= ix ? 1 : -1, sz = n.z >= iz ? 1 : -1, CW = ROAD / 2 + 2.0, FAR = ROAD / 2 + 3.5;
      // step to the opposite kerb along a crosswalk (one coord stays on the crosswalk lane)
      n.cross = npcRng() < 0.5 ? { x: ix + sx * CW, z: iz - sz * FAR } : { x: ix - sx * FAR, z: iz + sz * CW };
      n.crossT = 5;
    }
    // NPC wandering uses Math.random... (npcRng) so the crowd is purely cosmetic and never affects game determinism
    if (n.cross) {
      n.crossT -= dt;
      const cdx = n.cross.x - n.x, cdz = n.cross.z - n.z;
      if (cdx * cdx + cdz * cdz < 2.2 || n.crossT <= 0) { n.cross = null; n.crossCD = 9 + npcRng() * 16; }
      else n.h = Math.atan2(cdx, cdz);
    } else if (n.timer <= 0 && n.flee <= 0) { n.timer = 2 + npcRng() * 4; n.h += (npcRng() - 0.5) * 2.8; }
    const ox = n.x, oz = n.z;
    const sp = n.flee > 0 ? 3.8 : n.speed;
    moveWithCollision(n, Math.sin(n.h) * sp * dt, Math.cos(n.h) * sp * dt, 0.4);
    let moved = Math.abs(n.x - ox) + Math.abs(n.z - oz);
    if (!n.cross && moved < sp * dt * 0.3) n.h += Math.PI + (npcRng() - 0.5);
    // keep pedestrians on the sidewalk: ease them out of any roadway so they don't wander into traffic.
    // (skipped while crossing at a crosswalk, and while fleeing — a panicking bystander can bolt across.)
    if (!n.cross && n.flee <= 0 && Math.abs(n.x) < HALF && Math.abs(n.z) < HALF) {
      const EDGE = ROAD / 2 + 1.7;
      const dx = n.x - ix, dz = n.z - iz;   // distance from nearest road centres (computed above)
      const inX = Math.abs(dx) < EDGE, inZ = Math.abs(dz) < EDGE;
      if (inX && (!inZ || Math.abs(dx) >= Math.abs(dz))) {
        const s = dx >= 0 ? 1 : -1; n.x += s * Math.min(EDGE - Math.abs(dx), sp * dt * 2.2 + 0.04); n.h = Math.atan2(s, 0);
      } else if (inZ) {
        const s = dz >= 0 ? 1 : -1; n.z += s * Math.min(EDGE - Math.abs(dz), sp * dt * 2.2 + 0.04); n.h = Math.atan2(0, s);
      }
      moved = Math.abs(n.x - ox) + Math.abs(n.z - oz);
    }
    // stride: advance the walk cycle with speed, swing legs & arms in opposition, bob with each step
    const stepping = moved > sp * dt * 0.3;
    n.walkPhase += sp * dt * 2.6;
    const spd = Math.min(1, sp / 2.2);
    const sw = stepping ? Math.sin(n.walkPhase) * spd * 0.4 : (n.legL.rotation.x * 0.85);
    n.legL.rotation.x = sw; n.legR.rotation.x = -sw;
    n.armL.rotation.x = -sw * 0.7; n.armR.rotation.x = sw * 0.7;
    // knees only flex (never hyperextend): each shin tucks up as its leg swings through under the body
    const kAmp = stepping ? spd * 0.95 : 0;
    n.kneeL.rotation.x = kAmp * Math.max(0, -Math.cos(n.walkPhase));   // flexes mid-swing, straight at the extremes
    n.kneeR.rotation.x = kAmp * Math.max(0, Math.cos(n.walkPhase));
    const gy = groundY(n.x, n.z);
    // dip as the legs split (a swung leg lifts its own foot, so the pelvis has to come down to plant
    // the step) and roll onto the foot carrying the weight — same physics as the hero's stride
    n.mesh.position.set(n.x, gy - (stepping ? n.mesh.scale.y * HIP_Y * (1 - Math.cos(sw)) * 0.3 : 0), n.z);
    n.mesh.rotation.y = n.h;
    n.mesh.rotation.z = stepping ? Math.sin(n.walkPhase) * 0.04 * spd : 0;
  }
  for (let i = npcs.length - 1; i >= 0; i--) if (npcs[i]._dead) npcs.splice(i, 1);   // remove anyone killed this frame
  updateRagdolls(dt);
  updatePropPhysics(dt);
  updateProjectiles(dt);
  updateFlashes(dt);

  // income + missions
  state.money += incomeRate() / 60 * dt;
  envUpdate();
  updateWeather(dt, driving ? driving.x : player.x, driving ? driving.z : player.z);
  updateOcean(dt, simTime);
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
  // dynamic music swells during a chase or a race; tyre-skid noise tracks drift
  AudioSys.intensity(Math.min(1, heatActive() / 3 * 0.8 + (race.stage === "active" ? 0.5 : 0)));
  AudioSys.skid(driving && driving.y === 0 ? Math.max(0, (Math.abs(driving.lat) - 3) / 9) : 0);
  updateMissions(dt);
  updateSideJob();
  updateRace(dt);
  updateEvents(dt, simTime);
  updateVigilante(dt);
  updateParamedic(dt);
  updatePolice(dt);
  updateExplosions(dt);
  updateGangs(dt);
  updateAllies(dt);
  updateNemesis(dt);
  updateTrafficLights(dt);
  updateHoldup(dt);
  updateJob(dt);
  // ambient banter: now and then a nearby pedestrian says something unprompted
  ambientCD -= dt;
  if (ambientCD <= 0 && !driving) {
    ambientCD = 3.5 + Math.random() * 5;
    const near = npcs.filter(n => !n.bubble && n.talkCD <= 0 && dist2(n.x, n.z, player.x, player.z) < 1300);
    if (near.length) { const n = near[(Math.random() * near.length) | 0]; speak(n, npcLine(n)); n.talkCD = 4; }
  }
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

  // player mesh (skipped while airborne — the parachute/jetpack branches pose the hero themselves)
  swimming = !driving && !inside && !airMode && player.z > SEA_Z + 0.5;   // past the waterline on foot -> in the water
  if (!driving && !airMode) {
    const gy = groundY(player.x, player.z);
    if (swimming) {
      // afloat: tread water in place, pitch prone into a front crawl while moving. The float height is
      // derived from the body tilt so the head stays above the waterline whatever the pose, plus a bob.
      const sgait = Math.min(1, player.speed / 4);
      const tilt = 0.5 + sgait * 0.8;
      const floatY = 0.62 - 1.63 * Math.cos(tilt) + Math.sin(simTime * 2.1) * 0.05 - diveDepth();   // head + shoulders above the surface (a dive pulls you under)
      player.y += (floatY - player.y) * Math.min(1, 8 * dt);
      hero.group.position.set(player.x, player.y, player.z);
      hero.group.rotation.set(tilt, player.h, 0);
      hero.legL.rotation.z = hero.legR.rotation.z = 0;
      if (sgait > 0.12) {   // front crawl: alternating full-circle strokes + flutter kick + splashes
        hero.armL.rotation.x = -1.7 + Math.sin(player.walkPhase * 1.15) * 1.55; hero.armL.rotation.z = 0.12;
        hero.armR.rotation.x = -1.7 + Math.sin(player.walkPhase * 1.15 + Math.PI) * 1.55; hero.armR.rotation.z = -0.12;
        hero.legL.rotation.x = Math.sin(player.walkPhase * 2.3) * 0.4;
        hero.legR.rotation.x = -Math.sin(player.walkPhase * 2.3) * 0.4;
        hero.kneeL.rotation.x = 0.25; hero.kneeR.rotation.x = 0.25;
        swimSplashT -= dt;
        if (swimSplashT <= 0) { swimSplashT = 0.16; burst(player.x, 0.12, player.z, 3, 0.7, 0.5, 0.28, 0.85, 0.93, 1.0); }
      } else {              // treading water
        const tread = Math.sin(simTime * 2.4);
        hero.armL.rotation.x = -0.5 + tread * 0.18; hero.armL.rotation.z = 0.5;
        hero.armR.rotation.x = -0.5 - tread * 0.18; hero.armR.rotation.z = -0.5;
        hero.legL.rotation.x = tread * 0.3; hero.legR.rotation.x = -tread * 0.3;
        hero.kneeL.rotation.x = 0.4; hero.kneeR.rotation.x = 0.4;
      }
      gunKickT = Math.max(0, gunKickT - dt); kickT = Math.max(0, kickT - dt); comboT = Math.max(0, comboT - dt); hoopShootT = Math.max(0, hoopShootT - dt);
    } else {
    player.y += (gy - player.y) * Math.min(1, 12 * dt);
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.set(0, player.h, 0);              // clear any pitch/lean left over from riding
    hero.legL.rotation.z = hero.legR.rotation.z = 0;      // clear the bike-saddle knee splay
    hero.armL.rotation.z = hero.armR.rotation.z = 0;      // clear stale arm splay (swim/aim poses set their own)
    const gait = Math.min(1, player.speed / 4);
    const ph = player.walkPhase;
    const sw = Math.sin(ph) * gait * 0.48;
    hero.legL.rotation.x = sw; hero.legR.rotation.x = -sw;
    hero.armL.rotation.x = -sw * 0.78; hero.armR.rotation.x = sw * 0.78;
    const kAmp = gait * 1.0;   // knees flex as each shin swings through (never hyperextend)
    hero.kneeL.rotation.x = kAmp * Math.max(0, -Math.cos(ph));
    hero.kneeR.rotation.x = kAmp * Math.max(0, Math.cos(ph));
    // Carry the body's weight: dip as the legs split, roll onto the foot taking the load, and lean
    // into the run as you build speed. This is what separates a puppet swinging its limbs from
    // someone actually walking.
    //   · dip follows the (1−cos θ) curve of a swinging leg lifting its own foot — that shape is what
    //     plants each step instead of skating. The coefficient sits well under the full hip lever
    //     because the shoe tilts with the leg, eating most of the theoretical lift; under-dipping
    //     leaves a foot a hair high (invisible), over-dipping sinks it through the road (very visible).
    //   · this character has no ankle, so leaning/rolling pivots the whole body about the soles and
    //     would drive the toes and outer edge into the pavement — tiltLift gives back exactly the
    //     height that costs. All three numbers are measured against the road, not eyeballed.
    const lean = gait * 0.05 + Math.min(0.075, Math.max(0, player.speed - 4.6) * 0.012);
    // bank into a corner the way a runner does — heading sweeping left drops the shoulder left.
    // Folded into `roll`, so tiltLift below compensates the extra tilt for free and the outside
    // sole can't dig into the road on a hard turn.
    const bank = clamp(-player.turn * 0.085, -0.26, 0.26) * gait;
    const roll = Math.sin(ph) * 0.05 * gait + bank;
    const tiltLift = 0.22 * Math.sin(lean) + 0.2 * Math.abs(Math.sin(roll));
    hero.group.position.y = player.y - HIP_Y * (1 - Math.cos(sw)) * 0.3 + tiltLift;
    hero.group.rotation.x = lean;
    hero.group.rotation.z = roll;
    hero.armL.rotation.z = 0.07 * gait; hero.armR.rotation.z = -0.07 * gait;
    if (gait < 0.02) hero.group.position.y = player.y + Math.sin(simTime * 1.7) * 0.012;   // idle breathing
    if (armed()) {   // two-handed aim pose whenever a weapon's drawn, with a sharp recoil snap per shot
      const kick = gunKickT > 0 ? (gunKickT / 0.14) * 0.32 : 0;
      hero.armR.rotation.x = -1.15 - kick; hero.armR.rotation.z = -0.12;
      hero.armL.rotation.x = -1.05 - kick * 0.6; hero.armL.rotation.z = 0.22;
    } else if (hoopShootT > 0) {   // basketball: a two-handed set-shot release, rising then following through
      const rise = Math.sin(clamp(1 - hoopShootT / 0.5, 0, 1) * Math.PI);
      hero.armR.rotation.x = -1.4 - rise * 1.3; hero.armR.rotation.z = -0.05;
      hero.armL.rotation.x = -1.2 - rise * 1.1; hero.armL.rotation.z = 0.05;
      hero.legL.rotation.x = -rise * 0.35; hero.legR.rotation.x = -rise * 0.35;
      hero.kneeL.rotation.x = rise * 0.5; hero.kneeR.rotation.x = rise * 0.5;
    } else if (kickT > 0) {   // combo finisher: a real front kick, not just another punch
      const k = Math.sin(clamp(kickT / 0.34, 0, 1) * Math.PI);
      hero.legR.rotation.x = -1.35 * k; hero.kneeR.rotation.x = 0.85 * k;
      hero.legL.rotation.x = 0.18 * k; hero.armL.rotation.x = -0.5 * k; hero.armR.rotation.x = -0.25 * k;
    } else if (punchT > 0) hero.armR.rotation.x = -1.5;   // forward jab during a punch
    else if (gait < 0.15 && hostileNear) {   // fighting stance: guard up whenever trouble's nearby and you're not mid-swing
      hero.armL.rotation.x = -0.72; hero.armR.rotation.x = -0.78; hero.armL.rotation.z = 0.17; hero.armR.rotation.z = -0.17;
      hero.legL.rotation.z = 0.05; hero.legR.rotation.z = -0.05;
    } else if (gait < 0.15 && nearCourtPlay()) {   // idle dribble whenever you're standing near a hoop
      const drib = Math.sin(simTime * 5) * 0.5 + 0.5;
      hero.armR.rotation.x = -0.3 - drib * 0.55; hero.armR.rotation.z = -0.08;
      hero.armL.rotation.x = -0.55; hero.armL.rotation.z = 0.15;
    }
    gunKickT = Math.max(0, gunKickT - dt); kickT = Math.max(0, kickT - dt); comboT = Math.max(0, comboT - dt); hoopShootT = Math.max(0, hoopShootT - dt);
    }
  }
  {
    // keep the foot shadow flat on the road under wherever the body ended up this frame — it must
    // never pick up the stride's lean/roll, and it fades out once you're airborne or in the water
    const bx = hero.group.position.x, bz = hero.group.position.z, bgy = groundY(bx, bz);
    heroBlob.visible = hero.group.visible && !swimming && (hero.group.position.y - bgy) < 1.2;
    if (heroBlob.visible) heroBlob.position.set(bx, bgy + 0.05, bz);
  }
  for (const c of cars) {
    if (c === driving) continue;   // the driven vehicle syncs & leans itself, right in its control branch
    if (c.y > 0) { c.vy -= 30 * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y === 0) c.vy = 0; }
    const gy = groundY(c.x, c.z);
    c.mesh.position.set(c.x, gy + (c.y || 0), c.z);
    c.mesh.rotation.y = c.h;
    c.mesh.rotation.x = (c.y > 0) ? clamp(-c.vy * 0.02, -0.5, 0.5) : 0;
    if (c.bike) c.mesh.rotation.z = clamp((c.lat || 0) * 0.05, -0.45, 0.45);   // lean into turns
  }
  // motorcycle rider: a bike isn't a car, so keep the real player visible and mount them on the saddle.
  // Jet skis reuse the same saddle pose — their seat height rides the bobbing hull instead of the ground.
  if (driving && (driving.bike || driving.jetski) && !mount) {
    const c = driving, fx = Math.sin(c.h), fz = Math.cos(c.h);
    const gy = c.jetski ? c.mesh.position.y + 0.18 : groundY(c.x, c.z) + (c.y || 0);
    // body english: tuck forward under boost (+1), shift upright & braced under hard braking (-1)
    const hardBrake = braking() && c.speed > 6;
    const leanTgt = boosting() ? 1 : (hardBrake ? -0.7 : 0);
    c.riderLean = (c.riderLean || 0) + (leanTgt - (c.riderLean || 0)) * Math.min(1, 8 * dt);
    const L = c.riderLean;
    hero.group.visible = true;
    // boost slides the rider forward over the tank; braking throws their weight back on the seat
    hero.group.position.set(c.x - fx * (0.26 - L * 0.16), gy - 0.04 - Math.max(0, L) * 0.03, c.z - fz * (0.26 - L * 0.16));
    hero.group.rotation.set(0.12 + L * 0.36, c.h, c.mesh.rotation.z);       // pitch: hunch low on boost, sit back on the brakes
    hero.legL.rotation.x = -1.4; hero.legR.rotation.x = -1.4;               // thighs forward onto the tank (-x = toward the front)
    hero.kneeL.rotation.x = 1.55; hero.kneeR.rotation.x = 1.55;             // shins tucked down to the pegs
    hero.legL.rotation.z = 0.22; hero.legR.rotation.z = -0.22;             // knees splay around the frame
    hero.armL.rotation.x = hero.armR.rotation.x = -1.05 - L * 0.2;          // hands forward on the bars (-x = forward)
  }
  updateMount(dt);   // play any in-progress get-in / mount / dismount animation

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
  const dist = driving ? 14 : (inside ? 4.5 : 9), h = driving ? 6 : (inside ? 6 : 4.4);
  tmpP.set(tx - Math.sin(camYaw) * dist, ty + h, tz - Math.cos(camYaw) * dist);
  camPos.lerp(tmpP, 1 - Math.exp(-5 * dt));
  camera.position.copy(camPos);
  skyGroup.position.copy(camera.position);   // keep the sky centred on the player everywhere in the big city
  // screen shake (impacts, landings, busts, wins)
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.4);
    const s = shake * shake * 0.8;
    camera.position.x += rr(-s, s); camera.position.y += rr(-s, s) * 0.5; camera.position.z += rr(-s, s);
  }
  // directional camera punch — snap then ease back for a crisp recoil/blast kick
  if (camKick.lengthSq() > 1e-5) {
    camera.position.add(camKick);
    camKick.multiplyScalar(Math.exp(-13 * dt));
  }
  // speed-based FOV for a sense of velocity while driving
  const tgtFov = 64 + (driving ? clamp(Math.abs(driving.speed) / 26, 0, 1) * 13 : 0);
  if (Math.abs(camera.fov - tgtFov) > 0.04) { camera.fov += (tgtFov - camera.fov) * Math.min(1, 8 * dt); camera.updateProjectionMatrix(); }
  _look.set(tx, ty + 1.7, tz);
  camera.lookAt(_look);
}

// ---------- post-processing bloom (beta) ----------
const BLOOM_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
function buildBloom() {
  if (rtScene) [rtScene, rtB1, rtB2, rtAO, rtAOb].forEach(t => { try { t && t.dispose(); } catch (e) {} });   // free old targets on rebuild (gfx toggle)
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  bloomW = Math.max(2, sz.x); bloomH = Math.max(2, sz.y);
  const hw = Math.max(1, bloomW >> 1), hh = Math.max(1, bloomH >> 1);
  // MSAA on the offscreen scene target — the renderer's antialias flag only smooths the canvas,
  // not this RT, so without this every in-game edge renders jagged/aliased ("pixelated").
  rtScene = new THREE.WebGLRenderTarget(bloomW, bloomH, { depthTexture: new THREE.DepthTexture(bloomW, bloomH), samples: msaaSamples }); rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
  rtB1 = new THREE.WebGLRenderTarget(hw, hh); rtB1.texture.colorSpace = THREE.LinearSRGBColorSpace;
  rtB2 = new THREE.WebGLRenderTarget(hw, hh); rtB2.texture.colorSpace = THREE.LinearSRGBColorSpace;
  rtAO = new THREE.WebGLRenderTarget(hw, hh); rtAO.texture.colorSpace = THREE.LinearSRGBColorSpace;     // half-res AO buffer
  rtAOb = new THREE.WebGLRenderTarget(hw, hh); rtAOb.texture.colorSpace = THREE.LinearSRGBColorSpace;   // AO blur ping-pong
  // depth-only SSAO: darken crevices & where objects meet the ground for a grounded, real feel
  aoMat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uRadius: { value: 0.9 }, uStrength: { value: 1.2 }, uBias: { value: 0.035 } }, vertexShader: BLOOM_VERT,
    fragmentShader: "uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uRadius; uniform float uStrength; uniform float uBias; varying vec2 vUv; float lin(float d){ float z=d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear - z*(uFar-uNear)); } float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); } void main(){ float dc=texture2D(tDepth,vUv).r; if(dc>=0.9999){ gl_FragColor=vec4(1.0); return; } float cz=lin(dc); float aspect=uRes.x/uRes.y; float radUV=clamp(uRadius/cz,0.004,0.05); float occ=0.0; for(int i=0;i<8;i++){ float a=float(i)*0.7853981; vec2 dir=vec2(cos(a),sin(a)); dir.x/=aspect; for(int j=1;j<=2;j++){ float r=radUV*(float(j)*0.5); float sz=lin(texture2D(tDepth,vUv+dir*r).r); float diff=cz-sz; occ+=step(uBias,diff)*(1.0-smoothstep(uRadius*0.6,uRadius*1.6,diff)); } } float ao=1.0-(occ/16.0)*uStrength; gl_FragColor=vec4(vec3(clamp(ao,0.0,1.0)),1.0); }" });
  fsScene = new THREE.Scene(); fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsScene.add(fsQuad);
  brightMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, threshold: { value: 0.7 } }, vertexShader: BLOOM_VERT,
    fragmentShader: "uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv; void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; float l=dot(c,vec3(0.299,0.587,0.114)); gl_FragColor=vec4(c*smoothstep(threshold,threshold+0.18,l),1.0); }" });
  blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: BLOOM_VERT,
    fragmentShader: "uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 s=texture2D(tDiffuse,vUv).rgb*0.227027; s+=texture2D(tDiffuse,vUv+dir*1.3846).rgb*0.316216; s+=texture2D(tDiffuse,vUv-dir*1.3846).rgb*0.316216; s+=texture2D(tDiffuse,vUv+dir*3.2308).rgb*0.07027; s+=texture2D(tDiffuse,vUv-dir*3.2308).rgb*0.07027; gl_FragColor=vec4(s,1.0); }" });
  compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, uAO: { value: 1 }, strength: { value: 1.05 }, uSat: { value: gradeSat }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(bloomW, bloomH) } }, vertexShader: BLOOM_VERT,
    fragmentShader: "uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO; uniform float uAO; uniform float strength; uniform float uSat; uniform float uTime; uniform vec2 uRes; varying vec2 vUv; vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)),vec3(0.41666))-0.055, step(0.0031308,c)); } float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); } void main(){ vec2 uv=vUv; vec2 d=uv-0.5; float r2=dot(d,d); vec3 sc=texture2D(tScene,uv).rgb; float ao=texture2D(tAO,uv).r; sc*=mix(1.0,ao,uAO); vec3 bl=texture2D(tBloom,uv).rgb; vec3 col=toSRGB(max(sc+bl*strength,0.0)); float luma=dot(col,vec3(0.2126,0.7152,0.0722)); col=mix(vec3(luma),col,uSat); col=(col-0.5)*1.05+0.5; col=col*0.965+0.024; vec3 shTint=vec3(1.02,1.0,0.965), hiTint=vec3(1.06,1.008,0.915); col*=mix(shTint,hiTint,smoothstep(0.1,0.9,luma)); col*=vec3(1.022,1.006,0.985); col*=1.0-r2*0.2; col+=(hash(uv*uRes+fract(uTime))-0.5)*0.014; gl_FragColor=vec4(clamp(col,0.0,1.0),1.0); }" });
  bloomReady = true;
}
function blit(mat, target) { fsQuad.material = mat; renderer.setRenderTarget(target || null); renderer.render(fsScene, fsCam); }
function renderBloom() {
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (sz.x !== bloomW || sz.y !== bloomH) {
    bloomW = Math.max(2, sz.x); bloomH = Math.max(2, sz.y);
    const hw = Math.max(1, bloomW >> 1), hh = Math.max(1, bloomH >> 1);
    rtScene.setSize(bloomW, bloomH); rtB1.setSize(hw, hh); rtB2.setSize(hw, hh);
    rtAO.setSize(hw, hh); rtAOb.setSize(hw, hh);
  }
  renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
  // SSAO: compute occlusion from the scene depth, denoise, hand to the composite
  compMat.uniforms.tAO.value = rtAO.texture;
  if (aoOn) {
    aoMat.uniforms.tDepth.value = rtScene.depthTexture;
    aoMat.uniforms.uNear.value = camera.near; aoMat.uniforms.uFar.value = camera.far;
    aoMat.uniforms.uRes.value.set(bloomW, bloomH);
    blit(aoMat, rtAO);
    const aw = 1 / Math.max(1, bloomW >> 1), ah = 1 / Math.max(1, bloomH >> 1);
    blurMat.uniforms.tDiffuse.value = rtAO.texture; blurMat.uniforms.dir.value.set(aw, 0); blit(blurMat, rtAOb);
    blurMat.uniforms.tDiffuse.value = rtAOb.texture; blurMat.uniforms.dir.value.set(0, ah); blit(blurMat, rtAO);
    compMat.uniforms.uAO.value = 1;
  } else compMat.uniforms.uAO.value = 0;
  brightMat.uniforms.tDiffuse.value = rtScene.texture; blit(brightMat, rtB1);
  const tw = 1 / Math.max(1, bloomW >> 1), th = 1 / Math.max(1, bloomH >> 1);
  blurMat.uniforms.tDiffuse.value = rtB1.texture; blurMat.uniforms.dir.value.set(tw, 0); blit(blurMat, rtB2);
  blurMat.uniforms.tDiffuse.value = rtB2.texture; blurMat.uniforms.dir.value.set(0, th); blit(blurMat, rtB1);
  blurMat.uniforms.tDiffuse.value = rtB1.texture; blurMat.uniforms.dir.value.set(tw * 2.2, 0); blit(blurMat, rtB2);
  blurMat.uniforms.tDiffuse.value = rtB2.texture; blurMat.uniforms.dir.value.set(0, th * 2.2); blit(blurMat, rtB1);
  compMat.uniforms.tScene.value = rtScene.texture; compMat.uniforms.tBloom.value = rtB1.texture;
  compMat.uniforms.uTime.value = simTime; compMat.uniforms.uRes.value.set(bloomW, bloomH);
  blit(compMat, null);
  renderer.setRenderTarget(null);
}
function renderFrame() {
  if (bloomOn && !bloomFailed) {
    try { if (!bloomReady) buildBloom(); renderBloom(); return; }
    catch (e) { bloomFailed = true; bloomReady = false; renderer.setRenderTarget(null); }
  }
  renderer.render(scene, camera);
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
let perfFrames = 0, perfAt = performance.now(), perfWarmup = 3, lowStreak = 0;   // adaptive-resolution monitor

let arcPrev = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  const realDt = (now - last) / 1000;
  acc = Math.min(acc + realDt, 0.25);
  last = now;
  if (arcadeOpen) { const adt = Math.min(0.05, (now - arcPrev) / 1000 || 0.016); updateArcade(adt); }
  arcPrev = now;
  // hit-stop: hold the simulation for a few ms on a big impact, then snap back to motion
  if (hitStop > 0) { hitStop -= realDt; acc = 0; }
  if (state.phase === "play") {
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    updateHUD();
    drawMinimap(now / 1000);
    if (mapOpen) drawFullMap();
  } else acc = 0;
  if (state.phase === "play") updateSunShadow();
  renderFrame();
  // adaptive resolution: ONLY in Performance mode (for genuinely weak devices). Quality mode is
  // pinned dead-flat at full resolution (PR_CAP) — no mid-gameplay rescaling, so the picture never
  // softens then sharpens as fps wobbles. "Quality to the sky": crisp and steady, always.
  perfFrames++;
  if (now - perfAt >= 1000) {
    const fps = perfFrames * 1000 / (now - perfAt);
    perfFrames = 0; perfAt = now;
    if (perfWarmup > 0) perfWarmup--;
    else if (state.phase === "play" && gfxMode === "perf") {
      // Only step down after the framerate is low for TWO consecutive seconds, so a transient
      // dip (an explosion, a cop swarm) can't permanently ratchet the resolution to the floor.
      // Recover readily as soon as fps is healthy — no dead-zone where it gets stuck blurry.
      let np = pr;
      if (fps < 46) {
        if (++lowStreak >= 2 && pr > PR_FLOOR) { np = Math.max(PR_FLOOR, pr - 0.1); lowStreak = 0; }
      } else {
        lowStreak = 0;
        if (fps > 54 && pr < PR_CAP) np = Math.min(PR_CAP, pr + 0.15);   // climb back to full sharpness
      }
      if (np !== pr) { pr = np; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); }
    }
  }
  if (devOn && (frames++, now - fpsAt >= 500)) {
    devEl.textContent = Math.round(frames * 1000 / (now - fpsAt)) + " fps · " + pr.toFixed(2) + "x · " +
      renderer.info.render.calls + " calls · " + renderer.info.render.triangles + " tris";
    frames = 0; fpsAt = now;
  }
}
requestAnimationFrame(frame);

// dev instrumentation: programmatic state/input access for automated smoke runs (?dev=1 tooling)
globalThis.__palmCity = {
  THREE, scene, camera, renderer,
  freeze: v => { paused = v; }, render: () => renderFrame(),
  state, player, cars, police, traffic, atms, helis, boats, planes, gangsters, allies, npcs, GANGS, SHOPS, AIRPORT, update, beginPlay, advanceDialogue,
  ragdolls, doPunch: () => doPunch(), explodeAt: (x, z, r) => explodeAt(x, z, r), wasted: () => wasted(),
  forceDrive: c => { driving = c; if (c) { c.speed = c.speed || 0; hero.group.visible = false; } else hero.group.visible = true },
  hero, debugInput: () => ({ fuel, dry: fuel <= 0, dlgLines: !!dlgLines, braking: braking(), inp: readInput(), keys: [...keys] }),
  knockableProps, activeProps, moveObj: (o, dx, dz, r) => moveWithCollision(o, dx, dz, r), projPool,
  combatDebug: () => ({ comboStep, comboT, kickT, punchT, hostileNear, punchBufferT, punchCD }),
  hoopDebug: () => ({ hoopMade, hoopShot, hoopShootT, flying: hb.flying, willMake: hb.willMake, cd: hb.cd, nearCourt: nearCourtPlay(),
    ball: { x: hoopBall.position.x, y: hoopBall.position.y, z: hoopBall.position.z } }),
  COURT,
  pressPunch: () => { actP = true; },
  openArcade: g => openArcade(g), arcadeOpen: () => arcadeOpen,
  swimming: () => swimming,
  sharks, swimmers, race, fishing, treasures, oceanDive: dive, fishTap: () => fishTap(),
  eventsDebug, eventActive: () => eventActive(), currentObjective: () => currentObjective(),
  finishStory: () => { state.mi = M.length; mState = "done"; },   // jump straight to freeplay (dev/testing)
  health: () => health,
  NEM, nemGoons, nemBoss: () => nemBoss, nemCar: () => nemCar, addGrudge: n => nemAddGrudge(n),
  applyGfx: m => applyGfx(m), gfx: () => ({ mode: gfxMode, prCap: PR_CAP, msaa: msaaSamples, pr: renderer.getPixelRatio() }),
  trafPhase: () => trafPhase, setTraf: p => { trafPhase = p; applyTrafPhase(); },
  setCycle: v => { dayCycle = v; envUpdate(); }, setSimTime: t => { simTime = t; envUpdate(); },
  nightBeams: () => trafBeams.visible ? trafBeams.children.filter(c => c.visible).length : 0,
  setWanted: n => { wanted = clamp(n, 0, 5); wantedCD = 14; }, chopper: () => chopper, tank: () => tank,
  mounting: () => !!mount,
  talkTo: () => talkTo(nearestTalkNPC()),
  startJob: id => startJob(id),
  openMap: () => openMap(), openWheel: () => openWheel(), openPhone: () => openPhone(),
  forceCrime: () => { if (wanted < 5) wanted++; wantedCD = 14; },
  hurt: n => hurt(n),
  punch: () => doPunch(),
  closeTut: () => { tutOpen = false; elTut.style.display = "none"; },
  setFuel: n => { fuel = n; },
  GAS,
  crook, medic, HOSPITAL,
  paint: hex => applyPaint(hex),
  buyCurrent: () => buyCurrent(),
  buyMod: t => buyMod(garageCar, t),
  closeGarage: () => closeGarage(),
  openStats: () => openStats(),
  closeStats: () => closeStats(),
  refreshAch: () => refreshAch(true),
  addXP: n => addXP(n),
  debug: () => ({ mState, mStep, raceT, dlg: !!dlgLines, driving: !!driving, jobId: job && job.id, jobProg: job && job.prog, jobT: job && Math.round(job.t), jobDx: job && job.dx, jobDz: job && job.dz, jetpack: !!state.jetpack, jpX: jetpackPickup.x, jpZ: jetpackPickup.z, py: +player.y.toFixed(2), side: side.stage, sx: side.x, sz: side.z, tips0: BIZ[0].tips, wanted, palms: palmsGot(), bestJump: state.bestJump || 0, garage: garageOpen, race: race.stage, rcp: race.cp, stats: statsOpen, health, fuel, tut: tutOpen, lvl: state.lvl, xp: state.xp, lvlMult, chaos, combo, comboMult, bestRampage: state.bestRampage || 0, nemGrudge: NEM.grudge, nemTier: NEM.tier, nemSquadOut: NEM.squadOut, nemShowdown: NEM.showdown, nemSquadAlive: nemSquadAlive(), bossHp: nemBoss ? nemBoss.hp : 0, nemFlee: NEM.flee, nemCarActive: nemCar.active, nemCarHp: Math.round(nemCar.hp), bossWins: state.bossWins || 0 }),
};
