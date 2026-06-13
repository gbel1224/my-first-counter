// Palm City audio: one looped music track under everything, one-shot SFX, looped
// engine hum pitched by speed. Mix targets: music quiet (-16 dB-ish), SFX above it,
// nothing near clipping. Fails silent if WebAudio or files are unavailable.
export const AudioSys = (() => {
  const FILES = {
    music: "./assets/music.m4a",
    cash: "./assets/cash.mp3",
    jingle: "./assets/jingle.mp3",
    door: "./assets/door.mp3",
    horn: "./assets/horn.mp3",
    engine: "./assets/engine.mp3",
  };
  const MUSIC_VOL = 0.16, SFX_VOL = 0.6, ENGINE_VOL = 0.22;
  let ctx = null, buffers = {}, musicGain = null, sfxGain = null, engineGain = null;
  let engineSrc = null, ready = false, muted = false, lastHorn = 0;

  async function init() {
    if (ctx) return;
    const AC = (typeof AudioContext !== "undefined" && AudioContext) ||
      (typeof webkitAudioContext !== "undefined" && webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      musicGain = ctx.createGain(); musicGain.gain.value = muted ? 0 : MUSIC_VOL; musicGain.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = SFX_VOL; sfxGain.connect(ctx.destination);
      engineGain = ctx.createGain(); engineGain.gain.value = 0; engineGain.connect(ctx.destination);
      await Promise.all(Object.entries(FILES).map(async ([k, u]) => {
        try {
          const r = await fetch(u);
          if (r.ok) buffers[k] = await ctx.decodeAudioData(await r.arrayBuffer());
        } catch (e) {}
      }));
      ready = true;
      if (buffers.music) {
        const s = ctx.createBufferSource();
        s.buffer = buffers.music; s.loop = true;
        s.connect(musicGain); s.start();
      }
      if (buffers.engine) {
        engineSrc = ctx.createBufferSource();
        engineSrc.buffer = buffers.engine; engineSrc.loop = true;
        engineSrc.connect(engineGain); engineSrc.start();
      }
    } catch (e) {}
  }
  function play(k, vol = 1, rate = 1) {
    if (!ready || muted || !buffers[k]) return;
    const s = ctx.createBufferSource();
    s.buffer = buffers[k]; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(sfxGain); s.start();
  }
  function horn() {
    const t = Date.now();
    if (t - lastHorn < 700) return;
    lastHorn = t;
    play("horn", 1);
  }
  function engine(speed) {
    if (!engineGain) return;
    const target = muted || speed < 0.5 ? 0 : ENGINE_VOL;
    engineGain.gain.value += (target - engineGain.gain.value) * 0.12;
    if (engineSrc) engineSrc.playbackRate.value = 0.65 + (speed / 26) * 0.9;
  }
  function setMuted(m) {
    muted = m;
    if (musicGain) musicGain.gain.value = m ? 0 : MUSIC_VOL;
    if (engineGain && m) engineGain.gain.value = 0;
  }
  return { init, play, horn, engine, setMuted, get muted() { return muted; } };
})();
