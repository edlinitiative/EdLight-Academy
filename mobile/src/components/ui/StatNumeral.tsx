/**
 * StatNumeral — a number as the hero: "67 sujets", "2/19". The numeral is PJS
 * 800 34 (tabular) in azureInk, the unit `meta` muted, sharing a baseline.
 * Only ever pass REAL numbers; never a placeholder.
 */

import React from 'react';
import { View, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

export interface StatNumeralProps {
  value: number | string;
  unit?: string | null;
  /** Numeral colour. Default azureInk. */
  color?: string;
  /** Numeral size override (default 34). Line height follows. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  numeralStyle?: StyleProp<TextStyle>;
}

export default function StatNumeral({ value, unit, color, size, style, numeralStyle }: StatNumeralProps) {
  const { colors, typeScale } = useTheme();
  const sized = size ? { fontSize: size, lineHeight: Math.round(size * 1.1) } : null;
  return (
    <View
      accessible
      accessibilityLabel={unit ? `${value} ${unit}` : String(value)}
      style={[{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }, style]}
    >
      <Text maxFontSizeMultiplier={1.4} style={[typeScale.numeral, { color: color ?? colors.azureInk }, sized, numeralStyle]}>
        {value}
      </Text>
      {unit ? <Text style={[typeScale.meta, { color: colors.muted }]}>{unit}</Text> : null}
    </View>
  );
}
