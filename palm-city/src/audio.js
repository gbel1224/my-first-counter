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
  let skidGain = null, skidSrc = null, intensityCur = 0, noiseBuf = null;

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
      noiseBuf = nb;   // reused by the synthesized one-shot SFX (gun / boom)
      skidSrc = ctx.createBufferSource(); skidSrc.buffer = nb; skidSrc.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.1;
      skidGain = ctx.createGain(); skidGain.gain.value = 0;
      skidSrc.connect(bp); bp.connect(skidGain); skidGain.connect(comp); skidSrc.start();
    } catch (e) {}
  }
  // ---- synthesized one-shot SFX (no audio files needed) ----
  function noiseSrc(dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function gun(vol = 1, rate = 1) {                    // punchy weapon crack: noise transient + low body thump
    if (!ready || muted || !ctx) return;              // (rate: <1 a heavier gun, >1 a lighter, snappier one)
    const t = ctx.currentTime;
    const s = noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 850 * rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0007, t + 0.15);
    s.connect(hp); hp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.18);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(190 * rate, t); o.frequency.exponentialRampToValueAtTime(70 * rate, t + 0.08 / rate);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.55 * vol / Math.sqrt(rate), t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.13);
  }
  function boom(vol = 1) {                             // explosion: down-swept noise rumble + sub thump
    if (!ready || muted || !ctx) return;
    const t = ctx.currentTime;
    const s = noiseSrc(); const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.0 * vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    s.connect(lp); lp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.9);
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.95 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(og); og.connect(sfxGain); o.start(t); o.stop(t + 0.55);
  }
  function blip(vol = 1) {                             // soft UI tick
    if (!ready || muted || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(440, t + 0.07);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.1);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.12);
  }
  function pop(vol = 1) {                              // a tyre bursting: a hard crack, then the air hissing out
    if (!ready || muted || !ctx) return;
    const t = ctx.currentTime;
    const s = noiseSrc(); const hp = ctx.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = 900; hp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.002, t + 0.12);
    s.connect(hp); hp.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + 0.15);
    const s2 = noiseSrc(); const hf = ctx.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 3200;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.1); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    s2.connect(hf); hf.connect(g2); g2.connect(sfxGain); s2.start(t + 0.05); s2.stop(t + 0.95);
  }
  const SYNTH = { gun, boom, blip, pop };
  function play(k, vol = 1, rate = 1) {
    if (SYNTH[k]) { SYNTH[k](vol, rate); return; }           // synthesized SFX (gun/boom/blip) need no file
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
    if (musicGain && !muted) musicGain.gain.value = MUSIC_VOL * (1 + i * 0.55) * indoorMul * duckMul;
    if (musicFilter) musicFilter.frequency.value = indoorFreq || 9000 + i * 9000;
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
  // ---- indoors: the street music comes through the walls muffled; the club has its own beat ----
  let duckMul = 1;   // the background music steps aside while the car radio plays
  let indoorMode = null, indoorMul = 1, indoorFreq = 0, nextStep = 0, step = 0, beatGain = null;
  function indoor(mode) {
    indoorMode = mode;
    indoorMul = mode === "club" ? 0.25 : mode ? 0.55 : 1; indoorFreq = mode === "club" ? 260 : mode ? 900 : 0;
    if (musicGain && !muted) musicGain.gain.value = MUSIC_VOL * indoorMul * duckMul;
    if (musicFilter) musicFilter.frequency.value = indoorFreq || 11000;
    if (ctx && !beatGain) { beatGain = ctx.createGain(); beatGain.gain.value = 0; beatGain.connect(comp); }
    if (beatGain) beatGain.gain.setTargetAtTime(mode === "club" && !muted ? 0.55 : 0, ctx.currentTime, 0.3);
    if (mode === "club" && ctx) nextStep = ctx.currentTime + 0.1;
  }
  const RIFF = [55, 0, 0, 65.4, 0, 0, 73.4, 0, 55, 0, 0, 82.4, 0, 0, 73.4, 65.4];   // A minor, a bar of 16ths
  function voice(type, f0, f1, t, len, vol, filt) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    let n = o; if (filt) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filt; o.connect(f); n = f; }
    n.connect(g); g.connect(beatGain); o.start(t); o.stop(t + len + 0.02);
  }
  function hiss(t, len, vol, freq, type = "highpass") {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    s.connect(f); f.connect(g); g.connect(beatGain); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  function beat() {
    if (indoorMode !== "club" || !ctx || !beatGain || muted || !noiseBuf) return;
    const spb = 60 / 124 / 4;
    if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05;
    while (nextStep < ctx.currentTime + 0.25) {
      const t = nextStep, s16 = step % 16;
      if (s16 % 4 === 0) voice("sine", 150, 42, t, 0.32, 0.95);                     // four on the floor
      if (s16 % 2 === 1) hiss(t, s16 % 4 === 2 ? 0.12 : 0.04, 0.12, 7500);          // hats
      if (s16 === 4 || s16 === 12) hiss(t, 0.16, 0.32, 1400, "bandpass");            // clap
      if (RIFF[s16]) voice("sawtooth", RIFF[s16], 0, t, 0.2, 0.22, 420);              // bassline
      if (step % 64 === 0 || step % 64 === 40) for (const f of [220, 261.6, 329.6]) voice("sawtooth", f, 0, t, 1.2, 0.035, 1600);   // stabs
      nextStep += spb; step++;
    }
  }
  // ---- the city's ambience, all synthesized: a bed of layers whose levels follow where you are ----
  // traffic rumble (more near busy roads and downtown), wind in the palms (stronger in a storm),
  // waves breaking on the beach (each one a swell and a wash), the murmur of a crowd, rain on the
  // pavement; birdsong in the parks and suburbs by day, crickets at night, gulls crying over the
  // beach, wings clattering when pigeons take off, a distant siren now and then downtown.
  let amb = null;
  function loopNoise(buf, filt) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = buf.duration;
    const g = ctx.createGain(); g.gain.value = 0;
    let n = s; for (const f of filt) { n.connect(f); n = f; }
    n.connect(g); g.connect(amb.out); s.start(0, Math.random() * buf.duration);
    return g;
  }
  function bq(type, f, Q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
  function ambInit() {
    if (amb || !ctx || !noiseBuf) return;
    // brown noise (integrated white): the low roar of a city
    const len = ctx.sampleRate * 6, brown = ctx.createBuffer(1, len, ctx.sampleRate), bd = brown.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    // pink-ish noise for wind, crowd and rain
    const pink = ctx.createBuffer(1, len, ctx.sampleRate), pd = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.35; }
    amb = { out: ctx.createGain(), t: 0, birdT: 2, gullT: 4, cricketT: 0, sirenT: 40, waveT: 0 };
    amb.out.gain.value = 0.9; amb.out.connect(comp);
    amb.traffic = loopNoise(brown, [bq("lowpass", 260)]);
    amb.trafficHi = loopNoise(pink, [bq("bandpass", 900, 0.5)]);               // tyres on asphalt
    const windF = bq("bandpass", 1400, 0.6); amb.windF = windF;
    amb.wind = loopNoise(pink, [windF]);
    amb.waveLo = loopNoise(brown, [bq("lowpass", 400)]);
    const waveF = bq("bandpass", 1800, 0.4); amb.waveF = waveF;
    amb.waveHi = loopNoise(pink, [waveF]);
    amb.crowd = loopNoise(pink, [bq("bandpass", 600, 1.4), bq("peaking", 1200, 1)]);
    amb.rain = loopNoise(noiseBuf, [bq("highpass", 2500), bq("lowpass", 9000)]);
    amb.rainLo = loopNoise(pink, [bq("lowpass", 900)]);
  }
  const lv = (g, v, tc = 0.6) => g.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, tc);
  function chirp(t, f0, f1, len, vol, type = "sine") {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(amb.out); o.start(t); o.stop(t + len + 0.02);
  }
  // a songbird: a phrase of quick, sliding notes
  function bird(vol) {
    const t = ctx.currentTime + 0.02, base = 2600 + Math.random() * 1800, n = 3 + ((Math.random() * 6) | 0), pat = Math.random();
    for (let k = 0; k < n; k++) {
      const tt = t + k * (0.07 + pat * 0.06), up = (k % 2 ? 1 : -1) * (pat < 0.5 ? 1 : -1);
      chirp(tt, base * (1 + up * 0.12), base * (1 - up * 0.18 + k * 0.02), 0.06 + pat * 0.04, vol);
    }
  }
  // a gull: a nasal, falling cry, two or three times
  function gull(vol) {
    const t = ctx.currentTime + 0.02, n = 2 + ((Math.random() * 3) | 0), f = 1100 + Math.random() * 300;
    for (let k = 0; k < n; k++) {
      const tt = t + k * 0.28, o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f * (k ? 0.92 : 1.05), tt); o.frequency.exponentialRampToValueAtTime(f * 0.62, tt + 0.22);
      const bp = bq("bandpass", 1600, 3), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(vol, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.24);
      o.connect(bp); bp.connect(g); g.connect(amb.out); o.start(tt); o.stop(tt + 0.26);
    }
  }
  // crickets: a train of tiny high pulses
  function crickets(vol) {
    const t = ctx.currentTime + 0.02, f = 4200 + Math.random() * 900;
    for (let k = 0; k < 6; k++) chirp(t + k * 0.045, f, f * 0.98, 0.025, vol);
  }
  // wings: a burst of soft clatters (pigeons taking off)
  function wings(vol = 1) {
    if (!ready || muted || !ctx || !amb) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 14; k++) {
      const tt = t + k * 0.045 + Math.random() * 0.02, s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = bq("bandpass", 1300 + Math.random() * 900, 1.2), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.22 * vol * (1 - k / 18), tt + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      s.connect(f); f.connect(g); g.connect(amb.out); s.start(tt, Math.random() * 0.8); s.stop(tt + 0.06);
    }
  }
  // a siren a few blocks away: a slow wail through a lowpass, fading in and out
  function siren(vol) {
    const t = ctx.currentTime + 0.05, o = ctx.createOscillator(); o.type = "triangle";
    for (let k = 0; k < 6; k++) { o.frequency.setValueAtTime(650, t + k * 1.6); o.frequency.linearRampToValueAtTime(1250, t + k * 1.6 + 0.8); o.frequency.linearRampToValueAtTime(650, t + k * 1.6 + 1.6); }
    const lp = bq("lowpass", 1400), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 3); g.gain.linearRampToValueAtTime(vol * 0.8, t + 6.5); g.gain.linearRampToValueAtTime(0.0001, t + 9.6);
    o.connect(lp); lp.connect(g); g.connect(amb.out); o.start(t); o.stop(t + 9.7);
  }
  // per frame: c = { dt, traffic 0-1, crowd 0-1, beach 0-1 (how close the surf is), green 0-1 (parks,
  // gardens), downtown 0-1, night 0-1, rain 0-1, wind 0-1, indoor }
  function ambience(c) {
    if (!ready || !ctx) return;
    ambInit(); if (!amb) return;
    const dt = c.dt || 0.016; amb.t += dt;
    const out = c.indoor ? 0.18 : 1;                                    // through the walls
    amb.out.gain.setTargetAtTime(muted ? 0 : out * 0.9, ctx.currentTime, 0.4);
    const day = 1 - c.night;
    lv(amb.traffic, (0.05 + c.traffic * 0.32 + c.downtown * 0.08) * (1 - c.night * 0.35));
    lv(amb.trafficHi, (c.traffic * 0.08) * (1 + c.rain * 2.5));          // wet tyres hiss
    // wind: gusts (slow random swell) in the palms; the band sweeps a little with each gust
    const gust = 0.5 + 0.5 * Math.sin(amb.t * 0.23) * Math.sin(amb.t * 0.071 + 1.3);
    lv(amb.wind, (0.012 + c.wind * 0.05 + c.green * 0.015 + c.beach * 0.02) * (0.5 + gust), 0.8);
    amb.windF.frequency.setTargetAtTime(900 + gust * 1400, ctx.currentTime, 1);
    // waves: a swell building over ~5 s, then the break and the wash running up the sand
    amb.waveT += dt; const P = 7.5, w = (amb.waveT % P) / P;
    const swell = w < 0.62 ? (w / 0.62) ** 2 : Math.max(0, 1 - (w - 0.62) / 0.38);
    const wash = w > 0.6 ? Math.exp(-(w - 0.6) * 6) : 0;
    lv(amb.waveLo, c.beach * (0.08 + swell * 0.22), 0.15);
    lv(amb.waveHi, c.beach * (0.015 + wash * 0.12), 0.08);
    amb.waveF.frequency.setTargetAtTime(1200 + wash * 2400, ctx.currentTime, 0.1);
    // a crowd: the murmur swells and falls as conversations come and go
    const mur = 0.6 + 0.4 * Math.sin(amb.t * 0.9) * Math.sin(amb.t * 0.37 + 2);
    lv(amb.crowd, c.crowd * 0.13 * mur * (1 - c.night * 0.5), 0.3);
    lv(amb.rain, c.rain * 0.16, 1.2); lv(amb.rainLo, c.rain * 0.09, 1.2);
    if (muted || c.indoor) return;
    // birds by day in the green; crickets at night
    amb.birdT -= dt;
    if (amb.birdT < 0) { amb.birdT = 1.2 + Math.random() * (5 - c.green * 3.5); if (day > 0.4 && c.rain < 0.3 && Math.random() < 0.25 + c.green * 0.75) bird(0.012 + c.green * 0.03 * Math.random()); }
    amb.cricketT -= dt;
    if (amb.cricketT < 0) { amb.cricketT = 0.25 + Math.random() * 0.6; if (c.night > 0.6 && c.rain < 0.2 && Math.random() < 0.2 + c.green * 0.8) crickets(0.004 + c.green * 0.01 * Math.random()); }
    amb.gullT -= dt;
    if (amb.gullT < 0) { amb.gullT = 2 + Math.random() * 6; if (day > 0.3 && c.beach > 0.15) gull(0.02 + c.beach * 0.04 * Math.random()); }
    amb.sirenT -= dt;
    if (amb.sirenT < 0) { amb.sirenT = 60 + Math.random() * 120; if (c.downtown > 0.3 || c.traffic > 0.5) siren(0.025); }
  }
  function duck(v) { duckMul += (v - duckMul) * 0.08; }
  return { init, play, gun, boom, horn, engine, intensity, skid, setMuted, indoor, beat, ambience, wings, duck,
    get ctx() { return ready ? ctx : null; }, get out() { return comp; }, get noise() { return noiseBuf; }, get muted() { return muted; } };
})();
