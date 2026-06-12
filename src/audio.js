/* Audio: WebAudio playback of generated SFX + music loop, plus synthesized stings.
   Subscribes to the event bus — zero coupling to gameplay code. */
import { CONFIG } from './config.js';
import { EV } from './core/events.js';
import { loadAudioBuffers } from './assets.js';

export function createAudio() {
  let ctx = null, sfxGain = null, musicGain = null, buffers = {}, musicSrc = null;
  let sfxVol = 0.8, musicVol = 0.6;
  let loaded = false;

  async function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(ctx.destination);
    applyVolumes();
    buffers = await loadAudioBuffers(ctx, [
      'music_loop.m4a', 'sfx_fire.mp3', 'sfx_shield_hit.mp3',
      'sfx_tag_out.mp3', 'sfx_pickup.mp3', 'sfx_respawn.mp3',
    ]);
    loaded = true;
    startMusic();
  }

  function applyVolumes() {
    if (!ctx) return;
    sfxGain.gain.value = CONFIG.sfxGain * sfxVol;
    musicGain.gain.value = CONFIG.musicGain * musicVol;
  }

  function startMusic() {
    if (!loaded || musicSrc || !buffers['music_loop.m4a']) return;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = buffers['music_loop.m4a'];
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start();
  }

  function play(name, { rate = 1, vol = 1 } = {}) {
    if (!loaded || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(sfxGain);
    src.start();
  }

  /* Short synthesized stings (match point, victory, defeat, rank up). */
  function sting(notes, type = 'square', vol = .5) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    notes.forEach(([freq, start, dur]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(vol, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
      o.connect(g); g.connect(sfxGain);
      o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
    });
  }
  const stings = {
    matchPoint: () => sting([[660, 0, .12], [880, .12, .25]], 'square', .4),
    victory: () => sting([[523, 0, .15], [659, .14, .15], [784, .28, .15], [1047, .42, .5]], 'triangle', .5),
    defeat: () => sting([[392, 0, .2], [330, .2, .2], [262, .4, .5]], 'sawtooth', .35),
    rankUp: () => sting([[523, 0, .1], [784, .1, .1], [1047, .2, .4]], 'triangle', .5),
    countdown: () => sting([[440, 0, .09]], 'square', .3),
    go: () => sting([[880, 0, .2]], 'square', .4),
  };

  /* Event bus wiring — every critical signal pairs audio with a visual channel. */
  function attach(bus, playerId) {
    bus.on(EV.FIRE, e => {
      const rate = e.isBot ? CONFIG.botFirePitch : CONFIG.playerFirePitch;
      const isMe = e.shooter === playerId;
      play('sfx_fire.mp3', { rate, vol: isMe ? 1 : 0.45 });
    });
    bus.on(EV.HIT, e => play('sfx_shield_hit.mp3', { vol: e.victim === playerId || e.shooter === playerId ? .9 : .35 }));
    bus.on(EV.TAG, e => play('sfx_tag_out.mp3', { vol: e.victim === playerId || e.shooter === playerId ? 1 : .5 }));
    bus.on(EV.RESPAWN, e => { if (e.slot === playerId) play('sfx_respawn.mp3'); });
    bus.on(EV.PAD_TAKEN, () => play('sfx_pickup.mp3'));
    bus.on(EV.JUMP_PAD, e => { if (e.slot === playerId) play('sfx_respawn.mp3', { rate: 1.6, vol: .5 }); });
    bus.on(EV.MATCH_POINT, () => stings.matchPoint());
    bus.on(EV.COUNTDOWN, e => e.n > 0 ? stings.countdown() : stings.go());
  }

  return {
    ensure, play, stings, attach, startMusic,
    setSfx(v) { sfxVol = v / 10; applyVolumes(); },
    setMusic(v) { musicVol = v / 10; applyVolumes(); },
  };
}
