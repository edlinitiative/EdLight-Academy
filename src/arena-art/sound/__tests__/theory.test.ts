import {
  midiToFreq, noteToMidi, noteToFreq, sixteenth, MOTIF, scheduleMotif, motifLength,
  patternToHits, KATA_PATTERN, BASS_PATTERN, chordTones, countdownTimes, pentatonicLadder,
} from '../theory';

describe('note frequencies', () => {
  it('A4 is 440 Hz and C4 is middle C', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToFreq('C4')).toBeCloseTo(261.626, 2);
  });
  it('handles sharps, flats and low octaves', () => {
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Gb3')).toBe(54);
    expect(noteToMidi('Bb5')).toBe(82);
    expect(noteToFreq('A5')).toBeCloseTo(880, 6);
  });
  it('rejects invalid names', () => {
    expect(() => noteToMidi('H2')).toThrow();
    expect(() => noteToMidi('C')).toThrow();
  });
});

describe('the motif', () => {
  it('is five notes G4 C5 E5 D5 G5 filling exactly one bar', () => {
    expect(MOTIF.map((n) => n.note)).toEqual(['G4', 'C5', 'E5', 'D5', 'G5']);
    expect(motifLength(MOTIF, 1)).toBe(16);
  });
  it('opens on the 3+3+2 grid', () => {
    expect(MOTIF.slice(0, 3).map((n) => n.step)).toEqual([0, 3, 6]);
    expect(MOTIF[2].step + MOTIF[2].len).toBe(8);
  });
  it('schedules to absolute times and transposes', () => {
    const s = sixteenth(120);
    expect(s).toBeCloseTo(0.125, 9);
    const ev = scheduleMotif(MOTIF, 2, s, 12);
    expect(ev[0].time).toBe(2);
    expect(ev[1].time).toBeCloseTo(2 + 3 * 0.125, 9);
    expect(ev[0].freq).toBeCloseTo(noteToFreq('G5'), 6);
    expect(ev[4].dur).toBeCloseTo(6 * 0.125, 9);
  });
  it('notes never overlap', () => {
    for (let i = 1; i < MOTIF.length; i++) expect(MOTIF[i].step).toBeGreaterThanOrEqual(MOTIF[i - 1].step + MOTIF[i - 1].len);
  });
});

describe('patterns', () => {
  it('kata and bass patterns are one bar of sixteenths', () => {
    expect(KATA_PATTERN).toHaveLength(16);
    expect(BASS_PATTERN).toHaveLength(16);
  });
  it('expands hits across bars with accents', () => {
    const hits = patternToHits(KATA_PATTERN, 0, 0.1, 2);
    const perBar = KATA_PATTERN.filter((v) => v > 0).length;
    expect(hits).toHaveLength(perBar * 2);
    expect(hits[0]).toEqual({ time: 0, level: 2, step: 0 });
    expect(hits[perBar].step).toBe(16);
    expect(hits[perBar].time).toBeCloseTo(1.6, 9);
  });
  it('chord tones are a major triad plus the 9th', () => {
    expect(chordTones(60)).toEqual([60, 64, 67, 74]);
  });
  it('countdown runs 3,2,1,0 at the interval', () => {
    expect(countdownTimes(10, 0.8)).toEqual([
      { n: 3, time: 10 }, { n: 2, time: 10.8 }, { n: 1, time: 11.6 }, { n: 0, time: 12.4 },
    ].map((x) => ({ ...x, time: expect.closeTo(x.time, 9) as any })));
  });
  it('pentatonic ladder climbs through octaves', () => {
    expect(pentatonicLadder(60, 7)).toEqual([60, 62, 64, 67, 69, 72, 74]);
  });
});
