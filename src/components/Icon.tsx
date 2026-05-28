import React from 'react';
import * as LucideIcons from 'lucide-react';

type IconName = keyof typeof LucideIcons;

type Props = {
  name: IconName | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  color?: string;
  label?: string;
};

/**
 * Inline Lucide icon used to replace decorative emojis throughout the UI.
 * `name` should match a Lucide export (e.g. "Flame", "Trophy", "Check").
 * If the name is unknown we render nothing rather than crashing.
 */
export default function Icon({ name, size = 18, className = '', strokeWidth = 2, color, label }: Props) {
  const Comp: any = (LucideIcons as any)[name];
  if (!Comp) return null;
  return (
    <Comp
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={`lucide-inline ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
