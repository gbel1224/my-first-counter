/* Match orchestration: menu camera dives to first-person spawn (same scene, no
   loading wall), fixed-timestep sim, interpolated render, results + ranked + challenges. */
import * as THREE from 'three';
import { CONFIG, STRINGS, COL } from './config.js';
import { createBus, EV } from './core/events.js';
import { createSim } from './core/sim.js';
import { createBotBrain } from './core/bots.js';
import { mulberry32 } from './core/rng.js';
import { createChallengeTracker } from './challenges.js';
import { applyRankedResult, rankBadgeShort, rankDifficulty, persist } from './save.js';

export function createMatch({ mode, save, scene3d, hud, audio, input, smoke = false, speed = 1 }) {
  const bus = createBus();
  const seed = (Date.now() & 0xffff) | 1;
  const brainRng = mulberry32(seed * 31 + 7);
  const difficulty = mode === 'ranked' ? rankDifficulty(save.rank) : CONFIG.quickMatchDifficulty;

  /* Match config object: menu builds this and hands it to the match —
     Quick/Ranked/future-online all construct the same shape. */
  const matchConfig = {
    seed,
    mode,
    scoreLimit: CONFIG.scoreLimit,
    timeLimit: CONFIG.timeLimit,
    slots: [
      smoke
        ? { name: STRINGS.playerName, isBot: false, brain: createBotBrain(brainRng, { difficulty: 1 }) }
        : { name: STRINGS.playerName, isBot: false },
      ...STRINGS.botNames.slice(0, CONFIG.botCount).map(name =>
        ({ name, isBot: true, brain: createBotBrain(brainRng, { difficulty }) })),
    ],
  };

  const sim = createSim(matchConfig, bus);
  const playerId = 0;
  const me = sim.state.slots[playerId];

  hud.reset();
  hud.attach(bus, playerId, sim.state.slots);
  hud.setRankBadge(mode === 'ranked' ? rankBadgeShort(save.rank) : null);
  hud.setCrosshair(save.loadout.crosshair);
  hud.setToggles({ shake: save.settings.shake, flash: save.settings.flash });
  audio.attach(bus, playerId);
  const challenges = createChallengeTracker(save, playerId);
  challenges.attach(bus, () => sim.state.slots.map(s => ({ id: s.id, score: s.score })));

  /* beams + sparks off the bus */
  const _s = new THREE.Vector3(), _e = new THREE.Vector3();
  bus.on(EV.FIRE, ev => {
    _s.set(ev.start.x, ev.start.y - 0.12, ev.start.z);
    _e.set(ev.end.x, ev.end.y, ev.end.z);
    if (ev.shooter === playerId && !smoke) {
      // beam leaves the rifle muzzle, not the eye
      const muzzle = new THREE.Vector3(0.34, -0.3, -1.0).applyQuaternion(scene3d.camera.quaternion);
      _s.set(ev.start.x + muzzle.x, ev.start.y + muzzle.y, ev.start.z + muzzle.z);
    }
    const color = ev.isBot ? COL.magenta : scene3d.beamColorFor(save.loadout.beam, sim.state.time);
    scene3d.spawnBeam(_s, _e, color);
    if (ev.hit) scene3d.spawnSparks(ev.end, color);
  });
  bus.on(EV.TAG, ev => {
    const v = sim.state.slots[ev.victim];
    scene3d.spawnSparks({ x: v.pos.x, y: v.pos.y + 1, z: v.pos.z }, ev.victim === playerId ? COL.cyan : COL.magenta, 10);
  });

  /* player look state (commands are absolute yaw/pitch) */
  let yaw = me.yaw, pitch = 0;

  /* camera dive: current menu-orbit camera → first-person at spawn pad */
  const divePos0 = scene3d.camera.position.clone();
  const diveQuat0 = scene3d.camera.quaternion.clone();
  const diveTarget = new THREE.Vector3(me.pos.x, me.pos.y + CONFIG.eyeHeight, me.pos.z);
  const diveQuat1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, me.yaw, 0, 'YXZ'));
  let diveT = 0, phase = 'dive';   // dive → play → over
  let accumulator = 0;
  let over = null;
  let endHandled = false;

  bus.on(EV.MATCH_END, e => { over = e; });

  const ease = k => 1 - Math.pow(1 - k, 3);
  const _v3 = new THREE.Vector3();

  function update(dt, t, paused) {
    if (phase === 'dive') {
      diveT += dt / CONFIG.diveDuration;
      const k = ease(Math.min(diveT, 1));
      scene3d.camera.position.lerpVectors(divePos0, diveTarget, k);
      // arc the path up a touch so it feels like a dive, not a zoom
      scene3d.camera.position.y += Math.sin(k * Math.PI) * 3 * (1 - k);
      scene3d.camera.quaternion.slerpQuaternions(diveQuat0, diveQuat1, k);
      if (diveT >= 1) {
        phase = 'play';
        scene3d.rifle.visible = true;
      }
    }

    // countdown + sim run during/after the dive (no loading wall)
    if (!paused && !over) {
      accumulator = Math.min(accumulator + dt * speed, 0.25 * speed);
      while (accumulator >= sim.dt) {
        if (!smoke) {
          const cmd = input.poll(sim.dt, save.settings.sens);
          yaw -= cmd.lookDX;
          pitch = Math.max(-1.45, Math.min(1.45, pitch - cmd.lookDY));
          me.cmd.mx = cmd.mx; me.cmd.mz = cmd.mz;
          me.cmd.yaw = yaw; me.cmd.pitch = pitch;
          me.cmd.jump = cmd.jump; me.cmd.fire = cmd.fire && phase === 'play';
        }
        sim.step();
        accumulator -= sim.dt;
      }
    }

    const alpha = accumulator / sim.dt;

    // sync drones to bot slots (interpolated)
    for (let i = 0; i < CONFIG.botCount; i++) {
      const s = sim.state.slots[i + 1];
      const d = scene3d.drones[i];
      d.visible = s.alive;
      d.position.set(
        s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha,
        s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha,
        s.prevPos.z + (s.pos.z - s.prevPos.z) * alpha);
      let dy = s.yaw - s.prevYaw;
      if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
      d.rotation.y = s.prevYaw + dy * alpha + Math.PI; // model faces +z
      if (s.spawnProt > 0) d.visible = Math.floor(t * 12) % 2 === 0; // spawn-prot blink
    }

    // first-person camera (after dive)
    if (phase === 'play') {
      if (smoke) { yaw = me.yaw; pitch = me.pitch; }
      _v3.set(
        me.prevPos.x + (me.pos.x - me.prevPos.x) * alpha,
        me.prevPos.y + (me.pos.y - me.prevPos.y) * alpha + CONFIG.eyeHeight,
        me.prevPos.z + (me.pos.z - me.prevPos.z) * alpha);
      scene3d.camera.position.copy(_v3);
      scene3d.camera.rotation.set(pitch, yaw, 0, 'YXZ');
      const shakeAmt = hud.update(dt, sim, scene3d.camera, t);
      if (shakeAmt > 0) {
        scene3d.camera.position.x += (Math.random() - .5) * .06 * shakeAmt;
        scene3d.camera.position.y += (Math.random() - .5) * .06 * shakeAmt;
      }
    } else {
      hud.update(dt, sim, scene3d.camera, t);
    }

    scene3d.updateRings(t, sim.state.powerPadCd <= 0);

    return over && !endHandled;
  }

  /* Called once by main when update() reports the match ended.
     Returns everything the results screen needs. */
  function finish() {
    endHandled = true;
    scene3d.rifle.visible = false;
    const won = over.winner === playerId;
    const meScore = over.scores.find(s => s.id === playerId);
    let best = null;
    for (const s of over.scores) if (s.id !== playerId && (!best || s.score > best.score)) best = s;

    let rp = null;
    if (mode === 'ranked' && !smoke) {
      const margin = meScore.score - (best ? best.score : 0);
      rp = applyRankedResult(save, won, margin);
      for (const [kind, arg] of rp.events) {
        if (kind === 'rankUp') { hud.banner(STRINGS.rankUp(arg), 'cyan', 3); audio.stings.rankUp(); }
      }
    }
    const toasts = smoke ? [] : challenges.commit();
    persist(save);
    (won ? audio.stings.victory : audio.stings.defeat)();
    return { over, won, meScore, rp, toasts };
  }

  return { update, finish, bus, sim, get phase() { return phase; }, mode };
}
