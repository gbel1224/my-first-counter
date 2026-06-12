/* All tuning numbers live here — runtime-tweakable via dev console (window.CONFIG). */
export const CONFIG = {
  // simulation
  tickRate: 60,                 // Hz, fixed-timestep logic — logic never reads frame rate

  // arena (units)
  arenaSize: 60,
  wallHeight: 6,
  wallThickness: 1,

  // player controller (Halo feel)
  moveSpeed: 6,                 // u/s
  accelRamp: 0.12,              // s to full speed
  airControl: 0.6,
  gravity: 16,                  // u/s²  (floaty)
  jumpHeight: 1.2,              // u
  coyoteTime: 0.08,             // s
  jumpBuffer: 0.1,              // s
  eyeHeight: 1.62,
  bodyRadius: 0.4,
  bodyHeight: 1.8,
  playerHitboxScale: 0.85,      // forgiveness; bots honest 1.0
  botHitboxScale: 1.0,
  stepHeight: 0.55,             // max ledge auto-step

  // combat
  fireCooldown: 0.18,           // s
  beamRange: 90,
  shieldMax: 3,
  shieldRegenDelay: 2.0,        // s after last hit
  shieldRegenTime: 1.5,         // s from 0 → full once regen starts
  respawnDelay: 1.5,            // s tagged-out → back on a pad
  spawnProtection: 1.0,         // s untaggable after respawn

  // match
  scoreLimit: 15,
  timeLimit: 180,               // s
  matchPointAt: 12,
  leaderPingInterval: 20,       // s
  countdownSecs: 3,

  // pads
  powerPadPos: [0, 0],
  powerPadRadius: 1.4,
  powerPadDuration: 10,         // s of 2x points
  powerPadRespawn: 12,          // s before pad is live again
  powerPadMultiplier: 2,
  jumpPads: [[-18, 0, 6], [18, 0, 6]],    // x, z, horizontal push (toward balcony)
  jumpPadRadius: 1.3,
  jumpPadLaunch: 12.5,          // u/s vertical

  // balconies (high lanes reached via jump pads): x, y(top), z, w, d
  balconies: [[-25.5, 3.2, 0, 7, 12], [25.5, 3.2, 0, 7, 12]],

  // spawn pads (corners)
  spawnPads: [[-24, -24], [24, -24], [-24, 24], [24, 24]],

  // bots
  botCount: 3,
  botReaction: 0.25,            // s delay on first LOS
  botAimErrorDeg: 5.0,          // gaussian sigma at zero LOS-held time
  botAimTightenTime: 1.2,       // s of held LOS to reach full accuracy
  botAimErrorFloor: 0.5,        // fraction of sigma remaining at full accuracy
  botAimResample: 0.22,         // s between aim-wander resamples (persistent error — misses miss)
  botAimMovePenalty: 0.45,      // s — extra error ∝ target angular velocity (strafing dodges)
  botShooterMovePenaltyDeg: 9,  // deg extra sigma at full sprint — firing on the run is wild
  botFireCone: 10,              // deg — bot fires when aim is within this
  botEngageStrafeSpeed: 0.65,   // strafe throttle while trading fire (fire discipline)
  botRetreatJink: [0.35, 0.7],  // s range between lateral jink flips while fleeing
  botEngageRange: 38,
  botRetreatShield: 1,          // retreat when shield <= this
  botStrafeSwitch: [0.7, 1.8],  // s range between strafe direction flips
  botThinkRate: 10,             // Hz decision rate
  botDifficulty: 1.0,           // single global knob: multiplies aim error + reaction

  // ranked: tier → difficulty knob
  rankDifficulty: { BRONZE: 1.6, SILVER: 1.4, GOLD: 1.2, PLATINUM: 1.0, DIAMOND: 0.85, CHAMPION: 0.7 },
  quickMatchDifficulty: 1.2,    // medium
  rpWin: 20, rpPerMargin: 1, rpMarginCap: 10, rpLoss: -15, rpLossChampion: -20,
  rpPerDivision: 100,

  // rendering / performance law
  drawCallBudget: 80,
  maxPixelRatio: 1.5,
  fogNear: 18,
  fogFar: 80,
  beamPoolSize: 24,
  beamFade: 0.18,               // s beam lifetime
  beamRadius: 0.04,
  sparkPoolSize: 32,
  sparkLife: 0.3,

  // camera dive (menu → first person)
  diveDuration: 1.4,            // s

  // audio mix (linear gains; SFX ~-10dBFS, music ~-18dBFS at full sliders)
  sfxGain: 0.55,
  musicGain: 0.22,
  playerFirePitch: 1.122,       // +2 semitones
  botFirePitch: 0.891,          // -2 semitones
};

export const COL = {
  bg: 0x0a0c14, panel: 0x11141f, panel2: 0x1a1f2e,
  cyan: 0x00e5ff, cyanSoft: 0x66f0ff, magenta: 0xff2d78, green: 0xaaff00,
};

/* Beam color unlocks (challenge rewards). 'rainbow' cycles at runtime. */
export const BEAM_COLORS = {
  cyan: 0x00e5ff, gold: 0xffd866, white: 0xffffff, green: 0xaaff00,
  violet: 0xb26bff, rainbow: 0x00e5ff,
};

/* All player-visible strings live here. */
export const STRINGS = {
  countdownGo: 'GO!',
  matchPoint: 'MATCH POINT',
  respawning: n => `RESPAWNING ${n}..`,
  fireRefusedRespawn: 'CANNOT FIRE — RESPAWNING',
  powerPadTaken: who => `${who} TOOK THE POWER PAD — 2X POINTS`,
  powerPadYou: '2X POINTS — 10s',
  leaderPing: who => `LEADER PING: ${who}`,
  tagged: (a, b) => `${a} tagged ${b}`,
  youTagged: who => `YOU TAGGED ${who}`,
  taggedYou: who => `${who} TAGGED YOU`,
  victory: 'VICTORY',
  defeat: 'DEFEAT',
  draw: 'DRAW',
  rankUp: tier => `RANK UP — ${tier}`,
  rankDown: tier => `DEMOTED — ${tier}`,
  rpDelta: n => (n >= 0 ? `+${n} RP` : `${n} RP`),
  demotionShield: 'DEMOTION SHIELD USED',
  challengeDone: name => `CHALLENGE COMPLETE — ${name}`,
  unlocked: what => `UNLOCKED: ${what}`,
  clickToControl: 'CLICK TO TAKE CONTROL',
  paused: 'PAUSED — CLICK TO RESUME',
  quitHint: 'PRESS Q TO QUIT TO MENU',
  botNames: ['VEX', 'NYX', 'RHO'],
  playerName: 'YOU',
  finalScore: 'FINAL SCORE',
  timeUp: 'TIME UP',
  challenges: {
    firstBlood:  { name: 'First Blood',  desc: 'Get the first tag of a match',          unlock: 'Crosshair: Dot',      reward: ['crosshair', 'dot'] },
    hatTrick:    { name: 'Hat Trick',    desc: '3 tags within 30 seconds',              unlock: 'Beam: Gold',          reward: ['beam', 'gold'] },
    flawless:    { name: 'Flawless',     desc: 'Win without being tagged',              unlock: 'Beam: White',         reward: ['beam', 'white'] },
    padLord:     { name: 'Pad Lord',     desc: 'Take the power pad 3× in one match',    unlock: 'Crosshair: Hex',      reward: ['crosshair', 'hex'] },
    airborne:    { name: 'Airborne',     desc: "Tag a bot while you're mid-air",        unlock: 'Beam: Green',         reward: ['beam', 'green'] },
    comebackKid: { name: 'Comeback Kid', desc: 'Win after trailing by 5',               unlock: 'Crosshair: Chevron',  reward: ['crosshair', 'chevron'] },
    sharpshooter:{ name: 'Sharpshooter', desc: 'Win with 80%+ accuracy',                unlock: 'Beam: Violet',        reward: ['beam', 'violet'] },
    speedrun:    { name: 'Speedrun',     desc: '15 tags in under 2:00',                 unlock: 'Beam: Rainbow',       reward: ['beam', 'rainbow'] },
  },
  tiers: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'CHAMPION'],
  tierShort: { BRONZE: 'BRZ', SILVER: 'SLV', GOLD: 'GLD', PLATINUM: 'PLT', DIAMOND: 'DIA', CHAMPION: 'CHP' },
  divisions: ['III', 'II', 'I'],
};
