/**
 * SectionHeader — the web's section row: PJS 800 22 title, an optional grey
 * pill badge ("Tes matières [NS I]"), and an optional "Voir tout ›" action in
 * azureInk. Sentence case; the caller passes translated strings.
 */

import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import PressableScale from './PressableScale';
import { useTheme } from '../../theme/theme';

export interface SectionHeaderProps {
  title: string;
  /** Short pill next to the title, e.g. "NS I". */
  badge?: string | null;
  actionLabel?: string | null;
  onAction?: () => void;
  /** Override the default rhythm (marginTop 32, marginBottom 14). */
  style?: StyleProp<ViewStyle>;
}

export default function SectionHeader({ title, badge, actionLabel, onAction, style }: SectionHeaderProps) {
  const { colors, typeScale, fonts, radius } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 32, marginBottom: 14, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, flexShrink: 1 }}>
        <Text accessibilityRole="header" numberOfLines={2} style={[typeScale.section, { color: colors.ink, flexShrink: 1 }]}>
          {title}
        </Text>
        {badge ? (
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
            <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.ink }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          haptic={false}
          pressedScale={0.97}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 }}
        >
          <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>{actionLabel}</Text>
          <ChevronRight color={colors.azureInk} size={16} strokeWidth={2.4} />
        </PressableScale>
      ) : null}
    </View>
  );
}
