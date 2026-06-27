import React from 'react';
import { View, Text } from 'react-native';

interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

export default function ProgressBar({ value, color = '#0857A6', height = 6, showLabel = false, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View>
      {(showLabel || label) && (
        <View className="flex-row justify-between mb-1">
          {label && <Text className="text-xs text-gray-500">{label}</Text>}
          {showLabel && <Text className="text-xs font-semibold text-gray-700">{clamped}%</Text>}
        </View>
      )}
      <View className="bg-gray-200 rounded-full overflow-hidden" style={{ height }}>
        <View
          className="rounded-full"
          style={{ width: `${clamped}%`, height, backgroundColor: color }}
        />
      </View>
    </View>
  );
}
