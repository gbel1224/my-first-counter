// All sound is synthesized with WebAudio: no audio files to download.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.music = null;
    this.combat = 0;
  }

  start() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.7 : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.bus = c.createGain();
    this.bus.gain.value = 0.28;
    this.bus.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  noise(dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.5, sweep = null, attack = 0.005, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, slide = null, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  swing(heavy = false) {
    this.noise(heavy ? 0.32 : 0.22, { freq: heavy ? 700 : 1100, sweep: heavy ? 2400 : 3600, q: 1.4, gain: heavy ? 0.45 : 0.32, attack: 0.03 });
  }

  hit(crit = false) {
    this.tone(crit ? 110 : 150, 0.18, { type: 'triangle', gain: 0.6, slide: 45 });
    this.noise(0.12, { freq: 2600, q: 0.8, gain: crit ? 0.6 : 0.4 });
    if (crit) this.tone(1320, 0.25, { type: 'square', gain: 0.06, slide: 900 });
  }

  bonesBreak() {
    for (let i = 0; i < 9; i++) this.noise(0.05, { freq: 1800 + Math.random() * 2400, q: 6, gain: 0.32, delay: i * 0.045 });
  }

  block() {
    this.tone(880, 0.4, { type: 'triangle', gain: 0.22, slide: 820 });
    this.tone(1760, 0.3, { type: 'sine', gain: 0.12 });
    this.noise(0.08, { freq: 4000, q: 2, gain: 0.3 });
  }

  parry() {
    this.block();
    this.tone(1320, 0.6, { type: 'sine', gain: 0.18, delay: 0.05 });
  }

  hurt() {
    this.tone(220, 0.25, { type: 'sawtooth', gain: 0.18, slide: 90 });
    this.noise(0.15, { freq: 500, q: 0.7, gain: 0.35, type: 'lowpass' });
  }

  dodge() {
    this.noise(0.28, { freq: 400, sweep: 1400, q: 0.9, gain: 0.25, attack: 0.04 });
  }

  coin() {
    this.tone(1568, 0.12, { type: 'square', gain: 0.05 });
    this.tone(2093, 0.2, { type: 'square', gain: 0.05, delay: 0.06 });
  }

  xp() {
    this.tone(880 + Math.random() * 200, 0.15, { type: 'sine', gain: 0.07 });
  }

  potion() {
    for (let i = 0; i < 4; i++) this.tone(523 * Math.pow(1.26, i), 0.25, { type: 'sine', gain: 0.1, delay: i * 0.07 });
  }

  levelUp() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.5, { type: 'triangle', gain: 0.16, delay: i * 0.08 }));
  }

  ember() {
    this.noise(0.9, { freq: 200, sweep: 3000, q: 0.6, gain: 0.5, type: 'lowpass', attack: 0.05 });
    this.tone(70, 0.8, { type: 'sawtooth', gain: 0.3, slide: 40 });
  }

  fireball() {
    this.noise(0.5, { freq: 900, sweep: 300, q: 0.8, gain: 0.25, attack: 0.05 });
  }

  slam() {
    this.tone(55, 0.9, { type: 'sine', gain: 0.9, slide: 30 });
    this.noise(0.6, { freq: 300, q: 0.5, gain: 0.6, type: 'lowpass' });
  }

  roar() {
    this.tone(90, 1.4, { type: 'sawtooth', gain: 0.35, slide: 60, attack: 0.15 });
    this.tone(93, 1.4, { type: 'sawtooth', gain: 0.3, slide: 55, attack: 0.15 });
    this.noise(1.4, { freq: 600, q: 0.6, gain: 0.35, type: 'lowpass', attack: 0.2 });
  }

  rise() {
    this.noise(0.9, { freq: 300, sweep: 1200, q: 3, gain: 0.25, attack: 0.3 });
  }

  talk() {
    this.tone(330 + Math.random() * 60, 0.05, { type: 'triangle', gain: 0.05 });
  }

  quest() {
    [392, 523, 659, 784].forEach((n, i) => this.tone(n, 0.7, { type: 'sine', gain: 0.13, delay: i * 0.12 }));
  }

  // A slow modal pad, plus drums that fade in when the fighting starts.
  startMusic() {
    const c = this.ctx;
    const chords = [[146.8, 220, 277.2, 329.6], [130.8, 196, 246.9, 329.6], [110, 164.8, 220, 277.2], [123.5, 185, 246.9, 293.7]];
    let step = 0;
    this.drumGain = c.createGain();
    this.drumGain.gain.value = 0;
    this.drumGain.connect(this.bus);
    const playChord = () => {
      if (!this.ctx) return;
      const t = c.currentTime;
      const chord = chords[step % chords.length];
      for (const f of chord) {
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 12;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        o.connect(lp).connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + 7.6);
      }
      // A sparse melody note now and then.
      if (step % 2 === 0) {
        const n = chord[Math.floor(Math.random() * chord.length)] * 2;
        this.toneBus(n, 2.4, 0.05, 1.2);
      }
      step++;
    };
    playChord();
    this.chordTimer = setInterval(playChord, 6000);
    this.drumTimer = setInterval(() => this.drums(), 500);
    this.beat = 0;
  }

  toneBus(freq, dur, gain, delay) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  drums() {
    if (!this.ctx) return;
    const c = this.ctx;
    this.drumGain.gain.setTargetAtTime(this.combat, c.currentTime, 0.8);
    if (this.combat < 0.02) return;
    const t = c.currentTime;
    const beat = this.beat++ % 8;
    if (beat === 0 || beat === 3 || beat === 6) {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(this.drumGain);
      o.start(t);
      o.stop(t + 0.4);
    }
    if (beat === 4) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(f).connect(g).connect(this.drumGain);
      src.start(t);
      src.stop(t + 0.2);
    }
  }
}
