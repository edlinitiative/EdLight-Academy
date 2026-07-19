import React from 'react';
import { View, Text } from 'react-native';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}

export default function Badge({ label, color = '#e0eaff', textColor = '#1B6FE0', size = 'md' }: BadgeProps) {
  const pad = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  const fs = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <View className={`rounded-full items-center justify-center ${pad}`} style={{ backgroundColor: color }}>
      <Text className={`font-semibold ${fs}`} style={{ color: textColor }}>{label}</Text>
    </View>
  );
}
