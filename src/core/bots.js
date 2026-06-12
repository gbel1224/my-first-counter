/* Bot AI: PATROL → ENGAGE → RETREAT → RECHARGE state machine.
   Bots are PlayerSlots — the brain only writes the slot's command object.
   Difficulty = one global multiplier on aim error + reaction (CONFIG.botDifficulty). */
import { CONFIG } from '../config.js';
import { hasLOS } from './world.js';

const TAU = Math.PI * 2;

export function createBotBrain(rng, opts = {}) {
  const retreatEnabled = opts.retreat !== false;
  const difficulty = opts.difficulty ?? CONFIG.botDifficulty;

  const b = {
    mode: 'PATROL',
    wpIdx: -1,
    target: -1,
    losHeld: 0,          // s of continuous LOS to current target (aim tightens)
    reactT: 0,           // reaction delay countdown on first LOS
    strafeDir: 1,
    strafeT: 0,
    aimErrYaw: 0, aimErrPitch: 0, aimT: 0, // persistent aim wander — misses actually miss
    jinkDir: 1, jinkT: 0,
    losBroken: 0,
    hidePoint: null,
    threat: -1,
    thinkT: 0,
    goal: null,          // current movement goal {x, z}
    stuckT: 0,
    lastPos: { x: 0, z: 0 },
  };

  function eye(s) { return { x: s.pos.x, y: s.pos.y + CONFIG.eyeHeight, z: s.pos.z }; }

  function visibleEnemies(state, me) {
    const out = [];
    const myEye = eye(me);
    for (const s of state.slots) {
      if (s === me || !s.alive || s.spawnProt > 0) continue;
      const d = Math.hypot(s.pos.x - me.pos.x, s.pos.z - me.pos.z);
      if (d > CONFIG.botEngageRange) continue;
      if (hasLOS(state.world, myEye, eye(s))) out.push({ slot: s, dist: d });
    }
    out.sort((a, b2) => a.dist - b2.dist);
    return out;
  }

  function nearestWp(world, p) {
    let best = 0, bd = Infinity;
    world.wp.forEach(([x, z], i) => {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function pickHidePoint(world, me, threatPos) {
    // nearest point with no LOS to the threat, penalizing routes toward the threat
    let best = null, bd = Infinity;
    const tx = threatPos.x - me.pos.x, tz = threatPos.z - me.pos.z;
    const tm = Math.hypot(tx, tz) || 1;
    for (const [hx, hz] of world.hidePoints) {
      const p = { x: hx, y: CONFIG.eyeHeight, z: hz };
      if (hasLOS(world, p, { x: threatPos.x, y: threatPos.y + CONFIG.eyeHeight, z: threatPos.z })) continue;
      const dx = hx - me.pos.x, dz = hz - me.pos.z;
      const d = Math.hypot(dx, dz);
      const toward = (dx * tx + dz * tz) / (tm * (d || 1)); // -1 away … 1 toward threat
      const score = d + Math.max(0, toward) * 14;
      if (score < bd) { bd = score; best = { x: hx, z: hz }; }
    }
    return best;
  }

  /* Next hide point in the flee chain: hidden from threat, meaningfully farther away. */
  function pickFleePoint(world, me, threatPos) {
    let best = null, bd = Infinity;
    const curD = Math.hypot(threatPos.x - me.pos.x, threatPos.z - me.pos.z);
    for (const [hx, hz] of world.hidePoints) {
      const p = { x: hx, y: CONFIG.eyeHeight, z: hz };
      if (hasLOS(world, p, { x: threatPos.x, y: threatPos.y + CONFIG.eyeHeight, z: threatPos.z })) continue;
      const dMe = Math.hypot(hx - me.pos.x, hz - me.pos.z);
      const dThreat = Math.hypot(hx - threatPos.x, hz - threatPos.z);
      if (dMe < 5 || dThreat < curD + 4) continue; // must actually gain ground
      if (dMe < bd) { bd = dMe; best = { x: hx, z: hz }; }
    }
    return best;
  }

  /* Steer toward goal: writes mx/mz in the bot's local (yaw-relative) frame. */
  function steerTo(me, goal, cmd) {
    const dx = goal.x - me.pos.x, dz = goal.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) { cmd.mx = 0; cmd.mz = 0; return true; }
    const wx = dx / dist, wz = dz / dist;
    // world dir → local frame (forward = (-sin yaw, -cos yaw), mz = -1 is forward)
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    cmd.mx = wx * cy - wz * sy;
    cmd.mz = wx * sy + wz * cy;
    const m = Math.hypot(cmd.mx, cmd.mz) || 1;
    cmd.mx /= m; cmd.mz /= m;
    return false;
  }

  function think(state, me, dt) {
    const cmd = me.cmd;
    cmd.fire = false; cmd.jump = false;
    if (!me.alive) {
      // death wipes tactical state — respawn starts fresh
      b.mode = 'PATROL'; b.target = -1; b.wpIdx = -1;
      b.hidePoint = null; b.threat = -1; b.losHeld = 0; b.goal = null;
      cmd.mx = 0; cmd.mz = 0;
      return;
    }

    // shield came back mid-retreat → back in the fight
    if ((b.mode === 'RETREAT' || b.mode === 'RECHARGE') && me.shield >= CONFIG.shieldMax - 0.01) {
      b.mode = 'PATROL'; b.target = -1; b.wpIdx = -1; b.hidePoint = null;
    }

    b.thinkT -= dt;
    const doThink = b.thinkT <= 0;
    if (doThink) b.thinkT = 1 / CONFIG.botThinkRate;

    // stuck detection (re-path)
    b.stuckT += dt;
    if (b.stuckT > 1.2) {
      const moved = Math.hypot(me.pos.x - b.lastPos.x, me.pos.z - b.lastPos.z);
      if (moved < 0.5 && (cmd.mx || cmd.mz)) { b.wpIdx = -1; b.goal = null; if (state.rng() < 0.5) cmd.jump = true; }
      b.lastPos.x = me.pos.x; b.lastPos.z = me.pos.z;
      b.stuckT = 0;
    }

    const vis = doThink || b.target < 0 ? visibleEnemies(state, me) : null;

    // ---- transitions ----
    // disengage when one hit from death, or clearly losing the exchange
    // (shield state is visible glow — reading it is fair)
    if (retreatEnabled && b.mode !== 'RETREAT' && b.mode !== 'RECHARGE') {
      const threatSlot = b.target >= 0 ? state.slots[b.target] : null;
      const losing = threatSlot && threatSlot.alive && me.shield + 0.5 < threatSlot.shield
        && me.shield < CONFIG.shieldMax;
      if (me.shield <= CONFIG.botRetreatShield || losing) {
        b.threat = b.target;
        b.hidePoint = threatSlot ? pickHidePoint(state.world, me, threatSlot.pos) : null;
        b.mode = b.hidePoint ? 'RETREAT' : 'RECHARGE';
      }
    }

    if (vis) {
      const cur = vis.find(v => v.slot.id === b.target);
      if ((b.mode === 'PATROL' || b.mode === 'RECHARGE') && vis.length) {
        if (b.mode === 'PATROL' || me.shield >= CONFIG.shieldMax - 0.01) {
          if (b.target !== vis[0].slot.id) {
            b.target = vis[0].slot.id;
            b.reactT = CONFIG.botReaction * difficulty;
            b.losHeld = 0;
          }
          b.mode = 'ENGAGE';
        }
      } else if (b.mode === 'ENGAGE') {
        if (!cur) {
          if (vis.length) { b.target = vis[0].slot.id; b.reactT = CONFIG.botReaction * difficulty; b.losHeld = 0; }
          // target memory: keep hunting the last-known position through brief
          // LOS breaks — only give up after a sustained loss
          else if (b.losBroken > 1.5) { b.mode = 'PATROL'; b.target = -1; b.losHeld = 0; }
        }
      }
    }

    // ---- behaviors ----
    if (b.mode === 'PATROL') {
      if (b.wpIdx < 0) b.wpIdx = nearestWp(state.world, me.pos);
      const [wx, wz] = state.world.wp[b.wpIdx];
      if (steerTo(me, { x: wx, z: wz }, cmd)) {
        const adj = state.world.wpAdj[b.wpIdx];
        b.wpIdx = adj[Math.floor(state.rng() * adj.length)];
      }
      // face movement direction
      if (cmd.mx || cmd.mz) {
        const dx = wx - me.pos.x, dz = wz - me.pos.z;
        cmd.yaw = Math.atan2(-dx, -dz);
      }
      cmd.pitch = 0;
    }

    else if (b.mode === 'ENGAGE') {
      const t = state.slots[b.target];
      if (!t || !t.alive) { b.mode = 'PATROL'; b.target = -1; b.losHeld = 0; return; }
      const myEye = eye(me), tEye = eye(t);
      const los = hasLOS(state.world, myEye, tEye);
      if (los && b.losBroken > 0.4) b.reactT = CONFIG.botReaction * difficulty; // re-acquire = react again
      b.losBroken = los ? 0 : b.losBroken + dt;
      b.losHeld = los ? b.losHeld + dt : 0;
      if (!los && doThink) {
        // chase last known position
        b.goal = { x: t.pos.x, z: t.pos.z };
      }
      if (b.reactT > 0) b.reactT -= dt;

      // strafe dance
      b.strafeT -= dt;
      if (b.strafeT <= 0) {
        b.strafeDir = state.rng() < 0.5 ? -1 : 1;
        b.strafeT = CONFIG.botStrafeSwitch[0] + state.rng() * (CONFIG.botStrafeSwitch[1] - CONFIG.botStrafeSwitch[0]);
      }
      const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z;
      const dist = Math.hypot(dx, dz);
      if (los) {
        // fire discipline: throttled strafe while trading — sprinting spoils aim
        cmd.mx = b.strafeDir * CONFIG.botEngageStrafeSpeed;
        cmd.mz = (dist > 22 ? -1 : dist < 12 ? 1 : 0) * CONFIG.botEngageStrafeSpeed;
      } else if (b.goal) {
        steerTo(me, b.goal, cmd);
      }

      // aim: persistent gaussian wander, resampled on an interval, that tightens
      // with held LOS (readable, fair — and misses genuinely miss)
      const aimYaw = Math.atan2(-dx, -dz);
      const dy = (t.pos.y + CONFIG.eyeHeight * 0.85) - myEye.y;
      const aimPitch = Math.atan2(dy, dist);
      b.aimT -= dt;
      if (b.aimT <= 0) {
        b.aimT = CONFIG.botAimResample;
        const tighten = Math.min(b.losHeld / CONFIG.botAimTightenTime, 1);
        // lateral angular velocity of the target across our view — strafing dodges
        const fx = dx / dist, fz = dz / dist;
        const latV = Math.abs(t.vel.x * -fz + t.vel.z * fx) + Math.abs(t.vel.y) * 0.5;
        const angVel = latV / Math.max(dist, 2);
        const mySpeed = Math.hypot(me.vel.x, me.vel.z) / CONFIG.moveSpeed;
        const sigma = (CONFIG.botAimErrorDeg * Math.PI / 180) * difficulty
          * (1 - (1 - CONFIG.botAimErrorFloor) * tighten)
          + angVel * CONFIG.botAimMovePenalty * difficulty
          + mySpeed * (CONFIG.botShooterMovePenaltyDeg * Math.PI / 180) * difficulty;
        b.aimErrYaw = state.rng.gaussian() * sigma;
        b.aimErrPitch = state.rng.gaussian() * sigma * 0.6;
      }
      cmd.yaw = aimYaw + b.aimErrYaw;
      cmd.pitch = aimPitch + b.aimErrPitch;

      const aimOff = Math.abs(b.aimErrYaw) + Math.abs(b.aimErrPitch);
      if (los && b.reactT <= 0 && aimOff < CONFIG.botFireCone * Math.PI / 180) cmd.fire = true;
    }

    else if (b.mode === 'RETREAT') {
      if (!b.hidePoint) { b.mode = 'RECHARGE'; return; }
      const arrived = steerTo(me, b.hidePoint, cmd);
      // jink laterally while fleeing — a straight-line runner is a free tag
      b.jinkT -= dt;
      if (b.jinkT <= 0) {
        b.jinkDir = -b.jinkDir;
        b.jinkT = CONFIG.botRetreatJink[0] + state.rng() * (CONFIG.botRetreatJink[1] - CONFIG.botRetreatJink[0]);
        if (state.rng() < 0.3) cmd.jump = true;
      }
      cmd.mx += b.jinkDir;
      const jm = Math.hypot(cmd.mx, cmd.mz) || 1;
      cmd.mx /= jm; cmd.mz /= jm;
      const dx = b.hidePoint.x - me.pos.x, dz = b.hidePoint.z - me.pos.z;
      if (!arrived) cmd.yaw = Math.atan2(-dx, -dz);
      cmd.pitch = 0;
      if (arrived) {
        // not recharged yet — keep relocating away from the threat's last known
        // position (the chaser is heading where it last saw us)
        const threat = b.threat >= 0 ? state.slots[b.threat] : null;
        if (me.shield < CONFIG.shieldMax - 0.01 && threat && threat.alive) {
          const next = pickFleePoint(state.world, me, threat.pos);
          if (next) b.hidePoint = next;
          else b.mode = 'RECHARGE';
        } else b.mode = 'RECHARGE';
      }
      // the threat chases — re-pick if our hide point no longer hides;
      // and if regen has put us AHEAD of the pursuer, turn and fight
      if (doThink && b.threat >= 0) {
        const threat = state.slots[b.threat];
        if (threat && threat.alive) {
          if (me.shield > threat.shield + 0.5 && hasLOS(state.world, eye(me), eye(threat))) {
            b.target = b.threat;
            b.reactT = CONFIG.botReaction * difficulty;
            b.losHeld = 0;
            b.mode = 'ENGAGE';
            return;
          }
          const hp = { x: b.hidePoint.x, y: CONFIG.eyeHeight, z: b.hidePoint.z };
          if (hasLOS(state.world, hp, eye(threat))) {
            b.hidePoint = pickHidePoint(state.world, me, threat.pos) ?? b.hidePoint;
          }
        }
      }
    }

    else if (b.mode === 'RECHARGE') {
      cmd.mx = 0; cmd.mz = 0;
      // face the likely approach
      if (b.threat >= 0) {
        const threat = state.slots[b.threat];
        if (threat) {
          const dx = threat.pos.x - me.pos.x, dz = threat.pos.z - me.pos.z;
          cmd.yaw = Math.atan2(-dx, -dz);
        }
      }
      if (me.shield >= CONFIG.shieldMax - 0.01) {
        // recharged — hunt the attacker while it may still be damaged
        const threat = b.threat >= 0 ? state.slots[b.threat] : null;
        if (threat && threat.alive) {
          b.target = b.threat;
          b.goal = { x: threat.pos.x, z: threat.pos.z };
          b.reactT = CONFIG.botReaction * difficulty;
          b.losHeld = 0;
          b.mode = 'ENGAGE';
        } else { b.mode = 'PATROL'; b.target = -1; b.wpIdx = -1; }
      }
      // spotted while recharging: fight only from advantage, otherwise slip away
      if (doThink) {
        const seen = visibleEnemies(state, me);
        if (seen.length) {
          if (me.shield >= seen[0].slot.shield + 0.5 || me.shield >= 2.5) {
            b.target = seen[0].slot.id;
            b.reactT = CONFIG.botReaction * difficulty;
            b.losHeld = 0;
            b.mode = 'ENGAGE';
          } else {
            b.threat = seen[0].slot.id;
            b.hidePoint = pickHidePoint(state.world, me, seen[0].slot.pos);
            if (b.hidePoint) b.mode = 'RETREAT';
          }
        }
      }
    }
  }

  return { think, debug: b };
}
