/**
 * PressableScale — a Pressable that springs down slightly on press and fires a
 * light haptic. The premium "push" feel for cards, tiles and CTAs, replacing
 * the flat opacity fade of TouchableOpacity.
 */

import React from 'react';
import { Pressable, StyleProp, ViewStyle, PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tapLight } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale at full press. Smaller (0.96) for big cards, closer to 1 for chips. */
  pressedScale?: number;
  /** Fire a haptic on press-in. Default true. */
  haptic?: boolean;
}

export default function PressableScale({
  children,
  style,
  pressedScale = 0.97,
  haptic = true,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withTiming(pressedScale, { duration: 90 });
        if (haptic && !disabled) tapLight();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 120 });
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
