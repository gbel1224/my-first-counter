// Palm City — street props with a bit of physics. Hydrants, bins and newspaper boxes are knocked
// flying by anything driving through them (you, traffic, the cops) and by explosions; a sheared
// hydrant geysers water for a while. Knocked props lie where they land and quietly go back to
// their spots once you're well away.
import * as THREE from "../vendor/three.module.js";

const CELL = 12;
const key = (x, z) => Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);

export function makeProps(street, g) {
  // g: { fx, sound, shake, focus() -> {x,z}, playerCar(), movers() -> [{x,z,h,speed}] }
  const items = [], grid = new Map(), loose = [];
  for (const [kind, mesh, list] of street.props) {
    if (!mesh) continue;
    list.forEach((it, i) => {
      const o = { kind, mesh, i, x0: it[0], y0: it[1], z0: it[2], ry0: it[3], x: it[0], y: it[1], z: it[2], rx: 0, ry: it[3], rz: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, loose: false, t: 0, spray: 0 };
      items.push(o);
      const k = key(o.x0, o.z0); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
    });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const dirty = new Set();
  function write(o) { m.compose(p.set(o.x, o.y, o.z), q.setFromEuler(e.set(o.rx, o.ry, o.rz)), one); o.mesh.setMatrixAt(o.i, m); dirty.add(o.mesh); }
  function knock(o, vx, vy, vz) {
    if (!o.loose) { o.loose = true; loose.push(o); if (o.kind === "hydrant") o.spray = 9; }
    o.vx = vx; o.vy = vy; o.vz = vz; o.t = 0; o.rest = false;
    o.sx = (Math.random() - 0.5) * 12; o.sy = (Math.random() - 0.5) * 6; o.sz = (Math.random() - 0.5) * 12;
    g.sound("door", 0.35, o.kind === "bin" ? 0.7 : 1.3);
  }
  const near = (x, z, fn) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((cx + i) * 4096 + cz + j); if (l) for (const o of l) fn(o); } };
  // something big moving through: anything standing within reach goes flying ahead of it
  function sweep(c) {
    const sp = Math.abs(c.speed || 0); if (sp < 3) return 0;
    const fx = Math.sin(c.h), fz = Math.cos(c.h); let hits = 0;
    near(c.x, c.z, o => {
      if (o.loose && !o.rest) return;
      const dx = o.x - c.x, dz = o.z - c.z;
      const lon = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (Math.abs(lon) < 2.6 && lat < 1.3) {
        const s = Math.sign(c.speed || 1);
        knock(o, fx * sp * 0.9 * s + (Math.random() - 0.5) * 3, 2 + sp * 0.18, fz * sp * 0.9 * s + (Math.random() - 0.5) * 3); hits++;
      }
    });
    return hits;
  }
  function blast(x, z, r) {
    near(x, z, o => {
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz);
      if (d < r) { const f = (1 - d / r) * 16 + 4; knock(o, dx / (d || 1) * f, 5 + f * 0.6, dz / (d || 1) * f); }
    });
    if (r > CELL) for (const o of items) if (!o.loose && (o.x - x) ** 2 + (o.z - z) ** 2 < r * r) knock(o, 0, 6, 0);
  }
  function update(dt, time) {
    const F = g.focus();
    for (const c of g.movers()) {
      if ((c.x - F.x) ** 2 + (c.z - F.z) ** 2 > 140 * 140) continue;
      if (sweep(c) && c === g.playerCar()) { c.vx *= 0.93; c.vz *= 0.93; g.shake && g.shake(0.12); }
    }
    for (let k = loose.length - 1; k >= 0; k--) {
      const o = loose[k];
      o.t += dt;
      if (o.spray > 0) {                                   // the broken main at the hydrant's old spot
        o.spray -= dt;
        if ((o.x0 - F.x) ** 2 + (o.z0 - F.z) ** 2 < 150 * 150 && Math.random() < dt * 40) g.fx.spray(o.x0, o.y0 + 0.2, o.z0);
      }
      if (!o.rest) {
        o.vy -= 18 * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        o.rx += o.sx * dt; o.ry += o.sy * dt; o.rz += o.sz * dt;
        const floor = o.y0 * 0.5;                              // kerb or road: close enough to where it lands
        if (o.y < floor) {
          o.y = floor; o.vy = Math.abs(o.vy) > 3 ? -o.vy * 0.3 : 0; o.vx *= 0.6; o.vz *= 0.6; o.sx *= 0.5; o.sy *= 0.5; o.sz *= 0.5;
          if (Math.hypot(o.vx, o.vz) < 0.6 && o.vy === 0) {       // settle on its side
            o.rest = true; o.rx = Math.PI / 2; o.rz = 0; o.y = floor + (o.kind === "bin" ? 0.3 : 0.2);
          }
        }
        write(o);
      } else if (o.t > 60 && o.spray <= 0 && (o.x0 - F.x) ** 2 + (o.z0 - F.z) ** 2 > 130 * 130) {
        // back where it belongs, out of sight
        o.loose = false; o.rest = false; o.x = o.x0; o.y = o.y0; o.z = o.z0; o.rx = 0; o.ry = o.ry0; o.rz = 0; write(o); loose.splice(k, 1);
      }
    }
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    dirty.clear();
  }
  return { update, blast, items, loose };
}
