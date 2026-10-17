import { encodeWav, analyze } from '../wav';

describe('wav', () => {
  it('writes a valid 16-bit stereo header and clamps samples', () => {
    const l = new Float32Array([0, 0.5, -1, 2]);
    const r = new Float32Array([0, -0.5, 1, -2]);
    const bytes = encodeWav([l, r], 22050);
    const dv = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(dv.getUint16(22, true)).toBe(2);
    expect(dv.getUint32(24, true)).toBe(22050);
    expect(dv.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(bytes.length).toBe(44 + 16);
    expect(dv.getInt16(44 + 2 * 4, true)).toBe(-32768); // l[2] = -1
    expect(dv.getInt16(44 + 3 * 4, true)).toBe(32767); // l[3] clamped
  });
  it('measures peak and audible length', () => {
    const ch = new Float32Array(1000);
    ch[10] = 0.8; ch[499] = 0.01; // last sample above -60 dB (0.001)
    const s = analyze([ch], 1000);
    expect(s.peak).toBeCloseTo(0.8, 6);
    expect(s.audibleDuration).toBeCloseTo(0.5, 6);
    expect(s.peakDb).toBeCloseTo(20 * Math.log10(0.8), 4);
  });
});
