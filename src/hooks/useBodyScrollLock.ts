import { useLayoutEffect } from 'react';

/**
 * useBodyScrollLock — prevents the page behind a modal/sheet from scrolling
 * while it is open, then restores the previous state on close.
 *
 * Why
 * ---
 * On mobile, an unlocked body lets the page scroll *behind* an open modal as
 * the user drags — a classic "broken" feel. This locks the body for the life
 * of the component and compensates for the desktop scrollbar width so the
 * layout doesn't shift when the bar disappears.
 *
 * @param active - lock only while true (defaults to true).
 */
export function useBodyScrollLock(active: boolean = true): void {
  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    // Avoid a layout jump when the (desktop) scrollbar is removed.
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}

export default useBodyScrollLock;
