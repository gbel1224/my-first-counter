// Particles, slash trails, shockwaves, ground telegraphs, floating numbers and loot.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const MAX = 3000;

export class FX {
  constructor(scene, camera, assets) {
    this.scene = scene;
    this.camera = camera;
    this.assets = assets;
    this.items = [];          // meshes with their own update(dt) -> alive
    this.buildParticles();
    this.floatLayer = document.getElementById('floaters');
    this.floaters = [];
    this.loot = [];
    this.slashTex = makeSlashTexture();
    this.ringTex = makeRingTexture();
  }

  // ----- GPU point particles, simulated on the CPU --------------------------
  buildParticles() {
    this.p = {
      pos: new Float32Array(MAX * 3), vel: new Float32Array(MAX * 3), col: new Float32Array(MAX * 3),
      size: new Float32Array(MAX), life: new Float32Array(MAX), max: new Float32Array(MAX),
      grav: new Float32Array(MAX), drag: new Float32Array(MAX), alpha: new Float32Array(MAX),
    };
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.p.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.p.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.p.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uPix: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPix;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPix * 260.0 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);
  }

  emit(pos, { count = 10, speed = 4, spread = 1, up = 0, color = '#ffb35c', size = 0.25, life = 0.6, gravity = -6, drag = 1.5, jitter = 0, dir = null } = {}) {
    const c = new THREE.Color(color);
    const p = this.p;
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      let vx = (Math.random() - 0.5) * 2;
      let vy = (Math.random() - 0.5) * 2;
      let vz = (Math.random() - 0.5) * 2;
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      if (dir) {
        vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread;
      }
      const s = speed * (0.4 + Math.random() * 0.8);
      p.pos[i * 3] = pos.x + (Math.random() - 0.5) * jitter;
      p.pos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * jitter;
      p.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * jitter;
      p.vel[i * 3] = vx * s;
      p.vel[i * 3 + 1] = vy * s + up;
      p.vel[i * 3 + 2] = vz * s;
      const tint = 0.85 + Math.random() * 0.3;
      p.col[i * 3] = c.r * tint;
      p.col[i * 3 + 1] = c.g * tint;
      p.col[i * 3 + 2] = c.b * tint;
      p.size[i] = size * (0.6 + Math.random() * 0.8);
      p.max[i] = p.life[i] = life * (0.6 + Math.random() * 0.6);
      p.grav[i] = gravity;
      p.drag[i] = drag;
    }
  }

  updateParticles(dt) {
    const p = this.p;
    for (let i = 0; i < MAX; i++) {
      if (p.life[i] <= 0) {
        p.alpha[i] = 0;
        continue;
      }
      p.life[i] -= dt;
      const k = Math.max(0, 1 - p.drag[i] * dt);
      p.vel[i * 3] *= k;
      p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * k + p.grav[i] * dt;
      p.vel[i * 3 + 2] *= k;
      p.pos[i * 3] += p.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const t = p.life[i] / p.max[i];
      p.alpha[i] = Math.min(1, t * 2.2);
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = true;
    g.aAlpha.needsUpdate = true;
    g.color.needsUpdate = true;
    g.aSize.needsUpdate = true;
  }

  // ----- Presets ---------------------------------------------------------------
  hitSparks(pos, dir, crit = false) {
    this.emit(pos, { count: crit ? 34 : 18, speed: crit ? 9 : 6, dir, spread: 0.9, color: crit ? '#ffd27a' : '#ffae5c', size: 0.16, life: 0.35, gravity: -12, drag: 2.5 });
    this.emit(pos, { count: 6, speed: 1.5, color: '#fff4de', size: 0.5, life: 0.12, gravity: 0 });
  }

  bones(pos) {
    this.emit(pos, { count: 26, speed: 5, up: 3, color: '#e8dfc8', size: 0.2, life: 0.9, gravity: -14, drag: 0.8, jitter: 1 });
    this.emit(pos, { count: 18, speed: 1.2, up: 1.4, color: '#8fe0ff', size: 0.42, life: 1.4, gravity: 0.6, drag: 1.2, jitter: 1.4 });
  }

  blockSpark(pos) {
    this.emit(pos, { count: 16, speed: 7, color: '#bfe3ff', size: 0.14, life: 0.3, gravity: -10, drag: 2 });
  }

  heal(pos) {
    this.emit(pos, { count: 40, speed: 1.2, up: 2.4, color: '#9cff9a', size: 0.3, life: 1.1, gravity: 0.8, drag: 1.4, jitter: 1.6 });
  }

  levelUp(pos) {
    this.emit(pos, { count: 120, speed: 2, up: 7, color: '#ffd27a', size: 0.32, life: 1.6, gravity: -1, drag: 1, jitter: 1.2 });
    this.shockwave(pos, { radius: 7, color: '#ffc35a', life: 0.9 });
  }

  embers(pos, count = 2) {
    this.emit(pos, { count, speed: 0.6, up: 1.6, color: '#ff8a3c', size: 0.18, life: 1.8, gravity: 0.4, drag: 0.6, jitter: 0.8 });
  }

  fireRing(pos, radius) {
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * radius * 0.4, pos.y + 0.4, pos.z + Math.sin(a) * radius * 0.4);
      const dir = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a));
      this.emit(p, { count: 3, speed: radius * 2.4, dir, spread: 0.15, color: k % 3 ? '#ff7a2f' : '#ffd27a', size: 0.55, life: 0.55, gravity: 2, drag: 2.2 });
    }
    this.shockwave(pos, { radius, color: '#ff8a3c', life: 0.5 });
  }

  // ----- Meshes that fade out ----------------------------------------------------
  slash(origin, yaw, { tilt = 0, color = '#ffe2b0', radius = 2.3, arc = 2.4, life = 0.2, flip = false } = {}) {
    const geo = new THREE.RingGeometry(radius * 0.45, radius, 32, 1, -arc / 2, arc);
    const mat = new THREE.MeshBasicMaterial({
      map: this.slashTex, color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(origin);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2 + tilt, yaw + Math.PI / 2, 0);
    if (flip) m.scale.x = -1;
    this.scene.add(m);
    let t = 0;
    this.items.push({ obj: m, update: (dt) => {
      t += dt;
      const k = t / life;
      mat.opacity = Math.max(0, 1 - k * k);
      m.rotation.z += dt * (flip ? -6 : 6);
      return k < 1;
    } });
  }

  shockwave(pos, { radius = 5, color = '#ffffff', life = 0.6, y = null } = {}) {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshBasicMaterial({ map: this.ringTex, color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, (y ?? heightAt(pos.x, pos.z)) + 0.15, pos.z);
    this.scene.add(m);
    let t = 0;
    this.items.push({ obj: m, update: (dt) => {
      t += dt;
      const k = t / life;
      const s = 0.2 + radius * (1 - Math.pow(1 - Math.min(k, 1), 3));
      m.scale.set(s, s, s);
      mat.opacity = Math.max(0, 1 - k);
      return k < 1;
    } });
  }

  // Red danger zone on the ground that fills up until the blow lands.
  telegraph(pos, radius, duration, color = '#ff3b2a') {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uFill: { value: 0 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uFill, uAlpha; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          if (d > 1.0) discard;
          float rim = smoothstep(0.9, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
          float fill = step(d, uFill) * 0.28 + smoothstep(uFill - 0.04, uFill, d) * step(d, uFill) * 0.5;
          gl_FragColor = vec4(uColor * 1.6, (rim * 0.9 + fill + 0.06) * uAlpha);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, heightAt(pos.x, pos.z) + 0.12, pos.z);
    m.renderOrder = 3;
    this.scene.add(m);
    let t = 0;
    const handle = { done: false, pos: m.position };
    this.items.push({ obj: m, update: (dt) => {
      t += dt;
      mat.uniforms.uFill.value = Math.min(1, t / duration);
      if (t > duration) mat.uniforms.uAlpha.value = Math.max(0, 1 - (t - duration) / 0.25);
      if (handle.done && t < duration) return false;
      return t < duration + 0.25;
    } });
    return handle;
  }

  // ----- Floating text -------------------------------------------------------------
  text(worldPos, str, cls = '') {
    const el = document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = str;
    this.floatLayer.appendChild(el);
    this.floaters.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), t: 0, vx: (Math.random() - 0.5) * 40 });
  }

  updateFloaters(dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = new THREE.Vector3();
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t > 1.1) {
        f.el.remove();
        return false;
      }
      v.copy(f.pos);
      v.y += f.t * 1.6;
      v.project(this.camera);
      if (v.z > 1) {
        f.el.style.opacity = 0;
        return true;
      }
      const x = (v.x * 0.5 + 0.5) * w + f.vx * f.t;
      const y = (-v.y * 0.5 + 0.5) * h;
      const pop = f.t < 0.12 ? 1.35 - f.t * 2.5 : 1;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      f.el.style.opacity = f.t > 0.7 ? (1.1 - f.t) / 0.4 : 1;
      return true;
    });
  }

  // ----- Loot: coins and xp motes that fly to the player ---------------------------
  dropLoot(pos, { gold = 0, xp = 0 }) {
    const coins = Math.min(8, Math.ceil(gold / 3));
    for (let i = 0; i < coins; i++) {
      const coin = this.assets.prop('d_coin');
      coin.scale.setScalar(0.9);
      coin.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
      this.scene.add(coin);
      const a = Math.random() * Math.PI * 2;
      this.loot.push({ obj: coin, kind: 'gold', value: gold / coins, vel: new THREE.Vector3(Math.cos(a) * 3, 6 + Math.random() * 3, Math.sin(a) * 3), t: 0 });
    }
    const orbs = Math.min(6, Math.ceil(xp / 10));
    for (let i = 0; i < orbs; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#b6ff8a').multiplyScalar(3), toneMapped: false }));
      orb.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
      this.scene.add(orb);
      const a = Math.random() * Math.PI * 2;
      this.loot.push({ obj: orb, kind: 'xp', value: xp / orbs, vel: new THREE.Vector3(Math.cos(a) * 2.5, 5 + Math.random() * 2, Math.sin(a) * 2.5), t: 0 });
    }
  }

  updateLoot(dt, playerPos, collect) {
    const target = new THREE.Vector3();
    this.loot = this.loot.filter((l) => {
      l.t += dt;
      const o = l.obj;
      target.copy(playerPos).setY(playerPos.y + 1.2);
      if (l.t > 0.7) {
        const to = target.clone().sub(o.position);
        const d = to.length();
        if (d < 0.6) {
          collect(l.kind, l.value);
          this.scene.remove(o);
          return false;
        }
        l.vel.lerp(to.normalize().multiplyScalar(14 + l.t * 6), Math.min(1, dt * 6));
      } else {
        l.vel.y -= 18 * dt;
        const ground = heightAt(o.position.x, o.position.z) + 0.3;
        if (o.position.y < ground && l.vel.y < 0) {
          o.position.y = ground;
          l.vel.y *= -0.45;
          l.vel.x *= 0.6;
          l.vel.z *= 0.6;
        }
      }
      o.position.addScaledVector(l.vel, dt);
      o.rotation.y += dt * 8;
      if (l.kind === 'xp' && Math.random() < 0.3) this.emit(o.position, { count: 1, speed: 0.2, color: '#b6ff8a', size: 0.14, life: 0.4, gravity: 0 });
      return true;
    });
  }

  update(dt, playerPos, collect) {
    this.updateParticles(dt);
    this.items = this.items.filter((it) => {
      const alive = it.update(dt);
      if (!alive) {
        this.scene.remove(it.obj);
        it.obj.geometry?.dispose();
        it.obj.material?.dispose();
      }
      return alive;
    });
    this.updateFloaters(dt);
    this.updateLoot(dt, playerPos, collect);
  }
}

function makeSlashTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d');
  // RingGeometry UVs run across the ring; brightest at the outer edge, fading at the tail.
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,220,170,0.25)');
  grad.addColorStop(0.92, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 63);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.93, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
