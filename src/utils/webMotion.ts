/**
 * Hand-rolled motion primitives for the live spectator screen.
 *
 * The big screen behind a live trivia event is the one surface where motion is
 * the point: a score that snaps from 40 to 65 tells the room nothing, while a
 * score that counts up and a row that slides past its rival is the whole
 * broadcast. But this repo has no animation dependency on purpose — the bundle
 * is downloaded over Haitian mobile data, and a motion library is ~30KB to
 * animate two properties. So the two things the screen actually needs live
 * here, in about a hundred lines, and nothing else gets to grow.
 *
 * Everything in this file is plain DOM and numbers. No React: the spectator
 * screen drives these from effects and refs, and a hook would force every
 * future caller into a component.
 */

/**
 * True when the viewer asked their OS to reduce motion.
 *
 * Guarded twice over because this module is imported by pages that are
 * PRERENDERED at build time (scripts/prerender_routes.mjs runs after webpack).
 * A bare `window.matchMedia(...)` reached during that pass throws and takes the
 * whole build down — and the failure looks like a webpack error, not a motion
 * bug, so it costs an hour to find. `matchMedia` is also absent in some
 * embedded webviews, where an unguarded call would break the screen on exactly
 * the low-end devices we care about.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Some older webviews throw on an unsupported media feature rather than
    // returning a non-matching MediaQueryList. Treat that as "no preference".
    return false;
  }
}

export interface AnimateValueOptions {
  from: number;
  to: number;
  /** Milliseconds. Default 900 — long enough to read, short enough to keep up. */
  duration?: number;
  onUpdate: (value: number) => void;
  onDone?: () => void;
}

/**
 * Ease-out cubic.
 *
 * Deceleration is what makes a counting number legible: linear counting ends
 * mid-stride and the eye never catches the final figure, which on a stream is
 * the only figure that matters. Cubic (rather than quad) spends most of its
 * time near the end, so the last few points tick over slowly enough to read.
 */
function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/**
 * Count a number from `from` to `to` over `duration`, via requestAnimationFrame.
 *
 * Returns a cancel function. CALL IT on unmount or before starting a new
 * animation for the same value: scores update every few seconds during a live
 * round, and an un-cancelled animation keeps writing its own interpolation over
 * the newer one, so the number visibly fights itself on screen — and each
 * orphaned loop keeps running for the rest of the event.
 */
export function animateValue(opts: AnimateValueOptions): () => void {
  const { from, to, duration = 900, onUpdate, onDone } = opts;

  const canAnimate =
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    duration > 0 &&
    !prefersReducedMotion();

  if (!canAnimate) {
    // Reduced motion, prerender, or a zero duration: land on the final value
    // immediately. `onUpdate(to)` still fires, because callers render FROM it —
    // skipping it would leave the score blank rather than merely still.
    onUpdate(to);
    onDone?.();
    return () => {
      /* nothing was ever scheduled */
    };
  }

  let frame = 0;
  let cancelled = false;
  // `null`, not 0: rAF timestamps are origin-relative, so the very first frame
  // of a freshly loaded page legitimately arrives at 0. A 0 sentinel would read
  // that as "not started yet" and re-anchor on the following frame, silently
  // stretching every animation that begins at page load by one frame.
  let start: number | null = null;

  const step = (now: number): void => {
    if (cancelled) return;
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / duration);
    if (t >= 1) {
      // Assign `to` verbatim rather than the eased result. The easing math is
      // floating point, so the last frame lands on 64.99999999999999 — which
      // renders as "65" only until someone formats with decimals, and compares
      // unequal to the real score forever.
      frame = 0;
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(from + (to - from) * easeOutCubic(t));
    frame = window.requestAnimationFrame(step);
  };

  frame = window.requestAnimationFrame(step);

  return () => {
    cancelled = true;
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** Milliseconds a row takes to travel to its new rank. */
const FLIP_DURATION_MS = 520;
const FLIP_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/**
 * Animate a reordered list with FLIP (First, Last, Invert, Play).
 *
 * The board re-sorts itself whenever a school's score changes, and the naive
 * fix — animating `top` or margins — makes the browser lay the whole list out
 * again on every frame. With 40 school rows on a projector that is where the
 * stream starts dropping frames, and the drop is worst exactly when the most is
 * happening on screen.
 *
 * FLIP instead lets the DOM jump straight to the final order, then lies to the
 * eye: each moved row is given an immediate `translateY` back to where it used
 * to be, and on the next frame that transform is released with a transition, so
 * the row appears to travel from its old rank to its new one. Transforms are
 * composited, so no layout happens during the animation at all.
 *
 * @param elements    Live row nodes by school key, as currently in the DOM.
 * @param previousTops `offsetTop` per key from the LAST call ("First").
 * @returns the new measurements — the caller keeps them and passes them back
 *          next tick. Returning them rather than storing module state matters:
 *          two boards (say a preview and the projector) would otherwise share
 *          one baseline and animate each other's rows.
 */
export function flipReorder(
  elements: Map<string, HTMLElement>,
  previousTops: Map<string, number>,
): Map<string, number> {
  const nextTops = new Map<string, number>();

  // Measure EVERYTHING first, in one pass, before touching a single style.
  // Interleaving reads and writes forces a synchronous layout per row
  // (layout thrash) — the exact cost FLIP exists to avoid.
  elements.forEach((el, key) => {
    if (!el) return;
    nextTops.set(key, el.offsetTop);
  });

  // Reduced motion still returns fresh measurements. Handing back the old ones
  // would leave a stale baseline behind, so the first move after the viewer
  // turns motion back on would animate from a position the row left minutes
  // ago — a row flying in from off-screen.
  if (prefersReducedMotion()) return nextTops;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return nextTops;
  }

  elements.forEach((el, key) => {
    if (!el) return;
    const before = previousTops.get(key);
    const after = nextTops.get(key);
    // A school with no previous measurement just joined the board (schools come
    // and go between ticks as their first answer lands). It has no old position
    // to travel from, and treating a missing entry as 0 would slide it down the
    // full height of the list.
    if (typeof before !== 'number' || typeof after !== 'number') return;

    const delta = before - after;
    // Sub-pixel jitter from fractional layout isn't a rank change; animating it
    // leaves rows permanently shivering on a projector.
    if (Math.abs(delta) < 1) return;

    // Invert: no transition, so this jump is invisible — the row is drawn where
    // it already was.
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;

    window.requestAnimationFrame(() => {
      // Play: next frame, release the transform WITH a transition. Both
      // properties must change in the same frame, or the browser coalesces the
      // invert and the release and nothing moves at all.
      el.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
      el.style.transform = '';
    });

    // Clear the transition once the row lands. Left in place it would also
    // animate the NEXT invert step, which is meant to be instantaneous — the
    // rows would lag a tick behind the scores and drift out of order.
    const clear = (): void => {
      el.style.transition = '';
    };
    el.addEventListener('transitionend', clear, { once: true });
  });

  return nextTops;
}
