import { useEffect, useRef, useState } from 'react';
import { useReduceMotion } from '../utils/motion';

/**
 * Animate an integer from 0 up to `target` (easeOutCubic) — the "score lands"
 * feel on results screens. Honors reduce-motion (jumps straight to target).
 */
export function useCountUp(target: number, duration = 850): number {
  const reduce = useReduceMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setValue(target); return; }
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, [target, duration, reduce]);

  return value;
}
