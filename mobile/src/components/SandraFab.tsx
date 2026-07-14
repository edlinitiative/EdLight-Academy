/**
 * SandraFab — floating action button that opens the Sandra AI-tutor chat.
 * Coral circle with a MessageCircle icon and a "Sandra" label, pinned
 * bottom-right above the tab bar.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MessageCircle } from 'lucide-react-native';

export default function SandraFab({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Sandra"
      style={{
        position: 'absolute',
        right: 16,
        bottom: 96,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#E0532F',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#E0532F',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <MessageCircle size={26} color="#ffffff" />
      </View>
      <View
        style={{
          marginTop: 4,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e8edf5',
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
          shadowColor: '#0857A6',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#E0532F' }}>Sandra</Text>
      </View>
    </TouchableOpacity>
  );
}
