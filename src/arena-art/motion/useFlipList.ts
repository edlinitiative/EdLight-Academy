import { useCallback, useLayoutEffect, useRef } from 'react';
import { DUR, EASE } from './tokens';

export interface FlipOptions {
  /** prefers-reduced-motion: rows jump to their new place, nothing animates. */
  reduced: boolean;
  /**
   * Wait before rows travel, so the reveal reads first: answer, then points,
   * then the standings (brief, "Sequential score presentation").
   */
  delay?: number;
}

/**
 * Animated reorder for a ranked list (FLIP: first, last, invert, play).
 *
 * Give each row `ref={flip(key)}`. When the order of `keys` changes, every row
 * that moved slides from where it was to where it now is, via the Web
 * Animations API — transform only, so layout never shifts and a newer board
 * simply replaces the running animation. Positions come from `offsetTop`, so
 * scrolling between two boards cannot fake a move.
 *
 * Reduced motion: positions are still recorded (so turning it off later starts
 * clean) but nothing is animated.
 */
export function useFlipList(keys: readonly string[], { reduced, delay = 0 }: FlipOptions): (key: string) => (el: HTMLElement | null) => void {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const signature = keys.join('\u0001');

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    nodes.current.forEach((el, key) => {
      const top = el.offsetTop;
      next.set(key, top);
      const before = tops.current.get(key);
      if (reduced || before == null || before === top || typeof el.animate !== 'function') return;
      try {
        el.getAnimations?.().forEach((a) => a.cancel());
        el.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
          { duration: DUR.navigation, easing: EASE.enter, delay, fill: 'backwards' },
        );
      } catch {
        /* an animation is decoration; the row is already in place */
      }
    });
    tops.current = next;
  }, [signature, reduced, delay]);

  return useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) nodes.current.set(key, el);
        else nodes.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);
}

export default useFlipList;
