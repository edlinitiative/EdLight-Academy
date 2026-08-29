import {
  hexToRgb, mixHex, relativeLuminance, contrastRatio, compositeOver,
  darkenUntilReadable, lightenUntilReadable,
} from '../contrast';

describe('parsing', () => {
  it('reads long, short and hash-less hex', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('1B6FE0')).toEqual([27, 111, 224]);
  });
  it('degrades to black on junk rather than NaN', () => {
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
    expect(hexToRgb('')).toEqual([0, 0, 0]);
    expect(hexToRgb(undefined as any)).toEqual([0, 0, 0]);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference extremes', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#1B6FE0', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1B6FE0'), 10);
  });
  it('agrees with a known value (brand azure on white)', () => {
    // #1B6FE0 on white is the app's documented 4.78:1
    expect(contrastRatio('#1B6FE0', '#ffffff')).toBeCloseTo(4.78, 1);
  });
});

describe('relativeLuminance', () => {
  it('bounds at black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
  });
});

describe('mixHex', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
  it('clamps out-of-range t', () => {
    expect(mixHex('#000000', '#ffffff', -5)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 5)).toBe('#ffffff');
  });
});

describe('compositeOver', () => {
  it('is the background at alpha 0 and the foreground at alpha 1', () => {
    expect(compositeOver('#ffffff', '#123456', 0)).toBe('#123456');
    expect(compositeOver('#ffffff', '#123456', 1)).toBe('#ffffff');
  });
});

describe('darkenUntilReadable', () => {
  const DEEP = '#0A1F52';

  it('leaves an already-readable colour alone', () => {
    const dark = '#0A1F52';
    expect(darkenUntilReadable(dark, DEEP)).toBe(dark);
  });

  it('rescues bright colours that white text cannot sit on', () => {
    // The real failure: a bright subject colour gave a hero at ~2:1.
    for (const bright of ['#f59e0b', '#22c55e', '#facc15', '#38bdf8', '#ec4899']) {
      const out = darkenUntilReadable(bright, DEEP);
      expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('handles every real subject colour', () => {
    for (const c of ['#0A66C2', '#1B6FE0', '#4A93DD', '#5D5B54']) {
      expect(contrastRatio('#ffffff', darkenUntilReadable(c, DEEP))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('terminates on white, the hardest possible input', () => {
    const out = darkenUntilReadable('#ffffff', DEEP);
    expect(contrastRatio('#ffffff', out)).toBeGreaterThanOrEqual(4.5);
  });

  it('never overshoots past the anchor colour', () => {
    expect(darkenUntilReadable('#ffffff', DEEP)).not.toBe('#000000');
  });
});

describe('lightenUntilReadable', () => {
  it('lifts an accent until it clears its ground', () => {
    const bg = '#1554b0';
    const out = lightenUntilReadable('#1B6FE0', bg);
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives up at white when the target is unreachable', () => {
    // Lightening only helps on a DARK ground. Against white it makes contrast
    // worse, so the loop must terminate at white rather than spin.
    expect(lightenUntilReadable('#cccccc', '#ffffff')).toBe('#ffffff');
  });

  it('leaves an already-readable accent alone', () => {
    const out = lightenUntilReadable('#ffffff', '#000000');
    expect(out).toBe('#ffffff');
  });
});
