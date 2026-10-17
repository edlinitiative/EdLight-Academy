/**
 * PageTitle — the one title row every tab opens on, like the web: Plus Jakarta
 * Sans 800 at 32, top-left, with an optional muted subtitle and a right slot
 * for a 44pt control (search, avatar). No band, no greeting, no stats.
 */

import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

export interface PageTitleProps {
  title: string;
  /** One or two lines in `meta`, muted. */
  subtitle?: string | null;
  /** A 44pt control: search button, avatar. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function PageTitle({ title, subtitle, right, style }: PageTitleProps) {
  const { colors, typeScale } = useTheme();
  return (
    <View style={[{ paddingHorizontal: 20, paddingTop: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={[typeScale.pageTitle, { color: colors.ink, flex: 1 }]}
        >
          {title}
        </Text>
        {right ? <View style={{ minHeight: 44, justifyContent: 'center' }}>{right}</View> : null}
      </View>
      {subtitle ? (
        <Text numberOfLines={2} style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
