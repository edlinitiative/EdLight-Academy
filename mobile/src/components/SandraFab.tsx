/**
 * SandraFab — floating action button that opens the Sandra AI-tutor chat.
 * Coral gradient circle with a MessageCircle icon and a "Sandra" label, pinned
 * bottom-right above the tab bar. Springs on press with a medium haptic.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle } from 'lucide-react-native';
import PressableScale from './ui/PressableScale';
import { tapMedium } from '../utils/haptics';
import { useColors } from '../theme/theme';

export default function SandraFab({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={() => { tapMedium(); onPress(); }}
      haptic={false}
      pressedScale={0.92}
      accessibilityRole="button"
      accessibilityLabel="Sandra"
      style={{ position: 'absolute', right: 16, bottom: 96, alignItems: 'center' }}
    >
      <LinearGradient
        colors={['#F0693F', '#E0532F', '#C63F1F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
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
      </LinearGradient>
      <View
        style={{
          marginTop: 4,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
          shadowColor: '#1B6FE0',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.coral }}>Sandra</Text>
      </View>
    </PressableScale>
  );
}
