// Palm City — crash damage. Hit something and it shows: the panels where you hit fold in and crumple
// (the real mesh of your car, permanently, dent on dent), a bumper hit hard sags and hangs, the glass
// nearest the hit cracks into a spider's web (a hard enough hit turns the pane milky), a smashed front
// puts the headlights out and gets the radiator steaming, bits of plastic, paint and glass skitter
// across the road and stay there a while, and a badly bent car pulls to one side and loses its top
// speed. Traffic and parked cars (instanced, hundreds of them) take a dent each too, done in their
// vertex shader, with a cracked windscreen if the hit was hard.
import * as THREE from "../vendor/three.module.js";

// ---- instanced cars: one dent per car in an instance attribute (strength, local x, y, z) ----
const DENT_DECL = `attribute vec4 aDent; varying vec3 vDentP; varying float vDentS;`;
const DENT_VERT = `
  vDentP = transformed - aDent.yzw; vDentS = 0.0;
  if (aDent.x > 0.001) {
    float dd = length(vDentP * vec3(1.0, 1.3, 1.0)), R = 0.55 + aDent.x * 2.6;
    float f = 1.0 - smoothstep(0.0, R, dd); f *= f;
    vec3 inward = -normalize(vec3(aDent.y, 0.0, aDent.w) + vec3(1e-4));
    vec3 wob = vec3(sin(transformed.y * 21.0 + transformed.z * 13.0), sin(transformed.x * 17.0 + transformed.z * 9.0) * 0.6, sin(transformed.x * 11.0 + transformed.y * 19.0));
    transformed += (inward + wob * 0.35) * aDent.x * 1.7 * f;
    transformed.y -= aDent.x * 0.5 * f * step(abs(aDent.w), abs(transformed.z) + 0.6) * step(transformed.y, 0.75);   // the bumper droops
    vDentS = aDent.x;
  }`;
// add the dent to a car material (chains onto whatever it already does)
export function dentable(mat, glass = false) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + DENT_DECL)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_INSTANCING\n" + DENT_VERT + "\n#else\nvDentP = vec3(9.0); vDentS = 0.0;\n#endif");
    if (glass) sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vDentP; varying float vDentS;\n" + CRACK_FN)
      .replace("#include <color_fragment>", "#include <color_fragment>\nif (vDentS > 0.06) { float ck = crackAt(vDentP, normalize(vec3(vDentP.x, 0.0, vDentP.z) + 1e-4), 0.4 + vDentS * 4.0, vDentS * 5.0); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), ck * 0.85); diffuseColor.a = max(diffuseColor.a, ck * 0.9); }");
  };
  mat.customProgramCacheKey = () => (key ? key.call(mat) : "") + "-dent" + (glass ? "g" : "");
  mat.needsUpdate = true;
  return mat;
}
// a spider's web of cracks round a point: radial cracks, rings, a crushed star at the centre
const CRACK_FN = `
  #ifndef HAS_CRACK
  #define HAS_CRACK
  float crackAt(vec3 q, vec3 n, float R, float s) {
    float r = length(q); if (r > R) return 0.0;
    vec2 b = abs(n.x) > 0.6 ? q.zy : q.xy;
    float ang = atan(b.y, b.x);
    float wig = sin(r * 40.0 + ang * 3.0) * 0.15;
    float rad = pow(abs(sin(ang * 8.5 + wig + floor(r * 9.0) * 0.7)), 90.0);
    float ring = pow(abs(sin(r * 48.0 + sin(ang * 6.0) * 1.2)), 70.0) * step(r, R * 0.75);
    float core = 1.0 - smoothstep(0.02, 0.07 + s * 0.03, r);
    return clamp(max(max(rad, ring) * (1.0 - r / R) * 1.4, core) * min(1.0, s), 0.0, 1.0);
  }
  #endif`;

// ---- the player's / police cars: real meshes, dented on the CPU ----
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _n3 = new THREE.Matrix3();
function ownGeometry(mesh) {
  if (mesh.userData.ownGeo) return mesh.geometry;
  mesh.userData.origGeo = mesh.geometry;
  mesh.geometry = mesh.geometry.clone(); mesh.userData.ownGeo = true;
  return mesh.geometry;
}
// per-car glass: a crack list in each pane's own coordinates
function crackGlass(mesh) {
  if (mesh.userData.crack) return mesh.userData.crack;
  const base = mesh.material, m = base.clone();
  const U = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] };
  const prev = base.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uCrack = U;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCkP; varying vec3 vCkN;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvCkP = position; vCkN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec4 uCrack[4]; varying vec3 vCkP; varying vec3 vCkN;\n" + CRACK_FN)
      .replace("#include <color_fragment>", `#include <color_fragment>
        { float ck = 0.0;
          for (int i = 0; i < 4; i++) if (uCrack[i].w > 0.0) ck = max(ck, crackAt(vCkP - uCrack[i].xyz, normalize(vCkN), 0.35 + uCrack[i].w * 0.9, uCrack[i].w * 1.6));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), ck * 0.85); diffuseColor.a = max(diffuseColor.a, ck * 0.92); }`);
  };
  m.customProgramCacheKey = () => "glass-crack";
  mesh.material = m; mesh.userData.glassBase = base;
  return (mesh.userData.crack = { U, n: 0 });
}

export function makeDamage(scene, g) {
  // ---- debris: bits of the car left on the road ----
  const MAXD = 220;
  const dGeo = new THREE.BoxGeometry(1, 1, 1);
  const debris = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 }), MAXD);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXD * 3), 3);
  debris.castShadow = true; debris.frustumCulled = false; debris.count = 0; scene.add(debris);
  const bits = []; let nextBit = 0;
  const _c = new THREE.Color();
  function spawnBits(x, y, z, nx, nz, n, carCol, speed) {
    for (let k = 0; k < n; k++) {
      // mostly little stuff: glass crumbs, flakes of paint, bits of black plastic trim; the odd bigger piece
      const kind = Math.random(), col = kind < 0.3 ? carCol : kind < 0.55 ? 0x141416 : kind < 0.88 ? 0xd8e4ec : 0xb8bcc0;
      const glass = kind >= 0.55 && kind < 0.88;
      const big = !glass && Math.random() < (speed > 16 ? 0.12 : 0.03);
      const s = glass ? 0.015 + Math.random() * 0.03 : big ? 0.2 + Math.random() * 0.15 : 0.03 + Math.random() * 0.07;
      const sp = speed * (0.15 + Math.random() * 0.35);
      const b = { x, y, z, vx: -nx * sp + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 3, vz: -nz * sp + (Math.random() - 0.5) * 3,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, sx: s * (glass ? 1 : 1 + Math.random()), sy: s * (glass ? 0.15 : 0.25), sz: s * (0.6 + Math.random()),
        spin: (Math.random() - 0.5) * 18, t: 0, rest: false, col };
      bits[nextBit] = b; nextBit = (nextBit + 1) % MAXD;
    }
  }
  // ---- a crash. c: the car; (wx, wz): where it was hit; (nx, nz): direction from the hit into the car;
  // imp: how hard (m/s of closing speed) ----
  function crash(c, wx, wz, nx, nz, imp) {
    if (imp < 4 || !c) return;
    const col = c.color ?? 0x888888;
    spawnBits(wx, 0.6, wz, nx, nz, Math.min(28, Math.floor(imp * 1.1)), col, imp);
    if (imp > 8 && g.fx) g.fx.sparks(wx, 0.7, wz, Math.min(20, imp));
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    // in the car's frame: x right(ish), z forward
    const dx = wx - c.x, dz = wz - c.z;
    const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
    const dlz = nx * fx + nz * fz, dlx = nx * fz - nz * fx;
    const D = c.dmg || (c.dmg = { front: 0, rear: 0, left: 0, right: 0, total: 0 });
    const s = Math.min(0.3, Math.max(0.02, (imp - 5) * 0.013));
    const len = (c.spec && c.spec.len) || c.len || 4.6;
    if (lz > len * 0.25) D.front += s; else if (lz < -len * 0.25) D.rear += s; else if (lx > 0) D.left += s; else D.right += s;
    D.total += s;
    if (D.front > 0.25) c.headOut = true;
    c.limp = Math.max(0.6, 1 - D.total * 0.25);
    c.pull = Math.max(-0.12, Math.min(0.12, (D.left - D.right) * 0.18 + (D.front > 0.4 ? 0.03 : 0)));
    if (c.chassis) dentMesh(c, lx, lz, dlx, dlz, imp, s, len);
    else {
      // instanced: keep one dent, the worst so far, nudged toward the newest
      const d = c.dent || (c.dent = { s: 0, x: 0, y: 0.55, z: 0 });
      const w = s / (d.s + s);
      d.x = d.x * (1 - w) + lx * w; d.z = d.z * (1 - w) + lz * w; d.s = Math.min(0.3, d.s + s * 0.8);
    }
  }
  function dentMesh(c, lx, lz, dlx, dlz, imp, s, len) {
    const ch = c.chassis;
    ch.updateMatrixWorld(true);
    // the hit in the chassis' own coordinates: the model's +z is forward, +x is... whichever way the
    // body was built; measure it rather than assume
    const P = new THREE.Vector3(lx, 0.55, lz), Dv = new THREE.Vector3(dlx, 0, dlz).normalize();
    const R = Math.min(1.45, 0.55 + imp * 0.035);
    const chInv = _mi.copy(ch.matrixWorld).invert();
    // the chassis frame vs the car frame: chassis +x may be the car's left
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ch.getWorldQuaternion(new THREE.Quaternion()));
    const flip = right.x * Math.cos(c.h) - right.z * Math.sin(c.h) < 0 ? -1 : 1;
    P.x *= flip; Dv.x *= flip;
    ch.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      if (o.material === g.tyreMat) return;
      const M = _m.copy(chInv).multiply(o.matrixWorld), Mi = new THREE.Matrix4().copy(M).invert();
      const glass = o.material && (o.material.transmission > 0 || o.material.opacity < 0.95);
      const geo = ownGeometry(o), pos = geo.attributes.position, nrm = geo.attributes.normal;
      let moved = 0, near = 1e9, nearP = null;
      const dirLocal = Dv.clone().transformDirection(Mi);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(M);
        const ex = _v.x - P.x, ey = (_v.y - P.y) * 1.3, ez = _v.z - P.z, d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (glass && d < near) { near = d; nearP = _v.clone(); }
        if (d >= R) continue;
        let f = 1 - d / R; f *= f;
        const k = s * f;
        // in, a crumple, and a bumper hit hard sags
        _w.copy(Dv).multiplyScalar(k);
        _w.x += Math.sin(_v.y * 23 + _v.z * 11) * k * 0.35; _w.y += Math.sin(_v.x * 19 + _v.z * 7) * k * 0.25; _w.z += Math.sin(_v.x * 13 + _v.y * 17) * k * 0.35;
        if (Math.abs(_v.z) > len / 2 - 0.5 && _v.y < 0.75 && Math.sign(_v.z) === Math.sign(P.z) && Math.abs(P.z) > len / 2 - 1.2) _w.y -= k * 0.9;
        _v.add(_w).applyMatrix4(Mi);
        pos.setXYZ(i, _v.x, _v.y, _v.z);
        // the panel creases: tilt the normal off its smooth direction
        if (nrm) { const n = new THREE.Vector3().fromBufferAttribute(nrm, i); n.addScaledVector(dirLocal, -f * 0.9).add(new THREE.Vector3(Math.sin(i * 1.7), Math.sin(i * 2.3), Math.sin(i * 3.1)).multiplyScalar(f * 0.35)).normalize(); nrm.setXYZ(i, n.x, n.y, n.z); }
        moved++;
      }
      if (moved) { pos.needsUpdate = true; if (nrm) nrm.needsUpdate = true; geo.computeBoundingSphere(); }
      if (glass && near < R * 1.1 && nearP) {
        const C = crackGlass(o), U = C.U.value;
        const lp = nearP.applyMatrix4(Mi);
        // a new crack, or a hit near an old one makes it worse
        let slot = U.findIndex(u => u.w > 0 && Math.hypot(u.x - lp.x, u.y - lp.y, u.z - lp.z) < 0.4);
        if (slot < 0) { slot = C.n % 4; C.n++; U[slot].set(lp.x, lp.y, lp.z, 0); }
        U[slot].w = Math.min(1.6, U[slot].w + 0.25 + imp * 0.04);
      }
    });
  }
  function update(dt, cars) {
    // the bits: fly, bounce, slide to a stop; after a minute they shrink away
    let n = 0;
    const gy = g.groundY;
    for (let i = 0; i < MAXD; i++) {
      const b = bits[i]; if (!b) continue;
      b.t += dt;
      if (b.t > 70) { bits[i] = null; continue; }
      if (!b.rest) {
        b.vy -= 20 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.spin * dt; b.rz += b.spin * 0.7 * dt;
        const floor = gy(b.x, b.z) + b.sy * 0.5;
        if (b.y < floor) { b.y = floor; b.vy *= -0.3; b.vx *= 0.6; b.vz *= 0.6; b.spin *= 0.5; if (Math.abs(b.vy) < 0.6 && Math.hypot(b.vx, b.vz) < 0.4) { b.rest = true; b.rx = 0; b.rz = 0; } }
      }
      const sc = b.t > 60 ? 1 - (b.t - 60) / 10 : 1;
      _m.compose(_v.set(b.x, b.y, b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(b.rx, b.ry, b.rz)), _w.set(b.sx * sc, b.sy * sc, b.sz * sc));
      debris.setMatrixAt(n, _m); _c.set(b.col); debris.setColorAt(n, _c); n++;
    }
    debris.count = n; debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
    // a smashed front: the radiator steams (until it's on fire, then it's smoke)
    for (const c of cars) {
      if (!c || !c.dmg || c.boom) continue;
      if (c.dmg.front > 0.3 && (c.hp === undefined || c.hp >= 45) && Math.random() < dt * (3 + c.dmg.front * 8)) {
        const len = (c.spec && c.spec.len) || c.len || 4.6;
        if (g.fx) g.fx.smoke(c.x + Math.sin(c.h) * (len / 2 - 0.6), (c.y || 0) + 1.0, c.z + Math.cos(c.h) * (len / 2 - 0.6), 0.92);
      }
    }
  }
  // the body shop: panels beaten back out, new glass, new tyres — good as new
  function repair(c) {
    if (c.chassis) c.chassis.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.ownGeo) { o.geometry.dispose(); o.geometry = o.userData.origGeo; o.userData.ownGeo = false; }
      if (o.userData.crack) { o.material.dispose(); o.material = o.userData.glassBase; o.userData.crack = null; }
    });
    c.dmg = null; c.dent = null; c.limp = 1; c.pull = 0; c.headOut = false; c.flat = 0; c.flatSet = null; c.hp = 100;
    if (c.chassis) c.chassis.position.y = 0;
  }
  return { crash, update, bits, repair };
}
