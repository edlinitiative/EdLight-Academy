/**
 * PressableScale — a Pressable that springs down slightly on press and fires a
 * light haptic. The premium "push" feel for cards, tiles and CTAs, replacing
 * the flat opacity fade of TouchableOpacity.
 */

import React from 'react';
import {
  Pressable,
  StyleProp,
  ViewStyle,
  PressableProps,
  AccessibilityRole,
  AccessibilityState,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tapLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Sensible default hit target so small controls reach the ~44px effective
// touch area recommended for accessibility. Callers can still override by
// passing their own `hitSlop`.
const DEFAULT_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale at full press. Smaller (0.96) for big cards, closer to 1 for chips. */
  pressedScale?: number;
  /** Fire a haptic on press-in. Default true. */
  haptic?: boolean;
  /**
   * Opacity applied to the whole pressable while `disabled`. Defaults to 0.45
   * so disabled controls read as inactive. A caller that dims itself (e.g.
   * Button) can set its own `opacity` in `style` — the caller's style is applied
   * last and wins, so there's no double-dimming.
   */
  disabledOpacity?: number;
}

export default function PressableScale({
  children,
  style,
  pressedScale = 0.97,
  haptic = true,
  disabledOpacity = 0.45,
  hitSlop = DEFAULT_HIT_SLOP,
  onPressIn,
  onPressOut,
  disabled,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      hitSlop={hitSlop}
      disabled={disabled}
      // Forward the a11y props explicitly (not just via ...rest) so VoiceOver /
      // TalkBack always get role, label, hint and state — and default the
      // disabled flag into accessibilityState while letting callers override it.
      accessibilityRole={accessibilityRole as AccessibilityRole | undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...(accessibilityState as AccessibilityState | undefined) }}
      onPressIn={(e) => {
        // No press scale (or haptic) while disabled — a disabled control must
        // not feel tappable.
        if (!disabled) scale.value = withTiming(pressedScale, { duration: 90 });
        if (haptic && !disabled) tapLight();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!disabled) scale.value = withTiming(1, { duration: 120 });
        onPressOut?.(e);
      }}
      // Disabled dim goes BEFORE `style` so a caller that sets its own opacity
      // (Button) keeps control and we never stack two dims on top of each other.
      style={[animatedStyle, disabled ? { opacity: disabledOpacity } : null, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
