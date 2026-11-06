// Palm City — voices. Every recorded line (the script and the cast are in tools/vo): the dispatcher over
// the police radio, stitched from phrases the way the real thing sounds ("Suspect heading" + "north" +
// "near Palm Customs."), band-limited with a little crackle and a squelch either side; officers shouting
// from where they stand (from a cruiser, through its loudspeaker); people on the street reacting; the
// story's cast over the dialogue card. A clip is a few KB: they come down in the background once you're
// playing and are decoded when first needed — only the speech itself is kept, trimmed, its long pauses
// cut to a beat (assets/vo/manifest.json says where), at the clips' own 24 kHz. Voices in the street are
// placed left or right of you and fade with distance. Nothing plays with the sound off; it all fails silent.
import { AudioSys } from "./audio.js";

const LRU = 40;                       // decoded clips kept (~5 MB)

export function makeVoices(base = "") {
  let M = null;                       // the manifest: null not asked yet, false unavailable
  const bytes = {}, fetching = {}, bufs = new Map(), decoding = {};
  const L = { x: 0, z: 0, rx: 1, rz: 0 };          // the listener: where you are and the camera's right
  const world = [];                                 // street voices playing: { who, end } (wall-clock seconds)
  const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  let radioIn = null, hissG = null, storyG = null, storyNow = null, radioEnd = 0;

  async function init() {
    if (M !== null) return;
    M = false;
    try { const r = await fetch(base + "assets/vo/manifest.json"); if (r.ok) M = await r.json(); } catch (e) {}
    if (M) setTimeout(preloadAll, 3000);
  }
  const has = id => !!(M && M.clips[id]);
  // seconds a clip plays for (its speech, pauses tightened)
  function len(id) {
    const c = M && M.clips[id]; if (!c) return 0;
    let l = c[1] - c[0]; for (let k = 3; k < c.length; k += 2) l -= c[k + 1] - c[k];
    return l;
  }
  const sub = id => (M && M.sub[id]) || "";

  // ---- loading ----
  function fetchClip(id) {
    if (bytes[id]) return Promise.resolve(bytes[id]);
    if (!fetching[id]) fetching[id] = fetch(base + "assets/vo/" + id + ".mp3").then(r => r.ok ? r.arrayBuffer() : null)
      .then(b => { if (b) bytes[id] = b; delete fetching[id]; return b; }).catch(() => { delete fetching[id]; return null; });
    return fetching[id];
  }
  // everything, a few at a time, police first (a chase can start any second), the story last
  async function preloadAll() {
    const ids = Object.keys(M.clips), rank = id => id.startsWith("ped_") ? 1 : id.startsWith("s_") ? 2 : 0;
    ids.sort((a, b) => rank(a) - rank(b));
    for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(fetchClip));
  }
  // the speech, decoded and trimmed, ready to play (null if it can't be)
  function decode(id) {
    const ctx = AudioSys.ctx; if (!ctx || !has(id)) return Promise.resolve(null);
    if (bufs.has(id)) { const b = bufs.get(id); bufs.delete(id); bufs.set(id, b); return Promise.resolve(b); }
    if (decoding[id]) return decoding[id];
    const job = decoding[id] = fetchClip(id).then(async b => {
      if (!b) return null;
      const OAC = typeof OfflineAudioContext !== "undefined" ? OfflineAudioContext : typeof webkitOfflineAudioContext !== "undefined" ? webkitOfflineAudioContext : null;
      let raw = null;
      try { raw = OAC ? await new OAC(1, 1, 24000).decodeAudioData(b.slice(0)) : null; } catch (e) {}
      if (!raw) { try { raw = await ctx.decodeAudioData(b.slice(0)); } catch (e) { return null; } }
      const c = M.clips[id], sr = raw.sampleRate, d = raw.getChannelData(0);
      // keep: start..end, minus the cut pauses; the clip's gain baked in, a few ms of fade at every join
      const parts = []; let t = c[0];
      for (let k = 3; k < c.length; k += 2) { parts.push([t, c[k]]); t = c[k + 1]; }
      parts.push([t, c[1]]);
      const n = parts.reduce((s, [a, z]) => s + Math.max(0, Math.round(z * sr) - Math.round(a * sr)), 0);
      const out = ctx.createBuffer(1, Math.max(1, n), sr), o = out.getChannelData(0), F = Math.round(sr * 0.004);
      let w = 0;
      for (const [a, z] of parts) {
        const i0 = Math.round(a * sr), i1 = Math.min(d.length, Math.round(z * sr)), m = i1 - i0;
        for (let i = 0; i < m; i++) o[w + i] = d[i0 + i] * c[2] * Math.min(1, i / F, (m - 1 - i) / F);
        w += Math.max(0, m);
      }
      bufs.set(id, out);
      if (bufs.size > LRU) bufs.delete(bufs.keys().next().value);
      return out;
    }).catch(() => null);
    job.then(() => { delete decoding[id]; });              // (a clip that failed to come down is asked for again next time)
    return job;
  }

  // ---- the police radio ----
  function radioChain(ctx) {
    if (radioIn) return;
    radioIn = ctx.createGain(); radioIn.gain.value = 1.05;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3300;
    const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 1700; pk.Q.value = 0.9; pk.gain.value = 6;
    const sh = ctx.createWaveShaper(), cv = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; cv[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sh.curve = cv;
    radioIn.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(sh); sh.connect(AudioSys.out);
    // the carrier's hiss under a transmission
    if (AudioSys.noise) {
      const s = ctx.createBufferSource(); s.buffer = AudioSys.noise; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.6;
      hissG = ctx.createGain(); hissG.gain.value = 0;
      s.connect(bp); bp.connect(hissG); hissG.connect(AudioSys.out); s.start();
    }
  }
  // a transmission: the clips back to back. Returns how long it runs (0: can't be heard — no clips,
  // sound off), straight away; the audio starts as soon as every clip is decoded (or not at all if
  // that takes too long — the subtitle carries it).
  function radio(ids) {
    const ctx = AudioSys.ctx;
    if (!ctx || AudioSys.muted || !ids.length || !ids.every(has)) return 0;
    const GAP = 0.04, dur = ids.reduce((s, id) => s + len(id) + GAP, 0.16);
    const asked = ctx.currentTime;
    Promise.all(ids.map(decode)).then(bs => {
      if (bs.some(b => !b) || AudioSys.muted || ctx.currentTime - asked > 1.5) return;
      radioChain(ctx);
      const t0 = Math.max(ctx.currentTime + 0.14, radioEnd + 0.05);
      setTimeout(() => AudioSys.squelch(0.8), Math.max(0, (t0 - 0.14 - ctx.currentTime) * 1000));
      let t = t0;
      for (const b of bs) { const s = ctx.createBufferSource(); s.buffer = b; s.connect(radioIn); s.start(t); t += b.duration + GAP; }
      if (hissG) { hissG.gain.setTargetAtTime(0.016, t0 - 0.1, 0.02); hissG.gain.setTargetAtTime(0, t + 0.02, 0.03); }
      radioEnd = t;
      setTimeout(() => AudioSys.squelch(0.45), Math.max(0, (t - ctx.currentTime) * 1000));
    });
    return dur;
  }
  const radioBusy = () => { const ctx = AudioSys.ctx; return !!ctx && ctx.currentTime < radioEnd; };

  // ---- voices out in the street ----
  function listener(x, z, rx, rz) { L.x = x; L.z = z; const l = Math.hypot(rx, rz) || 1; L.rx = rx / l; L.rz = rz / l; }
  // who: the person (or cruiser) saying it — one line at a time each, and only a few voices at once.
  // pa: through a cruiser's loudspeaker. Returns the seconds it runs (0: not played).
  function shout(id, x, z, who, opts = {}) {
    const ctx = AudioSys.ctx;
    if (!ctx || AudioSys.muted || !has(id)) return 0;
    const now = clock();
    for (let i = world.length - 1; i >= 0; i--) if (world[i].end < now) world.splice(i, 1);
    // one line at a time from each person; no voice twice at once (two officers who sound alike would be
    // an echo); not the same line again straight away; only a few voices at once
    const voice = id.split("_")[1];
    if (world.some(w => (who && w.who === who) || w.voice === voice || (w.id === id && now - w.at < 3))) return 0;
    if (world.length >= (opts.urgent ? 4 : 3)) return 0;
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz), reach = opts.pa ? 90 : 60;
    if (d > reach) return 0;
    const dur = len(id);
    world.push({ who, id, voice, at: now, end: now + dur + 0.2 });
    decode(id).then(b => {
      if (!b || AudioSys.muted) return;
      const s = ctx.createBufferSource(); s.buffer = b;
      s.playbackRate.value = opts.rate || 1;
      const g = ctx.createGain(); g.gain.value = (opts.vol || 1) * Math.min(1, 1 / (1 + Math.max(0, d - 3) / (opts.pa ? 16 : 10)));
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.max(1800, 12000 - d * 170);
      let n = s;
      if (opts.pa) {                                   // the loudspeaker: thin, honky, a touch overdriven
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 480;
        const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 2100; pk.Q.value = 1.2; pk.gain.value = 9;
        const sh = ctx.createWaveShaper(), cv = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const v = i / 127.5 - 1; cv[i] = Math.tanh(v * 3) / Math.tanh(3); }
        sh.curve = cv; n.connect(hp); hp.connect(pk); pk.connect(sh); n = sh;
      }
      n.connect(lp); lp.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * L.rx + dz * L.rz) / d)) : 0; g.connect(p); p.connect(AudioSys.out); }
      else g.connect(AudioSys.out);
      s.start();
    });
    return dur;
  }

  // ---- the story ----
  // a line of dialogue, if it was recorded; plays over whatever was being said. Returns its seconds (0: none).
  function story(who, text) {
    stopStory();
    const ctx = AudioSys.ctx, id = M && M.story[who + "|" + text];
    if (!ctx || AudioSys.muted || !id || !has(id)) return 0;
    const me = storyNow = { s: null };
    decode(id).then(b => {
      if (!b || storyNow !== me || AudioSys.muted) return;
      if (!storyG) { storyG = ctx.createGain(); storyG.gain.value = 1.15; storyG.connect(AudioSys.out); }
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(storyG); s.start(); me.s = s;
    });
    return len(id);
  }
  function stopStory() { if (storyNow && storyNow.s) { try { storyNow.s.stop(); } catch (e) {} } storyNow = null; }
  const storyVoiced = (who, text) => !!(M && M.story[who + "|" + text]);

  // ---- who sounds like whom ----
  // the people on the street: three men's voices and three women's, each person always the same one
  function pedLine(p, key) {
    if (!M) return null;
    const list = p.look && p.look.long ? M.voices.f : M.voices.m;
    const v = list[Math.floor(((p.look && p.look.hs) ?? 0.5) * 9973) % list.length], id = "ped_" + v + "_" + key;
    return has(id) ? id : null;
  }
  // officers: each keeps his voice — a line his voice never recorded, he says another that means the
  // same ("Freeze!" for "Stop right there!"); only failing that does it fall to one of the others
  const SAME = { stop: ["freeze", "hands"], freeze: ["stop", "hands"], hands: ["freeze", "ground"], ground: ["hands", "freeze"], arrest: ["ground"],
    running: ["stop", "freeze"], drop: ["armed", "hands"], armed: ["drop", "shots"], shots: ["armed", "drop"] };
  function copLine(o, key) {
    if (!M) return null;
    const V = M.voices.officer;
    if (o._vo === undefined) o._vo = (Math.random() * V.length) | 0;
    for (const k of [key, ...(SAME[key] || [])]) { const id = "o_" + V[o._vo] + "_" + k; if (has(id)) return id; }
    for (let k = 1; k < V.length; k++) { const id = "o_" + V[(o._vo + k) % V.length] + "_" + key; if (has(id)) return id; }
    return null;
  }

  return { init, has, len, sub, radio, radioBusy, listener, shout, story, stopStory, storyVoiced, pedLine, copLine,
    get ready() { return !!M; }, _test: { decode, man: () => M, world: () => world.length, bufs: () => bufs.size, bytes: () => Object.keys(bytes).length } };
}
