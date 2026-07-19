import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { tapLight } from '../../utils/haptics';

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  fullWidth?: boolean;
}

export default function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
}: ButtonProps) {
  const baseStyle = 'rounded-full items-center justify-center flex-row';

  const variantStyle = {
    primary: 'bg-primary-600',
    secondary: 'bg-primary-500',
    outline: 'bg-transparent border-2 border-primary-600',
    ghost: 'bg-transparent',
    danger: 'bg-red-600',
  }[variant];

  const sizeStyle = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  }[size];

  const textColor = {
    primary: 'text-white',
    secondary: 'text-white',
    outline: 'text-primary-600',
    ghost: 'text-primary-600',
    danger: 'text-white',
  }[variant];

  const textSize = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' }[size];

  return (
    <TouchableOpacity
      onPress={() => { if (!disabled && !loading) { tapLight(); onPress(); } }}
      disabled={disabled || loading}
      className={`${baseStyle} ${variantStyle} ${sizeStyle} ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'opacity-50' : ''}`}
      activeOpacity={0.8}
    >
      {loading && <ActivityIndicator size="small" color={variant === 'outline' || variant === 'ghost' ? '#1B6FE0' : '#fff'} className="mr-2" />}
      {typeof children === 'string' ? (
        <Text className={`font-semibold ${textColor} ${textSize}`}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
