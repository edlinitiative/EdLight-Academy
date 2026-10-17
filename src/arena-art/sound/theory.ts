/**
 * Arène sound — pure music theory helpers (no Web Audio here, fully testable).
 *
 * The "EdLight Arène" sonic logo
 * ------------------------------
 * Five notes in C major, scale degrees 5 – 1 – 3 – 2 – 5:
 *
 *     G4   C5   E5   D5   G5
 *     3    3    2    2    6      (lengths in sixteenth notes; 16 steps = one bar)
 *
 * The first three onsets fall on the 3+3+2 ("tresillo") grid that sits under
 * so much Caribbean dance music, including kompa; the step back down to D and
 * the leap up to the high G gives it a "question answered" shape that can be
 * heard in half a second. Every cue that celebrates something quotes it:
 * `correct` uses its last cell (E–D–G), `promotion` plays it whole at double
 * speed, `victory` plays it at kompa tempo over a groove, and `championship`
 * plays it as a brass-like fanfare framed by rara hoots.
 */

export const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** MIDI note number → frequency (A4 = 69 = 440 Hz, equal temperament). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** "C4", "F#3", "Bb5" → MIDI number. Throws on anything else. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`Invalid note name: ${name}`);
  const idx = NOTE_INDEX[m[1] + (m[2] || '')];
  return (parseInt(m[3], 10) + 1) * 12 + idx;
}

export function noteToFreq(name: string): number {
  return midiToFreq(noteToMidi(name));
}

/** Duration of one sixteenth note at a given BPM (quarter-note beats). */
export function sixteenth(bpm: number): number {
  return 60 / bpm / 4;
}

export interface MotifNote {
  /** Note name, e.g. "G4". */
  note: string;
  /** Onset, in sixteenth-note steps from the start of the motif. */
  step: number;
  /** Length in sixteenth-note steps. */
  len: number;
}

/** The sonic logo. Do not change without changing every cue that quotes it. */
export const MOTIF: readonly MotifNote[] = Object.freeze([
  { note: 'G4', step: 0, len: 3 },
  { note: 'C5', step: 3, len: 3 },
  { note: 'E5', step: 6, len: 2 },
  { note: 'D5', step: 8, len: 2 },
  { note: 'G5', step: 10, len: 6 },
]);

/** Kompa tempo used by the groove fragments (kompa sits roughly 118–124). */
export const KOMPA_BPM = 122;

/**
 * A kata-like stick pattern over one bar of sixteenths (1 = hit, 2 = accent).
 * Written for this project, inspired by — not transcribed from — the steady
 * syncopated stick/cowbell figure that drives kompa.
 */
export const KATA_PATTERN: readonly number[] = Object.freeze([
  2, 0, 1, 1, 0, 1, 1, 0, 2, 0, 1, 1, 0, 1, 1, 0,
]);

/** Kick / bass push: downbeat, the "and" of 2, beat 3, the "a" of 4. */
export const BASS_PATTERN: readonly number[] = Object.freeze([
  1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1,
]);

/** Bright guitar arpeggio, one bar: [step, chord-tone index] (0 = root). */
export const GUITAR_ARP: readonly (readonly [number, number])[] = Object.freeze([
  [0, 2], [2, 1], [3, 3], [5, 2], [6, 1], [8, 2], [10, 1], [11, 3], [13, 2], [14, 0],
]);

export interface ScheduledNote {
  freq: number;
  midi: number;
  /** Absolute start time (seconds, in the caller's clock). */
  time: number;
  /** Duration in seconds. */
  dur: number;
}

/**
 * Turn a motif into absolute note events.
 * @param startTime start of step 0 (seconds)
 * @param stepDur seconds per sixteenth step
 * @param transpose semitones
 */
export function scheduleMotif(
  motif: readonly MotifNote[],
  startTime: number,
  stepDur: number,
  transpose = 0,
): ScheduledNote[] {
  return motif.map((n) => {
    const midi = noteToMidi(n.note) + transpose;
    return { midi, freq: midiToFreq(midi), time: startTime + n.step * stepDur, dur: n.len * stepDur };
  });
}

/** Total length of a motif in seconds (end of its last note). */
export function motifLength(motif: readonly MotifNote[], stepDur: number): number {
  return motif.reduce((mx, n) => Math.max(mx, (n.step + n.len) * stepDur), 0);
}

export interface PatternHit {
  time: number;
  /** 1 = normal, 2 = accent. */
  level: number;
  step: number;
}

/** Expand a step pattern into hit times, optionally over several bars. */
export function patternToHits(
  pattern: readonly number[],
  startTime: number,
  stepDur: number,
  bars = 1,
): PatternHit[] {
  const out: PatternHit[] = [];
  for (let b = 0; b < bars; b++) {
    pattern.forEach((v, i) => {
      if (v > 0) {
        const step = b * pattern.length + i;
        out.push({ time: startTime + step * stepDur, level: v, step });
      }
    });
  }
  return out;
}

/** Major triad (+ added 9th as index 3) on a root MIDI note. */
export function chordTones(rootMidi: number): number[] {
  return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 14];
}

/** Times of a 3-2-1-go countdown: one tick per `interval`, "go" last. */
export function countdownTimes(startTime: number, interval = 1, from = 3): { n: number; time: number }[] {
  const out: { n: number; time: number }[] = [];
  for (let i = 0; i <= from; i++) out.push({ n: from - i, time: startTime + i * interval });
  return out;
}

/** Major pentatonic ladder from a root, `count` notes long (for scoreUp). */
export function pentatonicLadder(rootMidi: number, count: number): number[] {
  const steps = [0, 2, 4, 7, 9];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(rootMidi + steps[i % 5] + 12 * Math.floor(i / 5));
  return out;
}
