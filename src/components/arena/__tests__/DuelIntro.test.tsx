import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DuelIntro, { COUNTDOWN_MS, INTRO_HOLD_MS } from '../DuelIntro';
import { DUR } from '../../../arena-art/motion/tokens';

const me = { name: 'Toi', school: 'Lycée Pétion', colors: { primary: '#123', secondary: '#fd7' }, seed: 'me' };
const op = { name: 'Ami', school: '7/10 à battre', colors: { primary: '#123', secondary: '#fd7' }, seed: 'op' };

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('DuelIntro (audit X1) — one timeline: reveal, 3-2-1, round', () => {
  it('shows both faces, then the countdown, then hands over exactly once', () => {
    const onGo = jest.fn();
    render(<DuelIntro me={me} opponent={op} onGo={onGo} />);
    expect(screen.getByText('Ami')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
    act(() => { jest.advanceTimersByTime(DUR.intro + INTRO_HOLD_MS + 20); });
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(onGo).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(COUNTDOWN_MS + 1200); });
    expect(onGo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('without a known opponent it is the countdown alone; "Commencer" skips it', () => {
    const onGo = jest.fn();
    render(<DuelIntro me={me} onGo={onGo} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('leaving mid-intro cancels it: nothing fires after unmount', () => {
    const onGo = jest.fn();
    const { unmount } = render(<DuelIntro me={me} opponent={op} onGo={onGo} />);
    act(() => { jest.advanceTimersByTime(500); });
    unmount();
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(onGo).not.toHaveBeenCalled();
  });

  it('offers the sound switch, off by default', () => {
    render(<DuelIntro me={me} onGo={() => {}} />);
    const sw = screen.getByRole('button', { name: /Son coupé/ });
    expect(sw).toHaveAttribute('aria-pressed', 'false');
  });
});
