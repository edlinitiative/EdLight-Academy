import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

/** Test harness: a dialog-like container with three focusable buttons. */
function TrapHarness({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref} tabIndex={-1} data-testid="trap">
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </div>
  );
}

function pressTab(target: Element, shiftKey = false) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true })
  );
}

describe('useFocusTrap', () => {
  it('moves focus to the first focusable element on mount', () => {
    const { getByText } = render(<TrapHarness />);
    expect(getByText('first')).toHaveFocus();
  });

  it('wraps focus from the last element back to the first on Tab', () => {
    const { getByText } = render(<TrapHarness />);
    const last = getByText('last');
    last.focus();
    expect(last).toHaveFocus();

    pressTab(last);
    expect(getByText('first')).toHaveFocus();
  });

  it('wraps focus from the first element to the last on Shift+Tab', () => {
    const { getByText } = render(<TrapHarness />);
    const first = getByText('first');
    first.focus();

    pressTab(first, true);
    expect(getByText('last')).toHaveFocus();
  });

  it('restores focus to the previously-focused element on unmount', () => {
    // An element outside the trap that "opened" the dialog.
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(opener).toHaveFocus();

    const { unmount } = render(<TrapHarness />);
    // Focus moved into the trap.
    expect(opener).not.toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();

    document.body.removeChild(opener);
  });

  it('does not trap or move focus when inactive', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    render(<TrapHarness active={false} />);
    // Inactive trap leaves focus where it was.
    expect(opener).toHaveFocus();

    document.body.removeChild(opener);
  });
});
