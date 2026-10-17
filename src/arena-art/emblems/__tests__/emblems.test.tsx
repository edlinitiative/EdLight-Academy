import React from 'react';
import { render, cleanup } from '@testing-library/react';

const renderToStaticMarkup = (el: React.ReactElement): string => {
  const { container } = render(el);
  const out = container.innerHTML;
  cleanup();
  return out;
};
import RankEmblem, { EMBLEM_TIERS, emblemForLevel, emblemLabel, ParticipationBadge } from '../RankEmblem';

describe('emblem tiers', () => {
  it('keeps the contract tiers and thresholds', () => {
    expect(EMBLEM_TIERS.map((t) => [t.id, t.minLevel])).toEqual([
      ['bronze', 1], ['silver', 5], ['gold', 10], ['diamond', 20], ['legend', 35],
    ]);
  });

  it.each([
    [0, 'bronze'], [1, 'bronze'], [4, 'bronze'], [5, 'silver'], [9, 'silver'], [10, 'gold'],
    [19, 'gold'], [20, 'diamond'], [34, 'diamond'], [35, 'legend'], [999, 'legend'], [NaN, 'bronze'],
  ])('level %p → %s', (level, id) => {
    expect(emblemForLevel(level as number).id).toBe(id);
  });

  it('states its meaning in text', () => {
    expect(emblemLabel(12)).toBe('Or · niveau 12');
    expect(emblemLabel(12, true)).toBe('Lò · nivo 12');
  });
});

describe('RankEmblem render', () => {
  it.each(EMBLEM_TIERS.map((t) => [t.id, t.minLevel]))('%s shows its level number at 20px and 64px', (id, lvl) => {
    for (const size of [20, 64]) {
      const html = renderToStaticMarkup(<RankEmblem level={lvl as number} size={size} />);
      expect(html).toContain(`data-tier="${id}"`);
      expect(html).toContain(`>${lvl}</text>`);
    }
  });

  it('gives every tier a different silhouette', () => {
    const shapes = EMBLEM_TIERS.map((t) => renderToStaticMarkup(<RankEmblem level={t.minLevel} size={64} />)
      .replace(/>\d+<\/text>/, '').replace(/emb[a-zA-Z]?\d+/g, 'ID'));
    expect(new Set(shapes).size).toBe(EMBLEM_TIERS.length);
  });

  it('animates only the legend tier, and only at reading size', () => {
    expect(renderToStaticMarkup(<RankEmblem level={40} size={64} />)).toContain('emb-sheen');
    expect(renderToStaticMarkup(<RankEmblem level={40} size={20} />)).not.toContain('emb-sheen');
    expect(renderToStaticMarkup(<RankEmblem level={25} size={64} />)).not.toContain('emb-sheen');
  });
});

describe('ParticipationBadge', () => {
  it('renders in school colours and is labelled when titled', () => {
    const html = renderToStaticMarkup(<ParticipationBadge school="Collège Canado Haïtien" size={32} title="A joué pour son école" />);
    expect(html).toContain('aria-label="A joué pour son école"');
    expect(html).toContain('emb--participation');
  });
});
