import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '../../theme/theme';

export default function LoadingSpinner({ full = false, color }: { full?: boolean; color?: string }) {
  const colors = useColors();
  const spinnerColor = color ?? colors.azure;
  if (full) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }
  return <ActivityIndicator size="large" color={spinnerColor} />;
}
