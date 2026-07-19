import React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function LoadingSpinner({ full = false, color = '#1B6FE0' }: { full?: boolean; color?: string }) {
  if (full) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={color} />
      </View>
    );
  }
  return <ActivityIndicator size="large" color={color} />;
}
