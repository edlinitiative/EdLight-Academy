import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReduceMotion } from '../utils/motion';
import { useColors } from '../theme/theme';

interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

export default function ProgressBar({
  value,
  color,
  height = 6,
  showLabel = false,
  label,
}: ProgressBarProps) {
  const colors = useColors();
  const fill = color ?? colors.azure;
  const clamped = Math.max(0, Math.min(100, value));
  const reduceMotion = useReduceMotion();
  const width = useSharedValue(0);

  useEffect(() => {
    // Ease the fill toward its value so progress feels earned, not snapped —
    // unless the user prefers reduced motion, in which case snap to the value.
    width.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [clamped, width, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View>
      {(showLabel || label) && (
        <View className="flex-row justify-between mb-1">
          {label && <Text className="text-xs text-gray-500 dark:text-slate-400">{label}</Text>}
          {showLabel && <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300">{clamped}%</Text>}
        </View>
      )}
      <View className="bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden" style={{ height }}>
        <Animated.View
          className="rounded-full"
          style={[{ height, backgroundColor: fill }, fillStyle]}
        />
      </View>
    </View>
  );
}
