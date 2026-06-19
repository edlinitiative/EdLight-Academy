import { renderHook } from '@testing-library/react';
import { useBodyScrollLock } from '../useBodyScrollLock';

describe('useBodyScrollLock', () => {
  afterEach(() => {
    // Reset any styles a test may have left on <body>.
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });

  it('locks body scroll while mounted and restores it on unmount', () => {
    expect(document.body.style.overflow).toBe('');

    const { unmount } = renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does nothing when inactive', () => {
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the previous overflow value rather than blindly clearing it', () => {
    document.body.style.overflow = 'scroll';

    const { unmount } = renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });
});
