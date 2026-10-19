import React from 'react';
import { View, AccessibilityRole } from 'react-native';
import { useTheme } from '../../theme/theme';
import PressableScale from './PressableScale';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
  /** Spoken name for a tappable card. Without it the card reads its text children. */
  accessibilityLabel?: string;
  /** What happens on tap, when the label alone doesn't say it. */
  accessibilityHint?: string;
  /** Defaults to 'button' when the card is tappable. */
  accessibilityRole?: AccessibilityRole;
}

// Interactive cards use PressableScale for the premium spring + haptic press
// feel (it forwards ...rest, incl. NativeWind `className`, so screens that style
// Card via className keep working). Non-interactive cards stay a plain View.
export default function Card({
  children,
  onPress,
  className = '',
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: CardProps) {
  const { cardSurface } = useTheme();
  const cardStyle = { ...cardSurface, overflow: 'hidden' as const };
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        style={cardStyle}
        className={className}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {children}
      </PressableScale>
    );
  }
  return <View style={cardStyle} className={className}>{children}</View>;
}
