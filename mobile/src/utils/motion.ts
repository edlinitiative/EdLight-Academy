/**
 * Reduce-motion awareness. A single hook screens can read to decide whether to
 * play a micro-animation or a celebration burst. Haptics are unaffected — only
 * visual motion is gated, so users who ask the OS for "reduce motion" get a
 * calm, static UI while still feeling taps.
 *
 * The value is read once on mount and kept in sync with the OS setting via the
 * `reduceMotionChanged` event, so toggling Accessibility settings updates the
 * app without a reload.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduce(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduce(!!v);
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}

export default useReduceMotion;
