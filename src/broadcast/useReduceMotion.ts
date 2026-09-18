import { useEffect, useState } from 'react';

/**
 * The viewer's own motion setting, watched rather than read once.
 *
 * Read once at mount, a projector left running for an hour would never notice
 * the setting change — and the people most likely to change it mid-session are
 * exactly the people it exists for.
 *
 * Lives on its own so the page and the stage shell share one definition: two
 * copies would eventually disagree, and a stage where half the scenes honour
 * the setting is worse than one where none do, because it reads as a bug rather
 * than as a preference.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduce(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduce;
}
