import { useEffect, RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * useFocusTrap — keeps keyboard focus inside an open dialog/drawer and returns
 * focus to the previously-focused element when it closes.
 *
 * Accessibility: a modal must not let Tab escape to the page underneath, and
 * dismissing it should restore focus to whatever opened it (e.g. the button).
 *
 * @param ref     - the container element to trap focus within.
 * @param active  - trap only while true (defaults to true).
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus into the dialog on open (first control, else the container).
    const initial = getFocusable()[0];
    if (initial) {
      initial.focus({ preventScroll: true });
    } else if (typeof container.focus === 'function') {
      container.focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus to the opener if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}

export default useFocusTrap;
