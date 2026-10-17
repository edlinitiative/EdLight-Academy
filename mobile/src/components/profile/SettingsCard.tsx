/**
 * Profil settings primitives (Stitch 11): one opaque card holding 56pt rows.
 *
 *  - The icon is a bare 22pt line glyph in `muted` (no tinted tile).
 *  - Label 17 ink; an optional 14pt sublabel; the accessory sits right.
 *  - Rows are separated by space only, never a hairline divider.
 *
 * Shared by the guest and signed-in Profil so both read as one page.
 */

import React from 'react';
import { View, Text, Switch, StyleProp, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { useTheme } from '../../theme/theme';

export function SettingsCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { cardSurface, colors, typeScale } = useTheme();
  return (
    <View style={[cardSurface, { paddingHorizontal: 20, paddingTop: title ? 20 : 8, paddingBottom: 8 }, style]}>
      {title ? (
        <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink, marginBottom: 4 }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function SettingsRow({
  icon: Icon,
  label,
  sublabel,
  value,
  accessory,
  onPress,
  tone,
  sublabelTone,
  chevron,
  accessibilityLabel,
}: {
  icon?: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  sublabel?: string | null;
  /** Right-aligned muted value ("Activées", "Français"). */
  value?: string | null;
  /** Right-aligned control (Switch, Segmented). Replaces value/chevron. */
  accessory?: React.ReactNode;
  onPress?: () => void;
  /** 'danger' paints label + icon red (account deletion). */
  tone?: 'danger';
  /** 'status' = the sublabel is an essential state: danger tint. */
  sublabelTone?: 'status';
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, typeScale, fonts } = useTheme();
  const ink = tone === 'danger' ? colors.danger : colors.ink;
  const iconColor = tone === 'danger' ? colors.danger : colors.muted;
  const showChevron = chevron ?? (!!onPress && !accessory);

  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8, gap: 14 }}>
      {Icon ? <Icon color={iconColor} size={22} strokeWidth={1.9} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 17, lineHeight: 22, color: ink }}>{label}</Text>
        {sublabel ? (
          <Text
            style={[
              sublabelTone === 'status' ? typeScale.status : typeScale.caption,
              { color: sublabelTone === 'status' ? colors.danger : colors.muted, marginTop: 1 },
            ]}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
      {accessory}
      {!accessory && value ? (
        <Text numberOfLines={1} style={[typeScale.meta, { color: colors.muted, flexShrink: 1, textAlign: 'right' }]}>
          {value}
        </Text>
      ) : null}
      {showChevron ? <ChevronRight color={colors.faint} size={18} strokeWidth={2.2} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, sublabel, value].filter(Boolean).join(', ')}
    >
      {body}
    </PressableScale>
  );
}

/** The native switch in the app's colours: azure track, white thumb. */
export function SettingsSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: colors.surfaceAlt, true: colors.azureFill }}
      thumbColor="#ffffff"
      ios_backgroundColor={colors.surfaceAlt}
    />
  );
}
