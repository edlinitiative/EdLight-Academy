/**
 * Arène sound — the cue compositions. Each function schedules a cue starting
 * at `t` on the given bus and returns the absolute time its sound ends.
 *
 * Key: C major. The sonic logo (see theory.ts) is G4 C5 E5 D5 G5.
 */
import {
  MOTIF, KOMPA_BPM, KATA_PATTERN, BASS_PATTERN, GUITAR_ARP,
  sixteenth, scheduleMotif, patternToHits, chordTones, countdownTimes,
  pentatonicLadder, midiToFreq, noteToFreq, noteToMidi,
} from './theory';
import { Bus, tick, wood, cowbell, pluck, bell, bass, kick, shaker, brass, hoot, swell, Voice } from './voices';

const f = noteToFreq;
const max = (...xs: number[]) => Math.max(...xs);

/** 40–80 ms: a barely-there tick for any press. */
export function press(bus: Bus, t: number): number {
  return tick(bus, t, 2300, 0.07, 0.04);
}

/** ~100 ms: an answer is chosen — a soft mallet on the motif's first note. */
export function select(bus: Bus, t: number): number {
  return max(
    bell(bus, f('G5'), t, 0.075, 0.09, 0.04, 0, 4),
    wood(bus, t, 1900, 0.04, 0, 0),
  );
}

/**
 * ~150 ms: the answer was received. Deliberately un-pitched and neutral — two
 * equal wood taps — so it can never be mistaken for right or wrong.
 */
export function submitted(bus: Bus, t: number): number {
  return max(
    wood(bus, t, 1150, 0.13, -0.1, 0.02),
    wood(bus, t + 0.07, 1150, 0.1, 0.1, 0.02),
  );
}

/** ~300 ms: right answer — the motif's last cell (E–D–G), bright and quick. */
export function correct(bus: Bus, t: number): number {
  const s = 0.055;
  const cell = [['E5', 0], ['D5', 1], ['G5', 2]] as const;
  let end = t;
  for (const [n, i] of cell) {
    end = max(end, pluck(bus, f(n), t + i * s, 0.05, 0.075, (i - 1) * 0.25, 0.12, 1.1));
    end = max(end, bell(bus, f(n) * 2, t + i * s, 0.04, 0.12, 0.15, 0, 3));
  }
  end = max(end, bell(bus, f('G6'), t + 2 * s, 0.05, 0.2, 0.25, 0.15, 2));
  return end;
}

/**
 * ~250 ms: not this time. Two round, low, soft notes stepping down a single
 * tone (E→D) — an "almost", never a buzzer or a sad trombone.
 */
export function incorrect(bus: Bus, t: number): number {
  return max(
    bell(bus, f('E4'), t, 0.075, 0.14, 0.06, -0.1, 1),
    bell(bus, f('D4'), t + 0.1, 0.07, 0.16, 0.06, 0.1, 1),
  );
}

export interface CountdownOpts {
  /** Seconds between ticks (default 1). */
  interval?: number;
}

/** 3-2-1-go: rising ticks G4 A4 B4, then a bright C-major "go" stab. */
export function countdown(bus: Bus, t: number, opts: CountdownOpts = {}): number {
  const interval = opts.interval ?? 1;
  const pitches = ['G4', 'A4', 'B4'];
  let end = t;
  for (const { n, time } of countdownTimes(t, interval, 3)) {
    if (n > 0) {
      end = max(end, wood(bus, time, 1500, 0.11, 0, 0.04));
      end = max(end, bell(bus, f(pitches[3 - n]), time, 0.085, 0.28, 0.12, 0, 2));
    } else {
      for (const [i, m] of chordTones(noteToMidi('C5')).slice(0, 3).entries()) {
        end = max(end, pluck(bus, midiToFreq(m), time + i * 0.008, 0.2, 0.06, (i - 1) * 0.3, 0.2));
      }
      end = max(end, bell(bus, f('C6'), time, 0.07, 0.4, 0.3, 0, 3));
      end = max(end, cowbell(bus, time, 0.06));
      end = max(end, kick(bus, time, 0.22));
    }
  }
  return end;
}

/** ~600 ms: the round is revealed — the motif's pitches as a high shimmer over rising air. */
export function reveal(bus: Bus, t: number): number {
  const notes = scheduleMotif(MOTIF, t, 0.032, 24);
  let end = swell(bus, t, bus.reduced ? 0.4 : 0.55, 0.05, 1500, 7000, 1.4, 0.5);
  notes.forEach((n, i) => {
    end = max(end, bell(bus, n.freq, n.time, 0.045, i === notes.length - 1 ? 0.3 : 0.18, 0.4, (i % 2 ? 0.35 : -0.35), 2));
  });
  return end;
}

export interface ScoreUpOpts {
  /** Number of counting ticks (default 8, clamped 3–16). */
  steps?: number;
}

/** ~400 ms: points counting up — a quick pentatonic ladder landing on a bell. */
export function scoreUp(bus: Bus, t: number, opts: ScoreUpOpts = {}): number {
  const steps = Math.min(16, Math.max(3, Math.round(opts.steps ?? 8)));
  const span = 0.32;
  const dt = span / steps;
  const ladder = pentatonicLadder(noteToMidi('C5'), steps);
  let end = t;
  ladder.forEach((m, i) => {
    end = max(end, bell(bus, midiToFreq(m), t + i * dt, 0.03 + 0.02 * (i / steps), 0.07, 0.05, 0, 4));
  });
  end = max(end, bell(bus, midiToFreq(ladder[steps - 1] + 12), t + span, 0.05, 0.12, 0.2, 0, 2));
  return end;
}

/** ~900 ms: rank up — the whole motif, double-time, with a bass under it. */
export function promotion(bus: Bus, t: number): number {
  const s = 0.055;
  const notes = scheduleMotif(MOTIF, t, s);
  let end = t;
  notes.forEach((n, i) => {
    end = max(end, pluck(bus, n.freq, n.time, n.dur, 0.085, 0, 0.2, 1));
    end = max(end, bell(bus, n.freq * 2, n.time, 0.035, i === notes.length - 1 ? 0.45 : 0.14, 0.3, 0.2, 3));
  });
  end = max(end, bass(bus, f('G2'), t, 3 * s, 0.16));
  end = max(end, bass(bus, f('C3'), t + 3 * s, 7 * s, 0.16));
  end = max(end, bass(bus, f('G2'), t + 10 * s, 5 * s, 0.17));
  end = max(end, cowbell(bus, t, 0.04));
  end = max(end, cowbell(bus, t + 10 * s, 0.05));
  end = max(end, kick(bus, t + 10 * s, 0.2));
  return end;
}

/** One bar of a kompa-inspired groove: kata, bass, cowbell, shaker, guitar arpeggio. */
function grooveBar(bus: Bus, t: number, s: number, opts: { level?: number; chordRoots?: [string, string] } = {}): number {
  const level = opts.level ?? 1;
  const [r1, r2] = opts.chordRoots ?? ['C', 'G'];
  let end = t;
  for (const h of patternToHits(KATA_PATTERN, t, s)) {
    end = max(end, wood(bus, h.time, h.level === 2 ? 1650 : 1520, (h.level === 2 ? 0.07 : 0.045) * level, 0.35, 0.03));
  }
  for (const h of patternToHits(BASS_PATTERN, t, s)) {
    const root = h.step < 8 ? r1 : r2;
    end = max(end, bass(bus, f(`${root}2`), h.time, s * 1.6, 0.17 * level));
    if (h.step === 0 || h.step === 8) end = max(end, kick(bus, h.time, 0.2 * level));
  }
  for (let i = 0; i < 16; i += 4) end = max(end, cowbell(bus, t + i * s, (i === 0 ? 0.045 : 0.03) * level, 0.3));
  for (let i = 0; i < 16; i += 2) end = max(end, shaker(bus, t + i * s + (i % 4 ? 0.01 : 0), 0.03 * level, -0.4));
  for (const [step, idx] of GUITAR_ARP) {
    const root = step < 8 ? r1 : r2;
    const m = chordTones(noteToMidi(`${root}5`))[idx];
    end = max(end, pluck(bus, midiToFreq(m), t + step * s, s * 0.8, 0.03 * level, -0.45, 0.15, 1.2));
  }
  return end;
}

/** Final resolving chord stab on C. */
function landing(bus: Bus, t: number, gain: number, hold: number, ring = hold + 0.5): number {
  let end = t;
  for (const [i, m] of [noteToMidi('C4'), noteToMidi('E4'), noteToMidi('G4'), noteToMidi('C5')].entries()) {
    end = max(end, brass(bus, midiToFreq(m), t + i * 0.006, hold, gain, (i - 1.5) * 0.25, 0.3));
  }
  end = max(end, bell(bus, f('C6'), t, 0.06, ring, 0.4, 0, 2));
  end = max(end, kick(bus, t, 0.26));
  end = max(end, cowbell(bus, t, 0.05));
  return end;
}

/** 1.5–2.5 s: match won — the motif at kompa tempo over a groove bar, landing on C. */
export function victory(bus: Bus, t: number): number {
  if (bus.reduced) {
    const end = promotion(bus, t);
    return max(end, landing(bus, t + 0.88, 0.04, 0.25));
  }
  const s = sixteenth(KOMPA_BPM);
  let end = grooveBar(bus, t, s);
  for (const n of scheduleMotif(MOTIF, t, s)) {
    end = max(end, pluck(bus, n.freq, n.time, n.dur * 0.9, 0.08, 0, 0.2, 1));
    end = max(end, brass(bus, n.freq, n.time, n.dur * 0.85, 0.04, 0.1, 0.2));
    end = max(end, bell(bus, n.freq * 2, n.time, 0.03, 0.25, 0.3, -0.2, 3));
  }
  end = max(end, landing(bus, t + 16 * s, 0.05, 0.28, 0.42));
  return end;
}

/** The rara call: vaksen-like hoots in hocket (each "player" owns one pitch). */
function raraCall(bus: Bus, t: number, s: number, gain: number): number {
  const hocket: [number, string, number][] = [
    [0, 'C4', 2], [3, 'G3', 2], [6, 'C4', 1.5], [8, 'C4', 2], [11, 'G3', 2], [14, 'D4', 1.6],
  ];
  let end = t;
  for (const [step, n, len] of hocket) {
    end = max(end, hoot(bus, f(n), t + step * s, len * s, gain, n === 'G3' ? -0.4 : 0.4, 0.3));
  }
  return end;
}

/**
 * 4–6 s: the championship. A rara call over tanbou pulse and a rising crowd
 * swell, then the motif as a fanfare over the full groove, then a held
 * C-major landing with a sustained hoot and a cascading shimmer.
 */
export function championship(bus: Bus, t: number): number {
  if (bus.reduced) {
    let end = hoot(bus, f('C4'), t, 0.16, 0.1, 0.4);
    end = max(end, hoot(bus, f('G3'), t + 0.2, 0.14, 0.1, -0.4));
    const s = 0.075;
    const t1 = t + 0.4;
    for (const n of scheduleMotif(MOTIF, t1, s)) {
      end = max(end, brass(bus, n.freq, n.time, n.dur * 0.85, 0.06, 0));
      end = max(end, brass(bus, n.freq / 2, n.time, n.dur * 0.85, 0.045, 0));
      end = max(end, bell(bus, n.freq * 2, n.time, 0.03, 0.2, 0.3, 0, 3));
    }
    end = max(end, landing(bus, t1 + 16 * s, 0.055, 0.6));
    return max(end, hoot(bus, f('C4'), t1 + 16 * s, 0.6, 0.08, 0));
  }
  const s = sixteenth(KOMPA_BPM);
  const bar = 16 * s;
  let end = t;
  // Bar 1 — the call.
  end = max(end, raraCall(bus, t, s, 0.1));
  for (let i = 0; i < 16; i += 4) end = max(end, kick(bus, t + i * s, i === 0 ? 0.22 : 0.15));
  for (let i = 2; i < 16; i += 4) end = max(end, shaker(bus, t + i * s, 0.035, 0.3));
  end = max(end, swell(bus, t, bar, 0.05, 400, 1800, 0.8, 0.5, 0));
  // Bar 2 — the motif as fanfare over the full groove.
  const t2 = t + bar;
  end = max(end, grooveBar(bus, t2, s, { level: 0.9 }));
  for (const n of scheduleMotif(MOTIF, t2, s)) {
    end = max(end, brass(bus, n.freq, n.time, n.dur * 0.88, 0.06, 0.15, 0.3));
    end = max(end, brass(bus, n.freq / 2, n.time, n.dur * 0.88, 0.045, -0.15, 0.3));
    end = max(end, bell(bus, n.freq * 2, n.time, 0.03, 0.3, 0.35, 0, 3));
  }
  end = max(end, hoot(bus, f('C4'), t2 + 3 * s, s * 1.5, 0.06, 0.5));
  end = max(end, hoot(bus, f('G3'), t2 + 8 * s, s * 1.5, 0.06, -0.5));
  // Landing — held, with the hoots answering and a cascade on top.
  const t3 = t2 + bar;
  end = max(end, landing(bus, t3, 0.06, 1.1));
  end = max(end, hoot(bus, f('C4'), t3 + 0.02, 1.0, 0.08, 0.35));
  end = max(end, hoot(bus, f('G3'), t3 + 0.25, 0.8, 0.07, -0.35));
  const cascade = ['C7', 'G6', 'E6', 'D6', 'C6', 'G5'];
  cascade.forEach((n, i) => { end = max(end, bell(bus, f(n), t3 + 0.12 + i * 0.07, 0.03, 0.6, 0.5, i % 2 ? 0.4 : -0.4, 2)); });
  end = max(end, swell(bus, t3, 1.4, 0.03, 6000, 2500, 0.7, 0.6, 0));
  return end;
}

/* ---------------- ambient ---------------- */

export interface CrowdHandle {
  stop(at?: number): void;
}

/**
 * A very quiet procedural crowd murmur: looping noise through speech-band
 * formants, each wobbling at its own syllable-like rate. Starts at `t`,
 * fades in over 1.5 s, runs until stopped.
 */
export function crowdBed(bus: Bus, t: number, level = 0.05): CrowdHandle {
  const v = new Voice(bus);
  const out = v.gain(0);
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(level, t + 1.5);
  const bands: [number, number, number][] = [[420, 3.1, 0.9], [950, 4.7, 1.1], [1750, 5.9, 1.3], [2600, 3.7, 1.6]];
  for (const [fc, rate, q] of bands) {
    const n = v.noise();
    const bp = v.filter('bandpass', fc, q);
    const g = v.gain(0.5);
    const lfo = v.osc('sine', rate);
    const lg = v.gain(0.22);
    lfo.connect(lg); lg.connect(g.gain);
    const slow = v.osc('sine', 0.09 + fc / 40000);
    const sg = v.gain(0.15);
    slow.connect(sg); sg.connect(g.gain);
    v.chain(n, bp, g, out);
  }
  const lp = v.filter('lowpass', 3200, 0.5);
  v.chain(out, lp);
  v.send(lp, 0.25);
  const offs = new Map<AudioScheduledSourceNode, number>();
  v.srcs.forEach((s, i) => { if ((s as any).buffer) offs.set(s, (i * 0.137) % 0.9); });
  const FAR = t + 60 * 60 * 6; // stopped explicitly long before this
  v.play(t, FAR, offs);
  let stopped = false;
  return {
    stop(at?: number) {
      if (stopped) return;
      stopped = true;
      const when = Math.max(bus.ctx.currentTime, at ?? bus.ctx.currentTime);
      const p: any = out.gain;
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(when);
      else p.cancelScheduledValues(when);
      out.gain.setTargetAtTime(0, when, 0.15);
      for (const s of v.srcs) { try { s.stop(when + 0.65); } catch { /* already stopped */ } }
    },
  };
}
