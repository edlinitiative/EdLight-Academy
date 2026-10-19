import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import { DUR, EASE } from '../tokens';
import { useFlipList } from '../useFlipList';

const css = fs.readFileSync(path.join(__dirname, '..', 'competition.css'), 'utf8');

/** Top-level @media blocks with their bodies (brace-matched). */
function mediaBlocks(src: string): Array<{ query: string; body: string; start: number; end: number }> {
  const out: Array<{ query: string; body: string; start: number; end: number }> = [];
  const re = /@media\s*([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push({ query: m[1].trim(), body: src.slice(re.lastIndex, i - 1), start: m.index, end: i });
    re.lastIndex = i;
  }
  return out;
}

describe('competition.css — the reduced-motion off-switch', () => {
  it('declares every animation only under prefers-reduced-motion: no-preference', () => {
    const blocks = mediaBlocks(css);
    const safe = blocks.filter((b) => /prefers-reduced-motion:\s*no-preference/.test(b.query));
    expect(safe.length).toBeGreaterThan(0);
    const re = /animation\s*:/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(css))) {
      count++;
      const at = m.index;
      expect(safe.some((b) => at > b.start && at < b.end)).toBe(true);
    }
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('has no infinite loops (phase moments only)', () => {
    expect(css).not.toMatch(/infinite/);
  });

  it('uses the same numbers as tokens.ts (one vocabulary)', () => {
    for (const [k, v] of Object.entries(DUR)) {
      if (k === 'intro' || k === 'ceremony') continue;
      expect(css).toContain(`--mo-dur-${k}: ${v}ms;`);
    }
    for (const [k, v] of Object.entries(EASE)) expect(css).toContain(`--mo-ease-${k}: ${v};`);
  });
});

describe('useFlipList — standings reorder', () => {
  function List({ keys, reduced }: { keys: string[]; reduced: boolean }) {
    const flip = useFlipList(keys, { reduced });
    return (
      <ol>
        {keys.map((k) => <li key={k} data-k={k} ref={flip(k)}>{k}</li>)}
      </ol>
    );
  }

  // jsdom has no layout: give each row an offsetTop from its index, and a spy animate().
  let animate: jest.Mock;
  beforeEach(() => {
    animate = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return Array.from(this.parentElement?.children || []).indexOf(this) * 50;
      },
    });
    (HTMLElement.prototype as any).animate = animate;
  });
  afterEach(() => {
    delete (HTMLElement.prototype as any).offsetTop;
    delete (HTMLElement.prototype as any).animate;
  });

  it('slides moved rows from where they were', () => {
    const { rerender } = render(<List keys={['a', 'b', 'c']} reduced={false} />);
    expect(animate).not.toHaveBeenCalled(); // first board: nothing travels
    rerender(<List keys={['c', 'a', 'b']} reduced={false} />);
    expect(animate).toHaveBeenCalledTimes(3);
    const frames = animate.mock.calls.map((c) => c[0][0].transform);
    expect(frames).toEqual(expect.arrayContaining(['translateY(100px)', 'translateY(-50px)']));
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: DUR.navigation, easing: EASE.enter });
  });

  it('animates nothing under reduced motion, but the order still changes', () => {
    const { rerender, container } = render(<List keys={['a', 'b', 'c']} reduced />);
    rerender(<List keys={['c', 'a', 'b']} reduced />);
    expect(animate).not.toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['c', 'a', 'b']);
  });
});
