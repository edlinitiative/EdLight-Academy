/**
 * SkeletonCover — the loading twin of a cover card: a 16:9 block plus a title
 * bar and a meta bar, inside the standard card surface, so the layout does not
 * jump when the real VideoCover card arrives.
 */

import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Skeleton } from '../StateViews';
import { useTheme } from '../../theme/theme';

export default function SkeletonCover({
  ratio = 16 / 9,
  width,
  style,
}: {
  ratio?: number;
  /** Fixed card width (rails). Default full width. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { cardSurface, radius } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[cardSurface, { width: width ?? '100%', overflow: 'hidden' }, style]}
    >
      <View style={{ width: '100%', aspectRatio: ratio }}>
        <Skeleton height={undefined as any} radius={0} style={{ height: '100%', borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }} />
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        <Skeleton width="70%" height={18} radius={6} />
        <Skeleton width="45%" height={14} radius={6} />
      </View>
    </View>
  );
}
