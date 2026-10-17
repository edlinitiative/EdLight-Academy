/**
 * The Arène's night is legible by construction: every text tone clears
 * WCAG AA (4.5:1) on every surface it sits on, and the coral primary carries
 * its marine label at AA too (white would not).
 */
import { contrastRatio } from '../contrast';
import { arenaColors as C, arenaPalette } from '../../theme/arenaTheme';

const grounds = [C.bg, C.surface, C.surfaceAlt, C.surfaceRaised, C.secondary];

describe('arena theme contrast', () => {
  it.each(['ink', 'inkSoft', 'muted', 'faint'] as const)('%s reads on every surface', (k) => {
    for (const g of grounds) expect(contrastRatio(C[k], g)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['coral', 'gold', 'signal', 'success', 'warn', 'danger'] as const)('%s status text reads on surface', (k) => {
    expect(contrastRatio(C[k], C.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('coral buttons carry a marine label at AA; white would fail', () => {
    expect(contrastRatio(C.onCoral, C.coral)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', C.coral)).toBeLessThan(4.5);
  });

  it('night grounds are opaque: no translucent fill under a hairline', () => {
    for (const k of ['bg', 'surface', 'surfaceAlt', 'surfaceRaised', 'secondary', 'goldSoft', 'signalSoft', 'successSoft', 'warnSoft', 'dangerSoft'] as const) {
      expect(C[k]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('soft status tints still carry their own colour as text', () => {
    expect(contrastRatio(C.signal, C.signalSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(C.danger, C.dangerSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(C.success, C.successSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it('filled azure grounds in the palette adapter still carry white', () => {
    expect(contrastRatio('#FFFFFF', arenaPalette.azureFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', arenaPalette.successFill)).toBeGreaterThanOrEqual(4.5);
  });
});
