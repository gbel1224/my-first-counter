// A rigged KayKit character with an animation mixer and simple cross-fading.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export class Actor {
  constructor(model, clips, { scale = 1 } = {}) {
    this.object = new THREE.Group();
    this.model = model;
    model.scale.setScalar(scale);
    this.object.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = clips;
    this.actions = {};
    this.current = null;
    this.currentName = '';
    this.yaw = 0;
    this.flash = 0;
    this.materials = [];
    model.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.emissive) this.materials.push({ m, base: m.emissive.clone(), baseI: m.emissiveIntensity });
        }
      }
    });
  }

  get position() {
    return this.object.position;
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips[name];
      if (!clip) throw new Error(`Missing clip ${name}`);
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }

  play(name, { fade = 0.15, loop = true, speed = 1, restart = false } = {}) {
    const next = this.action(name);
    if (this.current === next && !restart) {
      next.setEffectiveTimeScale(speed);
      return next;
    }
    const prev = this.current;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(speed);
    next.setEffectiveWeight(1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
    return next;
  }

  // 0..1 through the current clip.
  get progress() {
    const a = this.current;
    return a ? Math.min(1, a.time / a.getClip().duration) : 0;
  }

  duration(name) {
    return this.clips[name]?.duration ?? 1;
  }

  hitFlash(color = '#ffffff', strength = 1) {
    this.flash = strength;
    this.flashColor = new THREE.Color(color);
  }

  setEmissive(color, intensity) {
    for (const { m } of this.materials) {
      m.emissive.copy(color);
      m.emissiveIntensity = intensity;
    }
  }

  groundY() {
    return heightAt(this.object.position.x, this.object.position.z);
  }

  update(dt) {
    this.mixer.update(dt);
    this.object.rotation.y = this.yaw;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      this.setEmissive(this.flashColor, this.flash * 1.6);
      if (this.flash === 0) for (const it of this.materials) { it.m.emissive.copy(it.base); it.m.emissiveIntensity = it.baseI; }
    }
  }
}
