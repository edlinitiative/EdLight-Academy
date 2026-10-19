/**
 * Reduce-motion awareness. A single hook screens can read to decide whether to
 * play a micro-animation or a celebration burst. Haptics are unaffected — only
 * visual motion is gated, so users who ask the OS for "reduce motion" get a
 * calm, static UI while still feeling taps.
 *
 * The value is read once per app run and kept in sync with the OS setting via
 * one shared `reduceMotionChanged` subscription, so toggling Accessibility
 * settings updates every animated component without a reload.
 */

import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One app-wide subscription instead of one per component: PressableScale alone
// mounts hundreds of times, and each used to ask the OS and add a listener.
let current = false;
let started = false;
const listeners = new Set<() => void>();

function set(v: boolean) {
  if (v === current) return;
  current = v;
  listeners.forEach((l) => l());
}

function query() {
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then((v) => set(!!v))
    .catch(() => {});
}

function start() {
  if (started) return;
  started = true;
  query();
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => set(!!v));
}

function subscribe(l: () => void) {
  // First subscriber after a quiet spell re-asks the OS: cheap, and it keeps
  // the cache honest if an event was ever missed while nothing was listening.
  if (started && listeners.size === 0) query();
  start();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getSnapshot = () => current;

/** Current Reduce Motion value outside React (e.g. inside an event handler). */
export function isReduceMotionOn(): boolean {
  start();
  return current;
}

/** Test-only: reset the shared cache so each test can mock the OS value. */
export function __resetReduceMotionForTests() {
  current = false;
  started = false;
  listeners.clear();
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * `animationType` for a React Native <Modal>: the system fade/slide is motion
 * too, so reduced motion presents the sheet instantly.
 */
export function modalAnimation(reduce: boolean, preferred: 'fade' | 'slide' = 'fade'): 'none' | 'fade' | 'slide' {
  return reduce ? 'none' : preferred;
}

export default useReduceMotion;
