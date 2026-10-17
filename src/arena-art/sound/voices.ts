/**
 * Arène sound — synthesis primitives. Every instrument here is built from
 * oscillators, a shared noise buffer, filters and envelopes. No samples.
 *
 * Each call builds a short-lived voice: its nodes are disconnected as soon
 * as its sources end, so nothing accumulates on low-end phones.
 */

export interface Bus {
  ctx: BaseAudioContext;
  /** Dry input of the cue's category. */
  out: AudioNode;
  /** Reverb send of the cue's category (null = dry only). */
  verb: AudioNode | null;
  /** One second of white noise, shared. */
  noise: AudioBuffer;
  /** Shorter, tail-less versions. */
  reduced: boolean;
  /** Incremented with every node a voice creates (debug instrumentation). */
  stats: { nodes: number; voices: number };
}

const EPS = 0.0001;

export class Voice {
  nodes: AudioNode[] = [];
  srcs: AudioScheduledSourceNode[] = [];
  constructor(readonly bus: Bus) {}

  get ctx() { return this.bus.ctx; }

  osc(type: OscillatorType, freq: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    this.nodes.push(o);
    this.srcs.push(o);
    return o;
  }

  noise(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.bus.noise;
    s.loop = true;
    this.nodes.push(s);
    this.srcs.push(s);
    return s;
  }

  gain(v = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    this.nodes.push(f);
    return f;
  }

  /** Stereo position −1…1; falls back to a pass-through gain where unsupported. */
  pan(p: number): AudioNode {
    const ctx: any = this.ctx;
    if (typeof ctx.createStereoPanner === 'function') {
      const n = ctx.createStereoPanner() as StereoPannerNode;
      n.pan.value = Math.max(-1, Math.min(1, p));
      this.nodes.push(n);
      return n;
    }
    return this.gain(1);
  }

  chain(...ns: AudioNode[]): AudioNode {
    for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
    return ns[ns.length - 1];
  }

  /** Route a node to the category (dry) and the reverb (wet amount). */
  send(node: AudioNode, wet = 0): void {
    node.connect(this.bus.out);
    if (wet > 0 && this.bus.verb && !this.bus.reduced) {
      const w = this.gain(wet);
      node.connect(w);
      w.connect(this.bus.verb);
    }
  }

  /** Start every source at `start`, stop at `stop`, then free all nodes. */
  play(start: number, stop: number, offsets?: Map<AudioScheduledSourceNode, number>): number {
    const nodes = this.nodes;
    let pending = this.srcs.length;
    const free = () => {
      pending -= 1;
      if (pending > 0) return;
      for (const n of nodes) { try { n.disconnect(); } catch { /* already */ } }
    };
    for (const s of this.srcs) {
      const off = offsets && offsets.get(s);
      if (off != null) (s as AudioBufferSourceNode).start(start, off);
      else s.start(start);
      s.stop(stop);
      s.onended = free;
    }
    this.bus.stats.nodes += nodes.length;
    this.bus.stats.voices += 1;
    return stop;
  }
}

/* ---------------- envelopes ---------------- */

/** Percussive: 0 → peak in `a`, exponential fall to silence over `d`. Returns end time. */
export function perc(p: AudioParam, t: number, peak: number, a: number, d: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(EPS, t + a + d);
  return t + a + d;
}

/** Attack / decay-to-sustain / hold until `off` / release. Returns end time. */
export function adsr(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, off: number, r: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  const relAt = Math.max(off, t + a);
  p.setTargetAtTime(0, relAt, Math.max(0.005, r / 4));
  return relAt + r;
}

/* ---------------- instruments ---------------- */

/** Soft UI tick: a pitched blip with a tiny noise transient. */
export function tick(bus: Bus, t: number, freq = 2100, gain = 0.12, dur = 0.045): number {
  const v = new Voice(bus);
  const o = v.osc('sine', freq);
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + dur);
  const g = v.gain();
  perc(g.gain, t, gain, 0.002, dur);
  v.chain(o, g);
  v.send(g, 0);
  const n = v.noise();
  const hp = v.filter('highpass', 4500, 0.8);
  const ng = v.gain();
  perc(ng.gain, t, gain * 0.35, 0.001, 0.012);
  v.chain(n, hp, ng);
  v.send(ng, 0);
  return v.play(t, t + dur + 0.02, new Map([[n, Math.random() * 0.5]]));
}

/** Wooden stick on rim — the kata voice. */
export function wood(bus: Bus, t: number, freq = 1550, gain = 0.2, pan = 0, wet = 0.05): number {
  const v = new Voice(bus);
  const o = v.osc('triangle', freq);
  o.frequency.setValueAtTime(freq * 1.06, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
  const bp = v.filter('bandpass', freq, 6);
  const g = v.gain();
  perc(g.gain, t, gain, 0.001, 0.06);
  const n = v.noise();
  const nb = v.filter('bandpass', freq * 1.9, 3);
  const ng = v.gain();
  perc(ng.gain, t, gain * 0.5, 0.0005, 0.01);
  const pn = v.pan(pan);
  v.chain(o, bp, g, pn);
  v.chain(n, nb, ng, pn);
  v.send(pn, wet);
  return v.play(t, t + 0.09, new Map([[n, Math.random() * 0.5]]));
}

/** Two-tone metallic bell (the kompa "klòch" colour). */
export function cowbell(bus: Bus, t: number, gain = 0.1, pan = 0.2, wet = 0.08): number {
  const v = new Voice(bus);
  const a = v.osc('square', 562);
  const b = v.osc('square', 838);
  const bp = v.filter('bandpass', 820, 1.6);
  const g = v.gain();
  const g2 = v.gain(0.6);
  perc(g.gain, t, gain, 0.001, 0.22);
  const pn = v.pan(pan);
  a.connect(bp); b.connect(g2); g2.connect(bp);
  v.chain(bp, g, pn);
  v.send(pn, wet);
  return v.play(t, t + 0.26);
}

/** Bright plucked-guitar voice (two detuned saws through a closing filter). */
export function pluck(bus: Bus, freq: number, t: number, dur: number, gain = 0.12, pan = 0, wet = 0.15, bright = 1): number {
  const v = new Voice(bus);
  const a = v.osc('sawtooth', freq, -7);
  const b = v.osc('sawtooth', freq, 7);
  const c = v.osc('square', freq / 2);
  const cg = v.gain(0.25);
  const lp = v.filter('lowpass', freq * 6, 2.2);
  const top = Math.min(9500, freq * 9 * bright);
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.4), t + 0.18);
  const g = v.gain();
  const decay = Math.max(0.08, dur + 0.12);
  perc(g.gain, t, gain, 0.003, decay);
  const pn = v.pan(pan);
  a.connect(lp); b.connect(lp); c.connect(cg); cg.connect(lp);
  v.chain(lp, g, pn);
  v.send(pn, wet);
  return v.play(t, t + 0.003 + decay + 0.02);
}

/** Glassy FM mallet/bell (kalimba-like sparkle). */
export function bell(bus: Bus, freq: number, t: number, gain = 0.1, decay = 0.6, wet = 0.3, pan = 0, ratio = 3): number {
  const v = new Voice(bus);
  const car = v.osc('sine', freq);
  const mod = v.osc('sine', freq * ratio);
  const idx = v.gain();
  perc(idx.gain, t, freq * 1.6, 0.001, decay * 0.35);
  mod.connect(idx);
  idx.connect(car.frequency);
  const g = v.gain();
  perc(g.gain, t, gain, 0.002, decay);
  const pn = v.pan(pan);
  v.chain(car, g, pn);
  v.send(pn, wet);
  return v.play(t, t + decay + 0.03);
}

/** Warm round bass note. */
export function bass(bus: Bus, freq: number, t: number, dur: number, gain = 0.22): number {
  const v = new Voice(bus);
  const a = v.osc('triangle', freq);
  const s = v.osc('sine', freq / 2);
  const sg = v.gain(0.5);
  const lp = v.filter('lowpass', 700, 0.9);
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(420, t + 0.12);
  const g = v.gain();
  const end = adsr(g.gain, t, gain, 0.006, 0.12, 0.65, t + dur, 0.07);
  a.connect(lp); s.connect(sg); sg.connect(lp);
  v.chain(lp, g);
  v.send(g, 0);
  return v.play(t, end + 0.02);
}

/** Soft kick (tanbou-ish low thump). */
export function kick(bus: Bus, t: number, gain = 0.3): number {
  const v = new Voice(bus);
  const o = v.osc('sine', 110);
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  const g = v.gain();
  perc(g.gain, t, gain, 0.002, 0.24);
  v.chain(o, g);
  v.send(g, 0.02);
  return v.play(t, t + 0.27);
}

/** Shaker / tcha-tcha grain. */
export function shaker(bus: Bus, t: number, gain = 0.05, pan = -0.3): number {
  const v = new Voice(bus);
  const n = v.noise();
  const hp = v.filter('highpass', 6500, 0.8);
  const g = v.gain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.06);
  const pn = v.pan(pan);
  v.chain(n, hp, g, pn);
  v.send(pn, 0.05);
  return v.play(t, t + 0.07, new Map([[n, Math.random() * 0.5]]));
}

/** Brass-like swell for fanfares (stacked saws, opening filter). */
export function brass(bus: Bus, freq: number, t: number, dur: number, gain = 0.09, pan = 0, wet = 0.25): number {
  const v = new Voice(bus);
  const lp = v.filter('lowpass', freq * 2, 1.4);
  lp.frequency.setValueAtTime(freq * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(7000, freq * 6), t + 0.05);
  lp.frequency.setTargetAtTime(Math.min(5000, freq * 3.2), t + 0.06, 0.12);
  for (const d of [-9, 0, 8]) v.osc('sawtooth', freq, d).connect(lp);
  const g = v.gain();
  const end = adsr(g.gain, t, gain, 0.025, 0.18, 0.75, t + dur, 0.16);
  const pn = v.pan(pan);
  v.chain(lp, g, pn);
  v.send(pn, wet);
  return v.play(t, end + 0.02);
}

/**
 * Rara vaksen-like hoot: a single breathy, buzzy bamboo-trumpet note that
 * scoops up into pitch, with a touch of overblown growl and late vibrato.
 */
export function hoot(bus: Bus, freq: number, t: number, dur: number, gain = 0.12, pan = 0, wet = 0.3): number {
  const v = new Voice(bus);
  const a = v.osc('sawtooth', freq);
  const b = v.osc('square', freq, 4);
  for (const o of [a, b]) {
    o.detune.setValueAtTime(-80, t);
    o.detune.linearRampToValueAtTime(0, t + 0.09);
  }
  const vib = v.osc('sine', 5.6);
  const vibG = v.gain(0);
  vibG.gain.setValueAtTime(0, t);
  vibG.gain.linearRampToValueAtTime(12, t + Math.max(0.15, dur * 0.6));
  vib.connect(vibG); vibG.connect(a.detune); vibG.connect(b.detune);
  const bm = v.gain(0.5);
  const body = v.filter('bandpass', freq * 2.2, 1.1);
  const lp = v.filter('lowpass', 2600, 0.7);
  // growl: fast tremolo on the tone
  const trem = v.gain(1);
  const lfo = v.osc('sine', 27);
  const lfoG = v.gain(0.18);
  lfo.connect(lfoG); lfoG.connect(trem.gain);
  a.connect(body); b.connect(bm); bm.connect(body);
  v.chain(body, lp, trem);
  // breath
  const n = v.noise();
  const nb = v.filter('bandpass', freq * 3, 2);
  const ng = v.gain(0.35);
  v.chain(n, nb, ng);
  const g = v.gain();
  const end = adsr(g.gain, t, gain, 0.045, 0.1, 0.8, t + dur, 0.14);
  const pn = v.pan(pan);
  trem.connect(g); ng.connect(g);
  v.chain(g, pn);
  v.send(pn, wet);
  return v.play(t, end + 0.02, new Map([[n, Math.random() * 0.5]]));
}

/** Filtered-noise swell (air / shimmer / crowd "ooh"). */
export function swell(bus: Bus, t: number, dur: number, gain: number, fromHz: number, toHz: number, q = 1.2, wet = 0.4, pan = 0): number {
  const v = new Voice(bus);
  const n = v.noise();
  const bp = v.filter('bandpass', fromHz, q);
  bp.frequency.setValueAtTime(fromHz, t);
  bp.frequency.exponentialRampToValueAtTime(toHz, t + dur);
  const g = v.gain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  const pn = v.pan(pan);
  v.chain(n, bp, g, pn);
  v.send(pn, wet);
  return v.play(t, t + dur + 0.01, new Map([[n, Math.random() * 0.5]]));
}

/* ---------------- shared buffers ---------------- */

export function makeNoise(ctx: BaseAudioContext, seconds = 1): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; // deterministic LCG
    d[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buf;
}

/** Small-room impulse response: decaying, darkening stereo noise. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 1.3, decay = 3.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 0x51ed27;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (seed / 0xffffffff) * 2 - 1;
      const k = i / len;
      const coef = 0.25 + 0.6 * k; // darker as it decays
      lp = lp + (x - lp) * (1 - coef);
      d[i] = lp * Math.pow(1 - k, decay) * (i < ctx.sampleRate * 0.008 ? i / (ctx.sampleRate * 0.008) : 1);
    }
  }
  return buf;
}
