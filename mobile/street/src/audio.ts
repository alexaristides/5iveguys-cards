/**
 * Synthesised sound effects (no audio files): kicks, wall thuds, post
 * clangs, whistles and a crowd bed that swells for goals.
 */
import type { Sound } from "./game/match";

const MUTE_KEY = "street.muted";

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* storage unavailable */ }
  }

  /** Must be called from a user gesture (iOS). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // White noise buffer shared by everything noisy.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startCrowd();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* storage unavailable */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private startCrowd() {
    const ctx = this.ctx!, master = this.master!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(bp).connect(g).connect(master);
    src.start();
    this.crowd = g;
  }

  private burst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number, delay = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whistle(dur: number, delay = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 2900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const depth = ctx.createGain();
    depth.gain.value = 120;
    lfo.connect(depth).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4200;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.setValueAtTime(0.07, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.master!);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  private swell(peak: number, hold: number) {
    if (!this.crowd || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowd.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + 0.25);
    g.setValueAtTime(peak, t + hold);
    g.linearRampToValueAtTime(0.035, t + hold + 2.5);
  }

  play(name: Sound, v = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case "kick":
        this.tone(140, 0.09, 0.25 * v, "sine", 60);
        this.burst(0.05, 2500, 0.8, 0.12 * v);
        break;
      case "bigkick":
        this.tone(110, 0.14, 0.4 * v, "sine", 45);
        this.burst(0.08, 1800, 0.7, 0.2 * v);
        break;
      case "wall":
        this.tone(80, 0.18, 0.3 * v, "sine", 50);
        this.burst(0.25, 500, 1.2, 0.18 * v);
        break;
      case "post":
        this.tone(1250, 0.6, 0.12 * v, "triangle");
        this.tone(1870, 0.45, 0.06 * v, "sine");
        this.tone(90, 0.12, 0.25 * v, "sine");
        break;
      case "net":
        this.burst(0.3, 900, 0.5, 0.1 * v, "highpass");
        break;
      case "bounce":
        this.tone(120, 0.07, 0.12 * v, "sine", 70);
        break;
      case "tackle":
        this.burst(0.12, 300, 0.8, 0.25 * v);
        this.tone(95, 0.1, 0.2 * v, "sine", 55);
        break;
      case "trick":
        this.tone(660, 0.08, 0.05 * v, "triangle");
        this.tone(990, 0.12, 0.05 * v, "triangle", undefined, 0.07);
        break;
      case "whistle":
        this.whistle(0.32);
        break;
      case "whistleEnd":
        this.whistle(0.28);
        this.whistle(0.28, 0.4);
        this.whistle(0.7, 0.8);
        this.swell(0.16, 1);
        break;
      case "cheer":
        this.swell(0.32, 1.6);
        break;
      case "ooh":
        this.swell(0.14, 0.4);
        break;
      case "meter":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 0.07, "square", undefined, i * 0.08));
        break;
    }
  }

  click() {
    if (!this.ctx || this.muted) return;
    this.tone(880, 0.05, 0.04, "triangle");
  }
}
