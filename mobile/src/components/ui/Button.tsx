import React from 'react';
import { Text, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import PressableScale from './PressableScale';
import { useTheme } from '../../theme/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

/**
 * The one button. Built on PressableScale (spring + haptic), driven by tokens
 * (color / radius / type), with real disabled + loading states — so every CTA in
 * the app shares one height, radius, weight and press feel.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors, radius, typeScale } = useTheme();

  const pad =
    size === 'sm'
      ? { paddingVertical: 9, paddingHorizontal: 14 }
      : size === 'lg'
        ? { paddingVertical: 15, paddingHorizontal: 20 }
        : { paddingVertical: 12, paddingHorizontal: 16 };
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 16 : 15;

  const V = {
    primary: { bg: colors.azure, fg: '#ffffff', border: 'transparent' },
    secondary: { bg: colors.azureSoft, fg: colors.azure, border: colors.azureBorder },
    ghost: { bg: 'transparent', fg: colors.muted, border: colors.border },
    danger: { bg: colors.danger, fg: '#ffffff', border: 'transparent' },
    success: { bg: colors.success, fg: '#ffffff', border: 'transparent' },
  }[variant];

  return (
    <PressableScale
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      pressedScale={0.97}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: V.border,
          backgroundColor: V.bg,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : undefined,
          ...pad,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={V.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[typeScale.title, { color: V.fg, fontSize, lineHeight: fontSize + 4 }]}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}
