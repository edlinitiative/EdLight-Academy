import React from 'react';
import { View, TouchableOpacity } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

export default function Card({ children, onPress, className = '' }: CardProps) {
  const base = `bg-white rounded-2xl shadow-sm overflow-hidden ${className}`;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} className={base}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View className={base}>{children}</View>;
}
