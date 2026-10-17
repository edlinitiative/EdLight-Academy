import React from 'react';
import { render, cleanup } from '@testing-library/react';

const renderToStaticMarkup = (el: React.ReactElement): string => {
  const { container } = render(el);
  const out = container.innerHTML;
  cleanup();
  return out;
};
import SchoolCrest, { schoolColors } from '../SchoolCrest';
import { crestSpec, monogramOf } from '../crestSpec';
import { CREST_PALETTES, contrastRatio } from '../palette';
import { SHIELD_SHAPES, CHARGE_LIST, DIVISION_LIST } from '../geometry';

const NAMES = Array.from({ length: 400 }, (_, i) => `Collège Exemple ${i} de Port-au-Prince`);

describe('crest colour system', () => {
  it.each(CREST_PALETTES.map((p) => [p.id, p]))('%s: charge reads on field and tone (≥ 3:1)', (_id, p) => {
    expect(contrastRatio(p.field, p.charge)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.tone, p.charge)).toBeGreaterThanOrEqual(3);
  });

  it('contains no coral (reserved for primary actions)', () => {
    for (const p of CREST_PALETTES) {
      expect([p.field, p.tone, p.charge].map((c) => c.toUpperCase())).not.toContain('#FF6A45');
    }
  });

  it('computes WCAG contrast correctly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('crest determinism', () => {
  it('gives every spelling of one school the same crest and colours', () => {
    const variants = [
      'Lycée Toussaint Louverture', 'LYCEE TOUSSAINT LOUVERTURE', 'lycée toussaint-louverture', '  Lycee  Toussaint Louverture ',
    ];
    const specs = variants.map((v) => crestSpec(v));
    for (const s of specs) expect(s).toEqual(specs[0]);
    expect(schoolColors(variants[1])).toEqual(schoolColors(variants[0]));
    expect(crestSpec('Institution du Sacré-Cœur')).toEqual(crestSpec('Institution du Sacre Coeur'));
  });

  it('is stable across calls and renders', () => {
    const a = renderToStaticMarkup(<SchoolCrest name="Collège Canado Haïtien" size={72} />);
    const b = renderToStaticMarkup(<SchoolCrest name="Collège Canado Haïtien" size={72} />);
    const strip = (h: string) => h.replace(/crest[a-zA-Z]?\d+/g, 'ID');
    expect(strip(a)).toEqual(strip(b));
    expect(crestSpec('Collège Canado Haïtien')).toEqual(crestSpec('Collège Canado Haïtien'));
  });

  it('reaches every shape, division, charge and palette over many schools', () => {
    const specs = NAMES.map(crestSpec);
    expect(new Set(specs.map((s) => s.shape))).toEqual(new Set(SHIELD_SHAPES));
    expect(new Set(specs.map((s) => s.charge))).toEqual(new Set(CHARGE_LIST));
    expect(new Set(specs.map((s) => s.division))).toEqual(new Set(DIVISION_LIST));
    expect(new Set(specs.map((s) => s.palette.id)).size).toBe(CREST_PALETTES.length);
  });

  it('never puts a palm on a field divided per fess (too close to the national arms)', () => {
    for (const s of NAMES.map(crestSpec)) {
      if (s.charge === 'palmier') expect(s.division).not.toBe('fess');
    }
  });

  it('schoolColors returns the crest field and charge', () => {
    const s = crestSpec('Collège Jean Wesley');
    expect(schoolColors('Collège Jean Wesley')).toEqual({ primary: s.palette.field, secondary: s.palette.charge });
  });
});

describe('monograms', () => {
  it('uses the initials Haitian schools are known by', () => {
    expect(monogramOf('Institution Saint-Louis de Gonzague')).toBe('ISLG');
    expect(monogramOf('Collège Canado Haïtien')).toBe('CCH');
    expect(monogramOf('Lycée Toussaint Louverture')).toBe('LTL');
    expect(monogramOf('Bird')).toBe('BI');
    expect(monogramOf('')).toBe('?');
  });
});

describe('SchoolCrest render', () => {
  it('renders compact at 18px without ribbon text, full at 160px with it', () => {
    const small = renderToStaticMarkup(<SchoolCrest name="Collège Canado Haïtien" size={18} />);
    const big = renderToStaticMarkup(<SchoolCrest name="Collège Canado Haïtien" size={160} />);
    expect(small).toContain('width="18"');
    expect(small).not.toContain('CCH');
    expect(big).toContain('CCH');
  });

  it('banner is 1.4× tall and labelled when titled', () => {
    const html = renderToStaticMarkup(<SchoolCrest name="Collège Bird" size={100} variant="banner" title="Collège Bird" />);
    expect(html).toContain('height="140"');
    expect(html).toContain('aria-label="Collège Bird"');
    expect(html).toContain('<title>Collège Bird</title>');
  });

  it('is hidden from assistive tech without a title', () => {
    expect(renderToStaticMarkup(<SchoolCrest name="X" />)).toContain('aria-hidden="true"');
  });
});
