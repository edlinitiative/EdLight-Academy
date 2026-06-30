import React from 'react';
import { View, TouchableOpacity } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

const cardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#e8edf5',
  shadowColor: '#0857A6',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
  overflow: 'hidden' as const,
};

export default function Card({ children, onPress, className = '' }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={cardStyle} className={className}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle} className={className}>{children}</View>;
}
