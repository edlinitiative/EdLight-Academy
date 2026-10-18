import React from 'react';
import { Text, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import PressableScale from './PressableScale';
import { useTheme } from '../../theme/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

/** Control heights (web 52/44/36; md is 48 to keep the touch floor). */
export const BUTTON_HEIGHTS: Record<Size, number> = { lg: 52, md: 48, sm: 40 };

/**
 * The one button. Built on PressableScale (spring + haptic), driven by tokens
 * (color / radius / type), with real disabled + loading states — so every CTA in
 * the app shares one height, radius, weight and press feel.
 *
 * Variants (matched to the web, 2026-10-17):
 *  - primary   flat azure, white label. ONE per screen.
 *  - secondary OPAQUE tonal azure (`azureSoft` #EAF2FE) with an azureInk label
 *              (6.0:1), no border; dark: opaque #1C304E with ink. (Was a
 *              translucent azureSoft + an azure hairline: the "hairline on a
 *              translucent fill" the founder rejected.)
 *  - outline   white with a 1px `border` ring — the web's "Se connecter".
 *  - ghost     a text button: no fill, no border.
 *  - danger / success  filled, white label.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
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
  /** Leading icon node (sized/coloured by the caller). */
  icon?: React.ReactNode;
  /** Trailing icon node — e.g. the "→" ArrowRight the web puts on primary CTAs. */
  trailingIcon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors, radius, fonts, isDark } = useTheme();

  const minHeight = BUTTON_HEIGHTS[size];
  const paddingHorizontal = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  const fontSize = size === 'sm' ? 15 : 16;

  // Filled variants use the *Fill grounds, not `azure`/`success`: those two
  // tokens are tuned for text/icons, so white-on-them fails AA as a button
  // ground (azure is 2.90:1 in dark; success is 2.28:1 in light).
  const V = {
    primary: { bg: colors.azureFill, fg: '#ffffff', border: 'transparent' },
    secondary: { bg: colors.azureSoft, fg: isDark ? colors.ink : colors.azureInk, border: 'transparent' },
    outline: { bg: colors.surface, fg: colors.ink, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.azureInk, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#ffffff', border: 'transparent' },
    success: { bg: colors.successFill, fg: '#ffffff', border: 'transparent' },
  }[variant];
  // Disabled is an OPAQUE neutral step with muted text (no half-transparent
  // brand colour, which read as washed out); ghost stays a plain muted label.
  const C = disabled
    ? { bg: variant === 'ghost' ? 'transparent' : colors.surfaceAlt, fg: colors.faint, border: 'transparent' }
    : V;

  return (
    <PressableScale
      onPress={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      pressedScale={0.97}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.bg,
          alignSelf: fullWidth ? 'stretch' : undefined,
          minHeight,
          paddingVertical: 8,
          paddingHorizontal,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={C.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text
            // 2.0 still prevents a single label from blowing up a row at the
            // very largest accessibility sizes.
            maxFontSizeMultiplier={2}
            style={{ fontFamily: fonts.bold, color: C.fg, fontSize, lineHeight: fontSize + 5 }}
          >
            {label}
          </Text>
          {trailingIcon}
        </>
      )}
    </PressableScale>
  );
}
