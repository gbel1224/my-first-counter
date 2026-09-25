// The knight: movement, the combo, dodge, block/parry, the Ember Burst, potions and levels.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { heightAt } from './terrain.js';
import { angleLerp, clamp, damp } from './noise.js';

const COMBO = [
  { clip: '1H_Melee_Attack_Slice_Diagonal', speed: 1.55, hit: 0.34, chain: 0.5, done: 0.78, mult: 1.0, tilt: 0.75, lunge: 3.2, flip: false },
  { clip: '1H_Melee_Attack_Slice_Horizontal', speed: 1.6, hit: 0.36, chain: 0.52, done: 0.78, mult: 1.1, tilt: 0.1, lunge: 3.4, flip: true },
  { clip: '1H_Melee_Attack_Chop', speed: 1.35, hit: 0.42, chain: 0.99, done: 0.86, mult: 1.9, tilt: 1.45, lunge: 4.2, heavy: true },
];

export class Player {
  constructor(assets, fx, audio) {
    this.actor = new Actor(assets.character('knight'), assets.clips.hero);
    this.object = this.actor.object;
    this.fx = fx;
    this.audio = audio;
    this.radius = 0.6;
    this.vel = new THREE.Vector3();
    this.level = 1;
    this.xp = 0;
    this.maxHp = 120;
    this.hp = this.maxHp;
    this.stamina = 100;
    this.ember = 0;
    this.potions = 3;
    this.gold = 12;
    this.bladeBonus = 0;
    this.state = 'move';
    this.stateTime = 0;
    this.combo = 0;
    this.queued = false;
    this.hitDone = false;
    this.iframes = 0;
    this.staminaDelay = 0;
    this.blockStart = -10;
    this.time = 0;
    this.stats = { kills: 0, damage: 0, parries: 0, taken: 0, deaths: 0, start: performance.now() };
    this.actor.play('Idle');
  }

  get position() {
    return this.object.position;
  }

  get xpNext() {
    return Math.round(70 * Math.pow(this.level, 1.55));
  }

  get damage() {
    return 16 + (this.level - 1) * 5 + this.bladeBonus;
  }

  forward(v = new THREE.Vector3()) {
    return v.set(Math.sin(this.actor.yaw), 0, Math.cos(this.actor.yaw));
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  spendStamina(n) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.7;
  }

  // ----- Frame update -----------------------------------------------------------
  update(dt, intent, ctx) {
    this.time += dt;
    this.stateTime += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.state !== 'block') this.stamina = Math.min(100, this.stamina + 32 * dt);

    const camYaw = ctx.camYaw;
    const wish = new THREE.Vector3(intent.moveX, 0, intent.moveY);
    // Camera looks along -Z at yaw 0; rotate stick input into world space.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const wx = wish.x * cos - wish.z * sin;
    const wz = -wish.x * sin - wish.z * cos;
    wish.set(wx, 0, wz);
    const moving = wish.lengthSq() > 0.01;

    if (this.state === 'dead') {
      this.actor.update(dt);
      return;
    }
    if (this.state === 'frozen') {
      this.vel.multiplyScalar(0.8);
      this.actor.play('Idle', { fade: 0.3 });
      this.actor.update(dt);
      this.stick(dt);
      return;
    }

    // Actions that can start from free movement.
    const free = this.state === 'move' || this.state === 'block' || (this.state === 'attack' && this.actor.progress > COMBO[this.combo].done);
    if (intent.dodge && free && this.stamina >= 18) return this.startDodge(wish, moving), this.finish(dt, ctx);
    if (intent.ember && free && this.ember >= 100) return this.startEmber(ctx), this.finish(dt, ctx);
    if (intent.potion && free && this.potions > 0 && this.hp < this.maxHp) return this.startPotion(), this.finish(dt, ctx);
    if (intent.attack) {
      if (free && this.state !== 'attack') this.startAttack(0, wish, ctx);
      else if (this.state === 'attack') {
        if (this.actor.progress > COMBO[this.combo].done && this.combo < COMBO.length - 1) this.startAttack(this.combo + 1, wish, ctx);
        else this.queued = true;
      }
    }

    switch (this.state) {
      case 'move':
      case 'block': this.updateMove(dt, intent, wish, moving); break;
      case 'attack': this.updateAttack(dt, wish, moving, ctx); break;
      case 'dodge': this.updateDodge(dt); break;
      case 'ember': this.updateEmber(dt, ctx); break;
      case 'potion': this.updatePotion(dt, wish, moving); break;
      case 'hurt':
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        if (this.stateTime > 0.38) this.setState('move');
        break;
      default: break;
    }
    this.finish(dt, ctx);
  }

  finish(dt, ctx) {
    // Integrate, collide, stick to the ground.
    const p = this.object.position;
    const before = p.clone();
    p.addScaledVector(this.vel, dt);
    if (ctx.colliders.resolve(p, this.radius) && heightAt(p.x, p.z) < -0.7) p.copy(before);
    this.stick(dt);
    this.actor.update(dt);
  }

  stick(dt) {
    const p = this.object.position;
    const g = heightAt(p.x, p.z);
    p.y = damp(p.y, g, 25, dt);
    if (p.y < g) p.y = g;
  }

  updateMove(dt, intent, wish, moving) {
    const blocking = intent.block && this.stamina > 1;
    if (blocking && this.state !== 'block') {
      this.setState('block');
      this.blockStart = this.time;
    }
    if (intent.blockPressed) this.blockStart = this.time;
    if (!blocking && this.state === 'block') this.setState('move');

    const sprint = intent.sprint && moving && !blocking && this.stamina > 2;
    const speed = blocking ? 2.4 : sprint ? 9.6 : 6.2;
    if (sprint) this.spendStamina(16 * dt);
    const target = wish.clone().multiplyScalar(moving ? speed * Math.min(1, wish.length() * 1.4) : 0);
    const accel = moving ? 12 : 14;
    this.vel.x = damp(this.vel.x, target.x, accel, dt);
    this.vel.z = damp(this.vel.z, target.z, accel, dt);
    if (moving && !blocking) this.actor.yaw = angleLerp(this.actor.yaw, Math.atan2(wish.x, wish.z), 1 - Math.exp(-14 * dt));

    const v = Math.hypot(this.vel.x, this.vel.z);
    if (blocking) this.actor.play('Blocking', { fade: 0.12 });
    else if (v > 7.5) this.actor.play('Running_B', { speed: 1.1 });
    else if (v > 0.6) this.actor.play('Running_A', { speed: Math.max(0.7, v / 6.2) });
    else this.actor.play('Idle', { fade: 0.25 });
  }

  // Soft lock: snap toward the best enemy near the input/facing direction.
  aim(wish, ctx, range = 6) {
    const f = wish.lengthSq() > 0.01 ? wish.clone().normalize() : this.forward();
    let best = null;
    let bestScore = -Infinity;
    for (const e of ctx.enemies) {
      if (!e.alive || e.state === 'dormant') continue;
      const to = e.position.clone().sub(this.position).setY(0);
      const d = to.length();
      if (d > range) continue;
      const dot = f.dot(to.normalize());
      if (dot < 0.2) continue;
      const score = dot * 2 - d / range;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (best) this.actor.yaw = Math.atan2(best.position.x - this.position.x, best.position.z - this.position.z);
    else if (wish.lengthSq() > 0.01) this.actor.yaw = Math.atan2(wish.x, wish.z);
    return best;
  }

  startAttack(i, wish, ctx) {
    if (this.stamina < 6) return;
    const a = COMBO[i];
    this.combo = i;
    this.queued = false;
    this.hitDone = false;
    this.swung = false;
    this.setState('attack');
    this.aim(wish, ctx);
    this.spendStamina(a.heavy ? 14 : 9);
    this.actor.play(a.clip, { loop: false, speed: a.speed, restart: true, fade: 0.08 });
  }

  updateAttack(dt, wish, moving, ctx) {
    const a = COMBO[this.combo];
    const t = this.actor.progress;
    const f = this.forward();
    // Step into the swing, then plant.
    const lunge = t < a.hit ? a.lunge * (1 - t / a.hit) : 0;
    this.vel.x = damp(this.vel.x, f.x * lunge, 20, dt);
    this.vel.z = damp(this.vel.z, f.z * lunge, 20, dt);
    if (!this.swung && t > a.hit - 0.12) {
      this.swung = true;
      this.audio.swing(a.heavy);
      const origin = this.position.clone().add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(f, 0.4);
      this.fx.slash(origin, this.actor.yaw, { tilt: a.tilt, flip: a.flip, radius: a.heavy ? 2.8 : 2.4, color: a.heavy ? '#ffc07a' : '#ffe6c2' });
    }
    if (!this.hitDone && t >= a.hit) {
      this.hitDone = true;
      this.strike(ctx, { mult: a.mult, range: a.heavy ? 3.1 : 2.8, arc: a.heavy ? 0.35 : 0.1, knock: a.heavy ? 9 : 4, heavy: !!a.heavy });
    }
    if (this.queued && t > a.chain && this.combo < COMBO.length - 1) {
      this.startAttack(this.combo + 1, wish, ctx);
      return;
    }
    if (t >= 1 || (t > a.done && moving)) {
      this.setState('move');
      this.combo = 0;
    }
  }

  strike(ctx, { mult, range, arc, knock, heavy, fire = false, radial = false }) {
    const f = this.forward();
    let landed = 0;
    for (const e of ctx.enemies) {
      if (!e.alive || !e.hittable) continue;
      const to = e.position.clone().sub(this.position).setY(0);
      const d = to.length() - e.radius;
      if (d > range) continue;
      if (!radial && f.dot(to.normalize()) < arc) continue;
      const crit = Math.random() < 0.12 + (heavy ? 0.08 : 0);
      let dmg = Math.round(this.damage * mult * (crit ? 1.8 : 1) * (0.9 + Math.random() * 0.2));
      const dir = e.position.clone().sub(this.position).setY(0).normalize();
      const dealt = e.takeHit(dmg, { dir, knock, heavy, crit, fire, from: this, ctx });
      if (dealt > 0) {
        landed++;
        this.stats.damage += dealt;
        this.ember = Math.min(100, this.ember + (heavy ? 12 : 7));
      }
    }
    if (landed) ctx.hitstop(heavy ? 0.09 : 0.055, heavy ? 0.5 : 0.28);
    return landed;
  }

  startDodge(wish, moving) {
    this.spendStamina(20);
    const dir = moving ? wish.clone().normalize() : this.forward().negate();
    this.dodgeDir = dir;
    this.actor.yaw = Math.atan2(dir.x, dir.z);
    this.iframes = 0.42;
    this.setState('dodge');
    this.actor.play('Dodge_Forward', { loop: false, speed: 1.55, restart: true, fade: 0.06 });
    this.audio.dodge();
    this.fx.emit(this.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 12, speed: 2, color: '#c9b48a', size: 0.4, life: 0.6, gravity: 1, drag: 3 });
  }

  updateDodge(dt) {
    const t = this.stateTime;
    const speed = t < 0.42 ? 11.5 * (1 - t / 0.55) : 1;
    this.vel.x = this.dodgeDir.x * speed;
    this.vel.z = this.dodgeDir.z * speed;
    if (t > 0.5) this.setState('move');
  }

  startEmber(ctx) {
    this.ember = 0;
    this.setState('ember');
    this.iframes = 0.9;
    this.emberDone = false;
    this.actor.play('2H_Melee_Attack_Spin', { loop: false, speed: 1.35, restart: true, fade: 0.08 });
    this.audio.ember();
    ctx.shake(0.3);
  }

  updateEmber(dt, ctx) {
    this.vel.multiplyScalar(Math.exp(-10 * dt));
    const t = this.actor.progress;
    if (Math.random() < 0.8) this.fx.embers(this.position.clone().add(new THREE.Vector3(0, 1, 0)), 3);
    if (!this.emberDone && t > 0.3) {
      this.emberDone = true;
      this.fx.fireRing(this.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 7);
      this.strike(ctx, { mult: 3.6, range: 6.5, arc: -1, knock: 14, heavy: true, fire: true, radial: true });
      ctx.shake(0.9);
      ctx.flashLight(this.position, 8);
    }
    if (t >= 1) this.setState('move');
  }

  startPotion() {
    this.potions--;
    this.setState('potion');
    this.healed = false;
    this.actor.play('Use_Item', { loop: false, speed: 1.4, restart: true });
    this.audio.potion();
  }

  updatePotion(dt, wish, moving) {
    const target = moving ? wish.clone().multiplyScalar(2) : new THREE.Vector3();
    this.vel.x = damp(this.vel.x, target.x, 10, dt);
    this.vel.z = damp(this.vel.z, target.z, 10, dt);
    if (!this.healed && this.actor.progress > 0.45) {
      this.healed = true;
      const amt = Math.round(this.maxHp * 0.45);
      this.hp = Math.min(this.maxHp, this.hp + amt);
      this.fx.heal(this.position.clone().add(new THREE.Vector3(0, 1, 0)));
      this.fx.text(this.position.clone().add(new THREE.Vector3(0, 2.6, 0)), '+' + amt, 'heal');
    }
    if (this.actor.progress >= 1) this.setState('move');
  }

  // ----- Taking damage -------------------------------------------------------------
  // Returns 'dodged' | 'parried' | 'blocked' | 'hit'
  receive(amount, { from, dir, heavy = false, unblockable = false, ctx }) {
    if (this.state === 'dead') return 'dodged';
    if (this.iframes > 0) {
      if (this.state === 'dodge') this.fx.text(this.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 'dodged', 'info');
      return 'dodged';
    }
    const facing = this.forward();
    const toAttacker = from ? from.clone().sub(this.position).setY(0).normalize() : dir.clone().negate();
    const front = facing.dot(toAttacker) > 0.25;
    if (this.state === 'block' && front && !unblockable) {
      const pos = this.position.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(facing, 0.6);
      if (this.time - this.blockStart < 0.22) {
        this.stats.parries++;
        this.ember = Math.min(100, this.ember + 25);
        this.audio.parry();
        this.fx.blockSpark(pos);
        this.fx.shockwave(this.position, { radius: 2.5, color: '#bfe3ff', life: 0.35 });
        this.fx.text(pos.clone().add(new THREE.Vector3(0, 1, 0)), 'parry!', 'info');
        ctx?.slowmo(0.25);
        return 'parried';
      }
      const cost = amount * 1.2;
      this.audio.block();
      this.fx.blockSpark(pos);
      if (this.stamina >= cost) {
        this.spendStamina(cost);
        this.actor.play('Block_Hit', { loop: false, restart: true, fade: 0.05 });
        setTimeout(() => { if (this.state === 'block') this.actor.play('Blocking'); }, 250);
        this.vel.addScaledVector(toAttacker, -3);
        this.hurtBy(Math.round(amount * 0.12), ctx, false);
        return 'blocked';
      }
      this.stamina = 0;
      this.fx.text(pos, 'guard broken', 'info');
      amount *= 0.7;
    }
    this.hurtBy(amount, ctx, heavy || amount > this.maxHp * 0.12);
    this.vel.addScaledVector(toAttacker, heavy ? -9 : -4);
    return 'hit';
  }

  hurtBy(amount, ctx, flinch) {
    if (amount <= 0) return;
    amount = Math.round(amount);
    this.hp = Math.max(0, this.hp - amount);
    this.stats.taken += amount;
    this.actor.hitFlash('#ff4a3a', 0.8);
    this.fx.text(this.position.clone().add(new THREE.Vector3(0, 2.3, 0)), '-' + amount, 'hurt');
    this.audio.hurt();
    ctx?.hurt(amount / this.maxHp);
    if (this.hp <= 0) {
      this.die(ctx);
      return;
    }
    if (flinch && this.state !== 'ember') {
      this.setState('hurt');
      this.actor.play(Math.random() > 0.5 ? 'Hit_A' : 'Hit_B', { loop: false, restart: true, speed: 1.3, fade: 0.05 });
    }
  }

  die(ctx) {
    this.setState('dead');
    this.stats.deaths++;
    this.vel.set(0, 0, 0);
    this.actor.play('Death_A', { loop: false, restart: true, fade: 0.1 });
    ctx?.onDeath();
  }

  respawn(at) {
    this.hp = this.maxHp;
    this.stamina = 100;
    this.position.copy(at);
    this.setState('move');
    this.actor.play('Idle', { restart: true });
  }

  gainXp(amount, ctx) {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.maxHp += 22;
      this.hp = this.maxHp;
      leveled = true;
    }
    if (leveled) {
      this.fx.levelUp(this.position.clone());
      this.audio.levelUp();
      ctx.toast(`Level ${this.level}`, 'your blade grows keener');
    }
  }

  clampState() {
    this.hp = clamp(this.hp, 0, this.maxHp);
  }
}
