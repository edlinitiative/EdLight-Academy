import { renderHook, act } from '@testing-library/react';
import { useSwipeToDismiss } from '../useSwipeToDismiss';

/** Build a minimal React.TouchEvent-like object for the handlers. */
function touch(clientY: number, scrollTop = 0) {
  return {
    currentTarget: { scrollTop } as HTMLElement,
    touches: [{ clientY }],
  } as any;
}

describe('useSwipeToDismiss', () => {
  it('dismisses when dragged past the threshold', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss(onDismiss, { threshold: 110 })
    );

    act(() => result.current.onTouchStart(touch(100)));
    act(() => result.current.onTouchMove(touch(300))); // delta = 200 > 110
    act(() => result.current.onTouchEnd());

    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Offset resets after release.
    expect(result.current.dragY).toBe(0);
  });

  it('springs back (no dismiss) when released below the threshold', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss(onDismiss, { threshold: 110 })
    );

    act(() => result.current.onTouchStart(touch(100)));
    act(() => result.current.onTouchMove(touch(150))); // delta = 50 < 110
    act(() => result.current.onTouchEnd());

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.dragY).toBe(0);
  });

  it('ignores upward drags (never produces a negative offset)', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() => useSwipeToDismiss(onDismiss));

    act(() => result.current.onTouchStart(touch(200)));
    act(() => result.current.onTouchMove(touch(50))); // upward, delta = -150
    expect(result.current.dragY).toBe(0);

    act(() => result.current.onTouchEnd());
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not engage when the scroll area is not at the top', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() => useSwipeToDismiss(onDismiss));

    // scrollTop > 0 means the user is scrolling content, not pulling the sheet.
    act(() => result.current.onTouchStart(touch(100, /* scrollTop */ 40)));
    act(() => result.current.onTouchMove(touch(400)));
    act(() => result.current.onTouchEnd());

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.dragY).toBe(0);
  });

  it('is inert when disabled', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss(onDismiss, { enabled: false })
    );

    act(() => result.current.onTouchStart(touch(100)));
    act(() => result.current.onTouchMove(touch(400)));
    act(() => result.current.onTouchEnd());

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('exposes a translateY transform only while dragging', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() => useSwipeToDismiss(onDismiss));

    expect(result.current.style).toBeUndefined();

    act(() => result.current.onTouchStart(touch(100)));
    act(() => result.current.onTouchMove(touch(220))); // delta = 120

    expect(result.current.style).toEqual(
      expect.objectContaining({ transform: 'translateY(120px)' })
    );
  });
});
