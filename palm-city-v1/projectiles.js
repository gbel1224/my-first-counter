// Palm City — pooled projectiles (bullet tracers + real rocket/grenade flight) and the
// pooled additive muzzle flash. Split out of game.js; the scene and the two particle
// emitters are injected once via initProjectiles() — pools are built there too, since
// the scene doesn't exist yet at module-evaluation time.
import * as THREE from "./vendor/three.module.js";
import { rr, clamp } from "./util.js";
import { canvasTex } from "./textures.js";

let scene = null, burst = null, emit = null;
// previously every shot resolved instantly regardless of range — a rocket fired at something 70 units
// away detonated on the spot, which read as broken. Bullets keep their hit resolved instantly (the
// target's state can't get weird mid-flight that way) but now draw an actual tracer flying to the
// impact point; rockets/grenades are the real fix — they fly there and the blast only fires on arrival.
const projDir = new THREE.Vector3(), UP_Y = new THREE.Vector3(0, 1, 0);
const BULLET_SPEED = 150, ROCKET_SPEED = 42, GRENADE_SPEED = 30;
const PROJ_POOL = 28;
const bulletGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const rocketBodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.3 });
const rocketNoseMat = new THREE.MeshStandardMaterial({ color: 0xd94a2e, roughness: 0.4, emissive: 0x220900 });
function makeRocketMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), rocketBodyMat));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), rocketNoseMat); nose.position.y = 0.41; g.add(nose);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.14), rocketBodyMat);
    f.position.set(Math.sin(i * Math.PI / 2) * 0.11, -0.24, Math.cos(i * Math.PI / 2) * 0.11);
    g.add(f);
  }
  return g;
}
const grenadeGeo = new THREE.SphereGeometry(0.09, 8, 6), grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.6 });
export const projPool = [];
export function initProjectiles(deps) {
  scene = deps.scene; burst = deps.burst; emit = deps.emit;
  for (let i = 0; i < PROJ_POOL; i++) {
    const bullet = new THREE.Mesh(bulletGeo, bulletMat); bullet.visible = false; scene.add(bullet);
    const rocket = makeRocketMesh(); rocket.visible = false; scene.add(rocket);
    const grenade = new THREE.Mesh(grenadeGeo, grenadeMat); grenade.visible = false; scene.add(grenade);
    projPool.push({ bullet, rocket, grenade, active: false, kind: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, life: 0, trailCD: 0, onArrive: null });
  }
  for (let i = 0; i < FLASH_POOL; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false; scene.add(sp);
    flashPool.push({ sprite: sp, life: 0 });
  }
}
let projCursor = 0;
function projMesh(p) { return p.kind === "rocket" ? p.rocket : p.kind === "grenade" ? p.grenade : p.bullet; }
export function fireProjectile(kind, x, y, z, tx, ty, tz, onArrive) {
  const p = projPool[projCursor]; projCursor = (projCursor + 1) % PROJ_POOL;
  if (p.active) projMesh(p).visible = false;                 // pool exhausted (shouldn't happen) — steal the oldest
  ty = ty != null ? ty : y;
  const dx = tx - x, dy = ty - y, dz = tz - z, dist = Math.hypot(dx, dy, dz) || 1;
  const speed = kind === "rocket" ? ROCKET_SPEED : kind === "grenade" ? GRENADE_SPEED : BULLET_SPEED;
  p.active = true; p.kind = kind; p.x = x; p.y = y; p.z = z; p.tx = tx; p.ty = ty; p.tz = tz;
  p.vx = dx / dist * speed; p.vy = dy / dist * speed; p.vz = dz / dist * speed;
  p.life = dist / speed + 0.15; p.trailCD = 0; p.onArrive = onArrive || null;
  const mesh = projMesh(p);
  mesh.visible = true; mesh.position.set(x, y, z);
  if (kind !== "grenade") { projDir.set(p.vx, p.vy, p.vz).normalize(); mesh.quaternion.setFromUnitVectors(UP_Y, projDir); }
}
export function updateProjectiles(dt) {
  for (const p of projPool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.kind === "grenade") p.vy -= 9 * dt;                 // gentle lob arc
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const mesh = projMesh(p);
    mesh.position.set(p.x, p.y, p.z);
    if (p.kind !== "grenade") { projDir.set(p.vx, p.vy, p.vz).normalize(); mesh.quaternion.setFromUnitVectors(UP_Y, projDir); }
    if (p.kind === "rocket") {
      p.trailCD -= dt;
      if (p.trailCD <= 0) { p.trailCD = 0.025; emit(p.x, p.y, p.z, rr(-0.15, 0.15), rr(-0.1, 0.2), rr(-0.15, 0.15), 0.5, 0.32, 0.32, 0.32); }
    }
    const dx2 = p.tx - p.x, dy2 = p.ty - p.y, dz2 = p.tz - p.z;
    if (dx2 * dx2 + dy2 * dy2 + dz2 * dz2 < (p.kind === "bullet" ? 1.0 : 2.25) || p.life <= 0) {
      mesh.visible = false; p.active = false;
      if (p.onArrive) p.onArrive();
    }
  }
}
// bright soft muzzle flash (a real additive glow, not just particles) — pooled since rapid-fire
// weapons can loose several shots before the last flash has faded
const flashTex = canvasTex(48, (ctx, s) => { const c = s / 2; const g = ctx.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, "#fff8e0"); g.addColorStop(0.4, "#ffcf7a"); g.addColorStop(1, "rgba(255,140,40,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); });
const FLASH_POOL = 6;
const flashPool = [];
let flashCursor = 0;
export function muzzleFlash(x, y, z, big) {
  const f = flashPool[flashCursor]; flashCursor = (flashCursor + 1) % FLASH_POOL;
  f.sprite.position.set(x, y, z); f.sprite.visible = true; f.sprite.material.opacity = 1;
  f.sprite.scale.set(big ? 1.3 : 0.65, big ? 1.3 : 0.65, 1);
  f.life = 0.07;
  burst(x, y, z, big ? 14 : 8, big ? 0.9 : 0.6, big ? 0.9 : 0.6, big ? 0.22 : 0.16, 1, big ? 0.6 : 0.9, big ? 0.3 : 0.55);
}
export function updateFlashes(dt) {
  for (const f of flashPool) {
    if (f.life <= 0) continue;
    f.life -= dt;
    f.sprite.material.opacity = clamp(f.life / 0.07, 0, 1);
    if (f.life <= 0) f.sprite.visible = false;
  }
}
