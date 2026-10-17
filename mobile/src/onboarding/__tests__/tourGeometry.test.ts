import { chooseTourMode, pointerLayout, JS_TAB_BAR } from '../tourGeometry';

describe('chooseTourMode', () => {
  it('iOS never points at coordinates (system bar, can move to the top on iPad)', () => {
    expect(chooseTourMode({ platform: 'ios', width: 390, fontScale: 1 })).toBe('map');
  });
  it('Android phones point at the JS bar; tablets and very large text use the map', () => {
    expect(chooseTourMode({ platform: 'android', width: 411, fontScale: 1 })).toBe('pointer');
    expect(chooseTourMode({ platform: 'android', width: 800, fontScale: 1 })).toBe('map');
    expect(chooseTourMode({ platform: 'android', width: 411, fontScale: 1.5 })).toBe('map');
  });
});

describe('pointerLayout', () => {
  const W = 400; const H = 800;
  it('places the spotlight over the slot of the floating pill', () => {
    const slotW = (W - JS_TAB_BAR.margin * 2) / 5;
    const l = pointerLayout({ width: W, height: H, insetBottom: 30, index: 2 });
    expect(l.spot.left).toBeCloseTo(JS_TAB_BAR.margin + 2 * slotW + 2);
    expect(l.spot.top).toBe(H - 30 - JS_TAB_BAR.height + 3);
    expect(l.spot.width).toBeCloseTo(slotW - 4);
  });
  it('uses the 12pt floor when there is no home indicator', () => {
    const l = pointerLayout({ width: W, height: H, insetBottom: 0, index: 0 });
    expect(l.spot.top).toBe(H - 12 - JS_TAB_BAR.height + 3);
  });
  it('keeps the tooltip on screen and its arrow inside it, for every tab and width', () => {
    for (const width of [320, 360, 411, 600]) for (let i = 0; i < 5; i++) {
      const l = pointerLayout({ width, height: H, insetBottom: 20, index: i });
      expect(l.tip.left).toBeGreaterThanOrEqual(16);
      expect(l.tip.left + l.tip.width).toBeLessThanOrEqual(width - 16 + 0.001);
      expect(l.arrowLeft).toBeGreaterThanOrEqual(12);
      expect(l.arrowLeft).toBeLessThanOrEqual(l.tip.width - 12);
      // tooltip sits above the bar
      expect(l.tip.bottom).toBeGreaterThan(20 + JS_TAB_BAR.height);
    }
  });
  it('recomputes from the measured size (rotation / split view)', () => {
    const a = pointerLayout({ width: 400, height: 800, insetBottom: 0, index: 4 });
    const b = pointerLayout({ width: 800, height: 400, insetBottom: 0, index: 4 });
    expect(b.spot.left).toBeGreaterThan(a.spot.left);
    expect(b.spot.top).toBeLessThan(a.spot.top);
  });
  it('clamps an out-of-range index', () => {
    expect(pointerLayout({ width: W, height: H, insetBottom: 0, index: 9 }).spot)
      .toEqual(pointerLayout({ width: W, height: H, insetBottom: 0, index: 4 }).spot);
  });
});
