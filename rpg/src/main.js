// Cinderhold: boot, game loop, camera, quests and the glue between systems.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Assets } from './assets.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Enemy, Boss } from './enemies.js';
import { Actor } from './actor.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { ZONES, heightAt, zoneAt } from './terrain.js';
import { clamp, damp, angleLerp } from './noise.js';

const $ = (id) => document.getElementById(id);

const QUALITY = {
  low: { pixelRatio: 1, shadows: false, grass: 18000, bloom: false, samples: 0 },
  medium: { pixelRatio: 1.25, shadows: true, grass: 60000, bloom: true, samples: 2 },
  high: { pixelRatio: 2, shadows: true, grass: 130000, bloom: true, samples: 4 },
};

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.55 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb += vec3(0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.35, l));   // cool, violet shadows
      c.rgb *= mix(vec3(1.0), vec3(1.05, 1.0, 0.94), smoothstep(0.4, 1.5, l)); // warm highlights
      float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.25, 1.0)));
      c.rgb *= mix(1.0, v, uVignette);
      gl_FragColor = c;
    }`,
};

function loadQuality() {
  try {
    const q = localStorage.getItem('cinderhold.quality');
    if (q && QUALITY[q]) return q;
  } catch { /* storage may be blocked */ }
  const touch = matchMedia('(pointer: coarse)').matches;
  return touch ? 'low' : 'high';
}

class Game {
  constructor() {
    this.quality = loadQuality();
    this.userPickedQuality = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
    this.clock = new THREE.Clock();
    this.ui = new UI();
    this.audio = new Audio();
    this.input = new Input(this.renderer.domElement);
    this.assets = new Assets();
    this.state = 'loading';
    this.cam = { yaw: 0, pitch: 0.32, dist: 8, target: new THREE.Vector3(), shake: 0, extra: 0 };
    this.timeScale = 1;
    this.hitstopT = 0;
    this.slowT = 0;
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.npcs = [];
    this.attackers = new Set();
    this.stage = 0;
    this.ruinsTotal = 0;
    this.ruinsKilled = 0;
    this.visitedZones = new Set();
    this.zone = '';
    this.fps = { t: 0, frames: 0, low: 0 };
    addEventListener('resize', () => this.resize());
  }

  // ----- Boot -------------------------------------------------------------------------------
  async boot() {
    const bar = document.querySelector('#loadbar i');
    await this.assets.load((f) => { bar.style.width = `${Math.round(f * 85)}%`; });
    this.world = new World(this.scene, this.renderer, this.assets, this.quality);
    this.world.build();
    bar.style.width = '92%';
    this.fx = new FX(this.scene, this.camera, this.assets);
    this.player = new Player(this.assets, this.fx, this.audio);
    this.scene.add(this.player.object);
    this.player.position.copy(this.world.spawnPoint).setY(heightAt(0, 70));
    this.player.actor.yaw = Math.PI;
    this.spawnNPCs();
    this.spawnEnemies();
    this.buildWard();
    this.setupPost();
    this.applyQuality(this.quality);
    this.ctx = this.makeContext();
    bar.style.width = '100%';
    // Warm up shaders so the first seconds of play don't hitch.
    this.renderer.compile(this.scene, this.camera);
    $('loadbar').hidden = true;
    const play = $('play');
    play.disabled = false;
    play.textContent = 'Begin the hunt';
    play.addEventListener('click', () => this.start());
    $('howto').addEventListener('click', () => this.ui.screen('controls', true));
    $('closeHelp').addEventListener('click', () => this.ui.screen('controls', false));
    this.bindMenus();
    this.state = 'title';
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupPost() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: QUALITY[this.quality].samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  applyQuality(q) {
    this.quality = q;
    const cfg = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, cfg.pixelRatio));
    this.composer.setSize(innerWidth, innerHeight);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== cfg.samples) {
        rt.samples = cfg.samples;
        rt.dispose();
      }
    }
    this.bloom.enabled = cfg.bloom;
    if (this.world.sun.castShadow !== cfg.shadows) {
      this.world.sun.castShadow = cfg.shadows;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    if (this.world.grass) this.world.grass.geometry.instanceCount = Math.min(cfg.grass, this.world.grass.geometry.attributes.aOffset.count);
    for (const b of document.querySelectorAll('#quality button')) b.setAttribute('aria-pressed', String(b.dataset.q === q));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
  }

  bindMenus() {
    for (const b of document.querySelectorAll('#quality button')) {
      b.addEventListener('click', () => {
        this.userPickedQuality = true;
        this.applyQuality(b.dataset.q);
        try { localStorage.setItem('cinderhold.quality', b.dataset.q); } catch { /* optional */ }
      });
    }
    $('soundToggle').addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? 'On' : 'Off';
      this.audio.setEnabled(on);
    });
    $('resume').addEventListener('click', () => this.resume());
    $('respawn').addEventListener('click', () => this.respawn());
    $('keepPlaying').addEventListener('click', () => {
      this.ui.screen('victory', false);
      this.state = 'play';
      this.input.enabled = true;
    });
    $('restart').addEventListener('click', () => location.reload());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !this.talking && !this.input.touch) this.pause();
    });
  }

  // ----- Cast ------------------------------------------------------------------------------
  spawnNPCs() {
    for (const m of this.world.markers.npcs) {
      const actor = new Actor(this.assets.character(m.model), this.assets.clips.hero);
      actor.object.position.set(m.x, heightAt(m.x, m.z), m.z);
      actor.yaw = m.face;
      actor.play(m.id === 'brann' ? 'Idle' : 'Idle', { fade: 0 });
      this.scene.add(actor.object);
      this.world.colliders.circle(m.x, m.z, 0.8);
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(3), toneMapped: false }));
      marker.scale.y = 1.6;
      marker.position.set(0, 3.2, 0);
      actor.object.add(marker);
      this.npcs.push({ ...m, actor, marker, homeYaw: m.face, get position() { return actor.object.position; } });
    }
  }

  spawnEnemies() {
    for (const s of this.world.markers.spawns) {
      const e = new Enemy(s.type, this.assets, this.fx, this.audio, s, { dormant: true });
      e.ruins = true;
      this.scene.add(e.object);
      this.enemies.push(e);
    }
    this.ruinsTotal = this.enemies.length;
    const c = this.world.arenaCenter;
    this.boss = new Boss(this.assets, this.fx, this.audio, { x: c.x, z: c.z - 3 });
    this.boss.actor.yaw = 0;
    this.scene.add(this.boss.object);
    this.enemies.push(this.boss);
  }

  // A shimmering ward seals the shrine road until the ruins are cleansed.
  buildWard() {
    const s = ZONES.shrine;
    const z = s.z + 22;
    const y = heightAt(0, z);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.world.windUniforms.uTime, uFade: { value: 1 }, uColor: { value: new THREE.Color('#7fe0ff') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime, uFade; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float bands = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 3.0 + sin(vUv.x * 20.0 + uTime) * 2.0);
          float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          float a = (0.05 + bands * 0.14) * (1.0 - vUv.y) * edge * uFade;
          gl_FragColor = vec4(uColor * 1.8, a);
        }`,
    });
    const ward = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat);
    ward.position.set(0, y + 3.5, z);
    this.scene.add(ward);
    this.ward = ward;
    this.wardWall = { ax: -7, az: z, bx: 7, bz: z, r: 0.5 };
    this.world.colliders.segments.push(this.wardWall);
    this.gateZ = s.z + 18.5;
  }

  // ----- Context passed to actors ----------------------------------------------------------------
  makeContext() {
    const game = this;
    return {
      get player() { return game.player; },
      get enemies() { return game.enemies; },
      get colliders() { return game.world.colliders; },
      get camYaw() { return game.cam.yaw; },
      get camera() { return game.camera; },
      arena: { center: this.world.arenaCenter, radius: this.world.arenaRadius },
      hitstop: (t, shake) => { game.hitstopT = Math.max(game.hitstopT, t); game.shake(shake); },
      shake: (s) => game.shake(s),
      slowmo: (t) => { game.slowT = t; },
      hurt: (k) => game.ui.hurt(k),
      toast: (a, b) => game.ui.toast(a, b),
      flashLight: (pos, intensity) => game.flashLight(pos, intensity),
      claimAttack: (e) => {
        if (game.attackers.has(e)) return true;
        if (game.attackers.size >= 2) return false;
        game.attackers.add(e);
        return true;
      },
      releaseAttack: (e) => game.attackers.delete(e),
      fireball: (from, target, dmg) => game.fireball(from, target, dmg),
      fireTrail: (pos) => game.fireTrail(pos),
      summonMinions: (n) => game.summonMinions(n),
      onKill: (e) => game.onKill(e),
      onBossDefeated: (b) => game.onBossDefeated(b),
      onDeath: () => game.onDeath(),
    };
  }

  shake(s) {
    this.cam.shake = Math.min(1.2, Math.max(this.cam.shake, s));
  }

  flashLight(pos, intensity) {
    if (!this.flash) {
      this.flash = new THREE.PointLight(new THREE.Color('#ff8a3c'), 0, 22, 1.5);
      this.scene.add(this.flash);
    }
    this.flash.position.copy(pos).setY(pos.y + 1.5);
    this.flash.intensity = intensity * 40;
  }

  // ----- Flow ---------------------------------------------------------------------------------
  start() {
    this.audio.start();
    this.ui.screen('title', false);
    $('title').hidden = true;
    this.ui.showHUD(true);
    this.state = 'play';
    this.input.enabled = true;
    if (!this.input.touch) this.input.lock();
    this.startTime = performance.now();
    this.setStage(0);
    this.cam.yaw = 0;
    this.cam.pitch = 0.28;
    this.cam.target.copy(this.player.position).setY(this.player.position.y + 2.1);
    this.cam.curDist = this.cam.dist;
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.ui.screen('pause', true);
    this.input.unlock();
  }

  resume() {
    this.ui.screen('pause', false);
    this.state = 'play';
    this.clock.getDelta();
    if (!this.input.touch) this.input.lock();
  }

  setStage(n) {
    this.stage = n;
    const ui = this.ui;
    if (n === 0) ui.quest('quest', 'Word from the Elder', 'Speak with Elder Maren by the well in Cinderhold.');
    if (n === 1) ui.quest('quest', 'Cleanse the Hollow Ruins', `Put the risen dead back in the ground. <span class="prog num">${this.ruinsKilled} / ${this.ruinsTotal}</span>`);
    if (n === 2) ui.quest('quest', 'The Ember Shrine', 'The ward has fallen. Climb the northern road to the shrine.');
    if (n === 3) ui.quest('boss', 'Morgrath, the Bone King', 'Break the Bone King and take back the Ember Shard.');
    if (n === 4) ui.quest('quest', 'Bring the Ember Home', 'Return the Ember Shard to Elder Maren.');
    if (n === 5) ui.quest('complete', 'Cinderhold Endures', 'The ember burns again. The valley is yours to wander.');
    if (n > 0) this.audio.quest();
    for (const npc of this.npcs) npc.marker.visible = npc.id === 'maren' ? n === 0 || n === 4 : false;
  }

  objective() {
    const maren = this.npcs.find((n) => n.id === 'maren');
    switch (this.stage) {
      case 0: return maren.position;
      case 1: {
        const left = this.enemies.find((e) => e.ruins && e.alive);
        return left ? left.position : ZONES.ruins;
      }
      case 2: return new THREE.Vector3(0, 0, ZONES.shrine.z);
      case 3: return this.boss.position;
      case 4: return this.shard ? this.shard.position : maren.position;
      default: return null;
    }
  }

  onKill(e) {
    this.player.stats.kills++;
    if (e.ruins) {
      this.ruinsKilled++;
      if (this.stage === 1) this.ui.questText(`Put the risen dead back in the ground. <span class="prog num">${this.ruinsKilled} / ${this.ruinsTotal}</span>`);
      if (this.ruinsKilled >= this.ruinsTotal) this.openWard();
    }
  }

  openWard() {
    if (this.wardOpen) return;
    this.wardOpen = true;
    const segs = this.world.colliders.segments;
    segs.splice(segs.indexOf(this.wardWall), 1);
    this.ui.toast('The ward has fallen', 'the shrine road lies open');
    this.fx.emit(this.ward.position, { count: 120, speed: 4, color: '#7fe0ff', size: 0.4, life: 1.4, gravity: 0, drag: 1.2, jitter: 10 });
    if (this.stage <= 2) this.setStage(2);
  }

  startBoss() {
    this.setStage(3);
    this.bossActive = true;
    this.boss.awaken();
    this.ui.toast('Morgrath', 'the bone king');
    this.gate = { ax: -8, az: this.gateZ, bx: 8, bz: this.gateZ, r: 0.6 };
    this.world.colliders.segments.push(this.gate);
    this.cam.extra = 3.5;
  }

  onBossDefeated(boss) {
    this.bossActive = false;
    this.cam.extra = 0;
    this.ui.bossBar(null);
    const segs = this.world.colliders.segments;
    if (this.gate && segs.includes(this.gate)) segs.splice(segs.indexOf(this.gate), 1);
    for (const e of this.enemies) if (e.summoned && e.alive) e.die(this.ctx);
    this.ui.toast('Victory', 'the bone king falls');
    this.slowT = 1.2;
    // The shard rises from the bones.
    const shard = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: new THREE.Color('#ff7a2f'), emissiveIntensity: 6, roughness: 0.2, metalness: 0.1, flatShading: true }),
    );
    shard.scale.set(0.8, 1.5, 0.8);
    shard.position.copy(boss.position).setY(heightAt(boss.position.x, boss.position.z) + 1.6);
    const light = new THREE.PointLight(new THREE.Color('#ff8a3c'), 30, 14, 1.4);
    shard.add(light);
    this.scene.add(shard);
    this.shard = shard;
    setTimeout(() => this.setStage(4), 2500);
  }

  onDeath() {
    this.input.enabled = false;
    setTimeout(() => {
      this.state = 'dead';
      this.input.unlock();
      const lost = Math.floor(this.player.gold * 0.25);
      this.player.gold -= lost;
      $('deadText').textContent = lost > 0
        ? `The villagers drag you back to the well. ${lost} gold was lost along the way.`
        : 'The villagers drag you back to the well.';
      this.ui.screen('dead', true);
    }, 2200);
  }

  respawn() {
    this.ui.screen('dead', false);
    const v = ZONES.village;
    this.player.respawn(new THREE.Vector3(v.x + 3, heightAt(v.x + 3, v.z + 6), v.z + 6));
    this.player.potions = Math.max(this.player.potions, 2);
    this.attackers.clear();
    for (const e of this.enemies) {
      if (e.summoned) {
        this.scene.remove(e.object);
        e.removed = true;
      }
    }
    if (this.bossActive) {
      // Reset the fight.
      this.bossActive = false;
      this.cam.extra = 0;
      this.ui.bossBar(null);
      const segs = this.world.colliders.segments;
      if (this.gate) segs.splice(segs.indexOf(this.gate), 1);
      this.scene.remove(this.boss.object);
      this.enemies.splice(this.enemies.indexOf(this.boss), 1);
      const c = this.world.arenaCenter;
      this.boss = new Boss(this.assets, this.fx, this.audio, { x: c.x, z: c.z - 3 });
      this.scene.add(this.boss.object);
      this.enemies.push(this.boss);
      this.setStage(2);
    }
    this.state = 'play';
    this.input.enabled = true;
    this.clock.getDelta();
    if (!this.input.touch) this.input.lock();
  }

  // ----- Hazards ------------------------------------------------------------------------------
  fireball(from, target, dmg) {
    const origin = from.position.clone().add(new THREE.Vector3(0, 1.8, 0)).add(new THREE.Vector3(Math.sin(from.actor.yaw), 0, Math.cos(from.actor.yaw)).multiplyScalar(0.8));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe0ff').multiplyScalar(4), toneMapped: false }));
    orb.position.copy(origin);
    this.scene.add(orb);
    this.audio.fireball();
    this.projectiles.push({ obj: orb, vel: target.clone().sub(origin).setLength(13), dmg, t: 0, from: from.position.clone() });
  }

  fireTrail(pos) {
    this.hazards.push({ pos: pos.clone(), r: 2.6, t: 0, life: 5, tick: 0 });
  }

  summonMinions(n) {
    const c = this.world.arenaCenter;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 6;
      const e = new Enemy('minion', this.assets, this.fx, this.audio, { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, { dormant: false });
      e.summoned = true;
      this.scene.add(e.object);
      this.enemies.push(e);
      this.fx.emit(e.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 30, speed: 3, up: 3, color: '#7fe0ff', size: 0.4, life: 1, gravity: -2, jitter: 1 });
    }
  }

  updateHazards(dt) {
    const p = this.player;
    this.projectiles = this.projectiles.filter((pr) => {
      pr.t += dt;
      const to = p.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(pr.obj.position);
      pr.vel.lerp(to.clone().setLength(13), Math.min(1, dt * 0.9));
      pr.obj.position.addScaledVector(pr.vel, dt);
      if (Math.random() < 0.9) this.fx.emit(pr.obj.position, { count: 2, speed: 0.6, color: '#7fe0ff', size: 0.35, life: 0.35, gravity: 0, drag: 2 });
      const hitPlayer = to.length() < 0.95;
      const hitGround = pr.obj.position.y < heightAt(pr.obj.position.x, pr.obj.position.z) + 0.1;
      if (hitPlayer || hitGround || pr.t > 3.2) {
        if (hitPlayer) {
          const r = p.receive(pr.dmg, { from: pr.from, dir: pr.vel.clone().normalize(), ctx: this.ctx });
          if (r === 'hit') this.shake(0.3);
        }
        this.fx.emit(pr.obj.position, { count: 26, speed: 5, color: '#7fe0ff', size: 0.3, life: 0.5, gravity: -4 });
        this.scene.remove(pr.obj);
        return false;
      }
      return true;
    });
    this.hazards = this.hazards.filter((h) => {
      h.t += dt;
      h.tick -= dt;
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * h.r;
        this.fx.emit(new THREE.Vector3(h.pos.x + Math.cos(a) * r, heightAt(h.pos.x, h.pos.z) + 0.2, h.pos.z + Math.sin(a) * r),
          { count: 2, speed: 0.8, up: 2.5, color: '#ff6a2a', size: 0.45, life: 0.7, gravity: 1, drag: 1 });
      }
      if (h.tick <= 0 && p.position.clone().sub(h.pos).setY(0).length() < h.r && p.iframes <= 0) {
        h.tick = 0.6;
        p.hurtBy(7, this.ctx, false);
      }
      return h.t < h.life;
    });
  }

  // ----- Talking ------------------------------------------------------------------------------
  nearestInteractable() {
    const p = this.player.position;
    let best = null;
    let bestD = 3.4;
    for (const n of this.npcs) {
      const d = n.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = { kind: 'npc', npc: n }; }
    }
    if (this.shard && this.shard.position.distanceTo(p) < 3.2) best = { kind: 'shard' };
    return best;
  }

  async interact(target) {
    if (target.kind === 'shard') {
      this.scene.remove(this.shard);
      this.shard = null;
      this.player.actor.play('PickUp', { loop: false, restart: true });
      this.ui.toast('The Ember Shard', 'warm as a hearthstone');
      this.audio.levelUp();
      if (this.stage < 4) this.setStage(4);
      this.hasShard = true;
      return;
    }
    const npc = target.npc;
    this.talking = true;
    this.input.unlock();
    this.player.setState('frozen');
    npc.actor.yaw = Math.atan2(this.player.position.x - npc.position.x, this.player.position.z - npc.position.z);
    this.player.actor.yaw = Math.atan2(npc.position.x - this.player.position.x, npc.position.z - this.player.position.z);
    npc.actor.play('Interact', { loop: false, restart: true });
    this.focusNpc = npc;
    try {
      await this.conversation(npc);
    } finally {
      this.focusNpc = null;
      this.talking = false;
      this.interactCooldown = 0.5;
      if (this.player.state === 'frozen') this.player.setState('move');
      npc.actor.play('Idle', { fade: 0.4 });
      if (this.state === 'play' && !this.input.touch) this.input.lock();
    }
  }

  async conversation(npc) {
    const p = this.player;
    const say = (lines) => this.ui.talk(lines, this.audio);
    if (npc.id === 'maren') {
      if (this.stage === 0) {
        await say([
          { who: 'Elder Maren', text: 'You came. Good. Look north, knight, past the tree line. Do you see the blue light on the old stones?' },
          { who: 'Elder Maren', text: 'Three nights ago Morgrath, the Bone King, tore the Ember Shard from our shrine. Without it the dead do not stay down.' },
          { who: 'Elder Maren', text: 'The Hollow Ruins are crawling with them. Put them back in the ground, and the ward on the shrine road will fall.' },
          { who: 'Elder Maren', text: 'Take these. My own brew. Brann can sharpen that blade, and Tamsin will sell you more tonics if you have coin.' },
        ]);
        p.potions += 2;
        p.fx.text(p.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '+2 potions', 'heal');
        this.setStage(1);
        this.ui.toast('Cleanse the Hollow Ruins', 'follow the road north');
        return;
      }
      if (this.stage === 4 && this.hasShard) {
        await say([
          { who: 'Elder Maren', text: 'Is that... it is warm. You carried it the whole way from the shrine?' },
          { who: 'Elder Maren', text: 'Then Cinderhold owes you its hearths. Stand back, let me give it to the well. The old stones remember fire.' },
        ]);
        this.finale();
        return;
      }
      const hints = {
        1: `The ruins lie north along the road. ${this.ruinsTotal - this.ruinsKilled} of the dead still walk.`,
        2: 'The ward is down. The shrine sits on the high ground past the ruins. Mind the Bone King\'s axe; when it glows, move.',
        3: 'Go. The shrine will not wait.',
        5: 'Rest, knight. The valley is quiet tonight, for the first time in a long while.',
      };
      await say([{ who: 'Elder Maren', text: hints[this.stage] ?? 'Walk with the light.' }]);
      return;
    }
    if (npc.id === 'brann') {
      if (p.bladeBonus === 0) {
        const choice = await say([
          { who: 'Brann the Smith', text: 'That edge is a disgrace. Forty gold and I will put a proper bite on it. Bone is harder than it looks.',
            choices: [{ label: `Hone my blade (40 gold, you have ${Math.floor(p.gold)})`, value: 'buy' }, { label: 'Not now', value: 'no', ghost: true }] },
        ]);
        if (choice === 'buy') {
          if (p.gold >= 40) {
            p.gold -= 40;
            p.bladeBonus = 10;
            this.audio.block();
            this.ui.toast('Blade honed', '+10 damage');
            await say([{ who: 'Brann the Smith', text: 'There. Now it will sing when it bites. Go on, make some noise up north.' }]);
          } else {
            await say([{ who: 'Brann the Smith', text: 'That is not forty. Skeletons carry coin, you know. Old habits.' }]);
          }
        }
      } else {
        await say([{ who: 'Brann the Smith', text: 'Keep the edge clean and it will keep you alive.' }]);
      }
      return;
    }
    if (npc.id === 'tamsin') {
      const choice = await say([
        { who: 'Tamsin the Trader', text: `Tonics, fifteen gold apiece. You have ${Math.floor(p.gold)}. Mind, I do not do refunds to corpses.`,
          choices: [{ label: 'Buy one (15)', value: 1 }, { label: 'Buy three (40)', value: 3 }, { label: 'Just looking', value: 0, ghost: true }] },
      ]);
      const cost = choice === 3 ? 40 : choice === 1 ? 15 : 0;
      if (choice && p.gold >= cost) {
        p.gold -= cost;
        p.potions += choice;
        this.audio.coin();
        this.ui.toast(`+${choice} potion${choice > 1 ? 's' : ''}`, 'press q to drink');
      } else if (choice) {
        await say([{ who: 'Tamsin the Trader', text: 'Come back when your purse is heavier.' }]);
      }
    }
  }

  finale() {
    this.setStage(5);
    const v = ZONES.village;
    const well = new THREE.Vector3(v.x, heightAt(v.x, v.z) + 2.5, v.z);
    this.fx.fireRing(well, 12);
    this.fx.levelUp(well);
    this.audio.levelUp();
    this.audio.combat = 0;
    const flame = new THREE.PointLight(new THREE.Color('#ff9a4a'), 60, 30, 1.3);
    flame.position.copy(well).setY(well.y + 1);
    this.scene.add(flame);
    this.finaleFlame = well;
    for (const n of this.npcs) n.actor.play('Cheer', { fade: 0.3 });
    this.player.actor.play('Cheer', { fade: 0.3 });
    this.player.gainXp(250, this.ctx);
    setTimeout(() => {
      this.ui.stats(this.player, (performance.now() - this.startTime) / 1000);
      this.state = 'victory';
      this.input.enabled = false;
      this.input.unlock();
      this.ui.screen('victory', true);
      for (const n of this.npcs) n.actor.play('Idle', { fade: 0.5 });
    }, 4200);
  }

  // ----- Frame -------------------------------------------------------------------------------
  frame() {
    const raw = Math.min(this.clock.getDelta(), 0.05);
    this.trackFps(raw);
    this.tick(raw);
    this.render();
  }

  // Fast-forward the simulation without drawing (used by automated playtests).
  simulate(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) this.tick(step);
  }

  tick(raw) {
    if (this.state === 'title' || this.state === 'loading') {
      this.titleCamera(raw);
      this.world.update(raw, this.camera, this.player.position);
      this.player.actor.update(raw);
      for (const n of this.npcs) n.actor.update(raw);
      this.fx.update(raw, this.player.position, () => {});
      return;
    }
    if (this.state !== 'play') {
      if (this.state === 'dead') this.player.actor.update(raw);
      return;
    }

    // Time effects: hitstop freezes, slow-mo drags.
    let scale = 1;
    if (this.hitstopT > 0) { this.hitstopT -= raw; scale = 0.04; } else if (this.slowT > 0) { this.slowT -= raw; scale = 0.35; }
    const dt = raw * scale;

    const read = this.input.frame();
    const intent = this.input.enabled && !this.talking ? read : { moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0 };
    if (intent.pause) return this.pause();
    this.interactCooldown = Math.max(0, (this.interactCooldown || 0) - raw);

    this.updateCamera(raw, intent);
    this.player.update(dt, intent, this.ctx);
    if (this.bossActive) {
      // No leaving the arena mid-fight.
      const c = this.world.arenaCenter;
      const off = this.player.position.clone().sub(c).setY(0);
      const lim = this.world.arenaRadius - 0.8;
      if (off.length() > lim) {
        off.setLength(lim);
        this.player.position.x = c.x + off.x;
        this.player.position.z = c.z + off.z;
      }
    }
    for (const e of this.enemies) e.update(dt, this.ctx);
    this.enemies = this.enemies.filter((e) => {
      if (e.removed) this.scene.remove(e.object);
      return !e.removed;
    });
    this.updateHazards(dt);
    this.updateNPCs(dt);
    this.world.update(dt, this.camera, this.player.position);
    this.fx.update(dt, this.player.position, (kind, value) => this.collect(kind, value));
    if (this.flash) this.flash.intensity = damp(this.flash.intensity, 0, 6, raw);
    if (this.ward) {
      const u = this.ward.material.uniforms;
      if (this.wardOpen) u.uFade.value = Math.max(0, u.uFade.value - raw * 0.6);
      this.ward.visible = u.uFade.value > 0;
    }
    if (this.shard) {
      this.shard.rotation.y += raw * 1.5;
      this.shard.position.y += Math.sin(this.world.time * 2) * 0.004;
      if (Math.random() < 0.5) this.fx.embers(this.shard.position, 1);
    }
    if (this.finaleFlame && Math.random() < 0.8) this.fx.embers(this.finaleFlame, 3);
    this.updateQuestTriggers();
    this.updateHUD(raw, intent);
  }

  collect(kind, value) {
    if (kind === 'gold') {
      this.player.gold += value;
      this.audio.coin();
    } else {
      this.player.gainXp(Math.round(value), this.ctx);
      this.audio.xp();
    }
  }

  updateNPCs(dt) {
    const p = this.player.position;
    for (const n of this.npcs) {
      const d = n.position.distanceTo(p);
      if (!this.talking && this.stage !== 5) {
        const want = d < 7 ? Math.atan2(p.x - n.position.x, p.z - n.position.z) : n.homeYaw;
        n.actor.yaw = angleLerp(n.actor.yaw, want, 1 - Math.exp(-3 * dt));
      }
      n.marker.rotation.y += dt * 2;
      n.marker.position.y = 3.2 + Math.sin(this.world.time * 3) * 0.1;
      n.actor.update(dt);
    }
  }

  updateQuestTriggers() {
    const p = this.player.position;
    const zone = zoneAt(p.x, p.z);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone !== 'wilds' && !this.visitedZones.has(zone)) {
        this.visitedZones.add(zone);
        const names = { village: ['Cinderhold', 'a village at the edge of the dark'], ruins: ['The Hollow Ruins', 'where the dead do not rest'], shrine: ['Ember Shrine', 'seat of the stolen flame'], lake: ['Stillwater', 'a quiet place'] };
        const [a, b] = names[zone];
        if (!(zone === 'shrine' && this.stage === 2)) this.ui.toast(a, b);
      }
    }
    if (this.stage === 2 && !this.bossActive && this.boss.alive) {
      const d = p.clone().sub(this.world.arenaCenter).setY(0).length();
      if (d < this.world.arenaRadius - 3) this.startBoss();
    }
    if (this.bossActive) this.ui.bossBar(this.boss);
    // Combat music follows the fight.
    let near = 0;
    for (const e of this.enemies) if (e.alive && e.state !== 'dormant' && e.position.distanceTo(p) < 22) near++;
    this.audio.combat = damp(this.audio.combat, near ? Math.min(1, 0.5 + near * 0.15) : 0, 0.8, 1 / 60);
  }

  updateHUD(dt, intent) {
    const p = this.player;
    this.ui.vitals(p);
    this.ui.tick(dt, p.hp / p.maxHp);
    this.mapTimer = (this.mapTimer || 0) - dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 20;
      this.ui.minimap(p, this.cam.yaw, { npcs: this.npcs, enemies: this.enemies, objective: this.objective() });
    }
    const target = this.talking || p.state === 'dead' ? null : this.nearestInteractable();
    if (target) {
      const label = target.kind === 'shard' ? 'Take the Ember Shard' : `Talk to ${target.npc.name}`;
      this.ui.prompt(`<kbd>${this.input.touch ? 'tap' : 'F'}</kbd>${label}`);
      if (intent.interact && !this.interactCooldown) this.interact(target);
    } else {
      this.ui.prompt(null);
    }
  }

  // ----- Cameras ----------------------------------------------------------------------------------
  titleCamera(dt) {
    const t = performance.now() / 1000;
    const v = ZONES.village;
    const a = -0.35 + t * 0.04;
    const target = new THREE.Vector3(v.x, v.h + 5, v.z - 12);
    this.camera.position.set(v.x + Math.sin(a) * 46, v.h + 19 + Math.sin(t * 0.2) * 2, v.z + 6 + Math.cos(a) * 46);
    this.camera.lookAt(target);
  }

  updateCamera(dt, intent) {
    const c = this.cam;
    const sens = this.input.touch ? 0.004 : 0.0023;
    c.yaw -= intent.lookX * sens;
    c.pitch = clamp(c.pitch + intent.lookY * sens * 0.9, -0.25, 1.05);
    c.dist = clamp(c.dist + (intent.zoom || 0) * 0.8, 4.5, 12);
    const p = this.player.position;
    let tgt = new THREE.Vector3(p.x, p.y + 2.1, p.z);
    let dist = c.dist + c.extra;
    if (this.focusNpc) {
      tgt = p.clone().lerp(this.focusNpc.position, 0.5).setY(p.y + 2.3);
      dist = 6;
    }
    c.target.x = damp(c.target.x, tgt.x, 14, dt);
    c.target.y = damp(c.target.y, tgt.y, 8, dt);
    c.target.z = damp(c.target.z, tgt.z, 14, dt);
    c.curDist = damp(c.curDist ?? dist, dist, 4, dt);
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.curDist);
    let pos = c.target.clone().add(off);
    // Pull in when a wall or building sits between the camera and the knight.
    const len = off.length();
    const dir = off.clone().divideScalar(len);
    this.ray ??= new THREE.Raycaster();
    this.ray.set(c.target, dir);
    this.ray.far = len;
    const hit = this.ray.intersectObjects(this.world.occluders, true)[0];
    const want = hit ? Math.max(1.4, hit.distance - 0.5) : len;
    c.clip = want < (c.clip ?? len) ? want : damp(c.clip ?? len, want, 3, dt);
    pos = c.target.clone().addScaledVector(dir, Math.min(len, c.clip));
    const ground = heightAt(pos.x, pos.z) + 0.7;
    if (pos.y < ground) pos.y = ground;
    c.shake = Math.max(0, c.shake - dt * 2.5);
    if (c.shake > 0) {
      const s = c.shake * c.shake * 0.35;
      pos.x += (Math.random() - 0.5) * s;
      pos.y += (Math.random() - 0.5) * s;
      pos.z += (Math.random() - 0.5) * s;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(c.target);
  }

  render() {
    if (QUALITY[this.quality].bloom || this.quality !== 'low') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // Drop quality automatically if the machine is struggling (unless the player chose).
  trackFps(dt) {
    if (this.state !== 'play' || this.userPickedQuality) return;
    this.fps.t += dt;
    this.fps.frames++;
    if (this.fps.t >= 3) {
      const fps = this.fps.frames / this.fps.t;
      this.fps.t = 0;
      this.fps.frames = 0;
      if (fps < 34 && this.quality !== 'low') {
        this.fps.low++;
        if (this.fps.low >= 1) {
          this.applyQuality(this.quality === 'high' ? 'medium' : 'low');
          this.fps.low = 0;
        }
      }
    }
  }
}

const game = new Game();
window.cinderhold = game;
game.boot().catch((err) => {
  console.error(err);
  const play = $('play');
  play.textContent = 'Could not load';
  document.querySelector('.tagline').textContent = `Something went wrong while loading: ${err.message}. Reload the page to try again.`;
});
