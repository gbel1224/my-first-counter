// Palm City — the car radio. Five stations, all live: the music is composed and played as you
// listen (a drum kit, bass, keys, pads, leads, built from oscillators and noise, through a little
// reverb), song after song, each with its own key, tempo, chord progression and melody, verses and
// choruses; between songs the DJ talks (the browser's own speech voice) over the station jingle. One
// station is talk radio: news (about what's going on in the city — and what you're up to), traffic,
// weather, ads, callers. In the car it's clear; get out and leave it on and you hear it through the
// car's body, fading as you walk away.
import { AudioSys } from "./audio.js";

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 5, 7, 9, 11], phryg: [0, 1, 3, 5, 7, 8, 10] };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---- the stations ----
export const STATIONS = [
  { id: "off", name: "RADIO OFF" },
  { id: "hiphop", vol: 1.0, name: "PALM 305 FM", tag: "Hip-hop & trap", bpm: [84, 96], scale: ["minor", "phryg"], prog: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 0, 5, 6], [0, 6, 5, 4]],
    K: ["x.....x...x.....", "x......x..x.x...", "x.....xx..x....."], S: ["....x.......x...", "....x.......x..x"], H: ["x.x.x.x.x.x.x.x.", "xxx.x.xxx.x.x.xx"], swing: 0.12, bass: "808", keys: "rhodes", lead: "bell",
    dj: ["You're locked to Palm 3-0-5 F M. The hottest beats in Palm City.", "Palm 3-0-5. Windows down, volume up, Palm City.", "That was fire. Stay locked, more coming your way.", "Big shout out to everybody stuck on Ocean Drive right now. We got you."] },
  { id: "latin", vol: 1.5, name: "RITMO 96.9", tag: "Reggaeton & Latin", bpm: [90, 98], scale: ["minor"], prog: [[0, 5, 2, 6], [0, 3, 6, 5], [0, 5, 3, 4]],
    K: ["x...x...x...x..."], S: ["...x..x....x..x.", "...x..x...xx..x."], H: ["..x...x...x...x.", "x.xxx.xxx.xxx.xx"], swing: 0, bass: "latin", keys: "montuno", lead: "pluck",
    dj: ["Ritmo noventa y seis punto nueve, Palm City! Dale!", "Esto es Ritmo, la casa del reggaeton en Palm City.", "Ritmo 96.9. Turn it up, mi gente!", "From the beach to the barrio, this is Ritmo."] },
  { id: "synth", vol: 1.6, name: "NEON 88.8", tag: "Eighties & synthwave", bpm: [104, 118], scale: ["minor", "dorian"], prog: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4]],
    K: ["x...x...x...x..."], S: ["....x.......x..."], H: ["x.x.x.x.x.x.x.x.", "..x...x...x...x."], swing: 0, bass: "pulse", keys: "pad", lead: "saw", arp: true, gated: true,
    dj: ["Neon eighty eight point eight. Totally rad, totally Palm City.", "This is Neon, where it's always nineteen eighty six.", "Cruising the strip with Neon 88. Keep it locked.", "Shoulder pads optional. Synths mandatory. Neon 88."] },
  { id: "soul", vol: 4.2, name: "BAYSIDE SOUL 101.5", tag: "Soul, R&B & lo-fi", bpm: [72, 84], scale: ["dorian", "major"], prog: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 4, 2, 5]],
    K: ["x......x.x......", "x.......x.x....."], S: ["....x.......x..."], H: ["x.x.x.x.x.x.x.x."], swing: 0.18, bass: "soul", keys: "rhodes9", lead: "flute", vinyl: true,
    dj: ["Bayside Soul, one-oh-one five. Smooth sounds for a Palm City night.", "You're easing on down with Bayside Soul.", "Slow it down, Palm City. This is Bayside Soul.", "Bayside Soul. Love songs and sunset drives."] },
  { id: "talk", vol: 1.0, name: "TALK 1040 AM", tag: "News, traffic & talk", talk: true },
];

export function makeRadio(getState) {
  let ctx = null, out = null, filt = null, gain = null, verb = null, verbIn = null;
  let station = 0, lastMusic = 1 + ((Math.random() * 4) | 0);
  let song = null, nextStep = 0, step = 0, talkT = 0, djQueued = false;
  const voices = () => (typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []);
  function init() {
    if (out || !AudioSys.ctx) return !!out;
    ctx = AudioSys.ctx;
    gain = ctx.createGain(); gain.gain.value = 0;
    filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 16000;
    out = ctx.createGain(); out.gain.value = 1;
    out.connect(filt); filt.connect(gain); gain.connect(AudioSys.out);
    // a small room: noise decaying over 1.6 s
    verb = ctx.createConvolver(); const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.25; verbIn.connect(verb); verb.connect(out);
    return true;
  }
  // ---- instruments: each one schedules a note at time t ----
  const env = (g, t, a, peak, d, sus = 0.0001, rel = 0) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); if (rel) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + rel); };
  function osc(type, f, t, len, vol, { a = 0.005, d = len, f2 = 0, cut = 0, q = 0.7, send = 0, detune = 0, sus = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + Math.min(len, 0.4));
    const g = ctx.createGain(); env(g, t, a, vol, d, sus * vol, sus ? 0.15 : 0);
    let n = o; if (cut) { const b = ctx.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = cut; b.Q.value = q; o.connect(b); n = b; }
    n.connect(g); g.connect(out); if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verbIn); }
    o.start(t); o.stop(t + a + d + 0.3);
  }
  function noise(t, len, vol, type, f, q = 0.8, send = 0) {
    const s = ctx.createBufferSource(); s.buffer = AudioSys.noise; const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.002, vol, len); s.connect(b); b.connect(g); g.connect(out);
    if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(verbIn); }
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05);
  }
  const DR = {
    kick: (t, v, st) => st.bass === "808" ? osc("sine", 120, t, 0.6, 0.9 * v, { f2: 42 }) : osc("sine", 150, t, 0.32, 0.95 * v, { f2: 48 }),
    snare: (t, v, st) => {
      if (st.id === "latin") { noise(t, 0.08, 0.5 * v, "bandpass", 2600, 2); osc("triangle", 330, t, 0.05, 0.25 * v); return; }      // the dembow rim
      if (st.id === "hiphop" && Math.random() < 0.5) { for (const o of [0, 0.012, 0.024]) noise(t + o, 0.09, 0.4 * v, "bandpass", 1500, 1.2, 0.2); return; }   // clap
      noise(t, st.gated ? 0.35 : 0.16, 0.55 * v, "bandpass", 1800, 0.7, st.gated ? 0.6 : 0.15); osc("triangle", 190, t, 0.08, 0.35 * v);
    },
    hat: (t, v, st, open) => noise(t, open ? 0.2 : 0.035, 0.22 * v, "highpass", st.vinyl ? 6000 : 8000),
  };
  function bassNote(st, t, m, len, v = 1) {
    const f = mtof(m);
    if (st.bass === "808") osc("sine", f, t, len, 0.75 * v, { a: 0.005, d: len * 0.9, sus: 0.5 });
    else if (st.bass === "latin") osc("sawtooth", f, t, len, 0.3 * v, { cut: 380, d: len });
    else if (st.bass === "pulse") osc("sawtooth", f, t, len, 0.28 * v, { cut: 700, q: 4, d: len * 0.8 });
    else osc("triangle", f, t, len, 0.5 * v, { cut: 900, d: len });
  }
  function chord(st, t, notes, len, v = 1) {
    for (const m of notes) {
      const f = mtof(m);
      if (st.keys === "pad") { osc("sawtooth", f, t, len, 0.05 * v, { a: 0.4, d: len, cut: 1600, detune: -7, sus: 0.7, send: 0.5 }); osc("sawtooth", f, t, len, 0.05 * v, { a: 0.4, d: len, cut: 1600, detune: 7, sus: 0.7 }); }
      else if (st.keys === "montuno") osc("triangle", f, t, 0.18, 0.09 * v, { d: 0.18, send: 0.1 });
      else { osc("sine", f, t, len, 0.07 * v, { d: len, send: 0.3 }); osc("sine", f * 2, t, len * 0.4, 0.02 * v, { d: len * 0.4 }); }     // electric piano: a body and a bell
    }
  }
  function leadNote(st, t, m, len) {
    const f = mtof(m);
    if (st.lead === "saw") { osc("sawtooth", f, t, len, 0.07, { cut: 2600, d: len, send: 0.35, detune: 5 }); osc("square", f / 2, t, len, 0.03, { cut: 1800, d: len }); }
    else if (st.lead === "bell") { osc("sine", f, t, len, 0.08, { d: len * 1.5, send: 0.4 }); osc("sine", f * 3.01, t, len * 0.3, 0.025, { d: len * 0.3 }); }
    else if (st.lead === "pluck") osc("triangle", f, t, 0.25, 0.1, { d: 0.25, send: 0.2 });
    else osc("sine", f, t, len, 0.07, { a: 0.04, d: len, send: 0.45 });                                          // breathy flute
  }
  // ---- a song: key, tempo, progression, patterns, a motif, its form ----
  function newSong(st) {
    const r = rng((Math.random() * 1e9) | 0);
    const sc = SCALES[st.scale[(r() * st.scale.length) | 0]], root = 36 + ((r() * 10) | 0);
    const bpm = st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]);
    const prog = st.prog[(r() * st.prog.length) | 0];
    const deg = (d, oct = 0) => root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    // a two-bar motif in scale degrees: [step, degree, length in steps]
    const motif = []; let d = 7 + ((r() * 5) | 0);
    for (let s = 0; s < 32; s += r() < 0.5 ? 2 : r() < 0.6 ? 4 : 3) { if (r() < 0.25) continue; d += [-2, -1, -1, 0, 1, 1, 2][(r() * 7) | 0]; d = Math.max(5, Math.min(14, d)); motif.push([s, d, r() < 0.3 ? 4 : 2]); }
    const form = ["intro", "verse", "chorus", "verse", "chorus", "chorus", "outro"].map(p => [p, p === "intro" || p === "outro" ? 4 : 8]);
    const bars = form.reduce((a, [, b]) => a + b, 0);
    return { st, bpm, prog, deg, motif, form, bars, K: st.K[(r() * st.K.length) | 0], S: st.S[(r() * st.S.length) | 0], H: st.H[(r() * st.H.length) | 0], r };
  }
  function partAt(S, bar) { let b = 0; for (const [p, n] of S.form) { if (bar < b + n) return [p, bar - b]; b += n; } return [null, 0]; }
  function playStep(S, t, k) {
    const st = S.st, bar = Math.floor(k / 16), s = k % 16, [part, pb] = partAt(S, bar);
    if (!part) return false;
    const spb = 60 / S.bpm / 4, sw = (s % 2 === 1 ? st.swing * spb : 0), tt = t + sw;
    const ch = S.prog[bar % S.prog.length], full = part === "chorus", light = part === "intro" || part === "outro";
    const fadeV = part === "outro" ? Math.max(0.15, 1 - pb / 4) : part === "intro" ? 0.6 + pb * 0.1 : 1;
    // drums (no kick in the intro's first bars, a fill at the end of each section)
    const fill = pb === (part === "intro" || part === "outro" ? 3 : 7) && s >= 12;
    if (S.K[s] === "x" && !(light && pb < 2)) DR.kick(tt, fadeV, st);
    if (S.S[s] === "x" || (fill && s % 2 === 0)) DR.snare(tt, fadeV * (fill ? 0.7 : 1), st);
    if (S.H[s] === "x") DR.hat(tt, fadeV * (s % 4 === 0 ? 1 : 0.7), st, st.id === "synth" && s % 4 === 2);
    if (st.id === "hiphop" && full && s >= 12 && S.r() < 0.4) { DR.hat(tt + spb / 3, 0.5, st); DR.hat(tt + spb * 2 / 3, 0.45, st); }   // trap rolls
    // bass
    const rootM = S.deg(ch, -1);
    if (st.bass === "808" && S.K[s] === "x") bassNote(st, tt, rootM, spb * 6);
    else if (st.bass === "latin" && (s === 0 || s === 6 || s === 8 || s === 14)) bassNote(st, tt, s === 6 || s === 14 ? rootM + 12 : rootM, spb * 2);
    else if (st.bass === "pulse" && s % 2 === 0 && !light) bassNote(st, tt, s % 4 === 2 ? rootM + 12 : rootM, spb * 1.6);
    else if (st.bass === "soul" && (s === 0 || s === 6 || s === 10)) bassNote(st, tt, s === 6 ? S.deg(ch + 4, -1) : rootM, spb * 3);
    // chords
    const notes = st.keys === "rhodes9" ? [S.deg(ch), S.deg(ch + 2), S.deg(ch + 4), S.deg(ch + 6), S.deg(ch + 8)] : st.keys === "rhodes" ? [S.deg(ch), S.deg(ch + 2), S.deg(ch + 4), S.deg(ch + 6)] : [S.deg(ch), S.deg(ch + 2), S.deg(ch + 4)];
    if (st.keys === "pad" && s === 0) chord(st, tt, notes.map(m => m + 12), spb * 16, fadeV);
    else if (st.keys === "montuno" && (s === 3 || s === 6 || s === 11 || s === 14)) chord(st, tt, notes.map(m => m + 12), spb, fadeV);
    else if ((st.keys === "rhodes" || st.keys === "rhodes9") && (s === 0 || (s === 10 && !light))) chord(st, tt, notes, spb * (s === 0 ? 10 : 6), fadeV * (s === 0 ? 1 : 0.6));
    if (st.arp && !light && s % 1 === 0) leadNote(st, tt, notes[s % 3] + 24, spb * 0.9);
    // the melody in the chorus (and quietly in the second half of verses)
    if (full || (part === "verse" && pb >= 4 && st.id !== "synth")) {
      const ms = (bar % 2) * 16 + s;
      for (const [ss, dd, ln] of S.motif) if (ss === ms) leadNote(st, tt, S.deg(dd + (full && bar % 4 >= 2 ? 1 : 0), 1), spb * ln);
    }
    if (st.vinyl && s % 4 === 0) noise(t, 0.6, 0.018, "highpass", 3000);                                       // the crackle
    return true;
  }
  // ---- talking ----
  function say(text, opts = {}) {
    if (typeof speechSynthesis === "undefined" || AudioSys.muted) return 0;
    const u = new SpeechSynthesisUtterance(text);
    const v = voices(); if (v.length) u.voice = v[(opts.voice ?? 0) % v.length];
    u.rate = opts.rate || 1.05; u.pitch = opts.pitch || 1; u.volume = Math.max(0, Math.min(1, level * 0.9));
    speechSynthesis.speak(u);
    return text.length * 0.07 + 1;
  }
  function jingle(st) {
    const t = ctx.currentTime + 0.05;
    [0, 4, 7, 12].forEach((iv, k) => osc("triangle", mtof(60 + iv), t + k * 0.09, 0.5, 0.08, { send: 0.4 }));
    osc("sine", 300, t, 0.9, 0.05, { f2: 1600, send: 0.5 });
  }
  const TALK = {
    open: ["You're listening to Talk ten-forty, Palm City's news and talk.", "Talk ten-forty A M. News, traffic and the voice of Palm City."],
    news: s => [
      s.wanted >= 3 ? `Breaking news: police are in pursuit of a dangerous suspect across Palm City. Wanted level: ${s.wanted} stars. Residents are advised to stay indoors.` : s.wanted > 0 ? "Police say they are looking for a suspect in connection with a disturbance downtown." : "A quiet day in Palm City as the police department reports crime is down. For now.",
      "City council votes again on the Ocean Drive bike lane. Again.",
      "Palm Tower is the tallest building on the coast. Its owners say it is also the most humble.",
      "Pigeons in the plaza are reportedly getting bolder. Officials urge people to stop feeding them churros.",
      "The Coral Building turns ninety this year. It still has the best elevators in town.",
    ],
    traffic: s => [`Traffic: ${s.night ? "light this evening" : "heavy"} on Ocean Drive, the usual slowdown around the plaza, and somebody keeps running the red at Fifth. You know who you are.`, "Traffic's moving downtown, but watch for double-parked delivery trucks on every block. Every block."],
    weather: s => [s.rain ? "Weather: rain over Palm City right now, roads are slick, take it easy out there." : s.night ? "Weather: a warm, clear night, seventy-eight degrees, light breeze off the bay." : "Weather: sunshine, eighty-six degrees, humidity you can wear. Classic Palm City."],
    ads: ["This hour is brought to you by Joe's Pizza. Slices, pies, calzones. Joe's. Because you're hungry.", "Feeling unlucky? Pawn and Gold buys gold. And other things. Don't ask.", "Palm Fuel. Fill up before you get pulled over.", "Sunny Dogs at the plaza. The best hot dog in Palm City, or at least the closest."],
    callers: [["Caller, you're on Talk ten-forty.", "Yeah hi, first time caller. I just wanna say, the guy in the sports car downtown? Slow down, man.", 2], ["Go ahead, caller.", "Somebody stole my car, again, and the cops say it was probably the same person. Same person!", 2], ["Caller, what's on your mind?", "The seagulls at the beach took my fries. All of them. I want to talk to the mayor.", 3]],
  };
  let talkQ = [];
  function talkNext() {
    const s = getState ? getState() : {};
    if (!talkQ.length) {
      const pick = a => a[(Math.random() * a.length) | 0];
      const seg = Math.random();
      talkQ = [[pick(TALK.open), 0]];
      if (seg < 0.35) talkQ.push(["Here are the headlines.", 0], ...TALK.news(s).sort(() => Math.random() - 0.5).slice(0, 3).map(t => [t, 0]));
      else if (seg < 0.55) talkQ.push([pick(TALK.traffic(s)), 1], [pick(TALK.weather(s)), 1]);
      else if (seg < 0.8) { const c = pick(TALK.callers); talkQ.push([c[0], 0], [c[1], c[2]], ["Thanks for the call.", 0]); }
      else talkQ.push([pick(TALK.ads), 4], [pick(TALK.ads), 5]);
    }
    const [text, v] = talkQ.shift();
    return say(text, { voice: v, rate: v ? 1.1 : 1.0, pitch: v === 2 ? 1.25 : v === 3 ? 0.85 : 1 });
  }
  // ---- per frame ----
  let level = 0, where = 0, carRef = null;
  function update(dt, { inCar, car, px, pz, indoor }) {
    if (!init()) return;
    if (inCar) carRef = car;
    // how loud: in the car full; out of it, through the body, fading with distance; indoors, off
    let target = 0, cut = 16000;
    if (station && !AudioSys.muted && !indoor) {
      if (inCar) target = 1.0;
      else if (carRef && !carRef.boom) { const d = Math.hypot(carRef.x - px, carRef.z - pz); target = 0.55 * Math.max(0, 1 - d / 32); cut = 900; }
    }
    if (carRef && carRef.boom) { carRef = null; }
    level += (target - level) * Math.min(1, dt * 3);
    gain.gain.setTargetAtTime(level * (STATIONS[station].vol || 1), ctx.currentTime, 0.1);
    filt.frequency.setTargetAtTime(cut, ctx.currentTime, 0.2);
    AudioSys.duck(level > 0.05 && STATIONS[station].id !== "talk" ? 0 : 1);
    if (level < 0.01) { if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking && !inCar) speechSynthesis.cancel(); return; }
    const st = STATIONS[station];
    if (!station) return;                                       // switched off: just the fade
    if (st.talk) {
      talkT -= dt;
      if (talkT <= 0 && !(typeof speechSynthesis !== "undefined" && speechSynthesis.speaking)) talkT = talkNext() + 0.6;
      if (Math.random() < dt * 0.3) osc("sine", 220 + Math.random() * 110, ctx.currentTime + 0.05, 1.5, 0.008, { a: 0.4, send: 0.6 });   // a soft bed
      return;
    }
    if (!song) { song = newSong(st); step = Math.floor(song.r() * 6) * 16; nextStep = ctx.currentTime + 0.1; }
    const spb = 60 / song.bpm / 4;
    if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05;
    while (nextStep < ctx.currentTime + 0.25) {
      if (!playStep(song, nextStep, step)) {
        // song over: the DJ, the jingle, the next song
        if (!djQueued) { djQueued = true; jingle(st); say(st.dj[(Math.random() * st.dj.length) | 0], { voice: STATIONS.indexOf(st), rate: 1.08 }); nextStep += 4.5; }
        else { djQueued = false; song = newSong(st); step = 0; }
        continue;
      }
      nextStep += spb; step++;
    }
  }
  function tune(dir = 1) {
    station = (station + dir + STATIONS.length) % STATIONS.length;
    if (station) lastMusic = station;
    song = null; djQueued = false; talkT = 0; talkQ = [];
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    return STATIONS[station];
  }
  return {
    update, tune,
    on() { if (!station) { station = lastMusic; song = null; } return STATIONS[station]; },
    get station() { return STATIONS[station]; },
    get level() { return level; },
  };
}
