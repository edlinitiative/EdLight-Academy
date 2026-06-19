import { useCallback, useRef, useState, RefObject, CSSProperties, TouchEvent } from 'react';

interface SwipeOptions {
  /** Pixels the sheet must be dragged down before it dismisses. */
  threshold?: number;
  /** Disable the gesture entirely (e.g. on desktop). */
  enabled?: boolean;
  /**
   * The element whose `scrollTop` decides whether a downward drag should pull
   * the sheet (only when it's already scrolled to the very top). Defaults to
   * the element the handlers are attached to.
   */
  scrollRef?: RefObject<HTMLElement>;
}

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  /** Inline transform to apply to the sheet while dragging. */
  style: CSSProperties | undefined;
  /** Current drag offset in px (0 when idle). */
  dragY: number;
}

/**
 * useSwipeToDismiss — native bottom-sheet feel: drag the sheet down to close.
 *
 * The pull only engages when the sheet's scroll area is at the top, so normal
 * content scrolling is never hijacked. Past `threshold`, `onDismiss` fires;
 * otherwise the sheet springs back.
 */
export function useSwipeToDismiss(
  onDismiss: () => void,
  { threshold = 110, enabled = true, scrollRef }: SwipeOptions = {}
): SwipeHandlers {
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const [dragY, setDragY] = useState(0);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const scroller = scrollRef?.current ?? (e.currentTarget as HTMLElement);
      // Only allow the pull-to-dismiss when content is scrolled to the top.
      if (scroller && scroller.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      dragging.current = true;
    },
    [enabled, scrollRef]
  );

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!dragging.current || startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    // Only react to downward drags; upward motion is left to native scroll.
    setDragY(delta > 0 ? delta : 0);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    if (dragY > threshold) {
      onDismiss();
    }
    setDragY(0);
  }, [dragY, threshold, onDismiss]);

  const style: CSSProperties | undefined =
    dragY > 0
      ? { transform: `translateY(${dragY}px)`, transition: 'none', touchAction: 'none' }
      : undefined;

  return { onTouchStart, onTouchMove, onTouchEnd, style, dragY };
}

export default useSwipeToDismiss;
