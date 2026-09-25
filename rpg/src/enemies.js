// Skeletons of the Hollow Ruins and Morgrath, the Bone King.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { findBone } from './assets.js';
import { heightAt } from './terrain.js';
import { angleLerp, damp } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);

function makeBar() {
  const g = new THREE.Group();
  const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.13), mat('#100d18', 0.75));
  const fillGeo = new THREE.PlaneGeometry(0.94, 0.07);
  fillGeo.translate(0.47, 0, 0);
  const fill = new THREE.Mesh(fillGeo, mat('#e2483d', 1));
  fill.position.set(-0.47, 0, 0.001);
  bg.renderOrder = fill.renderOrder = 20;
  g.add(bg, fill);
  g.userData.fill = fill;
  g.visible = false;
  return g;
}

const TYPES = {
  minion: {
    model: 'minion', name: 'Risen Minion', hp: 60, speed: 4.7, range: 2.3, damage: 8, poise: 0, xp: 26, gold: 6,
    weapon: ['Skeleton_Blade', 'handslot.r'], attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'], hitAt: 0.45, cooldown: [1.5, 2.6],
    move: 'Running_A',
  },
  warrior: {
    model: 'warrior', name: 'Risen Warden', hp: 120, speed: 3.3, range: 2.6, damage: 14, poise: 1, xp: 48, gold: 12, blockChance: 0.35,
    weapon: ['Skeleton_Axe', 'handslot.r'], shield: ['Skeleton_Shield_Small_A', 'handslot.l'], attacks: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'], hitAt: 0.47, cooldown: [1.6, 2.6],
    move: 'Walking_D_Skeletons',
  },
  skelmage: {
    model: 'skelmage', name: 'Bone Caller', hp: 70, speed: 3.6, range: 12, damage: 11, poise: 0, xp: 38, gold: 10, caster: true,
    weapon: ['Skeleton_Staff', 'handslot.r'], attacks: ['Spellcast_Shoot'], hitAt: 0.42, cooldown: [2.8, 3.8],
    move: 'Walking_D_Skeletons',
  },
};

export class Enemy {
  constructor(type, assets, fx, audio, spawn, { dormant = true, scale = 1 } = {}) {
    this.cfg = TYPES[type];
    this.type = type;
    this.assets = assets;
    this.fx = fx;
    this.audio = audio;
    this.actor = new Actor(assets.character(this.cfg.model), assets.clips.bones, { scale });
    this.object = this.actor.object;
    this.scale = scale;
    this.radius = 0.7 * scale;
    this.maxHp = this.cfg.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.vel = new THREE.Vector3();
    this.home = new THREE.Vector3(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    this.object.position.copy(this.home);
    this.actor.yaw = Math.random() * Math.PI * 2;
    this.cool = 1 + Math.random() * 1.5;
    this.stateTime = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.attach(this.cfg.weapon);
    if (this.cfg.shield) this.attach(this.cfg.shield);
    if (type !== 'boss') {
      this.bar = makeBar();
      this.bar.position.y = 2.75 * scale;
      this.object.add(this.bar);
    }
    this.eyes = [];
    this.actor.model.traverse((o) => {
      if (o.isMesh && /Eyes/i.test(o.name)) {
        o.material.emissive = new THREE.Color('#5fd3ff');
        o.material.emissiveIntensity = 2.5;
        this.eyes.push(o.material);
      }
    });
    if (dormant) {
      this.state = 'dormant';
      this.actor.play('Skeletons_Inactive_Floor_Pose', { fade: 0 });
    } else {
      this.state = 'spawn';
      this.actor.play('Spawn_Ground', { loop: false, fade: 0 });
    }
  }

  get position() {
    return this.object.position;
  }

  get hittable() {
    return this.alive && this.state !== 'dormant' && this.state !== 'rise' && this.state !== 'spawn';
  }

  attach([prop, boneName]) {
    const bone = findBone(this.actor.model, boneName);
    if (!bone) return;
    const w = this.assets.prop(prop);
    w.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bone.add(w);
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  update(dt, ctx) {
    this.stateTime += dt;
    const player = ctx.player;
    const toPlayer = player.position.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    const dir = dist > 0.001 ? toPlayer.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    this.cool -= dt;
    let wish = null;

    switch (this.state) {
      case 'dormant':
        if (dist < 15 && player.state !== 'dead') this.rise();
        break;
      case 'rise':
      case 'spawn':
        if (this.actor.progress >= 1) this.setState('hunt');
        this.face(dir, dt, 3);
        break;
      case 'hunt': {
        if (player.state === 'dead') {
          this.actor.play('Idle_Combat');
          break;
        }
        this.face(dir, dt, 8);
        const want = this.cfg.caster ? 9 : this.cfg.range * 0.85;
        if (this.cfg.caster) {
          if (dist > 13) wish = dir;
          else if (dist < 6.5) wish = dir.clone().negate();
          else wish = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir * 0.6);
          if (this.cool <= 0 && dist < 15) this.startAttack(ctx);
        } else if (dist > want) {
          wish = dir;
        } else if (this.cool <= 0 && ctx.claimAttack(this)) {
          this.startAttack(ctx);
        } else {
          wish = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeDir * 0.45);
          if (dist < want * 0.7) wish.addScaledVector(dir, -0.6);
        }
        if (Math.random() < dt * 0.3) this.strafeDir *= -1;
        break;
      }
      case 'windup':
        this.face(dir, dt, 10);
        if (this.stateTime > this.windup) this.swing(ctx);
        break;
      case 'attack':
        this.updateAttack(dt, ctx, dir, dist);
        break;
      case 'stagger':
        if (this.stateTime > this.staggerTime) this.setState('hunt');
        break;
      case 'block':
        if (this.stateTime > 0.5) this.setState('hunt');
        break;
      case 'dead':
        if (this.stateTime > 2.4) {
          this.object.position.y -= dt * 0.9;
          if (this.stateTime > 4.5) this.removed = true;
        }
        break;
      default: break;
    }

    // Movement + animation.
    const speed = this.cfg.speed * (this.enraged ? 1.25 : 1);
    if (wish && this.state === 'hunt') {
      this.vel.x = damp(this.vel.x, wish.x * speed, 8, dt);
      this.vel.z = damp(this.vel.z, wish.z * speed, 8, dt);
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (v > speed * 0.55 && wish === dir) this.actor.play(this.cfg.move, { speed: this.cfg.move === 'Running_A' ? 1 : 1.25 });
      else this.actor.play(v > 0.8 ? 'Walking_D_Skeletons' : 'Idle_Combat', { speed: 1.1 });
    } else {
      this.vel.multiplyScalar(Math.exp(-7 * dt));
      if (this.state === 'hunt') this.actor.play('Idle_Combat');
    }
    if (this.state !== 'dormant' && this.state !== 'dead') {
      const p = this.position;
      p.addScaledVector(this.vel, dt);
      ctx.colliders.resolve(p, this.radius);
      for (const other of ctx.enemies) {
        if (other === this || !other.alive || other.state === 'dormant') continue;
        const d = p.clone().sub(other.position).setY(0);
        const l = d.length();
        const min = this.radius + other.radius;
        if (l < min && l > 0.001) p.addScaledVector(d.divideScalar(l), (min - l) * 0.5);
      }
      const d = p.clone().sub(player.position).setY(0);
      const l = d.length();
      const min = this.radius + player.radius;
      if (l < min && l > 0.001) p.addScaledVector(d.divideScalar(l), min - l);
      p.y = damp(p.y, heightAt(p.x, p.z), 20, dt);
    }
    if (this.bar) {
      this.bar.visible = this.alive && this.hp < this.maxHp && this.state !== 'dormant';
      if (this.bar.visible) {
        this.bar.quaternion.setFromAxisAngle(UP, -this.actor.yaw).multiply(ctx.camera.quaternion);
        this.bar.userData.fill.scale.x = Math.max(0.001, this.hp / this.maxHp);
      }
    }
    this.actor.update(dt);
  }

  face(dir, dt, rate) {
    this.actor.yaw = angleLerp(this.actor.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-rate * dt));
  }

  rise() {
    this.setState('rise');
    this.actor.play('Skeletons_Awaken_Floor', { loop: false, fade: 0.1, speed: 1.6 });
    this.audio.rise();
    this.fx.emit(this.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 30, speed: 2.5, up: 2, color: '#9c8f76', size: 0.5, life: 1.1, gravity: -2, drag: 2, jitter: 1.2 });
  }

  startAttack(ctx) {
    this.attackClip = this.cfg.attacks[Math.floor(Math.random() * this.cfg.attacks.length)];
    this.setState('windup');
    this.windup = this.cfg.caster ? 0.15 : 0.32;
    this.actor.play('Idle_Combat', { fade: 0.1 });
    for (const m of this.eyes) m.emissive.set('#ff4a2a');
  }

  swing() {
    this.setState('attack');
    this.struck = false;
    this.actor.play(this.attackClip, { loop: false, restart: true, speed: this.cfg.caster ? 1.3 : 1.25, fade: 0.08 });
  }

  updateAttack(dt, ctx, dir, dist) {
    const t = this.actor.progress;
    if (t < this.cfg.hitAt) this.face(dir, dt, 6);
    if (!this.cfg.caster && t < this.cfg.hitAt) {
      const f = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
      this.vel.addScaledVector(f, dt * 10);
    }
    if (!this.struck && t >= this.cfg.hitAt) {
      this.struck = true;
      for (const m of this.eyes) m.emissive.set('#5fd3ff');
      if (this.cfg.caster) {
        ctx.fireball(this, ctx.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), this.cfg.damage);
      } else {
        this.audio.swing(false);
        const f = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
        const inFront = f.dot(dir) > 0.3;
        if (dist < this.cfg.range + 0.5 && inFront) {
          const r = ctx.player.receive(this.cfg.damage, { from: this.position, dir: f, ctx });
          if (r === 'parried') this.stagger(1.3);
          if (r === 'hit') ctx.shake(0.25);
        }
      }
    }
    if (t >= 1) {
      this.cool = this.cfg.cooldown[0] + Math.random() * (this.cfg.cooldown[1] - this.cfg.cooldown[0]);
      ctx.releaseAttack(this);
      if (this.state === 'attack') this.setState('hunt');
    }
  }

  stagger(time) {
    this.setState('stagger');
    this.staggerTime = time;
    this.actor.play('Hit_B', { loop: false, restart: true, fade: 0.05, speed: 0.8 });
    for (const m of this.eyes) m.emissive.set('#5fd3ff');
  }

  takeHit(dmg, { dir, knock, heavy, crit, fire, ctx }) {
    if (!this.hittable) return 0;
    const pos = this.position.clone().add(new THREE.Vector3(0, 1.3 * this.scale, 0));
    // Wardens raise their shields against light frontal blows.
    const facing = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
    if (this.cfg.blockChance && !heavy && !fire && this.state === 'hunt' && facing.dot(dir) < -0.4 && Math.random() < this.cfg.blockChance) {
      this.setState('block');
      this.actor.play('Block', { loop: false, restart: true, fade: 0.05 });
      this.fx.blockSpark(pos);
      this.audio.block();
      this.fx.text(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 'blocked', 'info');
      dmg = Math.round(dmg * 0.25);
    }
    this.hp -= dmg;
    this.fx.hitSparks(pos, dir.clone().setY(0.3), crit);
    if (fire) this.fx.embers(pos, 14);
    this.fx.text(pos.clone().add(new THREE.Vector3(0, 0.9 * this.scale, 0)), String(dmg), crit ? 'crit' : '');
    this.actor.hitFlash(fire ? '#ff7a2f' : '#ffffff', 1);
    this.audio.hit(crit);
    if (this.hp <= 0) {
      this.die(ctx);
      return dmg;
    }
    this.vel.addScaledVector(dir, knock / (1 + this.cfg.poise * 1.5));
    const canStagger = this.state !== 'block' && (this.cfg.poise === 0 || heavy);
    if (canStagger) {
      if (this.state === 'attack' || this.state === 'windup') ctx.releaseAttack(this);
      this.stagger(heavy ? 0.7 : 0.35);
    }
    return dmg;
  }

  die(ctx) {
    this.alive = false;
    ctx.releaseAttack(this);
    this.setState('dead');
    this.actor.play('Death_C_Skeletons', { loop: false, restart: true, fade: 0.08 });
    for (const m of this.eyes) m.emissiveIntensity = 0;
    this.fx.bones(this.position.clone().add(new THREE.Vector3(0, 1, 0)));
    this.audio.bonesBreak();
    this.fx.dropLoot(this.position.clone(), { gold: this.cfg.gold + Math.floor(Math.random() * 5), xp: this.cfg.xp });
    ctx.onKill(this);
  }
}

// ---------------------------------------------------------------------------
// Morgrath, the Bone King
// ---------------------------------------------------------------------------
TYPES.boss = {
  model: 'warrior', name: 'Morgrath, the Bone King', hp: 1500, speed: 3.4, range: 4.2, damage: 26, poise: 3, xp: 500, gold: 120,
  weapon: ['Skeleton_Axe', 'handslot.r'], shield: ['Skeleton_Shield_Large_A', 'handslot.l'], attacks: [], hitAt: 0.5, cooldown: [1.4, 2.2],
  move: 'Walking_D_Skeletons',
};

export class Boss extends Enemy {
  constructor(assets, fx, audio, spawn) {
    super('boss', assets, fx, audio, spawn, { dormant: true, scale: 2.25 });
    this.radius = 1.5;
    this.phase = 1;
    this.cool = 2.5;
    this.lastMove = '';
    this.staggerMeter = 0;
    for (const m of this.eyes) {
      m.emissive.set('#ff3b1f');
      m.emissiveIntensity = 4;
    }
    this.actor.model.traverse((o) => {
      if (o.isMesh && !/Eyes/i.test(o.name) && o.material.color) o.material.color.multiply(new THREE.Color('#d9c9b8'));
    });
  }

  get hittable() {
    return this.alive && this.state !== 'dormant' && this.state !== 'rise' && this.state !== 'intro';
  }

  awaken() {
    this.setState('rise');
    this.actor.play('Skeletons_Awaken_Floor', { loop: false, speed: 1.1, fade: 0.1 });
    this.fx.emit(this.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 80, speed: 5, up: 3, color: '#8a7c64', size: 0.9, life: 1.6, gravity: -2, drag: 1.6, jitter: 3 });
    this.audio.rise();
  }

  update(dt, ctx) {
    this.stateTime += dt;
    const player = ctx.player;
    const toPlayer = player.position.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    const dir = dist > 0.001 ? toPlayer.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
    this.cool -= dt;
    let wish = null;
    if (this.alive && Math.random() < dt * (this.phase === 2 ? 14 : 5)) {
      this.fx.embers(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2)), 1);
    }

    switch (this.state) {
      case 'dormant':
        break;
      case 'rise':
        if (this.actor.progress >= 1) {
          this.setState('intro');
          this.actor.play('Taunt', { loop: false, restart: true });
          this.audio.roar();
          ctx.shake(0.6);
        }
        break;
      case 'intro':
        this.face(dir, dt, 4);
        if (this.actor.progress >= 1) this.setState('hunt');
        break;
      case 'hunt':
        if (player.state === 'dead') {
          this.actor.play('Idle_Combat');
          break;
        }
        this.face(dir, dt, 5);
        if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
          this.enterPhase2(ctx);
          break;
        }
        if (this.cool <= 0) this.choose(ctx, dist);
        else if (dist > 3.6) wish = dir;
        break;
      case 'move':
        this.updateMove(dt, ctx, dir, dist);
        break;
      case 'stagger':
        if (this.stateTime > this.staggerTime) this.setState('hunt');
        break;
      case 'summon':
        if (this.stateTime > 0.9 && !this.summoned) {
          this.summoned = true;
          ctx.summonMinions(3);
        }
        if (this.actor.progress >= 1) this.setState('hunt');
        break;
      case 'dead':
        if (this.stateTime > 3) this.object.position.y -= dt * 0.6;
        break;
      default: break;
    }

    const speed = this.cfg.speed * (this.phase === 2 ? 1.3 : 1);
    if (wish && this.state === 'hunt') {
      this.vel.x = damp(this.vel.x, wish.x * speed, 6, dt);
      this.vel.z = damp(this.vel.z, wish.z * speed, 6, dt);
      this.actor.play('Walking_D_Skeletons', { speed: this.phase === 2 ? 1.2 : 1 });
    } else if (this.state !== 'move') {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      if (this.state === 'hunt') this.actor.play('Idle_Combat');
    }
    if (this.state !== 'dormant' && this.state !== 'dead') {
      const p = this.position;
      p.addScaledVector(this.vel, dt);
      const c = ctx.arena;
      const off = p.clone().sub(c.center).setY(0);
      if (off.length() > c.radius - this.radius) p.copy(c.center.clone().add(off.setLength(c.radius - this.radius)));
      const d = p.clone().sub(player.position).setY(0);
      const l = d.length();
      const min = this.radius + player.radius;
      if (l < min && l > 0.001) player.position.addScaledVector(d.divideScalar(l), -(min - l));
      if (!this.leaping) p.y = damp(p.y, heightAt(p.x, p.z), 20, dt);
    }
    this.actor.update(dt);
  }

  choose(ctx, dist) {
    const moves = [];
    if (dist < 5) moves.push('cleave', 'cleave', 'spin');
    if (dist < 7) moves.push('slam');
    if (dist > 6) moves.push('leap', 'leap');
    if (dist >= 5 && dist <= 6) moves.push('slam');
    let pick = moves[Math.floor(Math.random() * moves.length)] || 'leap';
    if (pick === this.lastMove && moves.length > 1) pick = moves.find((m) => m !== pick) || pick;
    this.lastMove = pick;
    this.startMove(pick, ctx);
  }

  startMove(kind, ctx) {
    this.setState('move');
    this.move = kind;
    this.struck = false;
    const fast = this.phase === 2 ? 1.2 : 1;
    const f = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
    if (kind === 'cleave') {
      this.actor.play('2H_Melee_Attack_Slice', { loop: false, restart: true, speed: 1.0 * fast });
      this.moveHit = 0.45;
    } else if (kind === 'slam') {
      this.slamAt = this.position.clone().addScaledVector(f, 3.4);
      this.tele = this.fx.telegraph(this.slamAt, 3.4, 0.95 / fast);
      this.actor.play('2H_Melee_Attack_Chop', { loop: false, restart: true, speed: 0.8 * fast });
      this.moveHit = 0.5;
    } else if (kind === 'spin') {
      this.tele = this.fx.telegraph(this.position.clone(), 5.2, 0.8 / fast);
      this.actor.play('2H_Melee_Attack_Spin', { loop: false, restart: true, speed: 0.85 * fast });
      this.moveHit = 0.45;
    } else if (kind === 'leap') {
      const target = ctx.player.position.clone();
      const c = ctx.arena;
      const off = target.clone().sub(c.center).setY(0);
      if (off.length() > c.radius - 2) target.copy(c.center.clone().add(off.setLength(c.radius - 2)));
      this.leapFrom = this.position.clone();
      this.leapTo = target;
      this.tele = this.fx.telegraph(target, 3.8, 1.05 / fast);
      this.actor.play('1H_Melee_Attack_Jump_Chop', { loop: false, restart: true, speed: 0.95 * fast });
      this.moveHit = 0.55;
    }
  }

  updateMove(dt, ctx, dir, dist) {
    const t = this.actor.progress;
    const player = ctx.player;
    if (this.move === 'cleave' && t < this.moveHit) {
      this.face(dir, dt, 5);
      const f = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
      this.vel.copy(f).multiplyScalar(3.5 * (1 - t / this.moveHit));
    } else {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
    }
    if (this.move === 'leap') {
      const k = Math.min(1, Math.max(0, (t - 0.18) / (this.moveHit - 0.18)));
      this.leaping = k > 0 && k < 1;
      const e = k * k * (3 - 2 * k);
      this.position.lerpVectors(this.leapFrom, this.leapTo, e);
      this.position.y = heightAt(this.position.x, this.position.z) + Math.sin(Math.PI * k) * 6;
      if (k > 0 && k < 1) this.face(this.leapTo.clone().sub(this.leapFrom).setY(0).normalize(), dt, 10);
    }
    if (!this.struck && t >= this.moveHit) {
      this.struck = true;
      this.leaping = false;
      const f = new THREE.Vector3(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
      if (this.move === 'cleave') {
        this.audio.swing(true);
        this.fx.slash(this.position.clone().add(new THREE.Vector3(0, 2.2, 0)), this.actor.yaw, { radius: 5, color: '#ff8a5c', tilt: 0.3 });
        if (dist < 5.4 && f.dot(dir) > 0.1) this.hitPlayer(ctx, this.cfg.damage, false);
      } else {
        const center = this.move === 'slam' ? this.slamAt : this.move === 'spin' ? this.position : this.leapTo;
        const radius = this.move === 'spin' ? 5.2 : this.move === 'slam' ? 3.4 : 3.8;
        const dmg = this.move === 'leap' ? 34 : this.move === 'slam' ? 30 : 22;
        this.audio.slam();
        this.fx.shockwave(center, { radius: radius * 1.6, color: '#ff6a3a', life: 0.6 });
        this.fx.emit(center.clone().setY(heightAt(center.x, center.z) + 0.3), { count: 60, speed: 7, up: 4, color: '#a4927a', size: 0.6, life: 0.9, gravity: -10, drag: 1.5, jitter: radius });
        ctx.shake(this.move === 'spin' ? 0.5 : 1.0);
        if (player.position.clone().sub(center).setY(0).length() < radius + player.radius) this.hitPlayer(ctx, dmg, true);
        if (this.phase === 2 && this.move !== 'spin') ctx.fireTrail(center);
      }
    }
    if (t >= 1) {
      this.cool = (this.phase === 2 ? 0.7 : 1.2) + Math.random() * 0.8;
      this.setState('hunt');
    }
  }

  hitPlayer(ctx, dmg, heavy) {
    const r = ctx.player.receive(dmg, { from: this.position, dir: ctx.player.position.clone().sub(this.position).setY(0).normalize(), heavy, ctx });
    if (r === 'parried') this.stagger(1.6);
  }

  enterPhase2(ctx) {
    this.phase = 2;
    this.enraged = true;
    this.setState('summon');
    this.summoned = false;
    this.actor.play('Spellcast_Summon', { loop: false, restart: true });
    this.audio.roar();
    ctx.toast('The Bone King rages', 'the dead answer his call');
    ctx.shake(0.8);
    for (const m of this.eyes) m.emissiveIntensity = 8;
  }

  takeHit(dmg, opts) {
    if (!this.hittable) return 0;
    const { dir, crit, fire, ctx } = opts;
    const pos = this.position.clone().add(new THREE.Vector3(0, 3, 0));
    this.hp -= dmg;
    this.fx.hitSparks(pos, dir.clone().setY(0.3), crit);
    if (fire) this.fx.embers(pos, 20);
    this.fx.text(pos.clone().add(new THREE.Vector3(0, 1.2, 0)), String(dmg), crit ? 'crit' : '');
    this.actor.hitFlash(fire ? '#ff7a2f' : '#ffffff', 0.8);
    this.audio.hit(crit);
    if (this.hp <= 0) {
      this.die(ctx);
      return dmg;
    }
    this.staggerMeter += dmg;
    if (this.staggerMeter > this.maxHp * 0.22 && this.state === 'hunt') {
      this.staggerMeter = 0;
      this.stagger(1.8);
      this.fx.text(pos, 'staggered', 'info');
    }
    return dmg;
  }

  stagger(time) {
    if (!this.alive) return;
    this.leaping = false;
    if (this.tele) this.tele.done = true;
    super.stagger(time);
  }

  die(ctx) {
    this.alive = false;
    this.setState('dead');
    this.actor.play('Death_C_Skeletons', { loop: false, restart: true, fade: 0.1 });
    for (const m of this.eyes) m.emissiveIntensity = 0;
    this.fx.bones(this.position.clone().add(new THREE.Vector3(0, 2, 0)));
    this.fx.fireRing(this.position.clone(), 10);
    this.audio.bonesBreak();
    this.audio.roar();
    this.fx.dropLoot(this.position.clone(), { gold: this.cfg.gold, xp: this.cfg.xp });
    ctx.onKill(this);
    ctx.onBossDefeated(this);
  }
}
