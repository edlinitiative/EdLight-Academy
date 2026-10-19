/**
 * Token contrast — every text-on-ground pairing the components actually use
 * must clear WCAG AA in BOTH themes (and the Arène night palette). If you add a token or a new pairing to a
 * shared component, add it here; if this fails, fix the token, not the test.
 */
import { lightColors, darkColors, Palette } from '../theme';
import { contrastRatio, readableOn, AA } from '../contrast';
import { arenaPalette } from '../arenaTheme';

type Key = keyof Palette;
const WHITE = '#ffffff';

// The Arène night palette is Palette-shaped and used by competition screens.
const themes: [string, Palette][] = [['light', lightColors], ['dark', darkColors], ['arena', arenaPalette]];

/** [foreground, ground] pairs that carry readable text (≥ 4.5:1). */
const TEXT_PAIRS: [Key | 'white', Key][] = [
  // Body / meta / disabled-label greys on every ground they sit on.
  ...(['ink', 'muted', 'faint'] as Key[]).flatMap((fg) =>
    (['bg', 'surface', 'surfaceAlt'] as Key[]).map((g) => [fg, g] as [Key, Key])),
  // Links, "Voir tout", numerals.
  ['azureInk', 'bg'], ['azureInk', 'surface'],
  // Bare azure is used as text on cards and the page.
  ['azure', 'bg'], ['azure', 'surface'],
  // Filled buttons (Button primary / success / danger) carry white labels.
  ['white', 'azureFill'], ['white', 'successFill'], ['white', 'dangerFill'],
  // Status words and their tinted grounds (banners, alerts, badges).
  ['dangerInk', 'bg'], ['dangerInk', 'surface'], ['dangerInk', 'dangerSoft'],
  ['successInk', 'bg'], ['successInk', 'surface'], ['successInk', 'successSoft'],
  ['warnInk', 'bg'], ['warnInk', 'surface'], ['warnInk', 'warnSoft'],
  ['coralInk', 'bg'], ['coralInk', 'surface'],
  ['ink', 'dangerSoft'], ['ink', 'successSoft'], ['ink', 'warnSoft'], ['ink', 'azureSoft'],
];

/** Non-text UI (icons that carry meaning, focus/selection, progress fills) ≥ 3:1. */
const UI_PAIRS: [Key, Key][] = [
  ['azure', 'bg'], ['azure', 'surface'],
  ['danger', 'bg'], ['danger', 'surface'],
  ['successInk', 'bg'], ['warnInk', 'bg'],
  ['azureFill', 'bg'],
];

const color = (p: Palette, k: Key | 'white') => (k === 'white' ? WHITE : (p[k] as string));

describe.each(themes)('%s palette', (_name, p) => {
  it.each(TEXT_PAIRS)('%s on %s ≥ 4.5:1', (fg, g) => {
    expect(contrastRatio(color(p, fg), color(p, g))).toBeGreaterThanOrEqual(AA.text);
  });

  it.each(UI_PAIRS)('%s on %s ≥ 3:1 (non-text)', (fg, g) => {
    expect(contrastRatio(color(p, fg), color(p, g))).toBeGreaterThanOrEqual(AA.ui);
  });

  it('Button secondary label reads on its tonal fill', () => {
    // Mirrors Button.tsx: light uses azureInk, dark uses ink on azureSoft.
    const fg = p === lightColors ? p.azureInk : p.ink;
    expect(contrastRatio(fg, p.azureSoft)).toBeGreaterThanOrEqual(AA.text);
  });

  it('every app palette token is an opaque hex (no translucent tint without a ratio)', () => {
    // The Arène palette keeps a few translucent decorative tints; its text
    // pairs above are still all opaque, or contrastRatio would throw.
    if (p === arenaPalette) return;
    for (const v of Object.values(p)) expect(v).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  });
});

describe('contrast helper', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ffffff', '#1B6FE0')).toBeCloseTo(4.78, 2);
  });

  it('readableOn picks the legible ink', () => {
    expect(readableOn('#0F1E38')).toBe('#ffffff');
    expect(readableOn('#FFF6D6')).toBe('#0F1E38');
  });

  it('the bright accents are NOT text-safe on light grounds (why *Ink exists)', () => {
    expect(contrastRatio(lightColors.success, lightColors.bg)).toBeLessThan(AA.text);
    expect(contrastRatio(lightColors.warn, lightColors.bg)).toBeLessThan(AA.text);
    expect(contrastRatio(WHITE, lightColors.danger)).toBeLessThan(AA.text);
  });
});
