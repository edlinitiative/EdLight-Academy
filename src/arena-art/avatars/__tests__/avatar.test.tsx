import React from 'react';
import { render } from '@testing-library/react';
import Avatar from '../Avatar';
import { defaultConfigFor, serializeConfig } from '../avatarConfig';
import {
  avatarTraits, AVATAR_MOODS, HAIR_STYLES, SKIN_TONES, UNIFORM_STYLES, HAIR_COLORS,
} from '../traits';

describe('avatarTraits', () => {
  it('is deterministic for a seed', () => {
    for (const seed of ['u-1', 'abc', '', 'Jean-Marc Pierre', 'x'.repeat(200)]) {
      expect(avatarTraits(seed)).toEqual(avatarTraits(seed));
    }
  });

  it('gives different students to near-identical seeds', () => {
    const keys = new Set(Array.from({ length: 50 }, (_, i) => {
      const t = avatarTraits(`user-${i}`);
      return `${t.hair}|${t.skin}|${t.glasses}|${t.uniform}|${t.hairColor}`;
    }));
    expect(keys.size).toBeGreaterThan(40);
  });

  it('covers every trait value across many seeds', () => {
    const hair = new Set<string>(); const skin = new Set<number>(); const uni = new Set<string>();
    const glasses = new Set<string>(); const hairColor = new Set<number>();
    let earrings = 0;
    for (let i = 0; i < 3000; i++) {
      const t = avatarTraits(`seed-${i}`);
      hair.add(t.hair); skin.add(t.skin); uni.add(t.uniform); glasses.add(t.glasses); hairColor.add(t.hairColor);
      if (t.earrings) earrings++;
      expect(t.eyeSize).toBeGreaterThanOrEqual(0.92);
      expect(t.eyeSize).toBeLessThanOrEqual(1.08);
      expect(Math.abs(t.eyeGap)).toBeLessThanOrEqual(1);
    }
    expect(hair.size).toBe(HAIR_STYLES.length);
    expect(skin.size).toBe(SKIN_TONES.length);
    expect(uni.size).toBe(UNIFORM_STYLES.length);
    expect(hairColor.size).toBe(HAIR_COLORS.length);
    expect([...glasses].sort()).toEqual(['none', 'round', 'square']);
    expect(earrings).toBeGreaterThan(500);
    expect(earrings).toBeLessThan(1400);
  });

  it('keeps headwraps occasional and no hair style dominant', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const h = avatarTraits(`id${i}`).hair; n[h] = (n[h] || 0) + 1; }
    expect(n.headwrap / 4000).toBeLessThan(0.1);
    for (const k of HAIR_STYLES) expect(n[k] / 4000).toBeLessThan(0.22);
  });

  it('applies explicit overrides', () => {
    const t = avatarTraits('u-1', { hair: 'locs', glasses: 'round', skin: 0 });
    expect(t.hair).toBe('locs');
    expect(t.glasses).toBe('round');
    expect(t.skin).toBe(0);
    expect(t.uniform).toBe(avatarTraits('u-1').uniform);
  });
});

describe('<Avatar />', () => {
  it('is decorative without a title', () => {
    const { container } = render(<Avatar seed="u-1" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('is a labelled image with a title', () => {
    const { getByRole } = render(<Avatar seed="u-1" title="Nadège, prête" />);
    expect(getByRole('img', { name: 'Nadège, prête' })).toBeTruthy();
  });

  it('renders the same markup for the same seed', () => {
    const a = render(<Avatar seed="u-same" mood="ready" />).container.innerHTML.replace(/id="[^"]*"|#[^)"]*\)|aria-labelledby="[^"]*"/g, '');
    const b = render(<Avatar seed="u-same" mood="ready" />).container.innerHTML.replace(/id="[^"]*"|#[^)"]*\)|aria-labelledby="[^"]*"/g, '');
    expect(a).toBe(b);
  });

  it('stays under ~6 KB of markup in every mood and hair style', () => {
    for (const mood of AVATAR_MOODS) {
      for (const hair of HAIR_STYLES) {
        const { container, unmount } = render(
          <Avatar seed="u-big" mood={mood} traits={{ hair, glasses: 'square', earrings: true }} size={200} />,
        );
        expect(container.innerHTML.length).toBeLessThan(6500);
        expect(container.querySelector('svg')!.getAttribute('class')).toContain(`av--${mood}`);
        unmount();
      }
    }
  });

  it('confetti only when celebrating, never when still or small', () => {
    const q = (el: HTMLElement) => el.querySelector('.av-confetti');
    expect(q(render(<Avatar seed="a" mood="celebrating" size={120} />).container)).not.toBeNull();
    expect(q(render(<Avatar seed="a" mood="celebrating" size={120} still />).container)).toBeNull();
    expect(q(render(<Avatar seed="a" mood="celebrating" size={32} />).container)).toBeNull();
    expect(q(render(<Avatar seed="a" mood="idle" size={120} />).container)).toBeNull();
  });

  it('uses the school colours passed in', () => {
    const { container } = render(<Avatar seed="a" colors={{ primary: '#123456', secondary: '#ABCDEF' }} />);
    expect(container.innerHTML).toContain('#123456');
    expect(container.innerHTML).toContain('#ABCDEF');
  });

  it('falls back to the seeded face when the config is absent or junk', () => {
    const strip = (h: string) => h.replace(/id="[^"]*"|#[^)"]*\)|aria-labelledby="[^"]*"/g, '');
    const seeded = strip(render(<Avatar seed="u-fb" still />).container.innerHTML);
    expect(strip(render(<Avatar seed="u-fb" still config={defaultConfigFor('u-fb')} />).container.innerHTML)).toBe(seeded);
    expect(strip(render(<Avatar seed="u-fb" still config="<junk>" />).container.innerHTML)).toBe(seeded);
    expect(strip(render(<Avatar seed="u-fb" still config={null} />).container.innerHTML)).toBe(seeded);
  });

  it('an explicit config wins over the seeded traits (object or wire string)', () => {
    const cfg = { ...defaultConfigFor('u-fb'), skin: 13, hair: 'bantu' as const };
    const html = render(<Avatar seed="u-fb" still config={cfg} />).container.innerHTML;
    expect(html).toContain('#F1D3B8');
    expect(render(<Avatar seed="u-fb" still config={serializeConfig(cfg)} />).container.innerHTML.replace(/id="[^"]*"|#[^)"]*\)/g, ''))
      .toBe(html.replace(/id="[^"]*"|#[^)"]*\)/g, ''));
  });
});
