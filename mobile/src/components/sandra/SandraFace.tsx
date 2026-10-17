/**
 * SandraFace — Sandra's one face everywhere (chat header, bubbles, Search row,
 * the floating button): the generated arena avatar with fixed traits, so she
 * is always recognisably the same tutor. Optional online dot.
 */

import React from 'react';
import { View } from 'react-native';
import { Avatar as Face } from '../arena/art';
import type { AvatarMood } from '../arena/art';
import { useTheme } from '../../theme/theme';

const SANDRA_TRAITS = {
  hair: 'puffs' as const,
  glasses: 'round' as const,
  earrings: true,
  colors: { primary: '#12213A', secondary: '#1B6FE0' },
};

export default function SandraFace({
  size = 48,
  online = false,
  mood = 'idle',
  still = true,
}: {
  size?: number;
  online?: boolean;
  mood?: AvatarMood;
  still?: boolean;
}) {
  const { colors } = useTheme();
  const dot = Math.max(10, Math.round(size * 0.26));
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Face seed="sandra-edlight" size={size} mood={mood} still={still} traits={SANDRA_TRAITS} />
      {online ? (
        <View
          style={{
            position: 'absolute', right: -1, bottom: -1, width: dot, height: dot, borderRadius: dot / 2,
            backgroundColor: colors.successFill, borderWidth: 2, borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}
