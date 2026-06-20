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
  let comp = null, musicFilter = null, musicSrc = null, engineFilter = null;
  let skidGain = null, skidSrc = null, intensityCur = 0;

  async function init() {
    if (ctx) return;
    const AC = (typeof AudioContext !== "undefined" && AudioContext) ||
      (typeof webkitAudioContext !== "undefined" && webkitAudioContext);
    if (!AC) return;
    try {
      ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      comp = ctx.createDynamicsCompressor();             // master glue / no clipping
      comp.threshold.value = -8; comp.knee.value = 24; comp.ratio.value = 3;
      comp.attack.value = 0.004; comp.release.value = 0.18; comp.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = muted ? 0 : MUSIC_VOL;
      musicFilter = ctx.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 11000;
      musicFilter.connect(musicGain); musicGain.connect(comp);
      sfxGain = ctx.createGain(); sfxGain.gain.value = SFX_VOL; sfxGain.connect(comp);
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = "lowpass"; engineFilter.frequency.value = 600;
      engineFilter.connect(engineGain); engineGain.connect(comp);
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
        s.connect(musicFilter); s.start();
        musicSrc = s;
      }
      if (buffers.engine) {
        engineSrc = ctx.createBufferSource();
        engineSrc.buffer = buffers.engine; engineSrc.loop = true;
        engineSrc.connect(engineFilter); engineSrc.start();
      }
      // synthesized tyre-skid layer (white noise through a bandpass), gain driven by drift
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      skidSrc = ctx.createBufferSource(); skidSrc.buffer = nb; skidSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.1;
      skidGain = ctx.createGain(); skidGain.gain.value = 0;
      skidSrc.connect(bp); bp.connect(skidGain); skidGain.connect(comp); skidSrc.start();
    } catch (e) {}
  }
  function play(k, vol = 1, rate = 1) {
    if (!ready || muted || !buffers[k]) return;
    const s = ctx.createBufferSource();
    s.buffer = buffers[k];
    s.playbackRate.value = rate * (k === "cash" ? 0.94 + Math.random() * 0.12 : 1);  // variety on repeated pickups
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
    const sp = Math.abs(speed);
    const target = muted || sp < 0.5 ? 0 : ENGINE_VOL * (0.6 + Math.min(1, sp / 26) * 0.5);
    engineGain.gain.value += (target - engineGain.gain.value) * 0.12;
    if (engineSrc) engineSrc.playbackRate.value = 0.6 + (sp / 26) * 1.0;
    if (engineFilter) engineFilter.frequency.value = 500 + Math.min(1, sp / 26) * 3600;   // opens up with revs
  }
  // dynamic music: lifts volume, brightness and tempo with on-screen intensity (chases / races)
  function intensity(x) {
    if (!ready) return;
    intensityCur += ((x || 0) - intensityCur) * 0.04;
    const i = intensityCur;
    if (musicGain && !muted) musicGain.gain.value = MUSIC_VOL * (1 + i * 0.55);
    if (musicFilter) musicFilter.frequency.value = 9000 + i * 9000;
    if (musicSrc) musicSrc.playbackRate.value = 1 + i * 0.06;
  }
  function skid(a) {
    if (!skidGain) return;
    const target = muted ? 0 : Math.min(0.5, a || 0) * 0.32;
    skidGain.gain.value += (target - skidGain.gain.value) * 0.2;
  }
  function setMuted(m) {
    muted = m;
    if (musicGain) musicGain.gain.value = m ? 0 : MUSIC_VOL;
    if (engineGain && m) engineGain.gain.value = 0;
    if (skidGain && m) skidGain.gain.value = 0;
  }
  return { init, play, horn, engine, intensity, skid, setMuted, get muted() { return muted; } };
})();
