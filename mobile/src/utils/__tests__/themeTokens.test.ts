/**
 * The learning palette is legible by construction, in both themes, and every
 * dark tint is OPAQUE (a translucent fill under a hairline is the rejected look).
 */
import { contrastRatio } from '../contrast';
import { lightColors, darkColors, typeScale, radius, cardSurfaceFor, type Palette } from '../../theme/theme';

const HEX = /^#[0-9a-f]{6}$/i;

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as [string, Palette][])('%s palette', (_name, c) => {
  const grounds = { bg: c.bg, surface: c.surface, surfaceAlt: c.surfaceAlt };

  it.each(['ink', 'muted', 'faint', 'azureInk'] as const)('%s text clears 4.5:1 on bg / surface / surfaceAlt', (k) => {
    for (const g of Object.values(grounds)) expect(contrastRatio(c[k], g)).toBeGreaterThanOrEqual(4.5);
  });

  it('white labels clear AA on the filled button grounds', () => {
    expect(contrastRatio('#ffffff', c.azureFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', c.successFill)).toBeGreaterThanOrEqual(4.5);
  });

  it('the secondary button label clears AA on its tonal fill', () => {
    const fg = _name === 'dark' ? c.ink : c.azureInk;
    expect(contrastRatio(fg, c.azureSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it('every surface and tint token is an opaque hex', () => {
    for (const k of ['bg', 'surface', 'surfaceAlt', 'border', 'hairline', 'azureSoft', 'azureBorder', 'coralSoft',
      'successSoft', 'warnSoft', 'dangerSoft'] as const) {
      expect(c[k]).toMatch(HEX);
    }
  });
});

describe('dark status text reads on its own opaque tint', () => {
  it.each([
    ['azure', 'azureSoft'], ['coral', 'coralSoft'], ['success', 'successSoft'], ['warn', 'warnSoft'], ['danger', 'dangerSoft'],
  ] as const)('%s on %s', (fg, bg) => {
    expect(contrastRatio(darkColors[fg], darkColors[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('type + surfaces', () => {
  it('nothing a student reads drops below the 14pt floor', () => {
    for (const [, role] of Object.entries(typeScale)) expect(role.fontSize).toBeGreaterThanOrEqual(14);
  });

  it('no role is uppercase (sentence case everywhere)', () => {
    for (const role of Object.values(typeScale)) expect((role as any).textTransform).toBeUndefined();
  });

  it('headings use Plus Jakarta Sans, body Source Sans 3', () => {
    expect(typeScale.pageTitle.fontFamily).toBe('PlusJakartaSans-ExtraBold');
    expect(typeScale.body.fontFamily).toBe('SourceSans3-Regular');
  });

  it('web radii and ringless cards', () => {
    expect(radius).toMatchObject({ control: 12, tile: 14, card: 18, hero: 24 });
    expect(cardSurfaceFor('light').borderWidth).toBe(0);
    expect(cardSurfaceFor('dark').borderWidth).toBe(0);
  });
});
