import { crestSpec, monogramOf } from '../crest/crestSpec';
import { CREST_PALETTES, contrastRatio } from '../crest/palette';
import { emblemForLevel, emblemLabel, EMBLEM_TIERS } from '../emblems/tiers';

describe('crestSpec', () => {
  it('is deterministic for the same name', () => {
    expect(crestSpec('Collège Canado Haïtien')).toEqual(crestSpec('Collège Canado Haïtien'));
  });

  it('gives every spelling of one school the same crest', () => {
    const a = crestSpec('Lycée Toussaint-Louverture');
    const b = crestSpec('LYCEE TOUSSAINT LOUVERTURE');
    expect(a.key).toBe(b.key);
    expect({ ...a, monogram: '' }).toEqual({ ...b, monogram: '' });
  });

  it('builds the ribbon monogram from the significant words', () => {
    expect(monogramOf('Institution Saint-Louis de Gonzague')).toBe('ISLG');
    expect(monogramOf('Collège Canado Haïtien')).toBe('CCH');
  });

  it('never puts the palm on a field divided per fess (national-arms echo)', () => {
    for (let i = 0; i < 400; i++) {
      const spec = crestSpec(`École numéro ${i} de la ville ${i % 17}`);
      expect(spec.charge === 'palmier' && spec.division === 'fess').toBe(false);
    }
  });
});

describe('crest palettes', () => {
  it.each(CREST_PALETTES.map((p) => [p.id, p] as const))('%s charge reads on field and tone at 3:1', (_id, p) => {
    expect(contrastRatio(p.charge, p.field)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.charge, p.tone)).toBeGreaterThanOrEqual(3);
  });
});

describe('emblemForLevel', () => {
  it.each([
    [1, 'bronze'], [4, 'bronze'], [5, 'silver'], [9, 'silver'], [10, 'gold'],
    [19, 'gold'], [20, 'diamond'], [34, 'diamond'], [35, 'legend'],
  ] as const)('level %i → %s', (level, id) => {
    expect(emblemForLevel(level).id).toBe(id);
  });

  it('clamps nonsense levels to bronze', () => {
    expect(emblemForLevel(0).id).toBe('bronze');
    expect(emblemForLevel(NaN as unknown as number).id).toBe('bronze');
  });

  it('states the meaning in text in both languages', () => {
    expect(emblemLabel(12)).toBe('Or · niveau 12');
    expect(emblemLabel(12, true)).toBe('Lò · nivo 12');
    expect(EMBLEM_TIERS).toHaveLength(5);
  });
});
