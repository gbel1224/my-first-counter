// Palm City — particles and flashes: muzzle flashes, sparks, smoke, fire, explosions, dust.
// One instanced billboard mesh for additive glow, one for soft smoke; a fixed pool, no allocation
// per shot. Shaders fade each particle by its own age so the CPU only integrates positions.
import * as THREE from "../vendor/three.module.js";

const VERT = `
  attribute vec4 aCol; attribute vec2 aAgeSize; varying vec4 vCol; varying vec2 vUv; varying float vAge;
  void main(){
    vUv = uv; vCol = aCol; vAge = aAgeSize.x;
    vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float s = aAgeSize.y;
    vec3 p = c + (right * position.x + up * position.y) * s;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
function pool(scene, n, additive) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: `
      varying vec4 vCol; varying vec2 vUv; varying float vAge;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, ${additive ? "0.0" : "0.35"}, d);
        ${additive ? "gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);" : "gl_FragColor = vec4(vCol.rgb, a * vCol.a);"}
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const age = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  geo.setAttribute("aCol", col); geo.setAttribute("aAgeSize", age);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = additive ? 5 : 4;
  scene.add(mesh);
  const P = [];
  for (let i = 0; i < n; i++) P.push({ life: 0 });
  return { mesh, col, age, P, n, next: 0 };
}

export function createFX(scene) {
  const glow = pool(scene, 700, true), smoke = pool(scene, 500, false);
  const m = new THREE.Matrix4();
  function emit(pl, o) {
    const p = pl.P[pl.next]; pl.next = (pl.next + 1) % pl.n;
    Object.assign(p, o, { t: 0 });
    return p;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function burst(pl, x, y, z, n, spd, up, life, size, r, g, b, a = 1, grav = 0, grow = 0) {
    for (let i = 0; i < n; i++) {
      const th = Math.random() * 6.283, ph = Math.random() * 3.14;
      const s = spd * (0.4 + Math.random() * 0.6);
      emit(pl, { x, y, z, vx: Math.cos(th) * Math.sin(ph) * s, vy: Math.abs(Math.cos(ph)) * s * 0.6 + up * Math.random(), vz: Math.sin(th) * Math.sin(ph) * s,
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), r, g, b, a, grav, grow });
    }
  }
  const api = {
    muzzle(x, y, z, dx, dz) {
      emit(glow, { x: x + dx * 0.2, y, z: z + dz * 0.2, vx: dx * 2, vy: 0, vz: dz * 2, life: 0.06, size: 0.9, r: 4, g: 3, b: 1.4, a: 1, grav: 0, grow: 2 });
      burst(glow, x, y, z, 3, 3, 0, 0.1, 0.18, 3, 2, 0.8);
    },
    sparks(x, y, z, n = 8) { burst(glow, x, y, z, n, 7, 2, 0.35, 0.12, 4, 2.6, 1, 1, 18); },
    dust(x, y, z, n = 6) { burst(smoke, x, y, z, n, 1.5, 0.6, 0.9, 0.9, 0.55, 0.5, 0.44, 0.45, 0, 1.4); },
    smoke(x, y, z, dark = 0.3) {
      emit(smoke, { x: x + rnd(-0.3, 0.3), y, z: z + rnd(-0.3, 0.3), vx: rnd(-0.3, 0.3), vy: rnd(1.2, 2.2), vz: rnd(-0.3, 0.3), life: rnd(1.6, 2.6), size: rnd(0.8, 1.3),
        r: dark, g: dark, b: dark * 1.05, a: 0.55, grav: -0.2, grow: 1.6 });
    },
    fire(x, y, z) {
      emit(glow, { x: x + rnd(-0.5, 0.5), y, z: z + rnd(-0.5, 0.5), vx: rnd(-0.2, 0.2), vy: rnd(1.5, 3), vz: rnd(-0.2, 0.2), life: rnd(0.35, 0.6), size: rnd(0.7, 1.2),
        r: 3.5, g: 1.4, b: 0.3, a: 1, grav: -1, grow: -0.8 });
    },
    // a small hearth flame: tight, tall-ish, quick
    flame(x, y, z, s = 1) {
      emit(glow, { x: x + rnd(-0.12, 0.12) * s, y, z: z + rnd(-0.05, 0.05), vx: rnd(-0.05, 0.05), vy: rnd(0.5, 0.9) * s, vz: 0, life: rnd(0.3, 0.5), size: rnd(0.16, 0.26) * s,
        r: 3.2, g: 1.3, b: 0.3, a: 1, grav: -0.6, grow: -0.9 });
    },
    explosion(x, y, z, s = 1) {
      burst(glow, x, y, z, 26 * s, 9 * s, 3, 0.45, 2.2 * s, 5, 2.6, 0.8, 1, 0, 3);
      burst(glow, x, y, z, 30, 16, 6, 0.8, 0.15, 5, 3, 1.2, 1, 20);
      burst(smoke, x, y + 1, z, 22 * s, 4 * s, 3, 3.2, 2.6 * s, 0.16, 0.15, 0.15, 0.8, -0.4, 2.2);
    },
    // a burst water main: white spray thrown up and falling back
    spray(x, y, z) {
      emit(smoke, { x: x + rnd(-0.1, 0.1), y, z: z + rnd(-0.1, 0.1), vx: rnd(-1.2, 1.2), vy: rnd(6, 9), vz: rnd(-1.2, 1.2), life: rnd(0.9, 1.3), size: rnd(0.35, 0.6),
        r: 0.85, g: 0.9, b: 0.95, a: 0.5, grav: 12, grow: 1.2 });
    },
    tracer(x0, y0, z0, x1, y1, z1) {
      const n = Math.min(12, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        emit(glow, { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: z0 + (z1 - z0) * t, vx: 0, vy: 0, vz: 0, life: 0.05 + t * 0.03, size: 0.12, r: 4, g: 3.4, b: 1.8, a: 1, grav: 0, grow: 0 });
      }
    },
    update(dt) {
      for (const pl of [glow, smoke]) {
        let k = 0;
        for (const p of pl.P) {
          if (p.life <= 0 || p.t >= p.life) continue;
          p.t += dt;
          if (p.t >= p.life) continue;
          p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
          const f = p.t / p.life;
          m.makeTranslation(p.x, p.y, p.z);
          pl.mesh.setMatrixAt(k, m);
          pl.col.setXYZW(k, p.r, p.g, p.b, p.a * (1 - f) * (pl === smoke ? Math.min(1, p.t * 4) : 1));
          pl.age.setXY(k, f, Math.max(0.01, p.size * (1 + p.grow * f)));
          k++;
        }
        pl.mesh.count = k;
        pl.mesh.instanceMatrix.needsUpdate = true; pl.col.needsUpdate = true; pl.age.needsUpdate = true;
      }
    },
  };
  return api;
}
