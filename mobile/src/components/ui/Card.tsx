import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { cardSurface } from '../../theme/theme';
import { tapLight } from '../../utils/haptics';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

// TouchableOpacity (not PressableScale) so NativeWind `className` layout still
// applies for the many screens that style Card via className.
const cardStyle = { ...cardSurface, overflow: 'hidden' as const };

export default function Card({ children, onPress, className = '' }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={() => { tapLight(); onPress(); }}
        activeOpacity={0.85}
        style={cardStyle}
        className={className}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle} className={className}>{children}</View>;
}
