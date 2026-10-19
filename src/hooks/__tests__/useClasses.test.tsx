import * as React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createUseClasses } from '../../../shared/useClasses';
const useClasses = createUseClasses(React);
const home = (title: string) => ({ canTeach: false, classes: [{ id: 'c1', title, school: 'School', teacher: false, pending: false }] });

it('discards a previous account response and clears the previous account data immediately', async () => {
  let resolveOld!: (value: unknown) => void;
  const request = jest.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(home('B'));
  const { result, rerender } = renderHook(({ uid }) => useClasses(uid, request), { initialProps: { uid: 'A' } });
  rerender({ uid: 'B' });
  await waitFor(() => expect(result.current.home?.classes[0].title).toBe('B'));
  await act(async () => { resolveOld(home('A')); });
  expect(result.current.home?.classes[0].title).toBe('B');
  rerender({ uid: '' });
  expect(result.current.home).toBeUndefined();
});
it('keeps a failed selection available for retry without showing a rejected private board', async () => {
  const request = jest.fn(async (action: string) => { if (action === 'read') throw new Error('forbidden'); return home('A'); });
  const { result } = renderHook(() => useClasses('A', request as any));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.load('c1'); });
  expect(result.current.selectedId).toBe('c1'); expect(result.current.detail).toBeUndefined(); expect(result.current.error).toBeDefined();
});
it('guards duplicate taps while a mutation is in flight', async () => {
  let finish!: () => void;
  const request = jest.fn(async (action: string) => action === 'home' ? home('A') : new Promise<void>((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useClasses('A', request as any));
  await waitFor(() => expect(result.current.loading).toBe(false));
  let first!: Promise<boolean>;
  act(() => { first = result.current.act('join', { code: 'ABC234' }); });
  await act(async () => { expect(await result.current.act('join', { code: 'ABC234' })).toBe(false); });
  await act(async () => { finish(); await first; });
  expect(request.mock.calls.filter(([action]) => action === 'join')).toHaveLength(1);
});
