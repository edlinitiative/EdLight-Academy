import { act, renderHook } from '@testing-library/react';
import { useStateMachine } from '../stateMachine';
import { ceremonyMachine, CEREMONY_TIMING } from '../machines';

describe('useStateMachine', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('schedules timed exits and fires onEnter once per entered state', () => {
    const seen: string[] = [];
    const { result } = renderHook(() => useStateMachine(ceremonyMachine, { onEnter: (e) => seen.push(e.state) }));
    expect(result.current.state).toBe('waiting');
    act(() => result.current.send('confirm'));
    expect(result.current.state).toBe('dark');
    act(() => { jest.advanceTimersByTime(CEREMONY_TIMING.dark); });
    expect(result.current.state).toBe('anticipation');
    act(() => result.current.send('skip'));
    expect(result.current.state).toBe('settled');
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(result.current.state).toBe('settled');
    expect(seen).toEqual(['waiting', 'dark', 'anticipation', 'settled']);
  });

  it('an authoritative input cancels the pending cosmetic timer', () => {
    const { result } = renderHook(() => useStateMachine(ceremonyMachine));
    act(() => result.current.send('confirm'));
    act(() => { jest.advanceTimersByTime(CEREMONY_TIMING.dark + 200); });
    act(() => result.current.send('tie'));
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(result.current.state).toBe('tie');
  });
});
