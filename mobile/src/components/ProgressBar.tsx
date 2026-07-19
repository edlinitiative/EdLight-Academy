import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

export default function ProgressBar({
  value,
  color = '#1B6FE0',
  height = 6,
  showLabel = false,
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const width = useSharedValue(0);

  useEffect(() => {
    // Ease the fill toward its value so progress feels earned, not snapped.
    width.value = withTiming(clamped, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [clamped, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View>
      {(showLabel || label) && (
        <View className="flex-row justify-between mb-1">
          {label && <Text className="text-xs text-gray-500">{label}</Text>}
          {showLabel && <Text className="text-xs font-semibold text-gray-700">{clamped}%</Text>}
        </View>
      )}
      <View className="bg-gray-200 rounded-full overflow-hidden" style={{ height }}>
        <Animated.View
          className="rounded-full"
          style={[{ height, backgroundColor: color }, fillStyle]}
        />
      </View>
    </View>
  );
}
