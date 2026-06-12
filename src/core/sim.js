/* Fixed-timestep match simulation. Every combatant (player + bots) is a PlayerSlot:
   commands in → state out. Local input, AI, or (future) network all feed the same
   interface. Deterministic: all randomness via the seeded logic RNG. */
import { CONFIG, STRINGS } from '../config.js';
import { EV } from './events.js';
import { buildWorld, moveBody, raycastWorld, raycastBody, hasLOS } from './world.js';
import { mulberry32 } from './rng.js';

export function createSim(matchConfig, bus) {
  const world = buildWorld();
  const rng = mulberry32(matchConfig.seed ?? 1);
  const dt = 1 / CONFIG.tickRate;

  const slots = matchConfig.slots.map((cfg, i) => ({
    id: i, name: cfg.name, isBot: !!cfg.isBot, brain: cfg.brain ?? null,
    hitboxScale: cfg.isBot ? CONFIG.botHitboxScale : CONFIG.playerHitboxScale,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 }, prevYaw: 0, prevPitch: 0,
    yaw: 0, pitch: 0, onGround: true,
    coyote: 0, jumpBuf: 0, jumpHeld: false,
    shield: CONFIG.shieldMax, lastHitT: -99, lastCombatT: -99, fireCd: 0,
    score: 0, tags: 0, deaths: 0, shotsFired: 0, shotsHit: 0,
    respawnT: 0, alive: true, spawnProt: 0,
    padBoostT: 0,
    cmd: { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, fire: false },
  }));

  const state = {
    world, slots, rng, time: 0, over: false, winner: null, endReason: null,
    countdown: matchConfig.countdown ?? CONFIG.countdownSecs,
    powerPadCd: 0, powerPadOwner: -1,
    leaderPingT: CONFIG.leaderPingInterval,
    matchPointAnnounced: false,
    firstTagDone: false,
    scoreLimit: matchConfig.scoreLimit ?? CONFIG.scoreLimit,
    timeLimit: matchConfig.timeLimit ?? CONFIG.timeLimit,
  };

  function spawnAt(slot, padIdx) {
    const [x, z] = CONFIG.spawnPads[padIdx];
    slot.pos.x = x; slot.pos.y = 0; slot.pos.z = z;
    slot.prevPos.x = x; slot.prevPos.y = 0; slot.prevPos.z = z;
    slot.vel.x = slot.vel.y = slot.vel.z = 0;
    slot.yaw = Math.atan2(x, z); // face arena center (facing dir = (-sin, -cos))
    slot.prevYaw = slot.yaw;
    slot.pitch = 0; slot.prevPitch = 0;
    slot.shield = CONFIG.shieldMax;
    slot.alive = true;
    slot.spawnProt = CONFIG.spawnProtection;
  }
  slots.forEach((s, i) => spawnAt(s, i % CONFIG.spawnPads.length));

  function eyeOf(slot) {
    return { x: slot.pos.x, y: slot.pos.y + CONFIG.eyeHeight, z: slot.pos.z };
  }

  function fire(shooter) {
    shooter.fireCd = CONFIG.fireCooldown;
    shooter.lastCombatT = state.time; // firing keeps you in combat — no regen while attacking
    shooter.shotsFired++;
    const o = eyeOf(shooter);
    const cp = Math.cos(shooter.pitch), sp = Math.sin(shooter.pitch);
    const d = { x: -Math.sin(shooter.yaw) * cp, y: sp, z: -Math.cos(shooter.yaw) * cp };
    let dist = raycastWorld(world, o, d, CONFIG.beamRange);
    let victim = null;
    for (const s of slots) {
      if (s === shooter || !s.alive) continue;
      const t = raycastBody(o, d, s, s.hitboxScale, dist);
      if (t < dist) { dist = t; victim = s; }
    }
    const end = { x: o.x + d.x * dist, y: o.y + d.y * dist, z: o.z + d.z * dist };
    bus.emit(EV.FIRE, { shooter: shooter.id, isBot: shooter.isBot, start: o, end, hit: !!victim });
    if (victim) hit(shooter, victim, end);
  }

  function hit(shooter, victim, point) {
    if (victim.spawnProt > 0) return;
    shooter.shotsHit++;
    victim.shield -= 1;
    victim.lastHitT = state.time;
    victim.lastCombatT = state.time;
    bus.emit(EV.HIT, { shooter: shooter.id, victim: victim.id, point, shield: victim.shield });
    if (victim.shield <= 0) tag(shooter, victim);
  }

  function tag(shooter, victim) {
    const mult = shooter.padBoostT > 0 ? CONFIG.powerPadMultiplier : 1;
    shooter.score += mult;
    shooter.tags++;
    victim.deaths++;
    victim.alive = false;
    victim.respawnT = CONFIG.respawnDelay;
    bus.emit(EV.SHIELD_BREAK, { victim: victim.id });
    bus.emit(EV.TAG, {
      shooter: shooter.id, victim: victim.id, points: mult,
      shooterScore: shooter.score, time: state.time,
      shooterAirborne: !shooter.onGround,
      firstTag: !state.firstTagDone,
    });
    state.firstTagDone = true;
    if (!state.matchPointAnnounced && shooter.score >= CONFIG.matchPointAt) {
      state.matchPointAnnounced = true;
      bus.emit(EV.MATCH_POINT, { slot: shooter.id, score: shooter.score });
    }
    if (shooter.score >= state.scoreLimit) endMatch('score');
  }

  function endMatch(reason) {
    if (state.over) return;
    state.over = true;
    state.endReason = reason;
    let best = slots[0];
    for (const s of slots) if (s.score > best.score) best = s;
    const tied = slots.filter(s => s.score === best.score).length > 1;
    state.winner = tied && reason === 'time' ? null : best.id;
    bus.emit(EV.MATCH_END, {
      winner: state.winner, reason,
      scores: slots.map(s => ({ id: s.id, name: s.name, score: s.score, tags: s.tags, deaths: s.deaths,
        accuracy: s.shotsFired ? s.shotsHit / s.shotsFired : 0 })),
      time: state.time,
    });
  }

  function step() {
    if (state.over) return;

    if (state.countdown > 0) {
      const before = Math.ceil(state.countdown);
      state.countdown -= dt;
      const after = Math.ceil(Math.max(state.countdown, 0));
      if (after !== before) bus.emit(EV.COUNTDOWN, { n: after });
      return;
    }

    state.time += dt;

    // bots think → write their command objects
    for (const s of slots) if (s.brain) s.brain.think(state, s, dt);

    for (const s of slots) {
      s.prevPos.x = s.pos.x; s.prevPos.y = s.pos.y; s.prevPos.z = s.pos.z;
      s.prevYaw = s.yaw; s.prevPitch = s.pitch;
      if (s.fireCd > 0) s.fireCd -= dt;
      if (s.spawnProt > 0) s.spawnProt -= dt;
      if (s.padBoostT > 0) s.padBoostT -= dt;

      if (!s.alive) {
        s.respawnT -= dt;
        if (s.cmd.fire) bus.emit(EV.REFUSAL, { slot: s.id, reason: STRINGS.fireRefusedRespawn });
        if (s.respawnT <= 0) {
          spawnAt(s, rng.int(CONFIG.spawnPads.length));
          bus.emit(EV.RESPAWN, { slot: s.id, pos: { ...s.pos } });
        }
        continue;
      }

      // look
      s.yaw = s.cmd.yaw; s.pitch = Math.max(-1.45, Math.min(1.45, s.cmd.pitch));

      // movement with accel envelope + air control
      const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
      let wx = s.cmd.mx * cy + s.cmd.mz * sy;
      let wz = -s.cmd.mx * sy + s.cmd.mz * cy;
      const mag = Math.hypot(wx, wz);
      if (mag > 1) { wx /= mag; wz /= mag; }
      const targetX = wx * CONFIG.moveSpeed, targetZ = wz * CONFIG.moveSpeed;
      const rate = (CONFIG.moveSpeed / CONFIG.accelRamp) * (s.onGround ? 1 : CONFIG.airControl) * dt;
      const ax = targetX - s.vel.x, az = targetZ - s.vel.z;
      const am = Math.hypot(ax, az);
      if (am > rate) { s.vel.x += (ax / am) * rate; s.vel.z += (az / am) * rate; }
      else { s.vel.x = targetX; s.vel.z = targetZ; }

      // jump: coyote time + input buffer
      s.coyote = s.onGround ? CONFIG.coyoteTime : Math.max(0, s.coyote - dt);
      if (s.cmd.jump && !s.jumpHeld) s.jumpBuf = CONFIG.jumpBuffer;
      else s.jumpBuf = Math.max(0, s.jumpBuf - dt);
      s.jumpHeld = s.cmd.jump;
      if (s.jumpBuf > 0 && s.coyote > 0) {
        s.vel.y = Math.sqrt(2 * CONFIG.gravity * CONFIG.jumpHeight);
        s.jumpBuf = 0; s.coyote = 0;
      }

      moveBody(world, s, dt);

      // jump pads
      for (const [jx, jz, push] of CONFIG.jumpPads) {
        const ddx = s.pos.x - jx, ddz = s.pos.z - jz;
        if (s.pos.y < 0.5 && ddx * ddx + ddz * ddz < CONFIG.jumpPadRadius ** 2 && s.vel.y <= 0.1) {
          s.vel.y = CONFIG.jumpPadLaunch;
          s.vel.x += Math.sign(jx) * Math.abs(push) * (push !== 0 ? 1 : 0);
          bus.emit(EV.JUMP_PAD, { slot: s.id, pos: { x: jx, y: 0, z: jz } });
        }
      }

      // power pad
      if (state.powerPadCd <= 0) {
        const [px, pz] = CONFIG.powerPadPos;
        const ddx = s.pos.x - px, ddz = s.pos.z - pz;
        if (s.pos.y < 1 && ddx * ddx + ddz * ddz < CONFIG.powerPadRadius ** 2) {
          s.padBoostT = CONFIG.powerPadDuration;
          state.powerPadCd = CONFIG.powerPadRespawn;
          state.powerPadOwner = s.id;
          bus.emit(EV.PAD_TAKEN, { slot: s.id, name: s.name });
        }
      }

      // shield regen: starts after delay out of combat (no hits taken, no shots fired)
      if (s.shield < CONFIG.shieldMax && state.time - s.lastCombatT >= CONFIG.shieldRegenDelay) {
        s.shield = Math.min(CONFIG.shieldMax, s.shield + (CONFIG.shieldMax / CONFIG.shieldRegenTime) * dt);
      }

      // fire
      if (s.cmd.fire && s.fireCd <= 0) fire(s);
    }

    if (state.powerPadCd > 0) state.powerPadCd -= dt;

    // leader ping (comeback mechanic)
    state.leaderPingT -= dt;
    if (state.leaderPingT <= 0) {
      state.leaderPingT = CONFIG.leaderPingInterval;
      let lead = slots[0];
      for (const s of slots) if (s.score > lead.score) lead = s;
      if (lead.score > 0) bus.emit(EV.LEADER_PING, { slot: lead.id, name: lead.name, pos: { ...lead.pos } });
    }

    if (state.time >= state.timeLimit) endMatch('time');
  }

  return { state, step, eyeOf, world, dt };
}
