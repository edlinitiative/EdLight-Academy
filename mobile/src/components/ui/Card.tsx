import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/theme';
import PressableScale from './PressableScale';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

// Interactive cards use PressableScale for the premium spring + haptic press
// feel (it forwards ...rest, incl. NativeWind `className`, so screens that style
// Card via className keep working). Non-interactive cards stay a plain View.
export default function Card({ children, onPress, className = '' }: CardProps) {
  const { cardSurface } = useTheme();
  const cardStyle = { ...cardSurface, overflow: 'hidden' as const };
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={cardStyle} className={className}>
        {children}
      </PressableScale>
    );
  }
  return <View style={cardStyle} className={className}>{children}</View>;
}
